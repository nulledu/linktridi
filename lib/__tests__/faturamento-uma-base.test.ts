import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tipoDaFonte, chaveLojaYampi, chavePlataforma, PLAT_VEGA, type FonteTipo } from "../marketing-config";
import { faturamentoDaEmpresa } from "../vendas";

/**
 * O faturamento tem UMA base.
 *
 * Em 01–07/ago/26 o Analytics mostrava R$ 85.305 de faturamento onde o Tridify
 * media R$ 57.112 no mesmo período — 49% a mais. Nenhum dos dois estava
 * "quebrado": o Analytics tinha a PRÓPRIA classificação de canal, e ela errava
 * quatro coisas que a do Tridify já acertava.
 *
 * Documentação não segura isso: a classificação volta como um `if
 * (plataforma_id === 8)` dentro de uma função sobre outro assunto, e a
 * diferença só aparece quando alguém compara duas telas. Então a trava é aqui.
 */

const raiz = path.resolve(__dirname, "../..");
const ler = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");
// Sem comentários: o cabeçalho de `lib/vendas.ts` CITA os campos proibidos pra
// contar por que saíram. Um teste que casa dentro de comentário proíbe explicar
// o bug — e a explicação é metade do valor da trava.
const semComentario = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

describe("tipoDaFonte é o único classificador de canal", () => {
  it("respeita TODOS os tipos que a config pode gravar", () => {
    // A causa nº 2 do erro: quem consumia isso lia só "trafego"/"organico" e
    // jogava o resto num balde de sobra. Origem marcada como comercial ia pra
    // "Outros"; marcada como marketplace desaparecia de todos os totais.
    const tipos: FonteTipo[] = ["trafego", "comercial", "organico", "ignorar"];
    for (const t of tipos) {
      expect(tipoDaFonte("plat:99", { "plat:99": t }, "Carimbos Tridi")).toBe(t);
    }
  });

  it("marketplace não se grava: é a plataforma do pedido (12/09/2026)", () => {
    // Uma origem qualquer salva como marketplace cai no padrão; a plataforma
    // de marketplace é marketplace mesmo com outra coisa salva.
    expect(tipoDaFonte("plat:99", { "plat:99": "marketplace" }, "Carimbos Tridi")).toBe("ignorar");
    expect(tipoDaFonte("plat:10", { "plat:10": "comercial" }, "Carimbos Tridi")).toBe("marketplace");
  });

  it("a Vega nasce como TRÁFEGO — não como canal solto", () => {
    // Causa nº 1: a Vega é tráfego por padrão. Quem também a colocava num balde
    // de "todas as plataformas menos estas três" contava R$ 16.322,74 duas vezes.
    expect(tipoDaFonte(chavePlataforma(PLAT_VEGA), {}, "Carimbos Tridi")).toBe("trafego");
  });

  it("a loja de tráfego vem da config, não do nome escrito no código", () => {
    expect(tipoDaFonte(chaveLojaYampi("Loja Nova"), {}, "Loja Nova")).toBe("trafego");
    expect(tipoDaFonte(chaveLojaYampi("Carimbos Tridi"), {}, "Loja Nova")).toBe("ignorar");
  });

  it("origem nunca vista cai em 'ignorar' — fora de todo total, não num balde de sobra", () => {
    // "ignorar" é o que faz a origem APARECER na tela como pendente. Se ela
    // caísse em tráfego ou em "outros", entraria num total sem ninguém decidir.
    expect(tipoDaFonte("plat:77", {}, "Carimbos Tridi")).toBe("ignorar");
  });
});

describe("faturamento da empresa = o MESMO total do Tridify (que já traz o marketplace)", () => {
  // Pedido do dono (01/09/2026): "no faturamento total da empresa, tanto no
  // Tridify quanto na TV quanto no geral, considere as vendas do marketplace".
  // O snapshot soma o marketplace UMA vez; o Analytics não soma de novo.
  const tri = { faturamentoEmpresa: 57703.81, pedidosEmpresa: 238, marketplaceValor: 591.65, marketplaceN: 5 };

  it("é exatamente o total do Tridify — sem somar o marketplace por cima", () => {
    expect(faturamentoDaEmpresa(tri).revenue).toBe(57704);
    expect(faturamentoDaEmpresa(tri).count).toBe(238);
  });

  it("o snapshot é quem soma: total = operação própria + marketplace", () => {
    const src = semComentario(ler("lib/trafego-vendas.ts"));
    expect(src).toContain("const faturamentoEmpresa = operacaoPropriaValor + marketplaceValor;");
    expect(src).toContain("pedidosEmpresa: operacaoPropriaN + marketplaceN");
    // E a eficiência (MER, lucro) continua julgando o anúncio contra a operação própria.
    expect(src).toContain("faturamentoEmpresa: operacaoPropriaValor, faturamentoPago");
  });

  it("o ticket sai do MESMO recorte do total (numerador e divisor juntos)", () => {
    // Dividir um total por uma contagem de outro recorte dá um ticket que não
    // existe — foi o que aconteceu quando o upsell entrou na contagem.
    const t = faturamentoDaEmpresa(tri);
    expect(t.ticket).toBe(Math.round(t.revenue / t.count));
  });
});

describe("lib/vendas.ts não reimplementa a classificação", () => {
  const src = ler("lib/vendas.ts");

  it("lê os canais do Tridify", () => {
    expect(src).toMatch(/from "@\/lib\/trafego-vendas"/);
    expect(src).toMatch(/snapshotVendas\(/);
  });

  it("não olha pedido nem plataforma por conta própria", () => {
    // Se voltar a ler `pedidos` do ERP aqui, volta a existir uma segunda
    // definição de faturamento — e ela vai divergir, como divergiu.
    const codigo = semComentario(src);
    for (const proibido of ["plataforma_id", "preco_total", "preco_yampi", "qual_yampi", "tipoDaFonte", "PLAT_MARKETPLACE", "PLAT_WHATSAPP"]) {
      expect(codigo, `lib/vendas.ts voltou a classificar sozinho: "${proibido}"`).not.toContain(proibido);
    }
  });
});

describe("o upsell soma valor, não pedido", () => {
  const src = ler("lib/trafego-vendas.ts");

  it("comercialFinalPedidos não conta os pedidos de upsell", () => {
    // O upsell é uma fatia de um pedido de checkout já contado em
    // tráfego/orgânico. Somá-lo à CONTAGEM dava 310 pedidos onde o ERP tinha
    // 233 na base da empresa, e o ticket médio saía um terço menor.
    const linha = src.split("\n").find((l) => l.includes("const comercialFinalPedidos")) ?? "";
    expect(linha).toBeTruthy();
    expect(linha, "upsell voltou a virar pedido na contagem da empresa").not.toContain("comercialUpsellN");
  });

  it("mas soma o valor dele ao comercial", () => {
    const linha = src.split("\n").find((l) => l.includes("const comercialFinalValor")) ?? "";
    expect(linha).toContain("comercialUpsellValor");
  });
});

describe("a base do tráfego não é uma plataforma", () => {
  /**
   * Em 24/07/2026 o checkout da loja de tráfego migrou da Yampi pra Vega
   * Checkout (plataforma 8). Nada quebrou, nenhum erro apareceu: a Tridify
   * simplesmente passou a mostrar R$ 15 mil de venda de tráfego num mês em que
   * o tráfego trouxe R$ 63 mil — porque o faturamento do tráfego era lido de
   * `yampiPagasValor`, que só enxerga a plataforma 6.
   *
   * A base do tráfego é `trafegoValor`/`trafegoN`: TODA origem marcada como
   * tráfego na tela de Fontes. Trocar de checkout, abrir uma loja nova ou
   * reclassificar uma origem não pode zerar o faturamento outra vez.
   */
  const TELAS = [
    "app/(plataforma)/trafego/LucroView.tsx",
    "app/(plataforma)/trafego/TrafegoOverview.tsx",
    "app/(plataforma)/trafego/FunilPro.tsx",
    "app/(plataforma)/trafego/PainelPersonalizavel.tsx",
  ];

  for (const rel of TELAS) {
    it(`${rel}: não mede o tráfego por yampiPagas*`, () => {
      const codigo = semComentario(ler(rel));
      expect(codigo, `${rel} voltou a medir o tráfego só pela plataforma Yampi`)
        .not.toMatch(/yampiPagasValor/);
    });
  }

  it("o snapshot mede o não-aprovado na mesma base do tráfego", () => {
    // Sem isto, o "aguardando" continua contando só a Yampi e some junto com
    // ela — o card diria "nada preso" com meia loja esperando aprovação.
    const src = ler("lib/trafego-vendas.ts");
    expect(src).toMatch(/trafegoNaoPagasN\+\+; trafegoNaoPagasValor \+= valSetor/);
  });
});

describe("percentual que vai pro CSS usa ponto", () => {
  // `width: "36,5%"` é declaração inválida: o navegador descarta e a div volta
  // pra largura automática, ou seja 100%. Na tela de Faturamento TODAS as
  // barras apareciam cheias, inclusive a fatia de 0,3% — e nada no código
  // parecia errado, porque o mesmo texto está certo quando é pra LER.
  const arquivos = ["app/(plataforma)/analytics/AnalyticsClient.tsx", "app/(plataforma)/vendas/VendasClient.tsx"];

  for (const rel of arquivos) {
    it(`${rel}: nenhum width recebe número com vírgula`, () => {
      const src = ler(rel);
      const linhas = src.split("\n");
      for (const [i, l] of linhas.entries()) {
        if (/width: /.test(l) && /replace\("\.", ","\)/.test(l)) {
          throw new Error(`${rel}:${i + 1} — width com vírgula decimal (CSS inválido, a barra vira 100%)`);
        }
      }
      // Também pela via indireta: `const pct = … replace(".", ",")` usado em width.
      const comVirgula = [...src.matchAll(/const (\w+) = \([^)]*\) =>[^;]*?replace\("\.", ","\)/g)].map((m) => m[1]);
      for (const nome of comVirgula) {
        expect(src, `${rel}: ${nome}() formata para leitura (vírgula) e está indo pro width`)
          .not.toMatch(new RegExp(`width: ${nome}\\(`));
      }
    });
  }
});

describe("a comissão do gestor tem UMA base (F_Total = operação própria)", () => {
  /**
   * Em 01/09/2026 o marketplace entrou no `faturamentoEmpresa` (pedido do
   * dono), e a MESMA decisão disse que a eficiência do anúncio — incluindo o
   * F_Total da comissão do gestor — continuava em `operacaoPropriaValor`:
   * venda de Shopee/ML/TikTok não é venda que o anúncio trouxe. O Financeiro
   * foi atualizado; o card do Tridify ficou pra trás com `faturamentoEmpresa`,
   * que agora significava outra coisa — e o bônus mostrado na tela do Tráfego
   * saiu inflado em relação ao que a folha ia pagar. Dois números para o mesmo
   * acordo é exatamente a divergência que o comentário do servidor promete não
   * ter.
   */
  const LADOS = [
    "lib/comissao-gestor-servidor.ts",
    "app/(plataforma)/trafego/PainelPersonalizavel.tsx",
  ];

  for (const rel of LADOS) {
    it(`${rel}: F_Total é a operação própria, nunca o total com marketplace`, () => {
      const src = semComentario(ler(rel));
      expect(src, `${rel}: fTotal deve vir de operacaoPropriaValor`).toContain("fTotal: v.operacaoPropriaValor");
      expect(src, `${rel}: fTotal voltou a incluir o marketplace`).not.toContain("fTotal: v.faturamentoEmpresa");
    });
  }
});
