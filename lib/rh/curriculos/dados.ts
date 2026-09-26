// ── RH → Currículos: leitura e escrita (servidor) ────────────────────────────
// Colunas nomeadas, `.limit()` em toda listagem, e tolerância ao SQL ainda não
// ter rodado (`pendente`) — o mesmo degrau de lib/rh/dados.ts.
//
// A LISTA nunca traz `respostas`, `curriculo` nem `dados`: são as gavetas
// sensíveis, e a lista é aberta por quem tem só `rh:curriculos`. O perfil
// (`detalheDoCandidato`) recebe os PODERES de quem pediu e devolve `null` na
// gaveta que a pessoa não tem — o servidor nem lê a coluna.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { invalidate } from "@/lib/cache";
import type { PoderesRh } from "../gate";
import type { ComPendencia } from "../dados";
import {
  ehStatus, type CandidatoDetalhe, type CandidatoResumo, type ConfigIntegracao, type CurriculoAnexo,
  type HistoricoCandidato, type ObservacaoCandidato, type RespostaCandidato, type ResumoCurriculos,
  type StatusCandidato, type TipoHistoricoCandidato, type VagaRh,
} from "./tipos";
import { ARQUIVADO, etapaDeEntrada, normalizarEtapas, type EtapaProcesso } from "./etapas";
import { normalizarFormulario, normalizarPerguntasDaVaga, type ConfigFormulario, type PerfilCandidato } from "./formulario";
export { resumir } from "./tipos";

/** Teto da lista. Centenas de candidatos cabem; milhares saturam e a tela avisa. */
export const TETO_LISTA = 600;
const TETO_FICHA = 200;

function tabelaAusente(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  return erro.code === "42P01" || /does not exist|schema cache/i.test(erro.message ?? "");
}

/** Coluna nova (a parte v2 do SQL) ainda não criada: a leitura cai pro conjunto antigo. */
function colunaAusente(erro: { code?: string; message?: string } | null): boolean {
  return !!erro && (erro.code === "42703" || erro.code === "PGRST204" || /column .* does not exist|Could not find the .* column/i.test(erro.message ?? ""));
}

const COLUNAS_RESUMO = "id,nome,email,telefone,cidade,vaga_id,status,origem,recebido_em,visto_em,curriculo";
/** As colunas da parte v2 do SQL. `perfil` é derivado das respostas: só entra
 *  pra quem tem `rh:curriculos_respostas` (o SELECT nem pede pros outros). */
const COLUNAS_V2 = "entrevista_em,tags,etapa_em,updated_at";

type LinhaResumo = {
  id: string; nome: string; email: string | null; telefone: string | null; cidade: string | null;
  vaga_id: string | null; status: string; origem: string; recebido_em: string; visto_em: string | null;
  curriculo: { chave?: string } | null;
  entrevista_em?: string | null;
  perfil?: PerfilCandidato | null;
  tags?: string[] | null;
  etapa_em?: string | null;
  updated_at?: string | null;
};

function perfilValido(v: unknown): PerfilCandidato | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Partial<PerfilCandidato>;
  const s = (x: unknown) => (typeof x === "string" && x ? x : null);
  return {
    ocupacao: s(p.ocupacao), formacao: s(p.formacao), experiencia: s(p.experiencia), escolaridade: s(p.escolaridade), disponibilidade: s(p.disponibilidade),
    ...(typeof p.pontuaveis === "number" && p.pontuaveis > 0 ? { pontuaveis: p.pontuaveis, acertos: Math.max(0, Math.min(p.pontuaveis, Number(p.acertos) || 0)) } : {}),
    tags: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === "string").slice(0, 12) : [],
  };
}

function resumoDaLinha(l: LinhaResumo, vagas: Map<string, string>, comPerfil = false, comArquivo = false): CandidatoResumo {
  const cv = l.curriculo as { chave?: string; nome?: string } | null;
  return {
    id: l.id, nome: l.nome, email: l.email, telefone: l.telefone, cidade: l.cidade,
    vaga_id: l.vaga_id, vaga: l.vaga_id ? vagas.get(l.vaga_id) ?? null : null,
    status: ehStatus(l.status) ? l.status : "novo",
    tags: Array.isArray(l.tags) ? l.tags.filter((t): t is string => typeof t === "string").slice(0, 12) : [],
    etapa_em: l.etapa_em ?? null,
    updated_at: l.updated_at ?? null,
    curriculo_url: comArquivo && cv?.chave && cv.chave !== "x" ? `/api/arquivos/${cv.chave}` : null,
    curriculo_nome: comArquivo && cv?.chave ? cv.nome ?? null : null,
    origem: l.origem, recebido_em: l.recebido_em, visto_em: l.visto_em,
    tem_curriculo: !!l.curriculo?.chave,
    perfil: comPerfil ? perfilValido(l.perfil) ?? { ocupacao: null, formacao: null, experiencia: null, disponibilidade: null, tags: l.curriculo?.chave ? ["Currículo enviado"] : [] } : null,
    entrevista_em: l.entrevista_em ?? null,
  };
}

// ── Vagas ────────────────────────────────────────────────────────────────────

export async function listarVagas(): Promise<ComPendencia<VagaRh[]>> {
  const db = createSupabaseAdminClient();
  const ler = (cols: string) => db.from("rh_vagas").select(cols)
    .order("status", { ascending: true }).order("titulo", { ascending: true }).limit(200);
  let { data, error } = await ler("id,titulo,setor,descricao,status,created_at,perguntas");
  if (colunaAusente(error)) ({ data, error } = await ler("id,titulo,setor,descricao,status,created_at"));
  const vagas = ((data ?? []) as unknown as (VagaRh & { perguntas?: unknown })[])
    .map((v) => ({ ...v, perguntas: normalizarPerguntasDaVaga(v.perguntas) }));
  return { dados: vagas, pendente: tabelaAusente(error) };
}

// ── A lista ──────────────────────────────────────────────────────────────────


export async function listarCandidatos(opts: { comPerfil?: boolean; comArquivo?: boolean } = {}): Promise<ComPendencia<{ lista: CandidatoResumo[]; vagas: VagaRh[]; saturou: boolean }>> {
  const db = createSupabaseAdminClient();
  const ler = (cols: string) => db.from("rh_candidatos").select(cols).order("recebido_em", { ascending: false }).limit(TETO_LISTA);
  const [primeira, vagas] = await Promise.all([
    ler([COLUNAS_RESUMO, COLUNAS_V2, ...(opts.comPerfil ? ["perfil"] : [])].join(",")),
    listarVagas(),
  ]);
  let cands = primeira;
  if (colunaAusente(cands.error)) cands = await ler(COLUNAS_RESUMO);
  const pendente = tabelaAusente(cands.error) || vagas.pendente;
  const porVaga = new Map(vagas.dados.map((v) => [v.id, v.titulo]));
  // A chave do currículo vem no SELECT de todos (é o "tem currículo" da
  // lista), mas o LINK só sai pra quem abre o arquivo.
  const lista = ((cands.data ?? []) as unknown as LinhaResumo[]).map((l) => resumoDaLinha(l, porVaga, !!opts.comPerfil, !!opts.comArquivo));
  const contagem = new Map<string, number>();
  for (const c of lista) if (c.vaga_id) contagem.set(c.vaga_id, (contagem.get(c.vaga_id) ?? 0) + 1);
  const vagasComContagem = vagas.dados.map((v) => ({ ...v, candidatos: contagem.get(v.id) ?? 0 }));
  return { dados: { lista, vagas: vagasComContagem, saturou: lista.length >= TETO_LISTA }, pendente };
}

/** O número do menu: `novo` e nunca aberto. Só a contagem — o corpo volta vazio. */
export async function contarNaoVistos(): Promise<number> {
  try {
    const { count, error } = await createSupabaseAdminClient()
      .from("rh_candidatos").select("id", { count: "exact", head: true })
      .eq("status", "novo").is("visto_em", null);
    if (error) return 0;
    return count ?? 0;
  } catch { return 0; }
}

// ── O perfil ─────────────────────────────────────────────────────────────────

type LinhaDetalhe = LinhaResumo & {
  origem_detalhe: Record<string, unknown> | null;
  dados: Record<string, unknown> | null;
  respostas: RespostaCandidato[] | null;
  curriculo: CurriculoAnexo | null;
  arquivado_em: string | null;
};

export async function detalheDoCandidato(id: string, poderes: PoderesRh): Promise<CandidatoDetalhe | null> {
  const db = createSupabaseAdminClient();
  // As colunas sensíveis só entram no SELECT de quem tem a gaveta.
  const colunas = (v2: boolean) => [
    COLUNAS_RESUMO.replace(",curriculo", ""), "origem_detalhe", "dados", "arquivado_em",
    ...(v2 ? [COLUNAS_V2, ...(poderes.curriculosRespostas ? ["perfil"] : [])] : []),
    ...(poderes.curriculosRespostas ? ["respostas"] : []),
    ...(poderes.curriculosArquivo ? ["curriculo"] : []),
  ].join(",");
  const lerCand = async () => {
    const r = await db.from("rh_candidatos").select(colunas(true)).eq("id", id).maybeSingle();
    return colunaAusente(r.error) ? db.from("rh_candidatos").select(colunas(false)).eq("id", id).maybeSingle() : r;
  };

  const [cand, hist, obs, vagas] = await Promise.all([
    lerCand(),
    db.from("rh_candidato_historico").select("id,tipo,titulo,detalhe,autor_nome,created_at")
      .eq("candidato_id", id).order("created_at", { ascending: false }).limit(TETO_FICHA),
    poderes.curriculosEditar
      ? db.from("rh_candidato_observacoes").select("id,texto,autor_nome,created_at")
        .eq("candidato_id", id).order("created_at", { ascending: false }).limit(TETO_FICHA)
      : Promise.resolve({ data: null }),
    listarVagas(),
  ]);
  if (cand.error || !cand.data) return null;
  const l = cand.data as unknown as LinhaDetalhe;
  const porVaga = new Map(vagas.dados.map((v) => [v.id, v.titulo]));
  // `tem_curriculo` precisa existir mesmo pra quem não abre o arquivo — é a
  // etiqueta "currículo anexado" da lista. Uma leitura mínima só da chave.
  let temCv = !!l.curriculo?.chave;
  if (!poderes.curriculosArquivo) {
    const { data } = await db.from("rh_candidatos").select("curriculo->chave").eq("id", id).maybeSingle();
    temCv = !!(data as { chave?: string } | null)?.chave;
  }
  return {
    ...resumoDaLinha(poderes.curriculosArquivo ? l : { ...l, curriculo: temCv ? { chave: "x" } : null }, porVaga, poderes.curriculosRespostas, poderes.curriculosArquivo),
    origem_detalhe: l.origem_detalhe ?? {},
    dados: l.dados ?? {},
    respostas: poderes.curriculosRespostas ? (Array.isArray(l.respostas) ? l.respostas : []) : null,
    curriculo: poderes.curriculosArquivo ? (l.curriculo?.chave ? l.curriculo : null) : null,
    observacoes: poderes.curriculosEditar ? ((obs.data ?? []) as ObservacaoCandidato[]) : null,
    historico: (hist.data ?? []) as HistoricoCandidato[],
    arquivado_em: l.arquivado_em,
  };
}

/** Respostas de vários candidatos de uma vez (o "mostrar tudo" da lista). */
export async function respostasDe(ids: string[]): Promise<Record<string, RespostaCandidato[]>> {
  if (!ids.length) return {};
  const { data } = await createSupabaseAdminClient()
    .from("rh_candidatos").select("id,respostas").in("id", ids.slice(0, 60)).limit(60);
  const out: Record<string, RespostaCandidato[]> = {};
  for (const r of (data ?? []) as { id: string; respostas: RespostaCandidato[] | null }[]) out[r.id] = Array.isArray(r.respostas) ? r.respostas : [];
  return out;
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export async function anotarHistorico(ev: {
  candidato_id: string; tipo: TipoHistoricoCandidato; titulo: string; detalhe?: string | null;
  dados?: Record<string, unknown>; autor_id?: string | null; autor_nome?: string | null;
}): Promise<void> {
  try {
    await createSupabaseAdminClient().from("rh_candidato_historico").insert({
      candidato_id: ev.candidato_id, tipo: ev.tipo, titulo: ev.titulo, detalhe: ev.detalhe ?? null,
      dados: ev.dados ?? null, autor_id: ev.autor_id ?? null, autor_nome: ev.autor_nome ?? null,
    });
  } catch { /* histórico nunca derruba a ação principal */ }
}

export interface NovoCandidato {
  nome: string;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  vaga_id: string | null;
  origem: string;
  origem_detalhe: Record<string, unknown>;
  externo_id: string | null;
  respostas: RespostaCandidato[];
  curriculo: CurriculoAnexo | null;
  dados: Record<string, unknown>;
  recebido_em: string;
  /** Resumo da triagem, calculado na chegada (`perfilDoCandidato`). */
  perfil?: PerfilCandidato | null;
}

/**
 * Cria o candidato — ou ATUALIZA quando o `externo_id` já existe (o webhook
 * reenviou, ou o lead parcial virou completo). Devolve `{ id, novo }`.
 */
export async function receberCandidato(c: NovoCandidato, fonte: string): Promise<{ id: string; novo: boolean } | { erro: string }> {
  const db = createSupabaseAdminClient();
  // Todo candidato novo entra na etapa de ENTRADA configurada ("Recebidos").
  const { dados: etapas } = await lerEtapas();
  const linha = {
    status: etapaDeEntrada(etapas),
    etapa_em: c.recebido_em,
    nome: c.nome.slice(0, 160), email: c.email?.slice(0, 200) ?? null, telefone: c.telefone?.slice(0, 40) ?? null,
    cidade: c.cidade?.slice(0, 120) ?? null, vaga_id: c.vaga_id, origem: c.origem, origem_detalhe: c.origem_detalhe,
    externo_id: c.externo_id, respostas: c.respostas, curriculo: c.curriculo, dados: c.dados, recebido_em: c.recebido_em,
    ...(c.perfil ? { perfil: c.perfil } : {}),
  };

  if (c.externo_id) {
    const { data: ja } = await db.from("rh_candidatos").select("id,status").eq("externo_id", c.externo_id).maybeSingle();
    if (ja?.id) {
      const patch: Record<string, unknown> = {
        nome: linha.nome, email: linha.email ?? undefined, telefone: linha.telefone ?? undefined,
        cidade: linha.cidade ?? undefined, respostas: linha.respostas, origem_detalhe: linha.origem_detalhe,
        ...(linha.curriculo ? { curriculo: linha.curriculo } : {}),
        ...(linha.vaga_id ? { vaga_id: linha.vaga_id } : {}),
      };
      for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
      const { error } = await db.from("rh_candidatos").update(patch).eq("id", ja.id);
      if (error) return { erro: error.message };
      await anotarHistorico({ candidato_id: ja.id, tipo: "dados", titulo: "Candidatura atualizada", detalhe: `Reenviada pelo ${fonte}.` });
      await registrarRecepcao(fonte);
      return { id: ja.id, novo: false };
    }
  }

  let { data, error } = await db.from("rh_candidatos").insert(linha).select("id").maybeSingle();
  // Sem a parte v2 do SQL a coluna `perfil` não existe: grava sem ela em vez
  // de perder o candidato.
  if (colunaAusente(error)) {
    const { perfil: _p, etapa_em: _e, ...semPerfil } = linha as typeof linha & { perfil?: unknown }; void _p; void _e;
    ({ data, error } = await db.from("rh_candidatos").insert(semPerfil).select("id").maybeSingle());
  }
  if (error || !data) return { erro: error?.message ?? "Não foi possível gravar." };
  invalidate("rh:curriculos:novos");
  await anotarHistorico({ candidato_id: data.id, tipo: "recebido", titulo: `Candidatura recebida pelo ${fonte}.` });
  await registrarRecepcao(fonte);
  return { id: data.id, novo: true };
}

/**
 * Já enviou nas últimas `horas`? Pelo e-mail OU pelo telefone — é a trava
 * do servidor contra o "enviar de novo" (o navegador guarda o carimbo, mas
 * carimbo no navegador não segura quem limpa o site).
 */
export async function enviouRecentemente(email: string | null, telefone: string | null, horas = 24): Promise<boolean> {
  const desde = new Date(Date.now() - horas * 3_600_000).toISOString();
  const db = createSupabaseAdminClient();
  const ou: string[] = [];
  if (email) ou.push(`email.eq.${email.replace(/[,()]/g, "")}`);
  if (telefone) ou.push(`telefone.eq.${telefone.replace(/[,()]/g, "")}`);
  if (!ou.length) return false;
  const { data, error } = await db.from("rh_candidatos").select("id").gte("recebido_em", desde).or(ou.join(",")).limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

export async function mudarStatus(
  id: string, status: StatusCandidato, autor: { id: string; nome: string }, extra: { entrevista_em?: string | null } = {},
): Promise<{ ok: true; antes: StatusCandidato } | { ok: false; erro: string }> {
  const db = createSupabaseAdminClient();
  const { data: atual } = await db.from("rh_candidatos").select("status").eq("id", id).maybeSingle();
  if (!atual) return { ok: false, erro: "Candidato não encontrado." };
  const antes = ehStatus(atual.status) ? atual.status : "novo";
  const patch: Record<string, unknown> = {
    status, updated_by: autor.id,
    arquivado_em: status === ARQUIVADO ? new Date().toISOString() : null,
    ...(status !== antes ? { etapa_em: new Date().toISOString() } : {}),
    ...("entrevista_em" in extra ? { entrevista_em: extra.entrevista_em } : {}),
  };
  let { error } = await db.from("rh_candidatos").update(patch).eq("id", id);
  if (colunaAusente(error)) {
    delete patch.etapa_em; delete patch.entrevista_em;
    ({ error } = await db.from("rh_candidatos").update(patch).eq("id", id));
  }
  if (error) return { ok: false, erro: error.message };
  invalidate("rh:curriculos:novos");
  return { ok: true, antes };
}

/** Primeira abertura do perfil: apaga o "novo" do menu. Só grava se ainda não tinha. */
export async function marcarVisto(id: string, por: { id: string; nome: string }): Promise<boolean> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("rh_candidatos").update({ visto_em: new Date().toISOString(), visto_por: por.id })
    .eq("id", id).is("visto_em", null).select("id").maybeSingle();
  if (data?.id) {
    invalidate("rh:curriculos:novos");
    await anotarHistorico({ candidato_id: id, tipo: "visto", titulo: "Perfil aberto pela primeira vez.", autor_id: por.id, autor_nome: por.nome });
  }
  return !!data?.id;
}

// ── Integração ───────────────────────────────────────────────────────────────

type LinhaConfig = {
  formulario_ativo: boolean; webhook_token_hash: string | null; webhook_token_dica: string | null;
  webhook_gerado_em: string | null; vaga_padrao_id: string | null; ultima_recepcao_em: string | null;
  ultima_recepcao_fonte: string | null; ultimo_erro: string | null; ultimo_erro_em: string | null;
};

const COLUNAS_CONFIG = "formulario_ativo,webhook_token_hash,webhook_token_dica,webhook_gerado_em,vaga_padrao_id,ultima_recepcao_em,ultima_recepcao_fonte,ultimo_erro,ultimo_erro_em";

/** A linha crua (com o hash). Só pra dentro do servidor. */
export async function configCrua(): Promise<ComPendencia<LinhaConfig | null>> {
  const { data, error } = await createSupabaseAdminClient().from("rh_curriculos_config").select(COLUNAS_CONFIG).eq("id", "unica").maybeSingle();
  return { dados: (data as LinhaConfig | null) ?? null, pendente: tabelaAusente(error) };
}

/** O que a tela vê — sem o hash. */
export async function lerConfig(): Promise<ComPendencia<ConfigIntegracao>> {
  const { dados, pendente } = await configCrua();
  return {
    pendente,
    dados: {
      formulario_ativo: dados?.formulario_ativo ?? true,
      webhook_configurado: !!dados?.webhook_token_hash,
      webhook_token_dica: dados?.webhook_token_dica ?? null,
      webhook_gerado_em: dados?.webhook_gerado_em ?? null,
      vaga_padrao_id: dados?.vaga_padrao_id ?? null,
      ultima_recepcao_em: dados?.ultima_recepcao_em ?? null,
      ultima_recepcao_fonte: dados?.ultima_recepcao_fonte ?? null,
      ultimo_erro: dados?.ultimo_erro ?? null,
      ultimo_erro_em: dados?.ultimo_erro_em ?? null,
    },
  };
}

export async function gravarConfig(patch: Partial<LinhaConfig> & { updated_by?: string }): Promise<string | null> {
  invalidate("rh:candidatura:publico");
  const { error } = await createSupabaseAdminClient().from("rh_curriculos_config").upsert({ id: "unica", ...patch }, { onConflict: "id" });
  return error ? error.message : null;
}

async function registrarRecepcao(fonte: string): Promise<void> {
  try {
    await createSupabaseAdminClient().from("rh_curriculos_config")
      .upsert({ id: "unica", ultima_recepcao_em: new Date().toISOString(), ultima_recepcao_fonte: fonte, ultimo_erro: null, ultimo_erro_em: null }, { onConflict: "id" });
  } catch { /* o candidato já foi gravado; o carimbo é informativo */ }
}

export async function registrarErroDeRecepcao(msg: string): Promise<void> {
  try {
    await createSupabaseAdminClient().from("rh_curriculos_config")
      .upsert({ id: "unica", ultimo_erro: msg.slice(0, 500), ultimo_erro_em: new Date().toISOString() }, { onConflict: "id" });
  } catch { /* idem */ }
}

// ── O formulário configurável ────────────────────────────────────────────────

/**
 * A config do formulário, sempre válida: sem SQL, sem linha, sem coluna ou
 * com lixo, volta o padrão (`normalizarFormulario`). `personalizado` diz se
 * o RH já salvou alguma coisa.
 */
export async function lerFormulario(): Promise<ComPendencia<{ config: ConfigFormulario; personalizado: boolean }>> {
  const { data, error } = await createSupabaseAdminClient().from("rh_curriculos_config").select("formulario").eq("id", "unica").maybeSingle();
  const bruto = (data as { formulario?: unknown } | null)?.formulario ?? null;
  return {
    dados: { config: normalizarFormulario(bruto), personalizado: !!bruto },
    pendente: tabelaAusente(error) || colunaAusente(error),
  };
}

export async function gravarFormulario(cfg: ConfigFormulario | null, autor: string): Promise<string | null> {
  const { error } = await createSupabaseAdminClient().from("rh_curriculos_config")
    .upsert({ id: "unica", formulario: cfg, updated_by: autor }, { onConflict: "id" });
  invalidate("rh:candidatura:publico");
  if (colunaAusente(error)) return "Rode a parte v2 de supabase/rh_curriculos.sql (coluna formulario).";
  return error ? error.message : null;
}

// ── As etapas do processo (colunas do Kanban) ────────────────────────────────

/** Formulário e etapas vêm da MESMA linha: uma ida ao banco em vez de duas. */
export async function lerFormularioEEtapas(): Promise<{ form: Awaited<ReturnType<typeof lerFormulario>>; etapas: Awaited<ReturnType<typeof lerEtapas>> }> {
  const db = createSupabaseAdminClient();
  let { data, error } = await db.from("rh_curriculos_config").select("formulario,etapas_processo").eq("id", "unica").maybeSingle();
  if (colunaAusente(error)) {
    const [form, etapas] = await Promise.all([lerFormulario(), lerEtapas()]);
    return { form, etapas };
  }
  const linha = data as { formulario?: unknown; etapas_processo?: unknown } | null;
  const pendente = tabelaAusente(error);
  return {
    form: { dados: { config: normalizarFormulario(linha?.formulario ?? null), personalizado: !!linha?.formulario }, pendente },
    etapas: { dados: normalizarEtapas(linha?.etapas_processo ?? null), pendente },
  };
}

export async function lerEtapas(): Promise<ComPendencia<EtapaProcesso[]>> {
  const { data, error } = await createSupabaseAdminClient().from("rh_curriculos_config").select("etapas_processo").eq("id", "unica").maybeSingle();
  return {
    dados: normalizarEtapas((data as { etapas_processo?: unknown } | null)?.etapas_processo ?? null),
    pendente: tabelaAusente(error) || colunaAusente(error),
  };
}

export async function gravarEtapas(etapas: EtapaProcesso[] | null, autor: string): Promise<string | null> {
  const { error } = await createSupabaseAdminClient().from("rh_curriculos_config")
    .upsert({ id: "unica", etapas_processo: etapas, updated_by: autor }, { onConflict: "id" });
  if (colunaAusente(error)) return "Rode a parte v3 de supabase/rh_curriculos.sql (coluna etapas_processo).";
  return error ? error.message : null;
}

/** Troca as etiquetas manuais. Devolve as que entraram e as que saíram (vão pro histórico). */
export async function gravarTags(id: string, tags: string[], autor: string): Promise<{ ok: true; entraram: string[]; sairam: string[] } | { ok: false; erro: string }> {
  const db = createSupabaseAdminClient();
  const { data: atual, error: e1 } = await db.from("rh_candidatos").select("tags").eq("id", id).maybeSingle();
  if (colunaAusente(e1)) return { ok: false, erro: "Rode a parte v3 de supabase/rh_curriculos.sql (coluna tags)." };
  if (!atual) return { ok: false, erro: "Candidato não encontrado." };
  const antes: string[] = Array.isArray((atual as { tags?: unknown }).tags) ? (atual as { tags: string[] }).tags : [];
  const { error } = await db.from("rh_candidatos").update({ tags, updated_by: autor }).eq("id", id);
  if (error) return { ok: false, erro: error.message };
  return { ok: true, entraram: tags.filter((t) => !antes.includes(t)), sairam: antes.filter((t) => !tags.includes(t)) };
}
