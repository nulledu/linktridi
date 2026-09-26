import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Travas de regressão para os dois achados ALTA da auditoria
// (docs/seguranca-auditoria.md). São achados que voltam como UMA linha num
// arquivo sobre outro assunto — do mesmo jeito que os incidentes de consumo
// voltaram (ver orcamento-de-execucao.test.ts). A defesa é o teste, não o doc.
const ler = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("A1 — APP_PREVIEW_BYPASS só decide por previewBypassAtivo (gate por NODE_ENV)", () => {
  it("require-auth.ts não lê o flag cru e passa pela trava", () => {
    const src = ler("lib/require-auth.ts");
    // A comparação crua era o bug: sem gate por ambiente, valia em produção.
    expect(src).not.toContain('APP_PREVIEW_BYPASS === "1"');
    expect(src).toContain("previewBypassAtivo");
  });

  it("middleware.ts não lê o flag cru e passa pela trava", () => {
    const src = ler("middleware.ts");
    expect(src).not.toContain('APP_PREVIEW_BYPASS === "1"');
    expect(src).toContain("previewBypassAtivo");
  });

  it("só lib/preview-bypass.ts pode ler o env cru (fonte única da decisão)", () => {
    const src = ler("lib/preview-bypass.ts");
    expect(src).toContain('process.env.APP_PREVIEW_BYPASS === "1"');
    expect(src).toContain('process.env.NODE_ENV !== "production"');
  });
});

describe("A2 — rota pública não gasta getUser por causa de cookie forjado", () => {
  it("middleware.ts não condiciona a saída pública à presença de cookie", () => {
    const src = ler("middleware.ts");
    // O gate vulnerável olhava só o NOME do cookie sb-*auth-token; um valor
    // forjado e rotativo furava a saída barata e forçava um round-trip por
    // request (Denial of Wallet). A saída de rota pública não pode depender de
    // cookie nenhum.
    expect(src).not.toContain("temCookieSessao");
    expect(src).not.toContain("!temCookieSessao");
  });
});

describe("AUTH — criar pessoa NÃO abre porta de acesso", () => {
  // Quem autoriza o 1º acesso é o LINK que o admin gera. Um caminho de criação
  // que já deixasse a conta acessível (senha conhecida, prazo aberto, token
  // pré-gerado) traria de volta o buraco original: dezenas de contas criadas em
  // lote, todas entráveis por quem soubesse o nome de usuário.
  const CAMINHOS = [
    "lib/colaboradores-admin.ts",           // ficha avulsa + lote (criarColaborador)
    "app/api/colaboradores/import-erp/route.ts",
  ];
  for (const arquivo of CAMINHOS) {
    it(`${arquivo} cria sem senha utilizável e sem link`, () => {
      const src = ler(arquivo);
      expect(src).toContain("password_set: false");
      // Nada de gerar link na criação: o link nasce só quando um admin pede.
      expect(src).not.toContain("gerarTokenPrimeiroAcesso");
      // Senha temporária tem que ser imprevisível (Math.random não serve).
      expect(src).toContain("crypto.randomUUID");
      // A CHAMADA, não a palavra — citar o nome num comentário é legítimo.
      expect(src).not.toContain("Math.random(");
    });
  }
});

describe("AUTH — o 1º acesso não pode virar tomada do sistema", () => {
  it("o usuário escolhido é conferido contra a lista de superusuários", () => {
    // ehSuperusuario casa por USERNAME (lib/superusuario.ts): sem esta guarda,
    // a pessoa digitaria "caio" no próprio primeiro acesso e atravessaria todos
    // os gates do ERP.
    const src = ler("app/api/auth/primeiro-acesso/route.ts");
    expect(src).toContain("ehSuperusuario");
    expect(src).toContain("validarUsuarioEscolhido");
  });
});

describe("AUTH — login não pode reabrir o buraco por SQL pela metade", () => {
  it("as colunas novas degradam UMA de cada vez, não juntas", () => {
    // As duas colunas vêm de SQL independentes. Pedir as duas numa consulta só
    // e largar tudo no fallback fazia a janela do 1º acesso sumir quando só o
    // outro SQL faltava — o buraco reabria calado.
    const src = ler("app/api/auth/login/route.ts");
    expect(src).toContain('buscar("primeiro_acesso_expira_em")');
    expect(src).toContain('buscar("geo_livre")');
  });

  it("erro de leitura do perfil vira 503, não 'senha inválida'", () => {
    // Erro de banco devolvendo 401 trancava todo mundo E debitava o freio.
    const src = ler("app/api/auth/login/route.ts");
    expect(src).toContain("indisponivel");
    expect(src).toContain("503");
  });
});

describe("AUTH — rota de escrita confere `active`, não só 'tem sessão'", () => {
  // getAuthedUser só diz que existe uma sessão válida; quem confere se a pessoa
  // ainda TRABALHA aqui é getProfile (checa active/role em require-auth.ts:56).
  // Rota de escrita gateada só por getAuthedUser deixa quem foi DESLIGADO
  // continuar escrevendo enquanto a sessão do navegador durar.
  const ROTAS = ["app/api/upload/route.ts", "app/api/salespeople/route.ts", "app/api/teams/route.ts"];
  for (const rota of ROTAS) {
    it(`${rota} não usa getAuthedUser como gate`, () => {
      const src = ler(rota);
      // A CHAMADA, não a palavra — citar o nome num comentário é legítimo.
      expect(src, "trocar por getProfile, que confere active").not.toContain("getAuthedUser(");
    });
  }
});

describe("M1 — a rota pública /api/sales não lê PII de cliente", () => {
  // /api/sales é pública por design (a TV é anônima). Enquanto o que sai é
  // agregado de parede, tudo bem; o risco é alguém wire uma tabela de dado
  // pessoal/linha crua e vazar sem login. Esta trava proíbe isso na rota.
  const PROIBIDAS = [
    "contatos", "clientes", "leads", "tridichat", "conversas", "mensagens",
    "central_solicitacoes", "comercial_pedidos", "logistica_pedido",
  ];
  it("não referencia nenhuma tabela de PII de cliente", () => {
    const src = ler("app/api/sales/route.ts");
    for (const t of PROIBIDAS) {
      expect(src.includes(`from("${t}")`), `sales público não pode ler ${t}`).toBe(false);
    }
  });
});

describe("M5 — toda rota do leitor do galpão passa pelo freio (rate limit)", () => {
  // As rotas /api/estoque/device/* são anônimas (sem cookie) e algumas escrevem
  // no banco a cada chamada. Sem freio, um martelo vira invocação + escrita sem
  // teto (Denial of Wallet). Uma rota nova que esqueça o freio reabre o buraco —
  // esta trava obriga cada handler a consumir o freio.
  const dir = join(process.cwd(), "app/api/estoque/device");
  const rotas = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(dir, e.name, "route.ts"))
    .filter((p) => {
      try { readFileSync(p); return true; } catch { return false; }
    });

  it("existe pelo menos uma rota de device pra cobrir", () => {
    expect(rotas.length).toBeGreaterThan(0);
  });

  for (const p of rotas) {
    const nome = p.slice(p.indexOf("device/"));
    it(`${nome} consome um freio antes de trabalhar`, () => {
      const src = readFileSync(p, "utf8");
      expect(src).toMatch(/freio\w*\.consumir\(/);
    });
  }
});

describe("CRÍTICO — rota de dreno da fila freia com 503 (transitório), nunca 429", () => {
  // O app (estoque-app/.../sync/FilaReducer.kt) classifica 4xx como falha
  // DEFINITIVA: um 429 na baixa/recebimento/conferência marcava a operação como
  // perdida e ela SUMIA da fila offline — perda de movimento de estoque. 5xx é
  // transitório (fica na fila). Estas rotas TÊM que freiar com 503, nunca 429.
  const DRENO = ["baixa", "recebimento", "conferencia"];
  for (const rota of DRENO) {
    it(`device/${rota} usa resposta503 no freio, não resposta429`, () => {
      const src = ler(`app/api/estoque/device/${rota}/route.ts`);
      expect(src).toContain("resposta503");
      expect(src, "429 aqui apaga a operação da fila do app").not.toContain("resposta429");
    });
  }

  // Causa TRANSITÓRIA do servidor (migração pendente) não pode virar 4xx: o app
  // classifica 400..499 como falha DEFINITIVA e a operação some da fila offline.
  const TRANSITORIOS = [
    { rota: "baixa", token: "schema_desatualizado" },
    { rota: "conferencia", token: "schema_desatualizado" },
    { rota: "recebimento", token: "tabela_ausente" },
  ];
  for (const { rota, token } of TRANSITORIOS) {
    it(`device/${rota}: ${token} responde 503 (transitório), nunca 4xx`, () => {
      const src = ler(`app/api/estoque/device/${rota}/route.ts`);
      const linha = src.split("\n").find((l) => l.includes(`"${token}"`) && l.includes("status:"));
      expect(linha, `${token} precisa de uma resposta com status`).toBeTruthy();
      expect(linha).toContain("503");
    });
  }
});
