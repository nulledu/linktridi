// Banco de provas de Atividades — Visão geral, Tarefas e Calendário.
//
// A área mora atrás de login e a conta que a usa é a de produção: não dá pra
// digitar credencial nem conferir a tela lendo diff. Aqui ela aparece com dado
// parecido com o real (gerado no navegador), nos dois temas e a partir de
// 320px. O quadro (aba Tarefas) chama as rotas de verdade — sem sessão elas
// recusam, e o quadro fica com a lista que recebeu.
import { notFound } from "next/navigation";
import { ProvaAtividades } from "./ProvaAtividades";

export const dynamic = "force-dynamic";

export default function DevAtividades() {
  // DUPLA TRAVA, igual às outras /dev-*: o middleware só a torna PÚBLICA fora
  // de produção — não a faz sumir. Sem este 404 qualquer pessoa logada abriria
  // a página em produção, e como /dev-* fica FORA de (plataforma) ela não tem
  // gate de sessão próprio.
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaAtividades />;
}
