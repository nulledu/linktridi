import { describe, it, expect } from "vitest";
import {
  montarChamadas, montarProximas, montarEquipe, setorDaLinha, setorDaPessoa,
  COLS_CHAMADA, type LinhaChamada,
} from "@/lib/painel-atividades";

/**
 * A chamada de aceite na parede: o que caiu fica GRITANDO na TV do setor certo
 * até alguém aceitar — e o payload é público, então nada de texto livre.
 */

const base = (extra: Partial<LinhaChamada>): LinhaChamada => ({
  id: "a1", tarefa: "Impressão 3D", categoria: "Chancela", setor: "Produção",
  para_id: null, para_nome: null, por_nome: "Islane", status: "pendente",
  pool: false, urgente: false, mesa_alvo: null, quantidade_alvo: 10,
  tempo_estimado_min: 40, ordem: 1, iniciada_at: null, claimed_at: null,
  created_at: "2026-08-24T12:00:00.000Z", concluida_at: null, quantidade_feita: null,
  ...extra,
});

const LOGISTICA = new Set(["p-log"]);

describe("setorDaLinha — qual TV chama", () => {
  it("setor da ordem manda quando diz logística", () => {
    expect(setorDaLinha(base({ setor: "Logística" }), LOGISTICA)).toBe("logistica");
    expect(setorDaLinha(base({ setor: "Entrada Logistica" }), LOGISTICA)).toBe("logistica");
  });
  it("ordem 'Produção' dirigida a alguém da logística pertence à TV da logística", () => {
    expect(setorDaLinha(base({ setor: "Produção", para_id: "p-log" }), LOGISTICA)).toBe("logistica");
  });
  it("o resto é produção", () => {
    expect(setorDaLinha(base({ setor: "Produção", para_id: "p-prod" }), LOGISTICA)).toBe("producao");
    expect(setorDaLinha(base({ setor: null }), LOGISTICA)).toBe("producao");
  });
});

describe("montarChamadas — o que espera aceite", () => {
  it("dirigida pendente e oferecida (tablet tocando) chamam; iniciada não", () => {
    const linhas = [
      base({ id: "dir", para_id: "p1", para_nome: "Rai", status: "pendente" }),
      base({ id: "ofe", para_id: "p2", para_nome: "Bia", status: "em_andamento", iniciada_at: null, claimed_at: "2026-08-24T12:05:00.000Z" }),
      base({ id: "rodando", para_id: "p3", status: "em_andamento", iniciada_at: "2026-08-24T12:01:00.000Z" }),
      base({ id: "feita", para_id: "p1", status: "concluida", concluida_at: "2026-08-24T13:00:00.000Z" }),
    ];
    const c = montarChamadas(linhas, "producao", new Set());
    expect(c.map((x) => x.id).sort()).toEqual(["dir", "ofe"]);
    const ofe = c.find((x) => x.id === "ofe")!;
    expect(ofe.oferecida).toBe(true);
    expect(ofe.desde).toBe("2026-08-24T12:05:00.000Z"); // desde o claim, não a criação
  });

  it("pool pendente NÃO chama na produção (é fila do tablet), mas CHAMA na logística", () => {
    const pool = [
      base({ id: "pp", pool: true, setor: "Produção" }),
      base({ id: "pl", pool: true, setor: "Logística" }),
    ];
    expect(montarChamadas(pool, "producao", new Set()).map((c) => c.id)).toEqual([]);
    expect(montarChamadas(pool, "logistica", new Set()).map((c) => c.id)).toEqual(["pl"]);
  });

  it("urgente fura a fila; depois a mais antiga primeiro", () => {
    const linhas = [
      base({ id: "velha", para_id: "p1", created_at: "2026-08-24T10:00:00.000Z" }),
      base({ id: "urgente", para_id: "p2", urgente: true, created_at: "2026-08-24T12:00:00.000Z" }),
      base({ id: "nova", para_id: "p3", created_at: "2026-08-24T11:00:00.000Z" }),
    ];
    expect(montarChamadas(linhas, "producao", new Set()).map((c) => c.id)).toEqual(["urgente", "velha", "nova"]);
  });

  it("a foto vem do cadastro do responsável", () => {
    const fotos = new Map([["p1", "https://cdn/x.jpg"]]);
    const [c] = montarChamadas([base({ id: "dir", para_id: "p1", para_nome: "Rai" })], "producao", new Set(), fotos);
    expect(c.fotoUrl).toBe("https://cdn/x.jpg");
    expect(c.paraNome).toBe("Rai");
    expect(c.dirigida).toBe(true);
  });
});

describe("payload público — sem texto livre", () => {
  it("a consulta não traz `detalhe` nem `instrucoes` (podem carregar nome de cliente)", () => {
    // A trava é na FONTE: se a coluna não é lida, nenhum refactor do payload
    // consegue vazá-la por acidente.
    expect(COLS_CHAMADA).not.toMatch(/detalhe|instrucoes|demo_url/);
  });
  it("a chamada expõe só campos de catálogo e números", () => {
    const [c] = montarChamadas([base({ id: "dir", para_id: "p1" })], "producao", new Set());
    expect(Object.keys(c).sort()).toEqual([
      "categoria", "desde", "dirigida", "fotoUrl", "id", "mesaAlvo",
      "oferecida", "paraNome", "porNome", "quantidadeAlvo", "tarefa", "urgente",
    ]);
  });
});

describe("montarProximas — a fila na ordem do tablet", () => {
  it("urgente → fase → mais antiga; dirigidas e em andamento ficam fora", () => {
    const linhas = [
      base({ id: "f2", pool: true, ordem: 2, created_at: "2026-08-24T10:00:00.000Z" }),
      base({ id: "f1", pool: true, ordem: 1, created_at: "2026-08-24T12:00:00.000Z" }),
      base({ id: "urg", pool: true, ordem: 9, urgente: true }),
      base({ id: "dir", para_id: "p1" }),
      base({ id: "rodando", status: "em_andamento", iniciada_at: "2026-08-24T12:01:00.000Z" }),
    ];
    expect(montarProximas(linhas, "producao", new Set()).map((p) => p.id)).toEqual(["urg", "f1", "f2"]);
  });
});

describe("montarEquipe — as pessoas do setor na parede", () => {
  const pessoas = [
    { id: "p-log", nome: "Lu", fotoUrl: "https://cdn/lu.jpg", setorPainel: "logistica" as const },
    { id: "p-prod", nome: "Rai", fotoUrl: null, setorPainel: "producao" as const },
    { id: "p-venda", nome: "Vi", fotoUrl: null, setorPainel: null },
  ];
  const presencas = { registrados: new Set(["p-log"]), presentes: new Set(["p-log"]) };

  it("só a equipe do setor entra; presença: true/false com ponto, null sem", () => {
    const eq = montarEquipe(pessoas, "logistica", [], presencas, new Date("2026-08-24T15:00:00.000Z"));
    expect(eq.map((p) => p.nome)).toEqual(["Lu"]);
    expect(eq[0].presente).toBe(true);
    const prod = montarEquipe(pessoas, "producao", [], presencas, new Date("2026-08-24T15:00:00.000Z"));
    expect(prod[0].presente).toBeNull();   // Rai não tem vínculo com o ponto
  });

  it("conta o dia da pessoa: concluídas/peças de HOJE e a atividade atual", () => {
    const agora = new Date("2026-08-24T15:00:00.000Z");
    const linhas = [
      base({ id: "c1", para_id: "p-prod", status: "concluida", concluida_at: "2026-08-24T13:00:00.000Z", quantidade_feita: 12 }),
      base({ id: "ontem", para_id: "p-prod", status: "concluida", concluida_at: "2026-08-23T13:00:00.000Z", quantidade_feita: 99 }),
      base({ id: "agora", tarefa: "Corte a laser", para_id: "p-prod", status: "em_andamento", iniciada_at: "2026-08-24T14:30:00.000Z" }),
      base({ id: "fila", para_id: "p-prod", status: "pendente" }),
    ];
    const [rai] = montarEquipe(pessoas, "producao", linhas, presencas, agora);
    expect(rai.concluidasHoje).toBe(1);
    expect(rai.pecasHoje).toBe(12);
    expect(rai.emAtividade).toEqual({ tarefa: "Corte a laser", desde: "2026-08-24T14:30:00.000Z" });
    expect(rai.aguardando).toBe(1);
  });
});

describe("setorDaPessoa — quem pertence a qual TV", () => {
  it("logística pelo setor OU pelo departamento", () => {
    expect(setorDaPessoa("Logística", null)).toBe("logistica");
    expect(setorDaPessoa("Produção", "Logística")).toBe("logistica");
  });
  it("produção inclui design e máquinas; vendas/adm ficam fora", () => {
    expect(setorDaPessoa("Produção", "Produção")).toBe("producao");
    expect(setorDaPessoa(null, "Design")).toBe("producao");
    expect(setorDaPessoa("Vendas", "Comercial")).toBeNull();
    expect(setorDaPessoa("Administrativo", "Financeiro")).toBeNull();
  });
});
