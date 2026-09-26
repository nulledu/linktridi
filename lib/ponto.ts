// ── Controle de Ponto ────────────────────────────────────────────────────────
// Pessoas cadastradas no painel (Administração → Controle de Ponto) e batidas
// de ponto vindas do tablet (app Ponto, autenticado como device) ou lançadas
// manualmente pelo admin. Tabelas: ponto_pessoas / ponto_registros
// (supabase/ponto.sql). Tolerante: sem as tabelas, devolve erro legível
// ("tabela_ausente") em vez de quebrar.
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { diasDoMes, dowDia, ehDiaUtil, jornadaDoDia, minutosDoRelogio, type TipoFeriado } from "@/lib/jornada-calendario";
import {
  ehEfeitoJustificativa, ehStatusJustificativa, ehTipoJustificativa,
  type EfeitoJustificativa, type StatusJustificativa, type TipoJustificativa,
} from "@/lib/ponto-justificativas";

// Tipos de batida (jornada completa): entrada → almoço → retorno → saída, e os
// intervalos (pausas do meio do expediente) em pares que o sistema define.
export type TipoBatida =
  | "entrada" | "saida" | "almoco" | "retorno"
  | "intervalo_inicio" | "intervalo_fim";
export const TIPOS_BATIDA: TipoBatida[] = ["entrada", "almoco", "retorno", "intervalo_inicio", "intervalo_fim", "saida"];
// Começa/retoma período de trabalho? (presença = pessoa está DENTRO)
const INICIA = new Set<TipoBatida>(["entrada", "retorno", "intervalo_fim"]);

// ── Classificação automática da jornada ──────────────────────────────────────
// O tablet só manda "a pessoa X bateu agora". O TIPO de cada batida é função
// pura da lista ORDENADA de horários do dia (recomputada a cada batida). Regras:
//   1ª batida ................................ entrada
//   última batida ............................ saída (provisória até vir outra)
//   1ª batida do miolo na janela do almoço ... almoço (saída p/ almoço)
//   a seguinte ao almoço ..................... retorno
//   demais batidas do miolo .................. intervalos em pares
//                                              (ímpar=início, par=fim)
// Reclassificação: como a saída é sempre a última, quando chega uma batida nova
// a antiga "saída" deixa de ser a última e é reclassificada (retorno/intervalo).
// `minutosLocalSp` extrai o horário de SP (UTC-3) de um ISO — sem libs de fuso.
function minutosLocalSp(iso: string): number {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function diaLocalSp(iso: string): string {
  return new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// ── O que o dia da pessoa espera ─────────────────────────────────────────────
// Sem esse contexto a classificação só olhava o relógio, e QUALQUER segunda
// batida entre 11h e 13h virava "almoço" — inclusive a que era claramente o fim
// do expediente. No sábado (meia jornada, ninguém almoça) o mercadinho inteiro
// aparecia "Em almoço" pro resto do dia, porque a saída das 11h30 tinha sido
// carimbada como saída pro almoço e o painel lê o tipo da última batida.
export interface ContextoJornada {
  /** Jornada esperada NESSE dia, em minutos. 0 = dia sem expediente (domingo,
   *  feriado, sábado de quem não trabalha). null/ausente = desconhecida. */
  jornadaDiaMin?: number | null;
  /** Almoço previsto do turno ("HH:MM"). Sem ele, a janela é centrada no meio-dia. */
  almocoInicio?: string | null;
}

// Quanto ainda pode faltar da jornada pra uma parada ser "almoço" e não "fim do
// expediente". Uma hora: quem já cumpriu tudo menos 59 min não vai voltar.
const FALTA_PRA_SER_ALMOCO_MIN = 60;
// Meia jornada não tem almoço na regra da casa (é o sábado de 4h).
const MEIA_JORNADA_MAX_MIN = 300;

/** Esse dia tem almoço previsto? Domingo e feriado não; sábado só se a jornada
 *  do dia for de expediente inteiro; jornada desconhecida no sábado assume meia
 *  jornada (o caso comum de quem ainda não cadastrou turno). */
function esperaAlmoco(dow: number, jornadaDiaMin: number | null | undefined): boolean {
  if (jornadaDiaMin === 0) return false;                       // sem expediente
  if (jornadaDiaMin != null && jornadaDiaMin <= MEIA_JORNADA_MAX_MIN) return false;
  if (dow === 0) return false;                                 // domingo
  if (dow === 6 && jornadaDiaMin == null) return false;        // sábado sem cadastro
  return true;
}

// As batidas ALTERNAM: trabalhar → parar → voltar → parar…
//   ÍMPAR  = FECHA  → almoço (1ª na janela, se o dia tem almoço) ·
//                     saída (última do dia) · senão INTERVALO
//   PAR    = REABRE → sempre RETORNO (volta do almoço ou do intervalo)
// Ou seja: os 4 clássicos (entrada/almoço/retorno/saída) e QUALQUER batida extra
// entra como intervalo (saiu) e retorno (voltou). Reabertura NUNCA vira saída.
//
// A ÚLTIMA batida do dia só vira "almoço" se a pessoa ainda deve pelo menos uma
// hora de jornada — senão ela foi embora, e chamar isso de almoço deixa o painel
// esperando uma volta que não vem. Quando outra batida já veio depois, a dúvida
// não existe: quem voltou tinha saído pro almoço mesmo.
//
// SEGURANÇA: o rótulo é só rótulo. As HORAS são calculadas por POSIÇÃO (par a
// par) no banco de horas e no painel — assim, mesmo que um rótulo fique torto,
// o total de horas continua certo. Nada de hora depender de rótulo.
export function classificarDia(batidasIso: string[], ctx: ContextoJornada = {}): TipoBatida[] {
  const n = batidasIso.length;
  if (n === 0) return [];
  const tipos: TipoBatida[] = new Array(n);
  tipos[0] = "entrada";

  const dow = dowDia(diaLocalSp(batidasIso[0]));
  const comAlmoco = esperaAlmoco(dow, ctx.jornadaDiaMin);
  // Janela do almoço: 1h antes até 1h30 depois do previsto (padrão 12:00).
  const centro = minutosDoRelogio(ctx.almocoInicio) ?? 12 * 60;
  const de = centro - 60, ate = centro + 90;
  // Minutos já trabalhados até a batida `i` (pares fechados), pra saber se ainda
  // falta jornada. Mesma conta por POSIÇÃO que o banco de horas faz.
  const trabalhadoAte = (i: number): number => {
    let ms = 0;
    for (let k = 0; k + 1 <= i; k += 2) ms += new Date(batidasIso[k + 1]).getTime() - new Date(batidasIso[k]).getTime();
    return Math.max(0, Math.round(ms / 60000));
  };

  let temAlmoco = false;
  for (let i = 1; i < n; i++) {
    if (i % 2 === 1) {                       // FECHA (parou de trabalhar)
      const min = minutosLocalSp(batidasIso[i]);
      const naJanela = comAlmoco && !temAlmoco && min >= de && min <= ate;
      // Última do dia: só é almoço se ainda falta jornada pra cumprir.
      const aindaVolta = i < n - 1 || ctx.jornadaDiaMin == null
        || trabalhadoAte(i) < ctx.jornadaDiaMin - FALTA_PRA_SER_ALMOCO_MIN;
      if (naJanela && aindaVolta) { tipos[i] = "almoco"; temAlmoco = true; }
      else if (i === n - 1) tipos[i] = "saida";              // última fecha do dia
      else tipos[i] = "intervalo_inicio";                    // extra: saiu
    } else {                                 // REABRE: sempre "retorno" (voltou)
      tipos[i] = "retorno";
    }
  }
  return tipos;
}

const hashPin = (pin: string) => createHash("sha256").update(pin.trim()).digest("hex");

export interface PontoPessoa {
  id: string;
  nome: string;
  colaboradorId: string | null;
  fotoUrl: string | null;
  fotos: string[];          // fotos extras p/ reconhecimento
  temPin: boolean;          // PIN definido (o hash não sai pro painel)
  pinHash?: string | null;  // só a rota de sync do tablet inclui
  consentimento: boolean;   // autorizou uso da biometria (LGPD)
  jornadaMin: number | null;      // minutos de trabalho esperados/dia (banco de horas). null = padrão
  trabalhaSabado: boolean;        // conta sábado no banco de horas? (default false)
  sabadoMin: number | null;       // jornada do sábado (min). null = padrão 4h (240) se trabalha sábado
  entradaPrevista: string | null; // "HH:MM" (referência)
  saidaPrevista: string | null;   // "HH:MM" (referência)
  // Almoço previsto — o que permite conferir a tolerância de 5 min NAS
  // marcações de almoço/retorno (sem isso, esticar o almoço só aparecia no
  // total do dia). null = turno sem almoço.
  almocoInicio: string | null;
  almocoFim: string | null;
  turnoId: string | null;         // predefinição aplicada (ponto_turnos)
  // Estágio não gera hora extra: o crédito do RELÓGIO é descartado no banco
  // de horas. Quitar dívida e ajuste manual do admin continuam valendo.
  estagiario: boolean;
  ativo: boolean;
  createdAt: string;
}

export interface PontoRegistro {
  id: string;
  pessoaId: string;
  pessoaNome?: string;
  pessoaFoto?: string | null;
  tipo: TipoBatida;
  batidoEm: string;
  selfieUrl: string | null;
  confianca: number | null;
  origem: "tablet" | "manual";
}

// Erro de tabela ausente (SQL ainda não rodado) → mensagem clara p/ o painel.
const ausente = (msg: string | undefined) => !!msg && /relation .* does not exist|Could not find the table/i.test(msg);
// Coluna do v2 (pin/consentimento) ainda não criada → cai no formato v1.
const colunaAusente = (msg: string | undefined) => !!msg && /column .* does not exist|Could not find the .* column/i.test(msg);
export class TabelaAusenteError extends Error { constructor() { super("tabela_ausente"); } }
function lancar(msg: string | undefined): never {
  if (ausente(msg)) throw new TabelaAusenteError();
  throw new Error(msg || "erro");
}

type PessoaRow = { id: string; nome: string; colaborador_id: string | null; foto_url: string | null; fotos: unknown; pin_hash?: string | null; consentimento?: boolean; jornada_min?: number | null; trabalha_sabado?: boolean | null; sabado_min?: number | null; entrada_prevista?: string | null; saida_prevista?: string | null; almoco_inicio?: string | null; almoco_fim?: string | null; turno_id?: string | null; estagiario?: boolean | null; ativo: boolean; created_at: string };
// Almoço/turno só existem depois de supabase/ponto_turnos.sql — por isso entram
// como mais um degrau da escada de fallback, igual sábado e jornada fizeram.
// `estagiario` chegou por último (supabase/ponto_estagiario.sql) — mais um
// degrau da escada: sem a coluna, todo mundo tem hora extra, como era antes.
const COLS_ESTAG = "id,nome,colaborador_id,foto_url,fotos,pin_hash,consentimento,jornada_min,trabalha_sabado,sabado_min,entrada_prevista,saida_prevista,almoco_inicio,almoco_fim,turno_id,estagiario,ativo,created_at";
const COLS_TURNO = "id,nome,colaborador_id,foto_url,fotos,pin_hash,consentimento,jornada_min,trabalha_sabado,sabado_min,entrada_prevista,saida_prevista,almoco_inicio,almoco_fim,turno_id,ativo,created_at";
const COLS = "id,nome,colaborador_id,foto_url,fotos,pin_hash,consentimento,jornada_min,trabalha_sabado,sabado_min,entrada_prevista,saida_prevista,ativo,created_at";
const COLS_SAB = "id,nome,colaborador_id,foto_url,fotos,pin_hash,consentimento,jornada_min,trabalha_sabado,entrada_prevista,saida_prevista,ativo,created_at";   // sem sabado_min
const COLS_V3 = "id,nome,colaborador_id,foto_url,fotos,pin_hash,consentimento,jornada_min,entrada_prevista,saida_prevista,ativo,created_at";   // antes do ponto_sabado.sql
const COLS_V2 = "id,nome,colaborador_id,foto_url,fotos,pin_hash,consentimento,ativo,created_at";   // antes do ponto_jornada.sql
const COLS_V1 = "id,nome,colaborador_id,foto_url,fotos,ativo,created_at";   // antes do ponto_v2.sql
function pessoaDeRow(r: PessoaRow): PontoPessoa {
  return {
    id: r.id, nome: r.nome, colaboradorId: r.colaborador_id, fotoUrl: r.foto_url,
    fotos: Array.isArray(r.fotos) ? (r.fotos as string[]).filter((x) => typeof x === "string") : [],
    temPin: !!r.pin_hash, pinHash: r.pin_hash ?? null,
    consentimento: r.consentimento ?? false,
    jornadaMin: r.jornada_min ?? null, trabalhaSabado: r.trabalha_sabado ?? false, sabadoMin: r.sabado_min ?? null,
    entradaPrevista: r.entrada_prevista ?? null, saidaPrevista: r.saida_prevista ?? null,
    almocoInicio: r.almoco_inicio ?? null, almocoFim: r.almoco_fim ?? null, turnoId: r.turno_id ?? null, estagiario: r.estagiario ?? false,
    ativo: r.ativo, createdAt: r.created_at,
  };
}

// ── Presença AGORA (pro tablet de produção) ──────────────────────────────────
// Por colaborador (profiles.id): quem está CADASTRADO no ponto e, entre esses,
// quem bateu ponto hoje e a última batida iniciou trabalho (entrada/retorno) —
// ou seja, está DENTRO da empresa. Tolerante: sem tabela/vínculo, devolve vazio
// (o chamador decide o fallback). `ponto_pessoas.colaborador_id` = profiles.id.
export interface PresencaAgora { registrados: Set<string>; presentes: Set<string> }
export async function presencaAgora(colaboradorIds: string[]): Promise<PresencaAgora> {
  const out: PresencaAgora = { registrados: new Set(), presentes: new Set() };
  const ids = [...new Set(colaboradorIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const db = createSupabaseAdminClient();
  const { data: pessoas, error } = await db.from("ponto_pessoas")
    .select("id,colaborador_id,ativo").in("colaborador_id", ids);
  if (error || !pessoas) return out;   // sem tabela / sem vínculo → ninguém no ponto
  const pessoaToColab = new Map<string, string>();
  for (const p of pessoas as { id: string; colaborador_id: string | null; ativo: boolean }[]) {
    if (p.colaborador_id && p.ativo !== false) { out.registrados.add(p.colaborador_id); pessoaToColab.set(p.id, p.colaborador_id); }
  }
  if (pessoaToColab.size === 0) return out;
  // Início do dia em SP (UTC-3) → só as batidas de hoje contam pra presença.
  const s = new Date(Date.now() - 3 * 3600 * 1000);
  const inicioDiaSp = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 3, 0, 0)).toISOString();
  const { data: regs } = await db.from("ponto_registros")
    .select("pessoa_id,tipo,batido_em").in("pessoa_id", [...pessoaToColab.keys()])
    .gte("batido_em", inicioDiaSp).order("batido_em", { ascending: true });
  const ultima = new Map<string, string>();   // pessoa_id → tipo da ÚLTIMA batida de hoje
  for (const r of (regs ?? []) as { pessoa_id: string; tipo: string }[]) ultima.set(r.pessoa_id, r.tipo);
  for (const [pessoaId, tipo] of ultima) {
    if (INICIA.has(tipo as TipoBatida)) { const c = pessoaToColab.get(pessoaId); if (c) out.presentes.add(c); }
  }
  return out;
}

// ── Pessoas ──────────────────────────────────────────────────────────────────
export async function listPessoas(incluirInativas = false): Promise<PontoPessoa[]> {
  const db = createSupabaseAdminClient();
  const buscar = async (cols: string) => {
    let q = db.from("ponto_pessoas").select(cols).order("nome");
    if (!incluirInativas) q = q.eq("ativo", true);
    return q;
  };
  let { data, error } = await buscar(COLS_ESTAG);
  if (error && colunaAusente(error.message)) ({ data, error } = await buscar(COLS_TURNO));  // sem estagiario
  if (error && colunaAusente(error.message)) ({ data, error } = await buscar(COLS));      // sem almoço/turno
  if (error && colunaAusente(error.message)) ({ data, error } = await buscar(COLS_SAB));  // sem sabado_min
  if (error && colunaAusente(error.message)) ({ data, error } = await buscar(COLS_V3));   // sem trabalha_sabado
  if (error && colunaAusente(error.message)) ({ data, error } = await buscar(COLS_V2));   // sem jornada
  if (error && colunaAusente(error.message)) ({ data, error } = await buscar(COLS_V1));   // pré-v2
  if (error) lancar(error.message);
  return ((data ?? []) as unknown as PessoaRow[]).map(pessoaDeRow);
}

export async function criarPessoa(input: { nome: string; colaboradorId?: string | null; fotoUrl?: string | null; fotos?: string[]; pin?: string | null; consentimento?: boolean; jornadaMin?: number | null; entradaPrevista?: string | null; saidaPrevista?: string | null }): Promise<PontoPessoa> {
  const db = createSupabaseAdminClient();
  const base: Record<string, unknown> = {
    nome: input.nome.trim(),
    colaborador_id: input.colaboradorId || null,
    foto_url: input.fotoUrl || null,
    fotos: input.fotos ?? [],
  };
  // Consentimento de biometria é coberto pelo contrato de trabalho → true por padrão.
  const v2 = { ...base, pin_hash: input.pin?.trim() ? hashPin(input.pin) : null, consentimento: input.consentimento ?? true };
  const v3 = { ...v2, jornada_min: input.jornadaMin ?? null, entrada_prevista: input.entradaPrevista ?? null, saida_prevista: input.saidaPrevista ?? null };
  let { data, error } = await db.from("ponto_pessoas").insert(v3).select(COLS).single();
  if (error && colunaAusente(error.message)) ({ data, error } = await db.from("ponto_pessoas").insert(v2).select(COLS_V2).single());   // sem jornada
  if (error && colunaAusente(error.message)) ({ data, error } = await db.from("ponto_pessoas").insert(base).select(COLS_V1).single());   // pré-v2
  if (error) lancar(error.message);
  return pessoaDeRow(data as unknown as PessoaRow);
}

// Retorna os campos DESCARTADOS por coluna ausente (SQL pendente) — o chamador
// avisa o admin em vez de fingir sucesso (toggle de sábado "salvo" que não
// persistia deixava o sábado como folga e o banco creditava as horas).
export async function atualizarPessoa(id: string, patch: { nome?: string; colaboradorId?: string | null; fotoUrl?: string | null; fotos?: string[]; ativo?: boolean; pin?: string | null; consentimento?: boolean; jornadaMin?: number | null; trabalhaSabado?: boolean; sabadoMin?: number | null; entradaPrevista?: string | null; saidaPrevista?: string | null; almocoInicio?: string | null; almocoFim?: string | null; turnoId?: string | null; estagiario?: boolean }): Promise<{ descartados: string[] }> {
  const db = createSupabaseAdminClient();
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.nome !== undefined) upd.nome = patch.nome.trim();
  if (patch.colaboradorId !== undefined) upd.colaborador_id = patch.colaboradorId;
  if (patch.fotoUrl !== undefined) upd.foto_url = patch.fotoUrl;
  if (patch.fotos !== undefined) upd.fotos = patch.fotos;
  if (patch.ativo !== undefined) upd.ativo = patch.ativo;
  // pin: undefined = não mexe · "" = remove · valor = define novo
  if (patch.pin !== undefined) upd.pin_hash = patch.pin?.trim() ? hashPin(patch.pin) : null;
  if (patch.consentimento !== undefined) upd.consentimento = patch.consentimento;
  if (patch.jornadaMin !== undefined) upd.jornada_min = patch.jornadaMin;
  if (patch.trabalhaSabado !== undefined) upd.trabalha_sabado = patch.trabalhaSabado;
  if (patch.sabadoMin !== undefined) upd.sabado_min = patch.sabadoMin;
  if (patch.entradaPrevista !== undefined) upd.entrada_prevista = patch.entradaPrevista;
  if (patch.saidaPrevista !== undefined) upd.saida_prevista = patch.saidaPrevista;
  if (patch.almocoInicio !== undefined) upd.almoco_inicio = patch.almocoInicio;
  if (patch.almocoFim !== undefined) upd.almoco_fim = patch.almocoFim;
  if (patch.turnoId !== undefined) upd.turno_id = patch.turnoId;
  if (patch.estagiario !== undefined) upd.estagiario = patch.estagiario;
  // Grava; se faltar alguma coluna (SQL pendente), remove só ela e tenta de novo —
  // mas REGISTRA o que foi descartado pra avisar (nunca fingir que salvou).
  const descartados: string[] = [];
  const descartar = (k: string) => { if (k in upd) { delete upd[k]; descartados.push(k); } };
  let error = (await db.from("ponto_pessoas").update(upd).eq("id", id)).error;
  for (let i = 0; i < 4 && error && colunaAusente(error.message); i++) {
    const m = /'([^']+)' column/.exec(error.message);
    if (m && m[1] in upd) descartar(m[1]);
    else { descartar("estagiario"); descartar("almoco_inicio"); descartar("almoco_fim"); descartar("turno_id"); descartar("sabado_min"); descartar("trabalha_sabado"); descartar("jornada_min"); descartar("entrada_prevista"); descartar("saida_prevista"); }
    error = (await db.from("ponto_pessoas").update(upd).eq("id", id)).error;
  }
  if (error && colunaAusente(error.message)) {
    descartar("pin_hash"); descartar("consentimento");   // pré-v2
    ({ error } = await db.from("ponto_pessoas").update(upd).eq("id", id));
  }
  if (error) lancar(error.message);
  return { descartados };
}

export async function removerPessoa(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("ponto_pessoas").delete().eq("id", id);
  if (error) lancar(error.message);
}

// Gera uma pessoa de ponto pra CADA usuário ativo do sistema (profiles.active),
// vinculada por colaborador_id (faz o banco de horas funcionar). Idempotente:
// pula quem já tem; se já existe uma pessoa com o mesmo nome sem vínculo, só
// vincula. Ignora contas de sistema/teste (sem erp_user_id E sem foto).
export async function gerarPontoDosAtivos(): Promise<{ criados: string[]; vinculados: string[]; jaTinham: number; ignorados: number }> {
  const db = createSupabaseAdminClient();
  const { data: profs, error } = await db
    .from("profiles")
    .select("id,name,active,employees(photo_url,erp_user_id)")
    .eq("active", true);
  if (error) lancar(error.message);

  const pessoas = await listPessoas(true);
  const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
  const jaVinculado = new Set(pessoas.filter((p) => p.colaboradorId).map((p) => p.colaboradorId));
  const porNome = new Map(pessoas.map((p) => [norm(p.nome), p]));

  const criados: string[] = []; const vinculados: string[] = []; let jaTinham = 0; let ignorados = 0;
  type Row = { id: string; name: string | null; employees: { photo_url: string | null; erp_user_id: string | null } | { photo_url: string | null; erp_user_id: string | null }[] | null };
  for (const p of (profs ?? []) as Row[]) {
    const emp = Array.isArray(p.employees) ? p.employees[0] : p.employees;
    const foto = emp?.photo_url ?? null;
    const funcionarioReal = !!emp?.erp_user_id || !!foto;   // exclui admin/tablet/teste
    const nome = (p.name || "").trim();
    if (!funcionarioReal || !nome) { ignorados++; continue; }
    if (jaVinculado.has(p.id)) { jaTinham++; continue; }
    const existente = porNome.get(norm(nome));
    if (existente && !existente.colaboradorId) {
      await atualizarPessoa(existente.id, { colaboradorId: p.id, fotoUrl: existente.fotoUrl ?? foto });
      vinculados.push(nome); continue;
    }
    await criarPessoa({ nome, colaboradorId: p.id, fotoUrl: foto ?? undefined });
    criados.push(nome);
  }
  return { criados, vinculados, jaTinham, ignorados };
}

// ── Ajuste manual de horas (banco de horas) ──────────────────────────────────
// Soma/tira minutos de uma pessoa num dia (correção do admin, sem mexer nas
// batidas). +crédito / −débito. Tolerante: sem a tabela, tudo vira vazio/no-op.
export interface PontoAjuste { id: string; pessoaId: string; dia: string; minutos: number; motivo: string | null; autorNome: string | null; createdAt: string }

export async function listAjustes(pessoaId: string | null, desde: string): Promise<PontoAjuste[]> {
  const db = createSupabaseAdminClient();
  let q = db.from("ponto_ajustes").select("id,pessoa_id,dia,minutos,motivo,autor_nome,created_at").gte("dia", desde).order("dia", { ascending: false });
  if (pessoaId) q = q.eq("pessoa_id", pessoaId);
  const { data, error } = await q;
  if (error) return [];
  return ((data ?? []) as { id: string; pessoa_id: string; dia: string; minutos: number; motivo: string | null; autor_nome: string | null; created_at: string }[])
    .map((r) => ({ id: r.id, pessoaId: r.pessoa_id, dia: r.dia, minutos: r.minutos, motivo: r.motivo ?? null, autorNome: r.autor_nome ?? null, createdAt: r.created_at }));
}
export async function addAjuste(input: { pessoaId: string; dia: string; minutos: number; motivo?: string | null; autorId?: string | null; autorNome?: string | null }): Promise<PontoAjuste | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("ponto_ajustes")
    .insert({ pessoa_id: input.pessoaId, dia: input.dia, minutos: Math.round(input.minutos), motivo: input.motivo ?? null, autor_id: input.autorId ?? null, autor_nome: input.autorNome ?? null })
    .select("id,pessoa_id,dia,minutos,motivo,autor_nome,created_at").single();
  if (error || !data) return null;
  return { id: data.id as string, pessoaId: data.pessoa_id as string, dia: data.dia as string, minutos: data.minutos as number, motivo: (data.motivo as string) ?? null, autorNome: (data.autor_nome as string) ?? null, createdAt: data.created_at as string };
}
export async function removeAjuste(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  await db.from("ponto_ajustes").delete().eq("id", id);
}

// ── Pagamento de horas a favor ───────────────────────────────────────────────
// A empresa pagou em dinheiro as horas que a pessoa tinha a mais: elas saem do
// banco (consomem o crédito mais antigo primeiro) e não voltam. Diferente do
// ajuste manual: aqui `minutos` é SEMPRE positivo e nunca vira dívida.
// Tolerante: sem a tabela (ponto_pagamentos.sql não rodado), tudo vira vazio/no-op.
// `periodoDe`/`periodoAte` = a JANELA que o pagamento quita. Pagar "julho" com
// crédito de junho ainda em aberto tem que consumir julho, não o mais antigo —
// senão o recibo diz uma coisa e o banco faz outra. Nulo = o comportamento
// antigo (o mais antigo primeiro, sem janela), que é o que os pagamentos já
// gravados continuam sendo.
export interface PontoPagamento { id: string; pessoaId: string; dia: string; minutos: number; observacao: string | null; autorNome: string | null; createdAt: string; periodoDe: string | null; periodoAte: string | null }

// As colunas de janela chegaram depois. Enquanto o SQL não roda, o `select`
// delas devolve erro — então a leitura cai pro conjunto antigo em vez de a tela
// inteira ficar sem histórico de pagamento.
const COLS_PAG = "id,pessoa_id,dia,minutos,observacao,autor_nome,created_at";
const COLS_PAG_PERIODO = `${COLS_PAG},periodo_de,periodo_ate`;
type LinhaPag = { id: string; pessoa_id: string; dia: string; minutos: number; observacao: string | null; autor_nome: string | null; created_at: string; periodo_de?: string | null; periodo_ate?: string | null };
const daLinha = (r: LinhaPag): PontoPagamento => ({
  id: r.id, pessoaId: r.pessoa_id, dia: r.dia, minutos: r.minutos,
  observacao: r.observacao ?? null, autorNome: r.autor_nome ?? null, createdAt: r.created_at,
  periodoDe: r.periodo_de ?? null, periodoAte: r.periodo_ate ?? null,
});

export async function listPagamentos(pessoaId: string | null, desde: string): Promise<PontoPagamento[]> {
  const db = createSupabaseAdminClient();
  const busca = (cols: string) => {
    let q = db.from("ponto_pagamentos").select(cols).gte("dia", desde).order("dia", { ascending: false }).limit(500);
    if (pessoaId) q = q.eq("pessoa_id", pessoaId);
    return q;
  };
  let { data, error } = await busca(COLS_PAG_PERIODO);
  if (error) ({ data, error } = await busca(COLS_PAG));
  if (error) return [];
  return ((data ?? []) as unknown as LinhaPag[]).map(daLinha);
}
export async function addPagamento(input: { pessoaId: string; dia: string; minutos: number; observacao?: string | null; autorId?: string | null; autorNome?: string | null; periodoDe?: string | null; periodoAte?: string | null }): Promise<PontoPagamento | null> {
  const db = createSupabaseAdminClient();
  const base = { pessoa_id: input.pessoaId, dia: input.dia, minutos: Math.round(input.minutos), observacao: input.observacao ?? null, autor_id: input.autorId ?? null, autor_nome: input.autorNome ?? null };
  const gravar = (linha: Record<string, unknown>, cols: string) =>
    db.from("ponto_pagamentos").insert(linha).select(cols).single();
  let { data, error } = await gravar({ ...base, periodo_de: input.periodoDe ?? null, periodo_ate: input.periodoAte ?? null }, COLS_PAG_PERIODO);
  // Sem as colunas: grava o pagamento assim mesmo. Perder a janela é ruim;
  // perder o pagamento (e o admin achar que pagou) é pior.
  if (error) ({ data, error } = await gravar(base, COLS_PAG));
  if (error || !data) return null;
  return daLinha(data as unknown as LinhaPag);
}
export async function removePagamento(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  await db.from("ponto_pagamentos").delete().eq("id", id);
}

// ── Feriados (folga pra todo mundo, em dois sabores) ─────────────────────────
// `tipo` decide o que vale a hora de quem TRABALHA no feriado: "folga" (o
// padrão) gera extra ESPECIAL, com adicional; "troca" gera extra COMUM, porque
// aquele dia vai ser devolvido em folga. Ver `jornada-calendario.ts`.
export interface Feriado { dia: string; descricao: string | null; tipo: TipoFeriado }
// Último dia REAL do mês. `${mes}-31` não existe em mês de 30 dias (nem em
// fevereiro): o Postgres recusa a consulta inteira e a leitura tolerante
// devolvia lista vazia — feriado de setembro sumia da tela.
const fimDoMes = (mes: string) => diasDoMes(mes).at(-1)!;

// Tolerante: sem a tabela (ponto_feriados.sql não rodado) → lista vazia. Sem a
// COLUNA tipo (ponto_feriados_tipo.sql não rodado) → tudo "folga", como era.
/** `mes` = "YYYY-MM" (o mês inteiro) ou um intervalo {de, ate} de dias. */
export async function listFeriados(mes?: string | { de: string; ate: string }): Promise<Feriado[]> {
  const db = createSupabaseAdminClient();
  const busca = (cols: string) => {
    let q = db.from("ponto_feriados").select(cols).order("dia");
    if (typeof mes === "string") q = q.gte("dia", `${mes}-01`).lte("dia", fimDoMes(mes));
    else if (mes) q = q.gte("dia", mes.de).lte("dia", mes.ate);
    return q;
  };
  let { data, error } = await busca("dia,descricao,tipo");
  if (error && colunaAusente(error.message)) ({ data, error } = await busca("dia,descricao"));
  if (error) return [];
  return ((data ?? []) as unknown as { dia: string; descricao: string | null; tipo?: string | null }[])
    .map((r) => ({ dia: r.dia, descricao: r.descricao ?? null, tipo: r.tipo === "troca" ? "troca" : "folga" }));
}
export async function addFeriado(dia: string, descricao: string | null, tipo: TipoFeriado = "folga"): Promise<void> {
  const db = createSupabaseAdminClient();
  let { error } = await db.from("ponto_feriados").upsert({ dia, descricao, tipo }, { onConflict: "dia" });
  // Coluna ainda não criada: grava o feriado do jeito antigo em vez de falhar —
  // o dia continua sendo folga de todo mundo, só sem a distinção de tipo.
  if (error && colunaAusente(error.message)) ({ error } = await db.from("ponto_feriados").upsert({ dia, descricao }, { onConflict: "dia" }));
  if (error) lancar(error.message);
}
/** Mapa dia → tipo, do jeito que os cálculos consomem. Tolerante a tudo. */
export async function feriadosMapa(mes?: string | { de: string; ate: string }): Promise<Map<string, TipoFeriado>> {
  try { return new Map((await listFeriados(mes)).map((f) => [f.dia, f.tipo])); } catch { return new Map(); }
}
export async function removeFeriado(dia: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("ponto_feriados").delete().eq("dia", dia);
  if (error) lancar(error.message);
}

// ── Justificativas (o motivo de um dia — e de quanto dele) ───────────────────
// Vocabulário em `lib/ponto-justificativas.ts` (puro, vai pro cliente também).
// Aqui mora só o acesso ao banco.
//
// Uma pessoa pode ter VÁRIAS justificativas no mesmo dia (saiu 1h de manhã pro
// dentista e 1h à tarde pro banco). O `unique (pessoa_id, dia)` antigo obrigava
// a escolher qual dos dois registrar — `ponto_justificativas_v2.sql` o derruba.
export interface Justificativa {
  id: string;
  pessoaId: string;
  dia: string;
  motivo: string | null;
  /** LEGADO — mantido em sincronia com `efeito`. O cálculo lê `efeito`. */
  abona: boolean;
  /** Campos da v2. Opcionais de propósito: registro antigo (e teste antigo)
   *  continua válido, e `efeitoDa`/`justificativaVale` dão o significado. */
  tipo?: TipoJustificativa;
  efeito?: EfeitoJustificativa;
  status?: StatusJustificativa;
  horaDe?: string | null;
  horaAte?: string | null;
  minutos?: number | null;
  arquivo?: string | null;
  arquivoNome?: string | null;
  solicitadoPor?: string | null;
  decididoPor?: string | null;
  decididoEm?: string | null;
  decisaoMotivo?: string | null;
  criadoEm?: string | null;
}

const tabelaJustAusente = (msg: string | undefined) => ausente(msg) || /ponto_justificativas/.test(msg || "");

// Colunas da v2 e o plano B. O SQL pode não ter rodado ainda (é o modo de vida
// deste módulo inteiro): sem o fallback, uma coluna faltando devolveria lista
// VAZIA e todo dia justificado do histórico viraria falta na tela — o defeito
// mais caro possível, causado justamente pela melhoria.
const COLS_JUST_V2 =
  "id,pessoa_id,dia,motivo,abona,tipo,efeito,status,hora_de,hora_ate,minutos,arquivo,arquivo_nome,solicitado_por,decidido_por,decidido_em,decisao_motivo,created_at";
const COLS_JUST_V1 = "id,pessoa_id,dia,motivo,abona";

type LinhaJust = {
  id: string; pessoa_id: string; dia: string; motivo: string | null; abona: boolean;
  tipo?: string | null; efeito?: string | null; status?: string | null;
  hora_de?: string | null; hora_ate?: string | null; minutos?: number | null;
  arquivo?: string | null; arquivo_nome?: string | null;
  solicitado_por?: string | null; decidido_por?: string | null;
  decidido_em?: string | null; decisao_motivo?: string | null; created_at?: string | null;
};

const justDaLinha = (r: LinhaJust): Justificativa => ({
  id: r.id,
  pessoaId: r.pessoa_id,
  dia: r.dia,
  motivo: r.motivo ?? null,
  abona: r.abona !== false,
  tipo: ehTipoJustificativa(r.tipo) ? r.tipo : "outro",
  // Linha da v1 (sem `efeito`) fala a língua nova pelo booleano que ela tem.
  efeito: ehEfeitoJustificativa(r.efeito) ? r.efeito : r.abona === false ? "compensar" : "abona",
  status: ehStatusJustificativa(r.status) ? r.status : "aprovada",
  horaDe: r.hora_de ? String(r.hora_de).slice(0, 5) : null,
  horaAte: r.hora_ate ? String(r.hora_ate).slice(0, 5) : null,
  minutos: typeof r.minutos === "number" ? r.minutos : null,
  arquivo: r.arquivo ?? null,
  arquivoNome: r.arquivo_nome ?? null,
  solicitadoPor: r.solicitado_por ?? null,
  decididoPor: r.decidido_por ?? null,
  decididoEm: r.decidido_em ?? null,
  decisaoMotivo: r.decisao_motivo ?? null,
  criadoEm: r.created_at ?? null,
});

/** Roda a consulta com as colunas da v2 e, se elas não existirem, com as da v1. */
async function buscarJust(
  montar: (cols: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Justificativa[]> {
  const { data, error } = await montar(COLS_JUST_V2);
  if (!error) return ((data ?? []) as LinhaJust[]).map(justDaLinha);
  const { data: d1, error: e1 } = await montar(COLS_JUST_V1);
  if (e1) return [];
  return ((d1 ?? []) as LinhaJust[]).map(justDaLinha);
}

/** Justificativas de um mês (todas as pessoas) ou de uma pessoa. Tolerante. */
export async function listJustificativas(
  opts: { mes?: string; pessoaId?: string | null; status?: StatusJustificativa } = {},
): Promise<Justificativa[]> {
  const db = createSupabaseAdminClient();
  return buscarJust((cols) => {
    let q = db.from("ponto_justificativas").select(cols).order("dia").limit(2000);
    if (opts.mes) q = q.gte("dia", `${opts.mes}-01`).lte("dia", fimDoMes(opts.mes));
    if (opts.pessoaId) q = q.eq("pessoa_id", opts.pessoaId);
    if (opts.status) q = q.eq("status", opts.status);
    return q;
  });
}

/** Desde uma data (p/ o ledger corrido). Tolerante. */
export async function listJustificativasDesde(pessoaId: string | null, desde: string): Promise<Justificativa[]> {
  const db = createSupabaseAdminClient();
  return buscarJust((cols) => {
    let q = db.from("ponto_justificativas").select(cols).gte("dia", desde).order("dia").limit(5000);
    if (pessoaId) q = q.eq("pessoa_id", pessoaId);
    return q;
  });
}

/** Uma só, pelo id. `null` quando não existe. */
export async function acharJustificativa(id: string): Promise<Justificativa | null> {
  const db = createSupabaseAdminClient();
  const lista = await buscarJust((cols) => db.from("ponto_justificativas").select(cols).eq("id", id).limit(1));
  return lista[0] ?? null;
}

/** A fila do gestor: quem está esperando decisão, mais recente primeiro. */
export async function listJustificativasPendentes(limite = 100): Promise<Justificativa[]> {
  const db = createSupabaseAdminClient();
  return buscarJust((cols) =>
    db.from("ponto_justificativas").select(cols).eq("status", "pendente").order("dia", { ascending: false }).limit(limite));
}

export interface EntradaJustificativa {
  pessoaId: string;
  dia: string;
  motivo: string | null;
  tipo: TipoJustificativa;
  efeito: EfeitoJustificativa;
  status: StatusJustificativa;
  horaDe?: string | null;
  horaAte?: string | null;
  minutos?: number | null;
  arquivo?: string | null;
  arquivoNome?: string | null;
  solicitadoPor?: string | null;
  decididoPor?: string | null;
  createdBy?: string | null;
}

// `abona` sai daqui em sincronia com `efeito` e nunca é digitado à mão. Duas
// colunas dizendo a mesma coisa é como elas divergem; enquanto a v1 existir em
// algum banco, quem manda é `efeito` e o booleano é sombra dele.
const sombraDoEfeito = (e: EfeitoJustificativa) => e === "abona";

function corpoDaJust(j: EntradaJustificativa) {
  return {
    pessoa_id: j.pessoaId,
    dia: j.dia,
    motivo: j.motivo,
    abona: sombraDoEfeito(j.efeito),
    tipo: j.tipo,
    efeito: j.efeito,
    status: j.status,
    hora_de: j.horaDe || null,
    hora_ate: j.horaAte || null,
    minutos: typeof j.minutos === "number" && j.minutos > 0 ? Math.round(j.minutos) : null,
    arquivo: j.arquivo || null,
    arquivo_nome: j.arquivoNome || null,
    solicitado_por: j.solicitadoPor ?? null,
    decidido_por: j.decididoPor ?? null,
    decidido_em: j.status === "aprovada" || j.status === "recusada" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

/** Cria uma justificativa. Devolve o id. */
export async function criarJustificativa(j: EntradaJustificativa): Promise<string> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("ponto_justificativas")
    .insert({ ...corpoDaJust(j), created_by: j.createdBy ?? null })
    .select("id").maybeSingle();
  if (error) { if (tabelaJustAusente(error.message)) throw new TabelaAusenteError(); throw new Error(error.message); }
  return (data as { id: string } | null)?.id ?? "";
}

/** Altera uma justificativa que já existe. */
export async function atualizarJustificativa(id: string, j: EntradaJustificativa): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("ponto_justificativas").update(corpoDaJust(j)).eq("id", id);
  if (error) { if (tabelaJustAusente(error.message)) throw new TabelaAusenteError(); throw new Error(error.message); }
}

/** Aprova ou recusa um pedido. É o único caminho que faz o registro valer. */
export async function decidirJustificativa(
  id: string,
  status: Extract<StatusJustificativa, "aprovada" | "recusada">,
  quem: string,
  porque?: string | null,
): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("ponto_justificativas")
    .update({
      status, decidido_por: quem, decidido_em: new Date().toISOString(),
      decisao_motivo: porque || null, updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) { if (tabelaJustAusente(error.message)) throw new TabelaAusenteError(); throw new Error(error.message); }
}

export async function removerJustificativa(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("ponto_justificativas").delete().eq("id", id);
  if (error && !tabelaJustAusente(error.message)) throw new Error(error.message);
}

/** A pessoa do ponto ligada a este login (`ponto_pessoas.colaborador_id`). */
export async function pessoaDoColaborador(profileId: string): Promise<{ id: string; nome: string } | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("ponto_pessoas")
    .select("id,nome,ativo").eq("colaborador_id", profileId).limit(5);
  if (error) return null;
  const viva = ((data ?? []) as { id: string; nome: string; ativo: boolean }[]).find((p) => p.ativo !== false);
  return viva ? { id: viva.id, nome: viva.nome } : null;
}

/**
 * Esta pessoa pode reabrir ESTE anexo?
 *
 * A área `atestados` é de leitura restrita (RH e quem administra o ponto) —
 * documento de saúde não abre pra qualquer logado. Mas quem SUBIU o atestado
 * precisa poder conferir o que mandou, e ele não tem nenhuma dessas chaves.
 * A exceção é por DONO, não por link: a rota só libera quando a justificativa
 * que aponta pra esse arquivo é um pedido desta pessoa (ou do ponto dela).
 */
export async function donoDoAnexoDoPonto(arquivo: string, profileId: string): Promise<boolean> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("ponto_justificativas")
    .select("pessoa_id,solicitado_por").eq("arquivo", arquivo).limit(20);
  if (error || !data?.length) return false;
  const linhas = data as { pessoa_id: string; solicitado_por: string | null }[];
  if (linhas.some((l) => l.solicitado_por === profileId)) return true;
  const minha = await pessoaDoColaborador(profileId);
  return !!minha && linhas.some((l) => l.pessoa_id === minha.id);
}

// "Sete certinho": zera o mês e preenche batidas completas em cada DIA ÚTIL
// (respeita jornada + fim de semana + feriados), até hoje. Deixa saldo 0.
export async function preencherMesCerto(mes: string): Promise<{ pessoas: number; registros: number }> {
  const db = createSupabaseAdminClient();
  const [pessoas, feriadosList] = await Promise.all([listPessoas(false), listFeriados(mes)]);
  const feriados = new Set(feriadosList.map((f) => f.dia));
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const [y, m] = mes.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1, 3, 0, 0)).toISOString();
  const to = new Date(Date.UTC(y, m, 1, 3, 0, 0)).toISOString();
  const iso = (dia: string, min: number) => { const [yy, mm, dd] = dia.split("-").map(Number); return new Date(Date.UTC(yy, mm - 1, dd, Math.floor(min / 60) + 3, min % 60, 0)).toISOString(); };
  let totReg = 0;
  for (const p of pessoas) {
    const meta = p.jornadaMin && p.jornadaMin > 0 ? p.jornadaMin : 480;
    await db.from("ponto_registros").delete().eq("pessoa_id", p.id).gte("batido_em", from).lt("batido_em", to);
    const h1 = Math.ceil(meta / 2), h2 = meta - h1;
    const rows: Record<string, unknown>[] = [];
    for (const dia of diasDoMes(mes)) {
      if (dia > hoje) break;
      if (!ehDiaUtil(dia, feriados, p.trabalhaSabado)) continue;
      const entrada = 8 * 60, almoco = entrada + h1, retorno = almoco + 60, saida = retorno + h2;
      rows.push(
        { pessoa_id: p.id, tipo: "entrada", batido_em: iso(dia, entrada), origem: "manual" },
        { pessoa_id: p.id, tipo: "almoco", batido_em: iso(dia, almoco), origem: "manual" },
        { pessoa_id: p.id, tipo: "retorno", batido_em: iso(dia, retorno), origem: "manual" },
        { pessoa_id: p.id, tipo: "saida", batido_em: iso(dia, saida), origem: "manual" },
      );
    }
    if (rows.length) { const { error } = await db.from("ponto_registros").insert(rows); if (!error) totReg += rows.length; }
  }
  return { pessoas: pessoas.length, registros: totReg };
}

// ── Registros ────────────────────────────────────────────────────────────────
// Bate o ponto. Dedupe: se a MESMA pessoa bateu há < 2 min, devolve a batida
// existente (evita duplo clique / re-reconhecimento no tablet).
/**
 * Valida o carimbo que o tablet manda junto com a batida da fila offline.
 *
 * O relógio do tablet é do tablet: se ele estiver errado, o carimbo entra errado
 * no espelho de ponto e ninguém percebe. Por isso a janela é estreita — fora
 * dela devolve null e a batida volta a ser carimbada na chegada (o comportamento
 * antigo, errado só no horário, nunca numa data absurda).
 *
 *  - até 5min no futuro: tolera o desencontro normal de relógio;
 *  - até 48h no passado: cobre o fim de semana com o tablet sem rede;
 *  - qualquer coisa fora disso é relógio quebrado, não batida atrasada.
 */
export const JANELA_ATRASO_MS = 30 * 24 * 3600e3;   // fila offline pode ter até 30 dias

export function batidoEmValido(iso: unknown, agoraMs = Date.now()): string | null {
  if (typeof iso !== "string" || !iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  if (t > agoraMs + 5 * 60e3) return null;          // futuro
  // Janela larga de propósito. Com 48h, um tablet duas semanas sem internet (ou
  // com o app parado) tinha a fila inteira REDATADA pro instante da chegada — o
  // ponto "chegava" e mesmo assim ficava errado, que é pior que não chegar.
  // 30 dias cobre qualquer atraso real de fila; mais que isso é relógio quebrado.
  if (t < agoraMs - JANELA_ATRASO_MS) return null;   // velho demais
  return new Date(t).toISOString();
}

export async function baterPonto(input: {
  pessoaId: string;
  tipo?: TipoBatida | null;   // null → alterna sozinho pela última batida do dia
  selfieUrl?: string | null;
  confianca?: number | null;
  deviceId?: string | null;
  origem?: "tablet" | "manual";
  batidoEm?: string | null;   // instante REAL (ISO) — só a fila offline manda; ver batidoEmValido
  clientId?: string | null;   // id que o TABLET deu à batida — a chave da conferência fim-a-fim
  lat?: number | null;        // coordenada no instante da batida (supabase/ponto_localizacao.sql)
  lon?: number | null;
}): Promise<{ registro: PontoRegistro; pessoa: PontoPessoa; duplicada: boolean; hoje: { tipo: TipoBatida; batidoEm: string }[] }> {
  if (input.tipo && !TIPOS_BATIDA.includes(input.tipo)) throw new Error("tipo_invalido");
  const db = createSupabaseAdminClient();

  // Início do dia em SP (UTC-3) → ISO, p/ o histórico do dia.
  const inicioDiaSp = () => {
    const s = new Date(Date.now() - 3 * 3600 * 1000);
    return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 3, 0, 0)).toISOString();
  };
  const batidasDeHoje = async (): Promise<{ tipo: TipoBatida; batidoEm: string }[]> => {
    const { data } = await db.from("ponto_registros")
      .select("tipo,batido_em").eq("pessoa_id", input.pessoaId)
      .gte("batido_em", inicioDiaSp()).order("batido_em", { ascending: true });
    return ((data ?? []) as { tipo: string; batido_em: string }[]).map((r) => ({ tipo: r.tipo as TipoBatida, batidoEm: r.batido_em }));
  };

  let { data: pRow, error: pErr } = await db.from("ponto_pessoas")
    .select(COLS).eq("id", input.pessoaId).maybeSingle();
  if (pErr && colunaAusente(pErr.message)) ({ data: pRow, error: pErr } = await db.from("ponto_pessoas").select(COLS_V2).eq("id", input.pessoaId).maybeSingle());   // sem jornada
  if (pErr && colunaAusente(pErr.message)) ({ data: pRow, error: pErr } = await db.from("ponto_pessoas").select(COLS_V1).eq("id", input.pessoaId).maybeSingle());   // pré-v2
  if (pErr) lancar(pErr.message);
  if (!pRow) throw new Error("pessoa_nao_encontrada");
  const pessoa = pessoaDeRow(pRow as unknown as PessoaRow);
  // Desativar tira a pessoa do /sync, mas um tablet com a lista velha em cache
  // (ou a fila offline drenando depois) ainda mandaria batida dela. Quem decide
  // é o servidor: inativa não bate, no manual e no tablet.
  if (!pessoa.ativo && input.origem !== "manual") throw new Error("pessoa_inativa");

  // Última batida (p/ dedupe e p/ alternar entrada/saída).
  const { data: last } = await db.from("ponto_registros")
    .select("id,tipo,batido_em,selfie_url,confianca,origem")
    .eq("pessoa_id", input.pessoaId).order("batido_em", { ascending: false }).limit(1).maybeSingle();

  // Anti-duplo-toque de 15s. Compara com o instante DESTA batida, não com agora:
  // uma batida retroativa da fila chegando logo depois de uma online seria
  // engolida como "duplicada" mesmo tendo acontecido horas antes.
  const instante = input.batidoEm ? new Date(input.batidoEm).getTime() : Date.now();
  if (last && Math.abs(instante - new Date(last.batido_em as string).getTime()) < 15 * 1000) {
    return {
      duplicada: true, pessoa, hoje: await batidasDeHoje(),
      registro: { id: last.id as string, pessoaId: input.pessoaId, tipo: last.tipo as TipoBatida, batidoEm: last.batido_em as string, selfieUrl: (last.selfie_url as string) ?? null, confianca: (last.confianca as number) ?? null, origem: (last.origem as "tablet" | "manual") ?? "tablet" },
    };
  }

  // Insere a batida (tipo provisório) e RECLASSIFICA o dia inteiro: o tipo é
  // função pura da ordem dos horários (classificarDia). Assim a saída é sempre a
  // ÚLTIMA e as anteriores se reajustam sozinhas quando chega uma batida nova —
  // é o que resolve a "saída provisória". O input.tipo é ignorado no tablet: quem
  // manda é o sistema.
  const linhaBase = {
    pessoa_id: input.pessoaId,
    tipo: "entrada",                 // provisório — o recompute abaixo corrige
    // Sem carimbo do cliente cai no default now() do banco. Isso é o certo pra
    // batida online, e era o BUG da fila offline: um dia sem rede subia às 09:57
    // e 21 pessoas "entraram" no mesmo minuto. Ver batidoEmValido().
    ...(input.batidoEm ? { batido_em: input.batidoEm } : {}),
    selfie_url: input.selfieUrl || null,
    confianca: input.confianca ?? null,
    device_id: input.deviceId || null,
    origem: input.origem ?? "tablet",
  };
  // client_id e coordenada viajam juntos quando as colunas existem
  // (supabase/ponto_client_id.sql e ponto_localizacao.sql). Sem elas, grava do
  // jeito antigo — o extra é que se perde, nunca a batida.
  const extras = {
    ...(input.clientId ? { client_id: input.clientId } : {}),
    ...(typeof input.lat === "number" && typeof input.lon === "number" ? { lat: input.lat, lon: input.lon } : {}),
  };
  let { data: inserida, error } = await db.from("ponto_registros")
    .insert({ ...linhaBase, ...extras })
    .select("id,batido_em,selfie_url,confianca,origem").single();
  if (error && Object.keys(extras).length > 0 && colunaAusente(error.message)) {
    ({ data: inserida, error } = await db.from("ponto_registros").insert(linhaBase).select("id,batido_em,selfie_url,confianca,origem").single());
  }
  if (error) lancar(error.message);
  const novoId = inserida.id as string;

  // Recomputa os tipos do dia e atualiza só os que mudaram. A janela sai do dia
  // da BATIDA, não de hoje: com carimbo retroativo (fila offline virando a noite)
  // a janela de hoje não conteria o registro e ele ficaria "entrada" pra sempre.
  const ref = new Date(new Date(inserida.batido_em as string).getTime() - 3 * 3600e3);   // dia em SP
  const iniDia = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate(), 3, 0, 0)).toISOString();
  const fimDia = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + 1, 3, 0, 0)).toISOString();
  const { data: doDia } = await db.from("ponto_registros")
    .select("id,tipo,batido_em").eq("pessoa_id", input.pessoaId)
    .gte("batido_em", iniDia).lt("batido_em", fimDia).order("batido_em", { ascending: true });
  const linhas = (doDia ?? []) as { id: string; tipo: string; batido_em: string }[];
  // Contexto do dia DA BATIDA: a pessoa já está em mãos, só falta saber se o dia
  // é feriado — é a diferença entre "saiu pro almoço" e "foi embora".
  const diaSp = ref.toISOString().slice(0, 10);
  const { data: ferDia } = await db.from("ponto_feriados").select("dia").eq("dia", diaSp).maybeSingle();
  const tipos = classificarDia(linhas.map((l) => l.batido_em), {
    jornadaDiaMin: jornadaDoDia(diaSp, pessoa, new Set(ferDia ? [diaSp] : [])),
    almocoInicio: pessoa.almocoInicio,
  });
  await Promise.all(linhas.map(async (l, i) => {
    const alvo = tipos[i];
    if (l.tipo === alvo) return;
    const { error: eUp } = await db.from("ponto_registros").update({ tipo: alvo }).eq("id", l.id);
    if (!eUp) return;
    // CHECK antigo rejeita intervalo_* → grava o clássico em vez de deixar errado.
    const fb = CLASSICO[alvo];
    if (fb && fb !== l.tipo) await db.from("ponto_registros").update({ tipo: fb }).eq("id", l.id);
  }));
  const idxNovo = linhas.findIndex((l) => l.id === novoId);
  const tipoNovo: TipoBatida = idxNovo >= 0 ? tipos[idxNovo] : "entrada";
  const hoje = linhas.map((l, i) => ({ tipo: tipos[i], batidoEm: l.batido_em }));

  return {
    duplicada: false, pessoa, hoje,
    registro: { id: novoId, pessoaId: input.pessoaId, tipo: tipoNovo, batidoEm: inserida.batido_em as string, selfieUrl: (inserida.selfie_url as string) ?? null, confianca: (inserida.confianca as number) ?? null, origem: (inserida.origem as "tablet" | "manual") },
  };
}

// Última batida da pessoa (opcionalmente só a partir de `desdeIso`). Serve pra
// PROVAR que uma batida marcada como "já processada" existe de verdade antes de
// responder sucesso — sem isso a rota confirmava com um registro inventado.
/** Registro pelo client_id do tablet (conferência exata). null = não existe OU
 *  a coluna ainda não foi criada (aí quem chama cai no caminho tolerante). */
export async function registroPorClientId(clientId: string): Promise<{ id: string; tipo: TipoBatida; batidoEm: string } | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("ponto_registros")
    .select("id,tipo,batido_em").eq("client_id", clientId).limit(1).maybeSingle();
  if (error || !data) return null;
  return { id: data.id as string, tipo: data.tipo as TipoBatida, batidoEm: data.batido_em as string };
}

/** Quais desses client_ids JÁ viraram registro de verdade. `null` = a coluna
 *  client_id não existe ainda — impossível conferir (≠ "nenhum recebido"!). */
export async function clientIdsRecebidos(clientIds: string[]): Promise<string[] | null> {
  if (!clientIds.length) return [];
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("ponto_registros")
    .select("client_id").in("client_id", clientIds.slice(0, 300)).limit(300);
  if (error) return colunaAusente(error.message) ? null : [];
  return ((data ?? []) as { client_id: string }[]).map((r) => r.client_id);
}

export async function ultimaBatida(pessoaId: string, desdeIso?: string): Promise<PontoRegistro | null> {
  const db = createSupabaseAdminClient();
  let q = db.from("ponto_registros")
    .select("id,pessoa_id,tipo,batido_em,selfie_url,confianca,origem")
    .eq("pessoa_id", pessoaId).order("batido_em", { ascending: false }).limit(1);
  if (desdeIso) q = q.gte("batido_em", desdeIso);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  const r = data as { id: string; pessoa_id: string; tipo: string; batido_em: string; selfie_url: string | null; confianca: number | null; origem: string };
  return {
    id: r.id, pessoaId: r.pessoa_id, tipo: r.tipo as TipoBatida, batidoEm: r.batido_em,
    selfieUrl: r.selfie_url, confianca: r.confianca, origem: (r.origem as "tablet" | "manual") ?? "tablet",
  };
}

export async function listRegistros(opts: { from: string; to: string; pessoaId?: string | null }): Promise<PontoRegistro[]> {
  const db = createSupabaseAdminClient();
  let q = db.from("ponto_registros")
    .select("id,pessoa_id,tipo,batido_em,selfie_url,confianca,origem, ponto_pessoas(nome,foto_url)")
    .gte("batido_em", opts.from).lt("batido_em", opts.to)
    .order("batido_em", { ascending: false }).limit(2000);
  if (opts.pessoaId) q = q.eq("pessoa_id", opts.pessoaId);
  const { data, error } = await q;
  if (error) lancar(error.message);
  type Row = { id: string; pessoa_id: string; tipo: string; batido_em: string; selfie_url: string | null; confianca: number | null; origem: string; ponto_pessoas: { nome: string; foto_url: string | null } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id, pessoaId: r.pessoa_id, pessoaNome: r.ponto_pessoas?.nome, pessoaFoto: r.ponto_pessoas?.foto_url ?? null,
    tipo: r.tipo as TipoBatida, batidoEm: r.batido_em, selfieUrl: r.selfie_url, confianca: r.confianca,
    origem: (r.origem as "tablet" | "manual") ?? "tablet",
  }));
}

// Igual a listRegistros, mas PAGINADO (sem teto de 2000) — pro banco de horas
// corrido, que soma vários meses e ultrapassaria o limite de uma query só.
/**
 * Todas as batidas de um intervalo, em páginas.
 *
 * Duas coisas custam caro aqui, e as duas foram medidas: o banco de horas
 * inteiro leva 2,5 s porque isto lê CADA batida desde o início do banco.
 *
 * `leve` corta as colunas: quem calcula saldo (`lib/banco-horas`) só olha
 * pessoa, tipo e instante — nome e foto vêm por EMBED (um `join` por linha, e
 * o CLAUDE.md avisa que é o embed que pesa) e `selfie_url` é texto longo em
 * toda linha. Nada disso entra na conta do ledger.
 *
 * E as páginas saem em LOTE, não uma de cada vez: um mês e meio de ponto passa
 * de mil linhas, e o laço sequencial pagava uma ida inteira (250–700 ms daqui)
 * por página só para descobrir se havia a próxima. Quatro páginas em paralelo
 * cobrem 4.000 batidas numa espera só; a página que volta curta encerra o laço.
 */
export async function listRegistrosPaged(opts: { from: string; to: string; pessoaId?: string | null; leve?: boolean }): Promise<PontoRegistro[]> {
  const db = createSupabaseAdminClient();
  const out: PontoRegistro[] = [];
  const PAGE = 1000;
  const LOTE = 4;
  const COLS = opts.leve
    ? "pessoa_id,tipo,batido_em"
    : "id,pessoa_id,tipo,batido_em,selfie_url,confianca,origem, ponto_pessoas(nome,foto_url)";
  type Row = { id?: string; pessoa_id: string; tipo: string; batido_em: string; selfie_url?: string | null; confianca?: number | null; origem?: string; ponto_pessoas?: { nome: string; foto_url: string | null } | null };
  const pagina = async (offset: number): Promise<Row[]> => {
    let q = db.from("ponto_registros").select(COLS)
      .gte("batido_em", opts.from).lt("batido_em", opts.to)
      .order("batido_em", { ascending: true }).range(offset, offset + PAGE - 1);
    if (opts.pessoaId) q = q.eq("pessoa_id", opts.pessoaId);
    const { data, error } = await q;
    if (error) lancar(error.message);
    return (data ?? []) as unknown as Row[];
  };
  for (let offset = 0; ; offset += LOTE * PAGE) {
    const lote = await Promise.all(
      Array.from({ length: LOTE }, (_, i) => pagina(offset + i * PAGE)),
    );
    let acabou = false;
    for (const rows of lote) {
      for (const r of rows) out.push({
        id: r.id ?? "", pessoaId: r.pessoa_id, pessoaNome: r.ponto_pessoas?.nome, pessoaFoto: r.ponto_pessoas?.foto_url ?? null,
        tipo: r.tipo as TipoBatida, batidoEm: r.batido_em, selfieUrl: r.selfie_url ?? null, confianca: r.confianca ?? null,
        origem: (r.origem as "tablet" | "manual") ?? "tablet",
      });
      // Página curta = não há próxima. As irmãs deste lote já foram lidas na
      // ordem certa; as seguintes não existem.
      if (rows.length < PAGE) { acabou = true; break; }
    }
    if (acabou) break;
  }
  return out;
}

// Lançamento manual com data/hora escolhidas (correção pelo admin). dia=YYYY-MM-DD
// e hora=HH:MM em horário de SP (UTC-3) → grava o instante UTC certo. origem=manual.
// Reclassifica TODAS as batidas do dia da pessoa (tipo é função pura da ordem
// dos horários). Chamado depois de QUALQUER mudança no dia — bater, lançar
// manual ou apagar — senão o rótulo congela errado (ex.: duas "entradas"
// seguidas) e o painel/banco lê o dia torto.
// Se o CHECK antigo do banco rejeitar intervalo_inicio/intervalo_fim (falta rodar
// supabase/ponto_intervalos.sql), grava o equivalente CLÁSSICO em vez de deixar
// o tipo errado.
const CLASSICO: Partial<Record<TipoBatida, TipoBatida>> = { intervalo_inicio: "almoco", intervalo_fim: "retorno" };

// ── Contexto do dia da pessoa (pra classificar a batida) ─────────────────────
// Uma linha de pessoa + uma linha de feriado. É o que faz o sábado de meia
// jornada terminar em "saída" e não em "almoço" — ver `classificarDia`.
async function contextoDoDia(pessoaId: string, dia: string): Promise<ContextoJornada> {
  const db = createSupabaseAdminClient();
  const pes = async (cols: string) => db.from("ponto_pessoas").select(cols).eq("id", pessoaId).maybeSingle();
  let { data, error } = await pes("jornada_min,trabalha_sabado,sabado_min,almoco_inicio");
  if (error && colunaAusente(error.message)) ({ data, error } = await pes("jornada_min,trabalha_sabado,sabado_min"));
  if (error && colunaAusente(error.message)) ({ data, error } = await pes("jornada_min"));
  if (error || !data) return {};
  const p = data as unknown as { jornada_min?: number | null; trabalha_sabado?: boolean | null; sabado_min?: number | null; almoco_inicio?: string | null };
  // Uma linha só: `.eq(dia)` é a consulta mais barata que existe aqui, e é ela
  // que impede o feriado trabalhado de virar "em almoço" o dia inteiro.
  const { data: fer } = await db.from("ponto_feriados").select("dia").eq("dia", dia).maybeSingle();
  const feriados = new Set(fer ? [dia] : []);
  return {
    jornadaDiaMin: jornadaDoDia(dia, { jornadaMin: p.jornada_min, trabalhaSabado: p.trabalha_sabado, sabadoMin: p.sabado_min }, feriados),
    almocoInicio: p.almoco_inicio ?? null,
  };
}

export async function reclassificarDia(pessoaId: string, refIso: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const s = new Date(new Date(refIso).getTime() - 3 * 3600 * 1000);   // dia em SP
  const ini = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 3, 0, 0)).toISOString();
  const fim = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() + 1, 3, 0, 0)).toISOString();
  const { data } = await db.from("ponto_registros")
    .select("id,tipo,batido_em").eq("pessoa_id", pessoaId)
    .gte("batido_em", ini).lt("batido_em", fim).order("batido_em", { ascending: true });
  const linhas = (data ?? []) as { id: string; tipo: string; batido_em: string }[];
  if (!linhas.length) return;
  const tipos = classificarDia(linhas.map((l) => l.batido_em), await contextoDoDia(pessoaId, s.toISOString().slice(0, 10)));
  await Promise.all(linhas.map(async (l, i) => {
    const alvo = tipos[i];
    if (l.tipo === alvo) return;
    const { error } = await db.from("ponto_registros").update({ tipo: alvo }).eq("id", l.id);
    if (!error) return;
    const fb = CLASSICO[alvo];
    if (fb && fb !== l.tipo) await db.from("ponto_registros").update({ tipo: fb }).eq("id", l.id);
  }));
}

export async function lancarPontoManual(input: { pessoaId: string; tipo: TipoBatida; dia: string; hora: string; motivo?: string | null }): Promise<PontoRegistro> {
  if (!TIPOS_BATIDA.includes(input.tipo)) throw new Error("tipo_invalido");
  const [y, m, d] = (input.dia || "").split("-").map(Number);
  const [H, M] = (input.hora || "").split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(H) || Number.isNaN(M)) throw new Error("data_invalida");
  const batidoEm = new Date(Date.UTC(y, m - 1, d, H, M) + 3 * 3600 * 1000).toISOString();   // SP → UTC
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("ponto_registros").insert({
    pessoa_id: input.pessoaId, tipo: input.tipo, batido_em: batidoEm, origem: "manual",
  }).select("id,tipo,batido_em,selfie_url,confianca,origem").single();
  if (error) lancar(error.message);
  // Lançou no meio do dia → o dia inteiro se reajusta (entrada/almoço/retorno/saída).
  await reclassificarDia(input.pessoaId, data.batido_em as string);
  const { data: fresco } = await db.from("ponto_registros").select("tipo").eq("id", data.id as string).maybeSingle();
  return { id: data.id as string, pessoaId: input.pessoaId, tipo: ((fresco?.tipo as TipoBatida) ?? data.tipo) as TipoBatida, batidoEm: data.batido_em as string, selfieUrl: null, confianca: null, origem: "manual" };
}

// Lança o DIA INTEIRO de uma vez (entrada/almoço/retorno/saída, ou só o que a
// pessoa informou). Uma ida ao banco e UMA reclassificação — lançar batida por
// batida obrigava o admin a reabrir o formulário e reescolher pessoa/dia 4×.
// Os tipos entram por posição e o reclassificarDia acerta tudo no fim (inclusive
// a mistura com batidas que já existiam no dia).
export async function lancarDiaManual(input: { pessoaId: string; dia: string; horas: string[] }): Promise<number> {
  const horas = [...new Set(input.horas.filter((h) => /^\d{1,2}:\d{2}$/.test(h.trim())).map((h) => h.trim()))].sort();
  if (!horas.length) throw new Error("sem_horas");
  const [y, m, d] = (input.dia || "").split("-").map(Number);
  if (!y || !m || !d) throw new Error("data_invalida");
  const db = createSupabaseAdminClient();
  const linhas = horas.map((h, i) => {
    const [H, M] = h.split(":").map(Number);
    return {
      pessoa_id: input.pessoaId,
      // Palpite por posição; o reclassificarDia abaixo dá a palavra final.
      tipo: (["entrada", "almoco", "retorno", "saida"] as TipoBatida[])[Math.min(i, 3)],
      batido_em: new Date(Date.UTC(y, m - 1, d, H, M) + 3 * 3600 * 1000).toISOString(),
      origem: "manual" as const,
    };
  });
  const { error } = await db.from("ponto_registros").insert(linhas);
  if (error) lancar(error.message);
  await reclassificarDia(input.pessoaId, linhas[0].batido_em);
  return linhas.length;
}

// Corrige a HORA de uma batida que já existe (o admin só tinha "apagar e lançar
// de novo", que perdia a selfie e a origem da batida original).
export async function moverRegistro(id: string, dia: string, hora: string): Promise<PontoRegistro> {
  const [y, m, d] = (dia || "").split("-").map(Number);
  const [H, M] = (hora || "").split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(H) || Number.isNaN(M)) throw new Error("data_invalida");
  const batidoEm = new Date(Date.UTC(y, m - 1, d, H, M) + 3 * 3600 * 1000).toISOString();
  const db = createSupabaseAdminClient();
  const { data: antes } = await db.from("ponto_registros").select("pessoa_id,batido_em").eq("id", id).maybeSingle();
  if (!antes) throw new Error("registro_nao_encontrado");
  const velho = antes as { pessoa_id: string; batido_em: string };
  const { data, error } = await db.from("ponto_registros")
    .update({ batido_em: batidoEm }).eq("id", id)
    .select("id,pessoa_id,tipo,batido_em,selfie_url,confianca,origem").single();
  if (error) lancar(error.message);
  // Mudou de dia? Os DOIS dias precisam ser reclassificados — senão o dia de
  // origem fica com os rótulos congelados de quando a batida ainda estava lá.
  await reclassificarDia(velho.pessoa_id, batidoEm);
  const diaDe = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  if (diaDe(velho.batido_em) !== diaDe(batidoEm)) await reclassificarDia(velho.pessoa_id, velho.batido_em);
  const { data: fresco } = await db.from("ponto_registros").select("tipo").eq("id", id).maybeSingle();
  return {
    id, pessoaId: velho.pessoa_id,
    tipo: ((fresco?.tipo as TipoBatida) ?? data.tipo) as TipoBatida,
    batidoEm, selfieUrl: (data.selfie_url as string | null) ?? null,
    confianca: (data.confianca as number | null) ?? null,
    origem: (data.origem as "tablet" | "manual") ?? "manual",
  };
}

export async function removerRegistro(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  // Guarda pessoa/dia ANTES de apagar pra reclassificar o que sobrou (senão os
  // rótulos das outras batidas ficam congelados errados).
  const { data: alvo } = await db.from("ponto_registros").select("pessoa_id,batido_em").eq("id", id).maybeSingle();
  const { error } = await db.from("ponto_registros").delete().eq("id", id);
  if (error) lancar(error.message);
  const a = alvo as { pessoa_id: string; batido_em: string } | null;
  if (a) await reclassificarDia(a.pessoa_id, a.batido_em);
}

// ── Painel do gestor: quem está presente / em almoço / saiu / não bateu ──────
export type Situacao = "presente" | "almoco" | "saiu" | "ausente";
export interface StatusPessoa {
  id: string; nome: string; fotoUrl: string | null;
  situacao: Situacao;
  entrada: string | null;      // 1ª batida do dia
  ultima: string | null;       // última batida
  ultimoTipo: TipoBatida | null;
  // Horário previsto (turno) — é o que deixa o painel dizer "atrasado 20 min"
  // em vez de só "não bateu", que era a pergunta seguinte de todo mundo.
  entradaPrevista: string | null;   // "HH:MM"
  saidaPrevista: string | null;     // "HH:MM"
  batidas: number;                  // quantas batidas hoje (ímpar = em jornada)
  // POR QUE hoje não é dia de trabalho pra essa pessoa ("Férias", "Atestado",
  // "Folga compensatória", "Feriado"…). O painel mostra isto no lugar de
  // "Ausente" — a lista dizia "ausente" pra quem estava de férias.
  motivo?: string | null;
  // HOJE é dia de trabalho PRA ESSA PESSOA? Sábado de quem não trabalha sábado,
  // domingo e feriado são `false`. Sem isso o painel comparava o horário previsto
  // com o relógio em qualquer dia e acusava de ATRASADO quem estava de folga —
  // o previsto fica no cadastro, ele não sabe que dia é hoje.
  expediente: boolean;
}
export interface StatusHoje {
  pessoas: StatusPessoa[];
  // `ausentes` conta só quem DEVIA ter batido: quem está de folga sai daqui e
  // vai pro `folga` (um sábado inteiro de gente "ausente" não é informação).
  resumo: { presentes: number; almoco: number; saiu: number; ausentes: number; folga: number; total: number };
}

/**
 * O contexto do dia, quando quem chama já o tem.
 *
 * Vem de FORA de propósito: `lib/jornada/feriados-ponto.ts` importa este
 * arquivo (`listFeriados`), então importá-lo de volta aqui fecharia um ciclo.
 * Quem monta o contexto é a rota, que pode importar os dois.
 *
 * `motivoPorPessoa` é indexado pelo id da PESSOA DO PONTO (não pelo do
 * colaborador): a tradução acontece na rota, que conhece os dois lados.
 */
export interface ContextoDoPainel {
  feriados?: MapaDeFeriados;
  /** `pessoaId → motivo` ("Férias", "Atestado", "Folga compensatória"…). */
  motivoPorPessoa?: Map<string, string>;
  /** `pessoaId` de quem não tem expediente hoje por afastamento ou folga. */
  semExpediente?: Set<string>;
}

type MapaDeFeriados = { has(dia: string): boolean };

export async function statusHoje(ctx: ContextoDoPainel = {}): Promise<StatusHoje> {
  const db = createSupabaseAdminClient();
  // Início do dia SP (UTC-3).
  const s = new Date(Date.now() - 3 * 3600 * 1000);
  const hoje = s.toISOString().slice(0, 10);
  const inicio = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 3, 0, 0)).toISOString();

  // Feriado é folga pra todo mundo; sábado depende do cadastro de cada pessoa.
  // Tolerante: sem a tabela de feriados o painel continua de pé (listFeriados
  // já devolve lista vazia), só perde o "hoje é feriado".
  const [pessoas, feriadosList] = await Promise.all([listPessoas(false), listFeriados(hoje.slice(0, 7))]);
  // O mapa de quem chama vence: ele funde o Calendário do RH com o
  // `ponto_feriados`, e é o que faz o 7 de Setembro contar como folga aqui.
  const feriados = ctx.feriados ?? new Set(feriadosList.map((f) => f.dia));
  const { data, error } = await db.from("ponto_registros")
    .select("pessoa_id,tipo,batido_em").gte("batido_em", inicio).order("batido_em", { ascending: true });
  if (error) lancar(error.message);
  const rows = (data ?? []) as { pessoa_id: string; tipo: string; batido_em: string }[];

  const porPessoa = new Map<string, { tipo: string; batido_em: string }[]>();
  for (const r of rows) { const a = porPessoa.get(r.pessoa_id) ?? []; a.push(r); porPessoa.set(r.pessoa_id, a); }

  const lista: StatusPessoa[] = pessoas.map((p) => {
    const b = porPessoa.get(p.id) ?? [];
    // Férias e atestado tiram o expediente do dia tanto quanto o domingo: sem
    // isso, quem está na praia aparece "Ausente" no painel todo dia.
    const expediente = ehDiaUtil(hoje, feriados, p.trabalhaSabado) && !ctx.semExpediente?.has(p.id);
    const motivo = ctx.motivoPorPessoa?.get(p.id) ?? null;
    const prev = { entradaPrevista: p.entradaPrevista, saidaPrevista: p.saidaPrevista, expediente, motivo };
    if (b.length === 0) return { id: p.id, nome: p.nome, fotoUrl: p.fotoUrl, situacao: "ausente", entrada: null, ultima: null, ultimoTipo: null, ...prev, batidas: 0 };
    const ultimo = b[b.length - 1];
    const t = ultimo.tipo as TipoBatida;
    const situacao: Situacao = t === "almoco" ? "almoco" : t === "saida" ? "saiu" : "presente";
    return { id: p.id, nome: p.nome, fotoUrl: p.fotoUrl, situacao, entrada: b[0].batido_em, ultima: ultimo.batido_em, ultimoTipo: t, ...prev, batidas: b.length };
  });

  const folga = lista.filter((x) => x.situacao === "ausente" && !x.expediente);
  const resumo = {
    presentes: lista.filter((x) => x.situacao === "presente").length,
    almoco: lista.filter((x) => x.situacao === "almoco").length,
    saiu: lista.filter((x) => x.situacao === "saiu").length,
    ausentes: lista.filter((x) => x.situacao === "ausente" && x.expediente).length,
    folga: folga.length,
    total: lista.length,
  };
  return { pessoas: lista, resumo };
}

// ── Limpeza das selfies de auditoria ─────────────────────────────────────────
// Apaga a FOTO (storage + selfie_url) das batidas antigas — mantém o REGISTRO da
// batida pra sempre (folha de pagamento). Regra: por pessoa, guarda no máx. as
// MAX_SELFIES mais recentes E nada com mais de DIAS_SELFIE dias. NÃO toca em
// foto de perfil nem fotos de cadastro (essas não estão em ponto_registros).
const MAX_SELFIES = 100;
const DIAS_SELFIE = 45;

// Extrai o caminho dentro do bucket 'photos' de uma URL pública do Supabase.
function pathDoBucket(url: string): string | null {
  const m = url.match(/\/photos\/(.+)$/);
  return m ? m[1] : null;
}

export async function limparSelfies(): Promise<{ ok: boolean; apagadas: number }> {
  const db = createSupabaseAdminClient();
  const corte = new Date(Date.now() - DIAS_SELFIE * 864e5).toISOString();
  // Só linhas com foto. Mais recente primeiro (p/ o corte por quantidade).
  const { data, error } = await db.from("ponto_registros")
    .select("id,pessoa_id,batido_em,selfie_url")
    .not("selfie_url", "is", null)
    .order("batido_em", { ascending: false });
  if (error) return { ok: false, apagadas: 0 };

  type Row = { id: string; pessoa_id: string; batido_em: string; selfie_url: string };
  const rows = (data ?? []) as Row[];
  const contagem = new Map<string, number>();
  const idsParaLimpar: string[] = [];
  const paths: string[] = [];

  for (const r of rows) {
    const n = (contagem.get(r.pessoa_id) ?? 0) + 1;
    contagem.set(r.pessoa_id, n);
    const velha = r.batido_em < corte;
    const excedente = n > MAX_SELFIES;
    if (velha || excedente) {
      idsParaLimpar.push(r.id);
      const p = pathDoBucket(r.selfie_url);
      if (p) paths.push(p);
    }
  }

  if (paths.length) {
    // Remove do storage em lotes de 100 (limite da API).
    for (let i = 0; i < paths.length; i += 100) {
      await db.storage.from("photos").remove(paths.slice(i, i + 100)).catch(() => {});
    }
  }
  if (idsParaLimpar.length) {
    for (let i = 0; i < idsParaLimpar.length; i += 200) {
      await db.from("ponto_registros").update({ selfie_url: null }).in("id", idsParaLimpar.slice(i, i + 200));
    }
  }
  return { ok: true, apagadas: idsParaLimpar.length };
}

// ── Aprendizado facial (amostras) ────────────────────────────────────────────
// Guarda o embedding de uma batida como "molde" da pessoa naquela câmera e apara
// pras N mais recentes (não lota o banco). Tolerante: sem a tabela v3, ignora.
// Subiu de 6 pra 24 com os constructos do Mac: cada foto agora gera variantes
// de OCLUSÃO (rosto inteiro, metade esquerda/direita tapada, metade de baixo
// tapada, espelho) — é o que faz um rosto PARCIAL na câmera casar com o molde
// parcial correspondente. O rank usa o MELHOR molde, então mais moldes bons não
// "engolem" ninguém; o perigo antigo era molde RUIM (foto estourada), e esse
// filtro mora no tablet.
//
// 40 e não 24: o `salvarAmostra` apara pelas MAIS RECENTES, e os moldes que o
// tablet aprende com o uso iam empurrando os constructos do Mac pra fora da
// janela — com 40 cabem os ~24 do Mac (fotos + selfies de batida) e ainda
// sobra espaço pros da câmera sem ninguém ser despejado.
const MAX_AMOSTRAS = 40;
const tabelaAmostraAusente = (msg: string | undefined) => ausente(msg) || /ponto_face_amostras/.test(msg || "");

export async function salvarAmostra(pessoaId: string, embedding: number[]): Promise<void> {
  if (!Array.isArray(embedding) || embedding.length < 32) return;
  const db = createSupabaseAdminClient();
  const { error } = await db.from("ponto_face_amostras").insert({ pessoa_id: pessoaId, embedding });
  if (error) { if (tabelaAmostraAusente(error.message)) return; throw new Error(error.message); }
  // Apara: mantém só as MAX_AMOSTRAS mais recentes.
  const { data } = await db.from("ponto_face_amostras")
    .select("id").eq("pessoa_id", pessoaId).order("created_at", { ascending: false });
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length > MAX_AMOSTRAS) {
    await db.from("ponto_face_amostras").delete().in("id", ids.slice(MAX_AMOSTRAS));
  }
}

// Amostras por pessoa (p/ o sync do tablet). Vazio se a tabela não existe.
export async function amostrasPorPessoa(): Promise<Map<string, number[][]>> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("ponto_face_amostras")
    .select("pessoa_id,embedding").order("created_at", { ascending: false });
  if (error) return new Map();
  const m = new Map<string, number[][]>();
  for (const r of (data ?? []) as { pessoa_id: string; embedding: unknown }[]) {
    if (!Array.isArray(r.embedding)) continue;
    const arr = m.get(r.pessoa_id) ?? [];
    if (arr.length < MAX_AMOSTRAS) { arr.push(r.embedding as number[]); m.set(r.pessoa_id, arr); }
  }
  return m;
}

/**
 * O ponto de UMA pessoa, hoje — para o card "Meu ponto" do Início da Central.
 *
 * `statusHoje()` responde a mesma pergunta, mas para a empresa inteira: lê
 * todas as pessoas, todos os feriados do mês e todas as batidas do dia. Rodar
 * aquilo para desenhar uma linha de texto sobre uma pessoa seria pagar o painel
 * da gestão em toda abertura da Central.
 *
 * Devolve `null` quando o perfil não tem cadastro no ponto (a maioria dos
 * usuários administrativos) — o card então mostra só o rótulo, sem inventar um
 * status para quem não bate ponto.
 */
export async function meuPontoHoje(colaboradorId: string): Promise<{ rotulo: string; desde: string | null } | null> {
  const db = createSupabaseAdminClient();
  const { data: pessoa } = await db.from("ponto_pessoas")
    .select("id").eq("colaborador_id", colaboradorId).eq("ativo", true).limit(1).maybeSingle();
  const pessoaId = (pessoa as { id: string } | null)?.id;
  if (!pessoaId) return null;

  // Início do dia SP (UTC-3) — mesmo corte de `statusHoje`.
  const s = new Date(Date.now() - 3 * 3600 * 1000);
  const inicio = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 3, 0, 0)).toISOString();
  const { data } = await db.from("ponto_registros")
    .select("tipo,batido_em").eq("pessoa_id", pessoaId)
    .gte("batido_em", inicio).order("batido_em", { ascending: true })
    .limit(20);                                   // toda listagem tem teto (CLAUDE.md)

  const rows = (data ?? []) as { tipo: string; batido_em: string }[];
  if (!rows.length) return { rotulo: "sem batida hoje", desde: null };

  const hora = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(11, 16);
  const ultima = rows[rows.length - 1];
  const entrada = rows.find((r) => r.tipo === "entrada") ?? rows[0];

  if (ultima.tipo === "saida") return { rotulo: "saiu às", desde: hora(ultima.batido_em) };
  if (ultima.tipo === "almoco") return { rotulo: "em almoço desde", desde: hora(ultima.batido_em) };
  if (ultima.tipo === "intervalo_inicio") return { rotulo: "em pausa desde", desde: hora(ultima.batido_em) };
  return { rotulo: "na empresa desde", desde: hora(entrada.batido_em) };
}
