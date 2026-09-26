/**
 * Frota de TV box — gestão remota das caixas do galpão.
 *
 * A caixa é device owner do próprio app (o `tv-central`), então ela consegue,
 * SEM root, se atualizar em silêncio e obedecer a um conjunto FECHADO de
 * comandos. Este arquivo é a parte PURA: decidir se há atualização e validar
 * comando. Nada de banco aqui — é onde o teste bate.
 *
 * Por que um conjunto fechado de comandos, e não "rode este shell": comando
 * arbitrário num aparelho remoto é execução de código remota — o buraco de
 * segurança que a gente NÃO quer abrir só pra reiniciar uma TV. Device owner
 * dá exatamente estas ações e nenhuma a mais.
 */

export type TipoComando =
  | "reiniciar"        // reinicia o app (não o aparelho — device owner relança)
  | "abrir_painel"     // troca o que a TV mostra: args.painel e/ou args.perfil
  | "girar"            // vira a tela sem escada: args.graus (0/90/180/270)
  | "logs"             // envia as últimas linhas de log
  | "atualizar_agora"; // baixa e instala a versão publicada já, sem esperar o ciclo

export const TIPOS_COMANDO: readonly TipoComando[] = [
  "reiniciar", "abrir_painel", "girar", "logs", "atualizar_agora",
] as const;

/** Painéis que `abrir_painel` aceita — os mesmos tipos de aparelho do /painel. */
export const PAINEIS_VALIDOS = ["vendas", "producao", "logistica", "maquinas"] as const;
export type PainelValido = (typeof PAINEIS_VALIDOS)[number];

/**
 * As quatro posições de tela. Existem quatro porque quem decide é a parede: uma
 * TV de pé pode ter o cabo saindo para cima ou para baixo, e no teto ela às
 * vezes vai de cabeça para baixo.
 */
export const GIROS_VALIDOS = [0, 90, 180, 270] as const;

export interface Comando {
  tipo: TipoComando;
  args: Record<string, unknown>;
}

/**
 * Valida e NORMALIZA um comando vindo do admin. Devolve `null` quando o tipo
 * é desconhecido ou os argumentos não batem — é a fronteira que impede um
 * comando malformado de chegar ao aparelho.
 */
export function comandoValido(tipo: unknown, args: unknown): Comando | null {
  if (typeof tipo !== "string" || !TIPOS_COMANDO.includes(tipo as TipoComando)) return null;
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  if (tipo === "abrir_painel") {
    // Duas maneiras de dizer o que vai na tela, e o comando aceita as duas
    // porque o console oferece as duas: um PAINEL (vendas/produção/logística)
    // ou um PERFIL montado no ERP. Sem o perfil aqui, trocar a parede para um
    // desenho publicado exigiria ir até a TV — e é justamente isso que a
    // gestão remota existe para evitar.
    const painel = typeof a.painel === "string" ? a.painel : "";
    const perfil = typeof a.perfil === "string" ? a.perfil.trim().slice(0, 80) : "";
    if (perfil) return { tipo, args: { perfil } };
    if (!PAINEIS_VALIDOS.includes(painel as PainelValido)) return null;
    return { tipo, args: { painel } };
  }
  if (tipo === "girar") {
    const graus = Number(a.graus);
    if (!GIROS_VALIDOS.includes(graus as (typeof GIROS_VALIDOS)[number])) return null;
    return { tipo, args: { graus } };
  }
  // Os demais não levam argumento — descarta qualquer coisa que venha junto.
  return { tipo: tipo as TipoComando, args: {} };
}

export interface VersaoPublicada {
  versionCode: number;
  versionName: string;
  /** URL do APK, assinado com a MESMA keystore interna (senão o device owner
   *  recusa o update silencioso — é update, não instalação nova). */
  url: string;
  sha256: string;
  /** Obrigatória = a caixa instala assim que baixa; senão, no próximo ciclo ocioso. */
  obrigatoria: boolean;
}

/**
 * Tem atualização pra esta caixa? Só quando a publicada tem versionCode MAIOR
 * que o instalado. Igual ou menor nunca atualiza — reinstalar a mesma versão
 * ou "voltar" no ar seria um loop de download a cada ciclo.
 */
export function precisaAtualizar(instaladoCode: number, pub: VersaoPublicada | null): boolean {
  if (!pub) return false;
  if (!Number.isFinite(instaladoCode)) return true; // caixa sem versão reportada: manda a atual
  return pub.versionCode > instaladoCode;
}

export interface RespostaSync {
  /** A versão a instalar, ou `null` quando a caixa já está em dia. */
  atualizacao: VersaoPublicada | null;
  /** Comandos pendentes pra esta caixa, na ordem em que foram criados. */
  comandos: { id: string; tipo: TipoComando; args: Record<string, unknown> }[];
}

/** Monta o que a caixa recebe a cada ciclo de sincronização. */
export function montarSync(
  instaladoCode: number,
  pub: VersaoPublicada | null,
  comandosPendentes: { id: string; tipo: string; args: unknown }[],
): RespostaSync {
  return {
    atualizacao: precisaAtualizar(instaladoCode, pub) ? pub : null,
    comandos: comandosPendentes
      .map((c) => {
        const v = comandoValido(c.tipo, c.args);
        return v ? { id: c.id, tipo: v.tipo, args: v.args } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null),
  };
}
