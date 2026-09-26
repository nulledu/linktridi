import { afterEach, describe, expect, it, vi } from "vitest";
import { acharTelefone, cabecalhosDoDestino, corpoDoDestino, entregarEm, interpretarResposta, payloadExemploWebhook, produtoDoFunil, webhookGlobalLeads } from "../tridiflow-db";

// A entrega do lead é best-effort: o visitante nunca vê o erro. O que impede
// isso de virar silêncio é o RESULTADO devolvido aqui (status, corpo, tentativas)
// — é ele que vira linha do diário e mensagem de log. Se esta forma quebrar, a
// tela de Webhooks volta a dizer "nada aconteceu" quando o destino recusou.

const resposta = (status: number, corpo = "") =>
  new Response(corpo, { status, headers: { "Content-Type": "text/plain" } });

afterEach(() => { vi.unstubAllGlobals(); });

describe("entregarEm", () => {
  it("2xx é entrega, uma tentativa só", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(resposta(200, "ok"));
    vi.stubGlobal("fetch", fetchFalso);
    const r = await entregarEm("https://destino.exemplo/hook", "{}");
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.tentativas).toBe(1);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("4xx NÃO repete e guarda o corpo — é o motivo da recusa", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(resposta(400, '{"error":"Invalid or missing \'type\' header."}'));
    vi.stubGlobal("fetch", fetchFalso);
    const r = await entregarEm("https://destino.exemplo/hook", "{}");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(r.tentativas).toBe(1);                       // repetir não muda opinião do destino
    expect(r.resposta).toContain("type");               // sem isto ninguém descobre o porquê
  });

  it("5xx repete uma vez e aceita quando a segunda dá certo", async () => {
    const fetchFalso = vi.fn()
      .mockResolvedValueOnce(resposta(503, "indisponivel"))
      .mockResolvedValueOnce(resposta(200, "ok"));
    vi.stubGlobal("fetch", fetchFalso);
    const r = await entregarEm("https://destino.exemplo/hook", "{}");
    expect(r.ok).toBe(true);
    expect(r.tentativas).toBe(2);
  });

  it("5xx nas duas vezes devolve falha com o status do destino", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta(500, "boom")));
    const r = await entregarEm("https://destino.exemplo/hook", "{}");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
    expect(r.tentativas).toBe(2);
  });

  it("erro de rede vira mensagem legível, não exceção", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));
    const r = await entregarEm("https://destino.exemplo/hook", "{}");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(null);
    expect(r.erro).toBe("fetch failed");
    expect(r.tentativas).toBe(2);
  });

  it("timeout diz que foi timeout — 'falha de rede' esconderia destino lento", async () => {
    const estourou = Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(estourou));
    const r = await entregarEm("https://destino.exemplo/hook", "{}");
    expect(r.erro).toContain("tempo esgotado");
  });
});

// O destino global (function de distribuição) NÃO aceita o payload plano do
// TridiFlow: sem o cabeçalho `type: typebot` responde "Invalid or missing 'type'
// header", e sem a chave `Phone` (P maiúsculo) responde "Phone is required.".
// Foram esses dois 400 seguidos que fizeram parecer que nada era enviado.
// A function responde 201 mesmo quando NÃO aceita o lead: o veredito vem em
// { statusCode, data: { dado: "{\"sucesso\":false,\"motivo\":\"lead_duplicado\"}" } }
// — string JSON dentro de objeto dentro de objeto. Marcar isso como "Entregue"
// seria pior que não ter diário: mentira com carimbo de verdade.
describe("veredito escondido no corpo da resposta", () => {
  it("abre o dado aninhado e enxerga sucesso:false", () => {
    const corpo = JSON.stringify({ statusCode: 201, data: { dado: JSON.stringify({ sucesso: false, motivo: "lead_duplicado" }) } });
    const r = interpretarResposta(corpo);
    expect(r.aceito).toBe(false);
    expect(r.motivo).toContain("duplicado");            // em português, não o código cru
  });

  it("aceita quando sucesso:true, mesmo com o dado aninhado", () => {
    const corpo = JSON.stringify({ dado: JSON.stringify({ sucesso: true, responsavel: "bcc6f694" }) });
    expect(interpretarResposta(corpo).aceito).toBe(true);
  });

  it("{ error } é recusa; corpo sem veredito não opina", () => {
    expect(interpretarResposta('{"error":"Phone is required."}').aceito).toBe(false);
    expect(interpretarResposta("ok").aceito).toBe(null);   // 2xx com corpo solto continua entrega
    expect(interpretarResposta(null).aceito).toBe(null);
  });

  it("201 com sucesso:false NÃO conta como entrega", async () => {
    const corpo = JSON.stringify({ dado: JSON.stringify({ sucesso: false, motivo: "lead_duplicado" }) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(corpo, { status: 201 })));
    const r = await entregarEm("https://destino.exemplo/hook", "{}");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(201);                          // o transporte foi bem; o lead é que não entrou
    expect(r.erro).toContain("duplicado");
    expect(r.tentativas).toBe(1);                        // recusa de negócio não se repete
  });
});

describe("formato exigido pelo destino global", () => {
  const GLOBAL = webhookGlobalLeads()!;
  const OUTRO = "https://hook.n8n.io/qualquer";
  const NOVA = "https://irdptdvkldrghevmtmzc.supabase.co/functions/v1/webhook-rede-social-novo";

  // O destino em vigor é a porta que o Typebot já usa. Se isto quebrar, o lead
  // passou a entrar por baixo, sem o `type` que identifica a origem lá dentro.
  it("o destino global é a porta /leads_typebot, com type: typebot", () => {
    expect(GLOBAL).toMatch(/\/leads_typebot$/);
    expect(cabecalhosDoDestino(GLOBAL).type).toBe("typebot");
  });

  it("nada de cabeçalho nosso em webhook de terceiro — chave nunca vaza", () => {
    expect(cabecalhosDoDestino(OUTRO)).toEqual({});
    expect(cabecalhosDoDestino(OUTRO)).not.toHaveProperty("Authorization");
  });

  it("a porta nova (se alguém apontar pra ela) recebe as 4 chaves dela", () => {
    const plano = { evento: "lead", bot: "Chancela Vega Pixel", nome: "Ana", telefone: "(11) 91234-5678" };
    const respostas = { nome: "Ana", telefone: "(11) 91234-5678" };
    // Só vale quando ela É o destino global; hoje não é, então o corpo dela
    // não se aplica e o payload plano segue para qualquer outra URL.
    expect(corpoDoDestino(NOVA, plano, respostas, null)).toEqual(plano);
    // Contrato público do webhook por bot é o payload plano documentado na tela.
    expect(corpoDoDestino(OUTRO, plano, respostas, null)).toEqual(plano);
  });

  it("acha o telefone com nome livre de variável — funil não usa 'telefone' sempre", () => {
    expect(acharTelefone({ whatsapp: "11987654321" })).toBe("11987654321");
    expect(acharTelefone({ Celular: "11987654321" })).toBe("11987654321");
    expect(acharTelefone({ resposta_2: "(11) 98765-4321" })).toBe("(11) 98765-4321");  // pelo formato
    expect(acharTelefone({ nome: "Ana", email: "a@b.com" })).toBe(null);
  });

  it("a variável mapeada em 'Enviar pro Comercial' manda no palpite", () => {
    expect(acharTelefone({ telefone: "1130000000", zap: "11987654321" }, "zap")).toBe("11987654321");
  });

  // A porta /leads_typebot é a que a Vega já usa: ela lê `type` e `produto` nos
  // CABEÇALHOS e { Phone, Name } no corpo, e só então repassa pra porta nova.
  // Mandar o payload plano nela é o "Invalid or missing 'type' header".
  describe("porta antiga (/leads_typebot)", () => {
    const ANTIGA = "https://irdptdvkldrghevmtmzc.supabase.co/functions/v1/leads_typebot";

    it("manda type no cabeçalho — sem ele a function recusa antes de olhar o corpo", () => {
      expect(cabecalhosDoDestino(ANTIGA).type).toBe("typebot");
    });

    it("só manda produto quando é um dos três que ela aceita", () => {
      expect(cabecalhosDoDestino(ANTIGA, { produto: "Chancela" }).produto).toBe("Chancela");
      expect(cabecalhosDoDestino(ANTIGA, { produto: "Chancela + Carimbo" }).produto).toBe("Chancela + Carimbo");
      expect(cabecalhosDoDestino(ANTIGA, { produto: "Adesivo" })).not.toHaveProperty("produto");
      expect(cabecalhosDoDestino(ANTIGA, { produto: null })).not.toHaveProperty("produto");
    });

    it("o corpo é Phone/Name, não o payload plano", () => {
      const plano = { evento: "lead", bot: "Chancela Vega", nome: "Ana", telefone: "(11) 91234-5678" };
      expect(corpoDoDestino(ANTIGA, plano, { nome: "Ana", telefone: "(11) 91234-5678" }, null))
        .toEqual({ Phone: "(11) 91234-5678", Name: "Ana" });
    });

    it("o teste também sai marcado como teste nela — vira lead de vendedor", () => {
      const p = payloadExemploWebhook(ANTIGA) as Record<string, string>;
      expect(p.Phone).toBe("0000000000");
      expect(p.Name).toContain("TESTE");
    });
  });

  it("produto sai do nome do funil — é o único sinal que existe hoje", () => {
    expect(produtoDoFunil("Chancela Vega Pixel Novo Moderno")).toBe("Chancela");
    expect(produtoDoFunil("Carimbos Tridi Vega Tiktok")).toBe("Carimbo");
    expect(produtoDoFunil("Chancela + Carimbos Gedux")).toBe("Chancela + Carimbo");
    expect(produtoDoFunil("Novo bot")).toBe(null);
  });

  it("o teste do global sai no formato dele e se anuncia como teste", () => {
    const p = payloadExemploWebhook(GLOBAL) as Record<string, string>;
    expect(p.Phone).toBe("0000000000");                 // número impossível: ninguém liga pra ele
    expect(p.Name).toContain("TESTE");
    // Sem URL, o exemplo continua sendo o payload plano da documentação.
    expect(payloadExemploWebhook()).not.toHaveProperty("Phone");
  });

  it("timeout continua dizendo que foi timeout (regressão)", async () => {
    const estourou = Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(estourou));
    const r = await entregarEm("https://destino.exemplo/hook", "{}");
    expect(r.erro).toContain("tempo esgotado");
  });
});
