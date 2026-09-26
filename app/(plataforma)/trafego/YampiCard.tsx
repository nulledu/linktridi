"use client";

// Tridify — widget "Vendas da Yampi", irmão do da Vega. Mesmos números, mesma
// leitura: faturamento é o que o cliente fechou no CHECKOUT, o upsell da
// vendedora fica de fora (conta no Comercial) e as peças vendidas saem da
// mesma config de "Peças que acompanho".
//
// A diferença que o card precisa mostrar é a LOJA: a Yampi tem mais de uma na
// mesma plataforma (tráfego e orgânica), e um número só somando as duas esconde
// exatamente a comparação que a pessoa abre o painel pra fazer. Por isso a
// fileira de lojas em cima — ela rola de lado no celular (`tab-strip`) e a
// escolha fica no aparelho (localStorage), que é preferência de quem olha e não
// configuração da empresa.

import { tfSet } from "./ajustes-na-conta";
import { useCallback, useEffect, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import { Icon } from "../Icon";
import { Vazio } from "./TfKit";
import { ConfigPecasModal, Proporcao } from "./VegaView";
import type { YampiResumo } from "@/lib/yampi";
import { BotaoIcone } from "../ui/controles";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("pt-BR");
const dataDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const CHAVE_LOJA = "tridify:yampi-card:loja";

/** `completo`: o card G — soma o texto do upsell e a quebra "Por loja". */
export function YampiCard({ de, ate, completo = false }: { de: string; ate: string; completo?: boolean }) {
  const [d, setD] = useState<YampiResumo | null>(null);
  const [erro, setErro] = useState(false);
  const [config, setConfig] = useState(false);
  // Nasce vazio nos dois lados (servidor e primeiro paint) e só depois lê o
  // aparelho: ler o localStorage no `useState` faria a marcação do servidor
  // diferir da do cliente e a hidratação quebraria o card inteiro.
  const [loja, setLoja] = useState("");

  useEffect(() => {
    try { const s = localStorage.getItem(CHAVE_LOJA); if (s) setLoja(s); } catch { /* aba sem storage */ }
  }, []);

  const carregar = useCallback((fresh = false) => {
    let vivo = true;
    setErro(false);
    // A rota resolve o período por `period`/`from`/`to` (resolvePeriod), igual
    // às outras do Tridify — mandar `de`/`ate` cairia no default e o widget
    // mostraria o mês inteiro qualquer que fosse o período escolhido em cima.
    const q = new URLSearchParams(
      de && ate ? { period: "custom", from: de, to: ate } : { period: "mes" },
    );
    if (loja) q.set("loja", loja);
    // `fresh=1` fura o cache de 3 min da rota — só o clique em "Atualizar"
    // manda, senão cada troca de loja pagaria o ERP inteiro de novo.
    if (fresh) q.set("fresh", "1");
    fetch(`/api/trafego/yampi?${q.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((p) => { if (vivo) { if (p?.ok) setD(p.data as YampiResumo); else setErro(true); } })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [de, ate, loja]);

  useEffect(() => carregar(), [carregar]);
  // Sem isto o card fica congelado na primeira leitura quando alguém clica em
  // "Atualizar": ele só reage a troca de período (ver `atualizacao.ts`).
  useAtualizacao(() => carregar(true));

  const escolherLoja = (l: string) => {
    setLoja(l);
    try { tfSet(CHAVE_LOJA, l); } catch { /* aba sem storage */ }
  };

  // <Vazio> e não um <div> solto: dentro de card de painel ele cresce pro selo
  // + mensagem centrados. O <div> cru era uma linha cinza no canto de 697×366,
  // que lê como tela quebrada em vez de "a busca falhou".
  if (erro) return <Vazio icon="alert-triangle">Não foi possível carregar as vendas da Yampi.</Vazio>;

  const comQtd = (d?.pecas ?? []).filter((p) => p.qtd > 0);
  const lojas = d?.lojas ?? [];
  // Loja salva que não vendeu nada no período sumiria da fileira e o filtro
  // ficaria invisível — "por que o número está baixo?". Ela continua na lista.
  const opcoes = loja && !lojas.some((l) => l.loja.toLowerCase() === loja.toLowerCase())
    ? [...lojas, { loja, faturamento: 0, pedidos: 0 }]
    : lojas;

  // O painel só mostra o nome do widget no modo de edição — fora dele o card
  // apareceria como três números soltos, sem dizer de onde vieram nem de quando.
  const periodo = `${dataDia(de)} a ${dataDia(ate)}`;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Icon name="shopping-cart" size={16} color="var(--primary-texto)" />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)" }}>Vendas da Yampi</span>
        <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>· pedidos do ERP · {periodo}</span>
        {/* `stopPropagation` no pointerdown pra não iniciar o arraste do card. */}
        <BotaoIcone
          icone="settings"
          titulo="Configurar peças deste widget"
          variante="secundario"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setConfig(true)}
          style={{ marginLeft: "auto" }}
        />
      </div>

      {opcoes.length > 1 && (
        <div className="tab-strip" onPointerDown={(e) => e.stopPropagation()}
          style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          <ChipLoja ativo={!loja} onClick={() => escolherLoja("")}>Todas as lojas</ChipLoja>
          {opcoes.map((l) => (
            <ChipLoja key={l.loja} ativo={loja.toLowerCase() === l.loja.toLowerCase()} onClick={() => escolherLoja(l.loja)}>
              {l.loja}
            </ChipLoja>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}
            title={d && d.upsell > 0 ? `Só o checkout da Yampi. ${brl(d.upsell)} de upsell da vendedora contam no Comercial.` : "Só o que o cliente fechou no checkout da Yampi."}>Faturamento</div>
          <div className="stat" style={{ fontSize: 24, fontWeight: 800, color: "var(--primary-texto)", letterSpacing: "-.01em" }}>{d ? brl(d.faturamento) : "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>Vendas</div>
          <div className="stat" style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", letterSpacing: "-.01em" }}>{d ? num(d.pedidos) : "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>Ticket médio</div>
          <div className="stat" style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", letterSpacing: "-.01em" }}>{d ? brl(d.ticket) : "—"}</div>
        </div>
      </div>

      {/* M é o card ENXUTO (pedido do dono, 23/09): lojas, os três números e
          as peças. O texto do upsell e a quebra "Por loja" só entram no G —
          no M eles empurravam a rosca pra fora da caixa de 697×366, e a
          fileira de lojas em cima já faz a comparação por loja com um toque.
          No G o que explica o número fica à esquerda e as peças à direita; no
          celular as colunas quebram uma embaixo da outra pelo flex-wrap. */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        {completo && (
          <div style={{ flex: "1 1 240px", minWidth: 0, display: "grid", gap: 12 }}>
            {/* Diz o que o número É. Sem isto o card mostra um faturamento que não
                bate com o do card da empresa e ninguém sabe por quê: a diferença é o
                upsell da vendedora, que pertence ao Comercial. */}
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.45 }}>
              Só o que o cliente fechou no checkout da Yampi{loja ? <> · loja <b style={{ color: "var(--text)" }}>{loja}</b></> : null}.
              {d && d.upsell > 0 ? <> Mais <b style={{ color: "var(--text)" }}>{brl(d.upsell)}</b> de upsell da vendedora nesses pedidos, que conta no Comercial.</> : null}
            </div>

            {/* Só faz sentido comparar as lojas quando se está vendo TODAS: com o
                filtro ligado a quebra viraria uma linha só, repetindo o número de cima. */}
            {!loja && lojas.length > 1 && (
              <div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600, marginBottom: 4 }}>Por loja</div>
                <div style={{ display: "grid", gap: 4 }}>
                  {lojas.map((l) => (
                    <div key={l.loja} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                      <span style={{ color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.loja}</span>
                      <span className="stat" style={{ fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>{brl(l.faturamento)} · {num(l.pedidos)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* A legenda da rosca já leva a quantidade (`compacto`): a antiga fileira
            "Peças vendidas" repetia os mesmos nomes e era o que estourava a caixa. */}
        <div style={{ flex: "1.3 1 300px", minWidth: 0 }}>
          {d && comQtd.length > 0 ? (
            <Proporcao pecas={d.pecas} outros={d.outros} compacto />
          ) : d ? (
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Sem peças acompanhadas no período.</div>
          ) : null}
        </div>
      </div>

      {config && <ConfigPecasModal onFechar={() => setConfig(false)} onSalvo={() => carregar()} />}
    </div>
  );
}

// Chip de loja. Alvo de toque pela altura mínima da fundação — não vale
// encolher porque "é só um filtro": no celular ele é o controle do card.
function ChipLoja({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={ativo}
      style={{
        minHeight: 30, padding: "0 11px", borderRadius: 999, cursor: "pointer",
        border: `1px solid ${ativo ? "transparent" : "var(--tf-panel-line, var(--border))"}`,
        background: ativo ? "var(--text)" : "var(--surface-2)",
        color: ativo ? "var(--surface)" : "var(--text-dim)",
        fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", flex: "0 0 auto",
      }}>
      {children}
    </button>
  );
}
