"use client";

// Renderiza o DASHBOARD REAL com dados de exemplo. Em vez de recriar a tela num
// mock (que envelhece e passa a mentir), intercepta só o fetch das rotas
// /api/tridimarket/* — o componente é exatamente o que roda em produção.
import { useState } from "react";
import { AjustesClient } from "../(plataforma)/tridimarket/ajustes/AjustesClient";
import { DashboardClient } from "../(plataforma)/tridimarket/DashboardClient";
import { FinanceiroClient } from "../(plataforma)/tridimarket/financeiro/FinanceiroClient";
import { ProdutosClient } from "../(plataforma)/tridimarket/produtos/ProdutosClient";
import { PessoasClient } from "../(plataforma)/tridimarket/pessoas/PessoasClient";
import { SuspeitasClient } from "../(plataforma)/tridimarket/suspeitas/SuspeitasClient";
import { TabletsClient } from "../(plataforma)/tridimarket/tablets/TabletsClient";
import { VendasClient } from "../(plataforma)/tridimarket/vendas/VendasClient";
import { TridiMarketShell } from "../(plataforma)/tridimarket/TridiMarketShell";

const PERFIL_A = "11111111-1111-1111-1111-111111111111";
const PERFIL_B = "22222222-2222-2222-2222-222222222222";
const agoraMenos = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

function serie(dias: number) {
  const pontos = [];
  for (let i = dias - 1; i >= 0; i--) {
    const dia = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const base = 40 + Math.round(70 * Math.abs(Math.sin(i * 1.7)));
    pontos.push({ day: dia, consumed: base, received: i % 4 === 0 ? Math.round(base * 1.6) : Math.round(base * 0.2) });
  }
  return pontos;
}

function faturasDeExemplo(open: number) {
  const hoje = new Date();
  const mes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const passado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const retrasado = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
  const fechada = Math.round(open * 0.66 * 100) / 100;
  const antiga = open > 100 ? Math.round(open * 0.1 * 100) / 100 : 0;
  return [
    ...(antiga > 0 ? [{ mes: mes(retrasado), valor: antiga, aberta: false }] : []),
    { mes: mes(passado), valor: Math.round((fechada - antiga) * 100) / 100, aberta: false },
    { mes: mes(hoje), valor: Math.round((open - fechada) * 100) / 100, aberta: true },
  ];
}

// Parte da dívida que é do mês aberto (o resto é fatura fechada).
const abertoDe = (open: number) => faturasDeExemplo(open).find((f) => f.aberta)?.valor ?? 0;

// Pessoas UNIFICADAS (o que a API devolve agora). "Pedro" tem cadastro em três
// empresas, como no banco real — serve para ver o selo "3 cadastros somados".
function pessoa(nome: string, contas: Array<{ id: number; profileId: string; open: number; overdue?: number }>, extras: Partial<{ spent: number; status: string }> = {}) {
  const open = contas.reduce((s, c) => s + c.open, 0);
  const overdue = contas.reduce((s, c) => s + (c.overdue ?? 0), 0);
  const limite = contas.length * 500;
  return {
    key: `codigo:${nome.slice(0, 4)}`, name: nome, imageUrl: null, active: true,
    unified: contas.length > 1,
    accounts: contas.map((c) => ({
      id: c.id, profileId: c.profileId, companyId: 4, name: nome, imageUrl: null, active: true,
      normalLimit: 500, overdraftLimit: 0, open: c.open, overdue: c.overdue ?? 0,
      cycleOpen: abertoDe(c.open), previousOpen: Math.round((c.open - abertoDe(c.open)) * 100) / 100,
      currentMonth: abertoDe(c.open), closedUntil: Math.round((c.open - abertoDe(c.open)) * 100) / 100,
      available: Math.max(0, 500 - c.open), status: (c.overdue ?? 0) > 0 ? "overdue" : "good", lastPaymentAt: null,
      // Fatura por mês (pro "Receber" dar baixa mês a mês): dois terços no mês
      // passado, o resto no aberto — como quem paga em setembro a de agosto.
      faturas: faturasDeExemplo(c.open),
    })),
    open: Math.round(open * 100) / 100, overdue, normalLimit: limite, overdraftLimit: 0,
    cycleOpen: Math.round(contas.reduce((s, c) => s + abertoDe(c.open), 0) * 100) / 100,
    previousOpen: Math.round(contas.reduce((s, c) => s + c.open - abertoDe(c.open), 0) * 100) / 100,
    currentMonth: Math.round(contas.reduce((s, c) => s + abertoDe(c.open), 0) * 100) / 100,
    closedUntil: Math.round(contas.reduce((s, c) => s + c.open - abertoDe(c.open), 0) * 100) / 100,
    available: Math.max(0, limite - open), spent: extras.spent ?? 0,
    status: extras.status ?? (overdue > 0 ? "overdue" : open > limite * 0.8 ? "near_limit" : "good"),
    // Score de exemplo: quem tem vencido cai; quem não deve nada, alto.
    score: overdue > 0 ? 15 : open === 0 ? 80 : 45,
    scoreManual: false,
    scoreEmployeeId: contas[0]?.id ?? 0,
  };
}

const PESSOAS_UNIDAS = [
  pessoa("Pedro Guilherme Martins", [
    { id: 30, profileId: PERFIL_A, open: 210.4 },
    { id: 124, profileId: PERFIL_B, open: 96.2 },
    { id: 126, profileId: PERFIL_A, open: 41 },
  ], { spent: 88.3 }),
  pessoa("Beatriz Loureiro", [{ id: 3, profileId: PERFIL_B, open: 612.3, overdue: 190.5 }], { spent: 61.2 }),
  pessoa("Gustavo Paulino", [{ id: 2, profileId: PERFIL_A, open: 428.9 }], { spent: 44 }),
  pessoa("Douglas", [
    { id: 106, profileId: PERFIL_A, open: 150 },
    { id: 120, profileId: PERFIL_B, open: 62.5 },
  ], { spent: 39.7 }),
  pessoa("Samuel Jr.", [{ id: 1, profileId: PERFIL_A, open: 137.4 }], { spent: 30.1 }),
  pessoa("Vitoria Tostes", [{ id: 4, profileId: PERFIL_A, open: 88.2 }], { spent: 12.5 }),
];

const PESSOAS = [
  { id: 1, profileId: PERFIL_A, companyId: 4, name: "Samuel Jr.", imageUrl: null, active: true, normalLimit: 500, overdraftLimit: 0, open: 137.4, overdue: 0, available: 362.6, status: "good" as const, lastPaymentAt: null },
  { id: 2, profileId: PERFIL_A, companyId: 4, name: "Gustavo Paulino", imageUrl: null, active: true, normalLimit: 500, overdraftLimit: 0, open: 428.9, overdue: 0, available: 71.1, status: "near_limit" as const, lastPaymentAt: null },
  { id: 3, profileId: PERFIL_B, companyId: 5, name: "Beatriz Loureiro", imageUrl: null, active: true, normalLimit: 500, overdraftLimit: 0, open: 612.3, overdue: 190.5, available: 0, status: "overdue" as const, lastPaymentAt: null },
  { id: 4, profileId: PERFIL_A, companyId: 4, name: "Vitoria Tostes", imageUrl: null, active: true, normalLimit: 500, overdraftLimit: 0, open: 88.2, overdue: 0, available: 411.8, status: "good" as const, lastPaymentAt: null },
  { id: 5, profileId: PERFIL_B, companyId: 5, name: "Luiz Fernando Santos", imageUrl: null, active: true, normalLimit: 500, overdraftLimit: 0, open: 301, overdue: 44, available: 199, status: "overdue" as const, lastPaymentAt: null },
];

function overview(dias: number) {
  const escala = dias / 30;
  return {
    consumed: Math.round(3187.4 * escala * 100) / 100,
    received: Math.round(2410 * escala * 100) / 100,
    open: 1567.8, overdue: 234.5,
    delinquentEmployees: 2, criticalStock: 11,
    pendingSync: 3, offlineDevices: 1,
    series: serie(Math.min(dias, 30)),
    employeeAttention: PESSOAS_UNIDAS.slice(0, 5),
    people: PESSOAS_UNIDAS,
    stockAttention: [
      { id: 91, companyId: 4, barcode: null, name: "Bananinha tradicional", price: 2.5, imageUrl: null, categoryId: 3, categoryName: "Doce", active: true, stock: 0, minimumStock: 5, allowStockOverride: true },
      { id: 92, companyId: 4, barcode: null, name: "Bis 16 unidades original", price: 8.99, imageUrl: null, categoryId: 3, categoryName: "Doce", active: true, stock: 0, minimumStock: 4, allowStockOverride: true },
      { id: 93, companyId: 4, barcode: null, name: "Coca-Cola Lata 350ml", price: 5.29, imageUrl: null, categoryId: 1, categoryName: "Bebida", active: true, stock: 2, minimumStock: 6, allowStockOverride: true },
      { id: 94, companyId: 4, barcode: null, name: "Pringles queijo 109g", price: 12.99, imageUrl: null, categoryId: 2, categoryName: "Salgado", active: true, stock: 3, minimumStock: 5, allowStockOverride: true },
    ],
    units: [
      { profileId: PERFIL_A, name: "Tridi Escritório", open: 954.5, overdue: 0, employees: 57, criticalStock: 7, products: 329 },
      { profileId: PERFIL_B, name: "Tridi Produção", open: 613.3, overdue: 234.5, employees: 12, criticalStock: 4, products: 128 },
    ],
    ticket: 12.16, purchases: Math.round(262 * escala), activeEmployees: 34,
    itemsSold: Math.round(419 * escala),
    categories: [
      { name: "Doce", items: 157, revenue: 612.4, share: 0.563 },
      { name: "Bebida", items: 75, revenue: 398.2, share: 0.269 },
      { name: "Salgado", items: 41, revenue: 254.9, share: 0.147 },
      { name: "Congelado", items: 3, revenue: 41.7, share: 0.011 },
      { name: "Sem categoria", items: 3, revenue: 12.3, share: 0.01 },
    ],
    topProducts: [
      { id: 1, name: "Energético Monster", imageUrl: null, units: 6, revenue: 35.97 },
      { id: 2, name: "Coca-Cola Lata 350ml", imageUrl: null, units: 6, revenue: 31.74 },
      { id: 3, name: "Lanche Natural", imageUrl: null, units: 3, revenue: 26.97 },
      { id: 4, name: "Pringles queijo 109g", imageUrl: null, units: 1, revenue: 12.99 },
      { id: 5, name: "Monster Zero Ultra White", imageUrl: null, units: 1, revenue: 11.99 },
    ],
    topSpenders: PESSOAS_UNIDAS.slice(0, 4),
    recentPurchases: [
      { id: 5001, at: agoraMenos(4), employeeId: 1, employeeName: "Samuel Jr.", employeeImage: null, unitName: "Tridi Escritório", total: 12.48, items: 3, paid: false },
      { id: 5000, at: agoraMenos(37), employeeId: 4, employeeName: "Vitoria Tostes", employeeImage: null, unitName: "Tridi Escritório", total: 5.29, items: 1, paid: false },
      { id: 4999, at: agoraMenos(96), employeeId: 3, employeeName: "Beatriz Loureiro", employeeImage: null, unitName: "Tridi Produção", total: 21.9, items: 5, paid: true },
      { id: 4998, at: agoraMenos(180), employeeId: 2, employeeName: "Gustavo Paulino", employeeImage: null, unitName: "Tridi Escritório", total: 8.5, items: 2, paid: false },
      { id: 4997, at: agoraMenos(400), employeeId: 5, employeeName: "Luiz Fernando Santos", employeeImage: null, unitName: "Tridi Produção", total: 17.48, items: 4, paid: false },
    ],
    devices: [
      { id: "d1", name: "Mesa Carimbos", unitName: "Tridi Escritório", active: true, lastSeenAt: agoraMenos(3), minutesSinceSeen: 3, pendingOperations: 0, online: true },
      { id: "d2", name: "Mesa Produção", unitName: "Tridi Produção", active: true, lastSeenAt: agoraMenos(312), minutesSinceSeen: 312, pendingOperations: 3, online: false },
      { id: "d3", name: "Totem Galeria", unitName: "Galeria Tridi/Zeelux", active: false, lastSeenAt: agoraMenos(9000), minutesSinceSeen: 9000, pendingOperations: 0, online: false },
    ],
    periodDays: dias,
    periodStart: new Date(Date.now() - dias * 86_400_000).toISOString(),
    periodEnd: new Date().toISOString(),
    schemaReady: true,
  };
}

const item = (productId: number, name: string, quantity: number, total: number) => ({
  productId, name, imageUrl: null, quantity, total,
  unitPrice: Math.round((total / quantity) * 100) / 100,
  rowIds: Array.from({ length: quantity }, (_, i) => productId * 100 + i),
});
const VENDAS = [
  {
    id: 5001, at: agoraMenos(4), paid: false, employeeId: 2, employeeName: "Gustavo Paulino", employeeImage: null,
    unitName: "Tridi Escritório", total: 12.48,
    items: [item(11, "Coca-Cola Lata 350ml", 2, 10.58), item(12, "Bala Halls", 1, 1.9)],
  },
  {
    id: 5000, at: agoraMenos(96), paid: true, employeeId: 2, employeeName: "Gustavo Paulino", employeeImage: null,
    unitName: "Tridi Escritório", total: 21.9,
    items: [item(13, "Lanche Natural", 2, 17.94), item(14, "Água Mineral 500ml", 2, 3.96)],
  },
  {
    id: 4999, at: agoraMenos(400), paid: false, employeeId: 2, employeeName: "Gustavo Paulino", employeeImage: null,
    unitName: "Tridi Escritório", total: 8.5,
    items: [item(15, "Pringles queijo 109g", 1, 8.5)],
  },
];

const SUSPEITAS = [
  { id: 1949, at: agoraMenos(30), employeeId: 2, employeeName: "Gustavo Paulino", employeeImage: null, unitName: "Tridi Escritório", kind: "SEM_BIPAR", raw: "SEM_BIPAR" },
  { id: 1948, at: agoraMenos(190), employeeId: 3, employeeName: "Beatriz Loureiro", employeeImage: null, unitName: "Tridi Produção", kind: "BIPAR_E_REMOVER", raw: "BIPAR_E_REMOVER" },
  { id: 1947, at: agoraMenos(300), employeeId: null, employeeName: null, employeeImage: null, unitName: "Tridi Escritório", kind: "market_codigo_ambiguo", raw: "market_codigo_ambiguo:abc" },
  { id: 1946, at: agoraMenos(900), employeeId: 2, employeeName: "Gustavo Paulino", employeeImage: null, unitName: "Tridi Escritório", kind: "SEM_BIPAR", raw: "SEM_BIPAR" },
  { id: 1945, at: agoraMenos(2600), employeeId: 2, employeeName: "Gustavo Paulino", employeeImage: null, unitName: "Tridi Escritório", kind: "SEM_BIPAR", raw: "SEM_BIPAR" },
];

// Catálogo do preview. Três produtos à mão bastam pra conferir layout, mas
// não pra sentir peso: o mercadinho de verdade passa de 500 itens, e é aí que
// trocar de categoria começa a travar. `?produtos=600` gera um catálogo desse
// tamanho pra medir o custo do render com número real.
const CATEGORIAS_TESTE = ["Bebidas", "Doces", "Salgados", "Congelados", "Mercearia"];
function catalogoDeTeste() {
  const base = [
    { id: 1, companyId: 4, barcode: "7894900011517", name: "Coca-Cola Lata 350ml", price: 5.29, imageUrl: null, categoryId: 1, categoryName: "Bebida", active: true, stock: 2, minimumStock: 6, allowStockOverride: true },
    { id: 2, companyId: 4, barcode: null, name: "Bananinha tradicional", price: 2.5, imageUrl: null, categoryId: 3, categoryName: "Doce", active: true, stock: 0, minimumStock: 5, allowStockOverride: true },
    { id: 3, companyId: 4, barcode: "7891000100103", name: "Leite Ninho 400g", price: 18.9, imageUrl: null, categoryId: 4, categoryName: "Mercearia", active: true, stock: 4, minimumStock: 3, allowStockOverride: true },
  ];
  const quantos = typeof window === "undefined" ? 0 : Number(new URL(location.href).searchParams.get("produtos") ?? 0);
  if (!quantos) return base;
  return Array.from({ length: quantos }, (_, i) => ({
    id: 100 + i,
    companyId: 4,
    barcode: String(7890000000000 + i),
    name: `Produto de teste ${String(i + 1).padStart(3, "0")}`,
    price: 1.5 + (i % 40),
    imageUrl: null,
    categoryId: (i % CATEGORIAS_TESTE.length) + 1,
    categoryName: CATEGORIAS_TESTE[i % CATEGORIAS_TESTE.length],
    active: i % 23 !== 0,
    stock: i % 17,
    minimumStock: 5,
    allowStockOverride: true,
    semCodigo: false,
    ocultoBusca: false,
    unidades: [PERFIL_A],
  }));
}

let instalado = false;
function interceptar() {
  if (instalado || typeof window === "undefined") return;
  instalado = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/api/tridimarket/")) return original(input as RequestInfo, init);
    const responder = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { headers: { "Content-Type": "application/json" } });
    if (url.includes("/scores")) {
      // POST de score: devolve o que foi mandado (número = nota; null = auto).
      const corpo = init?.body ? JSON.parse(String(init.body)) : {};
      const manual = corpo.score != null;
      return responder({ score: manual ? corpo.score : 0, manual });
    }
    if (url.includes("/settings")) {
      return responder({
        profiles: [{ id: PERFIL_A, name: "Tridi Escritório", active: true, description: null }, { id: PERFIL_B, name: "Tridi Produção", active: true, description: null }],
        schemaReady: true, offlineHours: 720, pinAttempts: 8,
        settings: { chequeEspecial: true, limiteExtra: 150, limitePadrao: 500, bloquearInadimplente: false, diasInadimplencia: 30 },
      });
    }
    if (url.includes("/overview")) {
      const dias = Number(new URL(url, location.origin).searchParams.get("days") ?? 30);
      return responder(overview(dias));
    }
    if (url.includes("/products") || url.includes("/inventory")) {
      return responder(catalogoDeTeste());
    }
    if (url.includes("/employees")) return responder(url.includes("porCadastro=1") ? PESSOAS : PESSOAS_UNIDAS);
    if (url.includes("/vendas")) {
      const met = (init?.method || "GET").toUpperCase();
      if (url.includes("/vendas/edit") || met === "DELETE" || met === "PATCH") return responder({}); // ações: ok no preview
      if (met === "POST") return responder({ id: 9999 }); // venda manual
      const emp = new URL(url, location.origin).searchParams.getAll("employeeId").map(Number);
      const lista = emp.length ? VENDAS.filter((v) => emp.includes(v.employeeId)) : VENDAS;
      return responder({ vendas: lista, periodDays: 30 });
    }
    if (url.includes("/suspeitas")) {
      return responder({
        eventos: SUSPEITAS, periodDays: 30,
        resumo: [{ kind: "SEM_BIPAR", total: 3 }, { kind: "BIPAR_E_REMOVER", total: 1 }, { kind: "market_codigo_ambiguo", total: 1 }],
        reincidentes: [
          { name: "Gustavo Paulino", image: null, total: 3 },
          { name: "Beatriz Loureiro", image: null, total: 1 },
        ],
      });
    }
    return responder([]);
  };
}

export function DevTridiMarketClient({ tela }: { tela: string }) {
  // Instala o interceptador durante a RENDER, antes de qualquer efeito do
  // dashboard disparar o primeiro fetch.
  useState(() => { interceptar(); return null; });
  return (
    <TridiMarketShell name="Preview" role="admin" photoUrl={null}>
      {tela === "pessoas" ? <PessoasClient />
        : tela === "financeiro" ? <FinanceiroClient />
        : tela === "vendas" ? <VendasClient />
        : tela === "suspeitas" ? <SuspeitasClient />
        : tela === "ajustes" ? <AjustesClient />
        : tela === "tablets" ? <TabletsClient />
        // `?tela=estoque` continua valendo e cai na mesma tela: estoque virou
        // ação dentro de Produtos, mas o endereço do preview está em nota de
        // teste antiga e não custa nada aceitar os dois.
        : tela === "estoque" || tela === "produtos" ? <ProdutosClient />
        : <DashboardClient />}
    </TridiMarketShell>
  );
}
