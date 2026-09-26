// Banco de provas do Financeiro.
//
// Existe porque o módulo inteiro está atrás de login, e a conta que o usa é a
// de produção — não dá para digitar credencial nem para conferir um formulário
// lendo diff. Três defeitos relatados como "não funciona" (a foto que não sobe,
// o registro que não some, o campo que sobrou no formulário) só aparecem
// clicando; foi por isso que ficaram tanto tempo sem diagnóstico.
//
// Aqui as peças de escrita do módulo aparecem com dado parecido com o real,
// nos dois temas e a partir de 320px. As chamadas de rede vão para as MESMAS
// rotas: o que responde é o servidor de desenvolvimento, então o que der certo
// aqui é o caminho de verdade, sem a sessão.
import { notFound } from "next/navigation";
import { FinanceiroProvaClient } from "./FinanceiroProvaClient";

export const dynamic = "force-dynamic";

export default function DevFinanceiro() {
  // DUPLA TRAVA, igual às outras /dev-*: o middleware só a torna PÚBLICA fora
  // de produção — não a faz sumir. Sem este 404 qualquer pessoa logada abriria
  // a página em produção, e como /dev-* fica FORA de (plataforma) ela não tem
  // gate de sessão próprio.
  if (process.env.NODE_ENV === "production") notFound();
  return <FinanceiroProvaClient />;
}
