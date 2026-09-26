import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AREA_BY_KEY, AREA_KEYS, CHAVES_ATIVIDADES, atividadesHerdada, chavesDasAreas } from "../areas";
import { MODULES, navForKeys } from "../rbac";
import { PERMISSOES_DE_ADMIN } from "../permissions";
import { poderesDeAtividades } from "../atividades-acesso";

/**
 * Atividades saiu de dentro de Pessoas (11/09/2026).
 *
 * A página abria pelo CARGO e as rotas pelo cargo, pela área Pessoas ou por
 * "Produção › Controle" — quem ganhava Pessoas pra conferir ponto levava junto
 * o poder de distribuir o trabalho da empresa. Agora é área própria no
 * Operacional, com três chaves. O que este arquivo protege é a virada: separar
 * não pode tirar acesso de quem usa a tela, a herança não pode virar porta que
 * ninguém fecha, e a página e as rotas têm de conferir a MESMA régua.
 */
const ler = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

describe("Atividades — área própria na Operação", () => {
  it("existe, mora na Operação e tem Ver × Atribuir × Configurar", () => {
    expect(AREA_KEYS).toContain("atividades");
    const area = AREA_BY_KEY["atividades"];
    expect(area.categoria).toBe("Operação");
    expect((area.subs ?? []).map((s) => s.key)).toEqual(["ver", "atribuir", "configurar", "autorizar"]);
  });

  it("atribuir e configurar trazem o ver junto (senão a tela abre e tudo volta 403)", () => {
    expect(chavesDasAreas({ "atividades:atribuir": true })).toEqual(expect.arrayContaining(["atividades", "atividades:ver", "atividades:atribuir"]));
    expect(chavesDasAreas({ "atividades:configurar": true })).toEqual(expect.arrayContaining(["atividades", "atividades:ver"]));
  });

  it("aparece no item Operação da barra lateral, e o admin recebe", () => {
    expect(MODULES.map((m) => m.key)).toContain("atividades");
    const grupo = navForKeys(["atividades", "producao"]).find((i) => i.type === "group" && i.key === "operacoes");
    expect(grupo && grupo.type === "group" ? (grupo.hub?.areas ?? []).map((c) => c.key) : []).toContain("atividades");
    for (const k of CHAVES_ATIVIDADES) expect(PERMISSOES_DE_ADMIN).toContain(k);
  });
});

describe("a virada por herança", () => {
  it("quem abria a tela pela ÁREA herda: Pessoas, Produção › Controle", () => {
    expect(atividadesHerdada({ "colaboradores:ponto": true }, "colaborador", ["colaboradores", "colaboradores:ponto"])).toBe(true);
    expect(atividadesHerdada({ "producao:controle": true }, "colaborador", ["producao", "producao:controle"])).toBe(true);
  });

  it("cargo sozinho não herda (sem-grade-so-o-basico): o gerente ganha pela ficha, que o SQL grava", () => {
    expect(atividadesHerdada(null, "gerente_vendas", [])).toBe(false);
    expect(atividadesHerdada({}, "gerente_producao", [])).toBe(false);
  });

  it("quem nunca abriu não ganha nada", () => {
    expect(atividadesHerdada({ "estoque:itens": true }, "colaborador", ["estoque", "estoque:itens"])).toBe(false);
    expect(atividadesHerdada(null, "colaborador", [])).toBe(false);
  });

  it("a primeira decisão na grade desliga a herança — o card serve pra alguma coisa", () => {
    // A grade salva grava o mapa inteiro: `atividades:ver: false` é decisão.
    expect(atividadesHerdada({ "colaboradores:ponto": true, "atividades:ver": false }, "gerente_vendas", ["colaboradores"])).toBe(false);
    expect(atividadesHerdada({ "atividades:atribuir": true }, "colaborador", [])).toBe(false);
  });

  it("o resolvedor aplica a herança nos dois caminhos (com e sem grade)", () => {
    const perfis = ler("lib/perfis.ts");
    expect(perfis).toContain("comAbertas(comAtividadesHerdadas(chavesDasAreas(permissoes), permissoes, profile.role))");
    expect(perfis).toContain("comAbertas(comAtividadesHerdadas(chavesDoNivel(1, departamento), permissoes, profile.role))");
  });

  it("o SQL grava a herança sem sobrescrever decisão", () => {
    const sql = ler("supabase/permissao_atividades.sql");
    expect(sql).toContain("not (coalesce(e.permissoes, '{}'::jsonb) ?| array[");
    expect(sql).toContain("p.role in ('gerente_producao', 'gerente_vendas')");
  });
});

describe("uma régua só: página, rotas e embutidos", () => {
  const ROTAS = [
    "app/api/atividades/route.ts",
    "app/api/atividades/producao/route.ts",
    "app/api/atividades/historico/route.ts",
    "app/api/atividades/tempos/route.ts",
    "app/api/atividades-catalogo/route.ts",
    "app/api/atividades-pecas/route.ts",
    "app/api/producao/modelos/route.ts",
    "app/api/atividades/visao/route.ts",
    "app/api/atividades/opcoes/route.ts",
    "app/(plataforma)/atividades/historico/page.tsx",
  ];

  it("nenhuma rota de Atividades decide mais por Pessoas nem por Produção › Controle", () => {
    for (const r of ROTAS) {
      const src = ler(r);
      expect(src, r).toContain("podeAtividades(");
      expect(src, r).not.toMatch(/"colaboradores",\s*"producao:controle"/);
      expect(src, r).not.toContain('keys.includes("colaboradores")');
    }
  });

  it("a página abre pela chave da área, não pelo cargo, e desce as três chaves pra tela", () => {
    const page = ler("app/(plataforma)/atividades/page.tsx");
    expect(page).toMatch(/requireModule(Keys)?\("atividades"\)/);
    expect(page).not.toContain("requireRole(");
    expect(page).toContain("poderesDeAtividades(keys, me.role)");
  });

  it("o quadro esconde o que a chave não dá (a rota recusaria)", () => {
    const quadro = ler("app/(plataforma)/atividades/AtividadesClient.tsx");
    expect(quadro).toContain("{podeAtribuir && (\n            <Botao variante=\"primario\" tamanho=\"lg\" icone=\"box\"");
    expect(quadro).toContain("{podeConfigurar && (\n            <Botao variante=\"secundario\" tamanho=\"lg\" icone=\"package\"");
    expect(quadro).toContain("podeEditar={podeConfigurar}");
    // O pop-up da Visão geral: mudar as opções de um item e a escolha do
    // "Personalizar" é mudar o catálogo — Configurar, na rota também.
    expect(ler("app/api/atividades/opcoes/route.ts")).toContain('podeAtividades(me, "configurar")');
    expect(ler("app/api/atividades/visao/route.ts")).toContain('podeAtividades(me, "configurar")');
  });

  it("a barra do celular segue a chave, e Pessoas não embute mais o quadro", () => {
    expect(ler("app/(plataforma)/MobileTabBar.tsx")).not.toContain("GERENCIA_ATIVIDADES");
    // Atividades mora na Operação (pedido do dono, 11/09), e em 12/09 a aba
    // "Produtividade & metas" também saiu de Pessoas.
    expect(ler("app/(plataforma)/atividades/ProdutividadeMetas.tsx")).not.toContain("<AtividadesClient");
    const hub = ler("app/(plataforma)/colaboradores/ColaboradoresHub.tsx");
    expect(hub).not.toMatch(/type Tab = [^;]*produtividade/);
    expect(hub).not.toContain('nome: "Produtividade');
    expect(ler("app/(plataforma)/colaboradores/page.tsx")).not.toContain("ProdutividadeSlot");
  });

  it("a área tem as duas abas: Visão geral e Histórico (o Calendário saiu)", () => {
    const shell = ler("app/(plataforma)/atividades/AtividadesShell.tsx");
    for (const aba of ["Visão geral", "Histórico"]) expect(shell).toContain(aba);
    expect(shell).not.toContain("Equipes");
  });

  it("poderesDeAtividades lê as três chaves; admin atravessa", () => {
    expect(poderesDeAtividades(["atividades:ver"], "colaborador")).toEqual({ ver: true, atribuir: false, configurar: false, autorizar: false });
    expect(poderesDeAtividades([], "admin")).toEqual({ ver: true, atribuir: true, configurar: true, autorizar: true });
  });
});
