import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OperacaoClient, type PermsDaOperacao } from "../OperacaoClient";

/**
 * A tela que une o galpão num lugar só.
 *
 * O que se trava aqui é o contrato de PERMISSÃO — que é o que faz uma tela
 * agregadora dar errado. Ela junta seis coisas com donos diferentes, e o modo
 * de falhar não é "quebra": é oferecer um cartão que abre um painel onde todo
 * botão volta 403. A pessoa clica, não entende, e chama alguém.
 *
 * Os painéis de dentro são mocados: eles já têm testes próprios, e importá-los
 * de verdade traria fetch, câmera e o kit inteiro para uma pergunta que é só
 * sobre quais cartões aparecem.
 */

vi.mock("../../estoque/BiparClient", () => ({ BiparClient: () => <div>painel de baixa</div> }));
vi.mock("../../estoque/EntradaPorLeitura", () => ({ EntradaPorLeitura: () => <div>painel de entrada</div> }));
vi.mock("../../estoque/RecebimentoPanel", () => ({ RecebimentoPanel: () => <div>painel de recebimento</div> }));
vi.mock("../../estoque/impressao/ImpressorasPanel", () => ({ ImpressorasPanel: () => <div>painel de impressoras</div> }));
vi.mock("../ConsultarPanel", () => ({ ConsultarPanel: () => <div>painel de consulta</div> }));
vi.mock("../TransferirPanel", () => ({ TransferirPanel: () => <div>painel de transferência</div> }));

const TUDO: PermsDaOperacao = { itens: true, bipar: true, ajustar: true, compras: true, configurarImpressao: true };
const NADA: PermsDaOperacao = { itens: false, bipar: false, ajustar: false, compras: false, configurarImpressao: false };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)));
  // A tarefa aberta mora em `?tarefa=` e o jsdom compartilha a URL no arquivo
  // inteiro: sem zerar, o teste seguinte nasce com a tarefa do anterior aberta.
  window.history.replaceState(null, "", "/operacao");
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("os cartões seguem a permissão de ESTOQUE, não uma chave nova", () => {
  it("com tudo liberado, as seis tarefas aparecem", () => {
    render(<OperacaoClient perms={TUDO} />);
    for (const t of ["Consultar", "Dar baixa", "Entrada por leitura", "Transferir", "Receber", "Impressoras"]) {
      expect(screen.getByRole("button", { name: new RegExp(t) }), t).toBeTruthy();
    }
  });

  it("'Conferir trabalho' saiu: a conferência de atividade foi desligada em 11/09/2026", () => {
    // Peça produzida entra no estoque pela mão de quem cuida dele — Entrada
    // por leitura, aqui mesmo (lib/conferencia-de-atividade.ts).
    render(<OperacaoClient perms={TUDO} />);
    expect(screen.queryByRole("button", { name: /Conferir trabalho/ })).toBeNull();
  });

  it("Transferir exige ajustar E itens — sem qualquer um dos dois, some", () => {
    // O painel busca pelo /api/estoque/consultar (gate `estoque:itens`) e grava
    // pelo /api/estoque/transferir (gate `estoque:ajustar`). Cartão com um só
    // dos dois abriria num beco de 403 — o modo de falhar desta tela.
    const semAjustar = render(<OperacaoClient perms={{ ...TUDO, ajustar: false }} />);
    expect(screen.queryByRole("button", { name: /Transferir/ })).toBeNull();
    semAjustar.unmount();
    render(<OperacaoClient perms={{ ...TUDO, itens: false }} />);
    expect(screen.queryByRole("button", { name: /Transferir/ })).toBeNull();
  });

  it("sem `estoque:ajustar` NÃO oferece entrada — o painel voltaria 403", () => {
    // Este é o modo de falhar de uma tela agregadora: o cartão existe, abre, e
    // todo botão de dentro é recusado. A pessoa não tem como saber por quê.
    render(<OperacaoClient perms={{ ...TUDO, ajustar: false }} />);
    expect(screen.queryByRole("button", { name: /Entrada por leitura/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Dar baixa/ })).toBeTruthy();
  });

  it("sem `estoque:bipar` não oferece a baixa", () => {
    render(<OperacaoClient perms={{ ...TUDO, bipar: false }} />);
    expect(screen.queryByRole("button", { name: /Dar baixa/ })).toBeNull();
  });

  it("sem `estoque:compras` não oferece receber", () => {
    render(<OperacaoClient perms={{ ...TUDO, compras: false }} />);
    expect(screen.queryByRole("button", { name: /Receber/ })).toBeNull();
  });

  it("sem `estoque:itens` some consultar", () => {
    render(<OperacaoClient perms={{ ...TUDO, itens: false }} />);
    expect(screen.queryByRole("button", { name: /Consultar/ })).toBeNull();
  });

  it("sem permissão nenhuma sobram as impressoras — e a tela DIZ por quê", () => {
    // Impressora não depende de permissão de estoque: ela é o cadastro da
    // máquina em que a pessoa está. Mas uma tela com um cartão só e nenhuma
    // explicação parece quebrada.
    render(<OperacaoClient perms={NADA} />);
    expect(screen.getByRole("button", { name: /Impressoras/ })).toBeTruthy();
    expect(document.body.textContent).toMatch(/dependem das permissões do\s+Estoque/);
  });
});

describe("uma tarefa por vez, e a volta sempre no mesmo lugar", () => {
  it("abrir um cartão troca a tela pelo painel dele", () => {
    render(<OperacaoClient perms={TUDO} />);
    fireEvent.click(screen.getByRole("button", { name: /Consultar/ }));
    expect(screen.getByText("painel de consulta")).toBeTruthy();
    // Os outros cartões saem da frente: é o desenho do tablet, uma coisa por vez.
    expect(screen.queryByRole("button", { name: /Receber/ })).toBeNull();
  });

  it("o título vira o nome da tarefa — não fica “Operação” pra sempre", () => {
    render(<OperacaoClient perms={TUDO} />);
    fireEvent.click(screen.getByRole("button", { name: /Receber/ }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Receber");
  });

  it("existe volta, e ela devolve a lista inteira", () => {
    // Procurar como voltar é onde a pessoa de galpão desiste e chama alguém.
    render(<OperacaoClient perms={TUDO} />);
    fireEvent.click(screen.getByRole("button", { name: /Dar baixa/ }));
    fireEvent.click(screen.getByRole("button", { name: /Todas as tarefas/ }));
    expect(screen.getByRole("button", { name: /Receber/ })).toBeTruthy();
    expect(screen.queryByText("painel de baixa")).toBeNull();
  });

  it("cada cartão abre O SEU painel — nada de um abrir o do vizinho", () => {
    const casos: [RegExp, string][] = [
      [/Consultar/, "painel de consulta"],
      [/Dar baixa/, "painel de baixa"],
      [/Entrada por leitura/, "painel de entrada"],
      [/Receber/, "painel de recebimento"],
      [/Impressoras/, "painel de impressoras"],
    ];
    for (const [botao, painel] of casos) {
      // Cinco renders num teste só: cada um é uma navegação nova, com URL limpa.
      window.history.replaceState(null, "", "/operacao");
      const { unmount } = render(<OperacaoClient perms={TUDO} />);
      fireEvent.click(screen.getByRole("button", { name: botao }));
      expect(screen.getByText(painel), painel).toBeTruthy();
      unmount();
    }
  });
});

describe("o caminho de volta pro Estoque completo", () => {
  it("existe sempre, inclusive com um painel aberto", () => {
    render(<OperacaoClient perms={TUDO} />);
    expect(screen.getByRole("link", { name: /Estoque completo/ }).getAttribute("href")).toBe("/estoque");
    fireEvent.click(screen.getByRole("button", { name: /Consultar/ }));
    expect(screen.getByRole("link", { name: /Estoque completo/ })).toBeTruthy();
  });
});

describe("a tarefa mora na URL", () => {
  it("abrir em /operacao?tarefa=consultar já cai na consulta — é a página inicial do galpão", () => {
    window.history.replaceState(null, "", "/operacao?tarefa=consultar");
    render(<OperacaoClient perms={TUDO} />);
    expect(screen.getByText("painel de consulta")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Consultar");
  });

  it("tarefa que a pessoa NÃO pode abrir pela URL é ignorada — não vira painel de 403", () => {
    window.history.replaceState(null, "", "/operacao?tarefa=receber");
    render(<OperacaoClient perms={{ ...TUDO, compras: false }} />);
    expect(screen.queryByText("painel de recebimento")).toBeNull();
    expect(screen.getByRole("button", { name: /Consultar/ })).toBeTruthy();
  });

  it("abrir um cartão escreve a tarefa na URL, e fechar a tira", () => {
    render(<OperacaoClient perms={TUDO} />);
    fireEvent.click(screen.getByRole("button", { name: /Dar baixa/ }));
    expect(new URLSearchParams(window.location.search).get("tarefa")).toBe("saida");
    fireEvent.click(screen.getByRole("button", { name: /Todas as tarefas/ }));
    expect(screen.queryByText("painel de baixa")).toBeNull();
  });

  it("o botão VOLTAR do navegador fecha a tarefa em vez de sair da tela", () => {
    render(<OperacaoClient perms={TUDO} />);
    fireEvent.click(screen.getByRole("button", { name: /Dar baixa/ }));
    // O que o navegador faz ao voltar: muda a URL e avisa por `popstate`.
    window.history.replaceState(null, "", "/operacao");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(screen.queryByText("painel de baixa")).toBeNull();
    expect(screen.getByRole("button", { name: /Receber/ })).toBeTruthy();
  });
});
