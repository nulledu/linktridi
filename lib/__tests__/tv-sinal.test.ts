import { describe, it, expect, vi, afterEach } from "vitest";
import { avisarTv } from "@/lib/tv-sinal";
import { TV_SINAL_TOPICO } from "@/lib/tv-sinal-nomes";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("avisarTv — o cutucão do servidor para as TVs", () => {
  it("sem env do Supabase não chama nada e não lança", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    await avisarTv("config");
    expect(f).not.toHaveBeenCalled();
  });

  it("manda o broadcast no tópico da parede com o evento e o payload", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    const f = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", f);
    await avisarTv("versao", { versionCode: 66 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/realtime/v1/api/broadcast");
    expect(init.headers.apikey).toBe("k");
    const corpo = JSON.parse(init.body);
    expect(corpo.messages[0]).toEqual({ topic: TV_SINAL_TOPICO, event: "versao", payload: { versionCode: 66 } });
    // Teto curto: isto roda dentro de rotas de escrita que precisam responder.
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("fetch que explode não lança", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(avisarTv("config")).resolves.toBeUndefined();
  });

  it("as rotas de escrita cutucam: config, versão publicada e comando", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const cfg = fs.readFileSync("app/api/config/route.ts", "utf8");
    const tv = fs.readFileSync("app/api/tv/route.ts", "utf8");
    const ver = fs.readFileSync("app/api/version/route.ts", "utf8");
    expect(cfg).toContain('avisarTv("config")');
    expect(tv).toContain('avisarTv("versao"');
    expect(tv).toContain('avisarTv("comando"');
    // A TV descobre onde escutar por uma rota pública e sem banco.
    expect(ver).toContain("sinal");
  });
});
