// ── Sinal de "algo mudou" para as TVs ────────────────────────────────────────
// Um cutucão, não um canal de dados — o mesmo desenho de lib/tridichat/sinal.ts.
//
// A TV escutava só por poll: `/api/config` a cada 10 ciclos, com recuo até
// 5 min, dava até ~50 min entre salvar um perfil no editor e vê-lo na parede;
// a frota olhava a versão a cada 60 s. Poll mais rápido resolvia a latência
// pagando invocação na Vercel (a conta que já pausou o projeto). O broadcast
// do Supabase Realtime resolve as duas coisas: a TV recebe o aviso pelo
// socket (que fala com o Supabase, não com a Vercel) e só então busca o dado
// pela rota de sempre.
//
// O que trafega é só o nome do evento e um payload mínimo (versão, ids de
// aparelho). Nada de layout, nada de dado de venda.

import { TV_SINAL_TOPICO, type TvSinalEvento } from "./tv-sinal-nomes";

/**
 * Cutuca as TVs: "algo mudou, vá buscar".
 *
 * Nunca lança e nunca segura a resposta por mais de 3 s: é enfeite de
 * latência. Se o Realtime estiver desligado, ou a rede falhar, o poll de
 * reserva cobre — a única diferença é a mudança demorar alguns minutos.
 */
export async function avisarTv(evento: TvSinalEvento, payload: Record<string, unknown> = {}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: chave, authorization: `Bearer ${chave}` },
      body: JSON.stringify({ messages: [{ topic: TV_SINAL_TOPICO, event: evento, payload }] }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch { /* sem sinal, o poll cobre */ }
}
