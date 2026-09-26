import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { dispararAvisos } from "@/lib/financeiro/avisos";

export const dynamic = "force-dynamic";

/**
 * Manda os alertas do Financeiro para o sino de quem tem direito.
 *
 * É POST e é acionado DE PROPÓSITO — por um agendamento diário ou pelo botão da
 * Visão Geral. Nunca por uma página carregando: notificação é escrita, e escrita
 * dentro de ciclo de leitura é exatamente o que já pausou este projeto duas
 * vezes (CLAUDE.md → "o tick comum tem que voltar vazio").
 *
 * Duas portas, e as duas são estreitas:
 *
 * · GENTE precisa de `financeiro:ver`, porque é uma ação do módulo;
 * · MÁQUINA (cron) manda o header `x-financeiro-avisos` com o segredo de
 *   `FINANCEIRO_AVISOS_TOKEN`. Sem a variável no ambiente, esse caminho fica
 *   FECHADO — um segredo vazio que aceita string vazia seria uma porta aberta
 *   escrita como se fosse trava.
 */
export async function POST(req: Request) {
  const segredo = process.env.FINANCEIRO_AVISOS_TOKEN;
  const mandado = req.headers.get("x-financeiro-avisos");
  const ehCron = !!segredo && !!mandado && mandado === segredo;

  if (!ehCron) {
    const eu = await apiFinanceiro("ver");
    if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  }

  const r = await dispararAvisos();
  return NextResponse.json({ ok: true, ...r });
}
