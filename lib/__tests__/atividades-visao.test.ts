import { describe, expect, it } from "vitest";
import {
  abertasPorItem, chaveDoItem, equipeAgora, filtrarRecentes, iconeDaEquipe, iconeDaTarefa, painelDaSemana,
  porDiaDoPrazo, porPrioridade, porSetor, rotuloDoPrazo, semanasDoMes, situacaoDoItem, variacao,
} from "../atividades-visao";
import { prioridadeDe, type Atividade } from "../atividades-catalog";
import { ICONS } from "../../app/(plataforma)/Icon";

const AGORA = Date.parse("2026-09-11T15:00:00.000Z");   // sexta
const DIA = 86_400_000;
const iso = (diasAtras: number) => new Date(AGORA - diasAtras * DIA).toISOString();

const at = (p: Partial<Atividade>): Atividade => ({
  id: Math.random().toString(36).slice(2), categoria: "Chancela", tarefa: "Montar alavancas", detalhe: null,
  para_id: null, para_nome: null, por_id: "x", por_nome: "x", status: "pendente", prazo: null,
  quantidade_alvo: 1, quantidade_feita: 0, tempo_estimado_min: null, iniciada_at: null, produto_id: null,
  produto_nome: null, estoque_lancado: false, created_at: iso(1), concluida_at: null, foto_url: null, ...p,
});

describe("painelDaSemana", () => {
  it("total = aberto agora + concluído na semana, e o MESMO recorte uma semana antes", () => {
    const p = painelDaSemana([
      at({ created_at: iso(2) }),                                                        // não existia há 7 dias
      at({ created_at: iso(3), status: "em_andamento", iniciada_at: iso(1) }),
      at({ created_at: iso(9), status: "concluida", iniciada_at: iso(8.5), concluida_at: iso(8) }),
      at({ created_at: iso(10), status: "concluida", iniciada_at: iso(9), concluida_at: iso(1) }), // há 7 dias: em andamento
      at({ created_at: iso(12), status: "pendente" }),                                  // pendente agora e antes
      at({ created_at: iso(30), status: "concluida", concluida_at: iso(29) }),           // fora dos dois
    ], AGORA);
    expect(p.agora).toEqual({ total: 4, concluidas: 1, emAndamento: 1, pendentes: 2 });
    expect(p.antes).toEqual({ total: 3, concluidas: 1, emAndamento: 1, pendentes: 1 });
  });

  it("concluída sem carimbo não entra no retrato antigo", () => {
    expect(painelDaSemana([at({ created_at: iso(20), status: "concluida", concluida_at: null })], AGORA).antes.total).toBe(0);
  });

  it("variação sem base não inventa +100%", () => {
    expect(variacao(5, 0)).toBeNull();
    expect(variacao(15, 10)).toBe(50);
    expect(variacao(5, 10)).toBe(-50);
  });
});

describe("prioridade", () => {
  it("ausente é Média; urgente sem escolha é Alta; a escolha manda", () => {
    expect(prioridadeDe({})).toBe("media");
    expect(prioridadeDe({ urgente: true })).toBe("alta");
    expect(prioridadeDe({ prioridade: "baixa", urgente: true })).toBe("baixa");
  });
  it("conta só a janela (aberto + feito na semana)", () => {
    expect(porPrioridade([
      at({ prioridade: "alta" }), at({ urgente: true }), at({ prioridade: "baixa", status: "em_andamento" }),
      at({ status: "concluida", concluida_at: iso(2) }), at({ prioridade: "alta", status: "concluida", concluida_at: iso(20) }),
    ], AGORA)).toEqual({ alta: 2, media: 1, baixa: 1 });
  });
});

describe("setor e recentes", () => {
  const lista = [
    at({ status: "pendente", setor: "Produção" }),
    at({ status: "em_andamento", para_id: "p1" }),
    at({ status: "concluida", concluida_at: iso(2), setor: "Logística" }),
    at({ status: "concluida", concluida_at: iso(20), setor: "Logística" }),   // fora da janela
  ];
  it("por setor usa o setor da ordem ou o da pessoa, maior primeiro", () => {
    const setorDe = (a: Atividade) => a.setor || (a.para_id === "p1" ? "Produção" : null);
    expect(porSetor(lista, setorDe, AGORA)).toEqual([{ setor: "Produção", n: 2 }, { setor: "Logística", n: 1 }]);
  });
  it("recentes: mais nova primeiro, com filtro de status e busca sem acento", () => {
    const l = [
      at({ tarefa: "Separar pedidos", created_at: iso(5) }),
      at({ tarefa: "Revisão de insumos", status: "em_andamento", created_at: iso(0.1) }),
      at({ tarefa: "Montar", para_nome: "João", created_at: iso(1) }),
    ];
    expect(filtrarRecentes(l, "todas").map((a) => a.tarefa)).toEqual(["Revisão de insumos", "Montar", "Separar pedidos"]);
    expect(filtrarRecentes(l, "em_andamento").map((a) => a.tarefa)).toEqual(["Revisão de insumos"]);
    expect(filtrarRecentes(l, "todas", "revisao").map((a) => a.tarefa)).toEqual(["Revisão de insumos"]);
    expect(filtrarRecentes(l, "todas", "joao").map((a) => a.tarefa)).toEqual(["Montar"]);
  });
});

describe("prazo e calendário", () => {
  const hoje = "2026-09-11";
  it("rótulo do prazo", () => {
    expect(rotuloDoPrazo("2026-09-11", hoje)).toEqual({ texto: "Hoje", atrasado: false });
    expect(rotuloDoPrazo("2026-09-12", hoje)).toEqual({ texto: "Amanhã", atrasado: false });
    expect(rotuloDoPrazo("2026-09-10", hoje)).toEqual({ texto: "Ontem", atrasado: true });
    expect(rotuloDoPrazo("2026-09-17", hoje)).toEqual({ texto: "Qui, 17/09", atrasado: false });
    expect(rotuloDoPrazo("2026-09-01", hoje)).toEqual({ texto: "Ter, 01/09", atrasado: true });
    expect(rotuloDoPrazo("2027-01-05", hoje)).toEqual({ texto: "05/01/2027", atrasado: false });
    expect(rotuloDoPrazo(null, hoje)).toBeNull();
  });
  it("semanas do mês, de domingo a sábado", () => {
    const s = semanasDoMes(2026, 8);   // setembro/2026 começa numa terça
    expect(s).toHaveLength(5);
    expect(s[0][0]).toEqual({ iso: "2026-08-30", dia: 30, doMes: false });
    expect(s[0][2]).toEqual({ iso: "2026-09-01", dia: 1, doMes: true });
    expect(s[4][6].iso).toBe("2026-10-03");
  });
  it("por dia do prazo: aberto antes de concluído, Alta antes de Baixa", () => {
    const m = porDiaDoPrazo([
      at({ tarefa: "c", prazo: "2026-09-11", status: "concluida" }),
      at({ tarefa: "b", prazo: "2026-09-11", prioridade: "baixa" }),
      at({ tarefa: "a", prazo: "2026-09-11", prioridade: "alta" }),
      at({ tarefa: "sem prazo" }),
    ]);
    expect([...m.keys()]).toEqual(["2026-09-11"]);
    expect(m.get("2026-09-11")!.map((a) => a.tarefa)).toEqual(["a", "b", "c"]);
  });
});

describe("equipe agora (bolinhas: verde livre, amarelo ocupado, vermelho fora)", () => {
  const gente = [
    { id: "davi", nome: "Davi", setor: "Produção", especialidade: "Máquinas" },
    { id: "bruno", nome: "Bruno", setor: "Produção", especialidade: "Máquinas" },
    { id: "joao", nome: "João", setor: "Produção", especialidade: "Preparo" },
    { id: "mikael", nome: "Mikael", setor: "Produção", especialidade: "Carimbo" },
    { id: "carla", nome: "Carla", setor: "Logística" },
    // A equipe de Logística de verdade: setor Produção, departamento Logística.
    { id: "felipe", nome: "Felipe", setor: "Produção", departamento: "Logística" },
    { id: "dono", nome: "Dono", setor: null },
    { id: "caio", nome: "Caio", setor: "Vendas" },
  ];
  const lista = [
    at({ para_id: "bruno", status: "em_andamento", tarefa: "Cortar peças do puxador" }),
    at({ para_id: "joao", status: "em_andamento", tarefa: "Preparar chapa" }),
    at({ para_id: "davi", status: "pendente" }),   // pendente não é ocupado
  ];
  const presenca = { registrados: ["davi", "bruno", "joao", "mikael", "carla"], presentes: ["davi", "bruno", "mikael"] };
  const g = equipeAgora(gente, lista, presenca);
  const col = (nome: string) => g.find((x) => x.grupo === nome)!;

  it("só três colunas: Produção, Máquinas e Logística (o resto fica fora)", () => {
    expect(g.map((x) => x.grupo)).toEqual(["Produção", "Máquinas", "Logística"]);
    const todos = g.flatMap((x) => x.pessoas.map((p) => p.nome));
    expect(todos).not.toContain("Dono");
    expect(todos).not.toContain("Caio");
  });

  it("o Preparo entra na Produção; a Logística vem do setor ou do departamento", () => {
    expect(col("Produção").pessoas.map((p) => p.nome)).toEqual(["Mikael", "João"]);
    expect(col("Logística").pessoas.map((p) => p.nome).sort()).toEqual(["Carla", "Felipe"]);
  });

  it("coluna vazia continua na grade", () => {
    expect(equipeAgora([gente[0]], [], null).map((x) => [x.grupo, x.pessoas.length])).toEqual([
      ["Produção", 0], ["Máquinas", 1], ["Logística", 0],
    ]);
  });

  it("presente e livre é verde; com atividade em andamento é amarelo; livre vem primeiro", () => {
    expect(col("Máquinas").pessoas.map((p) => [p.nome, p.estado, p.fazendo])).toEqual([
      ["Davi", "disponivel", null],
      ["Bruno", "ocupado", "Cortar peças do puxador"],
    ]);
    expect(col("Máquinas").contagem).toEqual({ disponivel: 1, ocupado: 1, ausente: 0 });
  });

  it("o ponto manda: fora da empresa é vermelho mesmo com atividade aberta", () => {
    expect(col("Produção").pessoas.find((p) => p.nome === "João")).toMatchObject({ estado: "ausente" });
    expect(col("Logística").pessoas.find((p) => p.nome === "Carla")).toMatchObject({ estado: "ausente" });
  });

  it("quem não usa o ponto conta como presente e a tela sabe que é 'sem ponto'", () => {
    expect(col("Logística").pessoas.find((p) => p.nome === "Felipe")).toMatchObject({ estado: "disponivel", semPonto: true });
    // Sem o ponto nenhum (tabela ausente): ninguém fica vermelho.
    expect(equipeAgora(gente, lista, null).flatMap((x) => x.pessoas).some((p) => p.estado === "ausente")).toBe(false);
  });
});

describe("ícones", () => {
  it("toda tarefa e equipe cai num ícone que existe no mapa do Tabler", () => {
    const tarefas = ["Cortar borracha", "Montar alavancas", "Limpar folhas", "Pintar MDF", "Embalar pedido", "Conferir",
      "Imprimir etiquetas", "Gravar a laser", "Repor insumos", "Entregar", "Postar nas redes", "Manutenção", "Planilha", "Outra coisa"];
    const setores = ["Produção", "Marketing", "Comercial", "Administrativo", "Logística", "Design", "Estoque", "Outro"];
    for (const t of tarefas) expect(ICONS[iconeDaTarefa(t)], t).toBeTruthy();
    for (const s of setores) expect(ICONS[iconeDaEquipe(s)], s).toBeTruthy();
    expect(iconeDaTarefa("Cortar borracha")).toBe("scissors");
  });
});

describe("itens da seção", () => {
  it("o selo: zerado, no mínimo (ou abaixo) ou em estoque", () => {
    expect(situacaoDoItem({ quantidade: 0, qtd_minima: 2 })).toBe("sem_estoque");
    expect(situacaoDoItem({ quantidade: 2, qtd_minima: 3 })).toBe("no_minimo");
    expect(situacaoDoItem({ quantidade: 3, qtd_minima: 3 })).toBe("no_minimo");
    expect(situacaoDoItem({ quantidade: 20, qtd_minima: 5 })).toBe("em_estoque");
    expect(situacaoDoItem({ quantidade: 4, qtd_minima: 0 })).toBe("em_estoque");
  });

  it("atividades abertas por item: pelo produto e pela categoria, uma vez só por atividade", () => {
    const m = abertasPorItem([
      at({ produto_nome: "Chapa EVA", categoria: "Chapa EVA" }),     // conta 1, não 2
      at({ categoria: "Puxador" }),
      at({ produto_nome: "Puxador", status: "em_andamento" }),
      at({ produto_nome: "Puxador", status: "concluida" }),          // fechada não conta
    ]);
    expect(m.get(chaveDoItem("chapa eva"))).toBe(1);
    expect(m.get(chaveDoItem("Puxador"))).toBe(2);
  });
});
