import { getProfile } from "@/lib/require-auth";
import { redirect } from "next/navigation";
import { SuporteClient } from "./SuporteClient";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await getProfile();
  if (!me) redirect("/login");
  const { q } = await searchParams;
  return <SuporteClient perguntaInicial={q ?? ""} />;
}
