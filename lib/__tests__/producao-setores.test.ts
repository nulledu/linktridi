import { describe, it, expect } from "vitest";
import { montarSetores, type EntradaSetores, type FlowCounts, type SectorSummary } from "@/lib/producao";

/**
 * O "Resumo por setor" do Analytics.
 *
 * Três defeitos moravam aqui, e os três apareceram juntos no cartão da
 * Produção num sábado de manhã:
 *
 *  • "Em máquinas" contava a etapa 16 do ERP — que o próprio ERP marcou como
 *    `oculto_sistema` e ninguém usa mais. Zero para sempre. Hoje o pedido sai
 *    de Aprovado (7) direto para Em produção (9) quando é programado na máquina.
 *  • Os números de fluxo eram "hoje" numa tela que abre em "Este mês".
 *  • A frase de reserva caía na lista errada: "Sem produção registrada hoje"
 *    ganhava o check verde e "Fluxo de produção saudável" o triângulo de alerta.
 */
const fluxoZero: FlowCounts = { arteEnviada: 0, aprovados: 0, progMaquina: 0, entraramProducao: 0, fabricados: 0, enviados: 0 };
const entrada = (x: Partial<EntradaSetores> = {}): EntradaSetores => ({
  fluxo: fluxoZero,
  porEtapa: {},
  atrasoPorEtapa: {},
  status: { aEmitir: 0, semFormulario: 0, oferecerAlmofada: 0, aguardandoPagamento: 0, comAlmofada: 0, semAlmofada: 0, prontoEnvio: 0 },
  estoque: { total: 10, emFalta: 0 },
  ...x,
});
const setor = (s: SectorSummary[], key: string) => s.find((x) => x.key === key)!;
const valor = (s: SectorSummary, label: string) => s.metrics.find((m) => m.label === label)?.value;

describe("setor Produção", () => {
  it("fila da máquina é a etapa Aprovado, não a etapa 16 oculta", () => {
    const p = setor(montarSetores(entrada({ porEtapa: { 7: 189, 9: 229, 16: 0 } })), "producao");
    expect(valor(p, "Aguardando máquina")).toBe(189);
    expect(valor(p, "Em produção")).toBe(229);
    expect(p.metrics.map((m) => m.label)).not.toContain("Em máquinas");
    expect(p.metrics.map((m) => m.label)).not.toContain("Em montagem");
  });

  it("programados e fabricados seguem o período da tela", () => {
    const p = setor(montarSetores(entrada({ fluxo: { ...fluxoZero, progMaquina: 150, fabricados: 80 } })), "producao");
    expect(valor(p, "Programados no período")).toBe(150);
    expect(valor(p, "Fabricados no período")).toBe(80);
  });

  it("nada fabricado é alerta, nunca check", () => {
    const p = setor(montarSetores(entrada()), "producao");
    expect(p.negatives).toContain("Nada fabricado no período");
    expect(p.positives.join(" ")).not.toMatch(/sem produção|nada fabricado|saudável|sem gargalo/i);
  });

  it("pedido aprovado há mais de 4 dias na fila da produção vira alerta", () => {
    const p = setor(montarSetores(entrada({
      fluxo: { ...fluxoZero, fabricados: 11 },
      porEtapa: { 7: 189, 9: 229 },
      atrasoPorEtapa: { 7: 20, 9: 199, 5: 300 },
    })), "producao");
    expect(p.negatives).toContain("219 pedidos aprovados há mais de 4 dias ainda não fabricados");
    expect(p.positives.join(" ")).not.toMatch(/saudável|sem gargalo/i);
  });

  it("sem nenhum alerta, o elogio vai para a lista boa", () => {
    const p = setor(montarSetores(entrada({ fluxo: { ...fluxoZero, fabricados: 50 }, porEtapa: { 9: 100 } })), "producao");
    expect(p.negatives).toEqual([]);
    expect(p.positives).toContain("Sem gargalo na produção");
  });
});

describe("frase de reserva nunca mora na lista errada", () => {
  it("dia parado: falta de movimento é alerta em Design e Logística", () => {
    const s = montarSetores(entrada());
    expect(setor(s, "design").negatives).toContain("Nenhuma arte enviada ou aprovada no período");
    expect(setor(s, "logistica").negatives).toContain("Nenhum envio no período");
    for (const x of s) expect(x.positives.join(" ")).not.toMatch(/nenhuma arte|nenhum envio|nada fabricado|sem movimenta/i);
  });

  it("tudo em dia: as frases boas ganham o check, nenhuma fica no alerta", () => {
    const s = montarSetores(entrada({
      fluxo: { ...fluxoZero, aprovados: 5, arteEnviada: 7, fabricados: 9, enviados: 12 },
      porEtapa: { 9: 50, 10: 10 },
      status: { aEmitir: 0, semFormulario: 0, oferecerAlmofada: 0, aguardandoPagamento: 0, comAlmofada: 20, semAlmofada: 5, prontoEnvio: 25 },
    }));
    for (const x of s) expect(x.negatives, x.key).toEqual([]);
    expect(setor(s, "design").positives).toContain("Sem gargalos relevantes");
    expect(setor(s, "entrada-logistica").positives).toContain("Separação em dia");
    expect(setor(s, "logistica").positives).toContain("Sem acúmulo de envios");
    expect(setor(s, "estoque").positives).toContain("Nenhum item zerado");
  });

  it("enviados do período aparecem na Logística", () => {
    const l = setor(montarSetores(entrada({ fluxo: { ...fluxoZero, enviados: 42 } })), "logistica");
    expect(valor(l, "Enviados no período")).toBe(42);
    expect(l.positives).toContain("42 pedidos enviados no período");
  });
});
