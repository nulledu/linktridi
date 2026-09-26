import type { SalesSnapshot } from "@/lib/types";

// Lógica pura de detecção de meta — compartilhada e testável.
// Retorna os ids (vendedor/equipe) que cruzaram 100% entre dois snapshots.

export function pct(current: number, goal: number): number {
  return goal > 0 ? (current / goal) * 100 : 0;
}

export interface GoalProgress {
  [id: string]: number; // percentual mensal
}

// Achata o snapshot em um mapa id->percentual (mensal) para vendedores e equipes.
export function progressMap(s: SalesSnapshot): GoalProgress {
  const m: GoalProgress = {};
  for (const p of s.salespeople) m[`sp:${p.id}`] = pct(p.sales.monthly, p.goal.monthly);
  for (const t of s.teams) m[`team:${t.id}`] = t.progressPct;
  return m;
}

// Ids que estavam < 100 antes e agora estão >= 100.
export function newlyAchieved(prev: GoalProgress, next: GoalProgress): string[] {
  const out: string[] = [];
  for (const id of Object.keys(next)) {
    const before = prev[id] ?? 0;
    if (before < 100 && next[id] >= 100) out.push(id);
  }
  return out;
}
