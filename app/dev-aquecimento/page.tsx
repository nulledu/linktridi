import { notFound } from "next/navigation";
import { DevAquecimentoClient } from "./DevAquecimentoClient";

export const dynamic = "force-dynamic";

// Preview de DESENVOLVIMENTO do Aquecimento — renderiza os componentes REAIS com
// dados de exemplo, sem login e sem banco. Existe pra conferir o layout a 320px
// (a regra do celular vale no mesmo commit) sem digitar credencial.
//
// DUAS travas, e a segunda é a que importa: o prefixo em DEV_ONLY_PREFIXES só
// torna a rota pública fora de produção; é este `notFound` que a faz SUMIR em
// produção. Sem ele, qualquer pessoa logada abriria a página no app publicado —
// e como /dev-* fica fora de (plataforma), não há gate de sessão próprio.
export default function DevAquecimentoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevAquecimentoClient />;
}
