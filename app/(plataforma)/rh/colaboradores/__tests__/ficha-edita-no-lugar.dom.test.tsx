import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CorpoDaFicha } from "../ficha/CorpoDaFicha";
import type { PoderesRh } from "@/lib/rh/gate";
import type { ColaboradorRh, FichaPayload, FichaRh } from "@/lib/rh/tipos";

/**
 * A ficha do RH é o PRÓPRIO formulário.
 *
 * Antes, editar abria um pop-up DENTRO do pop-up — e o pedido foi justamente
 * tirar essa segunda moldura. O que este teste protege não é o desenho, são as
 * três coisas que, quebradas, perdem dado em silêncio:
 *
 *  1. o seletor de setor tem que oferecer o valor JÁ GRAVADO mesmo quando ele
 *     não está na lista sugerida — senão a tela mostra a primeira opção (ou o
 *     vazio) como se fosse a da pessoa e o salvamento seguinte grava essa,
 *     trocando o setor de alguém sem ninguém pedir;
 *  2. o PUT sobe a ficha INTEIRA, porque a rota reescreve tudo: meio corpo
 *     apaga os campos que não foram enviados;
 *  3. quem só tem `ver` continua lendo, nunca editando.
 *
 * jsdom não tem layout: aqui é COMPORTAMENTO, nunca geometria.
 */
const PODERES = (editar: boolean): PoderesRh => ({
  ver: true, editar, documentos: false, documentosEditar: false,
  atestados: false, atestadosEditar: false, ponto: false, bancoHoras: false, compensacoesEditar: false,
  ferias: false, feriasEditar: false, anamnese: false, anamneseEditar: false,
  curriculos: false, curriculosRespostas: false, curriculosArquivo: false, curriculosStatus: false, curriculosEditar: false, curriculosIntegracao: false,
  calendario: false, calendarioEditar: false, calendarioSetores: false, calendarioFeriados: false, acessos: false,
});

// "Chão de Fábrica" não está em `RH_SETORES` de propósito: é o caso de quem já
// tinha setor digitado à mão antes de o campo virar lista.
const COLAB: ColaboradorRh = {
  id: "c1", nome: "Maria Aparecida", username: "maria", ativo: true, pendente: false, foto: null,
  cargo: "Encarregada", setor: "Chão de Fábrica", departamento: "Operacional",
  telefone: "(14) 99999-0001", admissao: "2021-03-15", situacao: "ativo",
};

const FICHA: FichaRh = {
  employee_id: "c1", situacao: "ativo", data_nascimento: "1990-04-12",
  cpf: "123.456.789-00", rg: "12.345.678-9", estado_civil: "Casada",
  email_pessoal: "maria@exemplo.com", telefone_emergencia: "(14) 98888-7777",
  contato_emergencia: "José (marido)", cep: "18760-000",
  logradouro: "Rua A", numero: "1024", complemento: "Fundos", bairro: "Centro",
  cidade: "Cerqueira César", uf: "SP", observacoes: "Faz hora extra no fechamento.",
};

const payload = (): FichaPayload => ({
  colaborador: COLAB, ficha: FICHA,
  documentos: [], atestados: [], ferias: [], historico: [], anamnese: null,
  linha: null, empresasFinanceiro: [], empresasMarcadas: [],
  areasQueConcedo: [], souAdmin: false, souEu: false, schemaPendente: false,
});

// A aba fica num `useSticky` (localStorage): sem limpar, o teste anterior
// escolhe a aba do seguinte.
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
    ok: true,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ ok: true }),
  } as unknown as Response)));
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

const abrir = (editar = true, aoMudar = () => {}, aoSujar?: (s: boolean) => void) => {
  const r = render(
    <CorpoDaFicha dados={payload()} poderes={PODERES(editar)} hoje="2026-09-16" aoMudar={aoMudar} aoSujar={aoSujar} />,
  );
  fireEvent.click(screen.getByRole("tab", { name: /Cadastro/ }));
  return r;
};

/**
 * O setor deixou de ser um `<select>` nativo e passou a ser o `GlassSelect` do
 * kit, como todo dropdown do app. O que o teste protege não mudou — mudou só
 * como se mexe nele: o gatilho é um `<button>` (amarrado ao rótulo pelo
 * `htmlFor`/`id`, então `getByLabelText` continua valendo) e as opções moram
 * numa folha que sai por portal pro `<body>`.
 */
const campoSetor = () => screen.getByLabelText("Setor") as HTMLButtonElement;

/** Abre a folha do seletor e devolve o painel (ele está no `<body>`, fora da
 *  árvore do componente — por isso a busca não é pelo `container`). */
const abrirSetor = () => {
  fireEvent.click(campoSetor());
  const painel = document.querySelector(".gp-pop");
  if (!painel) throw new Error("a folha do seletor de setor não abriu");
  return painel as HTMLElement;
};

const opcoesDeSetor = () =>
  [...abrirSetor().querySelectorAll("button")].map((b) => (b.textContent ?? "").trim());

const escolherSetor = (nome: string) => {
  const painel = abrirSetor();
  const opcao = [...painel.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === nome);
  if (!opcao) throw new Error(`o seletor de setor não oferece "${nome}"`);
  fireEvent.click(opcao);
};

describe("ficha do RH · editar no lugar", () => {
  it("não existe mais um pop-up de edição para abrir", () => {
    abrir();
    expect(screen.queryByRole("button", { name: /Editar ficha/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Editar colaborador")).not.toBeInTheDocument();
  });

  it("o setor é um seletor do kit, e ele oferece o valor já gravado mesmo fora da lista", () => {
    abrir();
    const gatilho = campoSetor();
    // Nada de `<select>` nativo: o dropdown do app é o do kit, em toda tela.
    expect(gatilho.tagName).toBe("BUTTON");
    expect(gatilho).toHaveAttribute("aria-haspopup", "listbox");
    expect(gatilho).toHaveTextContent("Chão de Fábrica");
    const opcoes = opcoesDeSetor();
    expect(opcoes).toContain("Chão de Fábrica");
    // E as sugestões que faltavam, que foi o pedido.
    expect(opcoes).toEqual(expect.arrayContaining(["Marketing", "Logística", "Produção"]));
  });

  it("a barra de salvar só aparece quando algo mudou, e conta o que mudou", async () => {
    abrir();
    expect(screen.queryByText(/por salvar/)).not.toBeInTheDocument();

    escolherSetor("Marketing");
    expect(await screen.findByText(/alteração por salvar/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Cargo"), { target: { value: "Gerente" } });
    expect(await screen.findByText(/alterações por salvar/)).toBeInTheDocument();
  });

  it("descartar devolve os valores gravados e some com a barra", async () => {
    abrir();
    escolherSetor("Marketing");
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(screen.queryByText(/por salvar/)).not.toBeInTheDocument());
    expect(campoSetor()).toHaveTextContent("Chão de Fábrica");
  });

  it("salvar manda a ficha INTEIRA, não só o campo mexido", async () => {
    const aoMudar = vi.fn();
    abrir(true, aoMudar);
    escolherSetor("Marketing");
    fireEvent.click(await screen.findByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(aoMudar).toHaveBeenCalled());
    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(url).toBe("/api/rh/colaboradores/c1");
    expect((init as RequestInit).method).toBe("PUT");
    const corpo = JSON.parse((init as RequestInit).body as string);
    expect(corpo.setor).toBe("Marketing");
    // O resto continua junto — a rota reescreve tudo o que recebe.
    expect(corpo.cpf).toBe("123.456.789-00");
    expect(corpo.logradouro).toBe("Rua A");
    expect(corpo.observacoes).toBe("Faz hora extra no fechamento.");
    expect(corpo.situacao).toBe("ativo");
  });

  it("avisa o pop-up de fora que há edição pendente (é o que trava o Esc)", async () => {
    const aoSujar = vi.fn();
    abrir(true, () => {}, aoSujar);
    await waitFor(() => expect(aoSujar).toHaveBeenCalledWith(false));
    escolherSetor("Marketing");
    await waitFor(() => expect(aoSujar).toHaveBeenCalledWith(true));
  });

  it("sem a chave de editar, a ficha volta a ser leitura", () => {
    abrir(false);
    expect(screen.queryByLabelText("Setor")).not.toBeInTheDocument();
    expect(screen.getByText("Chão de Fábrica")).toBeInTheDocument();
  });
});
