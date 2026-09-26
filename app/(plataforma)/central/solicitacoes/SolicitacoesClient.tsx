"use client";

// ── Central · Solicitações ───────────────────────────────────────────────────
// A fila de pedidos VOLTOU a ter tela própria. Ela tinha sido fundida na caixa
// de entrada com o argumento de que "um pedido é uma tarefa que alguém te
// mandou" — e o argumento é verdadeiro pra quem RECEBE, mas não pro resto. Uma
// tarefa se conclui; uma solicitação se APROVA ou se RECUSA, com motivo, com
// imagem, com autor e com destinatário. Fundir as duas obrigava a lista única a
// carregar um item que não tinha caixinha pra marcar, um filtro que só valia
// pra ele, e um painel de detalhe inteiro em paralelo ao painel de tarefa.
//
// Aqui o pedido é o objeto principal, então o cartão da `Solicitacao.tsx` é a
// unidade da tela — sem tradução, sem `sol_` no id, sem escrita que precisa
// saber em qual tabela ela cai.
//
// O escopo é a mesma pergunta da caixa de entrada, porque é a pergunta certa:
// de quem o sistema está esperando alguma coisa.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../Icon";
import { Botao } from "../../ui/controles";
import { toast } from "../../Toast";
import { usePollComRecuo } from "../../ui/usePoll";
import { motivoDaFalha, respostaConfiavel } from "../../ui/rede";
import type { SolicitacaoLinha } from "@/lib/central-solicitacoes";
import { Card, NovaSolicitacao, RecusarPainel, Lightbox, podeResolverEsta, type Solic } from "./Solicitacao";

type Escopo = "recebidas" | "enviadas" | "resolvidas";
const ESCOPOS: { key: Escopo; nome: string; curto: string; icon: string }[] = [
  { key: "recebidas", nome: "Pra você responder", curto: "Pra você", icon: "inbox" },
  { key: "enviadas", nome: "Enviadas por você", curto: "Enviadas", icon: "send" },
  { key: "resolvidas", nome: "Resolvidas", curto: "Resolvidas", icon: "circle-check" },
];

export function SolicitacoesClient({ meuId, inicial, papelResolve = false }: {
  meuId: string;
  inicial: SolicitacaoLinha[];
  /** Papel de gestão: resolve qualquer pedido, não só os endereçados a você. */
  papelResolve?: boolean;
}) {
  const [fila, setFila] = useState<Solic[]>(inicial as Solic[]);
  const [escopo, setEscopo] = useState<Escopo>("recebidas");
  const [busca, setBusca] = useState("");
  const [nova, setNova] = useState(false);
  const [recusando, setRecusando] = useState<Solic | null>(null);
  const [zoom, setZoom] = useState<{ imagens: string[]; i: number } | null>(null);
  const assinatura = useRef("");   // estado da fila na última leitura

  const recarregar = useCallback(async () => {
    try {
      const r = await fetch("/api/central/solicitacoes");
      const d = await r.json();
      if (Array.isArray(d.solicitacoes)) setFila(d.solicitacoes);
    } catch { /* mantém o que já está na tela */ }
  }, []);
  useEffect(() => { if (!inicial.length) recarregar(); }, [recarregar, inicial.length]);

  // A fila é compartilhada: dois aprovadores na mesma tela viam telas diferentes
  // até alguém recarregar na mão. O tick NÃO baixa a lista — pede só a
  // assinatura (dois contadores e um carimbo, corpo vazio) e as linhas só vêm
  // quando ela muda. Sem novidade o intervalo dobra até o teto; um clique ou uma
  // mudança devolve o ritmo base.
  usePollComRecuo(async () => {
    try {
      const r = await fetch("/api/central/solicitacoes?assinatura=1");
      const d = await r.json();
      if (!d.assinatura || d.assinatura === assinatura.current) return false;
      const baseline = !assinatura.current;
      assinatura.current = d.assinatura;
      if (baseline) return false;
      await recarregar();
      return true;
    } catch { return false; }
  }, 30_000);

  // Decidir é otimista: o cartão muda na hora e a fila NÃO é rebaixada inteira
  // depois (era um refetch de até 300 linhas por clique). Deu erro, volta ao que
  // era e avisa — nada de status fantasma na tela.
  //
  // A checagem é `respostaConfiavel`, não `r.ok`: sem sessão o middleware
  // desvia pro login, que responde 200 com HTML, e o `r.ok` sozinho lia isso
  // como sucesso — o cartão ficava "aprovado" sem nada ter sido aprovado.
  async function resolver(id: string, status: string, motivo?: string) {
    const antes = fila;
    setFila((l) => l.map((s) => (s.id === id ? { ...s, status, motivo_recusa: motivo ?? s.motivo_recusa } : s)));
    try {
      const r = await fetch("/api/central/solicitacoes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, motivo_recusa: motivo }),
      });
      if (!respostaConfiavel(r)) throw new Error(r.ok ? "sessao_expirada" : `http_${r.status}`);
    } catch (e) {
      setFila(antes);
      toast(motivoDaFalha(e, "atualizar a solicitação"), "erro");
    }
  }

  // Quem ABRIU o pedido está sempre em "Enviadas", nunca em "Pra você
  // responder" — mesmo tendo papel de gestão. `podeResolverEsta` devolve `true`
  // pra qualquer pedido quando o papel resolve a fila inteira, e sem esta
  // exclusão o pedido que você mesmo abriu aparecia nas DUAS abas: uma fila de
  // "responda isto" com o seu próprio pedido dentro. Os botões de decidir
  // continuam existindo no cartão (o papel não mudou), só o lugar dele é um.
  const pertence = useCallback((s: Solic, e: Escopo) => {
    if (e === "resolvidas") return s.status !== "pendente";
    if (s.status !== "pendente") return false;
    if (e === "enviadas") return s.autor_id === meuId;
    return s.autor_id !== meuId && podeResolverEsta(s, meuId, papelResolve);
  }, [meuId, papelResolve]);

  const cnt = useMemo(() => ({
    recebidas: fila.filter((s) => pertence(s, "recebidas")).length,
    enviadas: fila.filter((s) => pertence(s, "enviadas")).length,
    resolvidas: fila.filter((s) => pertence(s, "resolvidas")).length,
  } as Record<Escopo, number>), [fila, pertence]);

  const q = busca.trim().toLowerCase();
  const lista = fila
    .filter((s) => pertence(s, escopo))
    .filter((s) => !q
      || s.titulo.toLowerCase().includes(q)
      || (s.descricao ?? "").toLowerCase().includes(q)
      || (s.autor_nome ?? "").toLowerCase().includes(q)
      || (s.setor_destino ?? "").toLowerCase().includes(q)
      || (s.tipo ?? "").toLowerCase().includes(q))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  const vazio = ESCOPOS.find((e) => e.key === escopo)!;

  return (
    <div style={{ minWidth: 0 }}>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontWeight: 800, color: "var(--text)", margin: 0, letterSpacing: "-0.02em" }}>Solicitações</h1>
            {/* Mesma ficha da contagem de Tarefas: as duas telas são irmãs e
                número solto ao lado do título lia como parte da frase. */}
            <span className="ct-contagem">{lista.length}</span>
          </div>
          <div className="desk-only sub" style={{ fontSize: 13.5, color: "var(--text-dim)", marginTop: 2 }}>
            {escopo === "recebidas" ? "Pedidos de aprovação, compra ou ajuste esperando a sua resposta."
              : escopo === "enviadas" ? "O que você pediu e ainda não foi respondido."
              : "Histórico do que já foi aprovado, recusado ou cancelado."}
          </div>
        </div>
        <Botao variante="primario" icone="plus" onClick={() => setNova(true)} style={{ flex: "none" }}>
          <span className="desk-only">Nova solicitação</span><span className="mob-only">Nova</span>
        </Botao>
      </div>

      {/* Escopo + busca: uma fileira só, que rola de lado em 320px. */}
      <div className="ct-filtros" role="tablist" aria-label="Escopo das solicitações"
        style={{ display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0, marginBottom: 16 }}>
        {ESCOPOS.map((e) => {
          const on = escopo === e.key;
          const n = cnt[e.key];
          return (
            <button key={e.key} role="tab" aria-selected={on} onClick={() => setEscopo(e.key)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: "var(--tap)", padding: "8px 14px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", flex: "none",
                border: on ? "none" : "1px solid var(--border)",
                background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)",
                color: on ? "var(--on-primary, #fff)" : "var(--text-dim)", fontSize: 13, fontWeight: 700 }}>
              <Icon name={e.icon} size={15} color={on ? "var(--on-primary, #fff)" : "var(--text-dim)"} />
              <span className="desk-only">{e.nome}</span><span className="mob-only">{e.curto}</span>
              {n > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", padding: "1px 6px", borderRadius: "var(--r-xs)", background: on ? "rgba(255,255,255,.22)" : "var(--surface-2)", color: on ? "var(--on-primary, #fff)" : "var(--text-dim)" }}>{n}</span>}
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        <div style={{ position: "relative", flex: "none" }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", lineHeight: 0 }}>
            <Icon name="search" size={13} color="var(--text-dim)" />
          </span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pedido"
            aria-label="Buscar solicitação"
            style={{ width: 190, minHeight: "var(--tap)", padding: "7px 10px 7px 28px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5 }} />
        </div>
      </div>

      {lista.length === 0 ? (
        <div style={{ padding: "40px 16px", textAlign: "center" }}>
          <Icon name={vazio.icon} size={26} color="var(--text-dim)" />
          <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text)", marginTop: 8 }}>
            {escopo === "recebidas" ? "Nenhum pedido esperando você."
              : escopo === "enviadas" ? "Você não tem pedidos em aberto."
              : "Nada resolvido ainda."}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 3 }}>
            {escopo === "enviadas"
              ? "O que você pedir aparece aqui até alguém responder."
              : "Aprovação, compra, ajuste — quando chegar um pedido, ele aparece aqui."}
          </div>
          {escopo !== "resolvidas" && (
            <Botao onClick={() => setNova(true)} style={{ marginTop: 14 }}>
              Abrir solicitação
            </Botao>
          )}
        </div>
      ) : (
        // `minmax(min(100%, 340px), 1fr)`: idêntico no computador, colapsa
        // sozinho no celular — sem media query e sem rolagem horizontal.
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 12, alignItems: "start" }}>
          {lista.map((s) => (
            <Card key={s.id} s={s} meuId={meuId}
              podeResolver={podeResolverEsta(s, meuId, papelResolve)}
              onResolver={resolver}
              onRecusar={() => setRecusando(s)}
              onVerImagem={(imagens, i) => setZoom({ imagens, i })} />
          ))}
        </div>
      )}

      {nova && <NovaSolicitacao onClose={() => setNova(false)} onSaved={() => { setNova(false); recarregar(); }} />}
      {recusando && (
        <RecusarPainel s={recusando} onClose={() => setRecusando(null)}
          onConfirmar={async (motivo) => { const alvo = recusando; setRecusando(null); await resolver(alvo.id, "recusada", motivo); }} />
      )}
      {zoom && <Lightbox imagens={zoom.imagens} inicial={zoom.i} onClose={() => setZoom(null)} />}
    </div>
  );
}
