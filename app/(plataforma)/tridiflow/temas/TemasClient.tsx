"use client";

// Temas & Personalização — vitrine COM preview ao vivo: escolha um bot, clique
// num tema e veja numa conversa de amostra; aplique no bot (preserva foto/nome)
// ou abra o editor pra ajuste fino.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { toast } from "../../Toast";
import { ChatRuntime } from "@/app/f/ChatRuntime";
import { SETTINGS_PADRAO, THEME_PRESETS, uid, type Fluxo, type Theme } from "@/lib/tridiflow";
import { GlassSelect } from "../../GlassPicker";
import { Botao } from "../../ui/controles";

interface Bot { id: string; nome: string }

// Conversa de amostra só pra visualizar o tema (não mexe no bot).
const DEMO: Fluxo = {
  variables: [],
  edges: [],
  groups: [{
    id: "demo", title: "Demo", x: 0, y: 0, blocks: [
      { id: uid(), type: "texto", text: "Oi! 👋 Que bom te ver por aqui." },
      { id: uid(), type: "texto", text: "Assim fica a conversa do seu bot com **este tema**." },
      { id: uid(), type: "botoes", text: "Quer ver como funciona?", opcoes: [{ id: uid(), label: "Sim, quero!" }, { id: uid(), label: "Agora não" }] },
    ],
  }],
};

export function TemasClient() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [botId, setBotId] = useState("");
  const [atual, setAtual] = useState<Theme | null>(null);      // tema atual do bot (p/ preservar foto/nome)
  const [presetId, setPresetId] = useState(THEME_PRESETS[0]?.id ?? "");
  const [salvando, setSalvando] = useState(false);
  const [key, setKey] = useState(0);                            // reinicia a conversa de amostra

  useEffect(() => {
    fetch("/api/tridiflow/bots", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      const list = (d.bots ?? []) as Bot[]; setBots(list); if (list[0]) setBotId(list[0].id);
    }).catch(() => {});
  }, []);

  // Ao trocar de bot, pega o tema atual (pra saber o preset e preservar foto/nome).
  useEffect(() => {
    if (!botId) { setAtual(null); return; }
    fetch(`/api/tridiflow/bots?id=${botId}`, { cache: "no-store" }).then((r) => r.json()).then((d) => {
      const t = d.bot?.theme as Theme | undefined;
      if (t) { setAtual(t); if (t.preset) setPresetId(t.preset); }
    }).catch(() => setAtual(null));
  }, [botId]);

  const preset = THEME_PRESETS.find((p) => p.id === presetId) ?? THEME_PRESETS[0];
  // Tema do preview = cores do preset + identidade do bot (foto/nome/cabeçalho).
  const temaPreview = useMemo<Theme>(() => ({
    ...preset.theme,
    nomeBot: atual?.nomeBot ?? "Atendimento",
    fotoUrl: atual?.fotoUrl,
    header: atual?.header,
  }), [preset, atual]);

  async function aplicar() {
    if (!botId) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/tridiflow/bots", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: botId, theme: temaPreview }) });
      if (!r.ok) { toast.erro("Falha ao aplicar."); return; }
      setAtual(temaPreview); toast.ok(`Tema "${preset.label}" aplicado.`);
    } finally { setSalvando(false); }
  }

  return (
    <div style={{ maxWidth: 1080 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Temas</h1>
          <p style={{ color: "var(--text-dim)", marginTop: 4, fontSize: 14 }}>Escolha um bot, veja o tema no preview e aplique.</p>
        </div>
        <GlassSelect value={botId} onChange={setBotId} disabled={!bots.length}
          placeholder={bots.length === 0 ? "Nenhum bot" : "Escolha"}
          style={{ width: "auto", minWidth: 190 }}
          options={bots.map((b) => ({ value: b.id, label: b.nome }))} />
      </div>

      {/* Flex com bases equivalentes ao grid "1fr 320px": no computador a
          divisão é a mesma; abaixo de ~740px o preview desce pra própria linha
          em vez de espremer a galeria. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        {/* Galeria de temas */}
        <div style={{ flex: "1 1 min(100%, 400px)", minWidth: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 12 }}>Temas prontos</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 112px), 1fr))", gap: 10 }}>
            {THEME_PRESETS.map((p) => {
              const on = p.id === presetId;
              return (
                <button key={p.id} onClick={() => setPresetId(p.id)}
                  style={{ border: `2px solid ${on ? "var(--primary)" : "var(--border)"}`, borderRadius: 12, padding: 8, background: on ? "color-mix(in srgb, var(--primary) 7%, transparent)" : "var(--surface)", cursor: "pointer", textAlign: "center" }}>
                  <div style={{ height: 50, borderRadius: 9, background: `linear-gradient(135deg, ${p.theme.corHeader} 0 50%, ${p.theme.corBolhaUser} 50% 100%)`, border: "1px solid var(--border)", marginBottom: 7 }} />
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: on ? "var(--primary-texto)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview ao vivo + ações */}
        <div style={{ flex: "0 1 min(100%, 320px)", minWidth: 0, boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 16, position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)" }}>PREVIEW · {preset.label}</span>
            <Botao variante="sutil" tamanho="sm" icone="refresh" onClick={() => setKey((k) => k + 1)} title="Reiniciar">Reiniciar</Botao>
          </div>
          {(() => {
            const DEVW = 384, DEVH = 760, VIS = 268, SC = VIS / DEVW;
            return (
              <div style={{ width: VIS + 12, maxWidth: "100%", margin: "0 auto", borderRadius: 32, border: "6px solid #101014", boxShadow: "0 12px 34px rgba(0,0,0,.4)", background: "#101014", overflow: "hidden" }}>
                <div style={{ width: VIS, height: DEVH * SC, overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: DEVW, height: DEVH, transform: `scale(${SC})`, transformOrigin: "top left" }}>
                    <ChatRuntime fluxo={DEMO} theme={temaPreview} settings={SETTINGS_PADRAO} modoPreview altura={DEVH} reinicioKey={key} />
                  </div>
                </div>
              </div>
            );
          })()}
          <Botao variante="primario" bloco onClick={aplicar} disabled={!botId} carregando={salvando}>
            {salvando ? "Aplicando…" : "Aplicar ao bot"}
          </Botao>
          <a href={botId ? `/tridiflow/${botId}` : "#"} aria-disabled={!botId}
            style={{ width: "100%", boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontWeight: 700, textDecoration: "none", pointerEvents: botId ? "auto" : "none" }}>
            <Icon name="palette" size={15} color="var(--text-dim)" /> Ajustar no editor
          </a>
        </div>
      </div>
    </div>
  );
}
