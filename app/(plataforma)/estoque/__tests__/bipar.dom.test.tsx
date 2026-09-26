import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";

// A tela de bipar é a única do módulo usada EM PÉ, no galpão, dezenas de vezes
// seguidas. As quatro coisas que, se quebrarem, matam o inventário etiquetado:
// a leitura aterrissa; a mesma etiqueta não sai do estoque duas vezes; o lote
// inteiro vai num PATCH só; e quem bipou 40 chapas vê exatamente quais não
// passaram. É isso que este arquivo trava.
//
// O LeitorCodigo é trocado por um duble que só GUARDA o `onLer`: a câmera de
// verdade depende de getUserMedia/BarcodeDetector, que o jsdom não tem — e o
// que interessa aqui é o que a tela faz com o código, não como ele chegou.
//
// Nada de geometria: jsdom não tem motor de layout, então `offsetParent` e
// `getBoundingClientRect()` são sempre 0. Alvo de toque se confere no
// navegador (44px vem de `tamanho="lg"` e da fundação `pointer: coarse`).
let bipar: ((codigo: string) => void) | null = null;
vi.mock("../../ui/LeitorCodigo", () => ({
  LeitorCodigo: ({ onLer }: { onLer: (codigo: string) => void }) => {
    bipar = onLer;
    return <div data-testid="leitor-falso" />;
  },
}));

import { BiparClient } from "../BiparClient";

const A = "MDF6MM-BR-18-000042";
const B = "MDF6MM-BR-18-000043";
const C = "MDF6MM-BR-18-000044";

/**
 * Servidor de mentira: o GET `?codigos=` diz o que cada etiqueta É (a consulta
 * que existe pra tela poder dizer "Caixa · 50 un" ANTES de confirmar) e o PATCH
 * baixa tudo. `pecasPorEtiqueta` controla o tamanho da caixa.
 */
function respostaOk(pecasPorEtiqueta = 1) {
  return vi.fn((url: string, init?: RequestInit) => {
    const ok = (corpo: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corpo) } as Response);
    if (!init?.method) {
      const codigos = new URL(String(url), "http://x").searchParams.get("codigos")?.split(",") ?? [];
      // `classificacao` é o campo que a tela lê hoje: ele diz o TIPO do código
      // (unidade, produto ou nenhum), não só as etiquetas achadas. `etiquetas`
      // continua na resposta real para quem já consumia a rota.
      const classificacao = codigos.map((codigo) => ({
        codigo, tipo: "unidade", item: "Chapa MDF 6mm", itemId: "i1",
        pecas: pecasPorEtiqueta, status: "em_estoque", saldo: null, unidade: "un",
      }));
      return ok({ etiquetas: classificacao, classificacao });
    }
    const codigos = (JSON.parse(String(init?.body ?? "{}")).codigos ?? []) as string[];
    return ok({ ok: true, resultado: codigos.map((codigo) => ({ codigo, situacao: "baixada", item: "Chapa MDF 6mm", pecas: pecasPorEtiqueta })) });
  });
}

/** Só as chamadas de escrita — a consulta do tamanho da caixa não é uma delas. */
function patches() {
  return (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([, init]) => init?.method === "PATCH");
}

function abrirLeitor() {
  fireEvent.click(screen.getByRole("button", { name: /Ler com a câmera/ }));
}

function ler(codigo: string) {
  act(() => bipar?.(codigo));
}

beforeEach(() => {
  bipar = null;
  vi.stubGlobal("fetch", respostaOk());
});
afterEach(() => vi.unstubAllGlobals());

describe("Bipar — baixa de unidades em lote", () => {
  it("o código bipado aterrissa na fila", () => {
    render(<BiparClient />);
    abrirLeitor();
    ler(A);
    expect(screen.getByText(A)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dar baixa em 1|Escolha o motivo/ })).toBeInTheDocument();
  });

  it("a mesma etiqueta bipada duas vezes entra UMA vez", () => {
    // Sem isto a chapa sairia do estoque duas vezes: a janela anti-repetição do
    // LeitorCodigo só cobre a leitura dupla de um segundo, não a pessoa que
    // passa de novo pela mesma peça um minuto depois.
    render(<BiparClient />);
    abrirLeitor();
    ler(A);
    ler(A);
    expect(screen.getAllByText(A)).toHaveLength(1);
  });

  /*
   * O FORMATO NÃO É MAIS O PORTÃO — e isto substitui um teste que exigia o
   * contrário ("código malformado é recusado na hora, sem ida ao servidor").
   *
   * A regra antiga recusava tudo que não terminasse em `-000042`, e ela parecia
   * uma economia: um EAN de fornecedor não é etiqueta nossa, então nem
   * perguntar. Só que a etiqueta de PRODUTO — a de 263 dos 274 itens do
   * catálogo — é o SKU puro, e cai exatamente no mesmo formato do EAN. A régua
   * de formato não distingue os dois; só o banco distingue.
   *
   * O custo é uma consulta (em lote, com 180ms de respiro) e o ganho é a tela
   * funcionar para quase todo item do galpão. A recusa continua existindo — só
   * que agora ela é verdadeira, vem depois de procurar, e diz o que é provável:
   * um código de fornecedor que ninguém cadastrou no item.
   */
  it("código que não é de ninguém entra na fila e volta com a recusa VERDADEIRA", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(init?.method ? { ok: true, resultado: [] } : {
        etiquetas: [],
        classificacao: [{
          codigo: "7891234567890", tipo: "nenhum",
          item: null, itemId: null, pecas: 0, status: null, saldo: null, unidade: null,
        }],
      }),
    } as Response)));

    render(<BiparClient />);
    abrirLeitor();
    ler("7891234567890"); // EAN da embalagem do fornecedor

    // A linha existe — ela não some no ar — e diz por que não serve.
    await waitFor(() => expect(screen.getByText(/código de barras do fornecedor/i)).toBeInTheDocument());
  });

  it("confirmar manda UM PATCH com todos os códigos e o motivo escolhido", async () => {
    render(<BiparClient />);
    abrirLeitor();
    ler(A);
    ler(B);
    ler(C);

    // Motivo responde na DESCIDA do dedo, não no `click`.
    fireEvent.pointerDown(screen.getByRole("radio", { name: /Expedido pro cliente/ }), { button: 0 });
    expect(screen.getByRole("radio", { name: /Expedido pro cliente/ })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("button", { name: /Dar baixa em 3/ }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    const [url, init] = patches()[0];
    expect(url).toBe("/api/estoque/unidades");
    const corpo = JSON.parse(String(init.body));
    expect(corpo.motivo).toBe("expedido");
    expect(corpo.codigos).toEqual([C, B, A]); // mais recente primeiro, os três no mesmo lote
    expect(corpo.atividadeId, "baixa avulsa: sem atividade nenhuma no meio").toBeUndefined();

    // Tudo passou: a fila esvazia e o resumo diz quantas saíram.
    await waitFor(() => expect(screen.queryByText(A)).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(/3 etiquetas baixadas/);
  });

  it("etiqueta desconhecida volta pra tela, dita pelo nome, e não some da fila", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(init?.method ? {
        ok: true,
        resultado: [
          { codigo: B, situacao: "baixada", item: "Chapa MDF 6mm" },
          { codigo: A, situacao: "desconhecida", item: null },
        ],
      } : {
        // O servidor não conhece o código A: a classificação diz "nenhum", que
        // é o único caso em que a tela pode falar em "não existe".
        etiquetas: [],
        classificacao: [{ codigo: A, tipo: "nenhum", item: null, itemId: null, pecas: 0, status: null, saldo: null, unidade: null }],
      }),
    } as Response)));

    render(<BiparClient />);
    abrirLeitor();
    ler(A);
    ler(B);
    fireEvent.pointerDown(screen.getByRole("radio", { name: /Consumido na produção/ }), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: /Dar baixa em 2/ }));

    // Aparece no resumo E continua marcada na fila — quem bipou 40 chapas tem
    // que enxergar exatamente qual das 40 não passou.
    await waitFor(() => expect(screen.getAllByText(/Não existe no sistema/).length).toBeGreaterThan(0));
    expect(screen.getByRole("status")).toHaveTextContent(/1 etiqueta baixada/);
    // Duas vezes de propósito: uma no resumo do lote, outra na linha que ficou.
    expect(screen.getAllByText(A)).toHaveLength(2);
    expect(screen.queryByText(B)).not.toBeInTheDocument();
  });

  it("bipar UMA caixa de 50 avisa que saem 50, não 1", async () => {
    // Sem isto a tela diz "1 etiqueta na fila" pra uma caixa lacrada de 50
    // folhas — e a pessoa bipa mais 49 achando que tirou uma.
    vi.stubGlobal("fetch", respostaOk(50));
    render(<BiparClient />);
    abrirLeitor();
    ler(A);

    await waitFor(() => expect(screen.getByText(/Caixa · 50 un/)).toBeInTheDocument());
    expect(screen.getByText("50 peças")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("radio", { name: /Consumido na produção/ }), { button: 0 });
    // O botão promete o que sai da prateleira, não quantos códigos há na tela.
    expect(screen.getByRole("button", { name: /Dar baixa em 1 · 50 peças/ })).toBeInTheDocument();
  });

  it("aberta de dentro de uma atividade, toda baixa sai amarrada a ela", async () => {
    // É o começo do ciclo do galpão: pega a caixa lacrada, bipa, e só então
    // rompe o lacre e monta. Sem o vínculo ninguém sabe que ESTA caixa de
    // folhas virou AQUELAS alavancas — e a perda de uma reprovação some.
    const ATIV = { id: "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b", tarefa: "Montar alavanca", para_nome: "Ana", status: "em_andamento" };
    render(<BiparClient atividade={ATIV} motivoInicial="consumido" />);
    abrirLeitor();
    ler(A);
    fireEvent.click(screen.getByRole("button", { name: /Dar baixa em 1/ }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(JSON.parse(String(patches()[0][1].body)).atividadeId).toBe(ATIV.id);
    // E não há seletor nenhum: a atividade já é a razão de estar bipando.
    expect(screen.queryByRole("button", { name: /Vincular a uma atividade/ })).not.toBeInTheDocument();
  });

  it("a baixa avulsa pode ser vinculada a uma atividade, e aí o motivo é consumo", async () => {
    // O galpão dá baixa sem atividade nenhuma (perda, expedição) — esse caminho
    // é o padrão e não pode sumir. O vínculo é um passo A MAIS, e a lista de
    // atividades só é buscada quando alguém pede.
    const ATIV = { id: "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b", tarefa: "Montar alavanca", para_nome: "Ana", status: "em_andamento" };
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      const ok = (corpo: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corpo) } as Response);
      if (String(url).startsWith("/api/atividades")) return ok({ atividades: [ATIV] });
      if (!init?.method) return ok({ etiquetas: [] });
      return ok({ ok: true, resultado: [{ codigo: A, situacao: "baixada", item: "Chapa MDF 6mm", pecas: 1 }] });
    }));

    render(<BiparClient />);
    abrirLeitor();
    ler(A);
    expect(fetch).not.toHaveBeenCalledWith("/api/atividades", expect.anything());

    fireEvent.pointerDown(screen.getByRole("button", { name: /Vincular a uma atividade/ }), { button: 0 });
    // O nome acessível do gatilho é o do `<label htmlFor>` — é justamente o que
    // faz clicar no rótulo focar o seletor e o leitor de tela anunciar os dois.
    const gatilho = await screen.findByRole("button", { name: /Atividade que vai consumir/ });
    fireEvent.click(gatilho);
    fireEvent.click(await screen.findByText(/Montar alavanca · Ana/));

    // Bipar material DE uma atividade é consumo na produção — escolhido sozinho.
    await waitFor(() => expect(screen.getByRole("radio", { name: /Consumido na produção/ })).toHaveAttribute("aria-checked", "true"));
    fireEvent.click(screen.getByRole("button", { name: /Dar baixa em 1/ }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(JSON.parse(String(patches()[0][1].body)).atividadeId).toBe(ATIV.id);
  });

  it("tirar da fila é um botão com nome próprio (nada de hover nem arrastar)", () => {
    // No galpão a outra mão está segurando a chapa: a ação de remover não pode
    // depender de gesto nem de passar o mouse.
    render(<BiparClient />);
    abrirLeitor();
    ler(A);
    const tirar = screen.getByRole("button", { name: `Tirar ${A} da fila` });
    fireEvent.pointerDown(tirar, { button: 0 });
    expect(screen.queryByText(A)).not.toBeInTheDocument();
  });
});

// ── A etiqueta de PRODUTO sai do estoque pela mesma tela ─────────────────────
//
// O defeito relatado pelo galpão: "diz que o produto não existe no sistema".
// Não era permissão nem cadastro — a tela só sabia baixar etiqueta de UNIDADE,
// e 263 dos 274 itens do catálogo são de código fixo, cuja etiqueta é o SKU.
// Bipar o papel colado na peça caía num "não existe" que acusava o cadastro.
//
// O que estes testes guardam: os dois tipos convivem na mesma fila, cada um sai
// pela sua rota, e rebipar o mesmo produto SOMA (vinte almofadas têm o mesmo
// código) enquanto rebipar a mesma unidade não (é a mesma peça).
describe("bipar a etiqueta de produto", () => {
  const SKU = "PRD-0270";

  /** Servidor que conhece o SKU como PRODUTO e o código com série como unidade. */
  function servidorMisto() {
    return vi.fn((url: string, init?: RequestInit) => {
      const ok = (corpo: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corpo) } as Response);
      if (!init?.method) {
        const codigos = new URL(String(url), "http://x").searchParams.get("codigos")?.split(",") ?? [];
        return ok({
          classificacao: codigos.map((codigo) => (codigo === SKU
            ? { codigo, tipo: "produto", item: "Protetor Auricular", itemId: "i9", pecas: 1, status: null, saldo: 33, unidade: "un" }
            : { codigo, tipo: "unidade", item: "Chapa MDF 6mm", itemId: "i1", pecas: 1, status: "em_estoque", saldo: null, unidade: "un" })),
        });
      }
      if (String(url).includes("ajuste-qr")) return ok({ ok: true, saldo: 30, item: "Protetor Auricular", frase: "Saíram 3." });
      const codigos = (JSON.parse(String(init?.body ?? "{}")).codigos ?? []) as string[];
      return ok({ ok: true, resultado: codigos.map((codigo) => ({ codigo, situacao: "baixada", item: "Chapa MDF 6mm", pecas: 1 })) });
    });
  }

  it("o SKU do produto entra na fila com o nome do item — nunca com 'não existe'", async () => {
    vi.stubGlobal("fetch", servidorMisto());
    render(<BiparClient />);
    abrirLeitor();
    ler(SKU);

    await waitFor(() => expect(screen.getByText(/Protetor Auricular/)).toBeInTheDocument());
    expect(screen.queryByText(/não existe no sistema/i)).not.toBeInTheDocument();
    // O saldo entra na linha: é o que diz se dá pra tirar o que se pretende.
    expect(screen.getByText(/tem 33/)).toBeInTheDocument();
  });

  it("rebipar o mesmo produto SOMA a quantidade", async () => {
    vi.stubGlobal("fetch", servidorMisto());
    render(<BiparClient />);
    abrirLeitor();
    ler(SKU);
    await waitFor(() => expect(screen.getByText(/Protetor Auricular/)).toBeInTheDocument());
    ler(SKU);
    ler(SKU);

    // Três leituras do mesmo código são três peças — não três linhas nem uma.
    await waitFor(() => expect(screen.getByText("3 un")).toBeInTheDocument());
  });

  it("confirmar manda o produto pelo ajuste (saída) e a unidade pelo PATCH", async () => {
    const fetchSpy = servidorMisto();
    vi.stubGlobal("fetch", fetchSpy);
    render(<BiparClient />);
    abrirLeitor();
    ler(A);
    ler(SKU);
    await waitFor(() => expect(screen.getByText(/Protetor Auricular/)).toBeInTheDocument());
    // Os motivos são `radio` (grupo de escolha), não botões soltos.
    fireEvent.pointerDown(screen.getByRole("radio", { name: /Perdido/ }), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: /Dar baixa/ }));

    await waitFor(() => {
      const chamadas = fetchSpy.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method);
      const ajuste = chamadas.find((c) => String(c[0]).includes("ajuste-qr"));
      expect(ajuste, "a etiqueta de produto sai por quantidade").toBeTruthy();
      const corpo = JSON.parse(String((ajuste![1] as RequestInit).body));
      // `saida`, nunca `entrada`: é a direção que a permissão de bipar libera.
      expect(corpo.sentido).toBe("saida");
      expect(corpo.codigo).toBe(SKU);
      expect(corpo.motivo).toBe("perdido");

      const patch = chamadas.find((c) => String(c[0]) === "/api/estoque/unidades");
      expect(patch, "a etiqueta de unidade continua saindo pela baixa").toBeTruthy();
      expect(JSON.parse(String((patch![1] as RequestInit).body)).codigos).toEqual([A]);
    });
  });
});
