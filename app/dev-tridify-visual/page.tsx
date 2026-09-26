import { notFound } from "next/navigation";
import { ProvaVisual } from "./ProvaVisual";

export const dynamic = "force-dynamic";

// Banco de provas das DIREÇÕES VISUAIS do painel da Tridify: o mesmo painel
// real, com os mesmos 63 widgets e os mesmos dados de exemplo, trocando só o
// escopo de tokens. Serve pra escolher vendo, não lendo.
//
// 404 em produção — e é ESTA linha que faz a página sumir. O prefixo no
// `middleware.ts` só a torna pública fora de produção; sem o notFound aqui,
// qualquer pessoa logada abriria a página no app publicado.
export default function DevTridifyVisualPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaVisual />;
}
