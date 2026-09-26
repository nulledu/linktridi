import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { atualizarSessao, criarSessao, enviarLeadInterno, enviarLeadWebhook, registrarEvento } from "@/lib/tridiflow-db";
import { CHAVE_VARIANTE } from "@/lib/tridiflow-ab";

export const dynamic = "force-dynamic";

// PÚBLICA — envio do formulário de uma página.
//
// Grava em tridiflow_sessoes, a MESMA tabela dos leads dos fluxos. Assim o lead
// aparece na aba Contatos junto com os do chat, e o webhook de lead + o envio
// pro Comercial (gaiaLeads) já configurados no projeto disparam sozinhos —
// sem CRM novo, sem tabela nova. Era exatamente o pedido.
const entrada = z.object({
  paginaId: z.string().uuid(),
  respostas: z.record(z.string().max(2000)).refine((r) => Object.keys(r).length > 0 && Object.keys(r).length <= 30, "campos_invalidos"),
  utm: z.record(z.string().max(200)).optional(),
  visitante: z.string().max(80).optional(),
  variante: z.enum(["a", "b"]).optional(),
});

export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => null);
  const p = entrada.safeParse(corpo);
  if (!p.success) return NextResponse.json({ ok: false, error: "invalid_lead" }, { status: 422 });

  try {
    // Uma sessão por envio: a página não tem conversa, o envio é o começo e o
    // fim do lead. `concluida` marca como funil completo (entra nas conversões).
    const sessaoId = await criarSessao(p.data.paginaId, p.data.utm ?? {});
    if (!sessaoId) return NextResponse.json({ ok: false, error: "sem_sessao" }, { status: 503 });

    // A variante viaja DENTRO de `respostas`, na chave reservada — mesmo truque
    // das tags do quiz. É o que faz o webhook e o CSV enxergarem de qual versão
    // veio o lead sem ninguém rodar SQL.
    const respostas = p.data.variante
      ? { ...p.data.respostas, [CHAVE_VARIANTE]: p.data.variante }
      : p.data.respostas;
    await atualizarSessao(sessaoId, { respostas, ultimaEtapa: "formulario", concluida: true });
    await registrarEvento(p.data.paginaId, {
      evento: "form_submitted", sessaoId, visitante: p.data.visitante ?? null, utm: p.data.utm ?? {},
      ...(p.data.variante ? { meta: { variante: p.data.variante } } : {}),
    });

    // Entregas best-effort: o lead já está salvo, um destino fora do ar não
    // pode devolver erro pra quem acabou de preencher o formulário.
    void enviarLeadWebhook(sessaoId).catch(() => {});
    void enviarLeadInterno(sessaoId).catch(() => {});

    return NextResponse.json({ ok: true, sessaoId });
  } catch {
    return NextResponse.json({ ok: false, error: "falha" }, { status: 500 });
  }
}
