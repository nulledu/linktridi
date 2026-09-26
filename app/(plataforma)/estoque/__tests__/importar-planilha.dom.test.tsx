import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ImportarPlanilha } from "../ImportarPlanilha";
import { CatalogoClient } from "../CatalogoClient";
import { lerPlanilha, planejarImportacao } from "@/lib/estoque-importacao";

// A promessa desta tela é uma só: NINGUÉM aperta um botão que escreve em 93
// itens sem ver a lista antes. Os testes daqui travam essa ordem — conferir,
// ver, e só então gravar — e a volta pro catálogo, porque item importado nasce
// sem hierarquia e some da tela se ninguém for levado até ele.
//
// Sem geometria: jsdom não tem motor de layout. Celular se confere no navegador
// (/dev-mobile?ws=estoque).

const CATALOGO = [
  { id: "k", nome: "Rolo Kraft", serializado: false, quantidade: 0, qtd_minima: 0, unidade: "rl", fornecedor_id: null },
  { id: "s", nome: "Chapa MDF", serializado: true, quantidade: 312, qtd_minima: 0, unidade: "un", fornecedor_id: null },
];

const TEXTO = [
  "Item\tEstoque\tMínimo",
  "ROLO  KRAFT\t229\t50",   // já existe (escrito diferente) → atualiza
  "Chapa MDF\t400\t",       // serializado → pulado
  "Pallet PBR\t8\t2",       // novo
].join("\n");

/** O servidor de mentira usa a MESMA regra pura da rota — testar a tela contra
 *  um plano inventado à mão provaria só que o componente desenha o que
 *  recebeu, não que a promessa ("mostra o que vai fazer") se cumpre. */
function servidor() {
  return vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("/api/estoque/importar")) {
      const corpo = JSON.parse(String(init?.body ?? "{}"));
      const { linhas } = lerPlanilha(String(corpo.texto ?? ""));
      const plano = planejarImportacao({ linhas, itens: CATALOGO });
      const base = { ok: true, plano, leitura: { comCabecalho: true, colunas: { nome: 0, quantidade: 1, qtd_minima: 2 }, separador: "\t", linhas: linhas.length } };
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(corpo.confirmar
          ? { ...base, aplicado: true, criados: plano.novos.length, atualizados: plano.atualizados.length, fornecedoresCriados: 0, pulados: plano.pulados.length, falhas: [] }
          : { ...base, aplicado: false }),
      } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ itens: [], podeGerir: true, podeCadastrar: true, podeAjustar: true, podeVerCusto: false }) } as Response);
  });
}

let fetchSpy: ReturnType<typeof servidor>;
beforeEach(() => {
  localStorage.clear();
  fetchSpy = servidor();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const colar = (texto: string) =>
  fireEvent.change(screen.getByLabelText(/cole aqui/i), { target: { value: texto } });

const chamadas = () => fetchSpy.mock.calls.filter((c) => String(c[0]).startsWith("/api/estoque/importar"));
const corposEnviados = () => chamadas().map((c) => JSON.parse(String((c[1] as RequestInit).body)));

describe("Importar planilha — mostra antes de fazer", () => {
  it("conferir não escreve nada: o pedido vai SEM confirmar", async () => {
    render(<ImportarPlanilha onFechar={() => {}} onPronto={() => {}} />);
    colar(TEXTO);
    fireEvent.click(screen.getByRole("button", { name: /Conferir o que vai acontecer/ }));

    await screen.findByText(/Vão ser criados/);
    expect(corposEnviados()).toHaveLength(1);
    expect(corposEnviados()[0].confirmar).toBeUndefined();
  });

  it("diz o que muda em cada item que já existe — estoque 0 → 229", async () => {
    render(<ImportarPlanilha onFechar={() => {}} onPronto={() => {}} />);
    colar(TEXTO);
    fireEvent.click(screen.getByRole("button", { name: /Conferir o que vai acontecer/ }));

    // O item casou apesar do espaço duplo e da caixa: aparece como atualização,
    // não como item novo. E a frase é a diferença, não só o valor final — é ela
    // que deixa alguém dizer "esse 229 está errado" ANTES de virar banco.
    await screen.findByText(/Vão mudar/);
    const cartao = screen.getByText("Rolo Kraft").parentElement!;
    expect(cartao.textContent).toContain("estoque 0 → 229");
    expect(cartao.textContent).toContain("ponto de reposição 0 → 50");
  });

  it("item contado por etiqueta aparece como pulado, com os dois números", async () => {
    render(<ImportarPlanilha onFechar={() => {}} onPronto={() => {}} />);
    colar(TEXTO);
    fireEvent.click(screen.getByRole("button", { name: /Conferir o que vai acontecer/ }));

    await screen.findByText(/Estoque não será tocado/);
    expect(screen.getByText(/planilha diz 400 · sistema conta 312/)).toBeTruthy();
  });

  it("o item novo é anunciado como SEM hierarquia", async () => {
    render(<ImportarPlanilha onFechar={() => {}} onPronto={() => {}} />);
    colar(TEXTO);
    fireEvent.click(screen.getByRole("button", { name: /Conferir o que vai acontecer/ }));

    await screen.findByText("Pallet PBR");
    expect(screen.getByText(/sem hierarquia/)).toBeTruthy();
  });

  it("o botão de gravar só existe depois de conferir, e diz quantos", async () => {
    render(<ImportarPlanilha onFechar={() => {}} onPronto={() => {}} />);
    colar(TEXTO);
    expect(screen.queryByRole("button", { name: /Criar 1 e atualizar 1/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Conferir o que vai acontecer/ }));
    expect(await screen.findByRole("button", { name: /Criar 1 e atualizar 1/ })).toBeTruthy();
  });

  it("dá pra voltar e mexer na lista — e aí o botão de gravar some", async () => {
    // Enquanto o plano está na tela o texto nem aparece: não existe confirmar
    // uma lista diferente da que foi conferida. Voltar é o caminho, e ele
    // devolve o texto intacto (recolar 93 linhas seria motivo pra desistir).
    render(<ImportarPlanilha onFechar={() => {}} onPronto={() => {}} />);
    colar(TEXTO);
    fireEvent.click(screen.getByRole("button", { name: /Conferir o que vai acontecer/ }));
    await screen.findByRole("button", { name: /Criar 1 e atualizar 1/ });
    expect(screen.queryByLabelText(/cole aqui/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));

    expect(screen.queryByRole("button", { name: /Criar 1 e atualizar 1/ })).toBeNull();
    expect((screen.getByLabelText(/cole aqui/i) as HTMLTextAreaElement).value).toBe(TEXTO);
  });
});

describe("Importar planilha — grava e diz o que fez", () => {
  it("confirmar manda o MESMO texto, agora com confirmar", async () => {
    render(<ImportarPlanilha onFechar={() => {}} onPronto={() => {}} />);
    colar(TEXTO);
    fireEvent.click(screen.getByRole("button", { name: /Conferir o que vai acontecer/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Criar 1 e atualizar 1/ }));

    await waitFor(() => expect(corposEnviados()).toHaveLength(2));
    // Mesmo texto nas duas: é o servidor que recalcula o plano na hora de
    // gravar. Devolver o plano que a tela mostrou seria escrever sem conferir.
    expect(corposEnviados()[1]).toEqual({ texto: TEXTO, confirmar: true });
  });

  it("o resultado conta o que foi feito, inclusive o estoque preservado", async () => {
    render(<ImportarPlanilha onFechar={() => {}} onPronto={() => {}} />);
    colar(TEXTO);
    fireEvent.click(screen.getByRole("button", { name: /Conferir o que vai acontecer/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Criar 1 e atualizar 1/ }));

    expect(await screen.findByText(/1 item criado/)).toBeTruthy();
    expect(screen.getByText(/1 item teve o estoque preservado/)).toBeTruthy();
    expect(screen.getByText(/Não classificados/)).toBeTruthy();
  });

  it("nada a gravar não vira botão de gravar", async () => {
    render(<ImportarPlanilha onFechar={() => {}} onPronto={() => {}} />);
    colar("Item\tEstoque\nRolo Kraft\t0\n"); // igualzinho ao que já está lá
    fireEvent.click(screen.getByRole("button", { name: /Conferir o que vai acontecer/ }));

    const botao = await screen.findByRole("button", { name: /Nada a gravar/ });
    expect(botao).toBeDisabled();
  });
});

describe("Catálogo — a importação tem porta, e ela devolve os itens", () => {
  it("o botão Importar abre a tela", async () => {
    render(<CatalogoClient />);
    fireEvent.click(await screen.findByRole("button", { name: /Importar/ }));
    expect(await screen.findByRole("dialog", { name: /Importar planilha/ })).toBeTruthy();
  });

  it("terminada a importação, o catálogo cai na aba dos não classificados", async () => {
    localStorage.setItem("estoque.hierarquia", "peca");
    render(<CatalogoClient />);
    fireEvent.click(await screen.findByRole("button", { name: /Importar/ }));

    const painel = await screen.findByRole("dialog");
    fireEvent.change(within(painel).getByLabelText(/cole aqui/i), { target: { value: TEXTO } });
    fireEvent.click(within(painel).getByRole("button", { name: /Conferir o que vai acontecer/ }));
    fireEvent.click(await within(painel).findByRole("button", { name: /Criar 1 e atualizar 1/ }));

    // Item importado nasce sem hierarquia: ficar na aba de antes o esconderia.
    await waitFor(() => expect(localStorage.getItem("estoque.hierarquia")).toContain("sem_hierarquia"));
  });
});
