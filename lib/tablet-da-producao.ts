import type { SupabaseClient } from "@supabase/supabase-js";

// O tablet onde a atividade cai quando quem manda não escolheu nenhum.
//
// A fábrica tem UM tablet de atividades (o da Produção). O PC não mostrava o
// seletor "Onde cai" — e sem ele a atividade dirigida nascia com
// mesa_alvo = null, que o /api/device/pull trata como "só no sistema": nunca
// tocava no tablet. Agora o servidor preenche sozinho: o tablet ativo do setor
// Produção (tipo ≠ ponto); sem nenhum marcado como Produção, o único ativo.
// Havendo vários sem desempate, devolve null e o comportamento antigo vale.
export async function tabletDaProducao(db: SupabaseClient): Promise<string | null> {
  const sel = (cols: string) => db.from("devices").select(cols).eq("ativo", true).limit(50);
  let r = await sel("nome_mesa,setor,tipo");
  if (r.error && /column|schema cache/i.test(r.error.message)) r = await sel("nome_mesa,setor");
  if (r.error) return null;
  return escolherTabletDaProducao((r.data ?? []) as unknown as TabletAtivo[]);
}

export type TabletAtivo = { nome_mesa: string | null; setor?: string | null; tipo?: string | null };

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export function escolherTabletDaProducao(devices: TabletAtivo[]): string | null {
  const validos = devices.filter((d) => d.nome_mesa && d.tipo !== "ponto");
  const nomes = (l: TabletAtivo[]) => [...new Set(l.map((d) => d.nome_mesa as string))];
  const daProducao = nomes(validos.filter((d) => norm(d.setor) === "producao"));
  if (daProducao.length >= 1) return daProducao[0];
  const todos = nomes(validos);
  return todos.length === 1 ? todos[0] : null;
}
