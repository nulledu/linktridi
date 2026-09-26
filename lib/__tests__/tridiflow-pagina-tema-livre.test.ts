import { describe, expect, it } from "vitest";
import {
  FONTES, GRADIENTES, GRADIENTE_CUSTOM_PADRAO, cssDoGradiente, cssGradienteCustom,
  familiaDaFonte, familiaLivre, gradienteEhEscuro,
} from "../tridiflow-pagina-tema";

// A personalização de tipografia e de fundo tinha teto: 6 fontes e 10
// gradientes, os dois como união fechada no código. A lista fechada existia por
// um motivo bom — não aceitar CSS escrito pelo usuário. Estes testes travam a
// forma de abrir sem perder essa proteção: número e cor entram, CSS não.

describe("familiaLivre", () => {
  it("nome simples vira pilha com reserva", () => {
    // Sem a reserva, a página fica sem fonte nenhuma quando a família não
    // existe no aparelho de quem abriu o anúncio.
    expect(familiaLivre("Futura")).toBe("Futura, system-ui, sans-serif");
  });

  it("nome com espaço ganha aspas", () => {
    // Sem aspas o navegador ignora a família em silêncio — é o "escolhi a
    // fonte e não mudou nada".
    expect(familiaLivre("Helvetica Neue")).toBe('"Helvetica Neue", system-ui, sans-serif');
  });

  it("aceita uma pilha digitada e não duplica aspas", () => {
    expect(familiaLivre('"Segoe UI", Arial')).toBe('"Segoe UI", Arial, system-ui, sans-serif');
  });

  it("tentativa de injeção de CSS não passa", () => {
    // O valor vai direto pra `font-family` num style inline.
    expect(familiaLivre("Arial; background: url(//x)")).toBe("");
    expect(familiaLivre("Arial}")).toBe("");
    expect(familiaLivre("var(--x)")).toBe("");
    expect(familiaLivre("")).toBe("");
    expect(familiaLivre(undefined)).toBe("");
  });
});

describe("familiaDaFonte", () => {
  it("id do catálogo devolve a família auto-hospedada", () => {
    expect(familiaDaFonte("inter")).toContain("--tfp-f-inter");
    expect(familiaDaFonte("roboto")).toContain("--tfp-f-roboto");
  });

  it("nome livre é aceito", () => {
    expect(familiaDaFonte("Futura")).toBe("Futura, system-ui, sans-serif");
  });

  it("vazio ou lixo cai no sistema", () => {
    expect(familiaDaFonte(undefined)).toBe(FONTES[0].css);
    expect(familiaDaFonte("Arial; background: url(//x)")).toBe(FONTES[0].css);
  });

  it("todo id do catálogo resolve — nenhum entra como família livre por engano", () => {
    for (const f of FONTES) expect(familiaDaFonte(f.id), f.id).toBe(f.css);
  });
});

describe("cssGradienteCustom", () => {
  it("monta o CSS a partir dos números", () => {
    expect(cssGradienteCustom({ angulo: 90, paradas: [{ cor: "#000000", pos: 0 }, { cor: "#ffffff", pos: 100 }] }))
      .toBe("linear-gradient(90deg, #000000 0%, #ffffff 100%)");
  });

  it("ordena as paradas pela posição", () => {
    // Fora de ordem, o navegador trava a parada seguinte na anterior e o
    // gradiente sai com uma faixa chapada.
    expect(cssGradienteCustom({ angulo: 0, paradas: [{ cor: "#ffffff", pos: 80 }, { cor: "#000000", pos: 10 }] }))
      .toBe("linear-gradient(0deg, #000000 10%, #ffffff 80%)");
  });

  it("cor que não é hexadecimal é descartada", () => {
    const css = cssGradienteCustom({ angulo: 90, paradas: [
      { cor: "#000000", pos: 0 }, { cor: "red; background: url(//x)", pos: 50 }, { cor: "#ffffff", pos: 100 },
    ] });
    expect(css).toBe("linear-gradient(90deg, #000000 0%, #ffffff 100%)");
    expect(css).not.toContain("url");
  });

  it("menos de duas paradas válidas não vira gradiente", () => {
    // Devolver "" faz quem chama cair no fundo de cor, em vez de aplicar um
    // `background` quebrado.
    expect(cssGradienteCustom({ angulo: 90, paradas: [{ cor: "#000000", pos: 0 }] })).toBe("");
    expect(cssGradienteCustom({ angulo: 90, paradas: [] })).toBe("");
    expect(cssGradienteCustom(undefined)).toBe("");
  });

  it("ângulo e posição saem limitados", () => {
    const css = cssGradienteCustom({ angulo: 9999, paradas: [{ cor: "#000000", pos: -40 }, { cor: "#ffffff", pos: 900 }] });
    expect(css).toBe("linear-gradient(360deg, #000000 0%, #ffffff 100%)");
  });

  it("o padrão de fábrica é um gradiente válido", () => {
    expect(cssGradienteCustom(GRADIENTE_CUSTOM_PADRAO())).toMatch(/^linear-gradient\(135deg, #7c3aed 0%, #a855f7 100%\)$/);
  });
});

describe("cssDoGradiente", () => {
  it("preset por id continua funcionando", () => {
    expect(cssDoGradiente("roxo")).toBe(GRADIENTES[0].css);
  });

  it("o gradiente próprio ganha do preset", () => {
    // Se a pessoa mexeu nas cores, é o que ela espera ver.
    const proprio = { angulo: 45, paradas: [{ cor: "#111111", pos: 0 }, { cor: "#222222", pos: 100 }] };
    expect(cssDoGradiente("roxo", proprio)).toBe("linear-gradient(45deg, #111111 0%, #222222 100%)");
  });

  it("gradiente próprio inválido cai de volta no preset", () => {
    expect(cssDoGradiente("roxo", { angulo: 45, paradas: [] })).toBe(GRADIENTES[0].css);
  });

  it("id desconhecido e sem próprio devolve vazio", () => {
    expect(cssDoGradiente("nao-existe")).toBe("");
    expect(cssDoGradiente(undefined)).toBe("");
  });
});

describe("gradienteEhEscuro", () => {
  it("preset usa a marca da lista", () => {
    expect(gradienteEhEscuro("roxo")).toBe(true);
    expect(gradienteEhEscuro("clarinho")).toBe(false);
  });

  it("gradiente próprio decide pela luminância média", () => {
    // Ninguém marca "escuro" num gradiente que acabou de criar; sem calcular,
    // texto escuro sobre fundo escuro passaria batido.
    expect(gradienteEhEscuro(undefined, { angulo: 0, paradas: [{ cor: "#000000", pos: 0 }, { cor: "#111111", pos: 100 }] })).toBe(true);
    expect(gradienteEhEscuro(undefined, { angulo: 0, paradas: [{ cor: "#ffffff", pos: 0 }, { cor: "#eeeeee", pos: 100 }] })).toBe(false);
  });
});
