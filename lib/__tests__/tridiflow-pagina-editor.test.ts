import { describe, expect, it } from "vitest";

// Regras de estabilidade do EDITOR DE PÁGINAS (não toca em fluxos):
//  1. digitação vira UM passo de histórico enquanto as teclas vêm seguidas;
//  2. resposta de save atrasada não pode sobrescrever o estado de uma edição
//     mais nova.
// As duas são reproduzidas aqui na mesma forma usada no EditorPaginaClient.

const JANELA_DIGITACAO = 900;

/** Espelha o `setDoc` do editor: decide se EMPILHA um passo novo no histórico. */
function empilha(
  anterior: { chave: string; em: number } | null,
  agrupar: string | undefined,
  agora: number,
): boolean {
  const continua = !!agrupar && !!anterior && anterior.chave === agrupar && agora - anterior.em < JANELA_DIGITACAO;
  return !continua;
}

describe("histórico do editor de páginas: digitação agrupada", () => {
  it("digitar seguido no MESMO campo empilha só o primeiro passo", () => {
    const chave = "c:b1:texto";
    let grupo: { chave: string; em: number } | null = null;
    let passos = 0;
    // 5 teclas, 80ms entre elas — uma frase sendo digitada.
    for (let i = 0; i < 5; i++) {
      const agora = 1000 + i * 80;
      if (empilha(grupo, chave, agora)) passos++;
      grupo = { chave, em: agora };
    }
    expect(passos).toBe(1);   // 1 desfazer volta a frase inteira
  });

  it("pausa longa começa um passo novo", () => {
    const chave = "c:b1:texto";
    let grupo: { chave: string; em: number } | null = null;
    let passos = 0;
    for (const agora of [1000, 1080, 5000, 5060]) {   // pausa de ~4s no meio
      if (empilha(grupo, chave, agora)) passos++;
      grupo = { chave, em: agora };
    }
    expect(passos).toBe(2);
  });

  it("trocar de campo ou de bloco começa passo novo", () => {
    let grupo: { chave: string; em: number } | null = null;
    let passos = 0;
    for (const [chave, agora] of [["c:b1:titulo", 1000], ["c:b1:subtitulo", 1050], ["c:b2:titulo", 1100]] as const) {
      if (empilha(grupo, chave, agora)) passos++;
      grupo = { chave, em: agora };
    }
    expect(passos).toBe(3);
  });

  it("ação estrutural (sem agrupar) SEMPRE empilha", () => {
    const grupo = { chave: "c:b1:texto", em: 1000 };
    expect(empilha(grupo, undefined, 1010)).toBe(true);   // mover/duplicar/excluir
  });
});

describe("auto-save: resposta atrasada não vence a mais nova", () => {
  // `seq` = ordem de envio; `ultimoAplicado` = maior resposta já aplicada.
  it("ignora a resposta de um envio antigo", () => {
    let ultimoAplicado = 0;
    const aplicar = (meu: number) => {
      const atrasada = meu < ultimoAplicado;
      if (!atrasada) ultimoAplicado = meu;
      return !atrasada;
    };
    // Envio 1 e 2 saem; a resposta do 2 chega primeiro (rede), depois a do 1.
    expect(aplicar(2)).toBe(true);
    expect(aplicar(1)).toBe(false);   // a antiga é descartada
    expect(ultimoAplicado).toBe(2);
  });

  it("só marca Salvo quando NADA novo entrou na fila", () => {
    // Espelha: setSalvando(meu === seq.current ? "ok" : "pendente")
    const estado = (meu: number, seqAtual: number) => (meu === seqAtual ? "ok" : "pendente");
    expect(estado(3, 3)).toBe("ok");
    expect(estado(3, 4)).toBe("pendente");   // já editaram de novo enquanto salvava
  });
});
