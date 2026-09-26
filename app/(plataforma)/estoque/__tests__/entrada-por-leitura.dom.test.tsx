import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EntradaPorLeitura } from "../EntradaPorLeitura";

/**
 * Bipar produto pro estoque, no computador e no celular.
 *
 * "Lendo o código com a própria câmera do celular e no PC caso tenha algum
 * bipador conectado." As duas vias já existiam na SAÍDA; este painel é a
 * entrada pelas mesmas.
 *
 * O que se trava aqui é o que quebra em uso, não o desenho:
 *  · pistola é TECLADO — o campo precisa aceitar Enter sem ninguém clicar antes;
 *  · código repetido SOMA, senão vinte almofadas viram vinte linhas iguais;
 *  · sem motivo não grava, porque "entrou" sem de-onde-veio não fecha conta;
 *  · quem falhou FICA na fila, senão a pessoa bipa de novo o que já entrou.
 *
 * jsdom não tem layout nem câmera: geometria e vídeo se conferem no navegador.
 */

function rede(resposta: Record<string, unknown> = { ok: true, saldo: 20, frase: "+2 Almofada · agora 20 un" }, status = 200) {
  return vi.fn(() => Promise.resolve({
    ok: status < 400, status, json: () => Promise.resolve(resposta),
  } as Response));
}

beforeEach(() => { vi.stubGlobal("fetch", rede()); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** O que a pistola faz: digita no campo focado e manda Enter. */
function bipar(codigo: string) {
  const campo = screen.getByPlaceholderText(/Bipe com o leitor/i);
  fireEvent.change(campo, { target: { value: codigo } });
  fireEvent.keyDown(campo, { key: "Enter" });
}

describe("entrada por leitura", () => {
  it("sem permissão, diz QUAL pedir e não oferece campo nenhum", () => {
    render(<EntradaPorLeitura podeAjustar={false} />);
    expect(document.body.textContent).toMatch(/Ajustar quantidade/);
    expect(screen.queryByPlaceholderText(/Bipe com o leitor/i)).toBeNull();
  });

  it("o campo da pistola aceita Enter — sem clicar em nada antes", () => {
    // A pistola escreve no campo FOCADO e manda Enter. Se fosse preciso clicar
    // primeiro, quem chega com o leitor na mão bipa no vazio.
    render(<EntradaPorLeitura podeAjustar />);
    bipar("PRD-0001");
    expect(screen.getByText("PRD-0001")).toBeTruthy();
    expect(document.body.textContent).toMatch(/1 peça/);
  });

  it("bipar o MESMO código soma, em vez de virar linha nova", () => {
    // Vinte almofadas têm o mesmo código: vinte linhas iguais na tela seriam
    // ilegíveis, e ninguém conferiria antes de confirmar.
    render(<EntradaPorLeitura podeAjustar />);
    bipar("PRD-0001"); bipar("PRD-0001"); bipar("PRD-0001");
    expect(screen.getAllByText("PRD-0001")).toHaveLength(1);
    expect(document.body.textContent).toMatch(/3 peças/);
  });

  it("códigos diferentes viram linhas diferentes", () => {
    render(<EntradaPorLeitura podeAjustar />);
    bipar("PRD-0001"); bipar("PRD-0002");
    expect(screen.getByText("PRD-0001")).toBeTruthy();
    expect(screen.getByText("PRD-0002")).toBeTruthy();
  });

  it("sem motivo não grava, e o botão DIZ o que falta", () => {
    render(<EntradaPorLeitura podeAjustar />);
    bipar("PRD-0001");
    const botao = screen.getByRole("button", { name: /Diga de onde veio/i });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
  });

  it("com motivo escolhido, confirma e manda o CÓDIGO (não um id)", async () => {
    render(<EntradaPorLeitura podeAjustar />);
    bipar("PRD-0001"); bipar("PRD-0001");
    fireEvent.click(screen.getByRole("button", { name: /Chegou de fornecedor/i }));
    fireEvent.click(screen.getByRole("button", { name: /Somar 2 peças/i }));

    await waitFor(() => {
      const chamadas = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
      const post = chamadas.find(([, i]) => i?.method === "POST");
      expect(post, "tem de gravar").toBeTruthy();
      const corpo = JSON.parse(String(post![1]!.body));
      // O código LIDO é o que viaja: quem bipou não escolheu item numa lista.
      expect(corpo.codigo).toBe("PRD-0001");
      expect(corpo.quantidade).toBe(2);
      expect(corpo.sentido).toBe("entrada");
      expect(corpo.motivo).toBe("chegou");
    });
  });

  it("trocar pra SAÍDA troca os motivos — são vocabulários diferentes", () => {
    render(<EntradaPorLeitura podeAjustar />);
    expect(screen.getByRole("button", { name: /Chegou de fornecedor/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Saindo do estoque/i }));
    expect(screen.queryByRole("button", { name: /Chegou de fornecedor/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Consumido na produção/i })).toBeTruthy();
  });

  it("item em mais de um lugar vira PERGUNTA — e a resposta re-envia com o lugar", async () => {
    // O 409 `precisa_lugar` do ajuste-qr não é falha: a linha fica na fila e a
    // tela mostra os lugares com saldo pra pessoa tocar num.
    const chamadas: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn((_url: unknown, init?: RequestInit) => {
      const corpo = init?.body ? JSON.parse(String(init.body)) : {};
      chamadas.push(corpo);
      if (corpo.localId) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, frase: "+1 Chapa · agora 51 un" }) } as Response);
      }
      return Promise.resolve({
        ok: false, status: 409, json: () => Promise.resolve({
          error: "precisa_lugar",
          detalhe: "Este item está em mais de um lugar — diga onde entrou.",
          lugares: [
            { id: "a", nome: "Rua C", caminho: "Rua C › Nível 2", quantidade: 30 },
            { id: "b", nome: "Rua E", caminho: "Rua E › Nível 1", quantidade: 20 },
          ],
        }),
      } as Response);
    }));
    render(<EntradaPorLeitura podeAjustar />);
    bipar("PRD-0001");
    fireEvent.click(screen.getByRole("button", { name: /Chegou de fornecedor/i }));
    fireEvent.click(screen.getByRole("button", { name: /Somar 1 peça/i }));

    await waitFor(() => expect(screen.getByText(/mais de um lugar/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Rua E › Nível 1/ }));

    await waitFor(() => {
      const comLugar = chamadas.find((c) => c.localId === "b");
      expect(comLugar, "re-envia com o lugar escolhido").toBeTruthy();
      expect(comLugar!.codigo).toBe("PRD-0001");
      // Respondeu: a pergunta some e a fila esvazia — a peça entrou.
      expect(screen.queryByText(/mais de um lugar/)).toBeNull();
    });
  });

  it("o que FALHOU continua na fila, com o motivo ao lado", async () => {
    vi.stubGlobal("fetch", rede({ error: "recusado", detalhe: "Este item é contado por etiqueta." }, 400));
    render(<EntradaPorLeitura podeAjustar />);
    bipar("PEC-0001");
    fireEvent.click(screen.getByRole("button", { name: /Chegou de fornecedor/i }));
    fireEvent.click(screen.getByRole("button", { name: /Somar 1 peça/i }));

    await waitFor(() => {
      // Limpar tudo esconderia o que precisa de conserto — e a pessoa bipa de
      // novo o que já entrou. O código aparece DUAS vezes de propósito: na fila
      // (ainda pendente) e no aviso que explica por que não passou.
      expect(screen.getAllByText("PEC-0001").length).toBeGreaterThanOrEqual(2);
      expect(document.body.textContent).toMatch(/contado por etiqueta/);
    });
  });
});
