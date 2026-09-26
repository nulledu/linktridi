import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { gerarCodigoAtivacao, validarVersaoInput, acaoValida } from "@/lib/tv-frota-admin";
import { comandoValido } from "@/lib/tv-frota";
import { avisarTv } from "@/lib/tv-sinal";

export const dynamic = "force-dynamic";

// Quanto tempo sem falar = offline (pra pintar o status no console).
const OFFLINE_MS = 3 * 60_000;

/**
 * Console da frota (lado ADMIN) — atrás de login, área "frota".
 *
 * GET  → aparelhos (com online/offline e versão), versões publicadas e os
 *        últimos comandos com resultado.
 * POST → uma AÇÃO do conjunto fechado (registrar aparelho, renomear, remover,
 *        publicar versão, mandar comando pra um ou pra TODOS).
 *
 * Isto NÃO é rota de aparelho: é a pessoa logada operando a frota. As rotas
 * que a TV chama vivem em /api/tv/device e autenticam por Bearer token.
 */
export async function GET() {
  const me = await requireModule("frota");
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdminClient();

  const [{ data: disp }, { data: versoes }, { data: comandos }] = await Promise.all([
    db.from("tv_dispositivos")
      .select("id,nome,ativo,versao_code,versao_nome,modelo,ip,visto_em,codigo_ativacao,created_at")
      .order("nome").limit(300),
    db.from("tv_versoes")
      .select("id,version_code,version_name,url,sha256,notas,obrigatoria,publicada,por_nome,criada_em")
      .order("version_code", { ascending: false }).limit(30),
    db.from("tv_comandos")
      .select("id,dispositivo_id,tipo,args,status,resultado,por_nome,criado_em,concluido_em")
      .order("criado_em", { ascending: false }).limit(80),
  ]);

  const agora = Date.now();
  const dispositivos = ((disp ?? []) as Record<string, unknown>[]).map((d) => ({
    id: d.id, nome: d.nome, ativo: d.ativo,
    versaoCode: d.versao_code, versaoNome: d.versao_nome, modelo: d.modelo, ip: d.ip,
    vistoEm: d.visto_em,
    online: d.visto_em ? agora - new Date(d.visto_em as string).getTime() < OFFLINE_MS : false,
    // Código só aparece enquanto o aparelho não ativou (senão é ruído).
    codigoAtivacao: d.codigo_ativacao ?? null,
    criadoEm: d.created_at,
  }));

  return NextResponse.json({ dispositivos, versoes: versoes ?? [], comandos: comandos ?? [] });
}

export async function POST(req: NextRequest) {
  const me = await requireModule("frota");
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!acaoValida(b.acao)) return NextResponse.json({ error: "acao_invalida" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const quem = me.name || me.username;

  // ── Registrar aparelho: cria a linha e devolve o código pra digitar na TV ──
  if (b.acao === "registrar") {
    const nome = String(b.nome ?? "").trim();
    if (!nome) return NextResponse.json({ error: "nome_vazio" }, { status: 400 });
    const codigo = gerarCodigoAtivacao();
    const { data, error } = await db.from("tv_dispositivos")
      .insert({ nome, codigo_ativacao: codigo, ativo: true })
      .select("id,nome,codigo_ativacao").maybeSingle();
    if (error) return NextResponse.json({ error: "falha", detail: error.message }, { status: 500 });
    return NextResponse.json({ dispositivo: data });
  }

  // ── Renomear / (re)ativar ──────────────────────────────────────────────────
  if (b.acao === "renomear") {
    const id = String(b.id ?? "");
    const patch: Record<string, unknown> = {};
    if (typeof b.nome === "string" && b.nome.trim()) patch.nome = b.nome.trim();
    if (typeof b.ativo === "boolean") patch.ativo = b.ativo;
    if (!id || Object.keys(patch).length === 0) return NextResponse.json({ error: "nada_a_mudar" }, { status: 400 });
    const { error } = await db.from("tv_dispositivos").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: "falha", detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Remover aparelho ───────────────────────────────────────────────────────
  if (b.acao === "remover") {
    const id = String(b.id ?? "");
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
    const { error } = await db.from("tv_dispositivos").delete().eq("id", id);
    if (error) return NextResponse.json({ error: "falha", detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Publicar versão (o APK já foi enviado ao Storage; aqui grava o registro) ─
  if (b.acao === "publicar_versao") {
    const v = validarVersaoInput(b as Record<string, never>);
    if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
    const { data, error } = await db.from("tv_versoes").insert({
      version_code: v.versao.versionCode, version_name: v.versao.versionName,
      url: v.versao.url, sha256: v.versao.sha256, notas: v.versao.notas,
      obrigatoria: v.versao.obrigatoria, publicada: true, por_nome: quem,
    }).select("id,version_code,version_name").maybeSingle();
    if (error) return NextResponse.json({ error: "falha", detail: error.message }, { status: 500 });
    // A frota confere a versão a cada 15 min; o cutucão faz a TV conferir agora.
    await avisarTv("versao", { versionCode: v.versao.versionCode });
    return NextResponse.json({ versao: data });
  }

  // ── Comando: pra um aparelho ou pra TODOS (broadcast vira 1 linha por caixa) ─
  if (b.acao === "comando") {
    const cmd = comandoValido(b.tipo, b.args);
    if (!cmd) return NextResponse.json({ error: "comando_invalido" }, { status: 400 });
    // Alvos: um id, ou todos os ativos quando `todos: true`.
    let alvos: string[] = [];
    if (b.todos === true) {
      const { data } = await db.from("tv_dispositivos").select("id").eq("ativo", true).limit(500);
      alvos = ((data ?? []) as { id: string }[]).map((d) => d.id);
    } else if (typeof b.id === "string" && b.id) {
      alvos = [b.id];
    }
    if (alvos.length === 0) return NextResponse.json({ error: "sem_alvo" }, { status: 400 });
    const lote = crypto.randomUUID();
    const linhas = alvos.map((dispositivo_id) => ({
      dispositivo_id, tipo: cmd.tipo, args: cmd.args, status: "pendente", lote, por_nome: quem,
    }));
    const { error } = await db.from("tv_comandos").insert(linhas);
    if (error) return NextResponse.json({ error: "falha", detail: error.message }, { status: 500 });
    // Lista vazia = "todos": a TV não precisa saber o próprio id para reagir.
    await avisarTv("comando", { dispositivos: b.todos === true ? [] : alvos });
    return NextResponse.json({ ok: true, enviados: alvos.length });
  }

  return NextResponse.json({ error: "acao_invalida" }, { status: 400 });
}
