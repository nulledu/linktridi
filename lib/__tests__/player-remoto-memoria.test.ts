import { describe, expect, it, vi } from "vitest";
import { criarMemoriaRemota, FRESCO_MS, VELHO_MS, type RespostaRemota } from "@/lib/player-remoto";

// O servidor dos funis (gedux) perguntava o bot ao Gaius em TODA visita. Com a
// Vercel fria a ida levava 6–8 s ("Lento" no /status) e, estourando o prazo,
// o visitante via "Este link não está disponível" com o funil no ar.
describe("memória do servidor dedicado", () => {
  function montar(respostas: RespostaRemota<string>[]) {
    let t = 0;
    const buscar = vi.fn(async () => respostas.shift() ?? { tipo: "falhou" as const });
    const ler = criarMemoriaRemota<string>(buscar, () => t);
    return { ler, buscar, andar: (ms: number) => { t += ms; } };
  }

  it("dentro da janela fresca não vai ao Gaius", async () => {
    const m = montar([{ tipo: "achou", valor: "v1" }]);
    expect(await m.ler("a")).toBe("v1");
    m.andar(FRESCO_MS - 1);
    expect(await m.ler("a")).toBe("v1");
    expect(m.buscar).toHaveBeenCalledTimes(1);
  });

  it("vencida responde NA HORA com o guardado e atualiza por trás", async () => {
    const m = montar([{ tipo: "achou", valor: "v1" }, { tipo: "achou", valor: "v2" }]);
    await m.ler("a");
    m.andar(FRESCO_MS + 1);
    expect(await m.ler("a")).toBe("v1");
    await new Promise((r) => setTimeout(r, 0));
    expect(await m.ler("a")).toBe("v2");
  });

  it("falha de rede não apaga o funil (era o 'link indisponível' falso)", async () => {
    const m = montar([{ tipo: "achou", valor: "v1" }, { tipo: "falhou" }, { tipo: "falhou" }]);
    await m.ler("a");
    m.andar(VELHO_MS + 1);
    expect(await m.ler("a")).toBe("v1");
  });

  it("despublicado (404) some da memória", async () => {
    const m = montar([{ tipo: "achou", valor: "v1" }, { tipo: "nao_existe" }]);
    await m.ler("a");
    m.andar(VELHO_MS + 1);
    expect(await m.ler("a")).toBeNull();
  });

  it("visitas simultâneas sem nada guardado fazem UMA ida", async () => {
    const m = montar([{ tipo: "achou", valor: "v1" }]);
    const r = await Promise.all([m.ler("a"), m.ler("a"), m.ler("a")]);
    expect(r).toEqual(["v1", "v1", "v1"]);
    expect(m.buscar).toHaveBeenCalledTimes(1);
  });
});
