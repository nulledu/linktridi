import { cached } from "@/lib/cache";
import { getLojaPublicaPorSlug, listProdutosPublicos } from "@/lib/lojas-db";
import { colecoesDaLoja } from "@/lib/vitrine/colecoes";
import { lerTemaPublicado } from "@/lib/vitrine/db";
import { getMenu } from "@/lib/lojas-conteudo-db";
import { TEMA_PADRAO } from "@/lib/vitrine/modelos";
import type { Contexto } from "../tema/contexto";
import type { Template } from "@/lib/vitrine/tipos";

/**
 * Tudo que a loja precisa pra desenhar qualquer template, numa ida só.
 *
 * Cache no SERVIDOR, e não no navegador, pelo motivo de sempre: a página é
 * pública e um anúncio joga mil pessoas nela em um minuto. Sem isto seriam mil
 * idas ao Supabase pra devolver o mesmo catálogo, e a conta do egress é cobrada
 * no trecho Supabase → app — `ETag` e `304` não abatem nada dela.
 *
 * Um minuto é curto o bastante pra que corrigir um preço errado não vire uma
 * espera constrangedora, e longo o bastante pra segurar o pico.
 *
 * O tema entra no MESMO cache: ele muda quando o lojista publica, na mesma
 * ordem de grandeza do preço, e uma consulta separada por página dobraria as
 * idas pra buscar um jsonb que quase nunca muda.
 */
export const dadosDaLoja = (slug: string) =>
  cached(`vitrine:${slug}`, 60_000, async () => {
    const loja = await getLojaPublicaPorSlug(slug);
    if (!loja) return null;
    const [produtos, tema, principal, rodape] = await Promise.all([
      listProdutosPublicos(loja.id),
      // Tema é opcional: sem o SQL rodado, ou com a loja ainda sem tema
      // salvo, a vitrine cai no modelo. Nunca fica em branco.
      lerTemaPublicado(loja.id).catch(() => null),
      // Menus também: sem eles a vitrine mostra as categorias, que é o
      // comportamento de sempre. Entram no MESMO cache de 60s — uma consulta
      // separada por página seria pagar duas idas pra desenhar um cabeçalho.
      getMenu(loja.id, "principal").catch(() => null),
      getMenu(loja.id, "rodape").catch(() => null),
    ]);
    return {
      loja,
      produtos,
      tema: tema ?? TEMA_PADRAO(),
      menuPrincipal: principal?.itens ?? [],
      menuRodape: rodape?.itens ?? [],
    };
  });

export type DadosDaLoja = NonNullable<Awaited<ReturnType<typeof dadosDaLoja>>>;

/** Monta o contexto que as seções recebem. */
export function contextoDa(
  dados: DadosDaLoja,
  template: Template,
  extra: Partial<Contexto> = {},
): Contexto {
  return {
    loja: dados.loja,
    tema: dados.tema,
    template,
    produtos: dados.produtos,
    colecoes: colecoesDaLoja(dados.produtos),
    base: `/l/${dados.loja.slug}`,
    menuPrincipal: dados.menuPrincipal,
    menuRodape: dados.menuRodape,
    ...extra,
  };
}
