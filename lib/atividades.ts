// ── Módulo Atividades — catálogo de atividades diárias (modelado no PDF
// "ATIVIDADES DIÁRIAS – PRODUÇÃO TRIDI") + atribuições persistidas no Supabase
// novo (tabela `atividades`). Hierarquia: admin atribui p/ qualquer um; cada
// gerente só atribui p/ colaboradores dos setores que comanda.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/rbac";
import type { Atividade, Colaborador } from "@/lib/atividades-catalog";

export {
  CATALOGO, CATEGORIAS, resumoProdutividade,
  type AtividadeTarefa, type AtividadeStatus, type Atividade, type Colaborador, type Produtividade,
} from "@/lib/atividades-catalog";

// Colunas da tabela `atividades`. Nomeadas em vez de `select("*")` (regra do
// CLAUDE.md): esta lista é lida num poll de 10 segundos, e com `*` qualquer
// coluna nova — um `jsonb` de anexos, um texto longo de observação — passaria a
// ser baixada por todo mundo, a cada ciclo, sem ninguém perceber.
const COLS_ATIVIDADE =
  "id,categoria,tarefa,detalhe,para_id,para_nome,por_id,por_nome,status,setor,pool," +
  "urgente,ordem,lote,claimed_at,prazo,quantidade_alvo,quantidade_feita," +
  "tempo_estimado_min,iniciada_at,produto_id,produto_nome,estoque_lancado," +
  "created_at,concluida_at,foto_url,impedida,motivo_impedimento,faixa";

// Setores que cada papel pode comandar (match por substring normalizada do setor
// do colaborador). admin = todos.
const MANAGES: Partial<Record<Role, string[]>> = {
  gerente_producao: ["produ", "design", "logist", "arte", "contorno", "maquin", "estoq"],
  gerente_vendas: ["venda", "comercial", "marketing", "trafego", "trafégo"],
};

const norm = (s: string | null | undefined) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Pode `role` atribuir a um colaborador deste setor?
export function podeAtribuir(role: Role, setor: string | null): boolean {
  if (role === "admin") return true;
  const keys = MANAGES[role];
  if (!keys) return false;
  const s = norm(setor);
  return keys.some((k) => s.includes(k));
}

interface EmpRow { setor: string | null; departamento?: string | null; photo_url?: string | null; especialidade?: string | null }

interface ColabRow {
  id: string; name: string; username: string; role: string;
  employees: EmpRow[] | EmpRow | null;
}

// Colaboradores que `me` pode atribuir atividades, conforme hierarquia.
export async function colaboradoresAtribuiveis(role: Role): Promise<Colaborador[]> {
  const db = createSupabaseAdminClient();
  const { data } = await db
    .from("profiles")
    .select("id,name,username,role,employees(setor,departamento,photo_url,especialidade)")
    .eq("active", true)
    .order("name", { ascending: true })
    .limit(500);        // toda listagem tem teto — a empresa não tem 500 ativos
  const rows = (data ?? []) as ColabRow[];
  return rows
    .map((r) => {
      const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees;
      return {
        id: r.id, nome: r.name || r.username, setor: emp?.setor ?? null, departamento: emp?.departamento ?? null,
        fotoUrl: emp?.photo_url ?? null, especialidade: emp?.especialidade ?? null,
      };
    })
    .filter((c) => podeAtribuir(role, c.setor));
}

// Quem tem Atividades › Atribuir atribui pra QUALQUER setor (decisão do dono,
// 11/09). A régua por cargo (`podeAtribuir`) segue valendo só pra quem ainda
// chama pelo papel — a tela e as rotas de Atividades usam esta.
export const colaboradoresDeTodosOsSetores = () => colaboradoresAtribuiveis("admin");

// Os status da CADEIA ficam fora das listas de trabalho: `aguardando_material`
// ainda não pode ser feita (falta material — quem mostra é o painel Produção
// do dia, com a explicação) e `cancelada` foi dispensada. Filtro em JS porque
// as consultas daqui usam `.or(...)` que não compõe com um `.not in`.
const foraDaCadeia = (a: { status?: string | null }) =>
  a.status !== "aguardando_material" && a.status !== "cancelada";

// `prioridade` (Alta · Média · Baixa) nasceu em 11/09/2026 com
// supabase/atividades_prioridade.sql. Até o SQL rodar a coluna não existe, e
// pedir por ela derrubaria a leitura INTEIRA — a tela abriria vazia. A primeira
// recusa desliga o pedido nesta instância e a leitura segue sem ela (a tela
// trata ausente como Média).
// `aceita_at` (atividades_ordens_v2.sql) segue a mesma tolerância: é o que
// mede o "tempo pra aceitar" da Visão geral, e sem ela a tela só perde o bloco.
const OPCIONAIS = ["prioridade", "aceita_at"] as const;
const ligadas = new Set<string>(OPCIONAIS);
type Leitura = { data: unknown[] | null; error: { code?: string; message?: string } | null };
async function lerComPrioridade(montar: (cols: string) => PromiseLike<Leitura>): Promise<Leitura> {
  for (;;) {
    const extras = OPCIONAIS.filter((c) => ligadas.has(c));
    const r = await montar(extras.length ? `${COLS_ATIVIDADE},${extras.join(",")}` : COLS_ATIVIDADE);
    const e = r.error;
    const culpada = e && extras.find((c) => (e.message ?? "").includes(c));
    const faltaColuna = e && (e.code === "42703" || /column|schema cache/i.test(e.message ?? ""));
    if (!e || !faltaColuna || !culpada) return r;
    ligadas.delete(culpada);
  }
}

export async function listAtividades(filtro?: { para_id?: string }): Promise<Atividade[]> {
  const db = createSupabaseAdminClient();
  const { data } = await lerComPrioridade((cols) => {
    let q = db.from("atividades").select(cols).order("created_at", { ascending: false }).limit(1500);
    if (filtro?.para_id) q = q.eq("para_id", filtro.para_id);
    return q;
  });
  return ((data ?? []) as Atividade[]).filter(foraDaCadeia);
}

// Meia-noite de hoje no fuso SP (UTC-3), em ISO UTC.
function spTodayStartIso(now = new Date()): string {
  const s = new Date(now.getTime() - 3 * 3600 * 1000);
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 3, 0, 0)).toISOString();
}

// Atividades ATIVAS (mostradas no app/colaborador): pendentes/em andamento, ou
// concluídas HOJE. Concluídas de dias anteriores saem (viram histórico).
export async function listAtividadesAtivas(filtro?: { para_id?: string }): Promise<Atividade[]> {
  const db = createSupabaseAdminClient();
  const hoje = spTodayStartIso();
  let q = db.from("atividades").select(COLS_ATIVIDADE)
    .or(`status.neq.concluida,concluida_at.gte.${hoje}`)
    .order("created_at", { ascending: false }).limit(500);
  if (filtro?.para_id) q = q.eq("para_id", filtro.para_id);
  const { data } = await q;
  return ((data ?? []) as Atividade[]).filter(foraDaCadeia);
}

// Setor do colaborador (employees.setor). Null se não tem.
export async function setorDoColaborador(id: string): Promise<string | null> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("employees").select("setor").eq("id", id).maybeSingle();
  return (data as { setor: string | null } | null)?.setor ?? null;
}

/**
 * As chaves de setor de uma pessoa: `employees.setor` E o departamento.
 *
 * Só o setor não basta: a equipe de Logística está cadastrada como setor
 * "Produção" / departamento "Logística" — pelo setor sozinho, uma ordem criada
 * no pool "Logística" não aparecia pra NINGUÉM. O departamento entra como
 * segunda chave de casamento, não como substituto.
 */
export async function setoresDoColaborador(id: string): Promise<string[]> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("employees").select("setor,departamento").eq("id", id).maybeSingle();
  const e = data as { setor: string | null; departamento: string | null } | null;
  return [e?.setor, e?.departamento].filter(Boolean) as string[];
}

/** As chaves de setor da pessoa E a especialidade, numa ida só — o que o
 *  pool do site precisa pra listar e pra deixar pegar (ver `podePegarDoPool`). */
export async function quemEParaOPool(id: string): Promise<{ chaves: string[]; especialidade: string | null }> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("employees").select("setor,departamento,especialidade").eq("id", id).maybeSingle();
  const e = data as { setor: string | null; departamento: string | null; especialidade: string | null } | null;
  return { chaves: [e?.setor, e?.departamento].filter(Boolean) as string[], especialidade: e?.especialidade ?? null };
}

/**
 * A ordem do pool casa com alguma das chaves da pessoa? Mesma comparação
 * frouxa (substring normalizada, nos dois sentidos) usada pelo tablet.
 * Pessoa sem chave nenhuma vê tudo — é o comportamento que o site sempre teve.
 */
export function poolCasaComPessoa(setorOrdem: string | null | undefined, chaves: string[]): boolean {
  const limpas = chaves.map(norm).filter(Boolean);
  if (limpas.length === 0) return true;
  const s = norm(setorOrdem);
  if (!s) return true;
  return limpas.some((c) => c.includes(s) || s.includes(c));
}

// Pool do setor: ordens pendentes SEM dono cujo setor casa (modelo Uber). Ordena
// por fase (ordem) e depois pela mais antiga. Tolerante: sem coluna `ordem`, cai
// só no created_at (o sort em JS ignora ordem ausente).
// Aceita uma chave (`string`) ou as chaves da pessoa (`string[]`, ver
// `setoresDoColaborador`) — qualquer uma casando basta.
export async function listPoolDoSetor(setor: string | string[] | null): Promise<Atividade[]> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("atividades").select(COLS_ATIVIDADE)
    .eq("status", "pendente").eq("pool", true).is("para_id", null)
    .order("created_at", { ascending: true }).limit(200);
  const chaves = (Array.isArray(setor) ? setor : [setor]).filter(Boolean) as string[];
  return ((data ?? []) as Atividade[])
    // Recusada no tablet espera o supervisor (fila de recusadas) — fora do
    // pool do site também, senão ela voltava por aqui.
    .filter((a) => !a.impedida && poolCasaComPessoa(a.setor, chaves))
    .sort((a, b) => {
      const oa = a.ordem == null ? Infinity : Number(a.ordem);
      const ob = b.ordem == null ? Infinity : Number(b.ordem);
      return oa !== ob ? oa - ob : String(a.created_at).localeCompare(String(b.created_at));
    });
}

// As canceladas: o `foraDaCadeia` as tira de TODA lista de trabalho (é isso que
// as faz sumir da fila de quem faz), então a coluna Cancelada do Histórico
// precisa de um pedido próprio. Teto baixo de propósito — é vista, não fila.
export async function listCanceladas(limite = 300): Promise<Atividade[]> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("atividades").select(COLS_ATIVIDADE)
    .eq("status", "cancelada")
    .order("created_at", { ascending: false }).limit(limite);
  return (data ?? []) as Atividade[];
}

// Histórico: atividades concluídas (quem fez, o quê, quando), mais recentes
// primeiro. O cliente agrupa por dia (concluida_at no fuso SP).
export async function listHistorico(filtro?: { para_id?: string; desde?: string }): Promise<Atividade[]> {
  const db = createSupabaseAdminClient();
  let q = db.from("atividades").select(COLS_ATIVIDADE)
    .eq("status", "concluida")
    .order("concluida_at", { ascending: false }).limit(1000);
  if (filtro?.para_id) q = q.eq("para_id", filtro.para_id);
  if (filtro?.desde) q = q.gte("concluida_at", filtro.desde);
  const { data } = await q;
  return (data ?? []) as Atividade[];
}
