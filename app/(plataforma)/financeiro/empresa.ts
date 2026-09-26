import { cookies } from "next/headers";
import { COOKIE_EMPRESA } from "./cookie";

/**
 * Qual empresa está aberta (Tridi ou Gedux).
 *
 * Mora num COOKIE, não na URL nem no banco:
 *  · na URL, todo link interno teria de carregar `?empresa=` e um link
 *    esquecido devolveria a pessoa para a outra empresa no meio do trabalho;
 *  · no banco, trocar de empresa viraria uma escrita — e o seletor é clicado o
 *    dia inteiro.
 *
 * O cookie é só PREFERÊNCIA de tela. Quem decide o que a pessoa pode abrir é
 * `empresasDoUsuario()` no servidor: um cookie forjado com o slug da outra
 * empresa não devolve nada, porque o slug é resolvido contra a lista dela.
 *
 * O NOME do cookie mora em `./cookie` — ver o porquê lá.
 */
export { COOKIE_EMPRESA, SLUG_GERAL } from "./cookie";

export async function empresaEscolhida(): Promise<string | null> {
  try {
    return (await cookies()).get(COOKIE_EMPRESA)?.value ?? null;
  } catch {
    return null;
  }
}
