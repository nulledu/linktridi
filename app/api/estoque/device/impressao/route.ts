import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { confirmarTrabalhos, type ConfirmacaoDoTablet } from "@/lib/estoque-impressao-fila";
import { authorizeDevice, deviceAuthFailure } from "../_device";
import { freioDevice, origemDe, resposta429 } from "../_freio";

export const dynamic = "force-dynamic";

// ── POST /api/estoque/device/impressao — o tablet conta o que saiu no papel ──
//
// Esta rota NÃO é chamada em ritmo nenhum. Ela só existe quando houve papel: o
// worker imprime o que veio anexado ao bootstrap e, no mesmo ciclo, manda a
// confirmação. Ciclo comum, sem trabalho nenhum na fila, não chama nada aqui.
//
// É a metade que faltava do desenho, e ela é a metade barata: entregar o
// trabalho não custa requisição nenhuma (pega carona no bootstrap que já
// descia), e confirmar custa uma requisição por lote impresso — que é
// exatamente a frequência com que alguém manda imprimir.
//
// ── POR QUE ELA NÃO IMPEDE IMPRIMIR DUAS VEZES ──────────────────────────────
//
// Porque não tem como: o papel já saiu quando esta rota é chamada. A trava
// contra a segunda tira mora no APARELHO, que guarda o id de todo trabalho que
// já viu e ignora o que volta — o espelho de `estoque_operacoes`, com os papéis
// invertidos (lá o servidor lembra pra não processar duas vezes; aqui o tablet
// lembra pra não imprimir duas vezes).
//
// O que ESTA rota garante é a contabilidade: reenviar a mesma confirmação não
// conta duas vezes, e um aparelho não escreve na fila de outro.

/** Teto de confirmações por chamada — o mesmo teto de trabalhos por ciclo, com folga. */
const TETO = 20;

export async function POST(req: NextRequest) {
  if (!freioDevice.consumir(origemDe(req.headers)).permitido) return resposta429();
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure();

  // Corpo torto não é 4xx aqui, e isso é regra do módulo: a fila do aparelho
  // APAGA a operação quando o servidor responde 4xx (ela lê 4xx como "não
  // adianta insistir"). Uma confirmação perdida assim deixaria o trabalho
  // eternamente "esperando o tablet" na tela do escritório, com o papel já em
  // cima da mesa. Corpo vazio simplesmente não confirma nada.
  const corpo = await req.json().catch(() => null) as { trabalhos?: unknown } | null;
  const lista = Array.isArray(corpo?.trabalhos) ? corpo.trabalhos : [];

  const confirmacoes: ConfirmacaoDoTablet[] = lista.slice(0, TETO).flatMap((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const id = String(o.id ?? "").trim();
    if (!id) return [];
    return [{
      id,
      ok: o.ok === true,
      detalhe: typeof o.detalhe === "string" ? o.detalhe.slice(0, 300) : null,
    }];
  });

  if (confirmacoes.length === 0) return NextResponse.json({ ok: true, confirmados: 0 });

  const db = createSupabaseAdminClient();
  const { confirmados, faltaSql } = await confirmarTrabalhos(db, auth.device.id, confirmacoes);

  // Sem a tabela também responde 200: o SQL não ter rodado é problema do
  // escritório, não do aparelho, e um 4xx faria o tablet apagar a confirmação
  // de um papel que ele imprimiu de verdade.
  return NextResponse.json({ ok: true, confirmados, pendente: faltaSql });
}
