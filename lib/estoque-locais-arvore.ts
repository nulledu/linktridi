// ── A árvore de lugares do galpão, resolvida em memória ─────────────────────
//
// `estoque_locais` é Rua → Móvel → Nível: ~80 linhas hoje, um teto de algumas
// centenas pra sempre. A esse tamanho, a resposta certa pra "quem está abaixo
// da Rua C?" não é uma query recursiva — é trazer a tabela INTEIRA numa ida só
// e caminhar aqui. É o que a página pública /g/<codigo> faz: um scan de QR no
// meio do galpão precisa de uma consulta de locais e uma de itens, nunca de
// uma por nível da hierarquia.
//
// Puro de propósito (sem React, sem Supabase): as três perguntas deste arquivo
// — achar pelo código, listar os de baixo, montar o caminho até o topo — são
// exatamente as que se conferem em teste (lib/__tests__/estoque-locais-arvore.test.ts).
//
// TODA caminhada aqui é guardada contra ciclo. O banco impede `pai_id = id`
// (app/api/estoque/locais/route.ts), mas não impede A→B→A escrito em dois
// PATCHes — e esta página é pública: um dado sujo não pode virar um loop
// infinito servindo request de quem apontou a câmera pra etiqueta.

export interface LocalDaArvore {
  id: string;
  nome: string;
  codigo: string;
  pai_id: string | null;
  ativo?: boolean | null;
  ordem?: number | null;
}

/** O índice único do banco é em `lower(codigo)` — a comparação daqui espelha
 *  isso, senão o QR impresso com "RUA-C" não acharia a linha gravada "rua-c". */
const chave = (codigo: unknown): string => String(codigo ?? "").trim().toLowerCase();

/** O lugar cujo código casa (sem caixa, sem espaço nas pontas), ou null. */
export function acharPorCodigo(codigo: string, locais: LocalDaArvore[]): LocalDaArvore | null {
  const alvo = chave(codigo);
  if (!alvo) return null;
  return locais.find((l) => chave(l.codigo) === alvo) ?? null;
}

/** Filhos DIRETOS de `id`, na ordem da tela (ordem, depois nome) — a mesma da
 *  aba Localização, pra etiqueta e ERP listarem as prateleiras igual. */
export function filhosDe(id: string, locais: LocalDaArvore[]): LocalDaArvore[] {
  return locais
    .filter((l) => l.pai_id === id && l.id !== id)
    .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Os ids do lugar E de tudo abaixo dele — é o `in (...)` da consulta de itens:
 * quem bipa a etiqueta da Rua quer ver o que está nos níveis, não só o que foi
 * gravado apontando pra própria rua.
 *
 * BFS com visitados: um ciclo no `pai_id` faz um nó reaparecer como "filho" de
 * um descendente, e sem a guarda a fila nunca esvazia.
 */
export function descendentesDe(id: string, locais: LocalDaArvore[]): string[] {
  const filhosPor = new Map<string, string[]>();
  for (const l of locais) {
    if (!l.pai_id || l.pai_id === l.id) continue;
    const lista = filhosPor.get(l.pai_id) ?? [];
    lista.push(l.id);
    filhosPor.set(l.pai_id, lista);
  }
  const vistos = new Set<string>([id]);
  const fila = [id];
  while (fila.length) {
    for (const filho of filhosPor.get(fila.shift()!) ?? []) {
      if (vistos.has(filho)) continue;
      vistos.add(filho);
      fila.push(filho);
    }
  }
  return [...vistos];
}

/**
 * Do topo até o lugar — é o "Rua C › Estante Cinza › Nível 2" do cabeçalho.
 * Vazio quando o id não existe. Subida com visitados: num ciclo A→B→A o
 * caminho para onde a repetição começaria, em vez de rodar pra sempre.
 */
export function caminhoDe(id: string, locais: LocalDaArvore[]): LocalDaArvore[] {
  const porId = new Map(locais.map((l) => [l.id, l]));
  const caminho: LocalDaArvore[] = [];
  const vistos = new Set<string>();
  let atual = porId.get(id) ?? null;
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    caminho.unshift(atual);
    atual = atual.pai_id ? porId.get(atual.pai_id) ?? null : null;
  }
  return caminho;
}
