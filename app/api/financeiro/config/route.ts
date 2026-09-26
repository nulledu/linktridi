import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida } from "@/lib/financeiro/db";
import { limparConfig, salvarConfig } from "@/lib/financeiro/config";

/**
 * As preferências do Financeiro, por empresa.
 *
 * Atrás de `financeiro:config` — a chave de governança que nem o superusuário
 * ganha de graça (ver CHAVES_SO_POR_CONCESSAO). Mudar o prefixo do patrimônio
 * ou a janela de alerta muda o que TODO MUNDO vê; é decisão de quem administra
 * o módulo, não de quem lança compra.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: Request) {
  const eu = await apiFinanceiro("config");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = String(corpo.empresa_id ?? "");
  if (!UUID.test(empresaId) || !(await empresaPermitida(eu.profile.id, empresaId))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const campos = limparConfig(corpo);
  if (!Object.keys(campos).length) {
    return NextResponse.json({ erro: "Nada válido para salvar." }, { status: 400 });
  }

  const r = await salvarConfig(empresaId, campos, eu.profile.id);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.pendente ? 503 : 500 });

  await auditar({
    empresa_id: empresaId, entidade: "config", entidade_id: empresaId, acao: "editar",
    user_id: eu.profile.id, user_nome: eu.profile.name, dados: campos,
  });

  return NextResponse.json({ ok: true });
}
