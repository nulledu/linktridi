"use client";

import { CampoCor } from "@/app/(plataforma)/ui/cores";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PanelConfig, SalesSnapshot } from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fmtBRL } from "@/lib/format";
import { Icon } from "../(plataforma)/Icon";

async function uploadFile(file: File, bucket: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("bucket", bucket);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error("upload falhou");
  return (await res.json()).url as string;
}

export function DashboardClient({
  initialConfig,
  sales,
  email,
}: {
  initialConfig: PanelConfig;
  sales: SalesSnapshot;
  email: string;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<PanelConfig>(initialConfig);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function patch(p: Partial<PanelConfig>) {
    setConfig((c) => ({ ...c, ...p }));
  }
  function patchTheme(p: Partial<PanelConfig["theme"]>) {
    setConfig((c) => ({ ...c, theme: { ...c.theme, ...p } }));
  }

  async function saveConfig() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    setMsg(res.ok ? "Configuração salva" : "Erro ao salvar");
  }

  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
        <div>
          <h1 style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 700 }}>Controle</h1>
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>{email}</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {/* `noopener`: sem ele a aba aberta guarda uma referência viva para esta
              (`window.opener`) e pode navegá-la. Navegador atual já implica isso
              em `target="_blank"`, mas o `browserslist` deste repositório vai até
              o Chrome 51 — no WebView antigo do tablet, não implica. */}
          <a href="/painel" target="_blank" rel="noopener" className="btn secondary">Abrir painel</a>
          <button onClick={signOut} className="btn secondary">Sair</button>
        </div>
      </header>

      <Section title="Aparência">
        <Row label="Cor primária">
          <CampoCor rotulo="Cor primária" comHex valor={config.theme.primary} aoMudar={(v) => patchTheme({ primary: v })} />
        </Row>
        <Row label="Cor secundária (metas)">
          <CampoCor rotulo="Cor secundária" comHex valor={config.theme.secondary} aoMudar={(v) => patchTheme({ secondary: v })} />
        </Row>
        <Row label="Fundo">
          <CampoCor rotulo="Fundo" comHex valor={config.theme.background} aoMudar={(v) => patchTheme({ background: v })} />
        </Row>
        <Row label="Logo da empresa">
          <Uploader bucket="branding" accept="image/*" onDone={(url) => patchTheme({ logoUrl: url })} current={config.theme.logoUrl} />
        </Row>
      </Section>

      <Section title="Reprodução">
        <Row label={`Tempo por slide: ${(config.slideIntervalMs / 1000).toFixed(0)}s`}>
          <input type="range" min={5000} max={60000} step={1000} value={config.slideIntervalMs} onChange={(e) => patch({ slideIntervalMs: Number(e.target.value) })} />
        </Row>
        <Row label={`Atualização: ${(config.refreshIntervalMs / 1000).toFixed(0)}s`}>
          <input type="range" min={5000} max={300000} step={5000} value={config.refreshIntervalMs} onChange={(e) => patch({ refreshIntervalMs: Number(e.target.value) })} />
        </Row>
        <Row label="Som ao bater meta">
          <div style={{ display: "flex", gap: 10, alignItems: "center", width: "100%" }}>
            <Uploader bucket="sounds" accept="audio/*" onDone={(url) => patch({ goalSoundUrl: url })} current={config.goalSoundUrl} />
            {config.goalSoundUrl && (
              <button type="button" className="btn secondary" onClick={() => new Audio(config.goalSoundUrl!).play()}>▶ Testar</button>
            )}
          </div>
        </Row>
      </Section>

      <Section title="Metas gerais">
        <Row label="Meta de faturamento (mês)">
          <input type="number" value={config.monthlyRevenueGoal} onChange={(e) => patch({ monthlyRevenueGoal: Number(e.target.value) })} style={{ maxWidth: 200 }} />
        </Row>
        <Row label="Imposto Facebook no tráfego (%)">
          <input type="number" step="0.01" value={config.trafficTaxPct} onChange={(e) => patch({ trafficTaxPct: Number(e.target.value) })} style={{ maxWidth: 200 }} />
        </Row>
      </Section>

      <div style={{ position: "sticky", bottom: 0, padding: "16px 0", background: "linear-gradient(transparent, var(--bg) 30%)" }}>
        <button className="btn" onClick={saveConfig} disabled={saving} style={{ width: "100%" }}>
          {saving ? "Salvando…" : "Salvar configuração"}
        </button>
        {msg && <p style={{ textAlign: "center", marginTop: 10, color: "var(--secondary)" }}>{msg}</p>}
      </div>

      <Section title="Metas — Vendedores">
        {sales.salespeople.map((p) => (
          <SalespersonRow key={p.id} id={p.id} name={p.name} goal={p.goal.monthly} photoUrl={p.photoUrl} />
        ))}
      </Section>

      <Section title="Metas — Equipes">
        {sales.teams.map((t) => (
          <TeamRow key={t.id} id={t.id} name={t.name} goal={t.goal} current={t.current} />
        ))}
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass" style={{ padding: 24, marginBottom: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 18 }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
      <label style={{ margin: 0, flex: 1 }}>{label}</label>
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>{children}</div>
    </div>
  );
}

function Uploader({ bucket, accept, onDone, current }: { bucket: string; accept: string; onDone: (url: string) => void; current: string | null }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="btn secondary" style={{ cursor: "pointer", margin: 0 }}>
      {busy ? "Enviando…" : current ? "Trocar" : "Enviar"}
      <input
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            onDone(await uploadFile(f, bucket));
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}

function SalespersonRow({ id, name, goal, photoUrl }: { id: string; name: string; goal: number; photoUrl: string | null }) {
  const [g, setG] = useState(goal);
  const [saved, setSaved] = useState(false);
  async function save(fields: Record<string, unknown>) {
    await fetch("/api/salespeople", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
      <span style={{ flex: 1, fontWeight: 600 }}>{name}</span>
      <Uploader bucket="photos" accept="image/*" current={photoUrl} onDone={(url) => save({ photo_url: url })} />
      <input
        type="number"
        value={g}
        onChange={(e) => setG(Number(e.target.value))}
        onBlur={() => save({ monthly_goal: g })}
        style={{ width: 140 }}
      />
      {saved && <span role="status" aria-label="salvo" style={{ display: "inline-flex", color: "var(--secondary)" }}><Icon name="circle-check" size={16} color="currentColor" /></span>}
    </div>
  );
}

function TeamRow({ id, name, goal, current }: { id: string; name: string; goal: number; current: number }) {
  const [g, setG] = useState(goal);
  const [saved, setSaved] = useState(false);
  async function save() {
    await fetch("/api/teams", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, goal: g }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
      <span style={{ flex: 1, fontWeight: 600 }}>{name}</span>
      <span style={{ color: "var(--text-dim)", fontSize: 14 }}>atual {fmtBRL(current)}</span>
      <input type="number" value={g} onChange={(e) => setG(Number(e.target.value))} onBlur={save} style={{ width: 140 }} />
      {saved && <span role="status" aria-label="salvo" style={{ display: "inline-flex", color: "var(--secondary)" }}><Icon name="circle-check" size={16} color="currentColor" /></span>}
    </div>
  );
}
