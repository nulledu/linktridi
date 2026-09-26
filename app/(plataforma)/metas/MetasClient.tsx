"use client";

// ── Metas ────────────────────────────────────────────────────────────────────
// Meta é ALVO: ela só quer dizer alguma coisa ao lado do realizado. Por isso o
// lugar dela é dentro de "Produtividade & metas" (`MetasDaEquipe` e a barra na
// linha de cada pessoa); esta rota solta continua existindo para quem chega por
// link direto.
//
// O formulário de criação virou painel lateral: meta se cria uma vez e se
// acompanha todo dia, então sete campos abertos na tela cobravam o custo da
// criação de quem só veio conferir.

import { useMemo, useState, type CSSProperties } from "react";
import type { MetaProgresso } from "@/lib/metas";
import { METRICAS, PERIODOS, SETORES, metricaByKey } from "@/lib/metas-catalog";
import { Icon } from "../Icon";
import { GlassSelect } from "../GlassPicker";
import { Momento } from "../ui/Momento";
import { Acoes, Botao, Campo, Campos, Esp, PainelLateral } from "../ui/controles";
import { Fila, NumeroVivo } from "../ui/micro";
import { MonoRoundedGaugeArc } from "../ui/monocharts/MonoRoundedGaugeArc";

interface ErpUser { id: string; nome: string }

export function MetasClient({ initial, canManage, colaboradores = [] }: { initial: MetaProgresso[]; canManage: boolean; colaboradores?: ErpUser[] }) {
  const [metas, setMetas] = useState<MetaProgresso[]>(initial);
  const [criando, setCriando] = useState(false);

  async function remover(id: string) {
    setMetas((p) => p.filter((m) => m.id !== id));
    await fetch(`/api/metas?id=${id}`, { method: "DELETE" });
  }

  const batidas = metas.filter((m) => m.bateu).length;
  const equipe = metas.filter((m) => !m.colaborador_id);
  const equipePorSetor = [...new Set(equipe.map((m) => m.setor || "Geral"))]
    .map((s) => ({ setor: s, metas: equipe.filter((m) => (m.setor || "Geral") === s) }));
  const individuais = [...metas.filter((m) => m.colaborador_id)]
    .sort((a, b) => Number(b.bateu) - Number(a.bateu) || b.pct - a.pct || b.atual - a.atual);

  return (
    <div style={{ maxWidth: 1080 }}>
      <div className="page-head">
        <h1>Metas</h1>
        <p style={{ color: "var(--text-dim)", marginTop: 4 }}>
          <span className="desk-only">Metas por setor — diárias, semanais e mensais. Progresso ao vivo do ERP. </span>
          {metas.length > 0 && <strong style={{ color: "var(--ok)" }}>{batidas}/{metas.length} batidas.</strong>}
        </p>
      </div>

      {canManage && (
        <Botao variante="primario" icone="plus" onClick={() => setCriando(true)}>Nova meta</Botao>
      )}

      {metas.length === 0 && (
        <div className="glass" style={{ borderRadius: "var(--r-md)", marginTop: 18 }}>
          <Momento icone="target" titulo="Nenhuma meta ainda"
            texto={canManage
              ? "Crie a primeira acima. O progresso vem do próprio ERP — ninguém precisa atualizar número na mão."
              : "Quando a gestão criar metas do seu setor, o progresso aparece aqui."} />
        </div>
      )}
      {equipePorSetor.map((g) => (
        <Secao key={g.setor} titulo={`Metas de equipe · ${g.setor}`} metas={g.metas} canManage={canManage} onDelete={remover} />
      ))}
      <Secao titulo="Metas individuais — ranking" metas={individuais} canManage={canManage} onDelete={remover} rank />

      {criando && (
        <MetaDrawer colaboradores={colaboradores} onFechar={() => setCriando(false)}
          onCriada={(m) => { setMetas((p) => [m, ...p]); setCriando(false); }} />
      )}
    </div>
  );
}

// ── Criar meta (painel lateral) ──────────────────────────────────────────────
export function MetaDrawer({ colaboradores, onFechar, onCriada }: {
  colaboradores: ErpUser[];
  onFechar: () => void;
  onCriada: (m: MetaProgresso) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [metrica, setMetrica] = useState(METRICAS[0].key);
  const [periodicidade, setPeriodicidade] = useState("mensal");
  const [alvo, setAlvo] = useState("");
  const [colab, setColab] = useState("");   // "" = equipe/setor
  const [setor, setSetor] = useState(metricaByKey(METRICAS[0].key)?.setor || "Geral");
  const [busy, setBusy] = useState(false);

  const suportaIndividual = useMemo(() => !!metricaByKey(metrica)?.individual, [metrica]);
  const pronto = titulo.trim().length > 0 && Number(alvo) > 0;

  async function criar() {
    if (!pronto || busy) return;
    setBusy(true);
    try {
      const colObj = colaboradores.find((c) => c.id === colab);
      const r = await fetch("/api/metas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo, metrica, periodicidade, alvo: Number(alvo), setor,
          colaborador_id: suportaIndividual && colab ? colab : null,
          colaborador_nome: colObj?.nome ?? null,
        }),
      });
      const d = await r.json();
      if (r.ok && d.meta) onCriada({ ...d.meta, atual: 0, pct: 0, bateu: false, janelaLabel: "" });
    } finally { setBusy(false); }
  }

  return (
    <PainelLateral titulo="Nova meta" subtitulo="o alvo; o progresso vem sozinho do ERP" largura={480} onFechar={onFechar}
      rodape={
        <Acoes>
          <Botao variante="sutil" onClick={onFechar}>Cancelar</Botao>
          <Esp />
          <Botao variante="primario" icone="target" onClick={criar} disabled={!pronto} carregando={busy}>Criar meta</Botao>
        </Acoes>
      }>
      <Campos min={190}>
        <Campo label="Título" largo dica="O nome que aparece no acompanhamento.">
          {(id) => <input id={id} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Meta de vetores" />}
        </Campo>
        <Campo label="Métrica" largo dica="De onde o número sai — ninguém atualiza na mão.">
          {(id) => (
            <GlassSelect id={id} value={metrica}
              onChange={(k) => { setMetrica(k); const def = metricaByKey(k); if (def) setSetor(def.setor); if (!def?.individual) setColab(""); }}
              options={METRICAS.map((m) => ({ value: m.key, label: `${m.label} · ${m.setor}` }))} />
          )}
        </Campo>
        <Campo label="Setor">{(id) => <GlassSelect id={id} value={setor} onChange={setSetor} options={SETORES.map((s) => ({ value: s, label: s }))} />}</Campo>
        <Campo label="Periodicidade">{(id) => <GlassSelect id={id} value={periodicidade} onChange={setPeriodicidade} options={PERIODOS.map((p) => ({ value: p.key, label: p.label }))} />}</Campo>
        <Campo label="Alvo">{(id) => <input id={id} type="number" min={1} value={alvo} onChange={(e) => setAlvo(e.target.value)} placeholder="0" />}</Campo>
        <Campo label="Escopo" dica={suportaIndividual ? "Equipe inteira ou uma pessoa." : "Esta métrica só mede por equipe/setor."}>
          {(id) => (
            <GlassSelect id={id} value={colab} onChange={setColab} disabled={!suportaIndividual} placeholder="Equipe / setor"
              options={[{ value: "", label: "Equipe / setor" }, ...(suportaIndividual ? colaboradores.map((c) => ({ value: c.id, label: c.nome })) : [])]} />
          )}
        </Campo>
      </Campos>
    </PainelLateral>
  );
}

// ── Metas de equipe, compactas ───────────────────────────────────────────────
// Dentro de Produtividade a meta não é um cartão de 320px: é a régua ao lado do
// número realizado. Uma linha por meta, barra e percentual.
export function MetasDaEquipe({ metas, podeGerir, onRemover }: {
  metas: MetaProgresso[];
  podeGerir: boolean;
  onRemover: (id: string) => void;
}) {
  const daEquipe = metas.filter((m) => !m.colaborador_id);
  if (daEquipe.length === 0) return null;

  async function remover(m: MetaProgresso) {
    onRemover(m.id);
    await fetch(`/api/metas?id=${m.id}`, { method: "DELETE" });
  }

  return (
    <div className="glass" style={{ borderRadius: "var(--r-md)", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <Icon name="target" size={16} color="var(--text-dim)" />
        <strong style={{ fontSize: 13.5, color: "var(--text)" }}>Metas de equipe</strong>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>· o alvo do período</span>
      </div>
      {/* `Fila` escalona a entrada das linhas: "as metas chegaram" em vez de
          "apareceram". O `--mt-i` cai no style de cada filho. */}
      <Fila style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {daEquipe.map((m) => {
          const cor = m.bateu ? "var(--ok)" : m.pct >= 70 ? "var(--atencao)" : "var(--primary-texto, var(--primary))";
          return (
            <div key={m.id} className="mt-linha" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 4, padding: "5px 7px", borderRadius: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: "1 1 140px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.titulo}
                <span style={{ fontWeight: 400, color: "var(--text-dim)" }}> · {m.setor} · {m.janelaLabel || m.periodicidade}</span>
              </span>
              <span className="stat" style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: "none" }}>
                <NumeroVivo valor={m.atual} /><span style={{ color: "var(--text-dim)", fontWeight: 400 }}>/{m.alvo}</span>
              </span>
              <Regua pct={m.pct} cor={cor} />
              <NumeroVivo
                className="stat" valor={m.pct} formatar={(n) => `${Math.round(n)}%`}
                style={{ fontSize: 12.5, fontWeight: 800, color: cor, flex: "none", minWidth: 38, textAlign: "right" }}
              />
              {m.bateu && <span style={{ flex: "none", fontSize: 10.5, fontWeight: 800, color: "var(--ok)", background: "color-mix(in srgb, var(--ok) 16%, transparent)", borderRadius: 999, padding: "2px 8px" }}>bateu</span>}
              {podeGerir && (
                <button onClick={() => remover(m)} aria-label={`Excluir a meta ${m.titulo}`}
                  style={{ flex: "none", display: "grid", placeItems: "center", background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 0, minWidth: 28, minHeight: 28 }}>
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          );
        })}
      </Fila>
    </div>
  );
}

/**
 * Régua de progresso em PÍLULA — a mesma assinatura das barras do conjunto
 * mono-rounded. O raio é maior que a metade da altura, então a ponta fecha
 * redonda em vez de terminar em bisel.
 *
 * A largura muda com o token de duração média (o dado chegando é "abrir", não
 * "sair da frente"). Antes era `.4s var(--ease-entra)` escrito à mão em cada
 * arquivo, e os dois valores já divergiam entre esta tela e o card.
 */
function Regua({ pct, cor }: { pct: number; cor: string }) {
  return (
    <span style={{ flex: "1 1 120px", minWidth: 80, height: 7, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
      <span style={{
        display: "block", width: `${Math.min(100, pct)}%`, height: "100%", background: cor, borderRadius: 999,
        transition: "width var(--duration-medium) var(--ease-smooth-out)",
      }} />
    </span>
  );
}

function Secao({ titulo, metas, canManage, onDelete, rank }: { titulo: string; metas: MetaProgresso[]; canManage: boolean; onDelete: (id: string) => void; rank?: boolean }) {
  if (metas.length === 0) return null;
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 4, letterSpacing: "-0.01em" }}>{titulo}</h2>
      <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: 14, marginTop: 10 }}>
        {metas.map((m, i) => <MetaCard key={m.id} m={m} canManage={canManage} onDelete={onDelete} pos={rank ? i + 1 : undefined} />)}
      </Fila>
    </>
  );
}

/**
 * Cartão de meta. O corpo é um MEDIDOR, não uma barra: meta é progresso de 0 a
 * 100% e o arco diz de relance quanto falta, coisa que uma barra de 9px de
 * altura só entrega depois que a pessoa compara duas larguras.
 *
 * O arco recebe `pct` sobre 100 — e não `atual/alvo` — de propósito: quem faz a
 * conta da meta é o servidor, e derivar a fração de novo aqui abriria a chance
 * do desenho e do número escritos ao lado discordarem por arredondamento.
 *
 * A cor é de ESTADO (bateu / perto / andando), então vem da paleta semântica e
 * não da rampa `--graf-*`: verde aqui significa "bateu" e não pode virar rosa
 * porque alguém trocou o destaque no painel.
 */
export function MetaCard({ m, canManage, onDelete, pos, style }: { m: MetaProgresso; canManage: boolean; onDelete: (id: string) => void; pos?: number; style?: CSSProperties }) {
  const cor = m.bateu ? "var(--ok)" : m.pct >= 70 ? "var(--atencao)" : "var(--primary-texto)";
  return (
    <div
      className="glass glass-spec mt-eleva"
      // `style` por último: é onde cai o `--mt-i` que a `Fila` carimba, e é por
      // ele que a grade de metas entra escalonada.
      style={{ padding: 18, borderRadius: 16, position: "relative", border: m.bateu ? "1px solid var(--ok)" : undefined, ...style }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {pos != null && <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-dim)", minWidth: 18 }}>#{pos}</span>}
        <strong style={{ fontSize: 15 }}>{m.titulo}</strong>
        {m.bateu && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flex: "none", fontSize: 11, fontWeight: 800, color: "#fff", background: "var(--ok)", padding: "2px 8px", borderRadius: 999 }}><Icon name="check" size={11} color="#fff" />BATEU</span>}
        {/* Excluir é a única ação do card: svg único filho → a fundação dá 44x44
            no celular. O grid centra o ícone dentro desse alvo maior. */}
        {canManage && <button onClick={() => onDelete(m.id)} aria-label="Excluir meta" style={{ marginLeft: "auto", flex: "none", display: "grid", placeItems: "center", background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 0 }}><Icon name="trash" size={15} /></button>}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
        {m.colaborador_nome && <><Icon name="user" size={12} /><strong style={{ color: "var(--text)" }}>{m.colaborador_nome}</strong> · </>}
        {m.setor} · {m.janelaLabel || m.periodicidade}
      </div>
      <div style={{ marginTop: 12 }}>
        {/* Medidor do Monocharts (arco de 240°, pontas arredondadas). A cor é
            de ESTADO — meta batida × em risco —, então ela vence a tinta da
            pessoa aqui: verde não pode virar rosa quando alguém troca o
            destaque. */}
        <MonoRoundedGaugeArc
          semCartao
          fracao={m.pct / 100}
          cor={cor}
          altura={150}
          centro={
            <div style={{ display: "grid", gap: 1, paddingBottom: 2 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 5 }}>
                {/* Tracking negativo porque o número é grande: o padrão do corpo
                    deixa 30px parecendo espaçado demais. */}
                <NumeroVivo className="stat" valor={m.atual} style={{ fontSize: 30, lineHeight: 1.05, letterSpacing: "-0.02em", color: cor }} />
                <span style={{ fontSize: 14, color: "var(--text-dim)" }}>/ {m.alvo}</span>
              </div>
              <NumeroVivo as="div" valor={m.pct} formatar={(n) => `${Math.round(n)}%`}
                style={{ fontSize: 12.5, fontWeight: 800, color: cor }} />
            </div>
          }
        />
      </div>
    </div>
  );
}
