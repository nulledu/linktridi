"use client";

// TEMPORÁRIO — rede falsa para o banco de provas.
//
// Telas como Estoque e Vendas não recebem props: elas buscam os próprios dados
// no `useEffect`. Sem sessão, a chamada falha e a tela fica presa em
// "Carregando…" — dá pra ver o cabeçalho e nada mais. E é justamente no
// conteúdo (tabela que vira card, fileira de filtros, barra de ações) que moram
// os defeitos de celular.
//
// A troca do `fetch` acontece DURANTE O RENDER, não num efeito: os efeitos dos
// filhos rodam antes dos do pai, então um `useEffect` aqui chegaria tarde e a
// primeira busca já teria saído pela rede de verdade.
//
// Nada disto vaza pra produção: o arquivo só é importado por `/dev-mobile`, que
// tem `notFound()` fora de desenvolvimento.
import { useState } from "react";

type Resposta = Record<string, unknown>;

/** O que um `handler` devolve: corpo e, quando o caso é de recusa, o status. */
export interface RespostaFalsa { status?: number; corpo: unknown }

/**
 * Rota SIMULADA (qualquer método, inclusive POST).
 *
 * O mapa estático acima responde só GET de propósito — um POST de "salvar" tem
 * que continuar falhando de verdade, senão a prova mentiria sobre o que
 * acontece ao gravar. Mas há fluxos cujo MIOLO é o POST: a importação da
 * planilha só mostra o passo do meio ("o que vai mudar") depois de um POST, e a
 * triagem em lote só prova que classifica depois de outro. Sem simular esses
 * dois, o banco de provas nunca desenha as duas telas que mais importam.
 *
 * A regra que mantém isto honesto: o handler NÃO reimplementa a decisão. Ele
 * chama a MESMA função pura que o servidor chama (`lerPlanilha`,
 * `planejarImportacao`, `isHierarquia`) — o que fica de fora é só a persistência,
 * que aqui é um array em memória. Os números na tela são os do planejador de
 * verdade; o que a prova não cobre é o banco.
 */
export type Handler = (req: { url: string; metodo: string; corpo: unknown }) => RespostaFalsa | Promise<RespostaFalsa>;

function instalar(mapa: Record<string, Resposta>, handlers: Record<string, Handler>) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __redeFalsa?: boolean };
  if (w.__redeFalsa) return;
  w.__redeFalsa = true;
  const original = window.fetch.bind(window);
  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

  window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const metodo = (init?.method ?? "GET").toUpperCase();

    // Handlers primeiro: a chave deles é mais específica que a do mapa
    // (`/api/estoque-itens/classificar` é prefixo-irmão de `/api/estoque-itens`)
    // e a ordem de inserção do objeto é quem decide, como no REDE_ESTOQUE.
    const rota = Object.keys(handlers).find((k) => url.startsWith(k));
    if (rota) {
      let corpo: unknown = undefined;
      try { corpo = init?.body ? JSON.parse(String(init.body)) : undefined; } catch { /* não é JSON */ }
      const r = await handlers[rota]({ url, metodo, corpo });
      return json(r.corpo, r.status ?? 200);
    }

    const chave = Object.keys(mapa).find((k) => url.startsWith(k));
    // Só GET: um POST de "salvar" tem que continuar falhando de verdade, senão
    // a prova mentiria sobre o que acontece ao gravar.
    if (chave && metodo === "GET") return json(mapa[chave]);
    return original(entrada as RequestInfo, init);
  };
}

export function RedeFalsa({ mapa, handlers, children }: {
  mapa: Record<string, Resposta>;
  handlers?: Record<string, Handler>;
  children: React.ReactNode;
}) {
  useState(() => { instalar(mapa, handlers ?? {}); return null; });
  return <>{children}</>;
}
