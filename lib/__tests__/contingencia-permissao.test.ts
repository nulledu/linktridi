import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AREA_BY_KEY, AREA_KEYS, chavesDasAreas, contingenciaHerdada, ehChaveRestrita } from "../areas";
import { MODULES } from "../rbac";
import { PERMISSOES_DE_ADMIN, TODAS_PERMISSOES } from "../permissions";

/**
 * A Contingência saiu de dentro do Marketing.
 *
 * Enquanto era a sub `marketing:aquecimento`, quem recebia a área de criativo
 * herdava junto o parque de chips, BMs, contas e celulares — não existia jeito
 * de abrir uma sem a outra, e foi por isso que gente que só cuida de anúncio
 * apareceu com acesso total à contingência. Agora é área própria.
 *
 * O que este arquivo protege é a virada: separar a chave não pode TIRAR o
 * acesso de quem já usa a tela, e a herança que evita isso não pode virar uma
 * porta que ninguém consegue fechar depois.
 */
const ler = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

describe("Contingência — área própria", () => {
  it("existe no catálogo e é liga/desliga: ver e editar andam juntos", () => {
    expect(AREA_KEYS).toContain("contingencia");
    const area = AREA_BY_KEY["contingencia"];
    expect(area.categoria).toBe("Vendas & Marketing");
    // Sem subs de propósito: quem entra cadastra e edita.
    expect(area.subs ?? []).toHaveLength(0);
  });

  it("a sub marketing:aquecimento foi aposentada", () => {
    const subs = (AREA_BY_KEY["marketing"].subs ?? []).map((s) => s.key);
    expect(subs).not.toContain("aquecimento");
    expect(TODAS_PERMISSOES).not.toContain("marketing:aquecimento");
    expect(TODAS_PERMISSOES).toContain("contingencia");
  });

  it("ter o Marketing inteiro NÃO abre mais a Contingência", () => {
    // A grade salva grava o mapa completo — `contingencia: false` é decisão, e
    // decisão manda. É este teste que garante que o card serve pra alguma coisa.
    const keys = chavesDasAreas({
      "marketing:ver": true, "marketing:criar": true, "marketing:desempenho": true,
      contingencia: false,
    });
    expect(keys).toContain("marketing");
    expect(keys).not.toContain("contingencia");
  });

  it("dá pra ter a Contingência SEM ter o Marketing", () => {
    const keys = chavesDasAreas({ contingencia: true });
    expect(keys).toContain("contingencia");
    expect(keys).not.toContain("marketing");
  });

  it("é default-deny: sem grade, ninguém entra", () => {
    expect(chavesDasAreas(null)).not.toContain("contingencia");
    expect(chavesDasAreas({ comercial: true })).not.toContain("contingencia");
  });

  it("não é restrita: o card de acesso total continua abrindo", () => {
    expect(ehChaveRestrita("contingencia")).toBe(false);
    expect(PERMISSOES_DE_ADMIN).toContain("contingencia");
  });
});

describe("Contingência — herança de quem já tinha acesso", () => {
  it("quem marcou a sub antiga continua entrando", () => {
    expect(contingenciaHerdada({ "marketing:ver": true, "marketing:aquecimento": true })).toBe(true);
    expect(chavesDasAreas({ "marketing:ver": true, "marketing:aquecimento": true }))
      .toContain("contingencia");
  });

  it("quem tem o Marketing do modelo antigo (área sem subs) também", () => {
    // Era o caso do gestor de tráfego: o back-compat de chavesDasAreas concedia
    // a sub de aquecimento junto com a área, então ele ENXERGA a contingência
    // hoje. Separar a chave não pode tirar isso dele de um dia pro outro.
    expect(contingenciaHerdada({ marketing: true })).toBe(true);
    expect(chavesDasAreas({ marketing: true })).toContain("contingencia");
  });

  it("a herança PARA assim que alguém decide sobre o card", () => {
    // Sem isto a herança seria a armadilha de AREAS_ABERTAS_TEMPORARIAMENTE:
    // desmarcar o quadradinho não surtiria efeito nenhum.
    expect(contingenciaHerdada({ marketing: true, contingencia: false })).toBe(false);
    expect(chavesDasAreas({ marketing: true, contingencia: false })).not.toContain("contingencia");
    expect(contingenciaHerdada({ "marketing:aquecimento": true, contingencia: false })).toBe(false);
  });

  it("não herda quem nunca teve o Marketing", () => {
    expect(contingenciaHerdada(null)).toBe(false);
    expect(contingenciaHerdada({})).toBe(false);
    expect(contingenciaHerdada({ comercial: true })).toBe(false);
    expect(contingenciaHerdada({ marketing: false })).toBe(false);
  });

  it("não herda quem tem a grade NOVA do Marketing sem a contingência", () => {
    // Mapa com subs = alguém já configurou por sub; não é o modelo antigo.
    expect(contingenciaHerdada({ marketing: true, "marketing:ver": true })).toBe(false);
  });
});

describe("Contingência — página, API e barra falam a MESMA chave", () => {
  it("a barra lateral leva pra rota certa", () => {
    const modulo = MODULES.find((m) => m.href === "/marketing/contingencia");
    expect(modulo?.key).toBe("contingencia");
  });

  it("a página gateia por `contingencia`", () => {
    const src = ler("app/(plataforma)/marketing/contingencia/page.tsx");
    expect(src).toMatch(/requireModule\("contingencia"\)/);
  });

  it("o gate das APIs da contingência usa a mesma chave, e responde 403 (não redirect)", () => {
    const src = ler("app/api/marketing/contingencia/_gate.ts");
    expect(src).toMatch(/getProfileForModule\("contingencia"\)/);
    // Redirect numa API devolve 200 + HTML do login, e todo `if (r.ok)` da tela
    // lê isso como sucesso. Ver a memória sessao-expirada-vira-sucesso.
    expect(src).not.toMatch(/await requireModule/);
    expect(src).toMatch(/status: 403/);
  });

  it("as rotas do aquecimento (mesma tela) passam pelo mesmo gate", () => {
    // A Contingência e o antigo Aquecimento são UMA tela só — se as rotas que
    // ela chama continuassem exigindo `marketing`, quem tem só a Contingência
    // abriria a página e não carregaria nada.
    for (const rota of [
      "app/api/marketing/aquecimento/route.ts",
      "app/api/marketing/aquecimento/ativo/route.ts",
      "app/api/marketing/aquecimento/marco/route.ts",
      "app/api/marketing/aquecimento/roteiro/route.ts",
      "app/api/marketing/aquecimento/aparelho/route.ts",
    ]) {
      const src = ler(rota);
      expect(src, rota).toMatch(/gateContingencia\(\)/);
      expect(src, rota).not.toMatch(/requireModuleKeys\("marketing"\)/);
      expect(src, rota).not.toMatch(/marketing:aquecimento/);
    }
  });
});
