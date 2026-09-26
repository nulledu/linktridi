import { notFound } from "next/navigation";
import { PreviaClient } from "../loja/[id]/PreviaClient";
import { lojaPorId, produtosDaLoja } from "@/lib/lojas-demo";

// Banco de provas da PRÉVIA do editor de aparência.
//
// Existe porque a prévia de verdade (`/previa/loja/<id>`) exige sessão, e o
// harness do editor roda sem nenhuma — sem esta porta o `<iframe>` do editor
// mostraria a tela de login, e o que ficaria por conferir é justamente o elo
// que mais quebra em silêncio: o recado do editor chegando na prévia.
//
// Mora sob `/previa/` e não em `/dev-previa` por causa do `X-Frame-Options`: a
// exceção de enquadramento do `next.config.ts` é por PREFIXO, e um nome fora
// dele receberia `DENY` — o iframe abriria em branco, exatamente o defeito que
// esta página existe pra flagrar.
//
// AS DUAS TRAVAS (ver o cabeçalho de `/dev-lojas`):
//   1. `DEV_ONLY_PREFIXES` no middleware.ts torna a rota pública fora de
//      produção — sozinha, ela não esconde nada.
//   2. O `notFound()` abaixo é quem faz a página SUMIR em produção.
export const dynamic = "force-dynamic";

export default function DevPreviaPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const loja = lojaPorId("carimbos-tridi")!;
  return <PreviaClient loja={loja} produtos={produtosDaLoja("carimbos-tridi").filter((p) => p.status === "ativo")} />;
}
