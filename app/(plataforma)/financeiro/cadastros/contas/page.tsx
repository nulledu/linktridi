import { assinarLogos } from "@/lib/financeiro/anexos";
import { contextoFinanceiro } from "../../contexto";
import { colaboradores, compromissos, contas, movimentos, recorrencias, valoresDeRecorrencias } from "@/lib/financeiro/db";
import { previsoesDaAgenda } from "@/lib/financeiro/previsoes";
import { hojeISO, somarDias } from "@/lib/financeiro/calculos";
import type { Colaborador } from "@/lib/financeiro/tipos";
import { AvisoSchema, Cabecalho, Cartao, Vazio } from "../../ui";
import { ContasClient } from "./ContasClient";

export const dynamic = "force-dynamic";

/**
 * Bancos, gateways, cartões e carteiras (§11).
 *
 * VER é `financeiro:cadastros`; MEXER é `financeiro:contas`. São chaves
 * diferentes porque conferir saldo é rotina de muita gente, e transferir
 * dinheiro entre contas não é.
 *
 * `todas: true` traz também as inativas: uma conta encerrada continua
 * explicando o extrato do ano passado, e some da tela seria pior do que
 * aparecer com o selo apagado.
 */
export default async function ContasPage() {
  const { empresa, poderes, pendente, escopo, geral, empresas } = await contextoFinanceiro("cadastros");

  if (!empresa && !geral) {
    return (
      <>
        <Cabecalho titulo="Bancos e Gateways" />
        {pendente ? <AvisoSchema /> : (
          <Cartao>
            <Vazio
              icone="building-warehouse"
              titulo="Nenhuma empresa liberada para você"
              detalhe="O Financeiro trabalha por empresa (Tridi e Gedux). Peça a liberação a quem administra o módulo."
            />
          </Cartao>
        )}
      </>
    );
  }

  const hoje = hojeISO();

  const [fContas, fMovimentos, fPessoas, fCompromissos, fRecorrencias] = await Promise.all([
    contas(escopo, { todas: true }),
    // A janela é de 180 dias, e não dos 30 que o KPI pede, porque a tela lê o
    // mesmo extrato em dois horizontes: o número olha o mês, mas a coluna
    // "Última movimentação" precisa lembrar de conta parada há meses. Como a
    // consulta volta do mais NOVO para o mais velho, o corte do limite come o
    // passado — o recorte de 30 dias continua inteiro.
    movimentos(escopo, { de: somarDias(hoje, -180), limite: 500 }),
    // Nome de pessoa é dado de folha: sem `financeiro:folha` a lista nem sai do
    // banco, e a coluna Responsável mostra "—". Esconder no React não serviria,
    // porque os salários já teriam viajado até o navegador.
    poderes.folha
      ? colaboradores(escopo, { limite: 300 })
      : Promise.resolve({ dados: [] as Colaborador[], pendente: false }),
    // O que há PRA PAGAR em cada banco e cartão: tudo em aberto, de qualquer
    // data (a conta atrasada há meses continua sendo dívida do cartão), e a
    // tela recorta pelo período. Sem `de`, de propósito.
    compromissos(escopo, { situacao: "abertos", limite: 400 }),
    recorrencias(escopo, { limite: 300 }),
  ]);
  // SEGUNDA onda, as duas juntas: os valores combinados das recorrências (a
  // próxima volta entra como "previsto" no cartão em que ela sai — sem isso a
  // fatura do mês que vem parece menor do que é) e os logos. Nenhuma depende
  // da outra; em fila seria uma ida de 250–700 ms a mais em toda abertura.
  const [valoresCombinados, assinados] = await Promise.all([
    valoresDeRecorrencias(fRecorrencias.dados.map((r) => r.id)),
    assinarLogos(fContas.dados.map((c) => c.logo_url)),
  ]);
  const previsoes = previsoesDaAgenda(
    fRecorrencias.dados, fCompromissos.dados, somarDias(hoje, 365), hoje, valoresCombinados);

  const logos = Object.fromEntries(
    fContas.dados
      .map((c) => [c.id, c.logo_url ? assinados.get(c.logo_url) : null] as const)
      .filter((par): par is readonly [string, string] => !!par[1]),
  );

  return (
    <ContasClient
      // Trocar de empresa REMONTA a tela: `router.refresh()` preserva o estado
      // do cliente, e sem isto o filtro de conta ficava com o id da outra empresa
      // (lista vazia com "Todas" nos seletores) e o cadastro nascia na empresa
      // errada. Trava em financeiro-telas.test.ts.
      key={empresa?.id ?? "geral"}
      // As empresas liberadas: em "Visão geral" a tela não tem uma, e é o
      // FORMULÁRIO que pergunta em qual o cadastro nasce — esconder o botão de
      // criar, como era, fez parecer que o módulo inteiro tinha quebrado.
      empresas={empresas.map((e) => ({ id: e.id, nome: e.nome }))}
      geral={geral}
      hoje={hoje}
      compromissos={fCompromissos.dados}
      previsoes={previsoes}
      empresaId={empresa?.id ?? ""}
      empresaNome={empresa?.nome ?? "Visão geral"}
      podeEscrever={poderes.contas}
      lista={fContas.dados}
      movimentos={fMovimentos.dados}
      // Só `id` e `nome` atravessam: mandar o colaborador inteiro levaria
      // salário e benefício ao navegador de quem só precisa saber quem cuida
      // da conta.
      pessoas={fPessoas.dados.map((c) => ({ id: c.id, nome: c.nome }))}
      logos={logos}
      desde30={somarDias(hoje, -30)}
      schemaPendente={pendente || fContas.pendente || fMovimentos.pendente}
    />
  );
}
