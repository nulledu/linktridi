// TEMPORÁRIO — banco de provas da Impressão de etiquetas, pra medir 320px sem
// passar por login.
//
// Existe porque a regra do celular não é verificável lendo código: o ajuste
// agora é [−] [campo] [+] numa fileira só, e a etiqueta da prévia tem largura
// em MILÍMETROS — nenhum dos dois cabe por dedução, os dois se medem.
import { notFound } from "next/navigation";
import { Prova } from "./Prova";

export const dynamic = "force-dynamic";

export default function DevImpressao() {
  // DUPLA TRAVA, igual às outras /dev-*: o middleware só torna a rota PÚBLICA
  // fora de produção — não a faz sumir. É este 404 que a remove em produção.
  if (process.env.NODE_ENV === "production") notFound();
  return <Prova />;
}
