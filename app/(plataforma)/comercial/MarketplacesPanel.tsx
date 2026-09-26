"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtBRL2 as fmtBRL } from "@/lib/format";
import type { AcordoMarketplace } from "@/lib/comissao-marketplace";
import { Icon } from "../Icon";
import { Skeleton, SkeletonRows } from "../Skeleton";
import { Switch } from "../Switch";
import { toast } from "../Toast";
import { PeriodPicker, periodQuery, DEFAULT_PERIOD, type PeriodState } from "../PeriodPicker";
import { useBuscaAtual } from "../ui/useBuscaAtual";
import { useAbrirFechar, Fila, NumeroVivo } from "../ui/micro";
import { FilaViva, BarraElastica, Revalidando, Atualizando, Vazio } from "../analytics/movimento";
import { Abas } from "../ui/Abas";
import { GlassSelect } from "../GlassPicker";
import { Botao, Acoes, Campo, Campos, Esp } from "../ui/controles";
import { PedidoDetalheModal } from "./PedidosAuto";

// ── Aba Canais do Comercial: os marketplaces ─────────────────────────────────
// Shopee, Mercado Livre e TikTok já chegam ao ERP como pedidos (plataforma
// própria + nº externo em `id_proprio`). Esta aba responde três perguntas na
// ordem em que importam: quanto os marketplaces venderam no período (a MESMA
// conta que o Analytics chama de Marketplace), quanto CADA conta vendeu e o
// que ela mais vendeu, quanto disso é bônus de quem cuida delas, e pedido a
// pedido o que saiu — a linha abre a ficha completa (itens, valores,
// histórico).
//
// "Bônus", não "comissão": venda de marketplace cai no bloco BÔNUS da folha
// (junto com tráfego), e comissão ali é só vendas + outros. A tela usa a
// palavra da folha pra ninguém procurar em duas linguagens.
//
// Não há integração por webhook aqui: os cards de "Conectar"/URL de webhook
// que ocupavam a aba foram REMOVIDOS a pedido (01/09/2026) — a tabela deles
// nunca existiu no banco, e o pedido já entra pelo ERP.

interface Fonte { chave: string; label: string; valor: number; pedidos: number }
interface Produto { nome: string; qtd: number; valor: number }
interface Conta extends Fonte {
  id: number | null; ticket: number; share: number;
  /** `null` = não há acordo ativo (≠ R$ 0,00, que é "vendeu nada"). */
  bonus: number | null;
  produtos: Produto[];
}
interface Pedido {
  ref: string; id_proprio: string | null; plataforma_id: number; plataforma: string; data: string;
  valor: number; frete: number; status: string; aprovado: boolean; enviado: boolean;
}
interface Pessoa { id: string; nome: string }
interface Resp {
  periodo: { label: string; from: string; to: string };
  total: number; pedidosN: number;
  fontes: Fonte[];
  contas: Conta[];
  produtos: { geral: Produto[]; parcial: boolean; pedidosLidos: number };
  plataformas: { id: number; nome: string }[];
  pedidos: Pedido[];
  /** `null` quando quem abriu não tem `administracao:marketplaces-bonus`. */
  acordo: (AcordoMarketplace & { pessoaNome: string | null }) | null;
  comissao: number | null;
  bonus: number | null;
  podeBonus: boolean;
  pessoas: Pessoa[];
}

const brData = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };
const pctBR = (n: number) => `${String(n).replace(".", ",")}%`;
// A aba "todas" precisa de um valor, porque `null` não é chave de aba. Prefixo
// que nenhuma conta pode ter (as reais são `plat:<id>` ou `yampi:<loja>`).
const TODAS = "@todas";

export function MarketplacesPanel() {
  const [period, setPeriod] = useState<PeriodState>(DEFAULT_PERIOD);
  const [dados, setDados] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [det, setDet] = useState<{ ref: string; idp: string | null } | null>(null);
  // Qual conta está aberta no bloco de produtos. `null` = todas somadas.
  const [conta, setConta] = useState<string | null>(null);
  // Guarda o último pedido aberto pra ter o que desenhar durante a saída do modal.
  const ultimoDet = useRef<{ ref: string; idp: string | null } | null>(null);
  if (det) ultimoDet.current = det;
  const detVivo = useAbrirFechar(!!det, "--modal-close-dur");

  const buscaAtual = useBuscaAtual();
  const load = useCallback(async () => {
    if (period.key === "custom" && (!period.from || !period.to)) { setLoading(false); return; }
    setLoading(true); setErro(null);
    // Resposta atrasada de outro período não sobrescreve a busca nova.
    const souAtual = buscaAtual();
    try {
      const r = await fetch(`/api/comercial/marketplaces?${periodQuery(period)}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      const d = await r.json();
      if (!souAtual()) return;
      if (!r.ok) throw new Error(d?.detail || d?.error || "Não foi possível carregar os marketplaces.");
      setDados(d as Resp);
    } catch (e) {
      if (!souAtual()) return;
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os marketplaces.");
    } finally {
      if (souAtual()) setLoading(false);
    }
  }, [period, buscaAtual]);
  useEffect(() => { void load(); }, [load]);

  // O bônus é área restrita à parte: sem a chave o servidor não manda o acordo
  // e a tela não desenha nada dele — nem KPI, nem cartão, nem valor por conta.
  const podeBonus = !!dados?.podeBonus;
  const acordo = dados?.acordo ?? null;
  const temAcordo = podeBonus && !!acordo && acordo.ativa && !!acordo.pessoaId;
  const contas = dados?.contas ?? [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, flex: "1 1 140px" }}>Marketplaces</h2>
        <Atualizando ativo={loading && !!dados} />
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      {erro && (
        <div className="glass" style={{ padding: 16, borderRadius: "var(--r-md)", marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "var(--perigo)", flex: "1 1 200px" }}>{erro}</span>
          <Botao variante="secundario" onClick={() => void load()}>Tentar de novo</Botao>
        </div>
      )}

      {/* Trocar o período NÃO apaga a tela: o que estava fica, esmaecido, até
          o novo chegar — e os números contam do valor antigo pro novo. */}
      <Revalidando ativo={loading && !!dados}>
      {/* Manchete: o que os marketplaces venderam e quanto disso é comissão.
          `km-suave`: os cartões são vidro, e vidro entra só por opacidade. */}
      <Fila className="kpi-row km-suave" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12, marginBottom: 14 }}>
        <Kpi
          label="Vendas nos marketplaces"
          valor={loading && !dados ? null : <NumeroVivo valor={dados?.total ?? 0} formatar={fmtBRL} />}
          sub={dados ? `${dados.pedidosN} ${dados.pedidosN === 1 ? "pedido" : "pedidos"} · sem frete · ${dados.periodo.label}` : "—"}
          cor="var(--ok)"
        />
        {podeBonus && <Kpi
          label="Bônus do gerenciador"
          valor={loading && !dados ? null : temAcordo && dados?.bonus != null ? <NumeroVivo valor={dados.bonus} formatar={fmtBRL} /> : "—"}
          sub={temAcordo ? `${acordo!.pessoaNome ?? "pessoa sem nome"} · ${pctBR(acordo!.pct)} do que as contas venderam` : "nenhum acordo ativo"}
          cor="var(--roxo)"
        />}
      </Fila>

      {/* Uma conta por cartão — as fatias que somam o total, como o Analytics
          as vê. Clicar troca o recorte do bloco de produtos abaixo. */}
      {dados && contas.length > 0 && (
        <>
          <h3 style={tituloSecao}>Contas ({contas.length})</h3>
          <Fila className="km-suave" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: 12, marginBottom: 22 }}>
            {contas.map((c) => (
              <ContaCard key={c.chave} conta={c} aberta={conta === c.chave} mostrarBonus={temAcordo} aoAbrir={() => setConta(conta === c.chave ? null : c.chave)} />
            ))}
          </Fila>
        </>
      )}

      {/* Produtos mais vendidos — do período todo ou da conta escolhida. */}
      {dados && (contas.length > 0 || dados.produtos.geral.length > 0) && (
        <div style={{ marginBottom: 4 }}>
          <h3 style={tituloSecao}>Produtos mais vendidos</h3>
          {/* A `Abas` do projeto: a pílula DESLIZA entre as contas em vez de
              acender e apagar, a fileira rola de lado no celular e a aba atual
              é trazida pra vista sozinha. Escrever a fileira na mão de novo
              era reinventar as três coisas — e sem a pílula. */}
          <Abas
            ariaLabel="Conta dos produtos mais vendidos"
            valor={conta ?? TODAS}
            onMuda={(v) => setConta(v === TODAS ? null : v)}
            itens={[
              { valor: TODAS, rotulo: "Todas as contas" },
              ...contas.map((c) => ({ valor: c.chave, rotulo: c.label, badge: c.produtos.length || undefined })),
            ]}
          />
          <ListaProdutos
            key={conta ?? TODAS}
            produtos={conta ? (contas.find((c) => c.chave === conta)?.produtos ?? []) : dados.produtos.geral}
            carregando={loading}
          />
          {dados.produtos.parcial && (
            <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>
              Período grande: o ranking olhou os {dados.produtos.pedidosLidos} pedidos mais recentes.
            </p>
          )}
        </div>
      )}

      {/* Quem cuida dos marketplaces — e o acordo dele. Só pra quem tem a chave. */}
      {podeBonus && <GerenciadorCard
        acordo={acordo}
        podeEditar={podeBonus}
        pessoas={dados?.pessoas ?? []}
        base={dados?.total ?? 0}
        periodo={dados?.periodo.label ?? "—"}
        editando={editando}
        aoEditar={() => setEditando(true)}
        aoCancelar={() => setEditando(false)}
        aoSalvo={() => { setEditando(false); void load(); }}
      />}

      {/* Os pedidos, um a um. */}
      <h3 style={tituloSecao}>Pedidos {dados ? `(${dados.pedidos.length})` : ""}</h3>
      {loading && !dados ? (
        <div className="glass" style={{ padding: 18, borderRadius: "var(--r-md)" }}><SkeletonRows rows={5} /></div>
      ) : !dados || dados.pedidos.length === 0 ? (
        <div className="glass" style={{ borderRadius: "var(--r-md)" }}>
          {dados && dados.plataformas.length === 0
            ? <Vazio icone="alert-triangle" tom="var(--atencao)" titulo="Nenhuma plataforma marcada como marketplace" texto="Em Tráfego › Fontes, marque Shopee, Mercado Livre e TikTok — os pedidos delas passam a aparecer aqui." />
            : <Vazio icone="shopping-bag" titulo="Nenhum pedido de marketplace neste período" texto="Troque o período no seletor acima para ver outros meses." />}
        </div>
      ) : (
        <FilaViva className="glass glass-spec" style={{ borderRadius: "var(--r-md)", overflow: "hidden" }}>
          {dados.pedidos.map((o, i) => (
            // Botão de verdade (44px, teclado) que EMPILHA no celular: plataforma
            // e nº na 1ª linha, data/status/valor na 2ª — nada é cortado a 320px.
            <button
              key={o.ref}
              type="button"
              onClick={() => setDet({ ref: o.ref, idp: o.id_proprio })}
              className="ui-toque"
              style={{
                display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 12px", width: "100%", textAlign: "left",
                minHeight: "var(--tap)", padding: "10px 14px", border: "none", borderTop: i ? "1px solid var(--border)" : "none",
                background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 13.5,
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 8, background: "var(--surface)", color: "var(--text-dim)", flex: "none" }}>{o.plataforma}</span>
              <span style={{ fontWeight: 700, flex: "1 1 140px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>#{o.id_proprio || o.ref}</span>
              <span style={{ color: "var(--text-dim)", flex: "none", fontVariantNumeric: "tabular-nums" }}>{brData(o.data)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 8, flex: "none", background: o.enviado ? "color-mix(in srgb, var(--ok) 18%, transparent)" : "var(--surface)", color: o.enviado ? "var(--ok)" : "var(--text-dim)" }}>{o.status}</span>
              <span className="stat" style={{ fontSize: 14, marginLeft: "auto", flex: "none" }}>{fmtBRL(o.valor)}</span>
              <Icon name="chevron-right" size={16} color="var(--text-dim)" />
            </button>
          ))}
        </FilaViva>
      )}
      {dados && dados.pedidos.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10 }}>
          Lista dos pedidos das plataformas classificadas como marketplace ({dados.plataformas.map((p) => p.nome).join(", ")}). Os valores são a VENDA (produto, sem o frete) — a mesma base que o painel da Shopee, do Mercado Livre e do TikTok reporta, e a mesma conta do Analytics.
        </p>
      )}
      </Revalidando>

      {detVivo.montado && ultimoDet.current && (
        <PedidoDetalheModal refId={ultimoDet.current.ref} idProprio={ultimoDet.current.idp} classe={detVivo.classe} onClose={() => setDet(null)} />
      )}
    </div>
  );
}

// `style` existe pelo mesmo motivo do `ContaCard`: é por ele que a `Fila`
// carimba o `--mt-i` da cascata.
function Kpi({ label, valor, sub, cor, style }: { label: string; valor: React.ReactNode | null; sub: string; cor: string; style?: React.CSSProperties }) {
  return (
    <div className="glass glass-spec" style={{ padding: "14px 16px", borderRadius: "var(--r-md)", minWidth: 0, ...style }}>
      <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {valor == null ? <Skeleton w="60%" h={24} /> : <div className="stat" style={{ fontSize: 22, color: cor, overflow: "hidden", textOverflow: "ellipsis" }}>{valor}</div>}
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
    </div>
  );
}

// O card do acordo. Ele só chega em quem tem `administracao:marketplaces-bonus`
// — quem abre a aba sem a chave não vê que ele existe. A rota recusa igual, em
// leitura e em escrita: a tela não é a tranca, é o reflexo dela.
function GerenciadorCard({ acordo, podeEditar, pessoas, base, periodo, editando, aoEditar, aoCancelar, aoSalvo }: {
  acordo: (AcordoMarketplace & { pessoaNome: string | null }) | null; podeEditar: boolean; pessoas: Pessoa[];
  base: number; periodo: string;
  editando: boolean; aoEditar: () => void; aoCancelar: () => void; aoSalvo: () => void;
}) {
  const nome = acordo?.pessoaNome ?? null;
  const inicial = (nome || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="glass glass-spec" style={{ padding: 16, borderRadius: "var(--r-md)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--roxo) 18%, transparent)", color: "var(--roxo)", fontWeight: 800, flex: "none" }}>
          {acordo?.pessoaId ? inicial : <Icon name="user" size={20} color="var(--roxo)" />}
        </span>
        <div style={{ flex: "1 1 160px", minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>Gerenciador dos marketplaces · bônus</div>
          <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {acordo?.pessoaId ? nome || "Pessoa sem nome" : "Ninguém escolhido"}
          </div>
          <div style={{ fontSize: 12.5, color: acordo?.ativa ? "var(--ok)" : "var(--text-dim)" }}>
            {acordo?.pessoaId
              ? `${pctBR(acordo.pct)} do faturamento bruto dos marketplaces · ${acordo.ativa ? "ativo" : "pausado"}`
              : "Escolha quem cuida das lojas: o bônus entra na folha sozinho."}
          </div>
        </div>
        {podeEditar && !editando && (
          <Botao variante={acordo?.pessoaId ? "secundario" : "primario"} onClick={aoEditar}>
            {acordo?.pessoaId ? "Editar" : "Escolher"}
          </Botao>
        )}
      </div>
      {podeEditar && editando && (
        <AcordoEditor
          inicial={acordo ?? { pessoaId: null, pct: 0, ativa: false, pessoaNome: null }}
          pessoas={pessoas} base={base} periodo={periodo}
          aoCancelar={aoCancelar} aoSalvo={aoSalvo}
        />
      )}
    </div>
  );
}

function AcordoEditor({ inicial, pessoas, base, periodo, aoCancelar, aoSalvo }: {
  inicial: AcordoMarketplace; pessoas: Pessoa[];
  /** Faturamento do período aberto — só pra prévia; a conta oficial é do servidor. */
  base: number; periodo: string;
  aoCancelar: () => void; aoSalvo: () => void;
}) {
  const [pessoaId, setPessoaId] = useState(inicial.pessoaId ?? "");
  const [pct, setPct] = useState(String(inicial.pct).replace(".", ","));
  const [ativa, setAtiva] = useState(inicial.ativa || !inicial.pessoaId);
  const [salvando, setSalvando] = useState(false);

  // Quanto essa % daria no período que está aberto. Digitar "1" e ler
  // "R$ 10,73 em agosto" responde na hora a pergunta que a pessoa está
  // fazendo — antes ela salvava pra descobrir, e desfazia se errasse.
  const pctNum = Number(pct.replace(",", ".")) || 0;
  const previa = pctNum > 0 && base > 0
    ? `${fmtBRL(Math.round(base * pctNum) / 100)} em ${periodo}`
    : "quanto isso daria aparece aqui";

  async function salvar() {
    if (ativa && !pessoaId) { toast.erro("Escolha quem recebe o bônus."); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/comercial/marketplaces", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pessoaId: pessoaId || null, pct, ativa }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.detail || d?.error || "Não foi possível salvar.");
      toast.ok("Acordo salvo.");
      aoSalvo();
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", display: "grid", gap: 12 }}>
      <Campos min={200}>
        {/* `GlassSelect searchable` no lugar do `<select>` nativo: a lista do
            quadro tem ~20 nomes e o menu do sistema abria uma coluna cinza
            por cima do conteúdo, fora do tema, sem busca e sem rolagem
            decente. O do projeto abre no tema, filtra digitando e no celular
            vira folha presa embaixo. */}
        <Campo label="Quem recebe o bônus">
          <GlassSelect
            id="mkt-pessoa"
            value={pessoaId}
            onChange={setPessoaId}
            searchable
            placeholder="— ninguém —"
            options={[{ value: "", label: "— ninguém —" }, ...pessoas.map((p) => ({ value: p.id, label: p.nome }))]}
          />
        </Campo>
        <Campo label="% de bônus sobre as vendas" dica={previa}>
          <input id="mkt-pct" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="2,5" style={campo} />
        </Campo>
      </Campos>
      <Acoes>
        <Switch checked={ativa} onChange={setAtiva} label={ativa ? "Bônus ativo" : "Bônus pausado"} />
        <Esp />
        <Botao variante="sutil" onClick={aoCancelar} disabled={salvando}>Cancelar</Botao>
        <Botao variante="primario" onClick={() => void salvar()} carregando={salvando}>Salvar</Botao>
      </Acoes>
      <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0 }}>
        O bônus do mês entra como sugestão em Financeiro › Colaboradores (bloco Bônus, parte Marketplace) e só congela quando o pagamento fecha.
      </p>
    </div>
  );
}

// Uma conta (Shopee, Mercado Livre, TikTok…): quanto vendeu, que fatia é do
// total, e quanto de bônus ela gera. É botão porque clicar abre o top de
// produtos DELA no bloco de baixo.
// `style` existe porque a `Fila` carimba o `--mt-i` de cada filho POR STYLE:
// sem repassar, os cartões entram todos no mesmo quadro em vez de em cascata.
function ContaCard({ conta, aberta, mostrarBonus, aoAbrir, style }: {
  conta: Conta; aberta: boolean; mostrarBonus: boolean; aoAbrir: () => void; style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-pressed={aberta}
      // `ui-vidro-alvo`, não `ui-card-alvo`: o cartão é VIDRO, e vidro não
      // afunda (rastro branco no Chrome). No toque ele escurece no instante
      // do pointer-down; no ponteiro fino ganha a sombra de elevação.
      className="glass glass-spec ui-vidro-alvo"
      style={{
        display: "block", width: "100%", textAlign: "left", minWidth: 0,
        padding: "14px 16px", borderRadius: "var(--r-md)", cursor: "pointer", color: "var(--text)",
        border: `1px solid ${aberta ? "var(--roxo)" : "transparent"}`,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conta.label}</span>
        <NumeroVivo valor={conta.share * 100} formatar={(n) => `${Math.round(n)}%`} style={{ fontSize: 12, color: "var(--text-dim)", flex: "none" }} />
      </div>
      <div className="stat" style={{ fontSize: 20, color: "var(--ok)", overflow: "hidden", textOverflow: "ellipsis" }}><NumeroVivo valor={conta.valor} formatar={fmtBRL} /></div>
      {/* Barra da fatia: a mesma leitura dos chips antigos, agora comparável
          de bater o olho — e o % e a barra assentam juntos (Kinetics 093). */}
      <BarraElastica frac={conta.share} cor="var(--ok)" trilho="var(--surface)" altura={4} minimo={2} style={{ margin: "8px 0" }} />
      <div style={{ fontSize: 12, color: "var(--text-dim)", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>{conta.pedidos} {conta.pedidos === 1 ? "pedido" : "pedidos"}</span>
        <span>ticket {fmtBRL(conta.ticket)}</span>
      </div>
      {mostrarBonus && conta.bonus != null && (
        <div style={{ fontSize: 12, color: "var(--roxo)", fontWeight: 700, marginTop: 4 }}>bônus {fmtBRL(conta.bonus)}</div>
      )}
    </button>
  );
}

// O ranking. Sem tabela: cada produto é uma linha que EMPILHA no celular, e a
// barra dá a proporção sem precisar ler o número.
function ListaProdutos({ produtos, carregando }: { produtos: Produto[]; carregando: boolean }) {
  if (carregando && produtos.length === 0) {
    return <div className="glass" style={{ padding: 18, borderRadius: "var(--r-md)" }}><SkeletonRows rows={4} /></div>;
  }
  if (produtos.length === 0) {
    return (
      <div className="glass" style={{ borderRadius: "var(--r-md)" }}>
        <Vazio compacto icone="package" titulo="Nenhum item conhecido neste recorte" texto="Os pedidos desta conta não trouxeram itens identificáveis no período." />
      </div>
    );
  }
  const maior = Math.max(...produtos.map((p) => p.qtd), 1);
  // O esmaecido da troca de período mora no `Revalidando` do painel; aqui só
  // o ranking. `FilaViva`: o produto que sobe de posição DESLIZA até ela.
  return (
    <FilaViva className="glass glass-spec" style={{ borderRadius: "var(--r-md)", overflow: "hidden" }}>
      {produtos.map((p, i) => (
        <div key={p.nome} className="mt-linha" style={{ display: "flex", alignItems: "center", gap: "6px 12px", flexWrap: "wrap", padding: "10px 14px", borderTop: i ? "1px solid var(--border)" : "none", fontSize: 13.5 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, width: 22, flex: "none", color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
          <span style={{ fontWeight: 600, flex: "1 1 160px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
          <BarraElastica frac={p.qtd / maior} cor="var(--roxo)" trilho="var(--surface)" altura={4} minimo={4} style={{ flex: "none", width: 60 }} />
          <span style={{ flex: "none", color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{p.qtd}x</span>
          <span className="stat" style={{ fontSize: 13.5, flex: "none", marginLeft: "auto" }}>{fmtBRL(p.valor)}</span>
        </div>
      ))}
    </FilaViva>
  );
}

const tituloSecao: React.CSSProperties = { fontSize: 15, fontWeight: 800, margin: "24px 0 12px" };

const campo: React.CSSProperties = { width: "100%", minHeight: "var(--tap)", padding: "0 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14, outline: "none" };
