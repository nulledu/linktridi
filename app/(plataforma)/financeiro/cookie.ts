/**
 * O nome do cookie da empresa ativa, e só isso.
 *
 * Mora sozinho num arquivo SEM import nenhum porque as duas pontas precisam
 * dele: o servidor para ler (`empresa.ts`, que importa `next/headers`) e o
 * seletor no navegador para escrever. Deixar a constante junto do leitor fazia
 * o `next/headers` entrar no pacote do cliente pela mão do seletor — e aí o
 * módulo inteiro parava de compilar com "You're importing a module that depends
 * on next/headers into a React Client Component".
 *
 * O `tsc` não pega isso: é regra de fronteira do empacotador, não de tipo. Só
 * aparece abrindo a página.
 */
export const COOKIE_EMPRESA = "fin_emp";

/**
 * O slug de "ver geral" — a soma das empresas liberadas, não uma empresa.
 *
 * Mora aqui pela MESMA razão do nome do cookie: quem escreve é o seletor, no
 * navegador, e quem lê é o servidor. Guardá-lo em `empresa.ts` arrastaria o
 * `next/headers` para o pacote do cliente e o módulo pararia de compilar — um
 * erro que o `tsc` não vê, porque é regra do empacotador, não de tipo.
 *
 * Nenhuma empresa pode ter este slug: `fin_empresas` nasce com 'tridi' e
 * 'gedux', e a tela de Configurações recusa 'geral' no cadastro.
 */
export const SLUG_GERAL = "geral";
