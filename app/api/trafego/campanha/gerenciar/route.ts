import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { listAccounts } from "@/lib/meta";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GRAPH = "https://graph.facebook.com/v21.0";

// Ações que ALTERAM a campanha na Meta (dinheiro real). Gate na sub-permissão
// `trafego:gerenciar`, que é `sensivel` — não vem por migração, o admin liga.
type Acao = "pausar" | "ativar" | "orcamento";
// Nível do objeto na Meta. Pausar/ativar vale pros 3; orçamento só campanha/conjunto.
type NodeTipo = "campaign" | "adset" | "ad";

// A Meta trabalha o orçamento em CENTAVOS. Mandar 50 aqui significa R$ 0,50,
// não R$ 50 — por isso a conversão é explícita e o limite é validado em reais.
const ORCAMENTO_MIN_BRL = 6;        // piso da Meta pra orçamento diário
const ORCAMENTO_MAX_BRL = 10_000;   // trava nossa: erro de digitação não vira rombo

function mensagemDaMeta(j: unknown): string {
  const e = (j as { error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string } })?.error;
  if (!e) return "Erro desconhecido na Meta.";
  // fbtrace_id ajuda o suporte da Meta. NUNCA incluir token na mensagem.
  return [e.message, e.code ? `code ${e.code}` : "", e.fbtrace_id ? `trace ${e.fbtrace_id}` : ""]
    .filter(Boolean).join(" · ").slice(0, 400);
}

// GET ?campaignId&accountId → estado atual (status + orçamento diário) de UMA
// campanha, sob demanda — quando o gestor abre os controles. Buscar isso pra
// tabela inteira seria N+1 no Graph; uma campanha por clique é barato.
export async function GET(req: NextRequest) {
  const me = await getProfileForModule("trafego:gerenciar");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const campaignId = (sp.get("campaignId") || "").trim();
  const accountId = (sp.get("accountId") || "").trim();
  if (!campaignId || !accountId) return NextResponse.json({ error: "parametros_obrigatorios" }, { status: 400 });

  const contas = await listAccounts();
  const alvo = contas.find((c) => String(c.account_id).replace(/^act_/, "") === accountId.replace(/^act_/, ""));
  if (!alvo) return NextResponse.json({ error: "conta_nao_encontrada" }, { status: 400 });

  try {
    const r = await fetch(`${GRAPH}/${campaignId}?fields=name,status,effective_status,daily_budget&access_token=${alvo.token}`, { cache: "no-store", signal: AbortSignal.timeout(PRAZO_META_MS) });
    const j = await r.json();
    if (!r.ok) return NextResponse.json({ error: "meta_erro", detalhe: mensagemDaMeta(j) }, { status: 400 });
    return NextResponse.json({
      nome: (j?.name as string) ?? null,
      status: (j?.status as string) ?? null,                       // o que foi PEDIDO (ACTIVE/PAUSED)
      effectiveStatus: (j?.effective_status as string) ?? null,    // o que está DE FATO rodando
      // Meta devolve centavos; a tela fala em reais.
      orcamentoDiarioBrl: j?.daily_budget ? Number(j.daily_budget) / 100 : null,
    });
  } catch (e) {
    if (semResposta(e)) return respostaSemMeta("A Meta não respondeu a tempo. Tente de novo em instantes.");
    return NextResponse.json({ error: "meta_indisponivel" }, { status: 502 });
  }
}

// Prazo da Graph: conexão que abre e não responde prendia a rota até o
// maxDuration. Com o sinal, a requisição solta e a tela recebe erro limpo.
const PRAZO_META_MS = 10_000;
const semResposta = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
  || (typeof DOMException !== "undefined" && e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError"));
const respostaSemMeta = (detalhe: string) => NextResponse.json({ error: "meta_sem_resposta", detalhe }, { status: 504 });

export async function POST(req: NextRequest) {
  const me = await getProfileForModule("trafego:gerenciar");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: { campaignId?: string; id?: string; accountId?: string; acao?: Acao; tipo?: NodeTipo; orcamentoBrl?: number };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const tipo: NodeTipo = b.tipo === "adset" || b.tipo === "ad" ? b.tipo : "campaign";
  const nodeId = (b.id || b.campaignId || "").trim();   // id do node (campanha/conjunto/anúncio)
  const acao = b.acao;
  if (!nodeId) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });
  if (acao !== "pausar" && acao !== "ativar" && acao !== "orcamento") {
    return NextResponse.json({ error: "acao_invalida" }, { status: 400 });
  }
  // Anúncio não tem orçamento próprio — só campanha/conjunto.
  if (acao === "orcamento" && tipo === "ad") return NextResponse.json({ error: "ad_sem_orcamento" }, { status: 400 });

  // Token da conta dona da campanha. Sem accountId não dá pra saber qual token
  // usar — e mandar o token errado vaza campanha de um cliente pro outro.
  const contas = await listAccounts();
  const alvo = b.accountId
    ? contas.find((c) => String(c.account_id).replace(/^act_/, "") === String(b.accountId).replace(/^act_/, ""))
    : null;
  if (!alvo) return NextResponse.json({ error: "conta_nao_encontrada" }, { status: 400 });

  // Estado ANTES, pra registrar o que mudou (e devolver ao cliente se falhar).
  let antes = "";
  let nome: string | null = null;
  try {
    // Anúncio não expõe daily_budget — pedir esse campo num ad dá erro no Graph.
    const fields = tipo === "ad" ? "name,status" : "name,status,daily_budget";
    const r = await fetch(`${GRAPH}/${nodeId}?fields=${fields}&access_token=${alvo.token}`, { cache: "no-store", signal: AbortSignal.timeout(PRAZO_META_MS) });
    const j = await r.json();
    if (!r.ok) return NextResponse.json({ error: "meta_erro", detalhe: mensagemDaMeta(j) }, { status: 400 });
    nome = (j?.name as string) ?? null;
    antes = acao === "orcamento" ? String(j?.daily_budget ?? "") : String(j?.status ?? "");
  } catch (e) {
    // Leitura do estado não voltou: nada foi pedido à Meta ainda.
    if (semResposta(e)) return respostaSemMeta("A Meta não respondeu a tempo. Nada foi alterado.");
    return NextResponse.json({ error: "meta_indisponivel" }, { status: 502 });
  }

  // Monta a alteração.
  const corpo = new URLSearchParams();
  let depois = "";
  if (acao === "orcamento") {
    const brl = Number(b.orcamentoBrl);
    if (!Number.isFinite(brl) || brl < ORCAMENTO_MIN_BRL || brl > ORCAMENTO_MAX_BRL) {
      return NextResponse.json({ error: "orcamento_invalido", min: ORCAMENTO_MIN_BRL, max: ORCAMENTO_MAX_BRL }, { status: 400 });
    }
    depois = String(Math.round(brl * 100));   // reais → centavos
    corpo.set("daily_budget", depois);
  } else {
    depois = acao === "pausar" ? "PAUSED" : "ACTIVE";
    corpo.set("status", depois);
  }
  corpo.set("access_token", alvo.token);

  let ok = false, erro: string | null = null, incerto = false;
  try {
    const r = await fetch(`${GRAPH}/${nodeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corpo.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(PRAZO_META_MS),
    });
    const j = await r.json();
    ok = r.ok && j?.success !== false;
    if (!ok) erro = mensagemDaMeta(j);
  } catch (e) {
    // Escrita sem resposta: a Meta pode ter aplicado ou não.
    incerto = semResposta(e);
    erro = incerto ? "A Meta não respondeu a tempo; o resultado é incerto." : "Não foi possível falar com a Meta.";
  }

  // Registra SEMPRE — inclusive a tentativa que falhou. Registro é o que
  // responde "quem pausou a campanha que vendia?".
  try {
    const db = createSupabaseAdminClient();
    await db.from("meta_acoes_campanha").insert({
      ad_account_id: String(alvo.account_id).replace(/^act_/, ""),
      // campaign_id/name mantidos (coluna NOT NULL + compat); node_* dizem o nível real.
      campaign_id: nodeId, campaign_name: nome,
      node_tipo: tipo, node_id: nodeId, node_name: nome,
      acao, valor_antes: antes, valor_depois: ok ? depois : null,
      ok, erro, autor_id: me.id, autor_nome: me.name || me.username || null,
    });
  } catch { /* tabela/colunas ainda não criadas: a ação na Meta já valeu, não derruba */ }

  if (incerto) return respostaSemMeta("A Meta não respondeu a tempo e a alteração pode ou não ter sido aplicada. Confira o estado no Gerenciador de Anúncios antes de repetir.");
  if (!ok) return NextResponse.json({ error: "meta_recusou", detalhe: erro }, { status: 400 });
  return NextResponse.json({ ok: true, acao, tipo, id: nodeId, antes, depois });
}
