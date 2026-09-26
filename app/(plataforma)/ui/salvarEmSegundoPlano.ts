"use client";

// ── Salvar em segundo plano ──────────────────────────────────────────────────
//
// Quem edita não espera o servidor: a tela diz "salvo" na hora e o pedido
// segue por esta fila. O dono pediu assim (set/2026): o editor de item levava
// segundos pra fechar — a rota rodava a varredura de reposição dentro do
// salvar — e ninguém ficava olhando o botão girar.
//
// Três promessas, e cada uma é o que torna "otimista" seguro:
//  1. O pedido NÃO se perde. Ele mora no localStorage antes de sair: aba
//     fechada, Wi-Fi caindo, sessão expirando — na próxima vez que o app abrir
//     (ou a rede voltar), a fila continua de onde parou.
//  2. Falha AVISA. Recusa do servidor (validação, permissão, conflito) sai
//     como toast com a frase do servidor; falta de rede avisa uma vez que está
//     guardado e vai tentar sozinho.
//  3. Reenviar é inofensivo. Quem enfileira manda pedido idempotente (a
//     quantidade vai com trava — `quantidade_antes` — e o resto é gravar o
//     mesmo valor de novo). A fila não inventa idempotência que a rota não tem.
//
// Sucesso só conta com JSON de verdade: a sessão expirada vira 200 + HTML da
// tela de login (ver ./rede.ts), e isso aqui já foi "salvo" que não salvou.

import { toast } from "../Toast";
import { respostaConfiavel } from "./rede";

export interface PedidoDeSalvar {
  /** Pedido novo com a MESMA chave substitui o que ainda não saiu — dois
   *  Salvar seguidos no mesmo item viram um só (o último). */
  chave?: string;
  /** Como a tela chama a coisa ("Borracha A4"). Vai na frase do aviso. */
  rotulo: string;
  url: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

interface NaFila extends PedidoDeSalvar {
  id: string;
  tentativas: number;
  proximaEm: number;
}

type Destino = "ok" | "tentar_de_novo" | "recusado" | "sessao";

/**
 * Pura: o que fazer com a resposta. `status` nulo = nem chegou a responder
 * (rede caiu, servidor fora). 408/425/429/5xx também são "tenta de novo";
 * o resto de 4xx é recusa de verdade — repetir daria a mesma recusa.
 */
export function destinoDaResposta(status: number | null, confiavel: boolean): Destino {
  if (status === null) return "tentar_de_novo";
  if (status >= 200 && status < 300) return confiavel ? "ok" : "sessao";
  if (status === 401) return "sessao";
  if (status === 408 || status === 425 || status === 429 || status >= 500) return "tentar_de_novo";
  return "recusado";
}

/** Pura: espera antes da tentativa `n` (1ª = 2s), dobrando até 1 minuto. */
export function esperaDaTentativa(n: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, n - 1));
}

const CHAVE_LS = "gaius:salvar-em-segundo-plano:v1";
const TRAVA = "gaius-salvar-em-segundo-plano";

function ler(): NaFila[] {
  try {
    const bruto = localStorage.getItem(CHAVE_LS);
    const v = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function gravar(fila: NaFila[]) {
  try { localStorage.setItem(CHAVE_LS, JSON.stringify(fila)); } catch { /* sem armazenamento: segue só em memória */ }
}

// Em memória, por aba: o que a TELA quer saber quando o pedido termina
// (recarregar a lista, por exemplo). Não sobrevive a recarregar — e não
// precisa: quem recarrega já lê o banco atualizado.
const aoTerminar = new Map<string, (ok: boolean, detalhe?: string) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let rodando = false;
let avisouSemRede = false;
let avisouSessao = false;

/** Enfileira e já tenta mandar. Quem chama mostra o "salvo" — aqui só se
 *  fala quando dá problema. */
export function salvarEmSegundoPlano(
  pedido: PedidoDeSalvar,
  opts?: { aoTerminar?: (ok: boolean, detalhe?: string) => void },
): void {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let fila = ler();
  if (pedido.chave) {
    // O último vence: o que ainda não saiu com a mesma chave é substituído.
    for (const velho of fila.filter((p) => p.chave === pedido.chave)) aoTerminar.delete(velho.id);
    fila = fila.filter((p) => p.chave !== pedido.chave);
  }
  fila.push({ ...pedido, id, tentativas: 0, proximaEm: 0 });
  gravar(fila);
  if (opts?.aoTerminar) aoTerminar.set(id, opts.aoTerminar);
  void processar();
}

/** Quantos pedidos esperam — pra quem quiser mostrar "salvando…". */
export function pedidosPendentes(): number { return ler().length; }

async function mandar(p: NaFila): Promise<{ destino: Destino; detalhe?: string }> {
  try {
    const r = await fetch(p.url, {
      method: p.method,
      headers: p.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: p.body !== undefined ? JSON.stringify(p.body) : undefined,
      keepalive: true,
    });
    // Resposta de verdade sempre tem cabeçalhos; só o dublê de teste vem sem.
    // Com eles, a regra de ./rede.ts vale inteira (200 + HTML = sessão expirada).
    const confiavel = typeof r.headers?.get === "function" ? respostaConfiavel(r) : true;
    const destino = destinoDaResposta(r.status, confiavel);
    if (destino === "recusado") {
      const d = await r.json().catch(() => ({} as Record<string, unknown>));
      return { destino, detalhe: String(d.detalhe ?? d.detail ?? d.error ?? `erro ${r.status}`) };
    }
    return { destino };
  } catch {
    return { destino: "tentar_de_novo" };
  }
}

async function rodada(): Promise<void> {
  // Relê a cada pedido: outra aba (ou esta, noutro componente) pode ter
  // enfileirado no meio.
  for (;;) {
    const agora = Date.now();
    const fila = ler();
    const vez = fila.find((p) => p.proximaEm <= agora);
    if (!vez) {
      const proxima = fila.reduce((m, p) => Math.min(m, p.proximaEm), Infinity);
      if (Number.isFinite(proxima)) agendar(Math.max(500, proxima - agora));
      return;
    }
    const { destino, detalhe } = await mandar(vez);
    const depois = ler();
    if (destino === "ok" || destino === "recusado") {
      gravar(depois.filter((p) => p.id !== vez.id));
      aoTerminar.get(vez.id)?.(destino === "ok", detalhe);
      aoTerminar.delete(vez.id);
      if (destino === "recusado") toast.erro(`Não salvou ${vez.rotulo}: ${detalhe}`);
      if (destino === "ok" && avisouSemRede && !depois.some((p) => p.id !== vez.id)) {
        avisouSemRede = false;
        toast.ok("Voltou a conexão — tudo o que estava guardado foi salvo.");
      }
      continue;
    }
    // Não deu agora: fica guardado, com espera crescente.
    const tentativas = vez.tentativas + 1;
    gravar(depois.map((p) => p.id === vez.id ? { ...p, tentativas, proximaEm: Date.now() + esperaDaTentativa(tentativas) } : p));
    if (destino === "sessao" && !avisouSessao) {
      avisouSessao = true;
      toast.erro("Sua sessão expirou — entre de novo. O que você mudou está guardado aqui e salva quando você voltar.");
    } else if (destino === "tentar_de_novo" && !avisouSemRede) {
      avisouSemRede = true;
      toast.info("Sem conexão com o servidor — o que você mudou fica guardado neste navegador e salva sozinho.");
    }
  }
}

function agendar(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void processar(); }, ms);
}

async function processar(): Promise<void> {
  if (rodando || typeof window === "undefined") return;
  rodando = true;
  try {
    // Uma aba de cada vez: com duas abertas, as duas mandariam o mesmo
    // pedido. A trava do navegador (Web Locks) resolve; sem ela (navegador
    // antigo), segue sem — o pedido é idempotente, só custa uma ida a mais.
    const locks = (navigator as Navigator & { locks?: { request: (n: string, o: object, f: () => Promise<void>) => Promise<unknown> } }).locks;
    if (locks) await locks.request(TRAVA, { ifAvailable: false }, rodada);
    else await rodada();
  } finally {
    rodando = false;
    // Pedido que entrou no instante em que a rodada fechava encontrou
    // `rodando = true` e desistiu — e, sem outro na fila, nenhum temporizador
    // o acordaria. Confere de novo antes de soltar.
    if (ler().some((p) => p.proximaEm <= Date.now())) void processar();
  }
}

/** Liga a fila (uma vez, no Shell): retoma o que ficou de outra visita,
 *  tenta de novo quando a rede volta e quando a aba volta à frente. */
export function iniciarFilaDeSalvamento(): () => void {
  const retomar = () => {
    // Volta de rede/aba: o que estava esperando o recuo tenta já.
    const fila = ler();
    if (!fila.length) return;
    gravar(fila.map((p) => ({ ...p, proximaEm: 0 })));
    void processar();
  };
  const aoVoltarAba = () => { if (document.visibilityState === "visible") retomar(); };
  window.addEventListener("online", retomar);
  document.addEventListener("visibilitychange", aoVoltarAba);
  void processar();
  return () => {
    window.removeEventListener("online", retomar);
    document.removeEventListener("visibilitychange", aoVoltarAba);
  };
}
