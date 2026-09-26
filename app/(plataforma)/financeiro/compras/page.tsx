import { redirect } from "next/navigation";
import { semPermissaoDoFinanceiro } from "@/lib/financeiro/gate";
import { contextoFinanceiro } from "../contexto";
import { compras, compromissosDaAgenda, contas, fornecedores, partesReferenciadas } from "@/lib/financeiro/db";
import { hojeISO, somarDias } from "@/lib/financeiro/calculos";
import { idsDeFornecedoresReferenciados } from "@/lib/financeiro/partes";
import { AvisoSchema, Cabecalho, Cartao, Vazio } from "../ui";
import { ComprasClient } from "./ComprasClient";

export const dynamic = "force-dynamic";

/**
 * Compras — o registro do FATO COMERCIAL (§7).
 *
 * Pagamento não mora aqui. Esta tela responde "o que foi comprado, de quem, por
 * quanto e quando"; confirmar a compra é o que faz nascerem os compromissos, e
 * a baixa acontece na tela deles. É o §21 posto de pé: a compra CRIA
 * compromisso, o compromisso nunca cria compra — e o cartão "Integração com
 * compromissos" existe justamente para essa direção ficar visível a olho nu,
 * em vez de ser um parágrafo de especificação que ninguém lê.
 *
 * Como o exemplar da Visão Geral, tudo é lido AQUI, no servidor, direto do
 * banco: rota de API é só para escrita disparada por clique. Cada `fetch`
 * interno seria uma invocação a mais, e foi execução — não tamanho de resposta
 * — que pausou este projeto na Vercel.
 */
export default async function FinanceiroComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ novo?: string }>;
}) {
  // Abrir a tela é LEITURA; criar/editar sai de `poderes.compras` — a sub de
  // escrita gateia o BOTÃO, não a porta. Senão liberar "ver o financeiro"
  // deixava a pessoa de fora justamente das telas que o `ver` promete mostrar.
  const { empresa, poderes, pendente, escopo, geral, empresas } = await contextoFinanceiro("ver");
  // Rede de segurança do gate, e ela REDIRECIONA em vez de 404.
  //
  // `contextoFinanceiro("ver")` já barra quem não tem a chave, então esta linha
  // não deveria ser alcançada. Ela já foi um 404, e um 404 numa
  // barreira de PERMISSÃO é o pior desfecho possível: a pessoa lê "não existe",
  // conclui que o sistema está quebrado, e não tem como saber que o que falta é
  // uma chave. A tela de sem-permissão diz o que aconteceu e qual chave pedir.
  if (!poderes.ver) redirect(semPermissaoDoFinanceiro("ver"));
  const { novo } = await searchParams;

  if (!empresa && !geral) {
    return (
      <>
        <Cabecalho titulo="Compras" />
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

  // Uma rodada só de consultas para a tela inteira. A janela das parcelas vai
  // muito além da das compras porque parcelamento longo vence anos depois do
  // fato: com o mesmo teto dos dois lados, a última parcela sumiria justamente
  // do cartão que existe para mostrá-la.
  const [fCompras, fParcelas, fFornecedores, fContas] = await Promise.all([
    compras(escopo, { de: somarDias(hoje, -365), limite: 300 }),
    // Parcela EM ABERTO desce de qualquer data: o cartão "Pendentes de
    // pagamento" é o que a empresa ainda deve de compras, e a parcela atrasada
    // de uma compra de dois anos atrás continua sendo dívida.
    compromissosDaAgenda(escopo, {
      origem: "compra", deFechados: somarDias(hoje, -365), ate: somarDias(hoje, 1095), limite: 400,
    }),
    fornecedores(escopo, { limite: 200 }),
    contas(escopo),
  ]);
  const idsFornecedores = idsDeFornecedoresReferenciados(
    fFornecedores.dados, fCompras.dados, fParcelas.dados,
  );
  const fPartes = await partesReferenciadas(escopo, [], idsFornecedores);
  const contatoPorFornecedor = new Map(
    fPartes.dados.partes.flatMap((parte) =>
      parte.fornecedor ? [[parte.fornecedor.id, parte.id] as const] : []),
  );

  return (
    <ComprasClient
      // Trocar de empresa REMONTA a tela: `router.refresh()` preserva o estado
      // do cliente, e sem isto o filtro de conta ficava com o id da outra empresa
      // (lista vazia com "Todas" nos seletores) e o cadastro nascia na empresa
      // errada. Trava em financeiro-telas.test.ts.
      key={empresa?.id ?? "geral"}
      // As empresas liberadas: em "Visão geral" a tela não tem uma, e é o
      // FORMULÁRIO que pergunta em qual o cadastro nasce — esconder o botão de
      // criar, como era, fez parecer que o módulo inteiro tinha quebrado.
      empresas={empresas.map((e) => ({ id: e.id, nome: e.nome }))}
      empresaId={empresa?.id ?? ""}
      empresaNome={empresa?.nome ?? "Visão geral"}
      podeCriar={poderes.compras}
      compras={fCompras.dados}
      parcelas={fParcelas.dados}
      fornecedores={fFornecedores.dados.map((f) => ({
        ...f,
        id: f.id,
        contato_id: contatoPorFornecedor.get(f.id) ?? null,
      }))}
      contatosPorFornecedor={Object.fromEntries(contatoPorFornecedor)}
      contas={fContas.dados}
      hoje={hoje}
      abrirNovo={novo === "1"}
      schemaPendente={pendente || fCompras.pendente || fParcelas.pendente || fPartes.pendente}
    />
  );
}
