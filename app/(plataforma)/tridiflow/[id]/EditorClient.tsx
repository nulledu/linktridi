"use client";

// TridiFlow — EDITOR: canvas React Flow (grupos com blocos empilhados, arestas
// por saída), paleta por categoria, painel de config do bloco selecionado e
// PREVIEW ao vivo interativo na lateral. Auto-save com debounce.
import { CampoCor } from "@/app/(plataforma)/ui/cores";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  type Node, type Edge, type Connection, type NodeProps, applyNodeChanges, type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BLOCK_CATEGORIAS, BLOCK_LABEL, CSS_PRESETS, EVENTOS_PADRAO, EVENTOS_PIXEL, GATILHOS_CONVERSAO, HEADER_ICONES, HEADER_ICONES_VOLTAR, PLATAFORMAS_PIXEL, STORIES_MAX, THEME_PRESETS, conversoesEfetivas, ehInput, headerDefaults, migrarFluxoAB, novaRegraConversao, novaStory, iframeEmbed, novoBlock, uid, urlDeIframe, varsDoFluxo,
  type Block, type BlockType, type BotSettings, type Fluxo, type Group, type RegraConversao, type Story, type Theme,
} from "@/lib/tridiflow";
import type { BotCompleto, Dominio } from "@/lib/tridiflow-db";
import { ChatRuntime } from "@/app/f/ChatRuntime";
import { ResultadosClient } from "./resultados/ResultadosClient";
import { PublicarModal } from "./PublicarModal";
import { BotaoPublicar } from "../../ui/BotaoPublicar";
import { SecaoIframe } from "../_shared/SecaoIframe";
import { AJUDA_CAPI, AJUDA_PIXEL } from "../_shared/ajudaPixel";
import { RichTextInline } from "../RichTextInline";
import { Icon } from "../../Icon";
import { Botao, BotaoIcone, Interruptor, Caixa } from "../../ui/controles";
import { Deslizante } from "../../ui/Deslizante";
import { toast } from "../../Toast";
import { useIsMobile } from "../../ui/useMediaQuery";
import { GlassSelect } from "../../GlassPicker";
import { TrocaIcone } from "../../ui/micro";

const DOMINIO_PADRAO = "gedux.com.br";

// Cor por categoria (paleta e chips dos blocos — referência visual do produto).
// Rampa CATEGÓRICA, não de estado: seis famílias de bloco que só precisam ser
// distinguíveis entre si. "Conversão" e "Ações" chegaram a compartilhar o
// vermelho de erro — duas categorias na mesma cor, e as duas parecendo defeito.
const COR_CATEGORIA: Record<string, string> = {
  "Bolhas": "var(--cat-2)", "Inputs": "var(--cat-6)", "Lógica": "var(--cat-3)",
  "Conversão": "var(--cat-5)", "Integrações": "var(--cat-4)", "Ações": "var(--cat-1)",
};
const corDoTipo = (t: BlockType): string => COR_CATEGORIA[BLOCK_CATEGORIAS.find((c) => c.tipos.includes(t))?.categoria ?? ""] ?? "var(--primary-texto)";

// Ícone por bloco (paleta e chips) — visual estilo Typebot.
const BLOCK_ICON: Record<BlockType, string> = {
  texto: "message-chatbot", imagem: "photo", video: "video", audio: "headphones", embed: "code",
  botoes: "click", imagens: "photo", input_texto: "edit", input_email: "at", input_telefone: "phone", input_numero: "hash", data: "calendar", avaliacao: "star", localizacao: "map-pin", lgpd: "shield-check",
  condicao: "filter", set_var: "edit", delay: "clock", ab: "arrows-split",
  evento: "chart-dots", webhook: "world",
  prova_social: "star", contador: "hourglass-high", cupom: "ticket", redirect: "external-link", whatsapp: "brand-whatsapp",
};

// dados do nó custom (React Flow exige Record<string, unknown>)
type GrupoNodeData = {
  group: Group;
  indice: number;                    // posição no fluxo → "01.", "02."…
  selBlockId: string | null;
  onSelectBlock: (gId: string, bId: string) => void;
  onAddBlock: (gId: string, t: BlockType) => void;
  onRemoveBlock: (gId: string, bId: string) => void;
  onTitle: (gId: string, titulo: string) => void;
  onPatchText: (gId: string, bId: string, texto: string) => void;
  variables: string[];
} & Record<string, unknown>;

export function EditorClient({ initial, dominios }: { initial: BotCompleto; dominios: Dominio[] }) {
  const [fluxo, setFluxo] = useState<Fluxo>(() => migrarFluxoAB(initial.fluxo));   // migra blocos A/B legados → variantes
  const [theme, setTheme] = useState<Theme>(initial.theme);
  const [settings, setSettings] = useState<BotSettings>(initial.settings);
  const [nome, setNome] = useState(initial.nome);
  const [slug, setSlug] = useState(initial.slug);
  const [dominioId, setDominioId] = useState<string | null>(initial.dominioId);
  const [status, setStatus] = useState(initial.status);
  const [sel, setSel] = useState<{ g: string; b: string } | null>(null);
  const [salvando, setSalvando] = useState<"ok" | "salvando" | "erro">("ok");
  const [previewKey, setPreviewKey] = useState(0);
  const [custom, setCustom] = useState<null | "tema" | "config" | "pixels" | "stories">(null);   // modal "Personalizar" (abas)
  const [busca, setBusca] = useState("");   // filtro da paleta de blocos
  const [mostrarResultados, setMostrarResultados] = useState(false);   // overlay de resultados (sem sair da tela)
  const [mostrarPublicar, setMostrarPublicar] = useState(false);       // modal de publicação/embed
  const posRef = useRef({ x: 60, y: 60 });

  // ── Auto-save (debounce 800ms) ──
  const primeiraRender = useRef(true);
  useEffect(() => {
    if (primeiraRender.current) { primeiraRender.current = false; return; }
    setSalvando("salvando");
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/tridiflow/bots", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: initial.id, fluxo, nome, slug, dominioId, theme, settings }) });
        setSalvando(r.ok ? "ok" : "erro");
      } catch { setSalvando("erro"); }
    }, 800);
    return () => clearTimeout(t);
  }, [fluxo, nome, slug, dominioId, theme, settings, initial.id]);

  // Ctrl/⌘+S → salva na hora (e evita o diálogo "salvar página" do navegador).
  const payloadRef = useRef({ id: initial.id, fluxo, nome, slug, dominioId, theme, settings });
  payloadRef.current = { id: initial.id, fluxo, nome, slug, dominioId, theme, settings };
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

  // ── Undo/Redo do fluxo ──
  const [podeUndo, setPodeUndo] = useState(false);
  const [podeRedo, setPodeRedo] = useState(false);
  const hist = useRef<{ past: Fluxo[]; future: Fluxo[] }>({ past: [], future: [] });
  const aplicandoHist = useRef(false);
  const fluxoAnt = useRef(fluxo);
  const ultimoPush = useRef(0);
  useEffect(() => {
    if (aplicandoHist.current) { aplicandoHist.current = false; fluxoAnt.current = fluxo; return; }
    if (fluxoAnt.current !== fluxo) {
      const agora = Date.now();
      if (agora - ultimoPush.current > 450) {   // coalesce edições rápidas (digitação)
        hist.current.past.push(fluxoAnt.current);
        if (hist.current.past.length > 60) hist.current.past.shift();
        hist.current.future = []; ultimoPush.current = agora;
        setPodeRedo(false); setPodeUndo(true);
      }
      fluxoAnt.current = fluxo;
    }
  }, [fluxo]);
  const desfazer = useCallback(() => {
    const h = hist.current; if (!h.past.length) return;
    const prev = h.past.pop()!; h.future.unshift(fluxoAnt.current);
    aplicandoHist.current = true; ultimoPush.current = 0; setFluxo(prev);
    setPodeUndo(h.past.length > 0); setPodeRedo(true);
  }, []);
  const refazer = useCallback(() => {
    const h = hist.current; if (!h.future.length) return;
    const next = h.future.shift()!; h.past.push(fluxoAnt.current);
    aplicandoHist.current = true; ultimoPush.current = 0; setFluxo(next);
    setPodeUndo(true); setPodeRedo(h.future.length > 0);
  }, []);
  const undoRef = useRef(desfazer); undoRef.current = desfazer;
  const redoRef = useRef(refazer); redoRef.current = refazer;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undoRef.current(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redoRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Mutações do fluxo ──
  const mudarGrupo = useCallback((gId: string, fn: (g: Group) => Group) => {
    setFluxo((f) => ({ ...f, groups: f.groups.map((g) => (g.id === gId ? fn(g) : g)) }));
  }, []);
  const addGrupoCom = useCallback((t: BlockType) => {
    const g: Group = { id: uid(), title: BLOCK_LABEL[t], x: posRef.current.x, y: posRef.current.y, blocks: [novoBlock(t)] };
    posRef.current = { x: posRef.current.x + 40, y: posRef.current.y + 60 };
    setFluxo((f) => ({ ...f, groups: [...f.groups, g] }));
    setSel({ g: g.id, b: g.blocks[0].id });
  }, []);
  // Cria um grupo numa posição do canvas (usado ao arrastar da paleta).
  const addGrupoEm = useCallback((t: BlockType, pos: { x: number; y: number }) => {
    const g: Group = { id: uid(), title: BLOCK_LABEL[t], x: Math.round(pos.x), y: Math.round(pos.y), blocks: [novoBlock(t)] };
    setFluxo((f) => ({ ...f, groups: [...f.groups, g] }));
    setSel({ g: g.id, b: g.blocks[0].id });
  }, []);
  // Instância do React Flow p/ converter coords da tela → coords do canvas.
  const rfRef = useRef<{ screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number } } | null>(null);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const t = e.dataTransfer.getData("application/tf-block") as BlockType;
    if (!t || !rfRef.current) return;
    addGrupoEm(t, rfRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }, [addGrupoEm]);
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }, []);
  const addBlock = useCallback((gId: string, t: BlockType) => {
    const b = novoBlock(t);
    mudarGrupo(gId, (g) => ({ ...g, blocks: [...g.blocks, b] }));
    setSel({ g: gId, b: b.id });
  }, [mudarGrupo]);
  // Duplica um bloco (novos ids de bloco/opções/condições) logo abaixo do original.
  const duplicarBloco = useCallback((gId: string, bId: string) => {
    const novoId = uid();
    mudarGrupo(gId, (g) => {
      const i = g.blocks.findIndex((b) => b.id === bId);
      if (i < 0) return g;
      const orig = g.blocks[i];
      const copia: Block = { ...orig, id: novoId, opcoes: orig.opcoes?.map((o) => ({ ...o, id: uid() })), condicoes: orig.condicoes?.map((c) => ({ ...c, id: uid() })) };
      const arr = [...g.blocks]; arr.splice(i + 1, 0, copia);
      return { ...g, blocks: arr };
    });
    setSel({ g: gId, b: novoId });
  }, [mudarGrupo]);
  const removeBlock = useCallback((gId: string, bId: string) => {
    mudarGrupo(gId, (g) => ({ ...g, blocks: g.blocks.filter((b) => b.id !== bId) }));
    setFluxo((f) => ({ ...f, edges: f.edges.filter((e) => !(e.from === gId && (e.fromHandle.startsWith("opt:") || e.fromHandle.startsWith("cond:")))) }));
    setSel(null);
  }, [mudarGrupo]);
  const patchBlock = useCallback((gId: string, bId: string, patch: Partial<Block>) => {
    mudarGrupo(gId, (g) => ({ ...g, blocks: g.blocks.map((b) => (b.id === bId ? { ...b, ...patch } : b)) }));
  }, [mudarGrupo]);
  const patchTexto = useCallback((gId: string, bId: string, texto: string) => patchBlock(gId, bId, { text: texto }), [patchBlock]);
  const moveBlock = useCallback((gId: string, bId: string, dir: -1 | 1) => {
    mudarGrupo(gId, (g) => {
      const i = g.blocks.findIndex((b) => b.id === bId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= g.blocks.length) return g;
      const arr = [...g.blocks]; [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...g, blocks: arr };
    });
  }, [mudarGrupo]);

  // ── React Flow: nodes/edges derivados do fluxo ──
  const onSelectBlock = useCallback((g: string, b: string) => setSel({ g, b }), []);
  const onTitle = useCallback((gId: string, titulo: string) => mudarGrupo(gId, (g) => ({ ...g, title: titulo })), [mudarGrupo]);

  const removerGrupos = useCallback((ids: string[]) => {
    setFluxo((f) => ({ ...f, groups: f.groups.filter((g) => !ids.includes(g.id)), edges: f.edges.filter((e) => !ids.includes(e.from) && !ids.includes(e.to)) }));
    setSel((s) => (s && ids.includes(s.g) ? null : s));
  }, []);

  // Duplica um grupo: novo id de grupo, novos ids de blocos (e de cada opção/
  // condição), deslocado +40/+40. Arestas de saída NÃO são copiadas (evita
  // apontar pra si mesmo / destinos ambíguos) — o usuário reconecta.
  const duplicarGrupo = useCallback((id: string) => {
    setFluxo((f) => {
      const orig = f.groups.find((g) => g.id === id);
      if (!orig) return f;
      const novo: Group = {
        ...orig,
        id: uid(),
        title: `${orig.title} (cópia)`,
        x: orig.x + 40,
        y: orig.y + 40,
        blocks: orig.blocks.map((b) => ({
          ...b,
          id: uid(),
          opcoes: b.opcoes?.map((o) => ({ ...o, id: uid() })),
          condicoes: b.condicoes?.map((c) => ({ ...c, id: uid() })),
        })),
      };
      return { ...f, groups: [...f.groups, novo] };
    });
  }, []);

  // Nós ficam em STATE do React Flow: durante o arraste só o nó movido muda
  // (applyNodeChanges), então os outros NÃO re-renderizam (fim do "piscar").
  // A posição só é gravada no fluxo ao SOLTAR (onNodeDragStop).
  const [nodes, setNodes] = useState<Node<GrupoNodeData>[]>([]);
  useEffect(() => {
    // MERGE em vez de recriar: reaproveita o node que o React Flow já tem (mesmo
    // objeto → mesma posição/estado interno) e só troca o `data`. Antes recriava
    // TODOS os nodes a cada mudança do fluxo; ao renomear um card, cada tecla
    // remontava o nó e o <input> do título PERDIA o foco (tinha que clicar de
    // novo pra digitar a próxima letra). Node novo só pra grupo inédito.
    setNodes((prev) => {
      const anteriores = new Map(prev.map((n) => [n.id, n]));
      return fluxo.groups.map((g, i) => {
        const data: GrupoNodeData = { group: g, indice: i, selBlockId: sel?.g === g.id ? sel.b : null, onSelectBlock, onAddBlock: addBlock, onRemoveBlock: removeBlock, onTitle, onPatchText: patchTexto, variables: fluxo.variables };
        const ant = anteriores.get(g.id);
        return ant ? { ...ant, data } : { id: g.id, type: "grupo" as const, position: { x: g.x, y: g.y }, data };
      });
    });
  }, [fluxo.groups, fluxo.variables, sel, onSelectBlock, addBlock, removeBlock, onTitle, patchTexto]);

  const edges: Edge[] = useMemo(() => fluxo.edges.map((e) => ({
    id: e.id, source: e.from, sourceHandle: e.fromHandle, target: e.to, targetHandle: "in",
    style: { stroke: "var(--primary)", strokeWidth: 2 }, animated: false,
  })), [fluxo.edges]);

  const onNodesChange = useCallback((changes: NodeChange<Node<GrupoNodeData>>[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));   // só o que mudou
    const removidos = changes.filter((c) => c.type === "remove").map((c) => (c as { id: string }).id);
    if (removidos.length) removerGrupos(removidos);
  }, [removerGrupos]);
  const onNodeDragStop = useCallback((_e: MouseEvent | TouchEvent, node: Node) => {
    setFluxo((f) => ({ ...f, groups: f.groups.map((g) => (g.id === node.id ? { ...g, x: Math.round(node.position.x), y: Math.round(node.position.y) } : g)) }));
  }, []);
  // Botão direito num grupo → menu pra excluir.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, id: node.id }); }, []);

  const onEdgesDelete = useCallback((del: Edge[]) => {
    setFluxo((f) => ({ ...f, edges: f.edges.filter((e) => !del.some((d) => d.id === e.id)) }));
  }, []);
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || !c.sourceHandle) return;
    const from = c.source, fromHandle = c.sourceHandle, to = c.target;
    setFluxo((f) => ({
      ...f,
      // uma aresta por saída: substitui a existente do mesmo handle
      edges: [...f.edges.filter((e) => !(e.from === from && e.fromHandle === fromHandle)), { id: uid(), from, fromHandle, to }],
    }));
  }, []);

  async function publicar() {
    const r = await fetch("/api/tridiflow/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "publicar", id: initial.id }) });
    const d = await r.json();
    if (!r.ok) { toast.erro(d.error || "Falha ao publicar."); return false; }
    setStatus("publicado");
    const host = dominios.find((x) => x.id === dominioId)?.host || DOMINIO_PADRAO;
    navigator.clipboard.writeText(`https://${host}/f/${slug}`).catch(() => {});
    toast.ok("Publicado! Link copiado.");
    return true;
  }

  const selBlock = sel ? fluxo.groups.find((g) => g.id === sel.g)?.blocks.find((b) => b.id === sel.b) ?? null : null;
  const nodeTypes = useMemo(() => ({ grupo: GrupoNode }), []);
  // Quem entrou "assim mesmo" pelo celular não pode perder canvas pro minimapa.
  const celular = useIsMobile();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", minHeight: 540, gap: 12, padding: "14px 18px", boxSizing: "border-box" }}>
      {/* Resultados sem sair da tela: overlay por cima do editor */}
      {mostrarPublicar && <PublicarModal dominioPadrao={DOMINIO_PADRAO} dominios={dominios} dominioId={dominioId} setDominioId={setDominioId} slug={slug} setSlug={setSlug} settings={settings} onSettings={setSettings} onClose={() => setMostrarPublicar(false)} />}
      {/* Modal "Personalizar": abas (tema/config/pixels/stories) com prévia ao vivo ao lado. */}
      {custom && (
        <div onClick={() => setCustom(null)} style={{ position: "fixed", inset: 0, zIndex: 5000, background: "color-mix(in srgb, #000 58%, transparent)", backdropFilter: "blur(3px)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "4dvh 16px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1020px, 100%)", maxHeight: "92dvh", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "0 24px 70px rgba(0,0,0,.5)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <strong style={{ fontSize: 16, fontWeight: 800, flex: "none" }}>Personalizar</strong>
              <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
                {([["tema", "Tema", "palette"], ["config", "Configurações", "settings"], ["pixels", "Pixels", "chart-dots"], ["stories", "Stories", "circle-plus"]] as const).map(([k, label, ic]) => (
                  <button key={k} onClick={() => setCustom(k)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, border: "1px solid " + (custom === k ? "transparent" : "var(--border)"), background: custom === k ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: custom === k ? "var(--on-primary, #fff)" : "var(--text)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    <Icon name={ic} size={14} color={custom === k ? "#fff" : "var(--text-dim)"} /> {label}
                  </button>
                ))}
              </div>
              <BotaoIcone icone="x" titulo="Fechar" onClick={() => setCustom(null)} />
            </div>
            {/* flexWrap + base min(100%,340px): no computador a prévia continua
                com 340px ao lado; no estreito ela desce pra própria linha. */}
            <div style={{ display: "flex", minHeight: 0, flex: 1, flexWrap: "wrap", overflowY: "auto" }}>
              <div style={{ flex: "1 1 min(100%, 380px)", minWidth: 0, overflowY: "auto", padding: 18 }}>
                {custom === "tema" && <PainelTema theme={theme} onChange={setTheme} />}
                {custom === "config" && <PainelConfig settings={settings} onChange={setSettings} />}
                {custom === "pixels" && <PainelPixels settings={settings} onChange={setSettings} variaveis={varsDoFluxo(fluxo)} />}
                {custom === "stories" && <PainelStories settings={settings} onChange={setSettings} grupos={fluxo.groups.map((g) => ({ id: g.id, title: g.title }))} />}
              </div>
              <div style={{ flex: "0 1 min(100%, 340px)", minWidth: 0, borderLeft: "1px solid var(--border)", padding: "16px 16px 20px", overflowY: "auto", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)" }}>PRÉVIA AO VIVO</span>
                  <Botao variante="sutil" tamanho="sm" icone="refresh" onClick={() => setPreviewKey((k) => k + 1)} title="Reiniciar conversa">Reiniciar</Botao>
                </div>
                {/* Iframe ligado? O TelefonePreview mesmo troca o chat pelo
                    iframe — a mesma prévia do painel lateral, sem caso especial. */}
                <TelefonePreview fluxo={fluxo} theme={theme} settings={settings} previewKey={previewKey} variables={fluxo.variables} vis={300}
                  onSelecionarBloco={(g, b) => { setCustom(null); setSel({ g, b }); }}
                  onEditarTexto={(g, b, texto) => patchBlock(g, b, { text: texto })} />
              </div>
            </div>
          </div>
        </div>
      )}
      {mostrarResultados && (
        <div onClick={() => setMostrarResultados(false)}
          style={{ position: "fixed", inset: 0, zIndex: 5000, background: "color-mix(in srgb, #000 62%, transparent)", backdropFilter: "blur(3px)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "4dvh 16px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: "min(1040px, 100%)", borderRadius: 18, background: "var(--bg)", border: "1px solid var(--border)", boxShadow: "0 24px 70px rgba(0,0,0,.5)", overflow: "hidden", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 22px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--bg)", zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: "color-mix(in srgb, var(--primary) 16%, transparent)", display: "grid", placeItems: "center", flex: "none" }}><Icon name="chart-line" size={16} color="var(--primary-texto)" /></span>
                <strong style={{ fontSize: 17, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Resultados · {nome}</strong>
              </div>
              <Botao icone="x" onClick={() => setMostrarResultados(false)} title="Fechar" style={{ flex: "none" }}>
                Fechar
              </Botao>
            </div>
            <div style={{ padding: "18px 22px 24px" }}>
              <ResultadosClient botId={initial.id} embutido />
            </div>
          </div>
        </div>
      )}
      {/* Topo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Link href="/tridiflow" style={{ color: "var(--primary-texto, var(--primary))", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>‹ Bots</Link>
        <input value={nome} onChange={(e) => setNome(e.target.value)}
          style={{ fontSize: 17, fontWeight: 800, background: "transparent", border: "none", color: "var(--text)", outline: "none", minWidth: 120, maxWidth: 260 }} />
        {/* O segmentado "Chat | Quiz" morava aqui. Saiu quando o quiz virou tipo
            de projeto com editor próprio (/tridiflow/q/[id]): um seletor de modo
            que navega pra outra tela confunde mais do que ajuda, e o quiz não
            precisa mais herdar um editor que bloqueia o celular. Converter agora
            é criar um projeto de quiz. */}
        <span style={{ fontSize: 12, color: salvando === "erro" ? "var(--perigo)" : "var(--text-dim)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          {salvando === "erro" && <Icon name="alert-triangle" size={12} color="var(--perigo)" />}
          {salvando === "salvando" ? "salvando…" : salvando === "erro" ? "falha ao salvar" : "salvo"}
        </span>
        <div style={{ display: "flex", gap: 4, marginLeft: 4 }}>
          <BotaoIcone icone="arrow-back-up" titulo="Desfazer (Ctrl/⌘+Z)" variante="secundario" tamanho="sm" onClick={desfazer} disabled={!podeUndo} />
          <BotaoIcone icone="arrow-forward-up" titulo="Refazer (Ctrl/⌘+Shift+Z)" variante="secundario" tamanho="sm" onClick={refazer} disabled={!podeRedo} />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Botao icone="palette" onClick={() => setCustom("tema")} title="Tema, configurações, conversões e stories">
            Personalizar
          </Botao>
          <Botao icone="chart-line" onClick={() => setMostrarResultados(true)}>
            Resultados
          </Botao>
          <Botao icone="share" onClick={() => setMostrarPublicar(true)}>
            Compartilhar
          </Botao>
          <span style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} />
          <Botao icone="player-play" onClick={() => setPreviewKey((k) => k + 1)}>
            Testar
          </Botao>
          <BotaoPublicar onPublicar={publicar} rotuloPronto="Publicado">
            {status === "publicado" ? "Republicar" : "Publicar"}
          </BotaoPublicar>
        </div>
      </div>

      {/* Modo iframe ligado: o link público mostra a página externa, não o fluxo.
          Sem este aviso, editar o canvas parece funcionar e "não muda nada". */}
      {(settings.modo === "iframe" || settings.iframeAtivo) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "9px 14px", borderRadius: 11, border: "1px solid color-mix(in srgb, var(--primary) 35%, var(--border))", background: "color-mix(in srgb, var(--primary) 9%, var(--surface))" }}>
          <Icon name="world-www" size={16} color="var(--primary-texto, var(--primary))" />
          <span style={{ fontSize: 12.5, color: "var(--text)", flex: 1, minWidth: "min(100%, 200px)", overflowWrap: "anywhere" }}>
            <strong>Modo iframe ligado:</strong> o link publicado abre {settings.iframeUrl ? <code style={{ fontSize: 11.5 }}>{urlDeIframe(settings.iframeUrl)}</code> : "a página configurada"} em tela cheia — o fluxo abaixo não aparece.
          </span>
          <Botao tamanho="sm" icone="settings" onClick={() => setCustom("config")}>
            Configurar
          </Botao>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {/* Paleta */}
        <div className="glass" style={{ width: 234, flex: "none", borderRadius: 14, padding: 14, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".04em" }}>Blocos</div>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", display: "grid", placeItems: "center", pointerEvents: "none" }}>
              <Icon name="search" size={14} color="var(--text-dim)" />
            </span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar bloco…"
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 28px 8px 30px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5, outline: "none" }} />
            {busca && (
              <BotaoIcone icone="x" titulo="Limpar" tamanho="sm" onClick={() => setBusca("")} style={{ position: "absolute", right: 2, top: "50%", marginTop: -16 }} />
            )}
          </div>
          {(() => {
            const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
            const q = norm(busca.trim());
            const cats = BLOCK_CATEGORIAS
              .map((cat) => ({ ...cat, tipos: q ? cat.tipos.filter((t) => norm(BLOCK_LABEL[t]).includes(q) || norm(cat.categoria).includes(q)) : cat.tipos }))
              .filter((cat) => cat.tipos.length > 0);
            if (cats.length === 0) return <p style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: "16px 0" }}>Nenhum bloco encontrado.</p>;
            return cats.map((cat) => (
              <div key={cat.categoria} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--text-dim)", marginBottom: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: COR_CATEGORIA[cat.categoria] }} />{cat.categoria}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {cat.tipos.map((t) => (
                    <button key={t} onClick={() => addGrupoCom(t)} title="Clique ou arraste pro canvas"
                      draggable onDragStart={(e) => { e.dataTransfer.setData("application/tf-block", t); e.dataTransfer.effectAllowed = "copy"; }}
                      className="tf-palette-item"
                      style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "9px 11px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontWeight: 600, cursor: "grab" }}>
                      <span style={{ width: 26, height: 26, borderRadius: 8, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${COR_CATEGORIA[cat.categoria]} 15%, transparent)` }}>
                        <Icon name={BLOCK_ICON[t]} size={15} color={COR_CATEGORIA[cat.categoria]} />
                      </span>
                      <span style={{ flex: 1 }}>{BLOCK_LABEL[t]}</span>
                      <Icon name="grip-vertical" size={14} color="var(--text-dim)" />
                    </button>
                  ))}
                </div>
              </div>
            ));
          })()}
          {!busca && <p style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.45 }}>Clique ou <strong>arraste</strong> um bloco pro canvas. Conecte os grupos pelas bolinhas.</p>}
        </div>

        {/* Canvas */}
        <div className="glass" style={{ flex: 1, borderRadius: 14, overflow: "hidden", minWidth: 0, position: "relative" }}>
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onInit={(inst) => { rfRef.current = inst; }} onDrop={onDrop} onDragOver={onDragOver}
            onNodesChange={onNodesChange} onNodeDragStop={onNodeDragStop} onEdgesDelete={onEdgesDelete} onConnect={onConnect}
            onNodeContextMenu={onNodeContextMenu} onPaneContextMenu={(e) => e.preventDefault()}
            fitView={fluxo.groups.length > 0} proOptions={{ hideAttribution: true }}
            deleteKeyCode={["Backspace", "Delete"]} minZoom={0.3} maxZoom={1.6}
            onPaneClick={() => { setSel(null); setCtxMenu(null); }} onMoveStart={() => setCtxMenu(null)}
          >
            <Background gap={22} size={1.5} color="rgba(130,130,150,.32)" />
            <Controls showInteractive={false} />
            {!celular && <MiniMap pannable zoomable style={{ width: 140, height: 90 }} />}
          </ReactFlow>
          {/* Estado vazio: ajuda a começar. */}
          {fluxo.groups.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
              <div style={{ textAlign: "center", color: "var(--text-dim)", maxWidth: 320, padding: 20 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, margin: "0 auto 12px", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}>
                  <Icon name="message-chatbot" size={28} color="var(--primary-texto)" />
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Comece seu fluxo</div>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 6 }}>Clique ou <strong>arraste</strong> um bloco da paleta à esquerda pra criar o primeiro grupo. Depois conecte pelas bolinhas.</p>
              </div>
            </div>
          )}
          {/* Menu do botão direito: excluir grupo. Via portal no body pra não ser
              deslocado por ancestrais com transform (senão aparece longe). */}
          {ctxMenu && typeof document !== "undefined" && createPortal(
            <>
              <div onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} style={{ position: "fixed", inset: 0, zIndex: 4000 }} />
              <div style={{ position: "fixed", left: Math.min(ctxMenu.x, window.innerWidth - 190), top: Math.min(ctxMenu.y, window.innerHeight - 96), zIndex: 4001, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 11, boxShadow: "0 14px 40px rgba(0,0,0,.5)", padding: 5, minWidth: 170 }}>
                <button onClick={() => { duplicarGrupo(ctxMenu.id); setCtxMenu(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 11px", borderRadius: 8, background: "none", border: "none", cursor: "pointer", color: "var(--text)", fontSize: 13, fontWeight: 600, textAlign: "left" }}>
                  <Icon name="copy" size={15} color="var(--text-dim)" /> Duplicar grupo
                </button>
                <button onClick={() => { removerGrupos([ctxMenu.id]); setCtxMenu(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 11px", borderRadius: 8, background: "none", border: "none", cursor: "pointer", color: "var(--perigo)", fontSize: 13, fontWeight: 600, textAlign: "left" }}>
                  <Icon name="trash" size={15} color="var(--perigo)" /> Excluir grupo
                </button>
              </div>
            </>,
            document.body,
          )}
        </div>

        {/* Lateral direita: config do bloco selecionado (rola) + PREVIEW fixo.
            Tema/config/pixels/stories agora ficam no modal "Personalizar". */}
        <div style={{ width: 330, flex: "none", display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflowY: "auto" }}>
          {selBlock && sel && (
            <div className="glass" style={{ flex: "none", borderRadius: 14, padding: 14, overflowY: "auto", maxHeight: 320 }}>
              <ConfigBloco block={selBlock} onPatch={(p) => patchBlock(sel.g, sel.b, p)} onMove={(d) => moveBlock(sel.g, sel.b, d)} onRemove={() => removeBlock(sel.g, sel.b)} onDuplicate={() => duplicarBloco(sel.g, sel.b)} variables={fluxo.variables} />
            </div>
          )}
          <div className="glass" style={{ flex: "none", borderRadius: 14, display: "flex", flexDirection: "column", padding: "10px 12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-dim)" }}>PRÉ-VISUALIZAÇÃO</span>
              <button onClick={() => setPreviewKey((k) => k + 1)} title="Reiniciar conversa"
                style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--primary-texto, var(--primary))", fontSize: 12, fontWeight: 700 }}>
                <Icon name="refresh" size={13} color="var(--primary-texto)" /> Reiniciar
              </button>
            </div>
            <TelefonePreview fluxo={fluxo} theme={theme} settings={settings} previewKey={previewKey} variables={fluxo.variables} vis={290}
              onSelecionarBloco={(g, b) => { setCustom(null); setSel({ g, b }); }}
              onEditarTexto={(g, b, texto) => patchBlock(g, b, { text: texto })} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Celular REAL (384px lógico) reduzido por scale — reutilizado no painel lateral
// e no modal Personalizar (largura `vis` configurável). Preview interativo.
function TelefonePreview({ fluxo, theme, settings, previewKey, onSelecionarBloco, onEditarTexto, variables, vis = 290 }: {
  fluxo: Fluxo; theme: Theme; settings: BotSettings; previewKey: number;
  onSelecionarBloco: (g: string, b: string) => void; onEditarTexto: (g: string, b: string, texto: string) => void;
  variables: string[]; vis?: number;
}) {
  const DEVW = 384, DEVH = 788, SC = vis / DEVW;
  // Iframe ligado (chave ou projeto dedicado): a prévia mostra a PÁGINA EXTERNA
  // no lugar do chat — é a única forma de saber que o iframe pegou antes de
  // publicar. Se aparecer em branco, o site bloqueia embed (X-Frame-Options).
  const emb = iframeEmbed(settings);
  const iframeLigado = settings.modo === "iframe" || settings.iframeAtivo;
  return (
    <div style={{ width: vis + 14, maxWidth: "100%", margin: "0 auto", borderRadius: 34, border: "7px solid #101014", boxShadow: "0 12px 38px rgba(0,0,0,.42)", background: "#101014", overflow: "hidden" }}>
      <div style={{ width: vis, height: DEVH * SC, overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: DEVW, height: DEVH, transform: `scale(${SC})`, transformOrigin: "top left", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: "none", height: 34, background: theme.corHeader, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <span style={{ width: 108, height: 26, background: "#101014", borderRadius: 999 }} />
            <span style={{ position: "absolute", right: 18, top: 8, fontSize: 14, fontWeight: 700, color: theme.corTextoHeader, opacity: 0.85 }}>9:41</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, background: iframeLigado ? "#fff" : undefined }}>
            {iframeLigado ? (
              emb ? (
                <iframe key={previewKey} src={emb.url} title="Prévia do iframe"
                  style={{ width: "100%", height: "100%", border: 0, display: "block" }} />
              ) : (
                <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 24, textAlign: "center", background: "#F2F2F7", color: "#6B7280", fontSize: 15, fontFamily: "system-ui, sans-serif" }}>
                  Cole a URL (ou o código &lt;iframe&gt;) pra ver a página aqui.
                </div>
              )
            ) : (
            <ChatRuntime fluxo={fluxo} theme={theme} settings={settings} customCss={settings.customCss} modoPreview altura="100%" reinicioKey={previewKey}
              onSelecionarBloco={onSelecionarBloco}
              onEditarTexto={onEditarTexto}
              renderEditorInline={(a) => (
                <RichTextInline value={a.value} onChange={a.onChange} onCommit={a.onCommit} onCancel={a.onCancel}
                  autoFocus minRows={1} variables={variables} placeholder="Edite a mensagem — Enter quebra linha, clique fora p/ salvar" textStyle={{ fontSize: 16, color: "inherit" }} />
              )} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Nó custom: GRUPO com blocos empilhados + handles por saída ───────────────
function GrupoNode({ id, data }: NodeProps<Node<GrupoNodeData>>) {
  const { group, indice, selBlockId, onSelectBlock, onAddBlock, onRemoveBlock, onTitle, onPatchText, variables } = data;
  const [addAberto, setAddAberto] = useState(false);
  return (
    <div style={{ width: 240, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 6px 22px rgba(0,0,0,.18)", fontFamily: "inherit" }}>
      <Handle type="target" position={Position.Left} id="in" style={{ width: 11, height: 11, background: "var(--primary)", top: 22 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px 6px" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-dim)", flex: "none" }}>{String(indice + 1).padStart(2, "0")}.</span>
        <input value={group.title} onChange={(e) => onTitle(group.id, e.target.value)} className="nodrag"
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 13, fontWeight: 800, padding: 0 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 10px 10px" }}>
        {group.blocks.map((b) => (
          <div key={b.id} onClick={(e) => { e.stopPropagation(); onSelectBlock(group.id, b.id); }} className="nodrag"
            style={{ position: "relative", borderRadius: 10, padding: "8px 10px", cursor: "pointer", border: `1.5px solid ${selBlockId === b.id ? "var(--primary)" : "var(--border)"}`, background: "var(--surface-2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 800, color: corDoTipo(b.type), textTransform: "uppercase", letterSpacing: ".03em" }}>
              <Icon name={BLOCK_ICON[b.type]} size={12} color={corDoTipo(b.type)} />{BLOCK_LABEL[b.type]}
            </div>
            {selBlockId === b.id && (b.type === "texto" || b.type === "botoes" || b.type === "lgpd" || b.type.startsWith("input_")) ? (
              <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 3, fontSize: 12.5, color: "var(--text)" }}>
                <RichTextInline value={b.text || ""} onChange={(t) => onPatchText(group.id, b.id, t)} variables={variables}
                  minRows={2} placeholder="Escreva a mensagem…" textStyle={{ fontSize: 12.5, color: "var(--text)" }} />
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {b.type === "imagem" ? (b.url || "sem imagem")
                  : b.type === "video" ? (b.url || "vídeo…")
                  : b.type === "audio" ? (b.url || "áudio…")
                  : b.type === "embed" ? (b.url || "iframe…")
                  : b.type === "localizacao" ? "pede a localização"
                  : b.type === "imagens" ? `${(b.opcoes ?? []).length} imagem(ns)`
                  : b.type === "data" ? "seletor de data"
                  : b.type === "avaliacao" ? `nota 1–${b.escala ?? 10}`
                  : b.type === "delay" ? `${b.delayMs ?? 0}ms`
                  : b.type === "set_var" ? `${b.variavel || "?"} = ${b.valor || ""}`
                  : b.type === "whatsapp" ? (b.telefone || "número…")
                  : b.type === "redirect" ? (b.url || "URL…")
                  : b.type === "evento" ? `${b.evento || "Lead"} → ${(b.plataformas ?? []).join(", ") || "pixels"}`
                  : b.type === "webhook" ? (b.url || "URL do webhook…")
                  : b.type === "ab" ? `${(b.opcoes ?? []).length || 2} caminhos (teste)`
                  : b.type === "prova_social" ? `${(b.opcoes ?? []).length} depoimento(s)`
                  : b.type === "contador" ? `${b.segundos ?? 600}s regressivos`
                  : b.type === "cupom" ? (b.valor || "CÓDIGO")
                  : (b.text || "…")}
              </div>
            )}
            {/* campo fake (liquid glass) só pra mostrar que ali entra uma resposta */}
            {(b.type.startsWith("input_") || b.type === "data" || b.type === "localizacao") && (
              <div className="tf-node-input" style={{ marginTop: 6, borderRadius: 8, padding: "7px 9px", fontSize: 11.5, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name={b.type === "data" ? "calendar" : b.type === "localizacao" ? "map-pin" : b.type === "input_email" ? "mail" : b.type === "input_telefone" ? "phone" : "edit"} size={12} color="var(--text-dim)" />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.placeholder || "resposta do visitante…"}</span>
              </div>
            )}
            {ehInput(b.type) && b.variavel && <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>→ {"{{"}{b.variavel}{"}}"}</div>}
            {/* saídas por opção / condição — cada opção vira um "botão" com contorno discreto */}
            {(b.type === "botoes" || b.type === "imagens") && (b.opcoes ?? []).map((o) => (
              <div key={o.id} style={{ position: "relative", marginTop: 5, paddingRight: 12 }}>
                <div className="tf-node-input" style={{ borderRadius: 8, padding: "6px 9px", fontSize: 11.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label || "(imagem)"}</div>
                <Handle type="source" position={Position.Right} id={`opt:${o.id}`} style={{ width: 9, height: 9, background: "var(--ok)", right: -15, top: 14 }} />
              </div>
            ))}
            {b.type === "condicao" && (
              <>
                {(b.condicoes ?? []).map((c) => (
                  <div key={c.id} style={{ position: "relative", marginTop: 4, fontSize: 11, color: "var(--text-dim)", paddingRight: 12 }}>
                    se {c.variavel || "?"} {c.op} {c.valor || "?"}
                    <Handle type="source" position={Position.Right} id={`cond:${c.id}`} style={{ width: 9, height: 9, background: "var(--atencao)", right: -15, top: 8 }} />
                  </div>
                ))}
                <div style={{ position: "relative", marginTop: 4, fontSize: 11, color: "var(--text-dim)", paddingRight: 12 }}>
                  senão
                  <Handle type="source" position={Position.Right} id="else" style={{ width: 9, height: 9, background: "var(--perigo)", right: -15, top: 8 }} />
                </div>
              </>
            )}
            {b.type === "ab" && (() => {
              const opts = b.opcoes ?? [];
              const totalPeso = opts.reduce((s, o) => s + Math.max(0, Number(o.peso) || 0), 0);
              return opts.map((o, i) => {
                const pct = totalPeso > 0 ? Math.round(Math.max(0, Number(o.peso) || 0) / totalPeso * 100) : Math.round(100 / (opts.length || 1));
                return (
                  <div key={o.id} style={{ position: "relative", marginTop: 4, fontSize: 11, color: "var(--text-dim)", paddingRight: 12 }}>
                    {o.label || `Caminho ${String.fromCharCode(65 + i)}`} ({pct}%)
                    <Handle type="source" position={Position.Right} id={`opt:${o.id}`} style={{ width: 9, height: 9, background: "var(--atencao)", right: -15, top: 8 }} />
                  </div>
                );
              });
            })()}
          </div>
        ))}
        {/* adicionar bloco neste grupo — seletor categorizado com ícones */}
        {addAberto ? (
          <div className="nodrag" onClick={(e) => e.stopPropagation()}
            style={{ border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", padding: 6, maxHeight: 230, overflowY: "auto", boxShadow: "0 8px 24px rgba(16,24,40,.12)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 6px" }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>Adicionar bloco</span>
              <BotaoIcone icone="x" titulo="Fechar" tamanho="sm" onClick={() => setAddAberto(false)} />
            </div>
            {BLOCK_CATEGORIAS.map((cat) => (
              <div key={cat.categoria} style={{ marginBottom: 3 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-dim)", padding: "3px 5px", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: COR_CATEGORIA[cat.categoria] }} />{cat.categoria}
                </div>
                {cat.tipos.map((t) => (
                  <button key={t} onClick={() => { onAddBlock(group.id, t); setAddAberto(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 8px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "var(--text)", textAlign: "left" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <span style={{ width: 20, height: 20, borderRadius: 6, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${COR_CATEGORIA[cat.categoria]} 15%, transparent)` }}>
                      <Icon name={BLOCK_ICON[t]} size={12} color={COR_CATEGORIA[cat.categoria]} />
                    </span>
                    {BLOCK_LABEL[t]}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <Botao tamanho="sm" icone="plus" onClick={(e) => { e.stopPropagation(); setAddAberto(true); }} className="nodrag">
            adicionar bloco
          </Botao>
        )}
        {selBlockId && group.blocks.some((b) => b.id === selBlockId) && (
          <Botao variante="perigo" tamanho="sm" onClick={(e) => { e.stopPropagation(); onRemoveBlock(group.id, selBlockId); }} className="nodrag">
            remover bloco selecionado
          </Botao>
        )}
      </div>
      {/* saída padrão do grupo (fim da pilha) */}
      <Handle type="source" position={Position.Right} id="out" style={{ width: 11, height: 11, background: "var(--primary)", bottom: 14, top: "auto" }} />
      <div style={{ fontSize: 9.5, color: "var(--text-dim)", textAlign: "right", padding: "0 14px 8px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>continua <Icon name="chevron-right" size={11} color="currentColor" /></div>
      <span style={{ display: "none" }}>{id}</span>
    </div>
  );
}

// ── Painel de configuração do bloco selecionado ──────────────────────────────
function ConfigBloco({ block, onPatch, onMove, onRemove, onDuplicate, variables }: { block: Block; onPatch: (p: Partial<Block>) => void; onMove: (d: -1 | 1) => void; onRemove: () => void; onDuplicate: () => void; variables: string[] }) {
  const b = block;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ fontSize: 13.5, color: "var(--text)", flex: 1 }}>{BLOCK_LABEL[b.type]}</strong>
        <MiniIcone icone="chevron-up" onClick={() => onMove(-1)} title="Subir" />
        <MiniIcone icone="chevron-down" onClick={() => onMove(1)} title="Descer" />
        <MiniIcone icone="copy" onClick={onDuplicate} title="Duplicar bloco" />
        <MiniIcone icone="trash" onClick={onRemove} title="Remover" perigo />
      </div>

      {(b.type === "texto" || b.type === "botoes" || b.type === "imagens" || b.type === "avaliacao" || b.type === "data" || b.type === "localizacao" || b.type.startsWith("input_")) && (
        <Campo label={b.type === "texto" ? "Mensagem" : "Pergunta"}>
          <textarea value={b.text ?? ""} onChange={(e) => onPatch({ text: e.target.value })} rows={3} placeholder="Use {{variavel}} pra personalizar" style={inp} />
        </Campo>
      )}
      {b.type === "imagem" && <Campo label="Imagem"><EntradaImagem url={b.url} onChange={(u) => onPatch({ url: u })} /></Campo>}
      {b.type === "embed" && (
        <>
          <Campo label="URL pra embutir (iframe)"><input value={b.url ?? ""} onChange={(e) => onPatch({ url: e.target.value })} placeholder="https://…" style={inp} /></Campo>
          <Campo label="Altura (px)"><input type="number" min={120} value={b.escala ?? 320} onChange={(e) => onPatch({ escala: Math.max(120, Number(e.target.value) || 320) })} style={inp} /></Campo>
        </>
      )}
      {b.type === "localizacao" && <Campo label="Salvar coordenadas na variável"><input value={b.variavel ?? ""} onChange={(e) => onPatch({ variavel: e.target.value.replace(/\W/g, "") })} placeholder="local" style={inp} /><p style={{ fontSize: 11, color: "var(--text-dim)", margin: "4px 0 0" }}>Salva &quot;lat,lng&quot; nessa variável, e também {"{{lat}}"} e {"{{lng}}"} separados.</p></Campo>}
      {b.type === "video" && (
        <>
          <Campo label="URL do vídeo (YouTube, Vimeo ou .mp4)"><input value={b.url ?? ""} onChange={(e) => onPatch({ url: e.target.value })} placeholder="https://youtube.com/watch?v=…" style={inp} /></Campo>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-dim)" }}><Caixa marcado={!!b.mudo} onChange={(marc) => onPatch({ mudo: marc })} /> Sem som (mudo)</label>
        </>
      )}
      {b.type === "audio" && <Campo label="URL do áudio (.mp3)"><input value={b.url ?? ""} onChange={(e) => onPatch({ url: e.target.value })} placeholder="https://…/audio.mp3" style={inp} /></Campo>}
      {(b.type.startsWith("input_") || b.type === "data") && (
        <>
          <Campo label="Salvar resposta na variável"><input value={b.variavel ?? ""} onChange={(e) => onPatch({ variavel: e.target.value.replace(/\W/g, "") })} placeholder="nome" style={inp} /></Campo>
          {b.type.startsWith("input_") && <Campo label="Placeholder"><input value={b.placeholder ?? ""} onChange={(e) => onPatch({ placeholder: e.target.value })} style={inp} /></Campo>}
        </>
      )}
      {b.type === "avaliacao" && (
        <>
          <Campo label="Salvar nota na variável"><input value={b.variavel ?? ""} onChange={(e) => onPatch({ variavel: e.target.value.replace(/\W/g, "") })} placeholder="nota" style={inp} /></Campo>
          <Campo label="Escala">
            <GlassSelect value={String(b.escala ?? 10)} onChange={(v) => onPatch({ escala: Number(v) })} style={inp}
              options={[{ value: "5", label: "1 a 5 (estrelas)" }, { value: "10", label: "0 a 10 (NPS)" }]} />
          </Campo>
        </>
      )}
      {b.type === "imagens" && (
        <Campo label="Cartões (imagem + rótulo; cada um é uma saída)">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(b.opcoes ?? []).map((o) => (
              <div key={o.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: 8, borderRadius: 10, background: "var(--surface)" }}>
                {o.imagem
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={o.imagem} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flex: "none" }} />
                  : <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--surface-2)", display: "grid", placeItems: "center", flex: "none" }}><Icon name="photo" size={18} color="var(--text-dim)" /></div>}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <UploadBtn compacto onUrl={(u) => onPatch({ opcoes: (b.opcoes ?? []).map((x) => x.id === o.id ? { ...x, imagem: u } : x) })} />
                    {o.imagem && <Botao tamanho="sm" onClick={() => onPatch({ opcoes: (b.opcoes ?? []).map((x) => x.id === o.id ? { ...x, imagem: "" } : x) })}>trocar</Botao>}
                  </div>
                  <input value={o.imagem ?? ""} onChange={(e) => onPatch({ opcoes: (b.opcoes ?? []).map((x) => x.id === o.id ? { ...x, imagem: e.target.value } : x) })} placeholder="ou cole a URL" style={{ ...inp, padding: "6px 8px" }} />
                  <input value={o.label} onChange={(e) => onPatch({ opcoes: (b.opcoes ?? []).map((x) => x.id === o.id ? { ...x, label: e.target.value } : x) })} placeholder="rótulo" style={{ ...inp, padding: "6px 8px" }} />
                </div>
                <BotaoIcone icone="x" titulo="Remover cartão" variante="perigo" tamanho="sm" onClick={() => onPatch({ opcoes: (b.opcoes ?? []).filter((x) => x.id !== o.id) })} disabled={(b.opcoes ?? []).length <= 1} style={{ flex: "none" }} />
              </div>
            ))}
            <Botao tamanho="sm" icone="plus" onClick={() => onPatch({ opcoes: [...(b.opcoes ?? []), { id: uid(), label: `Opção ${(b.opcoes ?? []).length + 1}`, imagem: "" }] })}>cartão</Botao>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: "var(--text-dim)" }}>
            Salvar escolha em: <input value={b.variavel ?? ""} onChange={(e) => onPatch({ variavel: e.target.value.replace(/\W/g, "") })} placeholder="(opcional)" style={{ ...inp, width: 110, padding: "5px 8px" }} />
          </label>
        </Campo>
      )}
      {b.type === "botoes" && (
        <Campo label="Opções (cada uma é uma saída)">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(b.opcoes ?? []).map((o, i) => (
              <div key={o.id} style={{ display: "flex", gap: 6 }}>
                <input value={o.label} onChange={(e) => onPatch({ opcoes: (b.opcoes ?? []).map((x) => x.id === o.id ? { ...x, label: e.target.value } : x) })} style={{ ...inp, flex: 1 }} />
                <BotaoIcone icone="x" titulo="Remover opção" variante="perigo" tamanho="sm" onClick={() => onPatch({ opcoes: (b.opcoes ?? []).filter((x) => x.id !== o.id) })} disabled={(b.opcoes ?? []).length <= 1} />
                <span style={{ display: "none" }}>{i}</span>
              </div>
            ))}
            <Botao tamanho="sm" icone="plus" onClick={() => onPatch({ opcoes: [...(b.opcoes ?? []), { id: uid(), label: `Opção ${(b.opcoes ?? []).length + 1}` }] })}>opção</Botao>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: "var(--text-dim)" }}>
            Salvar escolha em: <input value={b.variavel ?? ""} onChange={(e) => onPatch({ variavel: e.target.value.replace(/\W/g, "") })} placeholder="(opcional)" style={{ ...inp, width: 110, padding: "5px 8px" }} />
          </label>
        </Campo>
      )}
      {b.type === "condicao" && (
        <Campo label="Ramos (conecte cada saída no canvas)">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(b.condicoes ?? []).map((c) => (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 5, alignItems: "center" }}>
                <input value={c.variavel} onChange={(e) => onPatch({ condicoes: (b.condicoes ?? []).map((x) => x.id === c.id ? { ...x, variavel: e.target.value.replace(/\W/g, "") } : x) })} placeholder="variável" style={inp} />
                <GlassSelect value={c.op} onChange={(v) => onPatch({ condicoes: (b.condicoes ?? []).map((x) => x.id === c.id ? { ...x, op: v as typeof c.op } : x) })}
                  style={{ ...inp, padding: "7px 6px" }}
                  options={[
                    { value: "igual", label: "=" }, { value: "diferente", label: "\u2260" },
                    { value: "contem", label: "cont\u00e9m" }, { value: "maior", label: ">" }, { value: "menor", label: "<" },
                  ]} />
                <input value={c.valor} onChange={(e) => onPatch({ condicoes: (b.condicoes ?? []).map((x) => x.id === c.id ? { ...x, valor: e.target.value } : x) })} placeholder="valor" style={inp} />
                <BotaoIcone icone="x" titulo="Remover ramo" variante="perigo" tamanho="sm" onClick={() => onPatch({ condicoes: (b.condicoes ?? []).filter((x) => x.id !== c.id) })} disabled={(b.condicoes ?? []).length <= 1} />
              </div>
            ))}
            <Botao tamanho="sm" icone="plus" onClick={() => onPatch({ condicoes: [...(b.condicoes ?? []), { id: uid(), variavel: "", op: "igual", valor: "" }] })}>ramo</Botao>
          </div>
        </Campo>
      )}
      {b.type === "set_var" && (
        <>
          <Campo label="Variável"><input value={b.variavel ?? ""} onChange={(e) => onPatch({ variavel: e.target.value.replace(/\W/g, "") })} style={inp} /></Campo>
          <Campo label="Valor (aceita {{vars}})"><input value={b.valor ?? ""} onChange={(e) => onPatch({ valor: e.target.value })} style={inp} /></Campo>
        </>
      )}
      {b.type === "delay" && (
        <Campo label="Espera (milissegundos)"><input type="number" min={0} step={100} value={b.delayMs ?? 0} onChange={(e) => onPatch({ delayMs: Math.max(0, Number(e.target.value) || 0) })} style={inp} /></Campo>
      )}
      {b.type === "redirect" && <Campo label="URL de destino"><input value={b.url ?? ""} onChange={(e) => onPatch({ url: e.target.value })} placeholder="https://… (aceita {{vars}})" style={inp} /></Campo>}
      {b.type === "whatsapp" && (
        <>
          <Campo label="Número (DDI+DDD, só dígitos)"><input value={b.telefone ?? ""} onChange={(e) => onPatch({ telefone: e.target.value })} placeholder="5511999999999" style={inp} /></Campo>
          <Campo label="Mensagem pré-preenchida"><textarea value={b.mensagem ?? ""} onChange={(e) => onPatch({ mensagem: e.target.value })} rows={3} style={inp} /></Campo>
        </>
      )}
      {b.type === "evento" && (
        <>
          <Campo label="Evento">
            <GlassSelect value={b.evento ?? "Lead"} onChange={(v) => onPatch({ evento: v })} style={inp}
              options={EVENTOS_PADRAO.map((ev) => ({ value: ev, label: ev }))} />
          </Campo>
          <Campo label="Valor (R$, opcional — pro Purchase)"><input value={b.valor ?? ""} onChange={(e) => onPatch({ valor: e.target.value })} placeholder="97,00" style={inp} /></Campo>
          <Campo label="Dispara em">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {PLATAFORMAS_PIXEL.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text)", cursor: "pointer" }}>
                  <Caixa marcado={(b.plataformas ?? []).includes(p.id)} onChange={(marc) => onPatch({ plataformas: marc ? [...(b.plataformas ?? []), p.id] : (b.plataformas ?? []).filter((x) => x !== p.id) })} />
                  {p.label}
                </label>
              ))}
            </div>
          </Campo>
          <p style={{ fontSize: 11, color: "var(--text-dim)", margin: 0 }}>Configure os IDs dos pixels no botão “Pixels” lá em cima.</p>
        </>
      )}
      {b.type === "webhook" && <Campo label="URL (recebe as variáveis via POST JSON)"><input value={b.url ?? ""} onChange={(e) => onPatch({ url: e.target.value })} placeholder="https://hook.n8n.io/… (aceita {{vars}})" style={inp} /></Campo>}
      {b.type === "ab" && (() => {
        const opts = b.opcoes ?? [];
        const totalPeso = opts.reduce((s, o) => s + Math.max(0, Number(o.peso) || 0), 0);
        const setOpt = (id: string, p: Partial<{ label: string; peso: number }>) => onPatch({ opcoes: opts.map((x) => x.id === id ? { ...x, ...p } : x) });
        const mediaPeso = opts.length ? Math.round(totalPeso / opts.length) || 25 : 25;
        return (
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>Caminhos do teste</div>
            <p style={{ fontSize: 10.5, color: "var(--text-dim)", margin: "0 0 8px", lineHeight: 1.4 }}>Adicione quantos caminhos quiser (A, B, C, D…). Cada peso é uma fatia do tráfego — normalizamos pra 100%. Conecte cada saída (bolinha) a um grupo.</p>
            {opts.map((o, i) => {
              const pct = totalPeso > 0 ? Math.round(Math.max(0, Number(o.peso) || 0) / totalPeso * 100) : Math.round(100 / opts.length);
              return (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <input value={o.label} onChange={(e) => setOpt(o.id, { label: e.target.value })} placeholder={`Caminho ${String.fromCharCode(65 + i)}`} style={{ ...inp, flex: 1, padding: "6px 8px" }} />
                  <input type="number" min={0} value={o.peso ?? 0} onChange={(e) => setOpt(o.id, { peso: Math.max(0, Number(e.target.value) || 0) })} title="Peso" style={{ ...inp, width: 58, padding: "6px 8px" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", width: 36, textAlign: "right" }}>{pct}%</span>
                  <BotaoIcone icone="x" titulo="Remover caminho" variante="perigo" tamanho="sm" onClick={() => onPatch({ opcoes: opts.filter((x) => x.id !== o.id) })} disabled={opts.length <= 2} style={{ flex: "none" }} />
                </div>
              );
            })}
            <Botao tamanho="sm" icone="circle-plus" onClick={() => onPatch({ opcoes: [...opts, { id: uid(), label: `Caminho ${String.fromCharCode(65 + opts.length)}`, peso: mediaPeso }] })}
              style={{ marginTop: 4 }}>
              Adicionar caminho
            </Botao>
          </div>
        );
      })()}
      {b.type === "prova_social" && (
        <Campo label="Depoimentos (rotacionam sozinhos)">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(b.opcoes ?? []).map((o) => (
              <div key={o.id} style={{ display: "flex", gap: 6 }}>
                <textarea value={o.label} rows={2} onChange={(e) => onPatch({ opcoes: (b.opcoes ?? []).map((x) => x.id === o.id ? { ...x, label: e.target.value } : x) })} style={{ ...inp, flex: 1 }} />
                <BotaoIcone icone="x" titulo="Remover depoimento" variante="perigo" tamanho="sm" onClick={() => onPatch({ opcoes: (b.opcoes ?? []).filter((x) => x.id !== o.id) })} disabled={(b.opcoes ?? []).length <= 1} />
              </div>
            ))}
            <Botao tamanho="sm" icone="plus" onClick={() => onPatch({ opcoes: [...(b.opcoes ?? []), { id: uid(), label: "★★★★★ “…” — Cliente" }] })}>depoimento</Botao>
          </div>
        </Campo>
      )}
      {b.type === "contador" && (
        <>
          <Campo label="Texto antes do timer"><input value={b.text ?? ""} onChange={(e) => onPatch({ text: e.target.value })} style={inp} /></Campo>
          <Campo label="Segundos"><input type="number" min={5} value={b.segundos ?? 600} onChange={(e) => onPatch({ segundos: Math.max(5, Number(e.target.value) || 600) })} style={inp} /></Campo>
        </>
      )}
      {b.type === "cupom" && (
        <>
          <Campo label="Texto antes do cupom"><input value={b.text ?? ""} onChange={(e) => onPatch({ text: e.target.value })} style={inp} /></Campo>
          <Campo label="Código do cupom"><input value={b.valor ?? ""} onChange={(e) => onPatch({ valor: e.target.value.toUpperCase() })} style={inp} /></Campo>
        </>
      )}
      {b.type === "lgpd" && (
        <>
          <Campo label="Texto do consentimento"><textarea value={b.text ?? ""} onChange={(e) => onPatch({ text: e.target.value })} rows={3} style={inp} /></Campo>
          <Campo label="Salvar aceite na variável"><input value={b.variavel ?? ""} onChange={(e) => onPatch({ variavel: e.target.value.replace(/\W/g, "") })} style={inp} /></Campo>
        </>
      )}
      {variables.length > 0 && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Variáveis: {variables.map((v) => `{{${v}}}`).join(" ")}</div>}
    </div>
  );
}

// ── Painel de TEMA (F4): galeria de presets + customização ──────────────────
function PainelTema({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  const grupos = ["Plataformas", "Conversão"] as const;
  const cores: { k: keyof Theme; label: string }[] = [
    { k: "corHeader", label: "Cabeçalho" }, { k: "corTextoHeader", label: "Texto do cabeçalho" },
    { k: "corFundo", label: "Fundo" }, { k: "corBolhaBot", label: "Bolha do bot" }, { k: "corTextoBot", label: "Texto do bot" },
    { k: "corBolhaUser", label: "Bolha do usuário" }, { k: "corTextoUser", label: "Texto do usuário" },
    { k: "corBotao", label: "Botões" }, { k: "corTextoBotao", label: "Texto dos botões" },
  ];
  const dh = headerDefaults(theme.preset);        // padrões do preset atual
  const hh = theme.header ?? {};                  // overrides do usuário
  const setHeader = (patch: Partial<NonNullable<Theme["header"]>>) => onChange({ ...theme, header: { ...hh, ...patch } });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <strong style={{ fontSize: 13.5, color: "var(--text)" }}>Tema do chat</strong>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: "none" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)" }}>Foto</span>
          <label style={{ display: "block", marginTop: 4, width: 46, height: 46, borderRadius: "50%", overflow: "hidden", cursor: "pointer", border: "1px solid var(--border)", background: "var(--surface)" }} title="Colar URL abaixo">
            {theme.fotoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={theme.fotoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "var(--text-dim)", fontSize: 18 }}>{(theme.nomeBot || "B").charAt(0).toUpperCase()}</div>}
          </label>
        </div>
        <div style={{ flex: 1 }}>
          <Campo label="Nome do bot (cabeçalho)">
            <input value={theme.nomeBot} onChange={(e) => onChange({ ...theme, nomeBot: e.target.value })} style={inp} />
          </Campo>
        </div>
      </div>
      <Campo label="Foto de perfil">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <UploadBtn onUrl={(u) => onChange({ ...theme, fotoUrl: u })} />
          {theme.fotoUrl && <Botao variante="perigo" tamanho="sm" onClick={() => onChange({ ...theme, fotoUrl: undefined })}>Remover</Botao>}
        </div>
        <input value={theme.fotoUrl ?? ""} onChange={(e) => onChange({ ...theme, fotoUrl: e.target.value || undefined })} placeholder="ou cole a URL da foto" style={{ ...inp, marginTop: 6 }} />
      </Campo>
      {grupos.map((gr) => (
        <div key={gr}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 8 }}>{gr === "Plataformas" ? "Simular plataforma (confiança)" : "Temas de conversão"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {THEME_PRESETS.filter((p) => p.grupo === gr).map((p) => {
              const ativo = theme.preset === p.id;
              return (
                <button key={p.id} onClick={() => onChange({ ...p.theme, nomeBot: theme.nomeBot, fotoUrl: theme.fotoUrl, header: theme.header })} title={p.label}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "8px 2px", borderRadius: 11, cursor: "pointer", background: ativo ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "transparent", border: `1.5px solid ${ativo ? "var(--primary)" : "transparent"}` }}>
                  <span style={{ position: "relative", width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg, ${p.theme.corHeader} 50%, ${p.theme.corBolhaUser} 50%)`, border: "2px solid var(--border)", boxShadow: ativo ? "0 0 0 2px var(--primary)" : "none" }}>
                    {ativo && <span style={{ position: "absolute", right: -3, top: -3, width: 14, height: 14, borderRadius: "50%", background: "var(--primary)", display: "grid", placeItems: "center" }}><Icon name="check" size={9} color="var(--on-primary)" /></span>}
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: ativo ? "var(--text)" : "var(--text-dim)", textAlign: "center", lineHeight: 1.15 }}>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 6 }}>Personalizar cores</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
          {cores.map((c) => (
            <span key={c.k} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--text-dim)" }}>
              <CampoCor rotulo={c.label} valor={String(theme[c.k])} aoMudar={(v) => onChange({ ...theme, preset: "marca", [c.k]: v })} tamanho={20} />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {/* Cabeçalho: botão voltar, status, verificado, halo, ícones da direita */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 8 }}>Cabeçalho</div>

        <LinhaToggle label="Botão de voltar" checked={hh.voltar ?? dh.voltar} onChange={(v) => setHeader({ voltar: v })} />
        {(hh.voltar ?? dh.voltar) && (
          <Campo label="Símbolo do voltar">
            <GlassSelect value={hh.iconeVoltar ?? "back"} onChange={(v) => setHeader({ iconeVoltar: v })} style={inp}
              options={HEADER_ICONES_VOLTAR.map((i) => ({ value: i.key, label: i.label }))} />
          </Campo>
        )}

        <Campo label="Status (deixe vazio pra esconder)">
          <input value={hh.status ?? dh.status} onChange={(e) => setHeader({ status: e.target.value })} placeholder="Online" style={inp} />
        </Campo>

        <LinhaToggle label="Selo verificado" checked={hh.verificado ?? dh.verificado} onChange={(v) => setHeader({ verificado: v })} />
        {(hh.verificado ?? dh.verificado) && (
          <LinhaCor label="Cor do selo" value={hh.corVerificado || "#3897F0"} onChange={(v) => setHeader({ corVerificado: v })} />
        )}

        <LinhaToggle label="Halo na foto" checked={hh.halo ?? dh.halo} onChange={(v) => setHeader({ halo: v })} />
        {(hh.halo ?? dh.halo) && (
          <>
            <Campo label="Estilo do halo">
              <GlassSelect value={(hh.corHalo ?? dh.corHalo) === "ig" ? "ig" : "solid"}
                onChange={(v) => setHeader({ corHalo: v === "ig" ? "ig" : (hh.corHalo && hh.corHalo !== "ig" ? hh.corHalo : "#C13584") })}
                style={inp}
                options={[{ value: "solid", label: "Cor s\u00f3lida" }, { value: "ig", label: "Degrad\u00ea Instagram" }]} />
            </Campo>
            {(hh.corHalo ?? dh.corHalo) !== "ig" && (
              <LinhaCor label="Cor do halo" value={(hh.corHalo && hh.corHalo !== "ig") ? hh.corHalo : "#C13584"} onChange={(v) => setHeader({ corHalo: v })} />
            )}
          </>
        )}

        <LinhaToggle label="Foto ao lado das mensagens" checked={hh.avatarBolha ?? dh.avatarBolha} onChange={(v) => setHeader({ avatarBolha: v })} />

        {([["btn1", "btn1Link", "Ícone da direita 1"], ["btn2", "btn2Link", "Ícone da direita 2"]] as const).map(([bk, lk, label]) => {
          const atual = (hh[bk] ?? dh[bk]) as string;
          return (
            <div key={bk}>
              <Campo label={label}>
                <GlassSelect value={atual} onChange={(v) => setHeader({ [bk]: v } as Partial<NonNullable<Theme["header"]>>)} style={inp}
                  options={[{ value: "", label: "Nenhum" }, ...HEADER_ICONES.map((i) => ({ value: i.key, label: i.label }))]} />
              </Campo>
              {atual && (
                <Campo label="Link ao clicar (opcional)">
                  <input value={hh[lk] ?? ""} onChange={(e) => setHeader({ [lk]: e.target.value || undefined } as Partial<NonNullable<Theme["header"]>>)} placeholder="tel:+55… · https://… · wa.me/…" style={inp} />
                </Campo>
              )}
            </div>
          );
        })}

        <LinhaCor label="Cor dos ícones do cabeçalho" value={hh.corIcones || theme.corTextoHeader} onChange={(v) => setHeader({ corIcones: v })} />
      </div>
    </div>
  );
}

function LinhaToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: "pointer", padding: "6px 0" }}>
      <span style={{ fontSize: 12, color: "var(--text)" }}>{label}</span>
      <Caixa marcado={checked} onChange={(marc) => onChange(marc)} />
    </label>
  );
}
function LinhaCor({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 0" }}>
      <span style={{ fontSize: 12, color: "var(--text)" }}>{label}</span>
      <CampoCor rotulo={label} valor={value} aoMudar={onChange} tamanho={20} />
    </div>
  );
}

// ── Painel de PIXELS (F5): rastreamento & conversões ─────────────────────────
// Passo a passo de onde pegar cada ID (dentro da plataforma), com link — o
// texto mora em `_shared/ajudaPixel.ts`, dividido com o editor do LinkTridi.

function ComoPegar({ ajuda }: { ajuda: { titulo: string; passos: string[]; link: string } }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setAberto((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--primary-texto, var(--primary))", fontSize: 11.5, fontWeight: 700, padding: 0 }}>
        <Icon name="info" size={13} color="var(--primary-texto)" /> Como pegar o {ajuda.titulo}
        <TrocaIcone ligado={aberto} a="chevron-down" b="chevron-up" size={13} corA="var(--primary-texto)" corB="var(--primary-texto)" />
      </button>
      {aberto && (
        <div style={{ marginTop: 6, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 9, padding: "9px 11px" }}>
          <ol style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: "var(--text)", lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 3 }}>
            {ajuda.passos.map((p, i) => <li key={i}>{p}</li>)}
          </ol>
          <a href={ajuda.link} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 11.5, fontWeight: 700, color: "var(--primary-texto, var(--primary))", textDecoration: "none" }}>
            <Icon name="external-link" size={12} color="var(--primary-texto)" /> Abrir a plataforma
          </a>
        </div>
      )}
    </div>
  );
}

// Editor das REGRAS de conversão (gatilho → evento → plataformas → ativo →
// amostragem). Semeia um padrão sensato na 1ª vez (migra o formato antigo).
function EditorConversoes({ settings, onChange }: { settings: BotSettings; onChange: (s: BotSettings) => void }) {
  const fallback = useMemo(() => conversoesEfetivas(settings), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const regras = settings.conversoes ?? fallback;
  useEffect(() => { if (!settings.conversoes) onChange({ ...settings, conversoes: fallback }); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const setRegras = (rs: RegraConversao[]) => onChange({ ...settings, conversoes: rs });
  const patch = (id: string, p: Partial<RegraConversao>) => setRegras(regras.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const togglePlat = (r: RegraConversao, plat: string) => patch(r.id, { plataformas: r.plataformas.includes(plat) ? r.plataformas.filter((x) => x !== plat) : [...r.plataformas, plat] });
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>Conversões (eventos de pixel)</div>
        <Botao tamanho="sm" icone="circle-plus" onClick={() => setRegras([...regras, novaRegraConversao("conclusao")])}>
          Regra
        </Botao>
      </div>
      <p style={{ fontSize: 10.5, color: "var(--text-dim)", margin: "0 0 8px", lineHeight: 1.4 }}>
        Controle o que vai (e o que não vai) pro pixel: escolha o gatilho, o evento, as plataformas e se manda sempre ou só numa % das sessões.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {regras.map((r) => (
          <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: 11, padding: 10, background: "var(--surface)", opacity: r.ativo ? 1 : 0.62 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <input value={r.nome} onChange={(e) => patch(r.id, { nome: e.target.value })}
                style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 12.5, fontWeight: 700, padding: 0 }} />
              <Interruptor ligado={r.ativo} onChange={(v) => patch(r.id, { ativo: v })} tamanho="sm" cor="var(--primary)"
                titulo={r.ativo ? "Regra ativa — clique para desligar" : "Regra desligada — clique para ativar"} />
              <BotaoIcone icone="trash" titulo="Remover" tamanho="sm" onClick={() => setRegras(regras.filter((x) => x.id !== r.id))} />
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 7 }}>
              <GlassSelect value={r.gatilho} onChange={(v) => patch(r.id, { gatilho: v as RegraConversao["gatilho"] })}
                style={{ ...inp, flex: 1, padding: "7px 8px", fontSize: 12 }}
                options={GATILHOS_CONVERSAO.map((g) => ({ value: g.id, label: g.label }))} />
              <GlassSelect value={r.evento} onChange={(v) => patch(r.id, { evento: v })}
                style={{ ...inp, flex: 1, padding: "7px 8px", fontSize: 12 }}
                options={EVENTOS_PIXEL.map((ev) => ({ value: ev, label: ev }))} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
              {PLATAFORMAS_PIXEL.map((pl) => {
                const on = r.plataformas.includes(pl.id);
                return (
                  <button key={pl.id} onClick={() => togglePlat(r, pl.id)}
                    style={{ padding: "4px 9px", borderRadius: 999, border: `1px solid ${on ? "transparent" : "var(--border)"}`, background: on ? "var(--primary-acao, var(--primary))" : "var(--surface-2)", color: on ? "var(--on-primary, #fff)" : "var(--text-dim)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {pl.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap", minWidth: 66 }}>Envia {r.amostragem}%</span>
              <Deslizante className="esticar" min={0} max={100} step={5} value={r.amostragem} onChange={(v) => patch(r.id, { amostragem: v })} aria-label="Amostragem" />
            </div>
            {(r.gatilho === "conclusao" || r.evento === "Purchase" || r.evento === "Lead") && (
              <input value={r.valor ?? ""} onChange={(e) => patch(r.id, { valor: e.target.value || undefined })} placeholder="Valor R$ (opcional)" style={{ ...inp, marginTop: 7, padding: "7px 8px", fontSize: 12 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PainelPixels({ settings, onChange, variaveis }: { settings: BotSettings; onChange: (s: BotSettings) => void; variaveis: string[] }) {
  const gaia = settings.gaiaLeads ?? {};
  const setGaia = (patch: Partial<NonNullable<BotSettings["gaiaLeads"]>>) => onChange({ ...settings, gaiaLeads: { ...gaia, ...patch } });
  const p = settings.pixels ?? {};
  const set = (k: string, v: string) => onChange({ ...settings, pixels: { ...p, [k]: v.trim() || undefined } });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <strong style={{ fontSize: 13.5, color: "var(--text)" }}>Rastreamento & Pixels</strong>
      <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0, lineHeight: 1.45 }}>
        Cole os IDs uma vez. Os eventos de ciclo de vida (abertura, início e conclusão) você controla em <strong>Conversões</strong>, logo abaixo — e use o bloco <strong>Marcador de evento</strong> em pontos específicos do funil.
      </p>
      {([
        { k: "metaPixelId", nome: "Meta Pixel", cor: "#0084FF", ph: "123456789012345", v: p.metaPixelId },
        { k: "ga4Id", nome: "Google GA4", cor: "#F9AB00", ph: "G-XXXXXXX", v: p.ga4Id },
        { k: "tiktokId", nome: "TikTok Pixel", cor: "var(--info)", ph: "C0XXXXXXXX", v: p.tiktokId },
        { k: "pinterestId", nome: "Pinterest Tag", cor: "#E60023", ph: "26XXXXXXXXX", v: p.pinterestId },
      ] as const).map((c) => (
        <div key={c.k} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", background: "var(--surface)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
            <span style={{ width: 24, height: 24, borderRadius: 7, background: `color-mix(in srgb, ${c.cor} 18%, transparent)`, display: "grid", placeItems: "center" }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: c.cor }} />
            </span>
            <strong style={{ flex: 1, fontSize: 12.5, color: "var(--text)" }}>{c.nome}</strong>
            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: c.v ? "color-mix(in srgb,var(--ok) 16%,transparent)" : "var(--surface-2)", color: c.v ? "var(--ok)" : "var(--text-dim)" }}>
              {c.v ? "● Ativo" : "Inativo"}
            </span>
          </div>
          <input value={c.v ?? ""} onChange={(e) => set(c.k, e.target.value)} placeholder={c.ph} style={inp} />
          {AJUDA_PIXEL[c.k] && <ComoPegar ajuda={AJUDA_PIXEL[c.k]} />}
        </div>
      ))}
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ width: 24, height: 24, borderRadius: 7, background: "color-mix(in srgb,#0084FF 18%,transparent)", display: "grid", placeItems: "center" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#0084FF" }} />
          </span>
          <strong style={{ flex: 1, fontSize: 12.5, color: "var(--text)" }}>Meta Conversions API</strong>
          <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: p.capiToken ? "color-mix(in srgb,var(--ok) 16%,transparent)" : "var(--surface-2)", color: p.capiToken ? "var(--ok)" : "var(--text-dim)" }}>
            {p.capiToken ? "● Ativo" : "Inativo"}
          </span>
        </div>
        <p style={{ fontSize: 10.5, color: "var(--text-dim)", margin: "0 0 8px", lineHeight: 1.4 }}>Server-side, resistente a bloqueio de cookie/iOS. O token fica só no servidor (dedup automática com o Pixel).</p>
        <Campo label="Dataset ID (= Pixel ID)"><input value={p.capiDatasetId ?? ""} onChange={(e) => set("capiDatasetId", e.target.value)} style={inp} /></Campo>
        <Campo label="Token de acesso"><input type="password" value={p.capiToken ?? ""} onChange={(e) => set("capiToken", e.target.value)} placeholder="EAAB…" style={inp} /></Campo>
        <ComoPegar ajuda={AJUDA_CAPI} />
      </div>
      <EditorConversoes settings={settings} onChange={onChange} />
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Destino dos leads</div>
        <p style={{ fontSize: 10.5, color: "var(--text-dim)", margin: "0 0 8px", lineHeight: 1.4 }}>Ao concluir o funil, mandamos o lead (todas as variáveis + UTMs) por POST pra esta URL — Google Sheets (via Apps Script), n8n, Make, Zapier ou seu CRM.</p>
        <Campo label="Webhook de destino"><input value={settings.leadWebhook ?? ""} onChange={(e) => onChange({ ...settings, leadWebhook: e.target.value || undefined })} placeholder="https://hook.n8n.io/… ou script do Sheets" style={inp} /></Campo>
        <p style={{ fontSize: 10.5, color: "var(--text-dim)", margin: "6px 0 0" }}>Os leads também ficam salvos aqui no TridiFlow (aba <strong>Resultados</strong>, com export CSV).</p>
      </div>
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <Caixa marcado={!!gaia.ativo} onChange={(marc) => setGaia({ ativo: marc })} />
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>Enviar pro Comercial (Leads)</span>
        </label>
        <p style={{ fontSize: 10.5, color: "var(--text-dim)", margin: "6px 0 8px", lineHeight: 1.4 }}>Ao concluir o funil, o lead cai direto na aba <strong>Leads</strong> do Comercial (Gaia). Escolha quais variáveis têm o telefone e o nome.</p>
        {gaia.ativo && (
          <>
            <Campo label="Variável do telefone (obrigatório)">
              {variaveis.length > 0 ? (
                <GlassSelect value={gaia.varTelefone ?? ""} onChange={(v) => setGaia({ varTelefone: v || undefined })} style={inp}
                  options={[{ value: "", label: "\u2014 escolher \u2014" }, ...variaveis.map((v) => ({ value: v, label: `{{${v}}}` }))]} />
              ) : <input value={gaia.varTelefone ?? ""} onChange={(e) => setGaia({ varTelefone: e.target.value.replace(/\W/g, "") || undefined })} placeholder="ex.: telefone" style={inp} />}
            </Campo>
            <Campo label="Variável do nome (opcional)">
              {variaveis.length > 0 ? (
                <GlassSelect value={gaia.varNome ?? ""} onChange={(v) => setGaia({ varNome: v || undefined })} style={inp}
                  options={[{ value: "", label: "\u2014 nenhum \u2014" }, ...variaveis.map((v) => ({ value: v, label: `{{${v}}}` }))]} />
              ) : <input value={gaia.varNome ?? ""} onChange={(e) => setGaia({ varNome: e.target.value.replace(/\W/g, "") || undefined })} placeholder="ex.: nome" style={inp} />}
            </Campo>
            {!gaia.varTelefone && <p style={{ fontSize: 10.5, color: "var(--atencao)", margin: "6px 0 0", display: "flex", alignItems: "center", gap: 5 }}><Icon name="alert-triangle" size={12} color="var(--atencao)" /> Sem a variável do telefone, o lead não é enviado.</p>}
            <p style={{ fontSize: 10.5, color: "var(--text-dim)", margin: "6px 0 0", lineHeight: 1.4 }}>Use um bloco de <strong>Telefone</strong> no funil e salve a resposta numa variável (ex.: <code>telefone</code>).</p>
          </>
        )}
      </div>
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Ritmo da conversa</div>
        <Campo label={`Velocidade do “digitando…” (${settings.typingMsPorChar}ms/letra)`}>
          <Deslizante min={5} max={80} value={settings.typingMsPorChar} onChange={(v) => onChange({ ...settings, typingMsPorChar: v })} aria-label="Velocidade de digitação" />
        </Campo>
        <Campo label={`Pausa entre balões (${settings.delayEntreBolhas}ms)`}>
          <Deslizante min={0} max={1500} step={50} value={settings.delayEntreBolhas} onChange={(v) => onChange({ ...settings, delayEntreBolhas: v })} aria-label="Pausa entre balões" />
        </Campo>
      </div>
    </div>
  );
}

// ── Painel de CONFIG: metadata (SEO/social), Custom CSS e Custom head ────────
function PainelConfig({ settings, onChange }: { settings: BotSettings; onChange: (s: BotSettings) => void }) {
  const meta = settings.meta ?? {};
  const setMeta = (k: string, v?: string) => onChange({ ...settings, meta: { ...meta, [k]: (v ?? "").trim() || undefined } });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <strong style={{ fontSize: 13.5, color: "var(--text)" }}>Metadata & Código</strong>

      <SecaoIframe settings={settings} onChange={onChange} />

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Retomar conversa</div>
        <LinhaToggle label="Continuar de onde parou" checked={!!settings.retomar} onChange={(v) => onChange({ ...settings, retomar: v || undefined })} />
        <p style={{ fontSize: 10.5, color: "var(--text-dim)", margin: "4px 0 0", lineHeight: 1.4 }}>Guarda o progresso no navegador da pessoa (7 dias). Se ela sair e voltar pelo mesmo link, o bot oferece <strong>“continuar de onde parou”</strong> — sem recomeçar.</p>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>Metadata (link/compartilhamento)</div>
        <p style={{ fontSize: 10.5, color: "var(--text-dim)", margin: "0 0 8px", lineHeight: 1.4 }}>Como o funil aparece na aba do navegador e ao compartilhar o link (WhatsApp, redes).</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Campo label="Título"><input value={meta.titulo ?? ""} onChange={(e) => setMeta("titulo", e.target.value)} placeholder="Ex.: Oferta especial" style={inp} /></Campo>
          <Campo label="Descrição"><textarea value={meta.descricao ?? ""} onChange={(e) => setMeta("descricao", e.target.value)} placeholder="Uma linha que convence a clicar" rows={2} style={inp} /></Campo>
          <Campo label="Ícone (favicon)"><EntradaImagem url={meta.favicon} onChange={(u) => setMeta("favicon", u)} placeholder="ou cole a URL do ícone" /></Campo>
          <Campo label="Imagem de compartilhamento (Open Graph)"><EntradaImagem url={meta.imagem} onChange={(u) => setMeta("imagem", u)} placeholder="ou cole a URL da imagem" /></Campo>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Custom CSS</div>
        <p style={{ fontSize: 10.5, color: "var(--text-dim)", margin: "0 0 8px", lineHeight: 1.4 }}>
          Comece de um estilo pronto e edite à vontade. Classes disponíveis: <code>.tf-container</code>, <code>.tf-header</code>, <code>.tf-chat</code>, <code>.tf-bubble</code> (<code>.tf-bubble-bot</code>/<code>.tf-bubble-user</code>), <code>.tf-choice</code>, <code>.tf-input</code>, <code>.tf-input-field</code>, <code>.tf-send</code>.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {CSS_PRESETS.map((p) => (
            <button key={p.id} type="button"
              onClick={() => {
                const atual = settings.customCss?.trim();
                const novo = atual && !atual.includes(p.css.trim()) ? `${atual}\n\n${p.css}` : p.css;
                onChange({ ...settings, customCss: novo });
              }}
              title={`Aplicar estilo ${p.label} (some ao CSS atual; editável)`}
              style={{ padding: "5px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              + {p.label}
            </button>
          ))}
          {settings.customCss && (
            <Botao variante="perigo" tamanho="sm" onClick={() => onChange({ ...settings, customCss: undefined })}>
              Limpar
            </Botao>
          )}
        </div>
        <textarea value={settings.customCss ?? ""} onChange={(e) => onChange({ ...settings, customCss: e.target.value || undefined })}
          placeholder={".tf-bubble-bot { border-radius: 18px; }\n.tf-choice { text-transform: uppercase; }"}
          rows={7} spellCheck={false} style={{ ...inp, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, lineHeight: 1.5 }} />
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Custom head code</div>
        <p style={{ fontSize: 10.5, color: "var(--text-dim)", margin: "0 0 8px", lineHeight: 1.4 }}>Injetado no <code>&lt;head&gt;</code> do funil publicado — Google Tag Manager, folhas de estilo, fontes ou scripts próprios.</p>
        <textarea value={settings.customHead ?? ""} onChange={(e) => onChange({ ...settings, customHead: e.target.value || undefined })}
          placeholder={"<!-- Google Tag Manager, <link>, <script>… -->"}
          rows={5} spellCheck={false} style={{ ...inp, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, lineHeight: 1.5 }} />
        <p style={{ fontSize: 10, color: "var(--text-dim)", margin: "6px 0 0", lineHeight: 1.4, display: "flex", alignItems: "center", gap: 5 }}><Icon name="alert-triangle" size={11} color="var(--text-dim)" /> O código roda no funil público. Cole só o que você confia.</p>
      </div>
    </div>
  );
}

// ── Painel de STORIES (clicar no avatar) ─────────────────────────────────────
function PainelStories({ settings, onChange, grupos }: { settings: BotSettings; onChange: (s: BotSettings) => void; grupos: { id: string; title: string }[] }) {
  const stories = settings.stories ?? [];
  const setStories = (arr: Story[]) => onChange({ ...settings, stories: arr.length ? arr : undefined });
  const patch = (i: number, p: Partial<Story>) => setStories(stories.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const patchCta = (i: number, p: Partial<NonNullable<Story["cta"]>>) => patch(i, { cta: { label: "", acao: "fechar", ...stories[i].cta, ...p } });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <strong style={{ fontSize: 13.5, color: "var(--text)" }}>Stories no avatar</strong>
      <p style={{ fontSize: 10.5, color: "var(--text-dim)", margin: 0, lineHeight: 1.45 }}>Ao tocar na foto do perfil, abre em tela cheia (até {STORIES_MAX}). Um anel roxo aparece no avatar. O CTA de cada story pode levar direto pra uma etapa do funil.</p>

      {stories.map((s, i) => (
        <div key={s.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "color-mix(in srgb, var(--primary) 16%, transparent)", color: "var(--primary-texto, var(--primary))", fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center" }}>{i + 1}</span>
            <GlassSelect value={s.tipo} onChange={(v) => patch(i, { tipo: v as Story["tipo"] })} style={{ ...inp, flex: 1 }}
              options={[{ value: "imagem", label: "Imagem" }, { value: "video", label: "V\u00eddeo" }, { value: "texto", label: "S\u00f3 texto" }]} />
            <MiniIcone icone="trash" onClick={() => setStories(stories.filter((_, j) => j !== i))} title="Remover" perigo />
          </div>
          {s.tipo === "imagem" && <EntradaImagem url={s.url} onChange={(u) => patch(i, { url: u })} />}
          {s.tipo === "video" && <Campo label="URL do vídeo (mp4)"><input value={s.url ?? ""} onChange={(e) => patch(i, { url: e.target.value })} placeholder="https://…/video.mp4" style={inp} /></Campo>}
          {s.tipo === "texto" && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-dim)" }}>Cor de fundo<CampoCor rotulo="Cor de fundo" valor={s.cor || ""} aoMudar={(v) => patch(i, { cor: v })} tamanho={20} /></div>}
          <Campo label="Título"><input value={s.titulo ?? ""} onChange={(e) => patch(i, { titulo: e.target.value })} placeholder="Ex.: Precisão em cada detalhe" style={inp} /></Campo>
          <Campo label="Descrição"><textarea value={s.descricao ?? ""} onChange={(e) => patch(i, { descricao: e.target.value })} rows={2} placeholder="Uma linha de apoio" style={inp} /></Campo>
          <Campo label={`Duração (${((s.duracaoMs ?? 5000) / 1000).toFixed(1)}s)`}>
            <Deslizante min={2000} max={10000} step={500} value={s.duracaoMs ?? 5000} onChange={(v) => patch(i, { duracaoMs: v })} aria-label="Duração do slide" />
          </Campo>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <Campo label="Botão (CTA) — opcional"><input value={s.cta?.label ?? ""} onChange={(e) => patchCta(i, { label: e.target.value })} placeholder="Ex.: Ver os benefícios" style={inp} /></Campo>
            {s.cta?.label && (
              <>
                <Campo label="Ação do botão">
                  <GlassSelect value={s.cta?.acao ?? "fechar"} onChange={(v) => patchCta(i, { acao: v as NonNullable<Story["cta"]>["acao"], alvo: undefined })} style={inp}
                    options={[
                      { value: "fechar", label: "Fechar os stories" },
                      { value: "ir_para_fluxo", label: "Ir para uma etapa do funil" },
                      { value: "abrir_link", label: "Abrir um link" },
                    ]} />
                </Campo>
                {s.cta?.acao === "ir_para_fluxo" && (
                  <Campo label="Etapa (grupo) do funil">
                    <GlassSelect value={s.cta?.alvo ?? ""} onChange={(v) => patchCta(i, { alvo: v || undefined })} style={inp}
                      options={[{ value: "", label: "\u2014 escolher \u2014" }, ...grupos.map((g) => ({ value: g.id, label: g.title }))]} />
                  </Campo>
                )}
                {s.cta?.acao === "abrir_link" && (
                  <Campo label="Link"><input value={s.cta?.alvo ?? ""} onChange={(e) => patchCta(i, { alvo: e.target.value || undefined })} placeholder="https://…" style={inp} /></Campo>
                )}
              </>
            )}
          </div>
        </div>
      ))}

      {stories.length < STORIES_MAX && (
        <Botao icone="plus" onClick={() => setStories([...stories, novaStory()])}>
          Adicionar story
        </Botao>
      )}
      {stories.length === 0 && <p style={{ fontSize: 11, color: "var(--text-dim)", margin: 0 }}>Sem stories: o avatar fica normal (sem anel).</p>}
    </div>
  );
}

// Botão de enviar imagem (reaproveita /api/upload → URL pública no Storage).
function UploadBtn({ onUrl, compacto }: { onUrl: (url: string) => void; compacto?: boolean }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  async function pick(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.erro("Só imagem."); return; }
    if (f.size > 8 * 1024 * 1024) { toast.erro("Máx. 8 MB."); return; }
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", f); fd.append("bucket", "photos");
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (r.ok && d.url) onUrl(d.url); else toast.erro(d.error || "Falha no upload.");
    } catch { toast.erro("Sem conexão."); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }
  return (
    <>
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      <Botao tamanho={compacto ? "sm" : "md"} icone="upload" onClick={() => ref.current?.click()} carregando={busy}>
        {busy ? "Enviando…" : "Enviar imagem"}
      </Botao>
    </>
  );
}
// Entrada de imagem: preview + botão enviar + campo de URL (as duas formas).
function EntradaImagem({ url, onChange, placeholder = "ou cole a URL da imagem" }: { url?: string; onChange: (u: string) => void; placeholder?: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" style={{ width: 54, height: 54, borderRadius: 10, objectFit: "cover", flex: "none", border: "1px solid var(--border)" }} />
        : <div style={{ width: 54, height: 54, borderRadius: 10, background: "var(--surface-2)", border: "1px dashed var(--border)", display: "grid", placeItems: "center", flex: "none" }}><Icon name="photo" size={22} color="var(--text-dim)" /></div>}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <UploadBtn onUrl={onChange} />
        <input value={url ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inp} />
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)" }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}
function MiniIcone({ icone, onClick, title, perigo }: { icone: string; onClick: () => void; title: string; perigo?: boolean }) {
  return <BotaoIcone icone={icone} titulo={title} variante={perigo ? "perigo" : "secundario"} tamanho="sm" onClick={onClick} />;
}
const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 12.5, resize: "vertical" };
