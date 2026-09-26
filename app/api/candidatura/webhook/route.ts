import { NextResponse } from "next/server";
import { configCrua, listarVagas, receberCandidato, registrarErroDeRecepcao } from "@/lib/rh/curriculos/dados";
import { candidatoDoWebhook, vagaPeloTexto } from "@/lib/rh/curriculos/receber";
import { tokenConfere, tokenDaRequisicao } from "@/lib/rh/curriculos/token";

export const dynamic = "force-dynamic";

// PÚBLICO — o webhook que o TridiFlow chama ao concluir um quiz/formulário
// de candidatura. Cole a URL desta rota em "Webhook de lead" do bot, com o
// token gerado em RH → Currículos → Integração:
//
//   POST /api/candidatura/webhook
//   Authorization: Bearer rhc_…
//   { evento: "lead", bot, bot_id, sessao_id, quando, ...respostas, ...utm, tags[] }
//
// O mesmo `sessao_id` reenviado ATUALIZA o candidato em vez de duplicar.

export async function POST(req: Request) {
  const { dados: cfg, pendente } = await configCrua();
  if (pendente) return NextResponse.json({ erro: "schema_pendente" }, { status: 503 });
  if (!cfg?.webhook_token_hash) return NextResponse.json({ erro: "webhook_nao_configurado" }, { status: 503 });
  if (!tokenConfere(tokenDaRequisicao(req), cfg.webhook_token_hash)) return NextResponse.json({ erro: "token_invalido" }, { status: 401 });

  const corpo = await req.json().catch(() => null);
  const r = candidatoDoWebhook(corpo);
  if (!r.ok) {
    await registrarErroDeRecepcao(`webhook: ${r.erro}`);
    return NextResponse.json({ erro: r.erro }, { status: 400 });
  }
  const c = r.candidato;

  const { dados: vagas } = await listarVagas();
  const vaga = vagaPeloTexto(vagas.filter((v) => v.status !== "encerrada"), c.vaga_texto);
  const gravado = await receberCandidato({
    nome: c.nome, email: c.email, telefone: c.telefone, cidade: c.cidade,
    vaga_id: vaga?.id ?? cfg.vaga_padrao_id ?? null,
    origem: "tridiflow",
    origem_detalhe: c.origem_detalhe,
    externo_id: c.externo_id,
    respostas: c.respostas,
    curriculo: c.curriculo,
    dados: { ...c.dados, ...(c.vaga_texto && !vaga ? { vaga_texto: c.vaga_texto } : {}), ...(c.parcial ? { parcial: true } : {}) },
    recebido_em: c.recebido_em,
  }, "TridiFlow");

  if ("erro" in gravado) {
    await registrarErroDeRecepcao(`webhook: ${gravado.erro}`);
    return NextResponse.json({ erro: gravado.erro }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: gravado.id, novo: gravado.novo });
}
