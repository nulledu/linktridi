"use client";

import { useState } from "react";
import { hojeISO } from "@/lib/financeiro/calculos";
import { FONTES, PAGAMENTOS, FRETES, fonteLabel, agregaHistorico, agregaMetricas, type ComercialPedido, type ComercialProduto, type Gran, type MarketingDia } from "@/lib/comercial-catalog";
import { fmtBRL } from "@/lib/format";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { Botao, BotaoIcone } from "../ui/controles";
import { AreaChart } from "../Chart";
import { GlassSelect, GlassCombobox, GlassDate } from "../GlassPicker";
import { Switch } from "../Switch";
import { useSticky } from "../useSticky";
import { useParamDaUrl } from "../ui/useParamDaUrl";
import { useIsMobile } from "../ui/useMediaQuery";
import { PedidosAuto } from "./PedidosAuto";
import { VendedoraHistorico } from "./VendedoraHistorico";
import { atributosDe } from "../ui/campos";
import { PageHead } from "../ui/mobile";
import { Abas } from "../ui/Abas";
import { MarketplacesPanel } from "./MarketplacesPanel";
import { useAbrirFechar } from "../ui/micro";

const GRANS: { key: Gran; label: string }[] = [{ key: "dia", label: "Diário" }, { key: "semana", label: "Semanal" }, { key: "mes", label: "Mensal" }];
const pct = (n: number | null) => n == null ? "—" : `${n.toFixed(2).replace(".", ",")}%`;
const r2 = (n: number | null) => n == null ? "—" : n.toFixed(2);

interface Lead { id: string; telefone: string; data: string; vendido: boolean }

type ComTab = "pedidos" | "historico" | "carteira" | "leads" | "canais";

export function ComercialClient({ initial, leads: leadsInit = [], produtos = [], maisVendidos = [], canDash = false, canLancar = false, canCanais = false, perms, meErpId = null }: { initial: ComercialPedido[]; marketing?: MarketingDia[]; leads?: Lead[]; produtos?: string[]; maisVendidos?: string[]; canDash?: boolean; canX1?: boolean; canLancar?: boolean; canCanais?: boolean; perms?: { pedidos: boolean; historico: boolean; carteira: boolean; leads: boolean }; meErpId?: string | null; meNome?: string }) {
  const [leads, setLeads] = useState<Lead[]>(leadsInit);
  const [lancar, setLancar] = useState(false);
  // Lançar pedido também SAI: o booleano mora aqui, então é aqui que a saída
  // é segurada — quem desmonta é o hook, depois de --modal-close-dur.
  const lanc = useAbrirFechar(lancar, "--modal-close-dur");
  const router = useRouter();

  // Abas: gestão vê as seções LIBERADAS (sub-permissões comercial:*); vendedor sem
  // dep vê só a carteira pessoal + métricas próprias.
  const P = perms ?? { pedidos: true, historico: true, carteira: true, leads: true };
  const tabsGestao = ([["pedidos", "Pedidos"], ["historico", "Histórico"], ["carteira", "Meus pedidos"], ["leads", "Leads"]] as [ComTab, string][]).filter(([k]) => P[k as keyof typeof P]);
  // "Canais" (Mercado Livre, Shopee, TikTok) era uma aba da Administração. Ali
  // ela ficava a três cliques de qualquer pessoa que cuida de venda — e o que
  // essas integrações fazem é justamente TRAZER PEDIDO, que é o assunto desta
  // tela. A chave de permissão continua a mesma (`administracao:marketplaces`):
  // ninguém ganha nem perde acesso, só o lugar mudou.
  const tabs: [ComTab, string][] = canDash
    ? [...(tabsGestao.length ? tabsGestao : ([["carteira", "Meus pedidos"]] as [ComTab, string][])),
       ...(canCanais ? ([["canais", "Marketplaces"]] as [ComTab, string][]) : [])]
    : [["carteira", "Meus pedidos"], ["historico", "Minhas métricas"]];
  const [tabRaw, setTab] = useSticky<ComTab>("comercial.tab", tabs[0][0]);
  // Chegou de `/comercial?pedido=…` (busca universal do Início): o pedido mora
  // na aba Pedidos, e a aba salva pode ser outra.
  useParamDaUrl("pedido", () => setTab("pedidos"));
  const tab = tabs.some(([k]) => k === tabRaw) ? tabRaw : tabs[0][0];
  // A fileira rola de lado no celular: traz a aba atual (que fica salva) pra vista.
  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Sem a permissão "Lançar pedido" o botão nem existe — a API também
          recusa, então mostrá-lo só entregaria um erro depois do formulário. */}
      <PageHead
        title="Comercial"
        sub={canDash ? "Pedidos, histórico, carteira, métricas e leads." : "Sua carteira e suas métricas de vendas."}
        right={canLancar ? (
          <Botao variante="primario" icone="package-import" onClick={() => setLancar(true)}>Lançar pedido</Botao>
        ) : undefined}
      />

      {lanc.montado && (
        <div className={`apple-backdrop sheet-host ${lanc.classe}`.trim()} onClick={() => setLancar(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 }}>
          {/* padding em clamp: 26px no modal de 820px (desktop intacto) e 14px na
              folha do celular — a 320px o modal + o card interno comiam 90px de
              largura só em respiro. */}
          <div className={`apple-modal sheet t-modal ${lanc.classe}`.trim()} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 820, maxHeight: "90dvh", overflowY: "auto", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", background: "var(--surface-2)", padding: "clamp(14px, 4vw, 26px)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <h2 style={{ fontSize: 19, fontWeight: 800, flex: 1, minWidth: 0 }}>Lançar pedido</h2>
              <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={() => setLancar(false)} style={{ flex: "none" }} />
            </div>
            <NovoPedido produtos={produtos} maisVendidos={maisVendidos} onCreated={(p) => { setLancar(false); router.refresh(); void p; }} />
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, marginBottom: 22 }}>
        <Abas valor={tab} onMuda={setTab} ariaLabel="Seções do Comercial"
          itens={tabs.map(([k, lbl]) => ({ valor: k, rotulo: lbl }))} />
      </div>

      {tab === "pedidos" && <PedidosAuto />}
      {tab === "historico" && <VendedoraHistorico />}
      {tab === "carteira" && (
        meErpId
          ? <PedidosAuto lockVendorId={meErpId} titulo={canDash ? "Meus pedidos" : undefined} />
          : <div className="glass" style={{ padding: 24, borderRadius: "var(--r-md)", color: "var(--text-dim)" }}>Sua conta não está vinculada a um vendedor do ERP. Peça ao admin para vincular em Pessoas.</div>
      )}
      {tab === "leads" && <LeadsPanel leads={leads} setLeads={setLeads} />}
      {tab === "canais" && <MarketplacesPanel />}
    </div>
  );
}

function LeadsPanel({ leads, setLeads }: { leads: Lead[]; setLeads: React.Dispatch<React.SetStateAction<Lead[]>> }) {
  const [tel, setTel] = useState("");
  const [data, setData] = useState("");
  const [busy, setBusy] = useState(false);
  const [consultar, setConsultar] = useState(false);

  async function add() {
    if (!tel.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/comercial/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ telefone: tel, data: data || null }) });
      const d = await r.json();
      if (r.ok && d.lead) { setLeads((l) => [d.lead, ...l]); setTel(""); setData(""); }
    } finally { setBusy(false); }
  }
  async function remover(id: string) {
    setLeads((l) => l.filter((x) => x.id !== id));
    await fetch(`/api/comercial/leads?id=${id}`, { method: "DELETE" });
  }

  const vendidos = leads.filter((l) => l.vendido).length;

  return (
    <div className="glass glass-spec" style={{ padding: 16, borderRadius: "var(--r-md)", marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Leads</h2>
        <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{leads.length} no total · {vendidos} viraram venda</span>
        <button onClick={() => setConsultar((c) => !c)} style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--primary-texto, var(--primary))", background: "none", border: "none", cursor: "pointer" }}>{consultar ? "ocultar" : "consultar leads"}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr auto", gap: 10, alignItems: "end" }}>
        <Field label="Telefone do lead"><input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="11 9..." style={inp} /></Field>
        <Field label="Dia (vazio = hoje)"><GlassDate value={data} onChange={setData} placeholder="Hoje" style={inp} /></Field>
        <Botao variante="primario" icone="plus" onClick={add} carregando={busy}>lead</Botao>
      </div>
      {consultar && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12, maxHeight: 280, overflowY: "auto" }}>
          {leads.length === 0 && <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Nenhum lead.</p>}
          {leads.map((l) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: "var(--surface)", borderRadius: "var(--r-sm)" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{l.telefone}</span>
              <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{l.data.slice(0, 10).split("-").reverse().join("/")}</span>
              {l.vendido && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ok)", background: "color-mix(in srgb,var(--ok) 14%,transparent)", padding: "2px 8px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="circle-check" size={12} color="currentColor" /> vendido</span>}
              <BotaoIcone icone="trash" titulo="Remover lead" tamanho="sm" onClick={() => remover(l.id)} style={{ marginLeft: "auto" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NovoPedido({ onCreated, produtos, maisVendidos }: { onCreated: (p: ComercialPedido) => void; produtos: string[]; maisVendidos: string[] }) {
  const [f, setF] = useState({
    cliente_nome: "", telefone: "", ocupacao: "", fonte: FONTES[0].key as string,
    forma_pagamento: PAGAMENTOS[0], dias_conversa: "", valor_pedido: "",
    tipo_frete: FRETES[0], valor_frete: "", data_venda: hojeISO(),
  });
  const [prods, setProdutos] = useState<ComercialProduto[]>([{ nome: "", qtd: 1, valor: 0 }]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const celular = useIsMobile();
  // Linha de produto: no desktop continua "produto | qtd | valor | remover" numa
  // linha só; no celular o produto ocupa a linha inteira e qtd/valor/remover vão
  // pra segunda — as colunas fixas somavam 310px dentro de uma folha de ~250px.
  // A última coluna é `minmax(36px, auto)` e não 36px fixos: entre 701 e 900px a
  // fundação dá 44px de largura mínima ao botão só-de-ícone, e uma faixa rígida
  // de 36px o faria vazar pra fora da célula.
  // Todas as faixas em minmax(0, …): no desktop dão exatamente 100/150/36px, mas
  // no primeiro quadro do celular (useIsMobile ainda é false) elas encolhem em vez
  // de estourar a folha.
  const colsProduto = celular
    ? "minmax(0, 1fr) minmax(0, 1fr) 44px"
    : "minmax(0, 1fr) minmax(0, 100px) minmax(0, 150px) minmax(36px, auto)";

  const totalProdutos = prods.reduce((s, p) => s + (Number(p.qtd) || 0) * (Number(p.valor) || 0), 0);

  async function salvar() {
    if (!f.cliente_nome.trim()) { setMsg("Informe o nome do cliente."); return; }
    setBusy(true); setMsg(null);
    try {
      const body = {
        ...f,
        valor_pedido: Number(f.valor_pedido) || totalProdutos,  // se vazio, usa a soma dos produtos
        valor_frete: Number(f.valor_frete) || 0,
        dias_conversa: f.dias_conversa,
        produtos: prods.filter((p) => p.nome.trim()).map((p) => ({ nome: p.nome.trim(), qtd: Number(p.qtd) || 0, valor: Number(p.valor) || 0 })),
      };
      const r = await fetch("/api/comercial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (r.ok && d.pedido) onCreated(d.pedido);
      else setMsg("Falha ao salvar.");
    } finally { setBusy(false); }
  }

  return (
    <div className="glass glass-spec" style={{ padding: "clamp(12px, 3vw, 22px)", borderRadius: "var(--r-md)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 12 }}>
        <Field label="Nome do cliente *"><input value={f.cliente_nome} onChange={(e) => set("cliente_nome", e.target.value)} style={inp} /></Field>
        <Field label="Telefone"><input value={f.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="11 9..." style={inp} /></Field>
        <Field label="Ocupação"><input value={f.ocupacao} onChange={(e) => set("ocupacao", e.target.value)} style={inp} /></Field>
        <Field label="Fonte do lead">
          <GlassSelect value={f.fonte} onChange={(v) => set("fonte", v)} options={FONTES.map((o) => ({ value: o.key, label: o.label }))} />
        </Field>
        <Field label="Dias de conversa"><input type="number" min={0} value={f.dias_conversa} onChange={(e) => set("dias_conversa", e.target.value)} style={inp} /></Field>
        <Field label="Forma de pagamento">
          <GlassSelect value={f.forma_pagamento} onChange={(v) => set("forma_pagamento", v)} options={PAGAMENTOS.map((o) => ({ value: o, label: o }))} />
        </Field>
        <Field label="Data da venda"><GlassDate value={f.data_venda} onChange={(v) => set("data_venda", v)} placeholder="Selecionar data" style={inp} /></Field>
      </div>

      {/* Produtos (do banco de dados) */}
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: "18px 0 8px" }}>Produtos</h3>
      {/* Cabeçalho só faz sentido enquanto as colunas existem — quando a linha
          empilha, ele desalinharia com tudo. Os placeholders assumem o papel. */}
      {!celular && (
        <div style={{ display: "grid", gridTemplateColumns: colsProduto, gap: 8, padding: "0 2px 4px", fontSize: 11.5, fontWeight: 600, color: "var(--text-dim)" }}>
          <span>Produto</span><span>Quantidade</span><span>Valor unitário (R$)</span><span></span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {prods.map((p, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: colsProduto, gap: 8, alignItems: "center",
            ...(celular ? { padding: 10, borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)" } : null) }}>
            <GlassCombobox value={p.nome} onChange={(v) => setProdutos((l) => l.map((x, j) => j === i ? { ...x, nome: v } : x))} options={produtos} featured={maisVendidos} placeholder="Buscar produto…"
              style={celular ? { gridColumn: "1 / -1" } : undefined} />
            <input {...atributosDe("inteiro")} type="number" min={0} value={p.qtd || ""} onChange={(e) => setProdutos((l) => l.map((x, j) => j === i ? { ...x, qtd: Number(e.target.value) } : x))} placeholder="Qtd" title="Quantidade" aria-label="Quantidade" style={inp} />
            <MoneyInput value={p.valor} onChange={(n) => setProdutos((l) => l.map((x, j) => j === i ? { ...x, valor: n } : x))} placeholder="0,00" ariaLabel="Valor unitário" />
            <BotaoIcone icone="trash" titulo="Remover produto" variante="secundario" onClick={() => setProdutos((l) => l.filter((_, j) => j !== i))} />
          </div>
        ))}
        <Botao variante="sutil" tamanho="sm" icone="plus" onClick={() => setProdutos((l) => [...l, { nome: "", qtd: 1, valor: 0 }])} style={{ alignSelf: "flex-start" }}>produto</Botao>
      </div>

      {/* Valores + frete */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 12, marginTop: 18 }}>
        <Field label={`Valor do pedido (s/ frete)${f.valor_pedido ? "" : ` — soma ${fmtBRL(totalProdutos)}`}`}>
          <MoneyInput value={Number(f.valor_pedido) || 0} onChange={(n) => set("valor_pedido", n ? String(n) : "")} placeholder={fmtBRL(totalProdutos)} />
        </Field>
        <Field label="Tipo de frete">
          <GlassSelect value={f.tipo_frete} onChange={(v) => set("tipo_frete", v)} options={FRETES.map((o) => ({ value: o, label: o }))} />
        </Field>
        <Field label="Valor do frete"><MoneyInput value={Number(f.valor_frete) || 0} onChange={(n) => set("valor_frete", n ? String(n) : "")} /></Field>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
        <Botao variante="primario" onClick={salvar} carregando={busy}>
          {busy ? "Salvando…" : "Lançar pedido"}
        </Botao>
        {msg && <span style={{ fontSize: 13, color: "var(--perigo)" }}>{msg}</span>}
      </div>
    </div>
  );
}

function ListaPedidos({ pedidos, comFrete }: { pedidos: ComercialPedido[]; comFrete: boolean }) {
  return (
    <div className="glass glass-spec" style={{ padding: 18, borderRadius: "var(--r-md)" }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Pedidos lançados</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 460, overflowY: "auto" }}>
        {pedidos.length === 0 && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Nenhum pedido.</p>}
        {pedidos.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--surface)", borderRadius: "var(--r-sm)", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 13.5 }}>{p.cliente_nome}</strong>
            <span style={{ fontSize: 11.5, color: "var(--primary-texto, var(--primary))", background: "color-mix(in srgb,var(--primary) 14%,transparent)", padding: "2px 8px", borderRadius: "var(--r-xs)" }}>{fonteLabel(p.fonte)}</span>
            {p.dias_conversa != null && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{p.dias_conversa}d conversa</span>}
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{p.data_venda.slice(0, 10).split("-").reverse().join("/")}</span>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{p.vendedor_nome}</span>
            <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 15 }}>{fmtBRL(comFrete ? p.valor_pedido + p.valor_frete : p.valor_pedido)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block" }}><span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>{label}</span><div style={{ marginTop: 5 }}>{children}</div></label>;
}

// Campo de dinheiro com máscara: digita os números e vai preenchendo dos centavos
// pra cima (2 → R$ 0,02 · 25 → R$ 0,25 · 250 → R$ 2,50 · 25000 → R$ 250,00).
function MoneyInput({ value, onChange, placeholder, style, ariaLabel }: { value: number; onChange: (n: number) => void; placeholder?: string; style?: React.CSSProperties; ariaLabel?: string }) {
  const display = value ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 12); // só números
    onChange(digits ? parseInt(digits, 10) / 100 : 0);
  }
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--text-dim)", pointerEvents: "none" }}>R$</span>
      <input inputMode="numeric" value={display} onChange={handle} placeholder={placeholder ?? "0,00"} aria-label={ariaLabel} title={ariaLabel}
        style={{ ...inp, paddingLeft: 32, ...style }} />
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "9px 11px", color: "var(--text)", fontSize: 13.5 };
