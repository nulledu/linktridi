import { requireModuleKeys } from "@/lib/require-auth";
import { EstoqueTabs } from "./EstoqueTabs";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const { keys } = await requireModuleKeys("estoque");
  // Sub-permissões: cada aba/coluna só aparece pra quem tem a sub-ação liberada.
  const perms = {
    itens: keys.includes("estoque:itens"),
    precos: keys.includes("estoque:precos"),
    compras: keys.includes("estoque:compras"),
    // A ABA continua sendo de quem tem `estoque:fornecedores` — ela é leitura,
    // e ver de quem se compra é trabalho do galpão. Quem pode MEXER é outra
    // pergunta, respondida pela rota (`financeiro:cadastros`), porque a linha
    // agora nasce dentro do Financeiro.
    fornecedores: keys.includes("estoque:fornecedores"),
    locais: keys.includes("estoque:locais"),
    // Aba "Bipar" chega numa tarefa seguinte — a permissão já nasce pronta
    // pra não exigir outro round-trip de RBAC quando a aba existir.
    bipar: keys.includes("estoque:bipar"),
  };
  return <EstoqueTabs perms={perms} />;
}
