import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAdsOverview } from "../TrafegoOverview";
import type { PeriodState } from "../../PeriodPicker";

// ── O botão "Atualizar" da Tridify ───────────────────────────────────────────
//
// Duas vezes ele "ficou carregando e não atualizou nada", por motivos
// diferentes — e os dois moram aqui:
//
// 1) (ago/2026, 1ª vez) `useAdsOverview` limpava a bandeira assim:
//      .finally(() => { if (myReq === reqRef.current) { ...setLoading(false) } })
//    O guarda existe pra descartar resposta fora de ordem — mas a PRÓPRIA busca
//    encadeia uma segunda em segundo plano, e essa filha incrementa
//    `reqRef.current`. Quando o `finally` da mãe rodava o contador já tinha
//    andado: o `setLoading(false)` NUNCA acontecia. Bandeira de carregamento é
//    CONTAGEM de buscas em voo, não comparação com o contador de "quem é a
//    mais nova".
//
// 2) (23/08/2026) O clique era `force=1`: o panorama INTEIRO contra o Graph
//    (~200 chamadas) numa função de 60 s. Medido: 19 s em "Hoje", 40 s em "Este
//    mês"; em período longo passava do limite, o fetch morria e — com dado já
//    na tela — nenhum erro aparecia. Agora o clique recalcula a partir do
//    warehouse (`fresh=1`, segundos, insight de conta ao vivo), avisa o que
//    aconteceu, e a sincronização das campanhas vai em segundo plano.

const PERIODO: PeriodState = { key: "hoje", from: "", to: "" };
const AGORA = "2026-08-17T12:00:00.000Z";
const VELHO = "2026-08-17T11:50:00.000Z";   // > STALE_MS (6 min) → encadeia recálculo

// Sonda: expõe o estado do hook como texto, do jeito que o botão real lê.
function Sonda() {
  const { d, loading, revalidating, sincronizando, atualizando, erroAtualizar, refresh } = useAdsOverview(PERIODO, true, []);
  return (
    <div>
      <span data-testid="botao">{loading || atualizando ? "Atualizando…" : "Atualizar"}</span>
      <span data-testid="fundo">{revalidating ? "revalidando" : "-"}</span>
      <span data-testid="frio">{sincronizando ? "frio" : "-"}</span>
      <span data-testid="contas">{d ? `${d.contasAtivas} conta(s)` : "sem dado"}</span>
      <span data-testid="erro">{erroAtualizar ?? "-"}</span>
      <button onClick={() => { void refresh(); }}>Atualizar</button>
    </div>
  );
}

const overview = (updatedAt: string, contasAtivas = 6) => ({
  kpis: { spend: 10 }, contasAtivas, periodLabel: "Hoje", updatedAt,
});
const SYNC_OK = { concluido: true, contas: 6, restantes: 0, rodada: "r1" };

let chamadas: string[] = [];
function responder(mapa: (url: string) => unknown, ok: (url: string) => boolean = () => true) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    chamadas.push(String(url));
    return { ok: ok(String(url)), json: async () => mapa(String(url)) } as Response;
  }));
}
const ehSync = (u: string) => u.includes("/api/trafego/sync");
const ehFresh = (u: string) => u.includes("/api/trafego/overview") && u.includes("fresh=1");

beforeEach(() => { chamadas = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("useAdsOverview · o spinner tem que baixar", () => {
  it("cache velho encadeia um recálculo em segundo plano E o botão volta a 'Atualizar'", async () => {
    responder((url) => overview(ehFresh(url) ? AGORA : VELHO));

    render(<Sonda />);

    // Os dados aparecem…
    await waitFor(() => expect(screen.getByTestId("contas").textContent).toBe("6 conta(s)"));
    // …e o recálculo de fundo chega a acontecer (é o que travava a bandeira).
    await waitFor(() => expect(chamadas.some(ehFresh)).toBe(true));
    // …e o botão destrava. Antes do conserto, ficava "Atualizando…" pra sempre.
    await waitFor(() => expect(screen.getByTestId("botao").textContent).toBe("Atualizar"));
    await waitFor(() => expect(screen.getByTestId("fundo").textContent).toBe("-"));

    // E PARA. `buscar` é dependência do useEffect que dispara a busca: se ele
    // passar a depender do dado (`d`), cada resposta re-dispara um fetch e vira
    // laço infinito de rede — pior que o spinner travado. Duas chamadas: a
    // normal e o recálculo de fundo.
    expect(chamadas).toHaveLength(2);
    await new Promise((r) => setTimeout(r, 60));
    expect(chamadas).toHaveLength(2);
    // Nada de `force=1`: o rebuild inteiro contra o Graph é só do cron.
    expect(chamadas.some((u) => u.includes("force=1"))).toBe(false);
  });

  it("cache frio: dado chega pelo recálculo e o botão destrava", async () => {
    responder((url) => (ehFresh(url) ? overview(AGORA) : { sincronizando: true }));

    render(<Sonda />);

    await waitFor(() => expect(screen.getByTestId("contas").textContent).toBe("6 conta(s)"));
    await waitFor(() => expect(screen.getByTestId("botao").textContent).toBe("Atualizar"));
    expect(screen.getByTestId("frio").textContent).toBe("-");
  });

  it("cache frio SEM contas não deixa a tela 'sincronizando' pra sempre", async () => {
    // O recálculo é silencioso: um erro nele era engolido inteiro e a tela
    // ficava com "Primeira carga deste período: sincronizando com a Meta".
    responder((url) => (ehFresh(url) ? { error: "sem_contas" } : { sincronizando: true }));

    render(<Sonda />);

    await waitFor(() => expect(chamadas.some(ehFresh)).toBe(true));
    await waitFor(() => expect(screen.getByTestId("frio").textContent).toBe("-"));
    await waitFor(() => expect(screen.getByTestId("botao").textContent).toBe("Atualizar"));
  });

  it("resposta que chega atrasada não derruba a bandeira da busca mais nova", async () => {
    // A contagem de buscas em voo não pode virar um "quem baixa primeiro ganha":
    // com duas em voo, a bandeira só cai quando a ÚLTIMA volta.
    let liberar: (() => void) | null = null;
    const presa = new Promise<void>((r) => { liberar = r; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      chamadas.push(String(url));
      if (!ehFresh(String(url))) await presa;      // a 1ª fica pendurada
      return { ok: true, json: async () => overview(AGORA) } as Response;
    }));

    render(<Sonda />);
    await waitFor(() => expect(chamadas.length).toBe(1));
    expect(screen.getByTestId("botao").textContent).toBe("Atualizando…");
    liberar!();
    await waitFor(() => expect(screen.getByTestId("botao").textContent).toBe("Atualizar"));
  });
});

describe("useAdsOverview · o botão 'Atualizar' faz algo que dá pra ver", () => {
  // Cache RECENTE na abertura: senão o próprio carregamento já encadeia o
  // recálculo de fundo (é o caso da 1ª suíte) e o clique não tem o que provar.
  const RECENTE = () => new Date().toISOString();

  // ── A ORDEM é o conserto (25/08/2026) ──────────────────────────────────────
  // O clique recalculava a tela e só DEPOIS mandava sincronizar. Só que a tabela
  // de campanhas sai do warehouse: recalcular antes de escrever nele é ler o
  // arquivo velho de novo. Medido em produção — entre dois recálculos seguidos,
  // os KPIs do topo mudavam (vão ao Graph ao vivo) e a tabela tinha 0 de 21
  // linhas diferentes. Com o sync na frente, 6 de 21 mudam.
  //
  // Por isso o teste olha a SEQUÊNCIA das chamadas, não só o conjunto delas:
  // "sincronizou e recalculou" e "recalculou e sincronizou" batem no mesmo
  // conjunto e são coisas opostas.
  const ehAgora = (u: string) => ehSync(u) && u.includes("agora=1");
  const SYNC_AGORA = { agora: true, janela: "2026-08-17..2026-08-17", contas: 5, restantes: 0, linhas: 86, concluido: true, erros: [] };

  it("sincroniza a janela ANTES de recalcular, e a tela troca", async () => {
    responder((url) => {
      if (ehSync(url)) return SYNC_AGORA;
      // O recálculo traz dado NOVO (7 contas) — é assim que se vê que "pegou".
      if (ehFresh(url)) return overview(RECENTE(), 7);
      return overview(RECENTE(), 6);
    });

    render(<Sonda />);
    await waitFor(() => expect(screen.getByTestId("contas").textContent).toBe("6 conta(s)"));
    const antes = chamadas.length;

    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));

    await waitFor(() => expect(screen.getByTestId("contas").textContent).toBe("7 conta(s)"));
    await waitFor(() => expect(screen.getByTestId("botao").textContent).toBe("Atualizar"));
    expect(screen.getByTestId("erro").textContent).toBe("-");

    const doClique = chamadas.slice(antes);
    expect(ehAgora(doClique[0]), "a 1ª chamada do clique é o sync da janela").toBe(true);
    expect(doClique.findIndex(ehFresh), "o recálculo vem DEPOIS dele").toBeGreaterThan(0);
    expect(doClique.some((u) => u.includes("force=1"))).toBe(false);
  });

  it("o sync do clique leva o período e só as contas que estão na tela", async () => {
    // Rebaixar as 21 contas da casa leva 43–45 s e o teto da função é 60 s. As
    // contas da tela são 5. É essa lista que faz o clique caber.
    responder((url) => {
      if (ehSync(url)) return SYNC_AGORA;
      if (ehFresh(url)) return { ...overview(RECENTE(), 7), campanhas: [{ id: "c1", accountId: "111" }, { id: "c2", accountId: "222" }] };
      return { ...overview(RECENTE(), 6), campanhas: [{ id: "c1", accountId: "111" }, { id: "c2", accountId: "222" }] };
    });

    render(<Sonda />);
    await waitFor(() => expect(screen.getByTestId("contas").textContent).toBe("6 conta(s)"));

    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));

    await waitFor(() => expect(chamadas.some(ehAgora)).toBe(true));
    const u = chamadas.find(ehAgora) as string;
    expect(u).toContain("period=hoje");
    expect(decodeURIComponent(u)).toContain("contas=111,222");
  });

  it("inclui conta que começou a gastar agora mesmo que ainda não exista nas campanhas locais", async () => {
    responder((url) => {
      if (ehSync(url)) return SYNC_AGORA;
      return {
        ...overview(RECENTE(), 3),
        contasComGasto: ["111", "222", "333"],
        campanhas: [{ id: "c1", accountId: "111" }, { id: "c2", accountId: "222" }],
      };
    });

    render(<Sonda />);
    await waitFor(() => expect(screen.getByTestId("contas").textContent).toBe("3 conta(s)"));
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));

    await waitFor(() => expect(chamadas.some(ehAgora)).toBe(true));
    const u = chamadas.find(ehAgora) as string;
    expect(decodeURIComponent(u)).toContain("contas=111,222,333");
  });

  it("uma rodada COMPLETA de dreno não é aberta pelo clique", async () => {
    // Ela reconcilia 30 dias de todas as contas em até 25 voltas de ~60 s, e
    // pendurada no botão deixava o selo "Sincronizando dados novos" girando por
    // quase vinte minutos depois de um clique — lido como "não terminou de
    // atualizar". Isso fica com o dreno de fundo e com o cron.
    responder((url) => (ehSync(url) ? SYNC_AGORA : overview(RECENTE(), ehFresh(url) ? 7 : 6)));

    render(<Sonda />);
    await waitFor(() => expect(screen.getByTestId("contas").textContent).toBe("6 conta(s)"));
    const antes = chamadas.length;

    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    await waitFor(() => expect(screen.getByTestId("contas").textContent).toBe("7 conta(s)"));

    const syncs = chamadas.slice(antes).filter(ehSync);
    expect(syncs).toHaveLength(1);
    expect(syncs.every(ehAgora), "nenhuma chamada de dreno sem agora=1").toBe(true);
  });

  it("com a Meta fora, o botão volta E diz o que houve — nada de spinner mudo", async () => {
    responder((url) => (ehSync(url) ? SYNC_AGORA : ehFresh(url) ? { error: "failed" } : overview(RECENTE(), 6)));

    render(<Sonda />);
    await waitFor(() => expect(screen.getByTestId("contas").textContent).toBe("6 conta(s)"));

    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));

    await waitFor(() => expect(screen.getByTestId("erro").textContent).toMatch(/A Meta não respondeu/));
    await waitFor(() => expect(screen.getByTestId("botao").textContent).toBe("Atualizar"));
    // O dado de antes continua na tela — nunca some.
    expect(screen.getByTestId("contas").textContent).toBe("6 conta(s)");
  });

  it("o sync falhando não impede o recálculo — dado velho é pior que nenhum", async () => {
    responder(
      (url) => (ehSync(url) ? { error: "boom" } : overview(RECENTE(), ehFresh(url) ? 7 : 6)),
      (url) => !ehSync(url),   // o sync responde 500
    );

    render(<Sonda />);
    await waitFor(() => expect(screen.getByTestId("contas").textContent).toBe("6 conta(s)"));

    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));

    await waitFor(() => expect(screen.getByTestId("contas").textContent).toBe("7 conta(s)"));
    expect(screen.getByTestId("erro").textContent).toBe("-");
  });
});
