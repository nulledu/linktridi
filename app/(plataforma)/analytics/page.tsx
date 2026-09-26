import { requireModule } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { AnalyticsClient } from "./AnalyticsClient";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const me = await requireModule("analytics");
  // `username` junto: o bypass de superusuário casa por id OU username, e sem
  // ele um superusuário identificado só pelo username perdia as visões.
  const views = await resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username });
  // Quem tem Analytics vê os Setores; os com chave de setor (set:*) veem só os seus.
  // "Faturamento" (visão da EMPRESA inteira) só p/ quem vê todos os setores de
  // receita — não p/ vendedora/setor isolado (mantém a ideia setor-restrito).
  const canEmpresa = ["set:comercial", "set:marketing", "set:marketplace", "set:vendedoras"].every((k) => views.includes(k));
  // A aba de Tráfego pago usa a MESMA chave do módulo Tridify — e é a mesma que
  // `/api/analytics/trafego` exige. Gate de página e gate de rota fora de
  // sincronia é como quem tem cargo entra na tela e recebe erro em tudo.
  return <AnalyticsClient canVendas canEmpresa={canEmpresa} canTrafego={views.includes("trafego")} views={views} />;
}
