import { NextRequest, NextResponse } from "next/server";
import { audit, ledgerAdjustmentInput, marketApiError, marketDb, marketRepository, parseProfileIds, paymentInput, requireMarketAdmin } from "../_shared";

export const dynamic = "force-dynamic";

// A tela manda o método em inglês; a coluna aceita só os valores do CHECK.
const METODO_DO_PAINEL: Record<string, string> = {
  cash: "dinheiro", pix: "pix", card: "cartao", transfer: "transferencia", other: "outro",
};


export async function GET(req: NextRequest) {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const employees = await marketRepository().employees(parseProfileIds(req.url));
    const totals = employees.reduce((acc, e) => ({ open: acc.open + e.open, overdue: acc.overdue + e.overdue }), { open: 0, overdue: 0 });
    return NextResponse.json({ ok: true, data: { employees, ...totals } });
  } catch (error) { return marketApiError(error); }
}

export async function POST(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const payment = paymentInput.safeParse(body);
  const adjustment = ledgerAdjustmentInput.safeParse(body);
  if (!payment.success && !adjustment.success) return NextResponse.json({ ok: false, error: "invalid_finance_entry" }, { status: 422 });
  const db = marketDb();
  try {
    if (payment.success) {
      // O RAZÃO é quem abate a dívida. Esta inserção estava errada em quatro
      // pontos e por isso QUITAR NUNCA FUNCIONOU:
      //   • `id` é bigint identity — mandavam um uuid;
      //   • `tipo: "payment"` viola o CHECK (compra/pagamento/credito/debito/
      //     estorno);
      //   • `created_by` não existe na tabela;
      // e o erro voltava como "market_schema_missing", mandando procurar
      // migração em vez do bug.
      const { error } = await db.from("lancamentos").insert({
        funcionario_id: payment.data.employeeId,
        unidade_id: payment.data.profileId,
        tipo: "pagamento",
        valor: -payment.data.amount,          // negativo abate
        descricao: payment.data.note || "Pagamento",
      });
      if (error) throw error;

      // `pagamentos` é o registro do RECEBIMENTO (quanto, como, quem lançou) —
      // as colunas também são em português, e `ledger_entry_id` não existe.
      const { error: payError } = await db.from("pagamentos").insert({
        funcionario_id: payment.data.employeeId,
        unidade_id: payment.data.profileId,
        valor: payment.data.amount,
        metodo: METODO_DO_PAINEL[payment.data.method] ?? "outro",
        observacao: payment.data.note ?? null,
        registrado_por: actor.id,
      });
      if (payError) throw payError;
      await audit(actor.id, "payment.create", "employee", payment.data.employeeId, undefined, { valor: payment.data.amount, metodo: payment.data.method });
    } else if (adjustment.success) {
      // `kind` não existe: a coluna é `tipo`, com os mesmos valores do CHECK.
      const { error } = await db.from("lancamentos").insert({
        funcionario_id: adjustment.data.employeeId,
        unidade_id: adjustment.data.profileId,
        tipo: adjustment.data.amount < 0 ? "credito" : "debito",
        valor: adjustment.data.amount,
        descricao: adjustment.data.description,
      });
      if (error) throw error;
      await audit(actor.id, "ledger.adjust", "employee", adjustment.data.employeeId, undefined, adjustment.data);
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return marketApiError(error); }
}

