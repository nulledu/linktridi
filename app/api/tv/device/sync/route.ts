import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { autorizarTv, respostaAuth } from "../_device";
import { cached } from "@/lib/cache";
import { montarSync, type VersaoPublicada } from "@/lib/tv-frota";

export const dynamic = "force-dynamic";

const ipDe = (req: NextRequest) =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

/**
 * POST /api/tv/device/sync — o coração do agente.
 *
 * A caixa manda, a cada ciclo, a versão que tem instalada; recebe se há
 * atualização e a fila de comandos pendentes. O ciclo comum volta VAZIO
 * (`{atualizacao:null, comandos:[]}`) — só escreve `visto_em`/versão, que é o
 * heartbeat, nunca o dataset inteiro.
 *
 * Marcar os comandos como "entregue" é a única escrita além do heartbeat, e só
 * acontece quando de fato há comando — o poll ocioso não escreve fila.
 */
export async function POST(req: NextRequest) {
  const auth = await autorizarTv(req);
  if (!("device" in auth)) return respostaAuth(auth)!;
  const device = auth.device;

  let b: { versionCode?: number; versionName?: string };
  try { b = await req.json(); } catch { b = {}; }
  const instaladoCode = Number(b.versionCode);

  const db = createSupabaseAdminClient();

  // Heartbeat, versão da frota e fila de comandos são independentes: saem
  // JUNTOS (três idas em série eram três round-trips parados por caixa/ciclo).
  const heartbeat = db.from("tv_dispositivos").update({
    versao_code: Number.isFinite(instaladoCode) ? instaladoCode : null,
    versao_nome: b.versionName ?? null,
    ip: ipDe(req),
    visto_em: new Date().toISOString(),
  }).eq("id", device.id).then(() => {}, () => {});

  // Versão atual da frota: a MESMA para todas as caixas — 1 min de cache por
  // instância. Erro lança dentro do `cached` pra falha não ficar guardada.
  const versao = cached<VersaoPublicada | null>("tv:versao-publicada", 60_000, async () => {
    const { data: vRow, error } = await db.from("tv_versoes")
      .select("version_code,version_name,url,sha256,obrigatoria")
      .eq("publicada", true).order("version_code", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return vRow ? {
      versionCode: Number(vRow.version_code),
      versionName: String(vRow.version_name),
      url: String(vRow.url),
      sha256: String(vRow.sha256),
      obrigatoria: !!vRow.obrigatoria,
    } : null;
  }).catch(() => null);

  // Comandos pendentes desta caixa.
  const fila = db.from("tv_comandos")
    .select("id,tipo,args")
    .eq("dispositivo_id", device.id).eq("status", "pendente")
    .order("criado_em", { ascending: true }).limit(20);

  const [, pub, { data: cmds }] = await Promise.all([heartbeat, versao, fila]);

  const resposta = montarSync(instaladoCode, pub, (cmds ?? []).map((c: { id: string; tipo: string; args: unknown }) => ({
    id: String(c.id), tipo: String(c.tipo), args: c.args,
  })));

  // Só escreve fila quando ENTREGA algo — o tick vazio não escreve.
  if (resposta.comandos.length > 0) {
    await db.from("tv_comandos")
      .update({ status: "entregue", entregue_em: new Date().toISOString() })
      .in("id", resposta.comandos.map((c) => c.id))
      .then(() => {}, () => {});
  }

  return NextResponse.json(resposta, { headers: { "Cache-Control": "no-store" } });
}
