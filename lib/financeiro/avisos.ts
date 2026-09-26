// ── Os alertas saem da tela ──────────────────────────────────────────────────
// `alertas()` (calculos.ts) já sabe o que está atrasado, o que vence hoje e a
// garantia acabando — mas isso só aparecia DENTRO da Visão Geral. Quem não
// abrisse o Financeiro naquele dia não ficava sabendo de nada, que é o oposto
// do que um alerta serve.
//
// DUAS REGRAS QUE ESTE ARQUIVO EXISTE PARA CUMPRIR:
//
// 1. NOTIFICAÇÃO É ESCRITA, e escrita nunca nasce de um ciclo de leitura
//    (CLAUDE.md → "nunca escrever dentro de um poll"). Por isso nada aqui é
//    chamado por página: quem dispara é uma rota própria, acionada de propósito
//    — por um agendamento diário ou por um botão.
//
// 2. AVISO REPETIDO É AVISO IGNORADO. Rodar duas vezes no mesmo dia não pode
//    encher o sino com a mesma frase. A dedupe é por (pessoa, título, dia), lida
//    antes de gravar.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { alertas, hojeISO, somarDias } from "./calculos";
import { chaveSub } from "./gate";
import {
  compromissos, contarComprasSemNota, contarNotasSemCompra, listarEmpresas, patrimonio,
  recorrencias, empresasDoUsuario,
} from "./db";

const db = () => createSupabaseAdminClient();

export interface ResultadoAvisos {
  empresas: number;
  pessoas: number;
  avisos: number;
  pulados: number;      // já avisados hoje
}

/**
 * Quem recebe: todo mundo com `financeiro:ver`, e só das empresas que a pessoa
 * enxerga. Mandar o atraso da Tridi para quem só cuida da Gedux vazaria número
 * por notificação — o caminho mais fácil de furar a separação por empresa.
 */
async function destinatarios(): Promise<{ id: string; nome: string; empresas: Set<string> }[]> {
  // Nome, papel, usuário e "está ativo" moram em `profiles`; o mapa de
  // permissões, em `employees`. Esta consulta pedia os quatro de `employees`,
  // que não tem nenhum deles — o Postgres respondia «column does not exist», a
  // lista voltava vazia e o disparo terminava com "0 avisados", sem erro
  // nenhum na tela. Falha silenciosa: o pior desfecho para uma rotina que só
  // se prova mandando mensagem.
  const [{ data: perfis }, { data: fichas }] = await Promise.all([
    db().from("profiles").select("id,name,role,username").eq("active", true).limit(500),
    db().from("employees").select("id,permissoes").limit(500),
  ]);

  const permissoesDe = new Map(
    ((fichas ?? []) as { id: string; permissoes: Record<string, boolean> | null }[])
      .map((f) => [f.id, f.permissoes]),
  );

  const gente = ((perfis ?? []) as {
    id: string; name: string | null; role: string; username: string | null;
  }[]).map((p) => ({
    id: p.id, nome: p.name, role: p.role, username: p.username,
    permissoes: permissoesDe.get(p.id) ?? null,
  }));

  const out: { id: string; nome: string; empresas: Set<string> }[] = [];
  for (const p of gente) {
    // Atalho barato antes do resolver, que faz consulta: sem a chave no mapa a
    // pessoa não tem o Financeiro, e são centenas de linhas para varrer.
    if (!p.permissoes?.[chaveSub("ver")]) continue;
    const keys = await resolveMyModuleKeys({ id: p.id, role: p.role as never, username: p.username });
    if (!keys.includes(chaveSub("ver"))) continue;
    const { dados } = await empresasDoUsuario(p.id);
    out.push({ id: p.id, nome: p.nome ?? "", empresas: new Set(dados.map((e) => e.id)) });
  }
  return out;
}

/** Já mandei este aviso para esta pessoa hoje? */
async function jaAvisadoHoje(userId: string, titulo: string): Promise<boolean> {
  try {
    const { count } = await db()
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("titulo", titulo)
      // "Hoje" é o dia de São Paulo, que começa às 03:00 UTC.
      .gte("created_at", `${hojeISO()}T03:00:00Z`);
    return (count ?? 0) > 0;
  } catch {
    // Sem a tabela de notificações, "já avisei" é a resposta segura: melhor não
    // avisar do que gravar em loop numa tabela que não existe.
    return true;
  }
}

/**
 * Varre as empresas, monta os alertas e manda para quem tem direito.
 *
 * Devolve o que fez — a rota mostra isso, para quem acionou não precisar
 * adivinhar se funcionou.
 */
export async function dispararAvisos(): Promise<ResultadoAvisos> {
  const hoje = hojeISO();
  const r: ResultadoAvisos = { empresas: 0, pessoas: 0, avisos: 0, pulados: 0 };

  const { dados: empresas } = await listarEmpresas();
  if (!empresas.length) return r;

  const gente = await destinatarios();
  r.pessoas = gente.length;
  if (!gente.length) return r;

  for (const empresa of empresas) {
    const [fCompromissos, fPatrimonio, notasSoltas, fRecorrencias, comprasSemNota] = await Promise.all([
      // Janela curta: alerta é sobre o que está acontecendo agora. Puxar o ano
      // inteiro para descobrir o que vence em 3 dias é egress à toa.
      compromissos(empresa.id, { de: somarDias(hoje, -60), ate: somarDias(hoje, 7), limite: 300 }),
      patrimonio(empresa.id, { limite: 300 }),
      contarNotasSemCompra(empresa.id),
      recorrencias(empresa.id, { limite: 200 }),
      contarComprasSemNota(empresa.id),
    ]);

    const lista = alertas({
      compromissos: fCompromissos.dados,
      notasSemCompra: notasSoltas,
      patrimonioGarantia: fPatrimonio.dados,
      recorrencias: fRecorrencias.dados,
      comprasSemNota,
      hoje,
    });
    if (!lista.length) continue;
    r.empresas++;

    for (const pessoa of gente) {
      if (!pessoa.empresas.has(empresa.id)) continue;

      for (const a of lista) {
        // O nome da empresa entra no TÍTULO, não no corpo: com Tridi e Gedux o
        // mesmo aviso chega duas vezes, e sem o nome os dois são idênticos no
        // sino — e a dedupe por título juntaria os dois num só.
        const titulo = `${empresa.nome}: ${a.titulo}`;
        if (await jaAvisadoHoje(pessoa.id, titulo)) { r.pulados++; continue; }

        try {
          await db().from("notificacoes").insert({
            user_id: pessoa.id,
            tipo: "lembrete",
            titulo,
            corpo: a.detalhe,
            link: a.href ?? "/financeiro",
            de_nome: "Financeiro",
          });
          r.avisos++;
        } catch { /* uma notificação a menos não derruba o resto da varredura */ }
      }
    }
  }

  return r;
}
