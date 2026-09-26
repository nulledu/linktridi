"use client";

import { memo } from "react";
import { Icon } from "../../../Icon";
import { Avatar } from "./Avatar";
import { MenuMais, type ItemMenu } from "./MenuContexto";
import { corDoCanal, eGeral } from "@/lib/chat/regras";
import type { Canal } from "@/lib/chat/tipos";

interface Props {
  canal: Canal;
  painelAberto: boolean;
  emCelular: boolean;
  online: boolean;
  aoVoltar: () => void;
  aoAlternarPainel: () => void;
  aoBuscarNoCanal: () => void;
  aoAbrirInfo: () => void;
  aoAbrirMembros: () => void;
  /** Itens do "⋯" — montados quando ele abre. */
  itensMenu: () => ItemMenu[];
}

export const CabecalhoCanal = memo(function CabecalhoCanal(p: Props) {
  const { canal } = p;
  const direta = canal.tipo === "direta";
  const grupo = canal.tipo === "grupo";
  const geral = eGeral(canal);
  const cor = corDoCanal(canal);

  return (
    <header className="ch-cabecalho">
      {/* A "linha de contexto": 4px que dizem, sem ler nada, onde você está. */}
      {!direta && !grupo && !geral && cor !== "transparent" && (
        <span className="ch-cabecalho__contexto" style={{ background: cor }} aria-hidden />
      )}

      {p.emCelular && (
        <button type="button" className="ch-icone" onClick={p.aoVoltar} aria-label="Voltar para a lista">
          <Icon name="chevron-left" size={20} />
        </button>
      )}

      {direta && <Avatar nome={canal.nome} src={canal.avatar} size={34} status={p.online ? "online" : "offline"} />}
      {grupo && <Avatar nome={canal.nome} grupo icone="users" size={34} cor={canal.cor} />}

      <button type="button" className="ch-cabecalho__id" onClick={p.aoAbrirInfo}>
        <span className="ch-cabecalho__titulo">
          {!direta && !grupo && <Icon name={geral ? "speakerphone" : canal.privado ? "lock" : "hash"} size={16} color="var(--text-dim)" />}
          <span>{canal.nome}</span>
          {canal.somente_leitura && <Icon name="eye" size={14} color="var(--text-dim)" />}
          {canal.arquivado && <Icon name="archive" size={14} color="var(--text-dim)" />}
        </span>
        <span className="ch-cabecalho__sub">
          {direta
            ? (p.online ? "Online" : "Offline")
            : [geral ? "Todo mundo" : `${canal.membros} membros`, canal.topico || canal.descricao].filter(Boolean).join(" · ")}
        </span>
      </button>

      <div className="ch-cabecalho__acoes">
        {!direta && (
          <button type="button" className="ch-icone" data-so-desktop onClick={p.aoAbrirMembros} aria-label="Membros" title="Membros">
            <Icon name="users" size={18} />
          </button>
        )}
        <button type="button" className="ch-icone" onClick={p.aoBuscarNoCanal} aria-label="Buscar nesta conversa" title="Buscar aqui">
          <Icon name="search" size={18} />
        </button>
        <button type="button" className="ch-icone" data-so-desktop onClick={p.aoAlternarPainel}
          aria-pressed={p.painelAberto} aria-label="Painel lateral" title="Painel">
          <Icon name="layout-columns" size={18} />
        </button>
        <MenuMais titulo="Mais opções" montar={p.itensMenu}
          gatilho={({ ref, ...g }) => (
            <button ref={ref} type="button" className="ch-icone" aria-label="Mais opções" title="Mais" {...g}>
              <Icon name="dots-vertical" size={18} />
            </button>
          )} />
      </div>
    </header>
  );
});
