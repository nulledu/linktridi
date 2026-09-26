import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConferirClient } from "../ConferirClient";

/**
 * O `destinoId` só viaja quando uma PESSOA escolheu.
 *
 * A tela pré-preenche o destino com `pendente.itemId` quando a atividade aponta
 * produto. Esse id vem de `itensPorNome` (lib/estoque-fila-conferencia.ts), um
 * `Map` chaveado pelo nome normalizado: dois itens do catálogo com o mesmo nome
 * colapsam e o último da consulta vence.
 *
 * Mandar esse id faz o SERVIDOR pular `ErroNomeAmbiguo` — a guarda que existe
 * exatamente pra não depositar a caixa num item ao acaso. E o estrago é mudo:
 * as peças entram, o total fecha, e ninguém descobre que foram pro item errado.
 *
 * Não é hipótese: o catálogo tem hoje "Círculo hexagonal" duas vezes.
 *
 * Quem achou isto foi o agente que portou a conferência pro tablet — ele
 * recusou copiar o comportamento da web, e estava certo.
 */

function pendente(over: Record<string, unknown> = {}) {
  return {
    id: "a1", produtoNome: "Círculo hexagonal", tarefa: null, detalhe: null,
    itemId: "o-que-o-mapa-escolheu", itemSerializado: false, categoria: null,
    quantidadeAlvo: 10, quantidadeFeita: 10,
    executorId: "u2", executorNome: "Marina", executorFotoUrl: null,
    concluidaEm: new Date().toISOString(),
    fotoUrl: null, tempoRealMin: null, tempoEstimadoMin: null,
    souEuQuemFez: false, consumo: null, ...over,
  };
}

function rede(mapa: Record<string, { status?: number; body: unknown }>) {
  return vi.fn((url: string) => {
    const chave = Object.keys(mapa).find((k) => String(url).startsWith(k));
    const alvo = chave ? mapa[chave] : { status: 200, body: { ok: true } };
    const status = alvo.status ?? 200;
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(alvo.body) } as Response);
  });
}

function corpoDoPost(rota: string): Record<string, unknown> | null {
  const calls = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
  const post = [...calls].reverse().find(([u, i]) => String(u).startsWith(rota) && i?.method === "POST");
  return post?.[1]?.body ? JSON.parse(String(post[1].body)) : null;
}

const PENDENTES = "/api/estoque/conferencias/pendentes";
const RAIZ = "/api/estoque/conferencias";

beforeEach(() => { vi.stubGlobal("fetch", rede({})); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function abrirEAprovar(p: Record<string, unknown>) {
  vi.stubGlobal("fetch", rede({
    [PENDENTES]: { body: { atividades: [p], travadas: 0, anteriores: 0, proximoCursor: null, qcDesligado: false } },
    [RAIZ]: { body: { ok: true, resultado: "certo", quantidade: 10, unidades: [], etiquetas: [], reaberta: false } },
  }));
  render(<ConferirClient />);
  const abrir = (await screen.findAllByRole("button", { name: "Conferir" })).find((b) => !(b as HTMLButtonElement).disabled)!;
  fireEvent.click(abrir);
  fireEvent.click(await screen.findByRole("button", { name: "Certo" }));
  fireEvent.click(screen.getByRole("button", { name: /^Confirmar/ }));
}

describe("o destino pré-preenchido NÃO viaja", () => {
  it("atividade que aponta produto: manda destinoId NULO e deixa o servidor decidir", async () => {
    await abrirEAprovar(pendente());

    const corpo = corpoDoPost(RAIZ);
    expect(corpo).toBeTruthy();
    expect(corpo!.resultado).toBe("certo");
    // O id que o Map escolheu não pode sair daqui: com nome duplicado ele é
    // "um dos dois", e o servidor tem a guarda que sabe recusar o empate.
    expect(corpo!.destinoId).toBeNull();
  });

  it("continua sendo uma aprovação normal — o que muda é só de quem é a decisão", async () => {
    await abrirEAprovar(pendente());
    const corpo = corpoDoPost(RAIZ);
    expect(corpo!.atividadeId).toBe("a1");
    expect(corpo!.defeitos).toEqual([]);
  });
});
