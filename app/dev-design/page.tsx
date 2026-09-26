// TEMPORÁRIO — banco de provas do painel de gestão do Design, no Shell real,
// sem login, com a rede falsa respondendo.
import { notFound } from "next/navigation";
import { Shell } from "../(plataforma)/Shell";
import { MODULES, navFor } from "@/lib/rbac";
import { Prova } from "./Prova";

export const dynamic = "force-dynamic";

export default function DevDesign() {
  // DUPLA TRAVA: o middleware só a torna pública fora de produção; é este
  // notFound que a faz sumir em produção.
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Shell nav={navFor("admin")} modules={MODULES} name="Teste" role="admin">
      <Prova />
    </Shell>
  );
}
