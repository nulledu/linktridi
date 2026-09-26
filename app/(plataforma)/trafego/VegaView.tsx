"use client";

// Tridify — Vendas da Vega. Faturamento e pedidos que entraram pela Vega
// Checkout (plataforma do ERP), e quantas PEÇAS de cada tipo saíram por lá.
// Vem do ERP real: são os pedidos, não conversão de pixel.
//
// Quais peças aparecem é ESCOLHA da pessoa (bloco "Peças que acompanho"): a
// lista fica em marketing_config e a contagem casa pelo NOME do item, na ordem
// configurada. Antes era fixo em chancela/carimbo/decorativo, e o decorativo
// (complemento de combo) dominava o card sem ninguém querer saber dele.
import { useCallback, useEffect, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { useBuscaAtual } from "../ui/useBuscaAtual";
import { MetricCard, SectionHeader, EmptyState, Vazio } from "./TfKit";
import { MonoRosca } from "../ui/graficos";
import { Icon } from "../Icon";
import { Portal } from "../Portal";
import type { VegaResumo, VegaPeca } from "@/lib/vega";
import type { PecaCategoria } from "@/lib/marketing-config";
import type { VegaLeads } from "@/lib/vega-leads";
import { Botao, BotaoIcone } from "../ui/controles";

// O que a API devolve: a venda (ERP) + o que a Vega manda e não é venda
// (carrinho abandonado, PIX pendente). `leads` vem null quando não dá pra ler.
type VegaDados = VegaResumo & { leads?: VegaLeads | null };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("pt-BR");
const dataDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dataCurta = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Cor por posição — a lista é configurável, então não dá pra fixar por nome.
// Cores de SÉRIE do gráfico: categóricas. A régua aqui é distinção entre si,
// não significado — por isso a rampa --cat-*, e não os tokens de estado (uma
// série pintada de vermelho parece um problema).
const CORES = ["var(--cat-2)", "var(--cat-1)", "var(--cat-10)", "var(--cat-4)", "var(--cat-3)", "var(--cat-5)", "var(--cat-7)", "var(--cat-6)"];
export const corDaPeca = (i: number) => CORES[i % CORES.length];

export function VegaView({ period }: { period: PeriodState }) {
  const [d, setD] = useState<VegaDados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState(false);

  const buscaAtual = useBuscaAtual();
  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    const souAtual = buscaAtual();
    try {
      const q = periodQuery(period);
      const res = await fetch(`/api/trafego/vega?${q}`, { cache: "no-store" });
      const p = await res.json().catch(() => null);
      // Resposta atrasada de outro período não sobrescreve a busca nova.
      if (!souAtual()) return;
      if (!res.ok || !p?.ok) throw new Error(p?.error || "Não foi possível carregar as vendas da Vega.");
      setD(p.data as VegaDados);
    } catch (e) {
      if (souAtual()) setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally { if (souAtual()) setCarregando(false); }
  }, [period, buscaAtual]);

  useEffect(() => { void carregar(); }, [carregar]);

  if (erro) {
    return <EmptyState icon="alert-triangle" titulo="Não foi possível carregar" descricao={erro}
      acao={{ label: "Tentar de novo", onClick: () => void carregar() }} />;
  }

  const pecas = d?.pecas ?? [];
  const totalPecas = pecas.reduce((s, p) => s + p.qtd, 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SectionHeader titulo="Vendas da Vega"
        sub="Pedidos que entraram pela Vega Checkout, direto do ERP. O faturamento é o que o cliente fechou no checkout — o que a vendedora vendeu depois aparece à parte, no Comercial." />

      {/* Faturamento e vendas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 12 }}>
        <MetricCard label="Faturamento" valor={d ? brl(d.faturamento) : "—"} cor="var(--primary-texto)" sub={carregando ? "carregando…" : "vendido pela Vega no período"} />
        <MetricCard label="Vendas" valor={d ? num(d.pedidos) : "—"} sub="pedidos que entraram" />
        <MetricCard label="Ticket médio" valor={d ? brl(d.ticket) : "—"} sub="por pedido" />
      </div>
      {/* O upsell não vira card: não é venda da Vega. Fica só como nota de
          rodapé, pra quem comparar com o card do Comercial saber pra onde foi
          a diferença — era ele que inflava o faturamento daqui. */}
      {d && d.upsell > 0 && (
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: -6 }}>
          Fora daqui: {brl(d.upsell)} vendidos depois do checkout pela vendedora — contam no Comercial.
        </div>
      )}

      {/* Peças */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <SectionHeader titulo="Peças vendidas" sub={d ? `${num(totalPecas)} peça(s) nos pedidos da Vega` : undefined} />
          </div>
          <Botao variante="secundario" icone="settings" onClick={() => setConfig((v) => !v)} title="Escolher quais peças acompanhar">
            {config ? "Fechar" : "Escolher peças"}
          </Botao>
        </div>

        {config && <ConfigPecas onSalvo={() => void carregar()} />}

        {pecas.length === 0 ? (
          <EmptyState icon="package" titulo="Nenhuma peça configurada"
            descricao="Use “Escolher peças” pra dizer o que você quer acompanhar aqui." />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))", gap: 12 }}>
              {pecas.map((p, i) => (
                <MetricCard key={p.id} label={p.label} valor={d ? num(p.qtd) : "—"} cor={corDaPeca(i)}
                  sub={d && p.valor > 0 ? `${brl(p.valor)} faturados` : "peças vendidas"} />
              ))}
            </div>
            {d && totalPecas > 0 && <Proporcao pecas={pecas} outros={d.outros} />}
          </>
        )}
      </div>

      {/* O que a Vega manda e não é venda — só aparece quando há dado */}
      {d?.leads && <NaoVendas l={d.leads} />}

      {/* Faturamento por dia */}
      {d && d.serie.length > 0 && (
        <div>
          <SectionHeader titulo="Por dia" />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 130, padding: "8px 2px", overflowX: "auto" }}>
            {d.serie.map((p) => {
              const max = Math.max(...d.serie.map((x) => x.faturamento), 1);
              const h = Math.max(3, Math.round((p.faturamento / max) * 100));
              return (
                <div key={p.dia} title={`${p.dia}: ${brl(p.faturamento)} · ${p.pedidos} pedido(s)`}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 34 }}>
                  <div style={{ width: 26, height: `${h}%`, borderRadius: "6px 6px 3px 3px", background: "linear-gradient(180deg,color-mix(in srgb, var(--primary) 72%, #fff),var(--primary))" }} />
                  <span style={{ fontSize: 9.5, color: "var(--text-dim)" }}>{p.dia.slice(8, 10)}/{p.dia.slice(5, 7)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Últimos pedidos */}
      {d && (d.ultimos.length > 0 ? (
        <div>
          <SectionHeader titulo="Últimos pedidos" />
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            {d.ultimos.map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: i ? "1px solid var(--border)" : "none", fontSize: 13, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "monospace", color: "var(--text-dim)", fontSize: 12, width: 62 }}>#{p.id}</span>
                <span style={{ color: "var(--text-dim)", fontSize: 12, width: 96 }}>{dataCurta(p.at)}</span>
                <span style={{ flex: 1, minWidth: 0, color: "var(--text-dim)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.itens} item(ns){p.origem ? ` · ${p.origem}` : ""}
                </span>
                <span style={{ fontWeight: 700, color: "var(--text)" }}>{brl(p.total)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : !carregando && (
        <EmptyState icon="shopping-bag" titulo="Nenhuma venda da Vega no período" descricao="Troque o período no topo para ver outro intervalo." />
      ))}
    </div>
  );
}

// ── O que a Vega manda e NÃO é venda ─────────────────────────────────────────
// Carrinho abandonado e PIX pendente. Nada aqui entra em faturamento — o
// faturamento acima é só pedido pago. Vem do que as edge functions da Vega já
// gravam no ERP (leads_novo_registros), sem webhook novo.
//
// Não mostra dinheiro de propósito: a coluna de valor da tabela de leads vem
// com real e centavo misturados, então qualquer total sairia errado. Contagem
// e conversão são confiáveis.
function NaoVendas({ l }: { l: VegaLeads }) {
  if (l.carrinhos === 0 && l.pix === 0) return null;
  const conv = l.pix > 0 ? Math.round((l.pixPagos / l.pix) * 100) : null;
  const desde = l.desde ? new Date(l.desde).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : null;
  return (
    <div>
      <SectionHeader titulo="Não viraram venda"
        sub={desde ? `Carrinho abandonado e PIX pendente, registrados desde ${desde}. Fora do faturamento.` : "Carrinho abandonado e PIX pendente. Fora do faturamento."} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 12 }}>
        <MetricCard label="Carrinhos abandonados" valor={num(l.carrinhos)} cor="var(--atencao)" sub="chegaram no checkout e não fecharam" />
        <MetricCard label="PIX pendente" valor={num(l.pix)} cor="var(--cat-10)" sub="gerou o código, faltou pagar" />
        <MetricCard label="PIX que virou venda" valor={conv == null ? "—" : `${conv}%`}
          cor={conv != null && conv >= 50 ? "var(--tf-pos)" : "var(--tf-warn)"}
          sub={`${num(l.pixPagos)} de ${num(l.pix)} foram pagos depois`} />
      </div>
    </div>
  );
}

// ── Config: quais peças acompanhar ───────────────────────────────────────────
// A ORDEM importa e por isso é editável: a primeira peça que casar com o nome
// do item leva. "Carimbo de Cera - Sinete" e "Carimbo Decorativo" também têm
// "carimbo" no nome — Sinete vem antes, e Carimbo exclui "decorativo".
function ConfigPecas({ onSalvo }: { onSalvo: () => void }) {
  const [pecas, setPecas] = useState<PecaCategoria[] | null>(null);
  const [padrao, setPadrao] = useState<PecaCategoria[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState(false);

  useEffect(() => {
    fetch("/api/trafego/pecas", { cache: "no-store" })
      .then((r) => r.json())
      .then((p) => { if (p?.ok) { setPecas(p.data.pecas ?? []); setPadrao(p.data.padrao ?? []); } })
      .catch(() => setPecas([]));
  }, []);

  const mudar = (i: number, patch: Partial<PecaCategoria>) =>
    setPecas((ps) => (ps ?? []).map((p, x) => (x === i ? { ...p, ...patch } : p)));
  const mover = (i: number, dir: -1 | 1) => setPecas((ps) => {
    const a = [...(ps ?? [])]; const j = i + dir;
    if (j < 0 || j >= a.length) return a;
    [a[i], a[j]] = [a[j], a[i]];
    return a;
  });
  const remover = (i: number) => setPecas((ps) => (ps ?? []).filter((_, x) => x !== i));
  const adicionar = () => setPecas((ps) => [...(ps ?? []), { id: `nova${Date.now()}`, label: "", padroes: [], ativa: true }]);

  async function salvar() {
    if (salvando) return;
    setSalvando(true); setFeito(false);
    try {
      const res = await fetch("/api/trafego/pecas", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pecas: pecas ?? [] }),
      });
      const p = await res.json().catch(() => null);
      if (p?.ok) { setPecas(p.data.pecas ?? []); setFeito(true); onSalvo(); }
    } finally { setSalvando(false); }
  }

  if (!pecas) return <div style={{ fontSize: 12.5, color: "var(--text-dim)", padding: "12px 0" }}>Carregando peças…</div>;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, margin: "12px 0", display: "grid", gap: 12, background: "var(--surface-2)" }}>
      <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
        Conta pelo <b style={{ color: "var(--text)" }}>nome do produto</b>. A ordem manda: a primeira peça que casar
        leva o item — por isso “Sinete” fica acima de “Carimbos”. O que não casar com nenhuma não é contado.
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {pecas.map((p, i) => (
          <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 11, background: "var(--surface)", display: "grid", gap: 8, opacity: p.ativa === false ? 0.55 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: corDaPeca(i), flex: "none" }} />
              <input value={p.label} onChange={(e) => mudar(i, { label: e.target.value })} placeholder="Nome da peça"
                style={{ ...campo, flex: 1, minWidth: 120, fontWeight: 700 }} />
              <div style={{ display: "flex", gap: 4, flex: "none" }}>
                <BtnIcone icone="chevron-up" titulo="Subir" onClick={() => mover(i, -1)} desabilitado={i === 0} />
                <BtnIcone icone="chevron-down" titulo="Descer" onClick={() => mover(i, 1)} desabilitado={i === pecas.length - 1} />
                <BtnIcone icone={p.ativa === false ? "eye-off" : "eye"} titulo={p.ativa === false ? "Mostrar" : "Ocultar"} onClick={() => mudar(i, { ativa: p.ativa === false })} />
                <BtnIcone icone="trash" titulo="Remover" cor="var(--tf-neg)" onClick={() => remover(i)} />
              </div>
            </div>
            <label style={rotulo}>
              Conta se o nome tiver <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(separe por vírgula)</span>
              <input value={(p.padroes ?? []).join(", ")} onChange={(e) => mudar(i, { padroes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="ex.: carimbo" style={campo} />
            </label>
            <label style={rotulo}>
              …mas não tiver <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(opcional)</span>
              <input value={(p.exceto ?? []).join(", ")} onChange={(e) => mudar(i, { exceto: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="ex.: decorativo" style={campo} />
            </label>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Botao variante="secundario" icone="plus" onClick={adicionar}>Adicionar peça</Botao>
        <Botao variante="secundario" icone="refresh" onClick={() => setPecas(padrao.map((p) => ({ ...p })))} title="Volta à lista sugerida">Restaurar padrão</Botao>
        {feito && (
          <span style={{ fontSize: 12.5, color: "var(--tf-pos)", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="check" size={15} color="var(--tf-pos)" /> Salvo
          </span>
        )}
        <Botao variante="primario" onClick={() => void salvar()} carregando={salvando} style={{ marginLeft: "auto" }}>
          Salvar peças
        </Botao>
      </div>
    </div>
  );
}

function BtnIcone({ icone, titulo, onClick, desabilitado, cor }: { icone: string; titulo: string; onClick: () => void; desabilitado?: boolean; cor?: string }) {
  return (
    <BotaoIcone icone={icone} titulo={titulo} variante={cor ? "perigo" : "secundario"} onClick={onClick} disabled={desabilitado} />
  );
}

// Barra única com a divisão das peças — a comparação que a pessoa quer ver de
// relance, sem fazer conta. Peça zerada fica de fora da barra e da legenda.
// `compacto`: a versão pra caixa fixa de widget (card M do painel). Rosca menor,
// sem margem de cima e a QUANTIDADE vai na legenda — assim o card não precisa
// da fileira "Peças vendidas" separada repetindo os mesmos nomes, que era o
// que empurrava a rosca pra fora da caixa de 366px.
export function Proporcao({ pecas, outros = 0, compacto = false }: { pecas: VegaPeca[]; outros?: number; compacto?: boolean }) {
  // A barra divide o FATURAMENTO, não a contagem: "53% das peças" e "18% do
  // dinheiro" são leituras diferentes, e quem abre o painel pra decidir o que
  // vender quer a segunda. Um kit de R$ 37,88 ao lado de uma chancela de
  // R$ 242,90 pesava igual quando a fatia era por quantidade.
  const fatias = pecas.map((p, i) => ({ ...p, cor: corDaPeca(i) })).filter((p) => p.valor > 0);
  // "Outros" é tinta, almofada, frete embutido no total — o que não é peça
  // acompanhada. Sem ele a barra fecharia em menos de 100% e a pessoa
  // procuraria o erro num número que está certo.
  const todas = outros > 0 ? [...fatias, { id: "__outros", label: "Outros", qtd: 0, valor: outros, cor: "var(--text-dim)" }] : fatias;
  const tot = todas.reduce((s, p) => s + p.valor, 0);
  if (!tot) return null;
  const pct = (v: number) => Math.round((v / tot) * 100);
  // ROSCA interativa no lugar da barra empilhada (19/09, pedido do dono: a
  // barra era estática). Apontar a fatia acende o pedaço e o centro diz o que
  // é — o MonoRosca faz isso sozinho agora. A legenda vira coluna ao lado.
  return (
    <div style={{ marginTop: compacto ? 0 : 12 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600, marginBottom: 8 }}>{compacto ? "Peças e participação no faturamento" : "Participação no faturamento"}</div>
      <div style={{ display: "flex", alignItems: "center", gap: compacto ? 14 : 18, flexWrap: "wrap" }}>
        <div style={{ flex: compacto ? "0 0 120px" : "0 1 148px", minWidth: compacto ? 120 : 124 }}>
          <MonoRosca tamanho={compacto ? 120 : 140} espessura={compacto ? 13 : 15} formatar={brl}
            fatias={todas.map((p) => ({ nome: p.label, valor: p.valor, cor: p.cor }))}
            centro={
              <span style={{ lineHeight: 1.25 }}>
                <strong className="stat" style={{ display: "block", fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{brl(tot)}</strong>
                <span style={{ fontSize: 10.5, color: "var(--text-dim)" }}>em peças</span>
              </span>
            } />
        </div>
        <div style={{ flex: compacto ? "1 1 170px" : "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column", gap: compacto ? 5 : 6, fontSize: 12, color: "var(--text-dim)" }}>
          {todas.map((p) => (
            <span key={p.id} title={compacto ? `${p.label}${p.qtd > 0 ? ` · ${p.qtd} un.` : ""} · ${brl(p.valor)}` : undefined}
              style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: p.cor, flex: "none" }} />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
              {compacto && p.qtd > 0 ? <span className="stat" style={{ flex: "none" }}>· {p.qtd.toLocaleString("pt-BR")} un.</span> : null}
              <b style={{ color: "var(--text)", flex: "none", marginLeft: compacto ? "auto" : undefined }}>{pct(p.valor)}%</b>
<span style={{ opacity: .8, flex: "none" }}>· {brl(p.valor)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const campo: React.CSSProperties = {
  minHeight: 38, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--text)", fontSize: 13, width: "100%",
};
const rotulo: React.CSSProperties = { display: "grid", gap: 4, fontSize: 11.5, fontWeight: 700, color: "var(--text)" };

// ── Card do "Meu painel" ─────────────────────────────────────────────────────
// Mesmos números, no formato de widget. Segue o PERÍODO do painel sozinho:
// `de`/`ate` vêm do overview (d.since/d.until), então trocar o período em cima
// atualiza este card junto, sem configuração.
export function VegaCard({ de, ate }: { de: string; ate: string }) {
  const [d, setD] = useState<VegaDados | null>(null);
  const [erro, setErro] = useState(false);
  const [config, setConfig] = useState(false);

  const carregar = useCallback((fresh = false) => {
    let vivo = true;
    setErro(false);
    // A rota resolve o período por `period`/`from`/`to` (resolvePeriod). O card
    // mandava `de`/`ate` — nomes que ninguém lê —, então TODA requisição caía no
    // default "mes" e o widget mostrava o mês inteiro qualquer que fosse o
    // período escolhido em cima. Aqui o intervalo do painel vira um custom.
    // Sem intervalo (overview ainda carregando) volta pro "mes" — custom com
    // data vazia cairia em "hoje" no resolvePeriod, que é pior que o mês.
    const q = de && ate
      ? new URLSearchParams({ period: "custom", from: de, to: ate }).toString()
      : "period=mes";
    // `fresh=1` fura o cache de 3 min da rota; só o "Atualizar" manda.
    fetch(`/api/trafego/vega?${q}${fresh ? "&fresh=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((p) => { if (vivo) { if (p?.ok) setD(p.data as VegaDados); else setErro(true); } })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [de, ate]);

  useEffect(() => carregar(), [carregar]);
  // Sem isto o card fica congelado na primeira leitura quando alguém clica em
  // "Atualizar": ele só reage a troca de período (ver `atualizacao.ts`).
  useAtualizacao(() => carregar(true));

  if (erro) return <Vazio icon="alert-triangle">Não foi possível carregar as vendas da Vega.</Vazio>;

  const comQtd = (d?.pecas ?? []).filter((p) => p.qtd > 0);

  // O painel só mostra o nome do widget no modo de edição — fora dele o card
  // aparecia como três números soltos, sem dizer de onde vieram nem de quando.
  const periodo = `${dataDia(de)} a ${dataDia(ate)}`;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Icon name="shopping-bag" size={16} color="var(--primary-texto)" />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)" }}>Vendas da Vega Checkout</span>
        <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>· pedidos do ERP · {periodo}</span>
        {/* Configuração do widget: é o único caminho pro editor de peças desde
            que a aba "Vendas da Vega" saiu da sidebar. `stopPropagation` no
            pointerdown pra não iniciar o arraste do card do painel. */}
        <BotaoIcone
          icone="settings"
          titulo="Configurar peças deste widget"
          variante="secundario"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setConfig(true)}
          style={{ marginLeft: "auto" }}
        />
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>Faturamento</div>
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
      {/* Diz o que o número É. Sem isto o card mostrava um faturamento que não
          batia com o do card da empresa e ninguém sabia por quê: a diferença é
          o upsell da vendedora, que pertence ao Comercial. */}
      <div style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.45 }}>
        Só o que o cliente fechou no checkout da Vega.
        {d && d.upsell > 0 ? <> Mais <b style={{ color: "var(--text)" }}>{brl(d.upsell)}</b> de upsell da vendedora nesses pedidos, que conta no Comercial.</> : null}
      </div>
      {d && comQtd.length > 0 ? (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600, marginBottom: 4 }}>Peças vendidas nesses pedidos</div>
          <div style={{ display: "flex", gap: 14, fontSize: 12, marginBottom: 6, flexWrap: "wrap" }}>
            {comQtd.map((p) => (
              <span key={p.id} style={{ color: "var(--text-dim)" }}>
                {p.label} <b style={{ color: "var(--text)" }}>{num(p.qtd)}</b>
                {p.valor > 0 ? <> · {brl(p.valor)}</> : null}
              </span>
            ))}
          </div>
          <Proporcao pecas={d.pecas} outros={d.outros} />
        </div>
      ) : d ? (
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Sem peças acompanhadas no período.</div>
      ) : null}

      {config && (
        <ConfigPecasModal onFechar={() => setConfig(false)} onSalvo={() => carregar()} />
      )}
    </div>
  );
}

// O editor de peças em folha, pro widget do painel. O card é pequeno demais pra
// abrir a lista inline (era assim na aba, que tinha a página inteira) — e no
// celular a folha já sobe presa embaixo pelas classes `sheet-host`/`sheet`.
export function ConfigPecasModal({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onFechar]);
  return (
    <Portal>
      <div onClick={onFechar} data-nozoom className="tf-scope sheet-host"
        style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(8,10,18,.72)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 20, animation: "tfFade .18s ease both" }}>
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="tf-panel sheet"
          style={{ width: "min(560px, 100%)", maxHeight: "90dvh", overflowY: "auto", padding: 0, animation: "riseIn .22s ease both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--tf-panel-line)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
            <Icon name="settings" size={17} color="var(--primary-texto)" />
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", flex: 1 }}>Peças que acompanho</div>
            <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onFechar} />
          </div>
          <div style={{ padding: 14 }}>
            <ConfigPecas onSalvo={onSalvo} />
          </div>
        </div>
      </div>
    </Portal>
  );
}
