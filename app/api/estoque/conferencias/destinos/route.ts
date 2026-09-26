import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfileForModule } from "@/lib/require-auth";
import { estadoDeEtiqueta } from "@/lib/estoque-etiquetavel";

export const dynamic = "force-dynamic";

// Mesmo gate do resto da conferência — ver ../pendentes/route.ts.
const CHAVE = "estoque:itens";

/** Quantos itens a busca devolve. Uma tela de escolha, não um catálogo. */
const LIMITE = 20;

/** `%` e `_` são curingas do LIKE: "100%" tem de procurar "100%", não "100…". */
const paraIlike = (s: string) => s.replace(/([\\%_])/g, "\\$1");

/**
 * GET /api/estoque/conferencias/destinos?q=alav — "em qual item isto entra?".
 *
 * A fila já manda até três SUGESTÕES por caixa, calculadas a partir da tarefa
 * (lib/estoque-sugestao-item.ts). Esta rota é o que fazer quando nenhuma serve:
 * o gerente digita duas letras e escolhe.
 *
 * Ela existe em vez de reusar /api/estoque-itens porque aquela rota devolve o
 * catálogo INTEIRO com custo, fornecedor, dimensões e ficha — 192 itens de
 * payload pra uma pessoa que vai tocar em um. Aqui são quatro colunas e vinte
 * linhas, e a consulta só sai quando alguém digita.
 */
export async function GET(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  // Busca vazia não vira "o catálogo todo": seria o payload que esta rota
  // existe pra não mandar, e uma lista de 192 não é uma escolha.
  if (q.length < 2) return NextResponse.json({ itens: [] });

  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("estoque_itens")
    .select("id,nome,categoria,serializado,quantidade,unidade")
    .ilike("nome", `%${paraIlike(q)}%`)
    .order("nome")
    .limit(LIMITE);
  if (error) return NextResponse.json({ error: "failed", detail: error.message.slice(0, 120) }, { status: 500 });

  type Linha = { id: string; nome: string; categoria: string | null; serializado: boolean | null; quantidade: number | null; unidade: string | null };
  const itens = ((data ?? []) as Linha[])
    // `serializado` nulo é etiquetado — o padrão do catálogo, e a mesma leitura
    // de itensPorNome e da sugestão. Divergir aqui faria a tela prometer
    // etiqueta pra um item e não pro mesmo item vindo por outro caminho.
    .map((i) => {
      const serializado = i.serializado !== false;
      const quantidade = Math.max(0, Number(i.quantidade) || 0);
      // O destino escolhido na busca é o que decide a promessa — é por aqui que
      // entra o item que a atividade não apontava. Sem o `preparo` a tela cai no
      // conservador e some com o gesto de preparo justamente no caminho em que
      // a pessoa está escolhendo o item na mão.
      return {
        id: i.id, nome: i.nome, categoria: i.categoria, serializado,
        preparo: { ...estadoDeEtiqueta({ serializado, quantidade, unidade: i.unidade }), quantidade, unidade: i.unidade },
      };
    });

  return NextResponse.json({ itens });
}
