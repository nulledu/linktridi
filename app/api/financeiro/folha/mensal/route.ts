// ── Folha mensal · a rota da tabela ──────────────────────────────────────────
// GET  ?competencia=AAAA-MM-01[&empresa=<id>]  → as linhas do mês, uma por
//      pessoa (materializadas ou calculadas), mais a sugestão do mercadinho.
// PUT  { colaborador_id, competencia, ...campos }  → grava a célula editada,
//      o pago, ou as faltas. Upsert: corrigir nunca duplica.
// POST { competencia, ids, campo, valor }  → o mesmo valor em VÁRIAS pessoas
//      de uma vez — é o "editar todos os bônus do mês" da tela.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida, empresasDoUsuario } from "@/lib/financeiro/db";
import {
  CAMPOS_EDITAVEIS, folhaDoMes, gravarMesDaFolha, pagarHorasDoMes, pontoDaFolha, type CampoEditavel,
} from "@/lib/financeiro/folha-mensal-servidor";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { podeComissaoDeVendas } from "@/lib/financeiro/folha-mensal";

export const dynamic = "force-dynamic";

const COMPETENCIA = /^\d{4}-\d{2}-01$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** As pessoas do escopo — a MESMA conferência de empresa das páginas. */
async function pessoasDoEscopo(userId: string, empresa: string | null) {
  const { dados: empresas } = await empresasDoUsuario(userId);
  const permitidas = empresas.map((e) => e.id);
  const escopo = empresa ? permitidas.filter((id) => id === empresa) : permitidas;
  if (!escopo.length) return [];
  const { data } = await createSupabaseAdminClient()
    .from("fin_colaboradores")
    .select("id,empresa_id,employee_id,setor,salario_base,gratificacao")
    .in("empresa_id", escopo)
    .limit(400);
  return (data ?? []) as { id: string; empresa_id: string; employee_id: string | null; setor: string | null; salario_base: number; gratificacao: number }[];
}

export async function GET(req: Request) {
  const eu = await apiFinanceiro("folha");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const competencia = searchParams.get("competencia") ?? "";
  if (!COMPETENCIA.test(competencia)) {
    return NextResponse.json({ erro: "Competência inválida — use AAAA-MM-01." }, { status: 400 });
  }
  const empresa = searchParams.get("empresa");

  const pessoas = await pessoasDoEscopo(eu.profile.id, empresa);
  const [folha, ponto, comissoes, mkt, vendas] = await Promise.all([
    folhaDoMes(pessoas, competencia),
    pontoDaFolha(pessoas, competencia),
    // A comissão do acordo (Marketing) no mês da competência — SUGESTÃO por
    // pessoa, mesma conta do painel do Tráfego. Falha vira {} e a folha abre.
    import("@/lib/comissao-gestor-servidor")
      .then((m) => m.comissoesPorPessoa(competencia.slice(0, 7)))
      .catch(() => ({} as Record<string, { valor: number | null }>)),
    // A do gerenciador dos MARKETPLACES, mesma régua: sugestão que só congela
    // no fechamento. Falha vira null.
    import("@/lib/comissao-marketplace-servidor")
      .then((m) => m.comissaoMarketplaceDoMes(competencia.slice(0, 7)))
      .catch(() => null),
    // A das VENDEDORAS, da planilha do ERP (valor_comissao por pagamento).
    import("@/lib/comissao-vendas-servidor")
      .then((m) => m.comissoesVendasPorPessoa(competencia.slice(0, 7)))
      .catch(() => ({} as Record<string, { valor: number }>)),
    // Bônus marcado "todo mês" nasce neste mês se ainda não nasceu. Idempotente;
    // sem o SQL novo, não faz nada. Trocar de mês na tela é ação de gente, não poll.
    import("@/lib/financeiro/bonus-recorrente-servidor")
      .then((m) => m.materializarBonusRecorrente([...new Set(pessoas.map((p) => p.empresa_id))], competencia))
      .catch(() => null),
  ]);
  const comissaoSugerida: Record<string, number> = {};
  const comissaoMarketplaceSugerida: Record<string, number> = {};
  const comissaoVendasSugerida: Record<string, number> = {};
  for (const pes of pessoas) {
    const v = pes.employee_id ? comissoes[pes.employee_id]?.valor : null;
    if (typeof v === "number" && v > 0) comissaoSugerida[pes.id] = v;
    if (mkt && pes.employee_id && pes.employee_id === mkt.pessoaId && mkt.valor > 0) comissaoMarketplaceSugerida[pes.id] = mkt.valor;
    // Só Design, Marketing e Comercial vendem — ver `podeComissaoDeVendas`.
    const vv = pes.employee_id && podeComissaoDeVendas(pes.setor) ? vendas[pes.employee_id]?.valor : null;
    if (typeof vv === "number" && vv > 0) comissaoVendasSugerida[pes.id] = vv;
  }
  return NextResponse.json({ ...folha, ponto, comissaoSugerida, comissaoMarketplaceSugerida, comissaoVendasSugerida });
}

export async function PUT(req: Request) {
  const eu = await apiFinanceiro("folha");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const colaboradorId = String(corpo.colaborador_id ?? "");
  if (!UUID.test(colaboradorId)) return NextResponse.json({ erro: "Pessoa inválida." }, { status: 400 });

  // A empresa vem da LINHA da pessoa, nunca do corpo.
  const { data: pessoa } = await createSupabaseAdminClient()
    .from("fin_colaboradores").select("empresa_id,nome").eq("id", colaboradorId).maybeSingle();
  if (!pessoa) return NextResponse.json({ erro: "Pessoa não encontrada." }, { status: 404 });
  if (!(await empresaPermitida(eu.profile.id, (pessoa as { empresa_id: string }).empresa_id))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const r = await gravarMesDaFolha({
    colaboradorId,
    competencia: String(corpo.competencia ?? ""),
    patch: corpo as never,
    autorId: eu.profile.id,
  });
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status });

  // "Foram pagas as horas extras? Sim" no fechamento: dá baixa no banco de
  // horas DEPOIS de o pago gravar — se a baixa falhar, o mês fica pago e o
  // aviso conta o que faltou; o contrário (baixa sem pago) é que seria mentira.
  // Quem chega aqui já passou pelo gate `financeiro:folha`, mais restrito que
  // o admin exigido na rota do ponto.
  let horasPagasMin = 0;
  let horasAviso: string | undefined;
  if (corpo.pagar_horas === true && corpo.pago === true) {
    const baixa = await pagarHorasDoMes({
      colaboradorId, competencia: r.linha.competencia,
      autorId: eu.profile.id, autorNome: eu.profile.name ?? null,
    });
    if (baixa.ok) horasPagasMin = baixa.min;
    else horasAviso = baixa.erro;
  }

  await auditar({
    empresa_id: (pessoa as { empresa_id: string }).empresa_id,
    entidade: "folha_mensal", entidade_id: colaboradorId, acao: "editar",
    user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { competencia: r.linha.competencia, nome: (pessoa as { nome: string }).nome, ...(horasPagasMin ? { horas_pagas_min: horasPagasMin } : {}) },
  });
  return NextResponse.json({ ok: true, linha: r.linha, horasPagasMin, ...(horasAviso ? { horasAviso } : {}) });
}

/** O mesmo valor em várias pessoas — bônus do mês para a equipe inteira. */
export async function POST(req: Request) {
  const eu = await apiFinanceiro("folha");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as {
    competencia?: string; ids?: string[]; campo?: string; valor?: number;
  } | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const campo = String(corpo.campo ?? "");
  if (!CAMPOS_EDITAVEIS.includes(campo as CampoEditavel)) {
    return NextResponse.json({ erro: "Campo fora da lista editável." }, { status: 400 });
  }
  const ids = Array.isArray(corpo.ids) ? corpo.ids.filter((i) => UUID.test(String(i))) : [];
  if (!ids.length || ids.length > 100) {
    return NextResponse.json({ erro: "Escolha de 1 a 100 pessoas." }, { status: 400 });
  }

  // O escopo é conferido UMA vez, por conjunto: cada id precisa ser de uma
  // empresa permitida — um id alheio no meio da lista não pode passar na
  // carona dos outros.
  const pessoas = await pessoasDoEscopo(eu.profile.id, null);
  const permitidos = new Set(pessoas.map((p) => p.id));
  const fora = ids.filter((i) => !permitidos.has(i));
  if (fora.length) return NextResponse.json({ erro: "Há pessoas fora das suas empresas na lista." }, { status: 403 });

  let gravados = 0;
  const erros: string[] = [];
  for (const id of ids) {
    const r = await gravarMesDaFolha({
      colaboradorId: id,
      competencia: String(corpo.competencia ?? ""),
      patch: { [campo]: Number(corpo.valor) } as never,
      autorId: eu.profile.id,
    });
    if (r.ok) gravados += 1;
    else erros.push(r.erro);
  }

  await auditar({
    empresa_id: pessoas.find((p) => p.id === ids[0])?.empresa_id ?? null as never,
    entidade: "folha_mensal", acao: "lote",
    user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { campo, valor: corpo.valor, pessoas: gravados, competencia: corpo.competencia },
  });

  // Parcial é dito como parcial: "gravou 8 de 10" com o primeiro motivo.
  if (erros.length) {
    return NextResponse.json(
      { ok: false, gravados, falharam: erros.length, erro: erros[0] },
      { status: gravados ? 207 : 400 },
    );
  }
  return NextResponse.json({ ok: true, gravados });
}
