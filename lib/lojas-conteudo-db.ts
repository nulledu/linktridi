// ── Páginas e menus da loja — banco ──────────────────────────────────────────
// Só servidor. Os tipos e as regras moram em `lib/lojas-conteudo.ts`, que é
// importável do navegador — ver o cabeçalho de lá.
//
// Tolerante à ausência das tabelas em TODOS os caminhos: sem
// `supabase/lojas-paginas-menus.sql` rodado, as telas abrem, avisam o que falta
// e a vitrine segue com o menu deduzido das categorias.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  handleDaPagina, MENUS_PADRAO,
  type ItemDeMenu, type Menu, type Pagina, type StatusPagina,
} from "./lojas-conteudo";
import { normalizarBlocos, type BlocoPagina } from "./lojas-blocos";

const ausente = (msg: string | undefined) =>
  !!msg && /relation .* does not exist|Could not find the table/i.test(msg);

/**
 * A COLUNA `blocos` não existe (a tabela sim).
 *
 * Acontece em toda loja que rodou `lojas-paginas-menus.sql` antes do
 * `lojas-paginas-blocos.sql`. Sem esta distinção o construtor de páginas
 * derrubaria a tela inteira de Páginas, que funcionava — o preço de uma
 * migração pendente não pode ser perder o que já estava de pé.
 */
const semColunaBlocos = (msg: string | undefined) =>
  !!msg && /column .*blocos.* does not exist|Could not find the .*blocos.* column/i.test(msg);

export class ConteudoTabelaAusente extends Error {
  constructor() { super("tabela_ausente"); }
}

/** Gravou tudo MENOS os blocos — falta `supabase/lojas-paginas-blocos.sql`. */
export class BlocosColunaAusente extends Error {
  constructor(public pagina: Pagina) { super("coluna_blocos_ausente"); }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const paraPagina = (r: any): Pagina => ({
  id: r.id,
  lojaId: r.loja_id,
  titulo: r.titulo,
  handle: r.handle,
  conteudo: r.conteudo ?? "",
  blocos: normalizarBlocos(r.blocos),
  status: r.status,
  atualizadoEm: r.atualizado_em,
});

const paraMenu = (r: any): Menu => ({
  id: r.id,
  lojaId: r.loja_id,
  chave: r.chave,
  titulo: r.titulo,
  itens: Array.isArray(r.itens)
    ? (r.itens as any[])
        .filter((i) => i && typeof i.titulo === "string")
        .map((i) => ({ titulo: String(i.titulo).slice(0, 80), destino: String(i.destino ?? "").slice(0, 300) }))
    : [],
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const COLS_PAGINA = "id, loja_id, titulo, handle, conteudo, blocos, status, atualizado_em";
/** Sem a migração dos blocos. A página abre e edita como antes. */
const COLS_PAGINA_ANTIGA = "id, loja_id, titulo, handle, conteudo, status, atualizado_em";
const LIMITE = 200;

export async function listarPaginas(lojaId: string): Promise<Pagina[]> {
  const buscar = (cols: string) => createSupabaseAdminClient()
    .from("loja_paginas").select(cols)
    .eq("loja_id", lojaId).order("atualizado_em", { ascending: false }).limit(LIMITE);

  let { data, error } = await buscar(COLS_PAGINA);
  if (error && semColunaBlocos(error.message)) ({ data, error } = await buscar(COLS_PAGINA_ANTIGA));
  if (error) { if (ausente(error.message)) throw new ConteudoTabelaAusente(); throw new Error(error.message); }
  return (data ?? []).map(paraPagina);
}

/** A coluna `blocos` está de pé? A tela avisa o que ainda não dá pra fazer. */
export async function blocosDisponiveis(): Promise<boolean> {
  const { error } = await createSupabaseAdminClient().from("loja_paginas").select("blocos").limit(1);
  return !error || !semColunaBlocos(error.message);
}

/** Uma página PUBLICADA, pela vitrine. Rascunho devolve `null`. */
export async function getPaginaPublica(lojaId: string, handle: string): Promise<Pagina | null> {
  try {
    const buscar = (cols: string) => createSupabaseAdminClient()
      .from("loja_paginas").select(cols)
      .eq("loja_id", lojaId).eq("handle", handle).eq("status", "publicada").maybeSingle();
    let { data, error } = await buscar(COLS_PAGINA);
    if (error && semColunaBlocos(error.message)) ({ data, error } = await buscar(COLS_PAGINA_ANTIGA));
    if (error) return null;
    return data ? paraPagina(data) : null;
  } catch { return null; }
}

export interface EntradaPagina {
  titulo: string;
  handle: string;
  conteudo: string;
  blocos: BlocoPagina[];
  status: StatusPagina;
}

export async function salvarPagina(lojaId: string, p: EntradaPagina, id?: string): Promise<Pagina> {
  const db = createSupabaseAdminClient();
  const linha = {
    loja_id: lojaId,
    titulo: p.titulo.trim().slice(0, 120),
    handle: p.handle.trim().slice(0, 120),
    // O conteúdo é guardado CRU e higienizado ao sair (ver `higienizar`).
    // Higienizar na entrada perderia o original: uma regra nova de segurança
    // não conseguiria reprocessar o que já foi salvo mutilado.
    conteudo: p.conteudo.slice(0, 60_000),
    blocos: normalizarBlocos(p.blocos),
    status: p.status,
  };
  const gravar = (l: Record<string, unknown>, cols: string) => (id
    ? db.from("loja_paginas").update(l).eq("id", id).eq("loja_id", lojaId).select(cols).single()
    : db.from("loja_paginas").insert(l).select(cols).single());

  let { data, error } = await gravar(linha, COLS_PAGINA);
  if (error && semColunaBlocos(error.message)) {
    // Sem a coluna, o resto da página continua gravando. O construtor avisa que
    // os blocos não sobem — silenciar aqui seria dizer "salvo" pra um trabalho
    // que não existe mais quando a tela recarrega.
    const { blocos: _fora, ...semBlocos } = linha;
    ({ data, error } = await gravar(semBlocos, COLS_PAGINA_ANTIGA));
    if (!error) throw new BlocosColunaAusente(paraPagina(data));
  }
  if (error) {
    if (ausente(error.message)) throw new ConteudoTabelaAusente();
    if (/duplicate key|unique/i.test(error.message)) throw new Error("Já existe uma página com esse endereço.");
    throw new Error(error.message);
  }
  return paraPagina(data);
}

export async function removerPagina(lojaId: string, id: string): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("loja_paginas").delete().eq("id", id).eq("loja_id", lojaId);
  if (error) { if (ausente(error.message)) throw new ConteudoTabelaAusente(); throw new Error(error.message); }
}

// ── Menus ────────────────────────────────────────────────────────────────────

const COLS_MENU = "id, loja_id, chave, titulo, itens";

/**
 * Os menus da loja, criando os dois padrão na primeira visita.
 *
 * Nascer sozinho é deliberado: um "Navegação" que abre vazio e pede pra criar
 * um menu antes de qualquer coisa é uma parede na frente da tarefa. Os dois que
 * toda loja tem já estão lá.
 */
export async function listarMenus(lojaId: string): Promise<Menu[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("loja_menus").select(COLS_MENU).eq("loja_id", lojaId).limit(50);
  if (error) { if (ausente(error.message)) throw new ConteudoTabelaAusente(); throw new Error(error.message); }

  const existentes = (data ?? []).map(paraMenu);
  const faltando = MENUS_PADRAO.filter((m) => !existentes.some((e: Menu) => e.chave === m.chave));
  if (!faltando.length) return ordenarMenus(existentes);

  const { data: criados } = await db
    .from("loja_menus")
    .upsert(faltando.map((m) => ({ loja_id: lojaId, chave: m.chave, titulo: m.titulo, itens: [] })),
      { onConflict: "loja_id,chave", ignoreDuplicates: true })
    .select(COLS_MENU);
  return ordenarMenus([...existentes, ...(criados ?? []).map(paraMenu)]);
}

/** Principal, rodapé, e depois o que o lojista criou, por título. */
const ordenarMenus = (ms: Menu[]): Menu[] => {
  const peso = (c: string) => MENUS_PADRAO.findIndex((m) => m.chave === c);
  return [...ms].sort((a, b) => {
    const pa = peso(a.chave), pb = peso(b.chave);
    if (pa !== pb) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
    return a.titulo.localeCompare(b.titulo, "pt-BR");
  });
};

/** O menu de uma loja pela chave. `null` sem tabela — a vitrine cai no padrão. */
export async function getMenu(lojaId: string, chave: string): Promise<Menu | null> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("loja_menus").select(COLS_MENU).eq("loja_id", lojaId).eq("chave", chave).maybeSingle();
    if (error || !data) return null;
    return paraMenu(data);
  } catch { return null; }
}

export async function salvarMenu(lojaId: string, id: string, titulo: string, itens: ItemDeMenu[]): Promise<void> {
  const limpos = itens
    .map((i) => ({ titulo: i.titulo.trim().slice(0, 80), destino: i.destino.trim().slice(0, 300) }))
    .filter((i) => i.titulo)
    .slice(0, 40);
  const { error } = await createSupabaseAdminClient()
    .from("loja_menus").update({ titulo: titulo.trim().slice(0, 80), itens: limpos })
    .eq("id", id).eq("loja_id", lojaId);
  if (error) { if (ausente(error.message)) throw new ConteudoTabelaAusente(); throw new Error(error.message); }
}

export async function criarMenu(lojaId: string, titulo: string): Promise<Menu> {
  const db = createSupabaseAdminClient();
  const { data: atuais } = await db.from("loja_menus").select("chave").eq("loja_id", lojaId).limit(50);
  const usadas = (atuais ?? []).map((m: { chave: string }) => m.chave);
  const { data, error } = await db
    .from("loja_menus")
    .insert({ loja_id: lojaId, chave: handleDaPagina(titulo, usadas), titulo: titulo.trim().slice(0, 80), itens: [] })
    .select(COLS_MENU).single();
  if (error) { if (ausente(error.message)) throw new ConteudoTabelaAusente(); throw new Error(error.message); }
  return paraMenu(data);
}

export async function removerMenu(lojaId: string, id: string): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("loja_menus").delete().eq("id", id).eq("loja_id", lojaId);
  if (error) throw new Error(error.message);
}
