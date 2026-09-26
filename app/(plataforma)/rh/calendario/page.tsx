import { hojeISO } from "@/lib/financeiro/calculos";
import { requireRh } from "@/lib/rh/gate";
import { anoDoCalendario } from "@/lib/rh/calendario/dados";
import { CalendarioClient } from "./CalendarioClient";

export const dynamic = "force-dynamic";

/**
 * RH → Calendário.
 *
 * O servidor monta o ANO inteiro e manda pronto: aniversários da ficha,
 * feriados fundidos (piso + fonte externa + Ponto + manual), datas de setor,
 * comemorativas e eventos internos. Trocar de mês é local; trocar de ano é
 * `?ano=`. `hoje` é de São Paulo e desce do servidor — ver a memória
 * "Financeiro: hoje é SP".
 */
export default async function CalendarioPage({ searchParams }: {
  searchParams: Promise<{ ano?: string }>;
}) {
  const { poderes } = await requireRh("calendario");
  const hoje = hojeISO();
  const pedido = Number((await searchParams).ano);
  const anoDeHoje = Number(hoje.slice(0, 4));
  const ano = Number.isInteger(pedido) && pedido >= anoDeHoje - 10 && pedido <= anoDeHoje + 10 ? pedido : anoDeHoje;

  const dados = await anoDoCalendario(ano, { verInativos: poderes.calendarioSetores });

  return (
    <CalendarioClient
      ano={ano}
      hoje={hoje}
      acontecimentos={dados.acontecimentos}
      colaboradores={dados.colaboradores}
      setores={dados.setores}
      sync={dados.sync}
      poderes={poderes}
      schemaPendente={dados.pendente}
      feriadosPendentes={dados.feriadosPendentes}
      feriadosNoPonto={dados.feriadosNoPonto}
    />
  );
}
