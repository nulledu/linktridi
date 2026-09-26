import { requireRh } from "@/lib/rh/gate";
import { PontoDaEquipe } from "./PontoDaEquipe";

export const dynamic = "force-dynamic";

/**
 * Ponto & banco de horas da equipe.
 *
 * `podeGerir` é o PAPEL admin, e não a chave de RH. Bater ponto por outra
 * pessoa e mexer em cadastro do relógio alteram registro de jornada — as rotas
 * de escrita do ponto exigem `getAdminProfile()`, e oferecer aqui um botão que
 * o servidor recusa é pior que não oferecer.
 */
export default async function PontoDoRhPage() {
  const { profile } = await requireRh("ponto");
  return <PontoDaEquipe podeGerir={profile.role === "admin"} />;
}
