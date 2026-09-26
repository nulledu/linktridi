// Rolagem suave que RESPEITA quem pediu menos movimento.
//
// `behavior: "smooth"` cru ignora o `prefers-reduced-motion` do sistema: em
// quem tem sensibilidade a movimento, a página desliza igual. Todo scroll
// programático da central passa por aqui.
export const menosMovimento = (): boolean =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

const comportamento = (): ScrollBehavior => (menosMovimento() ? "auto" : "smooth");

export function rolarAte(alvo: Element | null | undefined, block: ScrollLogicalPosition = "start") {
  alvo?.scrollIntoView({ block, behavior: comportamento() });
}

export function rolarAoTopo() {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, behavior: comportamento() });
}
