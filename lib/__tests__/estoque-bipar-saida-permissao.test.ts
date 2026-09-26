import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Quem bipa saída, bipa as DUAS etiquetas ──────────────────────────────────
//
// A saída por leitura existe em duas formas, porque o galpão tem dois papéis
// colados na peça:
//
//   etiqueta de UNIDADE  → baixa a etiqueta   → `estoque:bipar`
//   etiqueta de PRODUTO  → diminui o saldo    → era `estoque:ajustar`
//
// São a mesma ação para quem está com a peça na mão, e estavam atrás de chaves
// diferentes. O operador do galpão — que recebe "bipar", exatamente porque a
// tela é dele — dava baixa numa chapa etiquetada e levava 403 ao bipar a
// etiqueta de produto do item ao lado. O 403 não explicava nada disso.
//
// A direção contrária continua fechada de propósito: ENTRAR com mercadoria
// segue exigindo `ajustar`. Tirar o que já está lá é operação; somar é
// correção de número, e quem corrige número tem outra responsabilidade.

const resolve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/perfis", () => ({ resolveMyModuleKeys: resolve }));
vi.mock("../perfis", () => ({ resolveMyModuleKeys: resolve }));

import { podeAjustarEstoque, podeBiparSaida } from "@/lib/estoque-permissoes";

const OPERADOR = { id: "u1", role: "colaborador", username: "op" };

beforeEach(() => resolve.mockReset());

describe("permissão da saída por leitura", () => {
  it("quem tem só `bipar` consegue tirar do estoque", async () => {
    resolve.mockResolvedValue(["estoque:itens", "estoque:bipar"]);

    expect(await podeBiparSaida(OPERADOR)).toBe(true);
  });

  it("quem tem só `bipar` continua SEM poder somar", async () => {
    // A assimetria é a regra, não um efeito colateral: a mesma pessoa que tira
    // não necessariamente corrige o número para cima.
    resolve.mockResolvedValue(["estoque:itens", "estoque:bipar"]);

    expect(await podeAjustarEstoque(OPERADOR)).toBe(false);
  });

  it("quem tem `ajustar` também tira — ele já podia pelo QR da prateleira", async () => {
    resolve.mockResolvedValue(["estoque:itens", "estoque:ajustar"]);

    expect(await podeBiparSaida(OPERADOR)).toBe(true);
  });

  it("quem não tem nenhuma das duas não tira nada", async () => {
    resolve.mockResolvedValue(["estoque:itens"]);

    expect(await podeBiparSaida(OPERADOR)).toBe(false);
  });

  it("os papéis do galpão atravessam sem consultar a grade", async () => {
    // `estoquista` é papel de sempre: se a resolução da grade fosse necessária
    // aqui, uma falha dela deixaria o galpão inteiro parado.
    // Medido pela AUSÊNCIA de chamada, não por um mock que explode: um mock que
    // lança falharia o teste por um motivo diferente do que ele mede.
    resolve.mockResolvedValue([]);

    expect(await podeBiparSaida({ id: "u2", role: "estoquista" })).toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });
});
