import { describe, it, expect } from "vitest";
import { normalizarSku, skuInvalido, sugerirSku, donoDoSku } from "../estoque-sku";
import { codigoDaUnidade, partirCodigo } from "../estoque-unidades";

// O SKU vira o começo do código de toda etiqueta física do item. Um SKU
// repetido não dá erro na hora de salvar — ele explode semanas depois, quando
// a segunda geração calcula o mesmo sequencial e bate na UNIQUE de
// `estoque_unidades.codigo` com a mensagem errada ("tente de novo"). Estes
// testes travam as três coisas que impedem isso: a sugestão nunca repete, o
// formato aceito continua voltando inteiro do leitor, e quem já usa o SKU é
// encontrado antes de gravar.

describe("sugerirSku — um prefixo só, numeração global", () => {
  // O catálogo tinha oito prefixos, um por hierarquia (MP, MPP, CMP, PEC, PRD…),
  // e acabou com cinco convenções vivas ao mesmo tempo mais os de tecla amassada.
  // Decisão do dono: "padroniza os códigos pra tudo ser PRD-0000, PRD-0001".
  // O que estes casos travam é a consequência: a numeração é GLOBAL, então dois
  // itens nunca disputam o mesmo número por estarem em hierarquias diferentes.

  it("começa no 1 quando ninguém usou o prefixo", () => {
    expect(sugerirSku("peca", [])).toBe("PRD-0001");
    expect(sugerirSku("produto", [null, "", undefined])).toBe("PRD-0001");
  });

  it("a hierarquia NÃO muda mais o prefixo — era o defeito que gerou MP-0001 num item Processada", () => {
    const usados = ["PRD-0001", "PRD-0002"];
    for (const h of ["peca", "produto", "materia_prima", "mp_processada", "componente"]) {
      expect(sugerirSku(h, usados), h).toBe("PRD-0003");
    }
  });

  it("segue do ÚLTIMO usado, ignorando o que está fora do padrão", () => {
    // "iJIFYU7" e "PM246MM" existem no catálogo do dono. Eles não entram na
    // conta (não são do padrão) mas continuam ocupando o nome deles.
    const usados = ["PRD-0001", "PRD-0002", "iJIFYU7", "PM246MM"];
    expect(sugerirSku("peca", usados)).toBe("PRD-0003");
  });

  it("buraco na sequência não faz a numeração VOLTAR", () => {
    // Este é o catálogo real: 245 SKUs, o maior é PRD-0246 — um número foi
    // pulado em algum momento. `quantos existem + 1` devolvia PRD-0246, que já
    // é de alguém; o laço de escape corrigia calado e a tela prometia um número
    // diferente do que a etiqueta ia sair. Sequência anda pelo ÚLTIMO.
    const usados = ["PRD-0001", "PRD-0002", "PRD-0004"];
    expect(sugerirSku("peca", usados)).toBe("PRD-0005");
  });

  it("é literalmente último + 1 — PRD-0246 vira PRD-0247", () => {
    expect(sugerirSku("produto", ["PRD-0246"])).toBe("PRD-0247");
  });

  it("largura de zeros não muda o número: PRD-246 e PRD-0246 são o mesmo 246", () => {
    expect(sugerirSku("produto", ["PRD-246"])).toBe("PRD-0247");
  });

  it("pula buraco ocupado em vez de devolver um SKU já usado", () => {
    // Dois do prefixo (a conta cairia em PRD-0003), mas PRD-0003 já é de alguém
    // que digitou à mão.
    const usados = ["PRD-0001", "PRD-0002", "PRD-0003"];
    expect(sugerirSku("peca", usados)).toBe("PRD-0004");
  });

  it("compara sem ligar pra caixa e espaço", () => {
    expect(sugerirSku("peca", [" prd-0001 "])).toBe("PRD-0002");
  });

  it("hierarquia desconhecida agora TEM sugestão — o prefixo não depende dela", () => {
    // Antes devolvia null: sem hierarquia não havia prefixo. Com um prefixo só,
    // recusar seria deixar sem código um item que pode perfeitamente ter um.
    expect(sugerirSku(null, [])).toBe("PRD-0001");
    expect(sugerirSku("inventada", ["PRD-0001"])).toBe("PRD-0002");
  });
});

describe("skuInvalido — o que pode virar etiqueta", () => {
  it("vazio é válido: quem não escolhe recebe o automático ao gerar", () => {
    expect(skuInvalido("")).toBeNull();
    expect(skuInvalido(null)).toBeNull();
  });

  it("aceita o formato automático e o digitado à mão", () => {
    expect(skuInvalido("PRD-0001")).toBeNull();
    expect(skuInvalido("MDF6MM-BR-18")).toBeNull();
    expect(skuInvalido("CX01")).toBeNull();
  });

  it("recusa espaço, símbolo, hífen solto e tamanho fora", () => {
    expect(skuInvalido("CX 01")).toBeTruthy();
    expect(skuInvalido("PEC#1")).toBeTruthy();
    expect(skuInvalido("-PEC")).toBeTruthy();
    expect(skuInvalido("PEC-")).toBeTruthy();
    expect(skuInvalido("A")).toBeTruthy();
    expect(skuInvalido("A".repeat(25))).toBeTruthy();
  });

  it("o SKU sugerido sobrevive à ida e volta pelo código da etiqueta", () => {
    const sku = sugerirSku("peca", ["PRD-0001"]) as string;
    const codigo = codigoDaUnidade(sku, 42);
    expect(codigo).toBe("PRD-0002-000042");
    expect(partirCodigo(codigo)).toEqual({ sku: "PRD-0002", seq: 42 });
  });
});

describe("donoDoSku — a colisão é encontrada ANTES de gravar", () => {
  const itens = [
    { id: "a", nome: "Chapa MDF", sku: "MDF6MM" },
    { id: "b", nome: "Caixa 01", sku: "cx01" },
    { id: "c", nome: "Sem SKU", sku: null },
  ];

  it("acha ignorando caixa", () => {
    expect(donoDoSku(itens, "CX01")?.nome).toBe("Caixa 01");
  });

  it("não acusa o próprio item de duplicar a si mesmo", () => {
    expect(donoDoSku(itens, "CX01", "b")).toBeNull();
  });

  it("SKU livre não tem dono", () => {
    expect(donoDoSku(itens, "PRD-0001")).toBeNull();
  });
});

describe("normalizarSku", () => {
  it("tira a borda em branco e sobe pra maiúscula", () => {
    expect(normalizarSku("  mdf6mm ")).toBe("MDF6MM");
  });

  it("mantém o espaço do meio pra quem valida poder recusar em vez de apagar calado", () => {
    expect(normalizarSku(" cx 01 ")).toBe("CX 01");
    expect(skuInvalido("cx 01")).toBeTruthy();
  });
});
