import { describe, it, expect } from "vitest";
import {
  acharLocal, codigoLivre, descritivoDoLocal, identificadoresDoLocal, limparNota,
  locaisParecidos, normalizarLocal, planejarLocal, semelhancaLocal, sugerirLocais,
  NOME_LOCAL_MAX, NOTA_MAX, type LocalConhecido,
} from "@/lib/estoque-local-do-item";

// O que este arquivo trava: o mutirão do galpão digita o lugar num campo de
// texto, no celular, andando. Duas falhas opostas arruinariam o trabalho —
// GRAFIA NOVA a cada digitação (quinze versões do mesmo corredor) e FUSÃO
// ERRADA (a prateleira A3 engolindo a A4 por parecença de letras). Os dois
// casos estão aqui.

const local = (nome: string, codigo: string, id = nome): LocalConhecido => ({ id, nome, codigo });

describe("a chave do nome junta o que é a mesma prateleira", () => {
  it("ignora caixa, acento e espaço repetido", () => {
    expect(normalizarLocal("Prateleira A3")).toBe("prateleira a3");
    expect(normalizarLocal("prateleira  a3")).toBe("prateleira a3");
    expect(normalizarLocal("PRATELEIRA-A3")).toBe("prateleira a3");
    expect(normalizarLocal("Depósito")).toBe("deposito");
  });

  it("letra solta grudada no número é a mesma coisa que separada", () => {
    expect(normalizarLocal("Prateleira A 3")).toBe(normalizarLocal("Prateleira A3"));
  });

  it("zero à esquerda é jeito de escrever, não outro lugar", () => {
    expect(normalizarLocal("Corredor 02")).toBe(normalizarLocal("Corredor 2"));
    expect(normalizarLocal("A03")).toBe(normalizarLocal("A3"));
  });

  it("conectivo do meio some; o do fim fica", () => {
    expect(normalizarLocal("Sala de tintas")).toBe("sala tintas");
    expect(normalizarLocal("Fundo do galpão")).toBe("fundo galpao");
  });

  // Esta é a que protege o galpão: se "a" fosse tratado como palavra vazia,
  // "Prateleira A" e "Prateleira B" virariam a MESMA linha em estoque_locais e
  // duas estantes inteiras se misturariam sem ninguém ver.
  it("NUNCA descarta letra de uma só — ela é o endereço", () => {
    expect(normalizarLocal("Prateleira A")).not.toBe(normalizarLocal("Prateleira B"));
    expect(normalizarLocal("Prateleira A")).toBe("prateleira a");
  });
});

describe("o identificador é o significado do nome", () => {
  it("separa o que endereça do que descreve", () => {
    expect(identificadoresDoLocal("Prateleira A3")).toEqual(["a3"]);
    expect(descritivoDoLocal("Prateleira A3")).toBe("prateleira");
    expect(identificadoresDoLocal("Sala de tintas")).toEqual([]);
    expect(descritivoDoLocal("Sala de tintas")).toBe("sala tintas");
  });

  it("A3 e A4 NÃO se parecem, por mais letras que dividam", () => {
    expect(semelhancaLocal("Prateleira A3", "Prateleira A4")).toBe(0);
    expect(semelhancaLocal("Corredor 2", "Corredor 3")).toBe(0);
  });

  it("mesma prateleira escrita diferente é 1", () => {
    expect(semelhancaLocal("Prateleira A3", "prateleira  a3")).toBe(1);
    expect(semelhancaLocal("Corredor 02", "corredor 2")).toBe(1);
  });

  it("mesmo endereço com descrição a mais parece, sim", () => {
    expect(semelhancaLocal("Prateleira A3", "Prateleira A3 do fundo")).toBeGreaterThan(0.72);
  });

  it("estante e prateleira no mesmo número são coisas diferentes", () => {
    expect(semelhancaLocal("Estante A3", "Prateleira A3")).toBeLessThan(0.72);
  });
});

describe("achar o lugar que a pessoa quis dizer", () => {
  const locais = [
    local("Prateleira A3", "A3"),
    local("Sala de tintas", "SALA-TINTAS"),
  ];

  it("acha pelo nome, sem ligar pra grafia", () => {
    expect(acharLocal("prateleira a3", locais)?.codigo).toBe("A3");
    expect(acharLocal("PRATELEIRA  A3", locais)?.codigo).toBe("A3");
    expect(acharLocal("sala de tintas", locais)?.codigo).toBe("SALA-TINTAS");
  });

  // Quem está de pé na frente da prateleira lê o código impresso nela.
  it("acha pelo código impresso", () => {
    expect(acharLocal("A3", locais)?.nome).toBe("Prateleira A3");
    expect(acharLocal("a3", locais)?.nome).toBe("Prateleira A3");
  });

  it("não inventa parentesco: A4 não é A3", () => {
    expect(acharLocal("Prateleira A4", locais)).toBeNull();
  });
});

describe("o plano é mostrado antes de gravar", () => {
  const locais = [local("Prateleira A3", "A3")];

  it("campo vazio não faz nada", () => {
    expect(planejarLocal("   ", locais)).toEqual({ tipo: "vazio" });
  });

  it("o que já existe entra no que existe", () => {
    const p = planejarLocal("prateleira a3", locais);
    expect(p.tipo).toBe("existente");
    if (p.tipo === "existente") expect(p.local.codigo).toBe("A3");
  });

  it("o que não existe vira lugar novo, com código previsível", () => {
    const p = planejarLocal("Prateleira A4", locais);
    expect(p).toMatchObject({ tipo: "novo", codigo: "PRATELEIRA-A4", nome: "Prateleira A4" });
    // A4 é vizinha de A3, não parecida com ela: nada de aviso.
    if (p.tipo === "novo") expect(p.parecidos).toEqual([]);
  });

  it("quem quer código curto escreve os dois — mesma regra da aba Localização", () => {
    expect(planejarLocal("B2 · Prateleira do fundo", locais))
      .toMatchObject({ tipo: "novo", codigo: "B2", nome: "Prateleira do fundo" });
  });

  it("avisa quando o nome novo parece com um que já existe", () => {
    const p = planejarLocal("Prateleira A3 do fundo", locais);
    expect(p.tipo).toBe("novo");
    if (p.tipo === "novo") expect(p.parecidos.map((l) => l.codigo)).toEqual(["A3"]);
  });

  it("frase inteira não é endereço", () => {
    expect(planejarLocal("x".repeat(NOME_LOCAL_MAX + 1), locais))
      .toEqual({ tipo: "longo", max: NOME_LOCAL_MAX });
  });
});

// ── A pontuação do nome não pode virar corte de coluna ───────────────────────
// O campo do celular é UM campo de texto e quem digita está no galpão, não
// colando planilha. Antes, o mesmo separador da colagem (`,` `;` `:` ` - `)
// valia aqui, e o nome digitado saía picado: "Corredor do fundo, estante de
// cima" virava um lugar CHAMADO "estante de cima" com o código
// CORREDOR-DO-FUNDO. Medido na tela, não deduzido.
describe("o que a pessoa digita é o nome do lugar, vírgula inclusive", () => {
  const locais = [local("Prateleira A3", "PRATELEIRA-A3")];

  it("vírgula, dois-pontos e hífen com espaço fazem parte do nome", () => {
    for (const texto of ["Corredor do fundo, estante de cima", "Corredor do fundo: estante de cima"]) {
      const p = planejarLocal(texto, locais);
      expect(p.tipo, texto).toBe("novo");
      if (p.tipo === "novo") expect(p.nome, texto).toBe(texto);
    }
  });

  // O caso caro: com o corte antigo isto criava "A3" com o código PRATELEIRA,
  // e sem nenhum aviso — o nome que sobrava pra comparar já era outro.
  it("“Prateleira - A3” entra na Prateleira A3 que já existe", () => {
    const p = planejarLocal("Prateleira - A3", locais);
    expect(p.tipo).toBe("existente");
    if (p.tipo === "existente") expect(p.local.nome).toBe("Prateleira A3");
  });

  it("duas prateleiras do mesmo corredor não colidem mais no código", () => {
    const a = planejarLocal("Corredor 2, prateleira de baixo", []);
    const b = planejarLocal("Corredor 2, prateleira de cima", []);
    expect(a.tipo === "novo" && b.tipo === "novo").toBe(true);
    if (a.tipo === "novo" && b.tipo === "novo") expect(a.codigo).not.toBe(b.codigo);
  });

  it("mas o atalho ensinado na dica continua valendo", () => {
    expect(planejarLocal("B2 · Prateleira do fundo", locais))
      .toMatchObject({ tipo: "novo", codigo: "B2", nome: "Prateleira do fundo" });
    expect(planejarLocal("B2 - Prateleira do fundo", locais))
      .toMatchObject({ tipo: "novo", codigo: "B2", nome: "Prateleira do fundo" });
  });

  it("hífen colado é nome, não corte", () => {
    expect(planejarLocal("A3-fundo", [])).toMatchObject({ tipo: "novo", nome: "A3-fundo" });
  });
});

// ── Digitar só o endereço não pode criar um lugar calado ─────────────────────
// Quem está de pé na frente da estante digita o que está ESCRITO nela. Como o
// lugar criado por esta tela a partir de "Prateleira A3" fica com o código
// PRATELEIRA-A3, a porta do código não abre — sobra o aviso, e ele saía com 0.
describe("“A3” pergunta se é a Prateleira A3", () => {
  const locais = [local("Prateleira A3", "PRATELEIRA-A3")];

  it("o endereço nu parece com o nome que o contém", () => {
    expect(semelhancaLocal("A3", "Prateleira A3")).toBeGreaterThan(0.72);
    expect(semelhancaLocal("A3", "Prateleira A3")).toBeLessThan(1);
  });

  it("o plano avisa em vez de criar de mansinho", () => {
    const p = planejarLocal("A3", locais);
    expect(p.tipo).toBe("novo");
    if (p.tipo === "novo") expect(p.parecidos.map((l) => l.nome)).toEqual(["Prateleira A3"]);
  });

  // Nunca funde: continua sendo pergunta, e endereço diferente segue em 0.
  it("A3 não pergunta nada sobre a A4", () => {
    expect(semelhancaLocal("A3", "Prateleira A4")).toBe(0);
    expect(locaisParecidos("A4", locais)).toEqual([]);
  });
});

describe("código que colide ganha sufixo em vez de recusar a gravação", () => {
  it("no meio do galpão ninguém para pra inventar código", () => {
    expect(codigoLivre("A3", [local("Prateleira A3", "A3")])).toBe("A3-2");
    expect(codigoLivre("A3", [local("x", "A3"), local("y", "A3-2")])).toBe("A3-3");
    expect(codigoLivre("B7", [local("Prateleira A3", "A3")])).toBe("B7");
  });
});

describe("sugestão enquanto digita", () => {
  const locais = [local("Prateleira A3", "A3"), local("Prateleira A4", "A4"), local("Sala de tintas", "ST")];

  // Ver o que já existe ANTES de escrever é o que impede a décima quinta
  // grafia do mesmo corredor.
  it("campo vazio mostra o que já existe", () => {
    expect(sugerirLocais("", locais).map((l) => l.codigo)).toEqual(["A3", "A4", "ST"]);
  });

  it("começo do nome vem primeiro", () => {
    expect(sugerirLocais("prat", locais).map((l) => l.codigo)).toEqual(["A3", "A4"]);
  });

  it("o código também busca", () => {
    expect(sugerirLocais("A4", locais).map((l) => l.codigo)).toEqual(["A4"]);
  });

  it("nada a ver não sugere nada", () => {
    expect(sugerirLocais("mezanino", locais)).toEqual([]);
  });
});

describe("a nota", () => {
  it("tira o acidente do teclado e trava o tamanho", () => {
    expect(limparNota("  usar só no carimbo redondo  ")).toBe("usar só no carimbo redondo");
    expect(limparNota("a\n\n\n\n\nb")).toBe("a\n\nb");
    expect(limparNota("x".repeat(NOTA_MAX + 50))).toHaveLength(NOTA_MAX);
  });
});
