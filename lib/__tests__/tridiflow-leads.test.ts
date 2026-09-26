import { describe, expect, it } from "vitest";
import {
  ESTAGIOS, NOTA_MAX, corDaPontuacao, ehEstagio, ehRecuperavel, emailDoLead, estaAberto,
  estagioDe, infoEstagio, nomeDoLead, notaSegura, pontuacao, situacaoDe, telefoneDoLead,
} from "../tridiflow-leads";

// Gestão de leads. O status antigo era calculado no cliente e jogado fora no
// F5: dava pra OLHAR a lista, não pra TRABALHAR a lista.
//
// A separação que este arquivo defende:
//   ESTÁGIO  — o que NÓS fizemos. Persistido, editável.
//   SITUAÇÃO — o que o LEAD deixou de dados. Derivada, nunca editável.
// Misturar os dois foi o que deixou "qualificado" ambíguo: era "tem perfil" ou
// era "preencheu tudo"?

const lead = (respostas: Record<string, string>, concluidaEm: string | null = null, estagio?: string | null) =>
  ({ respostas, concluidaEm, estagio });

describe("estágio", () => {
  it("ausente é 'novo' — lead que ninguém tocou", () => {
    expect(estagioDe(null)).toBe("novo");
    expect(estagioDe(undefined)).toBe("novo");
    expect(estagioDe("")).toBe("novo");
  });

  it("valor fora do catálogo não vira estágio inventado", () => {
    // Vem de banco: uma linha antiga ou um insert manual não pode pintar a tela
    // com um chip sem cor nem rótulo.
    expect(estagioDe("contactado")).toBe("novo");
    expect(ehEstagio("contactado")).toBe(false);
    expect(ehEstagio("contatado")).toBe(true);
  });

  it("todo estágio do catálogo tem rótulo e cor", () => {
    for (const e of ESTAGIOS) {
      expect(e.label, e.id).toBeTruthy();
      expect(e.cor, e.id).toMatch(/^var\(--/);
      expect(infoEstagio(e.id).id).toBe(e.id);
    }
  });

  it("ganho e perdido encerram; o resto continua aberto", () => {
    expect(estaAberto("ganho")).toBe(false);
    expect(estaAberto("perdido")).toBe(false);
    expect(estaAberto("novo")).toBe(true);
    expect(estaAberto("contatado")).toBe(true);
    expect(estaAberto(null)).toBe(true);
  });
});

describe("extração de contato", () => {
  it("acha o dado sob os apelidos que o funil costuma usar", () => {
    // O autor do funil escolhe o nome da variável. Procurar só por "telefone"
    // mostrava "—" na coluna e o número na aba de respostas, lado a lado.
    expect(telefoneDoLead({ whatsapp: "11999" })).toBe("11999");
    expect(telefoneDoLead({ fone: "11999" })).toBe("11999");
    expect(telefoneDoLead({ celular: "11999" })).toBe("11999");
    expect(nomeDoLead({ seu_nome: "Ana" })).toBe("Ana");
    expect(emailDoLead({ "E-mail": "a@b.co" })).toBe("a@b.co");
  });

  it("ignora acento e caixa na chave", () => {
    expect(nomeDoLead({ "Nome": "Ana" })).toBe("Ana");
    expect(emailDoLead({ "E-MAIL": "a@b.co" })).toBe("a@b.co");
  });

  it("chave desconhecida não vira contato", () => {
    expect(telefoneDoLead({ observacao: "me liga" })).toBe("");
    expect(nomeDoLead({})).toBe("");
  });

  it("valor vazio não conta", () => {
    expect(telefoneDoLead({ telefone: "" })).toBe("");
  });
});

describe("pontuação", () => {
  it("telefone pesa mais que e-mail — é por onde se vende", () => {
    expect(pontuacao(lead({ telefone: "11999" }))).toBeGreaterThan(pontuacao(lead({ email: "a@b.co" })));
  });

  it("lead completo e concluído chega a 100", () => {
    expect(pontuacao(lead({ nome: "Ana", email: "a@b.co", telefone: "11999" }, "2026-08-14"))).toBe(100);
  });

  it("lead vazio é zero", () => {
    expect(pontuacao(lead({}))).toBe(0);
  });

  it("cor acompanha a faixa", () => {
    expect(corDaPontuacao(80)).toBe("var(--ok)");
    expect(corDaPontuacao(50)).toBe("var(--atencao)");
    expect(corDaPontuacao(10)).toBe("var(--perigo)");
  });
});

describe("recuperação", () => {
  it("deixou telefone e não terminou = recuperável", () => {
    expect(ehRecuperavel(lead({ telefone: "11999" }, null))).toBe(true);
  });

  it("e-mail também serve — dá pra falar com a pessoa", () => {
    expect(ehRecuperavel(lead({ email: "a@b.co" }, null))).toBe(true);
  });

  it("quem concluiu não é recuperação, é lead pronto", () => {
    expect(ehRecuperavel(lead({ telefone: "11999" }, "2026-08-14"))).toBe(false);
  });

  it("quem não deixou contato não dá pra recuperar", () => {
    // É a distinção que a lista antiga não fazia: os dois eram "incompleto".
    expect(ehRecuperavel(lead({ q1: "sim" }, null))).toBe(false);
  });

  it("lead já encerrado sai da fila mesmo com telefone", () => {
    // Marcou "perdido" e ele voltaria todo dia na lista de recuperação —
    // exatamente o trabalho repetido que a persistência veio resolver.
    expect(ehRecuperavel(lead({ telefone: "11999" }, null, "perdido"))).toBe(false);
    expect(ehRecuperavel(lead({ telefone: "11999" }, null, "ganho"))).toBe(false);
    expect(ehRecuperavel(lead({ telefone: "11999" }, null, "contatado"))).toBe(true);
  });
});

describe("situação (derivada, nunca editável)", () => {
  it("os três casos são distinguíveis", () => {
    expect(situacaoDe(lead({ telefone: "1" }, "2026-08-14")).id).toBe("completo");
    expect(situacaoDe(lead({ telefone: "1" }, null)).id).toBe("recuperavel");
    expect(situacaoDe(lead({}, null)).id).toBe("incompleto");
  });

  it("independe do estágio — são eixos separados", () => {
    // Um lead pode estar "ganho" com dados incompletos.
    expect(situacaoDe(lead({}, null, "ganho")).id).toBe("incompleto");
  });
});

describe("notaSegura", () => {
  it("corta no limite", () => {
    expect(notaSegura("a".repeat(5000))).toHaveLength(NOTA_MAX);
  });

  it("tira espaço sobrando no fim e aceita vazio", () => {
    expect(notaSegura("ligar amanhã   ")).toBe("ligar amanhã");
    expect(notaSegura(undefined)).toBe("");
    expect(notaSegura(null)).toBe("");
  });

  it("preserva quebra de linha no meio", () => {
    expect(notaSegura("linha 1\nlinha 2")).toBe("linha 1\nlinha 2");
  });
});
