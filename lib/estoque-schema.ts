// ── "O SQL ainda não rodou neste banco" ──────────────────────────────────────
//
// O arquivo supabase/estoque_hierarquia_unidades.sql cria a tabela inteira (não
// só colunas novas) e roda NA MÃO. Enquanto ninguém rodou, todo SELECT/INSERT
// em `estoque_unidades` falha com 42P01 (relação inexistente), e as colunas
// novas de `estoque_itens` falham com 42703. As duas viram o mesmo erro, que as
// rotas traduzem num 409 dizendo exatamente o que rodar.
//
// ── POR QUE ISTO É UM ARQUIVO SEPARADO ──────────────────────────────────────
//
// Estas duas peças são PURAS — não tocam banco nenhum —, mas moravam em
// `estoque-unidades-gerar.ts`, que cria o cliente admin do Supabase. Qualquer
// módulo compartilhado com a tela que quisesse só a checagem levava junto, pelo
// import, `lib/supabase/server` até o navegador. O build do Next quebra com
// isso ("You're importing a module that depends on next/headers") enquanto
// `tsc` e `vitest` passam verdes — a fronteira que nenhum dos dois enxerga.
//
// `estoque-unidades-gerar` reexporta os dois, então quem já os importava de lá
// continua funcionando.

export class ErroSchemaDesatualizado extends Error {
  constructor() { super("schema_desatualizado"); }
}

/** O erro do Postgres é de tabela/coluna que ainda não existe? */
export function schemaDesatualizado(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.code === "42703" || e.code === "42P01") return true;
  return /does not exist|schema cache/i.test(e.message || "");
}
