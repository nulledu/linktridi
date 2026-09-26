import { hojeISO } from "@/lib/financeiro/calculos";
import { requireRh } from "@/lib/rh/gate";
import { resumoDoRh } from "@/lib/rh/tipos";
import { listarColaboradores } from "@/lib/rh/dados";
import { ColaboradoresRhClient } from "./ColaboradoresRhClient";

export const dynamic = "force-dynamic";

/**
 * A tela principal do RH: quem é a equipe, em que situação, e a porta para a
 * ficha de cada um.
 *
 * `hoje` é calculado no SERVIDOR e desce pronto. No cliente, `new Date()` é o
 * relógio de quem abriu — uma aba deixada virando o dia contaria "admitido nos
 * últimos 90 dias" com a régua de ontem, e num navegador em outro fuso a conta
 * sairia errada desde o primeiro segundo (ver a memória "Financeiro: hoje é SP").
 */
export default async function ColaboradoresRhPage() {
  const { poderes } = await requireRh("ver");
  const { dados, pendente } = await listarColaboradores();
  const hoje = hojeISO();

  return (
    <ColaboradoresRhClient
      lista={dados}
      resumo={resumoDoRh(dados, hoje)}
      hoje={hoje}
      poderes={poderes}
      schemaPendente={pendente}
    />
  );
}
