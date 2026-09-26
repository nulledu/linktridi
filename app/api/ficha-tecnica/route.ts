import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { validarFicha } from "@/lib/estoque-hierarquia";

export const dynamic = "force-dynamic";

const PODE = ["admin", "estoquista", "gerente_producao"];

// GET /api/ficha-tecnica?item=<id> — componentes que o item usa (+ nome do componente).
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const item = req.nextUrl.searchParams.get("item");
  if (!item) return NextResponse.json({ error: "missing_item" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const ler = (cols: string) => db.from("ficha_tecnica")
    .select(`${cols},estoque_itens!ficha_tecnica_componente_id_fkey(nome,tipo_item)`)
    .eq("item_id", item).limit(500);
  // `desconta` chegou depois (supabase/ficha_tecnica_desconto.sql): sem ela a
  // ficha continua abrindo, toda linha sem baixa — que é o padrão.
  let { data, error } = await ler("id,componente_id,quantidade,desconta");
  if (error && /desconta/i.test(error.message ?? "")) ({ data } = await ler("id,componente_id,quantidade"));
  type Linha = { componente_id: string; quantidade: number; desconta?: boolean | null; estoque_itens: { nome: string; tipo_item: string | null } | { nome: string; tipo_item: string | null }[] | null };
  const linhas = ((data ?? []) as Linha[]).map((r) => {
    const c = Array.isArray(r.estoque_itens) ? r.estoque_itens[0] : r.estoque_itens;
    return {
      componente_id: r.componente_id, quantidade: Number(r.quantidade) || 0,
      desconta: r.desconta === true,
      nome: c?.nome ?? "—", tipo_item: c?.tipo_item ?? null,
    };
  });
  return NextResponse.json({ ficha: linhas });
}

// PUT — substitui a ficha técnica do item. Body: { item_id, linhas: [{componente_id, quantidade}] }
//
// `estoque:cadastrar`: a ficha diz DO QUE o item é feito — é a definição dele,
// não o saldo. Vai junto do resto do cadastro, e não de quem só ajusta número.
export async function PUT(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await papelOuChave(me, PODE, "estoque:cadastrar"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: { item_id?: string; linhas?: { componente_id?: string; quantidade?: number; desconta?: boolean }[] };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const item = String(b.item_id || "");
  if (!item) return NextResponse.json({ error: "missing_item" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const linhas = (b.linhas ?? [])
    .filter((l) => l.componente_id && l.componente_id !== item && (Number(l.quantidade) || 0) > 0)
    .map((l) => ({
      item_id: item, componente_id: String(l.componente_id), quantidade: Math.max(0, Number(l.quantidade) || 0),
      // A BAIXA é opt-in, linha por linha: por padrão produzir não tira nada
      // do estoque de ninguém — alguém tem que ligar. Só `true` explícito liga.
      desconta: l.desconta === true,
    }));

  // A tela filtra o seletor, mas quem decide é aqui: filtro de tela não é
  // validação. Uma requisição fora da tela montaria produto dentro de
  // matéria-prima e o banco aceitaria calado.
  const ids = linhas.map((l) => l.componente_id).filter(Boolean);
  if (ids.length > 0) {
    const [{ data: pai }, { data: filhos }] = await Promise.all([
      db.from("estoque_itens").select("hierarquia").eq("id", item).single(),
      db.from("estoque_itens").select("id,nome,hierarquia").in("id", ids).limit(500),
    ]);
    const porId = new Map<string, { id: string; nome: string; hierarquia: string | null }>(
      (filhos ?? []).map((f: { id: string; nome: string; hierarquia: string | null }) => [f.id, f]),
    );
    const check = validarFicha(pai?.hierarquia, ids.map((id: string) => ({
      nome: porId.get(id)?.nome ?? "item desconhecido",
      hierarquia: porId.get(id)?.hierarquia ?? null,
    })));
    if (!check.ok) {
      return NextResponse.json({
        error: "composicao_invalida",
        // Nome, não id: a mensagem vai pra tela e a pessoa precisa saber QUAL linha tirar.
        detalhe: check.invalidos.map((l) => l.nome),
      }, { status: 400 });
    }
  }

  // ── Ciclo: a trava que a hierarquia deixou de fazer ────────────────────────
  // A regra de composição virou uma escada (do meu nível pra baixo), e com isso
  // o MESMO nível passou a ser permitido — uma embalagem dentro de outra é caso
  // real do catálogo. Só que hierarquia nunca soube distinguir dois itens do
  // mesmo degrau: com ela sozinha, "Caixa A leva Caixa B" e "Caixa B leva Caixa
  // A" passam as duas, e quem explode a ficha entra em laço infinito.
  //
  // A checagem certa é por ITEM, não por tipo: se o pai já aparece na árvore
  // ABAIXO de algum componente novo, essa linha fecha o ciclo. A tabela de
  // fichas é pequena (dezenas de linhas), então uma leitura só e a busca em
  // largura na memória saem mais baratas que uma consulta recursiva por linha.
  if (ids.length > 0) {
    const { data: arestas } = await db.from("ficha_tecnica").select("item_id,componente_id").limit(5000);
    const filhosDe = new Map<string, string[]>();
    for (const a of (arestas ?? []) as { item_id: string; componente_id: string }[]) {
      // A ficha ANTIGA deste item vai ser apagada logo abaixo: mantê-la no grafo
      // acusaria ciclo em quem só está reordenando a própria ficha.
      if (a.item_id === item) continue;
      const lista = filhosDe.get(a.item_id);
      if (lista) lista.push(a.componente_id);
      else filhosDe.set(a.item_id, [a.componente_id]);
    }
    const fechaCiclo = (raiz: string): boolean => {
      const vistos = new Set<string>([raiz]);
      const fila = [raiz];
      while (fila.length) {
        const atual = fila.shift() as string;
        if (atual === item) return true;
        for (const f of filhosDe.get(atual) ?? []) {
          if (!vistos.has(f)) { vistos.add(f); fila.push(f); }
        }
      }
      return false;
    };
    const culpados = ids.filter(fechaCiclo);
    if (culpados.length > 0) {
      const { data: nomes } = await db.from("estoque_itens").select("id,nome").in("id", culpados).limit(100);
      const porId = new Map<string, string>(
        ((nomes ?? []) as { id: string; nome: string }[]).map((n) => [n.id, n.nome]),
      );
      return NextResponse.json({
        error: "composicao_ciclica",
        // Mesmo formato de `composicao_invalida`: a tela já sabe montar a frase
        // a partir de uma lista de nomes.
        detalhe: culpados.map((id) => porId.get(id) ?? "item desconhecido"),
      }, { status: 400 });
    }
  }

  await db.from("ficha_tecnica").delete().eq("item_id", item);
  if (linhas.length) {
    let { error } = await db.from("ficha_tecnica").insert(linhas);
    // Banco sem a coluna: grava a ficha sem o toggle em vez de perder a ficha
    // inteira — e AVISA, porque a linha que alguém ligou pra descontar vai
    // ficar sem baixa até o SQL rodar.
    let semTipo = false;
    if (error && /desconta/i.test(error.message ?? "")) {
      semTipo = linhas.some((l) => l.desconta);
      ({ error } = await db.from("ficha_tecnica").insert(linhas.map(({ desconta: _d, ...l }) => l)));
    }
    if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
    if (semTipo) return NextResponse.json({ ok: true, aviso: "sql_desconto_pendente" });
  }
  return NextResponse.json({ ok: true });
}
