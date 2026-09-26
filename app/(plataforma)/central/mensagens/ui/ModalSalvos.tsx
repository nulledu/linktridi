"use client";

// "Salvos para ler depois" — vive fora do canal, então não cabe no painel
// contextual: é uma camada própria, aberta pela sidebar.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../Icon";
import { Conteudo } from "./Conteudo";
import { api } from "../data/api";
import { previa, rotuloDia } from "@/lib/chat/regras";
import type { Mensagem } from "@/lib/chat/tipos";

export function ModalSalvos({
  meuNome, aoFechar, aoIrPara,
}: { meuNome: string; aoFechar: () => void; aoIrPara: (canalId: string, msgId: string) => void }) {
  const [itens, setItens] = useState<{ mensagem: Mensagem; canal: string }[] | null>(null);

  useEffect(() => {
    api.salvos().then((d) => setItens(d.itens)).catch(() => setItens([]));
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);

  async function remover(id: string) {
    setItens((l) => l?.filter((x) => x.mensagem.id !== id) ?? null);
    await api.salvar(id, false).catch(() => {});
  }

  return createPortal(
    <div className="ch-spot-fundo" onClick={aoFechar} role="dialog" aria-modal aria-label="Salvos">
      <div className="ch-spot" onClick={(e) => e.stopPropagation()}>
        <div className="ch-spot__campo">
          <Icon name="bookmark" size={18} color="var(--primary-texto)" />
          <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Salvos para ler depois</span>
          <button type="button" className="ch-icone" onClick={aoFechar} aria-label="Fechar">
            <Icon name="x" size={17} />
          </button>
        </div>

        <div className="ch-spot__lista">
          {itens === null && Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="ch-esqueleto" style={{ display: "block", height: 52, margin: 6 }} />
          ))}

          {itens?.map(({ mensagem, canal }) => (
            <div key={mensagem.id} className="ch-spot__item" style={{ alignItems: "flex-start" }}>
              <span style={{ width: 24, display: "grid", placeItems: "center", paddingTop: 3 }}>
                <Icon name="bookmark" size={15} color="var(--atencao)" />
              </span>
              <div style={{ whiteSpace: "normal" }}>
                <small style={{ whiteSpace: "normal" }}>
                  {mensagem.autor_nome} em {canal} · {rotuloDia(mensagem.created_at)}
                </small>
                <div style={{ whiteSpace: "normal", fontSize: 13.5, marginTop: 2 }}>
                  {mensagem.texto
                    ? <Conteudo texto={mensagem.texto} meuNome={meuNome} />
                    : previa(mensagem)}
                </div>
              </div>
              <button type="button" className="ch-icone" title="Abrir"
                onClick={() => { aoIrPara(mensagem.conversa_id, mensagem.id); aoFechar(); }}>
                <Icon name="external-link" size={15} />
              </button>
              <button type="button" className="ch-icone" title="Remover dos salvos"
                onClick={() => void remover(mensagem.id)}>
                <Icon name="x" size={15} />
              </button>
            </div>
          ))}

          {itens?.length === 0 && (
            <div className="ch-vazio" style={{ minHeight: 200 }}>
              <span className="ch-vazio__icone"><Icon name="bookmark" size={22} color="var(--text-dim)" /></span>
              <h3>Nada salvo ainda</h3>
              <p>Clique com o botão direito numa mensagem e escolha “Salvar para depois”. Ela fica aqui até você resolver.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
