"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { toast, confirmar } from "../Toast";
import { GlassDate, GlassSelect } from "../GlassPicker";
import { Acoes, Botao, Campo, Campos, PainelLateral } from "../ui/controles";
import { Abas } from "../ui/Abas";
import { Alerta } from "../ui/Alerta";
import { Kpi } from "../ui/primitives";
import { atributosDe } from "../ui/campos";
import { HIERARQUIA_DEFS, hierarquiaLabel } from "@/lib/estoque-hierarquia";
import { UNIDADE_PADRAO, normalizarUnidade, opcoesUnidade } from "@/lib/estoque-unidade-compra";
import {
  STATUS_PENDENTES, faltaGuardar, precisaGuardar,
  type StatusCompra, type EtapaRecebimento,
} from "@/lib/recebimento-etapas";
import type { Item } from "./tipos";

// ── Recebimento de Produtos / Entrada de Materiais (dashboard + compras) ──────
// O financeiro registra a compra aqui (com códigos); o tablet confirma a
// chegada. Esta tela mostra os pendentes, recebidos, parciais e divergências.
//
// A compra ESCOLHE o item do catálogo (não digita o nome). Enquanto era texto
// livre, `criarCompra` casava por nome exato: um "Almofada N3" no lugar de
// "Almofada N.3" já deixava a compra sem vínculo — e sem vínculo o custo da
// compra não gruda no item (a única fonte automática de custo do módulo) e o
// recebimento cria um item paralelo. Fornecedor e lugar são pelo mesmo motivo:
// texto solto não vira nada na aba Fornecedores nem na de Localização.

// A régua das duas etapas (chegou ≠ está no estoque) vem de
// lib/recebimento-etapas.ts, o MESMO módulo que o servidor usa pra decidir o
// status. Régua duplicada é como o número da tela e o do galpão divergem.
type Status = StatusCompra;
type Prioridade = "baixa" | "normal" | "alta" | "critica";
type Filtro = Status | "todos" | "pendentes" | "rastreio" | "guardar";

interface Compra {
  id: string; item_nome: string; categoria: string | null; unidade: string;
  estoque_item_id?: string | null; hierarquia?: string | null;
  quantidade_comprada: number; quantidade_recebida: number;
  /** Quanto já entrou no estoque. Ausente = banco sem supabase/recebimento_v4.sql. */
  quantidade_guardada?: number | null;
  chegou_em?: string | null; chegou_por?: string | null;
  guardado_em?: string | null; guardado_por?: string | null;
  fornecedor: string | null; fornecedor_id?: string | null; local_id?: string | null;
  /** Motivo de a mercadoria ter chegado sem entrar no estoque. */
  estoque_erro?: string | null;
  preco_unit: number | null;
  codigo_rastreio: string | null; codigo_recebimento: string | null; nota_fiscal: string | null; pedido_ref: string | null;
  palavra_chave: string | null;
  prioridade: Prioridade; previsao_entrega: string | null; status: Status;
  solicitante: string | null; criado_por: string | null; observacoes: string | null;
  comprado_em: string | null; created_at: string; updated_at: string;
}
interface Recebimento {
  id: string; recebido_por: string | null; quantidade_recebida: number; correto: boolean;
  divergencia_motivo: string | null; observacoes: string | null; foto_url: string | null;
  checklist: Record<string, boolean> | null; etapa?: EtapaRecebimento | null; created_at: string;
}
interface Dashboard {
  aguardando: number; recebidosHoje: number; divergencias: number; parciais: number;
  criticos: number; abaixoMinimo: number; comprasPendentes: number;
  /** Chegou e ninguém guardou. Opcional: painel velho (e as telas /dev-*) não manda. */
  aGuardar?: number;
}
interface Fornecedor { id: string; nome: string; ativo: boolean }
interface Local { id: string; nome: string; codigo: string; ativo: boolean }

const STATUS: Record<Status, { label: string; cor: string; bg: string }> = {
  solicitado:         { label: "Solicitado",           cor: "#6E6A7C", bg: "rgba(110,106,124,.14)" },
  comprado:           { label: "Comprado",             cor: "var(--azul)", bg: "rgba(59,130,246,.14)" },
  aguardando_entrega: { label: "Aguardando entrega",   cor: "var(--atencao)", bg: "rgba(224,134,0,.14)" },
  chegou_parcial:     { label: "Chegou parcialmente",  cor: "#A16207", bg: "rgba(161,98,7,.14)" },
  // Cor PRÓPRIA, e não mais um laranja: "chegou" não é espera de entrega nem
  // erro — é trabalho esperando alguém do galpão. Se dividisse a cor com
  // "aguardando entrega", a fila do corredor sumiria dentro da lista.
  chegou:             { label: "Chegou · falta guardar", cor: "var(--roxo)", bg: "color-mix(in srgb, var(--roxo) 14%, transparent)" },
  divergencia:        { label: "Recebido c/ divergência", cor: "var(--perigo)", bg: "rgba(224,52,43,.14)" },
  recebido:           { label: "Recebido e lançado",   cor: "var(--ok)", bg: "rgba(31,168,90,.14)" },
  cancelado:          { label: "Cancelado",            cor: "#9CA3AF", bg: "rgba(156,163,175,.14)" },
};
const PRIORIDADE: Record<Prioridade, { label: string; cor: string }> = {
  baixa:   { label: "Baixa",   cor: "#6E6A7C" },
  normal:  { label: "Normal",  cor: "var(--azul)" },
  alta:    { label: "Alta",    cor: "var(--atencao)" },
  critica: { label: "Crítica", cor: "var(--perigo)" },
};
// A lista de unidades morava aqui, privada e sem GALÃO — a planilha do galpão
// compra tinta em galão. Agora vem do vocabulário único
// (lib/estoque-unidade-compra.ts), o mesmo que o editor de item usa.
const PENDENTES: Status[] = STATUS_PENDENTES;

/** Valor especial dos seletores: "isto ainda não existe, crio agora". */
const NOVO = "__novo";

const prioridadeOrdem: Record<Prioridade, number> = { critica: 0, alta: 1, normal: 2, baixa: 3 };
const dataBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

export function RecebimentoPanel() {
  const [compras, setCompras] = useState<Compra[]>([]);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);
  const [erroCarga, setErroCarga] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("pendentes");
  const [novo, setNovo] = useState(false);
  const [detalhe, setDetalhe] = useState<Compra | null>(null);

  // Sem `catch` isto virava "Nenhuma compra neste filtro": um 500, ou o 401 em
  // JSON que o middleware devolve quando a sessão expira, deixavam `d.compras`
  // indefinido e a tela dizia que não há nada pendente. Quem abre a aba pra ver
  // o que está pra chegar acreditava.
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/recebimento/compras", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (d?.error === "tabela_ausente") { setSemTabela(true); setErroCarga(false); return; }
      if (!r.ok || !d || !Array.isArray(d.compras)) { setErroCarga(true); return; }
      setCompras(d.compras as Compra[]);
      setDash((d.dashboard as Dashboard) ?? null);
      setSemTabela(false); setErroCarga(false);
    } catch {
      setErroCarga(true);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // A FILA DO CORREDOR: chegou, ninguém guardou. É a lista que precisava
  // existir em algum lugar — sem ela a mercadoria dorme no corredor e o único
  // jeito de descobrir é tropeçar na caixa.
  const aGuardar = useMemo(() => compras.filter(precisaGuardar), [compras]);

  const filtradas = useMemo(() => {
    let lista = compras;
    if (filtro === "pendentes") lista = compras.filter((c) => PENDENTES.includes(c.status));
    else if (filtro === "guardar") lista = aGuardar;
    else if (filtro === "rastreio") lista = compras.filter((c) => !!c.codigo_rastreio);
    else if (filtro !== "todos") lista = compras.filter((c) => c.status === filtro);
    // Na fila de guardar quem vem primeiro é quem está parado há mais tempo —
    // nas outras, a prioridade da compra. Ordenar a fila por prioridade faria
    // a caixa de terça esperar atrás da que chegou agora.
    if (filtro === "guardar") {
      return [...lista].sort((a, b) => (a.chegou_em ?? a.updated_at).localeCompare(b.chegou_em ?? b.updated_at));
    }
    return [...lista].sort((a, b) => prioridadeOrdem[a.prioridade] - prioridadeOrdem[b.prioridade] || b.created_at.localeCompare(a.created_at));
  }, [compras, filtro, aGuardar]);

  if (loading) return <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Carregando recebimentos…</p>;
  if (semTabela) return (
    <div className="glass" style={{ padding: 20, borderRadius: "var(--r-md)", fontSize: 14, color: "var(--text)" }}>
      <strong>Falta criar as tabelas.</strong> Rode <code>supabase/recebimento.sql</code> no Supabase novo e recarregue.
    </div>
  );
  if (erroCarga) return (
    <div className="glass" style={{ padding: 24, borderRadius: "var(--r-md)", color: "var(--text-dim)" }}>
      <p style={{ marginBottom: 12 }}>Não foi possível carregar as compras agora.</p>
      <Botao icone="refresh" onClick={() => { setLoading(true); load(); }}>Tentar de novo</Botao>
    </div>
  );

  // O número da fila vem do servidor (contagem exata, com `.limit()` nenhum no
  // caminho); o fallback local existe pro painel que ainda não manda o campo e
  // pras telas /dev-*, que servem um dashboard fixo.
  const numeros: Record<string, number> = { ...dash, aGuardar: dash?.aGuardar ?? aGuardar.length };

  const cards: { k: keyof Dashboard; label: string; icon: string; cor: string }[] = [
    // "A chegar" e não "Aguardando chegada": o rótulo do Kpi é uma linha só e
    // com reticências — a 390px a versão longa virava "Aguardando chega…".
    { k: "aguardando", label: "A chegar", icon: "truck-loading", cor: "var(--atencao)" },
    // Logo depois de "A chegar" porque é o passo seguinte do mesmo caminho: a
    // caixa que passou da porta e ainda não é estoque.
    { k: "aGuardar", label: "A guardar", icon: "package-import", cor: "var(--roxo)" },
    { k: "recebidosHoje", label: "Recebidos hoje", icon: "circle-check", cor: "var(--ok)" },
    { k: "divergencias", label: "Com divergência", icon: "alert-triangle", cor: "var(--perigo)" },
    { k: "parciais", label: "Parciais em aberto", icon: "package", cor: "#A16207" },
    { k: "criticos", label: "Materiais críticos", icon: "target", cor: "var(--perigo)" },
    { k: "abaixoMinimo", label: "Abaixo do mínimo", icon: "chart-line", cor: "var(--azul)" },
  ];

  return (
    <div>
      {dash && (
        // `.kpi-row`: a 320px o `minmax(min(100%, 160px), 1fr)` cabe UMA coluna,
        // e os seis números viravam 1070px de rolagem antes da primeira compra
        // aparecer na tela. A peça da fundação transforma a fileira em carrossel
        // com encaixe no celular — dois à vista, o resto a um deslize — e no
        // computador não muda nada.
        <div className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 160px), 1fr))", gap: 10, marginBottom: 16 }}>
          {cards.map((c) => (
            <Kpi key={c.k} icon={c.icon} label={c.label} value={numeros[c.k] ?? 0}
              color={(numeros[c.k] ?? 0) > 0 ? c.cor : "var(--text)"} />
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {/* Oito filtros não cabem numa linha de celular — e, o que passou
            despercebido, também não cabem no NOTEBOOK: a `.tab-strip` da
            fundação só rola sozinha até 900px, e esta fileira mede 765px numa
            coluna de 676px a 1024px. Sem o `overflowX` no invólucro ela vazava
            90px pra fora da coluna e a PÁGINA ganhava 54px de rolagem lateral
            (a faixa das seções do Estoque tinha o mesmo furo). Entre 901px e
            ~1113px, que é a janela de notebook mais comum, "Com rastreio" e
            "Todos" ficavam fora do recorte da coluna.
            Medido a 1024px: página 54 → 0; fileira 765/674, rolando dentro do
            invólucro. Nada de `mask-image` nem `transform` aqui — os dois
            prendem popover (ver CLAUDE.md). */}
        <div style={{ flex: "1 1 auto", minWidth: 0, overflowX: "auto" }}>
          <Abas<Filtro>
            className="ui-abas--sub" ariaLabel="Filtro das compras" valor={filtro} onMuda={setFiltro}
            itens={[
              { valor: "pendentes", rotulo: "Pendentes" },
              // Com contador no rótulo: a fila do corredor só serve se dá pra
              // ver que ela existe sem entrar nela.
              { valor: "guardar", rotulo: `A guardar${numeros.aGuardar > 0 ? ` (${numeros.aGuardar})` : ""}` },
              { valor: "aguardando_entrega", rotulo: "Aguardando" },
              { valor: "chegou_parcial", rotulo: "Parciais" },
              { valor: "divergencia", rotulo: "Divergência" },
              { valor: "recebido", rotulo: "Recebidos" },
              { valor: "rastreio", rotulo: "Com rastreio" },
              { valor: "todos", rotulo: "Todos" },
            ]}
          />
        </div>
        <Botao variante="primario" icone="package-import" onClick={() => setNovo(true)}>Registrar compra</Botao>
      </div>

      {filtradas.length === 0 ? (
        <p style={{ color: "var(--text-dim)", fontSize: 14, padding: "18px 0" }}>
          {filtro === "guardar"
            ? "Nada esperando no corredor: tudo que chegou já foi conferido e guardado."
            : "Nenhuma compra neste filtro."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtradas.map((c) => <CompraCard key={c.id} c={c} onAbrir={() => setDetalhe(c)} />)}
        </div>
      )}

      {novo && <NovaCompra onFechar={() => setNovo(false)} onCriada={() => { setNovo(false); load(); }} />}
      {detalhe && <DetalheCompra compra={detalhe} onFechar={() => setDetalhe(null)} onMudou={load} />}
    </div>
  );
}

function CompraCard({ c, onAbrir }: { c: Compra; onAbrir: () => void }) {
  const st = STATUS[c.status]; const pr = PRIORIDADE[c.prioridade];
  const faltam = Math.max(0, c.quantidade_comprada - c.quantidade_recebida);
  const guardar = precisaGuardar(c) ? faltaGuardar(c) : 0;
  return (
    <div onClick={onAbrir} className="glass glass-spec ui-card-alvo" style={{ padding: 16, borderRadius: "var(--r-md)", cursor: "pointer", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 15.5, color: "var(--text)" }}>{c.item_nome}</strong>
          {c.prioridade !== "normal" && c.prioridade !== "baixa" && (
            <span style={{ fontSize: 10.5, fontWeight: 800, color: pr.cor, border: `1px solid ${pr.cor}`, borderRadius: 999, padding: "1px 8px" }}>{pr.label.toUpperCase()}</span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 3 }}>
          {c.categoria ? `${c.categoria} · ` : ""}{c.fornecedor || "sem fornecedor"}{c.previsao_entrega ? ` · previsão ${dataBR(c.previsao_entrega)}` : ""}
        </div>
        {(c.codigo_rastreio || c.codigo_recebimento || c.nota_fiscal || c.pedido_ref || c.palavra_chave) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {c.codigo_rastreio && <Codigo icon="truck" v={c.codigo_rastreio} />}
            {c.codigo_recebimento && <Codigo icon="checklist" v={c.codigo_recebimento} />}
            {c.palavra_chave && <Codigo icon="key" v={c.palavra_chave} destaque />}
            {c.nota_fiscal && <Codigo icon="file-text" v={`NF ${c.nota_fiscal}`} />}
            {c.pedido_ref && <Codigo icon="package" v={c.pedido_ref} />}
          </div>
        )}
      </div>
      {/* `marginLeft: auto`: quando a linha quebra a 320px este bloco ganha uma
          fileira só pra ele, e sem isso ele nascia colado à esquerda com o
          texto alinhado à direita dentro de si — os números apareciam num
          recuo aleatório, no meio do card. Encostado à direita, a quantidade e
          o status ficam na mesma margem que têm no computador. */}
      <div style={{ textAlign: "right", marginLeft: "auto" }}>
        <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 700 }}>{c.quantidade_recebida} / {c.quantidade_comprada} {c.unidade}</div>
        {faltam > 0 && <div style={{ fontSize: 11.5, color: "var(--atencao)" }}>faltam {faltam}</div>}
        {/* Dois números diferentes: `faltam` é o que não chegou; `guardar` é o
            que chegou e não é estoque. Sem este, a única pista de que a caixa
            está no corredor seria o rótulo do status. */}
        {guardar > 0 && <div style={{ fontSize: 11.5, color: "var(--roxo)", fontWeight: 700 }}>guardar {guardar}</div>}
        <span style={{ display: "inline-block", marginTop: 6, fontSize: 11.5, fontWeight: 800, color: st.cor, background: st.bg, borderRadius: 999, padding: "3px 10px" }}>{st.label}</span>
      </div>
      {c.estoque_erro && <AvisoEstoque motivo={c.estoque_erro} />}
    </div>
  );
}

/** A mercadoria chegou e o estoque não subiu. Precisa aparecer na LISTA, não só
 *  no detalhe: é o único caso em que o número da tela e o do galpão discordam. */
// Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
function AvisoEstoque({ motivo }: { motivo: string }) {
  return (
    <Alerta tom="perigo" style={{ flex: "1 1 100%" }}>
      Chegou, mas não entrou no estoque: {motivo}
    </Alerta>
  );
}

function Codigo({ icon, v, destaque }: { icon: string; v: string; destaque?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: destaque ? 800 : 600,
      color: destaque ? "var(--primary-texto)" : "var(--text)", background: destaque ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "var(--surface-2)", borderRadius: "var(--r-xs)", padding: "2px 8px" }}>
      <Icon name={icon} size={12} color={destaque ? "var(--primary-texto)" : "var(--text-dim)"} /> {v}
    </span>
  );
}

/** Título de bloco dentro do formulário — separa "o que" de "códigos" e "quem". */
function Secao({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: "1 / -1", marginTop: 6, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 11.5, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-dim)" }}>
      {children}
    </div>
  );
}

// ── Registrar compra ─────────────────────────────────────────────────────────
function NovaCompra({ onFechar, onCriada }: { onFechar: () => void; onCriada: () => void }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [podeCriarFornecedor, setPodeCriarFornecedor] = useState(false);
  const [podeCriarLocal, setPodeCriarLocal] = useState(false);

  const [itemId, setItemId] = useState("");          // id do catálogo, NOVO, ou ""
  const [f, setF] = useState({
    item_nome: "", categoria: "", hierarquia: "", unidade: UNIDADE_PADRAO, quantidade_comprada: "",
    fornecedor_id: "", fornecedor_novo: "", local_id: "", local_novo: "", local_novo_codigo: "",
    preco_unit: "", codigo_rastreio: "", codigo_recebimento: "", palavra_chave: "", nota_fiscal: "",
    pedido_ref: "", prioridade: "normal" as Prioridade, previsao_entrega: "", solicitante: "", observacoes: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  // Três listas, uma vez, ao ABRIR o formulário — nunca em poll. O catálogo é o
  // mesmo /api/estoque-itens que as abas Localização e Fornecedores já usam.
  useEffect(() => {
    (async () => {
      const [ri, rf, rl] = await Promise.all([
        fetch("/api/estoque-itens", { cache: "no-store" }),
        fetch("/api/estoque/fornecedores", { cache: "no-store" }),
        fetch("/api/estoque/locais", { cache: "no-store" }),
      ]);
      const di = await ri.json().catch(() => ({}));
      const df = await rf.json().catch(() => ({}));
      const dl = await rl.json().catch(() => ({}));
      setItens((di.itens as Item[]) ?? []);
      setFornecedores((df.fornecedores as Fornecedor[]) ?? []);
      setPodeCriarFornecedor(!!df.podeGerir);
      setLocais((dl.locais as Local[]) ?? []);
      setPodeCriarLocal(!!dl.podeGerir);
    })().catch(() => { /* seletor vazio + campo de "criar novo" continua servindo */ });
  }, []);

  const itemNovo = itemId === NOVO;
  const itemEscolhido = useMemo(() => itens.find((i) => i.id === itemId) ?? null, [itens, itemId]);

  // As categorias vêm do próprio catálogo. A lista fixa de 11 que morava aqui
  // não era a taxonomia de ninguém mais no sistema.
  const categorias = useMemo(() => {
    const s = new Set<string>();
    for (const i of itens) if (i.categoria) s.add(i.categoria);
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [itens]);

  function escolherItem(v: string) {
    setItemId(v);
    const it = itens.find((i) => i.id === v);
    if (it) setF((s) => ({ ...s, item_nome: it.nome, categoria: it.categoria ?? "", unidade: normalizarUnidade(it.unidade) || UNIDADE_PADRAO, hierarquia: it.hierarquia ?? "" }));
    else if (v === NOVO) setF((s) => ({ ...s, item_nome: "", categoria: "", hierarquia: "", unidade: UNIDADE_PADRAO }));
  }

  /** Cria fornecedor/lugar na hora e devolve o id. `null` = deu ruim (já avisou). */
  async function criarNaHora(url: string, corpo: Record<string, unknown>, chave: "fornecedor" | "local"): Promise<string | null> {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const cod = String(d.error ?? "");
      toast.erro(
        cod === "nome_duplicado" ? "Já existe um fornecedor com esse nome — escolha ele na lista."
        : cod === "codigo_duplicado" ? "Já existe um lugar com esse código."
        : cod === "forbidden" ? `Você não tem permissão para cadastrar ${chave === "fornecedor" ? "fornecedores" : "lugares"}.`
        : "Não consegui cadastrar agora.",
      );
      return null;
    }
    return (d[chave]?.id as string) ?? null;
  }

  async function salvar() {
    const nome = (itemNovo ? f.item_nome : itemEscolhido?.nome ?? f.item_nome).trim();
    if (!nome) { toast.erro("Escolha o item do catálogo ou dê um nome ao item novo."); return; }
    if (!(Number(f.quantidade_comprada) > 0)) { toast.erro("Informe a quantidade comprada."); return; }
    // Hierarquia só é exigida no item NOVO: é ela que o item vai herdar quando o
    // recebimento criar o cadastro. Sem ela o item nasce fora das 8 abas.
    if (itemNovo && !f.hierarquia) { toast.erro("Escolha a hierarquia do item novo."); return; }

    setBusy(true);
    try {
      let fornecedor_id: string | null = f.fornecedor_id && f.fornecedor_id !== NOVO ? f.fornecedor_id : null;
      if (f.fornecedor_id === NOVO && f.fornecedor_novo.trim()) {
        fornecedor_id = await criarNaHora("/api/estoque/fornecedores", { nome: f.fornecedor_novo.trim() }, "fornecedor");
        if (!fornecedor_id) return;
      }
      let local_id: string | null = f.local_id && f.local_id !== NOVO ? f.local_id : null;
      if (f.local_id === NOVO && f.local_novo.trim()) {
        if (!f.local_novo_codigo.trim()) { toast.erro("Dê um código ao lugar novo (é o que vai na etiqueta)."); return; }
        local_id = await criarNaHora("/api/estoque/locais", { nome: f.local_novo.trim(), codigo: f.local_novo_codigo.trim() }, "local");
        if (!local_id) return;
      }

      const nomeFornecedor = f.fornecedor_id === NOVO
        ? f.fornecedor_novo.trim()
        : fornecedores.find((x) => x.id === f.fornecedor_id)?.nome ?? null;

      const r = await fetch("/api/recebimento/compras", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_nome: nome,
          estoque_item_id: itemNovo ? null : itemId || null,
          hierarquia: itemNovo ? f.hierarquia : null,
          categoria: f.categoria || null,
          unidade: f.unidade,
          quantidade_comprada: Number(f.quantidade_comprada),
          // O nome continua indo junto do id: é ele que aparece no card e no
          // tablet, e sobrevive se o fornecedor for arquivado depois.
          fornecedor: nomeFornecedor, fornecedor_id, local_id,
          preco_unit: f.preco_unit ? Number(f.preco_unit) : null,
          codigo_rastreio: f.codigo_rastreio, codigo_recebimento: f.codigo_recebimento,
          palavra_chave: f.palavra_chave, nota_fiscal: f.nota_fiscal, pedido_ref: f.pedido_ref,
          prioridade: f.prioridade, previsao_entrega: f.previsao_entrega,
          solicitante: f.solicitante, observacoes: f.observacoes,
        }),
      });
      if (r.ok) {
        toast.ok("Compra registrada.");
        // O servidor avisa quando teve de descartar campo por falta de coluna
        // no banco (fornecedor/lugar/hierarquia, enquanto o SQL pendente não
        // roda). Antes isso era silêncio: a pessoa escolhia a prateleira, lia
        // "Compra registrada" e a escolha ia pro lixo. Fica DEPOIS do "ok",
        // então a última linha na tela é a que pede ação.
        const d = await r.json().catch(() => null as { aviso?: string | null } | null);
        if (d?.aviso) toast.info(d.aviso);
        onCriada();
      }
      else toast.erro("Não consegui registrar a compra.");
    } finally { setBusy(false); }
  }

  return (
    <PainelLateral
      titulo="Registrar compra"
      subtitulo="Aparece no tablet e no painel como pendente de chegada."
      onFechar={onFechar}
      largura={560}
      rodape={
        <Acoes>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={salvar} carregando={busy}>Registrar compra</Botao>
        </Acoes>
      }
    >
      <Campos>
        <Campo label="Item do catálogo" largo dica="Escolher da lista é o que faz o custo da compra grudar no item quando ela chegar.">
          {(id) => (
            <GlassSelect id={id} value={itemId} onChange={escolherItem} searchable placeholder="Buscar no catálogo…"
              options={[
                { value: NOVO, label: "Item que ainda não existe no catálogo…" },
                ...itens.map((i) => ({ value: i.id, label: `${i.nome}${i.hierarquia ? ` · ${hierarquiaLabel(i.hierarquia)}` : ""}` })),
              ]} />
          )}
        </Campo>

        {itemNovo && (
          <>
            <Campo label="Nome do item novo" largo>
              {(id) => <input id={id} {...atributosDe("nome")} value={f.item_nome} onChange={(e) => set("item_nome", e.target.value)} placeholder="Ex.: Almofada N.3 vermelha" autoFocus />}
            </Campo>
            <Campo label="Hierarquia" dica="Define em qual aba do catálogo o item vai nascer.">
              {(id) => (
                <GlassSelect id={id} value={f.hierarquia} onChange={(v) => set("hierarquia", v)} placeholder="Escolher…"
                  options={HIERARQUIA_DEFS.map((h) => ({ value: h.key, label: h.label }))} />
              )}
            </Campo>
            <Campo label="Categoria (opcional)">
              {(id) => (
                <GlassSelect id={id} value={f.categoria} onChange={(v) => set("categoria", v)} placeholder="—"
                  options={[{ value: "", label: "—" }, ...categorias.map((c) => ({ value: c, label: c }))]} />
              )}
            </Campo>
          </>
        )}

        <Campo label="Quantidade">
          {(id) => <input id={id} {...atributosDe("numero")} type="number" value={f.quantidade_comprada} onChange={(e) => set("quantidade_comprada", e.target.value)} />}
        </Campo>
        <Campo label="Unidade">
          {(id) => (
            <GlassSelect id={id} value={f.unidade} onChange={(v) => set("unidade", normalizarUnidade(v) || UNIDADE_PADRAO)} disabled={!!itemEscolhido}
              title={itemEscolhido ? "A unidade vem do cadastro do item" : undefined}
              options={opcoesUnidade(f.unidade)} />
          )}
        </Campo>

        <Campo label="Fornecedor" largo>
          {(id) => (
            <GlassSelect id={id} value={f.fornecedor_id} onChange={(v) => set("fornecedor_id", v)} placeholder="—"
              options={[
                { value: "", label: "—" },
                ...fornecedores.filter((x) => x.ativo || x.id === f.fornecedor_id).map((x) => ({ value: x.id, label: x.nome })),
                ...(podeCriarFornecedor ? [{ value: NOVO, label: "Cadastrar fornecedor novo…" }] : []),
              ]} />
          )}
        </Campo>
        {f.fornecedor_id === NOVO && (
          <Campo label="Nome do fornecedor novo" largo dica="Cadastrado na hora, e já aparece na aba Fornecedores.">
            {(id) => <input id={id} {...atributosDe("nome")} value={f.fornecedor_novo} onChange={(e) => set("fornecedor_novo", e.target.value)} placeholder="Razão social ou nome fantasia" />}
          </Campo>
        )}

        <Campo label="Onde vai ser guardado" largo dica="É o que faz a aba Localização parar de mostrar prateleira vazia.">
          {(id) => (
            <GlassSelect id={id} value={f.local_id} onChange={(v) => set("local_id", v)} placeholder="—"
              options={[
                { value: "", label: "—" },
                ...locais.filter((x) => x.ativo || x.id === f.local_id).map((x) => ({ value: x.id, label: `${x.codigo} · ${x.nome}` })),
                ...(podeCriarLocal ? [{ value: NOVO, label: "Cadastrar lugar novo…" }] : []),
              ]} />
          )}
        </Campo>
        {f.local_id === NOVO && (
          <>
            <Campo label="Nome do lugar novo">
              {(id) => <input id={id} value={f.local_novo} onChange={(e) => set("local_novo", e.target.value)} placeholder="Ex.: Prateleira B2" />}
            </Campo>
            <Campo label="Código" dica="Vai pra etiqueta física.">
              {(id) => <input id={id} {...atributosDe("codigo")} value={f.local_novo_codigo} onChange={(e) => set("local_novo_codigo", e.target.value.toUpperCase())} placeholder="Ex.: B2" />}
            </Campo>
          </>
        )}

        <Campo label="Preço unit. (R$)">
          {(id) => <input id={id} {...atributosDe("dinheiro")} type="number" value={f.preco_unit} onChange={(e) => set("preco_unit", e.target.value)} />}
        </Campo>
        <Campo label="Prioridade">
          {(id) => (
            <GlassSelect id={id} value={f.prioridade} onChange={(v) => set("prioridade", v)}
              options={(["baixa", "normal", "alta", "critica"] as const).map((p) => ({ value: p, label: PRIORIDADE[p].label }))} />
          )}
        </Campo>
        {/* Sem render-prop: o `GlassDate` não recebe `id`, e um `<label for>`
            apontando pra id que não existe é pior que rótulo nenhum. */}
        <Campo label="Previsão de entrega" largo>
          <GlassDate value={f.previsao_entrega} onChange={(v) => set("previsao_entrega", v)} placeholder="Selecionar data" />
        </Campo>

        <Secao>Códigos da entrega</Secao>
        <Campo label="Código de rastreio">
          {(id) => <input id={id} {...atributosDe("codigo")} value={f.codigo_rastreio} onChange={(e) => set("codigo_rastreio", e.target.value)} />}
        </Campo>
        <Campo label="Código de recebimento">
          {(id) => <input id={id} {...atributosDe("codigo")} value={f.codigo_recebimento} onChange={(e) => set("codigo_recebimento", e.target.value)} />}
        </Campo>
        <Campo label="Palavra-chave / senha de entrega">
          {(id) => <input id={id} {...atributosDe("codigo")} value={f.palavra_chave} onChange={(e) => set("palavra_chave", e.target.value)} />}
        </Campo>
        <Campo label="Nota fiscal">
          {(id) => <input id={id} {...atributosDe("codigo")} value={f.nota_fiscal} onChange={(e) => set("nota_fiscal", e.target.value)} />}
        </Campo>
        <Campo label="Nº do pedido">
          {(id) => <input id={id} {...atributosDe("codigo")} value={f.pedido_ref} onChange={(e) => set("pedido_ref", e.target.value)} />}
        </Campo>

        <Secao>Quem pediu</Secao>
        <Campo label="Solicitante">
          {(id) => <input id={id} {...atributosDe("nome")} value={f.solicitante} onChange={(e) => set("solicitante", e.target.value)} />}
        </Campo>
        <Campo label="Observações" largo>
          {(id) => <textarea id={id} value={f.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={2} />}
        </Campo>
      </Campos>
    </PainelLateral>
  );
}

// ── Detalhe da compra ────────────────────────────────────────────────────────
function DetalheCompra({ compra, onFechar, onMudou }: { compra: Compra; onFechar: () => void; onMudou: () => void }) {
  const [recebimentos, setRecebimentos] = useState<Recebimento[]>([]);
  const [c, setC] = useState<Compra>(compra);
  const [busy, setBusy] = useState(false);
  const st = STATUS[c.status];
  const faltam = Math.max(0, c.quantidade_comprada - c.quantidade_recebida);
  const aGuardar = precisaGuardar(c) ? faltaGuardar(c) : 0;
  const noEstoque = Math.max(0, c.quantidade_recebida - aGuardar);

  const carregar = useCallback(() => {
    fetch(`/api/recebimento/compras/${compra.id}`, { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (d.compra) setC(d.compra); setRecebimentos(d.recebimentos ?? []);
    }).catch(() => { /* o card já tem o essencial; o histórico fica vazio */ });
  }, [compra.id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function agir(acao: "cancelar" | "encerrar") {
    const ok = acao === "cancelar"
      ? await confirmar("Cancelar esta compra?", { detalhe: "Ela sai dos pendentes e fica marcada como cancelada.", perigo: true })
      : await confirmar("Encerrar esta compra com divergência?", { detalhe: "Ela sai dos pendentes como recebida, e a divergência fica anotada nas observações." });
    if (!ok) return;
    setBusy(true);
    const r = await fetch(`/api/recebimento/compras/${compra.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }),
    });
    setBusy(false);
    if (!r.ok) { toast.erro("Não consegui atualizar a compra."); return; }
    toast.ok(acao === "cancelar" ? "Compra cancelada." : "Compra encerrada.");
    onMudou(); onFechar();
  }

  // Compra que chegou (ainda que torta) precisa de uma saída que não seja
  // mentir que foi cancelada: senão ela fica presa nos pendentes pra sempre.
  const podeEncerrar = PENDENTES.includes(c.status) && c.quantidade_recebida > 0;
  const podeCancelar = c.status !== "cancelado" && c.status !== "recebido";

  return (
    <PainelLateral
      titulo={c.item_nome}
      subtitulo={<span style={{ fontWeight: 800, color: st.cor }}>{st.label}</span>}
      onFechar={onFechar}
      largura={620}
      rodape={podeEncerrar || podeCancelar ? (
        <Acoes>
          {podeCancelar && <Botao variante="perigo" icone="x" onClick={() => agir("cancelar")} disabled={busy}>Cancelar compra</Botao>}
          {podeEncerrar && <Botao icone="check" onClick={() => agir("encerrar")} disabled={busy}>Encerrar com divergência</Botao>}
        </Acoes>
      ) : undefined}
    >
      {c.estoque_erro && <div style={{ marginBottom: 14 }}><AvisoEstoque motivo={c.estoque_erro} /></div>}

      {/* A entrada muda os três números e o histórico logo abaixo — recarregar
          o detalhe (e não só a lista atrás) é o que evita a tela dizer que
          ainda falta guardar o que acabou de entrar. */}
      {aGuardar > 0 && <BlocoGuardar c={c} pendente={aGuardar} onFeito={() => { carregar(); onMudou(); }} />}

      {/* Três números, não dois: comprado, chegou e no estoque. Enquanto eram
          dois, "recebido" respondia por duas perguntas diferentes e a caixa
          fechada no corredor contava como estoque. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12, marginBottom: 16 }}>
        <div className="glass" style={{ padding: 14, borderRadius: "var(--r-sm)" }}>
          <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 700 }}>Comprado</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{c.quantidade_comprada} <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{c.unidade}</span></div>
        </div>
        <div className="glass" style={{ padding: 14, borderRadius: "var(--r-sm)" }}>
          <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 700 }}>Chegou</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: faltam > 0 ? "var(--atencao)" : "var(--ok)" }}>{c.quantidade_recebida} <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{c.unidade}</span></div>
          {faltam > 0 && <div style={{ fontSize: 11.5, color: "var(--perigo)" }}>Divergência — faltam {faltam}</div>}
        </div>
        <div className="glass" style={{ padding: 14, borderRadius: "var(--r-sm)" }}>
          <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 700 }}>No estoque</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: aGuardar > 0 ? "var(--roxo)" : "var(--ok)" }}>{noEstoque} <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{c.unidade}</span></div>
          {aGuardar > 0 && <div style={{ fontSize: 11.5, color: "var(--roxo)" }}>faltam guardar {aGuardar}</div>}
        </div>
      </div>

      <Linha k="Chegou em" v={c.chegou_em ? `${new Date(c.chegou_em).toLocaleString("pt-BR")}${c.chegou_por ? ` · ${c.chegou_por}` : ""}` : null} />
      <Linha k="Guardado em" v={c.guardado_em ? `${new Date(c.guardado_em).toLocaleString("pt-BR")}${c.guardado_por ? ` · ${c.guardado_por}` : ""}` : null} />
      <Linha k="Fornecedor" v={c.fornecedor} />
      <Linha k="Categoria" v={c.categoria} />
      <Linha k="Hierarquia do item novo" v={c.hierarquia ? hierarquiaLabel(c.hierarquia) : null} />
      <Linha k="No catálogo" v={c.estoque_item_id ? "vinculado" : "sem vínculo — o item será criado ao receber"} />
      <Linha k="Prioridade" v={PRIORIDADE[c.prioridade].label} />
      <Linha k="Previsão de entrega" v={dataBR(c.previsao_entrega)} />
      <Linha k="Código de rastreio" v={c.codigo_rastreio} />
      <Linha k="Código de recebimento" v={c.codigo_recebimento} />
      <Linha k="Palavra-chave / senha" v={c.palavra_chave} />
      <Linha k="Nota fiscal" v={c.nota_fiscal} />
      <Linha k="Nº do pedido" v={c.pedido_ref} />
      <Linha k="Solicitante" v={c.solicitante} />
      <Linha k="Registrado por" v={c.criado_por} />
      {c.observacoes && <Linha k="Observações" v={c.observacoes} />}

      <h4 style={{ fontSize: 14, fontWeight: 800, margin: "18px 0 8px" }}>Recebimentos ({recebimentos.length})</h4>
      {recebimentos.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Ainda não chegou.</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {recebimentos.map((r) => (
            <div key={r.id} className="glass" style={{ padding: 12, borderRadius: "var(--r-sm)", display: "flex", gap: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.foto_url && <a href={r.foto_url} target="_blank" rel="noreferrer"><img src={r.foto_url} alt="recebido" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "var(--r-xs)" }} /></a>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 14 }}>{r.quantidade_recebida} {c.unidade}</strong>
                  {/* Sem isto, "chegou 10" e "guardei 10" viram duas linhas
                      iguais no histórico e parecem entrada em dobro. */}
                  <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "1px 8px", ...ETAPA_SELO[r.etapa ?? "ambas"].estilo }}>
                    {ETAPA_SELO[r.etapa ?? "ambas"].label}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: r.correto ? "var(--ok)" : "var(--perigo)" }}>{r.correto ? "OK" : "DIVERGÊNCIA"}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>
                  {r.recebido_por || "—"} · {new Date(r.created_at).toLocaleString("pt-BR")}
                </div>
                {r.divergencia_motivo && <div style={{ fontSize: 12, color: "var(--perigo)", marginTop: 3 }}>Motivo: {r.divergencia_motivo}</div>}
                {r.observacoes && <div style={{ fontSize: 12, color: "var(--text)", marginTop: 3 }}>{r.observacoes}</div>}
                {/* Cada item do checklist é um selo próprio: a linha única com
                    "✓/✗" era uma tira de ~340px que não cabia no celular (e os
                    dois glifos faziam papel de ícone, que aqui é Tabler). */}
                {r.checklist && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                    {Object.entries(r.checklist).map(([k, ok]) => (
                      <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Icon name={ok ? "check" : "x"} size={11} color={ok ? "var(--ok)" : "var(--perigo)"} /> {CHECK_LABELS[k] || k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PainelLateral>
  );
}

/**
 * ETAPA 2 pela web — a caixa chegou, alguém precisa dar entrada.
 *
 * Fica DENTRO do painel de detalhe, e não num modal por cima: modal aberto de
 * dentro de um `PainelLateral` precisa de `--z-modal` pra não nascer atrás da
 * gaveta, e o que este bloco pede (um número e um botão) não justifica outra
 * camada. No celular a linha quebra sozinha e o botão ocupa a largura toda.
 */
function BlocoGuardar({ c, pendente, onFeito }: { c: Compra; pendente: number; onFeito: () => void }) {
  const [qtd, setQtd] = useState(String(pendente));
  const [busy, setBusy] = useState(false);

  async function guardar() {
    const n = Number(qtd);
    if (!(n > 0)) { toast.erro("Informe quanto está entrando no estoque."); return; }
    if (n > pendente) { toast.erro(`Só ${pendente} ${c.unidade} chegaram e ainda não foram guardados.`); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/recebimento/compras/${c.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "guardar", quantidade: n }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const cod = String(d.error ?? "");
        toast.erro(
          cod === "nada_para_guardar" ? "Esta compra não tem nada esperando pra ser guardado."
          : cod === "quantidade_maior_que_o_recebido" ? "Não dá pra guardar mais do que chegou."
          : cod === "tabela_ausente" ? "Falta criar as tabelas do recebimento no banco."
          : "Não consegui dar entrada agora.",
        );
        return;
      }
      // O estoque pode não ter subido mesmo com a chamada indo bem (item
      // apagado, etiqueta que não nasce). Dizer "guardado" nesse caso é
      // exatamente o silêncio que fazia a compra fechar sem estoque.
      if (d.estoqueFalhou) toast.erro(`Não entrou no estoque: ${d.estoqueFalhou}`);
      else if (d.faltaGuardar > 0) toast.ok(`Entrou no estoque. Ainda faltam ${d.faltaGuardar} ${c.unidade}.`);
      else toast.ok(`No estoque${d.estoque?.nome ? `: ${d.estoque.nome}` : ""}.`);
      onFeito();
    } finally { setBusy(false); }
  }

  return (
    <div style={{
      marginBottom: 16, padding: 14, borderRadius: "var(--r-md)",
      border: "1px solid color-mix(in srgb, var(--roxo) 42%, transparent)",
      background: "color-mix(in srgb, var(--roxo) 10%, transparent)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Icon name="package-import" size={16} color="var(--roxo)" />
        <strong style={{ fontSize: 14, color: "var(--text)" }}>Chegou, mas ainda não está no estoque</strong>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 10, overflowWrap: "anywhere" }}>
        {pendente} {c.unidade} esperando alguém do galpão conferir, etiquetar e guardar
        {c.chegou_em ? ` — chegaram em ${new Date(c.chegou_em).toLocaleString("pt-BR")}` : ""}.
        Até dar entrada, esta quantidade NÃO conta no estoque.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          {...atributosDe("numero")} type="number" value={qtd} onChange={(e) => setQtd(e.target.value)}
          aria-label={`Quantidade entrando no estoque, em ${c.unidade}`}
          style={{ flex: "1 1 110px", minWidth: 0, width: "auto" }}
        />
        <Botao variante="primario" icone="package-import" onClick={guardar} carregando={busy}>
          Dar entrada no estoque
        </Botao>
      </div>
    </div>
  );
}

function Linha({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 12.5, color: "var(--text-dim)", flex: "none" }}>{k}</span>
      <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 600, textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{v}</span>
    </div>
  );
}

/** Selo de qual etapa cada evento do histórico registrou. */
const ETAPA_SELO: Record<EtapaRecebimento, { label: string; estilo: React.CSSProperties }> = {
  chegada: { label: "CHEGOU", estilo: { color: "var(--roxo)", background: "color-mix(in srgb, var(--roxo) 14%, transparent)" } },
  estoque: { label: "GUARDADO", estilo: { color: "var(--ok)", background: "color-mix(in srgb, var(--ok) 14%, transparent)" } },
  // Os eventos ANTIGOS são todos assim: chegou e entrou no estoque no mesmo
  // toque. O rótulo diz isso em vez de fingir que já eram duas etapas.
  ambas:   { label: "CHEGOU E GUARDADO", estilo: { color: "var(--text-dim)", background: "var(--surface-2)" } },
};

const CHECK_LABELS: Record<string, string> = {
  produto_correto: "Produto correto", quantidade_correta: "Quantidade correta", embalagem_ok: "Embalagem OK",
  bom_estado: "Bom estado", nota_recebida: "Nota recebida", foto: "Foto",
};
