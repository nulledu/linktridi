import { requireModule } from "@/lib/require-auth";
import { listAtividadesAtivas, listPoolDoSetor, setoresDoColaborador } from "@/lib/atividades";
import { MinhasAtividadesClient } from "./MinhasAtividadesClient";

export const dynamic = "force-dynamic";

export default async function MinhasAtividadesPage() {
  const me = await requireModule("minhas-atividades");
  // Setor + departamento: quem é da Logística tem setor "Produção" no cadastro,
  // e só o departamento faz o pool "Logística" chegar até a pessoa.
  const chaves = await setoresDoColaborador(me.id);
  // Só ativas: concluídas de dias anteriores saem (ficam no histórico) + pool do setor.
  const [atividades, pool] = await Promise.all([
    listAtividadesAtivas({ para_id: me.id }),
    listPoolDoSetor(chaves),
  ]);
  return <MinhasAtividadesClient initial={atividades} pool={pool} />;
}
