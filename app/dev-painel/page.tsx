// TEMPORÁRIO — banco de provas do editor de painel. Monta o editor REAL sem
// login, com dados de exemplo, para conferir arrasto, redimensionamento e a
// pré-visualização em 16:9.
import { notFound } from "next/navigation";
import { ProvaEditor } from "./ProvaEditor";

export const dynamic = "force-dynamic";

export default function DevPainel() {
  // DUPLA TRAVA, igual às outras páginas /dev-*: o middleware só a torna PÚBLICA
  // fora de produção — quem faz a página SUMIR em produção é esta linha.
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaEditor />;
}
