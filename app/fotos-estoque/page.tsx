// TEMPORÁRIO — irmã da /fotos-mercadinho, pros itens do estoque: ver a foto e
// trocá-la sem entrar no Catálogo.
//
// Existe pelo mesmo motivo: trocar a foto hoje mora dentro do formulário do
// item (tipo, classe, SKU, unidade, mínimo, ficha técnica, setor). Pra corrigir
// vinte fotos são vinte formulários grandes, num fluxo pensado pra cadastro e
// não pra faxina.
//
// Quando o catálogo estiver com as fotos em dia, esta pasta some inteira.
//
// SEM exigir a área "estoque" — mesma decisão da irmã, e pelo mesmo motivo.
// Ver o comentário em ../fotos-mercadinho/page.tsx e o tamanho da abertura em
// app/api/fotos-faxina/route.ts.
//
// `getProfile` e não `getAuthedUser`: só ele confere `profiles.active`. Numa
// tela sem área nenhuma essa é a diferença entre "qualquer pessoa da equipe" e
// "qualquer pessoa que um dia teve conta" — e aqui se escreve a localização do
// galpão inteiro.
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/require-auth";
import { FaxinaDeFotos } from "../fotos-comuns/FaxinaDeFotos";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fotos do estoque · Gaius" };

export default async function FotosEstoque() {
  if (!(await getProfile())) redirect("/login?next=/fotos-estoque");
  return <FaxinaDeFotos catalogo="estoque" />;
}
