import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { lerItensEstoque } from "@/lib/estoque-colunas";
import { linhasProducaoDia, verificarReabastecimento } from "@/lib/requisicoes";
import { hojeSP, lerConfig, salvarConfig, varrerSeNecessario } from "@/lib/estoque-automacao";

export const dynamic = "force-dynamic";

// Só quem gerencia o catálogo (mesma sub-permissão do resto do Estoque) — é
// quem responde quando uma atividade aparece do nada, então é quem precisa
// ver e mexer no interruptor.
const CHAVE = "estoque:itens";

// GET → a lista do dia, calculada AO VIVO, e é aqui que mora a automação: se
// `automacao_ativa` e o dia virou, `varrerSeNecessario` roda a varredura
// ANTES de montar as linhas — sem isto a tela mostraria "falta produzir" pro
// mesmo item que a automação estava prestes a cobrir sozinha.
export async function GET() {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = createSupabaseAdminClient();
  try {
    const hoje = hojeSP();
    await varrerSeNecessario(db, hoje, me.id);
    const config = await lerConfig(db);
    const itens = await lerItensEstoque(db);
    const { linhas, totalAProduzir, totalAguardando } = await linhasProducaoDia(db, itens);

    // ── A cadeia na tela ─────────────────────────────────────────────────────
    // Por item: o interruptor `producao_automatica` e a memória da dispensa.
    // Por ordem travada: o que falta (producao_esperas). Tudo tolerante — sem
    // o SQL da cadeia, os campos não vão e a tela mostra o painel de sempre.
    let porItem = new Map<string, {
      producaoAutomatica: boolean;
      dispensa: { saldo: number; por: string | null; motivo: string | null; em: string | null } | null;
    }>();
    const aguardando: {
      ordem: "atividade" | "programacao"; id: string; produto: string | null;
      alvo: number; origem: string | null; faltas: { nome: string; falta: number }[];
    }[] = [];
    try {
      const { data: flags, error: eFlags } = await db.from("estoque_itens")
        .select("id,producao_automatica,reposicao_dispensada_saldo,reposicao_dispensada_por,reposicao_dispensada_motivo,reposicao_dispensada_em")
        .gt("qtd_minima", 0).eq("ativo", true).limit(1000);
      if (!eFlags) {
        porItem = new Map((flags ?? []).map((f: Record<string, unknown>) => [String(f.id), {
          producaoAutomatica: f.producao_automatica === true,
          dispensa: f.reposicao_dispensada_saldo == null ? null : {
            saldo: Number(f.reposicao_dispensada_saldo) || 0,
            por: (f.reposicao_dispensada_por as string | null) ?? null,
            motivo: (f.reposicao_dispensada_motivo as string | null) ?? null,
            em: (f.reposicao_dispensada_em as string | null) ?? null,
          },
        }]));
      }
      const [{ data: ativsAg }, { data: esperas }] = await Promise.all([
        db.from("atividades").select("id,produto_nome,quantidade_alvo,origem_frase")
          .eq("status", "aguardando_material").limit(200),
        db.from("producao_esperas").select("atividade_id,programacao_id,item_nome,falta").limit(400),
      ]);
      const esperasPorDono = new Map<string, { nome: string; falta: number }[]>();
      for (const e of (esperas ?? []) as { atividade_id: string | null; programacao_id: string | null; item_nome: string; falta: number }[]) {
        const chave = e.atividade_id ? `a:${e.atividade_id}` : `p:${e.programacao_id}`;
        const arr = esperasPorDono.get(chave) ?? [];
        arr.push({ nome: e.item_nome, falta: e.falta });
        esperasPorDono.set(chave, arr);
      }
      for (const a of (ativsAg ?? []) as { id: string; produto_nome: string | null; quantidade_alvo: number | null; origem_frase?: string | null }[]) {
        aguardando.push({
          ordem: "atividade", id: a.id, produto: a.produto_nome,
          alvo: Number(a.quantidade_alvo) || 0, origem: a.origem_frase ?? null,
          faltas: esperasPorDono.get(`a:${a.id}`) ?? [],
        });
      }
      const { data: progsAg } = await db.from("maquina_programacoes")
        .select("id,produto_nome,quantidade_alvo")
        .eq("status", "aguardando_material").limit(200);
      for (const p of (progsAg ?? []) as { id: string; produto_nome: string | null; quantidade_alvo: number | null }[]) {
        aguardando.push({
          ordem: "programacao", id: p.id, produto: p.produto_nome,
          alvo: Number(p.quantidade_alvo) || 0, origem: null,
          faltas: esperasPorDono.get(`p:${p.id}`) ?? [],
        });
      }
    } catch { /* SQL da cadeia não rodado — painel de sempre */ }
    const linhasComCadeia = linhas.map((l) => {
      const extra = porItem.get(String(l.itemId));
      return extra ? { ...l, producaoAutomatica: extra.producaoAutomatica, dispensa: extra.dispensa } : l;
    });

    return NextResponse.json({
      cadeia: { aguardando },
      automacao: { ativa: config.automacao_ativa, ultimaVarredura: config.ultima_varredura },
      // O segundo interruptor do galpão: exigir o bipe do material antes de a
      // atividade abrir no tablet. Mora aqui, e não numa rota própria, porque é
      // a MESMA linha única de config e a mesma tela — dois GETs pra ler dois
      // booleanos do mesmo registro é invocação a mais pelo nada.
      bipeParaIniciar: config.bipe_para_iniciar,
      linhas: linhasComCadeia,
      // `aguardando` é o número que explica a tela: item abaixo do mínimo, nada
      // "em andamento" e mesmo assim nada a produzir porque as peças estão
      // prontas esperando conferência.
      totais: { itens: linhas.length, aProduzir: totalAProduzir, aguardando: totalAguardando },
    });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e).slice(0, 120) }, { status: 500 });
  }
}

// POST → "gerar as atividades que faltam" (o botão manual). Roda o mesmo
// `verificarReabastecimento()` do botão antigo em /api/estoque/reabastecer —
// não é uma cópia da regra, é a mesma chamada.
export async function POST() {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const resumo = await verificarReabastecimento();
    return NextResponse.json({ resumo });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e).slice(0, 120) }, { status: 500 });
  }
}

// PATCH → liga/desliga o interruptor. `atualizado_por` fica gravado (quem
// ligou isso é a primeira pergunta quando uma atividade aparece sem ninguém
// lembrar de ter pedido).
export async function PATCH(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  // Dois interruptores, um PATCH. `ativa` é a automação (o corpo histórico, que
  // segue valendo sozinho); `bipeParaIniciar` é a exigência do bipe. Aceita um,
  // outro, ou os dois — mas não uma chamada vazia, que seria uma escrita à toa.
  const temAtiva = typeof b.ativa === "boolean";
  const temBipe = typeof b.bipeParaIniciar === "boolean";
  // O terceiro interruptor é POR ITEM: `producao_automatica` — "só os que eu
  // ativar" geram atividade. Mesma tela, mesma permissão, mesmo PATCH.
  const temItem = typeof b.itemId === "string" && typeof b.producaoAutomatica === "boolean";
  if (!temAtiva && !temBipe && !temItem) return NextResponse.json({ error: "missing_ativa" }, { status: 400 });
  const db = createSupabaseAdminClient();
  if (temItem) {
    const { error } = await db.from("estoque_itens")
      .update({ producao_automatica: b.producaoAutomatica as boolean })
      .eq("id", String(b.itemId));
    if (error) {
      return NextResponse.json({
        error: "schema_desatualizado",
        detalhe: "Rode supabase/producao_em_cadeia.sql no banco — o interruptor por item depende dele.",
      }, { status: 409 });
    }
    if (!temAtiva && !temBipe) return NextResponse.json({ ok: true });
  }
  try {
    const config = await salvarConfig(db, {
      ...(temAtiva ? { automacao_ativa: b.ativa as boolean } : {}),
      ...(temBipe ? { bipe_para_iniciar: b.bipeParaIniciar as boolean } : {}),
    }, me.id);
    return NextResponse.json({
      automacao: { ativa: config.automacao_ativa, ultimaVarredura: config.ultima_varredura },
      bipeParaIniciar: config.bipe_para_iniciar,
    });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e).slice(0, 120) }, { status: 500 });
  }
}
