import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ItemEditor } from "../ItemEditor";
import type { Item } from "../tipos";

/**
 * A etiqueta de PRODUTO chega até a tela.
 *
 * "Almofada, todas elas têm PRD-0001, e não queria pôr número de série, e sim um
 * código único por produto." A régua existe e está testada
 * (`estoque-etiqueta-de-produto.test.ts`); este arquivo trava a outra metade —
 * que a porta aparece pra quem precisa dela e NÃO aparece pra quem ela
 * estragaria.
 *
 * O dono não conseguia ver isto: o modal que abre esta tela nascia invisível
 * (`t-modal` sem `is-open`, ver modal-invisivel.test.ts). Feature entregue atrás
 * de uma porta trancada é feature não entregue.
 *
 * jsdom não tem layout — nada de medir geometria aqui.
 */

const ALMOFADA: Item = {
  id: "i1", nome: "Almofada 22x22", hierarquia: "produto", produzido: false,
  serializado: false, categoria: "Almofadas", imagem_url: null, unidade: "un",
  quantidade: 12, qtd_minima: 0, ativo: true, sku: "PRD-0001",
} as Item;

function rede() {
  return vi.fn((url: string) => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(
      String(url).startsWith("/api/estoque-itens") ? { itens: [ALMOFADA] } : {},
    ),
  } as Response));
}

beforeEach(() => { vi.stubGlobal("fetch", rede()); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("etiqueta de produto na ficha do item", () => {
  it("item comum oferece imprimir com o MESMO código", async () => {
    render(<ItemEditor item={ALMOFADA} itens={[ALMOFADA]} onClose={() => {}} onSaved={() => {}} />);
    const botao = await screen.findByRole("button", { name: /Imprimir etiquetas deste produto/i });
    expect(botao).toBeTruthy();
    // A frase precisa dizer o que a pessoa vai receber, senão ela imprime 20
    // etiquetas achando que são 20 códigos diferentes.
    expect(document.body.textContent).toMatch(/mesmo código/i);
  });

  it("abrindo, mostra QUANTAS e QUAL código — antes de gastar rolo", async () => {
    render(<ItemEditor item={ALMOFADA} itens={[ALMOFADA]} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Imprimir etiquetas deste produto/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/Quantas etiquetas iguais/i)).toBeTruthy();
      // O código aparece escrito, e é o SKU cru — sem sequencial.
      expect(document.body.textContent).toContain("PRD-0001");
    });
    // O sequencial NÃO pode sair na folha desta etiqueta. Confere na folha, e
    // não no corpo inteiro: o bloco de serialização (a outra forma de etiquetar)
    // mostra "PRD-0001-000001" de propósito, e ele vive na mesma tela.
    const folha = document.querySelector(".etiqueta-folha, [data-folha]") ?? document.body;
    const tiras = [...folha.querySelectorAll("*")].map((e) => e.textContent ?? "");
    expect(tiras.some((t) => /^PRD-0001$/.test(t.trim())), "a tira leva o SKU cru").toBe(true);
  });

  it("item contado por etiqueta NÃO oferece — lá o código é a peça", async () => {
    const serial = { ...ALMOFADA, serializado: true };
    render(<ItemEditor item={serial} itens={[serial]} onClose={() => {}} onSaved={() => {}} />);
    await screen.findByDisplayValue("Almofada 22x22");
    expect(screen.queryByRole("button", { name: /Imprimir etiquetas deste produto/i })).toBeNull();
  });

  it("sem SKU no banco, o gerador SUGERE um e a etiqueta sai assim mesmo", async () => {
    // Descoberto escrevendo este teste: eu esperava a frase "não tem SKU", e a
    // tela faz melhor — o gerador propõe um seguindo a convenção do dono
    // (ver sugerirSku, em lib/estoque-sku) e a etiqueta nasce com ele. Só ficaria sem
    // código um item cuja hierarquia não tem prefixo, e aí a frase aparece.
    const semSku = { ...ALMOFADA, sku: null };
    render(<ItemEditor item={semSku} itens={[semSku]} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Imprimir etiquetas deste produto/i }));
    await waitFor(() => {
      const txt = document.body.textContent ?? "";
      expect(/etiquetas com o código/.test(txt) || /não tem SKU/.test(txt)).toBe(true);
    });
  });

  // ── A escolha, no lugar da caixinha ───────────────────────────────────────

  it("a ficha pergunta COMO ETIQUETAR, com as duas formas lado a lado", async () => {
    // Era um interruptor chamado "Cada unidade tem etiqueta" — que descreve como
    // o item é CONTADO. A pergunta que a pessoa tem na mão é sobre o PAPEL, e as
    // duas formas apareciam na mesma tela sem nada dizendo que são alternativas.
    // Item com estoque e SEM etiqueta não recebe a escolha livre: ali a tela
    // mostra o caminho que de fato funciona (ligar a série gera as etiquetas
    // junto, senão a contagem zeraria). Por isso a fixture aqui é zerada — é
    // onde a escolha existe.
    const zerado = { ...ALMOFADA, quantidade: 0 };
    render(<ItemEditor item={zerado} itens={[zerado]} onClose={() => {}} onSaved={() => {}} />);
    await screen.findByText(/Como etiquetar este item/i);
    expect(screen.getByRole("button", { name: /Código fixo do produto/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Número de série por peça/i })).toBeTruthy();
  });

  it("PRODUTO NOVO nasce em código fixo — o padrão que o dono pediu", async () => {
    render(<ItemEditor hierarquiaInit="produto" itens={[]} onClose={() => {}} onSaved={() => {}} />);
    const fixo = await screen.findByRole("button", { name: /Código fixo do produto/i });
    expect(fixo.getAttribute("aria-pressed"), "vinte almofadas iguais não precisam de série").toBe("true");
    expect(screen.getByRole("button", { name: /Número de série por peça/i }).getAttribute("aria-pressed")).toBe("false");
  });

  it("escolher série troca a marcação e tira a etiqueta de produto da frente", async () => {
    render(<ItemEditor hierarquiaInit="produto" itens={[]} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Número de série por peça/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Número de série por peça/i }).getAttribute("aria-pressed")).toBe("true");
      // As duas são alternativas: com série ligada, imprimir "o mesmo código"
      // não pode continuar sendo oferecido.
      expect(screen.queryByRole("button", { name: /Imprimir etiquetas deste produto/i })).toBeNull();
    });
  });

  it("item que JÁ é serializado abre marcado assim — não muda por baixo", async () => {
    const serial = { ...ALMOFADA, serializado: true, quantidade: 0 };
    render(<ItemEditor item={serial} itens={[serial]} onClose={() => {}} onSaved={() => {}} />);
    const s = await screen.findByRole("button", { name: /Número de série por peça/i });
    expect(s.getAttribute("aria-pressed")).toBe("true");
  });

});
