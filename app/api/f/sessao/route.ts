import { NextRequest, NextResponse } from "next/server";
import { acharTelefone, adotarSessao, criarSessao, atualizarSessao, enviarLeadWebhook, enviarLeadInterno } from "@/lib/tridiflow-db";
import { modoRemoto, encaminharPara } from "@/lib/player-remoto";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PÚBLICO (player do anúncio). POST { botId, utm?, adotar? } → { sessaoId }.
//
// `adotar` é a sessão que veio da landing page (o `tf_s` da URL). Continuar a
// sessão em vez de abrir outra é o que impede o MESMO lead de virar duas linhas
// em tridiflow_sessoes — a segunda sem os UTMs, que é o que o Tridify usa pra
// atribuir a venda ao anúncio.
export async function POST(req: NextRequest) {
  // Servidor dedicado aos chats: não tem banco — encaminha pro Gaius.
  if (modoRemoto()) return encaminharPara(req, "/api/f/sessao");
  const b = (await req.json().catch(() => ({}))) as { botId?: string; utm?: Record<string, string>; adotar?: string };
  if (!b.botId) return NextResponse.json({ error: "missing_bot" }, { status: 400 });

  // Sessão herdada só quando o formato bate e ela ainda é recente. Falhou
  // qualquer uma das duas? Abre uma nova — o funil nunca deixa de funcionar
  // por causa de um parâmetro estranho na URL.
  if (b.adotar && UUID.test(b.adotar)) {
    const herdada = await adotarSessao(b.adotar).catch(() => null);
    if (herdada) return NextResponse.json({ sessaoId: herdada, herdada: true });
  }

  const utm: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.utm ?? {})) {
    if (/^(utm_|fbclid|ttclid|gclid)/.test(k) && typeof v === "string") utm[k.slice(0, 64)] = v.slice(0, 300);
  }
  const sessaoId = await criarSessao(b.botId, utm);
  return NextResponse.json({ sessaoId });
}

// PATCH { sessaoId, respostas?, ultimaEtapa?, concluida? } → grava progresso do lead.
export async function PATCH(req: NextRequest) {
  if (modoRemoto()) return encaminharPara(req, "/api/f/sessao");
  const b = (await req.json().catch(() => ({}))) as { sessaoId?: string; respostas?: Record<string, string>; ultimaEtapa?: string; concluida?: boolean };
  if (!b.sessaoId) return NextResponse.json({ error: "missing_sessao" }, { status: 400 });
  const respostas: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.respostas ?? {})) {
    if (typeof v === "string") respostas[k.slice(0, 64)] = v.slice(0, 2000);
  }
  await atualizarSessao(b.sessaoId, { respostas: Object.keys(respostas).length ? respostas : undefined, ultimaEtapa: b.ultimaEtapa, concluida: b.concluida });
  // Manda o lead pros destinos: webhook externo (Sheets/n8n/CRM/distribuição)
  // e/ou o Comercial interno (Gaia → aba Leads).
  //
  // NÃO espera concluir. A maior parte das pessoas larga o funil no meio, e o
  // telefone de quem largou vale igual — o vendedor liga do mesmo jeito. Assim
  // que o número aparece nas respostas o lead sai; a trava `lead_enviado_em`
  // garante um envio só por sessão, então concluir depois não repete.
  const temTelefone = !!acharTelefone(respostas);
  if (b.concluida || temTelefone) {
    await Promise.all([
      enviarLeadWebhook(b.sessaoId, { parcial: !b.concluida }).catch(() => {}),
      enviarLeadInterno(b.sessaoId).catch(() => {}),
    ]);
  }
  return NextResponse.json({ ok: true });
}
