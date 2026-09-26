import { describe, it, expect } from "vitest";
import {
  ritmoDe, pendenciasDe, vencidas, filaDoDia, emRisco, progressoDe,
  sobrevivenciaDe, somaDias, diffDias, emAquecimento, piorStatus, resumoGrupo,
  type Ativo, type Etapa, type Marco, type StatusAtivo,
} from "@/lib/marketing-aquecimento-const";

// ── O que estes testes protegem ──────────────────────────────────────────────
// Três regras deste módulo não são visuais e por isso não aparecem quando a tela
// "parece certa":
//
//   1. CONGELAMENTO — ativo restrito/banido para de acumular atraso. Sem isso o
//      bloco "Fora do prazo" enche de chip banido e ninguém lê mais o alerta.
//   2. RITMO — o desvio é o da ÚLTIMA etapa cumprida, não a soma de todas.
//      Somando, todo ativo saudável viraria "apressado" com o tempo.
//   3. FILA — agrupa por ETAPA. É o que permite marcar seis chips de uma vez.

const ROT = "rot-1";

const etapa = (id: string, dia: number, titulo = `Etapa ${id}`): Etapa =>
  ({ id, roteiroId: ROT, ordem: dia, dia, titulo, detalhe: null, removidaEm: null });

const ETAPAS = [etapa("e0", 0), etapa("e1", 3), etapa("e2", 7), etapa("e3", 14)];

const ativo = (over: Partial<Ativo> = {}): Ativo => ({
  id: "a1", tipo: "numero", nome: "(62) 9 9331-7745", identificador: "5562993317745",
  paiId: null, status: "aquecendo", roteiroId: ROT, iniciadoEm: "2026-08-01",
  pausadoEm: null, responsavelId: null, responsavelNome: "Ana", responsavelFoto: null,
  aparelho: "Moto G54", operadora: "Claro", obs: null, ...over,
});

const marco = (etapaId: string, feitoEm: string, ativoId = "a1"): Marco =>
  ({ id: `m-${ativoId}-${etapaId}`, ativoId, etapaId, feitoEm, autorId: null, autorNome: null });

describe("datas em UTC", () => {
  it("soma e subtrai dias sem escorregar de fuso", () => {
    expect(somaDias("2026-08-01", 7)).toBe("2026-08-08");
    expect(somaDias("2026-08-31", 1)).toBe("2026-09-01");
    expect(somaDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDias("2026-08-01", "2026-08-11")).toBe(10);
    expect(diffDias("2026-08-11", "2026-08-01")).toBe(-10);
  });
});

describe("ritmo", () => {
  it("sem etapa cumprida, ninguém está fora do ritmo", () => {
    expect(ritmoDe(ativo(), ETAPAS, [])).toMatchObject({ estado: "no_ritmo", desvio: 0 });
  });

  it("cumprir no dia previsto é estar no ritmo", () => {
    const r = ritmoDe(ativo(), ETAPAS, [marco("e0", "2026-08-01"), marco("e1", "2026-08-04")]);
    expect(r).toMatchObject({ estado: "no_ritmo", desvio: 0 });
  });

  it("atrasar além do limiar aparece como atrasado", () => {
    // e1 vence em 04/08 (dia 3); feito em 08/08 = 4 dias depois.
    const r = ritmoDe(ativo(), ETAPAS, [marco("e1", "2026-08-08")]);
    expect(r.estado).toBe("atrasado");
    expect(r.desvio).toBe(4);
  });

  it("ADIANTAR é o sinal perigoso e tem nome próprio", () => {
    // e2 vence em 08/08 (dia 7); feito em 03/08 = 5 dias antes.
    const r = ritmoDe(ativo(), ETAPAS, [marco("e2", "2026-08-03")]);
    expect(r.estado).toBe("apressado");
    expect(r.desvio).toBe(-5);
    expect(r.apressadas).toBe(1);
  });

  it("desvio é o da ÚLTIMA etapa, não a soma — senão todo ativo saudável vira apressado", () => {
    // Quatro etapas, cada uma 1 dia adiantada. Somando daria −4 ("apressado");
    // na verdade o ativo está 1 dia à frente do calendário, que é o ritmo normal.
    const r = ritmoDe(ativo(), ETAPAS, [
      marco("e0", "2026-07-31"), marco("e1", "2026-08-03"),
      marco("e2", "2026-08-07"), marco("e3", "2026-08-14"),
    ]);
    expect(r.desvio).toBe(-1);
    expect(r.estado).toBe("no_ritmo");
    expect(r.apressadas).toBe(4); // a contagem continua visível, só não dispara alarme
  });

  it("um dia de desvio é ruído de rotina, não desvio de ritmo", () => {
    expect(ritmoDe(ativo(), ETAPAS, [marco("e1", "2026-08-05")]).estado).toBe("no_ritmo");
  });

  it("marco de etapa que já não existe no roteiro é ignorado", () => {
    const r = ritmoDe(ativo(), ETAPAS, [marco("apagada", "2026-01-01")]);
    expect(r).toMatchObject({ estado: "no_ritmo", desvio: 0 });
  });
});

describe("congelamento", () => {
  const restrito = ativo({ status: "restrito", pausadoEm: "2026-08-05" });

  it("ativo restrito não tem ritmo — está parado, não atrasado", () => {
    expect(ritmoDe(restrito, ETAPAS, [marco("e0", "2026-08-01")]).estado).toBe("pausado");
  });

  it("o atraso para de crescer no dia da pausa", () => {
    // e1 venceu 04/08. Pausado em 05/08 → 1 dia de atraso, e assim permanece
    // mesmo consultando semanas depois.
    const em10 = pendenciasDe(restrito, ETAPAS, [], "2026-08-10");
    const em30 = pendenciasDe(restrito, ETAPAS, [], "2026-08-30");
    expect(em10.find((p) => p.etapa.id === "e1")!.atraso).toBe(1);
    expect(em30.find((p) => p.etapa.id === "e1")!.atraso).toBe(1);
  });

  it("sem congelamento o atraso cresceria sozinho — é o que o congelamento evita", () => {
    const vivo = ativo();
    expect(pendenciasDe(vivo, ETAPAS, [], "2026-08-10").find((p) => p.etapa.id === "e1")!.atraso).toBe(6);
    expect(pendenciasDe(vivo, ETAPAS, [], "2026-08-30").find((p) => p.etapa.id === "e1")!.atraso).toBe(26);
  });

  it("ativo congelado some da fila do dia", () => {
    const fila = filaDoDia(
      [restrito], new Map([[ROT, ETAPAS]]), new Map([["a1", []]]), "2026-08-30",
    );
    expect(fila).toHaveLength(0);
  });
});

describe("pendências", () => {
  it("etapa cumprida sai da lista; etapa removida também", () => {
    const comRemovida = [...ETAPAS, { ...etapa("ex", 5), removidaEm: "2026-08-02" }];
    const p = pendenciasDe(ativo(), comRemovida, [marco("e0", "2026-08-01")], "2026-08-11");
    expect(p.map((x) => x.etapa.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("vence hoje conta como vencida — é trabalho de hoje, não de amanhã", () => {
    // e2 vence em 08/08 (dia 7).
    const p = pendenciasDe(ativo(), ETAPAS, [], "2026-08-08");
    expect(p.find((x) => x.etapa.id === "e2")!.atraso).toBe(0);
    expect(vencidas(p).map((x) => x.etapa.id)).toEqual(["e0", "e1", "e2"]);
  });

  it("o que ainda vai vencer fica com atraso negativo e fora da fila", () => {
    const p = pendenciasDe(ativo(), ETAPAS, [], "2026-08-08");
    expect(p.find((x) => x.etapa.id === "e3")!.atraso).toBe(-7);
  });
});

describe("fila do dia", () => {
  const tres = ["a1", "a2", "a3"].map((id) => ativo({ id, nome: `Chip ${id}` }));
  const etapasPor = new Map([[ROT, ETAPAS]]);
  const marcosPor = new Map(tres.map((a) => [a.id, [] as Marco[]]));

  it("agrupa por ETAPA — é o que permite marcar todos de uma vez", () => {
    const fila = filaDoDia(tres, etapasPor, marcosPor, "2026-08-04");
    const e1 = fila.find((f) => f.chave.endsWith("e1"))!;
    expect(e1.alvos).toHaveLength(3);
    expect(e1.alvos.map((x) => x.ativo.id).sort()).toEqual(["a1", "a2", "a3"]);
  });

  it("mais atrasado primeiro", () => {
    const fila = filaDoDia(tres, etapasPor, marcosPor, "2026-08-08");
    expect(fila.map((f) => f.atraso)).toEqual([...fila.map((f) => f.atraso)].sort((a, b) => b - a));
    expect(fila[0].chave.endsWith("e0")).toBe(true); // dia 0 é o mais antigo
  });

  it("quem já cumpriu a etapa não aparece nela", () => {
    const comUm = new Map(marcosPor);
    comUm.set("a2", [marco("e1", "2026-08-04", "a2")]);
    const fila = filaDoDia(tres, etapasPor, comUm, "2026-08-04");
    const e1 = fila.find((f) => f.chave.endsWith("e1"))!;
    expect(e1.alvos.map((x) => x.ativo.id).sort()).toEqual(["a1", "a3"]);
  });

  it("ativo sem roteiro não entra na fila", () => {
    const solto = ativo({ id: "a9", roteiroId: null });
    const fila = filaDoDia([solto], etapasPor, new Map([["a9", []]]), "2026-08-11");
    expect(fila).toHaveLength(0);
  });
});

describe("em risco", () => {
  it("junta o apressado e o restrito, apressado mais grave primeiro", () => {
    const lista = [
      ativo({ id: "ok" }),
      ativo({ id: "corrido" }),
      ativo({ id: "travado", status: "restrito" as StatusAtivo, pausadoEm: "2026-08-05" }),
    ];
    const marcos = new Map<string, Marco[]>([
      ["ok", [marco("e1", "2026-08-04", "ok")]],
      ["corrido", [marco("e3", "2026-08-05", "corrido")]], // dia 14 feito no dia 4 → −10
      ["travado", []],
    ]);
    const r = emRisco(lista, new Map([[ROT, ETAPAS]]), marcos);
    expect(r.map((x) => x.ativo.id)).toEqual(["corrido", "travado"]);
    expect(r[0].ritmo.desvio).toBe(-10);
  });
});

describe("progresso e sobrevivência", () => {
  it("progresso ignora etapa removida", () => {
    const comRemovida = [...ETAPAS, { ...etapa("ex", 5), removidaEm: "2026-08-02" }];
    expect(progressoDe(comRemovida, [marco("e0", "2026-08-01")])).toMatchObject({ feito: 1, total: 4 });
  });

  it("taxa de sobrevivência e duração real média do roteiro", () => {
    const lista = [
      ativo({ id: "s1", status: "aquecido" }),
      ativo({ id: "s2", status: "em_uso" }),
      ativo({ id: "s3", status: "banido" }),
      ativo({ id: "s4", status: "aquecendo" }),
      ativo({ id: "outro", roteiroId: "rot-2", status: "banido" }), // não conta
    ];
    const marcos = new Map<string, Marco[]>([
      ["s1", [marco("e3", "2026-08-15", "s1")]], // 14 dias
      ["s2", [marco("e3", "2026-08-21", "s2")]], // 20 dias
    ]);
    const s = sobrevivenciaDe(ROT, lista, marcos);
    expect(s.total).toBe(4);
    expect(s.aquecidos).toBe(2);
    expect(s.banidos).toBe(1);
    expect(s.taxaAquecido).toBeCloseTo(0.5);
    expect(s.duracaoMedia).toBe(17);
  });

  it("roteiro sem ativo não divide por zero", () => {
    expect(sobrevivenciaDe("vazio", [], new Map())).toMatchObject({
      total: 0, taxaAquecido: 0, taxaBanido: 0, duracaoMedia: null,
    });
  });
});

// ── Roteiro vazio: o estado em que o módulo NASCE ────────────────────────────
// As etapas passaram a ser escritas pelo time, não semeadas por mim. Então o dia
// 1 do módulo é: ativos cadastrados, roteiro sem nenhuma etapa. Nada disso pode
// estourar, dividir por zero nem inventar pendência.
describe("roteiro ainda sem etapas", () => {
  const semEtapas: Etapa[] = [];

  it("não inventa pendência nem atraso", () => {
    expect(pendenciasDe(ativo(), semEtapas, [], "2026-09-30")).toEqual([]);
  });

  it("progresso não divide por zero", () => {
    expect(progressoDe(semEtapas, [])).toMatchObject({ feito: 0, total: 0, fracao: 0 });
  });

  it("ritmo é neutro — sem previsto não há desvio possível", () => {
    expect(ritmoDe(ativo(), semEtapas, []).estado).toBe("no_ritmo");
  });

  it("a fila do dia nasce vazia, e não quebrada", () => {
    const fila = filaDoDia([ativo()], new Map([[ROT, semEtapas]]), new Map([["a1", []]]), "2026-09-30");
    expect(fila).toEqual([]);
  });

  it("sobrevivência de roteiro sem etapa ainda conta os ativos", () => {
    const s = sobrevivenciaDe(ROT, [ativo({ status: "aquecido" })], new Map([["a1", []]]));
    expect(s).toMatchObject({ total: 1, aquecidos: 1, duracaoMedia: null });
  });
});

// ── Quem terminou sai da fila ────────────────────────────────────────────────
// O caso real: a pessoa marca o ativo como "Aquecido" e considera encerrado,
// deixando a ultima etapa sem marcar. Se a fila continuasse cobrando essa etapa,
// ela apareceria todo dia, para sempre, e ninguem iria faze-la — uma fila que
// pede o impossivel e uma fila que se aprende a ignorar.
describe("so quem esta aquecendo entra na fila", () => {
  const etapasPor = new Map([[ROT, ETAPAS]]);

  it("novo e aquecendo entram; o resto nao", () => {
    expect(EM_AQ_ENTRAM.map(emAquecimento)).toEqual([true, true]);
    expect(EM_AQ_FORA.map(emAquecimento)).toEqual([false, false, false, false, false]);
  });

  it("ativo aquecido com etapa pendente nao cobra mais nada", () => {
    const pronto = ativo({ status: "aquecido" });
    const fila = filaDoDia([pronto], etapasPor, new Map([["a1", []]]), "2026-09-30");
    expect(fila).toEqual([]);
  });

  it("em_uso tambem sai — esta trabalhando, nao aquecendo", () => {
    const rodando = ativo({ status: "em_uso" });
    expect(filaDoDia([rodando], etapasPor, new Map([["a1", []]]), "2026-09-30")).toEqual([]);
  });

  it("mas quem ainda aquece continua sendo cobrado", () => {
    const fila = filaDoDia([ativo()], etapasPor, new Map([["a1", []]]), "2026-08-11");
    expect(fila.length).toBeGreaterThan(0);
  });

  it("a gaveta CONTINUA mostrando as etapas que faltam mesmo fora da fila", () => {
    // Sair da fila e sobre COBRANCA, nao sobre informacao: abrir o ativo tem que
    // seguir mostrando o que ficou por fazer, senao o historico mente por omissao.
    const pronto = ativo({ status: "aquecido" });
    expect(pendenciasDe(pronto, ETAPAS, [], "2026-09-30").length).toBe(4);
  });
});

const EM_AQ_ENTRAM: StatusAtivo[] = ["novo", "aquecendo"];
const EM_AQ_FORA: StatusAtivo[] = ["aquecido", "em_uso", "restrito", "banido", "aposentado"];

// ── O resumo do bloco ────────────────────────────────────────────────────────
// O inventário virou bloco, e bloco resume: um número por estado e a cor do
// quadro. É regra (decide o que a pessoa olha primeiro), então mora no núcleo e
// é testada sem banco — igual ao ritmo.

describe("piorStatus — quem manda na cor do bloco", () => {
  it("banido ganha de todos", () => {
    expect(piorStatus(["aquecido", "banido", "aquecendo"])).toBe("banido");
    expect(piorStatus(["banido", "restrito"])).toBe("banido");
  });

  it("aquecendo ganha de em_uso e aquecido — é o que ainda dá trabalho", () => {
    expect(piorStatus(["aquecido", "em_uso", "aquecendo"])).toBe("aquecendo");
  });

  it("aposentado NUNCA lidera: é decisão tomada, não problema aberto", () => {
    // Se ele liderasse, um aparelho na gaveta pintaria o bloco de cinza e
    // esconderia o chip banido que ainda mora nele.
    expect(piorStatus(["aposentado", "banido"])).toBe("banido");
    expect(piorStatus(["aposentado", "aquecido"])).toBe("aquecido");
    expect(piorStatus(["aposentado"])).toBe("aposentado");
  });

  it("bloco vazio não tem cor", () => {
    expect(piorStatus([])).toBeNull();
  });
});

describe("resumoGrupo — os números do bloco", () => {
  const etapasPor = new Map([[ROT, ETAPAS]]);

  it("conta cada estado na coluna certa", () => {
    const filhos = [
      ativo({ id: "a1", status: "aquecendo" }),
      ativo({ id: "a2", status: "aquecido" }),
      ativo({ id: "a3", status: "em_uso" }),
      ativo({ id: "a4", status: "banido" }),
      ativo({ id: "a5", status: "restrito" }),
    ];
    const r = resumoGrupo(filhos, etapasPor, new Map(), "2026-08-05");
    expect(r.total).toBe(5);
    expect(r.aquecendo).toBe(1);
    expect(r.prontos).toBe(2);   // aquecido + em_uso
    expect(r.caidos).toBe(2);    // banido + restrito
    expect(r.pior).toBe("banido");
  });

  it("só quem AINDA aquece tem etapa vencendo", () => {
    // Chip pronto com etapa por marcar não pode inflar o alerta do bloco: é
    // exatamente o caso que a fila do dia já se recusa a cobrar.
    const filhos = [ativo({ id: "a1", status: "aquecendo" }), ativo({ id: "a2", status: "aquecido" })];
    const r = resumoGrupo(filhos, etapasPor, new Map(), "2026-08-20");
    expect(r.vencendo).toBe(4);  // as 4 etapas do único que ainda aquece
  });

  it("banido não acumula vencimento — o prazo dele está congelado", () => {
    const r = resumoGrupo([ativo({ status: "banido", pausadoEm: "2026-08-03" })],
      etapasPor, new Map(), "2026-09-30");
    expect(r.vencendo).toBe(0);
  });

  it("a média de progresso ignora quem já terminou", () => {
    // Cinco chips prontos e um recém-nascido mostrariam 90% e esconderiam
    // justamente o único que dá trabalho.
    const marcos = new Map([["a1", [marco("e0", "2026-08-01", "a1"), marco("e1", "2026-08-04", "a1")]]]);
    const filhos = [
      ativo({ id: "a1", status: "aquecendo" }),
      ativo({ id: "a2", status: "aquecido" }),
    ];
    const r = resumoGrupo(filhos, etapasPor, marcos, "2026-08-05");
    expect(r.fracao).toBeCloseTo(0.5);   // 2 de 4 do único que conta
  });

  it("conta os apressados — o padrão que antecede o bloqueio", () => {
    const marcos = new Map([["a1", [marco("e0", "2026-08-01"), marco("e1", "2026-08-01")]]]);
    const r = resumoGrupo([ativo()], etapasPor, marcos, "2026-08-05");
    expect(r.apressados).toBe(1);
  });

  it("grupo vazio não inventa número nenhum", () => {
    const r = resumoGrupo([], etapasPor, new Map(), "2026-08-05");
    expect(r).toMatchObject({ total: 0, aquecendo: 0, prontos: 0, caidos: 0, vencendo: 0, fracao: 0, pior: null });
  });
});
