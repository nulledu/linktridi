import { NextRequest, NextResponse } from "next/server";
import { audit, marketApiError, marketDb, marketRepository, parseProfileIds, productPatchInput, requireMarketAdmin } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try { return NextResponse.json({ ok: true, data: await marketRepository().products(parseProfileIds(req.url)) }); }
  catch (error) { return marketApiError(error); }
}

export async function PATCH(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const cru = await req.json().catch(() => null) as { profileIds?: string[] } | null;
  const parsed = productPatchInput.safeParse(cru);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_product", issues: parsed.error.flatten() }, { status: 422 });
  const db = marketDb();
  try {
    const { id, profileId, name, price, active, imageUrl, minimumStock, allowStockOverride, semCodigo, ocultoBusca, codigoBarras, categoriaId, permitirCodigoRepetido } = parsed.data;

    // Repetir código de barras é permitido, mas só DE PROPÓSITO: sem a
    // confirmação a rota recusa. Um EAN digitado errado que calhe de ser o de
    // outro produto vira duas coisas no mesmo código sem ninguém perceber — e
    // aí o tablet passa a perguntar qual é a cada leitura, para sempre.
    if (codigoBarras && !permitirCodigoRepetido) {
      const { data: repetidos } = await db.from("produtos")
        .select("id,nome").eq("codigo_barras", codigoBarras).neq("id", id).limit(3);
      if (repetidos?.length) {
        return NextResponse.json({
          ok: false, error: "codigo_barras_em_uso",
          detalhe: `Já é o código de ${repetidos.map((r: { nome: string }) => r.nome).join(", ")}.`,
          jaUsadoPor: repetidos.map((r: { nome: string }) => r.nome),
        }, { status: 409 });
      }
    }
    // Editar valendo pra VÁRIAS empresas (ou levar um produto que já existe
    // para uma empresa nova, criando lá o preço e a linha de estoque).
    const unidadesAlvo = [...new Set([...(cru?.profileIds ?? []), profileId ?? ""].map((s) => String(s).trim()).filter(Boolean))];
    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.nome = name;
    if (price !== undefined) patch.preco_padrao = price;
    if (active !== undefined) patch.ativo = active;
    if (imageUrl !== undefined) patch.imagem_url = imageUrl;
    if (semCodigo !== undefined) patch.sem_codigo = semCodigo;
    if (ocultoBusca !== undefined) patch.oculto_busca = ocultoBusca;
    if (categoriaId !== undefined) patch.categoria_id = categoriaId;   // null = sem categoria
    if (codigoBarras !== undefined) {
      const limpo = (codigoBarras ?? "").trim();
      patch.codigo_barras = limpo || null;
      // Ficou sem código → só dá pra achar por toque, então ele TEM de entrar
      // na categoria "Produtos sem código". Senão some do tablet: não bipa e
      // não aparece em lugar nenhum.
      if (!limpo && semCodigo === undefined) patch.sem_codigo = true;
    }
    if (Object.keys(patch).length) {
      const { error } = await db.from("produtos").update(patch).eq("id", id);
      if (error) throw error;
    }
    // Mínimo e "pode vender sem ter" moram no próprio estoque da unidade
    // (eram uma tabela de regras à parte no sistema antigo).
    if (unidadesAlvo.length && (minimumStock !== undefined || allowStockOverride !== undefined)) {
      const regras = unidadesAlvo.map((unidade_id) => {
        const regra: Record<string, unknown> = { unidade_id, produto_id: id, atualizado_em: new Date().toISOString() };
        if (minimumStock !== undefined) regra.minimo = minimumStock;
        if (allowStockOverride !== undefined) regra.permite_negativo = allowStockOverride;
        return regra;
      });
      const { error } = await db.from("estoque").upsert(regras, { onConflict: "unidade_id,produto_id" });
      if (error) throw error;
    }
    // Preço POR UNIDADE na tabela que o legado já tem (precos_perfil), em vez de
    // um histórico paralelo. Assim cada unidade pode ter o seu preço — e o
    // catálogo do totem passa a respeitar isso (ver repository.products).
    if (unidadesAlvo.length && price !== undefined) {
      const { error } = await db.from("precos").upsert(
        unidadesAlvo.map((unidade_id) => ({ unidade_id, produto_id: id, preco: price, atualizado_em: new Date().toISOString() })),
        { onConflict: "unidade_id,produto_id" },
      );
      if (error) throw error;
    }

    // TIRAR o produto das empresas desmarcadas. Antes só dava pra ADICIONAR:
    // desmarcar uma empresa e salvar não fazia nada, o que parecia que o botão
    // Salvar estava quebrado.
    //
    // Só com `profileIds` explícito — sem ele a chamada não está falando sobre
    // o conjunto de empresas, e apagar seria destruir por omissão.
    if (cru?.profileIds?.length) {
      const { data: onde } = await db.from("precos").select("unidade_id").eq("produto_id", id);
      const sobrando = ((onde ?? []) as Array<{ unidade_id: string }>)
        .map((l) => String(l.unidade_id)).filter((u) => !unidadesAlvo.includes(u));
      if (sobrando.length) {
        // Estoque em pé é dinheiro parado na prateleira: sumir com ele em
        // silêncio esconderia uma perda. Quem quiser tirar mesmo assim zera o
        // estoque antes (ou dá baixa pela aba Estoque).
        const { data: comSaldo } = await db.from("estoque")
          .select("unidade_id,quantidade").eq("produto_id", id).in("unidade_id", sobrando).gt("quantidade", 0);
        const travadas = ((comSaldo ?? []) as Array<{ unidade_id: string }>).map((l) => String(l.unidade_id));
        const podeSair = sobrando.filter((u) => !travadas.includes(u));
        if (podeSair.length) {
          await db.from("precos").delete().eq("produto_id", id).in("unidade_id", podeSair);
          await db.from("estoque").delete().eq("produto_id", id).in("unidade_id", podeSair);
        }
        if (travadas.length) {
          await audit(actor.id, "produto.remover_empresa_bloqueado", "produto", id, undefined, { travadas });
          return NextResponse.json({
            ok: false, error: "estoque_em_aberto",
            detalhe: `O produto ainda tem estoque em ${travadas.length} empresa(s). Zere o estoque lá antes de tirá-lo de lá.`,
          }, { status: 409 });
        }
      }
    }
    await audit(actor.id, "product.update", "product", id, undefined, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) { return marketApiError(error); }
}

// POST — CADASTRAR produto. O catálogo agora é nosso: antes vinha do ERP antigo
// e aqui só dava pra editar preço/estoque.
//
// Preço e estoque são POR UNIDADE, então o cadastro já cria as duas linhas na
// unidade escolhida — senão o produto nasce invisível pro tablet (sem preço e
// sem linha de estoque, ele não aparece no catálogo).
export async function POST(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const corpo = await req.json().catch(() => null) as {
    nome?: string; profileId?: string; profileIds?: string[]; preco?: number; custo?: number | null;
    codigoBarras?: string | null; categoriaId?: number | null; imagemUrl?: string | null;
    semCodigo?: boolean; ocultoBusca?: boolean; permitirCodigoRepetido?: boolean; estoque?: number; minimo?: number;
  } | null;
  const nome = (corpo?.nome ?? "").trim();
  // O produto é UM só; o que é por empresa são preço e estoque. Cadastrar a
  // mesma bolacha cinco vezes, uma por empresa, criava cinco produtos
  // diferentes — e o painel passava a somar as vendas separadas.
  const unidades = [...new Set([...(corpo?.profileIds ?? []), corpo?.profileId ?? ""].map((s) => s.trim()).filter(Boolean))];
  const preco = Number(corpo?.preco ?? 0);
  if (nome.length < 2 || !unidades.length || !(preco >= 0)) {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 422 });
  }
  const codigo = (corpo?.codigoBarras ?? "").trim() || null;

  const db = marketDb();
  try {
    if (codigo && corpo?.permitirCodigoRepetido !== true) {
      const { data: repetidos } = await db.from("produtos").select("id,nome").eq("codigo_barras", codigo).limit(3);
      if (repetidos?.length) {
        return NextResponse.json({
          ok: false, error: "codigo_barras_em_uso",
          detalhe: `Já é o código de ${repetidos.map((r: { nome: string }) => r.nome).join(", ")}.`,
          jaUsadoPor: repetidos.map((r: { nome: string }) => r.nome),
        }, { status: 409 });
      }
    }
    const { data: produto, error } = await db.from("produtos").insert({
      nome,
      codigo_barras: codigo,
      categoria_id: corpo?.categoriaId ?? null,
      preco_padrao: preco,
      custo_padrao: corpo?.custo ?? null,
      imagem_url: corpo?.imagemUrl ?? null,
      sem_codigo: corpo?.semCodigo === true || !codigo,   // sem código de barras → entra na categoria de toque
      // Só manda a coluna quando marcada: enquanto o SQL de
      // supabase/tridimarket_oculto_busca.sql não tiver rodado ela não existe,
      // e mandá-la sempre faria TODO cadastro de produto falhar com 42703.
      ...(corpo?.ocultoBusca === true ? { oculto_busca: true } : {}),
      ativo: true,
    }).select("id,nome").single();
    if (error) throw error;

    // Preço e estoque iniciais em CADA empresa escolhida — é o que torna o
    // produto visível no tablet. Sem essas duas linhas ele nasce invisível.
    await db.from("precos").upsert(
      unidades.map((unidade_id) => ({ unidade_id, produto_id: produto.id, preco })),
      { onConflict: "unidade_id,produto_id" },
    );
    await db.from("estoque").upsert(
      unidades.map((unidade_id) => ({
        unidade_id, produto_id: produto.id,
        quantidade: Math.max(0, Number(corpo?.estoque ?? 0)),
        minimo: Math.max(0, Number(corpo?.minimo ?? 5)),
      })),
      { onConflict: "unidade_id,produto_id" },
    );
    await audit(actor.id, "produto.criar", "produto", produto.id, undefined, { nome, preco, unidades });
    return NextResponse.json({ ok: true, data: produto });
  } catch (error) { return marketApiError(error); }
}
