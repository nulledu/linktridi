import { requireModule } from "@/lib/require-auth";
import { ContingenciaClient } from "./ContingenciaClient";

export const dynamic = "force-dynamic";

// A Contingência é ÁREA PRÓPRIA (`contingencia`), não mais uma sub do Marketing:
// mesma chave na página, na API e na barra lateral. Quem não a tem cai na tela
// de "sem permissão" dizendo QUAL área faltou.
export default async function ContingenciaPage() {
  await requireModule("contingencia");
  return <ContingenciaClient />;
}
