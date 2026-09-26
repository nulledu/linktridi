// ── Identidade anônima de quem visita a vitrine ──────────────────────────────
// Roda no MIDDLEWARE, que é o único lugar do caminho de uma página que pode
// gravar cookie. Três cookies, todos primários e todos sem nada que aponte pra
// uma pessoa:
//
//   lv  visitante   1 ano    · separa "duas visitas" de "duas pessoas"
//   ls  sessão      30 min   · janela deslizante; leva junto a ORIGEM da sessão
//   la  atribuição  30 dias  · a origem da PRIMEIRA visita, pra creditar a venda
//
// ── Por que a origem viaja DENTRO do cookie de sessão ────────────────────────
// A origem é classificada uma vez, quando a sessão nasce, e é carregada por
// todas as visualizações dela. Reclassificar a cada página daria "Instagram" na
// primeira e "direto" nas seguintes (o referrer passa a ser a própria loja) — e
// aí a mesma sessão seria contada em dois canais no relatório, inflando os dois.
//
// ── E por que o robô nem ganha cookie ────────────────────────────────────────
// Como a contagem é no servidor (ver `lib/lojas-analytics.ts`), robô e prefetch
// chegam aqui. Barrá-los ANTES da identidade evita criar sessão pra quem não
// existe: um rastreador que passa por 200 páginas viraria 200 sessões novas.

import { type NextRequest, NextResponse } from "next/server";
import {
  classificarOrigem, ehPrefetch, ehRobo, lerAtribuicao, serializarAtribuicao,
  COOKIE_ATRIBUICAO, COOKIE_SESSAO, COOKIE_VISITANTE,
  INATIVIDADE_DA_SESSAO_MS, VALIDADE_DA_ATRIBUICAO_MS, VALIDADE_DO_VISITANTE_MS,
  type Origem,
} from "./lojas-analytics";

/** Cabeçalhos que o middleware injeta e a página lê. */
export const CAB = {
  visitante: "x-lj-visitante",
  sessao: "x-lj-sessao",
  novo: "x-lj-novo",
  primeira: "x-lj-primeira",
  canal: "x-lj-canal",
  fonte: "x-lj-fonte",
  campanha: "x-lj-campanha",
} as const;

/** `/l`, `/l/loja`, `/l/loja/produto`. Não pega `/lojas` nem `/login`. */
export function ehCaminhoDeVitrine(path: string): boolean {
  return path === "/l" || path.startsWith("/l/");
}

/** `uuid|canal|fonte|campanha` → as duas partes. */
function lerSessao(bruto: string | undefined): { id: string; origem: Origem } | null {
  const s = (bruto || "").trim();
  if (!s) return null;
  const [id, ...resto] = s.split("|");
  // O uuid tem 36 caracteres; qualquer outra coisa é cookie mexido à mão.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const origem = lerAtribuicao(resto.join("|")) ?? { canal: "direto" as const, fonte: null, campanha: null, referencia: null };
  return { id, origem };
}

const uuid = (): string =>
  // `crypto.randomUUID` existe no runtime de edge. O caminho de baixo é só pro
  // ambiente de teste, onde o global pode não estar montado.
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-0000-4000-8000-${Math.floor(Math.random() * 1e12).toString(16).padStart(12, "0")}`.slice(0, 36);

export interface Identidade {
  visitante: string;
  sessao: string;
  /** Primeira sessão DESTE visitante — é o que separa novo de recorrente. */
  novo: boolean;
  /** Primeira visualização DESTA sessão. */
  primeira: boolean;
  origem: Origem;
  /** A atribuição de primeiro toque, já resolvida. */
  atribuicao: Origem;
}

/**
 * Resolve (ou cria) a identidade a partir dos cookies da requisição.
 *
 * PURA em relação ao tempo e ao acaso só até onde dá: gera uuid quando falta.
 * Devolve o que gravar; quem grava é `aplicarIdentidade`.
 */
export function resolverIdentidade(
  cookies: { visitante?: string; sessao?: string; atribuicao?: string },
  referrer: string | null,
  parametros: URLSearchParams,
  hostDaLoja: string | null,
): Identidade {
  const visitanteAntigo = (cookies.visitante || "").trim();
  const visitante = /^[0-9a-f-]{36}$/i.test(visitanteAntigo) ? visitanteAntigo : uuid();
  const novo = visitante !== visitanteAntigo;

  const sessaoAntiga = lerSessao(cookies.sessao);
  const daVisita = classificarOrigem(referrer, parametros, hostDaLoja);

  const sessao = sessaoAntiga?.id ?? uuid();
  const primeira = !sessaoAntiga;
  const origem = sessaoAntiga?.origem ?? daVisita;

  // Primeiro toque: grava quando não existe. E SOBE quando o que estava lá era
  // "direto" e agora se sabe de onde veio — "direto" quer dizer "não sei", e
  // uma origem conhecida vale mais que um desconhecimento anterior. O contrário
  // não vale: uma visita direta depois do anúncio não apaga o anúncio.
  const guardada = lerAtribuicao(cookies.atribuicao);
  const atribuicao =
    !guardada ? daVisita
    : guardada.canal === "direto" && daVisita.canal !== "direto" ? daVisita
    : guardada;

  return { visitante, sessao, novo, primeira, origem, atribuicao };
}

/**
 * Monta a resposta do middleware: cookies gravados e cabeçalhos injetados.
 *
 * Os cabeçalhos são SEMPRE escritos, mesmo quando não há o que contar. Se
 * fossem escritos só às vezes, um `x-lj-visitante` forjado por quem chamasse a
 * URL na mão atravessaria até a página e viraria uma linha no relatório do
 * lojista.
 */
export function respostaComIdentidade(request: NextRequest, hostDaLoja: string | null): NextResponse {
  const cabecalhos = new Headers(request.headers);
  for (const nome of Object.values(CAB)) cabecalhos.delete(nome);

  const contavel = !ehRobo(request.headers.get("user-agent")) && !ehPrefetch(request.headers);
  if (!contavel) {
    // Robô e prefetch seguem viagem sem identidade: a página vê os cabeçalhos
    // vazios e não registra nada.
    return NextResponse.next({ request: { headers: cabecalhos } });
  }

  const id = resolverIdentidade(
    {
      visitante: request.cookies.get(COOKIE_VISITANTE)?.value,
      sessao: request.cookies.get(COOKIE_SESSAO)?.value,
      atribuicao: request.cookies.get(COOKIE_ATRIBUICAO)?.value,
    },
    request.headers.get("referer"),
    request.nextUrl.searchParams,
    hostDaLoja,
  );

  cabecalhos.set(CAB.visitante, id.visitante);
  cabecalhos.set(CAB.sessao, id.sessao);
  cabecalhos.set(CAB.novo, id.novo ? "1" : "0");
  cabecalhos.set(CAB.primeira, id.primeira ? "1" : "0");
  cabecalhos.set(CAB.canal, id.origem.canal);
  if (id.origem.fonte) cabecalhos.set(CAB.fonte, id.origem.fonte);
  if (id.origem.campanha) cabecalhos.set(CAB.campanha, id.origem.campanha);

  const resposta = NextResponse.next({ request: { headers: cabecalhos } });

  const seguro = (request.headers.get("x-forwarded-proto") || request.nextUrl.protocol).includes("https");
  // `lax` e não `strict`: com `strict` o cookie não viaja quando a pessoa chega
  // de um link do Instagram, e TODA visita de campanha nasceria sem sessão.
  const base = { httpOnly: true, sameSite: "lax" as const, secure: seguro, path: "/" };

  resposta.cookies.set(COOKIE_VISITANTE, id.visitante, { ...base, maxAge: VALIDADE_DO_VISITANTE_MS / 1000 });
  // Regravado a cada visualização: é o que faz a janela DESLIZAR. Sem isso a
  // sessão morreria 30 minutos depois de começar, mesmo com a pessoa navegando.
  resposta.cookies.set(
    COOKIE_SESSAO,
    [id.sessao, id.origem.canal, id.origem.fonte ?? "", id.origem.campanha ?? ""].join("|"),
    { ...base, maxAge: INATIVIDADE_DA_SESSAO_MS / 1000 },
  );
  resposta.cookies.set(COOKIE_ATRIBUICAO, serializarAtribuicao(id.atribuicao), {
    ...base, maxAge: VALIDADE_DA_ATRIBUICAO_MS / 1000,
  });

  return resposta;
}
