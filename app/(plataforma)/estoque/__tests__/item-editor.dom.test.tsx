import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Item } from "../tipos";

// Editar item que já existe salva em SEGUNDO PLANO (ui/salvarEmSegundoPlano.ts):
// o modal fecha na hora e a recusa do servidor chega como aviso. É o aviso que
// este arquivo confere — o que não pode voltar é recusa virar "salvo" calada.
const aviso = vi.hoisted(() => ({ ok: vi.fn(), erro: vi.fn(), info: vi.fn() }));
vi.mock("../../Toast", () => ({ toast: Object.assign(vi.fn(), aviso), ToastHost: () => null }));
const { ItemEditor } = await import("../ItemEditor");

// Configurar o catálogo pra etiquetar é a tarefa que estava travando todo o
// resto, e ela falhava CALADA: o `salvar()` nunca olhava a resposta, então
// 403, 409 e o erro da guarda do banco viravam "salvo" com o modal fechando.
// Este arquivo trava as quatro coisas que, se voltarem a quebrar, devolvem a
// pessoa ao vaivém de antes.
//
// Sem geometria: jsdom não tem motor de layout. Alvo de toque e 320px se
// conferem no navegador (/dev-estoque-item).

const BASE: Item = {
  id: "i1",
  nome: "Chapa MDF 6mm",
  hierarquia: "peca",
  produzido: false,
  serializado: false,
  categoria: "Insumos",
  imagem_url: null,
  unidade: "ch",
  quantidade: 0,
  qtd_minima: 0,
  ativo: true,
  sku: "MDF6MM",
};

const CATALOGO = [
  { id: "i1", nome: "Chapa MDF 6mm", hierarquia: "peca", sku: "MDF6MM" },
  { id: "i2", nome: "Cavalete", hierarquia: "peca", sku: "PEC-0001" },
];

/** Respostas por rota; o que não estiver aqui volta `{}` com 200. */
function stubFetch(rotas: Record<string, { ok?: boolean; status?: number; body?: unknown }>) {
  return vi.fn((url: string) => {
    const chave = Object.keys(rotas).find((k) => String(url).startsWith(k));
    const r = chave ? rotas[chave] : {};
    return Promise.resolve({
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: () => Promise.resolve(r.body ?? {}),
    } as Response);
  });
}

beforeEach(() => {
  // A fila mora no localStorage: o que um teste deixou não pode sair no outro.
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", stubFetch({}));
});
afterEach(() => vi.unstubAllGlobals());

describe("Salvar item — a resposta é lida", () => {
  it("recusa do servidor NÃO vira salvo: o aviso traz a frase do servidor", async () => {
    vi.stubGlobal("fetch", stubFetch({
      "/api/estoque-itens": { ok: false, status: 409, body: { error: "guarda_estoque", detalhe: 'Item "Chapa MDF 6mm" tem 12 em estoque e nenhuma etiqueta gerada.' } },
    }));
    const onSaved = vi.fn();
    render(<ItemEditor item={BASE} itens={CATALOGO} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(aviso.erro).toHaveBeenCalledWith(expect.stringMatching(/nenhuma etiqueta gerada/)));
    // Recusado não recarrega a lista como se tivesse gravado.
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("sucesso fecha o modal", async () => {
    vi.stubGlobal("fetch", stubFetch({ "/api/estoque-itens": { body: { ok: true } } }));
    const onSaved = vi.fn();
    render(<ItemEditor item={BASE} itens={CATALOGO} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});

describe("Item que já tem estoque contado", () => {
  const comEstoque: Item = { ...BASE, quantidade: 12 };

  it("não oferece a caixinha que o banco recusa — oferece o caminho que funciona", () => {
    render(<ItemEditor item={comEstoque} itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);

    // O caminho só aparece pra quem ESCOLHEU número de série: é essa escolha
    // que a guarda do banco recusa fazer sozinha. Sem o clique, o item de
    // código fixo fica com a escolha à mostra — ver "Como etiquetar".
    fireEvent.click(screen.getByRole("button", { name: /Número de série por peça/ }));

    expect(screen.queryByRole("checkbox", { name: /Cada unidade tem etiqueta/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Etiquetar 12 unidades/ })).toBeTruthy();
  });

  it("etiquetar chama o endpoint que liga e gera de uma vez, e revela as unidades", async () => {
    const fetchSpy = stubFetch({
      "/api/estoque/unidades/preparar": { body: { ok: true, resultados: [{ item_id: "i1", nome: "Chapa MDF 6mm", ok: true, geradas: 12, sku: "MDF6MM" }] } },
      "/api/estoque/unidades": { body: { unidades: [], contagem: { em_estoque: 12 } } },
    });
    vi.stubGlobal("fetch", fetchSpy);
    render(<ItemEditor item={comEstoque} itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Número de série por peça/ }));
    fireEvent.click(screen.getByRole("button", { name: /Etiquetar 12 unidades/ }));

    await waitFor(() => expect(screen.getByText("Unidades etiquetadas")).toBeTruthy());
    const chamadas = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(chamadas.some((u) => u.startsWith("/api/estoque/unidades/preparar"))).toBe(true);
  });
});

describe("Gerar etiquetas só depois de o banco saber", () => {
  it("escolher número de série não revela o botão de gerar — pede pra salvar antes", async () => {
    render(<ItemEditor item={BASE} itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);

    // Era uma caixinha ("Cada unidade tem etiqueta"), que descrevia como o item
    // é CONTADO. Virou uma escolha de duas, escrita pelo que sai na impressora —
    // a pergunta que a pessoa de fato tem na mão.
    fireEvent.click(screen.getByRole("button", { name: /Número de série por peça/ }));

    expect(screen.queryByRole("button", { name: /Gerar etiquetas/ })).toBeNull();
    expect(screen.getByText(/Salve o item para poder gerar as etiquetas/)).toBeTruthy();
  });

  it("item já etiquetado no banco mostra o bloco de unidades", async () => {
    vi.stubGlobal("fetch", stubFetch({ "/api/estoque/unidades": { body: { unidades: [], contagem: { em_estoque: 0 } } } }));
    render(<ItemEditor item={{ ...BASE, serializado: true }} itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);

    expect(await screen.findByRole("button", { name: /Gerar etiquetas/ })).toBeTruthy();
  });
});

describe("SKU — sugerido, e nunca duplicado", () => {
  it("item novo nasce com o próximo SKU livre do catálogo", async () => {
    // "da hierarquia" era o desenho antigo: cada tipo tinha o próprio prefixo e
    // a própria contagem. Agora a numeração é global (PRD-####), então o próximo
    // livre não depende da aba em que a pessoa está.
    render(<ItemEditor hierarquiaInit="peca" itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);

    const campo = await screen.findByDisplayValue(/^PRD-\d{4}$/);
    expect(campo).toBeTruthy();
  });

  it("SKU de outro item bloqueia o salvar e diz de quem é", async () => {
    const onSaved = vi.fn();
    render(<ItemEditor item={BASE} itens={CATALOGO} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.change(screen.getByDisplayValue("MDF6MM"), { target: { value: "PEC-0001" } });

    expect(await screen.findByText(/Já é o SKU de "Cavalete"/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("não rebaixa o catálogo quando quem abriu já o entregou", () => {
    const fetchSpy = stubFetch({});
    vi.stubGlobal("fetch", fetchSpy);
    render(<ItemEditor item={BASE} itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);

    const chamadas = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(chamadas.some((u) => u === "/api/estoque-itens")).toBe(false);
  });
});

// ── Nem todo item leva etiqueta na peça ──────────────────────────────────────
// O bloco "Cada unidade tem etiqueta" nasceu pra UM caso: a pessoa escolheu
// número de série num item que já tem estoque contado, e ligar sozinho zeraria
// a contagem. Mas a condição não olhava a escolha, só o estoque — então QUALQUER
// item salvo com quantidade e sem etiqueta caía nele. E como esse bloco
// SUBSTITUI a escolha "Como etiquetar este item", a opção de código fixo
// desaparecia da tela.
//
// Medido em produção: "Saco De Envio M", 600 un, abria propondo "Etiquetar 600
// unidades" (PRD-0198-000001 a -000600) sem alternativa nenhuma. Ninguém cola
// etiqueta em 600 sacos — ela vai na caixa que chegou, e o estoque continua
// sendo o número comprado.
describe("Como etiquetar: a escolha não pode sumir", () => {
  const COM_ESTOQUE: Item = { ...BASE, id: "i9", nome: "Saco De Envio M", hierarquia: "embalagem", serializado: false, quantidade: 600, unidade: "un", sku: "PRD-0198" };

  it("item de código fixo com estoque mostra a ESCOLHA, não as 600 etiquetas", async () => {
    render(<ItemEditor item={COM_ESTOQUE} itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);

    expect(await screen.findByText("Código fixo do produto")).toBeInTheDocument();
    expect(screen.getByText("Número de série por peça")).toBeInTheDocument();
    expect(screen.queryByText("Cada unidade tem etiqueta")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Etiquetar 600 unidades/ })).not.toBeInTheDocument();
  });

  it("quem ESCOLHE número de série aí sim recebe o caminho de gerar as etiquetas", async () => {
    render(<ItemEditor item={COM_ESTOQUE} itens={CATALOGO} podeAjustar onClose={() => {}} onSaved={() => {}} />);

    fireEvent.click(await screen.findByText("Número de série por peça"));

    expect(await screen.findByText("Cada unidade tem etiqueta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Etiquetar 600 unidades/ })).toBeInTheDocument();
  });
});

// ── A composição não pode ficar escondida atrás de um interruptor ────────────
// `produzido` desligado fazia o bloco "Ficha técnica" sumir inteiro, sem uma
// palavra. No catálogo real isso valia pras 21 peças e pros 33 componentes:
// todos abriam sem lugar nenhum de adicionar matéria-prima, e a conclusão certa
// de quem usa era "não dá pra adicionar".
describe("Ficha técnica aparece mesmo com 'produzido' desligado", () => {
  it("explica o interruptor e oferece ligá-lo, em vez de sumir", async () => {
    render(<ItemEditor item={{ ...BASE, produzido: false }} itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);

    expect(await screen.findByText("Ficha técnica")).toBeInTheDocument();
    const ligar = screen.getByRole("button", { name: /produzido aqui dentro/i });

    fireEvent.click(ligar);

    expect(await screen.findByRole("button", { name: /Adicionar componente/ })).toBeInTheDocument();
  });
});
