import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DetalheDoDia } from "../DetalheDoDia";
import type { BancoResumo } from "@/lib/banco-horas";
import type { StatusPessoa } from "@/lib/ponto";

/**
 * O painel da direita não pode MURCHAR pra reler.
 *
 * Ele e a lista da equipe dividem a mesma linha da grade (`.duo-lista`): a
 * altura do cartão da lista é a do painel. Então tudo que encurta o painel por
 * um instante encolhe a lista junto e a devolve logo depois — era o pulo que
 * aparecia ao entrar na tela e depois de cada batida.
 *
 * Duas causas, dois testes: releitura que apagava o mês desenhado (`geracao`),
 * e o "carregando" de uma linha no lugar de seis registros.
 *
 * jsdom não tem layout — aqui se checa O QUE está na tela, nunca geometria.
 */
const hojeSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - 3 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const dia = (iso: string) => ({
  dia: iso, dow: new Date(iso).getUTCDay(), batidas: [], trabalhadoMin: 480, metaMin: 480,
  saldoMin: 0, classe: "trabalhado", justificada: false, abonada: false, motivo: null,
});

const bancoDe = (pessoaId: string, dias: string[]) => ({
  pessoaId, nome: "Caio", fotoUrl: null, jornadaMin: 480,
  entradaPrevista: "08:00", saidaPrevista: "17:00", almocoInicio: null, almocoFim: null,
  mes: hojeSP().slice(0, 7), de: dias[0], ate: hojeSP(),
  trabalhadoMin: 480 * dias.length, metaMin: 480 * dias.length, saldoMin: 0, saldoMesMin: 0,
  diasTrabalhados: dias.length, faltas: 0, dias: dias.map(dia),
  ledger: { faltasNaoJustificadas: [], debitoVencidoMin: 0, creditoExpiradoMin: 0 },
} as unknown as BancoResumo);

const status: StatusPessoa = {
  id: "p1", nome: "Caio", fotoUrl: null, situacao: "presente",
  entrada: null, ultima: null, ultimoTipo: null,
  entradaPrevista: "08:00", saidaPrevista: "17:00", batidas: 1, expediente: true,
};

const SEIS = [diasAtras(5), diasAtras(4), diasAtras(3), diasAtras(2), diasAtras(1), hojeSP()];

/** Resolve o `fetch` na mão: é o "enquanto carrega" que interessa aqui. */
let resolver: ((b: BancoResumo) => void) | null = null;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise((ok) => {
    resolver = (banco) => ok({ ok: true, json: () => Promise.resolve({ banco }) } as Response);
  })));
});
afterEach(() => { vi.unstubAllGlobals(); resolver = null; });

const painel = (pessoaId: string, geracao: number) => (
  <DetalheDoDia
    pessoaId={pessoaId} nome="Caio" fotoUrl={null}
    entradaPrevista="08:00" saidaPrevista="17:00"
    status={status} podeGerir={false} rotuloDaBatida={() => "Bater saída"}
    onAbrirTudo={() => {}} geracao={geracao}
  />
);

describe("painel do ponto · não encolhe pra reler", () => {
  it("enquanto o mês não chega, o lugar dos registros já vem com as linhas", async () => {
    const { container } = render(painel("p1", 0));
    // Seis linhas de esqueleto, e não uma frase de uma linha: é a altura das
    // seis que a lista ao lado copia.
    await waitFor(() => expect(container.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(6));
    expect(screen.queryByText("Carregando o mês…")).not.toBeInTheDocument();
  });

  it("reler o MESMO mês (geracao) mantém os dias na tela", async () => {
    const { rerender, container } = render(painel("p1", 0));
    await waitFor(() => expect(resolver).toBeTruthy());
    resolver!(bancoDe("p1", SEIS));
    expect(await screen.findByLabelText(new RegExp(br(diasAtras(3))))).toBeInTheDocument();

    // Uma batida feita por fora sobe a `geracao`. A leitura recomeça, mas o que
    // está desenhado FICA — senão o painel murcha e a lista encolhe junto.
    resolver = null;
    rerender(painel("p1", 1));
    await waitFor(() => expect(resolver).toBeTruthy());
    expect(screen.getByLabelText(new RegExp(br(diasAtras(3))))).toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton").length).toBe(0);
  });

  it("trocar de PESSOA zera — o mês de outra gente não fica na tela", async () => {
    const { rerender, container } = render(painel("p1", 0));
    await waitFor(() => expect(resolver).toBeTruthy());
    resolver!(bancoDe("p1", SEIS));
    await screen.findByLabelText(new RegExp(br(diasAtras(3))));

    resolver = null;
    rerender(painel("p2", 0));
    await waitFor(() => expect(container.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(6));
    expect(screen.queryByLabelText(new RegExp(br(diasAtras(3))))).not.toBeInTheDocument();
  });
});
