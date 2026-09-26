import { NextRequest, NextResponse } from "next/server";
import { createTridiMarketAdminClient } from "../../../../../lib/tridimarket/client";
import { TridiMarketRepository } from "../../../../../lib/tridimarket/repository";
import { authorizeDevice, authorizeEmployeeSession, deviceAuthFailure, devicePurchaseInput } from "../_device";
import { validarConcessaoOffline } from "../_sessao";
import { auditDevice } from "../../_shared";

export async function POST(req: NextRequest) {
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure(auth.reason);
  const device = auth.device;
  const parsed = devicePurchaseInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_purchase", issues: parsed.error.flatten() }, { status: 422 });
  // Valida a sessão contra a HORA DA COMPRA no tablet, não contra agora: uma
  // compra legítima que esperou dias na fila offline não pode ser recusada só
  // porque a sessão venceu enquanto o tablet estava sem rede.
  const momentoDaCompra = new Date(parsed.data.deviceOccurredAt).getTime();
  const sessaoDoFuncionario = await authorizeEmployeeSession(req, device.id, parsed.data.employeeId, momentoDaCompra);
  // Compra autenticada OFFLINE pelo próprio tablet (código conferido contra o
  // diretório local). Aí não existe sessão emitida pelo servidor — o que vale é
  // a concessão do dispositivo, que o painel pode revogar junto com o tablet.
  const concessaoOffline = !sessaoDoFuncionario && validarConcessaoOffline(req.headers.get("x-market-session"), device.id, momentoDaCompra);
  if (!sessaoDoFuncionario && !concessaoOffline) return NextResponse.json({ ok: false, error: "invalid_employee_session" }, { status: 401 });
  try {
    const db = createTridiMarketAdminClient();
    // Sem travar no perfil do tablet: qualquer funcionário ATIVO pode comprar em
    // qualquer tablet. A separação dívida/estoque é feita abaixo.
    const { data: employee, error: employeeError } = await db.from("funcionarios").select("unidade_id,ativo").eq("id", parsed.data.employeeId).eq("ativo", true).maybeSingle();
    if (employeeError) throw employeeError;
    if (!employee) return NextResponse.json({ ok: false, error: "employee_not_available" }, { status: 409 });
    const result = await new TridiMarketRepository(db).syncPurchase({
      ...parsed.data,
      deviceId: device.id,
      profileId: String(employee.unidade_id),   // dívida → unidade do funcionário
      stockProfileId: device.profileId,        // estoque → unidade do tablet
    });
    // Trilha de auditoria da VENDA (item 7 do roadmap). É a operação mais
    // sensível do mercadinho — offline, sem supervisão e podendo vender sem
    // estoque — e era a única sem registro. `await` de propósito: em serverless
    // um fire-and-forget morre quando a resposta retorna.
    await auditDevice(device.id, "device.purchase", "purchase", null, {
      employeeId: parsed.data.employeeId,
      ocorridoEmAparelho: parsed.data.deviceOccurredAt,
      autenticacao: sessaoDoFuncionario ? "sessao_servidor" : "concessao_offline",
      resultado: result,
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) { return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 503 }); }
}
