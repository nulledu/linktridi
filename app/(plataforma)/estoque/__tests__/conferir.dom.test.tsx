import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

// A aba "Conferir" é o único caminho de desktop pelo qual peça produzida entra
// no estoque. O que este arquivo trava não é aparência — é o que faz o gerente
// perder trabalho ou tomar decisão errada:
//
//  1. A regra "quem confere não pode ser quem fez" aparece ANTES de preencher.
//     Ela existe no servidor (ErroConferenteEExecutor); descobri-la só no clique
//     de confirmar é encher o formulário inteiro pra levar um 400.
//  2. Produto que não casa com o catálogo também é barrado antes — é 404 certo.
//  3. Sem a tabela do QC a tela EXPLICA, não estoura. É o estado real do banco
//     hoje, e o que fez a fila do tablet listar pendência que nunca resolve.
//  4. Cada código de erro do servidor vira uma frase com uma AÇÃO diferente.
//
// Nada de geometria: jsdom não tem motor de layout (offsetParent e rect são
// sempre 0). 320px e alvo de toque se conferem no navegador, em
// /dev-estoque-item/conferir.
import { ConferirClient } from "../ConferirClient";
import { mensagemDeErroDeConferencia } from "../conferencia-tipos";

function pendente(over: Record<string, unknown> = {}) {
  return {
    id: "a1", produtoNome: "Painel Ripado", tarefa: null, detalhe: null,
    itemId: "i1", itemSerializado: true, categoria: null,
    quantidadeAlvo: 50, quantidadeFeita: 50,
    executorId: "u2", executorNome: "Marina", executorFotoUrl: null,
    concluidaEm: new Date().toISOString(),
    // O contexto que decide certo ou errado: a foto do trabalho pronto e os
    // tempos. `null` no padrão — cada teste liga o que está provando.
    fotoUrl: null, tempoRealMin: null, tempoEstimadoMin: null,
    souEuQuemFez: false, consumo: null, ...over,
  };
}

/** Rede falsa: cada rota devolve o corpo mapeado, com o status pedido. */
function rede(mapa: Record<string, { status?: number; body: unknown }>) {
  return vi.fn((url: string) => {
    const chave = Object.keys(mapa).find((k) => String(url).startsWith(k));
    const alvo = chave ? mapa[chave] : { status: 500, body: { error: "failed" } };
    const status = alvo.status ?? 200;
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(alvo.body) } as Response);
  });
}

/** O corpo do POST que a tela mandou pra uma rota (o último, se houve vários). */
function corpoEnviado(rota: string): Record<string, unknown> | null {
  const chamadas = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
  const post = [...chamadas].reverse().find(([u, init]) => String(u).startsWith(rota) && init?.method === "POST");
  return post?.[1]?.body ? JSON.parse(String(post[1].body)) : null;
}

/** Abre o painel da primeira caixa que dá pra conferir. */
async function abrirPainel() {
  const botoes = await screen.findAllByRole("button", { name: "Conferir" });
  fireEvent.click(botoes.find((b) => !(b as HTMLButtonElement).disabled)!);
  await screen.findByRole("button", { name: "Certo" });
}

const PENDENTES = "/api/estoque/conferencias/pendentes";
const RAIZ = "/api/estoque/conferencias";

beforeEach(() => { vi.stubGlobal("fetch", rede({})); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Conferir · fila", () => {
  it("quem fez a peça não consegue abrir a conferência, e a tela diz por quê", async () => {
    vi.stubGlobal("fetch", rede({
      [PENDENTES]: { body: { atividades: [pendente({ souEuQuemFez: true })], travadas: 0, proximoCursor: null, qcDesligado: false } },
    }));
    render(<ConferirClient />);

    // Aparece duas vezes no DOM: a linha da tabela (desktop) e o card
    // (celular) coexistem — quem esconde uma é o CSS, que o jsdom não roda.
    expect((await screen.findAllByText(/Você fez esta peça/)).length).toBeGreaterThan(0);
    // Botão da tabela (desktop) e do card (celular) — os dois desabilitados.
    const botoes = await screen.findAllByRole("button", { name: /Conferir/ });
    expect(botoes.length).toBeGreaterThan(0);
    for (const b of botoes) expect(b).toBeDisabled();
  });

  // Antes da conferência binária esta linha ficava TRANCADA — e como reprovar
  // não toca no estoque, a caixa errada de um produto com nome fora do catálogo
  // ficava presa na fila pra sempre, esperando um cadastro que talvez nunca
  // viesse. O certo é o que depende do catálogo; o errado, não.
  it("produto fora do catálogo ainda abre: dá pra marcar errado, não dá pra aprovar", async () => {
    vi.stubGlobal("fetch", rede({
      [PENDENTES]: { body: { atividades: [pendente({ itemId: null, itemSerializado: null })], travadas: 0, proximoCursor: null, qcDesligado: false } },
    }));
    render(<ConferirClient />);

    expect((await screen.findAllByText(/dá pra marcar errado/)).length).toBeGreaterThan(0);
    const botoes = await screen.findAllByRole("button", { name: "Conferir" });
    expect(botoes.some((b) => !(b as HTMLButtonElement).disabled)).toBe(true);

    await abrirPainel();
    expect(screen.getByRole("button", { name: "Certo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Errado" })).toBeEnabled();
  });

  it("caixa de outra pessoa abre a conferência normalmente", async () => {
    vi.stubGlobal("fetch", rede({
      [PENDENTES]: { body: { atividades: [pendente()], travadas: 0, proximoCursor: null, qcDesligado: false } },
    }));
    render(<ConferirClient />);

    const botoes = await screen.findAllByRole("button", { name: /Conferir/ });
    expect(botoes.some((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("conferência gravada sem o estoque ter entrado vira alerta — hoje esse estado é invisível", async () => {
    vi.stubGlobal("fetch", rede({
      [PENDENTES]: { body: { atividades: [], travadas: 3, proximoCursor: null, qcDesligado: false } },
    }));
    render(<ConferirClient />);

    // "Pelo menos": a varredura para quando a página enche, então o número é
    // um piso, não um total — o aviso não pode prometer o que não apurou.
    await screen.findByText(/Pelo menos\s*3\s*atividades com conferência gravada/);
  });
});

// ── O que o gerente lê ANTES de abrir ────────────────────────────────────────
// A lista é onde ele ACHA a caixa que está segurando e onde decide por qual
// começar. Cada item deste bloco corresponde a um dado que estava no banco e
// nenhuma tela mostrava.
describe("Conferir · a fila diz o que decide", () => {
  const fila = (atividades: unknown[]) => ({
    [PENDENTES]: { body: { atividades, travadas: 0, proximoCursor: null, qcDesligado: false } },
  });

  // 103 das 104 atividades concluídas do galpão não apontam produto nenhum: a
  // fila era uma coluna de travessões e o gerente não conseguia nem localizar a
  // caixa que estava na mão dele. O painel já usava o título certo; a LISTA não.
  it("o título é o TRABALHO, nunca um travessão", async () => {
    vi.stubGlobal("fetch", rede(fila([pendente({ produtoNome: null, tarefa: "Montar alavancas" })])));
    render(<ConferirClient />);

    // Duas vezes no DOM: a linha da tabela e o card do celular coexistem — quem
    // esconde uma é o CSS, que o jsdom não roda.
    expect((await screen.findAllByText("Montar alavancas")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("—")).toHaveLength(0);
  });

  it("faltou peça: a fila DIZ quantas, sem ninguém subtrair", async () => {
    vi.stubGlobal("fetch", rede(fila([pendente({ quantidadeFeita: 19, quantidadeAlvo: 30 })])));
    render(<ConferirClient />);

    expect((await screen.findAllByText("19 de 30")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("faltaram 11").length).toBeGreaterThan(0);
  });

  it("bateu o alvo não inventa diferença nenhuma", async () => {
    vi.stubGlobal("fetch", rede(fila([pendente({ quantidadeFeita: 30, quantidadeAlvo: 30 })])));
    render(<ConferirClient />);

    expect((await screen.findAllByText("30 de 30")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/faltaram/)).toBeNull();
  });

  // ESTA É A TRAVA DE CONSUMO. A fila tem ~23 cartões e cada foto é de celular:
  // baixar as 23 na abertura da tela é megabytes por visita, e no tablet do
  // galpão é 3G. A lista diz que EXISTE foto; quem baixa a imagem é a ficha,
  // uma por decisão. Se alguém puser uma <img> da foto do trabalho na lista,
  // este teste quebra antes de a conta chegar.
  it("a lista NÃO baixa a foto do trabalho — só diz que ela existe", async () => {
    vi.stubGlobal("fetch", rede(fila([
      pendente({ id: "a1", fotoUrl: "https://exemplo/trabalho-1.jpg" }),
      pendente({ id: "a2", fotoUrl: "https://exemplo/trabalho-2.jpg" }),
    ])));
    const { container } = render(<ConferirClient />);

    expect((await screen.findAllByText("com foto")).length).toBeGreaterThan(0);
    const fontes = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "");
    expect(fontes.filter((s) => s.includes("trabalho-"))).toEqual([]);
  });

  // A ausência muda o trabalho: sem foto, a única maneira de conferir é
  // caminhar até a caixa. Isso o gerente precisa saber ANTES de abrir a ficha.
  it("sem foto do trabalho, a fila avisa", async () => {
    vi.stubGlobal("fetch", rede(fila([pendente({ fotoUrl: null })])));
    render(<ConferirClient />);

    expect((await screen.findAllByText("sem foto")).length).toBeGreaterThan(0);
  });

  // Cinco pessoas produzem no galpão: 23 cartões apontam pra cinco URLs, e o
  // navegador baixa cada uma UMA vez. É por isso que o rosto cabe na lista e a
  // foto do trabalho não.
  it("o rosto de quem fez aparece na lista", async () => {
    vi.stubGlobal("fetch", rede(fila([
      pendente({ executorNome: "João Vitor", executorFotoUrl: "https://exemplo/joao.jpg" }),
    ])));
    const { container } = render(<ConferirClient />);

    expect((await screen.findAllByText("João Vitor")).length).toBeGreaterThan(0);
    const rostos = [...container.querySelectorAll("img")].filter((i) => (i.getAttribute("src") ?? "").includes("joao.jpg"));
    expect(rostos.length).toBeGreaterThan(0);
  });

  it("sem foto cadastrada, o rosto vira iniciais em vez de buraco", async () => {
    vi.stubGlobal("fetch", rede(fila([pendente({ executorNome: "João Vitor", executorFotoUrl: null })])));
    const { container } = render(<ConferirClient />);

    expect((await screen.findAllByText("João Vitor")).length).toBeGreaterThan(0);
    expect([...container.querySelectorAll("img")]).toHaveLength(0);
  });
});

// ── O acervo: contado, nunca escondido ───────────────────────────────────────
// A fila do dia a dia mostra a SEMANA, senão o primeiro dia abriria com 104
// cartões de três semanas e ninguém saberia por onde começar. O servidor já
// contava o que ficou pra trás; a tela é que não fazia nada com o número — 83
// caixas paradas sem nenhum caminho até elas.
describe("Conferir · o que ficou pra trás da janela", () => {
  const corpo = (over: Record<string, unknown>) => ({
    [PENDENTES]: { body: { atividades: [], travadas: 0, proximoCursor: null, qcDesligado: false, dias: 7, ...over } },
  });

  it("com caixas mais antigas, a tela NÃO diz que está tudo conferido", async () => {
    vi.stubGlobal("fetch", rede(corpo({ anteriores: 83 })));
    render(<ConferirClient />);

    await screen.findByText(/Nada dos últimos 7 dias esperando conferência/);
    expect(screen.queryByText(/Toda produção concluída já foi conferida/)).toBeNull();
    expect(screen.getByRole("button", { name: /Ver as mais antigas/ })).toBeInTheDocument();
  });

  it("o botão abre o acervo inteiro — e oferece a volta", async () => {
    // A rede falsa do arquivo casa por PREFIXO, e "/pendentes" é prefixo de
    // "/pendentes?acervo=1" — usá-la aqui devolveria a SEMANA nas duas
    // chamadas e o teste passaria sem provar nada. A escolha é por `acervo=1`.
    const semana = { atividades: [], travadas: 0, proximoCursor: null, qcDesligado: false, dias: 7, anteriores: 83 };
    const tudo = { atividades: [pendente()], travadas: 0, proximoCursor: null, qcDesligado: false, dias: 7, acervo: true, anteriores: 0 };
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const corpo = String(url).includes("acervo=1") ? tudo : semana;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corpo) } as Response);
    }));
    render(<ConferirClient />);

    fireEvent.click(await screen.findByRole("button", { name: /Ver as mais antigas/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Voltar pros últimos 7 dias/ })).toBeInTheDocument());
    expect((await screen.findAllByRole("button", { name: "Conferir" })).length).toBeGreaterThan(0);
  });

  it("sem acervo nenhum, nada disso aparece", async () => {
    vi.stubGlobal("fetch", rede(corpo({ anteriores: 0 })));
    render(<ConferirClient />);

    await screen.findByText(/Toda produção concluída já foi conferida/);
    expect(screen.queryByRole("button", { name: /Ver as mais antigas/ })).toBeNull();
  });
});

// ── A ficha: a foto do trabalho é a conferência ──────────────────────────────
describe("Conferir · a ficha mostra a prova", () => {
  const fila = (over: Record<string, unknown>) => ({
    [PENDENTES]: { body: { atividades: [pendente(over)], travadas: 0, proximoCursor: null, qcDesligado: false } },
  });

  it("a foto do trabalho abre com a ficha, e diz de quem é", async () => {
    vi.stubGlobal("fetch", rede(fila({
      executorNome: "Marina", fotoUrl: "https://exemplo/alavancas.jpg",
    })));
    render(<ConferirClient />);
    await abrirPainel();

    // `document`, não `container`: o painel lateral é portado pro <body>.
    const foto = document.querySelector('img[src="https://exemplo/alavancas.jpg"]') as HTMLImageElement | null;
    expect(foto).not.toBeNull();
    // SEM `lazy`, e é de propósito: a foto é o segundo bloco do painel, nunca
    // nasce fora da dobra, então o `lazy` não adiava byte nenhum — só impedia o
    // download de começar enquanto a folha subia. Nesse intervalo
    // `naturalWidth` é 0 e o GlobalLightbox recusa a imagem: o primeiro toque
    // não abria nada, contra uma legenda que promete "toque pra ver grande".
    expect(foto!.getAttribute("loading")).toBeNull();
    // `async` fica: não atrasa o pedido, só tira a descompressão de 4000×3000
    // da pintura do painel.
    expect(foto!.getAttribute("decoding")).toBe("async");
    // A <img> NÃO pode virar botão: é justamente o que o GlobalLightbox ignora,
    // e o zoom em tela cheia sairia de graça pra lugar nenhum.
    expect(foto!.closest("button")).toBeNull();
    expect(screen.getByText(/tirou ao\s*concluir/)).toBeInTheDocument();
  });

  it("sem foto, a ficha diz que só dá pra conferir olhando a caixa", async () => {
    vi.stubGlobal("fetch", rede(fila({ executorNome: "Marina", fotoUrl: null })));
    render(<ConferirClient />);
    await abrirPainel();

    expect(screen.getByText("Sem foto deste trabalho.")).toBeInTheDocument();
    expect(screen.getByText(/só dá pra conferir olhando a caixa/)).toBeInTheDocument();
  });

  // A instrução que a pessoa recebeu. O servidor mandava desde sempre e
  // NENHUMA tela desenhava: "certo" só significa alguma coisa contra um pedido.
  it("mostra o que tinha sido pedido", async () => {
    vi.stubGlobal("fetch", rede(fila({ detalhe: "Colar o PS nas 30 bases" })));
    render(<ConferirClient />);
    await abrirPainel();

    expect(screen.getByText("O que foi pedido")).toBeInTheDocument();
    expect(screen.getByText("Colar o PS nas 30 bases")).toBeInTheDocument();
  });

  it("a falta aparece com peso, não como rodapé", async () => {
    vi.stubGlobal("fetch", rede(fila({ quantidadeFeita: 19, quantidadeAlvo: 30 })));
    render(<ConferirClient />);
    await abrirPainel();

    expect(screen.getAllByText("faltaram 11").length).toBeGreaterThan(0);
    expect(screen.getByText("de 30 pedidas")).toBeInTheDocument();
  });

  // Apoio, não acusação: explica um número baixo sem transformar a caixa num
  // julgamento. Por isso a frase é uma linha discreta, sem cor.
  it("o tempo real aparece contra o estimado", async () => {
    vi.stubGlobal("fetch", rede(fila({ tempoRealMin: 34, tempoEstimadoMin: 40 })));
    render(<ConferirClient />);
    await abrirPainel();

    expect(screen.getByText(/Levou 34 min · estimado 40 min/)).toBeInTheDocument();
  });

  it("sem carimbo de início, o tempo simplesmente não aparece", async () => {
    vi.stubGlobal("fetch", rede(fila({ tempoRealMin: null, tempoEstimadoMin: 40 })));
    render(<ConferirClient />);
    await abrirPainel();

    expect(screen.queryByText(/Levou/)).toBeNull();
  });
});

// ── O painel: CERTO ou ERRADO, e só ─────────────────────────────────────────
// O que este bloco trava é o modelo do galpão inteiro. A pessoa bipou a caixa
// de material no COMEÇO (o estoque já saiu), montou e disse quantas fez. O
// gerente só olha a caixa pronta e responde uma pergunta de duas alternativas —
// não conta peça, não digita quantidade, não dá nota.
describe("Conferir · o painel é binário", () => {
  const FILA_OK = {
    [PENDENTES]: { body: { atividades: [pendente()], travadas: 0, proximoCursor: null, qcDesligado: false } },
  };

  it("a quantidade é a que quem fez registrou, e o gerente não tem onde digitar outra", async () => {
    vi.stubGlobal("fetch", rede(FILA_OK));
    render(<ConferirClient />);
    await abrirPainel();

    const painel = within(screen.getByRole("dialog"));
    await screen.findByText(/Marina registrou ao concluir/);
    expect(painel.getByText("50")).toBeInTheDocument();
    // Os dois campos de quantidade (aprovadas/recusadas) sumiram junto com a
    // nota: número digitado pelo gerente é o que este redesenho tirou.
    expect(document.querySelectorAll('input[type="number"]').length).toBe(0);
  });

  it("confirmar só acende depois de escolher um dos dois", async () => {
    vi.stubGlobal("fetch", rede(FILA_OK));
    render(<ConferirClient />);
    await abrirPainel();

    expect(screen.getByRole("button", { name: /^Confirmar/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Certo" }));
    expect(screen.getByRole("button", { name: "Confirmar certo" })).toBeEnabled();
  });

  it("certo diz ANTES quantas peças a caixa vai ter, e manda só o resultado", async () => {
    vi.stubGlobal("fetch", rede({
      ...FILA_OK,
      [RAIZ]: { body: { ok: true, resultado: "certo", quantidade: 50, unidades: ["PNL-00001"], etiquetas: [], reaberta: false } },
    }));
    render(<ConferirClient />);
    await abrirPainel();

    fireEvent.click(screen.getByRole("button", { name: "Certo" }));
    // "uma etiqueta só valendo 50 peças" é a promessa da caixa lacrada: 50
    // folhas não viram 50 etiquetas, viram UMA com 50 dentro.
    await screen.findByText(/uma etiqueta só/);
    await screen.findByText(/50 peças/);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar certo" }));

    await waitFor(() => expect(corpoEnviado(RAIZ)).not.toBeNull());
    const corpo = corpoEnviado(RAIZ)!;
    expect(corpo.resultado).toBe("certo");
    // Quantidade NÃO viaja do navegador: o servidor lê a que a pessoa registrou.
    // Se voltar a viajar, o gerente voltou a ser quem conta as peças.
    expect(Object.keys(corpo)).not.toContain("quantidade");
    expect(Object.keys(corpo)).not.toContain("quantidadeAprovada");
    expect(Object.keys(corpo)).not.toContain("nota");
  });

  // O DEPOIS de confirmar, que nenhum teste olhava: os casos acima param no
  // corpo do POST, e o que sai da impressora ficava por conta de quem lesse o
  // código. Foi exatamente por aí que o banco de provas
  // (/dev-estoque-item/conferir) continuou desenhando SEIS etiquetas de uma
  // peça depois do redesenho — o mundo anterior à caixa lacrada, sobrevivendo
  // numa página feita pra provar que ele acabou.
  //
  // A afirmação travada aqui é a regra 5 do galpão inteira, na tela: UMA
  // etiqueta, com o número de peças impresso nela.
  it("depois do certo sai UMA etiqueta só, e ela diz quantas peças tem a caixa", async () => {
    vi.stubGlobal("fetch", rede({
      ...FILA_OK,
      [RAIZ]: { body: {
        ok: true, resultado: "certo", quantidade: 50, unidades: ["PNL-RIP-BR-000042"], reaberta: false,
        etiquetas: [{
          codigo: "PNL-RIP-BR-000042", nome: "Painel Ripado", quantidade: 50,
          corDimensoes: "Branco · 2750×1840", local: "GAL-A", localDetalhe: "C3 · B2",
          responsavel: "Marina", data: "2026-08-12T12:00:00.000Z",
        }],
      } },
    }));
    render(<ConferirClient />);
    await abrirPainel();

    fireEvent.click(screen.getByRole("button", { name: "Certo" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar certo" }));

    const painel = within(await screen.findByRole("dialog"));
    await painel.findByText(/entraram no estoque/);

    // UMA. O código legível sai uma vez por etiqueta, então contá-lo conta as
    // etiquetas — e 50 peças NÃO podem virar 50 papéis.
    expect(painel.getAllByText("PNL-RIP-BR-000042")).toHaveLength(1);
    // O selo impresso: é a única forma de saber o que tem dentro sem romper o
    // lacre. Sem ele a caixa vira uma etiqueta muda na prateleira.
    // (Só o número — a palavra "CAIXA" saiu do selo quando a etiqueta encolheu
    // pra 15mm, porque "CAIXA 1000 un" vazava pra fora da borda. O quadro só
    // aparece quando a quantidade passa de 1, então a moldura já é o aviso.)
    expect(painel.getByText("50 un")).toBeInTheDocument();
    // Peças e etiquetas são contas diferentes, e o resumo diz as duas.
    expect(painel.getByText(/1 etiqueta/)).toBeInTheDocument();
    expect(painel.getByRole("button", { name: "Imprimir" })).toBeInTheDocument();
  });

  // O espelho: reprovar não produz papel nenhum. Uma etiqueta impressa por
  // engano aqui viraria caixa lacrada de peça refugada indo pra prateleira.
  it("depois do errado não sai etiqueta nenhuma pra imprimir", async () => {
    vi.stubGlobal("fetch", rede({
      ...FILA_OK,
      [RAIZ]: { body: { ok: true, resultado: "errado", quantidade: 0, unidades: [], etiquetas: [], reaberta: true } },
    }));
    render(<ConferirClient />);
    await abrirPainel();

    fireEvent.click(screen.getByRole("button", { name: "Errado" }));
    fireEvent.click(screen.getByRole("button", { name: "Peça suja" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar errado" }));

    const painel = within(await screen.findByRole("dialog"));
    await painel.findByText(/Nada entrou no estoque/);
    expect(painel.queryByText(/\d+ un$/)).toBeNull();      // nenhum selo de caixa
    expect(painel.queryByRole("button", { name: "Imprimir" })).toBeNull();
    // A perda já está contabilizada pelo material bipado no começo — a tela
    // precisa dizer isso, senão alguém vai procurar onde lançar o refugo.
    await painel.findByText(/perda já está contabilizada/);
  });

  it("errado exige o porquê e avisa que a atividade volta pra pessoa", async () => {
    vi.stubGlobal("fetch", rede({
      ...FILA_OK,
      [RAIZ]: { body: { ok: true, resultado: "errado", quantidade: 0, unidades: [], etiquetas: [], reaberta: true } },
    }));
    render(<ConferirClient />);
    await abrirPainel();

    fireEvent.click(screen.getByRole("button", { name: "Errado" }));
    await screen.findByText(/Nada entra no estoque e a atividade volta pra/);

    // Reprovar calado não serve pra quem vai refazer.
    expect(screen.getByRole("button", { name: "Confirmar errado" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Peça suja" }));
    expect(screen.getByRole("button", { name: "Confirmar errado" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar errado" }));
    await waitFor(() => expect(corpoEnviado(RAIZ)).not.toBeNull());
    expect(corpoEnviado(RAIZ)).toMatchObject({ resultado: "errado", defeitos: ["peca_suja"] });

    // Depois de gravar, a tela diz o que MUDOU — some sem explicação seria a
    // pessoa perguntando "reprovou mesmo?".
    await screen.findByText(/Nada entrou no estoque/);
  });

  it("sem defeito na lista, a observação sozinha vale como motivo", async () => {
    vi.stubGlobal("fetch", rede(FILA_OK));
    render(<ConferirClient />);
    await abrirPainel();

    fireEvent.click(screen.getByRole("button", { name: "Errado" }));
    expect(screen.getByRole("button", { name: "Confirmar errado" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Observação"), { target: { value: "Cheiro de solvente." } });
    expect(screen.getByRole("button", { name: "Confirmar errado" })).toBeEnabled();
  });
});

// ── A promessa da etiqueta: TRÊS desfechos, não dois ─────────────────────────
//
// Aprovar como "certo" era a única porta pela qual peça produzida vira caixa
// lacrada, e ela estava fechada em silêncio: nenhum dos 219 itens do galpão
// tinha `serializado`, então todo "certo" caía no ramo que só soma um número —
// 3 conferências gravadas, ZERO etiquetas, `unidade_id` nulo no livro inteiro.
//
// A tela colaborava com o silêncio dizendo a mesma frase pros dois motivos
// opostos de não sair papel:
//
//   · o item AINDA não é etiquetado (tem conserto, e o conserto cabe aqui);
//   · o item NUNCA vai ser (quilo, litro, metro — meio quilo não cabe numa
//     caixa lacrada, e oferecer o conserto seria oferecer perder saldo).
//
// O que este bloco trava é que a frase mudou junto com o mundo, e que o
// conserto só aparece pra quem pode fazê-lo.
describe("Conferir · o que vai acontecer com a ETIQUETA", () => {
  const PREPARAR = "/api/estoque/unidades/preparar";

  /** A fila com o veredicto do servidor sobre o item e o poder de quem olha. */
  function filaCom(preparo: unknown, podePreparar?: boolean) {
    return {
      [PENDENTES]: { body: {
        atividades: [pendente({ preparo, itemSerializado: (preparo as { estado?: string })?.estado === "ja_etiquetado" })],
        travadas: 0, proximoCursor: null, qcDesligado: false, podePreparar,
      } },
    };
  }

  const PRECISA = {
    estado: "precisa_preparo",
    motivo: "Este item ainda tem 191 na contagem antiga. Prepare-o pra etiqueta antes.",
    quantidade: 191,
    unidade: "un",
  };

  it("item etiquetado promete UMA etiqueta, e nada de preparo", async () => {
    vi.stubGlobal("fetch", rede(filaCom({
      estado: "ja_etiquetado", motivo: "Item etiquetado.", quantidade: 0, unidade: "un",
    }, true)));
    render(<ConferirClient />);
    await abrirPainel();

    fireEvent.click(screen.getByRole("button", { name: "Certo" }));
    await screen.findByText(/uma etiqueta só/);
    expect(screen.queryByRole("button", { name: /Preparar este item/ })).toBeNull();
  });

  // O caso que estava mudo. A frase antiga ("este produto não é etiquetado")
  // não dizia que dava pra resolver, então ninguém resolvia.
  it("pilha antiga: diz que não sai etiqueta E que isso tem conserto", async () => {
    vi.stubGlobal("fetch", rede(filaCom(PRECISA, true)));
    render(<ConferirClient />);
    await abrirPainel();

    fireEvent.click(screen.getByRole("button", { name: "Certo" }));
    await screen.findByText(/não sai etiqueta/);
    // A frase do SERVIDOR, não uma inventada aqui: ele é quem sabe o saldo e a
    // unidade do item.
    expect(screen.getByText(/Prepare-o pra etiqueta antes/)).toBeInTheDocument();
    expect(screen.queryByText(/uma etiqueta só/)).toBeNull();
    expect(screen.getByRole("button", { name: /Preparar este item/ })).toBeInTheDocument();
  });

  // Granel NÃO ganha o gesto: preparar um item de 12,5 kg truncaria o saldo pra
  // 12 e os 500 gramas sumiriam do sistema pra sempre, sem erro em lugar nenhum.
  it("item a granel diz por que nunca sai papel — e não oferece conserto", async () => {
    vi.stubGlobal("fetch", rede(filaCom({
      estado: "nao_etiquetavel",
      motivo: "Este item é medido em quilos, e isso não se conta em caixas fechadas.",
      quantidade: 12.5, unidade: "kg",
    }, true)));
    render(<ConferirClient />);
    await abrirPainel();

    fireEvent.click(screen.getByRole("button", { name: "Certo" }));
    await screen.findByText(/não sai papel pra imprimir/);
    expect(screen.getByText(/medido em quilos/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Preparar este item/ })).toBeNull();
  });

  // Ver o problema e poder resolvê-lo são coisas diferentes: ligar a etiqueta
  // num item é escrita de catálogo, e a conferência roda sob uma chave que é só
  // VER. Sem o poder, o botão só devolveria 403 — e um botão que só falha é
  // pior que botão nenhum.
  it("sem poder de ajuste, o gesto de preparo não aparece", async () => {
    vi.stubGlobal("fetch", rede(filaCom(PRECISA, false)));
    render(<ConferirClient />);
    await abrirPainel();

    fireEvent.click(screen.getByRole("button", { name: "Certo" }));
    await screen.findByText(/não sai etiqueta/);
    expect(screen.queryByRole("button", { name: /Preparar este item/ })).toBeNull();
  });

  // A decisão é de quem está de frente pra prateleira, e o código não tem como
  // adivinhá-la: 191 peças soltas podem ser uma caixa lacrada de 191 ou 191
  // peças que saem uma a uma. Escolher sozinho aqui criaria a caixa fantasma —
  // baixa tudo-ou-nada, sem papel colado em nada pra bipar.
  it("o preparo oferece as DUAS formas, com o número real do saldo", async () => {
    vi.stubGlobal("fetch", rede(filaCom(PRECISA, true)));
    render(<ConferirClient />);
    await abrirPainel();

    fireEvent.click(screen.getByRole("button", { name: "Certo" }));
    fireEvent.click(await screen.findByRole("button", { name: /Preparar este item/ }));

    await screen.findByRole("button", { name: /1 etiqueta valendo 191 unidades/ });
    expect(screen.getByRole("button", { name: /191 etiquetas de 1 peça/ })).toBeInTheDocument();
  });

  // Depois de preparar, a promessa muda NA MESMA TELA. Mandar recarregar aqui
  // seria devolver o gerente pra fila com a caixa ainda na mão.
  it("preparado como caixa única, o certo passa a prometer a etiqueta — sem recarregar", async () => {
    vi.stubGlobal("fetch", rede({
      ...filaCom(PRECISA, true),
      [PREPARAR]: { body: {
        ok: true,
        resultados: [{ item_id: "i1", nome: "Painel Ripado", ok: true, geradas: 1, sku: "PNL" }],
        resumo: { itens: 1, etiquetas: 1, falhas: 0 },
      } },
    }));
    render(<ConferirClient />);
    await abrirPainel();

    fireEvent.click(screen.getByRole("button", { name: "Certo" }));
    fireEvent.click(await screen.findByRole("button", { name: /Preparar este item/ }));
    fireEvent.click(await screen.findByRole("button", { name: /1 etiqueta valendo 191 unidades/ }));

    // O modo viaja: sem ele a rota gera 191 papéis de uma peça, que é o
    // contrário do que a pessoa acabou de escolher.
    await waitFor(() => expect(corpoEnviado(PREPARAR)).not.toBeNull());
    expect(corpoEnviado(PREPARAR)).toMatchObject({ modo: "pilha", itens: [{ item_id: "i1" }] });
    // A quantidade NÃO viaja: a rota usa o saldo de agora. Mandar o número que a
    // tela leu há dois minutos congelaria um saldo que outra pessoa mexeu.
    expect(Object.keys((corpoEnviado(PREPARAR)!.itens as Record<string, unknown>[])[0])).toEqual(["item_id"]);

    await screen.findByText(/uma etiqueta só/);
    expect(screen.queryByRole("button", { name: /Preparar este item/ })).toBeNull();
  });

  it("preparo recusado mostra a frase do servidor e não promete etiqueta nenhuma", async () => {
    vi.stubGlobal("fetch", rede({
      ...filaCom(PRECISA, true),
      [PREPARAR]: { body: {
        ok: true,
        resultados: [{ item_id: "i1", nome: "Painel Ripado", ok: false, geradas: 0, sku: null, erro: "5000 etiquetas de uma vez é demais (máximo 2000)." }],
        resumo: { itens: 0, etiquetas: 0, falhas: 1 },
      } },
    }));
    render(<ConferirClient />);
    await abrirPainel();

    fireEvent.click(screen.getByRole("button", { name: "Certo" }));
    fireEvent.click(await screen.findByRole("button", { name: /Preparar este item/ }));
    fireEvent.click(await screen.findByRole("button", { name: /191 etiquetas de 1 peça/ }));

    await screen.findByText(/máximo 2000/);
    expect(screen.queryByText(/uma etiqueta só/)).toBeNull();
  });

  // Servidor ainda sem a regra (ou resposta velha em cache depois do deploy):
  // a tela volta ao comportamento de antes em vez de prometer papel no escuro.
  // Errar pro lado de não prometer é o erro barato.
  it("sem o veredicto do servidor, promete só o que a flag antiga garante", async () => {
    vi.stubGlobal("fetch", rede({
      [PENDENTES]: { body: { atividades: [pendente({ itemSerializado: false, preparo: undefined })], travadas: 0, proximoCursor: null, qcDesligado: false } },
    }));
    render(<ConferirClient />);
    await abrirPainel();

    fireEvent.click(screen.getByRole("button", { name: "Certo" }));
    await screen.findByText(/não sai papel pra imprimir/);
    expect(screen.queryByText(/uma etiqueta só/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Preparar este item/ })).toBeNull();
  });
});

// ── O material que entrou ────────────────────────────────────────────────────
// A tela de bipar promete, com estas palavras, que "a baixa fica amarrada a ela
// — quem conferir depois vê o que entrou". Ninguém via: o gerente decidia
// certo/errado olhando só a caixa pronta, sem saber se as 30 peças saíram de 30
// folhas ou de 45.
describe("Conferir · o que a atividade consumiu", () => {
  it("mostra as peças de material bipadas, e a sobra quando a conta não fecha", async () => {
    vi.stubGlobal("fetch", rede({
      [PENDENTES]: { body: {
        atividades: [pendente({ quantidadeFeita: 30, consumo: { etiquetas: 2, pecas: 45 } })],
        travadas: 0, proximoCursor: null, qcDesligado: false, consumoIndisponivel: false,
      } },
    }));
    render(<ConferirClient />);
    await abrirPainel();

    const painel = within(screen.getByRole("dialog"));
    await painel.findByText(/45 peças de material/);
    await painel.findByText(/15 a mais do que saiu pronto/);
  });

  // A ausência TAMBÉM é informação: caixa que nasce sem material bipado é
  // material que saiu do estoque sem registro. Omitir é o que deixava isso
  // passar em silêncio.
  it("sem material bipado, DIZ que não houve — não omite", async () => {
    vi.stubGlobal("fetch", rede({
      [PENDENTES]: { body: {
        atividades: [pendente({ consumo: null })],
        travadas: 0, proximoCursor: null, qcDesligado: false, consumoIndisponivel: false,
      } },
    }));
    render(<ConferirClient />);
    await abrirPainel();

    await within(screen.getByRole("dialog")).findByText(/Nenhum material bipado nesta atividade/);
  });

  // Enquanto o banco não guarda o vínculo, a tela cala em vez de acusar a
  // pessoa de não ter bipado nada.
  it("sem o vínculo no banco, o bloco simplesmente não aparece", async () => {
    vi.stubGlobal("fetch", rede({
      [PENDENTES]: { body: {
        atividades: [pendente({ consumo: null })],
        travadas: 0, proximoCursor: null, qcDesligado: false, consumoIndisponivel: true,
      } },
    }));
    render(<ConferirClient />);
    await abrirPainel();

    expect(screen.queryByText(/Nenhum material bipado/)).toBeNull();
  });
});

describe("Conferir · QC ainda não ligado", () => {
  it("explica com calma em vez de estourar erro", async () => {
    vi.stubGlobal("fetch", rede({
      [PENDENTES]: { body: { atividades: [], travadas: 0, proximoCursor: null, qcDesligado: true } },
    }));
    render(<ConferirClient />);

    await screen.findByText(/ainda não foi ligado/);
    // A frase de falha genérica NÃO pode aparecer: não houve falha nenhuma.
    expect(screen.queryByText(/Não deu pra carregar/)).toBeNull();
  });
});

describe("Conferir · histórico", () => {
  /** Uma tentativa do histórico, no formato binário. */
  function tentativa(over: Record<string, unknown> = {}) {
    return {
      id: "c1", atividadeId: "a9", itemId: "i1", itemNome: "Painel Ripado",
      executorId: "u2", executorNome: "Marina",
      conferidoPorId: "u1", conferidoPorNome: "Caio",
      resultado: "errado", quantidade: 0, unidadeCodigo: null,
      defeitos: ["acabamento_ruim"], obs: "Duas com a borda lascada.",
      conferidoEm: new Date().toISOString(),
      tentativa: 1, tentativas: 1, ...over,
    };
  }

  function comHistorico(conferencias: unknown[]) {
    return rede({
      // A rota de pendentes tem de vir primeiro: "/api/estoque/conferencias"
      // casaria as duas por prefixo.
      [PENDENTES]: { body: { atividades: [], travadas: 0, proximoCursor: null, qcDesligado: false } },
      [RAIZ]: { body: { conferencias, proximoCursor: null, qcDesligado: false } },
    });
  }

  it("mostra a observação que o gestor digitou — era write-only no sistema inteiro", async () => {
    vi.stubGlobal("fetch", comHistorico([tentativa()]));
    render(<ConferirClient />);

    fireEvent.click(await screen.findByRole("tab", { name: /Histórico/ }));

    await screen.findByText("Duas com a borda lascada.");
    // Chave fechada vira rótulo legível, nunca a chave crua.
    await screen.findByText("Acabamento ruim");
    expect(screen.queryByText("acabamento_ruim")).toBeNull();
    await screen.findByText("Caio");
  });

  it("o resultado é certo ou errado — a nota de 1 a 5 não existe mais", async () => {
    vi.stubGlobal("fetch", comHistorico([
      tentativa({ id: "ok", atividadeId: "a1", resultado: "certo", quantidade: 50, unidadeCodigo: "PNL-00042", defeitos: [], obs: null }),
      tentativa({ id: "nok", atividadeId: "a2" }),
    ]));
    render(<ConferirClient />);

    fireEvent.click(await screen.findByRole("tab", { name: /Histórico/ }));

    await screen.findByText("Certo");
    await screen.findByText("Errado");
    // Aprovado diz QUANTAS peças entraram e em que caixa — é o caminho de volta
    // do papel colado na caixa até quem a aprovou.
    await screen.findByText("50 peças");
    await screen.findByText("PNL-00042");
    for (const nota of ["Bom", "Mediano", "Péssimo"]) expect(screen.queryByText(nota)).toBeNull();
  });

  // Três linhas da MESMA atividade não são três caixas: são a mesma caixa
  // voltando pra bancada duas vezes. Espalhadas pela ordem cronológica, essa
  // história não se lê.
  it("a atividade refeita vira UM card com as tentativas em ordem", async () => {
    const base = new Date("2026-08-10T12:00:00Z").getTime();
    vi.stubGlobal("fetch", comHistorico([
      tentativa({ id: "t3", resultado: "certo", quantidade: 12, defeitos: [], obs: "Terceira volta, saiu certo.", conferidoEm: new Date(base + 2 * 86400_000).toISOString(), tentativa: 3, tentativas: 3 }),
      tentativa({ id: "t2", obs: "Ainda lascado.", conferidoEm: new Date(base + 86400_000).toISOString(), tentativa: 2, tentativas: 3 }),
      tentativa({ id: "t1", obs: "Borda lascada.", conferidoEm: new Date(base).toISOString(), tentativa: 1, tentativas: 3 }),
    ]));
    render(<ConferirClient />);

    fireEvent.click(await screen.findByRole("tab", { name: /Histórico/ }));

    // Um card só, e ele avisa que a caixa foi refeita.
    await screen.findByText(/3 conferências — foi refeita/);
    expect(screen.getAllByText("Painel Ripado")).toHaveLength(1);

    // Na ordem dos FATOS: a primeira tentativa em cima, a aprovação embaixo.
    const textos = [...document.querySelectorAll("p")].map((p) => p.textContent);
    const ordem = textos.filter((t) => t && /Borda lascada|Ainda lascado|Terceira volta/.test(t));
    expect(ordem).toEqual(["Borda lascada.", "Ainda lascado.", "Terceira volta, saiu certo."]);
  });

  it("quando parte das tentativas ficou fora da janela, a tela diz — em vez de numerar errado", async () => {
    vi.stubGlobal("fetch", comHistorico([tentativa({ tentativa: 4, tentativas: 4 })]));
    render(<ConferirClient />);

    fireEvent.click(await screen.findByRole("tab", { name: /Histórico/ }));

    await screen.findByText("4ª de 4");
    await screen.findByText(/Mais 3 tentativas desta atividade/);
  });
});

// ── Segunda via ──────────────────────────────────────────────────────────────
// A etiqueta da aprovação só existia DENTRO do painel de conferência e sumia
// quando ele fechava: uma chance só. Rede caindo, aba fechada ou navegador
// morto no meio deixavam a caixa lacrada na prateleira sem código colado, e
// nenhuma tela do sistema refazia o papel.
describe("Conferir · segunda via da etiqueta", () => {
  const ETIQUETA = "/api/estoque/unidades/etiqueta";

  function tentativaAprovada() {
    return {
      id: "c1", atividadeId: "a9", itemId: "i1", itemNome: "Painel Ripado",
      executorId: "u2", executorNome: "Marina",
      conferidoPorId: "u1", conferidoPorNome: "Caio",
      resultado: "certo", quantidade: 50, unidadeCodigo: "PNL-00042",
      defeitos: [], obs: null, conferidoEm: new Date().toISOString(),
      tentativa: 1, tentativas: 1,
    };
  }

  it("a caixa aprovada pode ser reimpressa pelo histórico, com a etiqueta do SERVIDOR", async () => {
    vi.stubGlobal("fetch", rede({
      [PENDENTES]: { body: { atividades: [], travadas: 0, proximoCursor: null, qcDesligado: false } },
      [ETIQUETA]: { body: { etiquetas: [{
        codigo: "PNL-00042", unidadeId: "u-42", itemId: "i1", nome: "Painel Ripado",
        quantidade: 50, corDimensoes: "Branco · 2750×1840", local: "GAL-A", localDetalhe: "C3 · B2",
        responsavel: "Marina", data: "2026-08-12T12:00:00.000Z",
      }] } },
      [RAIZ]: { body: { conferencias: [tentativaAprovada()], proximoCursor: null, qcDesligado: false } },
    }));
    render(<ConferirClient />);

    fireEvent.click(await screen.findByRole("tab", { name: /Histórico/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Imprimir etiqueta de novo/ }));

    // A folha é montada pelo servidor: nome, selo da caixa e local vêm de lá.
    // Montar aqui repetiria a regra e as duas versões divergiriam — é o que
    // acontece no tablet, cuja reimpressão local sai com o SKU no lugar do nome.
    const painel = within(await screen.findByRole("dialog", { name: /Segunda via/ }));
    await painel.findByText("50 un");
    expect(painel.getAllByText("PNL-00042").length).toBeGreaterThan(0);
    expect(painel.getByRole("button", { name: "Imprimir" })).toBeInTheDocument();
  });

  it("reprovada não oferece reimpressão — não existe etiqueta pra caixa que voltou", async () => {
    vi.stubGlobal("fetch", rede({
      [PENDENTES]: { body: { atividades: [], travadas: 0, proximoCursor: null, qcDesligado: false } },
      [RAIZ]: { body: { conferencias: [{ ...tentativaAprovada(), resultado: "errado", quantidade: 0, unidadeCodigo: null }], proximoCursor: null, qcDesligado: false } },
    }));
    render(<ConferirClient />);

    fireEvent.click(await screen.findByRole("tab", { name: /Histórico/ }));
    await screen.findByText("Errado");
    expect(screen.queryByRole("button", { name: /Imprimir etiqueta de novo/ })).toBeNull();
  });

  it("código que não existe mais no sistema é dito, não some em silêncio", async () => {
    vi.stubGlobal("fetch", rede({
      [PENDENTES]: { body: { atividades: [], travadas: 0, proximoCursor: null, qcDesligado: false } },
      [ETIQUETA]: { body: { etiquetas: [] } },
      [RAIZ]: { body: { conferencias: [tentativaAprovada()], proximoCursor: null, qcDesligado: false } },
    }));
    render(<ConferirClient />);

    fireEvent.click(await screen.findByRole("tab", { name: /Histórico/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Imprimir etiqueta de novo/ }));

    await screen.findByText(/Nenhum destes códigos existe no sistema/);
  });
});

describe("Conferir · erro do servidor vira frase em português", () => {
  it("a fila sem permissão explica o que pedir", async () => {
    vi.stubGlobal("fetch", rede({ [PENDENTES]: { status: 403, body: { error: "forbidden" } } }));
    render(<ConferirClient />);
    await screen.findByText(/liberação do Estoque em Permissões/);
  });

  it("cada código tem uma ação própria, e o desconhecido cai no genérico", () => {
    const conferente = mensagemDeErroDeConferencia("conferente_e_executor");
    expect(conferente).toMatch(/próprio trabalho/);

    // Estes três mandam a pessoa fazer coisas DIFERENTES — se algum cair no
    // genérico "tente de novo", ela tenta pra sempre sem resolver.
    const distintos = [
      mensagemDeErroDeConferencia("item_nao_encontrado"),
      mensagemDeErroDeConferencia("schema_desatualizado"),
      mensagemDeErroDeConferencia("unauthorized"),
      mensagemDeErroDeConferencia("atividade_ja_conferida"),
      conferente,
    ];
    const generico = mensagemDeErroDeConferencia("qualquer_coisa_nova");
    for (const m of distintos) expect(m).not.toBe(generico);
    expect(new Set(distintos).size).toBe(distintos.length);

    expect(mensagemDeErroDeConferencia(null)).toBe(generico);
    expect(generico).toMatch(/nada foi gravado/);
  });
});
