import { NextRequest, NextResponse } from "next/server";
import { compactarImagem } from "@/lib/armazenamento/compactar";
import { autenticarDevice, jaProcessados, marcarProcessado } from "@/lib/device";
import { baterPonto, ultimaBatida, registroPorClientId, batidoEmValido, TabelaAusenteError } from "@/lib/ponto";
import { portalParaPessoa } from "@/lib/ponto-portal";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { novaChave } from "@/lib/armazenamento/referencia";
import { b2Configurado, enviarPrivado } from "@/lib/armazenamento/privado";

export const dynamic = "force-dynamic";

// POST /api/ponto/bater — o tablet registra a batida após reconhecer a pessoa.
// Body: { pessoaId, tipo?: "entrada"|"saida", confianca?: 0–1, selfieBase64?: jpeg,
//         clientId? } — clientId dá idempotência: o tablet reenvia a fila offline
// sem duplicar (registro de ids em device_processed_actions).
// Auth: x-device-token. A selfie (auditoria) vai pro storage; falha de upload
// não bloqueia a batida.
export async function POST(req: NextRequest) {
  const auth = await autenticarDevice(req.headers.get("x-device-token"));
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  const device = auth.device;

  const b = (await req.json().catch(() => ({}))) as {
    pessoaId?: string; tipo?: import("@/lib/ponto").TipoBatida | null; confianca?: number | null; selfieBase64?: string | null; clientId?: string | null;
    batidoEm?: string | null; lat?: number | null; lon?: number | null;
  };
  if (!b.pessoaId) return NextResponse.json({ error: "pessoa_obrigatoria" }, { status: 400 });

  // Idempotência da fila offline: batida já processada → confirma sem regravar.
  // ESCOPADA por device + 24h de propósito: client_id é PK GLOBAL numa tabela
  // compartilhada por todas as ações de tablet, então sem escopo um id repetido
  // fazia a batida ser DESCARTADA respondendo ok:true — a pessoa batia e não
  // aparecia nada no sistema, pra sempre (a marca nunca expirava).
  if (b.clientId) {
    try {
      const desde = new Date(Date.now() - 24 * 3600e3).toISOString();
      // Prova EXATA primeiro: o registro que carrega este client_id (coluna de
      // supabase/ponto_client_id.sql). Vale independente da marca de processado
      // e sem janela — é a resposta definitiva de "essa batida já entrou?".
      const exato = await registroPorClientId(b.clientId);
      if (exato) {
        return NextResponse.json({
          ok: true, duplicada: true,
          registro: { id: exato.id, tipo: exato.tipo, batidoEm: exato.batidoEm },
          pessoa: { id: b.pessoaId, nome: "", fotoUrl: null },
        });
      }
      const feitos = await jaProcessados([b.clientId], { deviceId: device.id, desdeIso: desde });
      if (feitos.has(b.clientId)) {
        // Sem a coluna client_id, sobra a heurística antiga: só confirma se
        // existir batida REAL recente dessa pessoa. Antes a rota devolvia um
        // registro inventado (id = client_id, horário = agora) e nada ficava
        // gravado. Sem prova, FALHA ABERTO: registra. Uma batida duplicada é
        // visível e corrigível; uma batida perdida é invisível.
        const real = await ultimaBatida(b.pessoaId, desde);
        if (real) {
          return NextResponse.json({
            ok: true, duplicada: true,
            registro: { id: real.id, tipo: real.tipo, batidoEm: real.batidoEm },
            pessoa: { id: b.pessoaId, nome: "", fotoUrl: null },
          });
        }
      }
    } catch { /* tabela de ações ausente → segue sem idempotência */ }
  }

  // Selfie (opcional, ~100KB jpeg) → bucket PRIVADO ponto-selfies. Imagem de
  // rosto com hora e local é dado sensível: só o SUPERUSUÁRIO vê, pela rota
  // /api/ponto/selfie. Por isso `selfie_url` guarda só o CAMINHO no bucket —
  // nunca uma URL pública. (O bucket é criado na primeira gravação.)
  let selfieUrl: string | null = null;
  if (b.selfieBase64) {
    try {
      const raw = b.selfieBase64.replace(/^data:image\/\w+;base64,/, "");
      let buf: Buffer = Buffer.from(raw, "base64");
      let mimeSelfie = "image/jpeg";
      // Selfie é auditoria: entra compactada como toda imagem (WebP ≤1600px).
      if (buf.length > 0 && buf.length < 2_000_000) {
        const c = await compactarImagem(buf, "image/jpeg", "selfie.jpg");
        if (c.mime === "image/webp") { buf = c.corpo as Buffer; mimeSelfie = "image/webp"; }
      }
      if (buf.length > 0 && buf.length < 2_000_000 && b2Configurado()) {
        // Desde set/2026 a selfie nova vai pro Backblaze (`ponto/aaaa/mm/<id>.jpg`);
        // /api/ponto/selfie reconhece a chave e redireciona pra URL assinada.
        const chave = await enviarPrivado(novaChave("ponto", mimeSelfie === "image/webp" ? "selfie.webp" : "selfie.jpg", mimeSelfie), buf, mimeSelfie);
        selfieUrl = chave;
      } else if (buf.length > 0 && buf.length < 2_000_000) {
        const db = createSupabaseAdminClient();
        const path = `ponto/${Date.now()}-${Math.random().toString(36).slice(2)}.${mimeSelfie === "image/webp" ? "webp" : "jpg"}`;
        let { error } = await db.storage.from("ponto-selfies").upload(path, buf, { contentType: mimeSelfie, upsert: true });
        if (error && /bucket/i.test(error.message)) {
          await db.storage.createBucket("ponto-selfies", { public: false }).catch(() => {});
          ({ error } = await db.storage.from("ponto-selfies").upload(path, buf, { contentType: mimeSelfie, upsert: true }));
        }
        if (!error) selfieUrl = path;
      }
    } catch { /* selfie é auditoria — não bloqueia a batida */ }
  }

  try {
    const r = await baterPonto({
      pessoaId: b.pessoaId,
      tipo: b.tipo ?? null,
      confianca: typeof b.confianca === "number" ? Math.max(0, Math.min(1, b.confianca)) : null,
      selfieUrl,
      deviceId: device.id,
      origem: "tablet",
      // Instante real da batida quando ela vem da fila offline. Ausente ou com
      // relógio fora da janela → null, e o banco carimba na chegada como antes.
      batidoEm: batidoEmValido(b.batidoEm),
      clientId: b.clientId ?? null,
      // Coordenada com sanidade de mapa: fora da faixa é lixo de sensor, não local.
      lat: typeof b.lat === "number" && Math.abs(b.lat) <= 90 ? b.lat : null,
      lon: typeof b.lon === "number" && Math.abs(b.lon) <= 180 ? b.lon : null,
    });
    if (b.clientId) { try { await marcarProcessado(b.clientId, device.id); } catch { /* sem idempotência */ } }
    // Portal de início de turno: prioridades do setor (só ao INICIAR — entrada/retorno).
    let portal = null;
    if (r.registro.tipo === "entrada" || r.registro.tipo === "retorno") {
      try { portal = await portalParaPessoa(r.pessoa.colaboradorId); } catch { /* opcional */ }
    }
    return NextResponse.json({
      ok: true, duplicada: r.duplicada,
      registro: { id: r.registro.id, tipo: r.registro.tipo, batidoEm: r.registro.batidoEm },
      pessoa: { id: r.pessoa.id, nome: r.pessoa.nome, fotoUrl: r.pessoa.fotoUrl },
      hoje: r.hoje,   // histórico do dia da pessoa
      portal,         // prioridades do setor (início de turno)
    });
  } catch (e) {
    if (e instanceof TabelaAusenteError) return NextResponse.json({ error: "tabela_ausente" }, { status: 400 });
    // Pessoa desativada/removida é recusa DEFINITIVA: 4xx pro app descartar a
    // operação da fila. Com 500 ele reenviaria pra sempre (ver a regra da fila
    // do device: 5xx só pra erro transitório).
    const msg = String((e as Error)?.message || e);
    if (msg === "pessoa_inativa" || msg === "pessoa_nao_encontrada") return NextResponse.json({ error: msg }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
