import { NextRequest, NextResponse } from "next/server";
import { createTridiMarketAdminClient } from "../../../../../lib/tridimarket/client";
import { TridiMarketRepository } from "../../../../../lib/tridimarket/repository";
import { authorizeDevice, deviceAuthFailure } from "../_device";
import { criarConcessaoOffline, saltDoDispositivo, verificadorDeCodigo } from "../_sessao";

// Quanto tempo o tablet continua reconhecendo códigos depois de perder a rede.
// Generoso de propósito: uma queda de Wi-Fi não pode parar o mercadinho, e a
// concessão é renovada em todo bootstrap bem-sucedido.
const DIAS_DE_AUTONOMIA = 30;

export async function GET(req: NextRequest) {
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure(auth.reason);
  const device = auth.device;
  try {
    const db = createTridiMarketAdminClient();
    const repo = new TridiMarketRepository(db);
    // Funcionários de TODAS as unidades: qualquer pessoa compra em qualquer
    // tablet, então o diretório offline não pode ser só o da unidade daqui.
    const [profiles, products, employees] = await Promise.all([
      repo.profiles([device.profileId]),
      repo.products([device.profileId]),
      repo.employees(),
    ]);

    // Códigos de acesso → verificador. O código em si NUNCA sai do servidor.
    const { data: codigos } = await db
      .from("funcionarios").select("id,codigo_acesso").eq("ativo", true).not("codigo_acesso", "is", null);
    const salt = saltDoDispositivo(device.id);
    const porId = new Map<number, string>(
      (codigos ?? []).map((r: { id: number; codigo_acesso: unknown }) => [Number(r.id), String(r.codigo_acesso)]),
    );

    const diretorio = employees
      .filter((e) => e.active && porId.has(e.id))
      .map((e) => ({
        id: e.id, profileId: e.profileId, companyId: e.companyId, name: e.name, imageUrl: e.imageUrl,
        normalLimit: e.normalLimit, overdraftLimit: e.overdraftLimit, overdue: e.overdue,
        // "Em aberto" no totem é o GASTO DO MÊS — ver empregadoParaTotem.
        open: e.cycleOpen, totalOpen: e.open, previousOpen: e.previousOpen,
        available: e.available, status: e.status,
        codeHash: verificadorDeCodigo(porId.get(e.id)!, salt),
      }));

    const validoAte = new Date(Date.now() + DIAS_DE_AUTONOMIA * 86_400_000).toISOString();
    return NextResponse.json({
      ok: true,
      data: {
        device, profile: profiles[0] ?? null, products,
        employees: diretorio,
        authSalt: salt,
        offlineGrant: criarConcessaoOffline(device.id, validoAte),
        offlineGrantExpiresAt: validoAte,
        rulesVersion: 1, serverTime: new Date().toISOString(), maxOfflineHours: DIAS_DE_AUTONOMIA * 24,
      },
    });
  } catch (error) { return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 503 }); }
}
