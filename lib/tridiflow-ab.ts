// ── TridiFlow · teste A/B nativo (página e quiz) ─────────────────────────────
//
// NÃO confundir com o smart-link `/ab/<slug>` do Tráfego: aquele divide tráfego
// entre URLs DIFERENTES e cruza venda por `pedidos.tag_utm`. Este aqui testa
// duas versões do MESMO projeto — headline, CTA, preço, ordem das seções.
//
// A mecânica é por BLOCO, não por documento duplicado: cada bloco pode ser
// marcado "só na A" ou "só na B", e o que não tem marca aparece nas duas.
// Duplicar o documento inteiro pareceu mais simples no começo e não é: quem
// corrige um typo teria que corrigir nos dois, e na prática só corrige num.
//
// Zero SQL: a variante viaja em `tridiflow_eventos.meta` (jsonb que já existe)
// e, no lead, em `respostas[CHAVE_VARIANTE]` — o mesmo truque que as tags do
// quiz usam pra chegar no webhook sem coluna nova.
//
// Puro e client-safe: o editor, o player e a tela de métricas leem daqui.

export type Variante = "a" | "b";

export interface TesteAB {
  ativo?: boolean;
  /** Fatia da variante A, 0–100. Ausente = 50. */
  pesoA?: number;
  nomeA?: string;
  nomeB?: string;
}

/** Onde a variante viaja junto do lead — mesma ideia de CHAVE_TAGS. */
export const CHAVE_VARIANTE = "variante";

/** Cookie do visitante. Decidido no SERVIDOR de propósito: escolher a variante
 *  no cliente faria o primeiro render (SSR) sair com uma versão e o segundo com
 *  outra — divergência de hidratação e um piscar da versão errada na cara de
 *  quem chegou pelo anúncio. */
export const COOKIE_AB = "tf_ab";

export const ehVariante = (v: unknown): v is Variante => v === "a" || v === "b";

export function pesoValido(p: number | undefined): number {
  return typeof p === "number" && Number.isFinite(p) ? Math.min(100, Math.max(0, Math.round(p))) : 50;
}

/** Sorteia a variante. `aleatorio` entra de fora (0 ≤ r < 1) pra função
 *  continuar pura — e pra o teste conseguir fixar o resultado. */
export function sortearVariante(pesoA: number | undefined, aleatorio: number): Variante {
  const peso = pesoValido(pesoA);
  const r = Number.isFinite(aleatorio) ? Math.min(0.999999, Math.max(0, aleatorio)) : 0;
  return r * 100 < peso ? "a" : "b";
}

/** Qual variante vale AGORA.
 *
 *  Teste desligado devolve sempre "a": A é o controle, então desligar o teste
 *  devolve a página original em vez de esconder metade dela. */
export function varianteEfetiva(teste: TesteAB | undefined, atribuida: Variante | null | undefined): Variante {
  if (!teste?.ativo) return "a";
  return ehVariante(atribuida) ? atribuida : "a";
}

/** O bloco aparece nesta variante?
 *
 *  Sem marca = aparece nas duas (é a maior parte da página). Com marca, só na
 *  sua. Total de propósito: um valor estranho vindo de um documento antigo não
 *  pode sumir com o bloco. */
export function mostraNaVariante(marca: Variante | undefined | null, ativa: Variante): boolean {
  return !ehVariante(marca) || marca === ativa;
}

export const ROTULO_VARIANTE = (t: TesteAB | undefined, v: Variante): string =>
  (v === "a" ? t?.nomeA : t?.nomeB) || (v === "a" ? "Versão A" : "Versão B");

// ── Placar ───────────────────────────────────────────────────────────────────

export interface LinhaEvento {
  evento: string;
  visitante: string | null;
  variante: Variante | null;
}

export interface BracoAB {
  variante: Variante;
  visitantes: number;
  cliques: number;
  conversoes: number;
  /** Conversões por visitante, em %. */
  taxa: number;
}

export interface ResumoAB {
  a: BracoAB;
  b: BracoAB;
  /** Só sai quando há amostra pra sustentar. `null` = ainda não dá pra dizer. */
  vencedora: Variante | null;
  /** Por que ainda não deu — texto pra tela, sem jargão. */
  motivo: string;
  /** Quanto a vencedora converte a mais, em % relativo. */
  ganho: number;
}

/** Mínimo por braço antes de olhar pra diferença. Não é rigor estatístico
 *  acadêmico: é o número abaixo do qual "a B está ganhando" é ruído puro, e
 *  anunciar um vencedor cedo é pior que não anunciar nenhum — quem confia
 *  troca a página que estava vendendo por uma que não estava. */
const MINIMO_POR_BRACO = 100;

/** Diferença que sobrevive ao acaso (teste z de duas proporções, ~95%). */
function significante(a: BracoAB, b: BracoAB): boolean {
  const n1 = a.visitantes, n2 = b.visitantes;
  if (n1 < 1 || n2 < 1) return false;
  const p1 = a.conversoes / n1, p2 = b.conversoes / n2;
  const p = (a.conversoes + b.conversoes) / (n1 + n2);
  if (p <= 0 || p >= 1) return false;
  const erro = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (erro === 0) return false;
  return Math.abs(p1 - p2) / erro >= 1.96;
}

function braco(linhas: LinhaEvento[], v: Variante): BracoAB {
  const doBraco = linhas.filter((l) => l.variante === v);
  const visitantes = new Set(
    doBraco.filter((l) => l.evento === "page_view" && l.visitante).map((l) => l.visitante),
  ).size;
  const cliques = doBraco.filter((l) => l.evento === "cta_clicked").length;
  const conversoes = doBraco.filter((l) => l.evento === "form_submitted").length;
  return {
    variante: v, visitantes, cliques, conversoes,
    taxa: visitantes > 0 ? Math.round((conversoes / visitantes) * 1000) / 10 : 0,
  };
}

export function resumoAB(linhas: LinhaEvento[]): ResumoAB {
  const a = braco(linhas, "a");
  const b = braco(linhas, "b");

  const menor = Math.min(a.visitantes, b.visitantes);
  if (menor < MINIMO_POR_BRACO) {
    const faltam = MINIMO_POR_BRACO - menor;
    return {
      a, b, vencedora: null, ganho: 0,
      motivo: `Ainda cedo pra dizer — faltam ${faltam} visitante(s) na versão com menos tráfego.`,
    };
  }
  if (a.taxa === b.taxa) {
    return { a, b, vencedora: null, ganho: 0, motivo: "As duas estão convertendo igual." };
  }
  if (!significante(a, b)) {
    return {
      a, b, vencedora: null, ganho: 0,
      motivo: "A diferença ainda cabe no acaso. Deixe rodar mais um pouco.",
    };
  }
  const vencedora: Variante = a.taxa > b.taxa ? "a" : "b";
  const [alta, baixa] = vencedora === "a" ? [a.taxa, b.taxa] : [b.taxa, a.taxa];
  const ganho = baixa > 0 ? Math.round(((alta - baixa) / baixa) * 1000) / 10 : 100;
  return {
    a, b, vencedora, ganho,
    motivo: `A versão ${vencedora.toUpperCase()} converte ${ganho}% a mais.`,
  };
}
