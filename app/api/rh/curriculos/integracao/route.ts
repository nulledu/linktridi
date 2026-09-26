import { NextResponse } from "next/server";
import { apiRh } from "@/lib/rh/gate";
import { gravarConfig, listarVagas } from "@/lib/rh/curriculos/dados";
import { gerarTokenWebhook } from "@/lib/rh/curriculos/token";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST — gera (ou troca) o token do webhook. O texto do token volta UMA vez;
 * o banco guarda só o hash e os 4 últimos caracteres. Trocar invalida o
 * anterior na hora — quem colou o antigo no TridiFlow precisa colar o novo.
 */
export async function POST() {
  const eu = await apiRh("curriculos_integracao");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const { token, hash, dica } = gerarTokenWebhook();
  const erro = await gravarConfig({ webhook_token_hash: hash, webhook_token_dica: dica, webhook_gerado_em: new Date().toISOString(), updated_by: eu.profile.id });
  if (erro) return NextResponse.json({ erro }, { status: 500 });
  return NextResponse.json({ ok: true, token, dica });
}

/** PATCH { formulario_ativo?, vaga_padrao_id? } */
export async function PATCH(req: Request) {
  const eu = await apiRh("curriculos_integracao");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_by: eu.profile.id };
  if ("formulario_ativo" in corpo) patch.formulario_ativo = corpo.formulario_ativo === true;
  if ("vaga_padrao_id" in corpo) {
    const v = corpo.vaga_padrao_id;
    if (v === null || v === "") patch.vaga_padrao_id = null;
    else if (typeof v === "string" && UUID.test(v)) {
      const { dados } = await listarVagas();
      if (!dados.some((x) => x.id === v)) return NextResponse.json({ erro: "Vaga não encontrada." }, { status: 400 });
      patch.vaga_padrao_id = v;
    } else return NextResponse.json({ erro: "Vaga inválida." }, { status: 400 });
  }
  if ("limpar_erro" in corpo) { patch.ultimo_erro = null; patch.ultimo_erro_em = null; }
  const erro = await gravarConfig(patch);
  if (erro) return NextResponse.json({ erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}
