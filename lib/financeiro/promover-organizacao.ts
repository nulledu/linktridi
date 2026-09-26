import type { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Quem é escolhido como organização de alguém VIRA uma empresa.
 *
 * `fin_contatos.natureza` nasce `'pessoa'` e ninguém nunca troca — é um campo
 * que pede uma classificação antes de a pessoa saber para que ela serve. O
 * resultado, medido no diretório de produção: nove fichas, todas empresas
 * (Madeiranit, Packit, Molas ICO, Unitec), todas gravadas como `'pessoa'`. E
 * como o seletor de organização listava só `natureza = 'empresa'`, ele abria
 * escrito "Sem organização cadastrada" — um beco sem saída, porque o único
 * jeito de sair era adivinhar que existia um campo a corrigir.
 *
 * A saída é não perguntar. Escolher a Packit como a organização de alguém É a
 * afirmação de que a Packit é uma empresa; o sistema só precisa reparar nisso.
 * Assim o diretório se classifica sozinho, no ato de ser usado.
 *
 * Nunca rebaixa: tirar o vínculo não desmarca a empresa, porque outras pessoas
 * podem apontar para ela e porque "deixou de ser empresa" nunca é verdade.
 */
export async function promoverAOrganizacao(
  db: ReturnType<typeof createSupabaseAdminClient>,
  organizacaoId: unknown,
  empresaId: string,
): Promise<void> {
  if (typeof organizacaoId !== "string" || !organizacaoId) return;
  try {
    // A empresa entra na condição: sem ela, um id vindo do cliente marcaria
    // uma ficha de outra empresa que quem chama não pode nem abrir.
    await db
      .from("fin_contatos")
      .update({ natureza: "empresa" })
      .eq("id", organizacaoId)
      .eq("empresa_id", empresaId)
      .neq("natureza", "empresa");
  } catch {
    // Banco sem a coluna `natureza` ainda: o vínculo já foi gravado e é o que
    // importa. Falhar aqui não pode derrubar um cadastro que deu certo.
  }
}
