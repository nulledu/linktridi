"use client";

// ── Aquecimento · Roteiros ───────────────────────────────────────────────────
// O "Configurar Linha do Tempo" do pedido: as etapas com deslocamento em dias.
//
// Mostra junto a TAXA DE SOBREVIVÊNCIA do roteiro — quantos ativos que o
// seguiram chegaram a aquecido e quantos foram banidos. Sai de um group by, sem
// tabela nova, e é o que transforma cadastro em aprendizado: depois de vinte
// chips dá pra responder qual roteiro realmente sobrevive, em vez de discutir.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { Botao, BotaoIcone } from "../../ui/controles";
import { sobrevivenciaDe, TIPOS, type Ativo, type Marco, type Roteiro } from "@/lib/marketing-aquecimento-const";
import "../../operacao/geral/visao-geral.css";

type Rascunho = { id?: string; dia: number; titulo: string };

export function Roteiros({ roteiros, ativos, marcosPorAtivo, podeEditar, onSalvo }: {
  roteiros: Roteiro[];
  ativos: Ativo[];
  marcosPorAtivo: Map<string, Marco[]>;
  podeEditar: boolean;
  onSalvo: (rs: Roteiro[]) => void;
}) {
  if (!roteiros.length) {
    return (
      <div className="ct-sec" style={{
        padding: "38px 22px", textAlign: "center", color: "var(--text-dim)",
      }}>
        <Icon name="list-check" size={26} color="var(--text-dim)" />
        <p style={{ margin: "10px auto 0", fontWeight: 600, color: "var(--text)" }}>Nenhum roteiro carregado</p>
        <p style={{ margin: "3px auto 0", fontSize: 13, maxWidth: 400 }}>
          Rode <code>supabase/marketing_aquecimento.sql</code> — ele já cria os três roteiros iniciais.
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {roteiros.map((r) => (
        <Editor key={r.id} roteiro={r} ativos={ativos} marcosPorAtivo={marcosPorAtivo}
          podeEditar={podeEditar} onSalvo={onSalvo} />
      ))}
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.6 }}>
        Editar um roteiro <b>não reescreve o passado</b>: etapa já cumprida guarda o próprio
        registro e continua na linha do tempo de quem a cumpriu. A mudança vale do ponto
        atual em diante.
      </p>
    </div>
  );
}

function Editor({ roteiro, ativos, marcosPorAtivo, podeEditar, onSalvo }: {
  roteiro: Roteiro; ativos: Ativo[]; marcosPorAtivo: Map<string, Marco[]>;
  podeEditar: boolean; onSalvo: (rs: Roteiro[]) => void;
}) {
  // Ordenado por DIA, sempre. `ordem` existe na tabela mas nao manda em nada:
  // a pendencia, a fila do dia e a linha do tempo TODAS ordenam por `dia`. Um
  // editor que deixasse arrastar a etapa pra outra posicao sem mexer no dia
  // mostraria uma sequencia que nenhuma outra tela usa — controle que mente.
  // Aqui a posicao E o dia: mudar o numero move a etapa.
  const vivas = useMemo(
    () => [...roteiro.etapas.filter((e) => !e.removidaEm)].sort((a, b) => a.dia - b.dia || a.ordem - b.ordem),
    [roteiro.etapas]);
  const [rasc, setRasc] = useState<Rascunho[]>(() => vivas.map((e) => ({ id: e.id, dia: e.dia, titulo: e.titulo })));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Roteiro recarregado de fora (outro salvamento) reseta o rascunho.
  useEffect(() => {
    setRasc(vivas.map((e) => ({ id: e.id, dia: e.dia, titulo: e.titulo })));
  }, [vivas]);

  const sujo = useMemo(() => {
    if (rasc.length !== vivas.length) return true;
    return rasc.some((r, i) => r.id !== vivas[i]?.id || r.dia !== vivas[i]?.dia || r.titulo !== vivas[i]?.titulo);
  }, [rasc, vivas]);

  const sobrev = useMemo(() => sobrevivenciaDe(roteiro.id, ativos, marcosPorAtivo),
    [roteiro.id, ativos, marcosPorAtivo]);
  const tipo = TIPOS.find((t) => t.key === roteiro.tipo);
  const duracao = rasc.reduce((m, e) => Math.max(m, e.dia), 0);

  const mexer = (i: number, patch: Partial<Rascunho>) =>
    setRasc((r) => {
      const n = r.map((e, k) => (k === i ? { ...e, ...patch } : e));
      // Reordena so quando o DIA muda: reordenar a cada tecla do titulo faria o
      // campo pular de lugar debaixo do cursor no meio da digitacao.
      return patch.dia === undefined ? n : [...n].sort((a, b) => a.dia - b.dia);
    });
  const remover = (i: number) => setRasc((r) => r.filter((_, n) => n !== i));
  const adicionar = () => setRasc((r) => [...r, { dia: (r.at(-1)?.dia ?? 0) + 2, titulo: "" }]);

  async function salvar() {
    setSalvando(true); setErro("");
    const r = await fetch("/api/marketing/aquecimento/roteiro", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roteiroId: roteiro.id, etapas: rasc.filter((e) => e.titulo.trim()) }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) onSalvo(r.roteiros as Roteiro[]);
    else setErro(r?.error === "sem_permissao" ? "Você não tem permissão para editar roteiros." : "Não deu para salvar. Tente de novo.");
    setSalvando(false);
  }

  return (
    <section className="ct-sec">
      <header className="ct-sec-cab">
        <span aria-hidden className="og-cartao-icone"><Icon name={tipo?.icone ?? "list-check"} size={17} color="var(--primary)" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{roteiro.nome}</h2>
          <p>{rasc.length} {rasc.length === 1 ? "etapa" : "etapas"} · {duracao} dias</p>
        </div>
      </header>

      <div style={{
        display: "flex", gap: 18, flexWrap: "wrap", padding: "12px 16px",
        borderTop: "1px solid var(--border)",
      }}>
        <Kpi valor={sobrev.total ? `${Math.round(sobrev.taxaAquecido * 100)}%` : "—"}
          label="chegaram a aquecido" cor="var(--ok)" />
        <Kpi valor={sobrev.total ? `${Math.round(sobrev.taxaBanido * 100)}%` : "—"}
          label="banidos no caminho" cor="var(--perigo)" />
        <Kpi valor={sobrev.duracaoMedia !== null ? `${sobrev.duracaoMedia}d` : "—"}
          label="duração real média" />
        <Kpi valor={String(sobrev.total)} label="ativos já rodaram" />
      </div>

      {rasc.map((e, i) => (
        <div key={e.id ?? `novo-${i}`} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "9px 16px",
          borderTop: "1px solid var(--border)", minHeight: "var(--tap)",
        }}>
          <span style={{ flex: "0 0 auto", width: 16, textAlign: "right", fontSize: 11.5,
            color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>

          <label style={{ flex: "0 0 auto" }}>
            <span className="sr-only" style={{ position: "absolute", left: -9999 }}>Dia da etapa</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 640 }}>D+</span>
              <input type="number" min={0} max={365} value={e.dia} disabled={!podeEditar}
                onChange={(ev) => mexer(i, { dia: Math.max(0, Math.min(365, Number(ev.target.value) || 0)) })}
                className="aq-num aq-dia"
                style={{ fontSize: 12.5, fontWeight: 640, fontVariantNumeric: "tabular-nums" }} />
            </span>
          </label>

          <input value={e.titulo} disabled={!podeEditar} maxLength={160}
            onChange={(ev) => mexer(i, { titulo: ev.target.value })}
            placeholder="O que precisa ser feito nesse dia"
            className="aq-num"
            style={{ flex: 1, minWidth: 0, fontSize: 14 }} />

          {podeEditar && (
            <BotaoIcone icone="x" titulo={`Remover etapa ${e.titulo}`} tamanho="sm" onClick={() => remover(i)} />
          )}
        </div>
      ))}

      {podeEditar && (
        <div style={{
          display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
          padding: "12px 16px", borderTop: "1px solid var(--border)",
        }}>
          <Botao variante="sutil" icone="plus" onClick={adicionar}>Nova etapa</Botao>
          <span style={{ marginLeft: "auto", display: "flex", gap: 9, alignItems: "center" }}>
            {erro && <span style={{ fontSize: 12.5, color: "var(--perigo)" }}>{erro}</span>}
            <Botao variante="primario" onClick={salvar} disabled={!sujo || salvando}>
              {salvando ? "Salvando…" : "Salvar roteiro"}
            </Botao>
          </span>
        </div>
      )}
    </section>
  );
}

function Kpi({ valor, label, cor }: { valor: string; label: string; cor?: string }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <b style={{
        fontSize: 19, fontWeight: 660, letterSpacing: "-.02em",
        fontVariantNumeric: "tabular-nums", color: cor ?? "var(--text)",
      }}>{valor}</b>
      <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{label}</span>
    </span>
  );
}
