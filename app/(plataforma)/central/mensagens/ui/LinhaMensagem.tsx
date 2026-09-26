"use client";

// Uma bolha. É o componente que mais existe na tela, então tudo aqui é feito
// pensando em não re-renderizar: `memo` com comparação explícita, nenhum objeto
// de estilo criado no render (só classes) e nenhum callback anônimo novo por
// mensagem — os handlers vêm do pai, já estáveis, e recebem o id.

import { memo, useMemo, useState } from "react";
import { Icon } from "../../../Icon";
import { Avatar } from "./Avatar";
import { Anexos } from "./Anexos";
import { CardEntidade } from "./CardEntidade";
import { Conteudo } from "./Conteudo";
import { MenuMais, type ItemMenu } from "./MenuContexto";
import { hhmm, previa } from "@/lib/chat/regras";
import type { Anexo, Mensagem, Reacao } from "@/lib/chat/tipos";

export interface AcoesMensagem {
  responder: (m: Mensagem) => void;
  abrirThread: (m: Mensagem) => void;
  reagir: (id: string, emoji: string) => void;
  abrirReacoes: (id: string, alvo: DOMRect) => void;
  /** Botão direito: menu na posição do ponteiro. */
  menu: (m: Mensagem, x: number, y: number) => void;
  /** Itens do mesmo menu, pro "⋯" ancorado. */
  itensMenu: (m: Mensagem) => ItemMenu[];
  abrirAnexo: (a: Anexo) => void;
  irPara: (id: string) => void;
  alternarAcoes: (id: string) => void;
  editar: (m: Mensagem) => void;
  selecionar: (id: string) => void;
}

interface Props {
  m: Mensagem;
  agrupada: boolean;
  meuId: string;
  meuNome: string;
  avatar: string | null;
  reacoes: Reacao[];
  respondida: Mensagem | null;
  cita: boolean;
  selecionada: boolean;
  destacada: boolean;
  acoesAbertas: boolean;
  modoSelecao: boolean;
  /** Aparelho sem hover: tocar a bolha revela a barra de ações. */
  toque: boolean;
  acoes: AcoesMensagem;
}

export const LinhaMensagem = memo(function LinhaMensagem(p: Props) {
  const { m, acoes } = p;
  const meu = m.autor_id === p.meuId;
  const [menuAberto, setMenuAberto] = useState(false);

  // Agrega as reações uma vez por mudança de lista, não a cada render do pai.
  const agregadas = useMemo(() => {
    const mapa = new Map<string, { n: number; minha: boolean }>();
    for (const r of p.reacoes) {
      const atual = mapa.get(r.emoji) ?? { n: 0, minha: false };
      mapa.set(r.emoji, { n: atual.n + 1, minha: atual.minha || r.user_id === p.meuId });
    }
    return [...mapa.entries()];
  }, [p.reacoes, p.meuId]);

  const apagada = !!m.excluida_em;

  return (
    <div
      className={"ch-msg" + (p.agrupada ? "" : " ch-msg--bloco")}
      data-cita={p.cita && !p.selecionada ? "1" : undefined}
      data-selecionada={p.selecionada ? "1" : undefined}
      data-destacada={p.destacada ? "1" : undefined}
      data-id={m.id}
      onContextMenu={(e) => { e.preventDefault(); acoes.menu(m, e.clientX, e.clientY); }}
      onClick={p.modoSelecao ? () => acoes.selecionar(m.id) : p.toque ? () => acoes.alternarAcoes(m.id) : undefined}
    >
      <div className="ch-msg__coluna">
        {p.agrupada
          ? <span className="ch-msg__hora-lado">{hhmm(m.created_at)}</span>
          : <Avatar nome={m.autor_nome || "?"} src={p.avatar} size={36} />}
      </div>

      <div style={{ minWidth: 0 }}>
        {!p.agrupada && (
          <div className="ch-msg__cabecalho">
            <span className="ch-msg__autor">{meu ? "Você" : (m.autor_nome || "—")}</span>
            <span className="ch-msg__hora">{hhmm(m.created_at)}</span>
            {m.fixada && <Icon name="pin" size={12} color="var(--text-dim)" />}
          </div>
        )}

        {p.respondida && (
          <button type="button" className="ch-resposta" onClick={() => acoes.irPara(p.respondida!.id)}>
            <Icon name="corner-up-left" size={13} color="var(--text-dim)" />
            <b style={{ fontWeight: 600 }}>{p.respondida.autor_nome || "—"}</b>
            <span>{previa(p.respondida)}</span>
          </button>
        )}

        {apagada ? (
          <div className="ch-msg__corpo ch-msg__corpo--apagada">Mensagem apagada</div>
        ) : (
          <>
            {m.texto && (
              <div className={"ch-msg__corpo" + (m._estado === "enviando" ? " ch-msg__corpo--enviando" : "")}>
                <Conteudo texto={m.texto} meuNome={p.meuNome} />
              </div>
            )}
            {m.card && <CardEntidade card={m.card} />}
            <Anexos anexos={m.anexos} aoAbrir={acoes.abrirAnexo} />
          </>
        )}

        {m.editada_em && !apagada && <span className="ch-msg__marca"> (editada)</span>}

        {m._estado === "falhou" && (
          <div className="ch-msg__marca" style={{ color: "var(--perigo)" }}>
            Não enviou. <button type="button" className="ch-cod__copiar" onClick={() => acoes.editar(m)}>tentar de novo</button>
          </div>
        )}

        {agregadas.length > 0 && (
          <div className="ch-reacoes">
            {agregadas.map(([emoji, { n, minha }]) => (
              <button key={emoji} type="button" className="ch-reacao" data-minha={minha ? "1" : undefined}
                onClick={() => acoes.reagir(m.id, emoji)}>
                {emoji} {n}
              </button>
            ))}
          </div>
        )}

        {m.respostas > 0 && (
          <button type="button" className="ch-thread-resumo" onClick={() => acoes.abrirThread(m)}>
            <Icon name="message" size={14} color="var(--primary-texto)" />
            {m.respostas} {m.respostas === 1 ? "resposta" : "respostas"}
            <Icon name="chevron-right" size={13} color="var(--primary-texto)" />
          </button>
        )}
      </div>

      {!p.modoSelecao && (
        // Com o "⋯" aberto a barra fica no ar: a folha mora no <body>, então
        // levar o ponteiro até ela tira o :hover da bolha — e a âncora sumindo
        // jogaria a folha pro canto na próxima rolagem.
        <div className="ch-acoes" data-aberto={p.acoesAbertas || menuAberto ? "1" : undefined}>
          <button type="button" title="Reagir"
            onClick={(e) => acoes.abrirReacoes(m.id, e.currentTarget.getBoundingClientRect())}>😊</button>
          <button type="button" title="Responder" onClick={() => acoes.responder(m)}>
            <Icon name="corner-up-left" size={16} />
          </button>
          <button type="button" title="Responder na thread" onClick={() => acoes.abrirThread(m)}>
            <Icon name="message" size={16} />
          </button>
          <MenuMais titulo="Mais ações da mensagem" montar={() => acoes.itensMenu(m)} onAbertoChange={setMenuAberto}
            gatilho={({ ref, ...g }) => (
              <button ref={ref} type="button" title="Mais" aria-label="Mais ações da mensagem" {...g}>
                <Icon name="dots" size={16} />
              </button>
            )} />
        </div>
      )}
    </div>
  );
}, iguais);

/**
 * Só re-renderiza quando algo que a bolha DESENHA mudou. Sem isto, uma
 * mensagem nova no fim re-renderizava as mil anteriores.
 */
function iguais(a: Props, b: Props): boolean {
  return (
    a.m === b.m &&
    a.agrupada === b.agrupada &&
    a.avatar === b.avatar &&
    a.reacoes === b.reacoes &&
    a.respondida === b.respondida &&
    a.cita === b.cita &&
    a.selecionada === b.selecionada &&
    a.destacada === b.destacada &&
    a.acoesAbertas === b.acoesAbertas &&
    a.modoSelecao === b.modoSelecao &&
    a.toque === b.toque &&
    a.meuId === b.meuId &&
    a.meuNome === b.meuNome &&
    a.acoes === b.acoes
  );
}
