// ── Contas · editar (§11) ────────────────────────────────────────────────────
// Nome, instituição, ordem, se entra no saldo disponível, se ainda está ativa.
//
// O QUE ESTA ROTA NÃO FAZ: mexer em saldo. `saldo` sequer é coluna — é a soma
// da view `fin_contas_saldo`, e gravar um número por cima criaria a segunda
// verdade que o schema existe para não ter. `saldo_inicial` é a foto do dia em
// que a conta entrou no controle; reescrevê-lo depois move o saldo de hoje sem
// deixar uma linha no extrato, que é o mesmo defeito por outro caminho. As duas
// correções passam por `/contas/[id]/ajustar`, que lança um movimento e assina.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, comTolerancia, empresaPermitida } from "@/lib/financeiro/db";
import { centavos } from "@/lib/financeiro/calculos";
import { CONTA_TIPOS } from "@/lib/financeiro/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { camposNovosDaConta } from "@/lib/financeiro/campos-novos";

export const dynamic = "force-dynamic";

const TIPO_OK = new Set<string>(CONTA_TIPOS);

const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

const dia = (v: unknown): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null;
};

const RECADO_SALDO =
  "Saldo não se edita: é a soma dos movimentos. Use o ajuste da conta, que lança um movimento e deixa rastro.";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("contas");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data: linha } = await db
    .from("fin_contas")
    .select("id,empresa_id,nome,tipo,saldo_inicial,inclui_no_saldo,ativa")
    .eq("id", id)
    .maybeSingle();

  if (!linha) return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });
  if (!(await empresaPermitida(eu.profile.id, linha.empresa_id)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  if ("saldo" in corpo) return NextResponse.json({ erro: RECADO_SALDO }, { status: 400 });
  // Reenviar o mesmo `saldo_inicial` que já está gravado é o formulário
  // devolvendo a linha inteira, não uma tentativa de reescrever o passado — só
  // a mudança de verdade é recusada.
  if ("saldo_inicial" in corpo && centavos(Number(corpo.saldo_inicial) || 0) !== centavos(Number(linha.saldo_inicial)))
    return NextResponse.json({ erro: RECADO_SALDO }, { status: 400 });

  const patch: Record<string, unknown> = { updated_by: eu.profile.id };

  if ("nome" in corpo) {
    const nome = texto(corpo.nome);
    if (!nome) return NextResponse.json({ erro: "Dê um nome à conta." }, { status: 400 });
    patch.nome = nome;
  }
  if (TIPO_OK.has(String(corpo.tipo))) patch.tipo = String(corpo.tipo);
  if ("instituicao" in corpo) patch.instituicao = texto(corpo.instituicao);
  if ("agencia" in corpo) patch.agencia = texto(corpo.agencia);
  if ("numero" in corpo) patch.numero = texto(corpo.numero);
  if (typeof corpo.inclui_no_saldo === "boolean") patch.inclui_no_saldo = corpo.inclui_no_saldo;
  if ("fechamento_dia" in corpo) patch.fechamento_dia = dia(corpo.fechamento_dia);
  if ("vencimento_dia" in corpo) patch.vencimento_dia = dia(corpo.vencimento_dia);
  if ("cor" in corpo) patch.cor = texto(corpo.cor);
  if (Number.isFinite(Number(corpo.ordem))) patch.ordem = Math.round(Number(corpo.ordem));
  if (typeof corpo.ativa === "boolean") patch.ativa = corpo.ativa;
  // A MARCA (ícone de reserva; o logo sobe por rota própria) é assunto de
  // `financeiro:config`, não de `financeiro:contas` — quem só ajusta saldo e
  // nome não precisa decidir identidade visual. Silenciosamente ignorado sem
  // a chave, e não um 403: o resto do PATCH (nome, saldo_inicial…) continua
  // válido, e recusar o pedido inteiro por um campo que a tela nem mostra a
  // essa pessoa seria pior do que ignorá-lo.
  if ("icone" in corpo && eu.poderes.config) patch.icone = texto(corpo.icone);

  // Limite, cartão pendurado no banco, bandeira e os quatro finais: pacote à
  // parte, porque entraram num SQL que o dono roda à mão.
  const extras = camposNovosDaConta(corpo);

  const { error } = await comTolerancia(
    async (novos) => await db.from("fin_contas").update({ ...patch, ...novos }).eq("id", linha.id),
    extras,
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  const mudouAtiva = typeof patch.ativa === "boolean" && patch.ativa !== linha.ativa;
  await auditar({
    empresa_id: linha.empresa_id, entidade: "conta", entidade_id: linha.id,
    acao: mudouAtiva ? (patch.ativa ? "reativar" : "inativar") : "editar",
    user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: {
      antes: { nome: linha.nome, tipo: linha.tipo, inclui_no_saldo: linha.inclui_no_saldo, ativa: linha.ativa },
      depois: patch,
    },
  });

  return NextResponse.json({ ok: true });
}
