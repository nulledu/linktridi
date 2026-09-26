// ── De que BM é cada conta de anúncios ──────────────────────────────────────
// O Graph não guarda isso em lugar nenhum do nosso banco: a BM (Business
// Manager) só aparece pedindo `business{id,name}` em /me/adaccounts. Como o
// vínculo conta→BM quase nunca muda, a resposta fica em cache por 30 min — o
// widget de gasto por BM é lido a cada troca de período e não pode virar uma
// ida ao Facebook por clique.
//
// Token sem `business_management` faz o Graph recusar o campo inteiro (erro
// #100), e aí a lista voltaria VAZIA — pior que não ter BM. Por isso a segunda
// tentativa pede só account_id/name: todas as contas continuam aparecendo,
// agrupadas em "Sem BM".
import { getAllTokens } from "@/lib/meta-tokens";
import { cached } from "@/lib/cache";

const GRAPH = "https://graph.facebook.com/v21.0";
const TTL_MS = 30 * 60_000;

export interface ContaBM {
  id: string;        // account_id (sem o prefixo act_)
  nome: string;
  bmId: string | null;
  bmNome: string | null;
}

interface Linha { account_id?: string; name?: string; business?: { id?: string; name?: string } | null }

async function gj(url: string): Promise<{ data?: unknown; error?: unknown; paging?: { next?: string } }> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return (await r.json()) as { data?: unknown; error?: unknown; paging?: { next?: string } };
  } catch (e) {
    return { error: e };
  }
}

// Segue paging.next (quem tem muitas contas via BM não cabe numa página só).
async function paginar(primeira: string): Promise<Linha[] | null> {
  const resp = await gj(primeira);
  if (resp.error || !Array.isArray(resp.data)) return null;
  const linhas = [...(resp.data as Linha[])];
  let next = resp.paging?.next;
  for (let i = 0; next && i < 20; i++) {
    const pag = await gj(next);
    if (pag.error || !Array.isArray(pag.data)) break;
    linhas.push(...(pag.data as Linha[]));
    next = pag.paging?.next;
  }
  return linhas;
}

async function buscar(): Promise<ContaBM[]> {
  const tokens = await getAllTokens();
  if (!tokens.length) return [];
  const mapa = new Map<string, ContaBM>();
  await Promise.all(tokens.map(async (token) => {
    const base = `${GRAPH}/me/adaccounts?limit=500&access_token=${encodeURIComponent(token)}`;
    const linhas =
      (await paginar(`${base}&fields=account_id,name,business{id,name}`)) ??
      (await paginar(`${base}&fields=account_id,name`)) ??
      [];
    for (const a of linhas) {
      const id = String(a.account_id ?? "").replace(/^act_/, "");
      if (!id) continue;
      const atual = mapa.get(id);
      const bmId = a.business?.id ? String(a.business.id) : null;
      // Uma conta vista por dois perfis conta uma vez; se um deles enxerga a BM
      // e o outro não, fica a informação mais completa.
      if (!atual) mapa.set(id, { id, nome: a.name?.trim() || `Conta ${id}`, bmId, bmNome: a.business?.name?.trim() || null });
      else if (!atual.bmId && bmId) { atual.bmId = bmId; atual.bmNome = a.business?.name?.trim() || null; }
    }
  }));
  return [...mapa.values()];
}

export function contasComBM(): Promise<ContaBM[]> {
  return cached("meta:contas-bm", TTL_MS, buscar);
}
