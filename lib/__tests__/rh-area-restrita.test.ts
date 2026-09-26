/**
 * O RH é área RESTRITA — e este arquivo é a trava, não o CLAUDE.md.
 *
 * O pedido do dono tem três partes, e cada `describe` abaixo guarda uma:
 *
 *   1. Ninguém recebe o RH por tabela. Nem admin, nem cargo, nem nível, nem
 *      "acesso total", nem ter tido Pessoas antes.
 *   2. Só o superusuário concede — até ele entregar `rh:acessos` a alguém.
 *   3. Dentro do RH, a ficha anamnésica não vem junto com nada.
 *
 * O terceiro é o que se perde primeiro numa refatoração distraída: basta
 * alguém achar que "quem edita a ficha obviamente lê a ficha inteira" e pôr um
 * `implica` no lugar errado. Dado de saúde não segue a intuição de cadastro.
 */
import { describe, it, expect } from "vitest";
import {
  AREA_BY_KEY, CHAVES_RESTRITAS, CHAVES_SO_POR_CONCESSAO, SUB_FULL_KEYS,
  chaveQueConcede, chavesDasAreas, ehChaveRestrita, podeConcederArea,
} from "../areas";
import { PERMISSOES_DE_ADMIN, TODAS_PERMISSOES } from "../permissions";
import { AREAS_ABERTAS_TEMPORARIAMENTE } from "../perfis";
import { chavesDoNivel } from "../niveis";
import { MODULES, MODULOS_DISCRETOS, navForKeys } from "../rbac";

const SUBS_DO_RH = SUB_FULL_KEYS.filter((k) => k.startsWith("rh:"));
const CHAVES_DO_RH = ["rh", ...SUBS_DO_RH];

describe("RH — a área", () => {
  it("é restrita e crítica", () => {
    expect(AREA_BY_KEY.rh?.restrita).toBe(true);
    expect(AREA_BY_KEY.rh?.critica).toBe(true);
  });

  it("toda chave do RH conta como restrita", () => {
    for (const k of CHAVES_DO_RH) expect(ehChaveRestrita(k)).toBe(true);
    expect(CHAVES_RESTRITAS).toEqual(expect.arrayContaining(CHAVES_DO_RH));
  });

  it("existe no vocabulário do sistema (senão o gate não acha a chave)", () => {
    // `gate-por-area.test.ts` exige que toda chave usada em requireModule /
    // apiRh exista no catálogo. Se esta falhar, o RH inteiro cai no 403.
    expect(TODAS_PERMISSOES).toEqual(expect.arrayContaining(CHAVES_DO_RH));
  });

  it("as subs cobrem as gavetas que o dono pediu", () => {
    const esperadas = [
      "ver", "editar", "documentos", "documentos_editar", "atestados", "atestados_editar",
      "ponto", "banco_horas", "compensacoes_editar", "ferias", "ferias_editar", "anamnese", "anamnese_editar",
      "curriculos", "curriculos_respostas", "curriculos_arquivo", "curriculos_status", "curriculos_editar", "curriculos_integracao",
      "calendario", "calendario_editar", "calendario_setores", "calendario_feriados", "acessos",
    ].map((s) => `rh:${s}`);
    expect(SUBS_DO_RH.sort()).toEqual(esperadas.sort());
  });
});

describe("RH — nenhuma concessão em bloco", () => {
  it("o papel admin não abre nada do RH", () => {
    expect(CHAVES_DO_RH.filter((k) => PERMISSOES_DE_ADMIN.includes(k))).toEqual([]);
  });

  it('o card "Administrador — acesso total" não abre nada do RH', () => {
    expect(chavesDasAreas({ admin: true }).filter((k) => k.startsWith("rh"))).toEqual([]);
  });

  it("nenhum nível abre o RH", () => {
    for (const nivel of [1, 2, 3, 4, 5]) {
      for (const depto of ["Financeiro", "Administrativo", "Produção", null]) {
        expect(CHAVES_DO_RH.filter((k) => chavesDoNivel(nivel, depto).includes(k))).toEqual([]);
      }
    }
  });

  it("nenhum PAPEL abre o RH pela sidebar", () => {
    expect(MODULES.find((m) => m.key === "rh")?.roles).toEqual([]);
  });

  it("o RH não está nas áreas abertas temporariamente", () => {
    expect(AREAS_ABERTAS_TEMPORARIAMENTE).not.toContain("rh");
  });

  it("ter TODAS as outras áreas ainda não abre o RH", () => {
    const tudoMenos: Record<string, boolean> = {};
    for (const k of PERMISSOES_DE_ADMIN) tudoMenos[k] = true;
    expect(chavesDasAreas(tudoMenos).filter((k) => k.startsWith("rh"))).toEqual([]);
  });

  it("o back-compat não entrega as gavetas sensíveis", () => {
    // Área ligada no modelo antigo (sem subs no mapa) concede só as subs de
    // LEITURA não sensíveis. Saúde, documento e escrita ficam de fora.
    const comAreaCrua = chavesDasAreas({ rh: true });
    for (const k of ["rh:editar", "rh:anamnese", "rh:anamnese_editar", "rh:atestados",
                     "rh:atestados_editar", "rh:documentos_editar", "rh:ferias_editar", "rh:acessos"]) {
      expect(comAreaCrua).not.toContain(k);
    }
  });
});

describe("RH — quem distribui a chave", () => {
  it("a área declara seu próprio administrador", () => {
    expect(chaveQueConcede("rh")).toBe("rh:acessos");
  });

  it("um admin comum NÃO concede o RH", () => {
    // O ponto do pedido: "somente um superuser pode conceder". Um admin sem
    // `rh:acessos` não passa, mesmo com a grade inteira na mão.
    expect(podeConcederArea("rh", PERMISSOES_DE_ADMIN, false)).toBe(false);
  });

  it("o superusuário concede", () => {
    expect(podeConcederArea("rh", [], true)).toBe(true);
  });

  it("quem recebeu rh:acessos de propósito também concede", () => {
    expect(podeConcederArea("rh", ["rh", "rh:acessos"], false)).toBe(true);
  });

  it("o superusuário ATRAVESSA o RH — senão ninguém abre a porta pro primeiro", () => {
    // Uma sub `restrita` cairia em CHAVES_SO_POR_CONCESSAO e trancaria o dono
    // do lado de fora: a grade proíbe editar a PRÓPRIA ficha, então ele
    // precisaria de um segundo admin que também não teria a chave.
    for (const k of CHAVES_DO_RH) expect(CHAVES_SO_POR_CONCESSAO).not.toContain(k);
  });
});

describe("RH — dentro do módulo, uma gaveta por vez", () => {
  it("cada sub carrega a porta junto", () => {
    // Sub concedida sem a área deixaria a pessoa com a chave fina e nenhum
    // caminho até a tela.
    for (const sub of SUBS_DO_RH) {
      if (sub === "rh:acessos") continue;   // governança: não precisa da ficha
      expect(chavesDasAreas({ [sub]: true })).toContain("rh");
    }
  });

  it("editar implica ver", () => {
    expect(chavesDasAreas({ "rh:editar": true })).toContain("rh:ver");
  });

  it("escrever implica ler, em cada gaveta", () => {
    expect(chavesDasAreas({ "rh:documentos_editar": true })).toContain("rh:documentos");
    expect(chavesDasAreas({ "rh:atestados_editar": true })).toContain("rh:atestados");
    expect(chavesDasAreas({ "rh:ferias_editar": true })).toContain("rh:ferias");
    expect(chavesDasAreas({ "rh:anamnese_editar": true })).toContain("rh:anamnese");
    expect(chavesDasAreas({ "rh:calendario_editar": true })).toContain("rh:calendario");
    expect(chavesDasAreas({ "rh:calendario_setores": true })).toContain("rh:calendario");
    expect(chavesDasAreas({ "rh:calendario_feriados": true })).toContain("rh:calendario");
  });

  it("ver currículos não abre resposta, arquivo, status nem integração", () => {
    const so = chavesDasAreas({ "rh:curriculos": true });
    for (const g of ["respostas", "arquivo", "status", "editar", "integracao"]) expect(so).not.toContain(`rh:curriculos_${g}`);
    // e as gavetas não se implicam entre si: ler resposta ≠ abrir o arquivo
    expect(chavesDasAreas({ "rh:curriculos_respostas": true })).not.toContain("rh:curriculos_arquivo");
    expect(chavesDasAreas({ "rh:curriculos_status": true })).not.toContain("rh:curriculos_editar");
  });

  it("ver o calendário não escreve nele", () => {
    const so = chavesDasAreas({ "rh:calendario": true });
    expect(so).not.toContain("rh:calendario_editar");
    expect(so).not.toContain("rh:calendario_setores");
    expect(so).not.toContain("rh:calendario_feriados");
  });

  it("banco de horas implica ponto", () => {
    expect(chavesDasAreas({ "rh:banco_horas": true })).toContain("rh:ponto");
  });

  it("A FICHA ANAMNÉSICA NÃO VEM COM NADA", () => {
    // A asserção mais importante do arquivo. Nenhuma outra chave do RH pode
    // arrastar o histórico de saúde junto — nem editar a ficha, nem ler
    // atestado, nem administrar o acesso do módulo.
    for (const outra of SUBS_DO_RH) {
      if (outra === "rh:anamnese" || outra === "rh:anamnese_editar") continue;
      expect(chavesDasAreas({ [outra]: true })).not.toContain("rh:anamnese");
    }
  });

  it("ver o RH não abre atestado nem documento", () => {
    const so = chavesDasAreas({ "rh:ver": true });
    expect(so).toContain("rh");
    expect(so).not.toContain("rh:atestados");
    expect(so).not.toContain("rh:documentos");
    expect(so).not.toContain("rh:anamnese");
  });
});

describe("Pessoas foi absorvida — e a herança só corre num sentido", () => {
  it("a área antiga ficou oculta, mas a chave continua válida", () => {
    expect(AREA_BY_KEY.colaboradores?.oculta).toBe(true);
    expect(TODAS_PERMISSOES).toContain("colaboradores");
  });

  it("quem tem RH ganha a chave operacional antiga", () => {
    // Sem isto a tela do RH abre e as rotas do ponto, dos dispositivos e do
    // cadastro devolvem 403 — o bug clássico deste repositório.
    expect(chavesDasAreas({ "rh:ver": true })).toContain("colaboradores");
    expect(chavesDasAreas({ "rh:ponto": true })).toContain("colaboradores");
  });

  it("quem tinha Pessoas NÃO ganha nada do RH", () => {
    // Pedido explícito: "ter acesso a Pessoas anteriormente não deve
    // significar acesso automático a todas as funções do novo RH".
    const so = chavesDasAreas({ colaboradores: true });
    expect(so).toContain("colaboradores");
    expect(so.filter((k) => k === "rh" || k.startsWith("rh:"))).toEqual([]);
  });

  it("sem RH e sem Pessoas, a chave antiga não aparece do nada", () => {
    expect(chavesDasAreas({ estoque: true })).not.toContain("colaboradores");
  });
});

describe("RH — a navegação", () => {
  it("quem tem a área encontra o item na barra", () => {
    expect(JSON.stringify(navForKeys(["central", "rh"]))).toContain("/rh");
  });

  it("quem NÃO tem não vê o item — nem com acesso total", () => {
    expect(JSON.stringify(navForKeys(PERMISSOES_DE_ADMIN))).not.toContain('"/rh"');
  });

  it("Pessoas não anuncia uma segunda porta", () => {
    // O item continua existindo (a rota `/colaboradores` redireciona e está em
    // link antigo por todo lado), mas sai da barra, do ⌘K e da barra do celular.
    expect([...MODULOS_DISCRETOS]).toContain("colaboradores");
    expect(MODULES.some((m) => m.key === "colaboradores")).toBe(true);
    const chaves = navForKeys(["central", "colaboradores"])
      .flatMap((i) => (i.type === "module" ? [i.module.key] : i.children.map((c) => c.key)));
    expect(chaves).not.toContain("colaboradores");
  });

  it("a página e a API do RH gateiam pela MESMA chave", () => {
    const modulo = MODULES.find((m) => m.href === "/rh");
    expect(modulo?.key).toBe("rh");
    expect(CHAVES_RESTRITAS).toContain(modulo!.key);
  });
});
