// TEMPORÁRIO — banco de provas de "Produtividade & metas". A tela real fica
// atrás de login e credenciais não devem ser digitadas (CLAUDE.md), então ela é
// montada aqui com dados fixos para medir a 320px e conferir que existe UM
// filtro e UMA faixa de números.
import { notFound } from "next/navigation";
import { ProvaProdutividade } from "./ProvaProdutividade";

export const dynamic = "force-dynamic";

export default async function DevProdutividade() {
  // DUPLA TRAVA, igual às outras páginas /dev-*: o middleware só a torna PÚBLICA
  // fora de produção — não a faz sumir. Sem este 404, qualquer pessoa logada
  // abriria a página em produção, e como a rota está fora de (plataforma) ela
  // não tem gate de sessão próprio.
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaProdutividade />;
}
