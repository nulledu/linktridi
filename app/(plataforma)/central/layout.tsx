import { requireModule } from "@/lib/require-auth";
import { CentralTabs } from "./CentralTabs";

export const dynamic = "force-dynamic";

export default async function CentralLayout({ children }: { children: React.ReactNode }) {
  await requireModule("central");
  return (
    // Largura cheia da coluna do `main` (que já traz o respiro de 36px do
    // Shell). O antigo `maxWidth: 1280 + margin: 0 auto` centralizava tudo: em
    // 1920px sobrava um vão de ~320px de cada lado, com a barra lateral isolada
    // à esquerda e o conteúdo boiando no meio da tela.
    <div style={{ padding: "8px 0 40px" }}>
      <div style={{ marginBottom: 24 }}>
        <CentralTabs />
      </div>
      {children}
    </div>
  );
}
