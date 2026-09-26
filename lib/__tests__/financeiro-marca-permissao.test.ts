import { describe, expect, it } from "vitest";
import { podeEditarMarca } from "@/lib/financeiro/permissao-marca";
import type { PoderesFinanceiro } from "@/lib/financeiro/gate";

const semPoderes = (): PoderesFinanceiro => ({
  ver: false,
  compromissos: false,
  compras: false,
  notas: false,
  patrimonio: false,
  cadastros: false,
  pagar: false,
  contas: false,
  folha: false,
  config: false,
  acessos: false,
});

const com = (...chaves: Array<keyof PoderesFinanceiro>): PoderesFinanceiro => {
  const poderes = semPoderes();
  for (const chave of chaves) poderes[chave] = true;
  return poderes;
};

describe("permissão para imagens do Financeiro", () => {
  it("deixa quem edita Contas trocar a imagem da conta", () => {
    expect(podeEditarMarca("conta", com("contas"))).toBe(true);
  });

  it("mantém a conta editável pela galeria de Configurações", () => {
    expect(podeEditarMarca("conta", com("config"))).toBe(true);
  });

  it.each([
    ["empresa", "config"],
    ["fornecedor", "cadastros"],
    ["contato", "cadastros"],
    ["recorrencia", "cadastros"],
    ["colaborador", "folha"],
  ] as const)("exige o poder dono para %s", (tipo, poder) => {
    expect(podeEditarMarca(tipo, com(poder))).toBe(true);
    expect(podeEditarMarca(tipo, semPoderes())).toBe(false);
  });

  it("não aceita poderes sem relação com o cadastro", () => {
    expect(podeEditarMarca("empresa", com("cadastros", "contas"))).toBe(false);
    expect(podeEditarMarca("fornecedor", com("config", "folha"))).toBe(false);
    expect(podeEditarMarca("colaborador", com("cadastros", "config"))).toBe(false);
  });
});
