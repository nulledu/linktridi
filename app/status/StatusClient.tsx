"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
// Mora fora de `(plataforma)` porque a página é pública; as peças do kit
// continuam as mesmas do resto do Gaius.
import { Icon } from "../(plataforma)/Icon";
import { PageHead } from "../(plataforma)/ui/mobile";
import { Botao } from "../(plataforma)/ui/controles";
import { usePollComRecuo } from "../(plataforma)/ui/usePoll";
import { agrupar, OCORRENCIA, rotuloOcorrencia, type Flags, type Grupo, type ItemStatus, type ItemView, type Slot } from "@/lib/status-plataformas";
import { fmtDuracao, nomeDoIncidente, reais, segundosFora } from "@/lib/status-relatorio";
import type { Amostras, Incidente } from "@/lib/status-servidor";

// Tudo vem da rota do Gaius, que lê o Supabase no servidor. Quem não tem a
// chave `administracao:status` recebe só plataforma e estado; quem tem recebe
// o detalhe, a linha do tempo, a disponibilidade e o custo das quedas.
const API = "/api/status";

type Publico = { publico: true; atualizado: string | null; plataformas: { id: string; nome: string; desc: string; estado: string }[] };
type Completo = { publico: false; assinatura: string; itens: ItemStatus[]; flags: Flags | null; incidentes: Incidente[]; amostras: Record<string, Amostras>; atualizado: string | null };

const haQuanto = (iso: string | null) => {
  if (!iso) return "sem verificação ainda";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  return `há ${Math.floor(s / 3600)} h`;
};
const pct = (v: number | null) => (v == null ? "—" : `${(Math.round(v * 1000) / 10).toString().replace(".", ",")}%`);
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const diaRotulo = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const diaChave = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** Disponibilidade somando as amostras das chaves. */
function disp(amostras: Record<string, Amostras>, keys: string[]) {
  let ok7 = 0, f7 = 0, ok30 = 0, f30 = 0;
  for (const k of keys) { const a = amostras[k]; if (!a) continue; ok7 += a.ok7; f7 += a.falha7; ok30 += a.ok30; f30 += a.falha30; }
  return { d7: ok7 + f7 ? ok7 / (ok7 + f7) : null, d30: ok30 + f30 ? ok30 / (ok30 + f30) : null };
}

// Cor de ESTADO, não de gráfico: verde é "no ar" e não pode virar a cor de
// destaque da pessoa (paleta semântica, ver CLAUDE.md › cor de gráfico).
// `parcial` (parte da plataforma caiu naquela fatia) é âmbar: vermelho em toda
// fatia em que 1 de 15 funis estava fora pintava a trilha inteira com 98% no ar.
const COR_SLOT: Record<Slot, string> = { ok: "var(--ok)", falha: "var(--perigo)", parcial: "var(--atencao)", vazio: "var(--mc-trilho-bg)" };
const ROTULO = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mc-muted)" } as const;
const CARTAO = { background: "var(--mc-card)", borderRadius: 24, boxShadow: "inset 0 0 0 1px var(--mc-anel)" } as const;
const GRADE = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 14 } as const;
const GRADE_ITENS = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 10 } as const;
// O coletor gravava "Demorou 8.0 s" (ponto decimal do Python); na tela é
// vírgula. Só antes de " s": um IP ou versão no motivo não pode virar vírgula.
const decimal = (t: string) => t.replace(/(\d)\.(\d+)(?= s\b)/g, "$1,$2");

function Trilha({ slots, alto = 30 }: { slots: Slot[]; alto?: number }) {
  return (
    // Teto de 640px: num cartão aberto na largura toda, 30 fatias `flex: 1`
    // viravam bolhas de 50px. Com o teto, a trilha tem a mesma cara nos dois.
    <div aria-hidden style={{ display: "flex", gap: 3, height: alto, alignItems: "stretch", maxWidth: 640 }}>
      {slots.map((s, i) => <span key={i} style={{ flex: 1, minWidth: 2, borderRadius: 99, background: COR_SLOT[s], opacity: s === "ok" ? 0.9 : 1 }} />)}
    </div>
  );
}

function Selo({ ruim }: { ruim: boolean }) {
  const cor = ruim ? "var(--perigo)" : "var(--ok)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 8px", borderRadius: 99, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor" }} />
      {ruim ? "Com problema" : "No ar"}
    </span>
  );
}

// Queda em vermelho; aviso (lento, conteúdo mudou) em âmbar — cor de ESTADO.
// `passado`: aconteceu nos 7 dias mas não está acontecendo agora. Em cinza —
// vermelho em todo cartão de funil que está no ar fazia 11 funis parecerem
// quebrados por causa de UMA queda do Gaius de uma semana atrás.
function ChipOcorrencia({ tipo, n, passado }: { tipo: string; n?: number; passado?: boolean }) {
  const cor = passado ? "var(--mc-muted)" : (OCORRENCIA[tipo]?.queda ?? true) ? "var(--perigo)" : "var(--atencao)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>
      <Icon name="flag" size={11} color="currentColor" />
      {rotuloOcorrencia(tipo)}{n && n > 1 ? ` ×${n}` : ""}
    </span>
  );
}

function Metrica({ rotulo, valor, alinhar = "left" }: { rotulo: string; valor: string; alinhar?: "left" | "right" }) {
  return (
    <span style={{ textAlign: alinhar }}>
      <span style={{ display: "block", ...ROTULO }}>{rotulo}</span>
      <span style={{ display: "block", fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums", color: "var(--mc-forte)", lineHeight: 1.2 }}>{valor}</span>
    </span>
  );
}

// Item caído ocupa a linha toda: na coluna de 280px o motivo (com endereço
// comprido) quebrava em cinco linhas e as marcas de ocorrência empilhavam.
function Item({ it, a }: { it: ItemView; a?: Amostras }) {
  const d = a ? disp({ [it.key]: a }, [it.key]) : null;
  return (
    <div style={{ gridColumn: it.caiu ? "1 / -1" : undefined, background: "var(--mc-palco)", borderRadius: 14, boxShadow: "inset 0 0 0 1px var(--mc-anel)", padding: 14, display: "grid", gap: 10, minWidth: 0,
      outline: it.caiu ? "1px solid color-mix(in srgb, var(--perigo) 45%, transparent)" : undefined }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 6, flex: "none", background: it.caiu ? "var(--perigo)" : "var(--ok)" }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 650, color: "var(--mc-forte)", overflowWrap: "anywhere" }}>{it.nome}</div>
          <div style={{ fontSize: 12, color: "var(--mc-muted)", marginTop: 2 }}>
            {[it.ms != null ? `${it.ms} ms` : null, `verificado ${haQuanto(it.quando)}`].filter(Boolean).join(" · ")}
          </div>
          {it.caiu && <div style={{ fontSize: 12.5, color: "var(--perigo)", marginTop: 4, overflowWrap: "anywhere", maxWidth: "70ch" }}>{decimal(it.motivo)}</div>}
          {it.flags && it.flags.ocorrencias7d > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 6 }} title="Ocorrências nos últimos 7 dias">
              <span style={{ fontSize: 11, color: "var(--mc-muted)", marginRight: 2 }}>7 dias:</span>
              {Object.entries(it.flags.porTipo).map(([t, n]) => <ChipOcorrencia key={t} tipo={t} n={n} passado={!it.caiu || it.flags?.atual !== t} />)}
            </div>
          )}
        </div>
        {d && (
          <span style={{ flex: "none", textAlign: "right", fontVariantNumeric: "tabular-nums" }} title="Disponibilidade nos últimos 7 e 30 dias">
            <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--mc-forte)" }}>{pct(d.d7)}</span>
            <span style={{ display: "block", fontSize: 11, color: "var(--mc-muted)" }}>30 d {pct(d.d30)}</span>
          </span>
        )}
      </div>
      <Trilha slots={it.trilha} alto={20} />
    </div>
  );
}

function Cartao({ g, amostras, aberto, onToggle }: { g: Grupo; amostras: Record<string, Amostras>; aberto: boolean; onToggle: () => void }) {
  const ruim = g.caidos.length > 0;
  const [verOutros, setVerOutros] = useState(false);
  const bons = g.itens.filter((it) => !it.caiu);
  const d = disp(amostras, g.itens.map((it) => it.key));
  const conta = ruim
    ? (g.itens.length === 1 ? "Fora do ar" : `${g.caidos.length} de ${g.itens.length} com problema`)
    : (g.itens.length === 1 ? "1 verificação" : `${g.itens.length} verificações`);

  return (
    <article className="t-acc" data-open={aberto}
      style={{ gridColumn: aberto ? "1 / -1" : undefined, minWidth: 0, ...CARTAO, overflow: "hidden",
        boxShadow: ruim ? "inset 0 0 0 1px color-mix(in srgb, var(--perigo) 50%, transparent)" : CARTAO.boxShadow }}>
      <button type="button" onClick={onToggle} aria-expanded={aberto} aria-controls={`plat-${g.id}`}
        style={{ width: "100%", textAlign: "left", padding: 18, background: "none", border: 0, color: "inherit", cursor: "pointer", display: "grid", gap: 14, boxShadow: "none" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${ruim ? "var(--perigo)" : "var(--ok)"} 14%, transparent)` }}>
            <Icon name={ruim ? "alert-triangle" : "circle-check"} size={18} color={ruim ? "var(--perigo)" : "var(--ok)"} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 16, fontWeight: 700, letterSpacing: "-.01em", color: "var(--mc-forte)", overflowWrap: "anywhere" }}>{g.nome}</span>
            {g.desc && <span style={{ display: "block", fontSize: 12.5, color: "var(--mc-muted)", marginTop: 1 }}>{g.desc}</span>}
          </span>
          <Selo ruim={ruim} />
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ display: "flex", gap: 22 }}>
            <Metrica rotulo="7 dias" valor={pct(d.d7)} />
            <Metrica rotulo="30 dias" valor={pct(d.d30)} />
          </span>
          {g.msMedio != null && <Metrica rotulo="Resposta" valor={`${g.msMedio} ms`} alinhar="right" />}
        </div>

        <Trilha slots={g.trilha} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: ruim ? "var(--perigo)" : "var(--mc-muted)" }}>
          <span style={{ fontWeight: ruim ? 700 : 500 }}>
            {conta} · {haQuanto(g.quando)}
            {g.ocorrencias7d > 0 && <span style={{ color: "var(--atencao)", fontWeight: 700 }}> · {g.ocorrencias7d === 1 ? "1 ocorrência" : `${g.ocorrencias7d} ocorrências`} em 7 dias</span>}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--mc-muted)", fontWeight: 600, minHeight: 24 }}>
            {aberto ? "Fechar" : "Detalhes"}
            <span className="t-acc-chevron"><Icon name="chevron-down" size={16} color="currentColor" /></span>
          </span>
        </div>
      </button>

      <div className="t-acc-panel" id={`plat-${g.id}`}>
        <div className="t-acc-panel-inner">
          <div style={{ padding: "0 18px 18px", display: "grid", gap: 10 }}>
            {g.ultimas.length > 0 && (
              <div style={{ background: "var(--mc-palco)", borderRadius: 14, boxShadow: "inset 0 0 0 1px var(--mc-anel)", padding: "10px 14px", minWidth: 0 }}>
                <div style={{ ...ROTULO, marginBottom: 4 }}>Ocorrências nos últimos 7 dias</div>
                {g.ultimas.map((o, i) => (
                  <div key={`${o.em}-${o.nome}-${i}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderTop: i ? "1px solid var(--mc-linha)" : undefined, fontSize: 12.5, minWidth: 0 }}>
                    <span style={{ color: "var(--mc-muted)", fontVariantNumeric: "tabular-nums" }}>{diaRotulo(o.em)} {hora(o.em)}</span>
                    <ChipOcorrencia tipo={o.tipo} />
                    <span style={{ fontWeight: 650, color: "var(--mc-forte)", overflowWrap: "anywhere" }}>{o.nome}</span>
                    <span style={{ color: "var(--mc-muted)", overflowWrap: "anywhere", flexBasis: "100%" }}>{decimal(o.detalhe)}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Caiu 1 de 14: abre com o 1. Os 13 que estão bem ficam atrás de
                um botão, senão a queda some no meio da lista. */}
            {ruim && bons.length > 0 ? (
              <>
                <div style={GRADE_ITENS}>{g.caidos.map((it) => <Item key={it.key} it={it} a={amostras[it.key]} />)}</div>
                <button type="button" onClick={() => setVerOutros((v) => !v)} aria-expanded={verOutros}
                  style={{ minHeight: "var(--tap)", border: 0, borderRadius: 14, background: "var(--mc-trilho-bg)", color: "var(--mc-muted)", fontSize: 13, fontWeight: 650, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "none" }}>
                  {verOutros ? "Esconder os que estão no ar" : bons.length === 1 ? "Ver o outro, que está no ar" : `Ver os outros ${bons.length} no ar`}
                  <Icon name={verOutros ? "chevron-up" : "chevron-down"} size={15} color="currentColor" />
                </button>
                {verOutros && <div style={GRADE_ITENS}>{bons.map((it) => <Item key={it.key} it={it} a={amostras[it.key]} />)}</div>}
              </>
            ) : (
              <div style={GRADE_ITENS}>{g.itens.map((it) => <Item key={it.key} it={it} a={amostras[it.key]} />)}</div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Linha do tempo: 30 dias de quedas, por dia, a mais recente em cima. */
function LinhaDoTempo({ incidentes }: { incidentes: Incidente[] }) {
  const [tudo, setTudo] = useState(false);
  const lista = tudo ? incidentes : incidentes.slice(0, 12);
  const dias: [string, Incidente[]][] = [];
  for (const i of lista) {
    const k = diaChave(i.inicio);
    const ult = dias[dias.length - 1];
    if (ult && ult[0] === k) ult[1].push(i); else dias.push([k, [i]]);
  }
  const custoTotal = incidentes.reduce((s, i) => s + (i.custo ?? 0), 0);
  return (
    <section style={{ ...CARTAO, padding: 18, marginTop: 14, minWidth: 0 }} aria-label="Linha do tempo">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--mc-forte)" }}>Linha do tempo</div>
          <div style={{ fontSize: 12.5, color: "var(--mc-muted)" }}>
            {incidentes.length === 0 ? "Nenhuma queda nos últimos 30 dias." : `${incidentes.length === 1 ? "1 queda" : `${incidentes.length} quedas`} nos últimos 30 dias`}
            {custoTotal > 0 && ` · ~${reais(custoTotal)} gastos em anúncio com o funil fora (estimativa)`}
          </div>
        </div>
      </div>
      {dias.map(([k, itens]) => (
        <div key={k} style={{ marginTop: 10 }}>
          <div style={{ ...ROTULO, marginBottom: 4 }}>{diaRotulo(itens[0].inicio)}</div>
          {itens.map((i) => {
            const aberto = !i.fim;
            return (
              <div key={i.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px", padding: "10px 0", borderTop: "1px solid var(--mc-linha)", minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 6, background: aberto ? "var(--perigo)" : "var(--mc-muted)" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 650, fontSize: 13.5, color: "var(--mc-forte)", overflowWrap: "anywhere" }}>{nomeDoIncidente(i)}</span>
                    {i.tipo && <ChipOcorrencia tipo={i.tipo} />}
                    {aberto && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--perigo)" }}>em andamento</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--mc-muted)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                    {aberto
                      ? `Caiu às ${hora(i.inicio)} · fora há ${fmtDuracao(segundosFora(i))}`
                      : `Ficou fora ${fmtDuracao(segundosFora(i))}, das ${hora(i.inicio)} às ${hora(i.fim!)}`}
                    {i.custo ? ` · ~${reais(i.custo)} em anúncio` : ""}
                  </div>
                  {i.motivo && <div style={{ fontSize: 12.5, color: "var(--mc-muted)", overflowWrap: "anywhere" }}>{decimal(i.motivo)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {incidentes.length > 12 && (
        <button type="button" onClick={() => setTudo((v) => !v)}
          style={{ marginTop: 10, width: "100%", minHeight: "var(--tap)", border: 0, borderRadius: 14, background: "var(--mc-trilho-bg)", color: "var(--mc-muted)", fontSize: 13, fontWeight: 650, cursor: "pointer", boxShadow: "none" }}>
          {tudo ? "Mostrar só as recentes" : `Ver as ${incidentes.length} quedas`}
        </button>
      )}
    </section>
  );
}

function VisaoPublica({ d }: { d: Publico }) {
  return (
    <>
      <div style={GRADE}>
        {d.plataformas.map((p) => {
          const ruim = p.estado === "caiu";
          return (
            <div key={p.id} style={{ ...CARTAO, padding: 18, display: "flex", alignItems: "center", gap: 12, minWidth: 0,
              boxShadow: ruim ? "inset 0 0 0 1px color-mix(in srgb, var(--perigo) 50%, transparent)" : CARTAO.boxShadow }}>
              <span style={{ width: 36, height: 36, borderRadius: 11, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${ruim ? "var(--perigo)" : "var(--ok)"} 14%, transparent)` }}>
                <Icon name={ruim ? "alert-triangle" : "circle-check"} size={18} color={ruim ? "var(--perigo)" : "var(--ok)"} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 16, fontWeight: 700, color: "var(--mc-forte)", overflowWrap: "anywhere" }}>{p.nome}</span>
                {p.desc && <span style={{ display: "block", fontSize: 12.5, color: "var(--mc-muted)" }}>{p.desc}</span>}
              </span>
              <Selo ruim={ruim} />
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--mc-muted)", marginTop: 16 }}>
        O detalhe de cada item (funis, histórico, disponibilidade) aparece pra quem está logado no Gaius. <Link href="/login?next=/status" style={{ color: "var(--primary-texto, var(--primary))", fontWeight: 650 }}>Entrar</Link>
      </p>
    </>
  );
}

/** fetch com prazo. Sem ele, uma resposta que nunca chega deixava a página em
 *  "Conferindo…" pra sempre, sem erro e sem saída. AbortController à mão (e não
 *  AbortSignal.timeout) porque Safari antigo e o jsdom dos testes não têm. */
async function buscarComPrazo(url: string, ms = 15_000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { cache: "no-store", signal: c.signal }); }
  finally { clearTimeout(t); }
}

export function StatusClient() {
  const [dados, setDados] = useState<Publico | Completo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [atualizado, setAtualizado] = useState<Date | null>(null);
  // Aberta/fechada pela pessoa, POR ESTADO: fechar o gedux quando estava tudo
  // bem não pode esconder a queda que chegar depois.
  const [escolha, setEscolha] = useState<Record<string, boolean>>({});
  const assinatura = useRef("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await buscarComPrazo(assinatura.current ? `${API}?assinatura=${assinatura.current}` : API);
      if (!r.ok) throw new Error(`erro ${r.status}`);
      // Sessão vencida já voltou HTML de login com 200 no Gaius: o JSON quebra aqui.
      const d = await r.json().catch(() => { throw new Error("resposta inesperada do servidor"); });
      setErro(null);
      setAtualizado(new Date());
      if (d?.mudou === false) return false; // tick vazio: nada mudou
      if (d?.publico === false) assinatura.current = d.assinatura ?? "";
      setDados(d);
      return true;
    } catch (e) {
      const motivo = (e as Error)?.name === "AbortError" ? "demorou demais pra responder" : (e as Error)?.message || "sem conexão";
      setErro(motivo);
      console.warn("[status] não carregou:", motivo);
      return false;
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  // Parada, a tela recua até 5 min; qualquer toque devolve 1 min.
  usePollComRecuo(carregar, 60_000, 300_000);

  const completo = dados && dados.publico === false ? dados : null;
  const grupos = completo ? agrupar(completo.itens, completo.flags) : null;
  const ruins = completo
    ? (grupos ?? []).filter((g) => g.caidos.length).map((g) => g.nome)
    : (dados as Publico | null)?.plataformas.filter((p) => p.estado === "caiu").map((p) => p.nome) ?? [];
  const nPlat = completo ? grupos!.length : (dados as Publico | null)?.plataformas.length ?? 0;
  const manchete = !dados ? "Conferindo…" : ruins.length === 0 ? "Tudo no ar"
    : ruins.length === 1 ? `${ruins[0]} com problema` : `${ruins.length} plataformas com problema`;

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", width: "100%" }}>
      <PageHead title="Status"
        sub={atualizado ? `Tudo de que a Tridi depende · atualizado às ${atualizado.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Tudo de que a Tridi depende"}
        right={<Botao variante="secundario" icone="refresh" carregando={carregando} onClick={() => { assinatura.current = ""; carregar(); }}>Atualizar</Botao>} />

      <section aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, padding: "18px 20px", ...CARTAO,
        boxShadow: ruins.length ? "inset 0 0 0 1px color-mix(in srgb, var(--perigo) 50%, transparent)" : CARTAO.boxShadow }}>
        <span style={{ width: 44, height: 44, borderRadius: 14, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${ruins.length ? "var(--perigo)" : "var(--ok)"} 14%, transparent)` }}>
          <Icon name={ruins.length ? "alert-triangle" : "circle-check"} size={22} color={ruins.length ? "var(--perigo)" : "var(--ok)"} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", color: "var(--mc-forte)" }}>{manchete}</div>
          <div style={{ fontSize: 13, color: "var(--mc-muted)" }}>
            {dados ? `${nPlat} plataformas${completo ? ` · ${completo.itens.length} verificações` : ""}` : "Lendo as verificações"}
            {erro && ` · ${erro}, tentando de novo`}
          </div>
        </div>
      </section>

      {!dados && erro && (
        <div role="alert" style={{ ...CARTAO, padding: 28, color: "var(--mc-muted)", textAlign: "center", fontSize: 14, display: "grid", gap: 12, justifyItems: "center" }}>
          <span>Não deu pra ler as verificações agora ({erro}). Tentando de novo sozinho em 1 minuto.</span>
          <Botao variante="secundario" icone="refresh" carregando={carregando} onClick={() => { assinatura.current = ""; carregar(); }}>Tentar de novo</Botao>
        </div>
      )}

      {dados?.publico === true && <VisaoPublica d={dados} />}

      {completo && grupos && (
        <>
          <div style={{ ...GRADE, gridAutoFlow: "dense" }}>
            {grupos.map((g) => {
              const chave = `${g.id}:${g.caidos.length ? "ruim" : "ok"}`;
              const aberto = chave in escolha ? escolha[chave] : g.caidos.length > 0;
              return <Cartao key={g.id} g={g} amostras={completo.amostras} aberto={aberto} onToggle={() => setEscolha((e) => ({ ...e, [chave]: !aberto }))} />;
            })}
          </div>
          <LinhaDoTempo incidentes={completo.incidentes} />
        </>
      )}
    </div>
  );
}
