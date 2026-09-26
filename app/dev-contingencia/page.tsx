import { notFound } from "next/navigation";
import { DevContingenciaClient } from "./DevContingenciaClient";

export const dynamic = "force-dynamic";

// Preview de DESENVOLVIMENTO do Gerenciador de Contingência — componentes REAIS
// com dados de exemplo, sem login e sem banco. Existe pra conferir o layout a
// 320px (a regra do celular vale no mesmo commit) sem digitar credencial.
//
// DUAS travas, e a segunda é a que importa: o prefixo em DEV_ONLY_PREFIXES só
// torna a rota pública fora de produção; é este `notFound` que a faz SUMIR em
// produção.
export default function DevContingenciaPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevContingenciaClient />;
}
