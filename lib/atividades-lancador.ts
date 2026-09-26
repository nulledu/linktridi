// ── Lançar atividade a partir de um item (Visão geral de Atividades) ─────────
//
// O pedido do dono (11/09/2026): clicar num produto abre as atividades
// possíveis dele e os componentes da ficha técnica; escolher uma atividade já
// mostra o setor dela (Máquinas, Produção, Preparo… — dá pra trocar) e as
// pessoas daquele setor. Ex.: Carimbo › Puxador › "Cortar peças do puxador"
// (Máquinas) ou "Montar puxador" (Produção).
//
// Puro, sem banco. Quem pode receber segue a MESMA régua do pool do tablet
// (lib/atividade-faixa.ts): se a tela oferecesse o Felipe pra uma peça de
// máquina, a atribuição valeria aqui e o tablet discordaria.

import { faixaDaAtividade, podeFaixa, QUEM_FAZ, type Faixa } from "@/lib/atividade-faixa";
import { LABEL_PRODUTO, PRODUTOS } from "@/lib/producao-receita";
import type { Atividade, Colaborador } from "@/lib/atividades-catalog";
import { situacaoDoItem, type ItemDaVisao, type LinhaDeModelo, type SituacaoDoItem } from "@/lib/atividades-visao";

const norm = (s: string | null | undefined) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export const ehFaixa = (v: unknown): v is Faixa => v === "maquinas" || v === "producao" || v === "preparo";

/** As três faixas da produção, com o nome que a bancada usa. */
export const SETORES_DA_PRODUCAO: readonly string[] = QUEM_FAZ.map((q) => q.valor);

/** "Máquinas" → maquinas, "Preparo" → preparo, "Produção" → producao; outro setor → null. */
export function faixaDoSetor(setor: string | null | undefined): Faixa | null {
  const s = norm(setor);
  if (s.includes("maquina")) return "maquinas";
  if (s.includes("preparo")) return "preparo";
  if (s.includes("produc")) return "producao";
  return null;
}
export const setorDaFaixa = (f: Faixa): string => QUEM_FAZ.find((q) => q.faixa === f)?.valor ?? "Produção";

const ehLogistica = (s: string | null | undefined) => /logist|expedi/.test(norm(s));

/** Pra onde uma atividade pode ir: as três faixas da produção, a Logística e
 *  os outros setores que aparecem no cadastro das pessoas (Marketing…).
 *  A Logística olha o DEPARTAMENTO também: a equipe dela (Felipe, Henrique)
 *  está cadastrada como setor "Produção" / departamento "Logística" — pelo
 *  setor sozinho ela nunca aparecia na escolha. */
export function setoresDisponiveis(colaboradores: Colaborador[]): string[] {
  // SÓ a produção (Máquinas/Produção/Preparo) e a Logística recebem atividade
  // (decisão do dono, 23/09/2026). Marketing, Financeiro etc. saíram da lista.
  const logistica = colaboradores.some((c) => ehLogistica(c.setor) || ehLogistica(c.departamento));
  return [...SETORES_DA_PRODUCAO, ...(logistica ? ["Logística"] : [])];
}

/** Essa pessoa pode RECEBER atividade? Produção (e as faixas dela) ou Logística,
 *  pelo setor ou pelo departamento. A MESMA régua na tela e nas rotas. */
export function podeReceberAtividade(c: { setor?: string | null; departamento?: string | null }): boolean {
  const casa = (s: string | null | undefined) => ehLogistica(s) || faixaDoSetor(s) !== null;
  return casa(c.setor) || casa(c.departamento);
}

/** O setor de um POOL só pode ser da produção ou da Logística. */
export const setorRecebeAtividade = (setor: string | null | undefined): boolean =>
  ehLogistica(setor) || faixaDoSetor(setor) !== null;

/** Quem recebe uma atividade deste setor. Nas faixas da produção: gente da
 *  Produção COM especialidade e faixa compatível — sem especialidade a pessoa
 *  não é da bancada (era assim que peça caía pra quem é da Logística). Nos
 *  outros setores, o setor OU o departamento da pessoa (é o mesmo casamento
 *  do pool — lib/atividades.ts › setoresDoColaborador). */
export function pessoasDoSetor(colaboradores: Colaborador[], setor: string): Colaborador[] {
  const f = faixaDoSetor(setor);
  const alvo = norm(setor);
  const casa = (c: Colaborador) => ehLogistica(setor)
    ? ehLogistica(c.setor) || ehLogistica(c.departamento)
    : norm(c.setor) === alvo || norm(c.departamento) === alvo;
  return colaboradores
    .filter((c) => f
      ? (norm(c.setor).includes("produc") || faixaDoSetor(c.setor) !== null)
        && !!norm(c.especialidade) && podeFaixa(c.especialidade, f)
      : casa(c))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** O setor que o POOL usa pra casar com a pessoa. As faixas moram todas no
 *  setor Produção (a faixa separa quem pega); os outros são o próprio nome. */
export const setorDoPool = (setor: string): string => (faixaDoSetor(setor) ? "Produção" : setor);

// ── As atividades possíveis de um item ──────────────────────────────────────

/** Linha da tabela `atividades_opcoes` (o "Adicionar atividade" do pop-up). */
export interface OpcaoSalva { id: string; item_id: string; nome: string; setor: string; ordem: number }

export interface OpcaoDeAtividade {
  chave: string;
  id?: string;
  nome: string;
  setor: string;
  origem: "salva" | "modelo" | "produzir";
  /** A atividade PRODUZ o item (a peça entra no estoque na conferência). Só o
   *  "Produzir X": marcar o produto numa ETAPA lançaria estoque errado —
   *  "Cortar peças do puxador" não produz um puxador. */
  produz: boolean;
  fase?: number;
}

/** O produto do modelo de produção que o item É ("Carimbos" ↔ carimbo). */
export function produtoDoModelo(item: Pick<ItemDaVisao, "nome" | "categoria">): string | null {
  const cands = [norm(item.categoria), norm(item.nome)].map((s) => s.replace(/s$/, "")).filter(Boolean);
  for (const p of PRODUTOS) {
    if (cands.includes(norm(LABEL_PRODUTO[p]).replace(/s$/, ""))) return p;
  }
  return null;
}

/**
 * As opções, nesta ordem: as criadas pra este item (o que o dono ensinou), as
 * etapas do modelo quando o item é um produto de modelo (Carimbo, Chancela…),
 * e — pra quem não é produto de modelo — o "Produzir X" com o setor do "Quem
 * faz" do item. Nome repetido entra uma vez só.
 */
export function opcoesDoItem(item: ItemDaVisao, salvas: OpcaoSalva[], modelos: LinhaDeModelo[]): OpcaoDeAtividade[] {
  const out: OpcaoDeAtividade[] = [];
  const vistos = new Set<string>();
  const add = (o: OpcaoDeAtividade) => {
    const k = norm(o.nome);
    if (!k || vistos.has(k)) return;
    vistos.add(k);
    out.push(o);
  };
  salvas.slice()
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
    .forEach((s) => add({ chave: `s:${s.id}`, id: s.id, nome: s.nome, setor: s.setor || "Produção", origem: "salva", produz: false }));
  const p = produtoDoModelo(item);
  if (p) {
    modelos.filter((m) => m.produto === p)
      .sort((a, b) => a.fase - b.fase || (a.ordem ?? 0) - (b.ordem ?? 0))
      .forEach((m) => add({
        chave: `m:${m.tarefa}`, nome: m.tarefa, setor: setorDaFaixa(faixaDaAtividade(null, m.tarefa, null)),
        origem: "modelo", produz: false, fase: m.fase,
      }));
  } else {
    add({
      chave: "produzir", nome: `Produzir ${item.nome}`,
      setor: setorDaFaixa(faixaDaAtividade(item.setor_responsavel ?? null, item.nome, item.categoria)),
      origem: "produzir", produz: true,
    });
  }
  return out;
}

/** O que já está rolando com o item: ordens dele (produto), atividades da
 *  categoria dele e as das opções. Aberto antes de concluído; mais nova primeiro. */
export function relacionadasAoItem(lista: Atividade[], nome: string, tarefas: string[] = []): Atividade[] {
  const n = norm(nome);
  const ts = new Set(tarefas.map(norm));
  const aberta = (a: Atividade) => a.status === "pendente" || a.status === "em_andamento";
  return lista
    .filter((a) => norm(a.produto_nome) === n || norm(a.categoria) === n || ts.has(norm(a.tarefa)))
    .sort((a, b) => Number(aberta(b)) - Number(aberta(a)) || Date.parse(b.created_at) - Date.parse(a.created_at));
}

// ── Categorias criadas à mão ────────────────────────────────────────────────

/** Uma categoria do "Categorias" da Visão geral (pedido do dono, 11/09/2026):
 *  vários itens (Almofada 11, 16, 22x22…) viram UM cartão; clicar abre os
 *  tamanhos. Guardada em `atividades_config.visao_grupos`. */
export interface GrupoDaVisao { id: string; nome: string; itens: string[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O que vem do banco ou do corpo da requisição, limpo: nome obrigatório (até
 *  60), id estável, itens por uuid sem repetir. Tetos: 50 categorias, 200 itens
 *  em cada. Lixo sai calado — é configuração, não formulário. */
export function limparGrupos(bruto: unknown): GrupoDaVisao[] {
  if (!Array.isArray(bruto)) return [];
  const out: GrupoDaVisao[] = [];
  const vistos = new Set<string>();
  for (const g of bruto.slice(0, 50)) {
    if (!g || typeof g !== "object") continue;
    const o = g as Record<string, unknown>;
    const id = typeof o.id === "string" && /^[\w-]{1,60}$/.test(o.id) ? o.id : "";
    const nome = typeof o.nome === "string" ? o.nome.trim().slice(0, 60) : "";
    if (!id || !nome || vistos.has(id)) continue;
    vistos.add(id);
    const itens = Array.isArray(o.itens)
      ? [...new Set(o.itens.filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 200)
      : [];
    out.push({ id, nome, itens });
  }
  return out;
}

export type EntradaDaVisao =
  | { tipo: "item"; id: string; nome: string; hierarquia: string | null; item: ItemDaVisao }
  | { tipo: "grupo"; id: string; nome: string; hierarquia: string | null; grupo: GrupoDaVisao; itens: ItemDaVisao[] };

/**
 * Os cartões da seção. Cada categoria vira UM cartão — no grupo do tipo que
 * mais aparece dentro dela — e os itens dela saem da lista solta: o mesmo item
 * num cartão próprio e dentro da categoria faria a contagem mentir. Item em
 * duas categorias aparece nas duas. Categoria sem nenhum item ativo some.
 */
export function entradasDaVisao(itens: ItemDaVisao[], grupos: GrupoDaVisao[]): EntradaDaVisao[] {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const agrupados = new Set<string>();
  const cartoes: EntradaDaVisao[] = [];
  for (const g of grupos) {
    const dentro = g.itens.map((id) => porId.get(id)).filter((i): i is ItemDaVisao => !!i);
    if (!dentro.length) continue;
    dentro.forEach((i) => agrupados.add(i.id));
    const conta = new Map<string | null, number>();
    for (const i of dentro) conta.set(i.hierarquia, (conta.get(i.hierarquia) ?? 0) + 1);
    const hierarquia = [...conta].sort((a, b) => b[1] - a[1])[0][0];
    cartoes.push({ tipo: "grupo", id: `g:${g.id}`, nome: g.nome, hierarquia, grupo: g, itens: dentro });
  }
  for (const i of itens) {
    if (!agrupados.has(i.id)) cartoes.push({ tipo: "item", id: i.id, nome: i.nome, hierarquia: i.hierarquia, item: i });
  }
  return cartoes;
}

/** O estoque da categoria num olhar: o pior selo de dentro (e quantos estão
 *  nele) e o saldo somado — só quando todos usam a mesma unidade, porque
 *  3 un + 2 fl não são 5 de nada. */
export function resumoDoGrupo(itens: ItemDaVisao[]): {
  pior: SituacaoDoItem; quantos: number; saldo: number | null; unidade: string | null;
} {
  const sits = itens.map(situacaoDoItem);
  const sem = sits.filter((s) => s === "sem_estoque").length;
  const minimo = sits.filter((s) => s === "no_minimo").length;
  const unidades = new Set(itens.map((i) => i.unidade ?? ""));
  const mesma = unidades.size === 1;
  return {
    pior: sem ? "sem_estoque" : minimo ? "no_minimo" : "em_estoque",
    quantos: sem || minimo || itens.length,
    saldo: mesma ? itens.reduce((s, i) => s + i.quantidade, 0) : null,
    unidade: mesma ? [...unidades][0] || null : null,
  };
}

/** Os itens do catálogo que casam com o nome da categoria ("Almofada" pega
 *  "Almofadas 22x22" e "almofada 11") — o atalho "marcar os que têm o nome". */
export function itensComONome<T extends { nome: string }>(catalogo: T[], nome: string): T[] {
  const alvo = norm(nome).replace(/s$/, "");
  if (alvo.length < 2) return [];
  return catalogo.filter((i) => norm(i.nome).includes(alvo));
}

// ── Grupos da Visão geral ───────────────────────────────────────────────────

const GRUPOS: { chave: string; rotulo: string }[] = [
  { chave: "produto", rotulo: "Produtos" },
  { chave: "componente", rotulo: "Componentes" },
  { chave: "peca", rotulo: "Peças" },
  { chave: "mp_processada", rotulo: "Matérias-primas processadas" },
  { chave: "materia_prima", rotulo: "Matérias-primas" },
  { chave: "insumo_direto", rotulo: "Insumos diretos" },
  { chave: "insumo_indireto", rotulo: "Insumos indiretos" },
  { chave: "embalagem", rotulo: "Embalagens" },
];

/** Produtos, depois componentes, peças, matérias-primas… (o que se monta
 *  antes do que se compra). Hierarquia desconhecida vai pra "Outros". */
export function gruposPorHierarquia<T extends { hierarquia: string | null; nome: string }>(itens: T[]) {
  const por = new Map<string, T[]>();
  for (const i of itens) {
    const k = GRUPOS.some((g) => g.chave === i.hierarquia) ? String(i.hierarquia) : "outros";
    const g = por.get(k);
    if (g) g.push(i); else por.set(k, [i]);
  }
  return [...GRUPOS, { chave: "outros", rotulo: "Outros" }]
    .filter((g) => por.has(g.chave))
    .map((g) => ({ ...g, itens: por.get(g.chave)! }));
}
