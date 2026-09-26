// ── Acesso a dados do Financeiro ─────────────────────────────────────────────
// Regras que valem para TODA consulta deste arquivo (CLAUDE.md → "Dados"):
//   · colunas NOMEADAS, nunca `select("*")` — o `*` arrasta jsonb e texto longo
//     que a tela nem usa, e é assim que 53 MB de banco viram 6,3 GB de egress;
//   · `.limit()` em toda listagem, sem exceção;
//   · nenhuma escrita disparada por leitura.
//
// TOLERÂNCIA AO SQL PENDENTE. `supabase/financeiro.sql` é rodado À MÃO pelo
// dono. Entre o deploy do código e a hora em que ele abre o SQL Editor, as
// tabelas não existem — e a diferença entre "a tela explode com stack trace" e
// "a tela abre dizendo o que falta rodar" é toda aqui. Por isso toda leitura
// atravessa `tolerante()`, que devolve vazio + `pendente: true`.

import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached, invalidate } from "@/lib/cache";
import { hojeISO, somarDias, unirPorId } from "./calculos";
import { comporParte } from "./partes";
import type {
  Estorno,
  CategoriaFin, Colaborador, Compra, CompraItem, Compromisso, Conta, Contato, Empresa,
  FolhaLancamento, Fornecedor, Movimento, Nota, Patrimonio, Recorrencia,
  ParteFinanceira,
} from "./tipos";

export const LIMITE_PADRAO = 200;
export const LIMITE_MAX = 500;

export const limitar = (n?: number | null) =>
  Math.min(Math.max(Number(n) || LIMITE_PADRAO, 1), LIMITE_MAX);

/** Resultado de qualquer leitura: os dados + se o schema ainda não existe. */
export interface Fonte<T> { dados: T; pendente: boolean }

const VAZIO = <T>(dados: T): Fonte<T> => ({ dados, pendente: false });

/**
 * "O banco está atrás do código" é resposta esperada, não erro.
 *
 * São DOIS estados, não um: a tabela nunca existiu (42P01 · PGRST205), ou ela
 * existe numa versão anterior e falta a COLUNA que esta consulta pede (42703 ·
 * PGRST204). O segundo é o que aconteceu de verdade — `fin_contas_saldo` ficou
 * sem `responsavel_id` porque o arquivo não subia por cima de si mesmo — e o
 * remédio dos dois é o mesmo: rodar `supabase/financeiro.sql` de novo. Por isso
 * a tela fala de VERSÃO, não de "ainda não foi criado": com o banco criado do
 * lado, aquela frase manda a pessoa procurar o problema no lugar errado.
 *
 * Qualquer OUTRO erro sobe: engolir tudo faria uma falha real de rede virar
 * "tela vazia sem explicação", que é pior do que quebrar.
 */
function ehTabelaAusente(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  const code = erro.code ?? "";
  const msg = (erro.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || code === "PGRST205" || code === "PGRST204"
    || msg.includes("does not exist") || msg.includes("could not find the table")
    || msg.includes("schema cache");
}

/** Postgres 42P10: `on conflict` sem índice único que case com as colunas. */
export function ehSemIndiceParaOnConflict(erro: { code?: string; message?: string } | null): boolean {
  return erro?.code === "42P10" || (erro?.message ?? "").includes("ON CONFLICT specification");
}

const ehDuplicado = (e: { code?: string; message?: string } | null) =>
  e?.code === "23505" || (e?.message ?? "").includes("duplicate key");

/**
 * Upsert que NÃO depende do índice estar certo no banco.
 *
 * Em set/2026 toda escrita idempotente do módulo caiu com "there is no unique
 * or exclusion constraint matching the ON CONFLICT specification": os índices
 * eram parciais e o PostgREST não os enxerga como árbitro. O SQL que conserta
 * é `financeiro_indice_total.sql`, mas ele é colado à mão — e a compra da
 * pessoa não pode esperar. Aqui: tenta o upsert; se o banco responde 42P10,
 * insere de uma vez; se a inserção em lote bate em duplicado, insere linha a
 * linha ignorando o que já existe. O resultado é o MESMO do upsert com
 * `ignoreDuplicates`: o que faltava nasce, o que já existia fica.
 */
export async function upsertIdempotente(
  tabela: string, linhas: Record<string, unknown>[], onConflict: string,
): Promise<{ error: { code?: string; message?: string } | null; semIndice: boolean }> {
  if (!linhas.length) return { error: null, semIndice: false };
  const { error } = await db().from(tabela).upsert(linhas, { onConflict, ignoreDuplicates: true });
  if (!error) return { error: null, semIndice: false };
  if (ehDuplicado(error)) return { error: null, semIndice: false };
  if (!ehSemIndiceParaOnConflict(error)) return { error, semIndice: false };

  const lote = await db().from(tabela).insert(linhas);
  if (!lote.error) return { error: null, semIndice: true };
  if (!ehDuplicado(lote.error)) return { error: lote.error, semIndice: true };
  for (const linha of linhas) {
    const um = await db().from(tabela).insert(linha);
    if (um.error && !ehDuplicado(um.error)) return { error: um.error, semIndice: true };
  }
  return { error: null, semIndice: true };
}

/**
 * Escrita que repete SEM os campos novos quando o banco ainda não os tem.
 *
 * O dono roda `supabase/financeiro.sql` à mão, então entre o deploy e a colagem
 * no SQL Editor existe uma janela em que as colunas recém-criadas não existem.
 * Mandá-las junto derrubaria o cadastro inteiro num PGRST204 — a pessoa não
 * seria salva por causa de um campo opcional. Aqui o essencial passa sempre, e
 * o extra entra quando o SQL rodar.
 *
 * Só reexecuta quando o erro é de schema atrasado: erro de verdade (constraint,
 * rede) sobe na primeira tentativa, senão o retry esconderia a causa.
 */
export async function comTolerancia<T>(
  escrever: (extras: Record<string, unknown>) => Promise<{ data: T; error: { code?: string; message?: string } | null }>,
  extras: Record<string, unknown>,
) {
  const primeira = await escrever(extras);
  if (!primeira.error || !Object.keys(extras).length || !ehTabelaAusente(primeira.error)) return primeira;
  return escrever({});
}

/**
 * O que o banco já disse que NÃO tem, por um minuto.
 *
 * Cada ida ao Supabase custa 250–700 ms daqui. Uma leitura em degraus (com a
 * coluna nova → sem ela) pagava a ida que FALHA em toda requisição enquanto o
 * SQL não era rodado — e, com três arquivos na fila, isso acontecia em quase
 * toda tabela, em toda tela. Lembrar a falha por um minuto faz o degrau de
 * cima ser pulado na hora; quando o SQL roda, no máximo um minuto depois a
 * leitura volta a tentar e passa.
 *
 * A chave é a URL da consulta (tabela + colunas + filtros): duas consultas
 * diferentes nunca dividem a mesma lembrança.
 */
const PENDENTE_ATE = new Map<string, number>();
const LEMBRAR_PENDENTE_MS = 60_000;

const chaveDaConsulta = (consulta: unknown): string | null => {
  const url = (consulta as { url?: { toString(): string } }).url;
  return url ? url.toString() : null;
};

async function tolerante<T>(consulta: Promise<{ data: unknown; error: unknown }>, vazio: T): Promise<Fonte<T>> {
  const chave = chaveDaConsulta(consulta);
  if (chave) {
    const ate = PENDENTE_ATE.get(chave);
    if (ate && ate > Date.now()) return { dados: vazio, pendente: true };
    if (ate) PENDENTE_ATE.delete(chave);
  }
  try {
    const { data, error } = await consulta;
    if (error) {
      if (ehTabelaAusente(error as { code?: string; message?: string })) {
        if (chave) PENDENTE_ATE.set(chave, Date.now() + LEMBRAR_PENDENTE_MS);
        return { dados: vazio, pendente: true };
      }
      throw error;
    }
    return VAZIO((data ?? vazio) as T);
  } catch (e) {
    if (ehTabelaAusente(e as { code?: string; message?: string })) return { dados: vazio, pendente: true };
    throw e;
  }
}

const db = () => createSupabaseAdminClient();

const num = (v: unknown): number => (v == null ? 0 : Number(v));

// ── Empresas e escopo ────────────────────────────────────────────────────────

// Duas versões da MESMA lista, e a diferença é a marca (`logo_url`, `icone`),
// que entrou depois. O código sobe antes do SQL — sempre, porque o SQL é
// colado à mão — e sem o degrau abaixo TODA tela do módulo ficaria em branco
// no intervalo, dizendo "o banco está atrás desta tela". Com ele, a marca é a
// única coisa que falta até o arquivo ser rodado.
const COLS_EMPRESA = "id,slug,nome,razao_social,cnpj,cor,ordem,ativa,logo_url,icone";
const COLS_EMPRESA_SEM_MARCA = "id,slug,nome,razao_social,cnpj,cor,ordem,ativa";

/**
 * As empresas mudam uma vez por ano; a lista era buscada em TODA requisição —
 * pelo layout, pela página e por cada rota de escrita. Um minuto de cache no
 * processo corta isso para uma ida por minuto; quem escreve em `fin_empresas`
 * chama `esquecerEmpresas()`, então a tela nunca mostra o nome velho depois
 * de salvar. `cache()` do React por cima: layout e página da MESMA requisição
 * dividem a resposta mesmo quando o minuto acabou de vencer.
 */
export const listarEmpresas = cache((opts: { todas?: boolean } = {}): Promise<Fonte<Empresa[]>> =>
  cached(`fin:empresas:${opts.todas ? "todas" : "ativas"}`, 60_000, () => listarEmpresasNoBanco(!!opts.todas)));

async function listarEmpresasNoBanco(todas: boolean): Promise<Fonte<Empresa[]>> {
  const opts = { todas };
  const busca = (cols: string) => {
    let q = db().from("fin_empresas").select(cols);
    if (!opts.todas) q = q.eq("ativa", true);
    return q.order("ordem").limit(50);
  };
  const r = await tolerante<Empresa[]>(busca(COLS_EMPRESA), []);
  // `pendente` aqui significa "faltou coluna OU faltou tabela". Se for coluna,
  // a consulta menor responde; se for tabela, ela também volta pendente e a
  // tela diz a verdade.
  return r.pendente ? tolerante<Empresa[]>(busca(COLS_EMPRESA_SEM_MARCA), []) : r;
}

/**
 * As empresas que ESTA pessoa enxerga.
 *
 * Sem linha em `fin_acessos` → vê todas as ativas. A porta já foi a área
 * restrita, concedida pessoa a pessoa; exigir um segundo cadastro para
 * ninguém ganhar poder nenhum só criaria um jeito novo de alguém ficar
 * trancado do lado de fora sem entender por quê.
 *
 * COM linha → vê só aquelas. Aí a tabela vira o que ela é de verdade: uma
 * restrição, para quem cuida só da Gedux não abrir a Tridi.
 */
const acessosDoUsuario = (userId: string) =>
  cached(`fin:acessos:${userId}`, 30_000, () =>
    tolerante<{ empresa_id: string }[]>(
      db().from("fin_acessos").select("empresa_id").eq("user_id", userId).limit(50),
      [],
    ));

export const empresasDoUsuario = cache(async (userId: string): Promise<Fonte<Empresa[]>> => {
  // As duas idas em PARALELO: a lista de empresas não depende dos acessos.
  // Em sequência, 500 ms viravam 1 s em toda tela.
  const [todas, acessos] = await Promise.all([listarEmpresas(), acessosDoUsuario(userId)]);
  if (todas.pendente || !todas.dados.length) return todas;
  if (acessos.pendente || !acessos.dados.length) return todas;

  const permitidas = new Set(acessos.dados.map((a) => a.empresa_id));
  return { dados: todas.dados.filter((e) => permitidas.has(e.id)), pendente: false };
});

/** Quem escreve em `fin_empresas` ou `fin_acessos` chama isto. */
export function esquecerEmpresas() {
  invalidate("fin:empresas");
  invalidate("fin:acessos:");
}

/**
 * Esta pessoa pode mexer nesta empresa?
 *
 * §17: "não confiar no company_id enviado pelo app". Toda rota de escrita
 * recebe `empresa_id` no corpo — é o cliente falando. Sem esta conferência,
 * quem tem o Financeiro da Gedux lançaria despesa na Tridi trocando um campo
 * no DevTools, e o gate da área teria dado o "sim" antes disso.
 */
export async function empresaPermitida(userId: string, empresaId: string): Promise<boolean> {
  if (!empresaId) return false;
  const { dados } = await empresasDoUsuario(userId);
  return dados.some((e) => e.id === empresaId);
}

/**
 * Uma empresa, ou várias — o que a leitura recebe.
 *
 * "Ver geral" não é uma empresa extra no banco: é o conjunto das empresas que a
 * pessoa pode abrir. Por isso o escopo é `string | string[]` e não um id
 * mágico: um id mágico teria de ser traduzido em todo lugar que lê, e o dia em
 * que alguém esquecesse a tradução a consulta voltaria vazia sem erro nenhum.
 */
export type Escopo = string | string[];

/** `.eq` para uma, `.in` para várias. Nada mais decide isso em outro lugar. */
export function noEscopo<Q extends { eq: (c: string, v: string) => Q; in: (c: string, v: string[]) => Q }>(
  q: Q, escopo: Escopo,
): Q {
  return Array.isArray(escopo) ? q.in("empresa_id", escopo) : q.eq("empresa_id", escopo);
}

/** A empresa ativa: a do slug pedido, se a pessoa tem acesso; senão a primeira. */
export async function resolverEmpresa(
  userId: string, slug?: string | null,
): Promise<{ empresa: Empresa | null; empresas: Empresa[]; pendente: boolean }> {
  const { dados: empresas, pendente } = await empresasDoUsuario(userId);
  const empresa = (slug && empresas.find((e) => e.slug === slug)) || empresas[0] || null;
  return { empresa, empresas, pendente };
}

// ── Contas ───────────────────────────────────────────────────────────────────

const COLS_CONTA = "id,empresa_id,nome,tipo,instituicao,cor,ordem,ativa,inclui_no_saldo,saldo_inicial,saldo,responsavel_id";

/** O que entrou em `financeiro_contato_banco_recorrencia.sql`. */
const COLS_CONTA_NOVAS = "limite,usado,disponivel,conta_mae_id,bandeira,final,agencia,numero";

export async function contas(empresaId: Escopo, opts: { todas?: boolean } = {}): Promise<Fonte<Conta[]>> {
  // Mesmo degrau da lista de empresas: com a marca primeiro, sem ela depois.
  const busca = (cols: string) => {
    let q = noEscopo(db().from("fin_contas_saldo").select(cols), empresaId);
    if (!opts.todas) q = q.eq("ativa", true);
    return q.order("ordem").limit(100);
  };
  let r = await tolerante<Conta[]>(busca(`${COLS_CONTA},logo_url,icone`), []);
  if (r.pendente) r = await tolerante<Conta[]>(busca(COLS_CONTA), []);
  return { ...r, dados: r.dados.map((c) => ({ ...c, saldo: num(c.saldo), saldo_inicial: num(c.saldo_inicial) })) };
}

// ── Fornecedores ─────────────────────────────────────────────────────────────

const COLS_FORNECEDOR =
  "id,empresa_id,nome,cnpj,categoria,contato_nome,contato_email,contato_fone,prazo_dias,forma_pagamento,ativo,observacao";

/** O que entrou em `financeiro_fornecedor_completo.sql`, rodado depois. */
const COLS_FORNECEDOR_NOVAS =
  "categorias,prazo_envio_dias,pix_tipo,pix_chave,banco,agencia,conta_numero,aceita_boleto,"
  + "inscricao_estadual,site,whatsapp,cidade,uf,endereco";

export async function fornecedores(
  empresaId: Escopo, opts: { todos?: boolean; limite?: number } = {},
): Promise<Fonte<Fornecedor[]>> {
  // Mesmo degrau de `listarEmpresas`: pede a marca primeiro, cai na consulta
  // sem ela se o SQL ainda não foi rodado. O código sobe antes do arquivo ser
  // colado no Supabase — sem isto a tela ficaria em branco no intervalo.
  const busca = (cols: string) => {
    let q = noEscopo(db().from("fin_fornecedores").select(cols), empresaId).is("deleted_at", null);
    if (!opts.todos) q = q.eq("ativo", true);
    return q.order("nome").limit(limitar(opts.limite));
  };
  // Três degraus, e não dois: as colunas entraram em arquivos SQL diferentes,
  // em dias diferentes. Quem rodou só o primeiro tem `logo_url` e não tem
  // `categorias`; quem não rodou nenhum não tem nem um nem outro. Um degrau só
  // faria o banco meio atualizado cair para a consulta mais pobre e a tela
  // perder o logo que ela JÁ TINHA.
  let r = await tolerante<Fornecedor[]>(busca(`${COLS_FORNECEDOR},logo_url,icone,${COLS_FORNECEDOR_NOVAS}`), []);
  if (r.pendente) r = await tolerante<Fornecedor[]>(busca(`${COLS_FORNECEDOR},logo_url,icone`), []);
  if (r.pendente) r = await tolerante<Fornecedor[]>(busca(COLS_FORNECEDOR), []);
  return { ...r, dados: r.dados.map(comOsPadroes) };
}

/**
 * Fornecedor sem as colunas novas ainda é fornecedor: zera e segue.
 *
 * `categorias` cai para a categoria ANTIGA quando o array não existe — assim o
 * filtro por categoria continua funcionando no banco meio atualizado, em vez de
 * mostrar todo mundo como "sem categoria".
 */
function comOsPadroes(f: Fornecedor): Fornecedor {
  const antiga = (f.categoria ?? "").trim();
  return {
    ...f,
    categorias: f.categorias?.length ? f.categorias : antiga ? [antiga] : [],
    prazo_envio_dias: f.prazo_envio_dias ?? null,
    pix_tipo: f.pix_tipo ?? null, pix_chave: f.pix_chave ?? null,
    banco: f.banco ?? null, agencia: f.agencia ?? null, conta_numero: f.conta_numero ?? null,
    aceita_boleto: f.aceita_boleto ?? false,
    inscricao_estadual: f.inscricao_estadual ?? null, site: f.site ?? null,
    whatsapp: f.whatsapp ?? null, cidade: f.cidade ?? null, uf: f.uf ?? null,
    endereco: f.endereco ?? null,
    observacao: f.observacao ?? null,
  };
}

/**
 * Registra no catálogo as categorias que alguém digitou num cadastro.
 *
 * O seletor aceita nome novo (exigir o cadastro antes travaria a pessoa no
 * meio de um fornecedor para ir criar categoria noutra tela). Então o catálogo
 * aprende AQUI, no salvar: o que já existe bate no índice único e é ignorado;
 * o que não existe entra. Uma linha por nome, de propósito — são no máximo
 * oito, e o `upsert` do PostgREST não sabe conflitar num índice de expressão
 * (`lower(btrim(nome))`).
 *
 * Falha aqui NUNCA derruba o cadastro que acabou de salvar: categoria é
 * rótulo, fornecedor é o fato.
 */
export async function registrarCategorias(
  empresaId: string, escopo: "fornecedor" | "contato", nomes: string[], autorId?: string,
): Promise<void> {
  for (const bruto of nomes.slice(0, 8)) {
    const nome = bruto.trim();
    if (!nome) continue;
    try {
      await db().from("fin_categorias").insert({ empresa_id: empresaId, escopo, nome, created_by: autorId ?? null });
    } catch { /* duplicada ou SQL ainda não rodado: o cadastro principal já está salvo */ }
  }
}

/**
 * O vocabulário de categorias — de fornecedor ou de contato.
 *
 * Antes a lista era derivada do que estivesse escrito nos cadastros, e por isso
 * "Matéria Prima" e "matéria prima" apareciam como duas linhas no filtro. Agora
 * há cadastro, com índice único por nome normalizado.
 */
export async function categorias(
  empresaId: Escopo, escopo: "fornecedor" | "contato",
): Promise<Fonte<CategoriaFin[]>> {
  return tolerante<CategoriaFin[]>(
    noEscopo(db().from("fin_categorias").select("id,empresa_id,escopo,nome,cor,ordem"), empresaId)
      .eq("escopo", escopo)
      .order("ordem")
      .order("nome")
      .limit(LIMITE_MAX),
    [],
  );
}

// ── Contatos ─────────────────────────────────────────────────────────────────

const COLS_CONTATO = "id,empresa_id,nome,categoria,telefone,email,endereco,observacao,ativo";

/** O que entrou em `financeiro_contato_banco_recorrencia.sql`. */
const COLS_CONTATO_NOVAS = "telefones,categorias,tipo,cargo,organizacao,site,natureza,organizacao_id";

export async function contatos(
  empresaId: Escopo, opts: { todos?: boolean; limite?: number } = {},
): Promise<Fonte<Contato[]>> {
  const busca = (cols: string) => {
    let q = noEscopo(db().from("fin_contatos").select(cols), empresaId).is("deleted_at", null);
    if (!opts.todos) q = q.eq("ativo", true);
    return q.order("nome").limit(limitar(opts.limite));
  };
  let r = await tolerante<Contato[]>(busca(`${COLS_CONTATO},logo_url,icone,${COLS_CONTATO_NOVAS}`), []);
  if (r.pendente) r = await tolerante<Contato[]>(busca(`${COLS_CONTATO},logo_url,icone`), []);
  if (r.pendente) r = await tolerante<Contato[]>(busca(COLS_CONTATO), []);
  return {
    ...r,
    dados: r.dados.map((c) => {
      // As listas caem para o campo ANTIGO quando ainda não existem: assim o
      // filtro e a ficha continuam funcionando no banco meio atualizado, em vez
      // de mostrar todo mundo como "sem telefone".
      const tel = (c.telefone ?? "").trim();
      const cat = (c.categoria ?? "").trim();
      return {
        ...c,
        telefones: c.telefones?.length ? c.telefones : tel ? [tel] : [],
        categorias: c.categorias?.length ? c.categorias : cat ? [cat] : [],
        tipo: c.tipo ?? null, cargo: c.cargo ?? null,
        organizacao: c.organizacao ?? null, site: c.site ?? null,
        // Sem a coluna (SQL não rodado) todo mundo é pessoa avulsa — que é
        // exatamente como o cadastro se comportava antes dela existir.
        natureza: c.natureza ?? "pessoa", organizacao_id: c.organizacao_id ?? null,
      };
    }),
  };
}

// ── Partes financeiras ──────────────────────────────────────────────────────

type ContatoDaParte = Contato & { papeis?: unknown; cnpj?: string | null };
type FornecedorDaParte = Fornecedor & { contato_id?: string | null };

const COLS_PARTE_CONTATO = `${COLS_CONTATO},logo_url,icone,${COLS_CONTATO_NOVAS},papeis,cnpj`;
const COLS_PARTE_CONTATO_SEM_PAPEIS = `${COLS_CONTATO},logo_url,icone,${COLS_CONTATO_NOVAS}`;
const COLS_PARTE_FORNECEDOR = `${COLS_FORNECEDOR},logo_url,icone,${COLS_FORNECEDOR_NOVAS},contato_id`;
const COLS_PARTE_FORNECEDOR_SEM_CONTATO = `${COLS_FORNECEDOR},logo_url,icone,${COLS_FORNECEDOR_NOVAS}`;

/** Lê uma página de identidades e uma única extensão por seus IDs. */
export async function partes(
  empresaId: Escopo, opts: { todos?: boolean; limite?: number } = {},
): Promise<Fonte<ParteFinanceira[]>> {
  const buscaContatos = (colunas: string) => {
    let q = noEscopo(db().from("fin_contatos").select(colunas), empresaId).is("deleted_at", null);
    if (!opts.todos) q = q.eq("ativo", true);
    return q.order("nome").limit(limitar(opts.limite));
  };
  const buscaFornecedores = (colunas: string, contatoIds?: string[]) => {
    let q = noEscopo(db().from("fin_fornecedores").select(colunas), empresaId).is("deleted_at", null);
    if (!opts.todos) q = q.eq("ativo", true);
    if (contatoIds?.length) q = q.in("contato_id", contatoIds);
    return q.order("nome").limit(limitar(opts.limite));
  };
  // AS DUAS SAEM JUNTAS. Eram uma atrás da outra — contatos, e só então os
  // fornecedores filtrados pelos ids que acabaram de chegar — e as duas idas
  // somadas eram quase um segundo na tela "Contatos e empresas".
  //
  // O truque para poder soltá-las ao mesmo tempo: o filtro por `contato_id` só
  // ESTREITA. Se a busca sem filtro voltar MENOS que o teto, ela é o conjunto
  // inteiro de fornecedores do escopo — logo contém todos os que o filtro
  // acharia, e casar por `contato_id` na memória dá o mesmo resultado. Se
  // encostar no teto (não cabe tudo), aí sim vale a pena refazer filtrada,
  // que é o único caso em que se paga a segunda ida.
  const teto = limitar(opts.limite);
  const [contatosDaParte, fornecedoresSemFiltro] = await Promise.all([
    lerContatosDaParte(buscaContatos),
    lerFornecedoresDaParte(buscaFornecedores, []),
  ]);
  if (contatosDaParte.pendente) return { dados: [], pendente: true };
  if (!contatosDaParte.dados.length) return { dados: [], pendente: false };

  const fornecedoresDaParte = fornecedoresSemFiltro.dados.length < teto
    ? fornecedoresSemFiltro
    : await lerFornecedoresDaParte(buscaFornecedores, contatosDaParte.dados.map((contato) => contato.id));
  if (fornecedoresDaParte.pendente) return { dados: [], pendente: true };

  const fornecedorPorContato = new Map<string, Fornecedor>();
  for (const fornecedor of fornecedoresDaParte.dados) {
    if (fornecedor.contato_id) fornecedorPorContato.set(fornecedor.contato_id, fornecedor);
  }
  return {
    dados: contatosDaParte.dados.map((contato) => comporParte(contato, fornecedorPorContato.get(contato.id) ?? null)),
    pendente: false,
  };
}

export interface PartesReferenciadas {
  partes: ParteFinanceira[];
  fornecedores: Fornecedor[];
}

const lotesDeIds = (ids: string[]): string[][] => {
  const unicos = [...new Set(ids.filter(Boolean))];
  const lotes: string[][] = [];
  for (let inicio = 0; inicio < unicos.length; inicio += LIMITE_MAX) {
    lotes.push(unicos.slice(inicio, inicio + LIMITE_MAX));
  }
  return lotes;
};

/**
 * Lê em lote os alvos efetivamente citados pelo histórico. Não aplica filtros
 * de ativo/deleted_at: a obrigação preservada precisa continuar dizendo para
 * quem era, mesmo depois de a identidade sair dos catálogos de novos registros.
 */
export async function partesReferenciadas(
  empresaId: Escopo,
  contatoIds: string[],
  fornecedorIds: string[],
): Promise<Fonte<PartesReferenciadas>> {
  const fornecedoresDiretos: FornecedorDaParte[] = [];
  let pendente = false;

  for (const ids of lotesDeIds(fornecedorIds)) {
    const busca = (colunas: string) => noEscopo(
      db().from("fin_fornecedores").select(colunas), empresaId,
    ).in("id", ids).limit(ids.length);
    const fonte = await lerFornecedoresDaParte(busca, []);
    pendente ||= fonte.pendente;
    fornecedoresDiretos.push(...fonte.dados);
  }

  const contatosNecessarios = [
    ...contatoIds,
    ...fornecedoresDiretos.flatMap((fornecedor) => fornecedor.contato_id ? [fornecedor.contato_id] : []),
  ];
  const contatosDiretos: ContatoDaParte[] = [];
  for (const ids of lotesDeIds(contatosNecessarios)) {
    const busca = (colunas: string) => noEscopo(
      db().from("fin_contatos").select(colunas), empresaId,
    ).in("id", ids).limit(ids.length);
    const fonte = await lerContatosDaParte(busca);
    pendente ||= fonte.pendente;
    contatosDiretos.push(...fonte.dados);
  }

  const fornecedorPorContato = new Map<string, Fornecedor>();
  for (const fornecedor of fornecedoresDiretos) {
    if (fornecedor.contato_id) fornecedorPorContato.set(fornecedor.contato_id, fornecedor);
  }
  const contatosUnicos = new Map(contatosDiretos.map((contato) => [contato.id, contato]));
  const fornecedoresUnicos = new Map(fornecedoresDiretos.map((fornecedor) => [fornecedor.id, fornecedor]));

  return {
    dados: {
      partes: [...contatosUnicos.values()].map((contato) =>
        comporParte(contato, fornecedorPorContato.get(contato.id) ?? null)),
      fornecedores: [...fornecedoresUnicos.values()],
    },
    pendente,
  };
}

/**
 * Resolve o ID legado da extensão para a identidade canônica sem varrer uma
 * página do diretório. O escopo entra na própria query para que um link
 * manipulado não possa revelar ou abrir um fornecedor de outra empresa.
 */
export async function contatoCanonicoDoFornecedor(
  empresaId: Escopo, fornecedorId: string,
): Promise<Fonte<string | null>> {
  const resultado = await tolerante<{ contato_id?: unknown }[]>(
    noEscopo(db().from("fin_fornecedores").select("contato_id"), empresaId)
      .eq("id", fornecedorId)
      .is("deleted_at", null)
      .limit(1),
    [],
  );
  return {
    dados: typeof resultado.dados[0]?.contato_id === "string" ? resultado.dados[0].contato_id : null,
    pendente: resultado.pendente,
  };
}

/**
 * Carrega uma só identidade para um deep-link. É propositalmente separada de
 * `partes()`: a lista mantém seu limite normal, enquanto o alvo é uma consulta
 * direta e escopada, seguida apenas da extensão ligada a ele.
 */
export async function partePorId(empresaId: Escopo, contatoId: string): Promise<Fonte<ParteFinanceira | null>> {
  const buscaContato = (colunas: string) =>
    noEscopo(db().from("fin_contatos").select(colunas), empresaId)
      .eq("id", contatoId)
      .is("deleted_at", null)
      .limit(1);
  const contato = await lerContatosDaParte(buscaContato);
  if (contato.pendente) return { dados: null, pendente: true };
  const identidade = contato.dados[0];
  if (!identidade) return { dados: null, pendente: false };

  const buscaFornecedor = (colunas: string, contatoIds?: string[]) => {
    let q = noEscopo(db().from("fin_fornecedores").select(colunas), empresaId).is("deleted_at", null);
    if (contatoIds?.length) q = q.in("contato_id", contatoIds);
    return q.limit(1);
  };
  const fornecedor = await lerFornecedoresDaParte(buscaFornecedor, [identidade.id]);
  // Sem a coluna `contato_id` não existe vínculo seguro a consultar. O alvo
  // canônico ainda abre; só a extensão fica ausente, em vez de anexar por nome
  // ou CNPJ um fornecedor potencialmente diferente.
  if (fornecedor.pendente) return { dados: comporParte(identidade, null), pendente: false };
  const extensao = fornecedor.dados.find((item) => item.contato_id === identidade.id) ?? null;
  return { dados: comporParte(identidade, extensao), pendente: false };
}

async function lerContatosDaParte(
  busca: (colunas: string) => Promise<{ data: unknown; error: unknown }>,
): Promise<Fonte<ContatoDaParte[]>> {
  let resultado = await tolerante<ContatoDaParte[]>(busca(COLS_PARTE_CONTATO), []);
  if (resultado.pendente) resultado = await tolerante<ContatoDaParte[]>(busca(COLS_PARTE_CONTATO_SEM_PAPEIS), []);
  if (resultado.pendente) resultado = await tolerante<ContatoDaParte[]>(busca(`${COLS_CONTATO},logo_url,icone`), []);
  if (resultado.pendente) resultado = await tolerante<ContatoDaParte[]>(busca(COLS_CONTATO), []);
  return {
    ...resultado,
    dados: resultado.dados.map((contato) => ({
      ...contato,
      papeis: contato.papeis === undefined ? ["contato"] : contato.papeis,
      cnpj: contato.cnpj ?? null,
      telefones: contato.telefones?.length ? contato.telefones : contato.telefone ? [contato.telefone] : [],
      categorias: contato.categorias?.length ? contato.categorias : contato.categoria ? [contato.categoria] : [],
      tipo: contato.tipo ?? null, cargo: contato.cargo ?? null,
      organizacao: contato.organizacao ?? null, site: contato.site ?? null,
      natureza: contato.natureza ?? "pessoa", organizacao_id: contato.organizacao_id ?? null,
    })),
  };
}

async function lerFornecedoresDaParte(
  busca: (colunas: string, contatoIds?: string[]) => Promise<{ data: unknown; error: unknown }>,
  contatoIds: string[],
): Promise<Fonte<FornecedorDaParte[]>> {
  let resultado = await tolerante<FornecedorDaParte[]>(busca(COLS_PARTE_FORNECEDOR, contatoIds), []);
  if (resultado.pendente) resultado = await tolerante<FornecedorDaParte[]>(busca(COLS_PARTE_FORNECEDOR_SEM_CONTATO), []);
  if (resultado.pendente) resultado = await tolerante<FornecedorDaParte[]>(busca(COLS_FORNECEDOR), []);
  return {
    ...resultado,
    dados: resultado.dados.map((fornecedor) => ({ ...comOsPadroes(fornecedor), contato_id: fornecedor.contato_id ?? null })),
  };
}

// ── Colaboradores (folha) ────────────────────────────────────────────────────

const COLS_COLABORADOR =
  "id,empresa_id,employee_id,nome,setor,cargo,salario_base,beneficios,dia_pagamento,status,admissao";

/** O que entrou depois — some inteiro quando o SQL novo ainda não rodou. */
const COLS_COLABORADOR_NOVAS =
  "gratificacao,valor_hora,conta_id,banco,agencia,conta_numero,pix_tipo,pix_chave,whatsapp,logo_url,icone,vinculo";

/** Colaborador sem as colunas novas ainda vale como colaborador: zera e segue. */
const semAsNovas = (c: Colaborador): Colaborador => ({
  ...c,
  gratificacao: num(c.gratificacao), valor_hora: num(c.valor_hora),
  conta_id: c.conta_id ?? null, banco: c.banco ?? null, agencia: c.agencia ?? null,
  conta_numero: c.conta_numero ?? null, pix_tipo: c.pix_tipo ?? null,
  pix_chave: c.pix_chave ?? null, whatsapp: c.whatsapp ?? null,
  logo_url: c.logo_url ?? null, icone: c.icone ?? null,
  salario_base: num(c.salario_base), beneficios: num(c.beneficios),
});

export async function colaboradores(
  empresaId: Escopo, opts: { limite?: number } = {},
): Promise<Fonte<Colaborador[]>> {
  const busca = (cols: string) =>
    db()
      .from("fin_colaboradores")
      .select(cols)
      .in("empresa_id", Array.isArray(empresaId) ? empresaId : [empresaId])
      .order("nome")
      .limit(limitar(opts.limite));
  let r = await tolerante<Colaborador[]>(busca(`${COLS_COLABORADOR},${COLS_COLABORADOR_NOVAS}`), []);
  if (r.pendente) r = await tolerante<Colaborador[]>(busca(COLS_COLABORADOR), []);
  return { ...r, dados: r.dados.map(semAsNovas) };
}

/**
 * Gente do ERP, para o cadastro da folha "puxar" em vez de digitar.
 *
 * Só nome e id — nada de `employees`, que é onde moram permissões e dados de
 * RH. O vínculo (`employee_id`) é opcional de propósito: a Gedux tem gente na
 * folha que não tem login no sistema, e o Financeiro não pode esperar o RH.
 */
export async function pessoasDoSistema(): Promise<Fonte<{ id: string; nome: string }[]>> {
  const r = await tolerante<{ id: string; name: string | null }[]>(
    db().from("profiles").select("id,name").eq("active", true).order("name").limit(LIMITE_MAX),
    [],
  );
  return {
    pendente: r.pendente,
    dados: r.dados
      .filter((p) => (p.name ?? "").trim())
      .map((p) => ({ id: p.id, nome: (p.name ?? "").trim() })),
  };
}

/**
 * O que muda no mês (bônus, vale, farmácia…) para uma competência.
 *
 * Devolve tudo da empresa naquele mês e a tela agrupa por pessoa: são poucas
 * linhas por competência, e uma consulta por colaborador viraria N chamadas
 * numa tela que já lista todo mundo.
 */
export async function lancamentosDaFolha(
  empresaId: Escopo, competencia: string,
): Promise<Fonte<FolhaLancamento[]>> {
  const consulta = (cols: string) => db()
    .from("fin_folha_lancamentos")
    .select(cols)
    .in("empresa_id", Array.isArray(empresaId) ? empresaId : [empresaId])
    .eq("competencia", competencia)
    .order("created_at")
    .limit(LIMITE_MAX);
  const BASE = "id,empresa_id,colaborador_id,competencia,tipo,descricao,quantidade,valor";
  // Degrau: com as colunas do bônus recorrente primeiro; sem o SQL novo, a
  // lista continua vindo inteira (só sem o selo "todo mês").
  let r = await tolerante<FolhaLancamento[]>(consulta(`${BASE},recorrente,origem_id`), []);
  if (r.pendente) r = await tolerante<FolhaLancamento[]>(consulta(BASE), []);
  return { ...r, dados: r.dados.map((l) => ({ ...l, valor: num(l.valor), quantidade: l.quantidade == null ? null : num(l.quantidade) })) };
}

/**
 * A folha SEM nome e SEM valor individual — só o total e a contagem.
 *
 * Existe porque a Visão Geral mostra "Folha do mês" para quem tem
 * `financeiro:ver`, e quem não tem `financeiro:folha` não pode descobrir o
 * salário de ninguém por dedução. Devolver a lista e esconder no React não
 * resolveria: os dados já teriam viajado até o navegador.
 */
export async function folhaTotal(empresaId: Escopo): Promise<Fonte<{ total: number; pessoas: number }>> {
  const r = await tolerante<{ salario_base: number; beneficios: number }[]>(
    db()
      .from("fin_colaboradores")
      .select("salario_base,beneficios")
      .in("empresa_id", Array.isArray(empresaId) ? empresaId : [empresaId])
      .neq("status", "desligado")
      .limit(LIMITE_MAX),
    [],
  );
  return {
    pendente: r.pendente,
    dados: {
      pessoas: r.dados.length,
      total: r.dados.reduce((s, c) => s + num(c.salario_base) + num(c.beneficios), 0),
    },
  };
}

// ── Recorrências ─────────────────────────────────────────────────────────────

const COLS_RECORRENCIA =
  "id,empresa_id,descricao,categoria,valor,periodicidade,intervalo_meses,dia_vencimento,"
  + "conta_id,fornecedor_id,inicio,fim,proxima_competencia,status";

/** O que entrou em `financeiro_contato_banco_recorrencia.sql`. */
const COLS_RECORRENCIA_NOVAS =
  "conta_destino_id,forma_pagamento,responsavel_id,logo_url,icone,contato_id,valor_variavel";

export async function recorrencias(
  empresaId: Escopo, opts: { limite?: number } = {},
): Promise<Fonte<Recorrencia[]>> {
  const busca = (cols: string) =>
    noEscopo(db().from("fin_recorrencias").select(cols), empresaId)
      .order("descricao")
      .limit(limitar(opts.limite));
  let r = await tolerante<Recorrencia[]>(busca(`${COLS_RECORRENCIA},${COLS_RECORRENCIA_NOVAS}`), []);
  if (r.pendente) r = await tolerante<Recorrencia[]>(busca(COLS_RECORRENCIA), []);
  return {
    ...r,
    dados: r.dados.map((x) => ({
      ...x,
      valor: num(x.valor),
      conta_destino_id: x.conta_destino_id ?? null,
      forma_pagamento: x.forma_pagamento ?? null,
      responsavel_id: x.responsavel_id ?? null,
      contato_id: x.contato_id ?? null,
    })),
  };
}

// ── Compromissos ─────────────────────────────────────────────────────────────

const COLS_COMPROMISSO =
  "id,empresa_id,descricao,categoria,valor,vencimento,competencia,status,origem,origem_id," +
  "parcela_numero,parcela_total,conta_id,fornecedor_id,contato_id,colaborador_id,pago_em,pago_valor,observacao";

/** Ainda devidos. "atrasado" não é status gravado — é um destes que já venceu. */
const STATUS_EM_ABERTO = ["previsto", "pendente", "agendado"];
/** Encerrados: histórico, não dívida. */
const STATUS_FECHADOS = ["pago", "cancelado"];

export interface FiltroCompromissos {
  de?: string | null; ate?: string | null;
  status?: string | null; categoria?: string | null; conta_id?: string | null; origem?: string | null;
  /** "abertos" = ainda devidos (previsto/pendente/agendado); "fechados" = pagos e cancelados. */
  situacao?: "abertos" | "fechados" | null;
  /** Padrão: do vencimento mais antigo para o mais novo. */
  ordem?: "asc" | "desc" | null;
  busca?: string | null; limite?: number;
}

export async function compromissos(
  empresaId: Escopo, f: FiltroCompromissos = {},
): Promise<Fonte<Compromisso[]>> {
  let q = noEscopo(db().from("fin_compromissos").select(COLS_COMPROMISSO), empresaId);
  if (f.de) q = q.gte("vencimento", f.de);
  if (f.ate) q = q.lte("vencimento", f.ate);
  // "atrasado" não existe no banco (é derivado do relógio — ver calculos.ts):
  // filtrar por ele é pedir o que está EM ABERTO e já venceu.
  if (f.status && f.status !== "atrasado") q = q.eq("status", f.status);
  if (f.status === "atrasado") q = q.in("status", STATUS_EM_ABERTO);
  if (f.situacao === "abertos") q = q.in("status", STATUS_EM_ABERTO);
  if (f.situacao === "fechados") q = q.in("status", STATUS_FECHADOS);
  if (f.categoria) q = q.eq("categoria", f.categoria);
  if (f.conta_id) q = q.eq("conta_id", f.conta_id);
  if (f.origem) q = q.eq("origem", f.origem);
  if (f.busca) q = q.ilike("descricao", `%${f.busca}%`);

  const r = await tolerante<Compromisso[]>(
    q.order("vencimento", { ascending: f.ordem !== "desc" }).limit(limitar(f.limite)), []);
  return { ...r, dados: r.dados.map((c) => ({ ...c, valor: num(c.valor), pago_valor: c.pago_valor == null ? null : num(c.pago_valor) })) };
}

/**
 * A AGENDA: tudo que ainda está em aberto — SEM limite para trás, porque uma
 * conta atrasada há um ano continua devida — mais o que já foi pago ou
 * cancelado de `deFechados` em diante.
 *
 * Era uma janela só (±180 dias), e a conta mais velha que isso sumia de "Já
 * vencidos" e do cartão "Atrasados": a pessoa concluía que tinha sido paga.
 * São duas consultas em vez de uma janela enorme porque os fechados são o
 * grosso do histórico — só eles precisam de corte. Os abertos vêm do
 * vencimento mais antigo para o mais novo (o que está atrasado nunca é
 * cortado); os fechados, do mais recente para o mais antigo (o histórico que
 * importa é o de ontem, não o de dois anos atrás).
 *
 * `cortado` diz que alguma das duas bateu no teto: a tela avisa, em vez de
 * fingir que mostrou tudo.
 */
export async function compromissosDaAgenda(
  empresaId: Escopo,
  f: { deFechados: string; ate: string; origem?: string | null; limite?: number },
): Promise<Fonte<Compromisso[]> & { cortado: boolean }> {
  const teto = limitar(f.limite);
  const [abertos, fechados] = await Promise.all([
    compromissos(empresaId, { situacao: "abertos", ate: f.ate, origem: f.origem, limite: teto }),
    compromissos(empresaId, {
      situacao: "fechados", de: f.deFechados, ate: f.ate, origem: f.origem, ordem: "desc", limite: teto,
    }),
  ]);
  return {
    dados: unirPorId(abertos.dados, fechados.dados)
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    pendente: abertos.pendente || fechados.pendente,
    cortado: abertos.dados.length >= teto || fechados.dados.length >= teto,
  };
}

// ── Compras ──────────────────────────────────────────────────────────────────

const COLS_COMPRA =
  "id,empresa_id,fornecedor_id,descricao,data,categoria,valor_total,plano,parcelas,prazo_dias," +
  "primeiro_vencimento,forma_pagamento,conta_id,status,gera_patrimonio,observacao";

export interface FiltroCompras {
  de?: string | null; ate?: string | null;
  status?: string | null; categoria?: string | null; fornecedor_id?: string | null;
  busca?: string | null; limite?: number;
}

export async function compras(empresaId: Escopo, f: FiltroCompras = {}): Promise<Fonte<Compra[]>> {
  let q = noEscopo(db().from("fin_compras").select(COLS_COMPRA), empresaId).is("deleted_at", null);
  if (f.de) q = q.gte("data", f.de);
  if (f.ate) q = q.lte("data", f.ate);
  if (f.status) q = q.eq("status", f.status);
  if (f.categoria) q = q.eq("categoria", f.categoria);
  if (f.fornecedor_id) q = q.eq("fornecedor_id", f.fornecedor_id);
  if (f.busca) q = q.ilike("descricao", `%${f.busca}%`);

  const r = await tolerante<Compra[]>(q.order("data", { ascending: false }).limit(limitar(f.limite)), []);
  return { ...r, dados: r.dados.map((c) => ({ ...c, valor_total: num(c.valor_total) })) };
}

export async function itensDaCompra(compraId: string): Promise<Fonte<CompraItem[]>> {
  const r = await tolerante<CompraItem[]>(
    db()
      .from("fin_compra_itens")
      .select("id,compra_id,descricao,quantidade,unidade,valor_unitario,categoria,ordem")
      .eq("compra_id", compraId)
      .order("ordem")
      .limit(LIMITE_MAX),
    [],
  );
  return { ...r, dados: r.dados.map((i) => ({ ...i, quantidade: num(i.quantidade), valor_unitario: num(i.valor_unitario) })) };
}

// ── Notas fiscais ────────────────────────────────────────────────────────────

const COLS_NOTA =
  "id,empresa_id,tipo,numero,serie,parceiro_nome,fornecedor_id,compra_id,chave_acesso,emissao,valor,categoria,status";

export interface FiltroNotas {
  de?: string | null; ate?: string | null;
  tipo?: string | null; status?: string | null; vinculo?: string | null;
  busca?: string | null; limite?: number;
}

export async function notas(empresaId: Escopo, f: FiltroNotas = {}): Promise<Fonte<Nota[]>> {
  let q = noEscopo(db().from("fin_notas").select(COLS_NOTA), empresaId);
  if (f.de) q = q.gte("emissao", f.de);
  if (f.ate) q = q.lte("emissao", f.ate);
  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.status) q = q.eq("status", f.status);
  // Nota de compra sem `compra_id` é o alerta "nota sem compra" do §18.
  if (f.vinculo === "pendente") q = q.eq("tipo", "compra").is("compra_id", null);
  if (f.busca) q = q.or(`numero.ilike.%${f.busca}%,parceiro_nome.ilike.%${f.busca}%`);

  const r = await tolerante<Nota[]>(q.order("emissao", { ascending: false }).limit(limitar(f.limite)), []);
  return { ...r, dados: r.dados.map((n) => ({ ...n, valor: num(n.valor) })) };
}

/** Só o número, quando é só o número (CLAUDE.md → regra 6). */
/**
 * Compras confirmadas/recebidas há mais de `tolerancia` dias sem nota fiscal.
 *
 * A tolerância existe porque a nota costuma chegar depois da mercadoria: uma
 * compra de ontem sem documento não é problema, é o normal. Com zero dias o
 * alerta apareceria em TODA compra nova e viraria ruído que ninguém lê.
 *
 * Duas consultas cabeça-só (só a contagem viaja): a das compras candidatas e a
 * dos `compra_id` das notas. O cruzamento é aqui, porque PostgREST não faz
 * `not exists` sem uma view a mais — e uma view a mais é mais SQL para o dono.
 */
export async function contarComprasSemNota(empresaId: Escopo, tolerancia = 15): Promise<number> {
  try {
    const limite = somarDias(hojeISO(), -tolerancia);
    const { data: compras, error } = await noEscopo(db().from("fin_compras").select("id"), empresaId)
      .in("status", ["confirmada", "recebida"])
      .is("deleted_at", null)
      .lte("data", limite)
      .limit(500);
    if (error || !compras?.length) return 0;
    const ids = (compras as { id: string }[]).map((c) => c.id);
    const { data: notas } = await db()
      .from("fin_notas")
      .select("compra_id")
      .in("compra_id", ids)
      .limit(500);
    const comNota = new Set(((notas ?? []) as { compra_id: string }[]).map((n) => n.compra_id));
    return ids.filter((id) => !comNota.has(id)).length;
  } catch { return 0; }
}

export async function contarNotasSemCompra(empresaId: Escopo): Promise<number> {
  try {
    const { count, error } = await db()
      .from("fin_notas")
      .select("id", { count: "exact", head: true })
      .in("empresa_id", Array.isArray(empresaId) ? empresaId : [empresaId])
      .eq("tipo", "compra")
      .is("compra_id", null);
    if (error) return 0;
    return count ?? 0;
  } catch { return 0; }
}

// ── Patrimônio ───────────────────────────────────────────────────────────────

const COLS_PATRIMONIO =
  "id,empresa_id,codigo,descricao,categoria,local,responsavel_id,fornecedor_id,compra_id,nota_id," +
  "valor,aquisicao,garantia_ate,status";

export interface FiltroPatrimonio {
  status?: string | null; categoria?: string | null; local?: string | null;
  busca?: string | null; limite?: number;
}

const COLS_ESTORNO =
  "id,empresa_id,tipo,status,referencia,cliente,motivo,observacao,conta_id,valor,aberto_em,resolvido_em";

/** Os casos de estorno/chargeback do escopo — tolerante ao SQL não rodado. */
export async function estornos(
  empresaId: Escopo, opts: { limite?: number } = {},
): Promise<Fonte<Estorno[]>> {
  const r = await tolerante<Estorno[]>(
    noEscopo(db().from("fin_estornos").select(COLS_ESTORNO), empresaId)
      .order("aberto_em", { ascending: false })
      .limit(limitar(opts.limite)),
    [],
  );
  return { ...r, dados: r.dados.map((e) => ({ ...e, valor: num(e.valor) })) };
}

export async function patrimonio(empresaId: Escopo, f: FiltroPatrimonio = {}): Promise<Fonte<Patrimonio[]>> {
  // Com a marca primeiro, sem ela depois — o mesmo degrau das outras listas.
  // `financeiro_patrimonio_foto.sql` pode não ter rodado ainda, e a tela abre
  // igual (só sem a foto) em vez de mostrar "o banco não foi criado".
  return patrimonioCom(`${COLS_PATRIMONIO},logo_url,icone`, empresaId, f)
    .then((r) => (r.pendente ? patrimonioCom(COLS_PATRIMONIO, empresaId, f) : r));
}

async function patrimonioCom(
  cols: string, empresaId: Escopo, f: FiltroPatrimonio,
): Promise<Fonte<Patrimonio[]>> {
  let q = noEscopo(db().from("fin_patrimonio").select(cols), empresaId);
  if (f.status) q = q.eq("status", f.status);
  if (f.categoria) q = q.eq("categoria", f.categoria);
  if (f.local) q = q.eq("local", f.local);
  if (f.busca) q = q.or(`descricao.ilike.%${f.busca}%,codigo.ilike.%${f.busca}%`);

  const r = await tolerante<Patrimonio[]>(q.order("codigo").limit(limitar(f.limite)), []);
  return { ...r, dados: r.dados.map((p) => ({ ...p, valor: num(p.valor) })) };
}

/** O próximo código livre (PAT-001, PAT-002…). */
export async function proximoCodigoPatrimonio(empresaId: string, prefixo = "PAT"): Promise<string> {
  try {
    const { data } = await db()
      .from("fin_patrimonio")
      .select("codigo")
      .in("empresa_id", Array.isArray(empresaId) ? empresaId : [empresaId])
      .ilike("codigo", `${prefixo}-%`)
      .order("codigo", { ascending: false })
      .limit(1);
    const ultimo = (data as { codigo: string }[] | null)?.[0]?.codigo ?? "";
    const n = Number(ultimo.split("-")[1] ?? 0) || 0;
    return `${prefixo}-${String(n + 1).padStart(3, "0")}`;
  } catch { return `${prefixo}-001`; }
}

// ── Movimentos ───────────────────────────────────────────────────────────────

export async function movimentos(
  empresaId: Escopo, opts: { conta_id?: string | null; de?: string | null; limite?: number } = {},
): Promise<Fonte<Movimento[]>> {
  let q = db()
    .from("fin_movimentos")
    .select("id,empresa_id,conta_id,tipo,valor,descricao,compromisso_id,transfer_group_id,reverte_id,ocorrido_em,status")
    .in("empresa_id", Array.isArray(empresaId) ? empresaId : [empresaId]);
  if (opts.conta_id) q = q.eq("conta_id", opts.conta_id);
  if (opts.de) q = q.gte("ocorrido_em", opts.de);
  const r = await tolerante<Movimento[]>(
    q.order("ocorrido_em", { ascending: false }).limit(limitar(opts.limite)), []);
  return { ...r, dados: r.dados.map((m) => ({ ...m, valor: num(m.valor) })) };
}

// ── Auditoria (§18) ──────────────────────────────────────────────────────────

/**
 * Nunca quebra a operação. Uma baixa de R$ 12.400 que deu certo não pode ser
 * revertida na cara do usuário porque a LINHA DE LOG falhou — o registro é
 * importante, mas é consequência do fato, não condição dele.
 */
export async function auditar(entrada: {
  empresa_id: string | null; entidade: string; entidade_id?: string | null;
  acao: string; dados?: unknown; user_id?: string | null; user_nome?: string | null;
}): Promise<void> {
  try {
    await db().from("fin_auditoria").insert({
      empresa_id: entrada.empresa_id,
      entidade: entrada.entidade,
      entidade_id: entrada.entidade_id ?? null,
      acao: entrada.acao,
      dados: entrada.dados ?? null,
      user_id: entrada.user_id ?? null,
      user_nome: entrada.user_nome ?? null,
    });
  } catch { /* log não derruba operação */ }
}

export interface LinhaAuditoria {
  id: string; entidade: string; entidade_id: string | null; acao: string;
  dados: unknown; user_nome: string | null; created_at: string;
}

/** O rastro da empresa inteira, do mais novo para o mais velho (§18). */
export async function auditoria(
  empresaId: Escopo,
  f: { entidade?: string | null; acao?: string | null; de?: string | null; limite?: number } = {},
): Promise<Fonte<LinhaAuditoria[]>> {
  let q = db()
    .from("fin_auditoria")
    .select("id,entidade,entidade_id,acao,dados,user_nome,created_at")
    .in("empresa_id", Array.isArray(empresaId) ? empresaId : [empresaId]);
  if (f.entidade) q = q.eq("entidade", f.entidade);
  if (f.acao) q = q.eq("acao", f.acao);
  if (f.de) q = q.gte("created_at", f.de);
  return tolerante<LinhaAuditoria[]>(
    q.order("created_at", { ascending: false }).limit(limitar(f.limite)), []);
}

export async function historico(
  entidade: string, entidadeId: string, limite = 30,
): Promise<Fonte<{ id: string; acao: string; dados: unknown; user_nome: string | null; created_at: string }[]>> {
  return tolerante(
    db()
      .from("fin_auditoria")
      .select("id,acao,dados,user_nome,created_at")
      .eq("entidade", entidade)
      .eq("entidade_id", entidadeId)
      .order("created_at", { ascending: false })
      .limit(limitar(limite)),
    [],
  );
}

/**
 * Os valores combinados de recorrências variáveis, indexados por regra e mês.
 *
 * A agenda precisa deles para NÃO marcar como palpite o mês cujo número
 * alguém já informou. Sem isto, quem lançou R$ 617,42 de luz continuaria vendo
 * "Estimado" ao lado do número que ele mesmo escreveu — e passaria a
 * desconfiar da marca em vez de confiar nela.
 *
 * Tolerante à ausência da tabela: `financeiro_recorrencia_variavel.sql` é
 * rodado à mão, e sem ela a agenda funciona como sempre funcionou.
 */
export async function valoresDeRecorrencias(
  recorrenciaIds: string[],
): Promise<Record<string, Record<string, number>>> {
  if (!recorrenciaIds.length) return {};
  try {
    const { data, error } = await db()
      .from("fin_recorrencia_valores")
      .select("recorrencia_id,competencia,valor")
      .in("recorrencia_id", recorrenciaIds.slice(0, 300))
      .limit(600);
    if (error || !data) return {};
    const out: Record<string, Record<string, number>> = {};
    for (const linha of data as { recorrencia_id: string; competencia: string; valor: number | string }[]) {
      const n = Number(linha.valor);
      if (!Number.isFinite(n)) continue;
      (out[linha.recorrencia_id] ??= {})[String(linha.competencia).slice(0, 10)] = n;
    }
    return out;
  } catch {
    return {};
  }
}
