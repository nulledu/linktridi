import { describe, it, expect } from "vitest";
import {
  classificarOrigem, dispositivoDe, ehPrefetch, ehRobo, hostDe,
  lerAtribuicao, serializarAtribuicao, ufDaRequisicao, UFS,
} from "@/lib/lojas-analytics";

// ── Trava do analytics da vitrine ────────────────────────────────────────────
// Relatório de acesso mente de um jeito que ninguém percebe: o número aparece,
// parece razoável, e está errado. As três formas conhecidas de errar aqui são
//
//   · contar ROBÔ como gente (sem pixel, o robô chega na renderização);
//   · classificar a PRÓPRIA loja como origem (a vitrine indicando a si mesma
//     viraria a maior "parceira" do relatório);
//   · aceitar a sigla de região de QUALQUER país como UF brasileira.
//
// Os três casos estão abaixo, e é por isso que este arquivo existe.

describe("robô e prefetch", () => {
  it("reconhece robô conhecido e user-agent vazio", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "facebookexternalhit/1.1",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "Mozilla/5.0 AhrefsBot/7.0",
      "HeadlessChrome/120",
    ]) {
      expect(ehRobo(ua), ua).toBe(true);
    }
    // Sem user-agent nenhum é máquina: navegador sempre manda um.
    expect(ehRobo("")).toBe(true);
    expect(ehRobo(null)).toBe(true);
  });

  it("não confunde gente com robô", () => {
    for (const ua of [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.1 Safari/605.1.15",
    ]) {
      expect(ehRobo(ua), ua).toBe(false);
    }
  });

  it("descarta a busca que o navegador faz adiantando", () => {
    expect(ehPrefetch(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(ehPrefetch(new Headers({ "sec-purpose": "prefetch;prerender" }))).toBe(true);
    expect(ehPrefetch(new Headers({ purpose: "prefetch" }))).toBe(true);
    // Uma navegação de verdade não traz nenhum desses.
    expect(ehPrefetch(new Headers({ "sec-fetch-mode": "navigate" }))).toBe(false);
  });
});

describe("dispositivo", () => {
  it("iPad é tablet, mesmo dizendo Mobile", () => {
    // O iPad manda "Mobile" no user-agent; testar celular primeiro
    // classificaria todo iPad como celular.
    expect(dispositivoDe("Mozilla/5.0 (iPad; CPU OS 17_0) Version/17.0 Mobile/15E148 Safari/604.1")).toBe("tablet");
    expect(dispositivoDe("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148")).toBe("celular");
    expect(dispositivoDe("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0")).toBe("computador");
    expect(dispositivoDe(null)).toBe("computador");
  });
});

describe("estado de quem acessa", () => {
  it("aceita a sigla só quando o país é o Brasil", () => {
    expect(ufDaRequisicao(new Headers({ "x-vercel-ip-country": "BR", "x-vercel-ip-country-region": "SP" }))).toBe("SP");
    expect(ufDaRequisicao(new Headers({ "x-vercel-ip-country": "br", "x-vercel-ip-country-region": "BR-RJ" }))).toBe("RJ");
    // "SP" existe fora do Brasil. Sem a checagem de país, um acesso de Portugal
    // entraria no relatório como São Paulo.
    expect(ufDaRequisicao(new Headers({ "x-vercel-ip-country": "PT", "x-vercel-ip-country-region": "SP" }))).toBeNull();
    // Sigla que não é UF é ruído.
    expect(ufDaRequisicao(new Headers({ "x-vercel-ip-country": "BR", "x-vercel-ip-country-region": "ZZ" }))).toBeNull();
    // Sem cabeçalho (desenvolvimento local) é "não sei", não é um chute.
    expect(ufDaRequisicao(new Headers())).toBeNull();
  });

  it("tem as 27 unidades federativas", () => {
    expect(UFS).toHaveLength(27);
    expect(new Set(UFS).size).toBe(27);
  });
});

describe("de onde a pessoa veio", () => {
  const loja = "carimbostridi.com.br";

  it("sem referrer é direto", () => {
    const o = classificarOrigem(null, {}, loja);
    expect(o).toEqual({ canal: "direto", fonte: null, campanha: null, referencia: null });
  });

  it("navegar dentro da própria loja NÃO é uma origem", () => {
    // Sem isto a vitrine apareceria como a maior "indicação" dela mesma — e
    // cada clique interno viraria uma origem nova.
    const o = classificarOrigem("https://carimbostridi.com.br/produto-x", {}, loja);
    expect(o.canal).toBe("direto");
    expect(o.referencia).toBeNull();
    // E o `www.` não muda nada.
    expect(classificarOrigem("https://www.carimbostridi.com.br/", {}, loja).canal).toBe("direto");
  });

  it("reconhece busca, rede social e indicação", () => {
    expect(classificarOrigem("https://www.google.com/search?q=carimbo", {}, loja))
      .toMatchObject({ canal: "busca", fonte: "google" });
    expect(classificarOrigem("https://l.instagram.com/", {}, loja))
      .toMatchObject({ canal: "social", fonte: "instagram" });
    expect(classificarOrigem("https://m.facebook.com/", {}, loja))
      .toMatchObject({ canal: "social", fonte: "facebook" });
    expect(classificarOrigem("https://blog.parceiro.com.br/post", {}, loja))
      .toMatchObject({ canal: "indicacao", fonte: "parceiro" });
  });

  it("o utm vence o referrer", () => {
    // O lojista sabe melhor que o navegador de onde veio aquele link.
    const o = classificarOrigem("https://www.google.com/", {
      utm_source: "instagram", utm_medium: "paid_social", utm_campaign: "black-friday",
    }, loja);
    expect(o).toMatchObject({ canal: "social", fonte: "instagram", campanha: "black-friday" });
    // O referrer continua guardado pra auditoria do que foi classificado.
    expect(o.referencia).toBe("www.google.com");
  });

  it("lê o canal a partir do utm_medium", () => {
    const canal = (medium: string) =>
      classificarOrigem(null, { utm_source: "x", utm_medium: medium }, loja).canal;
    expect(canal("cpc")).toBe("campanha");
    expect(canal("email")).toBe("email");
    expect(canal("organic")).toBe("busca");
    expect(canal("referral")).toBe("indicacao");
    expect(canal("social")).toBe("social");
    // Meio desconhecido com utm presente é campanha: alguém marcou o link de
    // propósito, então não é "direto".
    expect(canal("qualquer-coisa")).toBe("campanha");
  });

  it("aceita URLSearchParams e objeto", () => {
    const p = new URLSearchParams("utm_source=Google&utm_medium=CPC");
    expect(classificarOrigem(null, p, loja)).toMatchObject({ canal: "campanha", fonte: "google" });
  });

  it("aguenta referrer torto", () => {
    for (const r of ["", "  ", "não-é-url", "javascript:alert(1)"]) {
      expect(() => classificarOrigem(r, {}, loja)).not.toThrow();
      expect(classificarOrigem(r, {}, loja).canal).toBe("direto");
    }
    expect(hostDe("não-é-url")).toBeNull();
  });
});

describe("cookie de atribuição", () => {
  it("vai e volta", () => {
    const o = { canal: "social" as const, fonte: "instagram", campanha: "natal", referencia: "l.instagram.com" };
    const lido = lerAtribuicao(serializarAtribuicao(o));
    expect(lido).toMatchObject({ canal: "social", fonte: "instagram", campanha: "natal" });
  });

  it("recusa cookie mexido à mão", () => {
    // O cookie é do navegador do visitante: qualquer pessoa consegue editar.
    // Um canal inventado viraria uma fatia nova no relatório do lojista.
    expect(lerAtribuicao("canal-inventado|x|y")).toBeNull();
    expect(lerAtribuicao("")).toBeNull();
    expect(lerAtribuicao(null)).toBeNull();
  });

  it("aguenta campos vazios", () => {
    expect(lerAtribuicao("direto||")).toMatchObject({ canal: "direto", fonte: null, campanha: null });
  });
});
