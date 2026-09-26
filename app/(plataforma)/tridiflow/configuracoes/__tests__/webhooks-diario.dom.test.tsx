import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WebhooksClient } from "../WebhooksClient";

// O envio do lead é best-effort: o visitante não pode ver erro de integração,
// então a recusa do destino só existia no console do servidor — e "não estamos
// conseguindo ver os erros" foi exatamente o que aconteceu. Esta tela é o
// lugar onde a resposta do destino aparece pra quem opera. Os três estados que
// não podem se confundir: SQL pendente, nenhum envio, envio recusado.

const responder = (corpo: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => corpo } as unknown as Response);

afterEach(() => { vi.unstubAllGlobals(); });

const ENTREGA = {
  id: 1, botNome: "Funil de julho", escopo: "global" as const,
  destino: "https://irdptdvkldrghevmtmzc.supabase.co/functions/v1/leads_typebot",
  ok: false, status: 400, erro: null, resposta: '{"error":"Invalid or missing \'type\' header."}',
  ms: 210, tentativas: 1, criadoEm: "2026-08-10T12:00:00.000Z",
};

describe("Webhooks › diário de entrega", () => {
  it("mostra a resposta do destino quando o lead foi RECUSADO", async () => {
    vi.stubGlobal("fetch", responder({ tabela: true, entregas: [ENTREGA] }));
    render(<WebhooksClient bots={[]} global={ENTREGA.destino} />);
    expect(await screen.findByText("Falhou")).toBeTruthy();
    expect(screen.getByText("HTTP 400")).toBeTruthy();
    // O corpo devolvido é o ÚNICO lugar que diz o porquê — não pode ser omitido.
    expect(screen.getByText(/Invalid or missing 'type' header/)).toBeTruthy();
  });

  it("distingue 'SQL pendente' de 'nenhum envio' — senão parece a mesma coisa", async () => {
    vi.stubGlobal("fetch", responder({ tabela: false, entregas: [] }));
    const { unmount } = render(<WebhooksClient bots={[]} />);
    expect(await screen.findByText(/tridiflow-entregas\.sql/)).toBeTruthy();
    unmount();

    vi.stubGlobal("fetch", responder({ tabela: true, entregas: [] }));
    render(<WebhooksClient bots={[]} />);
    expect(await screen.findByText(/Nenhum envio registrado ainda/)).toBeTruthy();
  });

  it("'sem destino' é registro de que NÃO foi enviado, não de falha do destino", async () => {
    vi.stubGlobal("fetch", responder({
      tabela: true,
      entregas: [{ ...ENTREGA, escopo: "nenhum", destino: "-", status: null, resposta: null, erro: "sem destino configurado" }],
    }));
    render(<WebhooksClient bots={[]} />);
    expect(await screen.findByText("Não enviado")).toBeTruthy();
    expect(screen.getByText("sem destino")).toBeTruthy();
  });

  it("o card do destino global aparece com a URL em vigor", async () => {
    vi.stubGlobal("fetch", responder({ tabela: true, entregas: [] }));
    render(<WebhooksClient bots={[]} global="https://exemplo.com/hook-global" />);
    expect(await screen.findByText("Destino de todos os leads")).toBeTruthy();
    expect(screen.getByText("https://exemplo.com/hook-global")).toBeTruthy();
  });
});
