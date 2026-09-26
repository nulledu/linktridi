"use client";

// Banco de provas da aba Comercial › Marketplaces, SEM login e SEM ERP.
//
// A aba mora atrás de sessão e puxa o ERP legado, então não dava pra olhar o
// visual dela sem entrar no sistema — e credencial não se digita aqui. Esta
// página monta o COMPONENTE DE VERDADE com o `fetch` interceptado, servindo
// uma resposta de exemplo no formato exato da rota.
//
// Os números são os de agosto/2026 medidos contra o painel do próprio Mercado
// Livre (R$ 1.074 · 23 vendas): fixture de mentira esconde defeito de layout
// que só aparece com nome de produto comprido e valor de quatro dígitos.

import { useEffect, useRef, useState } from "react";
import { MarketplacesPanel } from "../(plataforma)/comercial/MarketplacesPanel";

const PRODUTOS_ML = [
  { nome: "Kit Carimbo Marcador Para Coxinhas E Salgados 6 Letras Marrom", qtd: 9, valor: 359.10 },
  { nome: "Suporte Porta Medalhas Preto 20x30cm, Vitórias, Conquistas Preto", qtd: 6, valor: 239.40 },
  { nome: "Carimbo Personalizado Autoentintado 38x14mm", qtd: 5, valor: 199.50 },
  { nome: "Placa Decorativa Em Acrílico Espelhado", qtd: 2, valor: 151.60 },
  { nome: "Chaveiro Acrílico Personalizado", qtd: 1, valor: 39.90 },
];
const PRODUTOS_TT = [
  { nome: "Mini Carimbo Autoentintado 14mm", qtd: 7, valor: 139.30 },
  { nome: "Etiqueta Térmica Adesiva 100 Unidades", qtd: 5, valor: 149.50 },
  { nome: "Tinta Para Carimbo 40ml Preta", qtd: 4, valor: 100.42 },
];

const CONTAS = [
  {
    chave: "plat:9", id: 9, label: "Mercado Livre", valor: 1073.30, pedidos: 23,
    ticket: 46.67, share: 0.734, bonus: 10.73, produtos: PRODUTOS_ML,
  },
  {
    chave: "plat:10", id: 10, label: "TikTok", valor: 389.22, pedidos: 16,
    ticket: 24.33, share: 0.266, bonus: 3.89, produtos: PRODUTOS_TT,
  },
];

const PESSOAS = [
  "Acesso de desenvolvimento (conta de teste)", "Ana Julia", "Beatriz Loureiro", "Bruno",
  "Caio", "Davi", "Douglas Franco", "Emanuelly", "Felipe", "Gabriel Suzuki",
  "Gustavo Paulino", "Heloísa Campos", "Isabela Reis", "João Vitor", "Larissa Nunes",
  "Letícia Valentim", "Marcos Aurélio", "Nathalia Prado", "Otávio Bastos", "Rafaela Lima",
].map((nome, i) => ({ id: `p${i}`, nome }));

const RESPOSTA = {
  periodo: { label: "agosto", from: "2026-08-01", to: "2026-08-31" },
  total: 1462.52, pedidosN: 39,
  fontes: CONTAS.map((c) => ({ chave: c.chave, label: c.label, valor: c.valor, pedidos: c.pedidos })),
  contas: CONTAS,
  produtos: { geral: [...PRODUTOS_ML, ...PRODUTOS_TT].sort((a, b) => b.qtd - a.qtd), parcial: false, pedidosLidos: 39 },
  plataformas: [{ id: 3, nome: "Shopee" }, { id: 9, nome: "Mercado Livre" }, { id: 10, nome: "TikTok" }],
  pedidos: Array.from({ length: 12 }, (_, i) => ({
    ref: String(2000018225917596 + i),
    id_proprio: String(2000018225917596 + i),
    plataforma_id: i % 3 === 0 ? 10 : 9,
    plataforma: i % 3 === 0 ? "TikTok" : "Mercado Livre",
    data: `2026-08-${String(2 + i * 2).padStart(2, "0")}T13:00:00+00:00`,
    valor: [39.90, 79.80, 119.70, 19.90, 29.90, 75.80][i % 6],
    frete: [6.99, 17.99, 0, 1.80, 9.48, 0][i % 6],
    status: i % 4 === 0 ? "Em aberto" : "Enviado",
    aprovado: i % 4 !== 0, enviado: i % 4 !== 0,
  })),
  acordo: { pessoaId: "p4", pct: 1, ativa: true, pessoaNome: "Caio" },
  comissao: 14.63, bonus: 14.63,
  podeBonus: true,
  pessoas: PESSOAS,
};

/** "Outro período": cada produto e conta escalados por um fator que depende
 *  só da rodada (sem `Math.random`, a prova é reproduzível), e o ranking de
 *  produtos reordenado pela quantidade nova. */
function outraRodada(rodada: number): typeof RESPOSTA {
  const fator = (i: number) => 0.4 + (((i + 1) * 7919 * rodada) % 97) / 60;
  const escala = <T extends { qtd: number; valor: number }>(l: T[], d: number) =>
    l.map((p, i) => { const k = fator(i + d); return { ...p, qtd: Math.max(1, Math.round(p.qtd * k)), valor: Math.round(p.valor * k * 100) / 100 }; })
      .sort((a, b) => b.qtd - a.qtd);
  const contas = CONTAS.map((c, i) => {
    const k = fator(i + 20);
    return { ...c, valor: Math.round(c.valor * k * 100) / 100, pedidos: Math.max(1, Math.round(c.pedidos * k)), produtos: escala(c.produtos, i * 5) };
  });
  const total = Math.round(contas.reduce((s, c) => s + c.valor, 0) * 100) / 100;
  const contasComFatia = contas.map((c) => ({ ...c, share: total > 0 ? c.valor / total : 0, ticket: Math.round((c.valor / c.pedidos) * 100) / 100, bonus: Math.round(c.valor) / 100 }));
  return {
    ...RESPOSTA,
    total,
    pedidosN: contas.reduce((s, c) => s + c.pedidos, 0),
    contas: contasComFatia,
    fontes: contasComFatia.map((c) => ({ chave: c.chave, label: c.label, valor: c.valor, pedidos: c.pedidos })),
    produtos: { ...RESPOSTA.produtos, geral: escala([...PRODUTOS_ML, ...PRODUTOS_TT], 40) },
    bonus: Math.round(total) / 100,
    comissao: Math.round(total) / 100,
  };
}

export function MarketplacesProvaClient() {
  const [eco, setEco] = useState<string[]>([]);
  const [pronto, setPronto] = useState(false);
  const [semAcordo, setSemAcordo] = useState(false);
  const [semBonus, setSemBonus] = useState(false);
  const [vazio, setVazio] = useState(false);

  // O estado vive num ref, e o `fetch` é trocado UMA vez (deps vazias).
  //
  // Com `[semAcordo, semBonus, vazio]` nas deps o React desfazia a troca antes
  // de refazê-la, e nessa fresta o painel remontado (key nova) disparava a
  // busca contra a rota DE VERDADE: seis 401 no console e a prova nascendo com
  // erro. Efeito de filho roda antes do efeito do pai — a limpeza do pai vem
  // primeiro, a busca do filho no meio, a instalação do pai por último.
  const estado = useRef({ semAcordo, semBonus, vazio });
  estado.current = { semAcordo, semBonus, vazio };

  useEffect(() => {
    const original = window.fetch;
    // Cada busca depois da primeira é "outro período": demora um pouco (pra
    // o esmaecido do stale-while-revalidate aparecer) e volta com os números
    // escalados e o ranking REORDENADO — é o que exercita a contagem do
    // número antigo pro novo, a barra que anda e o FLIP das linhas.
    let buscas = 0;
    window.fetch = async (entrada, init) => {
      const url = String(typeof entrada === "string" ? entrada : (entrada as Request).url ?? entrada);
      if (url.includes("/api/comercial/marketplaces")) {
        if (init?.method === "PUT") {
          setEco((e) => [`PUT ${JSON.stringify(JSON.parse(String(init.body)))}`, ...e].slice(0, 6));
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
        }
        const rodada = buscas++;
        if (rodada > 0) await new Promise((ok) => setTimeout(ok, 700));
        const base = rodada > 0 ? outraRodada(rodada) : RESPOSTA;
        const { semAcordo: sa, semBonus: sb, vazio: sv } = estado.current;
        const corpo = sv
          ? { ...base, total: 0, pedidosN: 0, contas: [], fontes: [], pedidos: [], produtos: { geral: [], parcial: false, pedidosLidos: 0 } }
          : sb
            ? { ...base, podeBonus: false, acordo: null, bonus: null, comissao: null, pessoas: [], contas: base.contas.map((c) => ({ ...c, bonus: null })) }
            : sa
              ? { ...base, acordo: { pessoaId: null, pct: 0, ativa: false, pessoaNome: null }, bonus: null, comissao: null, contas: base.contas.map((c) => ({ ...c, bonus: null })) }
              : base;
        return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
      }
      return original(entrada, init);
    };
    setPronto(true);
    return () => { window.fetch = original; };
  }, []);

  // A aba só monta depois que o `fetch` está trocado — senão a primeira busca
  // escapa pro servidor de verdade e volta 403, e a prova nasce com erro.
  if (!pronto) return null;

  const chave = `${semAcordo}-${semBonus}-${vazio}`;
  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Prova · Comercial › Marketplaces</h1>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
        O componente de verdade, com a rota interceptada. Números de agosto/2026. Troque o período no seletor do
        painel: a resposta demora 0,7 s e volta com outros números e outro ranking — é onde se vê o esmaecido,
        a contagem, as barras andando e as linhas trocando de lugar.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <Chave ligada={semAcordo} onClick={() => { setSemAcordo((v) => !v); setSemBonus(false); setVazio(false); }}>sem acordo</Chave>
        <Chave ligada={semBonus} onClick={() => { setSemBonus((v) => !v); setSemAcordo(false); setVazio(false); }}>sem a chave do bônus</Chave>
        <Chave ligada={vazio} onClick={() => { setVazio((v) => !v); setSemAcordo(false); setSemBonus(false); }}>período sem venda</Chave>
      </div>

      {eco.length > 0 && (
        <pre style={{ fontSize: 12, background: "var(--surface)", padding: 10, borderRadius: 8, marginBottom: 16, overflowX: "auto" }}>
          {eco.join("\n")}
        </pre>
      )}

      <div className="glass" style={{ padding: 18, borderRadius: "var(--r-md)" }}>
        <MarketplacesPanel key={chave} />
      </div>
    </div>
  );
}

function Chave({ ligada, onClick, children }: { ligada: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={ligada} className="km-chip"
      style={{
        minHeight: "var(--tap)", padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
        border: `1px solid ${ligada ? "transparent" : "var(--border)"}`,
        background: ligada ? "var(--text)" : "var(--surface)",
        color: ligada ? "var(--bg)" : "var(--text-dim)",
      }}
    >
      {children}
    </button>
  );
}
