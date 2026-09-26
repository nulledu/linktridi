import type { ReactNode } from "react";
import { requireAlgumModulo } from "@/lib/require-auth";
import { TiCasca } from "./TiCasca";

/**
 * Casca da TI. Desde 22/09/2026 a TI absorveu Acessos & Infra na NAVEGAÇÃO
 * (um item só na barra), então a porta aceita QUALQUER uma das duas áreas —
 * quem só tem `infraestrutura` entra pra chegar em /ti/infraestrutura, sem
 * ganhar roadmap nenhum de carona: cada subárea continua atrás da própria
 * chave (as abas somem e as APIs devolvem 403 do mesmo jeito de sempre).
 * Permissões (o cadastro de contas + grade, ex-/rh/gestao) é papel de admin.
 */
export default async function TiLayout({ children }: { children: ReactNode }) {
  const { profile, keys } = await requireAlgumModulo("ti", "infraestrutura");
  return (
    <TiCasca temTi={keys.includes("ti")} temInfra={keys.includes("infraestrutura")} ehAdmin={profile.role === "admin"}>
      {children}
    </TiCasca>
  );
}
