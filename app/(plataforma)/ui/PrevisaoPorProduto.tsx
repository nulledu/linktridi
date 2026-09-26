"use client";

/**
 * Faturamento e previsão POR PRODUTO — hoje, semana e mês.
 *
 * Dois recortes: a empresa inteira (tráfego, orgânico, comercial,
 * marketplace) e só o tráfego pago. Nasce mostrando só os principais
 * (Carimbos, Chancelas, Sinete); "Ver todos" abre o resto. Produto que sai
 * incluso em outro (almofada, tinta) mostra UNIDADES, e o upsell do comercial
 * aparece rateado no produto que a vendedora aumentou. Mesmo par do kit da previsão total:
 *  - `PainelPorProduto` só desenha (dado pronto; é o que o /dev-micro monta);
 *  - `PrevisaoPorProduto` busca `/api/previsao-faturamento/produtos`.
 *
 * O valor é a soma do preço dos itens (sem frete nem desconto do pedido) —
 * compara produto com produto, não fecha com o faturamento da empresa.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModoProdutos, PrevisaoProdutos, PrevisaoProduto } from "@/lib/previsao-faturamento";
import { fmtNum } from "@/lib/format";
import { fmtBRL2 } from "@/lib/format";
import { Icon } from "../Icon";
import { Abas } from "./Abas";
import { Botao } from "./controles";
import { Fila } from "./micro";
import { usePollComRecuo } from "./usePoll";
import { MonoLegenda, MonoLinha, useSeriesLigadas, type SerieMono } from "./graficos";

const brl = (n: number) => fmtBRL2(n).replace(/,\d{2}$/, "");
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaCurto = (d: string) => `${DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;

type Horizonte = "dia" | "semana" | "mes";
const ROTULO: Record<Horizonte, string> = { dia: "Hoje", semana: "Semana", mes: "Mês" };

const un = (n: number) => `${fmtNum(n)} un`;

function CartaoProduto({ p, h }: { p: PrevisaoProduto; h: Horizonte }) {
  // Incluso (almofada, tinta): o número que importa é quantas saíram, não os
  // centavos simbólicos de preço.
  const f = p.incluso ? p.qtd[h] : p[h];
  const fmt = p.incluso ? un : brl;
  const pct = f.previsto > 0 ? Math.min(100, (f.realizado / f.previsto) * 100) : 0;
  const upsell = p.upsell[h], aumentos = p.aumentos[h];
  return (
    <div className="an-metrica" style={{ borderRadius: 14, boxShadow: "inset 0 0 0 1px var(--mc-anel, var(--border))", padding: "12px 14px" }}>
      <div className="an-metrica-topo">
        <span className="an-metrica-ladrilho"><Icon name={p.icon} size={14} color={p.cor} /></span>
        <span className="an-metrica-rot">{p.nome}</span>
      </div>
      <span className="an-metrica-num">{fmt(f.previsto)}</span>
      <span className="an-metrica-base">previsto · entre {fmt(f.min)} e {fmt(f.max)}</span>
      <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
        aria-label={`${Math.round(pct)}% já realizado`}
        style={{ height: 6, borderRadius: 99, background: "var(--track, var(--border))", overflow: "hidden", marginTop: 6 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: p.cor, borderRadius: 99 }} />
      </div>
      {p.incluso ? (
        <span className="an-metrica-base"><b style={{ color: "var(--text)" }}>{un(f.realizado)}</b> até agora · saem inclusas em outro produto</span>
      ) : (
        <span className="an-metrica-base"><b style={{ color: "var(--text)" }}>{brl(f.realizado)}</b> faturado · {un(p.qtd[h].realizado)}</span>
      )}
      {upsell > 0 && (
        <span className="an-metrica-base" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          <Icon name="trending-up" size={12} color="var(--ok)" />
          {brl(upsell)} de upsell do comercial{aumentos > 0 ? ` · ${fmtNum(aumentos)} aumento(s)` : ""}
        </span>
      )}
    </div>
  );
}

const ROTULO_MODO: Record<ModoProdutos, string> = { geral: "Geral da empresa", trafego: "Só tráfego" };

export function PainelPorProduto({ dados }: { dados: PrevisaoProdutos }) {
  const [modo, setModo] = useState<ModoProdutos>("geral");
  const [h, setH] = useState<Horizonte>("mes");
  const [todos, setTodos] = useState(false);
  const produtos = dados.modos[modo];
  const principais = produtos.filter((p) => p.principal);
  const lista = todos || principais.length === 0 ? produtos : principais;
  const outros = produtos.length - principais.length;
  const nomes = lista.map((p) => p.nome);
  const { desligadas, alternar, ligada } = useSeriesLigadas(nomes);

  // O resumo olha TODOS os produtos do recorte, não só os visíveis: o upsell
  // e os inclusos existem mesmo com a lista fechada nos principais.
  const upsellTotal = produtos.reduce((a, p) => a + p.upsell[h], 0);
  const aumentosTotal = produtos.reduce((a, p) => a + p.aumentos[h], 0);
  const topUpsell = [...produtos].sort((a, b) => b.upsell[h] - a.upsell[h])[0];
  const inclusos = produtos.filter((p) => p.incluso && p.qtd[h].realizado > 0);

  // Uma linha por produto: 14 dias fechados + 7 de previsão, emendados. A cor
  // é a da categoria (a mesma do resto da aba Produtos), fixa por nome. Produto
  // incluso fica fora: a linha dele seria o chão de um gráfico em reais.
  const todas: SerieMono[] = lista.filter((p) => !p.incluso).map((p) => ({
    nome: p.nome, cor: p.cor,
    pontos: [...p.ultimos.map((x) => ({ rotulo: x.d, valor: Math.round(x.v) })), ...p.proximos.map((x) => ({ rotulo: x.d, valor: x.previsto }))],
  }));
  const series = todas.filter((s) => ligada(s.nome));

  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <Abas valor={modo} onMuda={setModo} ariaLabel="Recorte das vendas"
        itens={(["geral", "trafego"] as ModoProdutos[]).map((x) => ({ valor: x, rotulo: ROTULO_MODO[x] }))} />
      <Abas className="ui-abas--sub" valor={h} onMuda={setH} ariaLabel="Horizonte"
        itens={(["dia", "semana", "mes"] as Horizonte[]).map((x) => ({ valor: x, rotulo: ROTULO[x] }))} />

      {(upsellTotal > 0 || inclusos.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 13 }}>
          {upsellTotal > 0 && (
            <span className="an-metrica-base" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="trending-up" size={13} color="var(--ok)" />
              upsell do comercial: <b style={{ color: "var(--text)" }}>{brl(upsellTotal)}</b>
              {topUpsell && topUpsell.upsell[h] > 0 && <> · {Math.round((topUpsell.upsell[h] / upsellTotal) * 100)}% em {topUpsell.nome.toLowerCase()}</>}
              {aumentosTotal > 0 && <> · {fmtNum(aumentosTotal)} aumento(s)</>}
            </span>
          )}
          {inclusos.length > 0 && (
            <span className="an-metrica-base" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="box" size={13} color="var(--text-dim)" />
              saíram inclusas: {inclusos.map((p) => `${fmtNum(p.qtd[h].realizado)} ${p.nome.toLowerCase()}`).join(" · ")}
            </span>
          )}
        </div>
      )}

      <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 210px), 1fr))", gap: 10 }}>
        {lista.map((p) => <CartaoProduto key={p.nome} p={p} h={h} />)}
      </Fila>

      {outros > 0 && (
        <div>
          <Botao tamanho="sm" variante="sutil" icone={todos ? "chevron-up" : "list"} onClick={() => setTodos((t) => !t)} aria-expanded={todos}>
            {todos ? "Só os principais" : `Ver todos os produtos (+${outros})`}
          </Botao>
        </div>
      )}

      <div className="an-metrica-base">Últimos 14 dias faturados e, a partir de amanhã, a previsão de cada produto ({ROTULO_MODO[modo].toLowerCase()}).</div>
      <MonoLinha series={series} altura={190} formatar={brl} rotuloDe={diaCurto} />
      <div className="mono-legenda" role="group" aria-label="Produtos no gráfico">
        <MonoLegenda itens={todas} desligadas={desligadas} aoAlternar={alternar} />
      </div>
    </div>
  );
}

/** Busca e desenha. Só monta quando o slide é aberto (quem não abre não paga). */
export function PrevisaoPorProduto() {
  const [dados, setDados] = useState<PrevisaoProdutos | null>(null);
  const [erro, setErro] = useState(false);
  const ultimo = useRef("");
  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/previsao-faturamento/produtos", { cache: "no-store" });
      if (!r.ok) { setErro(true); return false; }
      const d = (await r.json()) as PrevisaoProdutos;
      const assinatura = d.modos.geral.map((p) => p.dia.realizado).join("|");
      const mudou = assinatura !== ultimo.current;
      ultimo.current = assinatura;
      setDados(d); setErro(false);
      return mudou;
    } catch { setErro(true); return false; }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  usePollComRecuo(carregar, 5 * 60_000, 30 * 60_000);

  if (!dados) {
    return <span className="an-metrica-base">{erro ? "Não deu pra calcular a previsão por produto agora." : "Somando o faturamento de cada produto…"}</span>;
  }
  return <PainelPorProduto dados={dados} />;
}
