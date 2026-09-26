import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRELOAD_JS } from "../preload";
import { lerAparenciaDaConta, scriptAparenciaDaConta } from "../tema";

// ── O tema nasce certo no primeiro quadro ───────────────────────────────────
// Recarregar a página mostrava o tema ESCURO por ~1 s e só depois virava o
// claro escolhido. O script que aplica o tema estava num
// `<Script strategy="beforeInteractive">` — que no App Router NÃO é um
// <script> de verdade: o Next escreve só `self.__next_s.push(...)` no HTML e
// quem cria o <script> é o próprio runtime, depois que o chunk principal
// baixou (`loadScriptsInSequence`, em next/dist/client/app-bootstrap.js).
// Até lá o navegador já pintou a página com o padrão do CSS, que é escuro.
//
// O conserto é o que todo mundo faz (GitHub, next-themes, Vercel): script
// cru, síncrono, no <head>. E a escolha mora na CONTA — o aparelho guarda só
// uma cópia pra pintar certo no primeiro milissegundo, e a conta vence quando
// é mais nova.

const raiz = join(__dirname, "..", "..");
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

type Ambiente = {
  classes: Set<string>;
  attrs: Record<string, string>;
  estilo: Record<string, string>;
  store: Record<string, string>;
  janela: Record<string, unknown>;
  mudarSistema: (claro: boolean) => void;
  rodar: (codigo: string) => void;
};

/** O pre-paint rodando num documento de mentira, como o navegador rodaria no <head>. */
function ambiente(store: Record<string, string>, sistemaClaro: boolean): Ambiente {
  const classes = new Set<string>();
  const attrs: Record<string, string> = {};
  const estilo: Record<string, string> = {};
  const ouvintes: Array<() => void> = [];
  const mq = {
    matches: sistemaClaro,
    addEventListener: (_tipo: string, fn: () => void) => { ouvintes.push(fn); },
  };
  const style = new Proxy(
    { setProperty: (k: string, v: string) => { estilo[k] = v; } } as Record<string, unknown>,
    { set: (_alvo, k, v) => { estilo[String(k)] = String(v); return true; } },
  );
  const doc = {
    documentElement: {
      classList: {
        add: (c: string) => { classes.add(c); },
        remove: (c: string) => { classes.delete(c); },
        contains: (c: string) => classes.has(c),
      },
      setAttribute: (k: string, v: string) => { attrs[k] = String(v); },
      getAttribute: (k: string) => (k in attrs ? attrs[k] : null),
      style,
    },
    querySelector: () => null,
  };
  const localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
  const janela: Record<string, unknown> = { matchMedia: () => mq };
  const rodar = (codigo: string) =>
    // eslint-disable-next-line no-new-func
    new Function("window", "document", "localStorage", "console", codigo)(
      janela, doc, localStorage, { log() {} },
    );
  rodar(PRELOAD_JS);
  return {
    classes, attrs, estilo, store, janela, rodar,
    mudarSistema: (claro: boolean) => { mq.matches = claro; ouvintes.forEach((fn) => fn()); },
  };
}

describe("o tema é aplicado antes do primeiro paint", () => {
  it("o <head> roda o pre-paint inline — nunca pelo next/script", () => {
    const layout = ler("app/layout.tsx");
    expect(layout, "beforeInteractive no App Router roda DEPOIS do paint")
      .not.toMatch(/strategy=["']beforeInteractive["']/);
    expect(layout).not.toMatch(/src=["']\/preload\.js["']/);
    const head = /<head>([\s\S]*?)<\/head>/.exec(layout)?.[1] ?? "";
    expect(head, "o script tem de estar dentro do <head>, síncrono").toMatch(/__html:\s*PRELOAD_JS/);
  });

  it("sem escolha, segue o sistema", () => {
    const claro = ambiente({}, true);
    expect(claro.classes.has("light")).toBe(true);
    expect(claro.attrs["data-tema"]).toBe("system");
    expect(claro.estilo.colorScheme).toBe("light");

    const escuro = ambiente({}, false);
    expect(escuro.classes.has("light")).toBe(false);
    expect(escuro.estilo.colorScheme).toBe("dark");
  });

  it("escolha explícita vence o sistema", () => {
    expect(ambiente({ theme: "dark" }, true).classes.has("light")).toBe(false);
    expect(ambiente({ theme: "light" }, false).classes.has("light")).toBe(true);
    expect(ambiente({ theme: "light" }, false).attrs["data-tema"]).toBe("light");
  });

  it("no modo sistema, acompanha a troca do SO sem recarregar", () => {
    const sistema = ambiente({}, false);
    sistema.mudarSistema(true);
    expect(sistema.classes.has("light")).toBe(true);
    sistema.mudarSistema(false);
    expect(sistema.classes.has("light")).toBe(false);

    // Quem escolheu escuro continua no escuro quando o SO clareia.
    const fixo = ambiente({ theme: "dark" }, false);
    fixo.mudarSistema(true);
    expect(fixo.classes.has("light")).toBe(false);
  });

  it("valor estranho guardado no aparelho cai no sistema", () => {
    const a = ambiente({ theme: "banana" }, true);
    expect(a.attrs["data-tema"]).toBe("system");
    expect(a.classes.has("light")).toBe(true);
  });
});

describe("a escolha mora na conta", () => {
  const conta = (valor: unknown, em: string | null) => scriptAparenciaDaConta(lerAparenciaDaConta(valor, em));

  it("a conta vence a cópia do aparelho", () => {
    const a = ambiente({ theme: "dark", "aparencia-em": "100" }, false);
    a.rodar(conta({ tema: "light", accent: "#1FA971" }, new Date(200).toISOString()));
    expect(a.classes.has("light")).toBe(true);
    expect(a.store.theme).toBe("light");
    expect(a.store.accent).toBe("#1fa971");
    expect(a.store["aparencia-em"]).toBe("200");
    expect(a.estilo["--primary"]).toBe("#1fa971");
  });

  it("cache velho da conta não desfaz uma troca mais nova deste aparelho", () => {
    // O layout lê a conta com cache por instância: outra instância pode
    // devolver a versão de antes da troca. Versão menor não sobrescreve.
    const a = ambiente({ theme: "light", "aparencia-em": "300" }, false);
    a.rodar(conta({ tema: "dark" }, new Date(200).toISOString()));
    expect(a.classes.has("light")).toBe(true);
    expect(a.store["aparencia-em"]).toBe("300");
  });

  it("troca local ainda não gravada não é atropelada", () => {
    const a = ambiente({ theme: "light", "aparencia-em": "pendente" }, false);
    a.rodar(conta({ tema: "dark" }, new Date(9e12).toISOString()));
    expect(a.classes.has("light")).toBe(true);
    expect(a.store["aparencia-em"]).toBe("pendente");
  });

  it("aparelho sem versão (cópia antiga) adota a conta", () => {
    const a = ambiente({ theme: "dark" }, false);
    a.rodar(conta({ tema: "light" }, new Date(5).toISOString()));
    expect(a.classes.has("light")).toBe(true);
  });

  it("conta sem nada salvo não mexe no aparelho", () => {
    const a = ambiente({ theme: "light" }, false);
    a.rodar(scriptAparenciaDaConta(null));
    expect(a.classes.has("light")).toBe(true);
    expect(a.store["aparencia-em"]).toBeUndefined();
  });

  it("o que vem do banco é validado antes de virar script", () => {
    expect(lerAparenciaDaConta({ tema: "light", accent: "#1FA971" }, "2026-09-14T12:00:00.000+00:00"))
      .toEqual({ tema: "light", accent: "#1fa971", em: Date.parse("2026-09-14T12:00:00.000Z") });
    expect(lerAparenciaDaConta({ tema: "system" }, null)).toEqual({ tema: "system", accent: null, em: 0 });
    for (const lixo of [null, "light", [1], { tema: "roxo", accent: "red" }]) {
      expect(lerAparenciaDaConta(lixo, null)).toBeNull();
    }
    const hostil = scriptAparenciaDaConta(lerAparenciaDaConta(
      { tema: "</script><script>alert(1)</script>", accent: "#fff\"</script>" }, null,
    ));
    expect(hostil).not.toMatch(/<\/script/i);
  });

  it("o layout da plataforma aplica a conta ANTES do Shell pintar", () => {
    const layout = ler("app/(plataforma)/layout.tsx");
    const script = layout.indexOf("scriptAparenciaDaConta(");
    expect(script, "sem o script, a conta só entraria depois da hidratação").toBeGreaterThan(-1);
    expect(script).toBeLessThan(layout.indexOf("<Shell"));
  });

  it("a leitura da conta no layout é cacheada e a gravação a derruba", () => {
    // Cada ida ao Supabase custa 250–700 ms daqui: sem cache, isto seria uma
    // espera a mais em TODA página.
    // Tema e barra recolhida saem na MESMA leitura (prefs do shell).
    expect(ler("lib/user-prefs.ts")).toMatch(/cached\(`prefs-shell:/);
    expect(ler("app/api/user-prefs/route.ts")).toMatch(/esquecerPrefsDoShell\(/);
  });
});
