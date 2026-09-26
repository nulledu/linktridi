import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ItemEditor } from "../ItemEditor";
import type { Item } from "../tipos";

// ── O SKU na tela: sequência, não escolha ───────────────────────────────────
//
// O SKU é o começo do código de CADA etiqueta física, e trocá-lo depois não
// reimprime nada.
//
// A tela já teve um botão "Sugerir MP-0001" e, depois, uma fileira de chips
// ("Padrão do sistema", "Segue a família Carimbo", "Iniciais do nome"). Os dois
// pediam uma DECISÃO sobre uma coisa que não tem decisão: a numeração é uma
// sequência global, e cada convenção nova escolhida virava mais uma família
// convivendo no mesmo catálogo — foi assim que o banco acabou com cinco.
//
// Agora o campo nasce com o PRÓXIMO número (último + 1) e continua editável,
// porque item com SKU próprio ("CRB16", impresso em prateleira) é caso real.
// O que este arquivo tranca:
//
// 1. O campo nasce preenchido, e com o número certo — o que vem DEPOIS do
//    último, nunca um já ocupado (o catálogo tem buraco na sequência).
// 2. Digitar o seu desliga o automático: o campo não pode ser sobrescrito
//    embaixo de quem está digitando, nem ao trocar a hierarquia.
//
// Sem geometria: jsdom não tem motor de layout. Alvo de toque, a fileira que
// rola de lado e os 320px se conferem no navegador (/dev-estoque-item).

/** O catálogo do dono: uma família de verdade (CRB, número = a medida). */
const CATALOGO = [
  { id: "c4", nome: "Carimbo 4cm", hierarquia: "produto", sku: "CRB04" },
  { id: "c12", nome: "Carimbo 12cm", hierarquia: "produto", sku: "CRB12" },
  { id: "c15", nome: "Carimbo 15cm", hierarquia: "produto", sku: "CRB15" },
];

const BASE: Item = {
  id: "i1",
  nome: "Chapa MDF 6mm",
  hierarquia: "peca",
  produzido: false,
  serializado: false,
  categoria: "",
  imagem_url: null,
  unidade: "ch",
  quantidade: 0,
  qtd_minima: 0,
  ativo: true,
  sku: "MDF6MM",
};

function stubFetch(rotas: Record<string, { ok?: boolean; status?: number; body?: unknown }> = {}) {
  return vi.fn((url: string, init?: RequestInit) => {
    void init;
    const chave = Object.keys(rotas).find((k) => String(url).startsWith(k));
    const r = chave ? rotas[chave] : {};
    return Promise.resolve({
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: () => Promise.resolve(r.body ?? {}),
    } as Response);
  });
}

const campoSku = () => screen.getByLabelText("SKU / Código") as HTMLInputElement;
const campoNome = () => screen.getByPlaceholderText("Nome do produto");

beforeEach(() => vi.stubGlobal("fetch", stubFetch()));
afterEach(() => vi.unstubAllGlobals());

describe("O campo nasce com o próximo da sequência", () => {
  // O catálogo real: 245 SKUs, o maior é PRD-0246 — e um número foi pulado.
  const COM_SEQUENCIA = [
    { id: "a", nome: "Item A", hierarquia: "produto", sku: "PRD-0244" },
    { id: "b", nome: "Item B", hierarquia: "produto", sku: "PRD-0246" },
  ];

  it("ao criar: já vem preenchido com último + 1", () => {
    render(<ItemEditor hierarquiaInit="produto" itens={COM_SEQUENCIA} onClose={() => {}} onSaved={() => {}} />);

    expect(campoSku().value).toBe("PRD-0247");
  });

  it("diz de onde veio o número, em vez de aparecer do nada", () => {
    render(<ItemEditor hierarquiaInit="produto" itens={COM_SEQUENCIA} onClose={() => {}} onSaved={() => {}} />);

    expect(screen.getByText(/Último SKU:/)).toHaveTextContent("PRD-0246");
    expect(screen.getByText(/Último SKU:/)).toHaveTextContent("PRD-0247");
  });

  it("buraco na sequência não faz o número VOLTAR pra um já ocupado", () => {
    // `quantos existem + 1` daria PRD-0003 num catálogo que já tem PRD-0246.
    render(<ItemEditor hierarquiaInit="produto" itens={COM_SEQUENCIA} onClose={() => {}} onSaved={() => {}} />);

    expect(campoSku().value).not.toBe("PRD-0003");
    expect(campoSku().value).toBe("PRD-0247");
  });

  it("catálogo vazio começa em PRD-0001", () => {
    render(<ItemEditor hierarquiaInit="produto" itens={[]} onClose={() => {}} onSaved={() => {}} />);

    expect(campoSku().value).toBe("PRD-0001");
  });

  it("não existe mais fileira de sugestões pra escolher", () => {
    render(<ItemEditor hierarquiaInit="produto" itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(campoNome(), { target: { value: "Carimbo 16cm" } });

    expect(screen.queryByText("Sugestões de SKU")).toBeNull();
    expect(screen.queryByRole("button", { name: /CRB16/ })).toBeNull();
  });

  it("item que já existe mantém o SKU gravado — ele pode estar impresso", () => {
    render(<ItemEditor item={{ ...BASE, nome: "Carimbo 16cm", hierarquia: "produto" }} itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);

    expect(campoSku().value).toBe("MDF6MM");
    // E a frase da sequência não aparece: não há número novo sendo proposto.
    expect(screen.queryByText(/Último SKU:/)).toBeNull();
  });
});

describe("Digitar o seu × aceitar a sugestão", () => {
  it("o SKU digitado à mão sobrevive à troca de hierarquia", () => {
    render(<ItemEditor hierarquiaInit="materia_prima" itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(campoNome(), { target: { value: "MDF 6mm pintado" } });
    fireEvent.change(campoSku(), { target: { value: "MDF6P" } });

    fireEvent.click(screen.getByRole("button", { name: "Matéria-Prima Processada" }));

    expect(campoSku().value).toBe("MDF6P");
  });

  it("o bug do MP-0001 morreu na raiz: o prefixo não depende mais da hierarquia", () => {
    // Cada hierarquia já teve o próprio prefixo (MP × MPP), e o SKU errado
    // nascia dessa divergência. Com PRD-#### pra tudo, trocar a hierarquia não
    // pode mais mudar o número — é isso que o teste trava.
    render(<ItemEditor hierarquiaInit="materia_prima" itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(campoNome(), { target: { value: "MDF 6mm pintado" } });
    const nascido = campoSku().value;
    expect(nascido).toMatch(/^PRD-\d{4}$/);

    fireEvent.click(screen.getByRole("button", { name: "Matéria-Prima Processada" }));

    expect(campoSku().value, "o prefixo é o mesmo em qualquer hierarquia").toBe(nascido);
  });

  it("a prévia do código da etiqueta segue o que está no campo", () => {
    render(<ItemEditor hierarquiaInit="produto" itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);

    fireEvent.change(campoSku(), { target: { value: "AC06" } });

    expect(screen.getByText("AC06-000042")).toBeTruthy();
  });
});

describe("Caixa do SKU", () => {
  it("minúscula vira maiúscula ao SAIR do campo, não enquanto digita", () => {
    render(<ItemEditor hierarquiaInit="produto" itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);

    fireEvent.change(campoSku(), { target: { value: "ijifyu7" } });
    expect(campoSku().value).toBe("ijifyu7"); // digitar não é corrigido no meio

    fireEvent.blur(campoSku());
    expect(campoSku().value).toBe("IJIFYU7");
  });

  it("o que vai pro servidor é o SKU normalizado, mesmo sem passar pelo blur", async () => {
    const fetchSpy = stubFetch({ "/api/estoque-itens": { body: { ok: true, item: { id: "novo" } } } });
    vi.stubGlobal("fetch", fetchSpy);
    render(<ItemEditor hierarquiaInit="produto" itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(campoNome(), { target: { value: "Logo iluminada 70cm" } });
    fireEvent.change(campoSku(), { target: { value: " ijifyu7 " } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      const post = fetchSpy.mock.calls.find(([u, o]) => String(u) === "/api/estoque-itens" && o?.method === "POST");
      expect(post).toBeTruthy();
      expect(JSON.parse(String(post![1]?.body)).sku).toBe("IJIFYU7");
    });
  });
});

describe("Etiqueta já impressa é papel, e papel não se atualiza", () => {
  const AVISO = /não reimprime/;

  it("item sem nenhuma unidade não ganha o aviso", () => {
    render(<ItemEditor item={BASE} itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);

    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("com etiqueta em estoque o aviso aparece ANTES de trocar, e fica mais duro depois", async () => {
    vi.stubGlobal("fetch", stubFetch({
      "/api/estoque/unidades": { body: { unidades: [], contagem: { em_estoque: 12 } } },
    }));
    render(<ItemEditor item={{ ...BASE, serializado: true }} itens={CATALOGO} onClose={() => {}} onSaved={() => {}} />);

    // Antes de encostar no campo: o aviso já explica o risco.
    expect(await screen.findByText(AVISO)).toBeTruthy();
    expect(screen.getByText(/MDF6MM-000001/)).toBeTruthy();

    fireEvent.change(campoSku(), { target: { value: "CRB99" } });

    expect(screen.getByText(/Só troque se for reimprimir todas/)).toBeTruthy();
  });
});
