// Casamento de prefixo de rota, extraído do middleware pra ser puro e testável.
// O `=== p || startsWith(p + "/")` — com a BARRA — é o que impede um prefixo
// curto de casar uma rota irmã: liberar "/api/p" (páginas do TridiFlow) não pode
// abrir "/api/perfis" nem "/api/producao" sem sessão, e "/api/sales" não pode
// abrir "/api/salespeople". Casar prefixo cru (startsWith sem a barra)
// escancararia essas rotas. Coberto por lib/__tests__/middleware-rotas.test.ts.
export function ehRotaPublica(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(p + "/"));
}
