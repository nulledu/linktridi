import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContatosClient } from "../ContatosClient";
import type { Contato, ParteFinanceira } from "@/lib/financeiro/tipos";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const fornecedor = (over: Partial<ParteFinanceira> = {}): ParteFinanceira => ({
  id: "contato-atlas",
  empresa_id: "empresa-1",
  nome: "Atlas",
  natureza: "empresa",
  organizacao_id: null,
  categoria: "Matéria-prima",
  categorias: ["Matéria-prima"],
  telefone: "(14) 3333-4444",
  telefones: ["(14) 3333-4444"],
  email: "compras@atlas.test",
  endereco: "Rua das Acácias, 10",
  tipo: "fornecedor",
  cargo: null,
  organizacao: null,
  site: "atlas.test",
  observacao: "Entregas pela manhã",
  ativo: true,
  logo_url: null,
  icone: "truck",
  papeis: ["fornecedor", "parceiro"],
  cnpj: "12345678000199",
  fornecedor: {
    id: "fornecedor-atlas",
    empresa_id: "empresa-1",
    nome: "Atlas",
    cnpj: "12345678000199",
    categoria: "Matéria-prima",
    categorias: ["Matéria-prima"],
    contato_nome: "Ana",
    contato_email: "ana@atlas.test",
    contato_fone: "(14) 99999-1111",
    prazo_dias: 30,
    prazo_envio_dias: 7,
    forma_pagamento: "Boleto",
    ativo: true,
    pix_tipo: "cnpj",
    pix_chave: "12345678000199",
    banco: "Banco Atlas",
    agencia: "0001",
    conta_numero: "12345-6",
    aceita_boleto: true,
    inscricao_estadual: "ISENTO",
    site: "atlas.test",
    whatsapp: "(14) 99999-1111",
    cidade: "Bauru",
    uf: "SP",
    endereco: "Rua das Acácias, 10",
    observacao: "Entregas pela manhã",
    logo_url: null,
    icone: "truck",
  },
  ...over,
});

const pessoa: ParteFinanceira = {
  ...fornecedor({
    id: "contato-bia",
    nome: "Bia",
    natureza: "pessoa",
    papeis: ["contato"],
    tipo: null,
    cnpj: null,
    fornecedor: null,
  }),
};

function props(extra: Record<string, unknown> = {}) {
  return {
    empresas: [{ id: "empresa-1", nome: "Tridi" }],
    empresaId: "empresa-1",
    empresaNome: "Tridi",
    podeEscrever: true,
    lista: [fornecedor(), pessoa],
    logos: {},
    catalogoDeCategorias: [{ nome: "Matéria-prima" }],
    formasDePagamento: ["Boleto", "Pix"],
    schemaPendente: false,
    ...extra,
  };
}

beforeEach(() => {
  refresh.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true }),
  })));
});

afterEach(() => vi.unstubAllGlobals());

describe("diretório financeiro unificado", () => {
  it("mantém a demonstração móvel legada utilizável como contato comum", () => {
    const legado: Contato = {
      id: "legado-1", empresa_id: "empresa-1", nome: "Contato legado", natureza: "pessoa",
      organizacao_id: null, categoria: null, categorias: [], telefone: null, telefones: [],
      email: null, endereco: null, tipo: null, cargo: null, organizacao: null, site: null,
      observacao: null, ativo: true,
    };

    render(<ContatosClient {...props({ lista: [legado] })} />);

    expect(screen.getByRole("button", { name: /^Contato legado Contato/ })).toBeInTheDocument();
  });

  it("filtra pelo papel inicial e abre a ficha canônica com os dados comerciais", async () => {
    const user = userEvent.setup();
    render(<ContatosClient {...props({ papelInicial: "fornecedor" })} />);

    expect(screen.getByRole("heading", { name: "Contatos e empresas" })).toBeInTheDocument();
    expect(screen.queryByText("Bia")).not.toBeInTheDocument();

    await user.click(screen.getByText("Atlas"));

    expect(screen.getByLabelText("Papéis")).toHaveTextContent("Fornecedor");
    expect(screen.getByText("Prazo de pagamento")).toBeVisible();
    expect(screen.getByText("30 dias")).toBeVisible();
  });

  it("oferece os seis papéis como itens marcáveis e mostra a seção fornecedor pelo papel", async () => {
    const user = userEvent.setup();
    render(<ContatosClient {...props({ editarInicial: "contato-atlas" })} />);

    const seletor = screen.getByRole("button", { name: "Papéis" });
    expect(seletor).toHaveTextContent("Fornecedor");
    expect(screen.getByLabelText("Prazo de pagamento (dias)")).toBeVisible();

    await user.click(seletor);
    expect(screen.getAllByRole("menuitemcheckbox")).toHaveLength(6);
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Fornecedor" }));

    expect(screen.queryByLabelText("Prazo de pagamento (dias)")).not.toBeInTheDocument();
  });

  it("remove o papel e a seção de fornecedor quando o refresh entrega a extensão inativa", () => {
    const parteAtualizada = fornecedor({
      papeis: ["parceiro"],
      fornecedor: { ...fornecedor().fornecedor!, ativo: false },
    });
    const tela = render(<ContatosClient {...props()} />);

    expect(screen.getByRole("button", { name: /^Atlas / })).toHaveTextContent("Fornecedor");

    tela.rerender(<ContatosClient {...props({ lista: [parteAtualizada, pessoa] })} />);

    const atlas = screen.getByRole("button", { name: /^Atlas / });
    expect(atlas).toHaveTextContent("Parceiro");
    expect(atlas).not.toHaveTextContent("Fornecedor");
  });

  it("sincroniza filtro e ficha quando a query muda sem remontar o cliente", () => {
    const tela = render(<ContatosClient {...props({ papelInicial: "fornecedor", editarInicial: "contato-atlas" })} />);

    expect(screen.getByLabelText("Nome")).toHaveValue("Atlas");

    tela.rerender(<ContatosClient {...props({ papelInicial: "contato", editarInicial: "contato-bia" })} />);

    expect(screen.getByLabelText("Nome")).toHaveValue("Bia");
    expect(screen.getByRole("button", { name: "Papéis" })).toHaveTextContent("Contato");
    expect(screen.queryByLabelText("Prazo de pagamento (dias)")).not.toBeInTheDocument();
  });

  it("deep-link de quem só lê abre a ficha sem expor o formulário", () => {
    render(<ContatosClient {...props({ podeEscrever: false, editarInicial: "contato-atlas" })} />);

    expect(screen.getByLabelText("Papéis")).toHaveTextContent("Fornecedor");
    expect(screen.getByText("Prazo de pagamento")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
  });

  it("salva papéis, vínculo e extensão em um PATCH pelo id do contato", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.mocked(fetch);
    render(<ContatosClient {...props({ editarInicial: "contato-atlas" })} />);

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(url).toBe("/api/financeiro/contatos/contato-atlas");
    expect(init.method).toBe("PATCH");
    expect(payload.papeis).toEqual(["fornecedor", "parceiro"]);
    expect(payload.categorias).toEqual(["Matéria-prima"]);
    expect(payload.organizacao_id).toBeNull();
    expect(payload.fornecedor).toMatchObject({
      id: "fornecedor-atlas",
      prazo_dias: 30,
      prazo_envio_dias: 7,
      forma_pagamento: "Boleto",
    });
  });

  it("mantém dados comuns canônicos uma vez e cidade/UF na extensão", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.mocked(fetch);
    render(<ContatosClient {...props({ editarInicial: "contato-atlas" })} />);

    expect(screen.getByLabelText("E-mail")).toHaveValue("compras@atlas.test");
    expect(screen.getAllByLabelText("Categorias")).toHaveLength(1);
    expect(screen.getAllByLabelText("WhatsApp")).toHaveLength(1);
    expect(screen.getAllByLabelText("E-mail")).toHaveLength(1);
    expect(screen.getAllByLabelText("Site")).toHaveLength(1);
    expect(screen.getAllByLabelText("Endereço")).toHaveLength(1);
    expect(screen.getAllByLabelText("Observações")).toHaveLength(1);
    expect(screen.queryByLabelText("E-mail comercial")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Telefone comercial")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("WhatsApp comercial")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cidade")).toHaveValue("Bauru");
    expect(screen.getByLabelText("UF")).toHaveValue("SP");

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.fornecedor).toEqual({
      id: "fornecedor-atlas",
      contato_nome: "Ana",
      prazo_dias: 30,
      prazo_envio_dias: 7,
      forma_pagamento: "Boleto",
      pix_tipo: "cnpj",
      pix_chave: "12345678000199",
      banco: "Banco Atlas",
      agencia: "0001",
      conta_numero: "12345-6",
      aceita_boleto: true,
      inscricao_estadual: "ISENTO",
      cidade: "Bauru",
      uf: "SP",
    });
  });
});
