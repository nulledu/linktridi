import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { criarFreio, origemDe } from "@/lib/rate-limit";
import { ACEITA_CARRINHO } from "@/lib/lojas";
import { criarPedidoDaVitrine, getLojaPublicaPorSlug, LojasTabelaAusente, PedidoRecusado } from "@/lib/lojas-db";
import { COOKIE_ATRIBUICAO, COOKIE_SESSAO, COOKIE_VISITANTE, lerAtribuicao, ufDaRequisicao } from "@/lib/lojas-analytics";

export const dynamic = "force-dynamic";

// ── Pedido da vitrine ────────────────────────────────────────────────────────
// A ÚNICA rota de escrita do sistema aberta a quem não tem sessão. Tudo aqui
// parte de que o corpo é hostil:
//
//  - preço e total NÃO vêm no corpo. O cliente manda `produtoId` e
//    `quantidade`; quem precifica é o servidor (ver `criarPedidoDaVitrine`).
//    Aceitar preço do navegador é aceitar `precoUnitario: 0,01` de quem abre o
//    DevTools, e o pedido entraria bonito na lista do lojista.
//  - a loja precisa estar publicada E com carrinho ligado. Vitrine que só
//    mostra não vira porta de escrita por alguém chamar a rota na mão.
//  - freio por IP, porque não há sessão pra limitar. Sem ele, um laço de
//    `curl` enche a tela de Pedidos do lojista em segundos — e cada pedido é
//    uma escrita no banco.
//
// O freio é por ORIGEM e não por loja: quem abusa é um endereço, e limitar por
// loja deixaria o mesmo atacante livre pra ir de vitrine em vitrine.
const freio = criarFreio({ limite: 8, janelaMs: 60_000 });

// As mensagens são as que o CLIENTE lê, então são em português e falam da
// tela, não do esquema. Um "Invalid uuid" na vitrine é o sistema falando
// consigo mesmo na frente de quem está comprando.
const Corpo = z.object({
  itens: z.array(z.object({
    produtoId: z.string().uuid(),
    quantidade: z.number().int().min(1).max(999),
  })).min(1).max(40),
  nome: z.string().trim().min(2, "Diga seu nome.").max(120, "Nome muito longo."),
  telefone: z.string().trim().min(8, "Informe um telefone com DDD.").max(40, "Telefone muito longo."),
  email: z.string().trim().max(160, "E-mail muito longo.").default(""),
  observacao: z.string().trim().max(2000, "Observação muito longa.").default(""),
});

/**
 * Erro de validação → frase que o cliente entende.
 *
 * Problema em `itens` NUNCA é culpa de quem está comprando: o carrinho é
 * montado pelo nosso próprio código. Se chegou torto, ou é carrinho velho no
 * `localStorage` (de antes de uma mudança) ou é gente mexendo no corpo — e nos
 * dois casos a resposta útil é a mesma, não o detalhe do esquema.
 */
function mensagem(erro: z.ZodError): string {
  const primeiro = erro.issues[0];
  if (!primeiro) return "Dados incompletos.";
  if (primeiro.path[0] === "itens") {
    return "Seu carrinho está com um item inválido. Recarregue a página e monte o pedido de novo.";
  }
  return primeiro.message;
}

/**
 * De onde veio quem está comprando.
 *
 * Lê a atribuição de PRIMEIRO TOQUE (cookie `la`, 30 dias) e não a origem desta
 * visita. É deliberado: quem descobre a loja por um anúncio costuma voltar
 * direto pra fechar a compra, e creditar o último clique faria todo anúncio
 * parecer que não vendeu nada — enquanto "direto" ficaria com o mérito.
 *
 * Nada aqui vem do corpo da requisição. Cookie o navegador manda sozinho; campo
 * de corpo é coisa que se digita, e "origem" digitada pelo cliente seria um
 * relatório que qualquer um escreve.
 */
function atribuicaoDaRequisicao(req: NextRequest) {
  const primeiroToque = lerAtribuicao(req.cookies.get(COOKIE_ATRIBUICAO)?.value);
  return {
    visitante: req.cookies.get(COOKIE_VISITANTE)?.value ?? null,
    // O cookie da sessão é `uuid|canal|fonte|campanha`; aqui só o uuid interessa.
    sessao: (req.cookies.get(COOKIE_SESSAO)?.value ?? "").split("|")[0] || null,
    uf: ufDaRequisicao(req.headers),
    canal: primeiroToque?.canal ?? null,
    fonte: primeiroToque?.fonte ?? null,
    campanha: primeiroToque?.campanha ?? null,
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!freio.consumir(origemDe(req.headers)).permitido) {
    return NextResponse.json({ error: "Muitos pedidos seguidos. Espere um minuto." }, { status: 429 });
  }

  const { slug } = await params;
  const corpo = Corpo.safeParse(await req.json().catch(() => ({})));
  if (!corpo.success) {
    return NextResponse.json({ error: mensagem(corpo.error) }, { status: 400 });
  }

  try {
    const loja = await getLojaPublicaPorSlug(slug);
    // Loja em rascunho e loja inexistente dão a MESMA resposta: um endpoint
    // público não confirma pra ninguém que existe uma loja escondida ali.
    if (!loja) return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    if (!ACEITA_CARRINHO(loja.checkout)) {
      return NextResponse.json({ error: "Esta loja não recebe pedidos por aqui." }, { status: 409 });
    }

    const { numero, total } = await criarPedidoDaVitrine(
      loja,
      corpo.data.itens,
      {
        nome: corpo.data.nome,
        telefone: corpo.data.telefone,
        email: corpo.data.email,
        observacao: corpo.data.observacao,
      },
      atribuicaoDaRequisicao(req),
    );
    return NextResponse.json({ ok: true, numero, total });
  } catch (e) {
    // Recusa de REGRA (esgotado, produto saiu do ar) é 409 com o motivo: é
    // informação que o cliente precisa pra consertar o carrinho.
    if (e instanceof PedidoRecusado) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    if (e instanceof LojasTabelaAusente) {
      return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    }
    // Qualquer outra coisa é problema NOSSO, e a mensagem interna não vai pra
    // uma página pública.
    console.error("[pedido-vitrine]", e);
    return NextResponse.json({ error: "Não deu para registrar o pedido. Tente de novo." }, { status: 500 });
  }
}
