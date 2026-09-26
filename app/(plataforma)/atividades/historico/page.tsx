import { redirect } from "next/navigation";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { podeAtividades } from "@/lib/atividades-acesso";
import { lerTempos, DIAS_PADRAO } from "@/lib/atividades-tempo-consulta";
import { HistoricoProducaoClient } from "./HistoricoProducaoClient";

export const dynamic = "force-dynamic";

/**
 * "A produção de verdade" — o que aconteceu de fato no galpão.
 *
 * Duas perguntas na mesma tela porque são a mesma pergunta:
 *   • quanto tempo leva pra fazer cada coisa (e o que envenena essa média);
 *   • de onde veio cada peça, e onde foi parar cada material.
 *
 * GATE: exatamente o mesmo predicado das rotas `/api/atividades/tempos` e
 * `/genealogia` — `papelOuChave`, não `requireRole`. A armadilha conhecida
 * (ver a nota de paridade em MEMORY) é a página gatear por PAPEL e a API por
 * CHAVE: quem recebeu a área na grade abre a tela e leva 403 no primeiro
 * clique, ou o contrário. Aqui os dois lados leem a mesma lista.
 */
const PAPEIS = ["admin", "estoquista"];
const CHAVES = ["atividades:ver", "estoque", "estoque:bipar"];

export default async function HistoricoProducaoPage() {
  const me = await getProfile();
  if (!me) redirect("/login");
  if (!(await papelOuChave(me, PAPEIS, ...CHAVES))) redirect("/sem-permissao?area=atividades%3Aver");

  // Gestão vê a produção toda; quem não é gestão vê o próprio tempo. É o mesmo
  // recorte do /api/atividades/historico — a tela não pode ser mais generosa
  // que a rota que a alimenta depois do primeiro clique.
  const soMinhas = !(await podeAtividades(me, "ver"));

  // O primeiro período vem PRONTO do servidor: a tela nasce com número, não com
  // "carregando". Trocar o período depois passa pela rota, que usa a mesma
  // função de leitura — não há como os dois números divergirem.
  const tempos = await lerTempos({ dias: DIAS_PADRAO, paraId: soMinhas ? me.id : null })
    .catch(() => null);

  return <HistoricoProducaoClient inicial={tempos} />;
}
