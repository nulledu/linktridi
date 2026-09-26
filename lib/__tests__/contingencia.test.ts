import { describe, it, expect } from "vitest";
import {
  consolidar, flagsDe, indiceDeProxies, saudeDe, filtrarNumeros, variacoes,
  inteiroNaoNegativo, valorMonetario, limitesValidos, fmtTaxa, hojeSP, agrupar,
  LIMITES_PADRAO,
  type Ativo, type Celular, type Proxy, type Custo, type PendenciaOperacional,
} from "@/lib/contingencia-const";

// ── O que estes testes protegem ──────────────────────────────────────────────
// 1. O MAPEAMENTO de status do aquecimento pro vocabulário da contingência
//    (pronto = aquecido; aquecido nas fórmulas = aquecido + em_uso).
// 2. As QUATRO FÓRMULAS exatamente como foram informadas, com denominador zero
//    virando `null` e nunca Infinity/NaN.
// 3. A saúde do atendente com limites vindos de fora, nunca de número no código.
// 4. Agrupamentos automáticos (modelo, operadora) sem lista fixa.

let seq = 0;
const numero = (o: Partial<Ativo> = {}): Ativo => ({
  id: `n${++seq}`, tipo: "numero", nome: `(62) 9 0000-${seq}`, identificador: null, paiId: null,
  status: "aquecido", roteiroId: null, iniciadoEm: "2026-08-01", pausadoEm: null,
  responsavelId: "ana", responsavelNome: "Ana", responsavelFoto: null,
  aparelho: "Moto G54 · mesa 1", operadora: "Fluke", obs: null, ...o,
});
const celular = (o: Partial<Celular> = {}): Celular => ({
  id: `c${++seq}`, nome: "Moto G54 · mesa 1", modelo: "Moto G54", fotoUrl: null, lugar: null, obs: null,
  situacao: "ok", identificacao: null, responsavelId: null, responsavelNome: null, ...o,
});
const proxy = (o: Partial<Proxy> = {}): Proxy => ({
  id: `p${++seq}`, identificacao: `PX-${seq}`, status: "ativo", custoMensal: 50,
  numeroId: null, aparelhoNome: null, compradoEm: null, obs: null, ...o,
});
const custo = (o: Partial<Custo> = {}): Custo => ({
  id: `k${++seq}`, tipo: "plano_chip", descricao: "Plano", valor: 30, periodicidade: "mensal",
  data: "2026-09-01", ativo: true, obs: null, ...o,
});
const pend = (status: "aberta" | "feita" = "aberta"): PendenciaOperacional => ({
  id: `t${++seq}`, titulo: "Fazer novos suportes de celular", descricao: null, status,
  responsavelId: null, responsavelNome: null, data: null, concluidaEm: null, createdAt: "2026-09-01T00:00:00Z",
});

const vazio = { ativos: [], celulares: [], proxies: [], custos: [], pendencias: [], agora: "2026-09-01T12:00:00Z" };

describe("mapeamento de status", () => {
  it("pronto é só `aquecido`; aquecido nas fórmulas inclui `em_uso`", () => {
    const idx = indiceDeProxies([]);
    expect(flagsDe(numero({ status: "aquecido" }), idx)).toMatchObject({ pronto: true, aquecido: true, emUso: false });
    expect(flagsDe(numero({ status: "em_uso" }), idx)).toMatchObject({ pronto: false, aquecido: true, emUso: true });
    expect(flagsDe(numero({ status: "novo" }), idx)).toMatchObject({ naoAquecido: true, aquecido: false });
    expect(flagsDe(numero({ status: "aquecendo" }), idx)).toMatchObject({ emAquecimento: true });
    expect(flagsDe(numero({ status: "restrito" }), idx)).toMatchObject({ restrito: true, caido: true });
    expect(flagsDe(numero({ status: "banido" }), idx)).toMatchObject({ bloqueado: true, caido: true });
    expect(flagsDe(numero({ status: "aposentado" }), idx).ativo).toBe(false);
  });

  it("Fluke é a operadora, sem caixa nem acento", () => {
    const idx = indiceDeProxies([]);
    expect(flagsDe(numero({ operadora: " FLUKE " }), idx).fluke).toBe(true);
    expect(flagsDe(numero({ operadora: "Claro" }), idx).fluke).toBe(false);
  });

  it("em estoque = novo, sem aparelho e sem atendente", () => {
    const idx = indiceDeProxies([]);
    expect(flagsDe(numero({ status: "novo", aparelho: null, responsavelId: null, responsavelNome: null }), idx).emEstoque).toBe(true);
    expect(flagsDe(numero({ status: "novo", aparelho: null }), idx).emEstoque).toBe(false);
  });

  it("proxy protege pelo número OU pelo aparelho onde ele mora; proxy inativo não conta", () => {
    const n1 = numero({ aparelho: "Moto A" });
    const n2 = numero({ aparelho: "Moto B" });
    const n3 = numero({ aparelho: "Moto C" });
    const idx = indiceDeProxies([
      proxy({ numeroId: n1.id }),
      proxy({ aparelhoNome: "moto b" }),
      proxy({ numeroId: n3.id, status: "expirado" }),
    ]);
    expect(flagsDe(n1, idx).comProxy).toBe(true);
    expect(flagsDe(n2, idx).comProxy).toBe(true);
    expect(flagsDe(n3, idx).comProxy).toBe(false);
  });
});

describe("as quatro taxas", () => {
  it("segue as fórmulas informadas, sem ajuste", () => {
    const celA = celular({ nome: "A" }), celB = celular({ nome: "B" }), celC = celular({ nome: "C" });
    const numeros = [
      numero({ aparelho: "A", status: "aquecido" }),     // aquecido, com proxy (via A)
      numero({ aparelho: "A", status: "em_uso" }),       // aquecido, com proxy
      numero({ aparelho: "B", status: "aquecido" }),     // aquecido, sem proxy
      numero({ aparelho: "B", status: "novo" }),         // não aquecido
      numero({ aparelho: "C", status: "banido" }),       // caído, com proxy (via C)
      numero({ aparelho: "C", status: "novo" }),         // não aquecido
    ];
    const c = consolidar({ ...vazio, ativos: numeros, celulares: [celA, celB, celC],
      proxies: [proxy({ aparelhoNome: "A" }), proxy({ aparelhoNome: "C" })] });

    // produtividade = celulares / celulares com proxy = 3 / 2
    expect(c.taxas.produtividade.numerador.valor).toBe(3);
    expect(c.taxas.produtividade.denominador.valor).toBe(2);
    expect(c.taxas.produtividade.valor).toBeCloseTo(1.5);
    // aquecimento = aquecidos / não aquecidos = 3 / 2
    expect(c.taxas.aquecimento.valor).toBeCloseTo(1.5);
    // protegidos = aquecidos / aquecidos com proxy = 3 / 2
    expect(c.taxas.protegidos.valor).toBeCloseTo(1.5);
    // qualidade = com proxy aquecidos / com proxy caídos = 2 / 1
    expect(c.taxas.qualidade.numerador.valor).toBe(2);
    expect(c.taxas.qualidade.denominador.valor).toBe(1);
    expect(c.taxas.qualidade.valor).toBe(2);
  });

  it("denominador zero vira null, nunca Infinity", () => {
    const c = consolidar({ ...vazio, ativos: [numero({ status: "aquecido" })], celulares: [celular()] });
    expect(c.taxas.produtividade.valor).toBeNull();   // nenhum celular com proxy
    expect(c.taxas.aquecimento.valor).toBeNull();     // nenhum não aquecido
    expect(c.taxas.protegidos.valor).toBeNull();
    expect(c.taxas.qualidade.valor).toBeNull();
    expect(fmtTaxa(c.taxas.qualidade)).toBe("—");
    expect(fmtTaxa(1.5)).toBe("1,50×");
  });
});

describe("consolidado", () => {
  it("conta números, celulares, operadoras e custos a partir das entidades", () => {
    const numeros = [
      numero({ status: "aquecido", operadora: "Fluke", aparelho: "M1" }),
      numero({ status: "aquecendo", operadora: "Claro", aparelho: "M1" }),
      numero({ status: "novo", operadora: "Fluke", aparelho: null, responsavelId: null, responsavelNome: null }),
      numero({ status: "aposentado", operadora: "Vivo" }),
    ];
    const c = consolidar({
      ...vazio, ativos: numeros,
      celulares: [celular({ nome: "M1", modelo: "iPhone 8" }), celular({ nome: "M2", modelo: "iphone 8" }), celular({ nome: "M3", modelo: "Samsung A15", situacao: "aposentado" })],
      proxies: [proxy({ aparelhoNome: "M1", custoMensal: 40 }), proxy({ custoMensal: 40 }), proxy({ status: "inativo", custoMensal: 99 })],
      custos: [custo({ valor: 30 }), custo({ valor: 25, tipo: "outro" }), custo({ valor: 999, periodicidade: "unico" }), custo({ valor: 500, ativo: false })],
      pendencias: [pend(), pend("feita")],
    });
    expect(c.numeros).toMatchObject({ total: 3, prontos: 1, emAquecimento: 1, naoAquecidos: 1, aposentados: 1, fluke: 2, comProxy: 2, semProxy: 1, emEstoque: 1, emEstoqueFluke: 1 });
    expect(c.celulares).toMatchObject({ total: 2, emUso: 1, disponiveis: 1, aposentados: 1, comProxy: 1, semProxy: 1 });
    expect(c.celulares.porModelo).toEqual([{ rotulo: "iPhone 8", qtd: 2 }]);
    expect(c.operadoras.map((o) => [o.rotulo, o.qtd, o.fluke])).toEqual([["Fluke", 2, true], ["Claro", 1, false]]);
    expect(c.proxies).toMatchObject({ comprados: 3, ativos: 2, associados: 1, livres: 1, gastoMensal: 80 });
    expect(c.custos).toEqual({ proxies: 80, planos: 30, outros: 25, total: 110 });
    expect(c.pendenciasAbertas).toBe(1);
    expect(c.geradoEm).toBe("2026-09-01T12:00:00Z");
  });

  it("agrupa por atendente, com o id na frente do nome e crítico primeiro", () => {
    const numeros = [
      numero({ responsavelId: "ana", responsavelNome: "Ana", status: "aquecido" }),
      numero({ responsavelId: "ana", responsavelNome: "Ana", status: "aquecido" }),
      numero({ responsavelId: "ana", responsavelNome: "Ana", status: "aquecido" }),
      numero({ responsavelId: "ana", responsavelNome: "Ana", status: "em_uso", responsavelFoto: "http://foto" }),
      numero({ responsavelId: null, responsavelNome: "Bia", status: "em_uso", aparelho: "X" }),
      numero({ responsavelId: null, responsavelNome: "bia ", status: "banido", aparelho: "X" }),
    ];
    const c = consolidar({ ...vazio, ativos: numeros, proxies: [proxy({ aparelhoNome: "Moto G54 · mesa 1" })] });
    expect(c.atendentes.map((a) => a.nome)).toEqual(["Bia", "Ana"]);
    const bia = c.atendentes[0];
    expect(bia).toMatchObject({ chave: "nome:bia", numeros: 2, reservas: 0, emAquecimento: 0, caidos: 1, saude: "critico" });
    const ana = c.atendentes[1];
    expect(ana).toMatchObject({ chave: "ana", numeros: 4, aquecidos: 4, reservas: 3, comProxy: 4, aquecidosComProxy: 4, saude: "saudavel", foto: "http://foto" });
  });
});

describe("saúde do atendente", () => {
  const base = { numeros: 5, reservas: 3, emAquecimento: 1, aquecidosComProxy: 3 };
  it("saudável quando reservas e protegidos passam dos limites", () => {
    expect(saudeDe(base).saude).toBe("saudavel");
  });
  it("atenção por poucas reservas ou poucos protegidos", () => {
    expect(saudeDe({ ...base, reservas: 2 }).saude).toBe("atencao");
    expect(saudeDe({ ...base, aquecidosComProxy: 1 }).saude).toBe("atencao");
  });
  it("crítico só sem reserva E sem nada aquecendo", () => {
    expect(saudeDe({ ...base, reservas: 0, emAquecimento: 1 }).saude).toBe("atencao");
    expect(saudeDe({ ...base, reservas: 0, emAquecimento: 0 }).saude).toBe("critico");
    expect(saudeDe({ ...base, numeros: 0, reservas: 0, emAquecimento: 0 }).saude).toBe("critico");
  });
  it("os limites vêm de fora", () => {
    expect(saudeDe({ ...base, reservas: 4 }, { reservaAtencao: 5, reservaCritico: 1, protegidosAtencao: 0 }).saude).toBe("atencao");
    expect(saudeDe({ ...base, reservas: 1, emAquecimento: 0 }, { reservaAtencao: 5, reservaCritico: 1, protegidosAtencao: 0 }).saude).toBe("critico");
    expect(LIMITES_PADRAO).toEqual({ reservaAtencao: 2, reservaCritico: 0, protegidosAtencao: 1 });
  });
});

describe("filtros", () => {
  it("combina chaves, atendente, operadora e modelo do celular", () => {
    const numeros = [
      numero({ status: "aquecido", operadora: "Fluke", aparelho: "M1", responsavelId: "ana" }),
      numero({ status: "aquecido", operadora: "Claro", aparelho: "M2", responsavelId: "bia" }),
      numero({ status: "novo", operadora: "Fluke", aparelho: "M1", responsavelId: "ana" }),
    ];
    const cels = [celular({ nome: "M1", modelo: "iPhone 8" }), celular({ nome: "M2", modelo: "Moto" })];
    const px = [proxy({ aparelhoNome: "M1" })];
    expect(filtrarNumeros(numeros, px, cels, { chaves: ["pronto"] })).toHaveLength(2);
    expect(filtrarNumeros(numeros, px, cels, { chaves: ["pronto", "fluke"] })).toHaveLength(1);
    expect(filtrarNumeros(numeros, px, cels, { chaves: ["outras"] })).toHaveLength(1);
    expect(filtrarNumeros(numeros, px, cels, { chaves: ["semProxy"] })).toHaveLength(1);
    expect(filtrarNumeros(numeros, px, cels, { atendente: "ana" })).toHaveLength(2);
    expect(filtrarNumeros(numeros, px, cels, { operadora: "claro" })).toHaveLength(1);
    expect(filtrarNumeros(numeros, px, cels, { modelo: "iphone 8" })).toHaveLength(2);
  });
});

describe("histórico", () => {
  it("compara dois consolidados e só devolve o que mudou", () => {
    const antes = consolidar({ ...vazio, ativos: [numero({ status: "aquecido" })], celulares: [celular()] });
    const agora = consolidar({ ...vazio, ativos: [numero({ status: "aquecido" }), numero({ status: "aquecido" })], celulares: [celular()] });
    const v = variacoes(agora, antes);
    expect(v).toEqual([{ chave: "prontos", rotulo: "Números prontos", antes: 1, agora: 2, delta: 1, bomQuandoSobe: true }]);
    expect(variacoes(agora, null)).toEqual([]);
  });
});

describe("validação", () => {
  it("recusa negativo, fração e lixo", () => {
    expect(inteiroNaoNegativo(3)).toBe(3);
    expect(inteiroNaoNegativo("4")).toBe(4);
    expect(inteiroNaoNegativo(-1)).toBeNull();
    expect(inteiroNaoNegativo(1.5)).toBeNull();
    expect(inteiroNaoNegativo("abc")).toBeNull();
    expect(valorMonetario("1.234,50")).toBe(1234.5);
    expect(valorMonetario(10.999)).toBe(11);
    expect(valorMonetario(-5)).toBeNull();
  });
  it("limites: crítico não pode passar de atenção", () => {
    expect(limitesValidos({})).toEqual(LIMITES_PADRAO);
    expect(limitesValidos({ reservaAtencao: 3, reservaCritico: 1, protegidosAtencao: 2 })).toEqual({ reservaAtencao: 3, reservaCritico: 1, protegidosAtencao: 2 });
    expect(limitesValidos({ reservaAtencao: 1, reservaCritico: 3 })).toBeNull();
    expect(limitesValidos({ reservaAtencao: -1 })).toBeNull();
  });
  it("o dia do snapshot é o de São Paulo", () => {
    expect(hojeSP(new Date("2026-09-01T23:30:00Z"))).toBe("2026-09-01");
    expect(hojeSP(new Date("2026-09-02T02:30:00Z"))).toBe("2026-09-01");
    expect(hojeSP(new Date("2026-09-02T03:30:00Z"))).toBe("2026-09-02");
  });
  it("agrupa ignorando caixa e acento, mostrando o primeiro rótulo", () => {
    expect(agrupar(["Claro", "claro", "Vivo"])).toEqual([{ rotulo: "Claro", qtd: 2 }, { rotulo: "Vivo", qtd: 1 }]);
  });
});

describe("estrutura Meta (contingência de tráfego)", () => {
  it("conta BMs e contas por status, sem aposentadas, e não confunde com chips", () => {
    const bm = (o: Partial<Ativo>): Ativo => numero({ tipo: "bm", aparelho: null, operadora: null, responsavelId: null, responsavelNome: null, ...o });
    const conta = (o: Partial<Ativo>): Ativo => numero({ tipo: "conta", aparelho: null, operadora: null, responsavelId: null, responsavelNome: null, ...o });
    const c = consolidar({ ...vazio, ativos: [
      bm({ status: "em_uso" }), bm({ status: "restrito" }), bm({ status: "aposentado" }),
      conta({ status: "aquecido" }), conta({ status: "em_uso" }), conta({ status: "aquecendo" }), conta({ status: "novo" }), conta({ status: "banido" }),
      numero({ status: "aquecido" }),
    ] });
    expect(c.meta.bms).toEqual({ total: 2, caidas: 1, porStatus: [{ rotulo: "Em uso", qtd: 1 }, { rotulo: "Restrita", qtd: 1 }] });
    expect(c.meta.contas).toMatchObject({ total: 5, prontas: 2, aquecendo: 1, naoAquecidas: 1, caidas: 1 });
    expect(c.meta.contas.porStatus.map((p) => p.rotulo)).toEqual(["Em uso", "Aquecida", "Em aquecimento", "Nova", "Banida"]);
    // o chip não vaza pra Meta, e a BM não vaza pros números
    expect(c.numeros.total).toBe(1);
  });
});
