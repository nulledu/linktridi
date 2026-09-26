// A pergunta que o livro do bipe existe pra responder — e que ninguém estava
// fazendo, porque nada no sistema lia a tabela.
//
// "Se existe um 'pular', ele fica registrado? Sem registro, em uma semana todo
// mundo pula e o dado morre." O registro existia. A LEITURA não — e um registro
// que ninguém consegue olhar morre igual, só que em silêncio e com a sensação
// de que está tudo medido.
import { describe, it, expect } from "vitest";
import {
  resumirAberturas, fracaoSemBipe, rotuloDispensa, MOTIVOS_DISPENSA,
  FRACAO_DISPENSA_DEMAIS, type LinhaAbertura,
} from "@/lib/atividades-aberturas";

const bipe = (atividade_id: string): LinhaAbertura => ({ atividade_id, situacao: "baixada", motivo: null });
const dispensa = (atividade_id: string, motivo: string): LinhaAbertura => ({ atividade_id, situacao: "dispensado", motivo });

describe("resumirAberturas conta ORDENS, não linhas", () => {
  it("a ordem que consumiu três caixas conta uma vez", () => {
    // Contar linha faria "bipou" parecer três vezes mais comum do que é, e a
    // comparação com a dispensa (que escreve UMA linha) ficaria torta
    // justamente no número que decide se a saída virou o caminho normal.
    const r = resumirAberturas(
      [bipe("a1"), bipe("a1"), bipe("a1"), dispensa("a2", "sem_etiqueta")],
      { exigido: true },
    );
    expect(r.comBipe).toBe(1);
    expect(r.semBipe).toBe(1);
    expect(fracaoSemBipe(r)).toBe(0.5);
  });

  it("a ordem que bipou E registrou motivo conta como bipada", () => {
    // Ela teve material, que é o que a pergunta quer saber. Contar nos dois
    // lados faria o total passar do número de ordens.
    const r = resumirAberturas([bipe("a1"), dispensa("a1", "sem_material")], { exigido: true });
    expect(r.comBipe).toBe(1);
    expect(r.semBipe).toBe(0);
    expect(r.porMotivo).toEqual([]);
  });

  it("a mesma dispensa reenviada pela fila offline não vira duas", () => {
    const r = resumirAberturas(
      [dispensa("a1", "leitor_parado"), dispensa("a1", "leitor_parado")],
      { exigido: true },
    );
    expect(r.semBipe).toBe(1);
    expect(r.porMotivo).toEqual([{ motivo: "leitor_parado", rotulo: "O leitor não está funcionando", ordens: 1 }]);
  });

  it("etiqueta desconhecida ou já baixada continua sendo um bipe", () => {
    // A pessoa bipou. Que o banco não conheça a etiqueta é problema do
    // cadastro, não da abertura — e jogar isso na conta da saída faria a
    // dispensa parecer epidemia por causa de etiqueta velha.
    const r = resumirAberturas(
      [{ atividade_id: "a1", situacao: "desconhecida", motivo: null },
       { atividade_id: "a2", situacao: "ja_baixada", motivo: null }],
      { exigido: true },
    );
    expect(r.comBipe).toBe(2);
    expect(r.semBipe).toBe(0);
  });

  it("os motivos vêm do mais comum pro menos, com rótulo de gente", () => {
    const r = resumirAberturas(
      [dispensa("a1", "sem_material"), dispensa("a2", "sem_material"),
       dispensa("a3", "sem_material"), dispensa("a4", "etiqueta_ilegivel")],
      { exigido: true },
    );
    expect(r.porMotivo.map((m) => [m.rotulo, m.ordens])).toEqual([
      ["Esta atividade não usa material", 3],
      ["A etiqueta rasgou / não lê", 1],
    ]);
  });

  it("motivo que este servidor ainda não conhece aparece com o próprio nome", () => {
    // Uma versão mais nova do app pode mandar um motivo novo. Trocar por
    // "Outro" perderia a única informação da linha.
    const r = resumirAberturas([dispensa("a1", "motivo_do_futuro")], { exigido: true });
    expect(r.porMotivo[0].rotulo).toBe("motivo_do_futuro");
    expect(rotuloDispensa("motivo_do_futuro")).toBe("motivo_do_futuro");
  });

  it("linha sem atividade não derruba nem entra na conta", () => {
    const r = resumirAberturas(
      [{ atividade_id: "", situacao: "dispensado", motivo: "sem_etiqueta" }, bipe("a1")],
      { exigido: true },
    );
    expect(r.comBipe).toBe(1);
    expect(r.semBipe).toBe(0);
  });
});

describe("os estados em que a tela não pode inventar número", () => {
  it("tabela ausente é `semLivro`, não zero e zero", () => {
    // "0 com bipe, 0 sem bipar" leria como "ninguém usou a saída" — que é
    // exatamente a conclusão errada quando a verdade é "o SQL não rodou".
    const r = resumirAberturas([], { exigido: true, semLivro: true });
    expect(r.semLivro).toBe(true);
    expect(fracaoSemBipe(r)).toBeNull();
  });

  it("sem abertura nenhuma a fração é nula, não zero", () => {
    expect(fracaoSemBipe(resumirAberturas([], { exigido: false }))).toBeNull();
  });

  it("o limite de 'gente demais na saída' é fração, não contagem", () => {
    // 30 dispensas em 500 ordens é o galpão funcionando; 30 em 40 é a
    // exigência medindo a si mesma.
    const muitas = resumirAberturas(
      [...Array.from({ length: 470 }, (_, i) => bipe(`b${i}`)),
       ...Array.from({ length: 30 }, (_, i) => dispensa(`d${i}`, "sem_etiqueta"))],
      { exigido: true },
    );
    expect(fracaoSemBipe(muitas)!).toBeLessThan(FRACAO_DISPENSA_DEMAIS);

    const poucas = resumirAberturas(
      [...Array.from({ length: 10 }, (_, i) => bipe(`b${i}`)),
       ...Array.from({ length: 30 }, (_, i) => dispensa(`d${i}`, "sem_etiqueta"))],
      { exigido: true },
    );
    expect(fracaoSemBipe(poucas)!).toBeGreaterThan(FRACAO_DISPENSA_DEMAIS);
  });
});

describe("o vocabulário da dispensa", () => {
  it("tem chave única e rótulo escrito pra quem está de luva", () => {
    expect(new Set(MOTIVOS_DISPENSA.map((m) => m.key)).size).toBe(MOTIVOS_DISPENSA.length);
    for (const m of MOTIVOS_DISPENSA) {
      expect(m.label.length, `${m.key} precisa de rótulo`).toBeGreaterThan(4);
      expect(m.icon, `${m.key} precisa de ícone Tabler`).toBeTruthy();
    }
  });

  it("é o MESMO objeto que lib/atividade-bipes reexporta", async () => {
    // Duas listas de motivos é como elas divergem: o tablet mostraria um
    // rótulo e o relatório contaria outro.
    const bipes = await import("@/lib/atividade-bipes");
    expect(bipes.MOTIVOS_DISPENSA).toBe(MOTIVOS_DISPENSA);
  });
});
