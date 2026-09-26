"use client";

// ── Transferir: mudar peça de lugar, de pé no galpão ─────────────────────────
//
// Três passos num painel só: achar o item (mesmo gesto da Consultar — bipa ou
// digita), dizer DE ONDE e PRA ONDE, dizer QUANTO. A frase do que vai
// acontecer aparece ANTES do botão gravar. A régua é a mesma da rota
// (lib/estoque-transferencia.ts): a tela recusa antes do clique, o banco
// revalida com a linha do item travada.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";
import {
  problemaDaTransferencia, semLugar as calcularSemLugar, type LugarComSaldo,
} from "@/lib/estoque-transferencia";

interface ItemAchado {
  id: string; nome: string; sku: string | null; unidade: string;
  quantidade: number; imagemUrl?: string | null; local: string | null;
  lugares?: LugarComSaldo[]; semLugar?: number;
}
interface LugarDaArvore { id: string; nome: string; pai_id: string | null; ativo?: boolean | null }

/** null = balde "sem lugar definido". */
const SEM_LUGAR = null;

const alvoGrande = (marcado: boolean): React.CSSProperties => ({
  minHeight: "var(--tap)", display: "flex", justifyContent: "space-between",
  gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: "var(--r-sm)",
  border: `1.5px solid ${marcado ? "var(--primary)" : "var(--border)"}`,
  background: marcado ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
  color: "var(--text)", textAlign: "left",
});

export function TransferirPanel() {
  const [termo, setTermo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [opcoes, setOpcoes] = useState<ItemAchado[]>([]);
  const [item, setItem] = useState<ItemAchado | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [de, setDe] = useState<string | null>(SEM_LUGAR);
  const [para, setPara] = useState<string | null>(SEM_LUGAR);
  const [qtd, setQtd] = useState("");
  const [filtroDestino, setFiltroDestino] = useState("");
  const [arvore, setArvore] = useState<LugarDaArvore[]>([]);
  const [gravando, setGravando] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  // A árvore de lugares é pequena (~80 linhas) e não muda no meio do gesto:
  // uma ida só, sem poll.
  useEffect(() => {
    let vivo = true;
    fetch("/api/estoque/locais", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (vivo) setArvore((d.locais ?? []) as LugarDaArvore[]); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const escolher = useCallback((i: ItemAchado) => {
    setItem(i); setOpcoes([]); setQtd(""); setPara(SEM_LUGAR); setFeito(null);
    // Origem pré-escolhida quando não há dúvida: o lugar de maior saldo (a
    // lista já vem ordenada), ou o balde sem-lugar quando não há lugar nenhum.
    const lugares = i.lugares ?? [];
    setDe(lugares.length ? lugares[0].id : SEM_LUGAR);
  }, []);

  const buscar = useCallback(async (texto: string, ehCodigo: boolean) => {
    const alvo = texto.trim();
    if (!alvo) return;
    setBuscando(true); setAviso(null); setFeito(null);
    try {
      const p = new URLSearchParams(ehCodigo ? { codigo: alvo } : { busca: alvo });
      const r = await fetch(`/api/estoque/consultar?${p}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) { setAviso(d?.detalhe ?? "Não deu para buscar agora."); return; }
      const itens = (d.itens ?? []) as ItemAchado[];
      if (itens.length === 1) escolher(itens[0]);
      else {
        setItem(null); setOpcoes(itens);
        if (!itens.length) setAviso(d.aviso ?? "Nenhum item com esse código ou nome.");
      }
    } catch {
      setAviso("Sem conexão — a busca precisa de rede.");
    } finally {
      setBuscando(false);
      requestAnimationFrame(() => { campoRef.current?.focus(); campoRef.current?.select(); });
    }
  }, [escolher]);

  const lugares = item?.lugares ?? [];
  const semLugarQtd = item ? (item.semLugar ?? calcularSemLugar(item.quantidade, lugares)) : 0;

  const caminhoDoLugar = useCallback((id: string): string => {
    const nomes: string[] = [];
    let atual: LugarDaArvore | undefined = arvore.find((l) => l.id === id);
    for (let i = 0; atual && i < 10; i++) {
      nomes.unshift(atual.nome);
      const paiId: string | null = atual.pai_id;
      atual = paiId ? arvore.find((l) => l.id === paiId) : undefined;
    }
    return nomes.join(" › ") || id;
  }, [arvore]);

  const destinos = useMemo(() => {
    const f = filtroDestino.trim().toLowerCase();
    return arvore
      .filter((l) => l.ativo !== false && l.id !== de)
      .filter((l) => !f || caminhoDoLugar(l.id).toLowerCase().includes(f))
      .slice(0, 8);
  }, [arvore, filtroDestino, de, caminhoDoLugar]);

  const quantidade = Math.floor(Number(qtd || "0"));
  const problema = item && qtd
    ? problemaDaTransferencia({ total: item.quantidade, lugares, deLocalId: de, paraLocalId: para, quantidade })
    : null;
  const pronto = !!item && !!qtd && !problema;

  async function transferir() {
    if (!item || !pronto || gravando) return;
    setGravando(true); setAviso(null);
    try {
      const r = await fetch("/api/estoque/transferir", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, deLocalId: de, paraLocalId: para, quantidade }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setAviso(String(d?.detalhe ?? "Não deu pra transferir agora.")); return; }
      setItem({ ...item, lugares: (d.lugares ?? []) as LugarComSaldo[], semLugar: Number(d.semLugar ?? 0) });
      setQtd("");
      navigator.vibrate?.([18, 45, 18]);
      setFeito(`${quantidade} peça(s) transferida(s).`);
    } catch {
      setAviso("Sem conexão — nada foi transferido.");
    } finally { setGravando(false); }
  }

  const nomeDoLado = (id: string | null) =>
    id === SEM_LUGAR ? "sem lugar definido" : caminhoDoLugar(id);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <form
        onSubmit={(e) => { e.preventDefault(); void buscar(termo, false); }}
        style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 200px), 1fr) auto", gap: 8 }}
      >
        <input
          ref={campoRef} value={termo}
          onChange={(e) => setTermo(e.target.value.slice(0, 60))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void buscar(termo, true); } }}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="Bipe a etiqueta ou digite o nome"
          aria-label="Código ou nome do item"
          style={{ minHeight: "var(--tap)", padding: "10px 14px", fontSize: 16,
            borderRadius: "var(--r-sm)", border: "1.5px solid var(--border)",
            background: "var(--surface)", color: "var(--text)", width: "100%" }}
        />
        <Botao type="submit" disabled={buscando}>
          <Icon name="search" size={16} color="currentColor" /> Buscar
        </Botao>
      </form>

      {aviso && <p role="alert" style={{ margin: 0, color: "var(--perigo)", fontSize: 14 }}>{aviso}</p>}
      {feito && <p role="status" style={{ margin: 0, color: "var(--ok)", fontSize: 14 }}>{feito}</p>}

      {opcoes.map((o) => (
        <button key={o.id} type="button" onClick={() => escolher(o)}
          style={{ ...alvoGrande(false), justifyContent: "flex-start" }}>
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <strong>{o.nome}</strong>{o.sku ? ` · ${o.sku}` : ""} — {o.quantidade} {o.unidade}
          </span>
        </button>
      ))}

      {item && (
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <strong style={{ fontSize: 16 }}>{item.nome}</strong>
            <span style={{ color: "var(--text-dim)", fontSize: 14 }}> — {item.quantidade} {item.unidade} no total</span>
          </div>

          {/* DE ONDE sai */}
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>De onde sai</span>
            {lugares.map((l) => (
              <button key={l.id} type="button" aria-pressed={de === l.id}
                onClick={() => { setDe(l.id); if (para === l.id) setPara(SEM_LUGAR); }}
                style={alvoGrande(de === l.id)}>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{l.caminho}</span>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{l.quantidade}</strong>
              </button>
            ))}
            {semLugarQtd > 0 && (
              <button type="button" aria-pressed={de === SEM_LUGAR}
                onClick={() => setDe(SEM_LUGAR)} style={alvoGrande(de === SEM_LUGAR)}>
                <span>sem lugar definido</span>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{semLugarQtd}</strong>
              </button>
            )}
            {!lugares.length && semLugarQtd === 0 && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>
                Este item está sem saldo — não há o que transferir.
              </p>
            )}
          </div>

          {/* PRA ONDE vai */}
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Pra onde vai</span>
            <input value={filtroDestino} onChange={(e) => setFiltroDestino(e.target.value.slice(0, 60))}
              placeholder="Filtre o lugar de destino" aria-label="Filtrar lugar de destino"
              style={{ minHeight: "var(--tap)", padding: "10px 12px", fontSize: 15,
                borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
                background: "var(--surface)", color: "var(--text)", width: "100%" }} />
            {destinos.map((l) => (
              <button key={l.id} type="button" aria-pressed={para === l.id}
                onClick={() => setPara(l.id)}
                style={{ ...alvoGrande(para === l.id), justifyContent: "flex-start" }}>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{caminhoDoLugar(l.id)}</span>
              </button>
            ))}
            {!destinos.length && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>
                Nenhum lugar com esse nome. Lugares novos são cadastrados em Estoque › Localização.
              </p>
            )}
          </div>

          {/* QUANTO */}
          <label style={{ display: "grid", gap: 5, maxWidth: 200 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Quantas peças</span>
            <input inputMode="numeric" pattern="[0-9]*" value={qtd}
              onChange={(e) => setQtd(e.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-label="Quantidade a transferir"
              style={{ minHeight: "var(--tap)", padding: "10px 12px", fontSize: 16,
                borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
                background: "var(--surface)", color: "var(--text)" }} />
          </label>

          {problema
            ? <p role="alert" style={{ margin: 0, fontSize: 14, color: "var(--perigo)" }}>{problema}</p>
            : pronto && (
              <p style={{ margin: 0, fontSize: 14, color: "var(--text-dim)" }}>
                Vai transferir <strong>{quantidade}</strong> de <strong>{nomeDoLado(de)}</strong> pra{" "}
                <strong>{nomeDoLado(para)}</strong>.
              </p>
            )}

          <Botao onClick={() => void transferir()} disabled={!pronto || gravando}>
            <Icon name="arrows-exchange" size={16} color="currentColor" />
            {gravando ? "Transferindo…" : "Transferir"}
          </Botao>
        </div>
      )}
    </div>
  );
}
