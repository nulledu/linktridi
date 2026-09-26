import { redirect } from "next/navigation";
import { semPermissaoDoFinanceiro } from "@/lib/financeiro/gate";
import { contextoFinanceiro } from "../contexto";
import { compromissosDaAgenda, contas, fornecedores, partes, partesReferenciadas, recorrencias, valoresDeRecorrencias } from "@/lib/financeiro/db";
import { hojeISO, somarDias } from "@/lib/financeiro/calculos";
import { previsoesDaAgenda } from "@/lib/financeiro/previsoes";
import { assinarLogos } from "@/lib/financeiro/anexos";
import { idsDeRelacionados } from "@/lib/financeiro/marca-relacionada";
import type { FornecedorRelacionado, RelacionadoFinanceiro } from "@/lib/financeiro/marca-relacionada";
import { mesclarPartesRelacionadas, mesclarPorId } from "@/lib/financeiro/partes";
import { AvisoSchema, Cabecalho, Cartao, Vazio } from "../ui";
import { CompromissosClient } from "./CompromissosClient";

export const dynamic = "force-dynamic";

// O que desce para a tela. O filtro de período é do CLIENTE, sobre esta lista,
// então tudo que ele pode escolher precisa já estar aqui. Por isso o que está
// EM ABERTO desce sempre, de qualquer data — a janela de 180 dias que existia
// aqui fazia a conta atrasada há sete meses sumir de "Já vencidos" e do cartão
// "Atrasados", e a pessoa concluía que tinha sido paga. O corte só vale para o
// que já foi pago ou cancelado, que é histórico (ver `compromissosDaAgenda`).
const DIAS_ATRAS_FECHADOS = 180;
const DIAS_ADIANTE = 365;
const TETO = 400;

/**
 * Compromissos — a agenda central de obrigações (§6).
 *
 * Lê direto do banco no servidor, sem passar por rota de API: cada `fetch`
 * interno seria uma invocação a mais, e foi execução (não tamanho de resposta)
 * que pausou este projeto na Vercel. Rota de API aqui é só para ESCRITA, e
 * quem dispara é um clique.
 *
 * O gate é `ver`, não `compromissos`: quem só enxerga o financeiro precisa
 * enxergar o que a empresa deve. Lançar, editar e cancelar é que dependem de
 * `financeiro:compromissos`, e quem decide isso é a tela, botão a botão.
 */
export default async function CompromissosPage() {
  const { empresa, poderes, pendente, escopo, geral, empresas } = await contextoFinanceiro("ver");
  // Rede de segurança do gate, e ela REDIRECIONA em vez de 404.
  //
  // `contextoFinanceiro("ver")` já barra quem não tem a chave, então esta linha
  // não deveria ser alcançada. Ela já foi um 404, e um 404 numa
  // barreira de PERMISSÃO é o pior desfecho possível: a pessoa lê "não existe",
  // conclui que o sistema está quebrado, e não tem como saber que o que falta é
  // uma chave. A tela de sem-permissão diz o que aconteceu e qual chave pedir.
  if (!poderes.ver) redirect(semPermissaoDoFinanceiro("ver"));

  if (!empresa && !geral) {
    return (
      <>
        <Cabecalho titulo="Compromissos" />
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
  const de = somarDias(hoje, -DIAS_ATRAS_FECHADOS);
  const ate = somarDias(hoje, DIAS_ADIANTE);

  const [fCompromissos, fContas, fFornecedores, fPartes, fRecorrencias] = await Promise.all([
    compromissosDaAgenda(escopo, { deFechados: de, ate, limite: TETO }),
    contas(escopo),
    fornecedores(escopo, { limite: 500 }),
    // Mesmo quem só lê compromissos precisa reconhecer para quem a obrigação
    // vai. O objeto completo fica no servidor; abaixo só atravessam nome, tipo,
    // vínculo e marca — nunca PIX, banco, agência, conta ou condições comerciais.
    partes(escopo, { limite: 500 }),
    recorrencias(escopo, { limite: 300 }),
  ]);
  // SEGUNDA onda, com as duas coisas juntas. Uma previsão nasce de uma regra e
  // herda dela o contato/fornecedor, então o conjunto de ids referenciados já
  // está inteiro em `fCompromissos + fRecorrencias` — o que faltava para
  // montar a previsão era o VALOR, não o vínculo. Por isso as partes não
  // precisam esperar os valores chegarem: era uma ida de 250–700 ms enfileirada
  // à toa.
  const idsReferenciados = idsDeRelacionados(fCompromissos.dados, fRecorrencias.dados);
  const [valoresCombinados, fReferenciados] = await Promise.all([
    // Os números já informados para meses de regras variáveis: sem eles, o mês
    // que alguém combinou continuaria marcado como palpite.
    valoresDeRecorrencias(fRecorrencias.dados.map((r) => r.id)),
    partesReferenciadas(escopo, idsReferenciados.contatoIds, idsReferenciados.fornecedorIds),
  ]);
  const previsoes = previsoesDaAgenda(
    fRecorrencias.dados, fCompromissos.dados, ate, hoje, valoresCombinados);
  const partesParaResolver = mesclarPartesRelacionadas(fPartes.dados, fReferenciados.dados.partes);
  const fornecedoresParaResolver = mesclarPorId(fFornecedores.dados, fReferenciados.dados.fornecedores);
  const relacionados: RelacionadoFinanceiro[] = partesParaResolver.map((parte) => ({
    id: parte.id,
    empresa_id: parte.empresa_id,
    nome: parte.nome,
    natureza: parte.natureza,
    fornecedor: parte.fornecedor ? { id: parte.fornecedor.id } : null,
    logo_url: parte.logo_url ?? null,
    icone: parte.icone ?? null,
  }));
  const fornecedoresSeguros: FornecedorRelacionado[] = fornecedoresParaResolver.map((fornecedor) => ({
    id: fornecedor.id,
    empresa_id: fornecedor.empresa_id,
    nome: fornecedor.nome,
    logo_url: fornecedor.logo_url ?? null,
    icone: fornecedor.icone ?? null,
  }));
  // Uma única ida ao bucket para todos os tipos. O mapa usa o caminho privado
  // como chave e contém somente URLs temporárias já assinadas.
  const caminhosUnicos = [...new Set([
    ...relacionados.map((item) => item.logo_url),
    ...fornecedoresSeguros.map((item) => item.logo_url),
    ...fContas.dados.map((item) => item.logo_url),
    ...empresas.map((item) => item.logo_url),
  ].filter((caminho): caminho is string => !!caminho))];
  const assinados = await assinarLogos(caminhosUnicos);

  return (
    <CompromissosClient
      // Trocar de empresa REMONTA a tela: `router.refresh()` preserva o estado
      // do cliente, e sem isto o filtro de conta ficava com o id da outra empresa
      // (lista vazia com "Todas" nos seletores) e o cadastro nascia na empresa
      // errada. Trava em financeiro-telas.test.ts.
      key={empresa?.id ?? "geral"}
      // As empresas liberadas: em "Visão geral" a tela não tem uma, e é o
      // FORMULÁRIO que pergunta em qual o cadastro nasce — esconder o botão de
      // criar, como era, fez parecer que o módulo inteiro tinha quebrado.
      empresas={empresas.map((e) => ({
        id: e.id, nome: e.nome, logo_url: e.logo_url ?? null, icone: e.icone ?? null,
      }))}
      empresaId={empresa?.id ?? ""}
      empresaNome={empresa?.nome ?? "Visão geral"}
      hoje={hoje}
      de={de}
      ate={ate}
      linhas={fCompromissos.dados}
      previsoes={previsoes}
      cortado={fCompromissos.cortado}
      contas={fContas.dados}
      fornecedores={fornecedoresSeguros}
      relacionados={relacionados}
      relacionadosSelecionaveis={{
        contatoIds: fPartes.dados.map((parte) => parte.id),
        fornecedorIds: [...new Set([
          ...fFornecedores.dados.map((fornecedor) => fornecedor.id),
          ...fPartes.dados.flatMap((parte) => parte.fornecedor ? [parte.fornecedor.id] : []),
        ])],
      }}
      logosRelacionados={Object.fromEntries(assinados)}
      poderes={poderes}
      schemaPendente={pendente || fCompromissos.pendente || fContas.pendente || fPartes.pendente || fRecorrencias.pendente || fReferenciados.pendente}
    />
  );
}
