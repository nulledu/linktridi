// Banco de provas das micro-transições e da arte mono-rounded.
//
// Existe porque o resto do sistema está atrás de login e não dá pra conferir
// movimento lendo diff: uma curva errada, um alvo de toque de 30px ou uma folha
// que nasce recortada só aparecem na tela. Aqui cada peça do vocabulário
// aparece uma vez, com dado parecido com o de verdade, nos dois temas e a
// partir de 320px.
import { notFound } from "next/navigation";
import { MicroClient } from "./MicroClient";
import { ProvaCatalogo } from "./ProvaCatalogo";

export const dynamic = "force-dynamic";

export default function DevMicro() {
  // DUPLA TRAVA, igual às outras páginas /dev-*: o middleware só a torna PÚBLICA
  // fora de produção — não a faz sumir. Sem este 404, qualquer pessoa logada
  // abriria a página em produção; e como as rotas /dev-* ficam FORA de
  // (plataforma), elas não têm gate de sessão próprio, então no fail-open do
  // middleware (env do Supabase ausente) sairia até anônima.
  if (process.env.NODE_ENV === "production") notFound();
  return <><ProvaCatalogo /><MicroClient /></>;
}
