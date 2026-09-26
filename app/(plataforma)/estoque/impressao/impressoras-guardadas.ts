"use client";

// ── Onde ficam as impressoras desta máquina ──────────────────────────────────
//
// `localStorage`, e o porquê está em lib/impressora-local.ts: a autorização de
// USB é do NAVEGADOR, e não existe API pra transferi-la. Guardar a lista no
// banco mostraria a Zebra do escritório pra quem está no galpão, com um botão
// que volta erro sem explicação possível.
//
// Toda leitura passa por `normalizarLista`, que é a régua: o que sai daqui é
// sempre um cadastro válido, mesmo quando o que está gravado é lixo de uma
// versão antiga ou de alguém mexendo no console.

import {
  normalizarLista, normalizarImpressora, type ImpressoraLocal,
} from "@/lib/impressora-local";

const CHAVE = "estoque.impressoras.v1";

/** Teto de impressoras por máquina. Ninguém tem oito Zebras na mesma mesa. */
export const TETO_DE_IMPRESSORAS = 8;

export function lerImpressoras(): ImpressoraLocal[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizarLista(JSON.parse(window.localStorage.getItem(CHAVE) ?? "[]"));
  } catch {
    // JSON quebrado é o estado de quem editou à mão. Uma lista vazia devolve a
    // pessoa ao diálogo do navegador, que imprime; estourar aqui derrubaria a
    // tela inteira de impressão por causa de uma vírgula.
    return [];
  }
}

export function gravarImpressoras(lista: ImpressoraLocal[]): ImpressoraLocal[] {
  const limpa = normalizarLista(lista).slice(0, TETO_DE_IMPRESSORAS);
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(limpa));
  } catch {
    // Cota estourada ou modo privado. A tela continua funcionando com a lista
    // em memória — o que se perde é a lembrança na próxima abertura, e avisar
    // isso a cada gravação seria ruído sobre um caso que quase não acontece.
  }
  return limpa;
}

/** Id novo. Só precisa ser único nesta máquina — não viaja pra lugar nenhum. */
export function novoId(): string {
  return `imp_${Math.random().toString(36).slice(2, 10)}`;
}

export function salvarImpressora(p: Partial<ImpressoraLocal>): ImpressoraLocal[] {
  const lista = lerImpressoras();
  const nova = normalizarImpressora({ ...p, id: p.id || novoId() });
  const i = lista.findIndex((x) => x.id === nova.id);
  if (i >= 0) lista[i] = nova; else lista.push(nova);
  // Marcar uma como padrão desmarca as outras aqui, e não só no
  // `normalizarLista`: sem isto a última da lista ganharia por posição.
  const final = nova.padrao ? lista.map((x) => ({ ...x, padrao: x.id === nova.id })) : lista;
  return gravarImpressoras(final);
}

export function apagarImpressora(id: string): ImpressoraLocal[] {
  return gravarImpressoras(lerImpressoras().filter((p) => p.id !== id));
}
