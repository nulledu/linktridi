// ── Marketing · Aquecimento — acesso a dados ─────────────────────────────────
// A REGRA (ritmo, congelamento, fila do dia) mora em `marketing-aquecimento-const.ts`
// e é testada sem banco. Aqui só entra o que fala com o Supabase.
//
// Tolerante: sem as tabelas (SQL ainda não rodado) devolve vazio em vez de
// estourar a tela — a aba abre num estado vazio honesto.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  congelado, hojeISO,
  type Aparelho, type Ativo, type Etapa, type Evento, type Marco, type Roteiro,
  type StatusAtivo, type TipoAtivo,
} from "@/lib/marketing-aquecimento-const";

export * from "@/lib/marketing-aquecimento-const";

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : null);

function semTabela(e: { message?: string; code?: string } | null): boolean {
  return !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message || ""));
}

// `select("*")` é proibido em rota de leitura (ver CLAUDE.md · dados).
const C_ROTEIRO = "id,nome,tipo,ativo";
const C_ETAPA = "id,roteiro_id,ordem,dia,titulo,detalhe,removida_em";
const C_ATIVO = "id,tipo,nome,identificador,pai_id,status,roteiro_id,iniciado_em,pausado_em,"
  + "responsavel_id,responsavel_nome,aparelho,operadora,obs";
const C_APARELHO = "nome,modelo,foto_url,lugar,obs";
const C_MARCO = "id,ativo_id,etapa_id,feito_em,autor_id,autor_nome";
const C_EVENTO = "id,ativo_id,tipo,texto,status_antes,status_depois,etapa_id,autor_nome,created_at";

const LIMITE_ATIVOS = 500;
const LIMITE_EVENTOS = 200;

const deEtapa = (r: Row): Etapa => ({
  id: r.id as string, roteiroId: r.roteiro_id as string,
  ordem: Number(r.ordem ?? 0), dia: Number(r.dia ?? 0),
  titulo: (r.titulo as string) ?? "", detalhe: s(r.detalhe), removidaEm: s(r.removida_em),
});

const deAtivo = (r: Row): Ativo => ({
  id: r.id as string, tipo: (r.tipo as TipoAtivo) ?? "numero",
  nome: (r.nome as string) ?? "", identificador: s(r.identificador),
  paiId: s(r.pai_id), status: (r.status as StatusAtivo) ?? "novo",
  roteiroId: s(r.roteiro_id), iniciadoEm: String(r.iniciado_em ?? "").slice(0, 10),
  pausadoEm: r.pausado_em ? String(r.pausado_em).slice(0, 10) : null,
  responsavelId: s(r.responsavel_id), responsavelNome: s(r.responsavel_nome),
  responsavelFoto: null,   // preenchido por `comFotos()` — a linha do ativo não a tem
  aparelho: s(r.aparelho), operadora: s(r.operadora), obs: s(r.obs),
});

const deAparelho = (r: Row): Aparelho => ({
  nome: (r.nome as string) ?? "", modelo: s(r.modelo),
  fotoUrl: s(r.foto_url), lugar: s(r.lugar), obs: s(r.obs),
});

const deMarco = (r: Row): Marco => ({
  id: r.id as string, ativoId: r.ativo_id as string, etapaId: r.etapa_id as string,
  feitoEm: String(r.feito_em ?? "").slice(0, 10),
  autorId: s(r.autor_id), autorNome: s(r.autor_nome),
});

const deEvento = (r: Row): Evento => ({
  id: r.id as string, ativoId: r.ativo_id as string,
  tipo: (r.tipo as Evento["tipo"]) ?? "nota", texto: s(r.texto),
  statusAntes: s(r.status_antes) as StatusAtivo | null,
  statusDepois: s(r.status_depois) as StatusAtivo | null,
  etapaId: s(r.etapa_id), autorNome: s(r.autor_nome),
  createdAt: (r.created_at as string) ?? "",
});

export interface Autor { id: string; nome: string }

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listRoteiros(): Promise<Roteiro[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("aquecimento_roteiro").select(C_ROTEIRO)
    .order("tipo").limit(50);
  if (error) { if (semTabela(error)) return []; throw new Error(error.message); }
  const roteiros = (data ?? []) as Row[];
  if (!roteiros.length) return [];

  const { data: eta, error: e2 } = await db.from("aquecimento_etapa").select(C_ETAPA)
    .in("roteiro_id", roteiros.map((r) => r.id as string))
    .order("ordem").limit(600);
  if (e2 && !semTabela(e2)) throw new Error(e2.message);

  const porRoteiro = new Map<string, Etapa[]>();
  for (const r of (eta ?? []) as Row[]) {
    const e = deEtapa(r);
    const lista = porRoteiro.get(e.roteiroId);
    if (lista) lista.push(e); else porRoteiro.set(e.roteiroId, [e]);
  }
  return roteiros.map((r) => ({
    id: r.id as string, nome: (r.nome as string) ?? "",
    tipo: (r.tipo as TipoAtivo) ?? "numero", ativo: r.ativo !== false,
    etapas: porRoteiro.get(r.id as string) ?? [],
  }));
}

type Db = ReturnType<typeof createSupabaseAdminClient>;

/** Foto de perfil de um punhado de pessoas, num acesso só.
 *
 *  UMA consulta pro conjunto inteiro, nunca uma por linha: o inventário mostra
 *  o rosto em toda linha e um `select` por ativo seriam 500 idas ao Supabase
 *  pra desenhar uma tela (ver CLAUDE.md · dados).
 *
 *  Nunca estoura: falha aqui devolve `{}` e a tela cai nas iniciais. Perder a
 *  foto não pode derrubar o inventário. */
async function fotosDe(db: Db, ids: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return {};
  const { data, error } = await db.from("profiles")
    .select("id,employees(photo_url)").in("id", unicos).limit(LIMITE_ATIVOS);
  if (error) return {};
  type Linha = { id: string; employees: { photo_url: string | null }[] | { photo_url: string | null } | null };
  const out: Record<string, string> = {};
  for (const p of (data ?? []) as Linha[]) {
    const emp = Array.isArray(p.employees) ? p.employees[0] : p.employees;
    if (emp?.photo_url) out[p.id] = emp.photo_url;
  }
  return out;
}

/** Ativos + marcos de todos eles. Uma consulta cada, nunca N+1: a fila do dia
 *  precisa do conjunto inteiro pra agrupar por etapa. */
export async function listAtivos(tipo?: TipoAtivo): Promise<{ ativos: Ativo[]; marcos: Marco[] }> {
  const db = createSupabaseAdminClient();
  let q = db.from("aquecimento_ativo").select(C_ATIVO);
  if (tipo) q = q.eq("tipo", tipo);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(LIMITE_ATIVOS);
  if (error) { if (semTabela(error)) return { ativos: [], marcos: [] }; throw new Error(error.message); }

  const ativos = ((data ?? []) as Row[]).map(deAtivo);
  if (!ativos.length) return { ativos, marcos: [] };

  // As duas em paralelo: nenhuma depende da outra e a tela só desenha com as
  // duas na mão — em série a espera seria a soma, não a maior.
  const [{ data: ms, error: e2 }, fotos] = await Promise.all([
    db.from("aquecimento_marco").select(C_MARCO)
      .in("ativo_id", ativos.map((a) => a.id)).limit(LIMITE_ATIVOS * 20),
    fotosDe(db, ativos.map((a) => a.responsavelId ?? "")),
  ]);
  if (e2 && !semTabela(e2)) throw new Error(e2.message);

  for (const a of ativos) {
    if (a.responsavelId) a.responsavelFoto = fotos[a.responsavelId] ?? null;
  }
  return { ativos, marcos: ((ms ?? []) as Row[]).map(deMarco) };
}

/** Fichas de aparelho (foto, modelo, lugar). Tolerante: sem a tabela devolve
 *  vazio e a tela desenha a ilustração no lugar da foto. */
export async function listAparelhos(): Promise<Aparelho[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("aquecimento_aparelho").select(C_APARELHO)
    .order("nome").limit(LIMITE_ATIVOS);
  if (error) { if (semTabela(error)) return []; throw new Error(error.message); }
  return ((data ?? []) as Row[]).map(deAparelho);
}

export interface PatchAparelho {
  modelo?: string | null; fotoUrl?: string | null; lugar?: string | null; obs?: string | null;
}

/** Cria ou atualiza a ficha de um aparelho, e opcionalmente o RENOMEIA.
 *
 *  Renomear mexe nos dois lados na mesma chamada — a ficha e o campo `aparelho`
 *  de todo ativo que apontava pro nome antigo. Mexer só na ficha desgrudaria os
 *  números dela (a chave é o nome), e o bloco perderia a foto sem ninguém
 *  entender por quê.
 *
 *  Devolve `null` quando a tabela não existe: é o sinal de "SQL pendente" que a
 *  rota traduz pra mensagem, em vez de estourar 500 numa tela que funciona. */
export async function salvarAparelho(
  nome: string, patch: PatchAparelho, renomearPara?: string,
): Promise<Aparelho | null> {
  const db = createSupabaseAdminClient();
  const alvo = (renomearPara ?? nome).trim();
  if (!alvo) return null;

  const campos: Row = { nome: alvo, updated_at: new Date().toISOString() };
  if (patch.modelo !== undefined) campos.modelo = patch.modelo || null;
  if (patch.fotoUrl !== undefined) campos.foto_url = patch.fotoUrl || null;
  if (patch.lugar !== undefined) campos.lugar = patch.lugar || null;
  if (patch.obs !== undefined) campos.obs = patch.obs || null;

  const { data: existe, error: e0 } = await db.from("aquecimento_aparelho")
    .select("id").eq("nome", nome).maybeSingle();
  if (e0) { if (semTabela(e0)) return null; throw new Error(e0.message); }

  const q = existe
    ? db.from("aquecimento_aparelho").update(campos).eq("id", (existe as Row).id as string)
    : db.from("aquecimento_aparelho").insert(campos);
  const { data, error } = await q.select(C_APARELHO).single();
  if (error) { if (semTabela(error)) return null; throw new Error(error.message); }

  if (renomearPara && alvo !== nome) {
    await db.from("aquecimento_ativo")
      .update({ aparelho: alvo, updated_at: new Date().toISOString() })
      .eq("aparelho", nome);
    // O proxy aponta pro celular PELO NOME: sem migrar aqui, renomear o
    // aparelho soltava o proxy dele e a cobertura caía sozinha na contingência.
    const { error: eP } = await db.from("contingencia_proxy")
      .update({ aparelho_nome: alvo, updated_at: new Date().toISOString() })
      .eq("aparelho_nome", nome);
    if (eP && !semTabela(eP)) throw new Error(eP.message);
  }
  return deAparelho(data as Row);
}

export async function listEventos(ativoId: string): Promise<Evento[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("aquecimento_evento").select(C_EVENTO)
    .eq("ativo_id", ativoId).order("created_at", { ascending: false }).limit(LIMITE_EVENTOS);
  if (error) { if (semTabela(error)) return []; throw new Error(error.message); }
  return ((data ?? []) as Row[]).map(deEvento);
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export interface NovoAtivo {
  tipo: TipoAtivo; nome: string; identificador?: string | null; paiId?: string | null;
  roteiroId?: string | null; iniciadoEm?: string;
  responsavelId?: string | null; responsavelNome?: string | null;
  aparelho?: string | null; operadora?: string | null; obs?: string | null;
}

export async function criarAtivo(autor: Autor, n: NovoAtivo): Promise<Ativo | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("aquecimento_ativo").insert({
    tipo: n.tipo, nome: n.nome.trim(), identificador: n.identificador || null,
    pai_id: n.paiId || null, roteiro_id: n.roteiroId || null,
    iniciado_em: n.iniciadoEm || hojeISO(), status: "novo",
    responsavel_id: n.responsavelId || null, responsavel_nome: n.responsavelNome || null,
    aparelho: n.aparelho || null, operadora: n.operadora || null, obs: n.obs || null,
  }).select(C_ATIVO).single();
  if (error) { if (semTabela(error)) return null; throw new Error(error.message); }

  const ativo = deAtivo(data as Row);
  await registrar(autor, ativo.id, { tipo: "criacao", texto: `Ativo cadastrado: ${ativo.nome}` });
  return ativo;
}

export async function editarAtivo(id: string, patch: Partial<NovoAtivo>): Promise<Ativo | null> {
  const db = createSupabaseAdminClient();
  const campos: Row = { updated_at: new Date().toISOString() };
  if (patch.nome !== undefined) campos.nome = patch.nome.trim();
  if (patch.identificador !== undefined) campos.identificador = patch.identificador || null;
  if (patch.paiId !== undefined) campos.pai_id = patch.paiId || null;
  if (patch.roteiroId !== undefined) campos.roteiro_id = patch.roteiroId || null;
  if (patch.iniciadoEm !== undefined) campos.iniciado_em = patch.iniciadoEm;
  if (patch.responsavelId !== undefined) campos.responsavel_id = patch.responsavelId || null;
  if (patch.responsavelNome !== undefined) campos.responsavel_nome = patch.responsavelNome || null;
  if (patch.aparelho !== undefined) campos.aparelho = patch.aparelho || null;
  if (patch.operadora !== undefined) campos.operadora = patch.operadora || null;
  if (patch.obs !== undefined) campos.obs = patch.obs || null;

  const { data, error } = await db.from("aquecimento_ativo").update(campos)
    .eq("id", id).select(C_ATIVO).single();
  if (error) { if (semTabela(error)) return null; throw new Error(error.message); }
  return deAtivo(data as Row);
}

/** Troca de status. É aqui que o congelamento acontece: entrar em restrito/banido
 *  carimba `pausado_em` e o prazo para de correr; sair limpa o carimbo e o roteiro
 *  volta a andar. Deixar isso na tela seria confiar em cada chamada lembrar. */
export async function mudarStatus(
  autor: Autor, id: string, status: StatusAtivo, nota?: string,
): Promise<Ativo | null> {
  const db = createSupabaseAdminClient();
  const { data: atual, error: e0 } = await db.from("aquecimento_ativo")
    .select("id,status,pausado_em").eq("id", id).maybeSingle();
  if (e0) { if (semTabela(e0)) return null; throw new Error(e0.message); }
  if (!atual) return null;

  const antes = (atual as Row).status as StatusAtivo;
  const jaPausado = !!(atual as Row).pausado_em;
  const vaiCongelar = congelado(status);

  const { data, error } = await db.from("aquecimento_ativo").update({
    status,
    // Congelou agora → carimba hoje. Continua congelado → mantém o carimbo antigo
    // (senão cada edição empurraria o prazo pra frente). Descongelou → limpa.
    pausado_em: vaiCongelar ? (jaPausado ? (atual as Row).pausado_em : hojeISO()) : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).select(C_ATIVO).single();
  if (error) throw new Error(error.message);

  await registrar(autor, id, {
    tipo: "status", texto: nota || null, statusAntes: antes, statusDepois: status,
  });
  return deAtivo(data as Row);
}

/** Marca etapas cumpridas EM LOTE — seis chips no mesmo "dia 7" é uma chamada.
 *
 *  `upsert` com ignoreDuplicates e não `insert`: clique duplo ou dois operadores
 *  na mesma etapa não podem gerar dois marcos (a UNIQUE do banco recusaria e o
 *  lote inteiro falharia, perdendo as marcações válidas junto). */
export async function marcarEtapas(
  autor: Autor, itens: { ativoId: string; etapaId: string }[], feitoEm = hojeISO(),
): Promise<number> {
  if (!itens.length) return 0;
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("aquecimento_marco").upsert(
    itens.map((i) => ({
      ativo_id: i.ativoId, etapa_id: i.etapaId, feito_em: feitoEm,
      autor_id: autor.id, autor_nome: autor.nome,
    })),
    { onConflict: "ativo_id,etapa_id", ignoreDuplicates: true },
  ).select("ativo_id,etapa_id");
  if (error) { if (semTabela(error)) return 0; throw new Error(error.message); }

  // Um evento por etapa REALMENTE marcada agora — e não por item do pedido. Com
  // `ignoreDuplicates`, remarcar uma etapa já cumprida (clique duplo, dois
  // operadores na mesma fila) não cria marco nenhum; gravar o evento assim mesmo
  // enchia a linha do tempo de "cumpriu a etapa" repetido, para um fato que
  // aconteceu uma vez só.
  const criados = (data ?? []) as Row[];
  if (criados.length) {
    await db.from("aquecimento_evento").insert(criados.map((m) => ({
      ativo_id: m.ativo_id as string, tipo: "etapa", etapa_id: m.etapa_id as string,
      autor_id: autor.id, autor_nome: autor.nome,
    })));
  }

  // Primeira etapa cumprida tira o ativo de "novo" sozinho: obrigar a pessoa a
  // mudar o status na mão depois de marcar a etapa é burocracia que ela vai
  // esquecer, e aí o painel mente.
  await db.from("aquecimento_ativo").update({ status: "aquecendo", updated_at: new Date().toISOString() })
    .in("id", [...new Set(itens.map((i) => i.ativoId))]).eq("status", "novo");

  return (data ?? []).length;
}

export async function desmarcarEtapa(autor: Autor, ativoId: string, etapaId: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("aquecimento_marco").delete()
    .eq("ativo_id", ativoId).eq("etapa_id", etapaId);
  if (error && !semTabela(error)) throw new Error(error.message);
  await registrar(autor, ativoId, { tipo: "nota", texto: "Etapa desmarcada", etapaId });
}

export async function registrar(
  autor: Autor, ativoId: string,
  ev: { tipo: Evento["tipo"]; texto?: string | null; etapaId?: string | null;
        statusAntes?: StatusAtivo | null; statusDepois?: StatusAtivo | null },
): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("aquecimento_evento").insert({
    ativo_id: ativoId, tipo: ev.tipo, texto: ev.texto ?? null, etapa_id: ev.etapaId ?? null,
    status_antes: ev.statusAntes ?? null, status_depois: ev.statusDepois ?? null,
    autor_id: autor.id, autor_nome: autor.nome,
  });
  if (error && !semTabela(error)) throw new Error(error.message);
}

export async function removerAtivo(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("aquecimento_ativo").delete().eq("id", id);
  if (error && !semTabela(error)) throw new Error(error.message);
}

// ── Roteiros ─────────────────────────────────────────────────────────────────

export async function salvarEtapas(
  roteiroId: string, etapas: { id?: string; dia: number; titulo: string; detalhe?: string | null }[],
): Promise<void> {
  const db = createSupabaseAdminClient();
  const vindas = new Set(etapas.filter((e) => e.id).map((e) => e.id!));

  const { data: atuais, error } = await db.from("aquecimento_etapa").select("id")
    .eq("roteiro_id", roteiroId).is("removida_em", null).limit(200);
  if (error) { if (semTabela(error)) return; throw new Error(error.message); }

  // Etapa que sumiu da lista é SOFT-DELETE, nunca delete: quem já a cumpriu tem
  // um marco apontando pra ela, e apagar de verdade abriria um buraco no
  // histórico dessa pessoa.
  const sumiram = ((atuais ?? []) as Row[]).map((r) => r.id as string).filter((id) => !vindas.has(id));
  if (sumiram.length) {
    await db.from("aquecimento_etapa").update({ removida_em: new Date().toISOString() }).in("id", sumiram);
  }

  const novas = etapas
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.id);
  if (novas.length) {
    await db.from("aquecimento_etapa").insert(novas.map(({ e, i }) => ({
      roteiro_id: roteiroId, ordem: i, dia: e.dia,
      titulo: e.titulo.trim(), detalhe: e.detalhe || null,
    })));
  }

  // As existentes vão num `upsert` só. Antes era um `update` por etapa dentro de
  // um `for await`: salvar um roteiro de 20 etapas custava 20 idas ao banco em
  // série, e a Vercel cobra esse tempo parado como execução — é a mesma conta
  // que já pausou o projeto uma vez (ver CLAUDE.md · dados).
  const existentes = etapas
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !!e.id)
    .map(({ e, i }) => ({
      id: e.id!, roteiro_id: roteiroId, ordem: i, dia: e.dia,
      titulo: e.titulo.trim(), detalhe: e.detalhe || null,
    }));
  if (existentes.length) {
    await db.from("aquecimento_etapa").upsert(existentes, { onConflict: "id" });
  }
}
