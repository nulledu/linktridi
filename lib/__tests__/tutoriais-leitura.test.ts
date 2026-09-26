import { describe, expect, it, vi } from "vitest";
import type { Metadata } from "next";
import { linkWhatsapp, normalizarTutorial, type AtalhoCentral } from "@/lib/tridiflow-tutoriais";
import {
  CAMPOS_METRICA_LEITURA, MINIMO_SUMARIO, MOTIVOS_NAO, alternarFeito, barraDoTutorial, chaveFeitos, conteudoDosPassos,
  direcaoDoGesto, idsDeProdutos, lerFeitos, mensagemWhatsapp, metadadosDoTutorial, passoInicialDoModo, precisaDoTutorial,
  referenciasDosPassos, resumoCurto, tempoDoTutorial, textoAndamento, urlAbsoluta,
} from "@/lib/tridiflow-tutoriais-leitura";
import { CAMPOS_METRICA, ehCampoMetrica } from "@/lib/tridiflow-tutoriais-metricas";

// O porteiro da rota de métrica mora num módulo de servidor que abre o cliente
// do Supabase. Aqui só se lê a lista: sem o mock, o teste carregaria o
// supabase-js e o `next/headers` à toa — e nada neste arquivo pode chegar ao banco.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => { throw new Error("o teste de leitura não fala com o banco"); },
}));

// O `Metadata` do Next é uma união grande; aqui só interessa o que o robô do
// WhatsApp/Instagram lê.
type Og = { title?: string; description?: string; url?: string; type?: string; images?: unknown };
type Tw = { card?: string; title?: string; images?: unknown };
const og = (m: Metadata) => m.openGraph as unknown as Og;
const tw = (m: Metadata) => m.twitter as unknown as Tw;
const passos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, tipo: "passo", titulo: `Etapa ${i + 1}`, conteudo: "<p>Faça.</p>" }));

describe("metadados do link do tutorial", () => {
  const base = {
    titulo: "Como trocar o refil", handle: "trocar-refil", capaUrl: "/storage/capa.webp",
    descricao: "<p>Troque o refil do carimbo automático sem sujar as mãos e sem desmontar a base inteira do aparelho.</p>",
  };

  it("o cartão leva o título do guia sem a marca, resumo curto, capa absoluta e endereço canônico", () => {
    const m = metadadosDoTutorial({ tutorial: base, centralTitulo: "Central Tridi", host: "ajuda.tridi.com.br", slug: "central" });
    expect(m.title).toBe("Como trocar o refil — Central Tridi");
    expect(og(m).title).toBe("Como trocar o refil");
    expect(og(m).type).toBe("article");
    expect(og(m).url).toBe("https://ajuda.tridi.com.br/p/central/trocar-refil");
    expect(og(m).images).toEqual([{ url: "https://ajuda.tridi.com.br/storage/capa.webp", alt: "Como trocar o refil" }]);
    expect(og(m).description!.length).toBeLessThanOrEqual(80);
    expect(og(m).description!.endsWith("…")).toBe(true);
    expect(og(m).description).not.toContain("<p>");
    expect(tw(m).card).toBe("summary_large_image");
    expect(tw(m).images).toEqual(["https://ajuda.tridi.com.br/storage/capa.webp"]);
  });

  // A central é pra quem comprou, não pra competir no Google.
  it("continua fora da busca", () => {
    expect(metadadosDoTutorial({ tutorial: base, centralTitulo: "C", host: "a.com", slug: "c" }).robots).toEqual({ index: false, follow: false });
  });

  // Robô de WhatsApp/Meta não resolve caminho relativo contra a página.
  it("capa absoluta passa; relativa sem host, data: e sem capa não viram imagem", () => {
    expect(urlAbsoluta("https://cdn.test/a.webp", "")).toBe("https://cdn.test/a.webp");
    expect(urlAbsoluta("/a.webp", "")).toBe("");
    expect(urlAbsoluta("/a.webp", "site.com:3000")).toBe("https://site.com/a.webp");
    expect(urlAbsoluta("data:image/png;base64,xx", "site.com")).toBe("");
    const semCapa = metadadosDoTutorial({ tutorial: { ...base, capaUrl: "" }, centralTitulo: "C", host: "site.com", slug: "c" });
    expect(og(semCapa).images).toBeUndefined();
    expect(tw(semCapa).images).toBeUndefined();
  });

  it("host esquisito (lista do proxy, espaço) não vira endereço", () => {
    const m = metadadosDoTutorial({ tutorial: base, centralTitulo: "C", host: "a.com, b.com", slug: "c" });
    expect(og(m).url).toBeUndefined();
  });

  it("resumo curto corta na palavra e não passa de 80", () => {
    expect(resumoCurto("Curto.")).toBe("Curto.");
    const r = resumoCurto("palavra ".repeat(30));
    expect(r.length).toBeLessThanOrEqual(80);
    expect(r.endsWith("palavra…")).toBe(true);
  });
});

describe("você vai precisar", () => {
  it("tempo digitado sai seco; o estimado ganha ≈", () => {
    expect(tempoDoTutorial({ descricao: "", blocos: [], duracaoMinutos: 5 }).texto).toBe("5 min");
    const estimado = tempoDoTutorial({ descricao: "", blocos: [], duracaoMinutos: null });
    expect(estimado.estimado).toBe(true);
    expect(estimado.texto).toBe("≈ 1 min");
  });

  it("só aparece com material", () => {
    expect(precisaDoTutorial(normalizarTutorial({ titulo: "x", blocos: passos(1) })).mostrar).toBe(false);
    expect(precisaDoTutorial(normalizarTutorial({ titulo: "x", blocos: passos(4) })).mostrar).toBe(false);
    const dificil = precisaDoTutorial(normalizarTutorial({ titulo: "x", dificuldade: "dificil" }));
    expect(dificil.mostrar).toBe(false);
    expect(dificil.dificuldade).toBe("Difícil");
    expect(precisaDoTutorial(normalizarTutorial({ titulo: "x", materiais: [{ nome: "Tinta" }] })).mostrar).toBe(true);
  });

  it("produtos dos blocos e dos materiais saem numa lista só, sem repetir", () => {
    const t = normalizarTutorial({
      titulo: "x", blocos: [{ id: "b", tipo: "produto", produtoId: "p1" }],
      materiais: [{ id: "m1", nome: "Tinta", produtoId: "p1" }, { id: "m2", nome: "Almofada", produtoId: "p2" }, { id: "m3", nome: "Papel", produtoId: "" }],
    });
    expect(idsDeProdutos(t)).toEqual(["p1", "p2"]);
  });
});

describe("passos feitos no aparelho", () => {
  it("a chave separa a central no ar da prévia do editor", () => {
    expect(chaveFeitos("b1", "usar")).toBe("tut-feitos:b1:usar");
    expect(chaveFeitos(undefined, "usar")).toBe("tut-feitos:previa:usar");
  });

  // O guia muda entre uma visita e outra: passo apagado não pode ficar
  // "feito" num lugar que não existe, nem o JSON quebrado derrubar a página.
  it("lê o guardado, descarta passo que sumiu e ignora lixo", () => {
    expect(lerFeitos(JSON.stringify(["p3", "velho", "p1"]), ["p1", "p2", "p3"])).toEqual(["p1", "p3"]);
    expect(lerFeitos("{quebrado", ["p1"])).toEqual([]);
    expect(lerFeitos(null, ["p1"])).toEqual([]);
    expect(lerFeitos(JSON.stringify({ p1: true }), ["p1"])).toEqual([]);
  });

  it("marca e desmarca pelo id, sempre na ordem do guia", () => {
    const ids = ["p1", "p2", "p3"];
    expect(alternarFeito(["p3"], "p1", ids)).toEqual(["p1", "p3"]);
    expect(alternarFeito(["p1", "p3"], "p1", ids)).toEqual(["p3"]);
  });

  it("andamento no singular e no plural", () => {
    expect(textoAndamento(2, 5)).toBe("2 de 5 passos feitos");
    expect(textoAndamento(1, 1)).toBe("1 de 1 passo feito");
  });

  it("o modo abre no passo que está na tela; sem ele, no primeiro que falta", () => {
    expect(passoInicialDoModo(["a", "b", "c"], ["a"], 3)).toBe(3);
    expect(passoInicialDoModo(["a", "b", "c"], ["a"], null)).toBe(2);
    expect(passoInicialDoModo(["a", "b"], ["a", "b"], null)).toBe(1);
    expect(passoInicialDoModo(["a", "b"], [], 9)).toBe(1);
  });
});

describe("gesto do passo a passo", () => {
  it("arrastar pra esquerda avança e pra direita volta", () => {
    expect(direcaoDoGesto(-80, 10)).toBe(1);
    expect(direcaoDoGesto(90, -5)).toBe(-1);
  });

  // Quem rola o texto não pode trocar de passo sem querer.
  it("toque curto e arrasto inclinado (rolagem) não trocam de passo", () => {
    expect(direcaoDoGesto(-40, 0)).toBe(0);
    expect(direcaoDoGesto(-80, 70)).toBe(0);
    expect(direcaoDoGesto(Number.NaN, 0)).toBe(0);
  });
});

describe("mensagem do WhatsApp", () => {
  it("leva o guia, o passo e o motivo", () => {
    expect(mensagemWhatsapp({ titulo: "Trocar o refil", passo: 3, motivo: "motivo_passo" }))
      .toBe("Olá! Vim do tutorial “Trocar o refil”. Estou no passo 3. Um passo ficou confuso.");
  });

  it("sem passo nem motivo pede ajuda; do 'Deu errado?' diz de onde veio", () => {
    expect(mensagemWhatsapp({ titulo: "X" })).toBe("Olá! Vim do tutorial “X”. Preciso de ajuda.");
    expect(mensagemWhatsapp({ titulo: "X", motivo: "problemas" })).toContain("“Deu errado?”");
  });

  it("vai codificada no link do WhatsApp", () => {
    const href = linkWhatsapp("11999998888", mensagemWhatsapp({ titulo: "Trocar o refil", passo: 2 }));
    expect(href.startsWith("https://wa.me/5511999998888?text=")).toBe(true);
    expect(href).not.toContain(" ");
    expect(decodeURIComponent(href.split("text=")[1])).toContain("Estou no passo 2.");
  });

  // Contrato com a rota /api/p/tutorial-metrica (frente de métricas). Confere
  // contra o porteiro que a rota usa de fato (`ehCampoMetrica`), não contra uma
  // cópia: campo renomeado lá vira 400, o `enviarMetrica` engole, e a contagem
  // some sem erro na tela — com uma lista literal aqui, o teste seguia verde.
  it("todo motivo é um campo que a rota de métrica aceita", () => {
    expect(CAMPOS_METRICA_LEITURA.filter((c) => !ehCampoMetrica(c))).toEqual([]);
    for (const m of MOTIVOS_NAO) expect(CAMPOS_METRICA_LEITURA).toContain(m.campo);
    expect([...CAMPOS_METRICA_LEITURA].sort()).toEqual([...CAMPOS_METRICA].sort());
  });
});

describe("barra do rodapé do tutorial", () => {
  // A barra é fixa — Tutoriais, Loja, Compartilhar. O configurado só empresta o
  // endereço da loja; "Site" e o resto não entram.
  it("a barra é sempre Tutoriais, Loja e Compartilhar", () => {
    const a: AtalhoCentral[] = [
      { id: "s", rotulo: "Site", icone: "world-www", acao: "link", url: "https://site.test", destaque: true },
      { id: "x", rotulo: "Loja", icone: "shopping-bag", acao: "link", url: "https://loja.test", destaque: false },
    ];
    const barra = barraDoTutorial(a, "11999998888");
    expect(barra.map((x) => x.rotulo)).toEqual(["Tutoriais", "Loja", "Compartilhar"]);
    expect(barra[1].url).toBe("https://loja.test");
  });

  // "Contato" saiu da barra (24/09/26): o WhatsApp não entra mais nela.
  it("sem configuração, a barra é Tutoriais e Compartilhar, com ou sem WhatsApp", () => {
    expect(barraDoTutorial([], "11999998888").map((x) => x.rotulo)).toEqual(["Tutoriais", "Compartilhar"]);
    expect(barraDoTutorial([], "").map((x) => x.acao)).toEqual(["topo", "compartilhar"]);
  });
});

describe("passos para as peças de cliente", () => {
  it("referências levam só id, número e título; o conteúdo do modo sai higienizado", () => {
    const { blocos } = normalizarTutorial({ titulo: "x", blocos: [
      { id: "t", tipo: "texto", conteudo: "<p>oi</p>" },
      { id: "a", tipo: "passo", titulo: "", conteudo: "<script>x</script><p>Faça <b>assim</b></p>" },
      { id: "b", tipo: "passo", titulo: "Guarde" },
    ] });
    expect(referenciasDosPassos(blocos)).toEqual([{ id: "a", n: 1, titulo: "Passo 1" }, { id: "b", n: 2, titulo: "Guarde" }]);
    const [primeiro] = conteudoDosPassos(blocos);
    expect(primeiro.html).not.toContain("script");
    expect(primeiro.html).toContain("<strong>assim</strong>");
  });

  it("sumário a partir de três passos", () => {
    expect(MINIMO_SUMARIO).toBe(3);
  });
});
