"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import { MODULOS_DISCRETOS, MODULOS_DESATIVADOS } from "@/lib/rbac";
import type { ModuleDef } from "@/lib/rbac";
import { Icon } from "./Icon";
import { BotaoIcone } from "./ui/controles";
import { Fila, useAbrirFechar } from "./ui/micro";
import { useIsMobile } from "./ui/useMediaQuery";
import { temPaletaLocal } from "./ui/paletaLocal";
import { EGG_NOME, ehONome } from "@/lib/gaius-eggs";

// Paleta de comandos (⌘K / Ctrl+K) — estilo Spotlight da Apple: busca e vai
// direto pra qualquer módulo que o usuário tem acesso, sem caçar na sidebar.
// Também abre pelo botão "Buscar…" da sidebar (evento gaius:cmdk).
//
// Ela achava SÓ página. A barra do meio do Início da Central achava conteúdo
// (tarefa, pessoa, produto, pedido) na mesma rota `/api/central/busca` — duas
// buscas com o mesmo desenho e capacidades diferentes, e a pior delas era
// justamente a que a pessoa aprende primeiro por ser atalho de teclado. Agora
// as duas chamam a mesma rota: aqui não há camada local de conteúdo (o Shell
// não carrega tarefa nenhuma), então tudo o que não é página vem do servidor.

/** Rótulo do lado direito da linha, por tipo devolvido pela busca. */
const ROTULO: Record<string, string> = {
  tarefa: "Tarefa", solicitacao: "Solicitação",
  pessoa: "Pessoa", produto: "Estoque", pedido: "Pedido", pagina: "Ir para",
};

interface Linha { id: string; icon: string; label: string; sub?: string; hint: string; run: () => void }

export function CommandPalette({ modules }: { modules: ModuleDef[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [remotos, setRemotos] = useState<{ id: string; tipo: string; titulo: string; sub: string; href: string; icon: string }[]>([]);
  const [buscando, setBuscando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const celular = useIsMobile();
  // Não é dropdown: a paleta não sai de um gatilho, nasce no meio da tela. Por
  // isso a receita de MODAL — cresce do centro e recolhe mais rápido do que
  // abriu, porque fechar é sair da frente.
  const { montado, classe } = useAbrirFechar(open, "--modal-close-dur");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Página com paleta própria (ex.: Busca rápida do Tridify) fica com o
      // ⌘K — senão as duas abriam juntas, uma por cima da outra. O botão
      // "Buscar…" da sidebar (gaius:cmdk, abaixo) segue abrindo esta aqui.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { if (temPaletaLocal()) return; e.preventDefault(); setOpen((o) => !o); setQ(""); setIdx(0); }
      else if (e.key === "Escape") setOpen(false);
    };
    const onEvt = () => { setOpen(true); setQ(""); setIdx(0); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("gaius:cmdk", onEvt);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("gaius:cmdk", onEvt); };
  }, []);

  // Trocou de página → fecha.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const termo = q.trim();

  // Camada REMOTA — a mesma do Início da Central. Não é poll: é reação a
  // digitação, com 2 letras de mínimo, 250ms parado e a requisição anterior
  // abortada a cada tecla. Sem o debounce, "cadeira" seriam sete idas ao banco,
  // seis já obsoletas quando a resposta chegasse. Fechada a paleta, nada sai.
  useEffect(() => {
    if (!open || termo.length < 2) { setRemotos([]); setBuscando(false); return; }
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/api/central/busca?q=${encodeURIComponent(termo)}`, { signal: ac.signal, cache: "no-store" });
        const j = await r.json();
        setRemotos(Array.isArray(j.itens) ? j.itens : []);
      } catch { /* abortada ou offline: a lista de módulos continua valendo */ }
      finally { if (!ac.signal.aborted) setBuscando(false); }
    }, 250);
    return () => { clearTimeout(t); ac.abort(); };
  }, [termo, open]);

  const acoes = useMemo<Linha[]>(() => ([
    // Módulo discreto não é anunciado nem aqui: a busca mostra a lista inteira
    // ao abrir, então listar seria o mesmo que pôr na sidebar.
    ...modules.filter((m) => !MODULOS_DISCRETOS.has(m.key) && !MODULOS_DESATIVADOS.has(m.key))
      .map((m) => ({ id: `pg_${m.key}`, icon: m.icon, label: m.label, hint: "Ir para", run: () => router.push(m.href) })),
    { id: "ac_reload", icon: "sparkles", label: "Recarregar o sistema", hint: "Ação", run: () => window.location.reload() },
  ]), [modules, router]);

  // Página e ação primeiro: são locais, aparecem na mesma tecla, e é o que a
  // paleta sempre fez. O conteúdo entra embaixo, quando o servidor responde —
  // se entrasse por cima, a lista pularia debaixo do dedo 250ms depois.
  const hits = useMemo<Linha[]>(() => {
    const locais = termo ? acoes.filter((a) => norm(a.label).includes(norm(termo))) : acoes;
    if (!termo) return locais;
    const vistos = new Set(locais.map((a) => a.id));
    return [
      ...locais,
      ...remotos.filter((i) => !vistos.has(i.id)).map((i) => ({
        id: i.id, icon: i.icon, label: i.titulo, sub: i.sub,
        hint: ROTULO[i.tipo] || "Abrir", run: () => router.push(i.href),
      })),
    ];
  }, [termo, acoes, remotos, router]);
  const sel = Math.min(idx, Math.max(0, hits.length - 1));

  function executar(i: number) { const a = hits[i]; if (a) { setOpen(false); a.run(); } }

  if (!montado) return null;
  return createPortal(
    // No celular o topo de 16dvh jogava metade da tela fora e o teclado (o input
    // nasce focado) cobria a lista: cola no topo, respeita o notch e deixa o véu
    // rolar caso o conteúdo passe da tela.
    // O véu escurece junto com a paleta e para de receber clique enquanto ela
    // sai — senão o toque logo depois de fechar morria num vidro invisível.
    <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 380, background: "rgba(0,0,0,.42)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "flex", justifyContent: "center", alignItems: "flex-start", overflowY: "auto",
      opacity: classe === "is-open" ? 1 : 0, pointerEvents: open ? undefined : "none",
      transition: `opacity var(${classe === "is-closing" ? "--modal-close-dur" : "--modal-open-dur"}) var(--modal-ease)`,
      padding: celular
        ? "calc(8px + var(--safe-t)) max(10px, var(--safe-r)) 10px max(10px, var(--safe-l))"
        : "16dvh 16px 16px" }}>
      <div className={`glass glass-spec pop-solid t-modal ${classe}`} onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 100%)", borderRadius: 20, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "0 30px 90px rgba(0,0,0,.45)" }}>
        {/* Busca */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "15px 17px", borderBottom: "1px solid var(--border)" }}>
          <Icon name="search" size={17} color="var(--text-dim)" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); executar(sel); }
            }}
            placeholder="Buscar tarefa, pessoa, produto, pedido ou página…"
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "var(--text)", fontSize: 15.5, fontWeight: 500 }} />
          {buscando && <span style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600, flex: "none" }}>buscando…</span>}
          {/* Sem tecla Esc no celular: vira um botão de fechar de verdade. */}
          {celular
            ? <BotaoIcone icone="x" titulo="Fechar" tamanho="sm" style={{ flex: "none" }} onClick={() => setOpen(false)} />
            : <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 7px" }}>esc</span>}
        </div>
        {/* Resultados — no celular encolhe pra lista não nascer atrás do teclado.
            Escalonados: só o que ENTRA anima (a chave é o id do resultado), então
            digitar não repinta a lista inteira a cada tecla. */}
        <Fila style={{ maxHeight: celular ? "min(330px, 42dvh)" : 330, overflowY: "auto", padding: 7 }}>
          {ehONome(q) && hits.length === 0 ? (
            // Procurar pelo próprio nome do sistema não devolve resultado nenhum
            // — devolve uma frase. Detalhe da identidade, não funcionalidade.
            <div className="gaius-momento" style={{ padding: "22px 16px", margin: 0 }}>
              <span>{EGG_NOME.titulo}</span>
              <em>{EGG_NOME.frase}</em>
              <span>{EGG_NOME.nota}</span>
            </div>
          ) : hits.length === 0 ? (
            // `buscando` importa: sem ele, digitar "cad" mostrava "Nada
            // encontrado" por 250ms antes de os produtos chegarem — a paleta
            // dizia que não existia e logo em seguida se contradizia.
            <div style={{ padding: 26, textAlign: "center", color: "var(--text-dim)", fontSize: 13.5 }}>
              {buscando ? "Procurando…" : `Nada encontrado para “${q}”.`}
            </div>
          ) : hits.map((a, i) => {
            const on = i === sel;
            return (
              <button key={a.id} onClick={() => executar(i)} onMouseEnter={() => setIdx(i)}
                style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", minHeight: "var(--tap)", padding: "8px 12px", borderRadius: 12, border: "none", cursor: "pointer", boxShadow: "none",
                  background: on ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "transparent" }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", background: on ? "var(--primary)" : "var(--surface-2)" }}>
                  <Icon name={a.icon} size={16} color={on ? "var(--on-primary)" : "var(--text)"} />
                </span>
                {/* `minWidth: 0` nos dois: sem isso o nome longo de um produto
                    empurrava o rótulo da direita pra fora dos 320px. */}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
                  {a.sub && <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.sub}</span>}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--text-dim)", flex: "none" }}>{a.hint}</span>
              </button>
            );
          })}
        </Fila>
        {/* Rodapé — só no desktop: as três dicas de teclado não cabem em 320px
            (e não servem pra nada num aparelho sem teclado físico). */}
        {!celular && (
          <div style={{ display: "flex", gap: 14, padding: "10px 16px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>
            <span>↑↓ navegar</span><span>↵ abrir</span><span style={{ marginLeft: "auto" }}>⌘K abre de qualquer tela</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
