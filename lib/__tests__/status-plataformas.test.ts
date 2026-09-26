import { describe, it, expect } from "vitest";
import { agrupar, plataformaDe, nomeDoItem, motivoDaQueda, motivoDoErro, rotuloOcorrencia, SLOTS, type ItemStatus } from "../status-plataformas";

// A tela /status lê 27 itens soltos do Gatus e mostra PLATAFORMAS. O que não
// pode escapar: funil cair no grupo errado (some do gedux), a plataforma com
// problema ficar no meio da lista, e a trilha agregada pintar verde um minuto
// em que um item falhou.

const t = (min: number) => new Date(Date.UTC(2026, 8, 14, 12, min)).toISOString();
const ok = (min: number, extra: Partial<ItemStatus["results"] extends (infer R)[] | undefined ? R : never> = {}) => ({ success: true, timestamp: t(min), duration: 300e6, ...extra });

const LISTA: ItemStatus[] = [
  { key: "funis_chancela", name: "chancela", group: "Funis", results: [ok(1, { hostname: "gedux.com.br" }), { success: false, timestamp: t(2), hostname: "gedux.com.br", conditionResults: [{ condition: "[BODY] != pat(*Este link não está disponível*)", success: false }] }] },
  { key: "funis_carimbos-tridi", name: "carimbos-tridi", group: "Funis", results: [ok(1, { hostname: "gedux.com.br" }), ok(2, { hostname: "gedux.com.br" })] },
  { key: "tridi_gaius", name: "Gaius", group: "Tridi", results: [ok(2, { hostname: "tridigaius.vercel.app" })] },
  { key: "tridi_typebot-(chat-dos-funis)", name: "Typebot (chat dos funis)", group: "Tridi", results: [ok(2)] },
  { key: "meta_graph-api", name: "Graph API", group: "Meta", results: [ok(2)] },
  { key: "terceiros_supabase", name: "Supabase", group: "Terceiros", results: [ok(2)] },
];

describe("status por plataforma", () => {
  it("cada item cai na plataforma que a pessoa reconhece", () => {
    expect(plataformaDe(LISTA[0])).toBe("gedux");
    expect(plataformaDe(LISTA[2])).toBe("gaius");
    expect(plataformaDe(LISTA[3])).toBe("gedux"); // o chat dos funis é do gedux
    expect(plataformaDe(LISTA[4])).toBe("meta");
    expect(plataformaDe(LISTA[5])).toBe("supabase");
    // funil sem hostname ainda (nunca verificado) é do gedux, não do Gaius
    expect(plataformaDe({ key: "funis_x", name: "x", group: "Funis" })).toBe("gedux");
  });

  it("nome de gente, não chave do Gatus", () => {
    expect(nomeDoItem(LISTA[0])).toBe("/f/chancela");
    expect(nomeDoItem(LISTA[3])).toBe("Chat dos funis (Typebot)");
  });

  it("quem caiu sobe pro topo, e dentro dela o item caído vem primeiro", () => {
    const gs = agrupar([...LISTA].reverse());
    expect(gs[0].id).toBe("gedux");
    expect(gs[0].caidos.map((c) => c.nome)).toEqual(["/f/chancela"]);
    expect(gs[0].itens[0].nome).toBe("/f/chancela");
    expect(gs[0].caidos[0].motivo).toBe("O funil abriu dizendo que o link não está disponível");
    // o resto segue a ordem fixa das plataformas
    expect(gs.slice(1).map((g) => g.id)).toEqual(["gaius", "meta", "supabase"]);
  });

  it("a trilha da plataforma nunca fica verde no instante em que QUALQUER item falhou", () => {
    const gedux = agrupar(LISTA).find((g) => g.id === "gedux")!;
    expect(gedux.trilha).toHaveLength(SLOTS);
    // 1 funil de 3 caído é "parte caiu", não "tudo caiu": a trilha toda
    // vermelha com 98% de disponibilidade não dizia a verdade.
    expect(gedux.trilha[SLOTS - 1]).toBe("parcial");
    expect(gedux.trilha[SLOTS - 2]).toBe("ok");
    expect(gedux.trilha[0]).toBe("vazio");
    // todos os itens caídos na mesma fatia = vermelho
    const so = agrupar([LISTA[0]]).find((g) => g.id === "gedux")!;
    expect(so.trilha[SLOTS - 1]).toBe("falha");
  });

  it("ocorrências do funil (flags.json) grudam no item e somam na plataforma", () => {
    const flags = { funis: {
      chancela: { atual: "nao_encontrado", ocorrencias7d: 2, porTipo: { nao_encontrado: 1, lento: 1 },
        ultimas: [{ em: t(2), tipo: "nao_encontrado", detalhe: "Página não encontrada (404)" }, { em: t(1), tipo: "lento", detalhe: "Demorou 7 s" }] },
      "carimbos-tridi": { atual: null, ocorrencias7d: 1, porTipo: { mudou: 1 }, ultimas: [{ em: t(3), tipo: "mudou", detalhe: "Título mudou" }] },
    } };
    const gedux = agrupar(LISTA, flags).find((g) => g.id === "gedux")!;
    expect(gedux.itens.find((i) => i.nome === "/f/chancela")!.flags!.porTipo).toEqual({ nao_encontrado: 1, lento: 1 });
    expect(gedux.ocorrencias7d).toBe(3);
    // mais recente primeiro, com o nome de gente
    expect(gedux.ultimas.map((o) => `${o.tipo}:${o.nome}`)).toEqual(["mudou:/f/carimbos-tridi", "nao_encontrado:/f/chancela", "lento:/f/chancela"]);
    // item que não é funil não pega flag de funil com o mesmo nome
    expect(agrupar(LISTA, flags).find((g) => g.id === "meta")!.ocorrencias7d).toBe(0);
  });

  it("caminho quebrado e certificado viram frase e plataforma certas", () => {
    expect(rotuloOcorrencia("chat_fora")).toBe("Chat fora");
    expect(rotuloOcorrencia("link_quebrado")).toBe("Link quebrado");
    expect(motivoDaQueda({ success: false, conditionResults: [{ condition: "[CERTIFICATE_EXPIRATION] (200h) > 336h", success: false }] }))
      .toBe("O certificado HTTPS vence em menos de 14 dias");
    expect(plataformaDe({ key: "tridi_certificado-sistematridi-com-br", name: "Certificado sistematridi.com.br", group: "Tridi" })).toBe("sistematridi");
    expect(plataformaDe({ key: "tridi_certificado-gedux-com-br", name: "Certificado gedux.com.br", group: "Tridi" })).toBe("gedux");
  });

  // Domínio do Acessos & Infra: um item por endereço, cartão próprio. O erro
  // cru do Go ("no such host") não pode chegar na tela — quem lê precisa saber
  // que a correção é apontar o DNS, não que existe uma função `dial tcp`.
  it("domínio tem cartão próprio e o erro de rede vira frase", () => {
    const dom: ItemStatus[] = [
      { key: "dominios_tridigaius-com-br", name: "tridigaius.com.br", group: "Dominios",
        results: [{ success: false, timestamp: t(2), errors: ['Get "https://tridigaius.com.br/": dial tcp: lookup tridigaius.com.br: no such host'] }] },
      { key: "dominios_carimbostridii-com-br", name: "carimbostridii.com.br", group: "Dominios", results: [ok(2)] },
    ];
    expect(plataformaDe(dom[0])).toBe("dominios");
    expect(nomeDoItem(dom[0])).toBe("tridigaius.com.br");
    const g = agrupar([...LISTA, ...dom]).find((x) => x.id === "dominios")!;
    expect(g.nome).toBe("Domínios");
    expect(g.itens).toHaveLength(2);
    expect(g.caidos.map((c) => c.nome)).toEqual(["tridigaius.com.br"]);
    expect(g.caidos[0].motivo).toBe("O endereço não leva a lugar nenhum: falta apontar o DNS");
    expect(motivoDoErro("dial tcp 1.2.3.4:443: connect: connection refused")).toBe("O servidor recusou a conexão");
    expect(motivoDoErro("x509: certificate has expired or is not yet valid")).toBe("O certificado HTTPS venceu");
    expect(motivoDoErro("context deadline exceeded (Client.Timeout exceeded)")).toBe("Demorou demais pra responder");
    // erro que ninguém previu chega inteiro, não vira "falhou" genérico
    expect(motivoDoErro("http2: server sent GOAWAY")).toBe("http2: server sent GOAWAY");
  });

  // Site de tutoriais: cartão próprio, e não "mais um domínio". O link está
  // IMPRESSO em caixa e etiqueta, então ele não pode ficar escondido no meio
  // dos endereços da gaveta — e a PÁGINA do guia cai com o endereço de pé
  // (central despublicada, slug renomeado), que é justo o caso que o teste do
  // domínio não vê.
  it("tutoriais têm cartão próprio, com o endereço e os caminhos", () => {
    const tut: ItemStatus[] = [
      { key: "tutoriais_www-carimbostridii-com-br", name: "www.carimbostridii.com.br", group: "Tutoriais", results: [ok(2)] },
      { key: "tutoriais_p-tutoriais", name: "p/tutoriais", group: "Tutoriais", results: [ok(2)] },
      { key: "tutoriais_p-tutoriais-chancela", name: "p/tutoriais/chancela", group: "Tutoriais",
        results: [{ success: false, timestamp: t(3), status: 404, conditionResults: [{ condition: "[STATUS] (404) == 200", success: false }] }] },
    ];
    expect(tut.map(plataformaDe)).toEqual(["tutoriais", "tutoriais", "tutoriais"]);
    // o endereço fica endereço; o caminho ganha a barra que a chave do Gatus
    // não deixa guardar
    expect(nomeDoItem(tut[0])).toBe("www.carimbostridii.com.br");
    expect(nomeDoItem(tut[1])).toBe("/p/tutoriais");
    expect(nomeDoItem(tut[2])).toBe("/p/tutoriais/chancela");
    const g = agrupar([...LISTA, ...tut]).find((x) => x.id === "tutoriais")!;
    expect(g.nome).toBe("Tutoriais");
    expect(g.itens).toHaveLength(3);
    expect(g.caidos.map((c) => c.nome)).toEqual(["/p/tutoriais/chancela"]);
    expect(g.caidos[0].motivo).toBe("Respondeu com erro 404");
    // e o endereço do site não pode aparecer DE NOVO no cartão dos domínios
    expect(agrupar(tut).some((x) => x.id === "dominios")).toBe(false);
  });

  it("plataforma sem item nenhum não aparece", () => {
    expect(agrupar(LISTA).some((g) => g.id === "yampi")).toBe(false);
  });
});
