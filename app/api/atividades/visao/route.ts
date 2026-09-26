import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { podeAtividades } from "@/lib/atividades-acesso";
import { limparGrupos } from "@/lib/atividades-lancador";
import { COLS_ITEM_DA_VISAO, lerConfigDaVisao, normalizarItem } from "@/lib/atividades-visao-servidor";

export const dynamic = "force-dynamic";

// A seção "Produtos e componentes" da Visão geral de Atividades:
//   GET ?catalogo=1 → o catálogo do Estoque + a escolha e as categorias, pro
//                     "Personalizar" e o "Categorias" (Configurar);
//   GET ?item=<id>  → componentes da ficha técnica + atividades criadas pro
//                     item (o pop-up; Ver);
//   PUT { itens?, grupos? } → grava a escolha e/ou as categorias (Configurar).
// Tabelas em supabase/atividades_itens_da_visao.sql; sem elas, a leitura
// devolve vazio e a escrita diz o que falta.

const semTabela = (msg?: string) =>
  !!msg && /relation .* does not exist|Could not find the table|schema cache|column .* does not exist/i.test(msg);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const sp = req.nextUrl.searchParams;

  if (sp.get("catalogo")) {
    if (!(await podeAtividades(me, "configurar"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const [{ data: itens }, cfg] = await Promise.all([
      db.from("estoque_itens").select("id,nome,categoria,hierarquia,imagem_url")
        .eq("ativo", true).order("nome", { ascending: true }).limit(1000),
      lerConfigDaVisao(db),
    ]);
    return NextResponse.json({ itens: itens ?? [], selecionados: cfg.ids, grupos: cfg.grupos });
  }

  const item = sp.get("item");
  if (!item || !UUID.test(item)) return NextResponse.json({ error: "missing_item" }, { status: 400 });
  if (!(await podeAtividades(me, "ver"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [{ data: ficha }, opc] = await Promise.all([
    db.from("ficha_tecnica").select("componente_id").eq("item_id", item).limit(200),
    db.from("atividades_opcoes").select("id,item_id,nome,setor,ordem").eq("item_id", item)
      .order("ordem", { ascending: true }).limit(200),
  ]);
  const ids = [...new Set(((ficha ?? []) as { componente_id: string }[]).map((f) => f.componente_id))];
  let componentes: ReturnType<typeof normalizarItem>[] = [];
  if (ids.length) {
    const ler = (cols: string) => db.from("estoque_itens").select(cols).in("id", ids).order("nome", { ascending: true }).limit(200);
    let r = await ler(`${COLS_ITEM_DA_VISAO},setor_responsavel`);
    if (r.error) r = await ler(COLS_ITEM_DA_VISAO);
    componentes = ((r.data ?? []) as unknown as Parameters<typeof normalizarItem>[0][]).map(normalizarItem);
  }
  return NextResponse.json({
    componentes,
    opcoes: opc.error ? [] : opc.data ?? [],
    // O pop-up avisa que "Adicionar atividade" ainda não grava (SQL pendente).
    semTabelaDeOpcoes: !!opc.error && semTabela(opc.error.message),
  });
}

export async function PUT(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeAtividades(me, "configurar"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: { itens?: unknown; grupos?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const temItens = Array.isArray(b.itens);
  const temGrupos = Array.isArray(b.grupos);
  if (!temItens && !temGrupos) return NextResponse.json({ error: "invalid" }, { status: 400 });

  // Só as colunas que vieram: salvar as categorias não pode zerar a escolha de
  // itens, e vice-versa (o upsert só reescreve o que está no corpo).
  const row: Record<string, unknown> = { id: true, atualizado_em: new Date().toISOString(), atualizado_por: me.id };
  const itens = temItens
    ? [...new Set((b.itens as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 300)
    : undefined;
  const grupos = temGrupos ? limparGrupos(b.grupos) : undefined;
  if (itens) row.visao_itens = itens;
  if (grupos) row.visao_grupos = grupos;

  const { error } = await createSupabaseAdminClient().from("atividades_config").upsert(row, { onConflict: "id" });
  if (error) {
    return semTabela(error.message)
      ? NextResponse.json({ error: "sem_tabela" }, { status: 409 })
      : NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(itens ? { itens } : {}), ...(grupos ? { grupos } : {}) });
}
