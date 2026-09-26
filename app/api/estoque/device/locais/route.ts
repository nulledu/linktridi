import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { authorizeDevice, deviceAuthFailure } from "../_device";
import { freioDevice, origemDe, resposta429 } from "../_freio";

export const dynamic = "force-dynamic";

// ── Os lugares do galpão, pro tablet — e o lugar NOVO nascido lá de pé ───────
//
// A tela "Placas do galpão" existe porque o mapa diverge da parede: na primeira
// colagem de placas o dono descobriu prateleiras que o mapeamento não tinha
// (E-02 tem 10 andares, não 8) e seções inteiras fora de ordem. Quem descobre
// isso está DE PÉ no galpão com o tablet na mão — mandar essa pessoa até o
// escritório pra cadastrar um lugar é garantir que o cadastro não acontece.
//
// GET devolve a árvore inteira: ~80 linhas hoje, teto de 1000. Não é poll —
// quem chama é a abertura da tela e o pós-criação, gente e não relógio.
//
// POST cria UM lugar. O código é o que vai impresso e dentro do QR, então as
// regras dele são as da etiqueta: maiúsculas, dígitos e hífen, curto. A
// unicidade quem garante é o índice `lower(codigo)` do banco — a checagem aqui
// existe pra devolver a FRASE certa em vez de um erro de constraint.

const LIMITE = 1000;

/** O shape que o tablet consome — os nomes espelham `LocalDto` em Contracts.kt. */
function paraDto(l: { id: string; codigo: string; nome: string; pai_id: string | null; ativo: boolean; ordem: number }) {
  return { id: l.id, codigo: l.codigo, nome: l.nome, paiId: l.pai_id, ativo: l.ativo, ordem: l.ordem };
}

export async function GET(req: NextRequest) {
  if (!freioDevice.consumir(origemDe(req.headers)).permitido) return resposta429();
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure();

  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("estoque_locais")
    .select("id,codigo,nome,pai_id,ativo,ordem")
    .order("ordem").order("nome")
    .limit(LIMITE);
  // Tabela ausente (SQL não rodado) não é erro pro tablet: a tela diz que não
  // há lugares e a impressão livre continua inteira.
  if (error) return NextResponse.json({ locais: [] });
  return NextResponse.json({ locais: (data ?? []).map(paraDto) });
}

/** Código imprimível: é ele que sai na placa e dentro do QR (modo alfanumérico). */
const CODIGO_VALIDO = /^[A-Z0-9][A-Z0-9-]{0,15}$/;

export async function POST(req: NextRequest) {
  if (!freioDevice.consumir(origemDe(req.headers)).permitido) return resposta429();
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure();

  const corpo = await req.json().catch(() => ({}));
  const codigo = String(corpo?.codigo ?? "").trim().toUpperCase();
  const nome = String(corpo?.nome ?? "").trim().slice(0, 60);
  const paiId = typeof corpo?.paiId === "string" && corpo.paiId ? corpo.paiId : null;

  if (!CODIGO_VALIDO.test(codigo)) {
    const frase = "O código vai impresso na placa: até 16 letras maiúsculas, números e hífen — sem espaço nem acento.";
    return NextResponse.json({ ok: false, detalhe: frase, error: frase }, { status: 400 });
  }
  if (!nome) {
    const frase = "Dê um nome ao lugar — é o que aparece na conferência.";
    return NextResponse.json({ ok: false, detalhe: frase, error: frase }, { status: 400 });
  }

  const db = createSupabaseAdminClient();

  // A frase certa ANTES do insert: o índice único em lower(codigo) recusaria
  // de qualquer jeito, mas "duplicate key value" não diz a ninguém o que fazer.
  const { data: existente } = await db.from("estoque_locais")
    .select("id,codigo").ilike("codigo", codigo).limit(1);
  if ((existente ?? []).length > 0) {
    const frase = `Já existe um lugar com o código ${codigo} — imprima a placa dele em vez de criar outro.`;
    return NextResponse.json({ ok: false, detalhe: frase, error: frase }, { status: 409 });
  }

  if (paiId) {
    const { data: pai } = await db.from("estoque_locais").select("id").eq("id", paiId).limit(1);
    if ((pai ?? []).length === 0) {
      const frase = "O lugar de cima não existe mais — volte e recarregue a lista.";
      return NextResponse.json({ ok: false, detalhe: frase, error: frase }, { status: 400 });
    }
  }

  // Ordem no fim da fila dos irmãos: quem cria de pé no galpão está seguindo a
  // parede, e a parede cresce pro lado — o lugar novo entra depois dos que já
  // existem, nunca embaralha os impressos.
  let ordem = 10;
  {
    const irmaos = paiId
      ? db.from("estoque_locais").select("ordem").eq("pai_id", paiId)
      : db.from("estoque_locais").select("ordem").is("pai_id", null);
    const { data: linhas } = await irmaos.order("ordem", { ascending: false }).limit(1);
    ordem = ((linhas ?? [])[0]?.ordem ?? 0) + 10;
  }

  const { data, error } = await db.from("estoque_locais")
    .insert({ codigo, nome, pai_id: paiId, ordem })
    .select("id,codigo,nome,pai_id,ativo,ordem")
    .single();
  if (error || !data) {
    const frase = `Não deu pra criar: ${error?.message ?? "erro desconhecido"}`.slice(0, 160);
    return NextResponse.json({ ok: false, detalhe: frase, error: frase }, { status: 500 });
  }
  return NextResponse.json({ ok: true, local: paraDto(data) });
}
