import { redirect } from "next/navigation";
import { getProfile } from "@/lib/require-auth";
import { MeuPontoClient } from "./MeuPontoClient";

export const dynamic = "force-dynamic";

// Banco de horas: todo mundo logado vê o PRÓPRIO; admin vê de todos.
export default async function MeuPontoPage() {
  const me = await getProfile();
  if (!me) redirect("/login");
  return <MeuPontoClient isAdmin={me.role === "admin"} nome={me.name} />;
}
