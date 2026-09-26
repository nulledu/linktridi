import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { sincronizarYampi } from "@/lib/yampi-warehouse";
import { yampiConfigurado } from "@/lib/yampi-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron da Vercel manda Bearer CRON_SECRET. FAIL-CLOSED: sem segredo
// configurado, ninguém entra por esta porta. Rota de máquina é pública no
// middleware (o cron chega sem cookie), então o segredo conferido aqui é o
// único portão — "sem CRON_SECRET = liberado" seria a internet inteira
// disparando o sync. Quem está logado com acesso a Tráfego continua entrando
// pela porta da sessão, logo abaixo.
function autorizadoCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

const hojeSp = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const menosDias = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") - n * 864e5).toISOString().slice(0, 10);
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET → sincroniza a Yampi no espelho local.
 *
 * Janela padrão de 7 dias para trás, não só "hoje": o pedido muda depois de
 * criado (pix que paga no dia seguinte, valor ajustado), e uma janela de um dia
 * congelaria a versão da meia-noite. O `upsert` por número corrige a linha.
 */
export async function GET(req: NextRequest) {
  // Cron OU quem tem acesso a Tráfego — o segundo é o botão "Atualizar" da
  // tela, que em produção levaria 401 se só o cron pudesse chamar.
  if (!autorizadoCron(req) && !(await getProfileForModule("trafego"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!yampiConfigurado()) {
    // 200 de propósito: ambiente sem credencial não é falha, é o app seguindo
    // no ERP como antes. Erro aqui faria o cron da Vercel alarmar todo dia.
    return NextResponse.json({ ok: true, configurado: false, lojas: [] });
  }

  const sp = new URL(req.url).searchParams;
  const ate = DIA.test(sp.get("ate") ?? "") ? sp.get("ate")! : hojeSp();
  const de = DIA.test(sp.get("de") ?? "") ? sp.get("de")! : menosDias(ate, 7);

  const lojas = await sincronizarYampi(de, ate);
  const falhou = lojas.some((l) => l.erro);
  return NextResponse.json({ ok: !falhou, configurado: true, de, ate, lojas }, { status: falhou ? 502 : 200 });
}
