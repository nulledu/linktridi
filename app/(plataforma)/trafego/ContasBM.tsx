"use client";

// ── Widget "BMs e contas de anúncios" ───────────────────────────────────────
// Onde o dinheiro entra e sai POR BM e por conta: gasto (com o imposto de
// importação, que é o custo real), vendas atribuídas, faturamento, lucro e
// ROAS. É a pergunta que a tabela de campanhas não responde — ela mostra
// campanha, e quem paga a fatura é a conta; quem responde pelo resultado é a BM.
//
// De onde vem cada número:
//   · gasto/vendas/faturamento → warehouse (meta_ad_insights_daily), somando
//     TODAS as linhas do período (a lista de campanhas do painel corta em 300,
//     então somar no cliente daria menos que o KPI de gasto);
//   · BM de cada conta → Graph, cache de 30 min (não existe coluna de BM aqui).
//
// A venda aqui é a que o META ATRIBUI à conta (pixel), não o pedido do ERP: o
// pedido carrega tag_utm (canal), nunca a conta de anúncios, então não há como
// repartir o faturamento real por conta. O rodapé do widget diz isso — número
// sem base declarada é o que fez dois painéis discordarem no mesmo mês.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { IMPOSTO_GASTO_PCT, agregarConta } from "@/lib/marketing-const";
import { Icon } from "../Icon";
import "./resumo-bm.css";
import { CardSkeleton, Vazio } from "./TfKit";
import { Fila, useOnda } from "../ui/micro";

interface ContaLinha {
  id: string; nome: string; bmId: string; bmNome: string;
  spend: number; purchases: number; revenue: number; leads: number;
  clicks: number; impressions: number;
}

interface Agregado {
  gasto: number;        // fatura crua do Meta
  custo: number;        // fatura + imposto de importação (o que sai do caixa)
  vendas: number;
  receita: number;
  lucro: number;
  roas: number | null;  // receita / custo — contra o custo REAL, como no resto do app
  cpa: number | null;
}

interface Grupo extends Agregado { id: string; nome: string; contas: Array<ContaLinha & Agregado> }

// A conta mora em `lib/marketing-const` porque o Analytics mostra a mesma
// tabela — uma definição só, senão as duas telas discordam na mesma conta.
const agregar = (spend: number, purchases: number, revenue: number): Agregado => agregarConta(spend, purchases, revenue);

export function agruparPorBM(contas: ContaLinha[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const c of contas) {
    const g = mapa.get(c.bmId) ?? { id: c.bmId, nome: c.bmNome, contas: [], ...agregar(0, 0, 0) };
    g.contas.push({ ...c, ...agregar(c.spend, c.purchases, c.revenue) });
    mapa.set(c.bmId, g);
  }
  for (const g of mapa.values()) {
    const soma = g.contas.reduce((a, c) => ({ s: a.s + c.spend, p: a.p + c.purchases, r: a.r + c.revenue }), { s: 0, p: 0, r: 0 });
    Object.assign(g, agregar(soma.s, soma.p, soma.r));
    g.contas.sort((a, b) => b.gasto - a.gasto);
  }
  return [...mapa.values()].sort((a, b) => b.gasto - a.gasto);
}

const roasCor = (n: number | null) => (n == null ? "var(--text-dim)" : n >= 2 ? "var(--tf-pos)" : n >= 1 ? "var(--tf-warn)" : "var(--tf-neg)");
const roasStr = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}×`);

export function ContasBM({ de, ate }: { de: string; ate: string }) {
  const [contas, setContas] = useState<ContaLinha[] | null>(null);
  const [erro, setErro] = useState(false);
  const [fechados, setFechados] = useState<string[]>([]);
  const onda = useOnda();

  const carregar = useCallback(() => {
    let vivo = true;
    setErro(false);
    // Mesmo contrato das outras rotas: period/from/to (resolvePeriod). Sem
    // intervalo ainda, "mes" — custom com data vazia cairia em "hoje".
    const q = de && ate
      ? new URLSearchParams({ period: "custom", from: de, to: ate }).toString()
      : "period=mes";
    fetch(`/api/trafego/contas?${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((p) => { if (!vivo) return; if (p?.ok) setContas(p.data.contas as ContaLinha[]); else setErro(true); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [de, ate]);

  useEffect(() => carregar(), [carregar]);
  // Números do ERP por conta: sem isto ficavam na primeira leitura da sessão
  // quando alguém clicava em "Atualizar" (ver `atualizacao.ts`).
  useAtualizacao(carregar);

  const grupos = useMemo(() => agruparPorBM(contas ?? []), [contas]);
  const total = useMemo(() => {
    const s = grupos.reduce((a, g) => ({ s: a.s + g.gasto, p: a.p + g.vendas, r: a.r + g.receita }), { s: 0, p: 0, r: 0 });
    return agregar(s.s, s.p, s.r);
  }, [grupos]);

  if (erro) return <Vazio>Não foi possível carregar as contas de anúncios.</Vazio>;
  if (!contas) return <CardSkeleton linhas={4} />;
  if (!grupos.length) return <Vazio>Sem gasto de anúncios no período.</Vazio>;

  const alternar = (id: string) => setFechados((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  // Redesenho (25/09, marca do dono: "informações aleatórias"). Uma tabela de
  // seis colunas virou ranking por BM, na linguagem do "Top vendas por
  // estado": cada conta é uma linha com a barra do gasto (relativa à maior
  // conta do painel), nome à esquerda, gasto à direita e só o ROAS de apoio.
  // Vendas/faturamento/lucro/CPA/ID ficam no title da linha.
  const maior = Math.max(...grupos.flatMap((g) => g.contas.map((c) => c.custo)), 1);

  return (
    <div className="bm">
      <div className="bm-topo">
        <Icon name="brand-meta" size={16} color="var(--primary-texto)" />
        <span className="bm-titulo">BMs e contas</span>
        <span className="bm-total" title={`ROAS geral ${roasStr(total.roas)}`}>{fmtBRL2(total.custo)}</span>
      </div>

      <Fila style={{ display: "grid", gap: 12 }}>
        {grupos.map((g) => {
          const aberto = !fechados.includes(g.id);
          return (
            <div key={g.id} className="bm-grupo">
              <button type="button" className="bm-cab mt-anel" aria-expanded={aberto}
                onClick={() => alternar(g.id)}
                onPointerDown={(e) => { e.stopPropagation(); onda(e); }}>
                <Icon name={aberto ? "chevron-down" : "chevron-right"} size={14} color="var(--text-dim)" />
                <span className="bm-cab-nome">{g.nome}</span>
                <span className="bm-roas" style={{ color: roasCor(g.roas) }}>{roasStr(g.roas)}</span>
                <span className="bm-cab-val">{fmtBRL2(g.custo)}</span>
              </button>
              {aberto && (
                <ol className="bm-lista">
                  {g.contas.map((c) => (
                    <li key={c.id} className="bm-linha">
                      <span aria-hidden className="bm-barra" style={{ width: `${(c.custo / maior) * 100}%` }} />
                      {/* O detalhe mora NA linha, não num title: hover não existe no celular. */}
                      <span className="bm-nome">
                        {c.nome}
                        <span className="bm-det">{fmtNum(c.vendas)} vendas · lucro {fmtBRL2(c.lucro)}{c.cpa != null ? ` · CPA ${fmtBRL2(c.cpa)}` : ""}</span>
                      </span>
                      <span className="bm-roas" style={{ color: roasCor(c.roas) }}>{roasStr(c.roas)}</span>
                      <span className="bm-val">{fmtBRL2(c.custo)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </Fila>

      <div className="bm-nota">
        Gasto com imposto ({IMPOSTO_GASTO_PCT.toString().replace(".", ",")}%). ROAS pelo que o Meta atribui a cada conta (pixel).
      </div>
    </div>
  );
}

