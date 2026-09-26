import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { apiRh } from "@/lib/rh/gate";
import { anotarHistorico, detalheDoCandidato, gravarTags, listarVagas } from "@/lib/rh/curriculos/dados";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : null);

/** GET — o perfil, recortado pelas gavetas de quem pediu. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const eu = await apiRh("curriculos");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ erro: "Candidato inválido." }, { status: 400 });
  const c = await detalheDoCandidato(id, eu.poderes);
  if (!c) return NextResponse.json({ erro: "Candidato não encontrado." }, { status: 404 });
  return NextResponse.json({ candidato: c });
}

/** PATCH — cadastro (nome, contato, cidade), a vaga e as etiquetas manuais (`tags`). Etapa tem rota própria. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const eu = await apiRh("curriculos_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ erro: "Candidato inválido." }, { status: 400 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  // Etiquetas: gravadas à parte (têm histórico próprio e voltam o que mudou).
  if ("tags" in corpo) {
    const lista = Array.isArray(corpo.tags) ? corpo.tags : [];
    const tags = [...new Set(lista.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, 32)).filter(Boolean))].slice(0, 12);
    const r = await gravarTags(id, tags, eu.profile.id);
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.erro.includes("encontrado") ? 404 : 500 });
    if (r.entraram.length || r.sairam.length) {
      await anotarHistorico({
        candidato_id: id, tipo: "tag", autor_id: eu.profile.id, autor_nome: eu.profile.name,
        titulo: [r.entraram.length ? `Etiqueta ${r.entraram.map((t) => `“${t}”`).join(", ")} adicionada.` : "", r.sairam.length ? `Etiqueta ${r.sairam.map((t) => `“${t}”`).join(", ")} removida.` : ""].filter(Boolean).join(" "),
      });
    }
    if (Object.keys(corpo).length === 1) return NextResponse.json({ ok: true, tags });
  }

  const patch: Record<string, unknown> = { updated_by: eu.profile.id };
  const mudou: string[] = [];
  if ("nome" in corpo) { const v = txt(corpo.nome, 160); if (!v) return NextResponse.json({ erro: "Nome não pode ficar vazio." }, { status: 400 }); patch.nome = v; mudou.push("nome"); }
  if ("email" in corpo) { patch.email = txt(corpo.email, 200) || null; mudou.push("e-mail"); }
  if ("telefone" in corpo) { patch.telefone = txt(corpo.telefone, 40) || null; mudou.push("telefone"); }
  if ("cidade" in corpo) { patch.cidade = txt(corpo.cidade, 120) || null; mudou.push("cidade"); }

  let vagaTitulo: string | null = null;
  if ("vaga_id" in corpo) {
    const v = corpo.vaga_id;
    if (v === null || v === "") { patch.vaga_id = null; }
    else if (typeof v === "string" && UUID.test(v)) {
      const { dados } = await listarVagas();
      const vaga = dados.find((x) => x.id === v);
      if (!vaga) return NextResponse.json({ erro: "Vaga não encontrada." }, { status: 400 });
      patch.vaga_id = v; vagaTitulo = vaga.titulo;
    } else return NextResponse.json({ erro: "Vaga inválida." }, { status: 400 });
  }
  if (mudou.length === 0 && !("vaga_id" in corpo)) {
    if ("tags" in corpo) return NextResponse.json({ ok: true });
    NextResponse.json({ erro: "Nada para alterar." }, { status: 400 });
  }

  const { data, error } = await createSupabaseAdminClient().from("rh_candidatos").update(patch).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ erro: "Candidato não encontrado." }, { status: 404 });

  if ("vaga_id" in corpo) {
    await anotarHistorico({
      candidato_id: id, tipo: "vaga", autor_id: eu.profile.id, autor_nome: eu.profile.name,
      titulo: vagaTitulo ? `Vaga definida: ${vagaTitulo}.` : "Vaga removida.",
    });
  }
  if (mudou.length) {
    await anotarHistorico({
      candidato_id: id, tipo: "dados", autor_id: eu.profile.id, autor_nome: eu.profile.name,
      titulo: "Cadastro corrigido.", detalhe: mudou.join(", "),
    });
  }
  return NextResponse.json({ ok: true });
}
