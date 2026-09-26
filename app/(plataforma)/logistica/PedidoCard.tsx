"use client";

// Card do pedido aberto pela BUSCA DE CAIXA.
//
// Ali o pedido normalmente já saiu da logística — pode ter sido despachado há
// meses —, então ele não está em nenhuma lista da tela e não existe um
// `LogiPedido` com os checks. O que se quer saber é outra coisa: o que era o
// pedido, quem mexeu nele, quem passou para a logística, quanto tempo ficou.
// Tudo isso sai de /api/logistica/pedido/[id], carregado ao abrir.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DetalhePedido } from "@/lib/logistica-pedido";
import { Icon } from "../Icon";
import { BotaoIcone } from "../ui/controles";
import { CopyId } from "../CopyId";
import { grade } from "../ui/grade";
import { Fila, duracaoCss, useAbrirFechar } from "../ui/micro";

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const dataCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

const duracao = (h: number) => (h >= 48 ? `${Math.round(h / 24)}d` : `${Math.round(h)}h`);

export function PedidoCard({ pedido, contexto, onClose }: {
  pedido: number;
  /** Estadia na caixa que originou a abertura, quando veio da busca. */
  contexto?: { caixa: string; de: string | null; ate: string | null; colocou: string | null; tirou: string | null } | null;
  onClose: () => void;
}) {
  const [dados, setDados] = useState<DetalhePedido | null>(null);
  const [erro, setErro] = useState(false);

  // A folha ENTRA crescendo e SAI mais rápido do que entrou (250→150): abrir é
  // convite, fechar é sair da frente. Quem chama este card o desmonta no mesmo
  // quadro do clique, então o atraso do desmonte mora aqui — sem ele o `.t-modal`
  // nunca chegaria a pintar o `is-closing` e a folha sumiria por corte seco.
  //
  // `visivel` nasce `false` e liga no primeiro efeito de propósito: montar já
  // aberto faria o navegador pintar o estado final e não haveria transição
  // nenhuma para acompanhar.
  const [visivel, setVisivel] = useState(false);
  useEffect(() => { setVisivel(true); }, []);
  const { classe } = useAbrirFechar(visivel, "--modal-close-dur");
  const saindo = useRef(false);
  const fechar = useCallback(() => {
    if (saindo.current) return;   // segundo clique no véu não encurta a saída
    saindo.current = true;
    setVisivel(false);
    setTimeout(onClose, duracaoCss("--modal-close-dur", 150));
  }, [onClose]);

  useEffect(() => {
    let vivo = true;
    setDados(null); setErro(false);
    fetch(`/api/logistica/pedido/${pedido}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (vivo) setDados(d); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [pedido]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fechar]);

  const p = dados?.dados ?? null;

  return createPortal(
    // `sheet-host`/`sheet`: no celular a folha se prende embaixo, com rolagem
    // interna e o botão de fechar ao alcance do polegar.
    <div className={`apple-backdrop sheet-host ${classe}`.trim()} onClick={fechar}
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "grid", placeItems: "center", padding: 20 }}>
      <div className={`apple-modal glass sheet t-modal ${classe}`.trim()} onClick={(e) => e.stopPropagation()}
        style={{ width: "min(880px, 100%)", maxHeight: "94dvh", overflowY: "auto", borderRadius: 22, padding: "clamp(16px, 4vw, 32px)" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 150px" }}>
            <div style={{ fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p?.idProprio ?? `Pedido ${pedido}`}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
              {p ? `${p.etapaNome}${p.caixa ? ` · caixa #${p.caixa}` : ""}` : erro ? "não foi possível carregar" : "carregando…"}
            </div>
          </div>
          {p?.urgente && <span style={{ fontSize: 11, fontWeight: 800, color: "var(--perigo)", background: "color-mix(in srgb, var(--perigo) 16%, transparent)", padding: "3px 9px", borderRadius: 6, flex: "none" }}>URGENTE</span>}
          {/* A onda confirma que o toque CHEGOU: entre o dedo e a folha sair da
              frente há uns 300ms de nada, e é neles que a pessoa toca de novo. */}
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={fechar} style={{ flex: "none", marginLeft: "auto" }} />
        </div>

        {/* Passagem por ESTA caixa — o motivo de o card ter sido aberto */}
        {contexto && (
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: "12px 15px", marginBottom: 14, fontSize: 12.5, display: "grid", gap: 5 }}>
            <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
              <Icon name="package" size={15} color="var(--tf-indigo, var(--primary-texto))" /> Passagem pela caixa #{contexto.caixa}
            </div>
            <div style={{ color: "var(--text-dim)" }}>
              Entrou {dataHora(contexto.de)} · {contexto.ate ? `saiu ${dataHora(contexto.ate)}` : "ainda na caixa"}
              {contexto.de && contexto.ate && ` · ficou ${duracao((new Date(contexto.ate).getTime() - new Date(contexto.de).getTime()) / 36e5)}`}
            </div>
            {(contexto.colocou || contexto.tirou) && (
              <div style={{ color: "var(--text-dim)" }}>
                {contexto.colocou && <>colocou <b style={{ color: "var(--text)" }}>{contexto.colocou}</b></>}
                {contexto.colocou && contexto.tirou && " · "}
                {contexto.tirou && <>tirou <b style={{ color: "var(--text)" }}>{contexto.tirou}</b></>}
              </div>
            )}
          </div>
        )}

        {/* Cliente e datas */}
        {p && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16, fontSize: 11.5, color: "var(--text-dim)" }}>
            <CopyId id={p.idProprio ?? p.id} />
            {p.nome && <span style={{ color: "var(--text)", fontWeight: 600 }}>{p.nome}</span>}
            {p.contato && (
              <a href={`https://wa.me/${p.contato.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: "var(--tap)", color: "var(--ok)", textDecoration: "none" }}>
                <Icon name="brand-whatsapp" size={13} color="var(--ok)" /> {p.contato}
              </a>
            )}
            {p.dataAprovado && <span><Icon name="circle-check" size={11} /> Aprov {dataCurta(p.dataAprovado)}</span>}
            {p.dataEnvio && <span><Icon name="truck-delivery" size={11} /> Enviado {dataCurta(p.dataEnvio)}</span>}
          </div>
        )}

        {/* O que era o pedido */}
        {p && p.itens.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>O que tinha no pedido ({p.itens.length})</div>
            {/* Quem escalona é a LISTA, não o item: o `--mt-i` de cada filho é
                carimbado aqui, e o cartão não precisa saber a própria posição. */}
            <Fila style={{ display: "grid", gridTemplateColumns: grade(230, 2, 12), gap: 12 }}>
              {p.itens.map((i, k) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 13, minWidth: 0 }}>
                  {i.imagem
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={i.imagem} alt={i.nome} title="Clique para ampliar"
                        style={{ width: "clamp(48px, 14vw, 68px)", height: "clamp(48px, 14vw, 68px)", borderRadius: 12, objectFit: "cover", flex: "none", border: "1px solid var(--border)" }} />
                    : <span style={{ width: "clamp(48px, 14vw, 68px)", height: "clamp(48px, 14vw, 68px)", borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: "var(--surface-2)" }}>
                        <Icon name="box" size={24} color="var(--text-dim)" />
                      </span>}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{i.tipo}</div>
                    <div style={{ color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.nome}</div>
                  </div>
                </div>
              ))}
            </Fila>
          </div>
        )}

        {/* Quem mexeu, e quando */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9, flexWrap: "wrap" }}>
            <Icon name="history" size={15} color="var(--info)" />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--info)" }}>Por onde passou</span>
            {dados?.horasNaEtapa != null && (
              <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>nesta etapa há {duracao(dados.horasNaEtapa)}</span>
            )}
          </div>

          {erro ? (
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>O log do ERP não respondeu.</div>
          ) : !dados ? (
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Carregando…</div>
          ) : dados.marcos.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Sem registros no log do ERP.</div>
          ) : (
            // Mais recente primeiro, com o tempo que ficou em cada etapa — é o
            // que responde "ficou parado onde?".
            <Fila style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 300, overflowY: "auto" }}>
              {[...dados.marcos].reverse().map((m, k, arr) => {
                const anterior = arr[k + 1];
                const ficou = anterior
                  ? (new Date(m.em).getTime() - new Date(anterior.em).getTime()) / 36e5
                  : null;
                return (
                  <div key={`${m.em}-${k}`} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 12, flexWrap: "wrap" }}>
                    <span style={{ flex: "none", width: 8, height: 8, borderRadius: 999, marginTop: 5, background: m.etapa != null ? "var(--info)" : "var(--border)" }} />
                    <span style={{ flex: "none", color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{dataHora(m.em)}</span>
                    <span style={{ minWidth: 0, fontWeight: m.etapa != null ? 700 : 400 }}>{m.titulo}</span>
                    {m.quem && <span style={{ color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {m.quem}</span>}
                    {ficou != null && ficou >= 1 && (
                      <span style={{ color: "var(--text-dim)", flex: "none" }}>· levou {duracao(ficou)}</span>
                    )}
                  </div>
                );
              })}
            </Fila>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
