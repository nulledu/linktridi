export {}; // sem isto o arquivo não é módulo e o `await` de topo não vale

// Setup do vitest. Roda para TODA suíte, inclusive as de lógica pura em node —
// por isso tudo aqui é condicional à existência de um DOM. Importar
// `@testing-library/jest-dom` no ambiente node quebraria os 450+ testes que não
// têm nada a ver com interface.
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  const { afterEach } = await import("vitest");
  // Sem isto um teste deixa o componente montado e o próximo encontra DOIS
  // botões "Salvar" — o erro clássico de suíte de componente, que aparece como
  // "found multiple elements" num teste que não mudou.
  afterEach(() => cleanup());

  // jsdom não implementa nenhuma das três, e o kit usa as três: `matchMedia`
  // no `PainelLateral` (reduced-motion), `setPointerCapture` no arrasto e
  // `scrollIntoView` nas faixas de abas. Sem os stubs o componente estoura
  // antes de a asserção rodar.
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  // O Toast do HeroUI mede a própria altura com ResizeObserver (jsdom não tem):
  // o erro não reprovava teste, mas o `Errors 1` barrava o deploy:prod.
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = function () {};
    Element.prototype.releasePointerCapture = function () {};
    Element.prototype.hasPointerCapture = function () { return false; };
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};
}
