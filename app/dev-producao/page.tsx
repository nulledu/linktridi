// TEMPORÁRIO — banco de provas da Produção: as cinco telas (Visão geral e as
// quatro subáreas) no Shell real, sem login, com a rede falsa devolvendo os
// dados de prova. `?t=geral|status|controle|maquinas|programacoes`.
import { notFound } from "next/navigation";
import { Shell } from "../(plataforma)/Shell";
import { MODULES, navFor } from "@/lib/rbac";
import { Prova } from "./Prova";

export const dynamic = "force-dynamic";

export default async function DevProducao({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  // DUPLA TRAVA, igual às outras /dev-*: o middleware só a torna pública fora
  // de produção; é este 404 que a faz sumir em produção.
  if (process.env.NODE_ENV === "production") notFound();
  const { t } = await searchParams;
  return (
    <Shell nav={navFor("admin")} modules={MODULES} name="Teste" role="admin">
      <Prova tela={t ?? "geral"} />
    </Shell>
  );
}
