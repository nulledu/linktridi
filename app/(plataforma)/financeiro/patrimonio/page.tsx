import { contextoFinanceiro } from "../contexto";
import { assinarLogos } from "@/lib/financeiro/anexos";
import { configDaEmpresa } from "@/lib/financeiro/config";
import {
  colaboradores, compras, fornecedores, patrimonio, partesReferenciadas, proximoCodigoPatrimonio,
} from "@/lib/financeiro/db";
import { hojeISO } from "@/lib/financeiro/calculos";
import { idsDeFornecedoresReferenciados } from "@/lib/financeiro/partes";
import { AvisoSchema, Cabecalho, Cartao, Vazio } from "../ui";
import { PatrimonioClient } from "./PatrimonioClient";

export const dynamic = "force-dynamic";

/**
 * Patrimônio — o registro GERENCIAL dos bens (§9).
 *
 * A tela responde "o que a empresa tem, onde está e com quem", não "quanto a
 * empresa gastou": o custo do bem já foi contado na compra que o originou (§21).
 *
 * Lê direto do banco no servidor, sem passar por rota de API — cada `fetch`
 * interno seria uma invocação a mais, e foi execução (não tamanho de resposta)
 * que pausou este projeto na Vercel. A rota só existe para a ESCRITA, disparada
 * por clique.
 */
export default async function FinanceiroPatrimonioPage() {
  const { empresa, poderes, pendente, escopo, geral, empresas } = await contextoFinanceiro("ver")   // abrir a tela é LEITURA; criar/editar sai de `poderes.patrimonio`
  // (a sub de escrita gateia o botão, não a porta — senão liberar "ver o
  // financeiro" deixava a pessoa de fora justamente das telas que o `ver`
  // promete mostrar);

  if (!empresa && !geral) {
    return (
      <>
        <Cabecalho titulo="Patrimônio" />
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

  const [fItens, fFornecedores, fCompras, fPessoas, codigoSugerido] = await Promise.all([
    patrimonio(escopo, { limite: 300 }),
    fornecedores(escopo, { limite: 200 }),
    compras(escopo, { limite: 120 }),
    colaboradores(escopo, { limite: 200 }),
    // Em "ver geral" não há empresa para numerar: o código sugerido só existe
    // quando se sabe em qual sequência o bem entraria.
    empresa
      ? configDaEmpresa(empresa.id).then((c) => proximoCodigoPatrimonio(empresa.id, c.patrimonio_prefixo))
      : Promise.resolve(""),
  ]);

  const idsFornecedores = idsDeFornecedoresReferenciados(
    fFornecedores.dados, fItens.dados, fCompras.dados,
  );
  // As duas dependem da primeira onda, mas não uma da outra — assinar as fotos
  // enquanto as partes viajam economiza uma ida inteira (250–700 ms daqui).
  const [assinados, fPartes] = await Promise.all([
    // Uma chamada só para as fotos dos bens — e só de quem tem foto.
    assinarLogos(fItens.dados.map((b) => b.logo_url)),
    partesReferenciadas(escopo, [], idsFornecedores),
  ]);
  const logosBens = Object.fromEntries(
    fItens.dados
      .map((b) => [b.id, b.logo_url ? assinados.get(b.logo_url) : null] as const)
      .filter((par): par is readonly [string, string] => !!par[1]),
  );
  const contatoPorFornecedor = new Map(
    fPartes.dados.partes.flatMap((parte) =>
      parte.fornecedor ? [[parte.fornecedor.id, parte.id] as const] : []),
  );

  return (
    <>
      {(pendente || fItens.pendente || fPartes.pendente) && <AvisoSchema />}
      <PatrimonioClient
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
        itens={fItens.dados}
        logos={logosBens}
        fornecedores={fFornecedores.dados.map((f) => ({
          id: f.id,
          nome: f.nome,
          contato_id: contatoPorFornecedor.get(f.id) ?? null,
        }))}
        contatosPorFornecedor={Object.fromEntries(contatoPorFornecedor)}
        compras={fCompras.dados
          .filter((c) => c.status !== "cancelada")
          .map((c) => ({
            id: c.id, descricao: c.descricao, data: c.data,
            valor_total: c.valor_total, fornecedor_id: c.fornecedor_id,
          }))}
        // Só `id` e `nome` atravessam: `colaboradores()` traz salário junto, e
        // salário não tem o que fazer numa tela de bens. Esconder no React não
        // resolveria — o dado já teria viajado até o navegador.
        responsaveis={fPessoas.dados
          .filter((c) => c.status !== "desligado")
          .map((c) => ({ id: c.id, nome: c.nome }))}
        codigoSugerido={codigoSugerido}
        // O dia vem daqui, não do relógio do navegador: "garantia vence em 30
        // dias" calculado na primeira renderização do cliente daria um valor
        // diferente do HTML que o servidor acabou de mandar.
        hoje={hojeISO()}
        podeCadastrar={poderes.patrimonio}
      />
    </>
  );
}
