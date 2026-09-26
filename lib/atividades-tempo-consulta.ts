// ── A leitura que alimenta o tempo médio ─────────────────────────────────────
//
// Existe separado da regra (`lib/atividades-tempo.ts`, pura e sem banco) e
// separado da rota por um motivo prático: a PÁGINA renderiza o primeiro
// resultado no servidor (pra tela não nascer vazia piscando "carregando") e a
// ROTA serve as trocas de período. Se cada uma escrevesse a própria consulta,
// bastaria alguém acrescentar um filtro num lado pra a tela mostrar um número
// no primeiro load e outro depois do primeiro clique — a classe de bug mais
// difícil de acreditar quando alguém relata.
// ESTE ARQUIVO NÃO PODE SER IMPORTADO POR UM `"use client"`. Ele puxa
// `createSupabaseAdminClient`, que puxa `next/headers` — e um componente de
// cliente que peça qualquer coisa daqui derruba o build inteiro com "You're
// importing a module that depends on next/headers". Foi o que aconteceu quando
// `PERIODOS` e `Tempos` moravam aqui e a tela os importava: `tsc --noEmit` e o
// `npm test` passavam, porque a regra é do empacotador. Por isso as constantes,
// o tipo e `diasValidos` foram pra `lib/atividades-tempo.ts` (puro) e daqui
// saem só REEXPORTADOS, pra quem já os importava deste caminho não quebrar.
// A trava é `lib/__tests__/cliente-nao-importa-servidor.test.ts`.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  tempoPorProduto, resumirTempos, diasValidos, TETO_ORDENS,
  type AtividadeMedida, type Tempos,
} from "@/lib/atividades-tempo";

export {
  MAX_DIAS, DIAS_PADRAO, PERIODOS, TETO_ORDENS, diasValidos,
} from "@/lib/atividades-tempo";
export type { Tempos } from "@/lib/atividades-tempo";

const COLUNAS =
  "id,tarefa,categoria,produto_nome,para_id,para_nome," +
  "iniciada_at,concluida_at,tempo_estimado_min,quantidade_feita";

export async function lerTempos(opcoes: { dias: number; paraId?: string | null }): Promise<Tempos> {
  const dias = diasValidos(opcoes.dias);
  const desde = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();

  const db = createSupabaseAdminClient();
  let q = db.from("atividades").select(COLUNAS)
    .eq("status", "concluida")
    .gte("concluida_at", desde)
    .order("concluida_at", { ascending: false })
    .limit(TETO_ORDENS);
  if (opcoes.paraId) q = q.eq("para_id", opcoes.paraId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const linhas = (data ?? []) as unknown as AtividadeMedida[];
  const grupos = tempoPorProduto(linhas);
  return {
    dias,
    grupos,
    resumo: resumirTempos(grupos),
    truncado: linhas.length >= TETO_ORDENS,
    escopo: opcoes.paraId ? "minhas" : "equipe",
  };
}
