import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { schemaDesatualizado } from "@/lib/estoque-unidades-gerar";
import { corDimensoesDoItem, type EtiquetaConferencia } from "@/lib/estoque-conferencia";
import { pecasDaUnidade } from "@/lib/estoque-unidades";

export const dynamic = "force-dynamic";

const PODE = ["admin", "estoquista", "gerente_producao"];

/** Teto de etiquetas por chamada — o mesmo lote da geração. */
const TETO = 500;

/**
 * GET /api/estoque/unidades/etiqueta?codigos=A,B,C — a etiqueta MONTADA pelo
 * servidor, pronta pra imprimir.
 *
 * O buraco que ela fecha: até aqui, a única etiqueta imprimível da plataforma
 * era a que nascia dentro do painel de conferência, e ela sumia quando o painel
 * fechava. Três consequências, todas no galpão:
 *
 *  1. A caixa aprovada tinha UMA chance de sair no papel. Rede caindo, aba
 *     fechada ou navegador morto no meio deixavam a caixa lacrada na prateleira
 *     sem código colado, e nenhuma tela do sistema refazia o papel.
 *  2. Etiqueta gerada FORA da conferência (o painel de etiquetar em lote, que é
 *     justamente o caminho dos 192 itens que ainda não são serializados) não
 *     tinha onde ser impressa: o texto mandava imprimir "pela ficha de cada
 *     item", e lá não existe impressão.
 *  3. No tablet a reimpressão monta a etiqueta LOCAL, então sai com o SKU no
 *     lugar do nome, sem local e sem a quantidade — numa caixa de 50 peças, a
 *     segunda via mente.
 *
 * O formato é o MESMO objeto que a conferência já devolve (`EtiquetaConferencia`)
 * e que os dois clientes já sabem desenhar — esta rota não inventa layout
 * nenhum, só responde "o que está escrito nesta caixa".
 *
 * `quantidade` (a coluna da CAIXA) vem de SQL que roda na mão: pede-se COM, e
 * no erro de schema repete-se SEM, quando cada etiqueta vale 1 peça — que é
 * como o galpão funcionava antes da caixa existir. Falhar duas vezes é a TABELA
 * faltando, e aí sim é 409. Mesmo padrão de /api/estoque/unidades.
 */
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await papelOuChave(me, PODE, "estoque:itens"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const bruto = req.nextUrl.searchParams.get("codigos");
  const codigos = [...new Set((bruto ?? "").split(",").map((c) => c.trim()).filter(Boolean))].slice(0, TETO);
  if (!codigos.length) return NextResponse.json({ error: "sem_codigos" }, { status: 400 });

  const db = createSupabaseAdminClient();

  type Unidade = {
    id: string; codigo: string; item_id: string;
    criado_por: string | null; criado_em: string; quantidade?: number | null;
  };
  const SEM_CAIXA = "id,codigo,item_id,criado_por,criado_em";
  const pedir = (colunas: string) =>
    db.from("estoque_unidades").select(colunas).in("codigo", codigos).limit(TETO);

  let unidades: Unidade[];
  const comCaixa = await pedir(`${SEM_CAIXA},quantidade`);
  if (comCaixa.error && schemaDesatualizado(comCaixa.error)) {
    const semCaixa = await pedir(SEM_CAIXA);
    if (semCaixa.error) {
      if (schemaDesatualizado(semCaixa.error)) {
        return NextResponse.json({
          error: "schema_desatualizado",
          detalhe: "Rode supabase/estoque_hierarquia_unidades.sql no Supabase — as unidades etiquetadas ainda não têm tabela.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "failed", detail: semCaixa.error.message }, { status: 500 });
    }
    unidades = (semCaixa.data ?? []) as unknown as Unidade[];
  } else if (comCaixa.error) {
    return NextResponse.json({ error: "failed", detail: comCaixa.error.message }, { status: 500 });
  } else {
    unidades = (comCaixa.data ?? []) as unknown as Unidade[];
  }

  // Código que não existe simplesmente não volta na lista (etiqueta rasgada e
  // digitação errada são rotina no galpão). Quem chamou compara o que pediu com
  // o que veio — devolver a lista curta é mais útil que recusar o lote inteiro.
  if (!unidades.length) return NextResponse.json({ etiquetas: [] });

  // Item e local numa consulta cada, pro lote inteiro — nunca embed por linha.
  type Item = {
    id: string; nome: string; cor: string | null;
    largura_mm: number | null; altura_mm: number | null; local_id: string | null;
  };
  const itemIds = [...new Set(unidades.map((u) => u.item_id).filter(Boolean))];
  const itemPorId = new Map<string, Item>();
  if (itemIds.length) {
    const { data } = await db
      .from("estoque_itens")
      .select("id,nome,cor,largura_mm,altura_mm,local_id")
      .in("id", itemIds)
      .limit(TETO);
    for (const it of (data ?? []) as Item[]) itemPorId.set(it.id, it);
  }

  const localIds = [...new Set([...itemPorId.values()].map((i) => i.local_id).filter((l): l is string => !!l))];
  const localPorId = new Map<string, { codigo: string; nome: string }>();
  if (localIds.length) {
    const { data } = await db.from("estoque_locais").select("id,codigo,nome").in("id", localIds).limit(TETO);
    for (const l of (data ?? []) as { id: string; codigo: string; nome: string }[]) {
      localPorId.set(l.id, { codigo: l.codigo, nome: l.nome });
    }
  }

  // A ordem é a que o cliente pediu, não a que o banco devolveu: quem manda 40
  // códigos pra imprimir espera as folhas na ordem da lista que tem na mão.
  const porCodigo = new Map(unidades.map((u) => [u.codigo, u]));
  // `itemId` viaja junto porque quem imprime precisa dele pra registrar a
  // impressão (POST /api/estoque/etiquetas exige `item_id`) — sem ele o livro
  // de impressões só saberia da etiqueta que nasce da conferência.
  const etiquetas: (EtiquetaConferencia & { itemId: string | null })[] = [];
  for (const codigo of codigos) {
    const u = porCodigo.get(codigo);
    if (!u) continue;
    const item = itemPorId.get(u.item_id) ?? null;
    const local = item?.local_id ? localPorId.get(item.local_id) ?? null : null;
    etiquetas.push({
      codigo: u.codigo,
      unidadeId: u.id,
      itemId: item?.id ?? null,
      // Item apagado do catálogo: o código ainda é a verdade colada na caixa, e
      // imprimi-lo sem nome é melhor que não imprimir nada.
      nome: item?.nome ?? u.codigo,
      corDimensoes: item ? corDimensoesDoItem(item) : undefined,
      quantidade: pecasDaUnidade(u),
      local: local?.codigo ?? "",
      localDetalhe: local?.nome,
      // Quem FEZ a peça, não quem está reimprimindo: a etiqueta acompanha a
      // peça, e o que importa nela é a autoria do trabalho.
      responsavel: u.criado_por ?? "",
      data: u.criado_em,
    });
  }

  return NextResponse.json({ etiquetas });
}
