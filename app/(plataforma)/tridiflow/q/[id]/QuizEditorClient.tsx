"use client";

// ── TridiFlow · editor de QUIZ (tela própria) ────────────────────────────────
// Antes o quiz era um modo escondido dentro do editor de chat, atrás de um
// segmentado "Chat | Quiz". Dois problemas nisso:
//
// 1. O editor de chat é BLOQUEADO no celular de propósito — arrastar nós num
//    canvas e ligar arestas não funciona no toque. Só que o quiz é uma FILA:
//    ele cabe numa lista, e lista funciona no dedo. Ficar dentro do canvas
//    tirava do quiz a única coisa que ele podia ter e o chat não.
// 2. `EditorClient` importa o React Flow (e o CSS dele) de forma estática. Abrir
//    um quiz no celular baixava um canvas inteiro que nunca seria desenhado.
//
// Por isso este cliente é separado em vez de reaproveitar o `EditorClient` com
// um `if`: o que se ganha é justamente NÃO carregar o que o quiz não usa.
//
// O que continua igual: mesmo registro, mesmo slug, mesmos pixels, mesmo destino
// de lead. A separação é do EDITOR, não do projeto.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../../../Icon";
import { toast } from "../../../Toast";
import { QuizEditor } from "../../[id]/QuizEditor";
import { PublicarModal } from "../../[id]/PublicarModal";
import { ResultadosClient } from "../../[id]/resultados/ResultadosClient";
import { PainelAparenciaQuiz } from "./PainelAparenciaQuiz";
import type { BotSettings, Theme } from "@/lib/tridiflow";
import { QUIZ_PADRAO, type Quiz } from "@/lib/tridiflow-quiz";
import type { BotCompleto, Dominio } from "@/lib/tridiflow-db";

const DOMINIO_PADRAO = "gedux.com.br";

export function QuizEditorClient({ initial, dominios }: { initial: BotCompleto; dominios: Dominio[] }) {
  const [settings, setSettings] = useState<BotSettings>(initial.settings);
  const [theme] = useState<Theme>(initial.theme);
  const [nome, setNome] = useState(initial.nome);
  const [slug, setSlug] = useState(initial.slug);
  const [dominioId, setDominioId] = useState<string | null>(initial.dominioId);
  const [status, setStatus] = useState(initial.status);
  const [salvando, setSalvando] = useState<"ok" | "salvando" | "erro">("ok");
  const [previewKey, setPreviewKey] = useState(0);
  const [aparencia, setAparencia] = useState(false);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [mostrarPublicar, setMostrarPublicar] = useState(false);

  const quiz = settings.quiz ?? QUIZ_PADRAO();
  const setQuiz = (q: Quiz) => setSettings((s) => ({ ...s, quiz: q }));

  // ── Auto-save (debounce 800ms) — mesmo contrato do editor de chat ──────────
  const primeiraRender = useRef(true);
  useEffect(() => {
    if (primeiraRender.current) { primeiraRender.current = false; return; }
    setSalvando("salvando");
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/tridiflow/bots", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: initial.id, nome, slug, dominioId, theme, settings }),
        });
        setSalvando(r.ok ? "ok" : "erro");
      } catch { setSalvando("erro"); }
    }, 800);
    return () => clearTimeout(t);
  }, [nome, slug, dominioId, theme, settings, initial.id]);

  const payloadRef = useRef({ id: initial.id, nome, slug, dominioId, theme, settings });
  payloadRef.current = { id: initial.id, nome, slug, dominioId, theme, settings };
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setSalvando("salvando");
        try {
          const r = await fetch("/api/tridiflow/bots", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadRef.current) });
          setSalvando(r.ok ? "ok" : "erro"); if (r.ok) toast.ok("Salvo.");
        } catch { setSalvando("erro"); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function publicar() {
    const r = await fetch("/api/tridiflow/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "publicar", id: initial.id }) });
    const d = await r.json();
    if (!r.ok) { toast.erro(d.error || "Falha ao publicar."); return; }
    setStatus("publicado");
    const host = dominios.find((x) => x.id === dominioId)?.host || DOMINIO_PADRAO;
    navigator.clipboard.writeText(`https://${host}/f/${slug}`).catch(() => {});
    toast.ok("Publicado! Link copiado.");
  }

  return (
    <div className="qze-tela">
      {mostrarPublicar && (
        <PublicarModal dominioPadrao={DOMINIO_PADRAO} dominios={dominios} dominioId={dominioId}
          setDominioId={setDominioId} slug={slug} setSlug={setSlug}
          settings={settings} onSettings={setSettings} onClose={() => setMostrarPublicar(false)} />
      )}

      {aparencia && (
        <div onClick={() => setAparencia(false)} className="qze-veu">
          <div onClick={(e) => e.stopPropagation()} className="qze-folha">
            <div className="qze-folha-topo">
              <strong style={{ fontSize: 16, fontWeight: 800, flex: 1 }}>Aparência do quiz</strong>
              <button onClick={() => setAparencia(false)} aria-label="Fechar" className="qze-x">
                <Icon name="x" size={20} color="var(--text-dim)" />
              </button>
            </div>
            <div className="qze-folha-corpo">
              <PainelAparenciaQuiz quiz={quiz} onChange={setQuiz} temaChat={theme} />
            </div>
          </div>
        </div>
      )}

      {mostrarResultados && (
        <div onClick={() => setMostrarResultados(false)} className="qze-veu">
          <div onClick={(e) => e.stopPropagation()} className="qze-folha qze-folha-larga">
            <div className="qze-folha-topo">
              <strong style={{ fontSize: 16, fontWeight: 800, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Resultados · {nome}</strong>
              <button onClick={() => setMostrarResultados(false)} aria-label="Fechar" className="qze-x">
                <Icon name="x" size={20} color="var(--text-dim)" />
              </button>
            </div>
            <div className="qze-folha-corpo">
              <ResultadosClient botId={initial.id} embutido quiz={quiz} />
            </div>
          </div>
        </div>
      )}

      {/* ── Topo ──────────────────────────────────────────────────────────── */}
      <div className="qze-topo">
        <Link href="/tridiflow/meus-bots?tipo=quiz" className="qze-voltar">‹ Quizzes</Link>
        <input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do quiz" className="qze-nome" />
        <span style={{ fontSize: 12, color: salvando === "erro" ? "var(--perigo)" : "var(--text-dim)", display: "inline-flex", alignItems: "center", gap: 4, flex: "none" }}>
          {salvando === "erro" && <Icon name="alert-triangle" size={12} color="var(--perigo)" />}
          {salvando === "salvando" ? "salvando…" : salvando === "erro" ? "falha ao salvar" : "salvo"}
        </span>
        <div className="qze-acoes">
          <button onClick={() => setAparencia(true)} className="qze-btn">
            <Icon name="palette" size={14} color="var(--text-dim)" /> <span className="qze-btn-txt">Aparência</span>
          </button>
          <button onClick={() => setMostrarResultados(true)} className="qze-btn">
            <Icon name="chart-line" size={14} color="var(--text-dim)" /> <span className="qze-btn-txt">Resultados</span>
          </button>
          <button onClick={() => setMostrarPublicar(true)} className="qze-btn">
            <Icon name="share" size={14} color="var(--text-dim)" /> <span className="qze-btn-txt">Compartilhar</span>
          </button>
          <button onClick={() => setPreviewKey((k) => k + 1)} className="qze-btn">
            <Icon name="player-play" size={14} color="var(--text-dim)" /> <span className="qze-btn-txt">Testar</span>
          </button>
          <button onClick={publicar} className="qze-btn qze-btn-pri">
            <Icon name="rocket" size={15} color="#fff" /> {status === "publicado" ? "Republicar" : "Publicar"}
          </button>
        </div>
      </div>

      <QuizEditor quiz={quiz} onChange={setQuiz} theme={theme} previewKey={previewKey} />
      <style>{CSS}</style>
    </div>
  );
}

// `dvh`, nunca `vh`: no celular o `vh` inclui a barra do navegador e o rodapé
// do editor nasce atrás dela.
const CSS = `
.qze-tela { display: flex; flex-direction: column; height: 100dvh; min-height: 480px; gap: 12px; padding: 14px 18px; box-sizing: border-box; }
.qze-topo { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: none; }
.qze-voltar { color: var(--primary-texto, var(--primary)); font-weight: 700; font-size: 14px; text-decoration: none; display: inline-flex; align-items: center; min-height: var(--tap, 44px); flex: none; }
.qze-nome { font-size: 17px; font-weight: 800; background: transparent; border: none; color: var(--text); outline: none; min-width: 110px; max-width: 260px; flex: 1 1 110px; min-height: var(--tap, 44px); }
.qze-acoes { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.qze-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 13px; min-height: var(--tap, 44px); border-radius: 10px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
  font-size: 12.5px; font-weight: 700; cursor: pointer;
}
.qze-btn-pri { border: none; background: var(--primary-acao, var(--primary)); color: var(--on-primary, #fff); font-size: 13.5px; font-weight: 800; padding: 8px 18px; }

/* Véu + folha: no computador é um modal centrado; no celular vira folha presa
   embaixo, com rolagem interna e o topo alcançável pelo polegar. */
.qze-veu { position: fixed; inset: 0; z-index: 5000; background: color-mix(in srgb, #000 58%, transparent); backdrop-filter: blur(3px); display: flex; justify-content: center; align-items: flex-start; padding: 4dvh 16px; overflow-y: auto; }
.qze-folha { width: min(560px, 100%); max-height: 92dvh; background: var(--bg); border: 1px solid var(--border); border-radius: 18px; box-shadow: 0 24px 70px rgba(0,0,0,.5); overflow: hidden; display: flex; flex-direction: column; }
.qze-folha-larga { width: min(1040px, 100%); }
.qze-folha-topo { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); flex: none; }
.qze-folha-corpo { padding: 18px; overflow-y: auto; min-height: 0; }
.qze-x { width: var(--tap, 44px); height: var(--tap, 44px); display: grid; place-items: center; background: none; border: none; cursor: pointer; flex: none; }

@media (max-width: 720px) {
  .qze-tela { padding: 10px 12px; gap: 10px; }
  /* Só o ícone: cinco rótulos não cabem em 320px sem quebrar em três linhas e
     empurrar o editor pra fora da tela. */
  .qze-btn-txt { display: none; }
  .qze-btn { padding: 8px; width: var(--tap, 44px); }
  .qze-btn-pri { width: auto; padding: 8px 14px; }
  .qze-acoes { gap: 6px; }
  .qze-veu { padding: 0; align-items: flex-end; }
  .qze-folha, .qze-folha-larga { width: 100%; max-height: 88dvh; border-radius: 18px 18px 0 0; border-bottom: none; }
  .qze-folha-corpo { padding: 14px 14px calc(14px + var(--safe-b, 0px)); }
}
`;
