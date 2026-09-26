import { describe, it, expect } from "vitest";
import { aplicarCorAssinatura, corDeAssinatura } from "@/lib/vitrine/assinatura";
import { normalizarTema } from "@/lib/vitrine/tema";
import { luminosidade, textoSobre } from "@/lib/vitrine/cor";
import { TEMA_PADRAO } from "@/lib/vitrine/modelos";

// ── Trava da cor da loja ─────────────────────────────────────────────────────
// Uma cor só repinta trinta campos. Isso é ótimo até o dia em que repinta um
// campo que NÃO era da marca — o verde de "em estoque" virando rosa, ou o texto
// branco do cabeçalho virando roxo sobre roxo.
//
// Os testes abaixo cercam exatamente esses dois lados: o que TEM que mudar e o
// que não pode ser tocado.

const roxo = "#7a00ff";
const verde = "#17a34a";

describe("cor de assinatura", () => {
  it("cai no destaque quando ninguém escolheu ainda", () => {
    // Tema antigo (e o modelo importado do Shopify) não tem `signature_color`.
    // Sem este fallback a primeira troca partiria de um azul que a loja nunca
    // usou, e o giro de matiz sairia todo errado.
    const t = normalizarTema({ ajustes: { accent_color: roxo } });
    expect(corDeAssinatura(t)).toBe(roxo);
  });

  it("repinta os papéis da marca", () => {
    const t = aplicarCorAssinatura(normalizarTema({ ajustes: { accent_color: roxo } }), verde);
    expect(t.ajustes.signature_color).toBe(verde);
    expect(t.ajustes.accent_color).toBe(verde);
    expect(t.ajustes.primary_button_background).toBe(verde);
    // Cabeçalho e link não podem ser o MESMO tom do destaque, senão o texto
    // some — cada papel tem o seu desvio de luminosidade.
    expect(t.ajustes.header_background).not.toBe(verde);
    expect(luminosidade(String(t.ajustes.header_background)))
      .toBeLessThan(luminosidade(verde));
  });

  it("não pinta o que é preto, branco ou cinza", () => {
    // Título PRETO é decisão de tipografia, não cor de marca — foi assim que o
    // `#000000` da Carimbos virou um verde-quase-preto que ninguém pediu.
    const t = aplicarCorAssinatura(
      normalizarTema({ ajustes: { accent_color: roxo, heading_color: "#000000" } }),
      verde,
    );
    expect(t.ajustes.heading_color).toBe("#000000");
    // Já um título que ERA roxo segue a marca.
    const roxoTitulo = aplicarCorAssinatura(
      normalizarTema({ ajustes: { accent_color: roxo, heading_color: roxo } }),
      verde,
    );
    expect(roxoTitulo.ajustes.heading_color).not.toBe(roxo);
  });

  it("não encosta em cor de estado", () => {
    const t = aplicarCorAssinatura(TEMA_PADRAO(), verde);
    const antes = TEMA_PADRAO();
    for (const chave of [
      "error_color", "success_color", "product_in_stock_color",
      "product_low_stock_color", "product_sold_out_color", "product_on_sale_accent",
    ]) {
      // Verde significa "em estoque" e não pode virar rosa porque alguém
      // trocou a marca. É a mesma regra da paleta de gráfico do ERP.
      expect(t.ajustes[chave], chave).toBe(antes.ajustes[chave]);
    }
  });

  it("gira a família da assinatura e deixa o resto quieto", () => {
    const t = normalizarTema({
      ajustes: { accent_color: roxo },
      secoes: {
        a: {
          tipo: "announcement-bar",
          ajustes: {
            background1: "#ba7ffa", // roxo claro — família da assinatura
            background2: "#ffffff", // branco — não tem matiz pra girar
            text_color: "#ffffff",
          },
        },
        c: {
          tipo: "collection-with-image",
          ajustes: { background: "#0f9d58" }, // verde — outra família
        },
      },
      fixas: { topo: ["a"], rodape: [] },
      ordem: { inicio: ["c"] },
    });

    const novo = aplicarCorAssinatura(t, verde);
    expect(novo.secoes.a.ajustes.background1).not.toBe("#ba7ffa");
    // Branco continua branco: girar matiz de cinza pinta de roxo todo texto
    // que era branco.
    expect(novo.secoes.a.ajustes.background2).toBe("#ffffff");
    expect(novo.secoes.a.ajustes.text_color).toBe("#ffffff");
    // Verde da outra seção não é da família do roxo: fica como estava.
    expect(novo.secoes.c.ajustes.background).toBe("#0f9d58");
  });

  it("acerta o texto do cabeçalho conforme o fundo do cabeçalho", () => {
    // Contra o FUNDO DO CABEÇALHO, não contra a assinatura: o cabeçalho é
    // derivado mais escuro, então uma assinatura no limite do claro ainda
    // produz um cabeçalho que pede texto branco.
    for (const cor of ["#fff2b3", "#1b1464", "#17a34a", "#7a00ff"]) {
      const t = aplicarCorAssinatura(TEMA_PADRAO(), cor);
      expect(t.ajustes.header_text_color, cor).toBe(textoSobre(String(t.ajustes.header_background)));
      expect(t.ajustes.footer_text_color, cor).toBe(textoSobre(String(t.ajustes.footer_background)));
    }
  });

  it("não muta o tema recebido", () => {
    const t = TEMA_PADRAO();
    const antes = JSON.stringify(t);
    aplicarCorAssinatura(t, verde);
    expect(JSON.stringify(t)).toBe(antes);
  });

  it("trocar duas vezes volta ao ponto de partida", () => {
    // Se o giro não fosse relativo à assinatura ANTERIOR, cada troca acumularia
    // e a loja iria derivando de cor a cada visita ao editor.
    const base = TEMA_PADRAO();
    const ida = aplicarCorAssinatura(base, verde);
    const volta = aplicarCorAssinatura(ida, corDeAssinatura(base));
    expect(volta.ajustes.accent_color).toBe(base.ajustes.accent_color);
  });
});
