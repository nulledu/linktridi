// ── O que o tablet conta de si mesmo no heartbeat ────────────────────────────
//
// O aparelho já mandava dois números em todo ciclo — quantas operações ainda
// esperam subir e qual versão do app está instalada (`HeartbeatRequest` em
// estoque-app/.../net/Contracts.kt) — e a rota nunca lia o corpo. Isto é a
// leitura, separada da rota porque é regra pura: o que fazer com um corpo
// ausente, com um número negativo, com uma versão de 4 KB.
//
// A tolerância aqui não é frescura. Esta é a rota que prova que o aparelho está
// vivo; se ela passar a recusar por causa de um campo, o tablet some do radar
// justamente quando estiver rodando uma versão que a gente não previu.

export interface PulsoDoAparelho {
  /** Operações esperando subir. `null` quando o aparelho não disse. */
  pendencias: number | null;
  /** Versão instalada do app. `null` quando o aparelho não disse. */
  appVersao: string | null;
}

/** Versão é para caber numa coluna e numa tela, não para carregar payload. */
const MAX_VERSAO = 40;

/**
 * Teto de sanidade da contagem.
 *
 * A fila real não passa de algumas centenas (o lote de baixa já é limitado a
 * 200 códigos). Um número absurdo é aparelho com defeito ou corpo forjado —
 * satura em vez de gravar, porque um "2.000.000 pendentes" numa tela de
 * acompanhamento só serve pra fazer alguém ignorar o número.
 */
const MAX_PENDENCIAS = 100_000;

function numeroDeFila(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor) : NaN;
  if (!Number.isFinite(n)) return null;
  // Negativo vira 0: "menos três operações esperando" não existe, e gravar isso
  // contamina qualquer soma feita em cima depois.
  return Math.min(Math.max(Math.trunc(n), 0), MAX_PENDENCIAS);
}

export function lerPulso(corpo: unknown): PulsoDoAparelho {
  if (!corpo || typeof corpo !== "object") return { pendencias: null, appVersao: null };
  const b = corpo as Record<string, unknown>;
  const versao = typeof b.appVersion === "string" ? b.appVersion.trim().slice(0, MAX_VERSAO) : "";
  return {
    pendencias: numeroDeFila(b.pendingOperations),
    appVersao: versao || null,
  };
}
