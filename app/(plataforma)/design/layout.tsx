import type { ReactNode } from "react";
import { requireModule } from "@/lib/require-auth";
import { DesignCasca } from "./DesignCasca";

/** Casca do Design: cabeçalho único + navegação interna nas cinco rotas. */
export default async function DesignLayout({ children }: { children: ReactNode }) {
  await requireModule("design");
  return <DesignCasca>{children}</DesignCasca>;
}
