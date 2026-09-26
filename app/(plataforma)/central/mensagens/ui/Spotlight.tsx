"use client";

// Busca global (⌘K) — pessoas, canais, mensagens e arquivos numa lista só.
//
// Não abre outra página: é uma camada por cima da conversa, some com Esc e
// devolve o foco de onde saiu.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../Icon";
import { Avatar } from "./Avatar";
import { api } from "../data/api";
import { previa, rotuloDia, tamanhoLegivel } from "@/lib/chat/regras";
import type { Canal, Pessoa, ResultadoBusca } from "@/lib/chat/tipos";

type Alvo =
  | { tipo: "canal"; id: string; titulo: string; sub: string; icone: string }
  | { tipo: "pessoa"; pessoa: Pessoa }
  | { tipo: "mensagem"; canalId: string; msgId: string; titulo: string; sub: string }
  | { tipo: "arquivo"; url: string; nome: string; sub: string };

interface Props {
  /** Quando definido, a busca fica presa a um canal ("buscar nesta conversa"). */
  canal?: Canal | null;
  canaisConhecidos: Canal[];
  aoFechar: () => void;
  aoAbrirCanal: (id: string, msgId?: string) => void;
  aoFalarCom: (p: Pessoa) => void;
}

const ESPERA = 160;   // ms de digitação parada antes de ir ao servidor

export function Spotlight(p: Props) {
  const [termo, setTermo] = useState("");
  const [res, setRes] = useState<ResultadoBusca | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState(0);
  const refCampo = useRef<HTMLInputElement>(null);
  const refAborto = useRef<AbortController | null>(null);

  useEffect(() => { refCampo.current?.focus(); }, []);

  // Debounce + cancelamento: digitar rápido não pode virar oito requisições
  // concorrentes, nem deixar uma resposta velha sobrescrever a nova.
  useEffect(() => {
    const q = termo.trim();
    if (q.length < 2) { setRes(null); setBuscando(false); return; }
    setBuscando(true);
    const t = setTimeout(() => {
      refAborto.current?.abort();
      const ctrl = new AbortController();
      refAborto.current = ctrl;
      api.buscar(q, p.canal?.id ?? null, ctrl.signal)
        .then((d) => { setRes(d); setSel(0); })
        .catch(() => { /* abortada ou rede */ })
        .finally(() => setBuscando(false));
    }, ESPERA);
    return () => clearTimeout(t);
  }, [termo, p.canal?.id]);

  // Sem termo, o ⌘K é um seletor de canal — o uso mais comum dele.
  const recentes = useMemo<Alvo[]>(
    () => p.canaisConhecidos.slice(0, 8).map((c) => ({
      tipo: "canal" as const, id: c.id, titulo: c.nome,
      sub: c.ultima ? previa({ texto: c.ultima.texto, anexos: [], card: null, excluida_em: null }) : "—",
      icone: c.tipo === "direta" ? "user" : c.privado ? "lock" : "hash",
    })),
    [p.canaisConhecidos],
  );

  const grupos = useMemo(() => {
    if (!res) return termo.trim().length < 2 ? [{ titulo: "Recentes", itens: recentes }] : [];
    const g: { titulo: string; itens: Alvo[] }[] = [];
    if (res.canais.length) g.push({
      titulo: "Canais",
      itens: res.canais.map((c) => ({ tipo: "canal" as const, id: c.id, titulo: c.nome, sub: c.descricao ?? "Canal", icone: c.privado ? "lock" : "hash" })),
    });
    if (res.pessoas.length) g.push({
      titulo: "Pessoas",
      itens: res.pessoas.map((x) => ({ tipo: "pessoa" as const, pessoa: x })),
    });
    if (res.mensagens.length) g.push({
      titulo: "Mensagens",
      itens: res.mensagens.map((m) => ({
        tipo: "mensagem" as const, canalId: m.canal.id, msgId: m.mensagem.id,
        titulo: previa(m.mensagem),
        sub: `${m.mensagem.autor_nome ?? "—"} em ${m.canal.nome} · ${rotuloDia(m.mensagem.created_at)}`,
      })),
    });
    if (res.arquivos.length) g.push({
      titulo: "Arquivos",
      itens: res.arquivos.map((a) => ({
        tipo: "arquivo" as const, url: a.url, nome: a.nome,
        sub: [tamanhoLegivel(a.tamanho), rotuloDia(a.created_at)].filter(Boolean).join(" · "),
      })),
    });
    return g;
  }, [res, termo, recentes]);

  const planos = useMemo(() => grupos.flatMap((g) => g.itens), [grupos]);

  const acionar = useCallback((alvo: Alvo) => {
    switch (alvo.tipo) {
      case "canal": p.aoAbrirCanal(alvo.id); break;
      case "pessoa": p.aoFalarCom(alvo.pessoa); break;
      case "mensagem": p.aoAbrirCanal(alvo.canalId, alvo.msgId); break;
      case "arquivo": window.open(alvo.url, "_blank", "noopener,noreferrer"); break;
    }
    p.aoFechar();
  }, [p]);

  const aoTeclar = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); return p.aoFechar(); }
    if (e.key === "ArrowDown") { e.preventDefault(); return setSel((i) => Math.min(i + 1, planos.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); return setSel((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && planos[sel]) { e.preventDefault(); acionar(planos[sel]); }
  }, [planos, sel, acionar, p]);

  let indice = -1;

  return (
    <div className="ch-spot-fundo" onClick={p.aoFechar} role="dialog" aria-modal aria-label="Busca">
      <div className="ch-spot" onClick={(e) => e.stopPropagation()} onKeyDown={aoTeclar}>
        <div className="ch-spot__campo">
          <Icon name="search" size={18} color="var(--text-dim)" />
          <input
            ref={refCampo}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder={p.canal ? `Buscar em ${p.canal.nome}…` : "Buscar pessoas, canais, mensagens e arquivos…"}
            aria-label="Termo de busca"
          />
          {buscando && <Icon name="loader" size={16} color="var(--text-dim)" />}
          <button type="button" className="ch-icone" onClick={p.aoFechar} aria-label="Fechar">
            <Icon name="x" size={17} />
          </button>
        </div>

        <div className="ch-spot__lista">
          {grupos.map((g) => (
            <div key={g.titulo}>
              <div className="ch-spot__grupo">{g.titulo}</div>
              {g.itens.map((alvo) => {
                indice++;
                const i = indice;
                return (
                  <button key={chaveDe(alvo, i)} type="button" className="ch-spot__item"
                    data-ativo={i === sel ? "1" : undefined}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => acionar(alvo)}>
                    <IconeAlvo alvo={alvo} />
                    <div>
                      <div>{titulo(alvo)}</div>
                      <small>{sub(alvo)}</small>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}

          {!grupos.length && termo.trim().length >= 2 && !buscando && (
            <div className="ch-vazio" style={{ minHeight: 160 }}>
              <span className="ch-vazio__icone"><Icon name="search" size={22} color="var(--text-dim)" /></span>
              <p>Nada encontrado para <b>{termo}</b>.</p>
            </div>
          )}
        </div>

        <div className="ch-spot__rodape">
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span>esc fechar</span>
          {p.canal && <span style={{ marginLeft: "auto" }}>Buscando só em {p.canal.nome}</span>}
        </div>
      </div>
    </div>
  );
}

function chaveDe(a: Alvo, i: number) {
  return a.tipo === "pessoa" ? a.pessoa.id : a.tipo === "canal" ? a.id : a.tipo === "mensagem" ? a.msgId : a.url + i;
}
function titulo(a: Alvo) {
  return a.tipo === "pessoa" ? a.pessoa.name : a.tipo === "arquivo" ? a.nome : a.titulo;
}
function sub(a: Alvo) {
  return a.tipo === "pessoa" ? (a.pessoa.setor ?? "Conversar") : a.sub;
}
function IconeAlvo({ alvo }: { alvo: Alvo }) {
  if (alvo.tipo === "pessoa") return <Avatar nome={alvo.pessoa.name} src={alvo.pessoa.avatar} size={28} />;
  const nome = alvo.tipo === "canal" ? alvo.icone : alvo.tipo === "mensagem" ? "message" : "file";
  return (
    <span style={{ width: 28, display: "grid", placeItems: "center" }}>
      <Icon name={nome} size={17} color="var(--text-dim)" />
    </span>
  );
}
