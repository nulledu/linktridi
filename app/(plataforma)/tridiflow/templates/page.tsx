import { requireModule } from "@/lib/require-auth";
import { TemplatesClient } from "./TemplatesClient";

export const dynamic = "force-dynamic";

export default async function TridiflowTemplatesPage() {
  await requireModule("tridiflow:templates");
  return <TemplatesClient />;
}
