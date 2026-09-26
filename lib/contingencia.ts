// ── Marketing · Gerenciador de Contingência — acesso a dados ─────────────────
// A REGRA mora em `contingencia-const.ts` e é testada sem banco. Aqui só entra
// o que fala com o Supabase. Chips e celulares vêm do aquecimento (é o mesmo
// cadastro); proxy, custo, pendência, config e snapshot são deste módulo.
//
// Tolerante: sem as tabelas (SQL ainda não rodado) devolve vazio, e a tela
// abre num estado vazio honesto com o aviso do SQL pendente.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { listAtivos, type Ativo } from "@/lib/marketing-aquecimento";
import {
  consolidar, hojeSP, LIMITES_PADRAO, limitesValidos,
  type Celular, type Consolidado, type Custo, type Limites, type PendenciaOperacional, type Painel, type Snapshot,
  type Proxy, type SituacaoCelular, type StatusProxy, type TipoCusto, type Periodicidade,
} from "@/lib/contingencia-const";

export * from "@/lib/contingencia-const";

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

function semTabela(e: { message?: string; code?: string } | null): boolean {
  return !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message || ""));
}
// Coluna nova em tabela velha (a ficha existia antes da contingência).
function semColuna(e: { message?: string; code?: string } | null): boolean {
  return !!e && (e.code === "42703" || /column .* does not exist|schema cache/i.test(e.message || ""));
}

// `select("*")` é proibido em rota de leitura (ver CLAUDE.md · dados).
const C_CELULAR = "id,nome,modelo,foto_url,lugar,obs,situacao,identificacao,responsavel_id,responsavel_nome";
const C_CELULAR_ANTIGO = "id,nome,modelo,foto_url,lugar,obs";
const C_PROXY = "id,identificacao,status,custo_mensal,numero_id,aparelho_nome,comprado_em,obs";
const C_CUSTO = "id,tipo,descricao,valor,periodicidade,data,ativo,obs";
const C_PENDENCIA = "id,titulo,descricao,status,responsavel_id,responsavel_nome,data,concluida_em,created_at";
const C_SNAPSHOT = "dia,dados,origem,autor_nome,updated_at";

const LIMITE = 500;

const deCelular = (r: Row): Celular => ({
  id: r.id as string, nome: (r.nome as string) ?? "", modelo: s(r.modelo),
  fotoUrl: s(r.foto_url), lugar: s(r.lugar), obs: s(r.obs),
  situacao: ((r.situacao as SituacaoCelular) ?? "ok"),
  identificacao: s(r.identificacao),
  responsavelId: s(r.responsavel_id), responsavelNome: s(r.responsavel_nome),
});

const deProxy = (r: Row): Proxy => ({
  id: r.id as string, identificacao: (r.identificacao as string) ?? "",
  status: (r.status as StatusProxy) ?? "ativo", custoMensal: num(r.custo_mensal),
  numeroId: s(r.numero_id), aparelhoNome: s(r.aparelho_nome),
  compradoEm: r.comprado_em ? String(r.comprado_em).slice(0, 10) : null, obs: s(r.obs),
});

const deCusto = (r: Row): Custo => ({
  id: r.id as string, tipo: (r.tipo as TipoCusto) ?? "outro", descricao: (r.descricao as string) ?? "",
  valor: num(r.valor), periodicidade: (r.periodicidade as Periodicidade) ?? "mensal",
  data: String(r.data ?? "").slice(0, 10), ativo: r.ativo !== false, obs: s(r.obs),
});

const dePendencia = (r: Row): PendenciaOperacional => ({
  id: r.id as string, titulo: (r.titulo as string) ?? "", descricao: s(r.descricao),
  status: (r.status as "aberta" | "feita") ?? "aberta",
  responsavelId: s(r.responsavel_id), responsavelNome: s(r.responsavel_nome),
  data: r.data ? String(r.data).slice(0, 10) : null, concluidaEm: s(r.concluida_em),
  createdAt: (r.created_at as string) ?? "",
});

const deSnapshot = (r: Row): Snapshot => ({
  dia: String(r.dia).slice(0, 10), dados: r.dados as Consolidado,
  origem: (r.origem as string) ?? "manual", autorNome: s(r.autor_nome), atualizadoEm: (r.updated_at as string) ?? "",
});

type Db = ReturnType<typeof createSupabaseAdminClient>;

// ── Leitura ──────────────────────────────────────────────────────────────────

/** Fichas de aparelho com as colunas da contingência. Se o SQL novo ainda não
 *  rodou mas a ficha antiga existe, lê as colunas antigas e preenche o resto
 *  com o padrão — a tela funciona, só sem situação/responsável. */
export async function listCelulares(db: Db = createSupabaseAdminClient()): Promise<{ celulares: Celular[]; pendente: boolean }> {
  const r1 = await db.from("aquecimento_aparelho").select(C_CELULAR).order("nome").limit(LIMITE);
  if (!r1.error) return { celulares: ((r1.data ?? []) as Row[]).map(deCelular), pendente: false };
  if (semTabela(r1.error)) return { celulares: [], pendente: true };
  if (!semColuna(r1.error)) throw new Error(r1.error.message);
  const r2 = await db.from("aquecimento_aparelho").select(C_CELULAR_ANTIGO).order("nome").limit(LIMITE);
  if (r2.error) { if (semTabela(r2.error)) return { celulares: [], pendente: true }; throw new Error(r2.error.message); }
  return { celulares: ((r2.data ?? []) as Row[]).map(deCelular), pendente: true };
}

export async function listProxies(db: Db = createSupabaseAdminClient()): Promise<{ proxies: Proxy[]; pendente: boolean }> {
  const { data, error } = await db.from("contingencia_proxy").select(C_PROXY).order("created_at").limit(LIMITE);
  if (error) { if (semTabela(error)) return { proxies: [], pendente: true }; throw new Error(error.message); }
  return { proxies: ((data ?? []) as Row[]).map(deProxy), pendente: false };
}

export async function listCustos(db: Db = createSupabaseAdminClient()): Promise<Custo[]> {
  const { data, error } = await db.from("contingencia_custo").select(C_CUSTO).order("data", { ascending: false }).limit(LIMITE);
  if (error) { if (semTabela(error)) return []; throw new Error(error.message); }
  return ((data ?? []) as Row[]).map(deCusto);
}

export async function listPendencias(db: Db = createSupabaseAdminClient()): Promise<PendenciaOperacional[]> {
  const { data, error } = await db.from("contingencia_pendencia").select(C_PENDENCIA)
    .order("status").order("created_at", { ascending: false }).limit(200);
  if (error) { if (semTabela(error)) return []; throw new Error(error.message); }
  return ((data ?? []) as Row[]).map(dePendencia);
}

export async function lerLimites(db: Db = createSupabaseAdminClient()): Promise<Limites> {
  const { data, error } = await db.from("contingencia_config").select("chave,valor").eq("chave", "limites").maybeSingle();
  if (error || !data) return LIMITES_PADRAO;
  return limitesValidos((data as Row).valor) ?? LIMITES_PADRAO;
}

export async function salvarLimites(l: Limites): Promise<boolean> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("contingencia_config")
    .upsert({ chave: "limites", valor: l, updated_at: new Date().toISOString() }, { onConflict: "chave" });
  if (error) { if (semTabela(error)) return false; throw new Error(error.message); }
  return true;
}

export async function ultimoSnapshot(db: Db = createSupabaseAdminClient()): Promise<Snapshot | null> {
  const { data, error } = await db.from("contingencia_snapshot").select(C_SNAPSHOT)
    .order("dia", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return deSnapshot(data as Row);
}

export async function listSnapshots(dias = 30): Promise<Snapshot[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("contingencia_snapshot").select(C_SNAPSHOT)
    .order("dia", { ascending: false }).limit(Math.min(Math.max(dias, 1), 366));
  if (error) { if (semTabela(error)) return []; throw new Error(error.message); }
  return ((data ?? []) as Row[]).map(deSnapshot).reverse();
}

export async function carregarPainel(): Promise<Painel> {
  const db = createSupabaseAdminClient();
  const [{ ativos }, cel, px, custos, pendencias, limites, snap] = await Promise.all([
    listAtivos(), listCelulares(db), listProxies(db), listCustos(db), listPendencias(db), lerLimites(db), ultimoSnapshot(db),
  ]);
  const consolidado = consolidar({ ativos, celulares: cel.celulares, proxies: px.proxies, custos, pendencias, limites });
  // "Anterior" é o último snapshot de um dia DIFERENTE de hoje: comparar hoje
  // com o snapshot de hoje mesmo daria zero em tudo depois do primeiro salvar.
  let anterior: Consolidado | null = null;
  if (snap) {
    if (snap.dia !== hojeSP()) anterior = snap.dados;
    else {
      const { data } = await db.from("contingencia_snapshot").select(C_SNAPSHOT)
        .lt("dia", snap.dia).order("dia", { ascending: false }).limit(1).maybeSingle();
      if (data) anterior = deSnapshot(data as Row).dados;
    }
  }
  return {
    consolidado, ativos, celulares: cel.celulares, proxies: px.proxies, custos, pendencias, limites,
    ultimoSnapshot: snap ? { dia: snap.dia, atualizadoEm: snap.atualizadoEm, autorNome: snap.autorNome, origem: snap.origem } : null,
    anterior,
    sqlPendente: cel.pendente || px.pendente,
  };
}

// ── Snapshot ─────────────────────────────────────────────────────────────────

/** Grava (ou regrava) a linha de HOJE com o consolidado atual. */
export async function gravarSnapshot(origem: "manual" | "cron", autorNome: string | null): Promise<Consolidado | null> {
  const painel = await carregarPainel();
  const db = createSupabaseAdminClient();
  const { error } = await db.from("contingencia_snapshot").upsert({
    dia: hojeSP(), dados: painel.consolidado, origem, autor_nome: autorNome, updated_at: new Date().toISOString(),
  }, { onConflict: "dia" });
  if (error) { if (semTabela(error)) return null; throw new Error(error.message); }
  return painel.consolidado;
}

// ── Escrita: celular ─────────────────────────────────────────────────────────

export interface PatchCelular {
  situacao?: SituacaoCelular; identificacao?: string | null;
  responsavelId?: string | null; responsavelNome?: string | null;
  modelo?: string | null; lugar?: string | null; obs?: string | null;
}

export async function salvarCelular(id: string, p: PatchCelular): Promise<Celular | null> {
  const db = createSupabaseAdminClient();
  const campos: Row = { updated_at: new Date().toISOString() };
  if (p.situacao !== undefined) campos.situacao = p.situacao;
  if (p.identificacao !== undefined) campos.identificacao = p.identificacao || null;
  if (p.responsavelId !== undefined) campos.responsavel_id = p.responsavelId || null;
  if (p.responsavelNome !== undefined) campos.responsavel_nome = p.responsavelNome || null;
  if (p.modelo !== undefined) campos.modelo = p.modelo || null;
  if (p.lugar !== undefined) campos.lugar = p.lugar || null;
  if (p.obs !== undefined) campos.obs = p.obs || null;
  const { data, error } = await db.from("aquecimento_aparelho").update(campos).eq("id", id).select(C_CELULAR).single();
  if (error) { if (semTabela(error) || semColuna(error)) return null; throw new Error(error.message); }
  return deCelular(data as Row);
}

/** Celular novo direto pela contingência (sem passar pelo aquecimento). */
export async function criarCelular(v: { nome: string; modelo?: string | null; identificacao?: string | null; lugar?: string | null; responsavelId?: string | null; responsavelNome?: string | null }): Promise<Celular | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("aquecimento_aparelho").insert({
    nome: v.nome.trim(), modelo: v.modelo || null, identificacao: v.identificacao || null, lugar: v.lugar || null,
    responsavel_id: v.responsavelId || null, responsavel_nome: v.responsavelNome || null,
  }).select(C_CELULAR).single();
  if (error) { if (semTabela(error) || semColuna(error)) return null; throw new Error(error.message); }
  return deCelular(data as Row);
}

// ── Escrita: proxy ───────────────────────────────────────────────────────────

export interface NovoProxy {
  identificacao: string; status?: StatusProxy; custoMensal: number;
  numeroId?: string | null; aparelhoNome?: string | null; compradoEm?: string | null; obs?: string | null;
}

export async function criarProxies(itens: NovoProxy[]): Promise<Proxy[] | null> {
  if (!itens.length) return [];
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("contingencia_proxy").insert(itens.map((p) => ({
    identificacao: p.identificacao.trim(), status: p.status ?? "ativo", custo_mensal: p.custoMensal,
    numero_id: p.numeroId || null, aparelho_nome: p.aparelhoNome || null,
    comprado_em: p.compradoEm || null, obs: p.obs || null,
  }))).select(C_PROXY);
  if (error) { if (semTabela(error)) return null; throw new Error(error.message); }
  return ((data ?? []) as Row[]).map(deProxy);
}

export async function editarProxy(id: string, p: Partial<NovoProxy>): Promise<Proxy | null> {
  const db = createSupabaseAdminClient();
  const campos: Row = { updated_at: new Date().toISOString() };
  if (p.identificacao !== undefined) campos.identificacao = p.identificacao.trim();
  if (p.status !== undefined) campos.status = p.status;
  if (p.custoMensal !== undefined) campos.custo_mensal = p.custoMensal;
  if (p.numeroId !== undefined) campos.numero_id = p.numeroId || null;
  if (p.aparelhoNome !== undefined) campos.aparelho_nome = p.aparelhoNome || null;
  if (p.compradoEm !== undefined) campos.comprado_em = p.compradoEm || null;
  if (p.obs !== undefined) campos.obs = p.obs || null;
  const { data, error } = await db.from("contingencia_proxy").update(campos).eq("id", id).select(C_PROXY).single();
  if (error) { if (semTabela(error)) return null; throw new Error(error.message); }
  return deProxy(data as Row);
}

export async function removerProxy(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("contingencia_proxy").delete().eq("id", id);
  if (error && !semTabela(error)) throw new Error(error.message);
}

// ── Escrita: custo ───────────────────────────────────────────────────────────

export interface NovoCusto { tipo: TipoCusto; descricao: string; valor: number; periodicidade?: Periodicidade; data?: string; obs?: string | null }

export async function criarCusto(c: NovoCusto): Promise<Custo | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("contingencia_custo").insert({
    tipo: c.tipo, descricao: c.descricao.trim(), valor: c.valor,
    periodicidade: c.periodicidade ?? "mensal", data: c.data || hojeSP(), obs: c.obs || null,
  }).select(C_CUSTO).single();
  if (error) { if (semTabela(error)) return null; throw new Error(error.message); }
  return deCusto(data as Row);
}

export async function editarCusto(id: string, c: Partial<NovoCusto> & { ativo?: boolean }): Promise<Custo | null> {
  const db = createSupabaseAdminClient();
  const campos: Row = { updated_at: new Date().toISOString() };
  if (c.tipo !== undefined) campos.tipo = c.tipo;
  if (c.descricao !== undefined) campos.descricao = c.descricao.trim();
  if (c.valor !== undefined) campos.valor = c.valor;
  if (c.periodicidade !== undefined) campos.periodicidade = c.periodicidade;
  if (c.data !== undefined) campos.data = c.data;
  if (c.ativo !== undefined) campos.ativo = c.ativo;
  if (c.obs !== undefined) campos.obs = c.obs || null;
  const { data, error } = await db.from("contingencia_custo").update(campos).eq("id", id).select(C_CUSTO).single();
  if (error) { if (semTabela(error)) return null; throw new Error(error.message); }
  return deCusto(data as Row);
}

export async function removerCusto(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("contingencia_custo").delete().eq("id", id);
  if (error && !semTabela(error)) throw new Error(error.message);
}

// ── Escrita: pendência ───────────────────────────────────────────────────────

export async function criarPendencia(v: { titulo: string; descricao?: string | null; responsavelId?: string | null; responsavelNome?: string | null; data?: string | null }): Promise<PendenciaOperacional | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("contingencia_pendencia").insert({
    titulo: v.titulo.trim(), descricao: v.descricao || null,
    responsavel_id: v.responsavelId || null, responsavel_nome: v.responsavelNome || null, data: v.data || null,
  }).select(C_PENDENCIA).single();
  if (error) { if (semTabela(error)) return null; throw new Error(error.message); }
  return dePendencia(data as Row);
}

export async function editarPendencia(id: string, v: { titulo?: string; descricao?: string | null; status?: "aberta" | "feita"; responsavelId?: string | null; responsavelNome?: string | null; data?: string | null }): Promise<PendenciaOperacional | null> {
  const db = createSupabaseAdminClient();
  const campos: Row = { updated_at: new Date().toISOString() };
  if (v.titulo !== undefined) campos.titulo = v.titulo.trim();
  if (v.descricao !== undefined) campos.descricao = v.descricao || null;
  if (v.status !== undefined) { campos.status = v.status; campos.concluida_em = v.status === "feita" ? new Date().toISOString() : null; }
  if (v.responsavelId !== undefined) campos.responsavel_id = v.responsavelId || null;
  if (v.responsavelNome !== undefined) campos.responsavel_nome = v.responsavelNome || null;
  if (v.data !== undefined) campos.data = v.data || null;
  const { data, error } = await db.from("contingencia_pendencia").update(campos).eq("id", id).select(C_PENDENCIA).single();
  if (error) { if (semTabela(error)) return null; throw new Error(error.message); }
  return dePendencia(data as Row);
}

export async function removerPendencia(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("contingencia_pendencia").delete().eq("id", id);
  if (error && !semTabela(error)) throw new Error(error.message);
}
