"use client";

// Ponte entre o resto do ERP e o chat.
//
// Qualquer tela pode soltar este botão ao lado de uma atividade, um pedido, uma
// tarefa — e ela vira um CARD dentro da conversa, com link para abrir sem sair
// do chat. É isso que separa este mensageiro de um Slack colado por fora: a
// entidade viaja inteira, não como texto.
//
//   <CompartilharNoChat card={{ tipo: "atividade", ref: a.id, titulo: a.nome,
//                               subtitulo: a.setor, url: `/atividades?id=${a.id}` }} />

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
// A folha do chat traz `.ch-modal`, `.ch-campo` e companhia. O bundler dedup‑a
// quando a tela de mensagens também está aberta.
import "../central/mensagens/ui/chat.css";
import { Icon } from "../Icon";
import { toast } from "../Toast";
import type { CardContexto } from "@/lib/chat/tipos";

interface CanalSimples { id: string; nome: string; tipo: string; privado: boolean; arquivado: boolean }

export function CompartilharNoChat({
  card, rotulo = "Compartilhar no chat", compacto = false,
}: { card: CardContexto; rotulo?: string; compacto?: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title={rotulo}
        aria-label={rotulo}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          minHeight: 34, padding: compacto ? 0 : "0 12px", width: compacto ? 34 : undefined,
          justifyContent: "center", borderRadius: 10, cursor: "pointer",
          border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)",
          fontSize: 13, fontWeight: 600, boxShadow: "none",
        }}
      >
        <Icon name="share" size={16} color="var(--text-dim)" />
        {!compacto && rotulo}
      </button>
      {aberto && <Seletor card={card} aoFechar={() => setAberto(false)} />}
    </>
  );
}

function Seletor({ card, aoFechar }: { card: CardContexto; aoFechar: () => void }) {
  const [canais, setCanais] = useState<CanalSimples[] | null>(null);
  const [busca, setBusca] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);

  useEffect(() => {
    // Importa a camada de dados do chat sob demanda: quem nunca compartilha
    // nada não carrega nada disso.
    import("../central/mensagens/data/api")
      .then(({ api }) => api.canais())
      .then((d) => setCanais(d.canais as CanalSimples[]))
      .catch(() => setCanais([]));
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (canais ?? []).filter((c) => !c.arquivado && (!q || c.nome.toLowerCase().includes(q))).slice(0, 40);
  }, [canais, busca]);

  const enviar = useCallback(async (canalId: string) => {
    setEnviando(canalId);
    try {
      const { api } = await import("../central/mensagens/data/api");
      await api.enviar({
        canal_id: canalId, card, texto: comentario.trim() || undefined,
        cliente_ref: `share:${card.tipo}:${card.ref}`,
      });
      toast.ok("Compartilhado no chat.");
      aoFechar();
    } catch {
      toast.erro("Não deu para compartilhar agora.");
      setEnviando(null);
    }
  }, [card, comentario, aoFechar]);

  return createPortal(
    <div className="ch-modal-fundo" onClick={aoFechar} role="dialog" aria-modal aria-label="Compartilhar no chat">
      <div className="ch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ch-modal__topo">Compartilhar no chat</div>
        <div className="ch-modal__corpo">
          <div style={{
            border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px",
            fontSize: 13, marginBottom: 12, background: "var(--surface-2)",
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-dim)" }}>
              {card.tipo}
            </div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{card.titulo}</div>
            {card.subtitulo && <div style={{ color: "var(--text-dim)", fontSize: 12.5 }}>{card.subtitulo}</div>}
          </div>

          <input className="ch-campo" placeholder="Comentário (opcional)" value={comentario}
            onChange={(e) => setComentario(e.target.value)} />

          <label className="ch-rotulo">Para onde</label>
          <input className="ch-campo" placeholder="Buscar canal ou pessoa" value={busca}
            onChange={(e) => setBusca(e.target.value)} autoFocus />

          <div style={{ marginTop: 8 }}>
            {canais === null && Array.from({ length: 4 }, (_, i) => (
              <span key={i} className="ch-esqueleto" style={{ display: "block", height: 40, margin: "6px 0" }} />
            ))}
            {lista.map((c) => (
              <button key={c.id} type="button" className="ch-linha-lista" disabled={!!enviando}
                onClick={() => void enviar(c.id)}>
                <Icon name={c.tipo === "direta" ? "user" : c.privado ? "lock" : "hash"} size={16} color="var(--text-dim)" />
                <span className="ch-linha-lista__corpo">{c.nome}</span>
                {enviando === c.id
                  ? <Icon name="loader" size={15} color="var(--primary-texto)" />
                  : <Icon name="send" size={15} color="var(--primary-texto)" />}
              </button>
            ))}
            {canais?.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
                Você ainda não participa de nenhum canal.
              </p>
            )}
          </div>
        </div>
        <div className="ch-modal__rodape">
          <button type="button" className="ch-btn" onClick={aoFechar}>Fechar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
