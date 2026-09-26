import { tabletDaProducao } from "@/lib/tablet-da-producao";
import { podeReceberAtividade } from "@/lib/atividades-lancador";
import { NextRequest, NextResponse } from "next/server";
import { podeAtividades } from "@/lib/atividades-acesso";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { gerarOrdens, ehProduto, SETOR_PRODUCAO, TEMPO_PADRAO_MIN, type ProdutoProducao } from "@/lib/producao-receita";
import { listModelos } from "@/lib/producao-modelos";
import { colaboradoresDeTodosOsSetores } from "@/lib/atividades";
import { presencaAgora } from "@/lib/ponto";
import { notificar } from "@/lib/notificacoes";

// Ordem gerada, já com os campos extras (estoque/instruções/gif) quando houver.
interface OrdemLinha { categoria: string; tarefa: string; detalhe: string; quantidade_alvo: number; fase: number; produto_id: number | null; produto_nome: string | null; instrucoes: string | null; demo_url: string | null; urgente: boolean }

export const dynamic = "force-dynamic";

const colunaAusente = (msg: string | undefined) => !!msg && /column .* does not exist|Could not find the .* column/i.test(msg);
// Gerar produção é ATRIBUIR trabalho: área Atividades › Atribuir
// (lib/atividades-acesso.ts). Antes era o cargo ou "Produção › Controle".
const podeGerar = (me: Parameters<typeof podeAtividades>[0]) => podeAtividades(me, "atribuir");

// POST { produtos: ("chancela"|"cliche")[], meta } → cria todas as ordens no pool "Produção".
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeGerar(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: { produtos?: unknown; meta?: unknown; ordens?: unknown; confirmar?: boolean; mesa_alvo?: string | null };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  // Tablet onde cai (batch). null = pool: qualquer tablet do setor; dirigida: só no sistema.
  const db = createSupabaseAdminClient();
  // Sem escolha, cai no tablet da Produção (o único de atividades).
  const mesaAlvo = ((typeof b.mesa_alvo === "string" && b.mesa_alvo.trim()) ? b.mesa_alvo.trim() : null)
    ?? await tabletDaProducao(db).catch(() => null);
  const lote = randomUUID();
  const porNome = me.name || me.username;
  let linhas: Record<string, unknown>[];
  const alvosNotificar: { id: string; tarefa: string }[] = [];

  if (Array.isArray(b.ordens) && b.ordens.length > 0) {
    // Caminho NOVO: ordens já computadas no cliente, com destino por ordem
    // (pool = sem para_id; pessoa específica = para_id).
    type OrdIn = { categoria?: string; tarefa?: string; detalhe?: string; quantidade_alvo?: number; fase?: number; produto_id?: number | null; produto_nome?: string | null; instrucoes?: string | null; demo_url?: string | null; urgente?: boolean; para_id?: string | null; mesa_alvo?: string | null };
    const raw = (b.ordens as OrdIn[]).filter((o) => o && typeof o.tarefa === "string" && o.tarefa.trim());
    if (raw.length === 0) return NextResponse.json({ error: "sem_ordens" }, { status: 422 });
    const alvos = [...new Set(raw.map((o) => o.para_id).filter(Boolean) as string[])];
    const nomePorId = new Map<string, string>();
    if (alvos.length) {
      const atrib = await colaboradoresDeTodosOsSetores();
      // Só Produção/Máquinas/Preparo e Logística recebem atividade.
      for (const c of atrib) if (podeReceberAtividade(c)) nomePorId.set(c.id, c.nome);
      for (const id of alvos) if (!nomePorId.has(id)) return NextResponse.json({ error: "fora_da_hierarquia" }, { status: 403 });
      // Presença: se a pessoa não bateu ponto, pede confirmação (a menos de confirmar:true).
      if (!b.confirmar) {
        const pres = await presencaAgora(alvos).catch(() => null);
        const ausente = pres ? alvos.find((id) => pres.registrados.has(id) && !pres.presentes.has(id)) : null;
        if (ausente) return NextResponse.json({ error: "nao_presente", nome: nomePorId.get(ausente) }, { status: 409 });
      }
    }
    linhas = raw.map((o) => {
      const para = o.para_id || null;
      const dirigida = !!para;
      if (dirigida) alvosNotificar.push({ id: para as string, tarefa: String(o.tarefa) });
      return {
        categoria: o.categoria || "Produção", tarefa: String(o.tarefa), detalhe: o.detalhe ?? null,
        para_id: para, para_nome: dirigida ? (nomePorId.get(para as string) ?? "") : "",
        setor: SETOR_PRODUCAO, pool: !dirigida, por_id: me.id, por_nome: porNome, status: "pendente",
        quantidade_alvo: Number(o.quantidade_alvo) > 0 ? Math.round(Number(o.quantidade_alvo)) : 1, quantidade_feita: 0,
        produto_id: o.produto_id ?? null, produto_nome: o.produto_nome ?? null,
        instrucoes: o.instrucoes ?? null, demo_url: o.demo_url ?? null, urgente: o.urgente === true,
        mesa_alvo: (typeof o.mesa_alvo === "string" && o.mesa_alvo.trim()) ? o.mesa_alvo.trim() : mesaAlvo,
        tempo_estimado_min: TEMPO_PADRAO_MIN, ordem: Number(o.fase) || 1, lote,
      };
    });
  } else {
    // Caminho antigo: produtos + meta → tudo no POOL (deriva dos modelos/receita).
    const produtos = Array.isArray(b.produtos) ? (b.produtos.filter(ehProduto) as ProdutoProducao[]) : [];
    const meta = Number(b.meta);
    if (produtos.length === 0) return NextResponse.json({ error: "sem_produtos" }, { status: 422 });
    if (!Number.isFinite(meta) || meta < 1 || meta > 999 || Math.round(meta) !== meta) return NextResponse.json({ error: "meta_invalida" }, { status: 422 });
    const modelos = await listModelos().catch(() => null);
    const selecionados = produtos as string[];
    const doModelo = (modelos ?? []).filter((m) => selecionados.includes(m.produto));
    let ordens: OrdemLinha[];
    if (doModelo.length > 0) {
      ordens = doModelo.map((m) => ({ categoria: m.categoria, tarefa: m.tarefa, detalhe: m.detalhe ?? "", quantidade_alvo: Math.max(1, Math.round((Number(m.por_meta) || 1) * meta)), fase: m.fase, produto_id: m.produto_id ?? null, produto_nome: m.produto_nome ?? null, instrucoes: m.instrucoes ?? null, demo_url: m.demo_url ?? null, urgente: m.urgente === true }));
    } else {
      ordens = gerarOrdens(produtos, meta).map((o) => ({ categoria: o.categoria, tarefa: o.tarefa, detalhe: o.detalhe, quantidade_alvo: o.quantidade_alvo, fase: o.fase, produto_id: null, produto_nome: null, instrucoes: null, demo_url: null, urgente: false }));
    }
    linhas = ordens.map((o) => ({
      categoria: o.categoria, tarefa: o.tarefa, detalhe: o.detalhe, para_id: null, para_nome: "",
      setor: SETOR_PRODUCAO, pool: true, por_id: me.id, por_nome: porNome, status: "pendente",
      quantidade_alvo: o.quantidade_alvo, quantidade_feita: 0, produto_id: o.produto_id, produto_nome: o.produto_nome,
      instrucoes: o.instrucoes, demo_url: o.demo_url, urgente: o.urgente, mesa_alvo: mesaAlvo, tempo_estimado_min: TEMPO_PADRAO_MIN, ordem: o.fase, lote,
    }));
  }

  let { error } = await db.from("atividades").insert(linhas);
  // Colunas novas ainda não criadas (migração pendente) → remove a que faltar e reinsere.
  for (let i = 0; error && colunaAusente(error.message) && i < 6; i++) {
    const m = /'([^']+)' column|column "?([^"\s]+)"? .* does not exist/.exec(error.message);
    const col = (m?.[1] || m?.[2]) as string | undefined;
    if (!col) break;
    const semCol = linhas.map((r) => { const c = { ...r } as Record<string, unknown>; delete c[col]; return c; });
    ({ error } = await db.from("atividades").insert(semCol));
  }
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });

  // Notifica as pessoas das ordens DIRIGIDAS (pool não tem dono → sem notificação).
  if (alvosNotificar.length) {
    await notificar(alvosNotificar.map((a) => ({ user_id: a.id, tipo: "tarefa" as const, titulo: "Nova atividade", corpo: a.tarefa, link: "/minhas-atividades", de_nome: porNome }))).catch(() => {});
  }
  return NextResponse.json({ lote, criadas: linhas.length });
}

// DELETE ?lote= → cancela o lote: apaga só o que ainda está no pool e pendente.
export async function DELETE(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeGerar(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const lote = req.nextUrl.searchParams.get("lote");
  if (!lote) return NextResponse.json({ error: "missing_lote" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("atividades").delete()
    .eq("lote", lote).eq("status", "pendente").is("para_id", null)
    .select("id");
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, removidas: (data ?? []).length });
}
