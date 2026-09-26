import { Suspense } from "react";
import { requireModule } from "@/lib/require-auth";
import { Chat } from "../central/mensagens/ui/Chat";

export const dynamic = "force-dynamic";

// Mensagens ganhou rota própria, fora da Central. Motivo: é a tela que mais se
// abre no dia, e dentro de `/central` ela herdava a fileira de abas mais o
// `maxWidth: 1280` do layout — sobrava metade da tela para a conversa.
//
// O gate continua sendo o mesmo módulo `central`, então ninguém ganha nem perde
// acesso com a mudança. `/central/mensagens` redireciona para cá.
export default async function Page() {
  const me = await requireModule("central");
  return (
    // O Chat lê `?c=` para abrir a conversa certa; `useSearchParams` exige Suspense.
    <Suspense fallback={null}>
      <Chat meuId={me.id} meuNome={me.name || me.username} cheia />
    </Suspense>
  );
}
