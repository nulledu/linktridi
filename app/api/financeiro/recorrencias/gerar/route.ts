// ── Recorrências · gerar os compromissos (§10, §16) ──────────────────────────
// Transforma as regras ativas nas contas que ainda faltam. O trabalho todo é do
// `gerarRecorrencias`, que carrega a chave `rec:<id>:<AAAA-MM>` — por isso esta
// rota pode ser chamada à vontade: rodar dez vezes no mesmo dia termina no
// mesmo estado da primeira.
//
// Esta rota é o botão "Gerar compromissos" da tela — para quem acabou de
// cadastrar a regra e quer ver a conta na agenda agora. Quem garante que a
// agenda do mês existe sem ninguém lembrar é o cron diário em
// `/api/financeiro-cron` (uma invocação por dia, de madrugada), que chama o
// mesmo `gerarRecorrencias` com a mesma chave por competência.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { empresaPermitida } from "@/lib/financeiro/db";
import { gerarRecorrencias } from "@/lib/financeiro/escrita";
import { fimDoMesSeguinte } from "@/lib/financeiro/calculos";

export const dynamic = "force-dynamic";

const ehData = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: Request) {
  const eu = await apiFinanceiro("cadastros");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = typeof corpo.empresa_id === "string" ? corpo.empresa_id : "";
  if (!(await empresaPermitida(eu.profile.id, empresaId)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  const ate = ehData(corpo.ate) ? corpo.ate : fimDoMesSeguinte();
  // Uma regra só, quando a agenda manda lançar UMA previsão. Sem isto, clicar
  // numa conta prevista lançaria de tabela todas as outras que ainda não
  // venceram — e ninguém pediu isso.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const recorrenciaId = UUID.test(String(corpo.recorrencia_id ?? "")) ? String(corpo.recorrencia_id) : undefined;

  const r = await gerarRecorrencias(empresaId, ate, { id: eu.profile.id, nome: eu.profile.name }, { recorrenciaId });
  if (!r.ok) return NextResponse.json({ erro: r.erro ?? "Não deu para gerar." }, { status: 400 });

  return NextResponse.json({ ok: true, criados: r.dados?.criados ?? 0 });
}
