import { NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { getBot } from "@/lib/tridiflow-db";

// "Publiquei, o link está lá, e ele diz que a página não existe."
//
// A causa quase nunca é a página: é o DOMÍNIO apontando para outro servidor.
// Um domínio cadastrado aqui só funciona se o DNS dele levar até ESTA
// aplicação — e o cadastro no banco não tem como saber disso sozinho. Foi o que
// aconteceu com gedux.com.br: ele responde, mas quem responde é o servidor dos
// funis, que não conhece a central.
//
// Então o editor pergunta ao próprio endereço, do servidor, com prazo curto.
export const dynamic = "force-dynamic";

const MARCA = "tut-central";   // classe que só a central pública renderiza

export async function POST(req: Request) {
  if (!(await getProfileForAnyModule("marketing", "tridiflow:tutoriais"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const bot = await getBot(id).catch(() => null);
  if (!bot) return NextResponse.json({ error: "central não encontrada" }, { status: 404 });
  if (bot.status !== "publicado") {
    return NextResponse.json({ estado: "rascunho", url: null, recado: "A central ainda não foi publicada — o link só entra no ar depois de publicar." });
  }

  const host = bot.dominioHost || new URL(req.url).host;
  const url = `https://${host}/p/${bot.slug}`;
  // Prazo curto: domínio errado costuma travar em vez de recusar, e um editor
  // esperando 30 s parece o app travado.
  const corte = AbortSignal.timeout(7000);
  try {
    const r = await fetch(url, { signal: corte, redirect: "follow", cache: "no-store", headers: { "user-agent": "TridiFlow/verificacao" } });
    const corpo = await r.text();
    if (r.ok && corpo.includes(MARCA)) return NextResponse.json({ estado: "ok", url, recado: "O link está no ar e mostrando esta central." });
    if (r.ok) {
      return NextResponse.json({
        estado: "outro-servidor", url,
        recado: `${host} respondeu, mas não é esta aplicação que atende esse endereço — o DNS dele aponta para outro servidor. Use o domínio padrão ou aponte ${host} para cá.`,
      });
    }
    return NextResponse.json({ estado: "erro-http", url, recado: `${host} respondeu ${r.status}. Confira o apontamento do domínio.` });
  } catch {
    return NextResponse.json({ estado: "sem-resposta", url, recado: `Não houve resposta de ${host} em 7 segundos — o domínio pode não estar apontado (ou não ter certificado).` });
  }
}
