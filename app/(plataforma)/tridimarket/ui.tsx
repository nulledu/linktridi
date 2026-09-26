"use client";

// Peças visuais compartilhadas pelas telas do workspace TridiMarket.
// Tudo aqui usa os tokens do Gaius (--surface/--text/--border/--tf-*), então
// claro e escuro saem de graça e nada precisa de cor fixa por tema.
import { Icon } from "../Icon";
import { TrocaIcone } from "../ui/micro";

// Acento do TridiMarket = o MESMO roxo do sistema (var(--primary-texto)), não mais o índigo
// da marca. Casa o painel com o resto do ERP, como pedido.
export const INDIGO = "var(--primary-texto)";

export function Card({ children, style, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)",
        padding: 18, minWidth: 0, ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PanelTitle({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
      <div style={{ minWidth: 0 }}>
        <strong style={{ fontSize: 15, fontWeight: 750, color: "var(--text)", letterSpacing: "-.01em" }}>{title}</strong>
        {hint && <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>{hint}</div>}
      </div>
      {right}
    </div>
  );
}

// Cartão de número. `delta` é a variação contra o período anterior de MESMO
// tamanho — só aparece quando faz sentido comparar (métricas de fluxo).
export function Stat({ label, value, hint, tone, delta, icon }: {
  label: string; value: string; hint?: string;
  tone?: "pos" | "neg" | "warn" | "neutral";
  delta?: number | null; icon?: string;
}) {
  const cor = tone === "pos" ? "var(--tf-pos)" : tone === "neg" ? "var(--tf-neg)" : tone === "warn" ? "var(--tf-warn)" : "var(--text)";
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600 }}>{label}</span>
        {icon && <Icon name={icon} size={16} color="var(--text-dim)" />}
      </div>
      <strong style={{ display: "block", fontSize: 26, fontWeight: 800, color: cor, letterSpacing: "-.02em", marginTop: 8, lineHeight: 1.1 }}>{value}</strong>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, flexWrap: "wrap" }}>
        {delta != null && Number.isFinite(delta) && <Delta value={delta} />}
        {hint && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{hint}</span>}
      </div>
    </Card>
  );
}

function Delta({ value }: { value: number }) {
  const zero = Math.abs(value) < 0.005;
  const sobe = value > 0;
  const cor = zero ? "var(--tf-neutral)" : sobe ? "var(--tf-pos)" : "var(--tf-neg)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color: cor,
      background: `color-mix(in srgb, ${cor} 12%, transparent)`, padding: "2px 7px", borderRadius: 999,
    }}>
      {!zero && <TrocaIcone ligado={sobe} a="trending-down" b="trending-up" size={12} corA={cor} corB={cor} />}
      {zero ? "estável" : `${sobe ? "+" : ""}${Math.round(value * 100)}%`}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "pos" | "neg" | "warn" | "neutral" | "info" }) {
  const cor = tone === "pos" ? "var(--tf-pos)" : tone === "neg" ? "var(--tf-neg)" : tone === "warn" ? "var(--tf-warn)" : tone === "info" ? "var(--tf-info)" : "var(--tf-neutral)";
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)`,
      padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

// ── Esqueleto de carregamento ───────────────────────────────────────────────
// Enquanto os dados não chegam, a tela mostra a FORMA do que vem — em vez de
// um vazio que parece erro, ou de números velhos que parecem atuais.
export function Skel({ h = 16, w = "100%", r = 8, style }: { h?: number; w?: number | string; r?: number; style?: React.CSSProperties }) {
  return <div className="tm-skel" style={{ height: h, width: w, borderRadius: r, ...style }} />;
}

export function SkelStats({ n = 6 }: { n?: number }) {
  return (
    <div className="tm-stats" style={{ marginBottom: 14 }}>
      {Array.from({ length: n }, (_, i) => (
        <Card key={i} style={{ padding: 16 }}>
          <Skel h={12} w="55%" />
          <Skel h={26} w="72%" style={{ marginTop: 10 }} />
          <Skel h={11} w="40%" style={{ marginTop: 8 }} />
        </Card>
      ))}
    </div>
  );
}

export function SkelLinhas({ n = 6, altura = 30 }: { n?: number; altura?: number }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
          <Skel h={altura} w={altura} r={altura / 2} />
          <div style={{ flex: 1 }}>
            <Skel h={13} w={`${55 + (i % 3) * 12}%`} />
            <Skel h={10} w="34%" style={{ marginTop: 6 }} />
          </div>
          <Skel h={14} w={62} />
        </div>
      ))}
    </div>
  );
}

export function SkelTabela({ n = 8, colunas = 6 }: { n?: number; colunas?: number }) {
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", display: "flex", gap: 16 }}>
        {Array.from({ length: colunas }, (_, i) => <Skel key={i} h={11} w={`${100 / colunas}%`} />)}
      </div>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ padding: "12px 16px", display: "flex", gap: 16, alignItems: "center", borderTop: "1px solid var(--border)" }}>
          <Skel h={28} w={28} r={14} />
          {Array.from({ length: colunas - 1 }, (_, j) => <Skel key={j} h={13} w={`${100 / colunas}%`} />)}
        </div>
      ))}
    </Card>
  );
}

export function Empty({ icon, title, text }: { icon: string; title: string; text?: string }) {
  return (
    <div style={{ display: "grid", placeItems: "center", gap: 6, padding: "30px 12px", textAlign: "center" }}>
      <Icon name={icon} size={26} color="var(--text-dim)" />
      <strong style={{ fontSize: 13.5, color: "var(--text)" }}>{title}</strong>
      {text && <span style={{ fontSize: 12, color: "var(--text-dim)", maxWidth: 320 }}>{text}</span>}
    </div>
  );
}

export function Avatar({ name, url, size = 30 }: { name: string; url?: string | null; size?: number }) {
  const iniciais = name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "none" }} />;
  }
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center",
      background: `color-mix(in srgb, ${INDIGO} 15%, transparent)`, color: INDIGO,
      fontSize: size * 0.36, fontWeight: 800,
    }}>{iniciais}</span>
  );
}

// "há 3 min" / "há 2 h" / "ontem". Datas absolutas em painel operacional
// obrigam a pessoa a fazer conta de cabeça pra saber se algo está velho.
export function haQuantoTempo(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export async function marketRequest<T>(path: string, init?: RequestInit): Promise<T> {
  // Teto de tempo por chamada. Sem isto, uma requisição que trava (função
  // serverless em cold start, rede engasgada) fica PENDURADA para sempre — e a
  // tela que espera por ela mostra o esqueleto infinitamente. Com o abort, ela
  // falha com mensagem clara e a tela consegue oferecer "tentar de novo".
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 30_000);
  try {
    const res = await fetch(`/api/tridimarket/${path}`, {
      ...init,
      signal: controle.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const payload = await res.json().catch(() => null);
    // Falta de permissão tem mensagem PRÓPRIA. Acontece quando o acesso é
    // revogado com a tela já aberta: o servidor passa a responder 401/403 e,
    // sem este caso, a pessoa via um "unauthorized" cru e achava que o
    // sistema tinha quebrado.
    if (res.status === 401 || res.status === 403) {
      throw new Error("Ops, parece que você não tem permissão para acessar isso.");
    }
    if (!res.ok || !payload?.ok) {
      // O corpo do erro vai junto: só a `error` crua ("codigo_barras_em_uso")
      // não diz DE QUEM é o código repetido, e é isso que a tela precisa pra
      // perguntar se a pessoa quer mesmo repetir.
      const falha = new Error(payload?.error || "Não foi possível carregar o TridiMarket.");
      (falha as Error & { payload?: unknown }).payload = payload;
      throw falha;
    }
    return payload.data as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("A conexão demorou demais. Tente atualizar.");
    }
    throw e;
  } finally {
    clearTimeout(limite);
  }
}
