/**
 * TRIDIFY LAYOUT ENGINE — o motor único de posição do "Meu painel".
 *
 * Grid → Ocupação → Colisão → Posicionamento → Reorganização, e é ESTE módulo
 * que o arraste, o resize, o teclado, a biblioteca, o layout responsivo e a
 * persistência usam. Nada aqui conhece pixel ou DOM: a verdade é lógica
 * (`{ id, x, y, w, h }` em células, 0-based) e a tela só renderiza o resultado.
 *
 * Modelo de reorganização (o da Home Screen do iOS): o card movido ou
 * redimensionado fica FIXO na casa pedida e os outros fluem em ordem de leitura
 * em volta dele, cada um na primeira casa livre. Isso dá, de graça:
 *   • cadeia A → B → C → D (quem perde a casa empurra o seguinte);
 *   • nenhum buraco no meio (a ordem de leitura preenche o que abriu);
 *   • quem está ANTES do alvo não se mexe;
 *   • determinismo: mesma entrada, mesma saída (desempate por id).
 *
 * O layout salvo NÃO é reempacotado ao carregar — ele é usado como está se for
 * válido (sem sobreposição, dentro da grade). Só um gesto reorganiza.
 */

export type Item = { id: string; x: number; y: number; w: number; h: number };

/** Casa no formato do CSS grid (1-based), que é o que o card recebe em `--c/--r`. */
export type Casa = { c: number; r: number; cw: number; ch: number };

// ── Grid ────────────────────────────────────────────────────────────────────

/** Colunas por largura disponível. Abaixo de 641px o painel vira pilha (só leitura). */
export function colunasPara(largura: number): number {
  if (largura >= 1181) return 4;
  if (largura >= 641) return 2;
  return 1;
}

/** Largura × altura em CÉLULAS de cada tamanho do catálogo (1 = P, 2/3 = M, 4 = G). */
export function medidaDoSpan(span: number, cols: number): { w: number; h: number } {
  if (span >= 4) return { w: cols, h: 3 };
  if (span >= 2) return { w: Math.min(2, cols), h: 2 };
  return { w: 1, h: 1 };
}

export const paraCasa = (i: Item): Casa => ({ c: i.x + 1, r: i.y + 1, cw: i.w, ch: i.h });

/** Ordem de leitura: de cima pra baixo, da esquerda pra direita; empate por id. */
export function ordemDeLeitura(itens: Item[]): Item[] {
  return [...itens].sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function fileiras(itens: Item[]): number {
  return itens.reduce((m, i) => Math.max(m, i.y + i.h), 0);
}

// ── Mapa de ocupação ────────────────────────────────────────────────────────

export class Ocupacao {
  private celulas = new Map<string, string>();
  constructor(readonly cols: number, itens: Item[] = []) {
    for (const i of itens) this.marcar(i);
  }
  private static k(x: number, y: number) { return `${x},${y}`; }
  /** Quem ocupa a célula (ou null). */
  quem(x: number, y: number): string | null { return this.celulas.get(Ocupacao.k(x, y)) ?? null; }
  livre(x: number, y: number): boolean { return !this.celulas.has(Ocupacao.k(x, y)); }
  /** O retângulo cabe aqui? (dentro da grade e sem ninguém — `ignorar` não conta). */
  cabe(x: number, y: number, w: number, h: number, ignorar?: string): boolean {
    if (x < 0 || y < 0 || x + w > this.cols) return false;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const q = this.quem(xx, yy);
      if (q !== null && q !== ignorar) return false;
    }
    return true;
  }
  /** Quem o retângulo atropelaria (colisões), sem repetição. */
  colisoes(x: number, y: number, w: number, h: number, ignorar?: string): string[] {
    const s = new Set<string>();
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const q = this.quem(xx, yy);
      if (q !== null && q !== ignorar) s.add(q);
    }
    return [...s];
  }
  marcar(i: Item) {
    for (let y = i.y; y < i.y + i.h; y++) for (let x = i.x; x < i.x + i.w; x++) this.celulas.set(Ocupacao.k(x, y), i.id);
  }
  /** Primeira casa livre em ordem de leitura a partir de (x0, y0). */
  proximaLivre(w: number, h: number, y0 = 0, x0 = 0): { x: number; y: number } {
    const ww = Math.min(w, this.cols);
    for (let y = y0; ; y++) {
      for (let x = y === y0 ? x0 : 0; x + ww <= this.cols; x++) if (this.cabe(x, y, ww, h)) return { x, y };
    }
  }
  /** Células livres dentro das `n` primeiras fileiras (útil pra prova e depuração). */
  livres(n: number): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < this.cols; x++) if (this.livre(x, y)) out.push({ x, y });
    return out;
  }
}

/** Layout válido = todo mundo dentro da grade e ninguém dividindo célula. */
export function valido(itens: Item[], cols: number): boolean {
  const oc = new Ocupacao(cols);
  for (const i of itens) {
    if (i.w < 1 || i.h < 1 || !oc.cabe(i.x, i.y, i.w, i.h)) return false;
    oc.marcar(i);
  }
  return true;
}

// ── Posicionamento ──────────────────────────────────────────────────────────

/** Empacota em ordem de leitura, cada um na primeira casa livre. `fixos` entram
 *  antes e não se mexem. Devolve na mesma ordem dos `itens`. */
function fluir(itens: Item[], cols: number, fixos: Item[] = []): Item[] {
  const oc = new Ocupacao(cols, fixos);
  const novo = new Map<string, Item>();
  for (const f of fixos) novo.set(f.id, f);
  for (const i of ordemDeLeitura(itens.filter((i) => !novo.has(i.id)))) {
    const w = Math.min(i.w, cols);
    const p = oc.proximaLivre(w, i.h);
    const n = { ...i, w, x: p.x, y: p.y };
    oc.marcar(n);
    novo.set(i.id, n);
  }
  return itens.map((i) => novo.get(i.id)!);
}

/** Empacota uma lista de tamanhos numa ordem dada (layout inicial, preset). */
export function empacotar(ids: string[], medida: (id: string) => { w: number; h: number }, cols: number): Item[] {
  const oc = new Ocupacao(cols);
  return ids.map((id) => {
    const { w: w0, h } = medida(id);
    const w = Math.min(w0, cols);
    const p = oc.proximaLivre(w, h);
    const i = { id, x: p.x, y: p.y, w, h };
    oc.marcar(i);
    return i;
  });
}

/**
 * Coloca `id` na casa (x, y) com o tamanho (w, h) e reorganiza o resto. É a
 * operação ÚNICA do motor: arraste, teclado, resize e biblioteca passam por
 * aqui. O alvo é trazido pra dentro da grade e nunca abaixo do fim do que já
 * existe (senão abriria fileiras vazias no meio). Se nada muda, devolve a
 * MESMA referência — quem chama sabe que não precisa salvar nem animar.
 */
export function colocar(itens: Item[], alvo: Item, cols: number): Item[] {
  const w = Math.max(1, Math.min(alvo.w, cols));
  const h = Math.max(1, alvo.h);
  const resto = itens.filter((i) => i.id !== alvo.id);
  const fimDoResto = fileiras(fluir(resto, cols));
  const x = Math.max(0, Math.min(alvo.x, cols - w));
  const y = Math.max(0, Math.min(alvo.y, fimDoResto));
  const atual = itens.find((i) => i.id === alvo.id);
  if (atual && atual.x === x && atual.y === y && atual.w === w && atual.h === h && valido(itens, cols)) return itens;
  const fixo = { id: alvo.id, x, y, w, h };
  const lista = atual ? itens : [...itens, fixo];
  const saida = fluir(lista, cols, [fixo]);
  const igual = saida.length === itens.length && saida.every((s, n) => {
    const a = itens[n];
    return a && a.id === s.id && a.x === s.x && a.y === s.y && a.w === s.w && a.h === s.h;
  });
  return igual ? itens : saida;
}

/** Tira um card e deixa o resto fluir pro espaço que abriu. */
export function remover(itens: Item[], id: string, cols: number): Item[] {
  return fluir(itens.filter((i) => i.id !== id), cols);
}

/** Card novo sem casa pedida: primeira casa livre depois do que existe. */
export function acrescentar(itens: Item[], id: string, w: number, h: number, cols: number): Item[] {
  const oc = new Ocupacao(cols, itens);
  const ww = Math.min(w, cols);
  const p = oc.proximaLivre(ww, h);
  return [...itens, { id, x: p.x, y: p.y, w: ww, h }];
}

// ── Layout responsivo ───────────────────────────────────────────────────────

/** O layout lógico (salvo em 4 colunas) resolvido pra uma grade menor: mesma
 *  ordem de leitura, largura presa à grade, empacotado. Nunca sai da área. */
export function adaptar(itens: Item[], cols: number, base = 4): Item[] {
  if (cols === base && valido(itens, cols)) return itens;
  return fluir(itens.map((i) => ({ ...i, w: i.w >= base ? cols : Math.min(i.w, cols) })), cols);
}

/** Volta de uma grade menor pra base: o que foi arrumado no tablet vale no
 *  computador pela ORDEM de leitura (tamanhos originais de cada card). */
export function levarParaBase(itens: Item[], medida: (id: string) => { w: number; h: number }, base = 4): Item[] {
  return empacotar(ordemDeLeitura(itens).map((i) => i.id), medida, base);
}

// ── Persistência ────────────────────────────────────────────────────────────

/**
 * O layout salvo, conferido contra o que existe hoje: some quem não está mais
 * visível, entra no fim quem faltava, o tamanho vem do catálogo (`medida`, que
 * já aplica min/max). Salvo inválido (sobreposto, fora da grade) é reempacotado
 * pela ordem de leitura; salvo válido fica EXATAMENTE como está.
 */
export function normalizar(
  salvo: Item[] | undefined, visiveis: string[],
  medida: (id: string) => { w: number; h: number }, cols = 4,
): Item[] {
  const vis = new Set(visiveis);
  const vistos = new Set<string>();
  let itens: Item[] = [];
  for (const s of salvo ?? []) {
    if (!s || typeof s.id !== "string" || !vis.has(s.id) || vistos.has(s.id)) continue;
    if (![s.x, s.y].every((n) => Number.isInteger(n) && n >= 0)) continue;
    vistos.add(s.id);
    const m = medida(s.id);
    itens.push({ id: s.id, x: s.x, y: s.y, w: Math.min(m.w, cols), h: m.h });
  }
  if (!valido(itens, cols)) itens = fluir(itens, cols);
  const faltam = visiveis.filter((id) => !vistos.has(id));
  if (!salvo || !salvo.length) return empacotar(visiveis, medida, cols);
  for (const id of faltam) { const m = medida(id); itens = acrescentar(itens, id, m.w, m.h, cols); }
  return itens;
}

// ── Da tela pra grade ───────────────────────────────────────────────────────

export type Metrica = { left: number; top: number; width: number; cols: number; gap: number; linha: number };

/** Posição contínua (em células) de um ponto da tela. */
export function celulaContinua(m: Metrica, px: number, py: number): { x: number; y: number } {
  const larg = (m.width - m.gap * (m.cols - 1)) / m.cols;
  return { x: (px - m.left) / (larg + m.gap), y: (py - m.top) / (m.linha + m.gap) };
}

/**
 * ZONA DE ATIVAÇÃO. Arredonda a posição contínua pra uma célula, mas só troca
 * de célula quando passa da metade E de mais uma margem. Poucos pixels pra lá
 * e pra cá na fronteira não reorganizam o painel (sem flicker, sem pulo).
 */
export function comHisterese(continua: number, anterior: number | null, margem = 0.22): number {
  const r = Math.round(continua);
  if (anterior === null) return r;
  return Math.abs(continua - anterior) < 0.5 + margem ? anterior : r;
}

/** Casa (0-based) sob um ponto — onde cai o canto do card de tamanho w. */
export function casaSobPonto(m: Metrica, px: number, py: number): { x: number; y: number } {
  const c = celulaContinua(m, px, py);
  return { x: Math.max(0, Math.min(m.cols - 1, Math.floor(c.x))), y: Math.max(0, Math.floor(c.y)) };
}
