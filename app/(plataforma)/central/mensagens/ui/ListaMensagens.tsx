"use client";

// Lista de mensagens: virtualização, rolagem infinita para cima e âncora de
// posição.
//
// A virtualização tem duas metades:
//   1. JANELA DE ÍNDICES — só um trecho do array vira DOM. O que ficou de fora
//      é substituído por um espaçador com a altura medida, então a barra de
//      rolagem continua honesta.
//   2. `content-visibility: auto` no CSS de cada bolha — o navegador pula
//      layout e pintura do que está fora da viewport dentro da própria janela.
//
// Só a primeira não bastaria (o trecho visível ainda tem altura variável), só a
// segunda também não (o DOM cresceria sem limite). Juntas, a rolagem custa o
// mesmo com 30 ou com 30.000 mensagens.

import {
  memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import { Icon } from "../../../Icon";
import { Botao } from "../../../ui/controles";
import { LinhaMensagem, type AcoesMensagem } from "./LinhaMensagem";
import { agrupaCom, meCita, mesmoDia, rotuloDia } from "@/lib/chat/regras";
import type { Mensagem, Reacao } from "@/lib/chat/tipos";

/** Quantas bolhas ficam montadas de cada vez. */
const JANELA = 80;
/** Quanto antes do topo/fundo a janela cresce, em pixels. */
const MARGEM = 900;
/** Distância do fundo em que ainda consideramos "está lendo o mais recente". */
const COLADO = 120;

interface Props {
  mensagens: Mensagem[];
  reacoes: Reacao[];
  autores: Record<string, { nome: string; avatar: string | null }>;
  meuId: string;
  meuNome: string;
  carregando: boolean;
  carregandoAntigas: boolean;
  temMais: boolean;
  erro: string | null;
  /** Id da primeira mensagem que a pessoa ainda não tinha visto ao abrir. */
  marcaNova: string | null;
  aoTentarDeNovo: () => void;
  toque: boolean;
  selecionadas: Set<string>;
  modoSelecao: boolean;
  acoesAbertas: string | null;
  destacada: string | null;
  acoes: AcoesMensagem;
  aoPedirAntigas: () => void;
  /** Avisa o pai quando a pessoa desgruda do fundo (mostra "novas mensagens"). */
  aoMudarFundo?: (noFundo: boolean) => void;
}

export function ListaMensagens(p: Props) {
  const refLista = useRef<HTMLDivElement>(null);
  const refFim = useRef<HTMLDivElement>(null);
  const [inicio, setInicio] = useState(() => Math.max(0, p.mensagens.length - JANELA));
  const [noFundo, setNoFundo] = useState(true);
  const alturaAntes = useRef<{ altura: number; topo: number } | null>(null);
  const ultimaId = useRef<string | null>(null);
  const alturaMedia = useRef(52);

  const total = p.mensagens.length;

  // Índice por id → resolver "responde_a" sem varrer o array por bolha.
  const porId = useMemo(() => {
    const m = new Map<string, Mensagem>();
    for (const x of p.mensagens) m.set(x.id, x);
    return m;
  }, [p.mensagens]);

  // Reações agrupadas por mensagem. Fazer isto na bolha seria O(n²).
  const reacoesPor = useMemo(() => {
    const m = new Map<string, Reacao[]>();
    for (const r of p.reacoes) {
      const l = m.get(r.mensagem_id);
      if (l) l.push(r); else m.set(r.mensagem_id, [r]);
    }
    return m;
  }, [p.reacoes]);

  const SEM_REACAO = useMemo<Reacao[]>(() => [], []);

  // ── Janela ────────────────────────────────────────────────────────────────
  // Ao chegar mensagem nova, a janela acompanha o fim.
  useEffect(() => {
    setInicio((i) => (total - i > JANELA * 2 ? Math.max(0, total - JANELA) : i));
  }, [total]);

  // Trocar de canal reposiciona no fim.
  useEffect(() => { setInicio(Math.max(0, total - JANELA)); }, [p.mensagens[0]?.conversa_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const visiveis = useMemo(() => p.mensagens.slice(inicio), [p.mensagens, inicio]);
  const espacoTopo = inicio * alturaMedia.current;

  // ── Rolagem ───────────────────────────────────────────────────────────────
  const aoRolar = useCallback(() => {
    const el = refLista.current;
    if (!el) return;
    const distanciaFundo = el.scrollHeight - el.scrollTop - el.clientHeight;
    const fundo = distanciaFundo < COLADO;
    setNoFundo((antes) => { if (antes !== fundo) p.aoMudarFundo?.(fundo); return fundo; });

    if (el.scrollTop < MARGEM) {
      // Primeiro abre a janela sobre o que já está em memória; só quando ela
      // chega no começo é que pedimos a página anterior ao servidor.
      if (inicio > 0) {
        alturaAntes.current = { altura: el.scrollHeight, topo: el.scrollTop };
        setInicio((i) => Math.max(0, i - JANELA));
      } else if (p.temMais && !p.carregandoAntigas) {
        alturaAntes.current = { altura: el.scrollHeight, topo: el.scrollTop };
        p.aoPedirAntigas();
      }
    }
  }, [inicio, p]);

  // Âncora: depois de inserir conteúdo acima, devolve a rolagem ao mesmo ponto
  // visual. Sem isto, carregar o histórico "puxa" a tela e a pessoa se perde.
  useLayoutEffect(() => {
    const el = refLista.current;
    const antes = alturaAntes.current;
    if (!el || !antes) return;
    const delta = el.scrollHeight - antes.altura;
    if (delta > 0) el.scrollTop = antes.topo + delta;
    alturaAntes.current = null;
  }, [visiveis.length, p.carregandoAntigas]);

  // Mensagem nova: rola só se a pessoa já estava no fim (ou se é dela).
  // Na PRIMEIRA pintura de um canal vai direto pro fim, sem animação.
  useLayoutEffect(() => {
    const ultima = p.mensagens[total - 1];
    if (!ultima) return;
    const mudou = ultima.id !== ultimaId.current;
    const primeira = ultimaId.current === null;
    ultimaId.current = ultima.id;
    if (!mudou) return;
    if (primeira) {
      const el = refLista.current;
      if (el) el.scrollTop = el.scrollHeight;
      return;
    }
    if (noFundo || ultima.autor_id === p.meuId) {
      refFim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [p.mensagens, total, noFundo, p.meuId]);

  // Ficar colado no fim enquanto o conteúdo ainda cresce. Abrir um canal com
  // histórico rolava pro fim ANTES das imagens carregarem: cada foto que
  // chegava empurrava a última mensagem pra baixo da dobra e a conversa
  // "abria no meio". Enquanto a pessoa não desgrudou do fundo, imagem que
  // carrega (evento `load` em captura) e mudança de altura da própria lista
  // (teclado do celular, composer crescendo) devolvem a rolagem ao fim.
  const noFundoRef = useRef(true);
  noFundoRef.current = noFundo;
  useEffect(() => {
    const el = refLista.current;
    if (!el) return;
    const colar = () => { if (noFundoRef.current) el.scrollTop = el.scrollHeight; };
    el.addEventListener("load", colar, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(colar) : null;
    ro?.observe(el);
    return () => { el.removeEventListener("load", colar, true); ro?.disconnect(); };
  }, [total > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mede a altura real das bolhas para o espaçador não mentir muito.
  useEffect(() => {
    const el = refLista.current;
    if (!el || !visiveis.length) return;
    const linhas = el.querySelectorAll<HTMLElement>(".ch-msg");
    if (linhas.length < 5) return;
    let soma = 0;
    for (const l of linhas) soma += l.offsetHeight;
    alturaMedia.current = Math.max(28, soma / linhas.length);
  }, [visiveis.length]);

  const descer = useCallback(() => {
    refFim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  // ── Estados ───────────────────────────────────────────────────────────────
  if (p.carregando) return <Esqueleto />;

  // Falha de carga tem que se DECLARAR. Sem isto o erro caía no estado vazio e
  // a tela dizia "nada por aqui" para um canal que pode estar cheio — a pessoa
  // acha que perdeu o histórico.
  if (p.erro && !total) {
    return (
      <div className="ch-lista">
        <div className="ch-vazio">
          <span className="ch-vazio__icone"><Icon name="alert-triangle" size={26} color="var(--atencao)" /></span>
          <h3>Não deu para carregar esta conversa</h3>
          <p>As mensagens continuam salvas. Pode ter sido a conexão — tente de novo.</p>
          <Botao variante="primario" onClick={p.aoTentarDeNovo}>
            Tentar de novo
          </Botao>
        </div>
      </div>
    );
  }

  if (!total) {
    return (
      <div className="ch-lista">
        <div className="ch-vazio">
          <span className="ch-vazio__icone"><Icon name="message" size={26} color="var(--text-dim)" /></span>
          <h3>Nada por aqui ainda</h3>
          <p>Esta conversa está em branco. Mande a primeira mensagem — ela aparece para todo mundo na hora.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="ch-lista" ref={refLista} onScroll={aoRolar} role="log" aria-live="polite" aria-relevant="additions">
        {inicio > 0 && <div className="ch-lista__espaco" style={{ height: espacoTopo }} aria-hidden />}

        {inicio === 0 && p.carregandoAntigas && (
          <div style={{ padding: 14, textAlign: "center" }}>
            <span className="ch-esqueleto" style={{ display: "inline-block", width: 120, height: 12 }} />
          </div>
        )}
        {inicio === 0 && !p.temMais && total > 20 && (
          <div className="ch-dia"><span>Começo da conversa</span></div>
        )}

        {visiveis.map((m, i) => {
          const anterior = visiveis[i - 1] ?? (inicio > 0 ? p.mensagens[inicio - 1] : undefined);
          const novoDia = !anterior || !mesmoDia(anterior.created_at, m.created_at);
          return (
            <div key={m.id}>
              {novoDia && <div className="ch-dia"><span>{rotuloDia(m.created_at)}</span></div>}
              {p.marcaNova === m.id && (
                <div className="ch-novas" data-marca-nova>
                  <span>Novas mensagens</span>
                </div>
              )}
              <LinhaMensagem
                m={m}
                agrupada={!novoDia && agrupaCom(m, anterior)}
                meuId={p.meuId}
                meuNome={p.meuNome}
                avatar={p.autores[m.autor_id]?.avatar ?? null}
                reacoes={reacoesPor.get(m.id) ?? SEM_REACAO}
                respondida={m.responde_a ? porId.get(m.responde_a) ?? null : null}
                cita={meCita(m, p.meuId)}
                selecionada={p.selecionadas.has(m.id)}
                destacada={p.destacada === m.id}
                acoesAbertas={p.acoesAbertas === m.id}
                modoSelecao={p.modoSelecao}
                toque={p.toque}
                acoes={p.acoes}
              />
            </div>
          );
        })}
        <div ref={refFim} style={{ height: 1 }} />
      </div>

      {!noFundo && (
        <button type="button" className="ch-descer" onClick={descer}>
          <Icon name="arrow-down" size={15} color="var(--text)" />
          Ir para o fim
        </button>
      )}
    </>
  );
}

const Esqueleto = memo(function Esqueleto() {
  // Alturas fixas e variadas: um esqueleto todo igual parece uma tabela, não
  // uma conversa.
  const alturas = [40, 62, 40, 96, 52, 40, 74];
  return (
    <div className="ch-lista" aria-busy="true">
      {alturas.map((h, i) => (
        <div key={i} className="ch-msg ch-msg--bloco" style={{ contentVisibility: "visible" }}>
          <div className="ch-msg__coluna">
            <span className="ch-esqueleto" style={{ width: 36, height: 36, borderRadius: "50%" }} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <span className="ch-esqueleto" style={{ width: 120, height: 11 }} />
            <span className="ch-esqueleto" style={{ width: `${45 + ((i * 17) % 45)}%`, height: h - 22 }} />
          </div>
        </div>
      ))}
    </div>
  );
});
