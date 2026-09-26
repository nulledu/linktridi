import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GuardarNoLugar } from "../GuardarNoLugar";
import type { Item } from "../tipos";

/**
 * Guardar produto numa prateleira, e tirar de lá.
 *
 * O que se trava aqui é o contrato que protege o ENDEREÇO — a informação que
 * erra sem dar sinal, porque saldo, contagem e histórico continuam certos
 * enquanto só o "onde" passou a mentir.
 *
 * jsdom não tem layout: geometria e alvo de toque se conferem no navegador.
 */

function item(x: Partial<Item> & { id: string; nome: string }): Item {
  return {
    hierarquia: "produto", produzido: false, serializado: false, categoria: null,
    imagem_url: null, unidade: "un", quantidade: 0, qtd_minima: 0, ativo: true,
    ...x,
  } as Item;
}

const RUA = { id: "L1", nome: "Rua A · Nível 1", codigo: "RUA-A-01" };
const OUTRA = { id: "L2", nome: "Rua B", codigo: "RUA-B" };
const LOCAIS = [RUA, OUTRA];

const DENTRO = [item({ id: "i1", nome: "Almofada 11", sku: "PRD-0001", quantidade: 4, local_id: "L1" })];
const CATALOGO = [
  ...DENTRO,
  item({ id: "i2", nome: "Alavanca", sku: "PRD-0007", quantidade: 30 }),
  item({ id: "i3", nome: "Fita crepe", sku: "PRD-0020" }),
  item({ id: "i4", nome: "Tinta preta", sku: "PRD-0021", local_id: "L2" }),
  item({ id: "i5", nome: "Item inativo", sku: "PRD-0099", ativo: false }),
];

function rede(corpo: Record<string, unknown> = { ok: true, movidos: 1 }, status = 200) {
  return vi.fn(() => Promise.resolve({
    ok: status < 400, status, json: () => Promise.resolve(corpo),
  } as Response));
}

function corpoEnviado() {
  const chamadas = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
  const post = chamadas.find(([, i]) => i?.method === "POST");
  return post ? JSON.parse(String(post[1]!.body)) : null;
}

beforeEach(() => { vi.stubGlobal("fetch", rede()); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function montar(extra: Partial<React.ComponentProps<typeof GuardarNoLugar>> = {}) {
  return render(
    <GuardarNoLugar
      local={RUA} dentro={DENTRO} catalogo={CATALOGO} locais={LOCAIS}
      podeMover aoMudar={() => {}} {...extra}
    />,
  );
}

describe("sem a permissão, a tela mostra mas não deixa mexer", () => {
  it("some a busca e DIZ qual permissão pedir", () => {
    montar({ podeMover: false });
    expect(screen.getByText("Almofada 11")).toBeTruthy();       // continua vendo
    expect(screen.queryByLabelText(/Buscar produto/)).toBeNull(); // não move
    expect(document.body.textContent).toMatch(/estoque:cadastrar/);
  });
});

describe("o que já mora aqui", () => {
  it("lista o que está guardado, com saldo", () => {
    montar();
    expect(document.body.textContent).toMatch(/GUARDADO AQUI \(1\)/);
    expect(document.body.textContent).toMatch(/4 un/);
  });

  it("tirar um manda localId NULO — o item perde o lugar, não some do catálogo", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Tirar Almofada 11 daqui/ }));
    await waitFor(() => {
      const corpo = corpoEnviado();
      expect(corpo.localId).toBeNull();
      expect(corpo.itemIds).toEqual(["i1"]);
    });
  });

  it("tirar manda DE ONDE — sem isso um retrato velho apaga o lugar novo", async () => {
    // A tela do galpão fica aberta o dia inteiro e não tem poll. Se outra
    // pessoa moveu o item pra C-03 enquanto isto estava aberto, tocar no "×"
    // aqui apagaria C-03 — o endereço verdadeiro — achando que tira de RUA-A-01.
    // Com `deOnde` o banco só apaga o que AINDA está onde a tela dizia.
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Tirar Almofada 11 daqui/ }));
    await waitFor(() => expect(corpoEnviado().deOnde).toBe("L1"));
  });

  it("GUARDAR não manda `deOnde` — a peça na mão ganha de qualquer retrato", async () => {
    // Guardar é afirmação sobre o DESTINO ("isto passa a morar aqui") e vale
    // mesmo que o item tenha mudado de lugar no meio. Travar aqui faria o
    // gesto de quem está com a caixa na mão falhar por causa de tela velha.
    montar();
    fireEvent.change(screen.getByLabelText(/Buscar produto/), { target: { value: "alavanca" } });
    fireEvent.click(screen.getByRole("button", { name: /Alavanca/ }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar 1 produto/ }));
    await waitFor(() => {
      const corpo = corpoEnviado();
      expect(corpo.localId).toBe("L1");
      expect(corpo.deOnde).toBeUndefined();
    });
  });

  it("o AVISO do servidor vence a frase otimista da tela", async () => {
    // O servidor sabe quantos de fato mudaram; a tela só sabe quantos pediu.
    // Dizer "saiu" quando nada saiu é a mentira que faz a pessoa ir procurar
    // na prateleira errada.
    vi.stubGlobal("fetch", rede({
      ok: true, movidos: 0,
      aviso: "Nada mudou: estes produtos já não estavam mais aqui — alguém os moveu enquanto esta tela estava aberta.",
    }));
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Tirar Almofada 11 daqui/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/já não estavam mais aqui/));
  });

  it("“Tirar todos” só existe com mais de um — pra um item o botão de linha basta", () => {
    montar();
    expect(screen.queryByRole("button", { name: /Tirar todos/ })).toBeNull();
    const dois = [...DENTRO, item({ id: "i9", nome: "Outro", local_id: "L1" })];
    montar({ dentro: dois });
    expect(screen.getAllByRole("button", { name: /Tirar todos/ }).length).toBeGreaterThan(0);
  });
});

describe("guardar mais aqui", () => {
  it("a lista NÃO começa com o catálogo inteiro — 244 linhas é rolagem, não escolha", () => {
    // O catálogo real tem 244 itens. Sem teto, abrir a prateleira despejaria
    // todos eles no painel do celular antes de qualquer busca.
    const grande = Array.from({ length: 244 }, (_, i) => item({ id: `g${i}`, nome: `Produto ${i}`, sku: `PRD-${i}` }));
    montar({ catalogo: [...DENTRO, ...grande] });
    const marcaveis = screen.getAllByRole("button", { name: /^Produto \d/ });
    expect(marcaveis.length).toBeLessThanOrEqual(8);
    expect(document.body.textContent).toMatch(/Mostrando os primeiros/);
  });

  it("o que JÁ está aqui não aparece como candidato", () => {
    montar();
    // "Almofada 11" aparece uma vez só (na lista de dentro), nunca como opção
    // de guardar — oferecer mover pra onde já está é ruído.
    expect(screen.getAllByText(/Almofada 11/)).toHaveLength(1);
  });

  it("item INATIVO fica fora: ninguém guarda na prateleira o que saiu do catálogo", () => {
    montar();
    fireEvent.change(screen.getByLabelText(/Buscar produto/), { target: { value: "inativo" } });
    expect(screen.queryByText(/Item inativo/)).toBeNull();
  });

  it("busca por nome e por SKU", () => {
    montar();
    const campo = screen.getByLabelText(/Buscar produto/);
    fireEvent.change(campo, { target: { value: "alavanca" } });
    expect(screen.getByText(/Alavanca/)).toBeTruthy();
    fireEvent.change(campo, { target: { value: "PRD-0020" } });
    expect(screen.getByText(/Fita crepe/)).toBeTruthy();
  });

  it("item que mora em OUTRA prateleira avisa DE ONDE sai", async () => {
    // Sem isto, mover é uma mudança silenciosa: some de lá e quem trabalha
    // naquele corredor não fica sabendo.
    montar();
    fireEvent.change(screen.getByLabelText(/Buscar produto/), { target: { value: "tinta" } });
    expect(document.body.textContent).toMatch(/sai de RUA-B/);
  });

  it("o botão DIZ o que vai fazer, e nasce desligado", () => {
    montar();
    const botao = screen.getByRole("button", { name: /Escolha o que guardar aqui/ });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
  });

  it("marcar dois e confirmar manda os DOIS ids pro lugar certo", async () => {
    montar();
    fireEvent.change(screen.getByLabelText(/Buscar produto/), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: /Alavanca/ }));
    fireEvent.click(screen.getByRole("button", { name: /Fita crepe/ }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar 2 produtos em RUA-A-01/ }));
    await waitFor(() => {
      const corpo = corpoEnviado();
      expect(corpo.localId).toBe("L1");
      expect([...corpo.itemIds].sort()).toEqual(["i2", "i3"]);
    });
  });

  it("marcar e desmarcar volta ao estado de origem", () => {
    montar();
    fireEvent.change(screen.getByLabelText(/Buscar produto/), { target: { value: "alavanca" } });
    const linha = screen.getByRole("button", { name: /Alavanca/ });
    fireEvent.click(linha);
    expect(linha.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(linha);
    expect(linha.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /Escolha o que guardar aqui/ })).toBeTruthy();
  });
});

describe("quando o servidor recusa", () => {
  it("a frase DELE aparece, e a seleção não some", async () => {
    vi.stubGlobal("fetch", rede({ error: "forbidden", detalhe: "Mexer no lugar dos produtos pede a permissão “Cadastrar e apagar item”." }, 403));
    montar();
    fireEvent.change(screen.getByLabelText(/Buscar produto/), { target: { value: "alavanca" } });
    fireEvent.click(screen.getByRole("button", { name: /Alavanca/ }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar 1 produto/ }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toMatch(/Cadastrar e apagar item/);
      // A seleção sobrevive: refazer sete marcações depois de um 403 é onde a
      // pessoa desiste.
      expect(screen.getByRole("button", { name: /Guardar 1 produto/ })).toBeTruthy();
    });
  });

  it("rede caída não mente que moveu", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Tirar Almofada 11 daqui/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Nada foi movido/));
  });
});
