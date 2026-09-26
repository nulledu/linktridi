"use client";

// ── Tridify · Anotações na timeline (§5) ─────────────────────────────────────
// Widget: registra e mostra o que mudou (orçamento, criativo, promoção,
// instabilidade, lançamento) pra explicar variações nos números. Self-contained
// (busca/grava na própria API). Tolerante: sem a tabela, some sozinho.

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { AvatarMiudo, Cartao, ListaQueCabe, Vazio } from "./TfKit";
import { TrocaIcone } from "../ui/micro";
import { Botao } from "../ui/controles";

interface Anotacao { id: string; dia: string; tipo: string; texto: string; autor_nome: string | null; created_at: string }
const TIPOS: { key: string; label: string; cor: string; icon: string }[] = [
  { key: "orcamento", label: "Orçamento", cor: "var(--tf-pos)", icon: "trending-up" },
  { key: "criativo", label: "Criativo", cor: "var(--tf-accent)", icon: "sparkles" },
  { key: "promocao", label: "Promoção", cor: "var(--tf-warn)", icon: "bolt" },
  { key: "instabilidade", label: "Instabilidade", cor: "var(--tf-neg)", icon: "alert-triangle" },
  { key: "lancamento", label: "Lançamento", cor: "var(--tf-info)", icon: "activity" },
  { key: "outro", label: "Outro", cor: "var(--text-dim)", icon: "bell" },
];
const tipoDe = (k: string) => TIPOS.find((t) => t.key === k) ?? TIPOS[TIPOS.length - 1];

export function AnotacoesTimeline() {
  const [itens, setItens] = useState<Anotacao[]>([]);
  const [ausente, setAusente] = useState(false);
  const [add, setAdd] = useState(false);
  const [tipo, setTipo] = useState("orcamento");
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/trafego/anotacoes").then((r) => r.json()).then((j) => setItens(j.anotacoes ?? [])).catch(() => {});
  }, []);

  async function salvar() {
    if (!texto.trim() || salvando) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/trafego/anotacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, texto }) });
      const j = await r.json();
      if (j.ok && j.anotacao) { setItens((v) => [j.anotacao, ...v]); setTexto(""); setAdd(false); }
      else if (j.error === "tabela_ausente") setAusente(true);
    } catch { /* */ }
    setSalvando(false);
  }

  return (
    // Zonas do widget (.tf-w): cabeçalho fixo, feed no corpo — que rola por
    // DENTRO (é um feed vivo, rolar é o comportamento; o teto fixo de 220px
    // anterior ignorava a caixa do card).
    <div className="tf-w" style={{ gap: 10 }}>
      <div className="tf-w-topo" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", flex: 1 }}>Anotações da timeline</span>
        <Botao variante="secundario" tamanho="sm" onClick={() => setAdd((v) => !v)}>
          <TrocaIcone ligado={add} a="plus" b="x" size={13} corA="currentColor" corB="currentColor" /> {add ? "Fechar" : "Anotar"}
        </Botao>
      </div>

      {ausente && <div style={{ fontSize: 11.5, color: "var(--tf-warn)" }}>Falta rodar trafego_anotacoes.sql no servidor.</div>}

      {add && !ausente && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 11, border: "1px solid var(--border)", background: "var(--surface-2, transparent)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {TIPOS.map((t) => (
              <button key={t.key} onClick={() => setTipo(t.key)} style={{ padding: "4px 9px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 700, border: tipo === t.key ? `1px solid ${t.cor}` : "1px solid var(--border)", background: tipo === t.key ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "transparent", color: tipo === t.key ? "var(--text)" : "var(--text-dim)" }}>{t.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salvar(); }} placeholder="O que mudou? Ex.: subi orçamento da CBO Escala pra R$ 500" style={{ flex: 1, padding: "8px 11px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5 }} />
            <Botao variante="primario" onClick={salvar} disabled={!texto.trim()} carregando={salvando}>Salvar</Botao>
          </div>
        </div>
      )}

      {/* Sem rolagem interna (regra do painel, 19/09): quem decide quantas
          anotações cabem é o medidor, e o resto vira "+N anotações". */}
      <ListaQueCabe className="tf-w-corpo" style={{ gap: 7 }} rotuloResto={(nq) => `+${nq} anotaç${nq === 1 ? "ão" : "ões"}`}>
        {itens.length === 0 && !add && <Vazio icon="bell">Sem anotações. Registre o que mudou — orçamento, criativo, promoção — pra explicar as variações dos números depois.</Vazio>}
        {itens.map((a) => { const t = tipoDe(a.tipo); return (
          // Linha COMPACTA do kit, com a byline de avatar do exemplo ("Por Marcela").
          <Cartao key={a.id} compacto proeminencia="plano" style={{ flexDirection: "row", alignItems: "flex-start", gap: 9, padding: "8px 10px", border: "1px solid var(--border)" }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, flex: "none", display: "grid", placeItems: "center", background: "var(--surface-2, var(--bg))" }}><Icon name={t.icon} size={14} color={t.cor} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.4 }}>{a.texto}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>
                {t.label} · {a.dia?.slice(5)}
                {a.autor_nome && <><span aria-hidden>·</span><AvatarMiudo nome={a.autor_nome} tamanho={16} /> {a.autor_nome}</>}
              </div>
            </div>
          </Cartao>
        ); })}
      </ListaQueCabe>
    </div>
  );
}
