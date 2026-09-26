import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { revelarSenha, registrar, TabelaAusenteError, ChaveAusenteError } from "@/lib/acessos-cofre";

export const dynamic = "force-dynamic";

// ── A única porta por onde a senha sai em claro ──────────────────────────────
// É POST e não GET de propósito. GET vira histórico do navegador, entra em log
// de proxy e pode ser pré-carregado pelo próprio navegador — uma revelação que
// ninguém pediu, carimbada na auditoria como se alguém tivesse clicado.
//
// A auditoria é gravada ANTES da resposta. Se o insert do log ficasse depois,
// existiria uma janela em que a senha já saiu e o registro não existe — e a
// pergunta que a auditoria responde ("quem viu isto?") passaria a ter resposta
// incompleta justamente no caso que importa.
export async function POST(req: NextRequest) {
  const me = await getProfileForModule("infraestrutura:cofre");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { id?: string; acao?: string; colaboradorNome?: string };
  if (!b.id) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });
  // "Copiar" e "revelar" viram linhas diferentes: copiar sem olhar é o gesto
  // mais comum, e tratá-lo como revelação apagaria a diferença entre quem leu
  // a senha na tela e quem a levou pra área de transferência.
  const acao = b.acao === "copiar" ? "copiar" : "revelar";

  try {
    const { senha, servico } = await revelarSenha(b.id);
    await registrar({ credencialId: b.id, atorId: me.id, atorNome: me.name, acao, servico, colaboradorNome: b.colaboradorNome });
    // `no-store` explícito: senha em claro não entra em cache de lugar nenhum.
    return NextResponse.json({ senha }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    if (e instanceof TabelaAusenteError)
      return NextResponse.json({ error: "tabela_ausente", detalhe: "Rode supabase/acessos_cofre.sql no Supabase." }, { status: 200 });
    if (e instanceof ChaveAusenteError)
      return NextResponse.json({ error: "chave_ausente", detalhe: "Falta a variável de ambiente ACESSOS_CRYPTO_KEY (32 bytes)." }, { status: 200 });
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
