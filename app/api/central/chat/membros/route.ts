import { NextRequest, NextResponse } from "next/server";
import {
  corpo, falta, jsonInvalido, meuPapel, naoAutenticado, papelEfetivo,
  perfisDe, semAcesso, sessao, temEsquemaNovo, esqueceCanais,
} from "@/lib/chat/servidor";
import { eGeral, podeNoCanal } from "@/lib/chat/regras";
import type { Membro, PapelMembro } from "@/lib/chat/tipos";

export const dynamic = "force-dynamic";

// GET ?canal= → membros do canal com papel.
export async function GET(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const canal = req.nextUrl.searchParams.get("canal");
  if (!canal) return falta("canal");
  if (!(await meuPapel(db, canal, me.id))) return semAcesso();
  const novo = await temEsquemaNovo(db);

  const { data } = await db.from("central_conversa_membros")
    .select(novo ? "user_id,papel,entrou_em" : "user_id").eq("conversa_id", canal).limit(500);
  type Linha = { user_id: string; papel?: string; entrou_em?: string };
  const linhas = (data ?? []) as Linha[];
  const perfis = await perfisDe(db, linhas.map((l) => l.user_id));

  // Setor vem do embed de `employees` — é o subtítulo do membro no painel.
  const { data: emps } = await db.from("profiles").select("id,employees(setor)").in("id", linhas.map((l) => l.user_id));
  type Emp = { id: string; employees: { setor: string | null }[] | { setor: string | null } | null };
  const setor = new Map<string, string | null>(((emps ?? []) as Emp[]).map((e) => {
    const emp = Array.isArray(e.employees) ? e.employees[0] : e.employees;
    return [e.id, emp?.setor ?? null];
  }));

  const membros: Membro[] = linhas.map((l) => ({
    id: l.user_id,
    name: perfis[l.user_id]?.nome ?? "—",
    avatar: perfis[l.user_id]?.avatar ?? null,
    setor: setor.get(l.user_id) ?? null,
    papel: ((l.papel as PapelMembro) || "membro"),
    entrou_em: l.entrou_em ?? "",
  }));
  // Dono, admins, depois o resto em ordem alfabética.
  const peso = { dono: 0, admin: 1, membro: 2 } as const;
  membros.sort((a, b) => peso[a.papel] - peso[b.papel] || a.name.localeCompare(b.name, "pt-BR"));
  return NextResponse.json({ membros });
}

// POST → adiciona pessoas (ou eu mesmo, com membros: ["eu"], para entrar num canal público).
export async function POST(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const b = await corpo<{ canal_id?: string; membros?: string[] }>(req);
  if (!b?.canal_id || !b.membros?.length) return jsonInvalido();
  const canal = String(b.canal_id);
  const novo = await temEsquemaNovo(db);

  // Entrar sozinho num canal público não exige convite de ninguém.
  const souEu = b.membros.length === 1 && (b.membros[0] === "eu" || b.membros[0] === me.id);
  if (souEu) {
    const { data: conf } = await db.from("central_conversas")
      .select(novo ? "id,privado,arquivado,tipo" : "id,tipo").eq("id", canal).maybeSingle();
    const c = conf as { privado?: boolean; arquivado?: boolean; tipo?: string } | null;
    if (!c || c.privado || c.arquivado || c.tipo === "direta") return semAcesso();
    await db.from("central_conversa_membros")
      .upsert({ conversa_id: canal, user_id: me.id }, { onConflict: "conversa_id,user_id" });
    return NextResponse.json({ ok: true });
  }

  const papel = await meuPapel(db, canal, me.id);
  if (!papel) return semAcesso();
  if (!podeNoCanal({ papel: papelEfetivo(papel, me.role), somente_leitura: false, arquivado: false }, "convidar"))
    return semAcesso();

  const novos = [...new Set(b.membros.map(String))].slice(0, 200);
  const { error } = await db.from("central_conversa_membros")
    .upsert(novos.map((u) => ({ conversa_id: canal, user_id: u })), { onConflict: "conversa_id,user_id" });
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH → muda o papel de alguém.
export async function PATCH(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const b = await corpo<{ canal_id?: string; user_id?: string; papel?: string }>(req);
  if (!b?.canal_id || !b.user_id || !b.papel) return jsonInvalido();
  if (!["dono", "admin", "membro"].includes(b.papel)) return jsonInvalido();

  const papel = await meuPapel(db, b.canal_id, me.id);
  if (!papel) return semAcesso();
  if (!podeNoCanal({ papel: papelEfetivo(papel, me.role), somente_leitura: false, arquivado: false }, "gerenciar_membros"))
    return semAcesso();
  // Só o dono passa a coroa adiante.
  if (b.papel === "dono" && papelEfetivo(papel, me.role) !== "dono") return semAcesso();

  const { error } = await db.from("central_conversa_membros")
    .update({ papel: b.papel }).eq("conversa_id", b.canal_id).eq("user_id", b.user_id);
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE ?canal=&user= → remove alguém (ou eu mesmo saindo).
export async function DELETE(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const canal = req.nextUrl.searchParams.get("canal");
  const user = req.nextUrl.searchParams.get("user");
  if (!canal || !user) return falta("parametro");

  const papel = await meuPapel(db, canal, me.id);
  if (!papel) return semAcesso();
  const novo = await temEsquemaNovo(db);
  if (user !== me.id && !podeNoCanal({ papel: papelEfetivo(papel, me.role), somente_leitura: false, arquivado: false }, "gerenciar_membros"))
    return semAcesso();
  // Do Geral ninguém sai nem é tirado: quem fosse removido voltaria na próxima abertura.
  if (novo) {
    const { data: conf } = await db.from("central_conversas").select("contexto_tipo,contexto_ref").eq("id", canal).maybeSingle();
    if (conf && eGeral(conf as { contexto_tipo: string | null; contexto_ref: string | null })) return semAcesso();
  }

  await db.from("central_conversa_membros").delete().eq("conversa_id", canal).eq("user_id", user);
  esqueceCanais(user);
  return NextResponse.json({ ok: true });
}
