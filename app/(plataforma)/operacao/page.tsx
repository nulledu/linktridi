import { requireModuleKeys } from "@/lib/require-auth";
import { podeConfigurarImpressao } from "@/app/api/estoque/impressao/_gate";
import { OperacaoClient } from "./OperacaoClient";

export const dynamic = "force-dynamic";

// /operacao — o app do galpão dentro do site.
//
// Gate no módulo `estoque`, e NÃO num módulo novo: a grade é default-deny, então
// uma chave própria nasceria sem ninguém tendo. Quem chega aqui já entrava no
// Estoque; o que muda é o formato da tela, não quem pode.
//
// As sub-permissões decidem quais cartões existem — o mesmo contrato do
// EstoqueTabs. O gate da impressão é o de app/api/estoque/impressao/_gate.ts,
// para página e rota decidirem pela MESMA regra (ver gate-por-area.test.ts).
export default async function OperacaoPage() {
  const { profile, keys } = await requireModuleKeys("estoque");
  return (
    <OperacaoClient
      perms={{
        itens: keys.includes("estoque:itens"),
        bipar: keys.includes("estoque:bipar"),
        ajustar: keys.includes("estoque:ajustar"),
        compras: keys.includes("estoque:compras"),
        configurarImpressao: await podeConfigurarImpressao(profile),
      }}
    />
  );
}
