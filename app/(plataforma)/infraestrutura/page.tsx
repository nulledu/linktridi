import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Acessos & Infra virou subárea da TI em 22/09/2026 (um item só na barra).
// O endereço velho segue respondendo — mora em favorito, em link e na memória
// de quem usa. Os componentes (InfraHub, Domínios, Hospedagens, VPS, Cofre)
// continuam NESTA pasta; só a rota mudou de casa.
export default function InfraRedirect() {
  redirect("/ti/infraestrutura");
}
