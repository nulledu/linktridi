"use client";

import { useEffect, useState } from "react";
import { DEFAULT_CONFIG, type SalesSnapshot } from "@/lib/types";
import { EditorLayout } from "../(plataforma)/painel-tv/EditorLayout";
import { BarraPerfis } from "../(plataforma)/painel-tv/BarraPerfis";
import { usePerfis } from "../(plataforma)/painel-tv/usePerfis";

/** Dados de exemplo — nomes longos de propósito, que é onde o layout quebra. */
const VENDEDORES = [
  ["Ana Paula Ribeiro", 42000, 118000, 310000],
  ["Bruno Tavares", 38500, 104000, 268000],
  ["Carla Mendes", 31000, 91000, 240000],
  ["Diego Souza", 22000, 70000, 190000],
  ["Elisa Nunes", 19500, 62000, 171000],
  ["Fábio Lima", 15000, 51000, 140000],
  ["Gisele Alves", 12000, 43000, 118000],
] as const;

const SALES: SalesSnapshot = {
  updatedAt: new Date(2026, 7, 5, 16, 42).toISOString(),
  salespeople: VENDEDORES.map(([name, d, w, m], i) => ({
    id: `v${i}`,
    name: name as string,
    photoUrl: null,
    team: i % 2 ? "marketing" : "comercial",
    sales: { daily: d as number, weekly: w as number, monthly: m as number },
    goal: { daily: 0, weekly: 0, monthly: 0 },
    orders: { daily: 12, weekly: 34, monthly: 96 },
  })),
  teams: [
    { id: "marketing", name: "Marketing", current: 742000, goal: 900000, progressPct: 82 },
    { id: "comercial", name: "Comercial", current: 865000, goal: 900000, progressPct: 96 },
  ],
  revenue: { daily: 196000, weekly: 598000, monthly: 1607000, trendPct: 8.4 },
  topProducts: [
    { id: "p1", name: "Kit Essencial 500ml", imageUrl: null, qty: 1840, revenue: 412000 },
    { id: "p2", name: "Refil Concentrado", imageUrl: null, qty: 1520, revenue: 318000 },
    { id: "p3", name: "Combo Família", imageUrl: null, qty: 980, revenue: 265000 },
    { id: "p4", name: "Dispenser Automático", imageUrl: null, qty: 610, revenue: 190000 },
    { id: "p5", name: "Kit Viagem", imageUrl: null, qty: 430, revenue: 96000 },
  ],
  metrics: {
    totalSales: { revenue: 1607000, count: 5240 },
    yampi: {
      paid: { revenue: 690000, count: 2310 },
      organic: { revenue: 402000, count: 1490 },
      total: { revenue: 1092000, count: 3800 },
      ticketMedio: 287,
    },
    comercial: { revenue: 515000, count: 1440 },
    projection: 2180000,
    trafficSpend: 148000,
    trafficSpendReal: 152000,
    paidTrendPct: 12.3,
    trafficSeries: [],
    revenueSeries: [],
  },
};

export function ProvaEditor() {
  // Os PERFIS aqui também: a tela de configuração fica atrás de login, e sem
  // este banco de provas a barra de perfis só poderia ser conferida digitando
  // senha — que é justamente o que não se faz.
  // O MESMO hook da tela de configuração: é o que permite conferir desfazer e
  // troca de perfil aqui, sem senha, e garante que o que eu testo é o que roda.
  const { perfis, perfil, setPerfilAtual, setPerfis, layout, setLayout, desfazer, temDesfazer } =
    usePerfis();
  // Dados REAIS quando a API responde (`/api/sales` é pública), exemplo quando
  // não. Testar layout com número inventado esconde o defeito que importa — foi
  // com o dado real que apareceu o produto de receita zerada.
  const [sales, setSales] = useState<SalesSnapshot>(SALES);
  // A config real junto: com a meta de exemplo (R$ 2 mi) sobre faturamento real,
  // o semáforo dizia 2% e parecia defeito. Dado real pede parâmetro real.
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG, monthlyRevenueGoal: 2_000_000 });
  useEffect(() => {
    // `vivo` porque em desenvolvimento o React monta, DESMONTA e remonta o
    // componente de propósito, para expor efeito sem limpeza. A resposta do
    // primeiro par de buscas chegava para uma instância que já tinha morrido, e
    // o `setState` virava aviso no console.
    //
    // O aviso em si é inofensivo aqui (isto é banco de provas), mas console
    // sujo é o que ESCONDE o defeito de verdade — foi lendo este mesmo console
    // que apareceu a hidratação quebrada da Tridify.
    let vivo = true;
    fetch("/api/sales", { cache: "no-store" })
      .then((r) => r.json())
      .then((s) => { if (vivo && s && !s.error && s.topProducts) setSales(s); })
      .catch(() => { /* segue com o exemplo */ });
    fetch("/api/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((c) => { if (vivo && c && !c.error && c.theme) setConfig({ ...DEFAULT_CONFIG, ...c }); })
      .catch(() => { /* segue com o exemplo */ });
    return () => { vivo = false; };
  }, []);
  return (
    // 1320 é a largura da tela de verdade (/administracao). Com 1100 o banco de
    // provas mentia: o inspetor do bloco cabia aqui e não cabia lá.
    <main style={{ padding: 20, maxWidth: 1320, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Editor do painel — banco de provas</h1>
        <button
          type="button"
          onClick={desfazer}
          disabled={!temDesfazer}
          style={{ minHeight: 44, padding: "0 14px", borderRadius: 10, fontWeight: 700, cursor: temDesfazer ? "pointer" : "not-allowed", opacity: temDesfazer ? 1 : 0.45 }}
        >
          Desfazer (Ctrl+Z)
        </button>
      </div>
      <BarraPerfis perfis={perfis} atual={perfil.id} onTrocar={setPerfilAtual} onChange={setPerfis} />
      <EditorLayout
        layout={layout}
        onChange={setLayout}
        sales={sales}
        config={config}
        formato={perfil.paraTela}
        polegadas={perfil.polegadas}
        numeroCurto={perfil.numeroCurto}
      />
      <details style={{ marginTop: 20, fontSize: 12 }}>
        <summary style={{ cursor: "pointer" }}>layout em JSON (o que é salvo)</summary>
        <pre style={{ overflow: "auto", fontSize: 11 }}>{JSON.stringify(layout, null, 2)}</pre>
      </details>
    </main>
  );
}
