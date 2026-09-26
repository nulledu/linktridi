import { createHmac, timingSafeEqual } from "crypto";

// ── Código de supervisor pra recusa no tablet ────────────────────────────────
//
// Como o cancelamento no caixa do supermercado: quem está na bancada pede pra
// recusar a atividade, o tablet TRAVA, e só um supervisor (Atividades ›
// Autorizar, ou admin) destrava com o código pessoal — decidindo se a recusa
// vale ou não.
//
// O código mora como HMAC (não bcrypt) de propósito: ele IDENTIFICA quem
// digitou, então precisa ser procurável por igualdade e único no banco. Seis
// dígitos são fracos contra força bruta offline, por isso o segredo do HMAC
// fica só no servidor e a rota trava o tablet depois de TENTATIVAS_MAX erros.
//
// A autorização que o tablet recebe é um vale assinado, amarrado à atividade e
// ao tipo da recusa. O /api/device/push só aplica devolver/dispensar com um
// vale válido: sem ele a operação vira "conflito", o app a descarta e o pull
// seguinte devolve a atividade pra pessoa. Vale 24 h porque a bancada trabalha
// offline e a fila pode subir horas depois.

export const PIN_MIN = 4;
export const PIN_MAX = 6;
export const TENTATIVAS_MAX = 5;
export const JANELA_TENTATIVAS_MIN = 5;
const VALIDADE_VALE_MS = 24 * 3600 * 1000;

// `bipe` = justificativa de começar sem bipar o material. Também passa pelo
// supervisor, mas o push NÃO recusa o consumir sem vale: o trabalho já
// aconteceu na bancada (ver aplicarConsumo) — ali o vale só assina o livro.
export type TipoRecusa = "devolver" | "dispensar" | "bipe";
export const ehTipoRecusa = (t: unknown): t is "devolver" | "dispensar" => t === "devolver" || t === "dispensar";
export const ehTipoAutorizavel = (t: unknown): t is TipoRecusa => ehTipoRecusa(t) || t === "bipe";

function segredo(): string {
  const s = process.env.ATIVIDADES_AUTORIZACAO_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("sem segredo pra assinar autorização");
  return s;
}

export function pinValido(pin: unknown): pin is string {
  return typeof pin === "string" && new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

/** Hash procurável do código (único por supervisor). */
export function hashDoPin(pin: string, chave = segredo()): string {
  return createHmac("sha256", chave).update(`pin:${pin}`).digest("hex");
}

/** Código fácil demais de adivinhar na bancada (1111, 1234, 4321…). */
export function pinFraco(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  const d = pin.split("").map(Number);
  const passo = d[1] - d[0];
  return Math.abs(passo) === 1 && d.every((x, i) => i === 0 || x - d[i - 1] === passo);
}

function assinatura(partes: string[], chave: string): string {
  return createHmac("sha256", chave).update(`vale:${partes.join("|")}`).digest("base64url");
}

/** Vale da recusa aprovada: `supervisorId.expira.assinatura`. */
export function emitirVale(atividadeId: string, tipo: TipoRecusa, supervisorId: string, agora = Date.now(), chave = segredo()): string {
  const exp = String(agora + VALIDADE_VALE_MS);
  return `${supervisorId}.${exp}.${assinatura([atividadeId, tipo, supervisorId, exp], chave)}`;
}

/** Confere o vale. Devolve o id do supervisor, ou null. */
export function conferirVale(vale: unknown, atividadeId: string, tipo: TipoRecusa, agora = Date.now(), chave = segredo()): string | null {
  if (typeof vale !== "string") return null;
  const [sup, exp, sig] = vale.split(".");
  if (!sup || !exp || !sig || !/^\d+$/.test(exp) || Number(exp) < agora) return null;
  const esperado = Buffer.from(assinatura([atividadeId, tipo, sup, exp], chave));
  const veio = Buffer.from(sig);
  return esperado.length === veio.length && timingSafeEqual(esperado, veio) ? sup : null;
}
