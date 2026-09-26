// TEMPORÁRIO — banco de provas da logística. A página real fica atrás de login
// e credenciais não devem ser digitadas (CLAUDE.md), então os blocos novos
// (checklist do pedido, card, busca de caixa, ritmo) são montados aqui com dados
// fixos para medir a 320px.
import { notFound } from "next/navigation";
import { ProvaLogistica } from "./ProvaLogistica";

export const dynamic = "force-dynamic";

export default async function DevLogistica() {
  // DUPLA TRAVA, igual às outras páginas /dev-*: o middleware só a torna PÚBLICA
  // fora de produção — não a faz sumir. Sem este 404, qualquer pessoa logada
  // abriria a página em produção, e como a rota está fora de (plataforma) ela
  // não tem gate de sessão próprio.
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaLogistica />;
}
