import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { podeAtividades } from "@/lib/atividades-acesso";
import { PECAS_PADRAO, pecasDaTarefa, type PecaConfigRow } from "@/lib/atividades-pecas";

export const dynamic = "force-dynamic";

// GET → o que cada tarefa consome. Devolve a lista EFETIVA (semente do código
// coberta pelo que estiver no banco), mais `origem` pra tela mostrar quem manda:
// sem isso o gestor edita achando que salvou e a semente continua valendo.
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = createSupabaseAdminClient();
  let cfg: PecaConfigRow[] = [];
  let temTabela = true;
  try {
    const { data, error } = await db.from("atividade_pecas")
      .select("setor,tarefa,peca,tarefa_produz,categoria_produz").eq("ativo", true);
    if (error) temTabela = false; else cfg = (data ?? []) as PecaConfigRow[];
  } catch { temTabela = false; }

  // Uma tarefa específica, ou todas as que têm peças (semente ∪ banco).
  const uma = (req.nextUrl.searchParams.get("tarefa") || "").trim();
  const tarefas = uma
    ? [uma]
    : [...new Set([...Object.keys(PECAS_PADRAO), ...cfg.map((c) => c.tarefa)])].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const itens = tarefas.map((t) => ({
    tarefa: t,
    origem: cfg.some((c) => c.tarefa === t) ? "banco" : "padrao",
    pecas: pecasDaTarefa(t, cfg),
  }));
  return NextResponse.json({ itens, temTabela });
}

// PUT → substitui as peças de UMA tarefa (apaga e regrava).
// Substituir a tarefa inteira, e não peça a peça, casa com `pecasDaTarefa`: lá
// o banco vence por tarefa. Se aqui fosse por peça, tirar uma da lista deixaria
// a semente reaparecer com ela e a remoção pareceria não ter funcionado.
export async function PUT(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await podeAtividades(me, "configurar"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: { tarefa?: string; setor?: string; pecas?: { peca?: string; produz?: string | null; categoria?: string | null }[] };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const tarefa = String(b.tarefa || "").trim();
  if (!tarefa) return NextResponse.json({ error: "missing_tarefa" }, { status: 400 });
  const setor = String(b.setor || "Produção").trim() || "Produção";

  const linhas = (b.pecas ?? [])
    .map((p) => ({
      setor,
      tarefa,
      peca: String(p.peca || "").trim(),
      tarefa_produz: (p.produz || "").trim() || null,
      categoria_produz: (p.categoria || "").trim() || null,
      ativo: true,
    }))
    .filter((p) => p.peca);

  const db = createSupabaseAdminClient();
  try {
    await db.from("atividade_pecas").delete().eq("tarefa", tarefa).eq("setor", setor);
    if (linhas.length) {
      const { error } = await db.from("atividade_pecas").insert(linhas);
      if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ error: "sem_tabela", detail: String(e).slice(0, 140) }, { status: 500 });
  }
  // Lista vazia é intencional: "esta tarefa não depende de peça nenhuma".
  return NextResponse.json({ ok: true, salvas: linhas.length });
}
