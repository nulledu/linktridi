// ── Quem TEM LOGIN mas não é colaborador ─────────────────────────────────────
//
// O RH lista a partir de `profiles`, que é a tabela de QUEM ENTRA NO SISTEMA —
// e nem todo mundo que entra trabalha aqui. Sócio, dono de operação parceira e
// conta de serviço aparecem no login pelo mesmo motivo que um funcionário:
// precisam abrir alguma tela. Não precisam de ficha, de banco de horas nem de
// atestado, e contá-los em "Equipe: 12" faz o número mentir.
//
// A lista mora no CÓDIGO, e não numa coluna, pelo mesmo motivo da lista de
// superusuários: é decisão de quem manda no sistema, revisável no histórico do
// git, e não algo que alguém muda por engano numa tela. Mesmo padrão do
// `foraDoComercial` (lib/vendedoras.ts) e do `foraDaParede` do painel.
//
// Casa por USERNAME, não por nome: nome muda (casamento, apelido, correção de
// grafia) e "contém" acerta homônimos por acidente. Username é a chave do
// login e não muda sem alguém decidir.
//
// Quem entra aqui some da lista do RH, da contagem dos números do topo e da
// ficha — mas continua com o login, as permissões e todo o resto do sistema
// intactos. Tirar da lista do RH não é desativar ninguém.
//
// Quem está aqui, e por quê (set/2026, pedido do dono):
//  · `neiva`      — usuária do sistema, dona do mercadinho; não é funcionária.
//  · `acesso.dev` — conta de TESTE do ERP, usada para conferir tela sem pedir a
//                   senha de ninguém. Não é gente: não tem admissão, não bate
//                   ponto e não pode entrar na contagem da equipe.
// Douglas FICA: é sócio e conta como colaborador.
const NAO_SAO_COLABORADORES = ["neiva", "acesso.dev"];

const normalizar = (v: string | null | undefined) =>
  (v || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Esta conta é de alguém que trabalha aqui? */
export function ehColaborador(username: string | null | undefined): boolean {
  const u = normalizar(username);
  return !!u && !NAO_SAO_COLABORADORES.includes(u);
}

/** Só para o teste enxergar a lista sem abrir o arquivo. */
export const NAO_COLABORADORES = [...NAO_SAO_COLABORADORES] as const;
