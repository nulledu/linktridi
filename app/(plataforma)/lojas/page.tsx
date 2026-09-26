import { fonteLojas } from "@/lib/lojas-fonte";
import { hojeISO } from "@/lib/financeiro/calculos";
import { faturamentoPorLoja } from "@/lib/lojas-analytics-db";
import { AvisoDemo } from "./AvisoDemo";
import { MinhasLojasClient } from "./MinhasLojasClient";

export const dynamic = "force-dynamic";

// O gate está no layout do segmento (`/lojas/layout.tsx`) e cobre toda a
// árvore — por isso a página não repete `requireModule`.
export default async function LojasPage() {
  const hoje = hojeISO();
  const trintaDiasAtras = new Date(`${hoje}T12:00:00Z`);
  trintaDiasAtras.setUTCDate(trintaDiasAtras.getUTCDate() - 29);
  const de = `${trintaDiasAtras.toISOString().slice(0, 10)}T00:00:00-03:00`;
  const amanha = new Date(`${hoje}T12:00:00Z`);
  amanha.setUTCDate(amanha.getUTCDate() + 1);
  const ate = `${amanha.toISOString().slice(0, 10)}T00:00:00-03:00`;

  // UMA consulta pra TODAS as lojas. Era esse o motivo de o card não mostrar
  // número nenhum antes: contar por loja seriam N idas ao banco pra desenhar
  // uma lista. Com a agregação no Postgres, o mesmo dado custa uma ida.
  const [{ dados: lojas, demo }, faturamento] = await Promise.all([
    fonteLojas(),
    faturamentoPorLoja(de, ate),
  ]);

  return (
    <>
      {demo && <AvisoDemo />}
      <MinhasLojasClient
        lojas={lojas}
        demo={demo}
        faturamento={faturamento.map((f) => ({ lojaId: f.lojaId, receita: f.receita, pedidos: f.pedidos, sessoes: f.sessoes }))}
      />
    </>
  );
}
