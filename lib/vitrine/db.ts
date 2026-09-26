// ── Persistência do tema ─────────────────────────────────────────────────────
// Duas colunas jsonb em `lojas`: `tema` (o que o visitante vê) e
// `tema_rascunho` (o que o lojista está mexendo). Publicar é copiar uma na
// outra e zerar a outra — não há histórico de versões, e isso é escolha: o
// Shopify guarda temas inteiros porque vende tema, aqui a volta atrás é
// desfazer no editor.
//
// Tolerante à ausência das colunas, igual ao resto de `lojas-db.ts`: quem ainda
// não rodou `supabase/lojas-tema.sql` vê a vitrine do modelo e o editor avisa
// que não grava. O módulo não fica de joelhos esperando uma ida ao SQL Editor.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { normalizarTema } from "./tema";
import type { Tema } from "./tipos";

export class TemaNaoPersistido extends Error {
  constructor() { super("coluna_ausente"); }
}

const semColuna = (msg: string | undefined) =>
  !!msg && /column .* does not exist|Could not find the '.*' column/i.test(msg);

export interface TemaDaLojaBanco {
  publicado: Tema | null;
  rascunho: Tema | null;
  /** `false` quando o SQL do tema ainda não rodou. */
  persistido: boolean;
}

/**
 * Lê os dois temas de uma vez. Uma ida só ao banco: a página do editor precisa
 * dos dois, e duas consultas seriam 250–700 ms a mais por abertura (ver a trava
 * de idas do financeiro).
 */
export async function lerTema(lojaId: string): Promise<TemaDaLojaBanco> {
  const { data, error } = await createSupabaseAdminClient()
    .from("lojas").select("tema, tema_rascunho").eq("id", lojaId).maybeSingle();

  if (error) {
    if (semColuna(error.message)) return { publicado: null, rascunho: null, persistido: false };
    throw new Error(error.message);
  }
  return {
    publicado: data?.tema ? normalizarTema(data.tema) : null,
    rascunho: data?.tema_rascunho ? normalizarTema(data.tema_rascunho) : null,
    persistido: true,
  };
}

/** Só o tema publicado — é o que a vitrine pública precisa. */
export async function lerTemaPublicado(lojaId: string): Promise<Tema | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("lojas").select("tema").eq("id", lojaId).maybeSingle();
  if (error) {
    if (semColuna(error.message)) return null;
    throw new Error(error.message);
  }
  return data?.tema ? normalizarTema(data.tema) : null;
}

/** Salva o rascunho. Não muda nada do que está no ar. */
export async function salvarRascunho(lojaId: string, tema: Tema): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("lojas").update({ tema_rascunho: tema }).eq("id", lojaId);
  if (error) {
    if (semColuna(error.message)) throw new TemaNaoPersistido();
    throw new Error(error.message);
  }
}

/**
 * Publica: o rascunho passado vira o tema no ar e o rascunho é zerado.
 *
 * Recebe o tema em vez de ler o rascunho do banco de propósito — publicar é
 * sempre "põe no ar ISTO que eu estou vendo". Ler do banco no meio abriria a
 * janela pra publicar o que outra aba salvou.
 */
export async function publicarTema(lojaId: string, tema: Tema): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("lojas").update({ tema, tema_rascunho: null }).eq("id", lojaId);
  if (error) {
    if (semColuna(error.message)) throw new TemaNaoPersistido();
    throw new Error(error.message);
  }
}

/** Joga fora o rascunho e volta ao que está no ar. */
export async function descartarRascunho(lojaId: string): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("lojas").update({ tema_rascunho: null }).eq("id", lojaId);
  if (error) {
    if (semColuna(error.message)) throw new TemaNaoPersistido();
    throw new Error(error.message);
  }
}
