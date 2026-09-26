import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Os módulos de lib/ usam o alias "@/..." (mesmo do tsconfig). Sem mapear aqui,
// qualquer teste que importasse um módulo que por sua vez usa "@/" quebrava no
// resolve — só dava pra testar arquivos "folha", de import relativo.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  // O tsconfig usa `jsx: "preserve"` (o Next compila depois). O esbuild do
  // vitest herdaria isso e entregaria JSX cru pro node. Aqui a transformação
  // acontece de verdade — só afeta os testes.
  esbuild: { jsx: "automatic" },
  test: {
    // .claude/worktrees guarda CÓPIAS antigas do repo (worktrees de agente). Sem
    // excluir, o vitest roda os testes de lá também e a suíte quebra por causa de
    // código velho que ninguém mais mantém.
    // `posto/` é app Electron e roda com `node --test` (funções puras, sem DOM
    // nem jsdom). Deixar o vitest tentar carregar aqueles arquivos dá falha de
    // importação sem nenhum problema real por trás — os testes dele rodam com
    // `npm test` dentro de posto/.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.claude/**", "**/.worktrees/**", "posto/**"],
    // jsdom SÓ onde precisa. A suíte é quase toda lógica pura e roda em node,
    // que é bem mais rápido; montar um DOM pra testar uma função de fuso seria
    // pagar caro por nada. Arquivo de componente termina em `.dom.test.tsx`.
    environmentMatchGlobs: [["**/*.dom.test.tsx", "jsdom"]],
    setupFiles: ["./vitest.setup.ts"],
  },
});
