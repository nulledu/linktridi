// ── Escrita otimista: quando dá pra acreditar na resposta ────────────────────
// `r.ok` NÃO basta pra saber se uma escrita deu certo.
//
// O middleware redireciona requisição sem sessão pra tela de login, e uma
// página de login responde **200 com HTML**. Do lado do cliente isso é
// indistinguível de sucesso: `r.ok` é `true`, o `catch` não roda, e a tela
// mantém o estado otimista. A pessoa vê "aprovado" e nada foi aprovado.
//
// Não é hipótese de laboratório: é a aba que ficou aberta desde ontem. A sessão
// expira em silêncio, a pessoa volta, clica, vê o sucesso e vai embora — e o
// pedido continua pendente pro outro lado.
//
// O sinal que separa os dois casos é o TIPO do corpo: toda rota de escrita
// devolve JSON; o desvio pro login devolve HTML. Uma linha, e a interface volta
// a poder ser acreditada.

/** `true` só quando a resposta é um JSON de verdade — 200 com HTML (o desvio
 *  pro login) é tratado como falha, que é o que ele é pra quem clicou. */
export function respostaConfiavel(r: Response): boolean {
  if (!r.ok) return false;
  const tipo = r.headers.get("content-type") ?? "";
  return tipo.includes("json");
}

/** Mesma regra, já com a mensagem certa pra quem perdeu a sessão. Devolve o
 *  corpo em JSON, ou lança — o chamador desfaz o otimismo no `catch`. */
export async function jsonOuErro<T = unknown>(r: Response): Promise<T> {
  if (!respostaConfiavel(r)) {
    throw new Error(r.ok ? "sessao_expirada" : `http_${r.status}`);
  }
  return (await r.json()) as T;
}

/** Frase pro toast a partir do erro acima: sessão expirada merece instrução
 *  ("recarregue e entre de novo"), erro de rede merece só o fato. */
export function motivoDaFalha(e: unknown, acao: string): string {
  return String((e as Error)?.message) === "sessao_expirada"
    ? "Sua sessão expirou — recarregue a página e entre de novo."
    : `Não deu pra ${acao}.`;
}
