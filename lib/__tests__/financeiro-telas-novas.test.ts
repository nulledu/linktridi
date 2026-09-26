import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O desenho pedido em set/2026 e as três coisas que ele não pode perder:
 * número que LEVA a algum lugar, painéis na horizontal, e a lista repartida
 * em cartão de empresa. Mais a regra das imagens: linha nenhuma mostra a
 * marca de outra entidade.
 */
const RAIZ = process.cwd();
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8");

const TELAS = {
  Compromissos: "app/(plataforma)/financeiro/compromissos/CompromissosClient.tsx",
  Recorrências: "app/(plataforma)/financeiro/cadastros/recorrencias/RecorrenciasClient.tsx",
  Bancos: "app/(plataforma)/financeiro/cadastros/contas/ContasClient.tsx",
};

/**
 * O módulo INTEIRO segue o mesmo desenho — não só as três telas que
 * começaram. Uma tela nova que nasce com `<Kpi>` e sem subtítulo quebra aqui.
 * `colaboradores` fica de fora: está sendo mexida em outra frente.
 */
const MODULO = [
  "app/(plataforma)/financeiro/page.tsx",
  "app/(plataforma)/financeiro/cadastros/page.tsx",
  "app/(plataforma)/financeiro/compras/ComprasClient.tsx",
  "app/(plataforma)/financeiro/notas/NotasClient.tsx",
  "app/(plataforma)/financeiro/estornos/EstornosClient.tsx",
  "app/(plataforma)/financeiro/patrimonio/PatrimonioClient.tsx",
  "app/(plataforma)/financeiro/auditoria/AuditoriaClient.tsx",
  "app/(plataforma)/financeiro/configuracoes/ConfiguracoesClient.tsx",
  "app/(plataforma)/financeiro/cadastros/contatos/ContatosClient.tsx",
  "app/(plataforma)/financeiro/cadastros/fornecedores/FornecedoresClient.tsx",
  ...Object.values(TELAS),
];

describe("As telas novas do Financeiro", () => {
  for (const [nome, arquivo] of Object.entries(TELAS)) {
    it(`${nome}: número com seta, painéis na horizontal e período no cabeçalho`, () => {
      const src = ler(arquivo);
      expect(src, "os números precisam levar a algum lugar (KpiSeta)").toContain("<KpiSeta");
      expect(src, "os painéis vão na horizontal (FaixaDePaineis)").toContain("<FaixaDePaineis");
      // O período manda em TUDO, então mora no cabeçalho da tela.
      const cabecalho = src.slice(src.indexOf("<Cabecalho"), src.indexOf("{schemaPendente"));
      expect(cabecalho, "o período tem que estar no cabeçalho da tela").toContain("<FiltroPeriodo");
      expect(cabecalho, "falta o subtítulo que diz pra que a tela serve").toContain("sub=");
    });
    it(`${nome}: nenhum tutorial nem nota de rodapé de volta`, () => {
      const src = ler(arquivo);
      expect(src).not.toContain("<Passos");
      expect(src).not.toContain("<NotaRodape");
    });
  }

  it("nenhuma tela do módulo ficou com o número antigo, sem seta", () => {
    const antigas = MODULO.filter((t) => /<Kpi\s/.test(ler(t)));
    expect(antigas, "estas telas ainda usam <Kpi> em vez de <KpiSeta>").toEqual([]);
  });

  it("toda tela do módulo diz pra que serve, no subtítulo", () => {
    const mudas = MODULO.filter((t) => !ler(t).includes("sub="));
    expect(mudas, "estas telas estão sem o subtítulo do cabeçalho").toEqual([]);
  });

  it("nenhuma tela do módulo trouxe tutorial de volta", () => {
    const comTutorial = MODULO.filter((t) => /<Passos|<NotaRodape/.test(ler(t)));
    expect(comTutorial).toEqual([]);
  });

  it("a lista por empresa é a MESMA peça em todo lugar", () => {
    const kit = ler("app/(plataforma)/financeiro/blocos.tsx");
    expect(kit, "ColunasPorEmpresa tem que morar no kit, desenhando CartaoEmpresa").toContain("export function ColunasPorEmpresa");
    expect(kit.slice(kit.indexOf("export function ColunasPorEmpresa"))).toContain("<CartaoEmpresa");
    // Ninguém redesenha o bloco por conta própria fora do kit.
    // Só vale pra tela de LISTA: a Visão Geral reparte cartõezinhos de conta
    // por empresa, que não são tabela e não pedem o cartão de bloco.
    const fora = MODULO.filter((t) => /<Tabela/.test(ler(t))
      && /agruparPorEmpresa\(/.test(ler(t))
      && !/CartaoEmpresa|ColunasPorEmpresa/.test(ler(t)));
    expect(fora, "estas telas agrupam por empresa sem usar a peça do kit").toEqual([]);
  });

    it("Compromissos e Recorrências repartem a lista em cartão de empresa", () => {
    for (const arquivo of [TELAS.Compromissos, TELAS["Recorrências"]]) {
      const src = ler(arquivo);
      expect(src).toContain("<CartaoEmpresa");
      expect(src).toContain("<GradeDeEmpresas");
    }
  });

  it("Bancos mostra um cartão por conta, com o que há pra pagar em cada uma", () => {
    const src = ler("app/(plataforma)/financeiro/cadastros/contas/PorBanco.tsx");
    expect(src).toContain("Fatura aberta");
    expect(src).toContain("Ver extrato");
    expect(src).toContain("agruparPorEmpresa(");
  });

  /**
   * O painel de vencimentos NÃO estica a fileira: a lista rola por dentro e o
   * cartão copia a altura dos vizinhos. Sem isso, seis cobranças deixavam
   * "Por categoria" com meia tela de vazio embaixo.
   */
  it("o painel de lista longa rola por dentro em vez de esticar a fileira", () => {
    for (const arquivo of Object.values(TELAS)) {
      expect(ler(arquivo), `${arquivo} não usa PainelRolante`).toContain("<PainelRolante");
    }
    const css = ler("app/globals.css");
    const regra = css.slice(css.indexOf(".fin-painel-rola { position: relative"));
    expect(regra.slice(0, 400), "o miolo tem que ser absoluto pra não contar na altura")
      .toMatch(/\.fin-painel-rola > \*\s*\{[^}]*position: absolute/);
    expect(regra.slice(0, 400)).toMatch(/overflow-y: auto/);
    // Empilhado, o cartão é a sua própria fileira: travar a altura ali só
    // esconderia conteúdo. Volta a fluir, com teto.
    expect(regra.slice(0, 900)).toMatch(/max-width: 700px\)[\s\S]*position: static/);
  });

  /**
   * O defeito das "imagens erradas": sem foto própria, a linha pegava
   * emprestada a logo do BANCO de onde ela sai — um imposto aparecia com a
   * marca do Itaú. Sem foto, entra o ícone da CATEGORIA.
   */
  it("linha sem foto usa o ícone da categoria, nunca a marca do banco", () => {
    const src = ler(TELAS.Compromissos);
    expect(src).toContain("iconeDaCategoria(");
    const marca = ler("lib/financeiro/marca-relacionada.ts");
    const fn = marca.slice(marca.indexOf("function completarLogoComConta"));
    expect(fn.slice(0, 260), "voltou a carimbar a logo da conta em quem não tem a sua")
      .not.toMatch(/logo_url:\s*conta\.logo_url/);
  });
});

/**
 * O subtítulo entrou em todo cabeçalho do módulo, e o bloco do título era
 * `flex: none`: no celular ele ficava da largura da frase inteira, passava da
 * tela, e o `overflow-x: clip` da fundação cortava o fim sem rolagem nenhuma
 * (CORTA — a varredura de rolagem não acusa, porque a página não rola).
 */
describe("Cabeçalho do módulo no celular", () => {
  it("o bloco do título pode encolher, pro subtítulo quebrar linha", () => {
    const ui = ler("app/(plataforma)/financeiro/ui.tsx");
    const cab = ui.slice(ui.indexOf("export function Cabecalho"), ui.indexOf("export function Cabecalho") + 3000);
    expect(cab, "o bloco do título voltou a `flex: none` — no celular o subtítulo é cortado")
      .not.toMatch(/flex: "none", minWidth: 0, display: "grid", gap: 2/);
    expect(cab).toMatch(/flex: "0 1 auto", minWidth: 0, display: "grid", gap: 2/);
  });
});
