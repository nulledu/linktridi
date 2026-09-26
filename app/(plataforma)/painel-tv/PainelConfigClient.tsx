"use client";

import { CampoCor } from "@/app/(plataforma)/ui/cores";
import { useEffect, useRef, useState } from "react";
import type { PanelConfig, SalesSnapshot } from "@/lib/types";
import { DEFAULT_CONFIG } from "@/lib/types";
import { type PainelLayout, type Perfil } from "@/lib/painel-layout";
import { ListaDeTelas } from "./ListaDeTelas";
import { BarraPerfis, perfisDaConfig } from "./BarraPerfis";
import { usePerfis } from "./usePerfis";
import { confirmar } from "../Toast";
import { Botao } from "../ui/controles";
import { BarraSalvar, useBarraSalvar } from "../ui/BarraSalvar";
import { Secao } from "../ui/Secao";

// Configuração do Painel de Vendas (TV/kiosk em /painel). Lê/grava /api/config.
export function PainelConfigClient() {
  const [cfg, setCfg] = useState<PanelConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [previewKey, setPreviewKey] = useState(0); // força reload do iframe
  // Dados reais na pré-visualização: um editor com número inventado não mostra
  // o problema que interessa — o nome que não cabe, o valor que estoura a caixa.
  const [sales, setSales] = useState<SalesSnapshot | null>(null);

  // O que está salvo no servidor, para saber o que ainda NÃO está.
  const salvoRef = useRef<string>("");
  const sujo = loaded && JSON.stringify(cfg) !== salvoRef.current;

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" }).then((r) => r.json()).then((c) => {
      const inicial = (c && !c.error)
        ? { ...DEFAULT_CONFIG, ...c, theme: { ...DEFAULT_CONFIG.theme, ...(c.theme ?? {}) } }
        : DEFAULT_CONFIG;
      setCfg(inicial);
      salvoRef.current = JSON.stringify(inicial);
      setLoaded(true);
    }).catch(() => setLoaded(true));
    fetch("/api/sales", { cache: "no-store" })
      .then((r) => r.json())
      .then((s) => { if (s && !s.error) setSales(s); })
      .catch(() => { /* editor funciona sem dados; os widgets mostram zero */ });
  }, []);

  // ── Perfis ────────────────────────────────────────────────────────────────
  // O editor edita UM perfil por vez; a barra acima troca de perfil. A
  // configuração antiga (só `layout`) vira o primeiro perfil sem pedir
  // migração: quem já tinha painel montado o encontra aqui, com o mesmo
  // desenho, e ganha os modelos prontos ao lado.
  const ed = usePerfis(perfisDaConfig(cfg.perfis));
  const { perfis, perfil, setPerfilAtual, setPerfis, layout, setLayout, desfazer, temDesfazer } = ed;
  // A edição vive no hook; a configuração guarda o resultado, que é o que sobe
  // no Salvar. Sem este espelho, mexer num perfil não marcaria "não salvo".
  useEffect(() => { setCfg((c) => ({ ...c, perfis })); }, [perfis]);


  function flash(t: string, ok: boolean) { setMsg({ t, ok }); setTimeout(() => setMsg(null), 3500); }
  const setTheme = (k: keyof PanelConfig["theme"], v: string | null) => setCfg((c) => ({ ...c, theme: { ...c.theme, [k]: v } }));

  // Sair da página com montagem não salva é perder vinte minutos de trabalho —
  // e o editor não avisava nada. O navegador só permite este aviso quando há
  // algo REALMENTE pendente; por isso o `sujo` é comparado com o que veio do
  // servidor, e não um "mexeu em algo" que dispararia até depois de salvar.
  useEffect(() => {
    if (!sujo) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sujo]);

  async function salvar(): Promise<boolean> {
    setBusy(true);
    try {
      const corpo = JSON.stringify(cfg);
      const r = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: corpo });
      const d = await r.json();
      if (r.ok) { salvoRef.current = corpo; flash("Configuração salva. O painel aplica em até alguns segundos.", true); setPreviewKey((k) => k + 1); return true; }
      flash(d.issues ? `Inválido: ${d.issues[0]?.path?.join(".")} ${d.issues[0]?.message}` : (d.detail || d.error || "Falha ao salvar."), false);
      return false;
    } finally { setBusy(false); }
  }

  // A barra flutuante de "não salvo" segue a pessoa pela tela inteira — o
  // editor é alto, e o botão da barra do topo some assim que ela rola.
  // "Desfazer" da barra volta pro que está SALVO (não um passo, como o botão
  // Desfazer do topo): é a pergunta que a pessoa faz ali — "quero jogar fora".
  const barra = useBarraSalvar({
    sujo, salvar,
    desfazer: () => { if (salvoRef.current) setCfg(JSON.parse(salvoRef.current)); },
  });

  async function restaurar() {
    if (!(await confirmar("Restaurar tudo para o padrão?", { detalhe: "Só salva ao clicar em Salvar." }))) return;
    setCfg(DEFAULT_CONFIG);
    flash("Valores padrão carregados — clique em Salvar para aplicar.", true);
  }

  if (!loaded) return <div style={{ color: "var(--text-dim)", padding: 24 }}>Carregando…</div>;

  return (
    // Editor de duas colunas: a montagem do painel à esquerda (é ela que ocupa
    // espaço — 16:9 de verdade, com dados reais) e o inspetor à direita.
    //
    // Antes eram quatro caixas de formulário EMPILHADAS abaixo do editor:
    // trocar a cor de fundo e conferir o resultado custava rolar pra baixo,
    // mexer, rolar pra cima. Com o inspetor ao lado, a mudança e o efeito
    // ficam no mesmo campo de visão — que é a única razão de um editor existir.
    <div style={{ maxWidth: 1320 }}>
      {/* Barra de ações fixa no topo: salvar é a ação da tela inteira, não do
          último bloco dela. Antes o botão morava no fim de quatro formulários. */}
      <div className="pt-barra">
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <h1 style={{ fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Painel de Vendas (TV)</h1>
          <p style={{ color: "var(--text-dim)", margin: "2px 0 0", fontSize: 13 }}>Monte a tela arrastando os blocos. Tema, metas, ritmo e som ficam logo abaixo.</p>
        </div>
        {msg && (
          <span role="status" style={{ fontSize: 12.5, fontWeight: 700, flex: "none", color: msg.ok ? "var(--ok)" : "var(--perigo)", background: `color-mix(in srgb, ${msg.ok ? "var(--ok)" : "var(--perigo)"} 14%, transparent)`, borderRadius: 999, padding: "4px 11px" }}>{msg.t}</span>
        )}
        {/* O pendente vale mais que o aviso ao sair: ele aparece ENQUANTO se
            monta, e é o que impede alguém fechar a aba achando que arrastar já
            salvou. Vive na barra flutuante (`BarraSalvar`), presa embaixo. */}
        <BarraSalvar {...barra} />
        <span style={{ display: "flex", gap: 8, flex: "none", flexWrap: "wrap" }}>
          {/* Abre O PERFIL QUE ESTÁ ABERTO, e PUBLICA antes.
              Duas armadilhas, as duas com a mesma cara de "não salvou nada":
              sem o `?perfil=` a aba nova mostrava sempre o primeiro perfil; e a
              TV lê o que está publicado, então com montagem pendente abria o
              painel antigo — inclusive na primeira vez, quando os perfis ainda
              são só a sugestão que o editor mostra e o servidor não tem nenhum.
              Publicar aqui é o que faz o botão cumprir o próprio nome.
              O `open` continua dentro dos 5s de ativação do clique, então o
              bloqueador de pop-up não entra. */}
          <Botao
            icone="external-link"
            title={sujo ? "Publica o que está montado e abre a TV" : `Abrir a tela "${perfil.nome}" como ela vai ao ar`}
            onClick={async () => {
              if (sujo) await salvar();
              window.open(`/painel?perfil=${encodeURIComponent(perfil.id)}`, "_blank", "noopener");
            }}
          >
            Abrir na TV
          </Botao>
          <Botao icone="arrow-back-up" onClick={desfazer} disabled={!temDesfazer}>Desfazer</Botao>
          <Botao icone="refresh" onClick={restaurar} disabled={busy}>Restaurar</Botao>
          <Botao variante="primario" icone="check" onClick={salvar} carregando={busy}>Salvar</Botao>
        </span>
      </div>

      <div className="pt-editor">
        {/* A montagem ocupa a LARGURA INTEIRA. Antes ela dividia a tela com as
            quatro sanfonas de ajuste, e sobrava tão pouco que o inspetor do
            bloco caía embaixo do palco: mexer num widget virava rolar pra
            baixo, mexer, rolar pra cima. Tema e ritmo não competem com a
            montagem — são de outro assunto e moram embaixo. */}
        <div className="glass glass-spec" style={{ padding: 14, borderRadius: "var(--r-md)", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 14.5, fontWeight: 800, margin: 0 }}>Perfis de tela</h2>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              cada TV escolhe um destes — ligue e desligue as telas abaixo
            </span>
          </div>
          <BarraPerfis
            perfis={perfis}
            atual={perfil.id}
            onTrocar={setPerfilAtual}
            onChange={setPerfis}
          />
          {/*
            LISTA, e não editor de arrastar.

            As telas da parede passaram a ser DESENHADAS (a doca em pé, o
            tráfego, o ranking). Um editor que oferece mover e redimensionar
            pedaços delas promete o que a parede não cumpre — o bloco arrastado
            aqui não mudava de lugar lá, e o mesmo perfil aparecia de um jeito
            na prévia e de outro na TV. O que ficou é o que se usa todo dia:
            qual tela entra no rodízio, por quanto tempo e em que ordem.
          */}
          <ListaDeTelas
            slides={layout.slides}
            intervaloPadraoMs={cfg.slideIntervalMs}
            onChange={(slides) => setLayout({ ...layout, slides })}
          />
        </div>

        {/* Abaixo da montagem: o que vale para TODAS as telas. Ficava ao lado,
            do mesmo tamanho e com a mesma cara dos controles do bloco — e não
            havia nada dizendo que mexer aqui muda todos os perfis de uma vez.
            Sanfona fechada porque são quatro assuntos raros; a montagem é o
            que se faz todo dia. */}
        <div className="pt-ajustes">
          <div className="pt-ajustes-cab">
            <h2 style={{ fontSize: 14.5, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>Ajustes da TV</h2>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              valem para todas as telas, não só para a que está aberta
            </span>
          </div>
          <Secao icone="palette" titulo="Tema & marca" resumo="cores e logo">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 140px),1fr))", gap: 12, paddingTop: 10 }}>
              <ColorField label="Cor primária" value={cfg.theme.primary} onChange={(v) => setTheme("primary", v)} />
              <ColorField label="Cor secundária" value={cfg.theme.secondary} onChange={(v) => setTheme("secondary", v)} />
              <ColorField label="Fundo" value={cfg.theme.background} onChange={(v) => setTheme("background", v)} />
            </div>
            <div className="tab-strip" style={{ gap: 6, marginTop: 12 }}>
              <span style={{ flex: "none", alignSelf: "center", fontSize: 12, color: "var(--text-dim)", fontWeight: 600, paddingRight: 2 }}>Fundo rápido:</span>
              {[["Preto", "#000000"], ["Grafite", "#0f1115"], ["Azul noite", "#0a1733"], ["Branco", "#ffffff"]].map(([nome, hex]) => (
                <button key={hex} type="button" className="hr-chip" aria-pressed={cfg.theme.background.toLowerCase() === hex} onClick={() => setTheme("background", hex)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: hex, border: "1px solid var(--border)" }} />{nome}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <Upload label="Logo (TV)" bucket="branding" accept="image/*" value={cfg.theme.logoUrl} onChange={(u) => setTheme("logoUrl", u)} preview onFail={() => flash("Falha no upload da logo.", false)} />
            </div>
          </Secao>

          <Secao icone="target" titulo="Metas & números" resumo="alvo do mês e imposto">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 180px),1fr))", gap: 12, paddingTop: 10 }}>
              <NumField label="Meta de faturamento do mês (R$)" value={cfg.monthlyRevenueGoal} step={1000} onChange={(v) => setCfg((c) => ({ ...c, monthlyRevenueGoal: v }))} />
              <NumField label="Imposto do tráfego (%)" value={cfg.trafficTaxPct} step={0.01} onChange={(v) => setCfg((c) => ({ ...c, trafficTaxPct: v }))} />
            </div>
          </Secao>

          <Secao icone="clock" titulo="Ritmo de exibição" resumo="tempo de slide e atualização">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 180px),1fr))", gap: 12, paddingTop: 10 }}>
              <SecField label="Tempo por slide" ms={cfg.slideIntervalMs} min={3} max={120} onChange={(ms) => setCfg((c) => ({ ...c, slideIntervalMs: ms }))} />
              <SecField label="Atualizar dados a cada" ms={cfg.refreshIntervalMs} min={5} max={600} onChange={(ms) => setCfg((c) => ({ ...c, refreshIntervalMs: ms }))} />
            </div>
          </Secao>

          <Secao icone="speakerphone" titulo="Comemoração" resumo="som ao bater a meta">
            <div style={{ paddingTop: 10 }}>
              <Upload label="Som ao bater meta (mp3)" bucket="sounds" accept="audio/*" value={cfg.goalSoundUrl} onChange={(u) => setCfg((c) => ({ ...c, goalSoundUrl: u }))} onFail={() => flash("Falha no upload do som.", false)} />
              {cfg.goalSoundUrl && (
                <Botao tamanho="sm" icone="player-play" onClick={() => { new Audio(cfg.goalSoundUrl!).play().catch(() => {}); }} className="pt-ouvir">Ouvir</Botao>
              )}
            </div>
          </Secao>
        </div>
      </div>
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600, display: "block", marginBottom: 6 }}>{children}</span>;
}

const inp: React.CSSProperties = { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 11px", color: "var(--text)", fontSize: 13.5 };

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Lbl>{label}</Lbl>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <CampoCor rotulo={label} valor={value} aoMudar={onChange} tamanho={30} />
        <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} em hexadecimal`} style={inp} />
      </div>
    </div>
  );
}

function NumField({ label, value, step, onChange }: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: "block" }}>
      <Lbl>{label}</Lbl>
      <input type="number" min={0} step={step ?? 1} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} style={inp} />
    </label>
  );
}

function SecField({ label, ms, min, max, onChange }: { label: string; ms: number; min: number; max: number; onChange: (ms: number) => void }) {
  return (
    <label style={{ display: "block" }}>
      <Lbl>{label} <span style={{ color: "var(--text-dim)" }}>(segundos)</span></Lbl>
      <input type="number" min={min} max={max} value={Math.round(ms / 1000)}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)) * 1000)} style={inp} />
    </label>
  );
}

function Upload({ label, bucket, accept, value, onChange, preview, onFail }: {
  label: string; bucket: string; accept: string; value: string | null; onChange: (u: string | null) => void; preview?: boolean; onFail?: () => void;
}) {
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUp(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("bucket", bucket);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (r.ok && d.url) onChange(d.url); else onFail?.();
    } catch { onFail?.(); } finally { setUp(false); }
  }
  return (
    <div>
      <Lbl>{label}</Lbl>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {preview && value && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", border: "1px solid var(--border)" }} />
        )}
        <button onClick={() => ref.current?.click()} disabled={up} className="glass"
          style={{ padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, color: "var(--text)", cursor: "pointer", border: "1px solid var(--border)" }}>
          {up ? "Enviando…" : value ? "Trocar arquivo" : "Enviar arquivo"}
        </button>
        {value && <button onClick={() => onChange(null)} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 13 }}>remover</button>}
        <input ref={ref} type="file" accept={accept} onChange={pick} style={{ display: "none" }} />
      </div>
    </div>
  );
}
