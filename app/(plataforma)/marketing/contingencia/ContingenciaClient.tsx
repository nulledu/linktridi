"use client";

// ── Contingência (aquecimento + parque) ──────────────────────────────────────
// UMA tela. O aquecimento (fila do dia, roteiros, ativos) e a contingência
// (celulares, chips, proxies, custos, atendentes, histórico) eram duas telas
// sobre o mesmo cadastro — aqui viraram oito visões de um mesmo carregamento.
//
// Nada aqui muda sozinho: não há poll (ver CLAUDE.md · dados). Toda ação
// recarrega uma vez; salvar a Atualização de Hoje devolve o painel novo na
// mesma resposta.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../../Icon";
import { Abas } from "../../ui/Abas";
import { Botao } from "../../ui/controles";
import { Alerta } from "../../ui/Alerta";
import { Hoje } from "../aquecimento/Hoje";
import { Ativos } from "../aquecimento/Ativos";
import { Roteiros } from "../aquecimento/Roteiros";
import { GavetaAtivo } from "../aquecimento/GavetaAtivo";
import { NovoAtivo } from "../aquecimento/NovoAtivo";
import { useAquecimento, type DadosAquecimento } from "../aquecimento/useAquecimento";
import { VisaoGeral } from "./VisaoGeral";
import { Telefonica } from "./Telefonica";
import { Trafego } from "./Trafego";
import { Atendentes } from "./Atendentes";
import { Historico } from "./Historico";
import { Configuracoes } from "./Configuracoes";
import { AtualizacaoHoje } from "./AtualizacaoHoje";
import { EditorVisao, type AlvoEdicao } from "./EditorVisao";
import { Kpi, Bloco, quando } from "./pecas";
import "../../operacao/geral/visao-geral.css";
import "./visao-geral.css";
import type { Painel, Snapshot } from "@/lib/contingencia-const";
import type { TipoAtivo } from "@/lib/marketing-aquecimento-const";

export type Visao = "geral" | "hoje" | "telefonica" | "trafego" | "atendentes" | "roteiros" | "historico" | "config";

const VISOES: { key: Visao; label: string; icone: string }[] = [
  { key: "geral",      label: "Visão Geral",   icone: "layout-grid" },
  { key: "hoje",       label: "Hoje",          icone: "calendar" },
  { key: "telefonica", label: "Telefônica",    icone: "device-mobile" },
  { key: "trafego",    label: "Tráfego",       icone: "brand-meta" },
  { key: "atendentes", label: "Atendentes",    icone: "users" },
  { key: "roteiros",   label: "Roteiros",      icone: "list-check" },
  { key: "historico",  label: "Histórico",     icone: "history" },
  { key: "config",     label: "Configurações", icone: "settings" },
];
const CHAVES = new Set(VISOES.map((v) => v.key));

const dataHora = (iso: string | null | undefined) => {
  if (!iso) return "nunca";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const tz = { timeZone: "America/Sao_Paulo" } as const;
  return `${d.toLocaleDateString("pt-BR", tz)} às ${d.toLocaleTimeString("pt-BR", { ...tz, hour: "2-digit", minute: "2-digit" })}`;
};

export type Chamar = (url: string, method: string, body?: unknown) => Promise<Record<string, unknown> | null>;

export function ContingenciaClient({
  inicial, aquecimentoInicial, offline = false, snapshotsIniciais, embutido = false, podeEditar = true,
}: {
  /** Dados prontos (banco de provas). Com `offline`, nenhum fetch acontece. */
  inicial?: Painel; aquecimentoInicial?: DadosAquecimento; offline?: boolean; snapshotsIniciais?: Snapshot[];
  /** Dentro da aba do Marketing: sem o título grande, que já é da página. */
  embutido?: boolean;
  podeEditar?: boolean;
}) {
  const [painel, setPainel] = useState<Painel | null>(inicial ?? null);
  const [visao, setVisao] = useState<Visao>("geral");
  const [hoje, setHoje] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<AlvoEdicao | null>(null);
  const [criando, setCriando] = useState<{ tipo?: TipoAtivo; aparelho?: string; paiId?: string } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: "ok" | "erro" } | null>(null);
  const [erroCarga, setErroCarga] = useState("");

  // A visão vive na URL (?v=) pra dar pra mandar o link "olha os atendentes"
  // — sem `useSearchParams`, que obrigaria um Suspense em volta da página.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("v");
    if (v && CHAVES.has(v as Visao)) setVisao(v as Visao);
  }, []);
  const irPara = useCallback((v: Visao) => {
    setVisao(v);
    const url = new URL(window.location.href);
    if (v === "geral") url.searchParams.delete("v"); else url.searchParams.set("v", v);
    window.history.replaceState(null, "", url.toString());
  }, []);

  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (relogio.current) clearTimeout(relogio.current); }, []);
  const avisar = useCallback((texto: string, tom: "ok" | "erro" = "ok") => {
    setAviso({ texto, tom });
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setAviso(null), 3500);
  }, []);

  const carregar = useCallback(async () => {
    if (offline) return;
    const r = await fetch("/api/marketing/contingencia").then((x) => x.json()).catch(() => null);
    if (r?.ok) { setPainel(r.painel as Painel); setErroCarga(""); }
    else setErroCarga(r?.error === "sem_permissao" ? "Você não tem acesso à contingência." : "Não deu para carregar. Recarregue a página.");
  }, [offline]);

  useEffect(() => { if (!inicial) void carregar(); }, [carregar, inicial]);

  // Status de chip mexe nos números da contingência: toda mutação do
  // aquecimento recarrega o consolidado (`aoMudar`).
  const aq = useAquecimento({ avisar, aoMudar: carregar, inicial: aquecimentoInicial, offline });

  /** Toda escrita da contingência passa por aqui: traduz erro em aviso e
   *  recarrega os dois lados quando deu certo. */
  const chamar = useCallback<Chamar>(async (url, method, body) => {
    if (offline) { avisar("Banco de provas: nada é gravado."); return { ok: true }; }
    const r = await fetch(url, {
      method, headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then((x) => x.json()).catch(() => null) as Record<string, unknown> | null;
    if (!r?.ok) {
      avisar(r?.error === "sem_permissao" ? "Sem permissão para alterar a contingência."
        : r?.error === "sql_pendente" ? "As tabelas da contingência ainda não existem — rode supabase/marketing_contingencia.sql."
        : r?.error === "nome_repetido" ? "Já existe um celular com esse nome."
        : "Não deu para salvar. Confira os campos e tente de novo.", "erro");
      return null;
    }
    if (r.painel) setPainel(r.painel as Painel); else await carregar();
    return r;
  }, [offline, avisar, carregar]);

  const salvarHoje = useCallback(async (body: Record<string, unknown>) => {
    const r = await chamar("/api/marketing/contingencia/atualizacao", "POST", body);
    if (!r) return false;
    await aq.carregar();
    const a = (r.aplicado ?? {}) as Record<string, number>;
    const n = Object.values(a).reduce((x, y) => x + y, 0);
    avisar(n ? `Atualização salva: ${n} alteração${n === 1 ? "" : "ões"}. Snapshot de hoje gravado.` : "Snapshot de hoje gravado.");
    return true;
  }, [chamar, avisar, aq]);

  const c = painel?.consolidado ?? null;
  const contagem = useMemo<Partial<Record<Visao, number>>>(() => ({
    hoje: (aq.pendentes.etapas + aq.pendentes.emRisco) || undefined,
    atendentes: c?.atendentes.filter((a) => a.saude !== "saudavel").length || undefined,
    geral: c?.pendenciasAbertas || undefined,
  }), [c, aq.pendentes]);

  const ultima = painel?.ultimoSnapshot;
  const emFoco = aq.ativos.find((a) => a.id === aberto) ?? null;

  const inventario = (filtro: "whatsapp" | "meta") => (
    <Ativos ativos={aq.ativos} aparelhos={aq.fichas}
      etapasPorRoteiro={aq.etapasPorRoteiro} marcosPorAtivo={aq.marcosPorAtivo}
      filtro={filtro} podeEditar={podeEditar}
      onAbrir={(a) => setAberto(a.id)} onNovo={(o) => setCriando(o)} onFichas={aq.setFichas} />
  );

  const linhaAtualizacao = painel
    ? <>Última atualização: <b style={{ color: "var(--text)" }}>{quando(ultima?.atualizadoEm)}</b>{ultima?.autorNome ? ` por ${ultima.autorNome}` : ""}{ultima?.origem === "cron" ? " (automática)" : ""}. Números contados agora do cadastro.</>
    : "Carregando…";

  return (
    <div className="ct-scope ct-secoes">
      {embutido ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <p style={{ flex: 1, minWidth: 200, fontSize: 13, color: "var(--text-dim)" }}>{linhaAtualizacao}</p>
          {podeEditar && <Botao variante="primario" icone="edit" onClick={() => setHoje(true)} disabled={!painel}>Atualização de Hoje</Botao>}
        </div>
      ) : (
        <header className="cv-cab">
          <span className="og-cab-icone" aria-hidden><Icon name="speakerphone" size={22} color="var(--primary)" /></span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Link href="/marketing" prefetch={false} className="cv-cab-trilha">
              <Icon name="chevron-left" size={13} color="currentColor" /> Marketing
            </Link>
            <h1 className="og-titulo">Contingência</h1>
            <p className="og-sub">Acompanhe a estrutura de contingência da operação: chips, proxies e conexões.</p>
          </div>
          <div className="cv-cab-dir">
            <span className="cv-atualizado" title={ultima?.autorNome ? `por ${ultima.autorNome}${ultima.origem === "cron" ? " (automática)" : ""}` : undefined}>
              Última atualização: {painel ? dataHora(ultima?.atualizadoEm) : "…"}
            </span>
            {/* "Atualizar" é a Atualização de Hoje: os números já são contados do
                cadastro a cada carga — atualizar, aqui, é registrar o dia. Sem
                permissão de escrita, recarrega. */}
            <Botao variante="secundario" icone="refresh" disabled={!painel}
              onClick={() => (podeEditar ? setHoje(true) : void carregar())}>Atualizar</Botao>
          </div>
        </header>
      )}

      <div className="ct-nav">
        <Abas
          valor={visao}
          onMuda={irPara}
          ariaLabel="Seções da contingência"
          itens={VISOES.map((v) => ({
            valor: v.key,
            rotulo: <><Icon name={v.icone} size={15} color="currentColor" /> {v.label}</>,
            badge: contagem[v.key] ? (
              <span style={{
                marginLeft: 7, fontSize: 11.5, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                fontVariantNumeric: "tabular-nums", background: "color-mix(in srgb, currentColor 16%, transparent)",
              }}>{contagem[v.key]}</span>
            ) : undefined,
          }))}
        />
      </div>

      {aviso && (
        <Alerta tom={aviso.tom === "ok" ? "ok" : "perigo"} role="status">{aviso.texto}</Alerta>
      )}

      {painel?.sqlPendente && (
        <Alerta tom="atencao" role="status" titulo="Banco atrás do código.">
          Rode <code>supabase/marketing_contingencia.sql</code> pra ligar proxies, custos, pendências e histórico. Chips, celulares, BMs e contas já aparecem porque são o cadastro do aquecimento.
        </Alerta>
      )}

      {erroCarga ? (
        <div className="ct-bloco" style={{ textAlign: "center", color: "var(--text-dim)" }}>{erroCarga}</div>
      ) : !painel || !c ? (
        <div className="ct-bloco" style={{ padding: "38px 22px", textAlign: "center", color: "var(--text-dim)", fontSize: 13.5 }}>Carregando…</div>
      ) : visao === "geral" ? (
        <VisaoGeral painel={painel} aquecimento={aq.pendentes} irPara={irPara} abrirHoje={() => setHoje(true)} chamar={chamar}
          verAtendente={(k) => { setFoco(k); irPara("atendentes"); }}
          podeEditar={podeEditar} offline={offline} snapshotsIniciais={snapshotsIniciais}
          editar={podeEditar ? setEditando : undefined} />
      ) : visao === "hoje" ? (
        <div className="ct-tel ct-secoes">
          <div className="ct-grade ct-grade-4 kpi-row">
            <Kpi tom={aq.pendentes.etapas ? "contexto" : "neutro"} icone="calendar" rotulo="Etapas vencidas hoje" valor={aq.pendentes.etapas}
              sub="do roteiro de aquecimento" origem="etapas previstas × marcos cumpridos" />
            <Kpi tom={aq.pendentes.emRisco ? "alerta" : "neutro"} icone="alert-triangle" rotulo="Ativos em risco" valor={aq.pendentes.emRisco}
              sub="apressados ou restritos" origem="ritmo da última etapa cumprida" />
            <Kpi tom="contexto" icone="flame" rotulo="Chips em aquecimento" valor={c.numeros.emAquecimento}
              sub={`${c.numeros.naoAquecidos} ainda não começaram`} origem="status “aquecendo”" />
            <Kpi tom="contexto" icone="brand-meta" rotulo="Contas em aquecimento" valor={c.meta.contas.aquecendo}
              sub={`${c.meta.contas.naoAquecidas} novas · ${c.meta.bms.total} BM${c.meta.bms.total === 1 ? "" : "s"}`} origem="Estrutura Meta" />
          </div>
          {podeEditar && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Botao variante="secundario" icone="plus" onClick={() => setCriando({})}>Novo ativo</Botao>
            </div>
          )}
          {aq.carregando
            ? <div className="ct-bloco" style={{ textAlign: "center", color: "var(--text-dim)" }}>Carregando…</div>
            : <Hoje ativos={aq.ativos} etapasPorRoteiro={aq.etapasPorRoteiro} marcosPorAtivo={aq.marcosPorAtivo}
                podeEditar={podeEditar} onMarcar={aq.marcar} onAbrir={(a) => setAberto(a.id)} />}
        </div>
      ) : visao === "telefonica" ? (
        <Telefonica painel={painel} verAtendente={(k) => { setFoco(k); irPara("atendentes"); }}
          onAbrirNumero={podeEditar ? (id) => setAberto(id) : undefined}
          onNovoNumero={podeEditar ? () => setCriando({ tipo: "numero" }) : undefined}
          inventario={
            <Bloco titulo="Aparelhos e chips" icone="brand-whatsapp"
              sub="O inventário do aquecimento: cada celular com os números que moram nele. Clique num chip pra abrir a linha do tempo."
              acoes={podeEditar ? <Botao variante="secundario" tamanho="sm" icone="plus" onClick={() => setCriando({ tipo: "numero" })}>Novo número</Botao> : undefined}>
              {inventario("whatsapp")}
            </Bloco>
          } />
      ) : visao === "trafego" ? (
        <Trafego meta={c.meta}
          onNovo={podeEditar ? () => setCriando({ tipo: "bm" }) : undefined}
          inventario={inventario("meta")} />
      ) : visao === "atendentes" ? (
        <Atendentes painel={painel} foco={foco} onFoco={setFoco}
          onAbrirNumero={podeEditar ? (id) => setAberto(id) : undefined} />
      ) : visao === "roteiros" ? (
        <div className="ct-tel">
          <Roteiros roteiros={aq.roteiros} ativos={aq.ativos} marcosPorAtivo={aq.marcosPorAtivo}
            podeEditar={podeEditar} onSalvo={aq.setRoteiros} />
        </div>
      ) : visao === "historico" ? (
        <Historico painel={painel} offline={offline} snapshotsIniciais={snapshotsIniciais} />
      ) : (
        <Configuracoes painel={painel} chamar={chamar} />
      )}

      {hoje && painel && (
        <AtualizacaoHoje painel={painel} onFechar={() => setHoje(false)} onSalvar={salvarHoje} />
      )}

      {editando && painel && (
        <EditorVisao alvo={editando} painel={painel} chamar={chamar} onFechar={() => setEditando(null)}
          onStatus={aq.trocarStatus}
          onAbrirAtivo={(id) => { setEditando(null); setAberto(id); }}
          onNovo={(o) => { setEditando(null); setCriando(o); }}
          verAtendente={(k) => { setEditando(null); setFoco(k); irPara("atendentes"); }} />
      )}

      {emFoco && (
        <GavetaAtivo ativo={emFoco}
          etapas={aq.etapasPorRoteiro.get(emFoco.roteiroId ?? "") ?? []}
          marcos={aq.marcosPorAtivo.get(emFoco.id) ?? []}
          podeEditar={podeEditar}
          onFechar={() => setAberto(null)}
          onMarcar={aq.marcar} onDesmarcar={aq.desmarcar} onStatus={aq.trocarStatus} onNota={aq.anotar}
          onEditar={aq.editar} onRemover={async (id) => { const ok = await aq.remover(id); if (ok) setAberto(null); return ok; }}
          roteiros={aq.roteiros} bms={aq.bms} aparelhos={aq.aparelhos} />
      )}

      {criando && (
        <NovoAtivo roteiros={aq.roteiros} ativos={aq.ativos}
          tipoInicial={criando.tipo ?? (criando.aparelho ? "numero" : criando.paiId ? "conta" : "bm")}
          preAparelho={criando.aparelho} prePaiId={criando.paiId}
          onFechar={() => setCriando(null)} onCriado={() => void aq.depois()} />
      )}
    </div>
  );
}
