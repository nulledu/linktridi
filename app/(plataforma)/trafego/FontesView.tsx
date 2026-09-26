"use client";

// Tridify — Fontes de venda. Aqui você diz de onde vem cada venda: o que é
// TRÁFEGO PAGO, o que é ORGÂNICO e o que não deve entrar em número nenhum.
//
// Antes isso era regra fixa no código (uma loja Yampi como tráfego, o resto
// fora). Agora cada origem que aparece nos pedidos vira uma linha aqui, com
// quanto ela trouxe no período — dá pra ver o que está sobrando de fora e
// classificar na hora.
import { useCallback, useEffect, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import { Icon } from "../Icon";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { useBuscaAtual } from "../ui/useBuscaAtual";
import { SectionHeader, EmptyState } from "./TfKit";
// Vinham de ProdutosVendidosView, que saiu junto com a aba "Produtos vendidos".
export const TIPO_COR: Record<FonteTipo, string> = {
  trafego: "var(--tf-pos)", comercial: "var(--tf-accent, var(--primary-texto))", organico: "var(--tf-info)",
  marketplace: "var(--tf-warn, var(--atencao))", ignorar: "var(--text-dim)",
};
export const TIPO_LABEL: Record<FonteTipo, string> = {
  trafego: "Tráfego", comercial: "Comercial", organico: "Orgânico", marketplace: "Marketplace", ignorar: "Não contar",
};
import type { FonteResumo } from "@/lib/trafego-vendas";
import type { FonteTipo, RegraClassificacao } from "@/lib/marketing-config";
import { Botao, BotaoIcone } from "../ui/controles";
import "./carteira-fontes.css";

type Tipo = FonteTipo;
interface Dados {
  de: string; ate: string;
  fontes: FonteResumo[];
  trafegoValor: number; organicoValor: number; marketplaceValor: number;
  comercialValor: number; comercialPedidos: number;
  faturamentoEmpresa: number; faturamentoTrafego: number;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("pt-BR");

// Marketplace não é opção: é a PLATAFORMA do pedido (Shopee, Mercado Livre,
// TikTok) e essas linhas aparecem travadas. Nenhuma outra origem entra lá.
const OPCOES: { v: Tipo; label: string; desc: string; cor: string }[] = [
  { v: "trafego", label: "Tráfego pago", desc: "entra no faturamento do tráfego e no total da empresa", cor: "var(--tf-pos)" },
  { v: "comercial", label: "Comercial", desc: "venda do time comercial — entra no total da empresa, fora do tráfego", cor: "var(--tf-accent, var(--primary-texto))" },
  { v: "organico", label: "Orgânico", desc: "entra no total da empresa, fora do tráfego", cor: "var(--tf-info)" },
  { v: "ignorar", label: "Não contar", desc: "fica de fora dos totais", cor: "var(--text-dim)" },
];

export function FontesView({ period }: { period: PeriodState }) {
  const [d, setD] = useState<Dados | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, Tipo>>({});
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const buscaAtual = useBuscaAtual();
  const carregar = useCallback(async () => {
    setErro(null);
    const souAtual = buscaAtual();
    try {
      const res = await fetch(`/api/trafego/fontes?${periodQuery(period)}`, { cache: "no-store" });
      const p = await res.json().catch(() => null);
      // Resposta atrasada de outro período não sobrescreve a busca nova.
      if (!souAtual()) return;
      if (!res.ok || !p?.ok) throw new Error(p?.error || "Não foi possível carregar as fontes.");
      setD(p.data as Dados);
      setRascunho({});
    } catch (e) { if (souAtual()) setErro(e instanceof Error ? e.message : "Falha ao carregar."); }
  }, [period, buscaAtual]);
  useEffect(() => { void carregar(); }, [carregar]);
  // Segue o botão "Atualizar" da Tridify (ver `atualizacao.ts`).
  useAtualizacao(carregar);

  const tipoDe = (f: FonteResumo): Tipo => rascunho[f.chave] ?? (f.tipo as Tipo);
  const sujo = Object.keys(rascunho).length > 0;

  async function salvar() {
    if (!sujo || salvando) return;
    setSalvando(true); setErro(null); setFeito(false);
    try {
      const res = await fetch("/api/trafego/fontes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fontes: rascunho }),
      });
      const p = await res.json().catch(() => null);
      if (!res.ok || !p?.ok) throw new Error(p?.error || "Não foi possível salvar.");
      setFeito(true); setTimeout(() => setFeito(false), 2500);
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setSalvando(false); }
  }

  if (erro && !d) {
    return <EmptyState icon="alert-triangle" titulo="Não foi possível carregar" descricao={erro}
      acao={{ label: "Tentar de novo", onClick: () => void carregar() }} />;
  }

  // Resumo: quanto cada destino soma no período (a partir do rascunho, pra a
  // barra responder na hora em que a pessoa troca uma origem de grupo).
  const somaPorTipo: Record<FonteTipo, number> = { trafego: 0, comercial: 0, organico: 0, marketplace: 0, ignorar: 0 };
  for (const f of d?.fontes ?? []) somaPorTipo[tipoDe(f)] += f.valor;
  const ordemResumo: FonteTipo[] = ["trafego", "comercial", "organico", "marketplace", "ignorar"];
  const totalContado = ordemResumo.filter((t) => t !== "ignorar").reduce((s, t) => s + somaPorTipo[t], 0);
  const totalGeral = totalContado + somaPorTipo.ignorar;
  const fontesOrdenadas = (d?.fontes ?? []).slice().sort((a, b) => b.valor - a.valor);
  const maior = Math.max(1, ...fontesOrdenadas.map((f) => f.valor));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SectionHeader
        titulo="Fontes de venda"
        sub="De onde vem cada venda e em qual total ela entra."
        acoes={<span className="cf-ajuda" tabIndex={0} role="img" aria-label={AJUDA_FONTES} data-dica={AJUDA_FONTES}>
          <Icon name="help-circle" size={17} color="var(--text-dim)" />
        </span>}
      />

      {erro && <div style={aviso("var(--tf-neg)")}><Icon name="alert-triangle" size={15} color="var(--tf-neg)" />{erro}</div>}

      {/* Resumo: a manchete é o total que conta; a barra mostra a divisão. */}
      {d && d.fontes.length > 0 && (
        <section className="cf-card" aria-label="Resumo das fontes">
          <div>
            <div className="cf-rotulo">Faturamento contado no período</div>
            <div className="cf-grande cf-num" style={{ marginTop: 4 }}>{brl(totalContado)}</div>
          </div>
          <div className="cf-pilha" aria-hidden>
            {ordemResumo.map((t) => somaPorTipo[t] > 0 && (
              <span key={t} style={{ width: `${(somaPorTipo[t] / (totalGeral || 1)) * 100}%`, background: TIPO_COR[t], opacity: t === "ignorar" ? 0.4 : 1 }} />
            ))}
          </div>
          <ul className="cf-legenda">
            {ordemResumo.map((t) => (
              <li key={t}><i style={{ background: TIPO_COR[t] }} />{TIPO_LABEL[t]}<b>{brl(somaPorTipo[t])}</b></li>
            ))}
          </ul>
        </section>
      )}

      {/* De onde vem o Comercial. É AQUI que se evita contar a mesma venda duas
          vezes: ou a planilha das vendedoras, ou os pedidos classificados. */}
      <ComercialFonteSeletor />

      {/* Lista de origens, ranqueada pelo valor */}
      {!d ? <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Carregando origens…</div>
        : d.fontes.length === 0 ? <EmptyState icon="shopping-bag" titulo="Nenhuma venda no período" descricao="Troque o período no topo." />
        : (
          <section className="cf-grupo" aria-label="Origens">
            <div className="cf-grupo-cab">
              <strong>Origens</strong>
              <span>{fontesOrdenadas.length} no período</span>
            </div>
            {fontesOrdenadas.map((f) => {
              const t = tipoDe(f);
              const mudou = rascunho[f.chave] != null && rascunho[f.chave] !== f.tipo;
              return (
                <div key={f.chave} className="cf-linha" data-mudou={mudou ? "1" : undefined}>
                  <div className="cf-linha-topo">
                    <span className="cf-nome">{f.label}</span>
                    <span className="cf-valor">{brl(f.valor)}</span>
                  </div>
                  <div className="cf-barra" aria-hidden><span style={{ width: `${(f.valor / maior) * 100}%`, background: TIPO_COR[t] }} /></div>
                  <div className="cf-linha-base">
                    <span className="cf-apoio">{num(f.pedidos)} {f.pedidos === 1 ? "pedido" : "pedidos"}</span>
                    {f.tipo === "marketplace" ? (
                      <span className="cf-selo" data-dica="Pedido com Shopee, Mercado Livre ou TikTok como plataforma é sempre marketplace — entra no total da empresa, fora do tráfego"
                        tabIndex={0}
                        style={{ marginLeft: "auto", color: TIPO_COR.marketplace, border: `1px solid ${TIPO_COR.marketplace}`, background: `color-mix(in srgb, ${TIPO_COR.marketplace} 15%, transparent)` }}>
                        <Icon name="lock" size={13} color={TIPO_COR.marketplace} />
                        Marketplace
                      </span>
                    ) : (
                      <div role="group" aria-label={`Destino de ${f.label}`} className="cf-seg" style={{ marginLeft: "auto" }}>
                        {OPCOES.map((o) => (
                          <button key={o.v} type="button" onClick={() => setRascunho((r) => ({ ...r, [f.chave]: o.v }))}
                            data-dica={o.desc} aria-pressed={t === o.v}
                            style={{ ["--cf-cor" as string]: o.cor } as React.CSSProperties}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}

      {/* Salvar */}
      <div className="cf-rodape-acoes">
        {feito && <span style={{ fontSize: 12.5, color: "var(--tf-pos)", display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="check" size={15} color="var(--tf-pos)" /> Salvo</span>}
        {sujo && <Botao variante="secundario" onClick={() => setRascunho({})}>Desfazer</Botao>}
        <Botao variante="primario" onClick={() => void salvar()} disabled={!sujo} carregando={salvando}>
          Salvar classificação
        </Botao>
      </div>
    </div>
  );
}

const AJUDA_FONTES = "Vale para todos os painéis do Tridify. Precisa de um corte mais fino que a origem inteira? "
  + "Em Produtos vendidos você classifica um produto ou categoria específica — essa regra manda mais que a classificação da origem.";

// De onde sai o Comercial. Só uma das duas conta — somar as duas seria contar a
// mesma venda de novo, que foi exatamente o risco levantado.
function ComercialFonteSeletor() {
  const [fonte, setFonte] = useState<"erp" | "planilha" | "regras" | null>(null);
  const [regras, setRegras] = useState<RegraClassificacao[]>([]);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/trafego/classificacao", { cache: "no-store" });
      const p = await res.json().catch(() => null);
      if (p?.ok) { setFonte(p.data.comercialFonte); setRegras(p.data.regras ?? []); }
    } catch { /* silencioso: o bloco some se não carregar */ }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function trocar(v: "erp" | "planilha" | "regras") {
    if (salvando || v === fonte) return;
    setSalvando(true);
    try {
      const res = await fetch("/api/trafego/classificacao", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comercialFonte: v }),
      });
      const p = await res.json().catch(() => null);
      if (p?.ok) setFonte(p.data.comercialFonte);
    } finally { setSalvando(false); }
  }

  async function removerRegra(id: string) {
    if (salvando) return;
    setSalvando(true);
    try {
      const novas = regras.filter((r) => r.id !== id);
      const res = await fetch("/api/trafego/classificacao", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regras: novas }),
      });
      const p = await res.json().catch(() => null);
      if (p?.ok) setRegras(p.data.regras ?? []);
    } finally { setSalvando(false); }
  }

  if (!fonte) return null;
  const OPC = [
    { v: "planilha" as const, label: "Planilha das vendedoras", desc: "as vendas lançadas pelo comercial (padrão)" },
    { v: "regras" as const, label: "Pedidos classificados", desc: "o que você marcou como Comercial aqui e em Produtos" },
    { v: "erp" as const, label: "Pedidos com vendedora (ERP)", desc: "pedido.responsavel_id — cuidado: marca todo pedido que a vendedora tocou (inclusive suporte/upsell), não só o que ela vendeu; costuma superestimar" },
  ];
  return (
    <section className="cf-card" aria-label="De onde vem o Comercial">
      <div className="cf-rotulo">
        De onde vem o Comercial
        <span className="cf-ajuda" tabIndex={0} role="img"
          aria-label="Só uma fonte entra no total da empresa — senão a mesma venda contaria duas vezes."
          data-dica="Só uma fonte entra no total da empresa — senão a mesma venda contaria duas vezes.">
          <Icon name="help-circle" size={15} color="var(--text-dim)" />
        </span>
      </div>
      <div role="group" aria-label="Fonte do Comercial" className="cf-seg" style={{ justifySelf: "start" }}>
        {OPC.map((o) => (
          <button key={o.v} type="button" onClick={() => void trocar(o.v)} disabled={salvando} data-dica={o.desc}
            aria-pressed={fonte === o.v}
            style={{ ["--cf-cor" as string]: "var(--tf-accent, var(--primary-texto))" } as React.CSSProperties}>
            {o.label}
          </button>
        ))}
      </div>

      {regras.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600, marginBottom: 7 }}>
            Regras ativas ({regras.length}) · a primeira que casar decide
          </div>
          <div style={{ display: "grid", gap: 5 }}>
            {regras.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ color: "var(--text-dim)" }}>
                  {r.campo} {r.operador === "igual" ? "=" : "contém"} <b style={{ color: "var(--text)" }}>{r.valor}</b> →
                </span>
                <span style={{ fontWeight: 700, color: TIPO_COR[r.tipo] }}>{TIPO_LABEL[r.tipo]}</span>
                <BotaoIcone icone="trash" titulo="Remover regra" variante="perigo" tamanho="sm" onClick={() => void removerRegra(r.id)} disabled={salvando}
                  style={{ marginLeft: "auto" }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const aviso = (cor: string): React.CSSProperties => ({
  display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 14px", borderRadius: 11,
  fontSize: 12.5, lineHeight: 1.45, color: "var(--text)",
  background: `color-mix(in srgb, ${cor} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${cor} 28%, transparent)`,
});
