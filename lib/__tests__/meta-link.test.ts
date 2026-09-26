import { describe, it, expect } from "vitest";
import { extrairLink, aplicarTags, partirLink } from "@/lib/meta-link";

// ── Trava do "qual link de venda este anúncio usa" ──────────────────────────
//
// Cada tipo de criativo guarda o destino num lugar diferente do JSON da Meta, e
// a lista só cresce. Sem estes casos, um tipo novo (ou um refactor) faria a
// gaveta do anúncio dizer "sem destino" em silêncio — que é indistinguível de
// "o anúncio não tem link", e foi justamente o que motivou a peça.
//
// Os formatos abaixo saíram de respostas REAIS do Graph v21.0 desta conta.

describe("onde o destino mora em cada criativo", () => {
  it("anúncio de vídeo: dentro do call_to_action", () => {
    expect(extrairLink({
      object_type: "VIDEO",
      object_story_spec: {
        page_id: "101863405161596",
        video_data: { video_id: "1071991869123344", call_to_action: { type: "LEARN_MORE", value: { link: "https://gedux.com.br/f/carimboskit12moderno" } } },
      },
    })).toEqual({ url: "https://gedux.com.br/f/carimboskit12moderno", origem: "video_data" });
  });

  it("anúncio de link: link_data.link", () => {
    expect(extrairLink({ object_story_spec: { link_data: { link: "https://loja.com/oferta", message: "oi" } } }))
      .toEqual({ url: "https://loja.com/oferta", origem: "link_data" });
  });

  it("criativo dinâmico: primeiro website_url do asset_feed_spec", () => {
    expect(extrairLink({ asset_feed_spec: { link_urls: [{ website_url: "https://loja.com/a" }, { website_url: "https://loja.com/b" }] } }))
      .toEqual({ url: "https://loja.com/a", origem: "criativo dinâmico" });
  });

  it("catálogo: template_url", () => {
    expect(extrairLink({ template_url: "https://loja.com/p/{{product.retailer_id}}" })?.url)
      .toBe("https://loja.com/p/{{product.retailer_id}}");
  });

  it("post do Instagram impulsionado: não há link, e isso não pode virar erro", () => {
    // Resposta real: só o permalink e o id do post. Devolver null aqui é o que
    // faz a tela cair pro destino OBSERVADO em vez de mentir um endereço.
    expect(extrairLink({
      id: "1361862665670266",
      object_type: "VIDEO",
      instagram_permalink_url: "https://www.instagram.com/p/DdAQe5Es-EH/",
      effective_object_story_id: "870883732769548_122142378729078361",
    })).toBeNull();
  });

  it("criativo ausente ou vazio não quebra", () => {
    expect(extrairLink(null)).toBeNull();
    expect(extrairLink({})).toBeNull();
    expect(extrairLink({ object_story_spec: { link_data: { link: "javascript:alert(1)" } } })).toBeNull();
  });
});

describe("url_tags da conta", () => {
  it("entram no link — sem elas o link mostrado não é o que o cliente abre", () => {
    expect(aplicarTags("https://loja.com/p", "utm_source=fb&utm_campaign={{campaign.name}}"))
      .toBe("https://loja.com/p?utm_source=fb&utm_campaign=%7B%7Bcampaign.name%7D%7D");
  });

  it("não sobrescrevem o que já está no link", () => {
    expect(aplicarTags("https://loja.com/p?utm_source=ig", "utm_source=fb")).toBe("https://loja.com/p?utm_source=ig");
  });

  it("sem tags devolve o link intacto", () => {
    expect(aplicarTags("https://loja.com/p", "")).toBe("https://loja.com/p");
  });
});

describe("separar endereço das UTMs", () => {
  it("o endereço limpo é o que se compara com o link do funil", () => {
    const p = partirLink("https://gedux.com.br/f/chancela/?utm_source=ig&utm_content=120248269003290574&fbclid=abc");
    expect(p?.base).toBe("https://gedux.com.br/f/chancela");
    expect(p?.host).toBe("gedux.com.br");
    expect(p?.utm).toEqual({ utm_source: "ig", utm_content: "120248269003290574", fbclid: "abc" });
  });

  it("parâmetro que não é UTM continua no endereço", () => {
    expect(partirLink("https://loja.com/p?variacao=azul&utm_source=ig")?.base).toBe("https://loja.com/p?variacao=azul");
  });

  it("endereço inválido devolve null em vez de estourar", () => {
    expect(partirLink("nem-url")).toBeNull();
  });
});
