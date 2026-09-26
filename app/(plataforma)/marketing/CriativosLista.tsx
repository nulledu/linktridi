"use client";

// ── Marketing · Geral · Controle de Criativos ────────────────────────────────
// Busca (código, nome, produto, editor, campanha) + filtros rápidos + três
// formas de ver a mesma lista: cards, lista compacta e tabela. A filtragem
// acontece no SERVIDOR (a consulta já sai limitada) — a tela não baixa tudo
// pra filtrar no navegador.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { Botao, BotaoIcone } from "../ui/controles";
import { GlassSelect } from "../GlassPicker";
import { DataList, type Coluna } from "../ui/DataList";
import { Abas } from "../ui/Abas";
import { Fila } from "../ui/micro";
import { VisorCriativo } from "./VisorCriativo";
import { BotaoCopiar, ImagemQueChega } from "./pecasVisuais";
import { MESES, nomeAutomatico, type Criativo, type ProdutoCriativo } from "@/lib/marketing-criativos-const";
import type { ArquivoCriativo } from "@/lib/criativos/regras";
import type { Editor } from "./MarketingClient";

type Vista = "cards" | "lista" | "tabela";
type Periodo = "" | "hoje" | "semana" | "mes";

const VISTAS: { key: Vista; label: string; icon: string }[] = [
  { key: "cards", label: "Cards", icon: "layout-grid" },
  { key: "lista", label: "Lista", icon: "layout-rows" },
  { key: "tabela", label: "Tabela", icon: "table" },
];

const BR = 3 * 3600 * 1000;
const diaBR = (t = Date.now()) => new Date(t - BR).toISOString().slice(0, 10);
const somaDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function janelaDe(p: Periodo): { de?: string; ate?: string } {
  if (!p) return {};
  const hoje = diaBR();
  if (p === "hoje") return { de: hoje, ate: hoje };
  if (p === "mes") return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
  const dow = (new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7;   // 0 = segunda
  return { de: somaDias(hoje, -dow), ate: hoje };
}

/** Capa (peça principal) de cada criativo, por id. Vem junto da listagem. */
export type Capas = Record<string, ArquivoCriativo>;

export function CriativosLista({ criativos, capas, estreias = {}, editores, produtos, recarregar, podeCriar, onNovo }: {
  criativos: Criativo[] | null;
  capas: Capas;
  /** Primeiro dia na Meta (YYYY-MM-DD) por id. Ausente = ainda não rodou. */
  estreias?: Record<string, string>;
  editores: Editor[];
  produtos: ProdutoCriativo[];
  recarregar: (qs?: string) => Promise<void>;
  podeCriar: boolean;
  onNovo: () => void;
}) {
  const [vista, setVista] = useState<Vista>("cards");
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("");
  const [prefixo, setPrefixo] = useState("");
  const [produto, setProduto] = useState("");
  const [editorId, setEditorId] = useState("");
  const [vendo, setVendo] = useState<Criativo | null>(null);
  // Capa mudada pelo visor (peça enviada/apagada ali) sem recarregar a lista.
  // `null` = o criativo ficou sem peça. Sobrepõe o que veio do servidor.
  const [capasLocais, setCapasLocais] = useState<Record<string, ArquivoCriativo | null>>({});
  const capasVivas = useMemo<Capas>(() => {
    const m: Capas = { ...capas };
    for (const [id, a] of Object.entries(capasLocais)) { if (a) m[id] = a; else delete m[id]; }
    return m;
  }, [capas, capasLocais]);
  const primeira = useRef(true);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (busca.trim()) p.set("busca", busca.trim());
    if (prefixo) p.set("prefixo", prefixo);
    if (produto) p.set("produto", produto);
    if (editorId) p.set("editorId", editorId);
    const j = janelaDe(periodo);
    if (j.de) p.set("de", j.de);
    if (j.ate) p.set("ate", j.ate);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [busca, prefixo, produto, editorId, periodo]);

  // Digitar não dispara uma busca por tecla: espera 300 ms de silêncio.
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    const t = setTimeout(() => { void recarregar(qs); }, 300);
    return () => clearTimeout(t);
  }, [qs, recarregar]);

  const limpar = () => { setBusca(""); setPeriodo(""); setPrefixo(""); setProduto(""); setEditorId(""); };
  const temFiltro = !!(busca || periodo || prefixo || produto || editorId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Busca + vistas */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ flex: 1, minWidth: 200, position: "relative", display: "flex", alignItems: "center" }}>
          <span style={{ position: "absolute", left: 12, display: "flex", pointerEvents: "none" }}>
            <Icon name="search" size={16} color="var(--text-dim)" />
          </span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome (SET 01), produto ou editor"
            style={{ width: "100%", minHeight: "var(--tap)", paddingLeft: 36, fontSize: 14 }} />
        </label>
        {/* Kinetics 005 · a pílula desliza até a vista escolhida (`Abas`). */}
        <Abas
          className="mk-vistas"
          ariaLabel="Forma de ver"
          valor={vista}
          onMuda={setVista}
          itens={VISTAS.map((v) => ({
            valor: v.key,
            rotulo: <><Icon name={v.icon} size={17} color={vista === v.key ? "var(--primary-texto)" : "var(--text-dim)"} /><span className="mk-sr">{v.label}</span></>,
          }))}
        />
      </div>

      {/* Filtros rápidos — rolam de lado no celular */}
      <div className="tab-strip" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {produtos.map((p) => (
          <Chip key={p.nome} ativo={produto === p.nome} onClick={() => setProduto(produto === p.nome ? "" : p.nome)} label={p.nome} />
        ))}
        <Divisor />
        <GlassSelect value={prefixo} onChange={setPrefixo} title="Filtrar por mês"
          style={{ minHeight: "var(--tap)", fontSize: 13, maxWidth: 170 }}
          options={[{ value: "", label: "Todos os meses" }, ...MESES.map((m) => ({ value: m.sigla, label: `${m.sigla} · ${m.nome}` }))]} />
        <GlassSelect value={editorId} onChange={setEditorId} title="Filtrar por editor"
          style={{ minHeight: "var(--tap)", fontSize: 13, maxWidth: 200 }}
          options={[{ value: "", label: "Todos os editores" }, ...editores.map((e) => ({ value: e.id, label: e.nome }))]} />
        <Divisor />
        <Chip ativo={periodo === "semana"} onClick={() => setPeriodo(periodo === "semana" ? "" : "semana")} label="Subidos esta semana" />
        {temFiltro && (
          <Botao variante="sutil" icone="x" onClick={limpar} style={{ flex: "none" }}>Limpar</Botao>
        )}
      </div>

      {/* A espera tem o formato do cartão (capa 4:5 + texto): a grade não pula
          quando os dados chegam. */}
      {criativos === null
        ? <div className="mk-grade" aria-hidden>
            {[0, 1, 2, 3].map((i) => <span key={i} className="mk-card-esq skeleton" />)}
          </div>
        : criativos.length === 0
          ? <Vazio temFiltro={temFiltro} podeCriar={podeCriar} onNovo={onNovo} onLimpar={limpar} />
          : vista === "cards" ? <Cards itens={criativos} capas={capasVivas} estreias={estreias} onVer={setVendo} />
          : vista === "lista" ? <Lista itens={criativos} onVer={setVendo} />
          : <Tabela itens={criativos} />}

      {/* O visor cuida do próprio abrir/fechar (portal + animação): aqui é só
          montar e desmontar. */}
      {vendo && (
        <ModalVideo c={vendo} podeEditar={podeCriar} onFechar={() => setVendo(null)}
          aoMudarPecas={(id, lista) => setCapasLocais((m) => ({ ...m, [id]: lista.find((a) => a.principal) ?? lista[0] ?? null }))} />
      )}

      {criativos && criativos.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--text-dim)" }}>
          {criativos.length} criativo{criativos.length > 1 ? "s" : ""} · clique para ver o detalhe e o histórico.
        </p>
      )}
    </div>
  );
}

function Cards({ itens, capas, estreias, onVer }: { itens: Criativo[]; capas: Capas; estreias: Record<string, string>; onVer: (c: Criativo) => void }) {
  return (
    // Kinetics 054 · os cartões chegam escalonados (`Fila`). A CÉLULA é quem
    // entra — a entrada termina em `transform: none` preso — e o cartão dentro
    // dela fica livre pra subir no ponteiro (Kinetics 127). Superfície sólida,
    // não `.glass`: vidro não recebe transform.
    <Fila className="mk-grade">
      {itens.map((c) => (
        // O card NÃO é um <Link> inteiro de propósito: o botão de play precisa
        // ser clicável por si, e botão dentro de link é HTML inválido.
        <div key={c.id} className="mk-cel">
          <div className="mk-card">
            <Capa a={capas[c.id]} c={c} />
            <div style={{ padding: "0 4px", display: "flex", flexDirection: "column", gap: 6 }}>
              <Titulo c={c} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <Pill texto={c.editorNome || "Sem editor"} icon="user" />
                {c.produto && <Pill texto={c.produto} icon="package" />}
              </div>
            </div>
            <div className="mk-card-pe">
              {/* As duas datas saem sozinhas: o dia em que subiu aqui e o primeiro
                  dia em que um anúncio com esse nome rodou na Meta. */}
              <span className="mk-card-datas">
                Subiu {diaMes(c.dataCriacao)}
                <br />
                {estreias[c.id] ? <>Na Meta {diaMes(estreias[c.id])}</> : "Ainda não rodou"}
              </span>
              {/* O nome É o que vai no anúncio da Meta — copiar evita digitar. */}
              <BotaoCopiar texto={c.nome} rotulo={`Copiar o nome ${c.nome}`} copiado="Nome copiado" compacto />
              <BotaoVideo c={c} onVer={onVer} />
            </div>
          </div>
        </div>
      ))}
    </Fila>
  );
}

/** Nome como título. Criativo antigo (nome escrito à mão) mostra o código antes. */
function Titulo({ c }: { c: Criativo }) {
  return (
    <Link href={`/marketing/criativo/${c.id}`}
      style={{ textDecoration: "none", color: "inherit", fontSize: 14.5, fontWeight: 800, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" }}>
      {!nomeAutomatico(c) && <span style={{ color: "var(--azul)" }}>{c.codigo} · </span>}
      {c.nome}
    </Link>
  );
}

/**
 * A miniatura da peça, em moldura de feed (4:5) — é uma biblioteca: a peça é o
 * que se procura com os olhos. Sem peça, a moldura mostra o mês e o número em
 * tipo grande (não "sem imagem"): o criativo existe, só não teve arquivo.
 */
function Capa({ a, c }: { a?: ArquivoCriativo; c: Criativo }) {
  return (
    <Link href={`/marketing/criativo/${c.id}`} aria-label={`Abrir ${c.nome || c.codigo}`} className="mk-capa">
      {!a ? (
        <span aria-hidden className="stat mk-capa-sem">
          {nomeAutomatico(c) ? `${c.prefixo} ${String(c.numero).padStart(2, "0")}` : c.codigo}
        </span>
      ) : a.tipo === "video"
        ? <video src={`${a.url}#t=0.1`} preload="metadata" muted playsInline />
        // Kinetics 074 · a espera vira a peça com desfoque cruzado, sem piscar.
        : <ImagemQueChega src={a.url} />}
      {a?.tipo === "video" && (
        <span aria-hidden className="mk-capa-play">
          <Icon name="player-play" size={22} color="#fff" />
        </span>
      )}
    </Link>
  );
}

/** Abre o vídeo do criativo sem sair da lista. */
function BotaoVideo({ c, onVer }: { c: Criativo; onVer: (c: Criativo) => void }) {
  return (
    <Botao icone="player-play" onClick={() => onVer(c)} title="Ver o vídeo" aria-label={`Ver o vídeo de ${c.codigo}`} style={{ flex: "none" }}>Vídeo</Botao>
  );
}

function Lista({ itens, onVer }: { itens: Criativo[]; onVer: (c: Criativo) => void }) {
  return (
    // As linhas chegam escalonadas; quem anima é a linha, nunca o vidro.
    <Fila className="glass glass-spec" style={{ borderRadius: 16, overflow: "hidden" }}>
      {itens.map((c, i) => (
        <div key={c.id} className="mt-linha"
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i ? "1px solid var(--border)" : "none" }}>
          <BotaoIcone icone="player-play" titulo={`Ver o vídeo de ${c.codigo}`} variante="secundario" onClick={() => onVer(c)} style={{ flex: "none" }} />
          <Link href={`/marketing/criativo/${c.id}`}
            style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", textDecoration: "none", color: "inherit" }}>
            {!nomeAutomatico(c) && <span className="stat" style={{ fontSize: 15, color: "var(--azul)", flex: "none", minWidth: 66 }}>{c.codigo}</span>}
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</span>
            <span className="desk-only" style={{ flex: "none", fontSize: 12.5, color: "var(--text-dim)", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.editorNome || "—"}</span>
            <Icon name="chevron-right" size={16} color="var(--text-dim)" />
          </Link>
        </div>
      ))}
    </Fila>
  );
}

/**
 * O criativo em folha/modal — sem tirar a pessoa da lista. Duas visões: a peça
 * NOSSA (biblioteca, onde quem cria também sobe arquivo) e o anúncio NA META.
 * `aoMudarPecas` devolve a lista pra capa do card acompanhar sem recarregar.
 */
function ModalVideo({ c, podeEditar, onFechar, aoMudarPecas }: {
  c: Criativo; podeEditar: boolean; onFechar: () => void;
  aoMudarPecas: (criativoId: string, arquivos: ArquivoCriativo[]) => void;
}) {
  return (
    <VisorCriativo
      alvo={{ codigo: c.codigo, criativoId: c.id, nome: c.nome, metaAdId: c.metaAdId, videoUrl: c.videoUrl }}
      podeEditar={podeEditar}
      onFechar={onFechar}
      aoMudarPecas={aoMudarPecas}
    />
  );
}

const COLUNAS_CRIATIVO: Coluna<Criativo>[] = [
  {
    // O código é LINK: quem quer abrir em outra aba (cmd+clique) continua
    // podendo. O clique na linha inteira faz o mesmo caminho pelo `onAbrir`.
    chave: "codigo", titulo: "Código", ordenar: (c) => c.codigo,
    render: (c) => (
      <Link href={`/marketing/criativo/${c.id}`} style={{ color: "var(--azul)", fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap" }}>{c.codigo}</Link>
    ),
  },
  { chave: "nome", titulo: "Nome", papel: "titulo", ordenar: (c) => c.nome, render: (c) => <span style={{ fontWeight: 600 }}>{c.nome}</span> },
  { chave: "editor", titulo: "Editor", ordenar: (c) => c.editorNome || null, render: (c) => c.editorNome || "—" },
  { chave: "produto", titulo: "Produto", ordenar: (c) => c.produto || null, render: (c) => c.produto || "—" },
  {
    // Ordena pelo ISO, não pelo "14/09/2026" — texto dd/mm ordena pelo dia.
    chave: "subido", titulo: "Subido em", ordenar: (c) => c.dataCriacao || null,
    render: (c) => <span style={{ whiteSpace: "nowrap" }}>{dataBR(c.dataCriacao)}</span>,
  },
];

function Tabela({ itens }: { itens: Criativo[] }) {
  // Desktop: tabela. Celular: cada criativo vira um card (o `DataList` decide)
  // — sete colunas em rolagem lateral obrigavam a arrastar pra ler uma peça.
  const router = useRouter();
  return (
    <DataList itens={itens} colunas={COLUNAS_CRIATIVO} chaveDe={(c) => c.id}
      onAbrir={(c) => router.push(`/marketing/criativo/${c.id}`)}
      rotulo="Criativos" minWidth={560} />
  );
}

export function Pill({ texto, cor, icon }: { texto: string; cor?: string; icon?: string }) {
  const c = cor || "var(--text-dim)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 999, background: "var(--surface-2)", fontSize: 11.5, fontWeight: 700, color: c, whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
      {icon && <Icon name={icon} size={12} color={c} />}{texto}
    </span>
  );
}

/** Kinetics 018 · filtro que liga com um pulinho (a cor vem do tema, não de #fff). */
function Chip({ label, ativo, onClick, icon }: { label: string; ativo: boolean; onClick: () => void; icon?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} className="mk-chip">
      {icon && <Icon name={icon} size={14} />}{label}
    </button>
  );
}

const Divisor = () => <span className="mk-divisor" aria-hidden />;

function Vazio({ temFiltro, podeCriar, onNovo, onLimpar }: { temFiltro: boolean; podeCriar: boolean; onNovo: () => void; onLimpar: () => void }) {
  return (
    <div className="glass glass-spec" style={{ borderRadius: 18, padding: "40px 20px", textAlign: "center" }}>
      <Icon name={temFiltro ? "search" : "video"} size={28} color="var(--text-dim)" />
      <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>
        {temFiltro ? "Nenhum criativo com esses filtros" : "A biblioteca está vazia"}
      </h3>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>
        {temFiltro ? "Ajuste a busca ou limpe os filtros." : "Suba o primeiro: escolha o mês, o número e o produto, e o nome sai sozinho."}
      </p>
      <div style={{ marginTop: 14 }}>
        {temFiltro
          ? <Botao onClick={onLimpar}>Limpar filtros</Botao>
          : podeCriar && <Botao variante="primario" onClick={onNovo}>Subir criativo</Botao>}
      </div>
    </div>
  );
}

/** "2026-09-14" → "14/09" no ano corrente, "14/09/25" fora dele. */
const diaMes = (iso: string) => !iso ? "—"
  : iso.slice(0, 4) === String(new Date().getFullYear()) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

export const dataBR = (iso: string) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "—");
