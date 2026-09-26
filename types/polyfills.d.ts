// Polyfills carregados só em WebView antigo (ver app/painel/PolyfillCompat.tsx).
// Não têm @types; a importação é por efeito colateral / default opaco.
declare module "container-query-polyfill";
declare module "resize-observer-polyfill" {
  const RO: unknown;
  export default RO;
}
