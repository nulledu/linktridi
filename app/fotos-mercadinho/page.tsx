// TEMPORÁRIO — ferramenta de uma coisa só: arrumar a FOTO dos produtos do
// mercadinho sem entrar no TridiMarket.
//
// Existe porque trocar a foto hoje mora dentro do formulário de "Editar
// produto" (preço, estoque, empresas, categoria): pra corrigir vinte fotos são
// vinte modais grandes, num fluxo pensado pra cadastro, não pra faxina.
//
// Quando o catálogo estiver com as fotos em dia, esta pasta some inteira.
//
// SEM exigir a área "tridimarket": a faxina é trabalho de mutirão, e ficar
// distribuindo acesso ao mercadinho pra quem só vai fotografar prateleira era
// dar muito mais poder do que a tarefa pede. Quem cuida do tamanho dessa
// abertura é app/api/fotos-faxina/route.ts, que só lê o que a tela desenha e
// só grava `imagem_url`. Login continua obrigatório (o middleware manda pro
// /login), e este `getProfile` é a segunda tranca: no fail-open do
// middleware (env do Supabase ausente) a rota /fotos-* não teria gate nenhum,
// por morar fora de (plataforma).
//
// `getProfile` e não `getAuthedUser` porque só ele confere `profiles.active` —
// mesma troca feita na rota. Sem isso quem foi desligado abria a tela e só
// descobria no primeiro salvamento, com a frase errada ("sua sessão caiu").
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/require-auth";
import { FaxinaDeFotos } from "../fotos-comuns/FaxinaDeFotos";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fotos do mercadinho · Gaius" };

export default async function FotosMercadinho() {
  if (!(await getProfile())) redirect("/login?next=/fotos-mercadinho");
  return <FaxinaDeFotos catalogo="mercadinho" />;
}
