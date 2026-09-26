import { contextoFinanceiro } from "../../contexto";
import { assinarLogos } from "@/lib/financeiro/anexos";
import { contas, fornecedores, partes, recorrencias, colaboradores } from "@/lib/financeiro/db";
import type { RelacionadoFinanceiro } from "@/lib/financeiro/marca-relacionada";
import { AvisoSchema, Cabecalho, Cartao, Vazio } from "../../ui";
import { RecorrenciasClient } from "./RecorrenciasClient";

export const dynamic = "force-dynamic";

/**
 * Recorrências — as REGRAS, não as contas (§10).
 *
 * O que se cadastra aqui é o contrato ("aluguel, todo dia 10, R$ 4.200"). Quem
 * vence, atrasa e é pago é o compromisso que o gerador cria a partir da regra —
 * por isso esta tela não tem status "pago" em lugar nenhum.
 *
 * Lê direto do banco no servidor, sem passar por rota de API: cada `fetch`
 * interno seria uma invocação a mais, e foi execução (não tamanho de resposta)
 * que pausou este projeto na Vercel.
 */
export default async function RecorrenciasPage() {
  const { empresa, poderes, pendente, escopo, geral, empresas } = await contextoFinanceiro("cadastros");

  if (!empresa && !geral) {
    return (
      <>
        <Cabecalho titulo="Recorrências" />
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

  const [fRegras, fContas, fFornecedores, fPartes, fPessoas] = await Promise.all([
    recorrencias(escopo, { limite: 300 }),
    contas(escopo),
    fornecedores(escopo, { limite: 300 }),
    partes(escopo, { limite: 500 }),
    colaboradores(escopo, { limite: 300 }),
  ]);

  // A identidade canônica cruza a fronteira sem os dados comerciais da
  // extensão. O `fornecedor.id` continua separado porque é ele que alimenta a
  // FK legada quando o papel Fornecedor é escolhido.
  const relacionados: RelacionadoFinanceiro[] = fPartes.dados.map((parte) => ({
    id: parte.id,
    empresa_id: parte.empresa_id,
    nome: parte.nome,
    natureza: parte.natureza,
    fornecedor: parte.fornecedor ? { id: parte.fornecedor.id } : null,
    // A CARA do relacionado. Sem estes dois, `marcaRelacionada` resolvia o
    // contato certo e devolvia ícone: a foto morria aqui na fronteira — era o
    // "não puxa foto de contato/empresa" das recorrências.
    logo_url: parte.logo_url ?? null,
    icone: parte.icone ?? null,
    // O que a regra pode herdar do cadastro. A categoria sai da identidade
    // (é dela que a pessoa cuida); a forma de pagamento e o prazo saem da
    // extensão comercial, que é onde eles existem.
    sugestao: {
      categoria: parte.categorias?.[0] ?? parte.categoria ?? null,
      forma_pagamento: parte.fornecedor?.forma_pagamento ?? null,
      prazo_dias: parte.fornecedor?.prazo_dias ?? null,
    },
  }));

  // Uma chamada só para todas as fotos: um link assinado por linha faria a
  // tela abrir dezenas de conexões só para desenhar ícone.
  // Uma chamada só para TUDO que tem foto nesta tela: as regras e os
  // relacionados que aparecem no seletor. Assinar em duas rodadas seria duas
  // idas ao storage para desenhar a mesma folha.
  const assinados = await assinarLogos([
    ...fRegras.dados.map((x) => x.logo_url),
    ...relacionados.map((x) => x.logo_url),
  ]);
  // Indexado pelo CAMINHO, como em Compromissos — é a chave que
  // `marcaRelacionada` devolve, e duas convenções para o mesmo mapa é como um
  // dos dois lados passa a mostrar ícone no lugar da foto.
  const logosRelacionados = Object.fromEntries(assinados);
  const logos = Object.fromEntries(
    fRegras.dados
      .map((x) => [x.id, x.logo_url ? assinados.get(x.logo_url) : null] as const)
      .filter((par): par is readonly [string, string] => !!par[1]),
  );

  return (
    <RecorrenciasClient
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
      logos={logos}
      logosRelacionados={logosRelacionados}
      empresaId={empresa?.id ?? ""}
      empresaNome={empresa?.nome ?? "Visão geral"}
      podeEscrever={poderes.cadastros}
      podeLancarPrimeira={poderes.compromissos}
      regras={fRegras.dados}
      contas={fContas.dados.map((c) => ({ id: c.id, nome: c.nome }))}
      fornecedores={fFornecedores.dados.map((f) => ({ id: f.id, empresa_id: f.empresa_id, nome: f.nome }))}
      relacionados={relacionados}
      // Só `id` e `nome`: mandar o colaborador inteiro levaria salário ao
      // navegador de quem só precisa saber quem cuida da regra.
      pessoas={fPessoas.dados.map((c) => ({ id: c.id, nome: c.nome }))}
      schemaPendente={pendente || fRegras.pendente || fPartes.pendente}
    />
  );
}
