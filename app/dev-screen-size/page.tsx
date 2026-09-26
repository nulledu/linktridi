// Banco de provas do `useScreenSize` (faixa de largura comparável).
import { notFound } from "next/navigation";
import { ProvaScreenSize } from "./ProvaScreenSize";

export const dynamic = "force-dynamic";

export default function DevScreenSize() {
  // DUPLA TRAVA, igual às outras páginas /dev-*: o middleware só a torna PÚBLICA
  // fora de produção; é este 404 que a faz sumir em produção.
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaScreenSize />;
}
