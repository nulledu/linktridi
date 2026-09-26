import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chavesDasAreas, mapaDePermissoes, podeConcederArea, cofreHerdado, AREA_BY_KEY } from "@/lib/areas";

// ── A cifra ──────────────────────────────────────────────────────────────────
// O módulo lê `ACESSOS_CRYPTO_KEY` na hora de cifrar (e não na importação), o
// que deixa cada teste montar o ambiente que quer. As funções são importadas
// dinamicamente mesmo assim porque `lib/acessos-cofre.ts` puxa o cliente do
// Supabase junto — carregar isso a frio dentro de um `it` é o que torna teste
// instável na suíte cheia.
const CHAVE = Buffer.alloc(32, 7).toString("base64");
let cofre: typeof import("@/lib/acessos-cofre");

describe("Cofre de acessos · cifra", () => {
  const antes = process.env.ACESSOS_CRYPTO_KEY;
  beforeEach(async () => {
    process.env.ACESSOS_CRYPTO_KEY = CHAVE;
    cofre ??= await import("@/lib/acessos-cofre");
  });
  afterEach(() => {
    if (antes === undefined) delete process.env.ACESSOS_CRYPTO_KEY;
    else process.env.ACESSOS_CRYPTO_KEY = antes;
  });

  it("volta a mesma senha, e o texto guardado não contém a senha", () => {
    const senha = "s3nh4-do-github!";
    const guardado = cofre.cifrar(senha);
    expect(cofre.decifrar(guardado)).toBe(senha);
    // A trava que importa: se alguém trocar AES por base64 "temporariamente",
    // este `not.toContain` é o que quebra.
    expect(guardado).not.toContain(senha);
    expect(Buffer.from(guardado, "base64").toString("utf8")).not.toContain(senha);
  });

  it("cifra a MESMA senha duas vezes com resultados diferentes (IV novo)", () => {
    // IV reusado em GCM deixa duas credenciais iguais se reconhecerem no banco
    // — quem abrisse a tabela saberia quem compartilha senha sem decifrar nada.
    expect(cofre.cifrar("igual")).not.toBe(cofre.cifrar("igual"));
  });

  it("recusa texto adulterado em vez de devolver lixo plausível", () => {
    const guardado = cofre.cifrar("senha-real");
    const [v, iv, tag, dado] = guardado.split(":");
    const trocado = Buffer.from(dado, "base64");
    trocado[0] ^= 0xff;
    expect(() => cofre.decifrar([v, iv, tag, trocado.toString("base64")].join(":")))
      .toThrow();
  });

  it("recusa a chave errada", () => {
    const guardado = cofre.cifrar("senha-real");
    process.env.ACESSOS_CRYPTO_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => cofre.decifrar(guardado)).toThrow();
  });

  it("sem chave (ou com chave curta) o cofre se RECUSA a cifrar", () => {
    // A alternativa silenciosa — gravar em claro "só por enquanto" — é como um
    // cofre vira planilha sem ninguém perceber até o vazamento.
    delete process.env.ACESSOS_CRYPTO_KEY;
    expect(cofre.cofreConfigurado()).toBe(false);
    expect(() => cofre.cifrar("x")).toThrow();

    process.env.ACESSOS_CRYPTO_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(cofre.cofreConfigurado()).toBe(false);
    expect(() => cofre.cifrar("x")).toThrow();
  });

  it("aceita a chave em hex além de base64", () => {
    process.env.ACESSOS_CRYPTO_KEY = Buffer.alloc(32, 3).toString("hex");
    expect(cofre.cofreConfigurado()).toBe(true);
    expect(cofre.decifrar(cofre.cifrar("ok"))).toBe("ok");
  });
});

// ── A permissão ──────────────────────────────────────────────────────────────
// O cofre saiu de Pessoas → Acessos & Infra em 15/09/2026: `colaboradores:cofre`
// virou `infraestrutura:cofre`. Pessoas voltou a ser liga/desliga; Infra ganhou
// as subs `ver` (domínios/hospedagens/VPS) e `cofre` (sensível). As armadilhas
// mecânicas são as mesmas de sempre — só se manifestam na grade de outra pessoa,
// dias depois — mais a da MIGRAÇÃO: ninguém pode perder o cofre na virada.
describe("Cofre de senhas · permissão", () => {
  it("Pessoas voltou a ser liga/desliga; o cofre agora é sub de Infra", () => {
    // Pessoas não tem mais subs (o `ponto` só existia pra segurar a área com o
    // cofre dentro). O cofre é a sub `cofre` de Infra — e NÃO se chama `acessos`:
    // esse nome faria `podeConcederArea("infraestrutura")` exigir a chave de quem
    // administra a área só pra salvar um domínio.
    expect(AREA_BY_KEY.colaboradores.subs ?? []).toHaveLength(0);
    const subsInfra = (AREA_BY_KEY.infraestrutura.subs ?? []).map((s) => s.key);
    expect(subsInfra).toEqual(["ver", "cofre"]);
    expect(subsInfra).not.toContain("acessos");
    expect(podeConcederArea("infraestrutura", [])).toBe(true);
  });

  it("quem tinha `infraestrutura` (modelo antigo) vê domínios e NÃO ganha o cofre", () => {
    // Back-compat: dar subs a uma área existente não tira acesso de ninguém, nem
    // entrega a senha do GitHub da empresa a quem só confere vencimento de domínio.
    const chaves = chavesDasAreas({ infraestrutura: true });
    expect(chaves).toContain("infraestrutura");
    expect(chaves).toContain("infraestrutura:ver");
    expect(chaves).not.toContain("infraestrutura:cofre");
  });

  it("quem tinha `colaboradores` continua com Pessoas (a área é liga/desliga)", () => {
    const chaves = chavesDasAreas({ colaboradores: true });
    expect(chaves).toContain("colaboradores");
    expect(chaves).not.toContain("infraestrutura:cofre");
  });

  it("salvar Infra só com `ver` NÃO apaga a área e deixa o cofre desligado", () => {
    // Numa área com subs, `mapaDePermissoes` só liga a área se ALGUMA sub estiver
    // marcada. É por isso que existe a sub `ver`: sem ela, salvar a grade de quem
    // cuida de domínio (e não do cofre) gravaria `infraestrutura: false`.
    const mapa = mapaDePermissoes({ ehAdmin: false, selecionadas: new Set(["infraestrutura:ver"]) });
    expect(mapa["infraestrutura"]).toBe(true);
    expect(mapa["infraestrutura:cofre"]).toBe(false);
  });

  it("o cofre nasce desligado, é sensível e só entra ligado de propósito", () => {
    expect(AREA_BY_KEY.infraestrutura.subs?.find((s) => s.key === "cofre")?.sensivel).toBe(true);
    const com = chavesDasAreas({ "infraestrutura:ver": true, "infraestrutura:cofre": true });
    expect(com).toContain("infraestrutura:cofre");
    expect(com).toContain("infraestrutura");
  });

  it("MIGRAÇÃO: quem tinha `colaboradores:cofre` herda o cofre novo E a área pra chegar nele", () => {
    // Ninguém perde o cofre na virada, nem o jeito de abrir a tela (que agora
    // mora em Infra). `cofreHerdado` traduz a chave antiga; o resolver soma a área.
    expect(cofreHerdado({ "colaboradores:cofre": true })).toBe(true);
    const chaves = chavesDasAreas({ "colaboradores:cofre": true });
    expect(chaves).toContain("infraestrutura:cofre");
    expect(chaves).toContain("infraestrutura");
  });

  it("MIGRAÇÃO guardada: decidido o cofre novo (mesmo false), a chave antiga não conta", () => {
    // Sem essa guarda, desmarcar o cofre não surtiria efeito — a chave antiga o
    // traria de volta por baixo (a armadilha das áreas abertas temporariamente).
    expect(cofreHerdado({ "colaboradores:cofre": true, "infraestrutura:cofre": false })).toBe(false);
    expect(chavesDasAreas({ "colaboradores:cofre": true, "infraestrutura:cofre": false }))
      .not.toContain("infraestrutura:cofre");
  });
});
