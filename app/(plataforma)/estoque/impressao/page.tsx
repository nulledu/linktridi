import { requireModuleKeys } from "@/lib/require-auth";
import { podeConfigurarImpressao } from "@/app/api/estoque/impressao/_gate";
import { ImpressaoClient } from "./ImpressaoClient";

export const dynamic = "force-dynamic";

// /estoque/impressao — como a etiqueta sai, no navegador e nos tablets.
//
// Rota própria e não uma aba: isto é ajuste, não trabalho do dia. Quem chega
// aqui vem do link "Configurar impressão" que fica ao lado do botão Imprimir —
// que é o instante em que alguém descobre que a tira está saindo do tamanho
// errado, e o pior lugar pra descobrir que a solução está três telas adiante.
export default async function ImpressaoPage() {
  const { profile, keys } = await requireModuleKeys("estoque");
  // O MESMO gate da API (app/api/estoque/impressao/_gate.ts). Página e rota
  // separadas pela mesma decisão é o que evita o clássico "a tela abre e todo
  // botão volta 403" — ver lib/__tests__/gate-por-area.test.ts.
  const podeConfigurar = await podeConfigurarImpressao(profile);
  return <ImpressaoClient podeConfigurar={podeConfigurar} podeVerItens={keys.includes("estoque:itens")} />;
}
