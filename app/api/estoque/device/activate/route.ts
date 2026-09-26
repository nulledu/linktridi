import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { tokenDigest } from "../_device";
import { freioAtivacao, origemDe, resposta429 } from "../_freio";

export const dynamic = "force-dynamic";

// A ativação já é single-use e concorrência-segura pelo UPDATE atômico. O que
// faltava era barrar a coluna que não existe ainda: se a expiração for pedida
// numa base sem `codigo_expira_em` (SQL não rodado), o Postgres devolve
// 42703 (undefined_column) e a ativação inteira quebraria. Então tenta COM a
// expiração e, só nesse erro, refaz SEM — nunca deixa o aparelho sem ativar por
// causa de uma migração pendente.
function faltaColuna(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || /column .*codigo_expira_em/i.test(err.message ?? "");
}

// POST /api/estoque/device/activate — troca o código de ativação (de uso
// único, escrito no aparelho por quem cadastrou o dispositivo no painel) por
// um Bearer token permanente. O UPDATE abaixo é a trava de corrida: a
// cláusula WHERE é reavaliada pelo Postgres depois de tomar o lock da linha,
// então duas ativações concorrentes com o MESMO código nunca conseguem as
// duas — a segunda simplesmente não casa mais (codigo_ativacao já virou null
// pela primeira) e cai no "nenhuma linha". Não precisa de função no banco.
export async function POST(req: NextRequest) {
  const origem = origemDe(req.headers);
  // Peek ANTES de processar: se o IP já estourou o teto de tentativas ERRADAS,
  // barra. Só falha conta (ver `falhou()` abaixo) — ativação bem-sucedida nunca
  // debita o balde, então provisionar vários aparelhos do mesmo IP não trava.
  if (freioAtivacao.excedido(origem)) return resposta429();
  // Cada tentativa que NÃO ativou conta uma falha: é o que fecha o brute force
  // do código curto (20 erradas / 10 min / IP).
  const falhou = () => {
    freioAtivacao.consumir(origem);
    return NextResponse.json({ error: "codigo_invalido" }, { status: 401 });
  };

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return falhou(); }
  const codigo = typeof b.codigo === "string" ? b.codigo.trim() : "";
  if (!codigo) return falhou();

  const token = randomBytes(32).toString("base64url");
  const nowIso = new Date().toISOString();
  const db = createSupabaseAdminClient();

  const claim = (comExpiracao: boolean) => {
    let q = db
      .from("estoque_dispositivos")
      .update({ token_hash: tokenDigest(token), codigo_ativacao: null, ativado_em: nowIso })
      .eq("codigo_ativacao", codigo)
      .eq("ativo", true);
    // Código expirado não ativa. `is.null` mantém compatível quem nunca teve
    // prazo (código antigo, sem expiração definida).
    if (comExpiracao) q = q.or(`codigo_expira_em.is.null,codigo_expira_em.gt.${nowIso}`);
    return q.select("id,nome").maybeSingle();
  };

  let { data, error } = await claim(true);
  if (faltaColuna(error)) ({ data, error } = await claim(false));

  if (error || !data) return falhou();

  return NextResponse.json({ token, deviceId: String(data.id), nome: String(data.nome) });
}
