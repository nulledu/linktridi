"use client";

// ── Visor do criativo: a peça NOSSA e o anúncio NA META, no mesmo lugar ──────
// Abre em folha/modal de onde a pessoa estiver — lista de criativos, ranking do
// Tridify, inteligência de criativos — sem tirá-la da tela.
//
// Duas visões, porque são duas perguntas diferentes:
//   "Biblioteca"  → o arquivo-fonte que o time produziu (Backblaze, privado).
//                   Quem tem marketing:criar sobe peça daqui mesmo.
//   "Na Meta"     → o anúncio como o público vê, pela prévia oficial (iframe
//                   assinado por /api/marketing/preview), achado pelo ad_id ou
//                   pelo CÓDIGO no nome do anúncio.
//
// Sem criativo cadastrado (o nome do anúncio não tem código, ou o código não
// existe no Marketing) só a visão da Meta faz sentido — e a folha diz isso em
// uma frase, em vez de mostrar uma biblioteca vazia como se faltasse arquivo.
//
// Portal pro <body> + travarRolagem: dentro da coluna de conteúdo (overflow) e
// de cards com backdrop-filter o `position: fixed` ancora no bloco errado — a
// armadilha documentada no CLAUDE.md. O ciclo abrir/fechar é próprio: quem
// chama só monta e desmonta.
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "../Icon";
import { BotaoIcone } from "../ui/controles";
import { travarRolagem } from "../ui/travaRolagem";
import { duracaoCss, useAbrirFechar } from "../ui/micro";
import { BibliotecaCriativo } from "./BibliotecaCriativo";
import { VideoCriativo } from "./VideoCriativo";
import type { ArquivoCriativo } from "@/lib/criativos/regras";

export interface AlvoDoVisor {
  /** Código do criativo (JL-041). Sem ele não há biblioteca — só a Meta. */
  codigo: string | null;
  /** id em marketing_criativos, quando o criativo existe. */
  criativoId?: string | null;
  nome?: string | null;
  metaAdId?: string | null;
  videoUrl?: string | null;
  /** Nome cru do anúncio na Meta — aparece no cabeçalho quando não há criativo. */
  nomeAnuncio?: string | null;
}

type Visao = "pecas" | "meta";

export function VisorCriativo({ alvo, podeEditar, onFechar, aoMudarPecas }: {
  alvo: AlvoDoVisor;
  podeEditar: boolean;
  onFechar: () => void;
  aoMudarPecas?: (criativoId: string, arquivos: ArquivoCriativo[]) => void;
}) {
  const temBiblioteca = !!alvo.criativoId && !!alvo.codigo;
  const [visao, setVisao] = useState<Visao>(temBiblioteca ? "pecas" : "meta");
  useEffect(() => { setVisao(temBiblioteca ? "pecas" : "meta"); }, [temBiblioteca, alvo.criativoId]);

  // `t-modal` nasce apagado; a classe do useAbrirFechar acende no quadro
  // seguinte. Fechar é sair da frente: apaga primeiro, desmonta depois.
  const [aberto, setAberto] = useState(false);
  const { montado, classe } = useAbrirFechar(aberto);
  useEffect(() => {
    const q = requestAnimationFrame(() => setAberto(true));
    const solta = travarRolagem();
    return () => { cancelAnimationFrame(q); solta(); };
  }, []);
  const fechar = useCallback(() => {
    setAberto(false);
    setTimeout(onFechar, duracaoCss("--modal-close-dur", 150));
  }, [onFechar]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [fechar]);

  if (!montado || typeof document === "undefined") return null;

  const titulo = alvo.codigo ?? "Anúncio";
  const subtitulo = alvo.nome ?? alvo.nomeAnuncio ?? "";

  return createPortal(
    <div className={`apple-backdrop ${classe}`.trim()} onClick={fechar} data-nozoom
      style={{ position: "fixed", inset: 0, zIndex: "var(--z-modal, 1300)" as unknown as number, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", padding: 16 }}>
      <div className={`apple-modal glass glass-spec t-modal ${classe}`.trim()} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label={`Criativo ${titulo}`}
        style={{ width: "min(640px, 100%)", maxHeight: "88dvh", overflowY: "auto", borderRadius: 22, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="stat" style={{ fontSize: 20, color: "var(--azul)", flex: "none" }}>{titulo}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={subtitulo}>{subtitulo}</span>
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={fechar} style={{ flex: "none" }} />
        </div>

        {/* Abas: duas, sempre visíveis; a desativada explica por quê. */}
        <div role="tablist" className="tab-strip" style={{ display: "flex", gap: 6 }}>
          <Aba ativa={visao === "pecas"} onClick={() => setVisao("pecas")} icone="photo" desativada={!temBiblioteca}
            titulo={temBiblioteca ? undefined : "Este anúncio não está ligado a um criativo cadastrado"}>
            Biblioteca
          </Aba>
          <Aba ativa={visao === "meta"} onClick={() => setVisao("meta")} icone="brand-meta">Na Meta</Aba>
        </div>

        {visao === "pecas" && temBiblioteca ? (
          <BibliotecaCriativo
            criativoId={alvo.criativoId!}
            codigo={alvo.codigo!}
            podeEditar={podeEditar}
            compacta
            aoMudar={aoMudarPecas ? (lista) => aoMudarPecas(alvo.criativoId!, lista) : undefined}
          />
        ) : (
          <>
            {!temBiblioteca && (
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.45 }}>
                {alvo.codigo
                  ? <>O código <b>{alvo.codigo}</b> não existe no Marketing. Cadastre o criativo lá e a peça aparece aqui.</>
                  : <>O nome deste anúncio não tem código de criativo (JL-041, VG-012…). Ponha o código no nome na Meta e ele passa a ligar com a biblioteca.</>}
              </p>
            )}
            <VideoCriativo codigo={alvo.codigo ?? ""} metaAdId={alvo.metaAdId} videoUrl={alvo.videoUrl} aberto altura={520} />
          </>
        )}

        {alvo.criativoId && (
          <Link href={`/marketing/criativo/${alvo.criativoId}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: "var(--tap)", color: "var(--primary-texto, var(--primary))", fontWeight: 700, fontSize: 13.5, textDecoration: "none" }}>
            Abrir o criativo <Icon name="chevron-right" size={15} color="var(--primary-texto)" />
          </Link>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Aba({ ativa, desativada, onClick, icone, titulo, children }: {
  ativa: boolean; desativada?: boolean; onClick: () => void; icone: string; titulo?: string; children: React.ReactNode;
}) {
  return (
    <button role="tab" aria-selected={ativa} disabled={desativada} title={titulo} onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, minHeight: "var(--tap)", padding: "0 14px", borderRadius: 999,
        border: `1px solid ${ativa ? "var(--azul)" : "var(--border)"}`,
        background: ativa ? "color-mix(in srgb, var(--azul) 12%, transparent)" : "transparent",
        color: desativada ? "var(--text-dim)" : "var(--text)", fontWeight: 700, fontSize: 13, cursor: desativada ? "not-allowed" : "pointer",
        opacity: desativada ? 0.55 : 1, whiteSpace: "nowrap",
      }}>
      <Icon name={icone} size={15} color={ativa ? "var(--azul)" : "var(--text-dim)"} />
      {children}
    </button>
  );
}
