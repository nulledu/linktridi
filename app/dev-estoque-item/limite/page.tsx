// TEMPORÁRIO — banco de provas dos ESTADOS-LIMITE das sete abas do Estoque.
//
// O `/dev-mobile?ws=estoque` monta as abas com o estado FELIZ: listas com 3 a 6
// linhas, nomes que cabem, números de dois dígitos. É por isso que medir ali dá
// zero e o dono continua vendo defeito: o que quebra é a lista vazia, a lista
// de uma linha, o erro de rede, o "carregando" que nunca termina, o nome de 60
// caracteres sem espaço e o número de cinco dígitos.
//
// Aqui cada caso é uma URL (`?caso=`), e a rede falsa é montada por caso —
// inclusive respondendo 500 e ficando pendurada pra sempre.
//
// Mora sob /dev-estoque-item/ de propósito: o prefixo já é público fora de
// produção no `middleware.ts` (DEV_ONLY_PREFIXES), e esta página tem a SEGUNDA
// trava — o `notFound()` abaixo — que é a que faz a rota sumir em produção.
import { notFound } from "next/navigation";
import { ProvaLimite } from "./ProvaLimite";

export const dynamic = "force-dynamic";

export default async function DevEstoqueLimite({ searchParams }: { searchParams: Promise<{ caso?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { caso } = await searchParams;
  return <ProvaLimite caso={caso ?? "monstro"} />;
}
