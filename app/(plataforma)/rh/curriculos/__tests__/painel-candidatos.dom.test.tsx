import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { CurriculosClient } from "../CurriculosClient";
import { ETAPAS_PADRAO } from "@/lib/rh/curriculos/etapas";
import type { CandidatoResumo, ConfigIntegracao, VagaRh } from "@/lib/rh/curriculos/tipos";
import type { PoderesRh } from "@/lib/rh/gate";

// O painel de candidatos (18/09/2026): o fluxo no topo responde "quem
// chegou / quem analisar / quem avança / quem parou / quem terminou", o
// Kanban mostra uma coluna por etapa, filtros combinam e aparecem como chips,
// e mover acontece na hora (otimista) sem abrir o perfil.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("../../../Toast", async (original) => ({
  ...(await original<typeof import("../../../Toast")>()),
  toast: Object.assign(vi.fn(), { ok: vi.fn(), erro: vi.fn(), info: vi.fn() }),
  confirmar: vi.fn(() => Promise.resolve(true)),
}));

const AGORA = Date.now();
const ha = (d: number) => new Date(AGORA - d * 86_400_000).toISOString();
const VAGAS: VagaRh[] = [
  { id: "11111111-1111-4111-8111-111111111111", titulo: "Auxiliar de Produção", setor: null, descricao: null, status: "aberta", created_at: "", candidatos: 2 },
  { id: "22222222-2222-4222-8222-222222222222", titulo: "Assistente Administrativo", setor: null, descricao: null, status: "aberta", created_at: "", candidatos: 1 },
];
const cand = (n: number, p: Partial<CandidatoResumo>): CandidatoResumo => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`, nome: `Pessoa ${n}`, email: null, telefone: null, cidade: "Avaré, SP",
  vaga_id: VAGAS[0].id, vaga: VAGAS[0].titulo, status: "novo", origem: "tridiflow", recebido_em: ha(1), visto_em: null, tem_curriculo: true,
  perfil: { ocupacao: null, formacao: null, experiencia: null, escolaridade: null, disponibilidade: null, tags: [] },
  entrevista_em: null, tags: [], etapa_em: ha(1), updated_at: null, curriculo_url: null, curriculo_nome: null, ...p,
});
const LISTA = [
  cand(1, { nome: "Ana Novata" }),
  cand(2, { nome: "Bruno Analise", status: "em_analise", visto_em: ha(1), etapa_em: ha(2), perfil: { ocupacao: null, formacao: null, experiencia: "Operador", escolaridade: "Ensino médio completo", disponibilidade: null, tags: ["Com experiência"] } }),
  cand(3, { nome: "Carla Parada", status: "entrevista", visto_em: ha(20), recebido_em: ha(30), etapa_em: ha(12) }),
  cand(4, { nome: "Davi Contratado", status: "contratado", visto_em: ha(20), recebido_em: ha(40), etapa_em: ha(3), vaga_id: VAGAS[1].id, vaga: VAGAS[1].titulo }),
  cand(5, { nome: "Eva Arquivada", status: "arquivado", visto_em: ha(20), recebido_em: ha(40) }),
];
const TUDO: PoderesRh = {
  curriculos: true, curriculosRespostas: true, curriculosArquivo: true, curriculosStatus: true, curriculosEditar: true, curriculosIntegracao: true,
} as PoderesRh;
const INTEGRACAO = { formulario_ativo: true, ultimo_erro: null } as ConfigIntegracao;

let patches: { url: string; corpo: unknown }[] = [];
beforeEach(() => {
  patches = [];
  try { localStorage.clear(); } catch { /* sem storage */ }
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") patches.push({ url: String(url), corpo: JSON.parse(String(init.body)) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response);
  }));
});

const montar = () => render(
  <CurriculosClient lista={LISTA} vagas={VAGAS} etapas={ETAPAS_PADRAO} saturou={false} hoje={new Date(AGORA).toISOString().slice(0, 10)}
    poderes={TUDO} integracao={INTEGRACAO} schemaPendente={false} />,
);
const coluna = (nome: string) => screen.getByRole("listitem", { name: new RegExp(`^${nome}:`) });

describe("painel de candidatos", () => {
  it("o Kanban tem uma coluna por etapa ativa, com as sete etapas, e o arquivado fica fora", () => {
    montar();
    for (const e of ["Recebidos", "Em análise", "Pré-selecionados", "Entrevista", "Aprovados", "Reprovados", "Contratados"]) expect(coluna(e)).toBeTruthy();
    expect(within(coluna("Recebidos")).getByText("Ana Novata")).toBeTruthy();
    expect(within(coluna("Contratados")).getByText("Davi Contratado")).toBeTruthy();
    expect(screen.queryByText("Eva Arquivada")).toBeNull();
  });

  it("o fluxo do topo conta cada fila e marca o parado", () => {
    montar();
    const num = (rot: string) => screen.getByRole("button", { name: new RegExp(`${rot}`) }).querySelector(".cv-fila-num")?.textContent;
    expect(num("Para analisar")).toBe("1");
    expect(num("Avançando")).toBe("1");
    expect(num("Parados")).toBe("1");
    expect(num("Finalizados")).toBe("1");
    expect(within(coluna("Entrevista")).getByText(/12 dias/)).toBeTruthy();
  });

  it("tocar numa fila filtra, e o filtro aparece como chip que se tira", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Parados/ }));
    expect(screen.queryByText("Ana Novata")).toBeNull();
    expect(screen.getByText("Carla Parada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tirar filtro Parados" }));
    expect(screen.getByText("Ana Novata")).toBeTruthy();
  });

  it("filtros combinam (vaga + experiência) e a busca acha por etiqueta/formação", () => {
    montar();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: "operador" } });
    return waitFor(() => {
      expect(screen.getByText("Bruno Analise")).toBeTruthy();
      expect(screen.queryByText("Ana Novata")).toBeNull();
      expect(screen.getByRole("list", { name: "Filtros ativos" })).toBeTruthy();
    });
  });

  it("mover pelo menu é na hora e chama a rota de etapa", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Ações de Ana Novata" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Em análise/ }));
    await waitFor(() => expect(within(coluna("Em análise")).getByText("Ana Novata")).toBeTruthy());
    expect(patches).toEqual([{ url: `/api/rh/curriculos/${LISTA[0].id}/status`, corpo: { status: "em_analise" } }]);
  });

  it("a lista mostra etapa, status, experiência e escolaridade, e o arquivado aparece quando pedido", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(screen.getAllByText("Ensino médio completo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Novo").length).toBeGreaterThan(0);
  });
});
