import { describe, expect, it } from "vitest";
import { novaSecao, novoBloco, todosBlocos, type PaginaDoc } from "../tridiflow-pagina";
import {
  acharSelecionado, addBloco, addSecao, alternarOculto, duplicarBlocoNoDoc, moverBloco, moverBlocoPara,
  moverSecao, patchBloco, patchEstiloBloco, removerBloco, removerSecao, secaoDoBloco, setVisibilidade,
} from "../tridiflow-pagina-edicao";

function docBase(): PaginaDoc {
  const s = novaSecao("Topo");
  s.blocos = [novoBloco("titulo"), novoBloco("texto"), novoBloco("botao")];
  return { versao: 1, secoes: [s], config: {} };
}

describe("edição do documento", () => {
  it("patch não muda o objeto original (undo por snapshot depende disso)", () => {
    const d = docBase();
    const alvo = d.secoes[0].blocos[0].id;
    const r = patchBloco(d, alvo, { texto: "Novo" });
    expect(r).not.toBe(d);
    expect(d.secoes[0].blocos[0].texto).not.toBe("Novo");   // original intacto
    expect(r.secoes[0].blocos[0].texto).toBe("Novo");
  });

  it("patch de estilo faz merge, não substitui", () => {
    const d = docBase();
    const alvo = d.secoes[0].blocos[0].id;
    const r = patchEstiloBloco(d, alvo, { cor: "#fff" });
    expect(r.secoes[0].blocos[0].estilo.align).toBe("center");   // veio do padrão
    expect(r.secoes[0].blocos[0].estilo.cor).toBe("#fff");
  });

  it("mover troca de posição e respeita as bordas", () => {
    const d = docBase();
    const [a, b] = [d.secoes[0].blocos[0].id, d.secoes[0].blocos[1].id];
    const r = moverBloco(d, a, 1);
    expect(r.secoes[0].blocos[0].id).toBe(b);
    expect(r.secoes[0].blocos[1].id).toBe(a);
    // Primeiro item não sobe além do topo.
    expect(moverBloco(d, a, -1).secoes[0].blocos[0].id).toBe(a);
  });

  it("mover funciona dentro de colunas (nível aninhado)", () => {
    const col = novoBloco("colunas");
    const x = novoBloco("texto"); const y = novoBloco("botao");
    col.colunas![0].blocos = [x, y];
    const d: PaginaDoc = { versao: 1, secoes: [{ ...novaSecao(), blocos: [col] }], config: {} };
    const r = moverBloco(d, x.id, 1);
    expect(r.secoes[0].blocos[0].colunas![0].blocos[0].id).toBe(y.id);
  });

  it("duplicar insere a cópia logo abaixo, com id novo", () => {
    const d = docBase();
    const alvo = d.secoes[0].blocos[1].id;
    const r = duplicarBlocoNoDoc(d, alvo);
    expect(r.secoes[0].blocos).toHaveLength(4);
    expect(r.secoes[0].blocos[1].id).toBe(alvo);
    expect(r.secoes[0].blocos[2].id).not.toBe(alvo);
    expect(r.secoes[0].blocos[2].tipo).toBe(r.secoes[0].blocos[1].tipo);
  });

  it("duplicar bloco com filhos não repete ids dos filhos", () => {
    const col = novoBloco("colunas");
    col.colunas![0].blocos = [novoBloco("texto")];
    const d: PaginaDoc = { versao: 1, secoes: [{ ...novaSecao(), blocos: [col] }], config: {} };
    const r = duplicarBlocoNoDoc(d, col.id);
    const ids = todosBlocos(r).map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);   // nenhum id repetido
  });

  it("remover tira só o alvo", () => {
    const d = docBase();
    const alvo = d.secoes[0].blocos[1].id;
    const r = removerBloco(d, alvo);
    expect(r.secoes[0].blocos).toHaveLength(2);
    expect(r.secoes[0].blocos.some((b) => b.id === alvo)).toBe(false);
  });

  it("ocultar alterna sem apagar", () => {
    const d = docBase();
    const alvo = d.secoes[0].blocos[0].id;
    const r1 = alternarOculto(d, alvo);
    expect(r1.secoes[0].blocos[0].oculto).toBe(true);
    expect(alternarOculto(r1, alvo).secoes[0].blocos[0].oculto).toBe(false);
  });

  it("adiciona bloco no fim da seção", () => {
    const d = docBase();
    const r = addBloco(d, d.secoes[0].id, "oferta");
    expect(r.secoes[0].blocos).toHaveLength(4);
    expect(r.secoes[0].blocos[3].tipo).toBe("oferta");
  });

  it("adiciona bloco dentro de uma coluna específica", () => {
    const col = novoBloco("colunas");
    const d: PaginaDoc = { versao: 1, secoes: [{ ...novaSecao(), blocos: [col] }], config: {} };
    const r = addBloco(d, d.secoes[0].id, "texto", { blocoId: col.id, coluna: 1 });
    expect(r.secoes[0].blocos[0].colunas![1].blocos).toHaveLength(1);
    expect(r.secoes[0].blocos[0].colunas![0].blocos).toHaveLength(0);
  });

  it("seções: adicionar, mover e remover", () => {
    let d = addSecao(docBase(), "Rodapé");
    expect(d.secoes).toHaveLength(2);
    const idRodape = d.secoes[1].id;
    d = moverSecao(d, idRodape, -1);
    expect(d.secoes[0].id).toBe(idRodape);
    d = removerSecao(d, idRodape);
    expect(d.secoes).toHaveLength(1);
  });

  it("visibilidade é substituída inteira (não faz merge de modo antigo)", () => {
    const d = docBase();
    const alvo = d.secoes[0].blocos[2].id;
    const r = setVisibilidade(d, alvo, { modo: "apos_tempo", segundos: 300, base: "video" });
    expect(r.secoes[0].blocos[2].visivel).toEqual({ modo: "apos_tempo", segundos: 300, base: "video" });
    const r2 = setVisibilidade(r, alvo, { modo: "sempre" });
    expect(r2.secoes[0].blocos[2].visivel).toEqual({ modo: "sempre" });
  });

  it("arrastar: reordena dentro da mesma seção sem pular de lugar", () => {
    // [A,B,C] — arrastar A para a posição 2 (entre B e C) tem que dar [B,A,C].
    // Sem corrigir o índice depois da remoção, cairia em [B,C,A].
    const d = docBase();
    const [a, b, c] = d.secoes[0].blocos.map((x) => x.id);
    const r = moverBlocoPara(d, a, d.secoes[0].id, 2);
    expect(r.secoes[0].blocos.map((x) => x.id)).toEqual([b, a, c]);
  });

  it("arrastar: para o topo e para o fim", () => {
    const d = docBase();
    const [a, b, c] = d.secoes[0].blocos.map((x) => x.id);
    expect(moverBlocoPara(d, c, d.secoes[0].id, 0).secoes[0].blocos.map((x) => x.id)).toEqual([c, a, b]);
    expect(moverBlocoPara(d, a, d.secoes[0].id, 3).secoes[0].blocos.map((x) => x.id)).toEqual([b, c, a]);
  });

  it("arrastar: move entre seções diferentes", () => {
    let d = addSecao(docBase(), "Fundo");
    const origem = d.secoes[0].id, destino = d.secoes[1].id;
    const alvo = d.secoes[0].blocos[1].id;
    d = moverBlocoPara(d, alvo, destino, 0);
    expect(d.secoes[0].blocos).toHaveLength(2);
    expect(d.secoes[1].blocos.map((x) => x.id)).toEqual([alvo]);
  });

  it("arrastar: tira o bloco de dentro de uma coluna e leva pra seção", () => {
    const col = novoBloco("colunas");
    const dentro = novoBloco("texto");
    col.colunas![0].blocos = [dentro];
    const s = novaSecao();
    s.blocos = [col];
    const d: PaginaDoc = { versao: 1, secoes: [s], config: {} };
    const r = moverBlocoPara(d, dentro.id, s.id, 0);
    expect(r.secoes[0].blocos[0].id).toBe(dentro.id);
    expect(r.secoes[0].blocos[1].colunas![0].blocos).toHaveLength(0);
  });

  it("arrastar id inexistente não altera o documento", () => {
    const d = docBase();
    expect(moverBlocoPara(d, "fantasma", d.secoes[0].id, 0)).toBe(d);
  });

  it("acharSelecionado distingue bloco de seção", () => {
    const d = docBase();
    expect(acharSelecionado(d, d.secoes[0].id)?.tipo).toBe("secao");
    expect(acharSelecionado(d, d.secoes[0].blocos[0].id)?.tipo).toBe("bloco");
    expect(acharSelecionado(d, "inexistente")).toBeNull();
    expect(acharSelecionado(d, null)).toBeNull();
  });

  it("secaoDoBloco acha a seção mesmo com o bloco aninhado", () => {
    const col = novoBloco("colunas");
    const dentro = novoBloco("texto");
    col.colunas![1].blocos = [dentro];
    const s = novaSecao();
    s.blocos = [col];
    const d: PaginaDoc = { versao: 1, secoes: [s], config: {} };
    expect(secaoDoBloco(d, dentro.id)).toBe(s.id);
    expect(secaoDoBloco(d, "nao-existe")).toBeNull();
  });
});
