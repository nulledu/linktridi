import { NextRequest, NextResponse } from "next/server";
import { autenticarDevice, jaProcessados, marcarProcessado } from "@/lib/device";
import { confirmarRecebimento, TabelaAusenteError, type ChecklistRecebimento, type EtapaRecebimento } from "@/lib/recebimento";
import { guardarPublico } from "@/lib/armazenamento/publico";

export const dynamic = "force-dynamic";

const ETAPAS = new Set<EtapaRecebimento>(["chegada", "estoque", "ambas"]);

// POST /api/recebimento/tablet/confirmar — o responsável confirma a CHEGADA de
// um pedido: foto dos itens, checklist, quantidade recebida e se está correto.
// Auth: x-device-token. clientId dá idempotência.
//
// ETAPA 1, e só ela. Este tablet fica na recepção, junto do ponto: quem assina
// a entrega recebe a caixa fechada, muitas vezes sem nem poder abrir. Enquanto
// esta rota também dava entrada no estoque, o sistema contava 100 almofadas com
// a caixa lacrada no corredor — e a conta só aparecia errada no inventário.
//
// A foto e o checklist continuam valendo e ficam AQUI: eles são a prova de que
// chegou. Quem abre, confere e guarda é o galpão, na etapa 2 (totem ou aba
// Recebimento). O `etapa` no corpo existe pro caso raro em que o mesmo tablet
// faz as duas coisas — o app instalado hoje não manda nada e cai no default.
export async function POST(req: NextRequest) {
  const auth = await autenticarDevice(req.headers.get("x-device-token"));
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  const device = auth.device;

  const b = (await req.json().catch(() => ({}))) as {
    compraId?: string; quantidadeRecebida?: number; correto?: boolean;
    divergenciaMotivo?: string | null; observacoes?: string | null;
    checklist?: ChecklistRecebimento | null; recebidoPor?: string | null;
    fotoBase64?: string | null; clientId?: string | null; etapa?: string | null;
  };
  if (!b.compraId) return NextResponse.json({ error: "compra_obrigatoria" }, { status: 400 });

  // Idempotência: confirmação já processada → não regrava (evita duplicar no estoque).
  if (b.clientId) {
    try {
      const feitos = await jaProcessados([b.clientId]);
      if (feitos.has(b.clientId)) return NextResponse.json({ ok: true, duplicada: true });
    } catch { /* sem idempotência → segue */ }
  }

  // Foto obrigatória dos itens (auditoria) → storage photos/recebimento/.
  let fotoUrl: string | null = null;
  if (b.fotoBase64) {
    try {
      const raw = b.fotoBase64.replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(raw, "base64");
      if (buf.length > 0 && buf.length < 4_000_000) {
        const path = `recebimento/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        fotoUrl = await guardarPublico(path, buf, "image/jpeg");
      }
    } catch { /* foto é auditoria — não bloqueia */ }
  }

  try {
    const r = await confirmarRecebimento({
      compra_id: b.compraId,
      quantidade_recebida: typeof b.quantidadeRecebida === "number" ? b.quantidadeRecebida : 0,
      correto: b.correto !== false,
      divergencia_motivo: b.divergenciaMotivo ?? null,
      observacoes: b.observacoes ?? null,
      checklist: b.checklist ?? null,
      recebido_por: b.recebidoPor ?? null,
      foto_url: fotoUrl,
      device_id: device.id,
      etapa: ETAPAS.has(b.etapa as EtapaRecebimento) ? (b.etapa as EtapaRecebimento) : "chegada",
    });
    if (b.clientId) { try { await marcarProcessado(b.clientId, device.id); } catch { /* ok */ } }
    return NextResponse.json({
      ok: true,
      // `status_efetivo` e não `status`: num banco sem supabase/recebimento_v4.sql
      // a chegada é GRAVADA como `divergencia` só porque o CHECK antigo não
      // conhece `chegou`. O app instalado pinta `divergencia` de vermelho com
      // "Recebido com divergência" — ou seja, toda entrega correta acusaria
      // problema na cara de quem acabou de assinar. Aqui vai o que de fato
      // aconteceu; `statusGravado` leva o que está na linha, pra quem auditar.
      status: r.status_efetivo, statusGravado: r.status, faltam: r.faltam,
      quantidadeRecebidaTotal: r.quantidade_recebida_total,
      // Campos novos: o app instalado hoje ignora chave que não conhece
      // (`ignoreUnknownKeys`), e a versão seguinte pode dizer com todas as
      // letras "chegou — falta o galpão guardar".
      etapa: r.etapa, faltaGuardar: r.falta_guardar,
      estoque: r.estoque, item: r.compra.item_nome,
      quantidadeComprada: r.compra.quantidade_comprada, unidade: r.compra.unidade,
    });
  } catch (e) {
    if (e instanceof TabelaAusenteError) return NextResponse.json({ error: "tabela_ausente" }, { status: 400 });
    // O tablet mostra esta string CRUA ("Falha ao confirmar: …"), então código
    // de erro vira frase aqui. `compra_ja_chegou` é o caso que aparece de
    // verdade: a entrega já foi assinada e alguém tenta assinar de novo — sem
    // a frase, a pessoa acha que a rede caiu e tenta mais três vezes.
    const msg = String((e as Error)?.message || e);
    const frase = FRASES[msg];
    if (frase) return NextResponse.json({ ok: false, error: frase }, { status: 400 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const FRASES: Record<string, string> = {
  compra_ja_chegou: "esta entrega já foi confirmada como recebida",
  compra_ja_recebida: "esta compra já foi recebida e guardada",
  compra_cancelada: "esta compra foi cancelada",
  compra_nao_encontrada: "esta compra não existe mais",
  nada_para_guardar: "não há nada desta compra esperando pra ser guardado",
  quantidade_maior_que_o_recebido: "não dá pra guardar mais do que chegou",
};
