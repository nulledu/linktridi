import { describe, it, expect } from "vitest";
import {
  AREA_BY_KEY, CHAVES_RESTRITAS, CHAVES_SO_POR_CONCESSAO, chavesDasAreas, ehChaveRestrita,
  SUB_FULL_KEYS,
} from "@/lib/areas";
import { PERMISSOES_DE_ADMIN, TODAS_PERMISSOES } from "@/lib/permissions";
import { AREAS_ABERTAS_TEMPORARIAMENTE } from "@/lib/perfis";
import { chavesDoNivel } from "@/lib/niveis";
import { MODULOS_DISCRETOS, navForKeys, MODULES } from "@/lib/rbac";

/**
 * O Financeiro é o cofre — e a promessa dele é uma frase só:
 *
 *   "Nem quem é admin do sistema entra. Só entra quem foi liberado, um por um."
 *
 * Promessa de acesso escrita em prosa é promessa que apodrece: basta alguém
 * acrescentar "financeiro" numa lista de conveniência, num arquivo sobre outro
 * assunto, e a folha de pagamento inteira passa a estar aberta para a empresa —
 * sem ninguém perceber na revisão, porque a linha parece inofensiva.
 *
 * Estes testes são a trava. Eles varrem TODOS os caminhos pelos quais uma chave
 * de acesso entra num usuário neste sistema: papel, "acesso total", nível,
 * back-compat da migração e a lista de áreas abertas.
 */

const CHAVES_DO_FINANCEIRO = ["financeiro", ...SUB_FULL_KEYS.filter((k) => k.startsWith("financeiro:"))];

describe("O Financeiro é área restrita", () => {
  it("está declarado como restrito E crítico no catálogo", () => {
    const area = AREA_BY_KEY.financeiro;
    expect(area, "a área 'financeiro' sumiu de lib/areas.ts").toBeTruthy();
    expect(area.restrita).toBe(true);
    expect(area.critica).toBe(true);
  });

  it("a área e TODAS as suas subs contam como chave restrita", () => {
    for (const k of CHAVES_DO_FINANCEIRO) {
      expect(ehChaveRestrita(k), `${k} deixou de ser restrita`).toBe(true);
      expect(CHAVES_RESTRITAS).toContain(k);
    }
  });
});

describe("Nenhuma concessão em bloco abre o Financeiro", () => {
  it('o card "Administrador — acesso total" NÃO concede nada do Financeiro', () => {
    const vazou = CHAVES_DO_FINANCEIRO.filter((k) => PERMISSOES_DE_ADMIN.includes(k));
    expect(vazou, `acesso total passou a conceder: ${vazou.join(", ")}`).toEqual([]);
  });

  it("o nível máximo (5 — admin) não alcança o Financeiro", () => {
    for (const nivel of [1, 2, 3, 4, 5]) {
      const chaves = chavesDoNivel(nivel, "Financeiro");
      const vazou = CHAVES_DO_FINANCEIRO.filter((k) => chaves.includes(k));
      expect(vazou, `nível ${nivel} passou a conceder: ${vazou.join(", ")}`).toEqual([]);
    }
  });

  it("ligar o quadradinho de admin na grade não abre o Financeiro junto", () => {
    const chaves = chavesDasAreas({ admin: true });
    expect(chaves.filter((k) => k.startsWith("financeiro"))).toEqual([]);
  });

  it("o Financeiro não está entre as áreas abertas temporariamente", () => {
    expect(AREAS_ABERTAS_TEMPORARIAMENTE).not.toContain("financeiro");
  });

  it("nenhum PAPEL abre o módulo — a lista de papéis dele é vazia de propósito", () => {
    const mod = MODULES.find((m) => m.key === "financeiro");
    expect(mod, "o módulo 'financeiro' sumiu de lib/rbac.ts").toBeTruthy();
    expect(mod!.roles).toEqual([]);
  });
});

describe("Só entra quem foi liberado, um por um", () => {
  it("com o quadradinho ligado, a pessoa entra", () => {
    const chaves = chavesDasAreas({ "financeiro:ver": true });
    expect(chaves).toContain("financeiro");
    expect(chaves).toContain("financeiro:ver");
  });

  it("liberar UMA sub não entrega as outras", () => {
    const chaves = chavesDasAreas({ "financeiro:ver": true });
    expect(chaves).not.toContain("financeiro:pagar");
    expect(chaves).not.toContain("financeiro:folha");
    expect(chaves).not.toContain("financeiro:contas");
  });

  it("quem pode pagar precisa poder ver e lançar — a implicação resolve sozinha", () => {
    const chaves = chavesDasAreas({ "financeiro:pagar": true });
    expect(chaves).toContain("financeiro:ver");
    expect(chaves).toContain("financeiro:compromissos");
  });

  it("os poderes que mexem em dinheiro e em gente são sensíveis", () => {
    const subs = AREA_BY_KEY.financeiro.subs ?? [];
    for (const chave of ["pagar", "contas", "folha", "acessos"]) {
      expect(subs.find((s) => s.key === chave)?.sensivel, `financeiro:${chave} deixou de ser sensível`).toBe(true);
    }
  });

  it("o back-compat da migração NÃO entrega pagar, contas nem folha", () => {
    // Área ligada no modelo antigo (sem subs no mapa): concede as subs de
    // LEITURA para ninguém perder acesso — mas as sensíveis ficam de fora.
    // Herdar o poder de pagar por migração seria conceder acesso a dinheiro
    // sem ninguém ter decidido isso.
    const chaves = chavesDasAreas({ financeiro: true });
    expect(chaves).toContain("financeiro:ver");
    expect(chaves).not.toContain("financeiro:pagar");
    expect(chaves).not.toContain("financeiro:contas");
    expect(chaves).not.toContain("financeiro:folha");
  });

  /**
   * O último degrau da promessa: NEM O SUPERUSUÁRIO.
   *
   * O dono do sistema é `role: "admin"`. Enquanto a lista fixa do código lhe
   * devolvia todas as chaves, "nem admin tem acesso por padrão" era falso na
   * única conta que importava. Agora ele fica com a PORTA e as duas telas de
   * GOVERNANÇA; ver a visão geral, pagar ou abrir a folha exige o quadradinho
   * ligado nele também.
   *
   * As exceções são `financeiro:acessos` e `financeiro:config`, e as duas pelo
   * mesmo motivo: governam a moldura do módulo (quem entra, quais empresas
   * existem), não o dinheiro. Sem elas, a chave viveria só dentro do cofre —
   * e como a grade não deixa ninguém editar a PRÓPRIA ficha, o dono ficaria
   * dependendo de um segundo admin que precisaria da mesma chave que ele não
   * tem. Foi assim que a tela de Configurações foi ao ar inalcançável.
   */
  const GOVERNANCA = ["financeiro", "financeiro:acessos", "financeiro:config"];

  it("nem o superusuário recebe as chaves de dinheiro de graça", () => {
    for (const k of CHAVES_DO_FINANCEIRO) {
      if (GOVERNANCA.includes(k)) continue;
      expect(CHAVES_SO_POR_CONCESSAO, `${k} tem de sair da concessão automática`).toContain(k);
    }
  });

  it("a porta e as telas de governança ficam — senão dá para trancar todo mundo do lado de fora", () => {
    for (const k of GOVERNANCA) {
      expect(CHAVES_SO_POR_CONCESSAO, `${k} governa a moldura, não o dinheiro`).not.toContain(k);
      // E continuam existindo no vocabulário: a exceção é sobre CONCESSÃO
      // automática, não sobre a chave sumir do sistema.
      expect(TODAS_PERMISSOES).toContain(k);
    }
  });

  /**
   * A trava que faltava quando a tela de Configurações nasceu inalcançável.
   *
   * Toda tela do módulo tem uma chave que a abre. Se essa chave só chega por
   * concessão explícita E a grade proíbe editar a própria ficha, a tela existe
   * mas ninguém entra — e de fora isso lê como "a tela não existe". Este teste
   * amarra as duas pontas: quem governa o módulo alcança as telas de governança
   * sem depender de terceiro.
   */
  it("o dono alcança as telas de governança sem precisar de um segundo admin", () => {
    const doSuperusuario = TODAS_PERMISSOES.filter((k) => !CHAVES_SO_POR_CONCESSAO.includes(k));
    expect(doSuperusuario).toContain("financeiro:acessos");
    expect(doSuperusuario).toContain("financeiro:config");
  });

  it("a exceção vale só para o Financeiro e para as subs restritas escritas aqui", () => {
    // Uma lista dessas cresce sozinha se ninguém olhar. Se um dia outra área
    // precisar do mesmo degrau, que seja uma decisão escrita, não um efeito
    // colateral de mexer aqui.
    //
    // Hoje a lista voltou a ser só do Financeiro: a única outra sub restrita
    // do sistema (`administracao:marketplaces-bonus`) sai daqui de propósito,
    // pra o dono alcançá-la — ver O_DONO_ALCANCA em lib/areas.ts e a trava em
    // marketplace-bonus-restrito.test.ts. Restrita ela continua: fora do papel
    // admin, do "acesso total" e da migração.
    for (const k of CHAVES_SO_POR_CONCESSAO) expect(k.startsWith("financeiro:")).toBe(true);
  });
});

describe("A chave que distribui a chave", () => {
  /**
   * `financeiro:acessos` abre a tela que concede o Financeiro a outras pessoas.
   * É poder sobre poder: quem a tem escolhe quem paga e quem vê a folha. Ela
   * precisa ser a mais fechada de todas — e não pode chegar em ninguém de
   * carona, nem no admin, nem por implicação de outra sub.
   */
  it("não vem de concessão em bloco nenhuma", () => {
    expect(PERMISSOES_DE_ADMIN).not.toContain("financeiro:acessos");
    for (const nivel of [1, 2, 3, 4, 5]) {
      expect(chavesDoNivel(nivel, "Financeiro")).not.toContain("financeiro:acessos");
    }
    expect(chavesDasAreas({ admin: true })).not.toContain("financeiro:acessos");
  });

  it("o back-compat da migração não a entrega", () => {
    expect(chavesDasAreas({ financeiro: true })).not.toContain("financeiro:acessos");
  });

  it("nenhuma outra sub a liga por implicação — nem 'pagar', nem 'contas', nem 'folha'", () => {
    // O caminho oblíquo: se alguma sub a declarasse em `implica`, liberar um
    // poder comum entregaria junto o direito de distribuir o cofre.
    for (const s of AREA_BY_KEY.financeiro.subs ?? []) {
      expect(s.implica ?? [], `financeiro:${s.key} implica acessos`).not.toContain("acessos");
    }
    for (const chave of ["pagar", "contas", "folha", "compromissos", "cadastros"]) {
      expect(chavesDasAreas({ [`financeiro:${chave}`]: true })).not.toContain("financeiro:acessos");
    }
  });

  it("ela sozinha NÃO abre o dinheiro — quem administra acesso não vê o cofre", () => {
    const chaves = chavesDasAreas({ "financeiro:acessos": true });
    expect(chaves).toContain("financeiro");
    expect(chaves).toContain("financeiro:acessos");
    expect(chaves).not.toContain("financeiro:ver");
    expect(chaves).not.toContain("financeiro:folha");
  });
});

describe("Na barra lateral: aparece para quem tem, some para todo o resto", () => {
  /**
   * O Financeiro já foi DISCRETO (fora da sidebar e da busca), pela ideia de
   * que área secreta não se anuncia. Não funcionou: discrição só protege de
   * quem passa pela tela por acaso, e quem tem a chave não passa por acaso —
   * usa a tela todo dia. O resultado foi o dono não achar a própria tela.
   *
   * A regra virou esta, e é o que estes testes seguram: quem tem a chave VÊ o
   * item; quem não tem não vê e não entra nem digitando o endereço. Esconder
   * nunca foi a segurança — a segurança é a área restrita.
   */
  it("quem tem a chave encontra o item na barra", () => {
    expect(MODULOS_DISCRETOS.has("financeiro")).toBe(false);
    const itens = navForKeys(["central", "financeiro"]);
    expect(JSON.stringify(itens)).toContain("/financeiro");
  });

  it("quem NÃO tem a chave não vê o item", () => {
    const itens = navForKeys(["central", "comercial", "estoque", "analytics"]);
    expect(JSON.stringify(itens)).not.toContain("/financeiro");
  });

  it("o admin comum não vê — porque a chave não chega nele", () => {
    // O item só existe na barra de quem tem a chave, e `PERMISSOES_DE_ADMIN`
    // não a concede. É a mesma trava do resto do arquivo, vista pela navegação.
    const itens = navForKeys(PERMISSOES_DE_ADMIN);
    expect(JSON.stringify(itens)).not.toContain("/financeiro");
  });

  it("ver o item não é entrar: o gate continua sendo a chave", () => {
    // Impede que alguém "simplifique" trocando o gate por obscuridade — ou o
    // contrário, achando que basta tirar da barra para proteger.
    expect(ehChaveRestrita("financeiro")).toBe(true);
    expect(PERMISSOES_DE_ADMIN).not.toContain("financeiro");
  });
});
