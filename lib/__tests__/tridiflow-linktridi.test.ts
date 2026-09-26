import { describe, it, expect } from "vitest";
import {
  LINKTRIDI_PADRAO, normalizarLinkTridi, corCartaoClara, novoPostLT, TEMAS_LINKTRIDI, temaAtivoLT, hexValido,
  digitarEnderecoLT, normalizarEnderecoLT, problemaNoEnderecoLT, redeParaUrl, metaDoLinkTridi,
} from "../tridiflow-linktridi";
import { conversoesEfetivas, SETTINGS_PADRAO } from "../tridiflow";

// ── LinkTridi: o doc que vem do banco nunca quebra a leitura ─────────────────
// O contrato é o mesmo do normalizarPagina: campo faltando ganha o padrão,
// post sem id ganha id, e um doc de versão futura ainda renderiza o que der.

describe("normalizarLinkTridi", () => {
  it("doc vazio vira o padrão completo", () => {
    const d = normalizarLinkTridi(undefined);
    expect(d.versao).toBe(1);
    expect(d.perfil.nome).toBeTruthy();
    expect(d.cores.fundo).toMatch(/^#/);
    expect(d.posts).toEqual([]);
  });

  it("doc parcial preserva o que veio e completa o resto", () => {
    const d = normalizarLinkTridi({ perfil: { nome: "Tridi Gaia" }, posts: [{ titulo: "Kit", preco: 99.9 }] });
    expect(d.perfil.nome).toBe("Tridi Gaia");
    expect(d.perfil.mostrarSocial).toBe(true);          // veio do padrão
    expect(d.posts[0].titulo).toBe("Kit");
    expect(d.posts[0].id).toBeTruthy();                  // id nasce na leitura
    expect(d.posts[0].publicado).toBe(true);             // padrão do post
    expect(d.cores.cta).toBe(LINKTRIDI_PADRAO().cores.cta);
  });

  it("cartão novo nasce publicado, com CTA padrão", () => {
    const p = novoPostLT();
    expect(p.publicado).toBe(true);
    expect(p.cta).toBe("Comprar agora");
  });
});

describe("corCartaoClara", () => {
  it("decide o contraste pela luminância e tolera lixo", () => {
    expect(corCartaoClara("#FFFFFF")).toBe(true);
    expect(corCartaoClara("#18181B")).toBe(false);
    expect(corCartaoClara("")).toBe(false);
    expect(corCartaoClara("#zzz")).toBe(false);
  });
});

// ── Pixel: o LinkTridi não tem "conclusão" — o clique no cartão é a oferta ───
describe("conversoesEfetivas (modo linktridi)", () => {
  it("padrão é ViewContent na abertura + oferta no clique do cartão", () => {
    const regras = conversoesEfetivas({ ...SETTINGS_PADRAO, modo: "linktridi" });
    const gatilhos = regras.map((r) => r.gatilho);
    expect(gatilhos).toContain("abertura");
    expect(gatilhos).toContain("oferta");
    expect(gatilhos).not.toContain("conclusao");
    expect(regras.find((r) => r.gatilho === "abertura")?.evento).toBe("ViewContent");
  });

  it("regras configuradas à mão continuam mandando", () => {
    const regras = conversoesEfetivas({
      ...SETTINGS_PADRAO, modo: "linktridi",
      conversoes: [{ id: "x", nome: "Só abertura", gatilho: "abertura", evento: "PageView", plataformas: ["meta"], ativo: true, amostragem: 100 }],
    });
    expect(regras).toHaveLength(1);
    expect(regras[0].evento).toBe("PageView");
  });
});

// ── Temas: o caminho comum é tocar num tema, não montar seis cores ───────────
describe("temas do LinkTridi", () => {
  it("o padrão de um LinkTridi novo É o tema Claro", () => {
    expect(temaAtivoLT(LINKTRIDI_PADRAO().cores)).toBe("claro");
  });
  it("reconhece o tema sem ligar pra caixa do hex, e cor ajustada à mão não é tema", () => {
    const lavanda = TEMAS_LINKTRIDI.find((t) => t.id === "lavanda")!;
    const cores = { ...Object.fromEntries(Object.entries(lavanda.cores).map(([k, v]) => [k, v.toLowerCase()])), formas: false } as never;
    expect(temaAtivoLT(cores)).toBe("lavanda");
    expect(temaAtivoLT({ ...LINKTRIDI_PADRAO().cores, preco: "#000000" })).toBeNull();
  });
  it("ids de tema não se repetem", () => {
    expect(new Set(TEMAS_LINKTRIDI.map((t) => t.id)).size).toBe(TEMAS_LINKTRIDI.length);
  });
  it("hexValido aceita o que a pessoa cola e recusa o resto", () => {
    expect(hexValido("#ABC")).toBe("#aabbcc");
    expect(hexValido("7c3aed")).toBe("#7c3aed");
    expect(hexValido(" #7C3AED ")).toBe("#7c3aed");
    expect(hexValido("roxo")).toBeNull();
    expect(hexValido("#12345")).toBeNull();
  });
});

// ── Endereço: é o link da bio — digitar não pode derrubar nem travar ─────────
describe("endereço do LinkTridi", () => {
  it("enquanto digita, o hífen do fim fica (senão ninguém digita 'meu-link')", () => {
    expect(digitarEnderecoLT("Meu-")).toBe("meu-");
    expect(digitarEnderecoLT("Carimbos Tridí")).toBe("carimbos-tridi");
    expect(digitarEnderecoLT("a  b")).toBe("a-b");
  });
  it("a forma final apara, tira acento e junta hífens", () => {
    expect(normalizarEnderecoLT("  Carimbos Tridí! ")).toBe("carimbos-tridi");
    expect(normalizarEnderecoLT("--kit--novo--")).toBe("kit-novo");
    expect(normalizarEnderecoLT("x".repeat(80))).toHaveLength(60);
  });
  it("explica o que falta em vez de só recusar", () => {
    expect(problemaNoEnderecoLT("")).toMatch(/Escolha/);
    expect(problemaNoEnderecoLT("ab")).toMatch(/3/);
    expect(problemaNoEnderecoLT("carimbos-tridi")).toBeNull();
  });
});

// ── Redes: a pessoa sabe o @, não o link ─────────────────────────────────────
describe("redeParaUrl", () => {
  it("@ vira o link do perfil em cada rede", () => {
    expect(redeParaUrl("instagram", "@carimbostridi")).toBe("https://instagram.com/carimbostridi");
    expect(redeParaUrl("tiktok", "carimbostridi")).toBe("https://tiktok.com/@carimbostridi");
    expect(redeParaUrl("youtube", "@tridi")).toBe("https://youtube.com/@tridi");
  });
  it("link sem https ganha o https; link completo fica como está", () => {
    expect(redeParaUrl("instagram", "www.instagram.com/tridi")).toBe("https://instagram.com/tridi");
    expect(redeParaUrl("instagram", "https://instagram.com/tridi")).toBe("https://instagram.com/tridi");
    expect(redeParaUrl("whatsapp", "wa.me/5511999999999")).toBe("https://wa.me/5511999999999");
  });
  it("número de WhatsApp vira wa.me, com o 55 só quando falta", () => {
    expect(redeParaUrl("whatsapp", "(11) 99999-9999")).toBe("https://wa.me/5511999999999");
    expect(redeParaUrl("whatsapp", "+55 11 99999-9999")).toBe("https://wa.me/5511999999999");
    // DDD 55 (Santa Maria) sem o país: ainda são 11 dígitos, então ganha o 55.
    expect(redeParaUrl("whatsapp", "55 99999-9999")).toBe("https://wa.me/5555999999999");
  });
  it("o que não reconhece fica como veio (o campo não apaga o que a pessoa digitou)", () => {
    expect(redeParaUrl("whatsapp", "123")).toBe("123");
    expect(redeParaUrl("instagram", "meu perfil")).toBe("meu perfil");
    expect(redeParaUrl("tiktok", "  ")).toBe("");
  });
});

// ── Prévia do link: sem nada preenchido, vale o que o perfil já diz ──────────
describe("metaDoLinkTridi", () => {
  const doc = normalizarLinkTridi({ perfil: { nome: "Tridi Gaia", bio: "Carimbos\nfeitos à mão", avatarUrl: "https://cdn/logo.webp" } });
  it("sem metadata própria usa nome, bio (numa linha) e logo — nunca 'Atendimento'", () => {
    expect(metaDoLinkTridi(undefined, doc, "Projeto")).toEqual({
      titulo: "Tridi Gaia", descricao: "Carimbos feitos à mão", imagem: "https://cdn/logo.webp", favicon: "https://cdn/logo.webp",
    });
  });
  it("o que a pessoa preencheu manda, e espaço em branco não conta como preenchido", () => {
    const m = metaDoLinkTridi({ titulo: "Loja oficial", descricao: "  ", imagem: "https://cdn/og.webp" }, doc);
    expect(m.titulo).toBe("Loja oficial");
    expect(m.descricao).toBe("Carimbos feitos à mão");
    expect(m.imagem).toBe("https://cdn/og.webp");
    expect(m.favicon).toBe("https://cdn/logo.webp");
  });
  it("perfil sem nome cai no nome do projeto", () => {
    const vazio = normalizarLinkTridi({ perfil: { nome: " " } });
    expect(metaDoLinkTridi(undefined, vazio, "Bio da marca").titulo).toBe("Bio da marca");
  });
});
