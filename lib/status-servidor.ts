// Página de status — leitura NO SERVIDOR (Supabase, service role).
//
// Antes o navegador lia a API do Gatus direto na VPS, e ela era aberta:
// qualquer um via o nome de todo funil e toda a infraestrutura. Agora o coletor
// da VPS manda a foto pra `status_registrar` (supabase/status_historico.sql) e o
// Gaius lê daqui. O público recebe só "plataforma no ar / com problema"; o
// detalhe vai só pra quem tem `administracao:status`.
//
// Uma leitura a cada 30 s por instância, não importa quantas pessoas estejam
// com a página aberta (cached). Tudo com colunas nomeadas e `.limit()`.

import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached } from "@/lib/cache";
import { agrupar, type Flags, type ItemStatus, type Resultado } from "@/lib/status-plataformas";

export interface LinhaItem {
  key: string; nome: string; grupo: string | null; estado: string; tipo: string | null; motivo: string | null;
  ms: number | null; verificado_em: string | null; trilha: unknown;
}
export interface Incidente {
  id: number; key: string; nome: string; tipo: string | null; motivo: string | null;
  inicio: string; fim: string | null; duracao_s: number | null;
  /** Estimativa em R$ gasta em anúncio enquanto o funil estava fora. */
  custo?: number | null;
}
/** Amostras por item: boas e ruins nos últimos 7 e 30 dias. */
export interface Amostras { ok7: number; falha7: number; ok30: number; falha30: number }
export interface StatusCompleto {
  itens: ItemStatus[];
  flags: Flags | null;
  incidentes: Incidente[];
  amostras: Record<string, Amostras>;
  atualizado: string | null;
}

const INTERNO = "~ocorrencias";

/** Data (AAAA-MM-DD) em São Paulo, `desloc` dias a partir de hoje. */
export function diaSP(desloc = 0, agora = Date.now()): string {
  return new Date(agora + desloc * 864e5).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/** Linha do Supabase → formato que a tela e o `agrupar` já entendem. */
export function itemDaLinha(l: LinhaItem): ItemStatus {
  const trilha = (Array.isArray(l.trilha) ? l.trilha : []).map((v) => v === 1 || v === true);
  const ultimo: Resultado = {
    success: l.estado !== "caiu",
    timestamp: l.verificado_em ?? undefined,
    duration: l.ms != null ? l.ms * 1e6 : undefined,
    errors: l.estado === "caiu" && l.motivo ? [l.motivo] : undefined,
  };
  // Sem timestamp nos antigos: o `ordenar` do lib põe "" antes de qualquer data,
  // então o último (com data) continua sendo o último.
  const results: Resultado[] = trilha.length
    ? [...trilha.slice(0, -1).map((ok) => ({ success: ok })), ultimo]
    : [ultimo];
  return { key: l.key, name: l.nome, group: l.grupo ?? undefined, results };
}

export function somarAmostras(linhas: { key: string; dia: string; ok: number; falha: number }[], hoje = diaSP()): Record<string, Amostras> {
  const d7 = diaSP(-6, Date.parse(hoje + "T12:00:00-03:00"));
  const out: Record<string, Amostras> = {};
  for (const l of linhas) {
    const a = (out[l.key] ??= { ok7: 0, falha7: 0, ok30: 0, falha30: 0 });
    a.ok30 += l.ok; a.falha30 += l.falha;
    if (l.dia >= d7) { a.ok7 += l.ok; a.falha7 += l.falha; }
  }
  return out;
}

export function lerStatus(): Promise<StatusCompleto> {
  return cached("status:completo", 30_000, async () => {
    const db = createSupabaseAdminClient();
    const desde30 = diaSP(-29);
    const desdeInc = new Date(Date.now() - 30 * 864e5).toISOString();
    const colsDia = "key,dia,ok,falha";
    const [itensR, incR, abertosR, dia1, dia2] = await Promise.all([
      db.from("status_itens").select("key,nome,grupo,estado,tipo,motivo,ms,verificado_em,trilha").limit(300),
      db.from("status_incidentes").select("id,key,nome,tipo,motivo,inicio,fim,duracao_s").gte("inicio", desdeInc).order("inicio", { ascending: false }).limit(300),
      db.from("status_incidentes").select("id,key,nome,tipo,motivo,inicio,fim,duracao_s").is("fim", null).limit(50),
      // ~35 itens × 30 dias passa de 1000 linhas: o PostgREST corta calado, então pagina.
      db.from("status_dia").select(colsDia).gte("dia", desde30).order("dia").order("key").range(0, 999),
      db.from("status_dia").select(colsDia).gte("dia", desde30).order("dia").order("key").range(1000, 2999),
    ]);
    const linhas = (itensR.data ?? []) as LinhaItem[];
    const interno = linhas.find((l) => l.key === INTERNO);
    let flags: Flags | null = null;
    try { flags = interno?.motivo ? (JSON.parse(interno.motivo) as Flags) : null; } catch { flags = null; }
    const itens = linhas.filter((l) => l.key !== INTERNO && l.grupo !== "_interno").map(itemDaLinha);
    const porId = new Map<number, Incidente>();
    for (const i of [...((abertosR.data ?? []) as Incidente[]), ...((incR.data ?? []) as Incidente[])]) porId.set(i.id, i);
    const incidentes = [...porId.values()].sort((a, b) => b.inicio.localeCompare(a.inicio));
    const dias = [...(dia1.data ?? []), ...(dia2.data ?? [])] as { key: string; dia: string; ok: number; falha: number }[];
    const atualizado = linhas.map((l) => l.verificado_em).filter(Boolean).sort().pop() ?? null;
    return { itens, flags, incidentes, amostras: somarAmostras(dias.filter((d) => d.key !== INTERNO)), atualizado };
  });
}

/** O que o PÚBLICO vê: plataforma e estado. Nada de funil, motivo ou infra fina. */
export function visaoPublica(s: StatusCompleto) {
  return {
    publico: true as const,
    atualizado: s.atualizado,
    plataformas: agrupar(s.itens).map((g) => ({ id: g.id, nome: g.nome, desc: g.desc, estado: g.caidos.length ? "caiu" : "ok" })),
  };
}

/** Muda quando algo que a tela mostra muda — o poll comum volta `{mudou:false}`. */
export function assinaturaDoStatus(s: StatusCompleto): string {
  const partes = [
    ...s.itens.map((i) => { const r = i.results?.[i.results.length - 1]; return `${i.key}:${r?.success ? 1 : 0}:${r?.timestamp ?? ""}`; }),
    ...s.incidentes.map((i) => `${i.id}:${i.fim ?? ""}`),
  ];
  return createHash("sha1").update(partes.join("|")).digest("hex").slice(0, 16);
}
