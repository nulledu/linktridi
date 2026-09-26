// Hierarquia de materiais — a ÚNICA classificação do item de estoque.
//
// Substitui três eixos que diziam quase a mesma coisa (`tipo`, `tipo_item` e
// `classe`) e nenhum deles tinha regra: dava pra pôr um produto acabado dentro
// de uma matéria-prima e o sistema aceitava calado. Aqui a regra é a matriz
// abaixo, e ela é a MESMA pra tela (filtra o seletor) e pra API (recusa o que
// entrou por fora da tela). Duas cópias da regra viram duas regras.

export const HIERARQUIAS = [
  "materia_prima",
  "insumo_direto",
  "insumo_indireto",
  "embalagem",
  "mp_processada",
  "componente",
  "peca",
  "produto",
] as const;

export type Hierarquia = (typeof HIERARQUIAS)[number];

export interface HierarquiaDef {
  key: Hierarquia;
  label: string;
  /** Ícone Tabler — precisa existir no mapa de `app/(plataforma)/Icon.tsx`. */
  icon: string;
  /** Item base: existe por si, nunca é composto por outros. */
  base: boolean;
  /** Prefixo do SKU gerado automaticamente (usado no plano 2). */
  prefixo: string;
}

export const HIERARQUIA_DEFS: HierarquiaDef[] = [
  { key: "materia_prima",   label: "Matéria-Prima",            icon: "stack-2",        base: true,  prefixo: "MP" },
  { key: "insumo_direto",   label: "Insumo Direto",            icon: "droplet",        base: true,  prefixo: "ID" },
  { key: "insumo_indireto", label: "Insumo Indireto",          icon: "droplet-half-2", base: true,  prefixo: "II" },
  { key: "embalagem",       label: "Embalagem",                icon: "package",        base: true,  prefixo: "EMB" },
  { key: "mp_processada",   label: "Matéria-Prima Processada", icon: "box-multiple",   base: false, prefixo: "MPP" },
  { key: "componente",      label: "Componente",               icon: "package-import", base: false, prefixo: "CMP" },
  { key: "peca",            label: "Peça",                     icon: "tools",          base: false, prefixo: "PEC" },
  { key: "produto",         label: "Produto",                  icon: "box",            base: false, prefixo: "PRD" },
];

// Quem pode ser FILHO de quem na ficha técnica.
//
// A hierarquia é uma ESCADA, e a regra é uma frase só: **um item é composto por
// qualquer coisa do nível dele para baixo — nunca por algo acima**. A ordem da
// escada é a de `HIERARQUIAS`: matéria-prima no chão, produto no topo.
//
// A matriz anterior era escrita à mão, degrau por degrau, e desenhava um caminho
// único (matéria-prima → componente → peça → produto). A operação real não anda
// só por esse caminho: às vezes um produto sai direto da matéria-prima, e uma
// peça é cortada da chapa sem passar por componente nenhum. O resultado, medido
// no banco, é que as 21 peças e os 33 componentes do catálogo estavam sem ficha
// — não porque ninguém quis preencher, mas porque o seletor não oferecia nada
// que servisse.
//
// O mesmo nível é permitido (uma embalagem dentro de outra embalagem já existe
// no catálogo: a caixa que leva o saco). O que impede o ciclo não é a
// hierarquia — é a checagem por ITEM, em `/api/ficha-tecnica`, que recusa um
// componente que já depende do pai. Hierarquia nunca soube distinguir dois
// itens do mesmo degrau, e fingir que sabia era o que barrava o caso legítimo.

/** Degrau de cada hierarquia na escada — a ordem de `HIERARQUIAS`. */
const NIVEL = HIERARQUIAS.reduce((acc, h, i) => {
  acc[h] = i;
  return acc;
}, {} as Record<Hierarquia, number>);

export const nivelDaHierarquia = (h: Hierarquia): number => NIVEL[h];

// Derivada da escada, não escrita à mão: duas cópias da regra viram duas
// regras. Continua exportada porque a API e os testes leem a matriz pronta.
export const COMPOSICAO = HIERARQUIAS.reduce((acc, pai) => {
  acc[pai] = HIERARQUIAS.filter((filho) => NIVEL[filho] <= NIVEL[pai]);
  return acc;
}, {} as Record<Hierarquia, readonly Hierarquia[]>);

export const isHierarquia = (v: unknown): v is Hierarquia =>
  typeof v === "string" && (HIERARQUIAS as readonly string[]).includes(v);

// ── O item que ainda não tem hierarquia ──────────────────────────────────────
//
// `estoque_itens.hierarquia` é NULA-vel, e a planilha do galpão entra com
// dezenas de itens assim ("deixa sem categoria por enquanto"). O problema é que
// a tela do catálogo mostra UMA hierarquia por vez: item nulo não casa com
// nenhuma das oito abas e some do sistema inteiro — importar 81 itens sem
// classificar era enterrar 81 itens.
//
// Aqui o estado nulo ganha NOME. Não é uma nona hierarquia (a matriz de
// composição não o conhece, e nada pode ser feito "de não classificado"): é a
// ausência dela, tratada como um lugar visível de onde se sai.

/** Chave da aba/filtro dos não classificados. Fora de `HIERARQUIAS` de
 *  propósito — nunca é gravada em `estoque_itens.hierarquia`. */
export const SEM_HIERARQUIA = "sem_hierarquia";

export const LABEL_SEM_HIERARQUIA = "Não classificados";

/**
 * Este item está fora das oito abas?
 *
 * Vale pra `null`, pra `""` e pra qualquer valor fora da lista (linha legada
 * com um eixo antigo, erro de digitação numa carga): os três desaparecem da
 * tela exatamente do mesmo jeito, então precisam cair no mesmo balde.
 */
export const naoClassificado = (h?: unknown): boolean => !isHierarquia(h);

/** Aba a que o item pertence: a hierarquia dele, ou o balde dos não
 *  classificados. É a mesma conta na fileira de abas, na contagem do aviso e
 *  na busca — três cópias dela seriam três respostas diferentes. */
export const abaDoItem = (h?: unknown): string => (isHierarquia(h) ? h : SEM_HIERARQUIA);

export const hierarquiaDef = (k?: string | null): HierarquiaDef | undefined =>
  HIERARQUIA_DEFS.find((h) => h.key === k);

export const hierarquiaLabel = (k?: string | null): string => hierarquiaDef(k)?.label ?? "—";

/**
 * Item "de compra": o padrão dele é chegar pronto, então o `produzido` nasce
 * desligado no cadastro. NÃO esconde mais a ficha técnica — esconder foi o que
 * deixou 54 itens sem composição e sem uma palavra dizendo por quê. Quem produz
 * uma embalagem internamente liga o interruptor e preenche a ficha.
 */
export const ehBase = (k?: string | null): boolean => hierarquiaDef(k)?.base ?? false;

/** `filho` pode entrar na ficha técnica de `pai`? */
export function podeCompor(pai: unknown, filho: unknown): boolean {
  if (!isHierarquia(pai) || !isHierarquia(filho)) return false;
  return COMPOSICAO[pai].includes(filho);
}

/** Hierarquias que podem entrar na ficha de `pai` — filtra o seletor da tela. */
export function filhosPermitidos(pai: unknown): readonly Hierarquia[] {
  return isHierarquia(pai) ? COMPOSICAO[pai] : [];
}

export interface LinhaFicha { nome: string; hierarquia: string | null }

/**
 * Confere a ficha inteira de uma vez e devolve QUEM não pode entrar.
 * A API usa o nome na mensagem de erro: "MDF 6mm não pode entrar em Peça" é
 * acionável; "composição inválida" manda a pessoa adivinhar qual linha.
 */
export function validarFicha(pai: unknown, linhas: LinhaFicha[]): { ok: boolean; invalidos: LinhaFicha[] } {
  const invalidos = linhas.filter((l) => !podeCompor(pai, l.hierarquia));
  return { ok: invalidos.length === 0, invalidos };
}
