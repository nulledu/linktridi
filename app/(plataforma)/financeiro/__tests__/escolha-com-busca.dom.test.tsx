import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { Alternativas, Escolha } from "../ui";

/**
 * O seletor que se pesquisa.
 *
 * O `<select>` nativo faz bem uma coisa — escolher entre poucas opções — e
 * desmonta com muitas: "Relacionado a" já abre com dez fornecedores e vai
 * crescer. Sem busca, achar um nome ali é rolar procurando com o olho.
 *
 * jsdom não tem layout (o painel é portado e medido), então o que se prova
 * aqui é o COMPORTAMENTO: filtrar, escolher, navegar por teclado e limpar.
 */

const OPCOES = [
  { id: "1", nome: "Acrílicos", grupo: "Fornecedores" },
  { id: "2", nome: "Madeiranit Bauru", grupo: "Fornecedores" },
  { id: "3", nome: "Packit", grupo: "Fornecedores" },
  { id: "4", nome: "Ana Souza", detalhe: "Elétrica Rápida", grupo: "Pessoas" },
];

const abrir = (props: Partial<Parameters<typeof Escolha>[0]> = {}) => {
  const aoEscolher = vi.fn();
  // `busca` explícito: a lista de prova tem quatro itens, e o padrão só liga o
  // campo a partir de oito — abaixo disso ele é ruído (ver o teste do limiar).
  render(<Escolha valor="" opcoes={OPCOES} aoEscolher={aoEscolher} busca {...props} />);
  fireEvent.click(screen.getByRole("combobox"));
  return aoEscolher;
};

describe("Escolha — busca", () => {
  it("mostra tudo antes de digitar", () => {
    abrir();
    for (const o of OPCOES) expect(screen.getByText(o.nome)).toBeTruthy();
  });

  it("filtra enquanto digita", () => {
    abrir();
    fireEvent.change(screen.getByLabelText("Buscar na lista"), { target: { value: "packit" } });
    expect(screen.getByText("Packit")).toBeTruthy();
    expect(screen.queryByText("Acrílicos")).toBeNull();
  });

  it("acha sem acento — quem digita 'acrilicos' quer 'Acrílicos'", () => {
    abrir();
    fireEvent.change(screen.getByLabelText("Buscar na lista"), { target: { value: "acrilicos" } });
    expect(screen.getByText("Acrílicos")).toBeTruthy();
  });

  it("busca também no detalhe, não só no nome", () => {
    abrir();
    fireEvent.change(screen.getByLabelText("Buscar na lista"), { target: { value: "elétrica" } });
    expect(screen.getByText("Ana Souza")).toBeTruthy();
  });

  it("diz quando não achou, em vez de mostrar lista vazia", () => {
    abrir();
    fireEvent.change(screen.getByLabelText("Buscar na lista"), { target: { value: "zzz" } });
    expect(screen.getByText(/Nada com/)).toBeTruthy();
  });
});

describe("Escolha — escolher", () => {
  it("escolhe no pointerdown, não no clique", () => {
    // Esperar o `mouseup` para responder é a latência que faz a lista parecer
    // morta (Apple §1: feedback no press).
    const aoEscolher = abrir();
    fireEvent.pointerDown(screen.getByText("Packit"));
    expect(aoEscolher).toHaveBeenCalledWith("3");
  });

  it("a opção 'nenhuma' existe e limpa a escolha", () => {
    const aoEscolher = abrir({ valor: "3", vazio: "Sem relacionado" });
    const nenhuma = screen.getAllByRole("option")[0];
    expect(nenhuma.textContent).toContain("Sem relacionado");
    fireEvent.pointerDown(nenhuma);
    expect(aoEscolher).toHaveBeenCalledWith("");
  });

  it("o gatilho mostra o nome do que está escolhido", () => {
    render(<Escolha valor="2" opcoes={OPCOES} aoEscolher={() => {}} />);
    expect(screen.getByRole("combobox").textContent).toContain("Madeiranit Bauru");
  });

  it("marca qual está selecionada", () => {
    abrir({ valor: "2" });
    const marcada = screen.getAllByRole("option").filter((o) => o.getAttribute("aria-selected") === "true");
    expect(marcada).toHaveLength(1);
    expect(marcada[0].textContent).toContain("Madeiranit Bauru");
  });
});

describe("Escolha — teclado", () => {
  it("↓ e ↵ escolhem sem tocar no mouse", () => {
    const aoEscolher = abrir();
    const busca = screen.getByLabelText("Buscar na lista");
    fireEvent.keyDown(busca, { key: "ArrowDown" });   // sai do "nenhuma" para o 1º
    fireEvent.keyDown(busca, { key: "Enter" });
    expect(aoEscolher).toHaveBeenCalledWith("1");
  });

  it("↑ dá a volta para o fim da lista", () => {
    const aoEscolher = abrir();
    const busca = screen.getByLabelText("Buscar na lista");
    fireEvent.keyDown(busca, { key: "ArrowUp" });
    fireEvent.keyDown(busca, { key: "Enter" });
    expect(aoEscolher).toHaveBeenCalledWith("4");
  });

  it("Esc fecha sem escolher nada", () => {
    const aoEscolher = abrir();
    fireEvent.keyDown(screen.getByLabelText("Buscar na lista"), { key: "Escape" });
    expect(aoEscolher).not.toHaveBeenCalled();
  });
});

describe("Escolha — acessibilidade", () => {
  it("é um combobox de verdade para quem usa leitor de tela", () => {
    render(<Escolha valor="" opcoes={OPCOES} aoEscolher={() => {}} />);
    const g = screen.getByRole("combobox");
    expect(g.getAttribute("aria-haspopup")).toBe("listbox");
    expect(g.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(g);
    expect(g.getAttribute("aria-expanded")).toBe("true");
  });

  it("desabilitado não abre", () => {
    render(<Escolha valor="" opcoes={OPCOES} aoEscolher={() => {}} disabled />);
    const g = screen.getByRole("combobox");
    fireEvent.click(g);
    expect(screen.queryByLabelText("Buscar na lista")).toBeNull();
  });
});

describe("Escolha — a busca aparece quando se paga", () => {
  const muitas = Array.from({ length: 9 }, (_, i) => ({ id: String(i), nome: `Opção ${i}` }));

  it("lista curta abre SEM campo de busca", () => {
    // Quatro linhas cabem na tela: um campo de texto entre o clique e a
    // escolha só atrasa.
    render(<Escolha valor="" opcoes={OPCOES} aoEscolher={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.queryByLabelText("Buscar na lista")).toBeNull();
  });

  it("lista longa abre COM busca, sem ninguém pedir", () => {
    render(<Escolha valor="" opcoes={muitas} aoEscolher={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByLabelText("Buscar na lista")).toBeTruthy();
  });

  it("dá para mandar nos dois sentidos", () => {
    const { unmount } = render(<Escolha valor="" opcoes={muitas} aoEscolher={() => {}} busca={false} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.queryByLabelText("Buscar na lista")).toBeNull();
    unmount();

    render(<Escolha valor="" opcoes={OPCOES} aoEscolher={() => {}} busca />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByLabelText("Buscar na lista")).toBeTruthy();
  });

  it("o teclado funciona sem o campo de busca", () => {
    // Sem input, o foco vai para o painel — e ↓ ↵ precisam continuar valendo.
    const aoEscolher = vi.fn();
    render(<Escolha valor="" opcoes={OPCOES} aoEscolher={aoEscolher} />);
    fireEvent.click(screen.getByRole("combobox"));
    const painel = screen.getAllByRole("option")[0].closest("[tabindex]")!;
    fireEvent.keyDown(painel, { key: "ArrowDown" });
    fireEvent.keyDown(painel, { key: "Enter" });
    expect(aoEscolher).toHaveBeenCalledWith("1");
  });
});

describe("Escolha — campo obrigatório", () => {
  it("`semVazio` tira a opção 'nenhuma'", () => {
    // Oferecer "sem seleção" onde o campo não aceita vazio mostra um caminho
    // que não existe.
    render(<Escolha valor="1" opcoes={OPCOES} aoEscolher={() => {}} semVazio />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getAllByRole("option")).toHaveLength(OPCOES.length);
  });

  it("sem `semVazio`, ela continua existindo e é a primeira", () => {
    render(<Escolha valor="1" opcoes={OPCOES} aoEscolher={() => {}} vazio="Sem nada" />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getAllByRole("option")[0].textContent).toContain("Sem nada");
  });
});

describe("Escolha — criar o que não existe", () => {
  const abrirComCriar = (aoCriar: (nome: string) => Promise<string | null> = vi.fn(async () => "novo-1")) => {
    const aoEscolher = vi.fn();
    render(<Escolha valor="" opcoes={OPCOES} aoEscolher={aoEscolher} aoCriar={aoCriar} rotuloCriar="Criar contato" />);
    fireEvent.click(screen.getByRole("combobox"));
    return { aoEscolher, aoCriar };
  };

  const buscar = (t: string) =>
    fireEvent.change(screen.getByLabelText("Buscar na lista"), { target: { value: t } });

  it("com criação, a busca aparece mesmo em lista curta", () => {
    // É ela que dá o NOME do novo cadastro — sem busca não há o que criar.
    abrirComCriar();
    expect(screen.getByLabelText("Buscar na lista")).toBeTruthy();
  });

  it("oferece criar quando a busca não acha nada", () => {
    abrirComCriar();
    buscar("Serralheria do Zé");
    expect(screen.getByText(/Criar contato .Serralheria do Zé./)).toBeTruthy();
  });

  it("NÃO oferece criar quando achou — escolher vem antes de duplicar", () => {
    abrirComCriar();
    buscar("Packit");
    expect(screen.queryByText(/Criar contato/)).toBeNull();
  });

  it("nem com a busca vazia — não dá para criar um sem nome", () => {
    abrirComCriar();
    expect(screen.queryByText(/Criar contato/)).toBeNull();
  });

  it("criar já ESCOLHE o que foi criado", () => {
    // Criar e ter de procurar na lista de novo seria metade do caminho.
    const { aoEscolher, aoCriar } = abrirComCriar();
    buscar("Nova Empresa");
    fireEvent.pointerDown(screen.getByText(/Criar contato/));
    return Promise.resolve().then(() => {
      expect(aoCriar).toHaveBeenCalledWith("Nova Empresa");
      expect(aoEscolher).toHaveBeenCalledWith("novo-1");
    });
  });

  it("Enter cria quando não há o que escolher", () => {
    const { aoCriar } = abrirComCriar();
    buscar("Outra Nova");
    fireEvent.keyDown(screen.getByLabelText("Buscar na lista"), { key: "Enter" });
    expect(aoCriar).toHaveBeenCalledWith("Outra Nova");
  });

  it("falhando ao criar, a folha não fecha e nada é escolhido", () => {
    const falha: (nome: string) => Promise<string | null> = vi.fn(async () => null);
    const { aoEscolher } = abrirComCriar(falha);
    buscar("Vai falhar");
    fireEvent.pointerDown(screen.getByText(/Criar contato/));
    return Promise.resolve().then(() => {
      expect(aoEscolher).not.toHaveBeenCalled();
    });
  });

  it("sem `aoCriar`, nada muda", () => {
    render(<Escolha valor="" opcoes={OPCOES} aoEscolher={() => {}} busca />);
    fireEvent.click(screen.getByRole("combobox"));
    buscar("zzz");
    expect(screen.queryByText(/Criar/)).toBeNull();
    expect(screen.getByText(/Nada com/)).toBeTruthy();
  });
});

describe("Compromissos — o relacionado saiu de dentro de 'Mais detalhes'", () => {
  const tela = readFileSync(
    join(process.cwd(), "app/(plataforma)/financeiro/compromissos/CompromissosClient.tsx"), "utf8");

  it("o campo está no corpo principal, não na seção recolhida", () => {
    // Para quem se paga não é detalhe: era preciso descobrir uma seção
    // fechada para vincular o aluguel ao locador.
    const secao = tela.indexOf('titulo="Mais detalhes"');
    expect(tela.indexOf('label="Relacionado a"')).toBeLessThan(secao);
  });

  it("o resumo da seção não promete mais o que não está lá", () => {
    expect(tela).toContain('resumo="Situação e observação"');
  });

  it("dá para criar o contato sem sair do lançamento", () => {
    expect(tela).toContain("aoCriar={criarContato}");
    expect(tela).toContain('papeis: ["contato"]');
  });
});

describe("Alternativas — vocabulário curto e fixo", () => {
  const OPCOES = [
    { id: "1" as const, label: "Ativo" },
    { id: "0" as const, label: "Inativo" },
  ];

  it("mostra TODAS as opções de uma vez — sem abrir nada", () => {
    // Duas palavras cabem lado a lado. Escondê-las atrás de um clique (ou pior,
    // de uma folha com busca) é gastar dois gestos para escolher entre duas
    // coisas.
    render(<Alternativas valor="1" opcoes={OPCOES} aoEscolher={() => {}} />);
    expect(screen.getByText("Ativo")).toBeTruthy();
    expect(screen.getByText("Inativo")).toBeTruthy();
  });

  it("escolhe no pointerdown, não no clique", () => {
    const aoEscolher = vi.fn();
    render(<Alternativas valor="1" opcoes={OPCOES} aoEscolher={aoEscolher} />);
    fireEvent.pointerDown(screen.getByText("Inativo"));
    expect(aoEscolher).toHaveBeenCalledWith("0");
  });

  it("diz qual está escolhida para o leitor de tela", () => {
    render(<Alternativas valor="0" opcoes={OPCOES} aoEscolher={() => {}} />);
    const marcados = screen.getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true");
    expect(marcados).toHaveLength(1);
    expect(marcados[0].textContent).toContain("Inativo");
  });

  it("é um grupo de rádio, não um `<label>` envolvendo botões", () => {
    // Rótulo que envolve grupo de botões dispara o PRIMEIRO ao ser clicado, e
    // a escolha muda sozinha. Já custou caro neste repositório.
    const { container } = render(<Alternativas valor="1" opcoes={OPCOES} aoEscolher={() => {}} />);
    expect(container.querySelector('[role="radiogroup"]')).toBeTruthy();
    expect(container.querySelector("label")).toBeNull();
  });
});

describe("O controle certo para cada tamanho de lista", () => {
  const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it.each([
    ["cadastros/contatos/ContatosClient.tsx", 3],
    ["cadastros/fornecedores/FornecedoresClient.tsx", 1],
    ["configuracoes/ConfiguracoesClient.tsx", 1],
  ])("%s usa o segmentado onde há duas opções", (tela, minimo) => {
    const s = ler(`app/(plataforma)/financeiro/${tela}`);
    expect((s.match(/<Alternativas/g) ?? []).length).toBeGreaterThanOrEqual(minimo);
  });

  it("criar contato inline existe nas DUAS telas que vinculam", () => {
    // Estava só em Compromissos; Recorrências vincula do mesmo jeito e ficava
    // sem o atalho.
    for (const t of ["compromissos/CompromissosClient.tsx", "cadastros/recorrencias/RecorrenciasClient.tsx"]) {
      expect(ler(`app/(plataforma)/financeiro/${t}`), t).toContain("aoCriar={criarContato}");
    }
  });
});
