import Link from "next/link";
import { Icon } from "../../Icon";
import { integracoesResumo, type BotIntegracoes } from "@/lib/tridiflow-db";
import { TrocaIcone } from "../../ui/micro";
import "../_shared/config-micro.css";

// Rastreamento & Pixels — no TridiFlow o rastreamento é POR BOT (cada funil tem
// seus IDs), configurado no editor → Personalizar → Pixels. Aqui mostramos o
// estado real (quais pixels cada bot tem) + os conectores/eventos suportados.
const CONECTORES = [
  { nome: "Meta Pixel", cor: "#1877f2", icone: "brand-meta", desc: "Rastreia abertura, Lead e Purchase no navegador." },
  { nome: "Meta Conversions API", cor: "#1877f2", icone: "brand-meta", desc: "Server-side, resistente a bloqueio de cookie/iOS (dedup por event_id)." },
  { nome: "Google GA4 / GTM", cor: "#e8710a", icone: "chart-dots", desc: "Sessões e conversões do funil no GA4." },
  { nome: "TikTok Pixel", cor: "#111827", icone: "brand-tiktok", desc: "Otimização de campanhas do TikTok." },
  { nome: "Pinterest Tag", cor: "#e60023", icone: "target-arrow", desc: "Eventos de conversão no Pinterest." },
];
const EVENTOS = ["PageView", "InitiateCheckout", "Lead", "ViewContent", "AddToCart", "Purchase", "CompleteRegistration"];
const UTMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid", "ttclid"];
const CHIP: [keyof BotIntegracoes, string, string][] = [["meta", "Meta", "#1877f2"], ["capi", "CAPI", "#1877f2"], ["ga4", "GA4", "#e8710a"], ["tiktok", "TikTok", "#111827"], ["pinterest", "Pinterest", "#e60023"]];

export async function RastreamentoInfo() {
  const bots = await integracoesResumo().catch(() => [] as BotIntegracoes[]);
  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Rastreamento & Pixels</h1>
        <p style={{ color: "var(--text-dim)", marginTop: 4, fontSize: 14 }}>O rastreamento é por bot (cada funil tem seus IDs). Configure em <strong>abrir o bot → Personalizar → Pixels</strong>.</p>
      </div>

      {/* Status por bot */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Pixels por bot</div>
        {bots.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>Nenhum bot ainda.</p>
        ) : (
          <div className="tfm-fila" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {bots.map((b, i) => (
              <div key={b.id} style={{ ["--i" as string]: Math.min(i, 12), display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 11, background: "var(--surface-2)", border: "1px solid var(--border)", flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 130, fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{b.nome}</span>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {CHIP.map(([k, label, cor]) => {
                    const on = !!b[k];
                    return <span key={label} style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 9px", borderRadius: 999, background: on ? `color-mix(in srgb, ${cor} 16%, transparent)` : "var(--surface)", color: on ? cor : "var(--text-dim)", border: on ? "none" : "1px solid var(--border)", display: "inline-flex", alignItems: "center", gap: 4 }}><TrocaIcone ligado={on} a="circle" b="circle-check" size={11} corA="currentColor" corB="currentColor" />{label}</span>;
                  })}
                </div>
                <Link href={`/tridiflow/${b.id}`} style={{ display: "inline-flex", alignItems: "center", minHeight: "var(--tap)", padding: "0 6px", fontSize: 12, fontWeight: 700, color: "var(--primary-texto, var(--primary))", textDecoration: "none" }}>Editar</Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 12 }}>Conectores suportados</div>
        <div className="tfm-fila" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 12 }}>
          {CONECTORES.map((c, i) => (
            <div key={c.nome} style={{ ["--i" as string]: i, minWidth: 0, display: "flex", gap: 11, padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${c.cor} 12%, transparent)` }}><Icon name={c.icone} size={19} color={c.cor} /></span>
              <div><div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)" }}>{c.nome}</div><div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.4 }}>{c.desc}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div className="duo duo-eq" style={{ gap: 16 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Eventos disponíveis</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {EVENTOS.map((e) => <span key={e} style={{ fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 999, background: "var(--surface-2)", color: "var(--text)" }}>{e}</span>)}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "12px 0 0" }}>Dispare por gatilho (abertura/início/conclusão) ou por bloco, e escolha a amostragem em <strong>Personalizar → Pixels → Conversões</strong>.</p>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>UTMs & parâmetros capturados</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {UTMS.map((u) => <span key={u} style={{ fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 999, background: "var(--surface-2)", color: "var(--text)" }}>{u}</span>)}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "12px 0 0" }}>Capturados automaticamente da URL do anúncio e enviados junto com o lead.</p>
        </div>
      </div>
    </div>
  );
}
