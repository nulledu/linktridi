// ── Acessos & Infra: domínios e hospedagens ──────────────────────────────────
// O CRUD dos dois cadastros da área /infraestrutura. Nada aqui é segredo — o
// segredo mora no cofre (lib/acessos-cofre.ts); estas tabelas só guardam o
// mapa: qual domínio vence quando, o que vamos renovar, onde cada coisa roda e
// QUAL credencial do cofre abre o painel (o vínculo é o id — a senha continua
// saindo só pela porta que audita).
//
// Mesmo modelo de resiliência do cofre: enquanto o SQL não rodou, a tela avisa
// "rode supabase/infraestrutura.sql" em vez de quebrar.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { TabelaAusenteError } from "@/lib/acessos-cofre";

const ausente = (msg?: string) =>
  !!msg && /relation .* does not exist|Could not find the table/i.test(msg);
function lancar(msg?: string): never {
  if (ausente(msg)) throw new TabelaAusenteError();
  throw new Error(msg || "erro");
}

// Teto de linhas: cadastro de infraestrutura de uma empresa não passa disso, e
// toda listagem do sistema tem `.limit()` — sem exceção.
const TETO = 500;

export const DECISOES = ["renovar", "avaliar", "nao_renovar"] as const;
export type Decisao = (typeof DECISOES)[number];
const decisaoValida = (v: unknown): Decisao =>
  (DECISOES as readonly string[]).includes(v as string) ? (v as Decisao) : "avaliar";

export const PERIODICIDADES = ["mensal", "anual", "unico"] as const;
export type Periodicidade = (typeof PERIODICIDADES)[number];
const periodicidadeValida = (v: unknown): Periodicidade =>
  (PERIODICIDADES as readonly string[]).includes(v as string) ? (v as Periodicidade) : "mensal";

// Data "aaaa-mm-dd" ou nada. O input date do navegador já manda assim; o resto
// (hora, lixo) vira null em vez de estourar no Postgres.
const dataValida = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

const valorValido = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

// Domínio digitado com "https://", "http://", barra no fim ou maiúscula vira
// o MESMO registro — foi por faltar isso aqui que "http://tridii.com.br"
// virou duplicata de "tridii.com.br" na tela em vez de atualizar a linha.
export const normalizarDominio = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const limpo = v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return limpo || null;
};

// uuid ou null — o vínculo é opcional e "" do formulário significa "sem vínculo".
const idOuNull = (v: unknown): string | null =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;

// ── Domínios ─────────────────────────────────────────────────────────────────
export interface Dominio {
  id: string;
  dominio: string;
  registrador: string | null;
  vencimento: string | null;        // "aaaa-mm-dd"
  valorRenovacao: number | null;
  renovacaoAutomatica: boolean;
  decisao: Decisao;
  ativo: boolean;
  responsavelId: string | null;
  observacao: string | null;
  hospedagemId: string | null;
  credencialId: string | null;
}

const COLS_DOM = "id,dominio,registrador,vencimento,valor_renovacao,renovacao_automatica,decisao,ativo,responsavel_id,observacao,hospedagem_id,credencial_id";
// Enquanto o SQL da coluna `ativo` não rodou, o select acima falha com
// "column … does not exist". O degrau de baixo mantém a tela no ar — tudo
// aparece como ativo, que é o que tudo era antes da coluna existir. Mesmo
// modelo do `tipo` em acessos-cofre.ts.
const COLS_DOM_LEGADO = "id,dominio,registrador,vencimento,valor_renovacao,renovacao_automatica,decisao,responsavel_id,observacao,hospedagem_id,credencial_id";
const colunaAtivoAusente = (msg?: string) =>
  !!msg && /column .*ativo.* does not exist|'ativo' column/i.test(msg);

const ativoValido = (v: unknown): boolean => v !== false;

type RowDom = {
  id: string; dominio: string; registrador: string | null; vencimento: string | null;
  valor_renovacao: number | string | null; renovacao_automatica: boolean; decisao: string;
  ativo?: boolean;
  responsavel_id: string | null; observacao: string | null;
  hospedagem_id: string | null; credencial_id: string | null;
};

const domDaRow = (r: RowDom): Dominio => ({
  id: r.id, dominio: r.dominio, registrador: r.registrador, vencimento: r.vencimento,
  valorRenovacao: r.valor_renovacao == null ? null : Number(r.valor_renovacao),
  renovacaoAutomatica: r.renovacao_automatica, decisao: decisaoValida(r.decisao),
  ativo: ativoValido(r.ativo),
  responsavelId: r.responsavel_id, observacao: r.observacao,
  hospedagemId: r.hospedagem_id, credencialId: r.credencial_id,
});

export async function listarDominios(): Promise<Dominio[]> {
  const sb = createSupabaseAdminClient();
  const consulta = (cols: string) => sb.from("infra_dominios").select(cols)
    .order("vencimento", { ascending: true, nullsFirst: false }).limit(TETO);
  let { data, error } = await consulta(COLS_DOM);
  if (error && colunaAtivoAusente(error.message)) ({ data, error } = await consulta(COLS_DOM_LEGADO));
  if (error) lancar(error.message);
  return ((data ?? []) as unknown as RowDom[]).map(domDaRow);
}

// O corpo cru do formulário vira a linha do banco AQUI, num lugar só — a rota
// não interpreta campo nenhum, e campo fora do vocabulário morre na validação.
function domLinha(b: Record<string, unknown>) {
  return {
    dominio: normalizarDominio(b.dominio),
    registrador: texto(b.registrador),
    vencimento: dataValida(b.vencimento),
    valor_renovacao: valorValido(b.valorRenovacao),
    renovacao_automatica: b.renovacaoAutomatica === true,
    decisao: decisaoValida(b.decisao),
    ativo: ativoValido(b.ativo),
    responsavel_id: idOuNull(b.responsavelId),
    observacao: texto(b.observacao),
    hospedagem_id: idOuNull(b.hospedagemId),
    credencial_id: idOuNull(b.credencialId),
  };
}

export async function criarDominio(b: Record<string, unknown>, criadoPor: string): Promise<Dominio> {
  const linha = domLinha(b);
  if (!linha.dominio) throw new Error("dominio_obrigatorio");
  const sb = createSupabaseAdminClient();
  const inserir = (l: Record<string, unknown>, cols: string) =>
    sb.from("infra_dominios").insert(l).select(cols).single();
  let { data, error } = await inserir({ ...linha, criado_por: criadoPor }, COLS_DOM);
  if (error && colunaAtivoAusente(error.message)) {
    const { ativo: _ativo, ...semAtivo } = linha; void _ativo;
    ({ data, error } = await inserir({ ...semAtivo, criado_por: criadoPor }, COLS_DOM_LEGADO));
  }
  if (error) lancar(error.message);
  return domDaRow(data as unknown as RowDom);
}

export async function atualizarDominio(id: string, b: Record<string, unknown>): Promise<Dominio> {
  const linha = domLinha(b);
  if (!linha.dominio) throw new Error("dominio_obrigatorio");
  const sb = createSupabaseAdminClient();
  const atualizar = (l: Record<string, unknown>, cols: string) =>
    sb.from("infra_dominios").update(l).eq("id", id).select(cols).single();
  let { data, error } = await atualizar({ ...linha, updated_at: new Date().toISOString() }, COLS_DOM);
  if (error && colunaAtivoAusente(error.message)) {
    const { ativo: _ativo, ...semAtivo } = linha; void _ativo;
    ({ data, error } = await atualizar({ ...semAtivo, updated_at: new Date().toISOString() }, COLS_DOM_LEGADO));
  }
  if (error) lancar(error.message);
  return domDaRow(data as unknown as RowDom);
}

export async function apagarDominio(id: string): Promise<void> {
  const sb = createSupabaseAdminClient();
  const { error } = await sb.from("infra_dominios").delete().eq("id", id);
  if (error) lancar(error.message);
}

// ── Hospedagens ──────────────────────────────────────────────────────────────
export interface Hospedagem {
  id: string;
  nome: string;
  provedor: string | null;
  urlPainel: string | null;
  valor: number | null;
  periodicidade: Periodicidade;
  proximaCobranca: string | null;   // "aaaa-mm-dd"
  responsavelId: string | null;
  observacao: string | null;
  credencialId: string | null;
}

const COLS_HOSP = "id,nome,provedor,url_painel,valor,periodicidade,proxima_cobranca,responsavel_id,observacao,credencial_id";

type RowHosp = {
  id: string; nome: string; provedor: string | null; url_painel: string | null;
  valor: number | string | null; periodicidade: string; proxima_cobranca: string | null;
  responsavel_id: string | null; observacao: string | null; credencial_id: string | null;
};

const hospDaRow = (r: RowHosp): Hospedagem => ({
  id: r.id, nome: r.nome, provedor: r.provedor, urlPainel: r.url_painel,
  valor: r.valor == null ? null : Number(r.valor),
  periodicidade: periodicidadeValida(r.periodicidade), proximaCobranca: r.proxima_cobranca,
  responsavelId: r.responsavel_id, observacao: r.observacao, credencialId: r.credencial_id,
});

export async function listarHospedagens(): Promise<Hospedagem[]> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.from("infra_hospedagens").select(COLS_HOSP)
    .order("nome", { ascending: true }).limit(TETO);
  if (error) lancar(error.message);
  return ((data ?? []) as RowHosp[]).map(hospDaRow);
}

function hospLinha(b: Record<string, unknown>) {
  return {
    nome: texto(b.nome),
    provedor: texto(b.provedor),
    url_painel: texto(b.urlPainel),
    valor: valorValido(b.valor),
    periodicidade: periodicidadeValida(b.periodicidade),
    proxima_cobranca: dataValida(b.proximaCobranca),
    responsavel_id: idOuNull(b.responsavelId),
    observacao: texto(b.observacao),
    credencial_id: idOuNull(b.credencialId),
  };
}

export async function criarHospedagem(b: Record<string, unknown>, criadoPor: string): Promise<Hospedagem> {
  const linha = hospLinha(b);
  if (!linha.nome) throw new Error("nome_obrigatorio");
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.from("infra_hospedagens")
    .insert({ ...linha, criado_por: criadoPor }).select(COLS_HOSP).single();
  if (error) lancar(error.message);
  return hospDaRow(data as RowHosp);
}

export async function atualizarHospedagem(id: string, b: Record<string, unknown>): Promise<Hospedagem> {
  const linha = hospLinha(b);
  if (!linha.nome) throw new Error("nome_obrigatorio");
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.from("infra_hospedagens")
    .update({ ...linha, updated_at: new Date().toISOString() }).eq("id", id)
    .select(COLS_HOSP).single();
  if (error) lancar(error.message);
  return hospDaRow(data as RowHosp);
}

export async function apagarHospedagem(id: string): Promise<void> {
  const sb = createSupabaseAdminClient();
  const { error } = await sb.from("infra_hospedagens").delete().eq("id", id);
  if (error) lancar(error.message);
}

// ── VPS ──────────────────────────────────────────────────────────────────────
// Servidores próprios. O IP e a porta de SSH não são segredo — quem entra
// precisa da CHAVE, que mora no cofre (credencial vinculada).
export interface Vps {
  id: string;
  nome: string;
  provedor: string | null;
  ip: string | null;
  portaSsh: number | null;
  urlPainel: string | null;
  valor: number | null;
  periodicidade: Periodicidade;
  proximaCobranca: string | null;   // "aaaa-mm-dd"
  responsavelId: string | null;
  observacao: string | null;
  credencialId: string | null;
}

const COLS_VPS = "id,nome,provedor,ip,porta_ssh,url_painel,valor,periodicidade,proxima_cobranca,responsavel_id,observacao,credencial_id";

type RowVps = {
  id: string; nome: string; provedor: string | null; ip: string | null;
  porta_ssh: number | null; url_painel: string | null;
  valor: number | string | null; periodicidade: string; proxima_cobranca: string | null;
  responsavel_id: string | null; observacao: string | null; credencial_id: string | null;
};

const vpsDaRow = (r: RowVps): Vps => ({
  id: r.id, nome: r.nome, provedor: r.provedor, ip: r.ip, portaSsh: r.porta_ssh,
  urlPainel: r.url_painel, valor: r.valor == null ? null : Number(r.valor),
  periodicidade: periodicidadeValida(r.periodicidade), proximaCobranca: r.proxima_cobranca,
  responsavelId: r.responsavel_id, observacao: r.observacao, credencialId: r.credencial_id,
});

const portaValida = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : null;
};

export async function listarVps(): Promise<Vps[]> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.from("infra_vps").select(COLS_VPS)
    .order("nome", { ascending: true }).limit(TETO);
  if (error) lancar(error.message);
  return ((data ?? []) as RowVps[]).map(vpsDaRow);
}

function vpsLinha(b: Record<string, unknown>) {
  return {
    nome: texto(b.nome),
    provedor: texto(b.provedor),
    ip: texto(b.ip),
    porta_ssh: portaValida(b.portaSsh),
    url_painel: texto(b.urlPainel),
    valor: valorValido(b.valor),
    periodicidade: periodicidadeValida(b.periodicidade),
    proxima_cobranca: dataValida(b.proximaCobranca),
    responsavel_id: idOuNull(b.responsavelId),
    observacao: texto(b.observacao),
    credencial_id: idOuNull(b.credencialId),
  };
}

export async function criarVps(b: Record<string, unknown>, criadoPor: string): Promise<Vps> {
  const linha = vpsLinha(b);
  if (!linha.nome) throw new Error("nome_obrigatorio");
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.from("infra_vps")
    .insert({ ...linha, criado_por: criadoPor }).select(COLS_VPS).single();
  if (error) lancar(error.message);
  return vpsDaRow(data as RowVps);
}

export async function atualizarVps(id: string, b: Record<string, unknown>): Promise<Vps> {
  const linha = vpsLinha(b);
  if (!linha.nome) throw new Error("nome_obrigatorio");
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.from("infra_vps")
    .update({ ...linha, updated_at: new Date().toISOString() }).eq("id", id)
    .select(COLS_VPS).single();
  if (error) lancar(error.message);
  return vpsDaRow(data as RowVps);
}

export async function apagarVps(id: string): Promise<void> {
  const sb = createSupabaseAdminClient();
  const { error } = await sb.from("infra_vps").delete().eq("id", id);
  if (error) lancar(error.message);
}
