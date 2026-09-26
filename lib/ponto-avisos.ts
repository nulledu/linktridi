// ── Aviso diário de ponto pro RH ─────────────────────────────────────────────
// O selo da lista só avisa quem abre a tela. Uma falta, uma saída sem batida ou
// uma jornada reconstruída de ONTEM precisa chegar a quem cuida do ponto sem
// depender de alguém lembrar de olhar.
//
// Mesmas duas regras do `lib/financeiro/avisos.ts`:
// 1. Notificação é escrita — nasce de rota acionada de propósito (o cron diário
//    do ponto), nunca de um ciclo de leitura.
// 2. Aviso repetido é aviso ignorado — o título leva a data, e antes de gravar
//    confere se a pessoa já recebeu aquele título.
//
// Uma notificação por pessoa do RH, com a lista inteira no corpo: seis avisos
// soltos da mesma manhã enchem o sino e escondem o que importa.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { chaveSub } from "@/lib/rh/gate";
import { bancoDeTodos } from "@/lib/banco-horas";
import { listFeriados } from "@/lib/ponto";
import { ROTULO_PROBLEMA } from "@/lib/jornada/tipos";

const db = () => createSupabaseAdminClient();
const CHAVE = chaveSub("ponto");

const hojeSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const somaDias = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export interface ResultadoAvisosPonto { dia: string; comProblema: number; destinatarios: number; avisos: number; pulados: number }

/** Quem cuida do ponto: todo perfil ativo com `rh:ponto` (o admin já resolve com tudo). */
async function destinatarios(): Promise<string[]> {
  const [{ data: perfis }, { data: fichas }] = await Promise.all([
    db().from("profiles").select("id,role,username").eq("active", true).limit(500),
    db().from("employees").select("id,permissoes").limit(500),
  ]);
  const perm = new Map(((fichas ?? []) as { id: string; permissoes: Record<string, boolean> | null }[]).map((f) => [f.id, f.permissoes]));
  const out: string[] = [];
  for (const p of (perfis ?? []) as { id: string; role: string; username: string | null }[]) {
    // Atalho antes do resolver (que consulta): sem a chave no mapa e sem ser
    // admin, não tem como ter o ponto do RH.
    if (p.role !== "admin" && !perm.get(p.id)?.[CHAVE] && !perm.get(p.id)?.["rh"]) continue;
    const keys = await resolveMyModuleKeys({ id: p.id, role: p.role as never, username: p.username });
    if (keys.includes(CHAVE)) out.push(p.id);
  }
  return out;
}

async function jaAvisado(userId: string, titulo: string): Promise<boolean> {
  try {
    const { count } = await db().from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("titulo", titulo);
    return (count ?? 0) > 0;
  } catch { return true; }   // sem tabela: não grava em loop
}

/** Olha o dia de ONTEM (SP) de todo mundo e avisa o RH do que ficou estranho. */
export async function avisarProblemasDoPonto(dia = somaDias(hojeSP(), -1), simular = false): Promise<ResultadoAvisosPonto & { titulo?: string; corpo?: string }> {
  const r: ResultadoAvisosPonto = { dia, comProblema: 0, destinatarios: 0, avisos: 0, pulados: 0 };
  const periodo = { de: dia, ate: dia };
  const feriados = new Map((await listFeriados(periodo)).map((f) => [f.dia, f.tipo]));
  const pessoas = await bancoDeTodos(periodo, feriados);

  const linhas = pessoas
    .flatMap((p) => p.diasComProblema.filter((d) => d.dia === dia).map((d) => ({ nome: p.nome, problema: d.problema })))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  r.comProblema = linhas.length;
  if (!linhas.length) return r;

  const quem = await destinatarios();
  r.destinatarios = quem.length;
  const n = linhas.length;
  const titulo = `Ponto de ${br(dia)}: ${n} ${n === 1 ? "pessoa precisa" : "pessoas precisam"} de conferência`;
  const corpo = linhas.slice(0, 12).map((l) => `${l.nome} — ${ROTULO_PROBLEMA[l.problema]}`).join("\n")
    + (n > 12 ? `\n+${n - 12} no painel` : "");

  if (simular) return { ...r, titulo, corpo };
  for (const id of quem) {
    if (await jaAvisado(id, titulo)) { r.pulados++; continue; }
    try {
      await db().from("notificacoes").insert({ user_id: id, tipo: "lembrete", titulo, corpo, link: "/rh/ponto", de_nome: "Ponto" });
      r.avisos++;
    } catch { /* uma a menos não derruba o resto */ }
  }
  return r;
}
