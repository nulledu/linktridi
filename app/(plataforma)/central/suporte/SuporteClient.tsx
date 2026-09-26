"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../../Icon";
import { Botao, BotaoIcone } from "../../ui/controles";
import { useAbrirFechar } from "../../ui/micro";
import { GlassSelect } from "../../GlassPicker";
import { buscarFaq, LIMIAR_CONFIANCA } from "@/lib/central-faq";
import { TIPOS_CHAMADO } from "@/lib/central";

interface Bolha { de: "user" | "ia"; texto: string; links?: { label: string; href: string }[]; semResposta?: boolean; perguntaOrigem?: string }
interface Chamado { id: string; tipo: string; titulo: string; descricao: string | null; status: string; created_at: string }

const SUGESTOES = ["Como encontro um pedido?", "Como peço peças pra produção?", "Como vejo o estoque?", "Quais são minhas tarefas?", "Como funciona o tráfego e o ROAS?"];
const CHAMADO_COR: Record<string, string> = { aberto: "var(--atencao)", fechado: "var(--ok)" };

export function SuporteClient({ perguntaInicial }: { perguntaInicial: string }) {
  const [tab, setTab] = useState<"assistente" | "chamados">("assistente");
  const [bolhas, setBolhas] = useState<Bolha[]>([{ de: "ia", texto: "Oi! Sou o assistente da Central. Me pergunta como fazer algo no sistema — ex: \"como encontro um pedido?\". Se eu não souber, te ajudo a abrir um chamado." }]);
  const [texto, setTexto] = useState("");
  const [digitando, setDigitando] = useState(false);
  const [chamado, setChamado] = useState<{ pergunta: string } | null>(null);
  // O card fica desenhado enquanto a saída roda: `chamado` vira null no mesmo
  // quadro do clique, então sem guardar o último pedido não há o que animar.
  const ultimoChamado = useRef<{ pergunta: string } | null>(null);
  if (chamado) ultimoChamado.current = chamado;
  const chamadoVivo = useAbrirFechar(!!chamado, "--modal-close-dur");
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const fimRef = useRef<HTMLDivElement>(null);
  const iniciado = useRef(false);

  function responder(pergunta: string) {
    const q = pergunta.trim(); if (!q) return;
    setBolhas((b) => [...b, { de: "user", texto: q }]);
    setTexto(""); setDigitando(true);
    const match = buscarFaq(q);
    setTimeout(() => {
      setDigitando(false);
      if (match && match.score >= LIMIAR_CONFIANCA) {
        setBolhas((b) => [...b, { de: "ia", texto: match.item.resposta, links: match.item.links }]);
      } else {
        setBolhas((b) => [...b, { de: "ia", texto: "Hmm, não tenho certeza sobre isso. Posso não ter essa resposta ainda — quer abrir um chamado pra equipe te ajudar?", semResposta: true, perguntaOrigem: q }]);
      }
    }, 480);
  }

  function carregarChamados() { fetch("/api/central/chamados").then((r) => r.json()).then((d) => setChamados(d.chamados ?? [])).catch(() => {}); }
  useEffect(() => { carregarChamados(); }, []);
  useEffect(() => { if (!iniciado.current && perguntaInicial.trim()) { iniciado.current = true; responder(perguntaInicial); } /* eslint-disable-next-line */ }, []);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [bolhas, digitando]);

  const abertos = chamados.filter((c) => c.status === "aberto").length;

  return (
    // minHeight fixo de 480px estourava a tela em aparelho baixo (iPhone SE tem
    // ~400px úteis aqui) e empurrava o campo de escrever pra debaixo da barra.
    <div className="glass" style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 170px)", minHeight: "min(480px, 100dvh - 200px)", borderRadius: "var(--r-lg)", overflow: "hidden", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ width: 32, height: 32, borderRadius: "var(--r-sm)", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--roxo) 20%, transparent)" }}><Icon name="sparkles" size={18} color="var(--roxo)" /></span>
        <div style={{ fontWeight: 600, fontSize: 15, flex: 1, minWidth: 0 }}>Suporte</div>
        {/* .tab-strip: o segmentado rola de lado quando não cabe (320px). */}
        <div className="tab-strip" style={{ display: "inline-flex", gap: 3, padding: 3, borderRadius: "var(--r-sm)", background: "var(--surface-2)" }}>
          <SegBtn on={tab === "assistente"} onClick={() => setTab("assistente")}>Assistente</SegBtn>
          <SegBtn on={tab === "chamados"} onClick={() => { setTab("chamados"); carregarChamados(); }}>Meus chamados{abertos > 0 ? ` · ${abertos}` : ""}</SegBtn>
        </div>
      </div>

      {tab === "assistente" ? (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            {bolhas.map((b, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: b.de === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "82%", padding: "11px 15px", borderRadius: "var(--r-md)", fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap", background: b.de === "user" ? "var(--primary-acao, var(--primary))" : "var(--surface-2)", color: b.de === "user" ? "var(--on-primary, #fff)" : "var(--text)" }}>
                  {b.texto}
                  {b.links && b.links.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {b.links.map((l) => <Link key={l.href} href={l.href} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: "var(--r-sm)", textDecoration: "none", background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary-texto, var(--primary))" }}>{l.label} <Icon name="external-link" size={13} color="var(--primary-texto)" /></Link>)}
                    </div>
                  )}
                  {b.semResposta && <Botao variante="primario" icone="lifebuoy" onClick={() => setChamado({ pergunta: b.perguntaOrigem || "" })} style={{ marginTop: 10 }}>Abrir chamado</Botao>}
                </div>
              </div>
            ))}
            {digitando && <div style={{ alignSelf: "flex-start", padding: "12px 16px", borderRadius: "var(--r-md)", background: "var(--surface-2)" }}><span className="dots" style={{ display: "inline-flex", gap: 4 }}><i/><i/><i/></span></div>}
            {bolhas.length <= 1 && !digitando && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {SUGESTOES.map((s) => <button key={s} onClick={() => responder(s)} style={{ padding: "8px 14px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", cursor: "pointer", background: "var(--surface-2)", color: "var(--text)", fontSize: 13.5, boxShadow: "none" }}>{s}</button>)}
              </div>
            )}
            <div ref={fimRef} />
          </div>
          <div style={{ padding: 14, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") responder(texto); }} placeholder="Pergunte como fazer algo…" style={{ flex: 1, minWidth: 0, padding: "11px 15px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14.5, boxShadow: "none" }} />
            <BotaoIcone variante="primario" icone="trending-up" titulo="Enviar" onClick={() => responder(texto)} disabled={!texto.trim()} style={{ flex: "none" }} />
          </div>
        </>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <Botao variante="primario" icone="lifebuoy" onClick={() => setChamado({ pergunta: "" })} style={{ alignSelf: "flex-start" }}>Abrir chamado</Botao>
          {chamados.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 14, padding: 30 }}>Você ainda não abriu nenhum chamado.</div>
          ) : chamados.map((c) => (
            <div key={c.id} className="glass" style={{ padding: 15, borderRadius: "var(--r-md)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{c.titulo}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: "var(--r-xs)", color: CHAMADO_COR[c.status] ?? "var(--neutro)", background: `color-mix(in srgb, ${CHAMADO_COR[c.status] ?? "var(--neutro)"} 16%, transparent)` }}>{c.status === "aberto" ? "Aberto" : "Resolvido"}</span>
              </div>
              {c.descricao && <div style={{ fontSize: 13.5, color: "var(--text-dim)", marginTop: 5 }}>{c.descricao}</div>}
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>{c.tipo} · {new Date(c.created_at).toLocaleDateString("pt-BR")}</div>
            </div>
          ))}
        </div>
      )}

      {chamadoVivo.montado && ultimoChamado.current && <ChamadoModal perguntaOrigem={ultimoChamado.current.pergunta} classe={chamadoVivo.classe} onClose={() => setChamado(null)} onAberto={() => { setChamado(null); carregarChamados(); if (tab === "assistente") setBolhas((b) => [...b, { de: "ia", texto: "Pronto! Seu chamado foi aberto. A equipe vai te responder por aqui em breve." }]); }} />}
      <style>{`.dots i{width:7px;height:7px;border-radius:50%;background:var(--text-dim);display:inline-block;animation:bz 1s infinite}.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}@keyframes bz{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}`}</style>
    </div>
  );
}

function SegBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ padding: "6px 12px", borderRadius: "var(--r-xs)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, boxShadow: "none", color: on ? "var(--on-primary, #fff)" : "var(--text-dim)", background: on ? "var(--primary-acao, var(--primary))" : "transparent" }}>{children}</button>;
}

function ChamadoModal({ perguntaOrigem, onClose, onAberto, classe = "" }: { perguntaOrigem: string; onClose: () => void; onAberto: () => void; classe?: string }) {
  const [tipo, setTipo] = useState<string>("Dúvida");
  const [titulo, setTitulo] = useState(perguntaOrigem);
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function abrir() {
    if (!titulo.trim()) return; setSalvando(true);
    await fetch("/api/central/chamados", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, titulo, descricao, pergunta_origem: perguntaOrigem }) });
    setSalvando(false); onAberto();
  }

  return (
    <div className={`apple-backdrop sheet-host ${classe}`.trim()} onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}>
      <div className={`apple-modal sheet t-modal ${classe}`.trim()} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, maxHeight: "90dvh", overflowY: "auto", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", background: "var(--surface-2)", padding: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 18px" }}>Abrir chamado</h2>
        <div style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "block" }}><span style={lbl}>Tipo</span>
            <GlassSelect value={tipo} onChange={setTipo} options={TIPOS_CHAMADO.map((t) => ({ value: t, label: t }))} /></label>
          <label style={{ display: "block" }}><span style={lbl}>Assunto</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} style={inp} autoFocus /></label>
          <label style={{ display: "block" }}><span style={lbl}>Detalhes (opcional)</span>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} /></label>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <Botao onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" onClick={abrir} disabled={!titulo.trim()} carregando={salvando}>Abrir chamado</Botao>
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, boxShadow: "none" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)", marginBottom: 6 };
