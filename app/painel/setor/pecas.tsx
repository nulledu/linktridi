"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../slides/Icon";
import { NumeroVivo } from "@/app/(plataforma)/ui/micro";
import type { Chamada, PessoaEquipe, ProximaFila } from "@/lib/painel-atividades";
import "./setor.css";

/**
 * Peças de parede dos painéis de setor (Produção 16:9 e Logística 9:16).
 *
 * Tudo aqui é desenhado pra leitura a três metros: número grande, rosto
 * grande, cor só onde significa alguma coisa (urgência/estado — nunca
 * decoração). O movimento sai da escala do `globals.css` (ver `setor.css`).
 */

export const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");

/** "agora" / "há 4 min" / "há 1 h 20" — o tempo que algo espera. */
export function tempoDesde(iso: string, agoraMs: number): string {
  const min = Math.floor((agoraMs - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `há ${h} h ${m} min` : `há ${h} h`;
}

const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

/**
 * O retrato na parede. Foto de cadastro quando há; iniciais quando não.
 * `ausente` apaga (cinza) — a falta se lê de longe, sem rótulo.
 */
export function FotoPessoa({ nome, url, size = 84, radius, anelCor, ausente = false }: {
  nome: string; url: string | null; size?: number; radius?: number; anelCor?: string; ausente?: boolean;
}) {
  const [quebrou, setQuebrou] = useState(false);
  const r = radius ?? Math.round(size * 0.3);
  const anel = anelCor ? `0 0 0 3px color-mix(in srgb, ${anelCor} 75%, transparent)` : "inset 0 0 0 1px var(--border)";
  return (
    <span className={ausente ? "st-foto-ausente" : undefined}
      style={{ width: size, height: size, borderRadius: r, flex: "none", display: "grid", placeItems: "center", overflow: "hidden", background: "var(--surface-2)", boxShadow: anel, transition: "box-shadow var(--duration-fast) var(--ease-smooth-out)" }}>
      {url && !quebrou ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={nome} onError={() => setQuebrou(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <span style={{ fontSize: size * 0.34, fontWeight: 800, color: "var(--text-dim)", letterSpacing: ".02em" }}>{iniciais(nome)}</span>
      )}
    </span>
  );
}

/** Cabeçalho de seção da parede — o mesmo desenho em todos os painéis. */
export function Secao({ titulo, icone, cor, extra, children, style }: {
  titulo: string; icone?: string; cor?: string; extra?: React.ReactNode; children?: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <section style={{ minWidth: 0, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {icone && <Icon name={icone} size={17} color={cor ?? "var(--text-dim)"} />}
        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: cor ?? "var(--text-dim)" }}>{titulo}</span>
        {extra != null && <span style={{ marginLeft: "auto" }}>{extra}</span>}
      </div>
      {children}
    </section>
  );
}

/** KPI compacto de cabeçalho: número forte + rótulo apagado. */
export function KpiPastilha({ icone, rotulo, valor, cor, texto }: {
  icone: string; rotulo: string; valor?: number; cor?: string; texto?: string;
}) {
  const tinta = cor ?? "var(--text)";
  return (
    <div className="glass" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 16, minWidth: 0 }}>
      <Icon name={icone} size={22} color={cor ?? "var(--text-dim)"} />
      <div style={{ minWidth: 0 }}>
        <div className="stat" style={{ fontSize: 30, lineHeight: 1, color: tinta, fontVariantNumeric: "tabular-nums" }}>
          {texto ?? fmt(valor ?? 0)}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{rotulo}</div>
      </div>
    </div>
  );
}

/**
 * A CHAMADA DE ACEITE — o motivo de a parede existir.
 *
 * Enquanto houver atividade sem aceite no setor, a TV inteira aponta pra ela:
 * véu escuro por cima do painel, retrato pulsando e a instrução de onde
 * aceitar (tablet na produção, site na logística). Sai sozinha quando o
 * aceite chega no próximo ciclo. Com mais de uma, roda a cada 8 s.
 */
export function ChamadaAceite({ chamadas, setor, agoraMs }: {
  chamadas: Chamada[]; setor: "producao" | "logistica"; agoraMs: number;
}) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (chamadas.length <= 1) { setIdx(0); return; }
    const id = setInterval(() => setIdx((i) => (i + 1) % chamadas.length), 8000);
    return () => clearInterval(id);
  }, [chamadas.length]);
  if (chamadas.length === 0) return null;
  const c = chamadas[Math.min(idx, chamadas.length - 1)];
  const cor = c.urgente ? "var(--perigo)" : "var(--atencao)";
  const instrucao = c.oferecida
    ? `Tablet chamando${c.mesaAlvo ? ` na ${c.mesaAlvo}` : ""} — toque em ACEITAR`
    : setor === "logistica"
      ? "Aceite pelo site, em Minhas atividades"
      : c.mesaAlvo ? `Aceite no tablet — ${c.mesaAlvo}` : "Aceite no tablet";

  return (
    <div className="st-chamada-wrap">
      {/* `key={c.id}` refaz a entrada quando a chamada troca — a parede
          "chama de novo", em vez de trocar o texto por baixo do pano. */}
      <div key={c.id} className="st-chamada glass glass-spec"
        style={{ width: "min(620px, 92%)", borderRadius: 28, padding: "34px 38px", border: `1px solid color-mix(in srgb, ${cor} 45%, transparent)`, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 20 }}>
          <span style={{ display: "inline-grid", placeItems: "center", width: 30, height: 30, borderRadius: 10, background: `color-mix(in srgb, ${cor} 20%, transparent)` }}>
            <Icon name={c.urgente ? "flame" : "bolt"} size={18} color={cor} />
          </span>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: cor }}>
            {c.urgente ? "Atividade urgente" : "Nova atividade"}
          </span>
        </div>

        {/* Retrato de quem precisa agir — a placa sólida é quem pulsa (vidro
            não recebe transform em loop). Pool: a fila do setor chama. */}
        <span className="st-anel" style={{ ["--st-anel-cor" as string]: cor, display: "inline-block", borderRadius: 34, marginBottom: 16 }}>
          {c.dirigida ? (
            <FotoPessoa nome={c.paraNome || "—"} url={c.fotoUrl} size={116} radius={34} anelCor={cor} />
          ) : (
            <span style={{ width: 116, height: 116, borderRadius: 34, display: "grid", placeItems: "center", background: `color-mix(in srgb, ${cor} 16%, transparent)` }}>
              <Icon name="users" size={54} color={cor} />
            </span>
          )}
        </span>

        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-dim)", marginBottom: 2 }}>
          {c.dirigida ? c.paraNome : "Fila do setor — quem pega?"}
        </div>
        <div className="stat" style={{ fontSize: 44, lineHeight: 1.12, fontWeight: 800, letterSpacing: "-0.01em", margin: "4px 0 14px" }}>
          {c.tarefa}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {c.categoria && <Chip>{c.categoria}</Chip>}
          <Chip>{fmt(c.quantidadeAlvo)} {c.quantidadeAlvo === 1 ? "unidade" : "unidades"}</Chip>
          <Chip cor={cor}>{tempoDesde(c.desde, agoraMs)}</Chip>
          {c.porNome && <Chip>por {c.porNome}</Chip>}
        </div>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 22px", borderRadius: 999, background: `color-mix(in srgb, ${cor} 16%, transparent)`, fontSize: 19, fontWeight: 800, color: cor }}>
          <Icon name="circle-check" size={22} color={cor} />
          {instrucao}
        </div>

        {chamadas.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 18 }}>
            {chamadas.map((x, i) => (
              <span key={x.id} style={{ width: i === idx ? 22 : 7, height: 7, borderRadius: 999, background: i === idx ? cor : "var(--surface-2)", transition: "width var(--duration-fast) var(--ease-smooth-out), background var(--duration-fast) var(--ease-smooth-out)" }} />
            ))}
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-dim)", marginLeft: 8 }}>
              {chamadas.length} aguardando aceite
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ children, cor }: { children: React.ReactNode; cor?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "5px 12px", borderRadius: 999, background: "var(--surface)", fontSize: 14.5, fontWeight: 700, color: cor ?? "var(--text-dim)" }}>
      {children}
    </span>
  );
}

/** Card de pessoa: rosto grande + o que ela está fazendo AGORA + o dia dela. */
export function PessoaCard({ p, agoraMs, i, fotoSize = 76, compacta = false }: {
  p: PessoaEquipe & { extra?: string | null }; agoraMs: number; i: number; fotoSize?: number;
  /** Duas linhas só (nome + agora); o dia vira o número de peças à direita. */
  compacta?: boolean;
}) {
  const ausente = p.presente === false;
  const trabalhando = !!p.emAtividade;
  const statusCor = trabalhando ? "var(--p-ok, var(--ok))" : ausente ? "var(--text-dim)" : "var(--p-primaria, var(--info))";
  const statusTxt = trabalhando
    ? `${p.emAtividade!.tarefa} · ${tempoDesde(p.emAtividade!.desde, agoraMs).replace("há ", "")}`
    : ausente ? "Fora agora" : p.presente ? "Livre" : "—";
  if (compacta) {
    // Uma linha só, larga: rosto · nome · o que faz agora · peças do dia.
    // Cartão de duas colunas espremia a tarefa em "Impressã…" a três metros.
    return (
      <div className="glass st-linha" style={{ ["--st-i" as string]: i, display: "flex", alignItems: "center", gap: 12, padding: "5px 12px 5px 6px", borderRadius: 14, minWidth: 0 }}>
        <FotoPessoa nome={p.nome} url={p.fotoUrl} size={Math.min(fotoSize, 42)} radius={12} ausente={ausente}
          anelCor={trabalhando ? "var(--p-ok, var(--ok))" : undefined} />
        <span style={{ flex: "none", width: 96, fontSize: 17, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nome.split(/\s+/)[0]}</span>
        <span style={{ width: 8, height: 8, borderRadius: 999, flex: "none", background: statusCor }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: trabalhando ? "var(--text)" : "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {statusTxt}{p.aguardando > 0 && <span style={{ color: "var(--p-atencao, var(--atencao))", fontWeight: 800 }}> · +{p.aguardando} na fila</span>}
        </span>
        <span title={p.extra ?? undefined} style={{ flex: "none", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          <b className="stat" style={{ fontSize: 19, fontWeight: 800, color: p.pecasHoje > 0 ? "var(--text)" : "var(--text-dim)" }}>{fmt(p.pecasHoje)}</b>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", marginLeft: 4 }}>pç · {fmt(p.concluidasHoje)} concl.</span>
        </span>
      </div>
    );
  }
  return (
    <div className="glass st-linha" style={{ ["--st-i" as string]: i, display: "flex", alignItems: "center", gap: compacta ? 12 : 14, padding: compacta ? "10px 12px" : "12px 14px", borderRadius: compacta ? 16 : 18, minWidth: 0 }}>
      <FotoPessoa nome={p.nome} url={p.fotoUrl} size={compacta ? Math.min(fotoSize, 46) : fotoSize} ausente={ausente}
        anelCor={trabalhando ? "var(--p-ok, var(--ok))" : undefined} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: compacta ? 17 : 19, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{compacta ? p.nome.split(/\s+/)[0] : p.nome}</span>
          {p.aguardando > 0 && (
            <span title="aguardando" style={{ fontSize: 12.5, fontWeight: 800, color: "var(--p-atencao, var(--atencao))", whiteSpace: "nowrap" }}>+{p.aguardando}{compacta ? "" : " na fila"}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, flex: "none", background: statusCor }} />
          <span style={{ fontSize: compacta ? 13.5 : 14.5, fontWeight: 600, color: trabalhando ? "var(--text)" : "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{statusTxt}</span>
        </div>
        {!compacta && (
          <div style={{ fontSize: 13.5, color: "var(--text-dim)", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
            {p.concluidasHoje > 0 || p.pecasHoje > 0
              ? <>Hoje: <b style={{ color: "var(--text)" }}>{fmt(p.concluidasHoje)}</b> concluída{p.concluidasHoje === 1 ? "" : "s"}{p.pecasHoje > 0 && <> · <b style={{ color: "var(--text)" }}>{fmt(p.pecasHoje)}</b> peças</>}</>
              : "Sem conclusões hoje"}
            {p.extra ? <> · {p.extra}</> : null}
          </div>
        )}
      </div>
      {compacta && (
        <div title={p.extra ?? undefined} style={{ flex: "none", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          <div className="stat" style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, color: p.pecasHoje > 0 ? "var(--text)" : "var(--text-dim)" }}>{fmt(p.pecasHoje)}<span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", marginLeft: 3 }}>pç</span></div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", marginTop: 4, whiteSpace: "nowrap" }}>{fmt(p.concluidasHoje)} concl.</div>
        </div>
      )}
    </div>
  );
}

/** A fila do pool, na ordem em que o tablet vai chamar. */
export function FilaParede({ proximas, agoraMs, compacta = false }: {
  proximas: ProximaFila[]; agoraMs: number; compacta?: boolean;
}) {
  if (proximas.length === 0) {
    return (
      <div className="glass" style={{ padding: "14px 18px", borderRadius: 16, display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: "var(--text-dim)" }}>
        <Icon name="circle-check" size={20} color="var(--ok)" /> Fila vazia — nada aguardando.
      </div>
    );
  }
  const NOVA_MIN = 10;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {proximas.slice(0, compacta ? 5 : 8).map((a, i) => {
        const idadeMin = (agoraMs - new Date(a.criadaEm).getTime()) / 60000;
        const nova = idadeMin >= 0 && idadeMin < NOVA_MIN;
        return (
          <div key={a.id} className="glass st-linha" style={{ ["--st-i" as string]: i, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 14 }}>
            <span className="stat" style={{ width: 26, fontSize: 18, color: "var(--text-dim)", flex: "none", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            {a.urgente && <Icon name="flame" size={18} color="var(--perigo)" />}
            <span style={{ fontSize: 16.5, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.tarefa}</span>
            {nova && <span className="st-nova" style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".08em", padding: "2px 8px", borderRadius: 999, background: "color-mix(in srgb, var(--info) 20%, transparent)", color: "var(--info)", flex: "none" }}>NOVA</span>}
            <span style={{ marginLeft: "auto", flex: "none", fontSize: 13.5, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
              {fmt(a.quantidadeAlvo)} un{a.tempoEstimadoMin ? ` · ~${a.tempoEstimadoMin} min` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Toque curto de atenção quando uma chamada NOVA aparece — só a logística usa
 * (na produção o tablet já toca; dois sinos pro mesmo evento é ruído).
 * WebAudio puro; navegador sem gesto prévio bloqueia e o try/catch engole.
 */
export function tocarDing() {
  try {
    type JanelaComAudio = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctx = window.AudioContext || (window as JanelaComAudio).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const done = () => { void ctx.close().catch(() => {}); };
    const tom = (freq: number, t0: number) => {
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      ganho.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
      ganho.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t0 + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + 0.5);
      osc.connect(ganho).connect(ctx.destination);
      osc.start(ctx.currentTime + t0);
      osc.stop(ctx.currentTime + t0 + 0.55);
    };
    tom(880, 0);      // lá5 → dó6: duas notas subindo, "chegou coisa boa
    tom(1046.5, 0.18); // pra fazer", não alarme de incêndio.
    window.setTimeout(done, 900);
  } catch { /* sem áudio — a chamada visual continua */ }
}

/** Relógio compartilhado dos "há X min": um tick por minuto, visual. */
export function useAgoraMs(): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return agora;
}

/**
 * Dispara `tocarDing` quando aparece uma chamada com id inédito. Guarda os já
 * vistos num ref — recarregar a página não retoca (o estado nasce do primeiro
 * poll, e retocar tudo a cada F5 viraria alarme falso).
 */
export function useDingEmChamadaNova(chamadas: Chamada[], ligado: boolean) {
  const vistos = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!ligado) return;
    if (vistos.current === null) {
      vistos.current = new Set(chamadas.map((c) => c.id));
      return;
    }
    let nova = false;
    for (const c of chamadas) {
      if (!vistos.current.has(c.id)) { nova = true; vistos.current.add(c.id); }
    }
    if (nova) tocarDing();
  }, [chamadas, ligado]);
}

// ── Peças do painel de logística (desenho novo) ─────────────────────────────

/**
 * Cabeçalho do painel: marca do setor, o que a tela é, e o selo de sincronia.
 *
 * O selo não é enfeite: numa parede que fica ligada 24 h, a pergunta mais
 * frequente de quem passa é "isso aqui está vivo?".
 */
export function CabecalhoPainel({ icone, titulo, subtitulo, selo }: {
  icone: string; titulo: string; subtitulo: string; selo: string;
}) {
  return (
    <div className="glass glass-spec" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 22 }}>
      <span style={{ width: 52, height: 52, borderRadius: 16, flex: "none", display: "grid", placeItems: "center", background: "linear-gradient(160deg, var(--graf-1), color-mix(in srgb, var(--graf-1) 55%, #000))" }}>
        <Icon name={icone} size={28} color="#fff" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.05 }}>{titulo}</div>
        <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 2 }}>{subtitulo}</div>
      </div>
      <span style={{ marginLeft: "auto", flex: "none", display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 999, background: "var(--surface)", fontSize: 13.5, fontWeight: 700, color: "var(--text-dim)" }}>
        <Icon name="clock" size={16} color="var(--text-dim)" />
        {selo}
      </span>
    </div>
  );
}

/**
 * O gráfico da semana: barra por dia + média móvel por cima.
 *
 * Medidas em PIXEL e não em `cqi`/`%`: o palco do painel é fixo (720×1280) e o
 * `KioskShell` escala o conjunto inteiro. Com viewBox esticado
 * (`preserveAspectRatio="none"`), o texto e o traço distorceriam junto.
 *
 * A cor sai da RAMPA da empresa (`--graf-1`), nunca de um roxo escrito aqui —
 * trocar o destaque no painel do usuário repinta este gráfico. A curva é a
 * MESMA tinta, só mais clara: um segundo matiz faria a parede virar arco-íris
 * e nenhum dos dois significaria nada.
 */
export function GraficoEnvios({ dias, mediaMovel }: {
  dias: { rotulo: string; valor: number }[]; mediaMovel: number[];
}) {
  const W = 608, H = 258;
  const padE = 42, padD = 10, padT = 30, padB = 28;
  const larg = W - padE - padD, alt = H - padT - padB;

  const bruto = Math.max(1, ...dias.map((d) => d.valor), ...mediaMovel);
  // Teto "redondo": eixo terminando em 118 não se lê de longe, em 120 sim.
  const passo = bruto <= 50 ? 10 : bruto <= 200 ? 20 : bruto <= 500 ? 50 : 100;
  const teto = Math.ceil(bruto / passo) * passo;
  const y = (v: number) => padT + alt - (v / teto) * alt;

  const banda = dias.length ? larg / dias.length : larg;
  const larguraBarra = Math.min(46, banda * 0.56);
  const centro = (i: number) => padE + banda * i + banda / 2;
  const marcas = Array.from({ length: teto / passo + 1 }, (_, i) => i * passo)
    .filter((_, i, arr) => arr.length <= 9 || i % 2 === 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }} aria-hidden>
      {marcas.map((v) => (
        <g key={v}>
          <line className="mono-grade-linha" x1={padE} x2={W - padD} y1={y(v)} y2={y(v)} />
          <text className="mono-eixo-txt" x={padE - 10} y={y(v) + 5} textAnchor="end" style={{ fontSize: 14 }}>{v}</text>
        </g>
      ))}

      {dias.map((d, i) => {
        const topo = y(d.valor);
        const altura = Math.max(0, padT + alt - topo);
        return (
          <g key={d.rotulo + i}>
            <rect className="mono-barra" x={centro(i) - larguraBarra / 2} y={topo}
              width={larguraBarra} height={altura} rx={Math.min(10, larguraBarra / 3)}
              style={{ fill: "var(--graf-1)" }} />
            <text className="mono-eixo-txt" x={centro(i)} y={H - 8} textAnchor="middle" style={{ fontSize: 15 }}>{d.rotulo}</text>
          </g>
        );
      })}

      {mediaMovel.length > 1 && (
        <>
          <polyline
            points={mediaMovel.map((v, i) => `${centro(i)},${y(v)}`).join(" ")}
            fill="none" strokeLinecap="round" strokeLinejoin="round"
            style={{ stroke: "color-mix(in srgb, var(--graf-1) 70%, #fff)", strokeWidth: "var(--mono-traco-2, 3px)" }} />
          {mediaMovel.map((v, i) => (
            <circle key={i} cx={centro(i)} cy={y(v)} r={5.5}
              style={{ fill: "var(--p-cartao, var(--bg))", stroke: "color-mix(in srgb, var(--graf-1) 70%, #fff)", strokeWidth: 3 }} />
          ))}
        </>
      )}

      {/* O valor do dia é a última coisa pintada: num dia de barra baixa a
          curva passa exatamente onde o número mora, e quem desenha por cima
          vence. O halo (`paint-order: stroke`) abre o vão sem caixa nem
          sombra. */}
      {dias.map((d, i) => (
        <text key={"v" + i} x={centro(i)} y={y(d.valor) - 10} textAnchor="middle"
          style={{ fontSize: 17, fontWeight: 800, fill: "var(--text)", stroke: "var(--p-cartao, var(--bg))", strokeWidth: 5, paintOrder: "stroke" }}>
          {fmt(d.valor)}
        </text>
      ))}
    </svg>
  );
}

/** Legenda do gráfico: o que é barra, o que é curva. */
export function LegendaEnvios() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 16, fontSize: 13.5, color: "var(--text-dim)", fontWeight: 600 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
        <i style={{ width: 14, height: 14, borderRadius: 4, background: "var(--graf-1)" }} /> Envios (unid.)
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
        <i style={{ width: 18, height: 3, borderRadius: 999, background: "color-mix(in srgb, var(--graf-1) 70%, #fff)" }} /> Média móvel (7d)
      </span>
    </span>
  );
}

/** Uma célula do rodapé do gráfico: ícone, rótulo e o valor em destaque. */
export function ResumoCelula({ icone, rotulo, children, cor }: {
  icone: string; rotulo: string; children: React.ReactNode; cor?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0, padding: "0 4px" }}>
      <span style={{ width: 40, height: 40, borderRadius: 13, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--graf-1) 20%, transparent)" }}>
        <Icon name={icone} size={21} color={cor ?? "var(--graf-1)"} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{rotulo}</div>
        <div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.15, color: cor ?? "var(--text)", whiteSpace: "nowrap" }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Cartão de número da parede: placa de ícone, título, o número GRANDE na cor
 * do estado e o rodapé que explica.
 *
 * A cor aqui é semântica e não da rampa — vermelho quer dizer "trava", verde
 * "pronto". Trocar isso por dois tons da mesma tinta apagaria a única leitura
 * que a tela entrega a três metros.
 */
export function CartaoNumero({ icone, titulo, valor, cor, nota, notaIcone, i = 0 }: {
  icone: string; titulo: string; valor: number; cor: string;
  nota?: string; notaIcone?: string; i?: number;
}) {
  return (
    <div className="glass glass-spec st-linha" style={{
      ["--st-i" as string]: i,
      padding: "16px 18px", borderRadius: 22, display: "flex", flexDirection: "column", gap: 12, minWidth: 0,
      background: `linear-gradient(150deg, color-mix(in srgb, ${cor} 14%, transparent), transparent 62%)`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0 }}>
        <span style={{ width: 54, height: 54, borderRadius: 17, flex: "none", display: "grid", placeItems: "center", background: `linear-gradient(155deg, ${cor}, color-mix(in srgb, ${cor} 60%, #000))` }}>
          <Icon name={icone} size={28} color="#fff" />
        </span>
        <span style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.15, minWidth: 0 }}>{titulo}</span>
      </div>
      <div className="stat" style={{ fontSize: 58, lineHeight: 1, fontWeight: 800, color: cor, fontVariantNumeric: "tabular-nums" }}>
        <NumeroDaParede valor={valor} />
      </div>
      {nota && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, alignSelf: "flex-start", padding: "5px 11px", borderRadius: 999, background: "var(--surface)", fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)" }}>
          {notaIcone && <Icon name={notaIcone} size={14} color={cor} />}
          {nota}
        </span>
      )}
    </div>
  );
}

/**
 * O número que conta ao mudar. `NumeroVivo` do ERP entrega frações no meio da
 * contagem, então o formato arredonda antes — senão a parede pisca "12,438".
 */
function NumeroDaParede({ valor }: { valor: number }) {
  return <NumeroVivo valor={valor} formatar={fmt} />;
}

/**
 * Um bloco que ALTERNA entre telas, no pé do painel.
 *
 * Em pé, o painel não tem altura pra tudo: o topo (semana + os quatro
 * números) é o que exige ação e fica sempre visível; o contexto — pedidos
 * parados e quem está no galpão — se reveza aqui embaixo. Alternar UM bloco
 * não é voltar ao carrossel de sete slides: o que manda alguém levantar da
 * cadeira nunca sai da tela.
 *
 * Com uma tela só, não alterna (nem mostra o indicador).
 */
export function BlocoQueAlterna({ telas, intervaloMs = 12_000, pontos }: {
  telas: { chave: string; nó: React.ReactNode }[];
  intervaloMs?: number;
  /** Onde ficam os pontinhos de "tela X de N" (padrão: canto de cima). */
  pontos?: React.CSSProperties;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (telas.length <= 1) { setI(0); return; }
    const id = setInterval(() => setI((x) => (x + 1) % telas.length), intervaloMs);
    return () => clearInterval(id);
  }, [telas.length, intervaloMs]);
  if (telas.length === 0) return null;
  const atual = telas[Math.min(i, telas.length - 1)];
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
      {/* `key` refaz a entrada a cada troca — sem isso o conteúdo mudaria por
          baixo do pano e ninguém perceberia que a tela virou. */}
      <div key={atual.chave} className="st-troca" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {atual.nó}
      </div>
      {telas.length > 1 && (
        <div style={{ position: "absolute", top: 2, right: 0, display: "flex", gap: 5, zIndex: 1, ...pontos }}>
          {telas.map((t, k) => (
            <span key={t.chave} style={{
              width: k === i ? 16 : 6, height: 6, borderRadius: 999,
              background: k === i ? "var(--p-primaria, var(--graf-1))" : "var(--p-trilho, var(--surface-2))",
              transition: "width var(--duration-fast) var(--ease-smooth-out), background var(--duration-fast) var(--ease-smooth-out)",
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
