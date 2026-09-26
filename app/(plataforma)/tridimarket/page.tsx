import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

// O gate de acesso está no layout do workspace (requireModule "administracao"),
// então vale para esta e para todas as telas filhas.
export default function TridiMarketPage() {
  return <DashboardClient />;
}
