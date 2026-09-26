import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida } from "@/lib/financeiro/db";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { centavos, competenciaDe } from "@/lib/financeiro/calculos";
import { LANCAMENTO, LANCAMENTO_TIPOS, type LancamentoTipo } from "@/lib/financeiro/tipos";

/**
 * O que muda no mês: bônus, hora extra, vale, falta, farmácia, mercadinho.
 *
 * Atrás de `financeiro:folha`, a mesma chave do salário — e pelo mesmo motivo:
 * a partir do desconto de farmácia de uma pessoa dá para inferir muita coisa
 * sobre ela. Não é dado de RH, é dado de folha.
 *
 * Lançar aqui NÃO paga nada e não mexe em compromisso já criado: quem soma isso
 * é `gerarFolha`, na próxima vez que a competência for gerada. Alterar por fora
 * um compromisso que já existe seria reescrever obrigação combinada.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ref = (v: unknown): string | null => (UUID.test(String(v ?? "")) ? String(v).trim() : null);

const texto = (v: unknown): string | null => String(v ?? "").trim() || null;

/** O banco tem `check (valor >= 0)`: o sinal vem do tipo, nunca do número. */
const dinheiro = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, centavos(n)) : 0;
};

const quantidade = (v: unknown): number | null => {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

function falha(e: { code?: string; message?: string }) {
  if (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || e.code === "PGRST204"
      || (e.message ?? "").includes("does not exist")) {
    return NextResponse.json(
      { erro: "O SQL do Financeiro está atrás do código — rode supabase/financeiro.sql de novo." },
      { status: 503 },
    );
  }
  return NextResponse.json({ erro: e.message || "Não deu para lançar." }, { status: 500 });
}

export async function POST(req: Request) {
  const eu = await apiFinanceiro("folha");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const colaboradorId = ref(corpo.colaborador_id);
  if (!colaboradorId) return NextResponse.json({ erro: "Informe a pessoa." }, { status: 400 });

  const tipo = corpo.tipo as LancamentoTipo;
  if (!LANCAMENTO_TIPOS.includes(tipo)) {
    return NextResponse.json({ erro: "Tipo de lançamento desconhecido." }, { status: 400 });
  }

  const bruta = String(corpo.competencia ?? "");
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(bruta)) {
    return NextResponse.json({ erro: "Competência inválida." }, { status: 400 });
  }
  const competencia = competenciaDe(bruta.length === 7 ? `${bruta}-01` : bruta);

  const valor = dinheiro(corpo.valor);
  if (valor <= 0) return NextResponse.json({ erro: "O valor precisa ser maior que zero." }, { status: 400 });

  // "O bônus pode se repetir caso na hora de adicionar marque que ele é
  // recorrente" — só o bônus; desconto que repete sozinho é dívida eterna.
  const recorrente = tipo === "bonus" && corpo.recorrente === true;

  const db = createSupabaseAdminClient();

  // A empresa sai da PESSOA, nunca do corpo: aceitar a do cliente deixaria
  // lançar um desconto na folha de outra empresa mandando outro id (§17).
  const { data: dono, error: erroDono } = await db
    .from("fin_colaboradores")
    .select("id,empresa_id,nome")
    .eq("id", colaboradorId)
    .maybeSingle();
  if (erroDono) return falha(erroDono);
  const pessoa = dono as { id: string; empresa_id: string; nome: string } | null;
  if (!pessoa) return NextResponse.json({ erro: "Pessoa não encontrada." }, { status: 404 });
  if (!(await empresaPermitida(eu.profile.id, pessoa.empresa_id))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const linhaNova = {
    empresa_id: pessoa.empresa_id,
    colaborador_id: pessoa.id,
    competencia,
    tipo,
    descricao: texto(corpo.descricao),
    quantidade: quantidade(corpo.quantidade),
    valor,
    created_by: eu.profile.id,
  };
  let { data, error } = await db
    .from("fin_folha_lancamentos")
    .insert(recorrente ? { ...linhaNova, recorrente: true } : linhaNova)
    .select("id")
    .maybeSingle();
  // Sem o SQL do bônus recorrente a coluna não existe: o bônus entra sem
  // repetir e a resposta avisa, em vez de perder o lançamento inteiro.
  let semRecorrencia = false;
  if (error && recorrente) {
    semRecorrencia = true;
    ({ data, error } = await db.from("fin_folha_lancamentos").insert(linhaNova).select("id").maybeSingle());
  }
  if (error) return falha(error);

  await auditar({
    empresa_id: pessoa.empresa_id, entidade: "folha_lancamento",
    entidade_id: (data as { id: string } | null)?.id ?? null,
    acao: "criar", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { pessoa: pessoa.nome, competencia, tipo, valor, sinal: LANCAMENTO[tipo].sinal, recorrente: recorrente && !semRecorrencia },
  });

  return NextResponse.json({
    ok: true, id: (data as { id: string } | null)?.id ?? null,
    ...(semRecorrencia ? { aviso: "Lançado sem repetir: falta rodar supabase/financeiro_folha_automatico.sql." } : {}),
  });
}

export async function DELETE(req: Request) {
  const eu = await apiFinanceiro("folha");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const id = ref(sp.get("id"));
  if (!id) return NextResponse.json({ erro: "Informe o lançamento." }, { status: 400 });
  // Bônus recorrente: "mes" = só este mês (a origem pula esta competência);
  // "futuro" = daqui pra frente (a origem encerra aqui). Sem alcance = o
  // comportamento de sempre, apagar a linha.
  const alcance = sp.get("alcance") === "mes" ? "mes" : sp.get("alcance") === "futuro" ? "futuro" : null;

  const db = createSupabaseAdminClient();
  const BASE = "id,empresa_id,colaborador_id,competencia,tipo,valor";
  let { data, error } = await db.from("fin_folha_lancamentos").select(`${BASE},recorrente,origem_id`).eq("id", id).maybeSingle();
  if (error) ({ data, error } = await db.from("fin_folha_lancamentos").select(BASE).eq("id", id).maybeSingle());
  if (error) return falha(error);
  const linha = data as
    | { id: string; empresa_id: string; colaborador_id: string; competencia: string; tipo: string; valor: number; recorrente?: boolean; origem_id?: string | null }
    | null;
  if (!linha) return NextResponse.json({ erro: "Lançamento não encontrado." }, { status: 404 });
  if (!(await empresaPermitida(eu.profile.id, linha.empresa_id))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const competencia = String(linha.competencia).slice(0, 10);
  if (alcance && linha.origem_id) {
    // A cópia sai; a ORIGEM aprende o que fazer nos próximos meses.
    if (alcance === "mes") {
      const { data: origem } = await db.from("fin_folha_lancamentos").select("pulados").eq("id", linha.origem_id).maybeSingle();
      const pulados = [...new Set([...((origem as { pulados?: string[] } | null)?.pulados ?? []).map((p) => String(p).slice(0, 10)), competencia])];
      const { error: e1 } = await db.from("fin_folha_lancamentos").update({ pulados }).eq("id", linha.origem_id);
      if (e1) return falha(e1);
    } else {
      const { error: e1 } = await db.from("fin_folha_lancamentos").update({ encerrado_em: competencia }).eq("id", linha.origem_id);
      if (e1) return falha(e1);
    }
  } else if (alcance === "futuro" && linha.recorrente) {
    // A origem fica no mês dela e só para de gerar: apagar seria reescrever
    // um bônus que já foi pago.
    const { error: e1 } = await db.from("fin_folha_lancamentos").update({ recorrente: false }).eq("id", linha.id);
    if (e1) return falha(e1);
    await auditar({
      empresa_id: linha.empresa_id, entidade: "folha_lancamento", entidade_id: linha.id,
      acao: "editar", user_id: eu.profile.id, user_nome: eu.profile.name,
      dados: { colaborador_id: linha.colaborador_id, competencia, tipo: linha.tipo, valor: linha.valor, recorrente: false },
    });
    return NextResponse.json({ ok: true, parou: true });
  }

  // Apaga de verdade, e não marca como cancelado: lançamento do mês ainda não
  // virou obrigação nenhuma — quem vira história é o compromisso da folha, e
  // esse já é imutável do lado do banco.
  const { error: erroDel } = await db.from("fin_folha_lancamentos").delete().eq("id", linha.id);
  if (erroDel) return falha(erroDel);

  await auditar({
    empresa_id: linha.empresa_id, entidade: "folha_lancamento", entidade_id: linha.id,
    acao: "excluir", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { colaborador_id: linha.colaborador_id, competencia, tipo: linha.tipo, valor: linha.valor, ...(alcance ? { alcance } : {}) },
  });

  return NextResponse.json({ ok: true });
}
