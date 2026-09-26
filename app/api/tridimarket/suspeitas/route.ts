import { NextRequest, NextResponse } from "next/server";
import { marketApiError, marketDb, parseIntervalo, parseProfileIds, requireMarketAdmin } from "../_shared";

export const dynamic = "force-dynamic";

// Histórico de suspeitas do mercadinho — a trilha antifurto que os totens já
// alimentam há tempos (tabela do legado, ~1,9k registros) e que ninguém
// conseguia ler em lugar nenhum do sistema.
//
// Os tipos vêm do legado e de eventos do próprio TridiMarket:
//   SEM_BIPAR          → pegou o produto e saiu sem passar
//   BIPAR_E_REMOVER    → passou e devolveu à prateleira depois
//   market_codigo_*    → tentativas de login recusadas no totem
export async function GET(req: NextRequest) {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const escopo = parseProfileIds(req.url);
  const { de: desde, ate } = parseIntervalo(req.url);
  try {
    const db = marketDb();
    let q = db.from("suspeitas")
      .select("id,criado_em,funcionario_id,unidade_id,tipo")
      .gte("criado_em", desde).lte("criado_em", ate)
      .order("criado_em", { ascending: false }).limit(400);
    if (escopo?.length) q = q.in("unidade_id", escopo);
    const { data, error } = await q;
    if (error) throw error;

    const linhas = (data ?? []) as Array<{ id: number; criado_em: string; funcionario_id: number | null; unidade_id: string; tipo: string }>;
    // Nomes numa consulta só (a lista pode ter centenas de linhas).
    const ids = [...new Set(linhas.map((l) => l.funcionario_id).filter((v): v is number => v != null))];
    const perfis = [...new Set(linhas.map((l) => l.unidade_id).filter(Boolean))];
    const [{ data: pessoas }, { data: unidades }] = await Promise.all([
      ids.length ? db.from("funcionarios").select("id,nome,foto_url").in("id", ids) : Promise.resolve({ data: [] }),
      perfis.length ? db.from("unidades").select("id,nome").in("id", perfis) : Promise.resolve({ data: [] }),
    ]);
    type Pessoa = { id: number; nome: string; foto_url: string | null };
    const nomePorId = new Map<number, string>((pessoas ?? []).map((p: Pessoa) => [Number(p.id), String(p.nome)]));
    const fotoPorId = new Map<number, string | null>((pessoas ?? []).map((p: Pessoa) => [Number(p.id), p.foto_url ?? null]));
    const unidadePorId = new Map<string, string>((unidades ?? []).map((p: { id: string; nome: string }) => [String(p.id), String(p.nome)]));

    const eventos = linhas.map((l) => ({
      id: l.id,
      at: l.criado_em,
      employeeId: l.funcionario_id,
      // Evento sem pessoa identificada existe: é o caso das tentativas de
      // login recusadas, em que justamente não se sabe quem era.
      employeeName: l.funcionario_id == null ? null : (nomePorId.get(l.funcionario_id) ?? `#${l.funcionario_id}`),
      employeeImage: l.funcionario_id == null ? null : (fotoPorId.get(l.funcionario_id) ?? null),
      unitName: unidadePorId.get(l.unidade_id) ?? null,
      // O tipo do totem carrega o id do dispositivo depois de ":" — o painel
      // mostra só a categoria.
      kind: l.tipo.split(":")[0],
      raw: l.tipo,
    }));

    const porTipo = new Map<string, number>();
    for (const e of eventos) porTipo.set(e.kind, (porTipo.get(e.kind) ?? 0) + 1);
    const porPessoa = new Map<string, { name: string; image: string | null; total: number }>();
    for (const e of eventos) {
      if (!e.employeeName) continue;
      const atual = porPessoa.get(e.employeeName) ?? { name: e.employeeName, image: e.employeeImage, total: 0 };
      atual.total += 1;
      porPessoa.set(e.employeeName, atual);
    }

    return NextResponse.json({
      ok: true,
      data: {
        eventos,
        periodDays: Math.max(1, Math.round((new Date(ate).getTime() - new Date(desde).getTime()) / 86_400_000)),
        resumo: [...porTipo.entries()].map(([kind, total]) => ({ kind, total })).sort((a, b) => b.total - a.total),
        reincidentes: [...porPessoa.values()].sort((a, b) => b.total - a.total).slice(0, 8),
      },
    });
  } catch (error) { return marketApiError(error); }
}
