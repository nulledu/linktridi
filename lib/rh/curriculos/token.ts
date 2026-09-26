// ── Tokens da candidatura (servidor) ─────────────────────────────────────────
// Dois segredos, dois usos:
//
// 1. O FORMULÁRIO PÚBLICO (/candidatura) é anônimo. Antes de pedir a URL
//    assinada do currículo, ele pede um "início" — um carimbo HMAC com a hora,
//    válido por 6 h. É a mesma ideia do `adotarSessao` do player do TridiFlow
//    (visitante real e recente), sem tabela: quem tem o carimbo pode subir UM
//    arquivo de até 10 MB na área `curriculos`; sem ele, a rota diz não.
//
// 2. O WEBHOOK (/api/candidatura/webhook) autentica por Bearer token gerado
//    na tela de integração. O banco guarda só o sha256; o texto aparece uma
//    vez, na hora de gerar.
//
// O segredo é a service key (como os tablets do ponto e do estoque fazem), em
// namespace próprio: mesmo segredo, nunca o mesmo carimbo.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

const SEGREDO = () => {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente");
  return s;
};

const VALIDADE_MS = 6 * 60 * 60 * 1000;

function assinar(texto: string): string {
  return createHmac("sha256", SEGREDO()).update(`rh-candidatura|${texto}`).digest("base64url");
}

/** `<emitidoEm>.<nonce>.<assinatura>` */
export function emitirInicio(agora = Date.now()): string {
  const corpo = `${agora}.${randomBytes(8).toString("base64url")}`;
  return `${corpo}.${assinar(corpo)}`;
}

export function inicioValido(token: unknown, agora = Date.now()): boolean {
  if (typeof token !== "string" || token.length > 200) return false;
  const partes = token.split(".");
  if (partes.length !== 3) return false;
  const [emitido, nonce, ass] = partes;
  const t = Number(emitido);
  if (!Number.isFinite(t) || t > agora + 60_000 || agora - t > VALIDADE_MS) return false;
  const esperada = assinar(`${emitido}.${nonce}`);
  if (esperada.length !== ass.length) return false;
  return timingSafeEqual(Buffer.from(esperada), Buffer.from(ass));
}

/** Token do webhook: 32 bytes, prefixo legível pra quem cola no TridiFlow. */
export function gerarTokenWebhook(): { token: string; hash: string; dica: string } {
  const token = `rhc_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashDoToken(token), dica: token.slice(-4) };
}

export const hashDoToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function tokenConfere(token: string | null | undefined, hash: string | null | undefined): boolean {
  if (!token || !hash) return false;
  const h = hashDoToken(token);
  if (h.length !== hash.length) return false;
  return timingSafeEqual(Buffer.from(h), Buffer.from(hash));
}

/** Lê o Bearer do cabeçalho (ou `?token=` — o TridiFlow manda por header, mas o teste manual usa a query). */
export function tokenDaRequisicao(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  if (m) return m[1];
  const alt = req.headers.get("x-webhook-token");
  if (alt) return alt.trim();
  return new URL(req.url).searchParams.get("token");
}
