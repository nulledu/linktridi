import { carregarPainel } from "@/lib/contingencia";
import { gateContingencia, json, erro } from "./_gate";

export const dynamic = "force-dynamic";

// GET — a tela inteira numa ida só: consolidado + listas + último snapshot.
// Nada aqui muda sozinho, então não há poll: quem muda é quem está na tela
// (ver CLAUDE.md · dados).
export async function GET() {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  try {
    return json({ ok: true, painel: await carregarPainel() });
  } catch (e) { return erro(e, "contingencia_error"); }
}
