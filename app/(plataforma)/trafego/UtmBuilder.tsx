"use client";

// Tráfego Pago — Gerador de UTMs. Monta links rastreáveis (preview ao vivo),
// padroniza nomes, valida, gera QR e guarda um histórico POR USUÁRIO
// (user_prefs, cross-device). Suporta variáveis dinâmicas do Meta.
import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { toast } from "../Toast";
import { useSyncedPref } from "../useSyncedPref";
import { Botao, BotaoIcone, Caixa } from "../ui/controles";
import { Cartao } from "./TfKit";

interface UtmItem { id: string; url: string; source: string; medium: string; campaign: string; criadoEm: number }
const TEMPLATES: { nome: string; source: string; medium: string }[] = [
  { nome: "Facebook / Instagram", source: "facebook", medium: "cpc" },
  { nome: "Google Ads", source: "google", medium: "cpc" },
  { nome: "TikTok Ads", source: "tiktok", medium: "cpc" },
  { nome: "E-mail", source: "email", medium: "email" },
  { nome: "Orgânico (social)", source: "instagram", medium: "social" },
];
const slug = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9{}._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

export function UtmBuilder({ userId }: { userId: string }) {
  const [base, setBase] = useState("");
  const [f, setF] = useState({ source: "", medium: "", campaign: "", content: "", term: "" });
  const [padronizar, setPadronizar] = useState(true);
  const [hist, setHist] = useSyncedPref<UtmItem[]>("trafego.utms", userId, [], (p) => (Array.isArray(p) ? (p as UtmItem[]) : null));

  const norm = (v: string) => (padronizar ? slug(v) : v.trim());
  const url = useMemo(() => {
    const b = base.trim();
    if (!b) return "";
    const params: [string, string][] = [["utm_source", f.source], ["utm_medium", f.medium], ["utm_campaign", f.campaign], ["utm_content", f.content], ["utm_term", f.term]];
    const qs = params.filter(([, v]) => v.trim()).map(([k, v]) => `${k}=${encodeURIComponent(norm(v))}`);
    if (!qs.length) return b;
    return b + (b.includes("?") ? "&" : "?") + qs.join("&");
  }, [base, f, padronizar]);

  const baseOk = /^https?:\/\/.+/i.test(base.trim());
  const avisos: string[] = [];
  if (base && !baseOk) avisos.push("A URL base deve começar com https://");
  if (!padronizar && Object.values(f).some((v) => /[A-Z\s]/.test(v))) avisos.push("Há espaços ou maiúsculas — recomendado padronizar (evita links quebrados).");

  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const aplicarTemplate = (t: { source: string; medium: string }) => setF((s) => ({ ...s, source: t.source, medium: t.medium }));
  const usarVariaveisMeta = () => setF((s) => ({ ...s, campaign: "{{campaign.name}}", content: "{{ad.name}}", term: "{{adset.name}}" }));

  function copiar() {
    if (!url || !baseOk) { toast.erro("Preencha uma URL base válida (https://)."); return; }
    navigator.clipboard.writeText(url); toast.ok("Link copiado.");
  }
  function salvar() {
    if (!url || !baseOk) { toast.erro("Preencha uma URL base válida (https://)."); return; }
    const item: UtmItem = { id: Math.random().toString(36).slice(2, 10), url, source: norm(f.source), medium: norm(f.medium), campaign: norm(f.campaign), criadoEm: Date.now() };
    setHist([item, ...(hist || [])].slice(0, 50));
    toast.ok("Link salvo no histórico.");
  }
  const remover = (id: string) => setHist((hist || []).filter((x) => x.id !== id));

  const campo = (k: keyof typeof f, label: string, ph: string) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>
      {label}
      <input value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} spellCheck={false}
        style={{ border: "1px solid var(--tf-line)", borderRadius: 10, padding: "9px 11px", fontSize: 13.5, background: "var(--surface)", color: "var(--text)" }} />
    </label>
  );

  return (
    <div className="tf-scope" style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Gerador de UTMs</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 2 }}>Monte links rastreáveis padronizados. As UTMs aqui viram origem de venda na Atribuição.</p>
      </div>

      {/* Cartão de formulário do kit: os campos moram num <Cartao> padrão. */}
      <Cartao style={{ gap: 14 }}>
        {/* Templates */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>Modelo:</span>
          {TEMPLATES.map((t) => (
            <button key={t.nome} onClick={() => aplicarTemplate(t)} style={{ padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1px solid var(--tf-line)", background: "var(--surface)", color: "var(--text)" }}>{t.nome}</button>
          ))}
          <Botao variante="sutil" tamanho="sm" icone="variable" onClick={usarVariaveisMeta} title="Preenche campanha/conteúdo com variáveis dinâmicas do Meta" style={{ marginLeft: "auto" }}>Variáveis do Meta</Botao>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>
          URL de destino
          <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://sualoja.com/produto" spellCheck={false}
            style={{ border: `1px solid ${base && !baseOk ? "var(--perigo)" : "var(--tf-line)"}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, background: "var(--surface)", color: "var(--text)", fontFamily: "ui-monospace, Menlo, monospace" }} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 10 }}>
          {campo("source", "Fonte (utm_source)", "instagram")}
          {campo("medium", "Mídia (utm_medium)", "cpc")}
          {campo("campaign", "Campanha (utm_campaign)", "promo-julho")}
          {campo("content", "Conteúdo (utm_content)", "criativo-a")}
          {campo("term", "Termo (utm_term)", "opcional")}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text)", cursor: "pointer", fontWeight: 600 }}>
          <Caixa marcado={padronizar} onChange={(marc) => setPadronizar(marc)} />
          Padronizar automaticamente (minúsculas, sem espaços/acentos)
        </label>

        {avisos.length > 0 && avisos.map((a, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--atencao)" }}><Icon name="alert-triangle" size={14} color="var(--atencao)" /> {a}</div>
        ))}
      </Cartao>

      {/* Preview + QR */}
      {url && (
        <Cartao horizontal style={{ gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Link gerado</div>
            <div style={{ fontSize: 13, color: "var(--text)", wordBreak: "break-all", fontFamily: "ui-monospace, Menlo, monospace", background: "var(--surface-2)", borderRadius: 10, padding: "10px 12px", lineHeight: 1.5 }}>{url}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <Botao variante="primario" icone="copy" onClick={copiar}>Copiar</Botao>
              <Botao variante="secundario" icone="bookmark" onClick={salvar}>Salvar</Botao>
              <a href={baseOk ? url : undefined} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "1px solid var(--tf-line)", background: "var(--surface)", color: baseOk ? "var(--text)" : "var(--text-dim)", fontSize: 13, fontWeight: 700, textDecoration: "none", pointerEvents: baseOk ? "auto" : "none", opacity: baseOk ? 1 : 0.5 }}><Icon name="external-link" size={14} color="var(--text-dim)" /> Testar</a>
            </div>
          </div>
          {baseOk && (
            <div style={{ textAlign: "center", flex: "none" }}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=132x132&margin=0&data=${encodeURIComponent(url)}`} alt="QR do link" width={132} height={132} style={{ borderRadius: 12, background: "#fff", padding: 8, border: "1px solid var(--tf-line)" }} />
              <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 5 }}>QR do link</div>
            </div>
          )}
        </Cartao>
      )}

      {/* Histórico — linhas no padrão COMPACTO do kit (proeminência média). */}
      <Cartao>
        <Cartao.Titulo>Histórico ({(hist || []).length})</Cartao.Titulo>
        {(hist || []).length === 0 ? (
          <Cartao.Descricao>Os links que você salvar aparecem aqui — fica guardado só pra você, em qualquer dispositivo.</Cartao.Descricao>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Linha SEMPRE em fileira (sem data-horizontal, que vira coluna no estreito e empilharia dois botões de 30px). */}
            {(hist || []).map((it) => (
              <Cartao key={it.id} compacto proeminencia="media" style={{ flexDirection: "row", flexWrap: "nowrap" }}>
                <div style={{ flex: 1, minWidth: 0, padding: "2px 4px" }}>
                  <div style={{ fontSize: 12.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace, Menlo, monospace" }}>{it.url}</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>{[it.source, it.medium, it.campaign].filter(Boolean).join(" · ")}</div>
                </div>
                <BotaoIcone icone="copy" titulo="Copiar" variante="secundario" onClick={() => { navigator.clipboard.writeText(it.url); toast.ok("Copiado."); }} style={{ flex: "none" }} />
                <BotaoIcone icone="trash" titulo="Remover" variante="secundario" onClick={() => remover(it.id)} style={{ flex: "none" }} />
              </Cartao>
            ))}
          </div>
        )}
      </Cartao>
    </div>
  );
}
