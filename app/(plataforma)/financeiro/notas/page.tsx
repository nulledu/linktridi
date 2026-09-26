import { contextoFinanceiro } from "../contexto";
import { compras, fornecedores, notas, partesReferenciadas } from "@/lib/financeiro/db";
import { hojeISO } from "@/lib/financeiro/calculos";
import { idsDeFornecedoresReferenciados } from "@/lib/financeiro/partes";
import { AvisoSchema, Cabecalho, Cartao, Vazio } from "../ui";
import { NotasClient } from "./NotasClient";

export const dynamic = "force-dynamic";

/**
 * Central fiscal (§8) — nota emitida e nota de compra no mesmo lugar.
 *
 * A nota aqui é DOCUMENTO, não fato financeiro (§21): nenhuma linha desta tela
 * cria despesa. Quem gera obrigação é a compra; a nota apenas se amarra nela.
 * É a confusão mais provável do módulo, e por isso está escrita na própria tela.
 *
 * Lê direto do banco no servidor, sem passar por rota de API: cada `fetch`
 * interno seria uma invocação a mais, e foi execução (não tamanho de resposta)
 * que pausou este projeto na Vercel. As compras vêm na mesma rodada porque o
 * vínculo é escolhido dentro do formulário — buscar a lista no clique seria uma
 * segunda ida ao servidor para responder o que já dava para trazer junto.
 */
export default async function FinanceiroNotasPage() {
  const { empresa, poderes, pendente, escopo, geral, empresas } = await contextoFinanceiro("ver")   // abrir a tela é LEITURA; criar/editar sai de `poderes.notas`
  // (a sub de escrita gateia o botão, não a porta — senão liberar "ver o
  // financeiro" deixava a pessoa de fora justamente das telas que o `ver`
  // promete mostrar);

  if (!empresa && !geral) {
    return (
      <>
        <Cabecalho titulo="Notas Fiscais" />
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

  const [fNotas, fCompras, fFornecedores] = await Promise.all([
    notas(escopo, { limite: 300 }),
    compras(escopo, { limite: 200 }),
    fornecedores(escopo, { limite: 200 }),
  ]);
  const idsFornecedores = idsDeFornecedoresReferenciados(
    fFornecedores.dados, fNotas.dados, fCompras.dados,
  );
  const fPartes = await partesReferenciadas(escopo, [], idsFornecedores);
  const contatoPorFornecedor = new Map(
    fPartes.dados.partes.flatMap((parte) =>
      parte.fornecedor ? [[parte.fornecedor.id, parte.id] as const] : []),
  );

  return (
    <NotasClient
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
      podeLancar={poderes.notas}
      // Criar a compra a partir da nota é ato de COMPRA, e a rota gateia por
      // `financeiro:compras`. Mandar `poderes.notas` aqui acenderia um botão
      // que só volta 403 — o bug clássico de portão desalinhado deste repo.
      podeComprar={poderes.compras}
      schemaPendente={pendente || fNotas.pendente || fPartes.pendente}
      // O dia vem daqui, como nas outras telas: "últimos 30 dias" contados no
      // navegador e no servidor davam recortes diferentes.
      hoje={hojeISO()}
      notas={fNotas.dados}
      // Só o que a tela usa da compra. Mandar a linha inteira levaria plano,
      // prazo e observação até o navegador para desenhar uma opção de select.
      compras={fCompras.dados.map((c) => ({
        id: c.id, descricao: c.descricao, data: c.data, valor_total: c.valor_total, status: c.status,
      }))}
      fornecedores={fFornecedores.dados.map((f) => ({
        id: f.id,
        nome: f.nome,
        contato_id: contatoPorFornecedor.get(f.id) ?? null,
      }))}
      contatosPorFornecedor={Object.fromEntries(contatoPorFornecedor)}
    />
  );
}
