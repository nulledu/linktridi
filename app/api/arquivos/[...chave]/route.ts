import { NextRequest, NextResponse } from "next/server";
import { getProfile, getProfileForAnyModule } from "@/lib/require-auth";
import { ehSuperusuario } from "@/lib/superusuario";
import { LEITURA_POR_AREA, ROTA_ARQUIVOS, areaDaChave, chaveValida } from "@/lib/armazenamento/referencia";
import { donoDoAnexoDoPonto } from "@/lib/ponto";
import { b2Configurado, urlAssinadaLeitura } from "@/lib/armazenamento/privado";

export const dynamic = "force-dynamic";

// GET /api/arquivos/<area>/<aaaa>/<mm>/<id>.<ext> — a ÚNICA porta de leitura do
// armazenamento privado (Backblaze B2). É o que o banco guarda em `url`.
//
// Confere a sessão e REDIRECIONA pra uma URL assinada de 10 minutos. Redirect
// e não proxy: os bytes saem do B2 direto pro navegador, sem passar pela
// Vercel (que cobra CPU pelo tempo do stream) — um vídeo de 200 MB custaria
// uma invocação inteira parada por minutos. O `Cache-Control: private` deixa
// o navegador guardar o redirect por quase o prazo da assinatura, então rolar
// a conversa de novo não paga outra invocação.
//
// A área da chave manda na permissão (LEITURA_POR_AREA): documento do
// Financeiro exige `financeiro:ver`,
// selfie do ponto só o superusuário. Ter o link não vale mais que ter a área.
// Tipo e disposição da resposta vêm da extensão da chave, forçados na
// assinatura — o que o cliente gravou no PUT não é servido.
export async function GET(req: NextRequest, ctx: { params: Promise<{ chave: string[] }> }) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const chave = (await ctx.params).chave.join("/");
  const area = chaveValida(chave) ? areaDaChave(chave) : null;
  if (!area) return NextResponse.json({ error: "bad_path" }, { status: 400 });

  const regra = LEITURA_POR_AREA[area];
  if (regra === "superusuario") {
    if (!ehSuperusuario(me.id, me.username)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  } else if (regra && !(await getProfileForAnyModule(...(Array.isArray(regra) ? regra : [regra])))) {
    // Exceção por DONO, não por link: quem subiu o próprio atestado precisa
    // poder reabrir o que mandou, e não tem nenhuma chave do RH. A checagem
    // pergunta ao banco se ESTE arquivo pertence a um pedido DESTA pessoa —
    // ter a URL continua não valendo nada pra todo mundo mais. Só a área de
    // atestados paga essa consulta; as outras seguem recusando na hora.
    const dono = area === "atestados" && (await donoDoAnexoDoPonto(`${ROTA_ARQUIVOS}/${chave}`, me.id));
    if (!dono) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!b2Configurado()) return NextResponse.json({ error: "storage_off" }, { status: 503 });

  const q = new URL(req.url).searchParams;
  const nome = q.get("nome") || undefined;
  const download = q.get("download") === "1";
  try {
    const url = await urlAssinadaLeitura(chave, 600, { nome, download });
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "cache-control": "private, max-age=540", "referrer-policy": "no-referrer" },
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
