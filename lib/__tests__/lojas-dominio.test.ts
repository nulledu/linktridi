import { describe, expect, it } from "vitest";
import { resumoDaSituacao, situacaoDoDominio } from "@/lib/lojas-dominio";

const LOJA = { id: "l1", nome: "Carimbos Tridi", publicada: true };

describe("o que falta pra um domínio funcionar", () => {
  it("sem DNS: manda apontar E manda liberar na hospedagem, ao mesmo tempo", () => {
    // As duas juntas de propósito. Esconder a da Vercel atrás da do DNS foi o
    // que fez a etapa da hospedagem virar surpresa: a pessoa apontava o DNS,
    // esperava, e concluía que o sistema estava quebrado.
    const s = situacaoDoDominio({ host: "gedux.com.br", estado: "sem_dns", loja: LOJA });
    expect(s.pendencias.map((p) => p.chave)).toEqual(["dns", "vercel"]);
    expect(s.pronto).toBe(false);
  });

  it("a instrução de DNS do domínio RAIZ é registro A, não CNAME", () => {
    const s = situacaoDoDominio({ host: "gedux.com.br", estado: "sem_dns", loja: LOJA });
    const dns = s.pendencias.find((p) => p.chave === "dns")!.dns!;
    expect(dns.find((l) => l.campo === "Tipo")!.valor).toBe("A");
  });

  it("subdomínio recebe CNAME com só o subdomínio no nome", () => {
    const s = situacaoDoDominio({ host: "loja.gedux.com.br", estado: "sem_dns", loja: LOJA });
    const dns = s.pendencias.find((p) => p.chave === "dns")!.dns!;
    expect(dns.find((l) => l.campo === "Tipo")!.valor).toBe("CNAME");
    expect(dns.find((l) => l.campo === "Nome / Host")!.valor).toBe("loja");
  });

  it("DNS certo e hospedagem sem o domínio: some o passo do DNS, fica o da Vercel", () => {
    const s = situacaoDoDominio({ host: "loja.gedux.com.br", estado: "falta_vercel", loja: LOJA });
    expect(s.pendencias.map((p) => p.chave)).toEqual(["vercel"]);
  });

  it("endereço sem loja nenhuma não está pronto, mesmo com tudo conectado", () => {
    const s = situacaoDoDominio({ host: "loja.gedux.com.br", estado: "ativo", loja: null });
    expect(s.pendencias.map((p) => p.chave)).toEqual(["loja"]);
    expect(s.pronto).toBe(false);
  });

  it("loja em RASCUNHO é pendência — DNS certo e 404 mesmo assim", () => {
    const s = situacaoDoDominio({
      host: "loja.gedux.com.br", estado: "ativo",
      loja: { id: "l2", nome: "Tridi Brindes", publicada: false },
    });
    expect(s.pendencias.map((p) => p.chave)).toEqual(["publicar"]);
    expect(s.pendencias[0].rota).toBe("/lojas/l2/configuracoes");
  });

  it("tudo no lugar: nenhuma pendência e o resumo diz o endereço", () => {
    const s = situacaoDoDominio({ host: "loja.gedux.com.br", estado: "ativo", loja: LOJA });
    expect(s.pendencias).toEqual([]);
    expect(s.pronto).toBe(true);
    expect(resumoDaSituacao(s)).toContain("https://loja.gedux.com.br");
  });

  it("o resumo aponta a PRIMEIRA pendência, que é por onde se começa", () => {
    const s = situacaoDoDominio({ host: "gedux.com.br", estado: "sem_dns", loja: LOJA });
    expect(resumoDaSituacao(s).toLowerCase()).toContain("dns");
  });
});
