// ── Auth e helpers de DISPOSITIVO (app de atividades offline-first).
// O tablet guarda um token; cada request manda `X-Device-Token`. Validamos pelo
// hash. Provisionamento via código de 6 dígitos gerado pelo admin.

import { createHash, randomBytes, randomInt } from "crypto";
import { podeFaixa } from "@/lib/atividade-faixa";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface Device {
  id: string;
  nome_mesa: string | null;
  setor: string | null;
  ativo: boolean;
  tipo?: string;            // 'producao' | 'ponto' (default 'producao' quando ausente)
  categorias?: string[] | null;   // que ordens este tablet recebe: ["Chancela"] | ["Carimbo"] | null = todas
}

const colunaAusente = (m: string | undefined) => !!m && /column .* does not exist|Could not find the .* column/i.test(m);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Falha TRANSITÓRIA ao consultar o device (rede/Supabase fora). NÃO é "token
// inválido" — quem chama deve responder 503 (tente de novo), nunca 401, senão o
// tablet se acha desautorizado e desapareia sozinho.
export class DeviceIndisponivel extends Error {
  constructor(msg: string) { super(msg); this.name = "DeviceIndisponivel"; }
}

// Resolve o dispositivo a partir do header X-Device-Token.
// null = token realmente inválido/desativado. Erro transitório → lança DeviceIndisponivel.
export async function getDevice(token: string | null): Promise<Device | null> {
  if (!token) return null;
  const db = createSupabaseAdminClient();
  const sel = (cols: string) => db.from("devices").select(cols).eq("token_hash", sha256(token)).maybeSingle();
  let { data, error } = await sel("id,nome_mesa,setor,ativo,tipo,categorias");
  if (error && colunaAusente(error.message)) ({ data, error } = await sel("id,nome_mesa,setor,ativo"));
  // Erro que NÃO é "não achei" → indisponibilidade; não desautoriza o tablet.
  if (error) throw new DeviceIndisponivel(error.message);
  const d = data as unknown as Device | null;
  if (!d || !d.ativo) return null;
  return d;
}

// Autenticação do tablet pronta pra rota. Distingue:
//  - ok:false status 401 → token realmente inválido (aí sim vale re-parear)
//  - ok:false status 503 → banco/rede indisponível: o tablet deve TENTAR DE NOVO
//    e JAMAIS apagar o token (era isso que causava o "código expirou" do nada).
export async function autenticarDevice(
  token: string | null,
): Promise<{ ok: true; device: Device } | { ok: false; status: 401 | 503; body: { error: string } }> {
  try {
    const device = await getDevice(token);
    if (!device) return { ok: false, status: 401, body: { error: "device_unauthorized" } };
    return { ok: true, device };
  } catch (e) {
    if (e instanceof DeviceIndisponivel) return { ok: false, status: 503, body: { error: "servico_indisponivel" } };
    throw e;
  }
}

// Atualiza o carimbo de último sync (best-effort).
export async function touchDevice(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  await db.from("devices").update({ last_sync: new Date().toISOString() }).eq("id", id);
}

// Código de pareamento PERMANENTE: não expira e pode ser reusado. Serve como a
// "identidade" fixa do tablet — digitar o mesmo código de novo re-vincula o MESMO
// device (rotaciona o token), em vez de criar um duplicado.
const SEM_VALIDADE = "2999-12-31T23:59:59.000Z";

export async function gerarCodigoProvisionamento(
  nome_mesa: string | null,
  setor: string | null,
  tipo: string = "producao",
  categorias: string[] | null = null,
): Promise<{ code: string; expires_at: string }> {
  const db = createSupabaseAdminClient();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const row = { code, nome_mesa, setor, expires_at: SEM_VALIDADE, tipo, categorias };
  // Degrada coluna a coluna: `categorias` e depois `tipo` podem não existir ainda.
  let { error } = await db.from("device_provision_codes").insert(row);
  if (error && colunaAusente(error.message)) {
    const { categorias: _c, ...semCat } = row; void _c;
    ({ error } = await db.from("device_provision_codes").insert(semCat));
    if (error && colunaAusente(error.message)) {
      const { tipo: _t, ...semTipo } = semCat; void _t;
      await db.from("device_provision_codes").insert(semTipo);
    }
  }
  return { code, expires_at: SEM_VALIDADE };
}

// O tablet troca o código por um device_token. Reutilizável: se o código já tem
// device, ROTACIONA o token desse mesmo device (re-pareamento) — assim o tablet
// nunca fica órfão e não vira um device duplicado.
export async function provisionar(code: string): Promise<{ token: string; device: Device } | { error: string }> {
  const db = createSupabaseAdminClient();
  const getCode = (cols: string) => db.from("device_provision_codes").select(cols).eq("code", code).maybeSingle();
  let { data: pc } = await getCode("code,nome_mesa,setor,device_id,tipo,categorias");
  if (!pc) ({ data: pc } = await getCode("code,nome_mesa,setor,device_id,tipo"));
  if (!pc) ({ data: pc } = await getCode("code,nome_mesa,setor,device_id"));
  const c = pc as unknown as { nome_mesa: string | null; setor: string | null; device_id?: string | null; tipo?: string; categorias?: string[] | null } | null;
  if (!c) return { error: "codigo_invalido" };
  // Sem checagem de `used`/`expires_at`: o código é permanente e reutilizável.

  const token = randomBytes(32).toString("hex");
  const token_hash = sha256(token);

  // Já existe device pra esse código → só troca o token (mantém id/histórico).
  if (c.device_id) {
    const upd = (sel: string) => db.from("devices").update({ token_hash, ativo: true }).eq("id", c.device_id!).select(sel).maybeSingle();
    let { data: dev } = await upd("id,nome_mesa,setor,ativo,tipo,categorias");
    if (!dev) ({ data: dev } = await upd("id,nome_mesa,setor,ativo"));
    if (dev) return { token, device: dev as unknown as Device };
    // device sumiu do banco → cai pro caminho de criação abaixo.
  }

  const base = { token_hash, nome_mesa: c.nome_mesa, setor: c.setor, ativo: true };
  const insDev = (extra: Record<string, unknown>, sel: string) => db.from("devices").insert({ ...base, ...extra }).select(sel).single();
  let { data: dev, error } = await insDev({ tipo: c.tipo ?? "producao", categorias: c.categorias ?? null }, "id,nome_mesa,setor,ativo,tipo,categorias");
  if (error && colunaAusente(error.message)) ({ data: dev, error } = await insDev({ tipo: c.tipo ?? "producao" }, "id,nome_mesa,setor,ativo,tipo"));
  if (error && colunaAusente(error.message)) ({ data: dev, error } = await insDev({}, "id,nome_mesa,setor,ativo"));
  if (error || !dev) return { error: "falha_provisionar" };

  await db.from("device_provision_codes").update({ used: true, device_id: (dev as { id: string }).id }).eq("code", code);
  return { token, device: dev as unknown as Device };
}

// ── Roteamento de ordens por CATEGORIA (Chancela × Carimbo/Clichê) ───────────
const normTxt = (s: string | null | undefined) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Família da categoria. Clichê e Carimbo são a MESMA família (mesma bancada).
export function familiaCategoria(cat: string | null | undefined): "chancela" | "carimbo" | null {
  const c = normTxt(cat);
  if (!c) return null;
  if (c.includes("chancela")) return "chancela";
  if (c.includes("cliche") || c.includes("carimbo")) return "carimbo";
  return null;
}

// Este tablet recebe ordens desta categoria?
// 1) device.categorias configurado → manda nele;
// 2) senão, INFERE pelo nome da mesa/setor (ex.: mesa "Chancelas" → só chancela);
// 3) sem nada disso → tablet genérico, recebe tudo (comportamento antigo).
// Ordem sem categoria cai em qualquer tablet.
export function deviceAceitaCategoria(device: Device, categoria: string | null | undefined): boolean {
  const alvo = familiaCategoria(categoria);
  if (alvo == null) return true;

  const cfg = (device.categorias ?? []).filter(Boolean);
  if (cfg.length) {
    const fams = new Set(cfg.map((c) => familiaCategoria(c)).filter(Boolean));
    return fams.has(alvo);
  }
  const inferida = familiaCategoria(device.nome_mesa) ?? familiaCategoria(device.setor);
  return inferida == null || inferida === alvo;
}

// A PESSOA faz esta categoria de ordem? "Especialidade (produção)" só conhece
// DUAS habilidades: Chancela e Carimbo/Clichê. Toda outra categoria do catálogo
// (Tintas, Brindes, Máquinas, Embalagem, Almofadas…) é taxonomia de PRODUTO, não
// habilidade — e por isso não restringe ninguém.
//
// Era exatamente aqui que a reposição automática morria: a regra antiga
// terminava em `especialidade.includes(categoria)`, então "Produzir Tinta papel
// preta" (categoria "Tintas") só seria aceita por alguém com especialidade
// literalmente "Tintas". Ninguém tem. O tablet mostrava "tem ordem chamando", o
// claim devolvia pool vazio, e nada caía na bancada — medido no banco em
// 2026-09-08, com 9 ordens paradas no pool.
export function pessoaAceitaCategoria(esp: string | null | undefined, categoria: string | null | undefined): boolean {
  const alvo = familiaCategoria(categoria);
  if (alvo == null) return true;             // categoria fora do eixo → livre
  const e = normTxt(esp);
  if (!e || e.includes("ambos")) return true; // sem marcação = faz tudo
  const minha = familiaCategoria(e);
  if (minha == null) return true;             // Máquinas/Preparo: quem separa é a FAIXA
  return minha === alvo;
}

/**
 * A pessoa pode pegar ESTA ordem do pool? A regra ÚNICA — tablet, "pegar" do
 * site e a listagem do pool do site perguntam aqui.
 *
 * Ordem da PRODUÇÃO exige especialidade marcada, faixa compatível (máquinas ×
 * preparo × produção) e a bancada certa (chancela × carimbo). Sem
 * especialidade a pessoa não é da bancada — e era por aqui que peça de
 * almofada caía pra quem é da Logística: o Felipe tem setor "Produção" no
 * cadastro, especialidade vazia, e o site só conferia o SETOR (11/09).
 *
 * Ordem de outro setor (Logística…) não usa faixa nem habilidade: quem
 * decide é o setor, conferido fora daqui.
 */
export function podePegarDoPool(
  especialidade: string | null | undefined,
  ordem: { setor?: string | null; faixa?: string | null; categoria?: string | null },
): boolean {
  const setor = normTxt(ordem.setor);
  if (!setor.includes("produc")) return true;
  if (!normTxt(especialidade).trim()) return false;
  return podeFaixa(especialidade, ordem.faixa) && pessoaAceitaCategoria(especialidade, ordem.categoria);
}

// Setor do tablet casa com o da ordem? Lado vazio = sem restrição (o filtro forte
// é a categoria acima — `setor` sempre foi frouxo demais pra separar bancada).
export function setorCasa(devSetor: string | null | undefined, ordemSetor: string | null | undefined): boolean {
  const d = normTxt(devSetor), o = normTxt(ordemSetor);
  if (!d || !o) return true;
  return d.includes(o) || o.includes(d);
}

// Idempotência: marca client_ids como processados; retorna o conjunto já visto.
// ATENÇÃO ao escopo: `device_processed_actions.client_id` é PRIMARY KEY GLOBAL e
// a tabela é COMPARTILHADA por todas as ações de tablet. Consultar só por
// client_id (como era) faz um id repetido — de outro tablet, de outra feature ou
// de um gerador fraco — marcar uma ação NOVA como "já processada" e ela ser
// descartada em silêncio, pra sempre (não há expiração). `opts` permite escopar
// por device e por janela de tempo: a fila offline reenvia em minutos/horas,
// nunca em meses.
export async function jaProcessados(
  clientIds: string[],
  opts: { deviceId?: string; desdeIso?: string } = {},
): Promise<Set<string>> {
  if (!clientIds.length) return new Set();
  const db = createSupabaseAdminClient();
  let q = db.from("device_processed_actions").select("client_id").in("client_id", clientIds);
  if (opts.deviceId) q = q.eq("device_id", opts.deviceId);
  if (opts.desdeIso) q = q.gte("created_at", opts.desdeIso);
  const { data } = await q;
  return new Set((data ?? []).map((r: { client_id: string }) => r.client_id));
}

export async function marcarProcessado(clientId: string, deviceId: string): Promise<void> {
  const db = createSupabaseAdminClient();
  await db.from("device_processed_actions").upsert({ client_id: clientId, device_id: deviceId });
}

// ── Posição na fila do pool, por IDADE ──────────────────────────────────────
// Uma ordem DEVOLVIDA ("não consigo — falta material") reentra na fila pelo FIM:
// vale a hora da devolução, não a de criação. Sem isso ela continuaria sendo a
// mais antiga e voltaria na hora pra mesma pessoa — e como o motivo costuma ser
// do ambiente (material/máquina), ninguém conseguiria fazer agora.
// Usado por /device/claim e /device/pull, que precisam da MESMA ordem: se uma
// entrega X e a outra mostra Y, o tablet chama uma ordem e recebe outra.
// Sem a coluna (supabase/atividades_devolucao.sql não rodado) nada muda.
export interface FilaRow { ordem?: number | null; created_at: string; urgente?: boolean; devolvida_em?: string | null; liberada_apos?: string | null }
export const idadeNaFila = (a: FilaRow) => String(a.devolvida_em || a.created_at);

// FILA DE RECUSADAS (23/09/2026): ordem devolvida no tablet ("não consigo")
// sai da fila de TODO tablet e espera um supervisor em Atividades › Recusadas
// ler o motivo e devolvê-la pra fila. Substituiu o cooldown de 40 min, que
// soltava a ordem sozinho de volta pra mesma parede. A marca é `impedida`
// (o devolver grava true; "Voltar pra fila" grava false).
// `liberada_apos` antigo ainda é respeitado — ordens devolvidas antes da troca
// seguem o prazo que ganharam. Filtra em JS (e não no PostgREST) de propósito:
// sem a coluna o campo chega `undefined` e a ordem passa.
// Usado por /device/claim E /device/pull: se só um filtrasse, o tablet mostraria
// a ordem e receberia "pool vazio" ao aceitar.
export const liberadaAgora = (a: { liberada_apos?: string | null; impedida?: boolean | null }, agora = new Date()) =>
  a.impedida !== true && (!a.liberada_apos || new Date(a.liberada_apos) <= agora);
