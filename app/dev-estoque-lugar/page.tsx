// TEMPORÁRIO — banco de provas do "guardar produto num lugar", pra medir a
// 320px sem passar por login.
import { notFound } from "next/navigation";
import { Prova } from "./Prova";

export const dynamic = "force-dynamic";

export default function DevEstoqueLugar() {
  // DUPLA TRAVA, igual às outras /dev-*: o middleware só torna a rota PÚBLICA
  // fora de produção — não a faz sumir. É este 404 que a remove em produção.
  if (process.env.NODE_ENV === "production") notFound();
  return <Prova />;
}
