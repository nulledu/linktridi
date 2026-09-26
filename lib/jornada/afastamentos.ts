// ── Férias e atestado, do RH pro cálculo (servidor) ──────────────────────────
// `rh_ferias` existia desde o módulo de RH e NINGUÉM no Ponto a lia. Trinta
// dias de férias viravam trinta faltas e ~240h de débito no banco de horas, e
// a pessoa aparecia "ausente" no painel todo dia enquanto estava na praia.
// `rh_atestados` tem o mesmo buraco com outro nome.
//
// Os dois viram a MESMA forma (`Afastamento`), porque pro cálculo a pergunta é
// uma só: "essa pessoa devia jornada nesse dia?". O rótulo é que difere.
//
// A ponte entre os módulos é `ponto_pessoas.colaborador_id` → `profiles.id`,
// que é o `employee_id` das tabelas do RH. Pessoa do Ponto sem colaborador
// vinculado simplesmente não tem afastamento — e isso está certo: não há como
// saber de quem seriam as férias.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached } from "@/lib/cache";
import { SELO_FERIAS, SELO_ATESTADO, ehFeriasStatus, ehAtestadoStatus } from "@/lib/rh/tipos";
import type { Afastamento } from "./tipos";

/** Teto de uma janela. Um mês de folha tem dezenas de afastamentos, não mil. */
const TETO = 500;

const tabelaAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message ?? ""));

/** Férias que CONTAM: programada e em gozo. Concluída conta também — ela já
 *  aconteceu, e o banco de horas recalcula o passado toda vez que abre. O que
 *  NÃO conta é a cancelada: aquele período voltou a ser dia de trabalho. */
const FERIAS_QUE_CONTAM = ["programada", "em_gozo", "concluida"] as const;

/**
 * Férias e atestados de TODO MUNDO que tocam a janela, agrupados por
 * `employee_id`.
 *
 * Uma consulta por tabela, não uma por pessoa: o painel do Ponto monta o mês
 * inteiro da equipe, e perguntar pessoa a pessoa seriam 50 idas ao Supabase
 * por carga. A janela usa o índice `rh_ferias_janela (de, ate)`, que o
 * `supabase/rh.sql` já criou exatamente pra esta consulta.
 */
async function buscarAfastamentos(de: string, ate: string): Promise<Map<string, Afastamento[]>> {
  const db = createSupabaseAdminClient();
  const porPessoa = new Map<string, Afastamento[]>();
  const juntar = (employeeId: string, a: Afastamento) => {
    const lista = porPessoa.get(employeeId);
    if (lista) lista.push(a); else porPessoa.set(employeeId, [a]);
  };

  // Sobreposição de intervalos: começou antes do fim da janela E terminou
  // depois do começo dela. Férias de 01/09 a 30/09 precisa aparecer numa
  // janela de 15/09 a 20/09, e só esta comparação faz isso.
  const [ferias, atestados] = await Promise.all([
    db.from("rh_ferias").select("id,employee_id,de,ate,status")
      .lte("de", ate).gte("ate", de).in("status", FERIAS_QUE_CONTAM as readonly string[])
      .order("de").limit(TETO),
    db.from("rh_atestados").select("id,employee_id,de,ate,status")
      .lte("de", ate).gte("ate", de).eq("status", "aceito")
      .order("de").limit(TETO),
  ]);

  if (!ferias.error) {
    for (const f of (ferias.data ?? []) as { id: string; employee_id: string; de: string; ate: string; status: string }[]) {
      juntar(f.employee_id, {
        tipo: "ferias", id: f.id, de: f.de, ate: f.ate,
        situacao: ehFeriasStatus(f.status) ? SELO_FERIAS[f.status].label : null,
      });
    }
  } else if (!tabelaAusente(ferias.error)) {
    // Erro de verdade (não "tabela não existe") não pode virar silêncio: sem
    // isso, uma falha de permissão vira "ninguém está de férias" e o banco de
    // horas cobra o mês inteiro de quem estava fora.
    throw new Error(`rh_ferias: ${ferias.error.message}`);
  }

  if (!atestados.error) {
    for (const a of (atestados.data ?? []) as { id: string; employee_id: string; de: string; ate: string; status: string }[]) {
      juntar(a.employee_id, {
        tipo: "atestado", id: a.id, de: a.de, ate: a.ate,
        situacao: ehAtestadoStatus(a.status) ? SELO_ATESTADO[a.status].label : null,
      });
    }
  } else if (!tabelaAusente(atestados.error)) {
    throw new Error(`rh_atestados: ${atestados.error.message}`);
  }

  return porPessoa;
}

/** O mesmo, com cache de 5 min. O painel do Ponto recarrega a cada tick e o
 *  afastamento não muda de minuto em minuto — quem cadastra invalida. */
export function afastamentosDaJanela(de: string, ate: string): Promise<Map<string, Afastamento[]>> {
  return cached(`jornada:afastamentos:${de}:${ate}`, 5 * 60_000, () => buscarAfastamentos(de, ate));
}

/** Tolerante: qualquer falha vira "ninguém afastado". Use só onde a tela
 *  precisa continuar de pé mais do que precisa do número exato. */
export async function afastamentosOuVazio(de: string, ate: string): Promise<Map<string, Afastamento[]>> {
  try { return await afastamentosDaJanela(de, ate); } catch { return new Map(); }
}

/** Os afastamentos de UMA pessoa (pelo id do colaborador/profile). */
export async function afastamentosDe(employeeId: string, de: string, ate: string): Promise<Afastamento[]> {
  return (await afastamentosOuVazio(de, ate)).get(employeeId) ?? [];
}
