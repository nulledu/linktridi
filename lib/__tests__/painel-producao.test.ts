import { describe, it, expect } from "vitest";
import { resumirProducao, escolherDia, minutosDePresenca, type LinhaAtividade } from "@/lib/painel-producao";

/**
 * O chão de fábrica na parede.
 *
 * Duas armadilhas moram aqui, e as duas são do tipo que só aparece semanas
 * depois, quando alguém compara a TV com a planilha do setor:
 *
 *  • TMA medido do `created_at` mede o tempo que a ordem ficou NA FILA, não o
 *    tempo de trabalho. Só `iniciada_at → concluida_at` conta.
 *  • ordem esquecida aberta na sexta e fechada na segunda sozinha destrói a
 *    média da equipe.
 */
const base: LinhaAtividade = {
  para_id: "p1", para_nome: "Ana", foto_url: null, status: "concluida",
  urgente: false, impedida: false, quantidade_alvo: 10, quantidade_feita: 10,
  iniciada_at: "2026-08-06T12:00:00Z", concluida_at: "2026-08-06T12:30:00Z",
};
const linha = (x: Partial<LinhaAtividade>): LinhaAtividade => ({ ...base, ...x });

describe("resumo da produção", () => {
  it("soma peças e conta a fila por estado", () => {
    const r = resumirProducao([
      linha({}),
      linha({ quantidade_feita: 5 }),
      linha({ status: "em_andamento" }),
      linha({ status: "pendente" }),
      linha({ status: "pendente", urgente: true }),
    ]);
    expect(r.pecasHoje).toBe(15);
    expect(r.concluidasHoje).toBe(2);
    expect(r.emAndamento).toBe(1);
    expect(r.pendentes).toBe(2);
    expect(r.urgentes).toBe(1);
  });

  it("TMA é o tempo de TRABALHO, não o tempo na fila", () => {
    // 30 e 90 minutos de trabalho → 60 de média.
    const r = resumirProducao([
      linha({ concluida_at: "2026-08-06T12:30:00Z" }),
      linha({ concluida_at: "2026-08-06T13:30:00Z" }),
    ]);
    expect(r.tmaMin).toBe(60);
  });

  it("concluída sem iniciada_at não entra no TMA", () => {
    // Não vale usar `created_at` no lugar: mediria a espera, não a execução.
    const r = resumirProducao([linha({ iniciada_at: null }), linha({})]);
    expect(r.tmaMin).toBe(30);
    expect(r.concluidasHoje).toBe(2);   // continua contando como produção
  });

  it("ordem esquecida aberta o fim de semana inteiro não estraga a média", () => {
    const r = resumirProducao([
      linha({}),
      linha({ iniciada_at: "2026-08-01T12:00:00Z", concluida_at: "2026-08-04T12:00:00Z" }),
    ]);
    expect(r.tmaMin).toBe(30);
  });

  it("produtividade é feito ÷ pedido, e é null quando não houve alvo", () => {
    const comAlvo = resumirProducao([linha({ quantidade_alvo: 10, quantidade_feita: 8 })]);
    expect(comAlvo.operadores[0].produtividade).toBe(80);

    // Sem alvo, "0%" faria parecer que a pessoa não produziu nada.
    const semAlvo = resumirProducao([linha({ quantidade_alvo: 0, quantidade_feita: 8 })]);
    expect(semAlvo.operadores[0].produtividade).toBeNull();
    expect(semAlvo.operadores[0].pecas).toBe(8);
  });

  it("separa por pessoa e põe quem produziu mais na frente", () => {
    const r = resumirProducao([
      linha({ para_id: "p1", para_nome: "Ana", quantidade_feita: 3 }),
      linha({ para_id: "p2", para_nome: "Bia", quantidade_feita: 9 }),
      linha({ para_id: "p2", para_nome: "Bia", status: "em_andamento" }),
    ]);
    expect(r.operadores.map((o) => o.nome)).toEqual(["Bia", "Ana"]);
    expect(r.operadores[0].pecas).toBe(9);
    expect(r.operadores[0].emAndamento).toBe(1);
    expect(r.operadoresAtivos).toBe(2);
  });

  it("urgente e impedida só contam enquanto a ordem está aberta", () => {
    const r = resumirProducao([
      linha({ status: "concluida", urgente: true, impedida: true }),
      linha({ status: "pendente", urgente: true, impedida: true }),
    ]);
    expect(r.urgentes).toBe(1);
    expect(r.impedidas).toBe(1);
  });

  it("turno que ainda não começou mostra o último dia COM movimento", () => {
    // 06:30 de 06/08: nada concluído hoje ainda. Zerar a parede se lê como "a
    // fábrica parou", não como "o turno não começou".
    const agora = new Date("2026-08-06T09:30:00Z");   // 06:30 em SP
    const r = escolherDia([
      linha({ concluida_at: "2026-08-05T14:00:00Z", iniciada_at: "2026-08-05T13:30:00Z" }),
      linha({ concluida_at: "2026-08-04T14:00:00Z", iniciada_at: "2026-08-04T13:30:00Z" }),
      linha({ status: "pendente", concluida_at: null }),
    ], agora);
    expect(r.dia).toBe("2026-08-05");
    expect(r.ehHoje).toBe(false);
    // O dia escolhido + a fila aberta; o dia 04 fica de fora.
    expect(r.linhas).toHaveLength(2);
  });

  it("assim que sai a primeira peça do dia, a parede volta pra hoje", () => {
    const agora = new Date("2026-08-06T14:00:00Z");
    const r = escolherDia([
      linha({ concluida_at: "2026-08-05T14:00:00Z" }),
      linha({ concluida_at: "2026-08-06T13:00:00Z" }),
    ], agora);
    expect(r.dia).toBe("2026-08-06");
    expect(r.ehHoje).toBe(true);
    expect(r.linhas).toHaveLength(1);
  });

  it("fila aberta de dias atrás continua na tela — é problema de hoje", () => {
    const agora = new Date("2026-08-06T14:00:00Z");
    const r = escolherDia([
      linha({ concluida_at: "2026-08-06T13:00:00Z" }),
      linha({ status: "pendente", concluida_at: null }),
      linha({ status: "em_andamento", concluida_at: null }),
    ], agora);
    expect(r.linhas.filter((l) => l.status !== "concluida")).toHaveLength(2);
  });

  it("ocioso é presença menos atividade — e é null sem ponto vinculado", () => {
    // 30 min dentro de atividade; 480 min de presença no ponto → 450 ociosos.
    const comPonto = resumirProducao([linha({})], undefined, undefined, true, { p1: 480 });
    expect(comPonto.operadores[0].emAtividadeMin).toBe(30);
    expect(comPonto.operadores[0].trabalhadoMin).toBe(480);
    expect(comPonto.operadores[0].ociosoMin).toBe(450);

    // Sem ponto: "não sei" — nunca zero. Zero seria uma afirmação sobre alguém.
    const semPonto = resumirProducao([linha({})]);
    expect(semPonto.operadores[0].trabalhadoMin).toBeNull();
    expect(semPonto.operadores[0].ociosoMin).toBeNull();
    expect(semPonto.operadores[0].emAtividadeMin).toBe(30);
  });

  it("atividade além da presença não vira ocioso negativo", () => {
    // Batida esquecida: a pessoa produziu mais tempo do que o ponto registrou.
    const r = resumirProducao([linha({})], undefined, undefined, true, { p1: 10 });
    expect(r.operadores[0].ociosoMin).toBe(0);
  });

  it("presença conta pares de batida; trecho aberto não conta", () => {
    // entrada 08:00, saída 12:00, entrada 13:00 (ainda dentro) → 240 min.
    expect(minutosDePresenca([
      "2026-08-06T11:00:00Z",
      "2026-08-06T15:00:00Z",
      "2026-08-06T16:00:00Z",
    ])).toBe(240);
  });

  it("dia sem nenhuma atividade não inventa número", () => {
    const r = resumirProducao([]);
    expect(r.pecasHoje).toBe(0);
    expect(r.tmaMin).toBeNull();      // não é zero: zero seria "instantâneo"
    expect(r.operadores).toEqual([]);
  });
});
