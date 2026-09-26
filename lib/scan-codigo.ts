// Regras do leitor de código de barras no navegador.
//
// PORTE de tridimarket-app/.../scan/ScanRules.kt — de propósito, linha a linha.
// O tablet e o dashboard precisam aceitar EXATAMENTE os mesmos códigos: se o
// web casasse por igualdade exata enquanto o app tolera UPC-A/zeros à esquerda,
// o mesmo produto daria "não encontrado" no dashboard e encontrado no tablet,
// com a embalagem na mão da pessoa — o pior tipo de bug, porque parece cadastro
// errado. Mudou lá, mude aqui (e vice-versa); os testes cobrem os dois.

/** Janela anti-repetição: a mesma embalagem parada na frente da lente dispara
 *  dezenas de leituras por segundo. */
export const JANELA_REPETICAO_MS = 1_500;

export interface ScanState { ultimoCodigo: string | null; ultimoEmMs: number }
export const SCAN_INICIAL: ScanState = { ultimoCodigo: null, ultimoEmMs: 0 };

export type ScanResultado =
  | { tipo: "aceito"; codigo: string }
  | { tipo: "repetido" }
  | { tipo: "invalido" };

export interface ScanTransicao { estado: ScanState; resultado: ScanResultado }

export function normalizarCodigo(bruto: string | null | undefined): string {
  return (bruto ?? "").trim();
}

export function reduceScan(
  estado: ScanState,
  bruto: string | null | undefined,
  agoraMs: number,
  janelaMs: number = JANELA_REPETICAO_MS,
): ScanTransicao {
  const codigo = normalizarCodigo(bruto);
  if (!codigo) return { estado, resultado: { tipo: "invalido" } };
  // A janela DESLIZA: cada leitura repetida empurra o prazo pra frente, então o
  // código só volta a valer depois de sumir de vista por `janelaMs`. Com janela
  // fixa, segurar o produto três segundos na frente da lente contaria de novo.
  if (codigo === estado.ultimoCodigo && agoraMs - estado.ultimoEmMs < janelaMs) {
    return { estado: { ...estado, ultimoEmMs: agoraMs }, resultado: { tipo: "repetido" } };
  }
  return { estado: { ultimoCodigo: codigo, ultimoEmMs: agoraMs }, resultado: { tipo: "aceito", codigo } };
}

/** Depois de usar o código, o próximo bipe do mesmo item vale de novo. */
export function liberarRepeticao(estado: ScanState): ScanState {
  return { ...estado, ultimoCodigo: null, ultimoEmMs: 0 };
}

// ── Casar o código lido com o produto ───────────────────────────────────────
// O cadastro nem sempre guarda o código como o scanner devolve:
//  • UPC-A tem 12 dígitos e o mesmo produto costuma estar cadastrado como
//    EAN-13, que é o UPC com um zero na frente;
//  • há cadastros com zeros à esquerda sobrando ou faltando.
export function chavesDeBusca(codigo: string): string[] {
  const limpo = normalizarCodigo(codigo);
  if (!limpo) return [];
  const chaves = new Set<string>([limpo]);
  if (/^\d+$/.test(limpo)) {
    chaves.add(limpo.replace(/^0+/, "") || "0");
    if (limpo.length === 12) chaves.add("0" + limpo);
    if (limpo.length === 13 && limpo.startsWith("0")) chaves.add(limpo.slice(1));
  }
  return [...chaves];
}

// ── Formatos que interessam ─────────────────────────────────────────────────
// Só os de produto. Ler QR/PDF417 aqui faria a câmera "achar" o QR do cartaz
// atrás da prateleira e preencher o campo com uma URL.
export const FORMATOS_PRODUTO = [
  "ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf",
] as const;
