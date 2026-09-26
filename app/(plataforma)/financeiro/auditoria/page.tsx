import { redirect } from "next/navigation";
import { semPermissaoDoFinanceiro } from "@/lib/financeiro/gate";
import { contextoFinanceiro } from "../contexto";
import { auditoria } from "@/lib/financeiro/db";
import { hojeISO, somarDias } from "@/lib/financeiro/calculos";
import { AvisoSchema, Cabecalho, Cartao, Vazio } from "../ui";
import { AuditoriaClient } from "./AuditoriaClient";

export const dynamic = "force-dynamic";

/**
 * O rastro de quem mexeu em dinheiro (§18).
 *
 * Abre com `ver`: é o histórico das mesmas coisas que a pessoa já enxerga nas
 * outras telas. O que NÃO acompanha é o detalhe da folha — o `dados` de uma
 * alteração de colaborador carrega salário, e ele só viaja até o navegador de
 * quem tem `financeiro:folha`. Filtrar isso no React não serviria: o dado já
 * teria saído do servidor.
 */
export default async function FinanceiroAuditoriaPage() {
  const { empresa, poderes, pendente, escopo, geral } = await contextoFinanceiro("ver");
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
        <Cabecalho titulo="Auditoria" />
        {pendente ? <AvisoSchema /> : (
          <Cartao>
            <Vazio icone="history" titulo="Nenhuma empresa liberada para você" />
          </Cartao>
        )}
      </>
    );
  }

  // 90 dias: o suficiente para "quem mudou este valor?" sem arrastar o
  // histórico inteiro numa tela que ninguém abre todo dia.
  const { dados, pendente: semTabela } = await auditoria(escopo, {
    de: `${somarDias(hojeISO(), -90)}T00:00:00Z`,
    limite: 300,
  });

  const linhas = dados.map((l) => ({
    ...l,
    // A poda acontece AQUI, no servidor.
    dados: l.entidade === "colaborador" && !poderes.folha ? null : l.dados,
  }));

  return (
    <AuditoriaClient
      // Trocar de empresa REMONTA a tela: `router.refresh()` preserva o estado
      // do cliente, e sem isto o filtro de conta ficava com o id da outra empresa
      // (lista vazia com "Todas" nos seletores) e o cadastro nascia na empresa
      // errada. Trava em financeiro-telas.test.ts.
      key={empresa?.id ?? "geral"}
      empresaNome={empresa?.nome ?? "Visão geral"}
      linhas={linhas}
      podeVerFolha={poderes.folha}
      schemaPendente={pendente || semTabela}
    />
  );
}
