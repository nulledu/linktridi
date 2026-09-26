// Operação › Visão geral — os números da tela, montados no servidor.
//
// Uma leitura de `atividades` (7 dias + tudo que está aberto) alimenta quatro
// blocos da tela: os cartões do topo, o gráfico da semana, as próximas e as
// últimas atividades. Separar em quatro consultas seria pagar quatro idas ao
// Supabase pela mesma tabela (lib/financeiro: latência é contagem de idas).
//
// "vs. ontem" só aparece onde ONTEM existe de verdade: peças, concluídas,
// operadores e tempo médio saem das linhas concluídas de ontem; a logística
// traz o `prev` do próprio ERP. Fila aberta (pendentes, em andamento) não tem
// foto de ontem guardada — inventar a comparação seria mentir, então ela sai
// sem seta.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { diaSP } from "@/lib/painel-producao";
import type { Hierarquia } from "@/lib/estoque-hierarquia";

export interface Comparado { valor: number; ontem: number | null }

export interface LinhaProxima {
  id: string; tarefa: string; setor: string | null; prazo: string | null;
  prioridade: "alta" | "media" | "baixa"; urgente: boolean;
}
export interface LinhaUltima {
  id: string; paraId: string | null; nome: string; fotoUrl: string | null; tarefa: string; setor: string | null;
  quando: string; status: "concluida" | "em_andamento";
}

export interface VisaoAtividades {
  pendentes: number;
  emAndamento: number;
  urgentes: number;
  impedidas: number;
  concluidas: Comparado;
  pecas: Comparado;
  operadores: Comparado;
  tmaMin: { valor: number | null; ontem: number | null };
  /** Peças concluídas por dia, 7 dias terminando hoje (SP). */
  semana: { dia: string; pecas: number }[];
  proximas: LinhaProxima[];
  ultimas: LinhaUltima[];
}

export interface VisaoEstoque {
  total: number;
  /** Itens ativos por grupo de hierarquia, na ordem da tela. */
  grupos: { rotulo: string; itens: number }[];
}

interface Linha {
  id: string; tarefa: string | null; setor: string | null; categoria: string | null;
  status: string | null; urgente: boolean | null; impedida: boolean | null;
  prioridade?: string | null; prazo: string | null;
  quantidade_feita: number | null; quantidade_alvo: number | null;
  para_id: string | null; para_nome: string | null;
  iniciada_at: string | null; concluida_at: string | null; created_at: string | null;
}

const COLS = "id,tarefa,setor,categoria,status,urgente,impedida,prazo,quantidade_feita,quantidade_alvo,para_id,para_nome,iniciada_at,concluida_at,created_at";

function desdeSP(agora: Date, diasAtras: number): string {
  const s = new Date(agora.getTime() - 3 * 3600 * 1000);
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() - diasAtras, 3, 0, 0)).toISOString();
}

function minutos(inicio: string | null, fim: string | null): number | null {
  if (!inicio || !fim) return null;
  const m = (new Date(fim).getTime() - new Date(inicio).getTime()) / 60000;
  // Mesmo teto do painel da TV: ordem esquecida aberta não vira TMA de 3 dias.
  return m > 0 && m <= 12 * 60 ? m : null;
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const PESO: Record<string, number> = { alta: 0, media: 1, baixa: 2 };

/** A conta, pura — o teste bate aqui. */
export function montarVisaoAtividades(linhas: Linha[], agora = new Date()): VisaoAtividades {
  const hoje = diaSP(agora);
  const ontem = diaSP(new Date(agora.getTime() - 86_400_000));
  const semanaDias = Array.from({ length: 7 }, (_, i) => diaSP(new Date(agora.getTime() - (6 - i) * 86_400_000)));
  const pecasPorDia = new Map(semanaDias.map((d) => [d, 0]));

  let pendentes = 0, emAndamento = 0, urgentes = 0, impedidas = 0;
  const dia = { [hoje]: { conc: 0, pecas: 0, ops: new Set<string>(), tma: [] as number[] }, [ontem]: { conc: 0, pecas: 0, ops: new Set<string>(), tma: [] as number[] } };

  for (const l of linhas) {
    if (l.status === "concluida") {
      if (!l.concluida_at) continue;
      const d = diaSP(l.concluida_at);
      const pecas = Number(l.quantidade_feita ?? l.quantidade_alvo ?? 0) || 0;
      if (pecasPorDia.has(d)) pecasPorDia.set(d, (pecasPorDia.get(d) ?? 0) + pecas);
      const alvo = dia[d];
      if (alvo) {
        alvo.conc++; alvo.pecas += pecas;
        if (l.para_id) alvo.ops.add(l.para_id);
        const m = minutos(l.iniciada_at, l.concluida_at);
        if (m != null) alvo.tma.push(m);
      }
      continue;
    }
    if (l.status === "em_andamento") {
      emAndamento++;
      if (l.para_id) dia[hoje].ops.add(l.para_id);
    } else pendentes++;
    if (l.urgente) urgentes++;
    if (l.impedida) impedidas++;
  }

  const prio = (l: Linha): LinhaProxima["prioridade"] =>
    l.prioridade === "alta" || l.prioridade === "baixa" || l.prioridade === "media" ? l.prioridade : l.urgente ? "alta" : "media";

  // Próximas: a fila que ainda não começou, na ordem em que alguém vai pegar —
  // urgente primeiro, depois prioridade, depois prazo (sem prazo vai pro fim).
  const proximas = linhas
    .filter((l) => l.status !== "concluida" && l.status !== "em_andamento" && !l.impedida)
    .sort((a, b) =>
      Number(!!b.urgente) - Number(!!a.urgente)
      || PESO[prio(a)] - PESO[prio(b)]
      || (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999")
      || (a.created_at ?? "").localeCompare(b.created_at ?? ""))
    .slice(0, 4)
    .map((l) => ({ id: l.id, tarefa: l.tarefa || l.categoria || "Atividade", setor: l.setor, prazo: l.prazo, prioridade: prio(l), urgente: !!l.urgente }));

  // Últimas: o que ACONTECEU — concluiu ou começou —, do mais recente.
  const ultimas = linhas
    .map((l) => {
      const quando = l.status === "concluida" ? l.concluida_at : l.status === "em_andamento" ? l.iniciada_at : null;
      return quando && l.para_nome ? { l, quando } : null;
    })
    .filter((x): x is { l: Linha; quando: string } => !!x)
    .sort((a, b) => b.quando.localeCompare(a.quando))
    .slice(0, 4)
    .map(({ l, quando }) => ({
      id: l.id, paraId: l.para_id, nome: l.para_nome as string, fotoUrl: null,
      tarefa: l.tarefa || l.categoria || "Atividade", setor: l.setor, quando,
      status: l.status === "concluida" ? "concluida" as const : "em_andamento" as const,
    }));

  const h = dia[hoje], o = dia[ontem];
  return {
    pendentes, emAndamento, urgentes, impedidas,
    concluidas: { valor: h.conc, ontem: o.conc },
    pecas: { valor: h.pecas, ontem: o.pecas },
    operadores: { valor: h.ops.size, ontem: o.ops.size },
    tmaMin: { valor: media(h.tma), ontem: media(o.tma) },
    semana: semanaDias.map((d) => ({ dia: d, pecas: pecasPorDia.get(d) ?? 0 })),
    proximas, ultimas,
  };
}

export async function visaoAtividades(agora = new Date()): Promise<VisaoAtividades | null> {
  try {
    const db = createSupabaseAdminClient();
    const filtro = `status.neq.concluida,concluida_at.gte.${desdeSP(agora, 7)}`;
    // `prioridade` nasceu num SQL próprio (supabase/atividades_prioridade.sql).
    // Onde ele ainda não rodou, pedir a coluna derruba a consulta inteira —
    // então tenta com ela e, se o banco recusar, lê sem.
    let res = await db.from("atividades").select(`${COLS},prioridade`).or(filtro).limit(1000);
    if (res.error) res = await db.from("atividades").select(COLS).or(filtro).limit(1000);
    if (res.error || !res.data) return null;
    const linhas = res.data as unknown as Linha[];

    const visao = montarVisaoAtividades(linhas, agora);
    // Foto só de quem aparece em "Últimas" (até 4 pessoas), numa ida só.
    const ids = [...new Set(visao.ultimas.map((u) => u.paraId).filter(Boolean) as string[])];
    if (ids.length) {
      const { data } = await db.from("employees").select("id,photo_url").in("id", ids).limit(10);
      const fotos = new Map(((data ?? []) as { id: string; photo_url: string | null }[]).map((e) => [e.id, e.photo_url]));
      for (const u of visao.ultimas) u.fotoUrl = (u.paraId && fotos.get(u.paraId)) || null;
    }
    return visao;
  } catch {
    return null;
  }
}

/** Os grupos da rosca: as 8 hierarquias viram 4 fatias legíveis. */
const GRUPOS: { rotulo: string; de: Hierarquia[] }[] = [
  { rotulo: "Produtos", de: ["produto"] },
  { rotulo: "Peças", de: ["peca", "componente", "mp_processada"] },
  { rotulo: "Insumos", de: ["materia_prima", "insumo_direto", "insumo_indireto"] },
  { rotulo: "Embalagens", de: ["embalagem"] },
];

export async function visaoEstoque(): Promise<VisaoEstoque | null> {
  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("estoque_itens").select("hierarquia").eq("ativo", true).limit(5000);
    if (error || !data) return null;
    const conta = new Map<string, number>();
    for (const r of data as { hierarquia: string | null }[]) conta.set(r.hierarquia ?? "", (conta.get(r.hierarquia ?? "") ?? 0) + 1);
    const grupos = GRUPOS.map((g) => ({ rotulo: g.rotulo, itens: g.de.reduce((s, h) => s + (conta.get(h) ?? 0), 0) }));
    const semClasse = data.length - grupos.reduce((s, g) => s + g.itens, 0);
    if (semClasse > 0) grupos.push({ rotulo: "Sem tipo", itens: semClasse });
    return { total: data.length, grupos: grupos.filter((g) => g.itens > 0) };
  } catch {
    return null;
  }
}
