// Nome do canal e dos eventos do sinal da parede — e SÓ isso.
//
// Separado de `tv-sinal.ts` porque aquele lê a service role key e nunca pode
// entrar no bundle do navegador. Aqui não há segredo: duas strings que o
// `/painel` (navegador) e o app de TV usam para assinar o mesmo tópico.

export const TV_SINAL_TOPICO = "tv:parede";
export const TV_SINAL_EVENTOS = ["config", "versao", "comando"] as const;
export type TvSinalEvento = (typeof TV_SINAL_EVENTOS)[number];
