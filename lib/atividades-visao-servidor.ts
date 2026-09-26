// ── Visão geral de Atividades: o que vem do banco ────────────────────────────
// Leituras feitas uma vez por abertura da página (sem poll: ver o comentário
// do VisaoGeral). As contas ficam em lib/atividades-visao.ts.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { listModelos } from "@/lib/producao-modelos";
import { PRODUTOS, RECEITAS } from "@/lib/producao-receita";
import { limparGrupos, type GrupoDaVisao } from "@/lib/atividades-lancador";
import type { ItemDaVisao, LinhaDeModelo } from "@/lib/atividades-visao";

export const COLS_ITEM_DA_VISAO = "id,nome,categoria,hierarquia,imagem_url,quantidade,qtd_minima,unidade";

type LinhaCrua = Omit<ItemDaVisao, "quantidade" | "qtd_minima"> & { quantidade: unknown; qtd_minima: unknown };
export const normalizarItem = (i: LinhaCrua): ItemDaVisao => ({
  ...i,
  quantidade: Number(i.quantidade) || 0,
  qtd_minima: Number(i.qtd_minima) || 0,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** A linha única de configuração da seção. Em degraus: `visao_grupos` chegou
 *  depois (categorias à mão) e pedir coluna que não existe derruba o SELECT
 *  inteiro — sem ela, a escolha de itens continua valendo. */
export async function lerConfigDaVisao(db: Db): Promise<{ ids: string[]; grupos: GrupoDaVisao[]; pronta: boolean }> {
  const ler = (cols: string) => db.from("atividades_config").select(cols).eq("id", true).maybeSingle();
  let r = await ler("visao_itens,visao_grupos");
  // `pronta` = tabela e colunas existem, então escolher produtos e salvar
  // grupos funciona. Sem isso a tela avisa que falta o SQL em vez de deixar a
  // pessoa montar tudo e só descobrir no erro do Salvar.
  const pronta = !r.error;
  if (r.error) r = await ler("visao_itens");
  const cfg = (r.data ?? null) as { visao_itens?: unknown; visao_grupos?: unknown } | null;
  const brutos: unknown[] = Array.isArray(cfg?.visao_itens) ? (cfg!.visao_itens as unknown[]) : [];
  return {
    ids: brutos.filter((x): x is string => typeof x === "string").slice(0, 300),
    grupos: limparGrupos(cfg?.visao_grupos),
    pronta,
  };
}

async function lerItens(db: Db, filtro: (q: Db) => Db): Promise<ItemDaVisao[]> {
  const ler = (cols: string) => filtro(db.from("estoque_itens").select(cols).eq("ativo", true))
    .order("nome", { ascending: true }).limit(300);
  let { data, error } = await ler(`${COLS_ITEM_DA_VISAO},setor_responsavel`);
  if (error) ({ data, error } = await ler(COLS_ITEM_DA_VISAO));
  if (error) return [];
  return ((data ?? []) as LinhaCrua[]).map(normalizarItem);
}

/**
 * Os itens da seção "Produtos e componentes". Quem configura escolhe quais
 * (o "Personalizar") e junta itens em categorias (o "Categorias"), tudo em
 * `atividades_config`; sem escolha — ou sem a tabela, antes de
 * supabase/atividades_itens_da_visao.sql — vale o padrão: produtos e
 * matérias-primas processadas. Os itens das categorias vêm SEMPRE, mesmo fora
 * da escolha: foi o dono que os pôs lá.
 */
export async function listItensDaVisao(): Promise<{ itens: ItemDaVisao[]; personalizado: boolean; grupos: GrupoDaVisao[]; configPronta: boolean }> {
  const db = createSupabaseAdminClient();
  const { ids, grupos, pronta: configPronta } = await lerConfigDaVisao(db);
  const personalizado = ids.length > 0;
  const itens = await lerItens(db, (q) => (personalizado ? q.in("id", ids) : q.in("hierarquia", ["produto", "mp_processada"])));
  const tem = new Set(itens.map((i) => i.id));
  const faltam = [...new Set(grupos.flatMap((g) => g.itens))].filter((id) => !tem.has(id)).slice(0, 300);
  if (faltam.length) itens.push(...await lerItens(db, (q) => q.in("id", faltam)));
  return { itens, personalizado, grupos, configPronta };
}

/** As tarefas de cada produto: o modelo salvo manda; sem ele (tabela vazia ou
 *  ausente), a receita fixa do código — a mesma que semeia a tabela. Aqui não
 *  se semeia nada: abrir uma tela não escreve no banco. */
export async function modelosDaVisao(): Promise<LinhaDeModelo[]> {
  const salvos = await listModelos().catch(() => null);
  if (salvos && salvos.length) {
    return salvos.map((m) => ({ produto: m.produto, fase: m.fase, tarefa: m.tarefa, ordem: m.ordem }));
  }
  return PRODUTOS.flatMap((p) => RECEITAS[p].map((e, i) => ({ produto: p, fase: e.fase, tarefa: e.tarefa, ordem: i })));
}
