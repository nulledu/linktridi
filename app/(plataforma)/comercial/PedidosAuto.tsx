"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FONTES } from "@/lib/comercial-catalog";
import { fmtBRL2 as fmtBRL } from "@/lib/format";
import { Icon } from "../Icon";
import { Skeleton, SkeletonRows } from "../Skeleton";
import { CopyId } from "../CopyId";
import { GlassSelect } from "../GlassPicker";
import { PeriodPicker, periodQuery, DEFAULT_PERIOD, type PeriodState } from "../PeriodPicker";
import { useBuscaAtual } from "../ui/useBuscaAtual";
import { toast, confirmar } from "../Toast";
import { atributosDe } from "../ui/campos";
import { useAbrirFechar, Fila, NumeroVivo } from "../ui/micro";
import { Revalidando, Atualizando, Vazio } from "../analytics/movimento";
import { travarRolagem } from "../ui/travaRolagem";
import { useParamDaUrl } from "../ui/useParamDaUrl";
import { Alerta } from "../ui/Alerta";
import { Botao, BotaoIcone } from "../ui/controles";
import { jsonOuErro, motivoDaFalha } from "../ui/rede";

interface Pedido {
  ref: string; id_proprio: string | null; cliente: string; telefone: string; valor: number; frete?: number; data: string;
  plataforma: string | null; etapa: string | null; responsavel_id: string; responsavel_nome: string;
  dias_conversa: number | null; fonte: string | null; ocupacao: string | null;
  origem?: "gaia" | "vansory"; enviado?: boolean; statusLabel?: string | null;
}
interface Responsavel { user_id: string; nome: string | null; ativo: boolean }

// Teto de tempo por chamada. Sem o abort, uma requisição que trava (cold start
// da função, rede engasgada) fica PENDURADA para sempre — e a aba que espera
// por ela mostra o esqueleto infinitamente, sem erro e sem saída.
async function buscar(url: string): Promise<Response> {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 30_000);
  try {
    return await fetch(url, { cache: "no-store", signal: controle.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("A conexão demorou demais. Tente de novo.");
    throw e;
  } finally {
    clearTimeout(limite);
  }
}

const brData = (iso: string) =>{ const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };

export function PedidosAuto({ lockVendorId = null, titulo }: { lockVendorId?: string | null; titulo?: string } = {}) {
  const [period, setPeriod] = useState<PeriodState>(DEFAULT_PERIOD);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [podeGerir, setPodeGerir] = useState(false);
  // Quem eu sou no ERP — é o que decide "este pedido é meu" e, portanto, se os
  // campos abaixo do card nascem editáveis ou como texto.
  const [meErpId, setMeErpId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Já houve UMA carga boa? Daí em diante trocar o período não devolve o
  // esqueleto: a lista antiga fica esmaecida até a nova chegar (Kinetics 100)
  // — sem salto de altura e sem perder a posição da rolagem.
  const [carregou, setCarregou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  // Por padrão mostra TODOS os pedidos (inclui enviados). Filtro de vendedora
  // fica salvo no navegador e volta aplicado a cada visita.
  const [mostrarEnviados, setMostrarEnviados] = useState(true);
  const [vendFiltro, setVendFiltro] = useState(lockVendorId || "");
  const [det, setDet] = useState<{ ref: string; idp: string | null } | null>(null);
  // O detalhe do pedido sai animado. `det` vira null no clique de fechar (a
  // trava de rolagem só solta no desmonte, então o fundo continua preso durante
  // a saída), e o último pedido fica guardado pra ter o que desenhar até lá.
  const ultimoDet = useRef<{ ref: string; idp: string | null } | null>(null);
  if (det) ultimoDet.current = det;
  const detVivo = useAbrirFechar(!!det, "--modal-close-dur");
  // `/comercial?pedido=<ref>` abre o detalhe direto. O modal busca pelo ref, não
  // depende do pedido estar na lista do período — quem veio da busca procurou
  // um pedido específico, não o mês corrente.
  useParamDaUrl("pedido", (ref) => setDet({ ref, idp: null }));
  const locked = !!lockVendorId;

  // Carrega o filtro salvo (só quando não está travado num vendedor).
  useEffect(() => {
    if (locked) return;
    try {
      const v = localStorage.getItem("comercial.pedidos.vend");
      if (v != null) setVendFiltro(v);
      const e = localStorage.getItem("comercial.pedidos.enviados");
      if (e != null) setMostrarEnviados(e === "1");
    } catch { /* sem storage */ }
  }, [locked]);
  // Persiste as escolhas.
  useEffect(() => { if (!locked) try { localStorage.setItem("comercial.pedidos.vend", vendFiltro); } catch { /* */ } }, [vendFiltro, locked]);
  useEffect(() => { if (!locked) try { localStorage.setItem("comercial.pedidos.enviados", mostrarEnviados ? "1" : "0"); } catch { /* */ } }, [mostrarEnviados, locked]);

  const loadResp = useCallback(async () => {
    try {
      const r = await buscar("/api/comercial/responsaveis");
      const d = await r.json();
      setResponsaveis(d.responsaveis ?? []); setPodeGerir(!!d.podeGerir); setMeErpId(d.meErpId ?? null);
    } catch { /* a lista de responsáveis é acessório: sem ela os pedidos ainda abrem */ }
  }, []);

  const buscaAtual = useBuscaAtual();
  const loadPedidos = useCallback(async () => {
    // Período personalizado pela metade não tem o que buscar — mas TAMBÉM não
    // pode ficar "carregando": antes o `return` saía com `loading` ainda ligado
    // e a tela ficava no esqueleto até a pessoa recarregar.
    if (period.key === "custom" && (!period.from || !period.to)) { setLoading(false); return; }
    setLoading(true); setErro(null);
    // Resposta atrasada de outro período não sobrescreve a busca nova.
    const souAtual = buscaAtual();
    try {
      const r = await buscar(`/api/comercial/pedidos?${periodQuery(period)}`);
      const d = await r.json();
      if (!souAtual()) return;
      if (!r.ok) throw new Error(d?.error || "Não foi possível carregar os pedidos.");
      setPedidos(d.pedidos ?? []);
      setCarregou(true);
    } catch (e) {
      // Sem isto o `setLoading(false)` nunca rodava numa falha de rede e o
      // esqueleto ficava eterno, sem mensagem nem botão pra tentar de novo.
      if (souAtual()) setErro(e instanceof Error ? e.message : "Não foi possível carregar os pedidos.");
    } finally {
      if (souAtual()) setLoading(false);
    }
  }, [period, buscaAtual]);

  useEffect(() => { loadResp(); }, [loadResp]);
  useEffect(() => { loadPedidos(); }, [loadPedidos]);

  async function salvarExtra(ref: string, patch: { dias_conversa?: number | null; fonte?: string | null; ocupacao?: string | null }) {
    const antes = pedidos.find((p) => p.ref === ref);
    setPedidos((l) => l.map((p) => (p.ref === ref ? { ...p, ...patch } : p)));
    try {
      await jsonOuErro(await fetch("/api/comercial/pedidos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref, ...patch }) }));
    } catch (e) {
      // Otimismo desfeito: o campo volta ao que estava salvo de verdade.
      if (antes) {
        const volta = Object.fromEntries(Object.keys(patch).map((k) => [k, antes[k as keyof typeof patch]]));
        setPedidos((l) => l.map((p) => (p.ref === ref ? { ...p, ...volta } : p)));
      }
      toast.erro(motivoDaFalha(e, "salvar o campo do pedido"));
    }
  }
  // Remove um pedido lançado neste sistema (Gaia). Só gerente/admin (gate no servidor).
  async function removerPedido(p: Pedido) {
    if (p.origem !== "gaia") return;
    if (!(await confirmar(`Remover o pedido de ${p.cliente}?`, { detalhe: "Esta ação não pode ser desfeita.", perigo: true }))) return;
    setPedidos((l) => l.filter((x) => x.ref !== p.ref));
    const r = await fetch(`/api/comercial?id=${encodeURIComponent(p.ref)}`, { method: "DELETE" });
    if (!r.ok) { loadPedidos(); toast.erro("Não foi possível remover o pedido."); }
    else toast.ok("Pedido removido.");
  }

  const efetivoVend = lockVendorId || vendFiltro;
  // Editar campo de pedido: gestão em qualquer um, o resto só no que é seu.
  const podeEditar = (p: Pedido) => podeGerir || (!!meErpId && p.responsavel_id === meErpId);
  // Enviado = flag confiável (data_envio no ERP), não o nome da etapa.
  const enviado = (p: Pedido) => p.enviado === true || (p.statusLabel || p.etapa || "").toLowerCase().includes("enviado");
  // Padrão: só ATIVOS (não enviados). Enviados aparecem ao buscar ou ligar o filtro.
  const filtrados = pedidos.filter((p) =>
    (!efetivoVend || p.responsavel_id === efetivoVend) &&
    (!busca || `${p.ref} ${p.cliente} ${p.telefone} ${p.id_proprio ?? ""}`.toLowerCase().includes(busca.toLowerCase())) &&
    (mostrarEnviados || busca ? true : !enviado(p)));
  // Faturamento comercial = soma de TODOS os pedidos do período (do vendedor
  // filtrado), direto da tabela do ERP — independe dos toggles de exibição.
  const doVendedor = pedidos.filter((p) => !efetivoVend || p.responsavel_id === efetivoVend);
  const faturamento = doVendedor.reduce((s, p) => s + p.valor, 0);
  const faturamentoSemFrete = doVendedor.reduce((s, p) => s + (p.valor - (p.frete || 0)), 0);
  const total = filtrados.reduce((s, p) => s + p.valor, 0);
  const nEnviados = pedidos.filter(enviado).length;

  return (
    <div>
      {titulo && <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{titulo}</h2>}
      {/* Quem lança pedido — reflexo da grade de permissões, não lista editável.
          Sai daqui quem perde a permissão ou é desligado, sem ninguém lembrar. */}
      {!locked && (
      <div className="glass glass-spec" style={{ padding: 16, borderRadius: "var(--r-md)", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 14.5, fontWeight: 800 }}>Pedidos puxados de</h2>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>quem tem a permissão “Lançar pedido” no Comercial</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {responsaveis.map((r) => (
            <span key={r.user_id} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 13.5, fontWeight: 600 }}>
              {r.nome || r.user_id.slice(0, 8)}
            </span>
          ))}
          {responsaveis.length === 0 && <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Ninguém com permissão de lançar pedido e vínculo com o ERP.</span>}
        </div>
        {podeGerir && (
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10 }}>
            Para incluir ou tirar alguém, ligue ou desligue “Lançar pedido” em Pessoas → permissões.
          </p>
        )}
      </div>
      )}

      {/* Período + busca + total */}
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <PeriodPicker value={period} onChange={setPeriod} />
        <Atualizando ativo={loading && carregou} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={15} color="var(--text-dim)" /></span>
          <input {...atributosDe("busca")} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por ID, cliente ou telefone…"
            style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "9px 12px 9px 34px", color: "var(--text)", fontSize: 14 }} />
        </div>
        {!locked && responsaveis.length > 1 && (
          <div style={{ width: 200 }}>
            <GlassSelect value={vendFiltro} onChange={setVendFiltro} placeholder="Todos os vendedores"
              options={[{ value: "", label: "Todos os vendedores" }, ...responsaveis.map((r) => ({ value: r.user_id, label: r.nome || r.user_id.slice(0, 8) }))]} />
          </div>
        )}
        {/* Filtro de chip: `aria-pressed` diz o estado a quem não vê a cor, e
            o `.km-chip` dá o pop curto ao acender (Kinetics 018). `tap-m`: 44px
            de alvo no celular. */}
        <button type="button" onClick={() => setMostrarEnviados((v) => !v)} title="Por padrão só os ativos (não enviados)"
          aria-pressed={mostrarEnviados} className="km-chip tap-m"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: "var(--r-sm)", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid var(--border)", color: mostrarEnviados ? "var(--on-primary, #fff)" : "var(--text-dim)", background: mostrarEnviados ? "var(--primary-acao, var(--primary))" : "var(--surface)" }}>
          <Icon name={mostrarEnviados ? "circle-check" : "circle"} size={15} color="currentColor" /> Incluir enviados{nEnviados > 0 ? ` (${nEnviados})` : ""}
        </button>
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{filtrados.length} {busca || mostrarEnviados ? "pedidos" : "ativos"}{total !== faturamento ? ` · ${fmtBRL(total)}` : ""}</span>
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Faturamento{efetivoVend ? " (vendedor)" : ""}: <strong style={{ color: "var(--ok)" }}><NumeroVivo valor={faturamento} formatar={fmtBRL} /></strong> · s/ frete <strong style={{ color: "var(--primary-texto, var(--primary))" }}><NumeroVivo valor={faturamentoSemFrete} formatar={fmtBRL} /></strong> · {doVendedor.length} pedidos</span>
      </div>

      {/* Lista de pedidos */}
      {/* Três estados, nunca esqueleto eterno: carregando → esqueleto; falhou →
          o motivo + "tentar de novo"; carregado → a lista. */}
      {erro && !loading ? (
        <Alerta tom="atencao" titulo="Não foi possível carregar os pedidos"
          acao={<Botao tamanho="sm" variante="primario" onClick={() => void loadPedidos()}>Tentar de novo</Botao>}>
          {erro}
        </Alerta>
      ) : loading && !carregou ? <SkeletonRows rows={5} /> : (
        <Revalidando ativo={loading}>
          {filtrados.length === 0 ? (
            <div className="glass" style={{ borderRadius: "var(--r-md)" }}>
              {busca ? (
                <Vazio icone="search" titulo="Nenhum pedido encontrado" texto={<>Nada com “{busca}” no período. Confira o número, o nome ou o telefone.</>} />
              ) : !mostrarEnviados && nEnviados > 0 ? (
                // Os pedidos EXISTEM, só estão escondidos pelo filtro: dizer
                // "nenhum pedido" aqui mandaria a pessoa procurar um defeito.
                <Vazio icone="package" titulo="Nenhum pedido ativo" texto={`Os ${nEnviados} pedidos do período já foram enviados.`}
                  acao={<Botao onClick={() => setMostrarEnviados(true)}>Mostrar enviados</Botao>} />
              ) : (
                <Vazio icone="package" titulo="Nenhum pedido no período" texto="Troque o período no seletor acima para ver outros meses." />
              )}
            </div>
          ) : (
            // `km-suave`: o cartão é vidro e carrega um seletor (popover) —
            // transform em nenhum dos dois; a cascata entra só por opacidade.
            <Fila className="km-suave" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtrados.map((p) => <PedidoCard key={p.ref} p={p} editavel={podeEditar(p)} onSave={salvarExtra} onOpen={() => setDet({ ref: p.ref, idp: p.id_proprio })} podeRemover={podeEditar(p) && p.origem === "gaia"} onRemover={() => removerPedido(p)} />)}
            </Fila>
          )}
        </Revalidando>
      )}

      {detVivo.montado && ultimoDet.current && <PedidoDetalheModal refId={ultimoDet.current.ref} idProprio={ultimoDet.current.idp} classe={detVivo.classe} onClose={() => setDet(null)} />}
    </div>
  );
}

// `style` é por onde a `Fila` carimba o `--mt-i` da cascata de entrada.
function PedidoCard({ p, editavel = true, onSave, onOpen, podeRemover, onRemover, style }: { p: Pedido; editavel?: boolean; onSave: (ref: string, patch: { dias_conversa?: number | null; fonte?: string | null; ocupacao?: string | null }) => void; onOpen: () => void; podeRemover?: boolean; onRemover?: () => void; style?: React.CSSProperties }) {
  const [dias, setDias] = useState(p.dias_conversa?.toString() ?? "");
  const [ocup, setOcup] = useState(p.ocupacao ?? "");
  // O pedido manda: quando o salvar falha e o valor volta, o campo acompanha.
  useEffect(() => { setDias(p.dias_conversa?.toString() ?? ""); }, [p.dias_conversa]);
  useEffect(() => { setOcup(p.ocupacao ?? ""); }, [p.ocupacao]);
  const fonteLbl = p.fonte ? (FONTES.find((f) => f.key === p.fonte)?.label ?? p.fonte) : "—";

  return (
    <div className="glass glass-spec" style={{ padding: 14, borderRadius: "var(--r-md)", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div onClick={onOpen} style={{ flex: "1 1 200px", minWidth: 0, cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{p.cliente}</span>
            <span onClick={(e) => e.stopPropagation()} style={{ flex: "none" }}><CopyId id={p.id_proprio ?? p.ref} /></span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{p.telefone || "sem telefone"} · {p.responsavel_nome}</div>
        </div>
        {/* Origem do pedido */}
        <Badge cor={p.origem === "gaia" ? "var(--primary-texto)" : "var(--azul)"}>{p.origem === "gaia" ? "Tridi Gaia" : "Tridi Vansory"}</Badge>
        {p.plataforma && <Badge>{p.plataforma}</Badge>}
        {/* Status: ENVIADO em destaque, senão a etapa atual */}
        {p.enviado
          ? <Badge cor="var(--ok)">ENVIADO</Badge>
          : (p.statusLabel || p.etapa) && <Badge cor="var(--indigo)">{p.statusLabel || p.etapa}</Badge>}
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{brData(p.data)}</span>
        <span className="stat" style={{ fontSize: 18, minWidth: 90, textAlign: "right", color: "var(--ok)" }}>{fmtBRL(p.valor)}</span>
        <BotaoIcone icone="external-link" titulo="Ver detalhes" variante="secundario" onClick={onOpen} style={{ flex: "none" }} />
        {podeRemover && (
          <BotaoIcone icone="trash" titulo="Remover pedido" variante="perigo" onClick={onRemover} style={{ flex: "none" }} />
        )}
      </div>
      {/* Campos extras. Pedido de outra pessoa (fora da gestão) mostra os mesmos
          dados como TEXTO — a informação continua à vista, só não se mexe nela. */}
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        {editavel ? (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-dim)" }}>
              Dias de conversa
              <input type="number" min={0} value={dias} onChange={(e) => setDias(e.target.value)}
                onBlur={() => onSave(p.ref, { dias_conversa: dias === "" ? null : Number(dias) })}
                style={{ width: 70, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xs)", padding: "6px 8px", color: "var(--text)", fontSize: 13 }} />
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-dim)" }}>
              Fonte do lead
              <div style={{ width: 180 }}>
                <GlassSelect value={p.fonte || ""} onChange={(v) => onSave(p.ref, { fonte: v || null })}
                  placeholder="—" options={[{ value: "", label: "—" }, ...FONTES.map((f) => ({ value: f.key, label: f.label }))]} />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-dim)" }}>
              Ocupação
              <input value={ocup} onChange={(e) => setOcup(e.target.value)} placeholder="ex.: contador"
                onBlur={() => onSave(p.ref, { ocupacao: ocup.trim() || null })}
                style={{ width: 150, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xs)", padding: "6px 8px", color: "var(--text)", fontSize: 13 }} />
            </label>
          </>
        ) : (
          <>
            <Leitura rotulo="Dias de conversa" valor={p.dias_conversa != null ? `${p.dias_conversa}` : "—"} />
            <Leitura rotulo="Fonte do lead" valor={fonteLbl} />
            <Leitura rotulo="Ocupação" valor={p.ocupacao || "—"} />
            <span title="Só quem lançou o pedido (ou a gestão) edita estes campos"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--text-dim)" }}>
              <Icon name="lock" size={13} color="var(--text-dim)" /> pedido de outra pessoa
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// Par rótulo/valor no lugar do campo, quando o pedido não é meu.
function Leitura({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-dim)" }}>
      {rotulo}
      <strong style={{ color: "var(--text)", fontWeight: 600 }}>{valor}</strong>
    </span>
  );
}

function Badge({ children, cor = "var(--primary-texto)" }: { children: React.ReactNode; cor?: string }) {
  return <span style={{ fontSize: 11, fontWeight: 700, color: cor, background: `color-mix(in srgb, ${cor} 16%, transparent)`, padding: "3px 9px", borderRadius: 999 }}>{children}</span>;
}

// ── Detalhe do pedido (pop-up estilo Apple) ──
interface Detalhe {
  ref: string; cliente: string; telefone: string; valorTotal: number; frete: number; produtosTotal: number; acrescimo: number;
  plataforma: string | null; etapa: string | null; responsavel_nome: string;
  data: string; dataAprovado: string | null; dataEnvio: string | null;
  palavraChave: string | null; caixa: string | null; transportadora: string | null;
  urgente: boolean; semContato: boolean; metadePago: boolean; statusAlmofada: string | null; formatoChancela: string | null;
  observacao: string | null; tagUtm: string | null; dias_conversa: number | null; fonte: string | null; ocupacao: string | null;
  itens: { nome: string; opcao: string | null; preco: number; imagem: string | null; faltante: boolean }[];
  historico: { data: string; texto: string }[];
}
const dataHora = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

// Exportado porque a aba Canais (marketplaces) abre a MESMA ficha: o pedido de
// Shopee/ML/TikTok é um pedido do ERP como outro qualquer.
export function PedidoDetalheModal({ refId, idProprio, onClose, classe = "" }: { refId: string; idProprio?: string | null; onClose: () => void; classe?: string }) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const soltar = travarRolagem();
    fetch(`/api/comercial/pedido?ref=${refId}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.pedido) setD(j.pedido); else setErr(true); }).catch(() => setErr(true));
    return () => { document.removeEventListener("keydown", onKey); soltar(); };
  }, [refId, onClose]);

  const flags: string[] = [];
  if (d?.urgente) flags.push("Urgente");
  if (d?.semContato) flags.push("Sem contato");
  if (d?.metadePago) flags.push("50% pago");

  return createPortal(
    <div className={`apple-backdrop sheet-host ${classe}`.trim()} onClick={onClose}>
      {/* padding em clamp: 24px no modal de 720px (desktop intacto) e 14px na
          folha do celular, onde 48px fixos são 15% da largura útil. */}
      <div className={`apple-modal glass glass-spec sheet t-modal ${classe}`.trim()} onClick={(e) => e.stopPropagation()} style={{ width: "min(720px,100%)", maxHeight: "90dvh", overflowY: "auto", borderRadius: "var(--r-lg)", padding: "clamp(14px, 3.5vw, 24px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Pedido de marketplace guarda o Nº EXTERNO em id_proprio, não o
                cliente — sem esta guarda o título repetia o número duas vezes. */}
            <h2 style={{ fontSize: "clamp(18px, 5vw, 22px)", fontWeight: 800 }}>{d?.cliente && d.cliente !== (idProprio || refId) ? d.cliente : d?.plataforma ? `Pedido ${d.plataforma}` : "Pedido"} <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 500 }}>#{idProprio || refId}</span></h2>
            <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-block", marginTop: 4 }}><CopyId id={idProprio || refId} /></span>
            <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{d ? `${d.telefone || "sem telefone"} · ${d.responsavel_nome}` : "carregando…"}</span>
          </div>
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onClose} style={{ flex: "none" }} />
        </div>

        {err && <p style={{ color: "var(--perigo)" }}>Não foi possível carregar o pedido.</p>}
        {!d && !err && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Skeleton w="45%" h={16} />
            <Skeleton h={70} r={12} />
            <SkeletonRows rows={3} />
          </div>
        )}

        {d && (
          <>
            {/* Valores */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 120px),1fr))", gap: 10, marginBottom: 16 }}>
              <Mini label="Valor total" value={fmtBRL(d.valorTotal)} cor="var(--ok)" />
              <Mini label="Produtos" value={fmtBRL(d.produtosTotal)} />
              <Mini label="Frete" value={fmtBRL(d.frete)} cor="var(--atencao)" />
              <Mini label="Acréscimo" value={fmtBRL(d.acrescimo)} cor="var(--roxo)" />
            </div>

            {/* Status / infos */}
            <Secao titulo="Status">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {d.etapa && <Badge cor="var(--indigo)">{d.etapa}</Badge>}
                {d.plataforma && <Badge>{d.plataforma}</Badge>}
                {flags.map((f) => <Badge key={f} cor="var(--perigo)">{f}</Badge>)}
              </div>
              <Linhas linhas={[
                ["Responsável", d.responsavel_nome],
                ["Fonte do lead", d.fonte ? (FONTES.find((f) => f.key === d.fonte)?.label || d.fonte) : "—"],
                ["Dias de conversa", d.dias_conversa != null ? String(d.dias_conversa) : "—"],
                ["Ocupação", d.ocupacao || "—"],
                ["Almofada", d.statusAlmofada || "—"],
                ["Formato chancela", d.formatoChancela || "—"],
                ["Transportadora", d.transportadora || "—"],
                ["Palavra-chave", d.palavraChave || "—"],
                ["Nº caixa", d.caixa || "—"],
                ["Origem/campanha", d.tagUtm || "—"],
                ["Criado", dataHora(d.data)],
                ["Aprovado", d.dataAprovado ? dataHora(d.dataAprovado) : "—"],
                ["Enviado", d.dataEnvio ? dataHora(d.dataEnvio) : "—"],
              ]} />
              {d.observacao && <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8 }}><strong>Obs:</strong> {d.observacao}</p>}
            </Secao>

            {/* Produtos */}
            <Secao titulo={`Produtos (${d.itens.length})`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {d.itens.map((i, k) => (
                  // flexWrap + base de 120px: foto, selo "faltante" e preço somam
                  // ~190px fixos — sem quebrar, o nome do produto sumia a 320px.
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", borderRadius: "var(--r-sm)", padding: 8, flexWrap: "wrap" }}>
                    {i.imagem
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={i.imagem} alt="" style={{ width: 44, height: 44, borderRadius: "var(--r-xs)", objectFit: "cover", flex: "none" }} />
                      : <span style={{ width: 44, height: 44, borderRadius: "var(--r-xs)", background: "var(--surface-2)", display: "grid", placeItems: "center", flex: "none" }}><Icon name="box" size={20} color="var(--text-dim)" /></span>}
                    <div style={{ flex: "1 1 120px", minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{i.nome}</div>
                      {i.opcao && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{i.opcao}</div>}
                    </div>
                    {i.faltante && <Badge cor="var(--perigo)">faltante</Badge>}
                    <span className="stat" style={{ fontSize: 15, marginLeft: "auto", flex: "none" }}>{fmtBRL(i.preco)}</span>
                  </div>
                ))}
                {d.itens.length === 0 && <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Sem itens.</p>}
              </div>
            </Secao>

            {/* Histórico */}
            {d.historico.length > 0 && (
              <Secao titulo="Histórico">
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {d.historico.map((h, k) => (
                    <div key={k} style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: k ? "1px solid var(--border)" : "none" }}>
                      <span style={{ fontSize: 11.5, color: "var(--text-dim)", flex: "none", width: 86 }}>{dataHora(h.data)}</span>
                      <span style={{ fontSize: 13 }}>{h.texto}</span>
                    </div>
                  ))}
                </div>
              </Secao>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Mini({ label, value, cor = "var(--text)" }: { label: string; value: string; cor?: string }) {
  return <div style={{ background: "var(--surface)", borderRadius: "var(--r-sm)", padding: "12px 14px" }}><div className="stat" style={{ fontSize: 19, color: cor }}>{value}</div><div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{label}</div></div>;
}
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 18 }}><h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 10 }}>{titulo}</h3>{children}</div>;
}
function Linhas({ linhas }: { linhas: [string, string][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 200px),1fr))", gap: "6px 16px" }}>
      {linhas.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
          <span style={{ color: "var(--text-dim)" }}>{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}
