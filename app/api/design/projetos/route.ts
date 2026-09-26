import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { cached } from "@/lib/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { lerDesignEmCache, resumir, filtrarProjetos, ordenarProjetos, linha, type FiltroProjetos, type TarefaDesign } from "@/lib/design-projetos";
import { STATUS_DESIGN, COLUNAS_DESIGN, type ColunaDesign, type StatusDesign, type Prioridade } from "@/lib/design-fluxo";
import { ETAPAS_DO_SETOR, ciclo, envelhecendo, etapasDeGestao, fluxoDoPeriodo, gargalo, retrabalho } from "@/lib/design-gestao";

export const dynamic = "force-dynamic";

/**
 * Tarefas do módulo Atividades lançadas pro setor Design. É o planejamento que
 * o ERP não tem (prazo, pessoa): quem gere o Design distribui por Atividades,
 * e as Programações leem daqui — nada de uma segunda agenda paralela.
 */
async function tarefasDoDesign(): Promise<TarefaDesign[]> {
  try {
    const db = createSupabaseAdminClient();
    const desde = new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await db.from("atividades")
      .select("id,tarefa,para_nome,status,prazo,urgente,iniciada_at,concluida_at")
      .ilike("setor", "design%")
      .or(`status.neq.concluida,prazo.gte.${desde}`)
      .order("prazo", { ascending: true, nullsFirst: false })
      .limit(300);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((a) => ({
      id: a.id as string, tarefa: a.tarefa as string, para: a.para_nome as string, status: a.status as string,
      prazo: (a.prazo as string | null) ?? null, urgente: !!a.urgente,
      iniciadaAt: (a.iniciada_at as string | null) ?? null, concluidaAt: (a.concluida_at as string | null) ?? null,
    }));
  } catch { return []; }
}

const umDe = <T extends string>(v: string | null, ok: readonly T[]): T | null => (v && (ok as readonly string[]).includes(v) ? (v as T) : null);

export async function GET(req: NextRequest) {
  if (!(await getProfileForModule("design"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  try {
    const leitura = await lerDesignEmCache();

    // Lista filtrada: não tem tela no módulo (o Design é painel de gestão);
    // a rota continua servindo as peças guardadas em `design/_guardado`.
    if (sp.get("vista") === "lista") {
      const filtro: FiltroProjetos = {
        status: umDe<StatusDesign>(sp.get("status"), STATUS_DESIGN.map((s) => s.chave)),
        coluna: umDe<ColunaDesign>(sp.get("coluna"), COLUNAS_DESIGN.map((c) => c.chave)),
        prioridade: umDe<Prioridade>(sp.get("prioridade"), ["alta", "media", "baixa"]),
        responsavel: sp.get("resp"),
        busca: sp.get("q"),
      };
      // Contagem por status/coluna SEM o filtro de status/coluna — é o que a
      // fileira de abas mostra ("Revisão 517") enquanto a pessoa busca.
      const base = filtrarProjetos(leitura.projetos, { ...filtro, status: null, coluna: null });
      const lista = ordenarProjetos(filtrarProjetos(base, filtro));
      const limite = Math.min(400, Math.max(1, Number(sp.get("limite")) || 120));
      const porStatus: Record<string, number> = {}, porColuna: Record<string, number> = {};
      for (const p of base) { porStatus[p.status] = (porStatus[p.status] ?? 0) + 1; if (p.coluna) porColuna[p.coluna] = (porColuna[p.coluna] ?? 0) + 1; }
      // Kanban: até `limite` por coluna, não no total — senão a coluna de 500
      // artes com o cliente engole as outras.
      const porGrupo = sp.get("agrupar") === "coluna" ? "coluna" : sp.get("agrupar") === "status" ? "status" : null;
      let projetos = lista.slice(0, limite);
      if (porGrupo) {
        const cont = new Map<string, number>();
        projetos = lista.filter((p) => { const k = String(p[porGrupo]); const n = cont.get(k) ?? 0; cont.set(k, n + 1); return n < limite; });
      }
      return NextResponse.json({
        atualizadoEm: leitura.atualizadoEm, total: lista.length, porStatus, porColuna,
        responsaveis: [...new Set(leitura.projetos.map((p) => p.responsavel).filter(Boolean))].sort(),
        projetos: projetos.map(linha),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    // ── O painel de GESTÃO ────────────────────────────────────────────────
    // As perguntas de quem gere uma linha: entrou mais do que saiu, onde o
    // trabalho está parado, qual é o gargalo, o que envelhece, quanto tempo
    // leva e quanto volta.
    const agora = new Date();
    const ps = leitura.projetos;
    const etapas = etapasDeGestao(ps);
    const wipSetor = ps.filter((p) => ETAPAS_DO_SETOR.includes(p.status)).length;
    const tarefas = await cached("design:tarefas", 60_000, tarefasDoDesign);
    return NextResponse.json({
      atualizadoEm: leitura.atualizadoEm,
      resumo: resumir(leitura, agora),
      etapas,
      gargalo: gargalo(etapas),
      wipSetor,
      fluxo7: fluxoDoPeriodo(leitura.entradas, leitura.saidas, wipSetor, 7),
      entradas: leitura.entradas,
      saidas: leitura.saidas,
      ciclo: ciclo(ps, agora),
      retrabalho: retrabalho(ps, agora),
      envelhecendo: envelhecendo(ps, 6).map(linha),
      atencao: ordenarProjetos(ps.filter((p) => p.prioridade === "alta")).slice(0, 8).map(linha),
      eventos: leitura.eventos.slice(0, 12),
      tarefas,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "erp", detail: String(e) }, { status: 500 });
  }
}
