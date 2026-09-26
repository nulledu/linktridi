import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Etiqueta, FolhaDeEtiquetas, esquecerAjustesDeImpressao, type DadosEtiqueta } from "../Etiqueta";
import { faixasDaEtiqueta } from "@/lib/estoque-etiqueta-config";

// ── O escritório escolhe o que vai impresso ──────────────────────────────────
//
// O tamanho da etiqueta já era ajuste; o conteúdo dela não. Estes testes seguram
// a promessa que distingue isto de "mais um interruptor": desligar um campo
// DEVOLVE espaço — o código escrito sai e a barra ocupa o lugar dele.

const BASE: DadosEtiqueta = {
  codigo: "CHAN-0001-000042",
  nome: "Chancela dourada grande",
  corDimensoes: "Dourado · 40×15",
  local: "GAL-A",
  localDetalhe: "C3 · B2",
  impressoEm: "2026-08-14T12:00:00.000Z",
  responsavel: "João",
};

describe("a etiqueta desenha só os campos que o escritório pediu", () => {
  it("com a lista vazia, imprime tudo — é a etiqueta cheia, em duas faixas", () => {
    // A tira empilhada de 72mm carrega os seis campos sem uma reticência: nome,
    // cor e local em cima; código escrito, detalhe da prateleira e horário
    // embaixo. É o que os números de `faixasDaEtiqueta` fixam em milímetro.
    const { container } = render(<Etiqueta dados={BASE} />);
    const texto = container.textContent ?? "";
    expect(texto).toContain("Chancela dourada grande");
    expect(texto).toContain("Dourado · 40×15");
    expect(texto).toContain("GAL-A");
    expect(texto).toContain("CHAN-0001-000042");
    expect(texto).toContain("C3 · B2");
    expect(texto).toContain("João");
  });

  it("cada campo desligado some da tira, e só ele", () => {
    const casos = [
      { oculto: "cor_dimensoes", some: "Dourado · 40×15", fica: "João" },
      { oculto: "data_responsavel", some: "João", fica: "Dourado · 40×15" },
      { oculto: "local_detalhe", some: "C3 · B2", fica: "GAL-A" },
    ] as const;
    for (const caso of casos) {
      const { container, unmount } = render(<Etiqueta dados={BASE} ocultos={[caso.oculto]} />);
      const texto = container.textContent ?? "";
      expect(texto, caso.oculto).not.toContain(caso.some);
      expect(texto, caso.oculto).toContain(caso.fica);
      // E com o campo LIGADO ele de fato saía — senão o teste acima passaria
      // por acidente, medindo um campo que a largura já tinha comido.
      const { container: comEle, unmount: fecha } = render(<Etiqueta dados={BASE} />);
      expect(comEle.textContent ?? "", `${caso.oculto} ligado`).toContain(caso.some);
      fecha();
      // O nome e as barras NUNCA saem — são a etiqueta.
      expect(texto, caso.oculto).toContain("Chancela dourada grande");
      expect(container.querySelector("svg"), caso.oculto).toBeTruthy();
      unmount();
    }
  });

  it("sem o código ESCRITO, as barras continuam — é o texto que sai, não o código", () => {
    // A confusão que este teste impede custaria caro: desligar "o código escrito
    // embaixo das barras" achando que se desliga o código de barras deixaria uma
    // etiqueta que não bipa. O SVG é a prova de que ele ficou.
    const { container } = render(<Etiqueta dados={BASE} ocultos={["codigo_legivel"]} />);
    expect(container.textContent).not.toContain("CHAN-0001-000042");
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("o selo da caixa sobrevive a tudo desligado", () => {
    // Não há chave pra ele, e é decisão: quantas peças tem dentro de um lacre
    // não está escrito em nenhum outro lugar do mundo.
    const { container } = render(
      <Etiqueta
        dados={{ ...BASE, quantidade: 50, tipo: "caixa" }}
        ocultos={["cor_dimensoes", "data_responsavel", "codigo_legivel", "local_detalhe"]}
      />,
    );
    expect(container.textContent).toContain("50 un");
  });
});

describe("a folha escolhe os campos DESTA impressão, sem mexer no galpão", () => {
  const respostas = {
    config: { alturaMm: 15, larguraMm: 72, copias: 1, ocultos: [] as string[] },
    caixas: [] as string[],
  };
  let salvou: unknown[] = [];

  beforeEach(() => {
    esquecerAjustesDeImpressao();
    salvou = [];
    respostas.config = { alturaMm: 15, larguraMm: 72, copias: 1, ocultos: [] };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method && init.method !== "GET") salvou.push([url, init.method]);
      return { ok: true, json: async () => respostas };
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); esquecerAjustesDeImpressao(); });

  it("desmarcar um campo redesenha a folha e NÃO grava nada", async () => {
    // Sem isto, ver no papel como fica a etiqueta sem a data exigiria desligar
    // a data pro galpão inteiro, imprimir, e lembrar de religar.
    const u = userEvent.setup();
    const { container } = render(<FolhaDeEtiquetas etiquetas={[BASE]} />);
    await waitFor(() => expect(container.textContent).toContain("João"));

    await u.click(screen.getByRole("button", { name: /72×\d+mm/ }));
    await u.click(screen.getByLabelText("Data e responsável"));

    await waitFor(() => expect(container.textContent).not.toContain("João"));
    expect(salvou, "a folha não pode gravar nada").toEqual([]);
    expect(screen.getByText("só nesta folha")).toBeTruthy();
  });

  it("o padrão do galpão continua valendo, e o caminho de volta existe", async () => {
    const u = userEvent.setup();
    const { container } = render(<FolhaDeEtiquetas etiquetas={[BASE]} />);
    await waitFor(() => expect(container.textContent).toContain("João"));

    await u.click(screen.getByRole("button", { name: /72×\d+mm/ }));
    await u.click(screen.getByLabelText("Data e responsável"));
    await waitFor(() => expect(container.textContent).not.toContain("João"));

    await u.click(screen.getByRole("button", { name: /Voltar ao padrão do galpão/ }));
    await waitFor(() => expect(container.textContent).toContain("João"));
  });

  it("o que o galpão desligou já vem desligado na folha", async () => {
    respostas.config = { alturaMm: 15, larguraMm: 72, copias: 1, ocultos: ["codigo_legivel"] };
    const { container } = render(<FolhaDeEtiquetas etiquetas={[BASE]} />);
    await waitFor(() => expect(container.textContent).toContain("Chancela dourada grande"));
    expect(container.textContent).not.toContain("CHAN-0001-000042");
    // E sem badge: este É o padrão, não uma exceção desta folha.
    expect(screen.queryByText("só nesta folha")).toBeNull();
  });

  it("servidor que ainda não manda os campos NÃO derruba a folha", async () => {
    // O caso do deploy pela metade (ou de uma resposta em cache): o objeto vem
    // sem `ocultos`, e um `as ConfigImpressao` deixaria a lista `undefined` —
    // a folha inteira morria em tela branca no primeiro `.includes`. Medido: era
    // exatamente o que acontecia antes de a resposta passar por `normalizarConfig`.
    // @ts-expect-error — de propósito: é o corpo que um servidor antigo devolve.
    respostas.config = { alturaMm: 15, larguraMm: 72, copias: 1 };
    const { container } = render(<FolhaDeEtiquetas etiquetas={[BASE]} />);
    await waitFor(() => expect(container.textContent).toContain("Chancela dourada grande"));
    // Sem a lista, a etiqueta sai COMPLETA — que é o que o galpão imprime hoje.
    expect(container.textContent).toContain("CHAN-0001-000042");
    expect(container.textContent).toContain("João");
  });
});

describe("o alvo de toque do celular", () => {
  beforeEach(() => {
    esquecerAjustesDeImpressao();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ config: { alturaMm: 15, larguraMm: 72, copias: 1, ocultos: [] }, caixas: [] }),
    })));
  });
  afterEach(() => { vi.unstubAllGlobals(); esquecerAjustesDeImpressao(); });

  it("a linha inteira do campo é o alvo, e ela pede os 44px da fundação", async () => {
    // `offsetHeight` é sempre 0 no jsdom (não há layout), então o que se confere
    // aqui é a REGRA declarada — que é justamente o que se esquece de escrever.
    // A medida de verdade é no navegador, a 320px.
    //
    // E o alvo é o `<label>`, não só a caixinha: um checkbox de 18px sozinho
    // deixa 26 dos 44px mortos, e quem está de luva erra o toque.
    const u = userEvent.setup();
    render(<FolhaDeEtiquetas etiquetas={[BASE]} />);
    await u.click(await screen.findByRole("button", { name: /72×\d+mm/ }));

    for (const rotulo of ["Cor e dimensões", "Data e responsável", "Código escrito embaixo das barras", "Detalhe da prateleira"]) {
      const caixa = screen.getByRole("checkbox", { name: rotulo });
      const linha = caixa.closest("label");
      expect(linha, rotulo).toBeTruthy();
      expect(linha!.style.minHeight, rotulo).toBe("var(--tap)");
    }
  });
});

// ── A prévia É a régua, não uma cópia dela ───────────────────────────────────
//
// Defeito real, visto no navegador a 2,5× e não deduzido: o componente repartia
// a faixa do topo com pesos escritos na mão (5 : 4) enquanto `faixasDaEtiqueta`
// já repartia 1 : 1. A vaga da cor saía com 25,4mm em vez de 28,5 — exatamente
// a largura que "Branco · 2750×1840" mede —, e o texto aparecia com reticências
// na tela e inteiro no papel.
//
// Prévia que mente é pior que prévia nenhuma: quem confere o tamanho da tira
// aqui está justamente decidindo se o nome cabe. Por isso cada vaga entra como
// `flex: 0 0 Xmm` com o X que a régua devolveu, e é isso que este teste tranca.
describe("a prévia desenha as vagas que a régua calculou, em milímetro", () => {
  const casos = [
    { rotulo: "72mm cheia", largura: 72, dados: BASE },
    { rotulo: "72mm caixa", largura: 72, dados: { ...BASE, quantidade: 50 } },
    { rotulo: "48mm", largura: 48, dados: BASE },
  ];

  for (const caso of casos) {
    it(`bate com faixasDaEtiqueta — ${caso.rotulo}`, () => {
      const ehCaixa = (caso.dados.quantidade ?? 1) > 1;
      const f = faixasDaEtiqueta(caso.dados.codigo, caso.largura, { temLocal: true, ehCaixa });
      const { container } = render(<Etiqueta dados={caso.dados} largura={caso.largura} />);

      const basePorTexto = new Map<string, string>();
      container.querySelectorAll("div").forEach((el) => {
        if (el.children.length === 0 && el.textContent?.trim()) {
          basePorTexto.set(el.textContent.trim(), el.style.flex);
        }
      });
      const esperado = (texto: string, mm: number) =>
        expect(basePorTexto.get(texto), `${caso.rotulo} · ${texto}`).toBe(`0 0 ${mm}mm`);

      esperado(caso.dados.nome, f.nomeMm);
      esperado(caso.dados.corDimensoes!, f.corDimensoesMm);
      esperado(caso.dados.local, f.localMm);
      esperado(caso.dados.codigo, f.codigoLegivelMm);
      if (f.mostraDetalheDoLocal) esperado(caso.dados.localDetalhe!, f.detalheDoLocalMm);
    });
  }

  it("a moldura não rouba largura — ela é `outline`, não `border`", () => {
    // `border` consome 0,25mm de cada lado, e a régua conta com os 70mm
    // inteiros que o tablet tem. Meio milímetro a menos é o bastante pra um
    // campo cortar na tela e sair inteiro no papel.
    const { container } = render(<Etiqueta dados={BASE} />);
    const tira = container.firstElementChild as HTMLElement;
    expect(tira.style.border).toBe("");
    expect(tira.style.outline).toContain("solid");
    expect(tira.style.outlineOffset).toBe("-0.25mm");
  });
});
