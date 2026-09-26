// Operações de edição do documento da página. Funções PURAS: recebem o doc,
// devolvem um doc novo. É o que faz o undo/redo por snapshot ser confiável —
// nenhuma mutação escondida, nenhum estado derivado pra sincronizar.

import { clonarBloco, mapPagina, novaSecao, novoBloco, type Bloco, type BlocoTipo, type Estilo, type PaginaConfig, type PaginaDoc, type Secao, type Visibilidade } from "./tridiflow-pagina";

/** Aplica um patch raso num bloco (em qualquer nível da árvore). */
export function patchBloco(doc: PaginaDoc, id: string, patch: Partial<Bloco>): PaginaDoc {
  return mapPagina(doc, (b) => (b.id === id ? { ...b, ...patch } : b));
}

export function patchEstiloBloco(doc: PaginaDoc, id: string, patch: Partial<Estilo>): PaginaDoc {
  return mapPagina(doc, (b) => (b.id === id ? { ...b, estilo: { ...b.estilo, ...patch } } : b));
}

export function setVisibilidade(doc: PaginaDoc, id: string, v: Visibilidade): PaginaDoc {
  return mapPagina(doc, (b) => (b.id === id ? { ...b, visivel: v } : b));
}

export function removerBloco(doc: PaginaDoc, id: string): PaginaDoc {
  return mapPagina(doc, (b) => (b.id === id ? null : b));
}

export function alternarOculto(doc: PaginaDoc, id: string): PaginaDoc {
  return mapPagina(doc, (b) => (b.id === id ? { ...b, oculto: !b.oculto } : b));
}

/** Duplica o bloco logo abaixo dele, no MESMO nível (inclusive dentro de colunas). */
export function duplicarBlocoNoDoc(doc: PaginaDoc, id: string): PaginaDoc {
  const dup = (lista: Bloco[]): Bloco[] => {
    const saida: Bloco[] = [];
    for (const b of lista) {
      const filho: Bloco = {
        ...b,
        blocos: b.blocos ? dup(b.blocos) : undefined,
        colunas: b.colunas ? b.colunas.map((c) => ({ ...c, blocos: dup(c.blocos) })) : undefined,
      };
      saida.push(filho);
      if (b.id === id) saida.push(clonarBloco(b));
    }
    return saida;
  };
  return { ...doc, secoes: doc.secoes.map((s) => ({ ...s, blocos: dup(s.blocos) })) };
}

/** Move o bloco uma posição pra cima (-1) ou pra baixo (+1) dentro do irmão. */
export function moverBloco(doc: PaginaDoc, id: string, dir: -1 | 1): PaginaDoc {
  const mover = (lista: Bloco[]): Bloco[] => {
    const i = lista.findIndex((b) => b.id === id);
    if (i >= 0) {
      const j = i + dir;
      if (j < 0 || j >= lista.length) return lista;
      const copia = [...lista];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    }
    // Não está aqui: desce um nível.
    return lista.map((b) => ({
      ...b,
      blocos: b.blocos ? mover(b.blocos) : undefined,
      colunas: b.colunas ? b.colunas.map((c) => ({ ...c, blocos: mover(c.blocos) })) : undefined,
    }));
  };
  return { ...doc, secoes: doc.secoes.map((s) => ({ ...s, blocos: mover(s.blocos) })) };
}

/**
 * Arrastar-e-soltar: tira o bloco de onde estiver (inclusive de dentro de um
 * container/coluna) e coloca numa SEÇÃO, na posição pedida.
 *
 * Reposicionar dentro da mesma seção é o caso comum e tem uma pegadinha: depois
 * de remover o bloco, os índices seguintes andam um pra trás. Por isso o índice
 * é corrigido quando a origem vinha antes do destino — senão soltar "logo
 * abaixo do vizinho" cai um lugar errado.
 */
export function moverBlocoPara(doc: PaginaDoc, blocoId: string, secaoId: string, indice: number): PaginaDoc {
  let arrastado: Bloco | null = null;
  const retirar = (lista: Bloco[]): Bloco[] => {
    const saida: Bloco[] = [];
    for (const b of lista) {
      if (b.id === blocoId) { arrastado = b; continue; }
      saida.push({
        ...b,
        blocos: b.blocos ? retirar(b.blocos) : undefined,
        colunas: b.colunas ? b.colunas.map((c) => ({ ...c, blocos: retirar(c.blocos) })) : undefined,
      });
    }
    return saida;
  };

  // Onde ele estava, para corrigir o índice quando o destino é a mesma seção.
  const secaoOrigem = secaoDoBloco(doc, blocoId);
  const idxOrigem = secaoOrigem === secaoId
    ? doc.secoes.find((s) => s.id === secaoId)?.blocos.findIndex((b) => b.id === blocoId) ?? -1
    : -1;

  const semBloco = doc.secoes.map((s) => ({ ...s, blocos: retirar(s.blocos) }));
  if (!arrastado) return doc;              // não achou: não mexe em nada

  const alvo = idxOrigem >= 0 && idxOrigem < indice ? indice - 1 : indice;
  return {
    ...doc,
    secoes: semBloco.map((s) => {
      if (s.id !== secaoId) return s;
      const blocos = [...s.blocos];
      blocos.splice(Math.max(0, Math.min(blocos.length, alvo)), 0, arrastado as Bloco);
      return { ...s, blocos };
    }),
  };
}

/** Insere um bloco novo no fim da seção (ou dentro do container/coluna alvo). */
export function addBloco(doc: PaginaDoc, secaoId: string, tipo: BlocoTipo, alvo?: { blocoId: string; coluna?: number }): PaginaDoc {
  const novo = novoBloco(tipo);
  if (!alvo) {
    return { ...doc, secoes: doc.secoes.map((s) => (s.id === secaoId ? { ...s, blocos: [...s.blocos, novo] } : s)) };
  }
  return mapPagina(doc, (b) => {
    if (b.id !== alvo.blocoId) return b;
    if (alvo.coluna != null && b.colunas) {
      return { ...b, colunas: b.colunas.map((c, i) => (i === alvo.coluna ? { ...c, blocos: [...c.blocos, novo] } : c)) };
    }
    return { ...b, blocos: [...(b.blocos ?? []), novo] };
  });
}

// ── Seções ───────────────────────────────────────────────────────────────────
export function addSecao(doc: PaginaDoc, nome?: string): PaginaDoc {
  return { ...doc, secoes: [...doc.secoes, novaSecao(nome ?? `Seção ${doc.secoes.length + 1}`)] };
}

export function removerSecao(doc: PaginaDoc, id: string): PaginaDoc {
  return { ...doc, secoes: doc.secoes.filter((s) => s.id !== id) };
}

export function patchSecao(doc: PaginaDoc, id: string, patch: Partial<Secao>): PaginaDoc {
  return { ...doc, secoes: doc.secoes.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

export function patchEstiloSecao(doc: PaginaDoc, id: string, patch: Partial<Estilo>): PaginaDoc {
  return { ...doc, secoes: doc.secoes.map((s) => (s.id === id ? { ...s, estilo: { ...s.estilo, ...patch } } : s)) };
}

export function moverSecao(doc: PaginaDoc, id: string, dir: -1 | 1): PaginaDoc {
  const i = doc.secoes.findIndex((s) => s.id === id);
  if (i < 0) return doc;
  const j = i + dir;
  if (j < 0 || j >= doc.secoes.length) return doc;
  const secoes = [...doc.secoes];
  [secoes[i], secoes[j]] = [secoes[j], secoes[i]];
  return { ...doc, secoes };
}

export function patchConfig(doc: PaginaDoc, patch: Partial<PaginaConfig>): PaginaDoc {
  return { ...doc, config: { ...doc.config, ...patch } };
}

/** Onde está o item selecionado: bloco, seção, ou nada. */
export function acharSelecionado(doc: PaginaDoc, id: string | null): { tipo: "bloco"; bloco: Bloco } | { tipo: "secao"; secao: Secao } | null {
  if (!id) return null;
  const secao = doc.secoes.find((s) => s.id === id);
  if (secao) return { tipo: "secao", secao };
  let achado: Bloco | null = null;
  mapPagina(doc, (b) => { if (b.id === id) achado = b; return b; });
  return achado ? { tipo: "bloco", bloco: achado } : null;
}

/** A seção que contém um bloco (para saber onde inserir irmãos). */
export function secaoDoBloco(doc: PaginaDoc, blocoId: string): string | null {
  for (const s of doc.secoes) {
    let tem = false;
    const varrer = (lista: Bloco[]) => {
      for (const b of lista) {
        if (b.id === blocoId) { tem = true; return; }
        if (b.blocos) varrer(b.blocos);
        if (b.colunas) for (const c of b.colunas) varrer(c.blocos);
      }
    };
    varrer(s.blocos);
    if (tem) return s.id;
  }
  return null;
}
