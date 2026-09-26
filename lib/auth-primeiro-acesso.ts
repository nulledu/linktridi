// ── Cadastro anônimo de senha: ACABOU ────────────────────────────────────────
//
// O login cadastrava a senha de quem digitasse primeiro quando `password_set`
// era falso. O segredo era o NOME DE USUÁRIO — que é o nome da pessoa —, então
// qualquer um reivindicava a conta de quem ainda não tinha entrado.
//
// Hoje quem autoriza o primeiro acesso é um LINK gerado por um admin
// (lib/primeiro-acesso-token.ts + app/primeiro-acesso). Este módulo existe para
// dizer, em um lugar só, que o caminho anônimo não existe mais — e para o teste
// de regressão poder afirmar isso.
//
// Consequência boa e deliberada: conta pendente não é conta aberta. Dezenas de
// pessoas podem ficar sem entrar por meses sem que nenhuma seja reivindicável, e
// sem prazo nenhum correndo contra elas.

/** Papéis que nunca poderiam ser reivindicados sem prova — hoje, ninguém pode. */
export const PAPEIS_SEM_PRIMEIRO_ACESSO = ["admin", "gerente_producao", "gerente_vendas"];

/**
 * O login pode cadastrar a senha digitada por conta própria?
 *
 * Sempre `false`. É função (e não uma constante solta) porque o ponto de decisão
 * continua existindo no login: quem não tem senha definida simplesmente não
 * autentica, e a resposta é a mesma de senha errada — para não entregar quais
 * contas estão pendentes.
 */
export function permiteCadastroAnonimoDeSenha(): boolean {
  return false;
}
