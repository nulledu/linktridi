import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Apagar de verdade — e a trava que separa apagar de inativar.
 *
 * Quatro cadastros (conta, patrimônio, recorrência, empresa) davam para criar e
 * não davam para desfazer: não existia `DELETE` na API nem botão na tela. Quem
 * está aprendendo o sistema cria três contas de teste e fica com elas para
 * sempre — "não consigo excluir o que eu subo" foi exatamente a reclamação.
 *
 * A regra que este arquivo protege é a que impede a correção de virar um
 * problema pior: **linha com história não some.** Uma conta com movimento
 * explica o extrato do ano passado, e apagá-la deixaria o extrato sem
 * explicação. Nesses casos a resposta é 409 dizendo o que segura, e o caminho
 * é inativar — que cada tela já tem.
 *
 * É leitura de arquivo porque a rota é um handler do Next que depende de
 * sessão e de Supabase; o que precisa ser travado aqui é a POLÍTICA, e ela é
 * declarativa. Um `segura: []` acrescentado sem pensar passaria despercebido
 * em qualquer teste de comportamento e apagaria histórico em produção.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ROTA = readFileSync(join(RAIZ, "app/api/financeiro/excluir/route.ts"), "utf8");

describe("Excluir — o que a rota promete", () => {
  it("só os sete tipos combinados, e nada além", () => {
    // A lista é fechada de propósito: um tipo novo aqui é permissão de apagar,
    // e isso precisa ser decisão, não descuido. `colaborador` entrou junto com
    // a folha mensal; `estorno` com a aba de estornos — nada aponta para ele,
    // então apagar é livre (com a dupla checagem da tela).
    const tipos = [...ROTA.matchAll(/^ {2}(\w+): \{$/gm)].map((m) => m[1]);
    expect(new Set(tipos)).toEqual(
      new Set(["conta", "compromisso", "patrimonio", "recorrencia", "empresa", "colaborador", "estorno"]));
  });

  it("cada tipo exige a MESMA chave da tela que o mostra", () => {
    // Divergir aqui é o bug clássico do repositório: a tela abre e a
    // requisição volta 403, que se lê como "está quebrado".
    for (const [tipo, chave] of [
      ["conta", "contas"], ["patrimonio", "patrimonio"], ["compromisso", "compromissos"],
      ["recorrencia", "cadastros"], ["empresa", "config"], ["colaborador", "folha"],
    ]) {
      const bloco = ROTA.slice(ROTA.indexOf(`  ${tipo}: {`));
      expect(bloco.slice(0, 400), `${tipo} está com a chave errada`)
        .toContain(`chave: "${chave}"`);
    }
  });

  it("conta com movimento NÃO some — é o extrato que ela explica", () => {
    const bloco = ROTA.slice(ROTA.indexOf("  conta: {"), ROTA.indexOf("  patrimonio: {"));
    expect(bloco).toContain('tabela: "fin_movimentos"');
    expect(bloco).toContain('tabela: "fin_compromissos"');
    // Cartão pendurado na conta-mãe: apagar a mãe deixaria o cartão órfão.
    expect(bloco).toContain('coluna: "conta_mae_id"');
  });

  it("recorrência: só o compromisso PAGO segura", () => {
    // Barrar qualquer gerado tornava impossível desfazer o caso mais comum:
    // criar a regra com "lançar a primeira" e ver no segundo seguinte que
    // estava errada. Ela nascia com um compromisso, logo nascia impossível de
    // apagar — falando em "histórico" de uma conta que ninguém pagou.
    const bloco = ROTA.slice(ROTA.indexOf("  recorrencia: {"), ROTA.indexOf("  empresa: {"));
    expect(bloco).toContain('coluna: "origem_id"');
    expect(bloco).toContain('coluna: "pago_em"');
    expect(bloco).toContain('diz: "compromissos já pagos"');
  });

  it("recorrência arrasta os gerados NÃO pagos, para não sobrar conta órfã", () => {
    const bloco = ROTA.slice(ROTA.indexOf("  recorrencia: {"), ROTA.indexOf("  empresa: {"));
    expect(bloco).toContain("arrasta:");
    expect(bloco).toContain('so: "pago_em.is.null"');
  });

  it("o que arrasta sai DEPOIS da conferência, nunca antes", () => {
    // Limpar primeiro apagaria os compromissos e só então descobriria que algo
    // segurava — deixando a regra de pé e o rastro dela destruído.
    expect(ROTA.indexOf("for (const s of alvo.segura)"))
      .toBeLessThan(ROTA.indexOf('if ("arrasta" in alvo'));
  });

  it("empresa é a mais travada: qualquer vínculo segura", () => {
    const bloco = ROTA.slice(ROTA.indexOf("  empresa: {"));
    for (const t of [
      "fin_compromissos", "fin_compras", "fin_notas", "fin_contas", "fin_fornecedores",
      "fin_contatos", "fin_colaboradores", "fin_patrimonio", "fin_recorrencias", "fin_movimentos",
    ]) {
      expect(bloco, `empresa deixou de conferir ${t}`).toContain(`tabela: "${t}"`);
    }
  });

  it("a última empresa nunca some — sem ela o módulo fica sem porta", () => {
    expect(ROTA).toMatch(/count \?\? 0\) <= 1/);
  });

  it("a empresa sai da LINHA, nunca da querystring", () => {
    // Aceitar a empresa do cliente deixaria apagar registro de uma empresa que
    // a pessoa não pode nem abrir.
    expect(ROTA).toContain("empresaPermitida");
    expect(ROTA).not.toMatch(/searchParams\.get\("empresa/);
  });

  it("o id é conferido como uuid ANTES de ir ao banco", () => {
    // Texto que não é uuid chega no Postgres como 22P02, um erro cru que não
    // explica nada a quem está na frente da tela.
    expect(ROTA).toMatch(/UUID\.test\(id\)/);
  });

  it("violação de chave estrangeira vira recusa explicada, não 500", () => {
    // Rede para o vínculo que alguém criar amanhã e esquecer de listar.
    expect(ROTA).toContain('"23503"');
  });

  it("apagar é auditado, com o nome do que sumiu", () => {
    // Sem o nome, a auditoria guarda um uuid de uma linha que não existe mais.
    const trecho = ROTA.slice(ROTA.indexOf("await auditar("));
    expect(trecho).toContain('acao: "excluir"');
    expect(trecho).toContain("nome:");
  });

  it("o link assinado do logo é esquecido junto", () => {
    // Senão o cache de 45 min continua servindo a marca de um registro que
    // já não existe.
    expect(ROTA).toContain("esquecerLogo");
  });
});

describe("Excluir — a tela oferece o botão", () => {
  const tela = (p: string) => readFileSync(join(RAIZ, p), "utf8");
  const TELAS: [string, string][] = [
    ["app/(plataforma)/financeiro/cadastros/contas/ContasClient.tsx", "conta"],
    ["app/(plataforma)/financeiro/patrimonio/PatrimonioClient.tsx", "patrimonio"],
    ["app/(plataforma)/financeiro/cadastros/recorrencias/RecorrenciasClient.tsx", "recorrencia"],
    ["app/(plataforma)/financeiro/configuracoes/ConfiguracoesClient.tsx", "empresa"],
  ];

  it.each(TELAS)("%s tem o botão de apagar", (caminho, tipo) => {
    const s = tela(caminho);
    expect(s).toContain("BotaoApagar");
    expect(s).toContain(`tipo="${tipo}"`);
  });

  it("apagar pergunta antes, e a pergunta nomeia o registro", () => {
    const kit = tela("app/(plataforma)/financeiro/ui.tsx");
    const bloco = kit.slice(kit.indexOf("export function BotaoApagar"));
    expect(bloco).toContain("await confirmar(");
    expect(bloco).toContain("perigo: true");
    // A mensagem do servidor chega inteira: é ela que diz "tem 3 movimentos".
    expect(bloco).toContain("dados.erro ??");
  });
});

describe("Compromisso — apagar não é cancelar", () => {
  it("cancelar continua existindo: a rota de compromissos NÃO apaga", () => {
    // `DELETE /api/financeiro/compromissos/[id]` marca 'cancelado' e mantém a
    // linha, que é o certo para a conta que existiu e não vai mais ser paga.
    const rota = readFileSync(join(RAIZ, "app/api/financeiro/compromissos/[id]/route.ts"), "utf8");
    const bloco = rota.slice(rota.indexOf("export async function DELETE"));
    expect(bloco).toContain('status: "cancelado"');
    expect(bloco).not.toContain(".delete()");
  });

  it("o dinheiro é o que segura: movimento no extrato", () => {
    const bloco = ROTA.slice(ROTA.indexOf("  compromisso: {"), ROTA.indexOf("  patrimonio: {"));
    expect(bloco).toContain('tabela: "fin_movimentos"');
    expect(bloco).toContain('coluna: "compromisso_id"');
  });

  it("pago sem movimento também segura — baixa antiga é dinheiro que saiu", () => {
    const bloco = ROTA.slice(ROTA.indexOf("  compromisso: {"), ROTA.indexOf("  patrimonio: {"));
    expect(bloco).toContain('coluna: "pago_em"');
  });

  it("a tela oferece apagar, e avisa quando a recorrência vai gerar de novo", () => {
    const tela = readFileSync(join(RAIZ, "app/(plataforma)/financeiro/compromissos/CompromissosClient.tsx"), "utf8");
    expect(tela).toContain('tipo="compromisso"');
    expect(tela).toContain('selecionado.origem === "recorrencia"');
  });
});
