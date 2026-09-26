// Banco de provas de Acessos & Infra.
//
// A página real (/infraestrutura) fica atrás de login e a conta é a de
// produção — não dá pra digitar credencial pra conferir layout. Aqui o hub
// inteiro monta com dado de mentira (o fetch das rotas do módulo é
// interceptado no cliente), então dá pra medir as três tabelas, os pop-ups e
// os KPIs a 320px, nos dois temas — e o `npm run rolagem` passa a cobrir a
// tela sozinho.
import { notFound } from "next/navigation";
import { InfraProvaClient } from "./InfraProvaClient";

export const dynamic = "force-dynamic";

export default function DevInfra() {
  // DUPLA TRAVA, igual às outras /dev-*: o middleware só a torna PÚBLICA fora
  // de produção — não a faz sumir. Sem este 404 qualquer pessoa logada abriria
  // a página em produção, e como /dev-* fica FORA de (plataforma) ela não tem
  // gate de sessão próprio.
  if (process.env.NODE_ENV === "production") notFound();
  return <InfraProvaClient />;
}
