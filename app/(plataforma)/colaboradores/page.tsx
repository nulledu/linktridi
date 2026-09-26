import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Pessoas virou RH (set/2026). Esta rota só redireciona.
 *
 * Ela CONTINUA existindo porque `/colaboradores` está em link de tarefa, em
 * resultado da busca da Central (`/api/central/busca`), no FAQ e na memória de
 * quem usa o sistema há meses. Apagar a rota transformaria tudo isso em 404 — e
 * a leitura de um 404 é "o sistema quebrou", não "a tela mudou de lugar".
 *
 * O gate NÃO mora aqui: quem manda é o layout de `/rh`, que exige a chave `rh`.
 * Conferir a permissão antes de redirecionar mandaria para `/sem-permissao` com
 * a chave ERRADA (`colaboradores`, que ninguém mais concede) e a pessoa pediria
 * acesso a uma área que já não se concede. Sem sessão, o middleware pega antes.
 *
 * A tela de gestão de equipe (ponto, turnos, aparelhos) mora em
 * `/ti/permissoes` (TI › Permissões), e o ponto da equipe em `/rh/ponto`; a lista, que é o que quase
 * todo link antigo queria, em `/rh/colaboradores`.
 */
export default async function PessoasRedirect() {
  redirect("/rh/colaboradores");
}
