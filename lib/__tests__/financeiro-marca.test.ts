import { describe, expect, it } from "vitest";
import { concluirTrocaDeMarca } from "@/lib/financeiro/marca-consistente";

describe("troca consistente de marca", () => {
  it("remove o upload novo quando atualizar a linha falha", async () => {
    const removidos: string[] = [];
    const r = await concluirTrocaDeMarca({
      caminhoNovo: "logos/empresa/nova.png",
      caminhoAnterior: "logos/empresa/antiga.png",
      atualizar: async () => ({ message: "banco indisponível" }),
      remover: async (caminhos) => { removidos.push(...caminhos); },
    });
    expect(r).toEqual({ ok: false, erro: "banco indisponível" });
    expect(removidos).toEqual(["logos/empresa/nova.png"]);
  });

  it("só remove o caminho antigo depois do update bem-sucedido", async () => {
    const eventos: string[] = [];
    const r = await concluirTrocaDeMarca({
      caminhoNovo: "logos/empresa/nova.png",
      caminhoAnterior: "logos/empresa/antiga.png",
      atualizar: async () => { eventos.push("update"); return null; },
      remover: async (caminhos) => { eventos.push(`remove:${caminhos.join(",")}`); },
    });
    expect(r).toEqual({ ok: true });
    expect(eventos).toEqual(["update", "remove:logos/empresa/antiga.png"]);
  });

  it("não remove nada antigo no primeiro upload", async () => {
    const removidos: string[][] = [];
    await concluirTrocaDeMarca({
      caminhoNovo: "logos/empresa/nova.png", caminhoAnterior: null,
      atualizar: async () => null,
      remover: async (caminhos) => { removidos.push(caminhos); },
    });
    expect(removidos).toEqual([]);
  });
});
