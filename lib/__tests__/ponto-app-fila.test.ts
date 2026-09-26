import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ── A fila do tablet de ponto não pode ser gravada INTEIRA ───────────────────
// Foi assim que "a pessoa bate e o ponto não chega" aconteceu por semanas: dois
// coroutines mexiam na mesma lista com "lê → muda → grava". O dreno lia a fila,
// gastava o tempo da requisição HTTP e no fim gravava a lista que tinha lido —
// apagando quem batesse o ponto nessa janela.
//
//   dreno: lê [A] ─── envia A (300ms–3s) ─────────► grava []   ✗ B morreu
//   pessoa:            └ enfileira B → grava [A, B]
//
// Sintomas que batem com isso e com mais nada: a perda acontece no horário de
// PICO (sempre tem um dreno no ar), a batida nunca chega atrasada depois (não
// ficou presa em lugar nenhum — foi sobrescrita) e o servidor não registra
// tentativa nenhuma (a requisição nunca saiu).
//
// A regra que impede a volta: toda mudança na fila acontece DENTRO da transação
// do DataStore (`ds.edit`), e o dreno endereça UM item pelo clientId.

const raiz = path.join(__dirname, "..", "..", "ponto-app/app/src/main/java/com/tridi/ponto");
const store = fs.readFileSync(path.join(raiz, "data/Store.kt"), "utf8");
const main = fs.readFileSync(path.join(raiz, "MainActivity.kt"), "utf8");

describe("fila do tablet de ponto — escrita atômica", () => {
  it("toda mudança na fila passa por editarFila, dentro do ds.edit", () => {
    const bloco = store.slice(store.indexOf("private suspend fun editarFila"));
    expect(bloco.slice(0, 400)).toContain("ctx.ds.edit");
    // O estado atual é lido DE DENTRO da transação (prefs), nunca de fora.
    expect(bloco.slice(0, 400)).toContain("prefs[K_FILA]");
  });

  it("ninguém grava a lista inteira da fila", () => {
    // `setFila(lista)` é a assinatura que permitia sobrescrever o trabalho do
    // outro coroutine. Ela não existe mais, e ninguém a chama.
    expect(store).not.toMatch(/fun setFila\s*\(/);
    expect(main).not.toContain("store.setFila(");
  });

  it("enfileirar, remover e mandar pro fim são operações da própria fila", () => {
    expect(store).toContain("suspend fun enfileirar(item: FilaItem) = editarFila");
    expect(store).toContain("suspend fun removerDaFila(clientId: String) = editarFila");
    expect(store).toContain("suspend fun marcarRecusada(clientId: String) = editarFila");
    expect(store).toContain("suspend fun descartarRecusadas() = editarFila");
  });

  it("o dreno relê a fila a cada volta e tira o item pelo clientId", () => {
    const i = main.indexOf("suspend fun drenarFila");
    expect(i).toBeGreaterThan(0);
    const dreno = main.slice(i, i + 3000);
    expect(dreno).toContain("val fila = store.fila()");           // releitura dentro do laço
    expect(dreno).toContain("store.removerDaFila(item.clientId)");
    expect(dreno).toContain("store.marcarRecusada(item.clientId)");
    // Sem rede a fila fica INTACTA — quem quebra isso perde batida.
    expect(dreno).toContain("if (r == null) break");
  });

  it("o teto da fila descarta o mais NOVO, nunca o mais antigo", () => {
    // `takeLast` jogava fora as batidas que esperavam há mais tempo. A regra
    // vale pra FILA (o que ainda não subiu); no rastro de ENVIADAS é o
    // contrário — lá o que importa é o recente, e `takeLast` é o certo.
    const fila = store.slice(store.indexOf("private suspend fun editarFila"), store.indexOf("K_ENVIADAS"));
    expect(fila).toContain("take(FILA_MAX)");
    expect(fila).not.toContain("takeLast(");
  });

  it("toda batida enviada deixa rastro pra conferência", () => {
    expect(store).toContain("fun marcarEnviada");
    const i = main.indexOf("suspend fun drenarFila");
    expect(main.slice(i, i + 3000)).toContain("store.marcarEnviada");
    // E a conferência reenvia o que o servidor não confirmou.
    expect(main).toContain("suspend fun conferirEnviadas");
    expect(main).toContain("if (!resp.conferivel) return");
  });

  it("5xx e resposta não-JSON são erro transitório, não recusa", () => {
    const api = fs.readFileSync(path.join(raiz, "net/Api.kt"), "utf8");
    const bater = api.slice(api.indexOf("suspend fun bater("), api.indexOf("suspend fun enviarAmostra"));
    expect(bater).toContain("r.code >= 500");
    expect(bater).toMatch(/catch[\s\S]{0,80}throw RuntimeException/);
  });
});
