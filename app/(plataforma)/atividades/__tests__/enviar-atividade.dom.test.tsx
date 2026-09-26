import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AtividadesClient } from "../AtividadesClient";
import { AtividadesShell } from "../AtividadesShell";
import { ProdutividadeMetas } from "../ProdutividadeMetas";
import type { Atividade, Colaborador } from "@/lib/atividades-catalog";

// Em agosto/2026 a tela de Atividades virou um bloco EMBUTIDO dentro de
// Pessoas › Produtividade. O cabeçalho da página antiga — que carregava
// "Gerar produção" e "Peças por atividade" — estava dentro de um
// `{!embutido && …}`, então as duas ações sumiram da única porta que existia no
// computador. Resultado medido no banco: NENHUMA atividade criada por três dias
// úteis. Gerar produção é o fluxo que criou todos os lotes do histórico — sem
// botão, o sistema para de enviar.
//
// Em 11/09/2026 Atividades virou área própria no Operacional (com item na
// barra lateral) e o quadro saiu de Pessoas. A regra continua a mesma: a ação
// existe na porta que a pessoa usa — que agora é a área Atividades.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const COLABS: Colaborador[] = [
  { id: "u1", nome: "Ana Ribeiro", setor: "Produção", departamento: "Produção" },
];

const ATIVIDADES: Atividade[] = [];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
    ok: true, status: 200, json: () => Promise.resolve({ atividades: [], devices: [], itens: [], modelos: [] }),
  } as Response)));
});
afterEach(() => vi.unstubAllGlobals());

describe("Enviar atividade — as ações existem na porta que a pessoa usa", () => {
  it("embutido continua oferecendo Gerar produção e Peças por atividade", () => {
    render(
      <AtividadesClient colaboradores={COLABS} initial={ATIVIDADES} roleLabel="admin" embutido />,
    );
    // O título da página é que não deve repetir quando embutido; as AÇÕES sim.
    expect(screen.getByRole("button", { name: /Gerar produção/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Peças por atividade/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Atividades" })).not.toBeInTheDocument();
  });

  it("solto (página própria) segue com título e ações", () => {
    render(
      <AtividadesClient colaboradores={COLABS} initial={ATIVIDADES} roleLabel="admin" />,
    );
    expect(screen.getByRole("heading", { name: "Atividades" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerar produção/ })).toBeInTheDocument();
  });

  it("na área Atividades, a Visão geral oferece Nova atividade a quem atribui", () => {
    render(
      <AtividadesShell pode={{ ver: true, atribuir: true, configurar: true, autorizar: true }} colaboradores={COLABS} initial={ATIVIDADES}
        modelos={[]} itensVisao={[]} />,
    );
    expect(screen.getAllByRole("button", { name: /Nova atividade/ }).length).toBeGreaterThan(0);
    for (const aba of ["Visão geral", "Histórico"]) {
      expect(screen.getByRole("tab", { name: new RegExp(aba) })).toBeInTheDocument();
    }
  });

  it("sem Atribuir o botão não aparece (a rota recusaria)", () => {
    render(
      <AtividadesShell pode={{ ver: true, atribuir: false, configurar: false, autorizar: false }} colaboradores={COLABS} initial={ATIVIDADES}
        modelos={[]} itensVisao={[]} />,
    );
    expect(screen.queryByRole("button", { name: /Nova atividade/ })).not.toBeInTheDocument();
  });

  it("Pessoas cria meta — e não atividade: essa porta é a área Atividades", () => {
    // A API (/api/metas) libera quem tem a área "Colaboradores"; a tela pedia
    // `role === "admin"` e escondia o botão de quem a API atenderia.
    render(
      <ProdutividadeMetas colaboradores={COLABS} atividades={ATIVIDADES}
        metas={[]} erpUsers={[{ id: "u1", nome: "Ana Ribeiro" }]} podeGerir />,
    );
    expect(screen.getAllByRole("button", { name: /Nova meta/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Nova atividade/ })).not.toBeInTheDocument();
  });
});
