import { NextRequest, NextResponse } from "next/server";
import { autenticarDevice } from "@/lib/device";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { podeAtividades } from "@/lib/atividades-acesso";
import {
  JANELA_TENTATIVAS_MIN, TENTATIVAS_MAX, conferirVale, ehTipoAutorizavel, emitirVale, hashDoPin, pinValido,
} from "@/lib/atividades-autorizacao";

export const dynamic = "force-dynamic";

// POST /api/device/autorizar — o tablet travado pede o código do supervisor.
//
//   { etapa: "codigo", pin, atividade_id, tipo, motivo, colaborador_id, colaborador_nome }
//     → 200 { supervisor: { id, nome }, vale }   código certo e com permissão
//     → 401 { error: "codigo_errado", restantes }
//     → 429 { error: "bloqueado", segundos }     errou TENTATIVAS_MAX na janela
//   { etapa: "negar", vale, atividade_id, tipo, ... }
//     → 200 { ok }   o supervisor decidiu que a pessoa continua com a atividade
//
// A APROVAÇÃO não passa por aqui: o tablet manda o `vale` junto da operação
// de devolver/dispensar pela fila offline, e o /api/device/push só aplica com
// vale válido (e registra a aprovação lá).
type Corpo = {
  etapa?: string; pin?: unknown; vale?: unknown; atividade_id?: string; tipo?: unknown;
  motivo?: string; colaborador_id?: string; colaborador_nome?: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const auth = await autenticarDevice(req.headers.get("x-device-token"));
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  const device = auth.device;
  const b = (await req.json().catch(() => null)) as Corpo | null;
  const atividadeId = b?.atividade_id && UUID.test(b.atividade_id) ? b.atividade_id : null;
  if (!b || !atividadeId || !ehTipoAutorizavel(b.tipo)) return NextResponse.json({ error: "invalido" }, { status: 400 });
  const tipo = b.tipo;
  const db = createSupabaseAdminClient();
  const registro = {
    device_id: device.id, atividade_id: atividadeId, tipo, motivo: (b.motivo ?? "").slice(0, 300) || null,
    pedido_por_id: b.colaborador_id && UUID.test(b.colaborador_id) ? b.colaborador_id : null,
    pedido_por_nome: (b.colaborador_nome ?? "").slice(0, 120) || null,
  };

  if (b.etapa === "negar") {
    const sup = conferirVale(b.vale, atividadeId, tipo);
    if (!sup) return NextResponse.json({ error: "vale_invalido" }, { status: 401 });
    const { data: p } = await db.from("profiles").select("name,username").eq("id", sup).maybeSingle();
    await db.from("atividades_autorizacoes").insert({ ...registro, supervisor_id: sup, supervisor_nome: p?.name || p?.username || null, decisao: "negada" });
    return NextResponse.json({ ok: true });
  }

  // Força bruta: conta os erros deste tablet na janela.
  const desde = new Date(Date.now() - JANELA_TENTATIVAS_MIN * 60_000).toISOString();
  const { count, error: errCount } = await db.from("atividades_autorizacoes")
    .select("id", { count: "exact", head: true })
    .eq("device_id", device.id).eq("decisao", "codigo_errado").gte("created_at", desde);
  // A contagem é HEAD (corpo vazio): tabela ausente não volta como erro nela.
  // Sonda com select de verdade — sem isto o tablet dizia "código errado" pra
  // sempre num banco sem o SQL, e a saída "Voltar pra atividade" nunca aparecia.
  const sonda = await db.from("atividades_supervisor_pins").select("user_id").limit(1);
  if (errCount || (sonda.error && /relation .* does not exist|Could not find the table|schema cache/i.test(sonda.error.message)))
    return NextResponse.json({ error: "sem_tabela" }, { status: 409 });
  if ((count ?? 0) >= TENTATIVAS_MAX) return NextResponse.json({ error: "bloqueado", segundos: JANELA_TENTATIVAS_MIN * 60 }, { status: 429 });

  const errou = async () => {
    await db.from("atividades_autorizacoes").insert({ ...registro, decisao: "codigo_errado" });
    return NextResponse.json({ error: "codigo_errado", restantes: Math.max(0, TENTATIVAS_MAX - (count ?? 0) - 1) }, { status: 401 });
  };
  if (!pinValido(b.pin)) return errou();
  const { data: dono } = await db.from("atividades_supervisor_pins").select("user_id").eq("pin_hash", hashDoPin(b.pin)).maybeSingle();
  if (!dono) return errou();
  const { data: sup } = await db.from("profiles").select("id,name,username,role,active").eq("id", dono.user_id).maybeSingle();
  // Código de quem saiu da empresa ou perdeu a chave não destrava nada.
  if (!sup || sup.active === false || !(await podeAtividades({ id: sup.id, role: sup.role, username: sup.username }, "autorizar"))) return errou();

  return NextResponse.json({
    supervisor: { id: sup.id, nome: sup.name || sup.username },
    vale: emitirVale(atividadeId, tipo, sup.id),
  });
}
