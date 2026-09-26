import { NextResponse, type NextRequest } from "next/server";
import { cached } from "@/lib/cache";
import { encaminharPara, modoRemoto } from "@/lib/player-remoto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ehCentralTutoriais, normalizarCentralTutoriais } from "@/lib/tridiflow-tutoriais";
import { ehCampoMetrica, registrarMetricaTutorial } from "@/lib/tridiflow-tutoriais-metricas";

export const dynamic = "force-dynamic";

// Contadores da página de leitura: o "isso ajudou?", o motivo do "não
// resolveu", o toque no WhatsApp — e a vista, quando vem do servidor sem banco.
//
// PÚBLICO e sem identificação: o que se guarda é um CONTADOR por dia, nunca
// quem votou. Por isso não há nada a proteger com sessão — e por isso também
// não dá para "consultar o voto de alguém": ele não existe.
//
// O servidor dedicado (gedux) não tem banco: ali a chamada é ENCAMINHADA pro
// Gaius com o mesmo corpo, igual ao resto do player. O encaminhamento vem
// antes da checagem do campo, então um gedux com código antigo já repassa os
// campos novos sem deploy.

// O id da central é a chave (uuid) de `tridiflow_bots`, e o handle sai do
// `slug()` do modelo: minúsculas, dígitos e hífen, até 120. Fora disso não é
// guia de ninguém — e um id que não é uuid faria a consulta abaixo errar e
// sujar o log a cada pedido anônimo.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE = /^[a-z0-9-]{1,120}$/;

/** O id não é de uma central no ar. */
class SemCentral extends Error {}

// Só conta guia PUBLICADO no snapshot que a página pública lê — o mesmo
// critério do `buscar()` de /p/[slug]/[tutorial]. Sem isto o id da central
// (que vai no HTML) bastava pra criar uma linha por handle inventado: a
// tabela crescia sem teto e, como o editor lê por ordem de handle até um teto
// de linhas, 20 mil "0001…" empurravam os guias reais pra fora da janela —
// eles apareciam sem leituras e sem votos.
//
// `status = publicado` na consulta porque tirar do ar só troca o status: o
// snapshot antigo continua gravado. E os handles passam pela mesma
// normalização da página, senão um guia legado deixaria de contar.
async function lerHandlesPublicados(botId: string): Promise<Set<string>> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("tridiflow_bots")
    .select("config:published->pagina->config")
    .eq("id", botId).eq("status", "publicado").eq("tipo", "page").limit(1);
  // O supabase-js devolve o erro em vez de lançar: sem o throw, um timeout
  // ficaria guardado como "central sem guias" pelo prazo inteiro do cache.
  if (error) throw new Error(error.message);
  const [l] = (data ?? []) as unknown as { config: { template?: string; centralTutoriais?: unknown } | null }[];
  // Central que não está no ar REJEITA em vez de devolver lista vazia: o
  // `cached()` descarta promessa rejeitada, então o id inventado não vira
  // entrada. A chave sai do corpo de um pedido anônimo — guardando o "não
  // existe", uuids aleatórios encheriam o cache (teto de 500, dividido com o
  // resto do app) e despejariam o que está quente nele.
  if (!l || !ehCentralTutoriais(l.config)) throw new SemCentral();
  const { tutoriais } = normalizarCentralTutoriais(l.config?.centralTutoriais);
  return new Set(tutoriais.filter((t) => t.status === "publicado").map((t) => t.handle));
}

// Uma leitura por minuto por central, e não uma por voto. A chave mora sob
// `bot-pub:` de propósito: salvar, publicar ou tirar do ar nesta instância
// limpa esse prefixo na hora (tridiflow-db, tridiflow-tutoriais-db); nas
// outras vale o prazo — no pior caso, o voto num guia recém-publicado se
// perde no primeiro minuto.
const handlesPublicados = (botId: string) =>
  cached(`bot-pub:tutoriais-handles:${botId.toLowerCase()}`, 60_000, () => lerHandlesPublicados(botId));

export async function POST(req: NextRequest) {
  if (modoRemoto()) return encaminharPara(req, "/api/p/tutorial-metrica");
  // `?? {}`: corpo "null" é JSON válido e derrubaria a desestruturação num 500.
  const b = ((await req.json().catch(() => null)) ?? {}) as { botId?: unknown; handle?: unknown; campo?: unknown };
  const { botId, handle, campo } = b;
  // Lista fechada (a mesma da função do banco): campo inventado para aqui,
  // antes de gastar uma ida ao banco. Id e handle fora do formato também.
  if (typeof botId !== "string" || !UUID.test(botId) || typeof handle !== "string" || !HANDLE.test(handle) || !ehCampoMetrica(campo)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const publicados = await handlesPublicados(botId).catch((e: unknown) => {
    // Banco fora: a soma também falharia. Só a falha de verdade vai pro log —
    // uma consulta quebrada pararia toda contagem sem ninguém ver.
    if (!(e instanceof SemCentral)) console.error("[tutoriais] conferir guia da métrica:", e instanceof Error ? e.message : e);
    return null;
  });
  // Handle no formato que não é guia publicado desta central não grava, mas
  // também não é erro: a aba pode ter ficado aberta enquanto o guia saiu do
  // ar ou mudou de endereço.
  if (publicados?.has(handle)) await registrarMetricaTutorial(botId, handle, campo);
  // Sempre 200: contar é acessório, e um erro aqui não pode virar alerta na
  // cara de quem só quis dizer que o guia ajudou. Vale também pro banco sem a
  // migração dos motivos — a contagem se perde, a pessoa não fica sabendo.
  return NextResponse.json({ ok: true });
}
