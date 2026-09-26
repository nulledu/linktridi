import { NextRequest, NextResponse, after } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { listMinhasTarefas, criarTarefa, atualizarTarefa, removerTarefa, registrarEvento } from "@/lib/tarefas";
import { notificar } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

const LBL: Record<string, string> = { pendente: "Pendente", em_andamento: "Em andamento", aguardando: "Aguardando", bloqueada: "Bloqueada", concluida: "Concluída", cancelada: "Cancelada" };

// GET /api/tarefas — todas as tarefas do usuário (o front resolve as listas).
export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ tarefas: await listMinhasTarefas(me.id) });
}

// POST /api/tarefas — cria (pessoal por padrão; pode vir de mensagem/pedido/etc).
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: { titulo?: string; responsavelId?: string; responsavelNome?: string; [k: string]: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!b.titulo || !String(b.titulo).trim()) return NextResponse.json({ error: "titulo_obrigatorio" }, { status: 400 });
  const t = await criarTarefa({ id: me.id, nome: me.name }, b as never);
  if (!t) return NextResponse.json({ error: "tabela_ausente" }, { status: 400 });
  // Histórico e aviso em after(): `void` solto depois da resposta pode ser
  // congelado pela Vercel e o aviso some.
  after(async () => {
    await registrarEvento(t.id, { id: me.id, nome: me.name }, "criou", t.origemLabel ? `a partir de ${t.origemLabel}` : null);
    // Delegou pra outra pessoa → notifica quem recebeu (nunca a si mesmo).
    if (t.responsavelId && t.responsavelId !== me.id) {
      await notificar({ user_id: t.responsavelId, tipo: "tarefa", titulo: `${me.name} te atribuiu: ${t.titulo}`, link: "/central/tarefas", de_nome: me.name });
    }
  });
  return NextResponse.json({ ok: true, tarefa: t });
}

// PATCH /api/tarefas  { id, ...campos } — atualiza + registra histórico.
export async function PATCH(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: { id?: string; [k: string]: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });
  const { id, ...patch } = b;
  // Só quem criou ou é responsável escreve; o resto cai aqui como "falha".
  const t = await atualizarTarefa(id, patch, me.id);
  if (!t) return NextResponse.json({ error: "falha" }, { status: 400 });
  const autor = { id: me.id, nome: me.name };
  // Histórico e avisos só rodam em after(), depois da resposta — e só
  // chegam aqui se a escrita passou pelo filtro de quem está na tarefa.
  const depois: (() => Promise<unknown>)[] = [];
  const evento = (...a: Parameters<typeof registrarEvento>) => { depois.push(() => registrarEvento(...a)); };
  const avisar = (...a: Parameters<typeof notificar>) => { depois.push(() => notificar(...a)); };
  if (typeof patch.status === "string") {
    const acao = patch.status === "concluida" ? "concluiu" : patch.status === "pendente" ? "reabriu" : "status";
    evento(id, autor, acao, `→ ${LBL[patch.status] ?? patch.status}`);
    // Delegada concluída com aviso ligado → notifica o criador (nunca a si mesmo).
    if (patch.status === "concluida" && t.avisarConclusao && t.criadorId && t.criadorId !== me.id) {
      avisar({ user_id: t.criadorId, tipo: "tarefa", titulo: `${me.name} concluiu: ${t.titulo}`, link: "/central/tarefas", de_nome: me.name });
    }
  }
  if (typeof patch.prioridade === "string") evento(id, autor, "prioridade", `→ ${patch.prioridade}`);
  if (patch.prazo !== undefined) evento(id, autor, "prazo", t.prazo ? `→ ${new Date(t.prazo).toLocaleDateString("pt-BR")}` : "removido");
  if (patch.responsavelId !== undefined) {
    evento(id, autor, "responsavel", t.responsavelNome ? `→ ${t.responsavelNome}` : null);
    if (t.responsavelId && t.responsavelId !== me.id) {
      avisar({ user_id: t.responsavelId, tipo: "tarefa", titulo: `${me.name} te atribuiu: ${t.titulo}`, link: "/central/tarefas", de_nome: me.name });
    }
  }
  if (depois.length) after(async () => { for (const f of depois) await f().catch(() => {}); });
  return NextResponse.json({ ok: true, tarefa: t });
}

// DELETE /api/tarefas?id=.. — remove.
export async function DELETE(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const r = await removerTarefa(id, me.id);
  if (r === "nao_encontrada") return NextResponse.json({ error: "nao_encontrada" }, { status: 404 });
  if (r === "erro") return NextResponse.json({ error: "falha" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
