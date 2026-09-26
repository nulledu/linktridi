import { redirect } from "next/navigation";
import { getProfile } from "@/lib/require-auth";
import { MeuPontoClient } from "../../meu-ponto/MeuPontoClient";

export const dynamic = "force-dynamic";

// Banco de horas dentro da Central: sempre o PRÓPRIO (soMeu), pra qualquer pessoa.
export default async function CentralBancoHorasPage() {
  const me = await getProfile();
  if (!me) redirect("/login");
  return <MeuPontoClient isAdmin={me.role === "admin"} nome={me.name} soMeu />;
}
