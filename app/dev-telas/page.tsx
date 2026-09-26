// Banco de provas da LISTA DE TELAS (Configurações › Telas).
//
// Existe pelo mesmo motivo das outras /dev-*: a tela mora atrás de login, e a
// conta que a usa é a de produção — não dá para digitar credencial nem para
// conferir uma lista lendo diff. Ligar e desligar tela é justamente o tipo de
// coisa cujo defeito só aparece clicando.
//
// A lista aqui é a MESMA do módulo, com dado parecido com o real. O que der
// certo aqui é o componente de verdade, sem a sessão.
import { notFound } from "next/navigation";
import { TelasProvaClient } from "./TelasProvaClient";

export const dynamic = "force-dynamic";

export default function DevTelas() {
  // DUPLA TRAVA, igual às outras /dev-*: o middleware só a torna PÚBLICA fora
  // de produção — não a faz sumir. Sem este 404 qualquer pessoa logada abriria
  // a página em produção, e como /dev-* fica FORA de (plataforma) ela não tem
  // gate de sessão próprio.
  if (process.env.NODE_ENV === "production") notFound();
  return <TelasProvaClient />;
}
