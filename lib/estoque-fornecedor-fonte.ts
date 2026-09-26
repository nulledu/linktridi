import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { empresasDoUsuario } from "@/lib/financeiro/db";
import type { Role } from "@/lib/rbac";

/**
 * O fornecedor do Estoque É o fornecedor do Financeiro.
 *
 * Durante um tempo existiram dois cadastros da mesma coisa —
 * `estoque_fornecedores` e `fin_fornecedores`. Dois cadastros nunca ficam
 * iguais: um ganha o CNPJ novo, o outro fica com o telefone velho, e "de quem a
 * gente compra isso?" passa a ter duas respostas — a errada sendo sempre a que
 * está aberta na tela. O Financeiro virou a base (ver
 * `supabase/estoque_fornecedor_do_financeiro.sql`).
 *
 * ── A fronteira, que é o ponto importante deste arquivo ─────────────────────
 *
 * O Financeiro é área RESTRITA: nem admin entra por padrão. Ler `fin_*` de
 * fora do módulo só é aceitável porque estas colunas — nome, CNPJ e o contato
 * de quem atende — são exatamente as que o estoque JÁ tinha no cadastro
 * próprio. Não há exposição nova.
 *
 * `prazo_dias`, `forma_pagamento` e `observacao` ficam de FORA de propósito:
 * essas são condição comercial, o assunto do módulo trancado. A lista de
 * colunas aqui é a fronteira inteira — acrescentar uma linha a ela é abrir o
 * cofre por descuido, e é por isso que ela mora sozinha, com este comentário
 * em cima.
 */
const COLUNAS = "id,empresa_id,nome,cnpj,contato_nome,contato_fone,contato_email,ativo";

/** O formato que as telas do estoque já esperavam do cadastro antigo. */
export interface FornecedorDoEstoque {
  id: string;
  nome: string;
  cnpj: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  ativo: boolean;
  /** De qual empresa do Financeiro ele é — a tela mostra quando há mais de uma. */
  empresa_id: string;
}

interface LinhaFin {
  id: string; empresa_id: string; nome: string; cnpj: string | null;
  contato_nome: string | null; contato_fone: string | null; contato_email: string | null;
  ativo: boolean;
}

const daLinha = (f: LinhaFin): FornecedorDoEstoque => ({
  id: f.id,
  nome: f.nome,
  cnpj: f.cnpj,
  contato: f.contato_nome,
  telefone: f.contato_fone,
  email: f.contato_email,
  ativo: f.ativo,
  empresa_id: f.empresa_id,
});

/**
 * "O SQL do Financeiro ainda não rodou" é resposta esperada, não erro.
 *
 * Um banco sem `fin_fornecedores` devolve 42P01. O estoque não pode cair por
 * causa disso: sem fornecedor o catálogo continua funcionando, só fica sem a
 * origem do material. Erro de verdade (rede, permissão) sobe.
 */
const SEM_TABELA = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);

const ehSchemaAtrasado = (e: { code?: string; message?: string } | null) =>
  !!e && (SEM_TABELA.has(e.code ?? "") || (e.message ?? "").includes("does not exist"));

export interface ListaDeFornecedores {
  fornecedores: FornecedorDoEstoque[];
  /** `true` quando o Financeiro ainda não existe neste banco. */
  pendente: boolean;
}

/**
 * Todos os fornecedores vivos do Financeiro, em ordem de nome.
 *
 * Sem recorte por empresa: o estoque não é dividido por empresa (não existe
 * `empresa_id` em `estoque_itens`), então recortar aqui esconderia da lista o
 * fornecedor de quem o galpão realmente compra. Quem quiser separar tem o
 * `empresa_id` na resposta.
 *
 * Inativo entra na lista: ele ainda é o nome que explica de onde veio o
 * material que está na prateleira. Quem filtra é a tela.
 */
export async function fornecedoresDoFinanceiro(): Promise<ListaDeFornecedores> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("fin_fornecedores")
      .select(COLUNAS)
      .is("deleted_at", null)
      .order("nome")
      .limit(500);
    if (error) {
      if (ehSchemaAtrasado(error)) return { fornecedores: [], pendente: true };
      throw error;
    }
    return { fornecedores: ((data ?? []) as unknown as LinhaFin[]).map(daLinha), pendente: false };
  } catch (e) {
    if (ehSchemaAtrasado(e as { code?: string; message?: string })) {
      return { fornecedores: [], pendente: true };
    }
    throw e;
  }
}

/**
 * Nomes vindos de planilha → ids de fornecedor, sem criar nada.
 *
 * A importação do catálogo casava nome com o cadastro do estoque e CRIAVA o que
 * não existisse. Isso não pode continuar: criar fornecedor agora é escrever no
 * Financeiro, que é restrito — uma planilha com "Madereira X" (sem o "i")
 * nasceria como fornecedor novo lá dentro, e ninguém do galpão poderia
 * desfazer.
 *
 * Então a importação passa a só CASAR. O que não casa volta na lista de
 * `naoEncontrados` para a tela dizer o que ficou de fora, em vez de inventar.
 *
 * A comparação é a mesma do resto do estoque (`normalizarFornecedor`), que
 * ignora acento, caixa e sufixo de razão social.
 */
export async function casarFornecedoresPorNome(
  nomes: string[],
  normalizar: (n: string) => string,
): Promise<{ porNome: Map<string, string>; naoEncontrados: string[]; pendente: boolean }> {
  const { fornecedores, pendente } = await fornecedoresDoFinanceiro();
  const indice = new Map<string, string>();
  for (const f of fornecedores) {
    const chave = normalizar(f.nome);
    // O primeiro vence: a lista vem ordenada por nome, então dois cadastros que
    // normalizam igual sempre resolvem para o mesmo — e não para um diferente a
    // cada importação, que seria o pior tipo de resultado.
    if (chave && !indice.has(chave)) indice.set(chave, f.id);
  }

  const porNome = new Map<string, string>();
  const naoEncontrados: string[] = [];
  for (const bruto of nomes) {
    const nome = bruto.trim();
    if (!nome) continue;
    const id = indice.get(normalizar(nome));
    if (id) porNome.set(nome, id);
    else if (!naoEncontrados.includes(nome)) naoEncontrados.push(nome);
  }
  return { porNome, naoEncontrados, pendente };
}

// ── Quem pode mexer, e em qual empresa a linha nasce ─────────────────────────

export interface QuemSou { id: string; role: string; username?: string | null }

/**
 * Quem pode MEXER no cadastro de fornecedor.
 *
 * Antes era papel do galpão ou `estoque:fornecedores`. Agora é
 * `financeiro:cadastros`, porque é lá que a linha nasce — e manter a chave
 * antiga deixaria um estoquista escrevendo dentro da área restrita por uma
 * porta lateral, que é exatamente o buraco que a área restrita existe para não
 * ter. Nem o papel "admin" atravessa: o Financeiro não abre por papel.
 *
 * Mora aqui, e não em `estoque-permissoes.ts`, porque a resposta agora depende
 * do Financeiro — deixá-la junto das chaves do galpão convidaria a próxima
 * pessoa a "consertar" acrescentando `estoque:fornecedores` de volta.
 */
export async function podeGerirFornecedores(me: QuemSou): Promise<boolean> {
  const keys = await resolveMyModuleKeys({ id: me.id, role: me.role as Role, username: me.username });
  return keys.includes("financeiro:cadastros");
}

export type EmpresaEscolhida =
  | { id: string }
  | { erro: "sem_empresa" | "escolha_a_empresa" | "empresa_nao_permitida"; status: number; empresas: { id: string; nome: string }[] };

/**
 * Em qual empresa do Financeiro o fornecedor nasce.
 *
 * Com uma empresa liberada, é ela. Com mais de uma, quem chama TEM de dizer:
 * escolher a primeira em silêncio faria o fornecedor da Tridi nascer na Gedux
 * conforme a ordem do banco, e ninguém descobriria até a compra sair errada.
 */
export async function empresaParaCriar(me: QuemSou, pedida?: unknown): Promise<EmpresaEscolhida> {
  const { dados } = await empresasDoUsuario(me.id);
  const empresas = dados.map((e) => ({ id: e.id, nome: e.nome }));
  const alvo = String(pedida ?? "").trim();
  if (alvo) {
    if (!empresas.some((e) => e.id === alvo)) return { erro: "empresa_nao_permitida", status: 403, empresas };
    return { id: alvo };
  }
  if (empresas.length === 1) return { id: empresas[0].id };
  if (!empresas.length) return { erro: "sem_empresa", status: 403, empresas };
  return { erro: "escolha_a_empresa", status: 400, empresas };
}
