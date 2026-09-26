import { afterEach, describe, expect, it } from "vitest";
import { previewBypassAtivo } from "@/lib/preview-bypass";

// A1 da auditoria (docs/seguranca-auditoria.md): APP_PREVIEW_BYPASS=1 dava
// identidade de colaborador REAL a qualquer requisição sem sessão — e, com
// APP_PREVIEW_USER apontando pra um admin, identidade admin anônima no ERP
// inteiro. Não havia trava por NODE_ENV, só a comparação crua `=== "1"`. Um
// operador que ligasse o flag no Vercel abria o sistema inteiro sem login.
//
// A defesa é uma função só (previewBypassAtivo): fora de produção o flag vale,
// EM produção nunca — por mais que alguém o ligue por engano.

const setEnv = (k: string, v: string | undefined) => {
  const env = process.env as Record<string, string | undefined>;
  if (v === undefined) delete env[k];
  else env[k] = v;
};

const ORIG_BYPASS = process.env.APP_PREVIEW_BYPASS;
const ORIG_NODE = process.env.NODE_ENV;

afterEach(() => {
  setEnv("APP_PREVIEW_BYPASS", ORIG_BYPASS);
  setEnv("NODE_ENV", ORIG_NODE);
});

describe("previewBypassAtivo", () => {
  it("é false em PRODUÇÃO mesmo com o flag ligado (a correção de A1)", () => {
    setEnv("NODE_ENV", "production");
    setEnv("APP_PREVIEW_BYPASS", "1");
    expect(previewBypassAtivo()).toBe(false);
  });

  it("é true fora de produção com o flag ligado (uso legítimo em dev)", () => {
    setEnv("NODE_ENV", "development");
    setEnv("APP_PREVIEW_BYPASS", "1");
    expect(previewBypassAtivo()).toBe(true);
  });

  it("é false sem o flag, em qualquer ambiente", () => {
    setEnv("NODE_ENV", "development");
    setEnv("APP_PREVIEW_BYPASS", undefined);
    expect(previewBypassAtivo()).toBe(false);
    setEnv("APP_PREVIEW_BYPASS", "0");
    expect(previewBypassAtivo()).toBe(false);
  });
});
