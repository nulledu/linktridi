import { NextRequest, NextResponse } from "next/server";
import { audit, deviceCodeInput, makeDeviceCode, marketApiError, marketDb, requireMarketAdmin } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const db = marketDb();
    const [{ data: devices, error }, { data: codes, error: codeError }] = await Promise.all([
      db.from("dispositivos").select("id,unidade_id,nome,ativo,versao_app,bateria,visto_em,criado_em").order("criado_em", { ascending: false }),
      db.from("dispositivo_codigos").select("codigo,unidade_id,nome,expira_em,usado_em,criado_em").is("usado_em", null).gt("expira_em", new Date().toISOString()).order("criado_em", { ascending: false }),
    ]);
    if (error) throw error;
    if (codeError) throw codeError;
    return NextResponse.json({ ok: true, data: { devices: devices ?? [], codes: codes ?? [] } });
  } catch (error) { return marketApiError(error); }
}

export async function POST(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const parsed = deviceCodeInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_device" }, { status: 422 });
  try {
    const db = marketDb();
    let code = makeDeviceCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      // Colunas em PORTUGUÊS (codigo/nome/expira_em). Estava gravando
      // code/device_name/expires_at, que não existem — então gerar código de
      // tablet falhava sempre, e sem código nenhum aparelho novo entrava.
      const { error } = await db.from("dispositivo_codigos").insert({ codigo: code, unidade_id: parsed.data.profileId, nome: parsed.data.name, expira_em: new Date(Date.now() + 24 * 3600_000).toISOString() });
      if (!error) {
        await audit(actor.id, "device.code.create", "profile", parsed.data.profileId, undefined, { name: parsed.data.name });
        return NextResponse.json({ ok: true, data: { code, expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString() } });
      }
      if (!/duplicate key/i.test(error.message)) throw error;
      code = makeDeviceCode();
    }
    throw new Error("could_not_allocate_device_code");
  } catch (error) { return marketApiError(error); }
}

export async function PATCH(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null) as { id?: string; active?: boolean; name?: string; profileId?: string } | null;
  if (!body?.id) return NextResponse.json({ ok: false, error: "invalid_device" }, { status: 422 });
  try {
    const db = marketDb();
    // Mudar o tablet de empresa. Faltava: dava pra renomear e revogar, mas o
    // vínculo com a unidade só se definia no pareamento — e é dele que sai o
    // ESTOQUE de cada compra. Um aparelho na empresa errada tira do estoque
    // errado, calado. Aparece quando duas empresas se fundem (os tablets da
    // que sumiu vão todos pra que ficou) ou quando o tablet troca de loja.
    if (typeof body.profileId === "string") {
      const { data: unidade, error: erroUnidade } = await db.from("unidades")
        .select("id,nome").eq("id", body.profileId).maybeSingle();
      if (erroUnidade) throw erroUnidade;
      if (!unidade) return NextResponse.json({ ok: false, error: "unidade_inexistente" }, { status: 422 });
      const { data: antes } = await db.from("dispositivos").select("unidade_id").eq("id", body.id).maybeSingle();
      const { error } = await db.from("dispositivos").update({ unidade_id: body.profileId }).eq("id", body.id);
      if (error) throw error;
      await audit(actor.id, "device.mover", "device", body.id,
        { unidade_id: antes?.unidade_id ?? null }, { unidade_id: body.profileId, unidade: unidade.nome });
      return NextResponse.json({ ok: true, data: { unidade: unidade.nome } });
    }
    // Renomear: nome novo é o único campo. Serve pra "Mesa Carimbos", "Balcão",
    // etc. — o nome que sai no painel e nos avisos de tablet sem contato.
    if (typeof body.name === "string") {
      const nome = body.name.trim();
      if (nome.length < 2 || nome.length > 100) return NextResponse.json({ ok: false, error: "invalid_name" }, { status: 422 });
      const { error } = await db.from("dispositivos").update({ nome }).eq("id", body.id);
      if (error) throw error;
      await audit(actor.id, "device.rename", "device", body.id, undefined, { nome });
      return NextResponse.json({ ok: true });
    }
    // Ativar/revogar. A coluna é `ativo`; `revoked_at` nem existe na tabela —
    // mandá-la fazia o PostgREST recusar o update inteiro.
    if (typeof body.active === "boolean") {
      const { error } = await db.from("dispositivos").update({ ativo: body.active }).eq("id", body.id);
      if (error) throw error;
      await audit(actor.id, body.active ? "device.enable" : "device.revoke", "device", body.id, undefined, { ativo: body.active });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "invalid_device" }, { status: 422 });
  } catch (error) { return marketApiError(error); }
}

// Apagar um tablet do cadastro (?id=). Revogar (PATCH ativo=false) já basta pra
// tirar o aparelho do ar; isto é pra faxina — aparelho trocado, tablet de teste.
//
// As compras que ele mandou FICAM: `operacoes_compra.dispositivo_id` é
// `on delete set null`, então o histórico de vendas continua de pé, só perde a
// referência de qual aparelho registrou.
export async function DELETE(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "invalid_device" }, { status: 422 });
  try {
    const db = marketDb();
    const { data: alvo } = await db.from("dispositivos").select("id,nome").eq("id", id).maybeSingle();
    if (!alvo) return NextResponse.json({ ok: false, error: "device_not_found" }, { status: 404 });
    const { error } = await db.from("dispositivos").delete().eq("id", id);
    if (error) {
      // `auditoria.dispositivo_id` é `on delete set null`, e o gatilho
      // append-only barra até esse update da própria chave estrangeira. Sem o
      // SQL, NENHUM aparelho pode ser apagado — e o erro cru não diz o que fazer.
      if (/append-only/i.test(error.message ?? "")) {
        return NextResponse.json({
          ok: false, error: "auditoria_bloqueia_exclusao",
          detalhe: "Rode supabase/tridimarket_excluir_venda.sql: o gatilho da auditoria impede apagar aparelho. Enquanto isso, revogar já tira o tablet do ar.",
        }, { status: 409 });
      }
      throw error;
    }
    await audit(actor.id, "device.delete", "device", id, { nome: alvo.nome }, undefined);
    return NextResponse.json({ ok: true });
  } catch (error) { return marketApiError(error); }
}

