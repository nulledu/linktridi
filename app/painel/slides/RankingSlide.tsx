"use client";
import { ComSelo } from "../../(plataforma)/ui/Avatar";

import { useEffect, useState } from "react";
import type { PanelConfig, Period, Salesperson, SalesSnapshot } from "@/lib/types";
import { fmtBRL, fmtCurto, fmtNum } from "@/lib/format";

/**
 * O dinheiro desta tela, na escala que o PERFIL pediu.
 *
 * Existe porque as telas clássicas viraram blocos: a chave "números curtos" do
 * perfil valia só para os blocos avulsos, e num perfil feito de telas prontas
 * ela não fazia nada — a pessoa marcava e a parede continuava igual.
 */
const moeda = (curtos?: boolean) => (n: number) => (curtos ? fmtCurto(n, true) : fmtBRL(n));
import { corDaSerie } from "@/app/(plataforma)/ui/graficos";
import { NumeroVivo } from "@/app/(plataforma)/ui/micro";
import { Icon } from "./Icon";
import { PAREDE_MONO } from "./parede";

const PERIODS: { key: Period; label: string }[] = [
  { key: "daily", label: "Hoje" },
  { key: "weekly", label: "Semana" },
  { key: "monthly", label: "Mês" },
];

/**
 * Ouro, prata e bronze. É a única cor desta tela que NÃO sai da rampa, e de
 * propósito: medalha é significado, não decoração — repintar o 1º lugar de jade
 * porque a empresa trocou o destaque tiraria a única coisa que o pódio diz de
 * longe, antes de qualquer número ser lido.
 */
const PODIUM = {
  1: { color: "var(--amarelo)", h: 120, photo: 104 },
  2: { color: "var(--neutro)", h: 86, photo: 82 },
  3: { color: "#CD7F4F", h: 68, photo: 82 },
} as const;

// Ranking gamificado: pódio + lidera por + tabela 4-N + rodapé da equipe. Alterna período.
export function RankingSlide({ sales, config, curtos }: { sales: SalesSnapshot; config: PanelConfig; curtos?: boolean }) {
  const dinheiro = moeda(curtos);
  const [pi, setPi] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPi((x) => (x + 1) % PERIODS.length), 7000);
    return () => clearInterval(id);
  }, []);
  const period = PERIODS[pi].key;
  const ord = (p: Salesperson) => p.orders?.[period] ?? 0;

  const ranked = [...sales.salespeople].sort((a, b) => b.sales[period] - a.sales[period]);
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3, 10);
  const order = [top3[1], top3[0], top3[2]].filter(Boolean) as Salesperson[];

  const leadDiff = top3[0] && top3[1] ? top3[0].sales[period] - top3[1].sales[period] : 0;
  const teamRevenue = ranked.reduce((s, p) => s + p.sales[period], 0);
  const teamOrders = ranked.reduce((s, p) => s + ord(p), 0);

  // meta da equipe pro período (deriva da meta mensal definida no dashboard)
  const monthGoal = config.monthlyRevenueGoal || 0;
  const sp = new Date(Date.now() - 3 * 3600 * 1000);
  const dim = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth() + 1, 0)).getUTCDate();
  const periodGoal = period === "monthly" ? monthGoal : period === "weekly" ? (monthGoal * 7) / dim : monthGoal / dim;
  const goalPct = periodGoal > 0 ? (teamRevenue / periodGoal) * 100 : 0;

  const tinta = corDaSerie(0);

  return (
    <div style={{ width: "100%", maxWidth: 1220, ...PAREDE_MONO }}>
      {/* Cabeçalho centralizado (não colide com o header global no canto) */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-0.02em" }}>RANKING DOS VENDEDORES</h2>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--text-dim)", fontSize: 15, marginTop: 2 }}>
          Competição que gera resultado <Icon name="bolt" size={15} color="var(--amarelo)" />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
          {PERIODS.map((p, idx) => {
            const active = idx === pi;
            return (
              <span key={p.key} style={{ padding: "6px 16px", fontSize: 14, fontWeight: 700, borderRadius: 999, color: active ? "var(--on-primary, #fff)" : "var(--text-dim)", background: active ? "color-mix(in srgb, var(--primary) 22%, transparent)" : "transparent", border: `1px solid ${active ? "var(--primary-acao, var(--primary))" : "var(--border)"}` }}>
                {p.label}
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 28 }}>
        {/* Coluna esquerda: pódio + lidera por */}
        <div style={{ flex: "0 0 53%" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 14 }}>
            {order.map((p) => {
              const rank = (top3.indexOf(p) + 1) as 1 | 2 | 3;
              const cfg = PODIUM[rank];
              return (
                // A entrada usa os tokens da escala de movimento, não um 0.6s
                // escrito aqui: mexer no token passa a mexer na parede junto.
                // Sem `both` de propósito — `popIn` termina em `scale(1)`, e com
                // preenchimento pra frente esse transform identidade fica
                // aplicado pra sempre, virando bloco de contenção do que for
                // `position: fixed` lá dentro. Sem atraso, o modo de
                // preenchimento não muda nada no que se vê.
                <div key={p.id} style={{ flex: 1, maxWidth: 210, display: "flex", flexDirection: "column", alignItems: "center", animation: "popIn var(--duration-very-slow) var(--ease-smooth-out)" }}>
                  <ComSelo selo={{ conteudo: rank, tamanho: "lg", posicao: "bottom-right", fundo: cfg.color, tinta: "#1a1300" }}>
                    <Avatar name={p.name} url={p.photoUrl} size={cfg.photo} ring={cfg.color} />
                  </ComSelo>
                  {rank === 1 && <div style={{ marginTop: 8 }}><Icon name="trophy" size={26} color={cfg.color} /></div>}
                  <div style={{ fontSize: 17, fontWeight: 700, marginTop: 8, textAlign: "center", lineHeight: 1.1 }}>{p.name}</div>
                  <div className="stat" style={{ fontSize: rank === 1 ? 30 : 24, marginTop: 6, color: cfg.color }}>
                    <NumeroVivo valor={p.sales[period]} formatar={dinheiro} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", marginTop: 4 }}>{fmtNum(ord(p))} vendas</span>
                  {/* O degradê descia para `#14141a` fixo: no tema claro do
                      painel a base do pódio ficava um bloco preto no meio da
                      tela. Agora ele desce para o FUNDO da parede, qualquer que
                      ele seja. */}
                  <div style={{ width: "100%", height: cfg.h, marginTop: 12, borderRadius: "14px 14px 0 0", background: `linear-gradient(180deg, ${cfg.color}, color-mix(in srgb, ${cfg.color} 50%, var(--bg)))`, boxShadow: `0 0 40px -14px ${cfg.color}` }} />
                </div>
              );
            })}
          </div>

          {/* Lidera por */}
          {top3[0] && top3[1] && (
            <div className="glass glass-spec" style={{ marginTop: 16, padding: "14px 22px", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: `color-mix(in srgb, ${tinta} 18%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <Icon name="trending-up" size={24} color={tinta} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-dim)" }}>
                  {top3[0].name.toUpperCase()} LIDERA POR
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <span className="stat" style={{ fontSize: 40, color: tinta }}>
                    + <NumeroVivo valor={leadDiff} formatar={dinheiro} />
                  </span>
                  <span style={{ fontSize: 14, color: "var(--text-dim)" }}>à frente do 2º colocado</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tabela 4-N */}
        <div className="glass glass-spec" style={{ flex: 1, padding: "6px 4px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 18px 6px" }}>
            <span style={{ width: 30 }}>#</span>
            <span style={{ flex: 1 }}>Vendedor</span>
            <span style={{ width: 110, textAlign: "right" }}>Faturamento</span>
            <span style={{ width: 56, textAlign: "right" }}>Vendas</span>
          </div>
          {rest.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", padding: "8px 18px", borderTop: "1px solid var(--border)" }}>
              <span style={{ width: 30, fontSize: 15, fontWeight: 800, color: "var(--text-dim)" }}>{i + 4}</span>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <Avatar name={p.name} url={p.photoUrl} size={36} />
                <span style={{ fontSize: 18, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
              </div>
              {/* A tabela NÃO conta: as sete linhas re-ordenam a cada troca de
                  período, e sete números correndo ao mesmo tempo viram ruído
                  justamente onde a leitura é linha a linha. O movimento fica
                  para o pódio e para os totais. */}
              <span style={{ width: 110, textAlign: "right", fontSize: 17, fontWeight: 700, color: tinta }}>{dinheiro(p.sales[period])}</span>
              <span style={{ width: 56, textAlign: "right", fontSize: 17, fontWeight: 700 }}>{fmtNum(ord(p))}</span>
            </div>
          ))}
          <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text-dim)" }}>
              <Icon name="trophy" size={18} color={tinta} /> Meta da equipe
            </span>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{dinheiro(periodGoal)}</span>
          </div>
        </div>
      </div>

      {/* Rodapé: equipe */}
      <div className="glass glass-spec" style={{ marginTop: 18, padding: "16px 26px", display: "flex", alignItems: "center", gap: 30 }}>
        <Stat icon="users" label="Faturamento" valor={teamRevenue} formatar={dinheiro} cor={tinta} />
        <div style={{ width: 1, height: 40, background: "var(--border)" }} />
        {/* Arredonda antes de formatar: no meio da contagem o valor é
            fracionário e o `fmtNum` cru mostraria "1.234,567". */}
        <Stat icon="shopping-cart" label="Pedidos" valor={teamOrders} formatar={(n) => fmtNum(Math.round(n))} cor={tinta} />
        <div style={{ width: 1, height: 40, background: "var(--border)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
          {/* Bater a meta é ESTADO — verde vem da paleta semântica e não da
              rampa. Abaixo dela, tinta da empresa. */}
          <span className="stat" style={{ fontSize: 30, color: goalPct >= 100 ? "var(--ok)" : tinta }}>
            <NumeroVivo valor={goalPct} formatar={(n) => `${n.toFixed(0)}%`} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 6 }}>da meta da equipe</div>
            {/* Barra em PÍLULA e tinta cheia, a assinatura do conjunto mono. O
                trilho era `rgba(255,255,255,.1)` — branco sobre branco no tema
                claro —, e o preenchimento era um degradê de duas cores fixas,
                que a três metros só borrava a ponta da barra. */}
            <div style={{ height: 12, borderRadius: 999, background: "var(--mono-grade)", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(goalPct, 100)}%`, height: "100%", borderRadius: 999, background: goalPct >= 100 ? "var(--ok)" : tinta, transition: "width var(--duration-very-slow) var(--ease-smooth-out)" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, valor, formatar, cor }: {
  icon: string; label: string; valor: number; formatar: (n: number) => string; cor: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `color-mix(in srgb, ${cor} 16%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={22} color={cor} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</div>
        <div className="stat" style={{ fontSize: 24 }}><NumeroVivo valor={valor} formatar={formatar} /></div>
      </div>
    </div>
  );
}

function Avatar({ name, url, size, ring }: { name: string; url: string | null; size: number; ring?: string }) {
  const style: React.CSSProperties = {
    width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "none",
    border: ring ? `3px solid ${ring}` : "1px solid var(--border)",
    boxShadow: ring ? `0 0 24px -6px ${ring}` : "none",
  };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} style={style} />;
  }
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("");
  return (
    <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-2)", fontSize: size * 0.34, fontWeight: 600 }}>{initials}</div>
  );
}
