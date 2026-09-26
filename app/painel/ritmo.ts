/**
 * Ritmo de sincronização dos painéis de TV.
 *
 * A TV do chão de fábrica é o único cliente do sistema que roda 24 horas por
 * dia, 7 dias por semana. Nela `document.hidden` NUNCA vira `true` — não há aba
 * em segundo plano, não há ninguém pra fechar —, então toda defesa baseada em
 * visibilidade passa longe. Com os 30s padrão são 2.880 ciclos por dia por
 * painel, e cada ciclo busca `/api/sales` + `/api/config`: ~175 mil invocações
 * por mês, por TV, das quais a maioria acontece de madrugada e no fim de semana
 * com a empresa fechada e ninguém na frente da tela.
 *
 * Foi um dos motivos de o Hobby da Vercel pausar o projeto (1,1M invocações /
 * 1M, 11h53m de CPU / 4h).
 *
 * Aqui a TV continua idêntica no horário em que alguém de fato olha pra ela, e
 * cai pra um ciclo lento fora dele. Nada quebra fora do expediente: o painel
 * segue no ar mostrando o último número, só demora mais pra buscar o próximo —
 * e às 6h o primeiro ciclo já traz tudo.
 */

/** Fora deste intervalo a empresa está fechada e ninguém olha a TV. */
const ABRE = 6;                 // 06:00
const FECHA = 22;               // 22:00
/** Ciclo lento: mantém a TV viva sem gastar, e ainda pega mudança de config. */
export const RITMO_OCIOSO_MS = 10 * 60_000;

/**
 * `true` quando é horário de alguém estar na frente da TV.
 * Domingo conta como fechado — a fábrica não opera.
 */
export function noExpediente(agora: Date = new Date()): boolean {
  // Relógio de São Paulo (UTC−3, sem horário de verão desde 2019), não o do
  // aparelho: a rota roda na Vercel em UTC e TV box barata nasce em UTC — no
  // relógio local o "expediente" começava às 03h e acabava às 19h de Brasília.
  const sp = new Date(agora.getTime() - 3 * 3600_000);
  const dia = sp.getUTCDay();                       // 0 = domingo
  if (dia === 0) return false;
  const h = sp.getUTCHours();
  return h >= ABRE && h < FECHA;
}

/** Intervalo efetivo entre buscas: o configurado no expediente, lento fora dele. */
export function ritmoAtual(configuradoMs: number, agora?: Date): number {
  return noExpediente(agora) ? configuradoMs : Math.max(configuradoMs, RITMO_OCIOSO_MS);
}
