// ── Modo "servidor dedicado aos chats" ───────────────────────────────────────
// Quando PLAYER_API_BASE está definido, esta instância NÃO fala com o banco:
// ela pede tudo pro Gaius (Vercel) por HTTPS. Assim o servidor dos chats roda
// SEM NENHUM SEGREDO — nem a chave do Supabase, nem o token da Meta. Se alguém
// invadir aquela máquina, não encontra credencial nenhuma.
//
// Sem PLAYER_API_BASE tudo segue como sempre (lê o banco direto) — é o que a
// Vercel faz.
import { cache } from "react";
import { NextResponse, type NextRequest } from "next/server";
import { getBotPublicado, getPaginaPublicada, raizDoDominio, type BotPublicado, type PaginaPublicada } from "@/lib/tridiflow-db";
import type { ProdutoTutorialPublico } from "@/lib/tridiflow-tutoriais-produtos";

export const PLAYER_API_BASE = (process.env.PLAYER_API_BASE || "").trim().replace(/\/+$/, "");
export const modoRemoto = (): boolean => PLAYER_API_BASE.length > 0;

// ── Memória do servidor dedicado (stale-while-revalidate) ──────────────────
// Sem ela, CADA visita ao funil era uma ida ao Gaius. Quando a Vercel estava
// fria a ida levava 6–8 s (o monitor marcava "Lento") e, se estourasse o
// prazo, o visitante via "Este link não está disponível" com o funil no ar.
// Agora: até FRESCO_MS a resposta sai da memória; depois disso ainda sai da
// memória (na hora) e a atualização corre por trás. Falha de rede NUNCA apaga
// o que já se sabia — só um "não existe" do Gaius (despublicou) apaga.
export const FRESCO_MS = 30_000;
export const VELHO_MS = 24 * 3600_000;
const TETO_ENTRADAS = 500;

/** O que a ida ao Gaius respondeu: achou, não existe (404) ou falhou (rede/5xx/prazo). */
export type RespostaRemota<T> = { tipo: "achou"; valor: T } | { tipo: "nao_existe" } | { tipo: "falhou" };

export function criarMemoriaRemota<T>(buscar: (chave: string) => Promise<RespostaRemota<T>>, agora: () => number = Date.now) {
  const guardado = new Map<string, { valor: T; em: number }>();
  const emVoo = new Map<string, Promise<T | null>>();

  function atualizar(chave: string): Promise<T | null> {
    const ja = emVoo.get(chave);
    if (ja) return ja;
    const p = buscar(chave).then((r) => {
      if (r.tipo === "achou") {
        guardado.delete(chave); // reinsere no fim: a ordem do Map vira "mais recente por último"
        guardado.set(chave, { valor: r.valor, em: agora() });
        if (guardado.size > TETO_ENTRADAS) guardado.delete(guardado.keys().next().value as string);
        return r.valor;
      }
      if (r.tipo === "nao_existe") { guardado.delete(chave); return null; }
      return guardado.get(chave)?.valor ?? null; // falhou: segura o que tinha
    }).catch(() => guardado.get(chave)?.valor ?? null)
      .finally(() => emVoo.delete(chave));
    emVoo.set(chave, p);
    return p;
  }

  return async function ler(chave: string): Promise<T | null> {
    const g = guardado.get(chave);
    if (!g) return atualizar(chave);
    const idade = agora() - g.em;
    if (idade < FRESCO_MS) return g.valor;
    if (idade < VELHO_MS) { void atualizar(chave); return g.valor; }
    return atualizar(chave);
  };
}

async function buscarNoGaius<T>(caminho: string, campo: string): Promise<RespostaRemota<T>> {
  try {
    const r = await fetch(`${PLAYER_API_BASE}${caminho}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (r.status === 404) return { tipo: "nao_existe" };
    if (!r.ok) return { tipo: "falhou" };
    const j = (await r.json()) as Record<string, T | undefined>;
    return j?.[campo] ? { tipo: "achou", valor: j[campo] as T } : { tipo: "nao_existe" };
  } catch {
    return { tipo: "falhou" };
  }
}

const botNaMemoria = criarMemoriaRemota<BotPublicado>((chave) => buscarNoGaius(`/api/f/bot?${chave}`, "bot"));
const paginaNaMemoria = criarMemoriaRemota<PaginaPublicada>((chave) => buscarNoGaius(`/api/f/pagina?${chave}`, "pagina"));

// Resolve o bot publicado: remoto (via Gaius) ou local (banco).
// `cache()` do React: a página e o `generateMetadata` pedem o MESMO bot na
// mesma requisição — sem isto eram duas idas (no servidor dos chats, duas
// chamadas HTTPS ao Gaius) pra montar uma tela só.
export const resolverBotPublicado = cache(async function resolverBotPublicado(host: string, slug: string): Promise<BotPublicado | null> {
  if (!modoRemoto()) return getBotPublicado(host, slug).catch(() => null);
  return botNaMemoria(`host=${encodeURIComponent(host)}&slug=${encodeURIComponent(slug)}`);
});

// Idem para PÁGINA publicada (landing e Central de Tutoriais). Sem isto, o
// servidor dedicado respondia "link indisponível" em /p/<slug>: ele não tem
// banco, e a página lia o banco direto.
export async function resolverPaginaPublicada(host: string | null, slug: string): Promise<PaginaPublicada | null> {
  if (!modoRemoto()) return getPaginaPublicada(host, slug).catch(() => null);
  return paginaNaMemoria(`host=${encodeURIComponent(host || "")}&slug=${encodeURIComponent(slug)}`);
}

// Idem para a RAIZ do domínio (`/`). Sem isto, `/` num domínio próprio servido
// pelo espelho não tem como saber o que mostrar — não há banco daquele lado.
export async function resolverRaizDoDominio(host: string | null): Promise<string | null> {
  if (!modoRemoto()) return raizDoDominio(host).catch(() => null);
  try {
    const u = `${PLAYER_API_BASE}/api/f/raiz?host=${encodeURIComponent(host || "")}`;
    const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { caminho?: string };
    // Só caminho relativo: um `caminho` absoluto viraria redirect aberto se um
    // dia a resposta viesse de outro lugar que não o Gaius.
    const c = j?.caminho ?? "";
    return c.startsWith("/") && !c.startsWith("//") ? c : null;
  } catch { return null; }
}

// Conta uma métrica da central: local vai direto ao banco; no servidor
// dedicado (sem credencial) a contagem viaja pro Gaius pela rota pública.
export async function registrarMetricaRemota(botId: string, handle: string, campo: import("@/lib/tridiflow-tutoriais-metricas").CampoMetrica): Promise<void> {
  try {
    if (!modoRemoto()) {
      const { registrarMetricaTutorial } = await import("@/lib/tridiflow-tutoriais-metricas");
      await registrarMetricaTutorial(botId, handle, campo);
      return;
    }
    await fetch(`${PLAYER_API_BASE}/api/p/tutorial-metrica`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botId, handle, campo }), signal: AbortSignal.timeout(4000),
    });
  } catch { /* contar nunca derruba a página */ }
}

// Cartões de produto de um tutorial — mesma história: consulta ao banco vira
// pergunta ao Gaius quando o servidor não tem credencial.
export async function resolverProdutosTutoriais(ids: string[]): Promise<ProdutoTutorialPublico[]> {
  const limpos = [...new Set(ids.filter(Boolean))].slice(0, 100);
  if (!limpos.length) return [];
  if (!modoRemoto()) {
    const { buscarProdutosTutoriais } = await import("@/lib/tridiflow-tutoriais-produtos");
    return buscarProdutosTutoriais(limpos).catch(() => []);
  }
  try {
    const r = await fetch(`${PLAYER_API_BASE}/api/f/tutorial-produtos?ids=${encodeURIComponent(limpos.join(","))}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { produtos?: ProdutoTutorialPublico[] };
    return j?.produtos ?? [];
  } catch { return []; }
}

/** GET encaminhado pro Gaius, com a query intacta. É o que deixa o servidor
 *  sem banco (gedux) responder rotas de leitura pública como o catálogo. */
export async function encaminharGet(req: NextRequest, caminho: string): Promise<NextResponse> {
  try {
    const r = await fetch(`${PLAYER_API_BASE}${caminho}${req.nextUrl.search}`, {
      cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    return new NextResponse(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch {
    // Catálogo fora do ar não pode derrubar a central: a lista chega vazia.
    return NextResponse.json({ produtos: [] });
  }
}

// Encaminha a chamada do player pro Gaius, preservando quem é o VISITANTE.
// Sem repassar user-agent e IP, a Meta receberia os dados do servidor em vez
// dos do lead — e a atribuição do anúncio ficaria errada.
export async function encaminharPara(req: NextRequest, caminho: string): Promise<NextResponse> {
  const corpo = await req.text();
  const ipCliente = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  try {
    const r = await fetch(`${PLAYER_API_BASE}${caminho}`, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.get("user-agent") ? { "user-agent": req.headers.get("user-agent")! } : {}),
        ...(ipCliente ? { "x-forwarded-for": ipCliente } : {}),
      },
      body: corpo,
      signal: AbortSignal.timeout(8000),
    });
    const txt = await r.text();
    return new NextResponse(txt || "{}", { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch {
    // Gaius fora do ar / rede ruim: não derruba o chat do visitante.
    return NextResponse.json({ ok: false, offline: true }, { status: 200 });
  }
}
