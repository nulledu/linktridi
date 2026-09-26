// Banco de provas do Marketing · Stories.
//
// A tela real vive em /marketing?aba=stories, atrás de login e da área de
// Marketing — não dá pra digitar credencial nem conferir um quadro inteiro
// lendo diff. Aqui roda o MESMO `StoriesClient`, com dados em memória (dois
// meses de stories, um repetido, um planejado, um vídeo sem arquivo), nos dois
// temas e a partir de 320px. Nada vai pro banco nem pro B2.
//
// O `npm run rolagem` descobre as rotas /dev-* sozinho: esta entra na medição
// sem ninguém precisar cadastrá-la.
import { notFound } from "next/navigation";
import { ProvaStories } from "./ProvaStories";

export const dynamic = "force-dynamic";

export default function DevStories() {
  // DUPLA TRAVA, igual às outras /dev-*: o middleware só a torna PÚBLICA fora
  // de produção — não a faz sumir. Sem este 404 qualquer pessoa logada abriria
  // a página em produção, e como /dev-* fica FORA de (plataforma) ela não tem
  // gate de sessão próprio.
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaStories />;
}
