// ── Quanto tempo a pessoa leva pra ACEITAR a atividade ───────────────────────
//
// "Mostrar o tempo entre o tablet mostrar a atividade e a pessoa aceitar —
// um tempo médio pra aceitar, no painel e de cada funcionário, gamificado."
//
// Os dois carimbos já existem na tabela `atividades`:
//   • o INÍCIO é quando a ordem apareceu no tablet DAQUELA pessoa:
//       - dirigida (nasceu com dono): `created_at` — o tablet puxa na hora;
//       - pool: `claimed_at` — antes de alguém pegar ela está na fila de
//         todos, e o tempo de fila não é de ninguém;
//   • o FIM é `aceita_at` — o toque em "Aceitar" (supabase/atividades_ordens_v2.sql).
//
// O que NÃO entra, e por quê (cada descarte é contado, nunca vira zero calado):
//   • sem aceite ainda — não há o que medir;
//   • pegou pelo site — no site pegar É aceitar, os dois carimbos são o mesmo
//     instante, e um zero desses daria "Relâmpago" pra quem nem viu o tablet;
//   • virou o dia (SP) — ordem criada às 17h50 e aceita às 8h: 14 horas de
//     "demora" que são a noite, não a pessoa;
//   • relógio invertido — aceite antes da criação.
//
// O número da frente é MEDIANA, pelo mesmo motivo de `atividades-tempo.ts`:
// uma ordem esquecida na hora do almoço não pode definir o ritmo de alguém que
// aceita tudo em 40 segundos.
//
// Módulo PURO: sem banco, sem React.
import { mediana } from "@/lib/atividades-tempo";

export interface AtividadeAceite {
  id: string;
  para_id: string | null;
  para_nome: string | null;
  pool?: boolean | null;
  status?: string | null;
  created_at: string;
  claimed_at?: string | null;
  aceita_at?: string | null;
}

export type MotivoForaDoAceite = "sem_aceite" | "pelo_site" | "virou_o_dia" | "relogio_invertido";

/** Mínimo de aceites pra alguém entrar no ranking — um aceite só é sorte. */
export const MIN_ACEITES = 3;

/** Dia civil em São Paulo (UTC-3, sem horário de verão desde 2019). */
const diaSP = (ms: number) => new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 10);

/** Minutos até aceitar, ou o motivo de não entrar na conta. */
export function minutosParaAceitar(a: AtividadeAceite): { ok: true; min: number } | { ok: false; motivo: MotivoForaDoAceite } {
  if (!a.aceita_at) return { ok: false, motivo: "sem_aceite" };
  const fim = Date.parse(a.aceita_at);
  const iniIso = a.pool ? a.claimed_at : a.created_at;
  const ini = iniIso ? Date.parse(iniIso) : NaN;
  if (!Number.isFinite(fim) || !Number.isFinite(ini)) return { ok: false, motivo: "sem_aceite" };
  if (a.pool && a.claimed_at === a.aceita_at) return { ok: false, motivo: "pelo_site" };
  if (fim < ini) return { ok: false, motivo: "relogio_invertido" };
  if (diaSP(fim) !== diaSP(ini)) return { ok: false, motivo: "virou_o_dia" };
  return { ok: true, min: (fim - ini) / 60000 };
}

// ── O selo (a parte "jogo") ─────────────────────────────────────────────────
export type Selo = "relampago" | "agil" | "no_ritmo" | "demorado";
export const SELOS: Record<Selo, { rotulo: string; icone: string; tom: "ok" | "destaque" | "neutro" | "atencao"; ate: number }> = {
  relampago: { rotulo: "Relâmpago", icone: "bolt", tom: "ok", ate: 2 },
  agil: { rotulo: "Ágil", icone: "rocket", tom: "destaque", ate: 5 },
  no_ritmo: { rotulo: "No ritmo", icone: "clock", tom: "neutro", ate: 15 },
  demorado: { rotulo: "Demorado", icone: "alert-triangle", tom: "atencao", ate: Infinity },
};
export function seloDe(medianaMin: number): Selo {
  if (medianaMin <= SELOS.relampago.ate) return "relampago";
  if (medianaMin <= SELOS.agil.ate) return "agil";
  if (medianaMin <= SELOS.no_ritmo.ate) return "no_ritmo";
  return "demorado";
}

export interface AceiteDaPessoa {
  id: string;
  nome: string;
  aceites: number;
  medianaMin: number;
  mediaMin: number;
  maisRapidoMin: number;
  selo: Selo;
  /** Abaixo de MIN_ACEITES: aparece, mas não disputa posição. */
  poucosDados: boolean;
}

export interface AceiteDoTime {
  pessoas: AceiteDaPessoa[];
  /** Mediana de TODOS os aceites do recorte (não a mediana das medianas). */
  medianaMin: number | null;
  aceites: number;
  descartes: Record<MotivoForaDoAceite, number>;
}

/**
 * Agrupa por pessoa dentro de `[desde, ate)`, pelo instante do ACEITE. Ranking:
 * quem tem dados suficientes primeiro, pela mediana; empate → mais aceites.
 */
export function aceitePorPessoa(lista: AtividadeAceite[], desde: number, ate = Infinity): AceiteDoTime {
  const descartes: Record<MotivoForaDoAceite, number> = { sem_aceite: 0, pelo_site: 0, virou_o_dia: 0, relogio_invertido: 0 };
  const porPessoa = new Map<string, { nome: string; mins: number[] }>();
  const todos: number[] = [];
  for (const a of lista) {
    if (!a.para_id) continue;
    const ref = Date.parse(a.aceita_at || a.created_at);
    if (!(ref >= desde && ref < ate)) continue;
    const r = minutosParaAceitar(a);
    if (!r.ok) { if (r.motivo !== "sem_aceite") descartes[r.motivo]++; continue; }
    let p = porPessoa.get(a.para_id);
    if (!p) { p = { nome: a.para_nome || "—", mins: [] }; porPessoa.set(a.para_id, p); }
    p.mins.push(r.min);
    todos.push(r.min);
  }
  const pessoas: AceiteDaPessoa[] = [...porPessoa.entries()].map(([id, p]) => {
    const med = mediana(p.mins);
    return {
      id, nome: p.nome, aceites: p.mins.length,
      medianaMin: med,
      mediaMin: p.mins.reduce((s, n) => s + n, 0) / p.mins.length,
      maisRapidoMin: Math.min(...p.mins),
      selo: seloDe(med),
      poucosDados: p.mins.length < MIN_ACEITES,
    };
  }).sort((a, b) =>
    Number(a.poucosDados) - Number(b.poucosDados) || a.medianaMin - b.medianaMin || b.aceites - a.aceites || a.nome.localeCompare(b.nome));
  return { pessoas, medianaMin: todos.length ? mediana(todos) : null, aceites: todos.length, descartes };
}

/** Dirigidas esperando aceite AGORA, a mais antiga primeiro — o que cobrar. */
export function esperandoAceite(lista: AtividadeAceite[], agora: number): { id: string; para_id: string; nome: string; esperandoMin: number }[] {
  return lista
    .filter((a) => a.status === "pendente" && a.para_id && !a.pool && !a.aceita_at)
    .map((a) => ({ id: a.id, para_id: a.para_id as string, nome: a.para_nome || "—", esperandoMin: (agora - Date.parse(a.created_at)) / 60000 }))
    .filter((x) => x.esperandoMin >= 0)
    .sort((a, b) => b.esperandoMin - a.esperandoMin);
}

/** "40 s" / "3 min" / "1 h 05" / "3 d" — curto, pra caber numa linha de ranking. */
export function textoEspera(min: number): string {
  if (!Number.isFinite(min) || min < 0) return "—";
  if (min < 1) return `${Math.max(1, Math.round(min * 60))} s`;
  const inteiro = Math.round(min); // arredonda ANTES de partir: 59,6 min não vira "0 h 60"
  if (inteiro < 60) return `${inteiro} min`;
  if (inteiro < 24 * 60) return `${Math.floor(inteiro / 60)} h ${String(inteiro % 60).padStart(2, "0")}`;
  return `${Math.floor(inteiro / 1440)} d`;
}
