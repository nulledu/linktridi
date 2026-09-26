import { requireModule } from "@/lib/require-auth";
import { AnalyticsClient } from "./AnalyticsClient";

export const dynamic = "force-dynamic";

export default async function TridiflowAnalyticsPage() {
  await requireModule("tridiflow:analytics");
  return <AnalyticsClient />;
}
