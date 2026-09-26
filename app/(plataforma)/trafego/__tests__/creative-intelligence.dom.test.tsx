import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreativeIntelligencePanel } from "../creative-intelligence/CreativeIntelligencePanel";
import { CriativoModal } from "../CriativosStudio";
import { FacebookAdPreview } from "../creative-intelligence/FacebookAdPreview";
import { useCreativeIntelligence } from "../creative-intelligence/useCreativeIntelligence";
import { buildPrintableReportHtml, printCreativeReport } from "../creative-intelligence/print-report";
import { deriveCreativeMetrics } from "@/lib/creative-intelligence/metrics";
import { buildBenchmark } from "@/lib/creative-intelligence/benchmark";
import { buildCreativeScore } from "@/lib/creative-intelligence/score";
import { buildCreativeInsights } from "@/lib/creative-intelligence/insights";
import type { CreativeIntelligencePayload } from "@/lib/creative-intelligence/types";
import { agruparCriativos } from "@/lib/criativos";
import { sampleCreativeIntelligence, sampleOverview } from "@/lib/trafego-sample";

const metrics = deriveCreativeMetrics({
  spend: 200, revenue: 600, impressions: 10_000, reach: null, clicks: 200,
  landingPageViews: 150, initiateCheckout: 40, purchases: 10,
  videoPlays: 8_000, videoViews3s: 5_000, videoViews2s: 4_000, videoViews25: 3_000,
  videoViews50: 2_000, videoViews75: 1_000, videoViews95: 800,
  videoViews100: 700, videoAvgWatchTime: 8, thruPlays: 1_600,
});
const benchmark = buildBenchmark([metrics], { since: "2026-09-01", until: "2026-09-07" });
const payload: CreativeIntelligencePayload = {
  period: benchmark.period,
  current: { id: "mr-03@2026", name: "MR 03", metrics, tags: ["UGC"] },
  peers: [{ id: "mr-03@2026", name: "MR 03", metrics, tags: ["UGC"] }],
  tags: [],
  benchmark,
  score: buildCreativeScore(metrics, [metrics]),
  analysis: buildCreativeInsights(metrics, benchmark),
  history: [{ day: "2026-09-01", metrics }],
  partial: false,
};

describe("CreativeIntelligencePanel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-08T15:00:00-03:00"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("segue a hierarquia visual da referência sem duplicar métricas no topo", () => {
    const { container } = render(<CreativeIntelligencePanel payload={payload} />);

    expect(container.querySelectorAll(".ci-kpis-primary .ci-metric")).toHaveLength(4);
    expect(container.querySelectorAll(".ci-kpis-secondary .ci-metric")).toHaveLength(4);
    expect(within(container.querySelector(".ci-kpis-primary") as HTMLElement).getByText("ROAS")).toBeInTheDocument();
    expect(within(container.querySelector(".ci-kpis-primary") as HTMLElement).getByText("Faturamento")).toBeInTheDocument();
    expect(within(container.querySelector(".ci-kpis-secondary") as HTMLElement).getByText("CPC")).toBeInTheDocument();
    expect(container.querySelector(".ci-video-strip")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".ci-score-card")).toHaveLength(1);
  });

  it("monta o detalhe como um diálogo editorial de duas colunas", async () => {
    const overview = sampleOverview();
    const intelligence = sampleCreativeIntelligence(overview);
    const lista = agruparCriativos(overview.anuncios, 2026);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => intelligence }));

    render(<CriativoModal
      lista={lista}
      idx={0}
      marcas={new Map()}
      editores={[]}
      tagsExistentes={[]}
      since={overview.since}
      until={overview.until}
      onIr={vi.fn()}
      onSalvar={vi.fn()}
      onClose={vi.fn()}
    />);

    const dialog = await screen.findByRole("dialog", { name: lista[0].nome });
    expect(within(dialog).getByRole("button", { name: "Voltar para criativos" })).toBeInTheDocument();
    expect(within(dialog).getByText("Anúncio")).toBeInTheDocument();
    expect(dialog.querySelector(".ci-modal-body > .ci-media")).toBeInTheDocument();
    expect(dialog.querySelector(".ci-modal-body > .ci-details")).toBeInTheDocument();
  });

  it("o cabeçalho diz quando o criativo subiu na Meta pela primeira vez", async () => {
    const overview = sampleOverview();
    const intelligence = sampleCreativeIntelligence(overview);
    const lista = agruparCriativos(overview.anuncios, 2026);
    // Roteado por URL: a estreia é uma pergunta à parte da análise do período.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("/criativos/estreia") ? { em: "2026-03-12T17:22:10.000Z", fonte: "video" } : intelligence),
    })));

    // idx 1: ids de anúncio que nenhum outro teste pediu (a estreia é lembrada na sessão).
    render(<CriativoModal
      lista={lista}
      idx={1}
      marcas={new Map()}
      editores={[]}
      tagsExistentes={[]}
      since={overview.since}
      until={overview.until}
      onIr={vi.fn()}
      onSalvar={vi.fn()}
      onClose={vi.fn()}
    />);

    const dialog = await screen.findByRole("dialog", { name: lista[1].nome });
    const data = await within(dialog).findByText("12/03/2026");
    expect(data.tagName).toBe("TIME");
    expect(data.closest("span")).toHaveTextContent("subiu em 12/03/2026 (há 5 meses)");
  });

  it("mantém o último retrato visível e identifica claramente a atualização do período", () => {
    render(<CreativeIntelligencePanel
      payload={payload}
      loading
      periodSelection={{ preset: "30", since: "2026-08-10", until: "2026-09-08" }}
    />);

    expect(screen.getByRole("status")).toHaveTextContent("Atualizando métricas de 10/08/2026 a 08/09/2026");
    expect(screen.getByText("R$ 600")).toBeInTheDocument();
    expect(document.querySelector(".ci-panel")).toHaveAttribute("aria-busy", "true");
  });

  it("preserva o retrato somente ao atualizar o período do mesmo criativo", async () => {
    let finishRefresh!: (value: Response) => void;
    let finishOtherCreative!: (value: Response) => void;
    const response = (value: CreativeIntelligencePayload) => ({ ok: true, json: async () => value } as Response);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(payload))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishRefresh = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishOtherCreative = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook((props: { creativeKey: string; since: string; until: string }) => useCreativeIntelligence({
      creativeKey: props.creativeKey,
      adIds: ["1"],
      since: props.since,
      until: props.until,
    }), { initialProps: { creativeKey: "mr-03@2026", since: "2026-09-01", until: "2026-09-07" } });

    await waitFor(() => expect(result.current.payload).toEqual(payload));
    rerender({ creativeKey: "mr-03@2026", since: "2026-08-10", until: "2026-09-08" });
    expect(result.current.loading).toBe(true);
    expect(result.current.payload).toEqual(payload);

    await act(async () => finishRefresh(response({ ...payload, period: { since: "2026-08-10", until: "2026-09-08" } })));
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ creativeKey: "mr-04@2026", since: "2026-08-10", until: "2026-09-08" });
    expect(result.current.payload).toBeNull();
    await act(async () => finishOtherCreative(response({ ...payload, current: { ...payload.current, id: "mr-04@2026" } })));
  });

  it("ignora uma resposta atrasada de um período que já foi trocado", async () => {
    let finish30!: (value: Response) => void;
    let finish7!: (value: Response) => void;
    const response = (value: CreativeIntelligencePayload) => ({ ok: true, json: async () => value } as Response);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response(payload))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish30 = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish7 = resolve; })));

    const { result, rerender } = renderHook((props: { since: string; until: string }) => useCreativeIntelligence({
      creativeKey: "mr-03@2026", adIds: ["1"], since: props.since, until: props.until,
    }), { initialProps: { since: "2026-09-01", until: "2026-09-07" } });
    await waitFor(() => expect(result.current.payload).toEqual(payload));

    rerender({ since: "2026-08-10", until: "2026-09-08" });
    rerender({ since: "2026-09-02", until: "2026-09-08" });
    const sevenDays = { ...payload, period: { since: "2026-09-02", until: "2026-09-08" } };
    await act(async () => finish7(response(sevenDays)));
    await waitFor(() => expect(result.current.payload?.period).toEqual(sevenDays.period));

    await act(async () => finish30(response({ ...payload, period: { since: "2026-08-10", until: "2026-09-08" } })));
    expect(result.current.payload?.period).toEqual(sevenDays.period);
  });

  it("mantém a navegação interna e troca o conteúdo para o funil", async () => {
    render(<CreativeIntelligencePanel payload={payload} />);
    expect(screen.getByRole("tab", { name: "Visão geral" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("Creative Score").length).toBeGreaterThan(0);
    expect(screen.getByText(/Possível diagnóstico/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Funil" }));
    expect(screen.getByRole("tab", { name: "Funil" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("10.000").length).toBeGreaterThan(0);
    expect(screen.getByText("Initiate Checkout")).toBeInTheDocument();
  });

  it("mostra estado parcial sem fabricar métricas", () => {
    const partial: CreativeIntelligencePayload = {
      ...payload,
      partial: true,
      current: { ...payload.current, metrics: deriveCreativeMetrics({
        ...metrics,
        videoPlays: null,
        videoViews3s: null,
        videoViews2s: null,
        thruPlays: null,
      }) },
    };
    render(<CreativeIntelligencePanel payload={partial} />);
    expect(screen.getByText(/dados parciais/i)).toBeInTheDocument();
    expect(screen.getAllByText("–").length).toBeGreaterThan(0);
  });

  it("monta a apresentação com métricas dos editores e engajamento, sem investimento nem faturamento", async () => {
    const { container } = render(<CreativeIntelligencePanel payload={{
      ...payload,
      peers: [...payload.peers, { id: "mr-07@2026", name: "MR 07", metrics }],
    }} previewUrl="https://example.com/creative.jpg" />);
    await userEvent.click(screen.getByRole("tab", { name: "Apresentação" }));

    expect(screen.getByRole("button", { name: /Exportar PDF/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Apresentar/ })).toBeEnabled();
    const slides = container.querySelector(".ci-slides") as HTMLElement;
    expect(within(slides).getByText("Métricas dos editores")).toBeInTheDocument();
    expect(within(slides).getByText("Hook Rate")).toBeInTheDocument();
    expect(within(slides).getByText("Hold Rate")).toBeInTheDocument();
    expect(within(slides).getByText("Retenção")).toBeInTheDocument();
    expect(within(slides).getByText("Engajamento")).toBeInTheDocument();
    for (const nome of ["Compras", "CPC", "CPM", "ROAS", "Curtidas", "Comentários", "Compartilhamentos"]) {
      expect(within(slides).getByText(nome)).toBeInTheDocument();
    }
    expect(within(slides).getByText(/entram a partir da próxima sincronização/)).toBeInTheDocument();
    expect(within(slides).getByText("Leitura para edição")).toBeInTheDocument();
    expect(within(slides).getByText("Próximas versões")).toBeInTheDocument();
    expect(within(slides).queryByText(/Investimento|Faturamento|CPA/)).not.toBeInTheDocument();
    expect(container.querySelectorAll(".ci-slide")).toHaveLength(6);
    // Um slide por vez: os outros ficam no DOM (o PDF clona todos), escondidos.
    expect(container.querySelectorAll(".ci-slide:not([hidden])")).toHaveLength(1);
    expect(screen.queryByLabelText("Comparação")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Escopo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tipo")).not.toBeInTheDocument();
    expect(screen.getByAltText("Prévia do criativo")).toBeInTheDocument();
    expect(document.querySelector('[data-tone="result"]')).toBeTruthy();
    expect(document.querySelector('[data-tone="attention"]')).toBeTruthy();
  });

  it("navega pelos slides sem trocar de criativo no modal", async () => {
    // O modal do criativo escuta ← → no window pra trocar de CRIATIVO.
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    const { container } = render(<CreativeIntelligencePanel payload={payload} />);
    await userEvent.click(screen.getByRole("tab", { name: "Apresentação" }));
    const visible = () => container.querySelector(".ci-slide:not([hidden])")?.getAttribute("data-slide");

    expect(visible()).toBe("capa");
    expect(screen.getByRole("button", { name: "Slide anterior" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Próximo slide" }));
    expect(visible()).toBe("sinais");
    expect(container.querySelector(".ci-deck-count")).toHaveTextContent("2 / 6");

    (container.querySelector(".ci-deck-stage") as HTMLElement).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(visible()).toBe("retencao");
    await userEvent.keyboard("{End}");
    expect(visible()).toBe("testes");
    expect(screen.getByRole("button", { name: "Próximo slide" })).toBeDisabled();
    await userEvent.keyboard("{Home}");
    expect(visible()).toBe("capa");
    expect(onWindowKey).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Ir para o slide 5: Leitura para edição" }));
    expect(visible()).toBe("leitura");
    window.removeEventListener("keydown", onWindowKey);
  });

  it("apresenta em tela cheia e sai no Esc sem fechar o modal de trás", async () => {
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    render(<CreativeIntelligencePanel payload={payload} />);
    await userEvent.click(screen.getByRole("tab", { name: "Apresentação" }));
    await userEvent.click(screen.getByRole("button", { name: /Apresentar/ }));

    const dialog = await screen.findByRole("dialog", { name: "Apresentação: MR 03" });
    const count = () => dialog.querySelector(".ci-deck-count")?.textContent;
    expect(count()).toBe("1 / 6");
    await userEvent.keyboard("{ArrowRight}");
    expect(count()).toBe("2 / 6");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Apresentação: MR 03" })).not.toBeInTheDocument();
    // Nem a seta nem o Esc chegam ao listener do modal (trocar/fechar criativo).
    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindowKey);
  });

  it("todo pedaço do slide tem regra no PDF", async () => {
    const { container } = render(<CreativeIntelligencePanel payload={payload} previewUrl="https://example.com/creative.jpg" />);
    await userEvent.click(screen.getByRole("tab", { name: "Apresentação" }));
    const slides = container.querySelector(".ci-slides") as HTMLElement;
    const classes = new Set([...slides.querySelectorAll("[class]")].flatMap((element) => [...element.classList]));
    classes.delete("ci-rise"); // só movimento, e movimento não vai pro papel
    const html = buildPrintableReportHtml(slides, "Relatório MR 03");
    expect([...classes].filter((name) => !html.includes(`.${name}`)), "classe usada no slide sem regra no print-report.ts").toEqual([]);
  });

  it("mantém o período escolhido depois que o novo payload chega", async () => {
    const onPeriodSelectionChange = vi.fn();
    const selection = { preset: "7" as const, since: "2026-09-02", until: "2026-09-08" };
    const { rerender } = render(<CreativeIntelligencePanel payload={payload} periodSelection={selection} onPeriodSelectionChange={onPeriodSelectionChange} />);
    await userEvent.click(screen.getByRole("tab", { name: "Apresentação" }));
    expect(screen.getByLabelText("Período")).toHaveValue("7");

    await userEvent.selectOptions(screen.getByLabelText("Período"), "30");
    expect(onPeriodSelectionChange).toHaveBeenCalledWith({ preset: "30", since: "2026-08-10", until: "2026-09-08" });

    rerender(<CreativeIntelligencePanel payload={{ ...payload, period: { since: "2026-08-10", until: "2026-09-08" } }} periodSelection={{ preset: "30", since: "2026-08-10", until: "2026-09-08" }} onPeriodSelectionChange={onPeriodSelectionChange} />);
    expect(screen.getByLabelText("Período")).toHaveValue("30");
  });

  it("mostra o erro do novo período em vez de ficar carregando para sempre", () => {
    render(<CreativeIntelligencePanel payload={null} loading={false} error="Falha ao carregar 30 dias" periodSelection={{ preset: "30", since: "2026-08-10", until: "2026-09-08" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Falha ao carregar 30 dias");
    expect(screen.queryByText("Carregando análise…")).not.toBeInTheDocument();
  });

  it("gera um documento de impressão isolado, colorido e sem iframe", () => {
    const report = document.createElement("div");
    report.innerHTML = '<article class="ci-slide"><div data-tone="result">ROAS</div><iframe src="https://facebook.example"></iframe></article><article class="ci-slide" hidden>Retenção</article>';
    const html = buildPrintableReportHtml(report, "Relatório MR 03", { accent: "#123456" });

    expect(html).toContain("@page { size: A4 landscape");
    expect(html).toContain("print-color-adjust: exact");
    expect(html).toContain('data-tone="result"');
    expect(html).not.toContain("<iframe");
    // Na tela só o slide atual aparece; no papel vão todos.
    expect(html).toContain("Retenção");
    expect(html).not.toMatch(/<article[^>]*hidden/);
    expect(html).toContain("--primary: #123456");
    // A cor entra num <style>: o que não tem cara de cor cai no padrão.
    expect(buildPrintableReportHtml(report, "x", { accent: "red;}body{display:none" })).toContain("--primary: #16161a");
  });

  it("imprime na janela isolada, não na página do Facebook", () => {
    const report = document.createElement("div");
    report.innerHTML = '<article class="ci-slide">Relatório</article>';
    const popup = {
      document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
      focus: vi.fn(), print: vi.fn(), close: vi.fn(),
      addEventListener: vi.fn(),
    };
    const pagePrint = vi.spyOn(window, "print").mockImplementation(() => undefined);
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);

    expect(printCreativeReport(report, "Relatório MR 03")).toBe(true);
    expect(popup.document.write).toHaveBeenCalledWith(expect.stringContaining("Relatório"));
    expect(pagePrint).not.toHaveBeenCalled();
  });

  it("mantém a prévia oficial rolável e alta o bastante para o card completo", () => {
    render(<FacebookAdPreview src="https://facebook.example/preview" title="MR 03" width={335} height={450} />);
    const frame = screen.getByTitle("MR 03");
    expect(frame).toHaveAttribute("scrolling", "yes");
    expect(frame).toHaveAttribute("height", "700");
    expect(frame.parentElement).toHaveAttribute("data-facebook-preview", "true");
  });
});
