import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { listPessoas, listFeriados } from "@/lib/ponto";
import { bancoDaPessoa, bancoDeTodos, mesAtualSp, normalizaPeriodo, META_DIARIA_MIN_PADRAO, type Periodo } from "@/lib/banco-horas";

export const dynamic = "force-dynamic";

// GET /api/ponto/banco-horas?mes=YYYY-MM|de=..&ate=..&meta=8[&pessoaId=..&escopo=todos]
// - colaborador comum: só o PRÓPRIO banco (ponto_pessoas.colaborador_id = user.id)
// - admin: todos (escopo=todos) ou uma pessoa (pessoaId)
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const mes = /^\d{4}-\d{2}$/.test(sp.get("mes") || "") ? sp.get("mes")! : mesAtualSp();
  // Período livre (de..até) ganha do mês quando vem completo e válido. Meia
  // ponta é ignorada: um "de" sem "até" viraria "daí até o fim do tempo".
  const dia = (v: string | null) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v! : null);
  const de = dia(sp.get("de")), ate = dia(sp.get("ate"));
  const periodo: string | Periodo = de && ate ? normalizaPeriodo({ de, ate }) : mes;
  const metaHoras = Math.min(24, Math.max(0, Number(sp.get("meta")) || 8));
  const metaMin = metaHoras > 0 ? Math.round(metaHoras * 60) : META_DIARIA_MIN_PADRAO;
  // "Gestor do ponto" = papel admin OU quem recebeu na grade a área de onde o
  // painel abre (Colaboradores / Configurações). Só o papel fazia a tela da
  // equipe montar e a resposta vir com o banco de uma pessoa só.
  const minhas = await resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username });
  const isAdmin = me.role === "admin" || minhas.includes("colaboradores") || minhas.includes("administracao");
  const soEu = sp.get("escopo") === "eu";   // força o PRÓPRIO banco (Central), mesmo p/ admin

  try {
    // Uma leitura só: o admin ganha a lista (pra desenhar o calendário) e o
    // cálculo ganha o mapa dia → tipo. Buscar as duas coisas em duas consultas
    // era o mesmo SELECT duas vezes por abertura de tela.
    const feriadosList = await listFeriados(periodo);
    const feriados = new Map(feriadosList.map((f) => [f.dia, f.tipo]));

    // Admin (sem escopo=eu) → equipe toda, ou uma pessoa escolhida.
    if (isAdmin && !soEu) {
      const pessoaId = sp.get("pessoaId");
      if (pessoaId) {
        const p = (await listPessoas(true)).find((x) => x.id === pessoaId);
        if (!p) return NextResponse.json({ error: "pessoa_nao_encontrada" }, { status: 404 });
        const banco = await bancoDaPessoa(p, periodo, feriados, metaMin);
        return NextResponse.json({ escopo: "pessoa", mes, metaHoras, isAdmin, feriados: isAdmin ? feriadosList : [], banco });
      }
      const pessoas = await bancoDeTodos(periodo, feriados, metaMin);
      return NextResponse.json({ escopo: "todos", mes, metaHoras, isAdmin, feriados: isAdmin ? feriadosList : [], pessoas });
    }

    // Colaborador comum (ou admin em escopo=eu) → só o próprio (colaborador_id).
    const minha = (await listPessoas(true)).find((p) => p.colaboradorId === me.id);
    if (!minha) return NextResponse.json({ escopo: "eu", mes, metaHoras, isAdmin, semVinculo: true, banco: null });
    const banco = await bancoDaPessoa(minha, periodo, feriados, metaMin);
    return NextResponse.json({ escopo: "eu", mes, metaHoras, isAdmin, banco });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
