import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { VENDAS_EXEMPLO } from "@/lib/vendas-sample";

/**
 * Analytics › Vendas — Marketing e Marketplace.
 *
 * Três regras que a reformulação de ago/2026 estabeleceu, e que voltam sozinhas
 * se ninguém as travar:
 *
 *  1. TELA DE ANÁLISE NÃO EDITA CONFIG. A aba Marketing tinha um `select` de
 *     carteira por conta, um campo "Teto mensal" e um botão "Salvar
 *     classificação e teto" no rodapé de uma tabela de leitura — com portão
 *     `analytics` gravando config do TRÁFEGO. Quem tinha Analytics sem Tráfego
 *     via os campos e tomava 403 ao salvar. Isso vive em Tráfego Pago ›
 *     Integrações.
 *  2. UMA TELA, UM PERÍODO. O bloco do X1 trazia o próprio `PeriodPicker`:
 *     trocar o seletor do topo não mexia nos números dele, e a pessoa lia dois
 *     períodos empilhados sem nenhum aviso.
 *  3. OS DOIS NÚMEROS DE "QUANTO O ANÚNCIO TROUXE" ANDAM JUNTOS. A receita
 *     atribuída pela Meta e a que o caixa registrou divergem em dezenas de por
 *     cento; mostrar só uma faz alguém somá-la ao faturamento e contar a mesma
 *     venda duas vezes.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8");

const VENDAS = ler("app/(plataforma)/vendas/VendasClient.tsx");
/**
 * Sem comentários de bloco.
 *
 * Os comentários do arquivo CITAM o que foi removido ("um campo Teto mensal e um
 * botão Salvar classificação e teto") — é a explicação de por que aquilo saiu, e
 * ela tem que continuar lá. Procurar a string no arquivo inteiro dava falso
 * positivo na própria justificativa da mudança.
 */
const VENDAS_CODIGO = VENDAS.replace(/\/\*[\s\S]*?\*\//g, "");
const X1 = ler("app/(plataforma)/comercial/MarketingX1.tsx");
const CONTAS = ler("app/(plataforma)/trafego/ContasAnuncioView.tsx");
const INTEGRACOES = ler("app/(plataforma)/trafego/IntegracoesCentral.tsx");

describe("Analytics › Marketing — a config saiu da tela de análise", () => {
  it("a tela de Vendas não ESCREVE em /api/marketing-config", () => {
    // Ler a config é legítimo (a tela mostra o teto). Gravar, não: o portão
    // desta tela é `analytics` e o que se grava é config do Tráfego.
    const escreve = /marketing-config[\s\S]{0,220}?method:\s*"(PUT|POST|PATCH)"/.test(VENDAS)
      || /method:\s*"(PUT|POST|PATCH)"[\s\S]{0,220}?marketing-config/.test(VENDAS);
    expect(escreve, "Analytics voltou a gravar a config do Tráfego. Isso mora em Tráfego Pago › Integrações.").toBe(false);
  });

  it("nem o campo de teto nem o botão de salvar voltaram", () => {
    expect(VENDAS_CODIGO).not.toMatch(/Teto mensal/);
    expect(VENDAS_CODIGO).not.toMatch(/Salvar classificação/);
  });

  it("a config tem UM endereço, e ele está no módulo dono do assunto", () => {
    expect(CONTAS).toMatch(/method:\s*"PUT"/);
    expect(CONTAS).toMatch(/marketing-config/);
    expect(INTEGRACOES, "a tela de carteira/teto precisa estar montada em algum lugar").toMatch(/<ContasAnuncioView\s*\/>/);
  });

  it("a tela de config avisa que a carteira NÃO é a linha de produto", () => {
    // O nome da conta engana: "VSL - Carimbos Ma1" roda campanha {CH} o tempo
    // todo. Sem esta frase, o corte por carteira lê-se como a resposta
    // definitiva sobre linha de produto — e não é.
    expect(CONTAS).toMatch(/tag da campanha/i);
  });
});

describe("Analytics › Marketing — uma tela, um período", () => {
  it("o X1 aceita o período do pai", () => {
    expect(X1).toMatch(/periodo\?:\s*PeriodState/);
  });

  it("o X1 não desenha o próprio seletor quando o pai manda o período", () => {
    expect(X1).toMatch(/\{!periodo && <PeriodPicker/);
  });

  it("a aba Marketing sempre passa o período pro X1", () => {
    // `<MarketingX1 />` sem prop dentro desta tela é o defeito de volta.
    const usos = VENDAS.match(/<MarketingX1[^>]*>/g) ?? [];
    expect(usos.length, "o X1 sumiu da aba Marketing").toBeGreaterThan(0);
    for (const u of usos) expect(u, `sem período: ${u}`).toMatch(/periodo=/);
  });
});

describe("Analytics › Marketing — Meta e caixa lado a lado", () => {
  it("o snapshot carrega a receita atribuída pela Meta", () => {
    // Antes a tela derivava `spend × roas`, que erra pelo arredondamento de 2
    // casas do ROAS — numa conta de R$ 6.840 isso é dezenas de reais de erro
    // num número que existe pra ser comparado com outro.
    expect(typeof VENDAS_EXEMPLO.marketing.metaRevenue).toBe("number");
    expect(typeof VENDAS_EXEMPLO.marketing.metaPurchases).toBe("number");
  });

  it("a tela mostra os DOIS números, não um deles", () => {
    expect(VENDAS).toMatch(/metaRevenue/);
    expect(VENDAS).toMatch(/A Meta credita/);
    expect(VENDAS).toMatch(/O caixa registrou/);
  });

  it("o retrato de prova nasce com os dois DIFERENTES", () => {
    // Retrato em que Meta e caixa batem não prova o bloco de reconciliação —
    // ele desenharia "os dois batem no período" e a divergência, que é o caso
    // real e o que a tela precisa explicar, nunca apareceria no banco de provas.
    const m = VENDAS_EXEMPLO.marketing;
    expect(m.metaRevenue).not.toBe(m.paid.revenue);
  });
});

/**
 * 4. A MANCHETE DO MARKETING É O TRIDIFY. Em 12/09/2026 a aba abria com uma
 *    "receita do marketing" (tráfego + orgânico, R$ 49.928) que não existe no
 *    Tridify, um CPA de R$ 120 (fatura crua ÷ compras da Meta) onde o Tridify
 *    dá R$ 164 (gasto + imposto ÷ pedidos do tráfego), o imposto fixo em
 *    1,1383 no código e ROAS por conta contra a fatura crua. O dono comparou
 *    com o Tridify e nada batia. Aqui a tela lê campo, não refaz conta.
 */
describe("Analytics › Marketing — a manchete é o Tridify", () => {
  const LIB = ler("lib/vendas.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("faturamento, gasto, ROAS, CPA e lucro saem do snapshot do Tridify", () => {
    for (const campo of ["tri.faturamentoTrafego", "tri.gasto", "tri.gastoComImposto", "tri.roas", "tri.cpaTrafego", "tri.lucro"]) {
      expect(LIB, `lib/vendas.ts parou de ler ${campo}`).toContain(campo);
    }
  });

  it("sem imposto fixo nem ROAS refeito com a receita da Meta", () => {
    expect(LIB).not.toMatch(/1[.,]1383/);
    expect(LIB).not.toMatch(/metaRevenue\s*\/\s*spend/);
  });

  it("a tela não monta receita nem retorno próprios", () => {
    expect(VENDAS_CODIGO).not.toMatch(/Receita do marketing/);
    expect(VENDAS_CODIGO).not.toMatch(/m\.paid\.revenue\s*\/\s*/);
    expect(VENDAS_CODIGO).toMatch(/Faturamento do tráfego/);
  });

  it("o retrato de prova respeita a definição do Tridify", () => {
    const m = VENDAS_EXEMPLO.marketing;
    expect(m.roas).toBeCloseTo(m.faturamentoTrafego.revenue / (m.spendReal ?? 1), 2);
    expect(m.lucro).toBe(m.faturamentoTrafego.revenue - (m.spendReal ?? 0));
  });

  it("a conta por conta é UMA função, nas duas telas", async () => {
    const { agregarConta } = await import("@/lib/marketing-const");
    const a = agregarConta(1000, 10, 3000);
    expect(a.custo).toBeCloseTo(1138.3, 1);
    expect(a.roas).toBeCloseTo(3000 / 1138.3, 4);   // contra o gasto COM imposto
    expect(a.cpa).toBeCloseTo(113.83, 2);
    expect(LIB).toMatch(/agregarConta\(/);
    expect(ler("app/(plataforma)/trafego/ContasBM.tsx")).toMatch(/agregarConta\(/);
  });

  it("o eixo dos gráficos não corta o rótulo", () => {
    // Com left: -22 sobravam 30px dos 52 do eixo: "4,5 mil" virava "5 mil" e o
    // eixo lia 6 / 5 / 3 / 5 mil — um gráfico que parece dado inventado.
    for (const f of ["MonoRoundedAreaChart", "MonoRoundedLineChart"]) {
      const m = /left:\s*eixoY\s*\?\s*(-?\d+)/.exec(ler(`app/(plataforma)/ui/monocharts/${f}.tsx`));
      expect(m, f).not.toBeNull();
      expect(Number(m![1]), `${f}: margem esquerda corta o rótulo do eixo`).toBeGreaterThanOrEqual(-4);
    }
  });
});

describe("Analytics › Marketplace", () => {
  it("mostra a participação no faturamento da empresa", () => {
    // Marketplace é canal que SOMA no total da empresa: o valor solto não diz
    // nada sem o peso dele.
    expect(VENDAS).toMatch(/do faturamento da empresa/);
  });

  it("mostra o ticket POR plataforma", () => {
    // Shopee e Mercado Livre não vendem o mesmo ticket, e é essa a diferença
    // de operação entre eles — o total não conta isso.
    expect(VENDAS_CODIGO).toMatch(/ticket \{fmtBRL2\(ticket\)\}/);
  });

  it("a lista de origens diz COMO cada uma conta", () => {
    // O painel se chama "Como cada uma conta hoje" e não mostrava o tipo.
    expect(VENDAS).toMatch(/<PlatformList rows=\{snap\.fontes\} mostrarTipo \/>/);
  });
});
