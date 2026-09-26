import { notFound } from "next/navigation";
import { fonteLoja } from "@/lib/lojas-fonte";
import { hojeISO } from "@/lib/financeiro/calculos";
import {
  analyticsDisponivel, faturamentoPorLoja, resumoDeAcessos, serieDeAcessos,
  serieDeReceita, topDeAcessos, topDeReceita,
} from "@/lib/lojas-analytics-db";
import { AvisoDemo } from "../../AvisoDemo";
import { AnalisesClient } from "./AnalisesClient";

export const dynamic = "force-dynamic";

/** Períodos que a tela oferece. Fora disto cai em 30 — nada de `?d=99999`. */
const DIAS_VALIDOS = [7, 30, 90] as const;

/**
 * Meia-noite de São Paulo, em ISO com o fuso escrito.
 *
 * `-03:00` cravado e não `Z`: o Brasil não tem mais horário de verão desde
 * 2019, então o deslocamento é fixo — e escrever o fuso é o que impede o
 * servidor (que roda em UTC) de começar o período três horas antes.
 */
const inicioDoDia = (iso: string) => `${iso}T00:00:00-03:00`;

function recuar(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export default async function AnalisesPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const [{ id }, { d }] = await Promise.all([params, searchParams]);
  const { dados: loja, demo } = await fonteLoja(id);
  if (!loja) notFound();

  const pedido = Number(d);
  const dias = (DIAS_VALIDOS as readonly number[]).includes(pedido) ? pedido : 30;

  const hoje = hojeISO();
  const de = inicioDoDia(recuar(hoje, dias - 1));
  const ate = inicioDoDia(recuar(hoje, -1));                 // amanhã: o período inclui hoje inteiro
  const deAnterior = inicioDoDia(recuar(hoje, dias * 2 - 1));

  // TUDO em paralelo. São treze consultas, e em fila seriam treze idas ao banco
  // uma depois da outra — a 250–700 ms cada, a tela levaria mais de cinco
  // segundos pra desenhar (é a trava de "latência é contagem de idas" do
  // Financeiro, aplicada aqui antes de doer).
  const [
    disponivel, resumo, resumoAntes, serieAcessos, serieReceita,
    porUf, porCanal, porFonte, porDispositivo, porPagina,
    receitaPorUf, receitaPorCanal, receitaPorFonte, todasAsLojas,
  ] = await Promise.all([
    analyticsDisponivel(),
    resumoDeAcessos(id, de, ate),
    resumoDeAcessos(id, deAnterior, de),
    serieDeAcessos(id, de, ate),
    serieDeReceita(id, de, ate),
    topDeAcessos(id, de, ate, "uf", 27),
    topDeAcessos(id, de, ate, "canal", 10),
    topDeAcessos(id, de, ate, "fonte", 12),
    topDeAcessos(id, de, ate, "dispositivo", 5),
    topDeAcessos(id, de, ate, "caminho", 12),
    topDeReceita(id, de, ate, "uf", 27),
    topDeReceita(id, de, ate, "canal", 10),
    topDeReceita(id, de, ate, "fonte", 12),
    faturamentoPorLoja(de, ate),
  ]);

  const receita = serieReceita.reduce((s, p) => s + p.receita, 0);
  const pedidos = serieReceita.reduce((s, p) => s + p.pedidos, 0);
  const daLoja = todasAsLojas.find((l) => l.lojaId === id);

  return (
    <>
      {demo && <AvisoDemo />}
      <AnalisesClient
        id={id}
        nome={loja.nome}
        dias={dias}
        disponivel={disponivel}
        resumo={resumo}
        resumoAntes={resumoAntes}
        serieAcessos={serieAcessos}
        serieReceita={serieReceita}
        receita={receita}
        pedidos={pedidos}
        porUf={porUf}
        porCanal={porCanal}
        porFonte={porFonte}
        porDispositivo={porDispositivo}
        porPagina={porPagina}
        receitaPorUf={receitaPorUf}
        receitaPorCanal={receitaPorCanal}
        receitaPorFonte={receitaPorFonte}
        participacao={daLoja ? { receita: daLoja.receita, total: todasAsLojas.reduce((s, l) => s + l.receita, 0) } : null}
      />
    </>
  );
}
