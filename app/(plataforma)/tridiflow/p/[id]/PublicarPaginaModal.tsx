"use client";

// Publicar PÁGINA: escolhe domínio + caminho, confere se o endereço está livre
// (contra fluxos E páginas), mostra a URL final e publica.
// Usa o MESMO cadastro de domínios do TridiFlow (tridiflow_dominios) — não
// existe segundo cadastro de domínio em lugar nenhum.

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../Icon";
import { toast } from "../../../Toast";
import type { PaginaDoc } from "@/lib/tridiflow-pagina";
import { avisos, erros, paginaVazia, revisarPagina, type Problema } from "@/lib/tridiflow-pagina-revisao";
import { GlassSelect } from "../../../GlassPicker";
import { SecaoIframe } from "../../_shared/SecaoIframe";
import { iframePublicado, type BotSettings } from "@/lib/tridiflow";

interface Dom { id: string; host: string }
type Estado = "checando" | "livre" | "ocupado" | "vazio";

export function PublicarPaginaModal({
  paginaId, doc, onIrParaBloco, dominioPadrao, dominios, dominioId, setDominioId, slug, setSlug,
  settings, onSettings, publicado, publicando, onPublicar, onDespublicar, onFechar,
}: {
  paginaId: string;
  /** Documento atual — a revisão roda em cima do que está na tela. */
  doc: PaginaDoc;
  /** Leva a pessoa até o bloco com problema (fecha o modal e seleciona). */
  onIrParaBloco: (blocoId: string) => void;
  dominioPadrao: string;
  dominios: Dom[];
  dominioId: string | null;
  setDominioId: (v: string | null) => void;
  slug: string;
  setSlug: (v: string) => void;
  /** Seção "Publicar como iframe" — liga a página externa por cima da página. */
  settings: BotSettings; onSettings: (s: BotSettings) => void;
  publicado: boolean;
  publicando: boolean;
  onPublicar: () => void;
  onDespublicar: () => void;
  onFechar: () => void;
}) {
  const [estado, setEstado] = useState<Estado>("livre");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const host = dominios.find((d) => d.id === dominioId)?.host || dominioPadrao;
  const caminho = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const link = `https://${host}/p/${caminho}`;

  // Checa disponibilidade com atraso — não bate na API a cada tecla.
  useEffect(() => {
    if (!caminho) { setEstado("vazio"); return; }
    setEstado("checando");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/tridiflow/bots", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "checarCaminho", slug: caminho, dominioId, id: paginaId }),
        });
        const d = await r.json();
        setEstado(d.livre ? "livre" : "ocupado");
      } catch { setEstado("livre"); }   // rede ruim não deve travar o publicar
    }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [caminho, dominioId, paginaId]);

  const copiar = () => { navigator.clipboard.writeText(link); toast.ok("Link copiado."); };

  // Revisão do conteúdo — roda em cima do doc que está na tela, sem ir ao
  // servidor. Erro trava a publicação; aviso só alerta.
  const problemas = useMemo(() => revisarPagina(doc), [doc]);
  const vazia = useMemo(() => paginaVazia(doc), [doc]);
  const impeditivos = erros(problemas);
  const alertas = avisos(problemas);
  // Com o iframe ligado o conteúdo dos blocos nem renderiza — a revisão (e a
  // trava de página vazia) não pode segurar a publicação.
  const iframeLigado = !!iframePublicado(settings);
  const podePublicar = estado === "livre" && !!caminho && !publicando
    && (iframeLigado || (!vazia && impeditivos.length === 0));

  return (
    // `--z-modal` (1300): o painel do GlassSelect é portado pro <body> em
    // `--z-pop` (1400) — com o véu em 5000 a lista de domínios abria ATRÁS dele.
    <div onClick={onFechar} className="sheet-host" style={{
      position: "fixed", inset: 0, zIndex: "var(--z-modal, 1300)", background: "rgba(16,24,40,.55)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6dvh 16px", overflowY: "auto",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="tf-workspace sheet" style={{
        width: "min(560px, 100%)", background: "var(--surface)", borderRadius: 18,
        border: "1px solid var(--border)", boxShadow: "0 24px 70px rgba(16,24,40,.35)", overflow: "hidden", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>Publicar página</div>
            <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Escolha onde ela vai ficar no ar.</div>
          </div>
          <button aria-label="Fechar" onClick={onFechar} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
            <Icon name="x" size={20} color="var(--text-dim)" />
          </button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 6 }}>Endereço</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <GlassSelect value={dominioId ?? ""} onChange={(v) => setDominioId(v || null)}
                style={{ width: "auto", minWidth: 170 }}
                options={[{ value: "", label: dominioPadrao }, ...dominios.map((d) => ({ value: d.id, label: d.host }))]} />
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}>/p/</span>
              <input
                value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="minha-oferta"
                style={{
                  flex: 1, minWidth: 160, background: "var(--surface-2)", borderRadius: 10, padding: "9px 11px",
                  color: "var(--text)", fontSize: 13, outline: "none",
                  border: `1px solid ${estado === "ocupado" ? "var(--tf-neg, var(--perigo))" : "var(--border)"}`,
                }}
              />
            </div>
            <Aviso estado={estado} />
          </div>

          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 6 }}>Link final</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{
                flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10,
                padding: "10px 12px", color: "var(--text)", fontSize: 13, outline: "none",
              }} />
              <button onClick={copiar} style={btnSec}>Copiar</button>
            </div>
            {!dominios.length && (
              <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "8px 0 0", lineHeight: 1.45 }}>
                Para usar um domínio próprio, cadastre em Configurações › Domínios — é o mesmo cadastro dos fluxos.
              </p>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <SecaoIframe settings={settings} onChange={onSettings} />
          </div>

          {/* Revisão do conteúdo — o que só apareceria depois de no ar. Com o
              iframe ligado os blocos não renderizam, então ela sai de cena. */}
          {!iframeLigado && <Revisao
            vazia={vazia}
            impeditivos={impeditivos}
            alertas={alertas}
            onIr={(id) => { onFechar(); onIrParaBloco(id); }}
          />}

          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
            <a href={`/p/${caminho}`} target="_blank" rel="noreferrer" style={{ ...btnSec, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Icon name="eye" size={14} color="var(--text-dim)" /> Ver prévia
            </a>
            <span style={{ flex: 1 }} />
            {publicado && (
              <button onClick={onDespublicar} disabled={publicando} style={{ ...btnSec, color: "var(--tf-neg, var(--perigo))" }}>
                Despublicar
              </button>
            )}
            <button
              onClick={onPublicar} disabled={!podePublicar}
              style={{
                padding: "11px 20px", borderRadius: 11, border: "none", fontSize: 13.5, fontWeight: 800,
                background: podePublicar ? "var(--tf-accent, var(--primary))" : "var(--surface-2)",
                color: podePublicar ? "#fff" : "var(--text-dim)",
                cursor: podePublicar ? "pointer" : "not-allowed",
              }}
            >{publicando ? "Publicando…" : publicado ? "Atualizar publicação" : "Publicar"}</button>
          </div>

          {publicado && (
            <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0, lineHeight: 1.45 }}>
              A versão no ar é a última publicada. Editar aqui não muda a página do anúncio até você
              publicar de novo.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Revisão do conteúdo antes de publicar. Cada item leva ao bloco que precisa de
// conserto — mostrar o problema sem levar até ele deixa a pessoa caçando.
function Revisao({ vazia, impeditivos, alertas, onIr }: {
  vazia: boolean; impeditivos: Problema[]; alertas: Problema[]; onIr: (blocoId: string) => void;
}) {
  if (vazia) {
    return (
      <Painel cor="var(--tf-neg, var(--perigo))" icone="alert-triangle" titulo="A página está vazia">
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.45 }}>
          Adicione ao menos um bloco antes de publicar.
        </p>
      </Painel>
    );
  }
  if (!impeditivos.length && !alertas.length) {
    return (
      <Painel cor="var(--tf-pos, var(--ok))" icone="check" titulo="Tudo certo para publicar">
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.45 }}>
          Botões, vídeos e formulários estão com destino definido.
        </p>
      </Painel>
    );
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {impeditivos.length > 0 && (
        <Painel
          cor="var(--tf-neg, var(--perigo))" icone="alert-triangle"
          titulo={impeditivos.length === 1 ? "1 item impede a publicação" : `${impeditivos.length} itens impedem a publicação`}
        >
          <ListaProblemas itens={impeditivos} onIr={onIr} />
        </Painel>
      )}
      {alertas.length > 0 && (
        <Painel
          cor="var(--tf-warn, var(--atencao))" icone="alert-triangle"
          titulo={alertas.length === 1 ? "1 ponto de atenção" : `${alertas.length} pontos de atenção`}
        >
          <ListaProblemas itens={alertas} onIr={onIr} />
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--text-dim)" }}>
            Isso não impede publicar — só provavelmente não é o que você queria.
          </p>
        </Painel>
      )}
    </div>
  );
}

function ListaProblemas({ itens, onIr }: { itens: Problema[]; onIr: (blocoId: string) => void }) {
  return (
    <div style={{ display: "grid", gap: 7 }}>
      {itens.map((p, i) => (
        <div key={`${p.blocoId}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.4 }}>
              <b style={{ fontWeight: 700 }}>{p.bloco}:</b> {p.texto}
            </div>
            {p.comoResolver && (
              <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 1, lineHeight: 1.4 }}>{p.comoResolver}</div>
            )}
          </div>
          <button
            onClick={() => onIr(p.blocoId)} type="button"
            style={{
              flex: "none", padding: "5px 10px", borderRadius: 8, cursor: "pointer",
              border: "1px solid var(--border)", background: "var(--surface-2)",
              fontSize: 11.5, fontWeight: 700, color: "var(--text)",
            }}
          >
            Corrigir
          </button>
        </div>
      ))}
    </div>
  );
}

function Painel({ cor, icone, titulo, children }: {
  cor: string; icone: string; titulo: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 12,
      background: `color-mix(in srgb, ${cor} 8%, transparent)`,
      border: `1px solid color-mix(in srgb, ${cor} 28%, transparent)`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: children ? 8 : 0 }}>
        <Icon name={icone} size={15} color={cor} />
        <strong style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)" }}>{titulo}</strong>
      </div>
      {children}
    </div>
  );
}

function Aviso({ estado }: { estado: Estado }) {
  if (estado === "checando") return <Linha cor="var(--text-dim)" icone="loader" texto="Conferindo se o endereço está livre…" />;
  if (estado === "ocupado") return <Linha cor="var(--tf-neg, var(--perigo))" icone="alert-triangle" texto="Esse endereço já é usado por outro projeto. Escolha outro." />;
  if (estado === "vazio") return <Linha cor="var(--tf-neg, var(--perigo))" icone="alert-triangle" texto="Defina um caminho para a página." />;
  return <Linha cor="var(--tf-pos, var(--ok))" icone="check" texto="Endereço disponível." />;
}

function Linha({ cor, icone, texto }: { cor: string; icone: string; texto: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 7, fontSize: 11.5, color: cor }}>
      <Icon name={icone} size={13} color={cor} /> {texto}
    </span>
  );
}

const btnSec: React.CSSProperties = {
  padding: "10px 15px", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--text)", fontSize: 13, fontWeight: 700, cursor: "pointer",
};
