import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O desenho da folha mensal — as decisões que alguém desfaria sem perceber.
 *
 * Cada uma veio de um pedido explícito do dono, e nenhuma aparece num teste de
 * comportamento: são escolhas de tela e de rota que regridem em silêncio.
 */

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const TELA = ler("app/(plataforma)/financeiro/cadastros/colaboradores/ColaboradoresClient.tsx");
const ROTA = ler("app/api/financeiro/folha/mensal/route.ts");
const SERVIDOR = ler("lib/financeiro/folha-mensal-servidor.ts");

describe("A tabela do mês", () => {
  it("o pago é um check NA LINHA — saber se pagou não custa abrir a pessoa", () => {
    // Virou o CheckPago (receita 25), mas continua NA linha da tabela.
    expect(TELA).toContain('role="checkbox"');
  });

  it("marcar pago ABRE a conferência; desmarcar é direto", () => {
    // Fechar pagamento pergunta das faltas do ponto e das horas extras.
    // Desfazer não passa por cerimônia nenhuma.
    expect(TELA).toContain("if (v) aoFecharPagamento(c.id); else void aoGravar(c.id, { pago: false })");
    expect(TELA).toContain("FecharPagamentoPainel");
  });

  it("a resposta padrão das horas extras é NÃO — debitar banco não é default", () => {
    expect(TELA).toContain('useState<"nao" | "sim">("nao")');
    expect(TELA).toContain("Foram pagas as horas extras?");
  });

  it("a célula de dinheiro é DIGITAÇÃO: texto pt-BR, sem spinner de number", () => {
    const celula = TELA.slice(TELA.indexOf("function CelulaDinheiro"), TELA.indexOf("function FaltasPainel"));
    expect(celula).toContain('type="text"');
    expect(celula).not.toContain('type="number"');
    expect(celula).toContain("dinheiroBR(");
  });

  it("Bruto e Líquido aparecem juntos; horas do ponto é UMA coluna", () => {
    // O bruto EMPILHA sob o líquido (sem coluna própria): é o que deixa a
    // folha caber na tela sem rolagem lateral — pedido literal.
    expect(TELA).toContain("bruto {moeda(totais.ganhos)}");
    expect(TELA).toContain(">Líquido</th>");
    expect(TELA).not.toContain(">Bruto</th>");
    expect(TELA).not.toContain(">H. extra</th>");
  });

  it("setor e vínculo empilham sob o nome — sem coluna própria", () => {
    expect(TELA).not.toContain(">Setor</th>");
    expect(TELA).not.toContain(">Vínculo</th>");
    expect(TELA).toContain('{c.setor || "—"} · {LABEL_VINCULO');
    // E a tabela não tem mais piso fixo de largura.
    expect(TELA).not.toContain("minWidth: 1320");
  });

  it("a comissão do acordo entra sozinha mas só CONGELA no fechamento", () => {
    // A sugestão entra pela PARTE de tráfego (as outras áreas são digitadas)
    // e vira número gravado quando o pagamento fecha.
    expect(TELA).toContain("comissaoAuto");
    expect(TELA).toContain("m && m.comissao_trafego === 0 && auto > 0 ? { comissao_trafego: auto } : {}");
    // A do gerenciador dos MARKETPLACES segue a mesma régua, na parte dela.
    expect(TELA).toContain("m && m.comissao_marketplace === 0 && mkt > 0 ? { comissao_marketplace: mkt } : {}");
    expect(TELA).toContain("comissaoMarketplaceSugerida");
    // A das VENDEDORAS vem da planilha do ERP, na parte Vendas.
    expect(TELA).toContain("m && m.comissao_vendas === 0 && vendas > 0 ? { comissao_vendas: vendas } : {}");
    expect(TELA).toContain("comissaoVendasSugerida");
  });

  it("a entrada automática é decidida POR MÊS e POR ÁREA — nunca um if solto", () => {
    // Setembro/2026 em diante nasce automático; agosto e antes, manual. A regra
    // mora em folha-mensal.ts e a tela só pergunta a ela.
    expect(TELA).toContain("entradaAutomatica(");
    expect(TELA).not.toContain('>= "2026-09');
    expect(SERVIDOR).toContain('"auto_vendas", "auto_trafego", "auto_marketplace"');
  });

  it("a comissão é a SOMA da regrinha — o total abre o detalhe, não se digita", () => {
    expect(TELA).toContain("ComissaoPainel");
    expect(TELA).toContain("COMISSAO_PARTES.map(");
    // O total nunca é campo editável direto: quem manda são as partes.
    const SERVIDOR_ = SERVIDOR;
    expect(SERVIDOR_).toContain('"comissao_vendas", "comissao_trafego", "comissao_marketplace", "comissao_outros"');
    expect(SERVIDOR_).not.toMatch(/CAMPOS_EDITAVEIS = \[[^\]]*"comissao"[,\]]/);
  });

  it("o nome é curto e o status é um ponto, não uma pílula", () => {
    expect(TELA).toContain("nomeCurto(c.nome)");
    expect(TELA).toContain('borderRadius: "50%"');
    // A coluna de Selo de status saiu da tabela junto com o Cargo.
    expect(TELA).not.toContain('chave: "status", label: "Status"');
  });

  it("cargo saiu da tabela — é assunto da ficha", () => {
    expect(TELA).not.toContain('label: "Cargo"');
  });

  it("a tabela larga rola POR DENTRO, e a pessoa fica grudada à esquerda", () => {
    // Regra da fundação: a página nunca rola de lado. E sem a coluna sticky,
    // no meio da rolagem ninguém sabe de quem é a linha que está editando.
    expect(TELA).toContain('overflowX: "auto"');
    expect(TELA).toContain('position: "sticky", left: 0');
  });

  it("a lista NÃO tem teto de altura — 21 pessoas são 21 linhas à vista", () => {
    // maxHeight + rolagem interna cortava em ~17 num monitor grande, e a
    // barra invisível fazia os últimos parecerem cadastros sumidos.
    const rolador = TELA.slice(TELA.indexOf("function FolhaTabela"), TELA.indexOf("<table"));
    expect(rolador).not.toMatch(/maxHeight: ["\d]/);
  });

  it("a data-limite é o 5º dia útil calculado, não um número fixo", () => {
    expect(TELA).toContain("dataLimiteDePagamento(mesDaFolha)");
  });

  it("as faltas mostram o DESCONTO antes de salvar — ninguém desconta sem ver", () => {
    expect(TELA).toContain("descontoPorFaltas(");
  });

  it("o vínculo (CLT/MEI/PF/Estágio) entrou no cadastro", () => {
    expect(TELA).toContain("VINCULOS.map(");
  });

  it("o mercadinho entra sozinho de setembro/2026 em diante; antes, a pedido", () => {
    // "Mercadinho também deve ser puxado por padrão" (01/09/2026). A regra
    // pela data mora em folha-mensal.ts; o botão fica só nos meses antigos.
    expect(TELA).toContain("mercadinhoAutomatico(");
    expect(TELA).toContain("puxarMercadinho");
    expect(TELA).toContain("Consumo do mercadinho aplicado");
    expect(TELA).toContain("mesDaFolha.slice(0, 10) < AUTOMATICO_DESDE");
    // E congela no fechamento, como as comissões.
    expect(TELA).toContain("m && m.mercadinho === 0 && merc > 0 ? { mercadinho: merc } : {}");
  });

  it("tráfego e marketplace são BÔNUS na tela; comissão é vendas + outros", () => {
    // "Venda em tráfego e marketplace é bônus e não comissão" — pedido literal.
    expect(TELA).toContain("bonusDoMes(");
    expect(TELA).toContain("comissaoDoMes(");
    expect(TELA).toContain('campos: ["bonus", "comissao_trafego", "comissao_marketplace"]');
    expect(TELA).toContain('campos: ["comissao_vendas", "comissao_outros"]');
  });

  it("comissão de VENDAS só é sugerida a quem vende — na tela e nas duas rotas", () => {
    // "TI não pode ter comissão em vendas": a planilha credita quem ATENDEU o
    // pagamento. Digitar à mão continua valendo; o que some é a sugestão.
    expect(TELA).toContain("podeComissaoDeVendas(");
    expect(TELA).toContain("vendasDaPessoa(");
    expect(ROTA).toContain("podeComissaoDeVendas(pes.setor)");
    const SUGESTOES = ler("app/api/financeiro/folha/sugestoes/route.ts");
    expect(SUGESTOES).toContain("podeComissaoDeVendas(p.setor)");
    // O setor precisa VIR do banco nas duas rotas, senão a regra lê `undefined`
    // e ninguém recebe.
    expect(ROTA).toContain("employee_id,setor");
    expect(SUGESTOES).toContain("id,employee_id,setor");
  });

  it("as sugestões não seguram o primeiro paint da folha", () => {
    // Cada conta desiste em 2,5 s; no render do servidor elas eram um piso de
    // espera para uma tela que já tem o salário de todo mundo em mãos.
    const PAGINA = ler("app/(plataforma)/financeiro/cadastros/colaboradores/page.tsx");
    for (const fonte of ["comissoesPorPessoa", "comissaoMarketplaceDoMes", "comissoesVendasPorPessoa"]) {
      expect(PAGINA, `${fonte} voltou para o render do servidor`).not.toContain(fonte);
    }
    expect(TELA).toContain("/api/financeiro/folha/sugestoes?competencia=");
  });

  it("a folha do mês sai em CSV ou Excel, do que está na tela", () => {
    expect(TELA).toContain('exportar("csv")');
    expect(TELA).toContain('exportar("xlsx")');
    expect(TELA).toContain("montarXLSX(");
  });
});

describe("A rota do mês", () => {
  it("a lista de campos editáveis é FECHADA — pago_em e empresa_id não passam", () => {
    expect(SERVIDOR).toContain("CAMPOS_EDITAVEIS");
    expect(ROTA).toContain("Campo fora da lista editável");
  });

  it("o lote confere o escopo do CONJUNTO — id alheio não pega carona", () => {
    expect(ROTA).toContain("Há pessoas fora das suas empresas");
  });

  it("parcial é dito como parcial (207), nunca como sucesso", () => {
    expect(ROTA).toContain("207");
  });

  it("falta de outro mês é recusada — a semana dela não pertence a este DSR", () => {
    expect(SERVIDOR).toContain("não é do mês");
  });

  it("só salário e gratificação atravessam o mês; o resto nasce zerado", () => {
    // "Os benefícios, bônus e etc têm que zerar todo mês" — pedido literal.
    const bloco = SERVIDOR.slice(SERVIDOR.indexOf("function mesNovo"), SERVIDOR.indexOf("export interface FolhaMensalDoEscopo"));
    expect(bloco).toContain("bonus: 0, comissao: 0, beneficios: 0");
    expect(bloco).toContain("herdado?.salario");
  });

  it("o banco de horas é o retrato NA VIRADA da competência, não o de hoje", () => {
    // Agosto conta horas até 31/08, mesmo consultado em setembro — sem o
    // corte, o ledger corrido arrastava os dias do mês seguinte para a folha.
    // O `await` saiu de dentro da lista do `Promise.all` (segurava as outras
    // duas leituras por uma ida inteira), mas o CORTE é o que importa aqui.
    // O que importa é o 4º argumento (o corte), não como se chama o mapa de
    // feriados — casar o nome da variável fazia o teste quebrar num rename que
    // não mudou comportamento nenhum.
    expect(SERVIDOR).toMatch(/bancoDeTodos\(mes,\s*\w+,\s*undefined,\s*fimDoMes\)/);
    expect(SERVIDOR).toContain("const feriadosP = feriadosMapa(mes);");
  });

  it("a ponte do mercadinho é forte ou não existe — nome parecido não desconta", () => {
    expect(SERVIDOR).toContain("usuario_id");
    expect(SERVIDOR).not.toMatch(/normalize\(.NFD.\)/);
  });
});

describe("A célula se comporta como planilha", () => {
  it("Enter desce a coluna — o fluxo de quem fecha folha sem mouse", () => {
    expect(TELA).toContain("descerColuna");
    expect(TELA).toContain("data-celula={campo}");
  });

  it("Esc CANCELA — o blur que segue não pode gravar do mesmo jeito", () => {
    expect(TELA).toContain("cancelado.current = true");
    const confirmar = TELA.slice(TELA.indexOf("async function confirmar"), TELA.indexOf("function descerColuna"));
    expect(confirmar).toContain("if (cancelado.current)");
  });

  it("o hold do pulso vem da escala, não de um número solto", () => {
    expect(TELA).toContain('duracaoCss("--duration-very-slow"');
    expect(TELA).not.toContain("setSalvou(false), 700");
  });

  it("nenhum easing cru sobrou nas células", () => {
    // `ease-out` sem var() era o mesmo valor fora do vocabulário — dois
    // lugares para mudar quando a escala mudar.
    expect(TELA).not.toMatch(/var\(--duration-\w+\) ease-out/);
  });
});

describe("Os controles da tela são os do módulo", () => {
  it("nenhum <select> nativo sobrou em Colaboradores", () => {
    const semComentarios = TELA.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(semComentarios).not.toMatch(/<select[\s>]/);
  });

  it("o Pago é a receita 25 — marcar tem de parecer conquistado", () => {
    expect(TELA).toContain('className="t-check');
    expect(TELA).toContain('aria-checked={marcado}');
    // O traço da receita, não um path inventado.
    expect(TELA).toContain("M1 5.52L3.92 9.17L9.17 1");
  });

  it("o lançamento agrupa por SINAL — falta não parece crédito", () => {
    expect(TELA).toContain('LANCAMENTO[t].sinal > 0 ? "Créditos" : "Descontos"');
  });
});

describe("O cartão na tela de contas", () => {
  const CONTAS = ler("app/(plataforma)/financeiro/cadastros/contas/ContasClient.tsx");

  it("tem a régua do limite com cor de ESTADO, e pagar fatura em um toque", () => {
    // A barra acompanha o usado da view em tempo real; a cor é semântica
    // (90% comido é perigo em qualquer paleta) — nunca da rampa de gráfico.
    expect(CONTAS).toContain('fracao >= 0.9 ? "var(--perigo)"');
    // O atalho abre a transferência JÁ preenchida: do banco do cartão, para o
    // cartão, no valor aberto — confirmar zera o usado.
    expect(CONTAS).toContain("de_id: c.conta_mae_id ?? \"\", para_id: c.id");
    expect(CONTAS).toContain("Fatura do cartão ${c.nome}");
    // A ação não rouba o clique da linha.
    expect(CONTAS).toContain("e.stopPropagation()");
  });
});
