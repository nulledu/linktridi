import { timingSafeEqual } from "crypto";

// O worker (num PC da empresa) NÃO recebe a service_role. Ele se autentica com
// um token próprio, guardado no servidor em TRIDIMARKET_WORKER_TOKEN. Mande
// como `Authorization: Bearer <token>` (ou header x-worker-token).
export function workerAutorizado(req: Request): boolean {
  const esperado = process.env.TRIDIMARKET_WORKER_TOKEN;
  if (!esperado || esperado.length < 16) return false; // sem token forte, ninguém entra
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const token = bearer || req.headers.get("x-worker-token") || "";
  if (!token || token.length !== esperado.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(esperado));
  } catch {
    return false;
  }
}
