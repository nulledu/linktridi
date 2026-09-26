import { contextoFinanceiro } from "../../contexto";
import { assinarLogos } from "@/lib/financeiro/anexos";
import { configDaEmpresa } from "@/lib/financeiro/config";
import { colaboradores, contas, lancamentosDaFolha, pessoasDoSistema } from "@/lib/financeiro/db";
import { folhaDoMes, fotosDoMercadinho, pontoDaFolha } from "@/lib/financeiro/folha-mensal-servidor";
import { competenciaDe, hojeISO } from "@/lib/financeiro/calculos";
import { AvisoSchema, Cabecalho, Cartao, Vazio } from "../../ui";
import { ColaboradoresClient } from "./ColaboradoresClient";

export const dynamic = "force-dynamic";

/**
 * Folha — a página INTEIRA exige `financeiro:folha` (§13).
 *
 * Não é a mesma chave do resto dos cadastros de propósito: salário é o dado
 * mais sensível do módulo. Quem tem o Financeiro sem esta sub vê o TOTAL da
 * folha na Visão Geral e nunca o valor de ninguém — e a barreira é o gate desta
 * página, não um `if` no React: escondido no navegador, o salário já teria
 * viajado até lá.
 */
export default async function ColaboradoresPage() {
  // ESTES DOIS NÃO DEPENDEM DA EMPRESA — então saem na frente, junto com a
  // resolução do contexto, em vez de depois dela. `contextoFinanceiro` custa
  // duas idas em sequência (quem é / qual empresa) e a folha esperava as duas
  // antes de sequer PEDIR a gente do ERP e a comissão do mês; agora as três
  // esperas correm juntas e a página perde uma onda inteira.
  // Sem `await` aqui de propósito: as promessas são consumidas no `Promise.all`
  // abaixo. As duas já são tolerantes a falha por dentro (a comissão inclusive
  // desiste em 2,5 s), então nenhuma vira rejeição solta.
  const fSistemaP = pessoasDoSistema();
  // As três SUGESTÕES (tráfego, marketplace, vendas) e a materialização do
  // bônus recorrente saíram daqui: cada uma desiste em 2,5 s, e enfileiradas
  // no render elas eram um piso de espera para uma tela que já tem tudo para
  // pintar. Agora a folha aparece e `/api/financeiro/folha/sugestoes` traz os
  // números depois — quem paga a folha lê o salário antes, não depois.

  const { empresa, pendente, poderes, escopo, geral, empresas } = await contextoFinanceiro("folha");

  if (!empresa && !geral) {
    return (
      <>
        <Cabecalho titulo="Colaboradores" />
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

  // A competência ABERTA é o mês corrente. Lançar vale/farmácia é sempre "deste
  // mês" — quem precisa mexer em outro mês está corrigindo o passado, e isso
  // passa pela auditoria, não pelo cadastro.
  const competencia = competenciaDe(hojeISO());

  // TUDO o que não depende de nada, numa RODADA SÓ.
  //
  // Eram cinco ondas em sequência — as quatro leituras, depois a comissão,
  // depois as fotos, depois a configuração. Cada ida custa 250–700 ms daqui,
  // então a tela pagava a soma de cinco esperas para buscar coisas que não
  // dependem umas das outras. Só as fotos dependem mesmo (precisam da lista de
  // pessoas para saber quais caminhos assinar), e essa é a segunda e última
  // onda — barata, porque as assinaturas ficam lembradas por 45 min e, sem
  // ninguém com foto, ela nem viaja.
  const [fPessoas, fContas, fLancamentos, fSistema, cfg] = await Promise.all([
    colaboradores(escopo, { limite: 400 }),
    // As contas DA EMPRESA, para dizer de onde sai o pagamento de cada pessoa.
    contas(escopo),
    lancamentosDaFolha(escopo, competencia),
    // Gente do ERP, para o cadastro "puxar" em vez de digitar o nome de novo.
    // Já em voo desde antes do contexto (ver acima).
    fSistemaP,
    // O dia padrão de pagamento; em "Visão geral" não há empresa e vale o
    // padrão do módulo.
    empresa ? configDaEmpresa(empresa.id) : Promise.resolve(null),
  ]);

  // SEGUNDA (e última) onda: tudo aqui depende só da LISTA de pessoas, e nada
  // depende do vizinho — então sai junto. Eram quatro esperas enfileiradas
  // (folha, foto do totem, ponto, assinatura das fotos); a soma de quatro idas
  // de 250–700 ms era o que a folha demorava DEPOIS de já ter os dados.
  const chaves = fPessoas.dados.map((c) => ({ id: c.id, employee_id: c.employee_id }));
  const [folhaMes, fotosTotem, pontoMes, assinados] = await Promise.all([
    folhaDoMes(
      fPessoas.dados.map((c) => ({
        id: c.id, empresa_id: c.empresa_id, employee_id: c.employee_id,
        salario_base: c.salario_base, gratificacao: c.gratificacao,
      })),
      competencia,
    ),
    // As fotos que já existem no mercadinho, para quem não subiu uma na ficha.
    // A própria vence; a do totem preenche o resto — 23 uploads a menos.
    fotosDoMercadinho(chaves),
    // Extras, banco e faltas do mês, direto do ponto — a folha não recalcula.
    pontoDaFolha(chaves, competencia),
    // Uma chamada só para as fotos de todo mundo — e só de quem tem foto.
    assinarLogos(fPessoas.dados.map((c) => c.logo_url)),
  ]);

  const folhaDiaPadrao = cfg?.folha_dia_padrao ?? 5;

  const logos = Object.fromEntries(
    fPessoas.dados
      .map((c) => [c.id, c.logo_url ? assinados.get(c.logo_url) : null] as const)
      .filter((par): par is readonly [string, string] => !!par[1]),
  );
  // A própria vence; a do totem preenche quem não tem.
  const logosComTotem = { ...fotosTotem, ...logos };

  return (
    <ColaboradoresClient
      // Trocar de empresa REMONTA a tela: `router.refresh()` preserva o estado
      // do cliente, e sem isto o filtro de conta ficava com o id da outra empresa
      // (lista vazia com "Todas" nos seletores) e o cadastro nascia na empresa
      // errada. Trava em financeiro-telas.test.ts.
      key={empresa?.id ?? "geral"}
      folhaInicial={folhaMes.linhas}
      mercadinhoInicial={folhaMes.mercadinhoSugerido}
      folhaMensalPendente={folhaMes.pendente}
      pontoInicial={pontoMes}
      logos={logosComTotem}
      folhaDiaPadrao={folhaDiaPadrao}
      // As empresas liberadas: em "Visão geral" a tela não tem uma, e é o
      // FORMULÁRIO que pergunta em qual o cadastro nasce — esconder o botão de
      // criar, como era, fez parecer que o módulo inteiro tinha quebrado.
      empresas={empresas.map((e) => ({ id: e.id, nome: e.nome }))}
      empresaId={empresa?.id ?? ""}
      lista={fPessoas.dados}
      contas={fContas.dados.map((c) => ({ id: c.id, nome: c.nome }))}
      lancamentos={fLancamentos.dados}
      mesAberto={competencia}
      pessoasDoSistema={fSistema.dados}
      // Vazias de propósito: chegam por `/api/financeiro/folha/sugestoes`
      // depois do primeiro paint (ver o comentário no topo).
      comissoes={{}}
      // As DUAS chaves que `POST /api/financeiro/folha` exige. Botão que sempre
      // devolve 403 é pior que botão nenhum: quem clica lê "está quebrado", não
      // "falta permissão" — e vai reclamar do sistema, não pedir a liberação.
      podeGerarFolha={poderes.folha && poderes.compromissos}
      schemaPendente={pendente || fPessoas.pendente}
      // O SQL dos lançamentos pode estar atrasado sem o resto estar: aí o bloco
      // do mês some, em vez de mostrar lista vazia que parece "nada lançado".
      lancamentosPendentes={fLancamentos.pendente}
    />
  );
}
