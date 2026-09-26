// Configuração da fonte legada (ERP TridiXP no Supabase irdptdvk…).
// A anon key é pública (vem embarcada no app antigo).
export const LEGACY_URL = "https://irdptdvkldrghevmtmzc.supabase.co";
export const LEGACY_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZHB0ZHZrbGRyZ2hldm10bXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY5OTM4NzgsImV4cCI6MjAzMjU2OTg3OH0.SYzaaJO1jnT7064c6Q5KIcshvD9j_o1TuTFmmF2H46k";

// Setor 2 = time Comercial (vendedoras diretas). Demais setores não entram no
// ranking de vendedores, salvo override individual abaixo.
export const SETOR_TEAM = {
  2: "comercial",
};

// Overrides por pessoa (user_id). Casos especiais informados pela operação.
export const USER_TEAM = {
  "064c8ce2-789d-45c8-97d0-00cbb1f18506": "marketing", // Letícia Valentim → Marketing
};

// Pessoas que NÃO são vendedores (excluir do ranking).
export const EXCLUDE_USERS = new Set([]);
export const EXCLUDE_NAMES = ["suzuki", "samuel", "emanuelly", "ana julia", "ana júlia"]; // contém, case-insensitive

// Retorna a equipe de um usuário, ou null se não deve entrar no ranking.
export function teamOf(user) {
  if (!user) return null;
  if (EXCLUDE_USERS.has(user.user_id)) return null;
  const n = (user.apelido || user.nome || "").toLowerCase();
  if (EXCLUDE_NAMES.some((x) => n.includes(x))) return null;
  if (USER_TEAM[user.user_id]) return USER_TEAM[user.user_id];
  return SETOR_TEAM[user.setor_id] ?? null;
}

const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;
const hdr = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

// GET paginado no PostgREST (range de 1000). Retorna todas as linhas do filtro.
export async function fetchAll(table, query, cap = 200000) {
  const out = [];
  let from = 0;
  const step = 1000;
  for (;;) {
    const url = `${LEGACY_URL}/rest/v1/${table}?${query}`;
    const res = await fetch(url, {
      headers: { ...hdr, Range: `${from}-${from + step - 1}`, "Range-Unit": "items" },
    });
    if (!res.ok) throw new Error(`${table} ${res.status} ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < step || out.length >= cap) break;
    from += step;
  }
  return out;
}

export function startOf(period, now = new Date()) {
  const d = new Date(now);
  if (period === "daily") d.setHours(0, 0, 0, 0);
  else if (period === "weekly") {
    const dow = (d.getDay() + 6) % 7; // segunda = 0
    d.setDate(d.getDate() - dow);
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  }
  return d;
}
