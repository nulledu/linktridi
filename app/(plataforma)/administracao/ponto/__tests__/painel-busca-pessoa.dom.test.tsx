import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PainelGeral } from "../PainelGeral";
import type { StatusPessoa } from "@/lib/ponto";

/**
 * Buscar pessoa no painel do ponto.
 *
 * A lista mostra a equipe INTEIRA de cara: não há mais o corte em 12 nem o
 * botão "Ver as 24 pessoas" — a lista rola dentro do cartão, então esconder
 * metade do time cobrava um clique sem economizar espaço nenhum. A busca
 * continua sendo o atalho de quem já sabe o nome.
 *
 * jsdom não tem layout — estes testes checam COMPORTAMENTO (quem aparece,
 * quem some), nunca geometria.
 */
const pessoa = (nome: string, i: number): StatusPessoa => ({
  id: `p${i}`, nome, fotoUrl: null,
  situacao: "presente", entrada: "2026-08-10T11:00:00.000Z", ultima: null, ultimoTipo: null,
  entradaPrevista: "08:00", saidaPrevista: "23:59", batidas: 1, expediente: true,
});

// 14 pessoas: mais que o antigo corte de 12, que é o número que este arquivo
// vigia pra ele não voltar. "Léo" e "Leandro" separam acento de prefixo.
const NOMES = [
  "Léo Silva", "Leandro Costa", "Ana Julia", "Beatriz Loureiro", "Bruno Alves",
  "Caio Souza", "Davi Rocha", "Emanuelly Dias", "Felipe Nunes", "Gabriel Suzuki",
  "Gustavo Paulino", "Helena Braga", "Igor Ramos", "Vinicius Prado",
];

const pessoas = NOMES.map(pessoa);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const u = String(url);
    if (u.startsWith("/api/ponto/status")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({
        pessoas, resumo: { total: pessoas.length, presentes: pessoas.length, almoco: 0, ausentes: 0, saiu: 0 },
      }) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ pessoas: [] }) } as Response);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const painel = () => render(<PainelGeral pessoas={[]} podeGerir={false} onMudouCadastro={() => {}} />);
const buscar = async (texto: string) => {
  const campo = await screen.findByPlaceholderText("Buscar pessoa…");
  fireEvent.change(campo, { target: { value: texto } });
  return campo;
};

describe("painel do ponto · buscar pessoa", () => {
  it("sem busca, a equipe inteira já está na lista", async () => {
    painel();
    await screen.findByText("Ana Julia");
    // A 14ª pessoa (depois do antigo corte de 12) aparece sem clique nenhum…
    expect(screen.getByText("Vinicius Prado")).toBeInTheDocument();
    // …e o botão que cobrava esse clique não existe mais.
    expect(screen.queryByText(/Ver as \d+ pessoas/)).not.toBeInTheDocument();
  });

  it("digitar o nome traz quem casa e tira o resto", async () => {
    painel();
    await buscar("beatriz");
    await waitFor(() => expect(screen.queryByText("Ana Julia")).not.toBeInTheDocument());
    expect(screen.getByText("Beatriz Loureiro")).toBeInTheDocument();
  });

  it("a busca deixa só quem casa, inclusive a última da lista", async () => {
    painel();
    await buscar("vinicius");
    expect(await screen.findByText("Vinicius Prado")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Ana Julia")).not.toBeInTheDocument());
  });

  it("busca sem acento acha o nome com acento", async () => {
    painel();
    await buscar("leo");
    expect(await screen.findByText("Léo Silva")).toBeInTheDocument();
    // "Leandro" não casa com "leo" — o filtro é substring, não iniciais.
    expect(screen.queryByText("Leandro Costa")).not.toBeInTheDocument();
  });

  it("nome que não existe diz que não existe, com o termo digitado", async () => {
    painel();
    await buscar("zzz");
    expect(await screen.findByText("Ninguém com “zzz”.")).toBeInTheDocument();
  });

  it("limpar a busca devolve a lista inteira", async () => {
    painel();
    await buscar("beatriz");
    await waitFor(() => expect(screen.queryByText("Ana Julia")).not.toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Limpar busca"));
    expect(await screen.findByText("Ana Julia")).toBeInTheDocument();
  });

  it("os KPIs continuam contando o dia inteiro, não o resultado da busca", async () => {
    painel();
    await buscar("beatriz");
    // "Presentes" continua 14: filtrar a lista não muda o que aconteceu no dia.
    const sub = await screen.findByText(`de ${pessoas.length} no ponto`);
    // Escopo no CARTÃO, e não na tela: desde que a fileira de filtros ganhou a
    // contagem de cada aba, "14" também é o número da aba "Todos" — o que está
    // certo (ela conta o que existe, não o que a busca deixou) mas torna uma
    // busca solta por "14" ambígua.
    expect(sub.previousElementSibling?.textContent).toBe(String(pessoas.length));
  });
});
