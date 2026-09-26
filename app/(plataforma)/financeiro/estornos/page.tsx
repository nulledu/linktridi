import { contextoFinanceiro } from "../contexto";
import { assinarLogos } from "@/lib/financeiro/anexos";
import { contas, estornos } from "@/lib/financeiro/db";
import { hojeISO } from "@/lib/financeiro/calculos";
import { AvisoSchema, Cabecalho, Cartao, Vazio } from "../ui";
import { EstornosClient } from "./EstornosClient";

export const dynamic = "force-dynamic";

/**
 * Estornos e chargebacks — o dinheiro que VOLTA (§ nova).
 *
 * A tela responde três perguntas, nesta ordem: quanto está em risco AGORA (em
 * disputa), quanto saiu de volta neste mês, e o que aconteceu com cada caso.
 * Registro e acompanhamento — a baixa contábil continua no extrato da conta.
 *
 * Lê direto do banco no servidor, como as irmãs: cada `fetch` interno seria
 * uma invocação a mais, e foi execução que pausou este projeto na Vercel.
 */
export default async function FinanceiroEstornosPage() {
  const { empresa, poderes, pendente, escopo, geral, empresas } = await contextoFinanceiro("ver");
  // Abrir é LEITURA; registrar/editar sai de `poderes.compromissos` — estorno
  // é dinheiro de pagamento, e a sub que cuida de pagamento cuida dele.

  if (!empresa && !geral) {
    return (
      <>
        <Cabecalho titulo="Estornos" />
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

  const [fCasos, fContas] = await Promise.all([
    estornos(escopo, { limite: 400 }),
    // Os gateways/bancos do cadastro — é por onde o estorno bate.
    contas(escopo),
  ]);

  // Uma chamada só para as marcas das contas que aparecem na lista.
  const assinados = await assinarLogos(fContas.dados.map((c) => c.logo_url));
  const logosContas = Object.fromEntries(
    fContas.dados
      .map((c) => [c.id, c.logo_url ? assinados.get(c.logo_url) : null] as const)
      .filter((par): par is readonly [string, string] => !!par[1]),
  );

  return (
    <>
      {pendente && <AvisoSchema />}
      <EstornosClient
        // Trocar de empresa REMONTA a tela — mesma regra das irmãs; trava em
        // financeiro-telas.test.ts.
        key={empresa?.id ?? "geral"}
        empresas={empresas.map((e) => ({ id: e.id, nome: e.nome }))}
        empresaId={empresa?.id ?? ""}
        empresaNome={empresa?.nome ?? "Visão geral"}
        casos={fCasos.dados}
        contas={fContas.dados.map((c) => ({ id: c.id, empresa_id: c.empresa_id, nome: c.nome, icone: c.icone ?? null }))}
        logosContas={logosContas}
        hoje={hojeISO()}
        podeEscrever={poderes.compromissos}
        // O SQL dos estornos pode estar atrasado sem o resto estar: a tela
        // avisa em vez de mostrar lista vazia que parece "nunca teve estorno".
        schemaPendente={fCasos.pendente}
      />
    </>
  );
}
