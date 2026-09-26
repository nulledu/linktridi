import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A rota de entrada obedece às regras que já custaram caro neste projeto.
 *
 * Não é teste de unidade da lógica (isso é `estoque-entrada.test.ts`): é a
 * varredura das disciplinas que, quando esquecidas, aparecem semanas depois
 * como número errado ou como fatura. Cada uma tem uma cicatriz atrás.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ROTA = readFileSync(join(RAIZ, "app", "api", "estoque", "device", "entrada", "route.ts"), "utf8");

describe("app/api/estoque/device/entrada", () => {
  it("checa o operationId ANTES de qualquer escrita", () => {
    // A fila offline reenvia até ter certeza que chegou. Sem esta ordem, a mesma
    // leva entra duas vezes a cada retry — e ninguém liga o número inflado ao
    // retry depois.
    const iOperacao = ROTA.indexOf("estoque_operacoes");
    const iUpdate = ROTA.indexOf('.from("estoque_itens")\n    .update');
    expect(iOperacao, "a leitura de estoque_operacoes tem de existir").toBeGreaterThan(0);
    expect(iOperacao).toBeLessThan(iUpdate < 0 ? ROTA.indexOf(".update(") : iUpdate);
  });

  it("grava o resultado com upsert, não insert", () => {
    // Dois retries cruzando com o próprio não podem estourar 23505 DEPOIS do
    // trabalho feito. Mesma decisão da baixa.
    expect(ROTA).toMatch(/estoque_operacoes[\s\S]{0,200}upsert/);
    expect(ROTA).toContain('onConflict: "operation_id"');
  });

  it("passa pelo freio e pela autenticação do aparelho", () => {
    expect(ROTA).toContain("freioDevice");
    expect(ROTA).toContain("authorizeDevice");
    expect(ROTA).toContain("deviceAuthFailure");
  });

  it("não usa select(*) e limita toda consulta", () => {
    // Regra da casa (orcamento-de-execucao): o `*` arrasta jsonb e texto longo,
    // e listagem sem teto é a que vira fatura.
    expect(ROTA).not.toMatch(/\.select\("\*"\)/);
    const selects = ROTA.match(/\.select\(/g) ?? [];
    const limites = ROTA.match(/\.limit\(|maybeSingle\(/g) ?? [];
    expect(limites.length, "todo select precisa de teto").toBeGreaterThanOrEqual(selects.length);
  });

  it("o rastro no histórico NÃO pode derrubar a entrada", () => {
    // O estoque já subiu quando o movimento é gravado. Estourar ali faria o
    // tablet reenfileirar e a peça entrar de novo: perder a linha do histórico é
    // uma informação a menos, entrar em dobro é número errado circulando.
    const i = ROTA.indexOf("estoque_movimentos");
    expect(i).toBeGreaterThan(0);
    const depois = ROTA.slice(i, i + 400);
    expect(depois, "o insert do movimento tem de engolir o erro").toMatch(/then\(\(\) => undefined, \(\) => undefined\)|catch/);
  });

  it("recusa definitiva responde 400 com FRASE, não código pra traduzir", () => {
    // Item errado, quantidade impossível e motivo faltando não mudam se repetir.
    // A pessoa está de luva na frente da prateleira: ela precisa ler o que fazer.
    expect(ROTA).toMatch(/detalhe: problema/);
    expect(ROTA).toMatch(/status: 400/);
  });

  it("acha o item pelo SKU (etiqueta de produto) antes do código de unidade", () => {
    // É o caso que a rota existe pra atender. E SKU duplicado recusa em vez de
    // escolher um: pôr peça no item errado é pior que não pôr.
    const iSku = ROTA.indexOf('ilike("sku", cru)');
    const iUnidade = ROTA.indexOf("partirCodigo(cru)");
    expect(iSku).toBeGreaterThan(0);
    expect(iSku).toBeLessThan(iUnidade);
    expect(ROTA).toMatch(/> 1\) return null/);
  });
});
