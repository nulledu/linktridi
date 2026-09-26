"use client";

// ── A única parte que toca hardware ──────────────────────────────────────────
//
// `lib/etiqueta-zpl.ts` diz o QUE imprimir e `lib/impressora-local.ts` diz o
// que cada saída EXIGE. Aqui é o envio, e ele está isolado num arquivo só de
// propósito: nada disto pode ser conferido em teste — não há USB no jsdom, não
// há agente Zebra no CI. Tudo que dá pra decidir sem hardware já foi decidido
// nos dois arquivos puros, e o que sobra aqui é fino e legível de uma vez.
//
// ── AS DUAS PORTAS PRA MESMA IMPRESSORA, E POR QUE AS DUAS EXISTEM ──────────
//
// WebUSB e Zebra Browser Print alcançam o mesmo aparelho por caminhos que se
// excluem, e qual funciona depende do sistema:
//
//  · no macOS e no Linux, o WebUSB costuma pegar direto: nada instalado, a
//    pessoa escolhe a impressora numa lista do próprio navegador.
//  · no WINDOWS com o driver da Zebra instalado, o sistema RECLAMA a interface
//    USB pra ele, e `claimInterface` falha. Não é bug e não tem contorno pelo
//    navegador — quem tem o driver usa o Browser Print, que fala com o driver.
//
// Oferecer só um dos dois deixaria metade das máquinas sem imprimir, com um
// erro que não explica nada. Por isso as duas, e por isso `diagnosticarSaida`
// existe: ela nomeia a situação ANTES do clique.

import {
  zplDaEtiqueta, zplDeTeste, type DpiZpl, type EtiquetaParaZpl,
} from "@/lib/etiqueta-zpl";
import type { ConfigImpressao } from "@/lib/estoque-etiqueta-config";
import type { ImpressoraLocal, Ambiente } from "@/lib/impressora-local";

// ── O ambiente ───────────────────────────────────────────────────────────────

/** Porta do Zebra Browser Print. Ele escuta em 9100 (http) e 9101 (https). */
const AGENTE = "http://localhost:9100";
/**
 * Quanto se espera pelo agente antes de dizer que ele não está lá.
 *
 * Curto de propósito: o agente é local, então ou responde em milissegundos ou
 * não existe. Um timeout generoso aqui vira a tela travada por dez segundos
 * toda vez que alguém abre a página numa máquina sem o aplicativo — que é a
 * maioria delas.
 */
const ESPERA_DO_AGENTE_MS = 1200;

export interface AparelhoDoAgente {
  uid: string;
  name: string;
  connection?: string;
  deviceType?: string;
}

/**
 * `fetch` com prazo. O `signal` é o que de fato corta — um `setTimeout` que só
 * rejeita a promessa deixaria a requisição pendurada aberta contra uma porta
 * que não responde, e cada tentativa somaria mais uma.
 */
async function buscarComTempo(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controle.signal });
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Os aparelhos que o agente conhece — e, de quebra, a prova de que ele existe.
 *
 * `Content-Type` não é enviado de propósito: um `application/json` faria o
 * navegador mandar um preflight `OPTIONS`, e o Browser Print não responde a
 * preflight. A requisição precisa ser "simples" no sentido do CORS, senão ela
 * falha antes de sair — e o sintoma é idêntico ao do agente desligado.
 */
export async function aparelhosDoAgente(): Promise<AparelhoDoAgente[]> {
  try {
    const r = await buscarComTempo(`${AGENTE}/available`, { method: "GET", cache: "no-store" }, ESPERA_DO_AGENTE_MS);
    if (!r.ok) return [];
    const d = await r.json();
    const lista = Array.isArray(d?.printer) ? d.printer : Array.isArray(d) ? d : [];
    return lista
      .map((p: Record<string, unknown>) => ({
        uid: String(p.uid ?? p.name ?? ""),
        name: String(p.name ?? p.uid ?? "Zebra"),
        connection: p.connection ? String(p.connection) : undefined,
        deviceType: p.deviceType ? String(p.deviceType) : undefined,
      }))
      .filter((p: AparelhoDoAgente) => p.uid);
  } catch {
    return [];
  }
}

/** O que ESTE navegador consegue fazer, agora. */
export async function medirAmbiente(): Promise<Ambiente> {
  const temWebUsb = typeof navigator !== "undefined" && "usb" in navigator;
  // `isSecureContext` e não `location.protocol`: em `http://localhost` o
  // contexto É seguro, e é assim que roda o `npm run dev`.
  const seguro = typeof window !== "undefined" && window.isSecureContext === true;
  const ehWindows = typeof navigator !== "undefined" && /Win/i.test(navigator.platform || navigator.userAgent);
  const temAgente = (await aparelhosDoAgente()).length > 0;
  return { temWebUsb, temAgente, ehWindows, seguro };
}

// ── WebUSB ───────────────────────────────────────────────────────────────────

// A classe 7 da USB é "Printer". Filtrar por ela deixa a lista do navegador com
// as impressoras e nada mais — sem filtro, a pessoa vê teclado, webcam e pendrive
// e tem de adivinhar qual é a Zebra.
const CLASSE_IMPRESSORA = 7;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UsbDevice = any;

function usbApi(): { requestDevice: (o: unknown) => Promise<UsbDevice>; getDevices: () => Promise<UsbDevice[]> } | null {
  if (typeof navigator === "undefined" || !("usb" in navigator)) return null;
  return (navigator as unknown as { usb: never }).usb;
}

/**
 * Pede a impressora à pessoa. TEM de ser chamada de dentro de um clique — o
 * navegador recusa `requestDevice` fora de um gesto do usuário, e o erro que
 * ele devolve fala de "user gesture", não de impressora.
 */
export async function escolherImpressoraUsb(): Promise<UsbDevice | null> {
  const usb = usbApi();
  if (!usb) return null;
  try {
    return await usb.requestDevice({ filters: [{ classCode: CLASSE_IMPRESSORA }] });
  } catch {
    // Cancelar a lista é `NotFoundError`, igual a "não achei impressora". Os
    // dois casos terminam em "nada foi escolhido", que é o que devolvemos.
    return null;
  }
}

/** As já autorizadas antes — o que evita repetir a lista a cada etiqueta. */
export async function impressorasUsbJaAutorizadas(): Promise<UsbDevice[]> {
  const usb = usbApi();
  if (!usb) return [];
  try { return await usb.getDevices(); } catch { return []; }
}

/**
 * Manda bytes crus pra uma impressora USB.
 *
 * A sequência (abrir → configurar → reclamar interface → achar o endpoint de
 * saída) é a mesma pra qualquer impressora da classe 7, mas o endpoint NÃO é
 * fixo: numa GK420 ele é o 1, numa ZD421 pode ser o 2. Procurá-lo é o que faz
 * o mesmo código servir aos dois aparelhos.
 */
async function mandarPelaUsb(dev: UsbDevice, bytes: Uint8Array): Promise<void> {
  if (!dev.opened) await dev.open();
  if (!dev.configuration) await dev.selectConfiguration(1);

  const interfaces = dev.configuration?.interfaces ?? [];
  const alvo = interfaces.find((i: UsbDevice) => i.alternate?.interfaceClass === CLASSE_IMPRESSORA) ?? interfaces[0];
  if (!alvo) throw new Error("Este aparelho não expõe uma interface de impressora.");

  await dev.claimInterface(alvo.interfaceNumber);
  const saida = (alvo.alternate?.endpoints ?? []).find(
    (e: UsbDevice) => e.direction === "out" && e.type === "bulk",
  );
  if (!saida) throw new Error("A impressora não expõe um canal de saída — não há por onde mandar o trabalho.");

  await dev.transferOut(saida.endpointNumber, bytes);
  // Liberar a interface devolve a impressora pro sistema. Sem isto, a segunda
  // etiqueta da sessão falha com "device busy" — e a pessoa conclui que
  // imprimir duas vezes seguidas não funciona.
  try { await dev.releaseInterface(alvo.interfaceNumber); } catch { /* já solta */ }
}

// ── Browser Print ────────────────────────────────────────────────────────────

async function mandarPeloAgente(uid: string, zpl: string): Promise<void> {
  const r = await buscarComTempo(`${AGENTE}/write`, {
    method: "POST",
    // `text/plain` mantém a requisição "simples" no sentido do CORS. Ver
    // `aparelhosDoAgente`.
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ device: { uid, name: uid }, data: zpl }),
  }, ESPERA_DO_AGENTE_MS * 4);
  if (!r.ok) throw new Error(`O Browser Print recusou o trabalho (${r.status}).`);
}

// ── A porta que a tela usa ───────────────────────────────────────────────────

export type ResultadoDoEnvio =
  | { ok: true; saiu: "usb" | "agente" }
  // `navegador` não é falha: é a tela tendo de abrir o diálogo de impressão,
  // que é coisa que só o componente faz (ele tem a folha renderizada).
  | { ok: false; usarNavegador: true; frase: string }
  | { ok: false; usarNavegador: false; frase: string };

/**
 * Traduz o erro do navegador na frase de quem está de pé na frente da máquina.
 *
 * Nenhuma destas mensagens nativas menciona impressora: `NetworkError` é o
 * `claimInterface` recusado, `SecurityError` é o gesto que faltou. Repassá-las
 * cruas é o que faz o relato chegar como "deu um erro estranho".
 */
function fraseDoErro(e: unknown): string {
  const nome = (e as { name?: string })?.name ?? "";
  const msg = (e as { message?: string })?.message ?? String(e);
  if (nome === "SecurityError") {
    return "O navegador exige que a escolha da impressora comece num clique seu. Clique de novo no botão de imprimir.";
  }
  if (nome === "NetworkError" || /claim|busy|access denied/i.test(msg)) {
    return "O sistema está segurando esta impressora — é o driver instalado dela. " +
      "Use a saída “Zebra pelo Browser Print”, que fala com o driver em vez de disputar o cabo.";
  }
  if (nome === "NotFoundError") {
    return "Nenhuma impressora foi escolhida.";
  }
  return msg || "Não deu para falar com a impressora.";
}

/** Envia texto ZPL já pronto. */
export async function enviarZpl(impressora: ImpressoraLocal, zpl: string): Promise<ResultadoDoEnvio> {
  try {
    if (impressora.saida === "zebra_agente") {
      if (!impressora.agenteUid) {
        return { ok: false, usarNavegador: false, frase: "Esta impressora não tem aparelho do Browser Print escolhido." };
      }
      await mandarPeloAgente(impressora.agenteUid, zpl);
      return { ok: true, saiu: "agente" };
    }

    if (impressora.saida === "zebra_usb") {
      const jaAutorizadas = await impressorasUsbJaAutorizadas();
      const dev = jaAutorizadas[0] ?? (await escolherImpressoraUsb());
      if (!dev) return { ok: false, usarNavegador: false, frase: "Nenhuma impressora foi escolhida." };
      await mandarPelaUsb(dev, new TextEncoder().encode(zpl));
      return { ok: true, saiu: "usb" };
    }

    return { ok: false, usarNavegador: true, frase: "Esta saída imprime pelo diálogo do navegador." };
  } catch (e) {
    return { ok: false, usarNavegador: false, frase: fraseDoErro(e) };
  }
}

/**
 * A etiqueta de um item, do começo ao papel.
 *
 * O TAMANHO vem da impressora (é o rolo que está nela); o resto da configuração
 * — quais campos saem — vem da empresa. Essa mistura é a decisão do módulo, e
 * está escrita em lib/impressora-local.ts: o banco decide o que a etiqueta É, a
 * máquina decide por onde ela sai e em que rolo.
 */
export async function imprimirEtiqueta(
  impressora: ImpressoraLocal,
  etiqueta: EtiquetaParaZpl,
  config: ConfigImpressao,
  copias?: number,
): Promise<ResultadoDoEnvio> {
  let zpl: string;
  try {
    zpl = zplDaEtiqueta(etiqueta, {
      dpi: impressora.dpi,
      config: { ...config, larguraMm: impressora.larguraMm, alturaMm: impressora.alturaMm },
      copias,
    });
  } catch (e) {
    // Recusa da régua (código que não cabe, caractere proibido). A frase dela
    // já diz o que fazer, e cair no diálogo do navegador aqui seria imprimir
    // torto o que acabou de ser recusado.
    return { ok: false, usarNavegador: false, frase: (e as Error).message };
  }
  return enviarZpl(impressora, zpl);
}

/** A tira de conferência: régua, DPI escrito e uma barra pra bipar. */
export function imprimirTeste(impressora: ImpressoraLocal): Promise<ResultadoDoEnvio> {
  return enviarZpl(impressora, zplDeTeste(impressora.dpi, impressora.larguraMm, Math.max(24, impressora.alturaMm)));
}

export type { DpiZpl };
