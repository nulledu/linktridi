// ── Ajustes da própria pessoa (servidor) ─────────────────────────────────────
// A página inicial é a MESMA coluna que quem administra a equipe edita na
// ficha (employees.pagina_inicial): um campo só, vale a última escolha — da
// pessoa ou do admin. Daqui a pessoa mexe só na DELA (id da sessão) e só em
// área que tem, pela mesma razão de `resolverPaginaInicial`: um atalho pra área
// sem acesso mandaria o login direto pro 403.
import { MODULES } from "@/lib/rbac";
import { PAGINAS_INICIAIS, ehPaginaInicialValida } from "@/lib/pagina-inicial";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { invalidate } from "@/lib/cache";

export type OpcaoDeInicio = { key: string; label: string };

/** Área pronta do sistema que a pessoa TEM. */
export function paginaInicialPermitida(v: unknown, keys: string[]): v is string {
  return ehPaginaInicialValida(v) && keys.includes(v);
}

/** O que ela pode escolher: as áreas prontas que tem, com o nome de cada uma. */
export function opcoesDePaginaInicial(keys: string[]): OpcaoDeInicio[] {
  return PAGINAS_INICIAIS.filter((m) => keys.includes(m.key)).map((m) => ({ key: m.key, label: m.label }));
}

/** Nome de onde a pessoa cai sem escolha nenhuma (a home do papel). */
export function nomeDoPadrao(href: string): string {
  return MODULES.find((m) => m.href === href)?.label ?? "Início";
}

// Coluna ausente = SQL de supabase/colaborador_pagina_inicial.sql não rodado.
const COLUNA_AUSENTE = new Set(["42703", "PGRST204"]);

/** A escolha gravada na ficha. `disponivel: false` quando não há coluna ou
 *  não há ficha de colaborador — aí os Ajustes nem mostram o seletor. */
export async function lerPaginaInicialDaFicha(userId: string): Promise<{ disponivel: boolean; valor: string | null }> {
  const { data, error } = await createSupabaseAdminClient()
    .from("employees").select("pagina_inicial").eq("id", userId).maybeSingle();
  if (error) {
    if (COLUNA_AUSENTE.has(error.code)) return { disponivel: false, valor: null };
    throw error;
  }
  if (!data) return { disponivel: false, valor: null };
  const v = (data as { pagina_inicial?: string | null }).pagina_inicial ?? null;
  return { disponivel: true, valor: ehPaginaInicialValida(v) ? v : null };
}

export type Gravacao = { ok: true } | { ok: false; status: number; detail: string };

/** Grava na PRÓPRIA ficha e derruba o cache do `/inicio`, pra valer no
 *  próximo login e não em até um minuto. */
export async function gravarPaginaInicial(userId: string, valor: string | null): Promise<Gravacao> {
  const { data, error } = await createSupabaseAdminClient()
    .from("employees").update({ pagina_inicial: valor }).eq("id", userId).select("id");
  if (error) {
    if (COLUNA_AUSENTE.has(error.code)) {
      return { ok: false, status: 409, detail: "A página inicial ainda não está ligada neste sistema (falta rodar supabase/colaborador_pagina_inicial.sql)." };
    }
    return { ok: false, status: 500, detail: "Não deu pra salvar agora. Tente de novo." };
  }
  if (!data || data.length === 0) {
    return { ok: false, status: 404, detail: "Sua ficha de colaborador não existe. Peça a quem administra a equipe." };
  }
  invalidate(`pagina-inicial:${userId}`);
  return { ok: true };
}
