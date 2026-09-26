"use client";

// ── Marketing · Geral · Detalhe do criativo ──────────────────────────────────
// Todos os campos cadastrados + histórico de alterações (quem criou, quem
// editou, quando e o que mudou). Sem arquivo/vídeo nesta versão — o espaço da
// mídia fica reservado pra quando a integração existir.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "../../../Icon";
import { Botao } from "../../../ui/controles";
import { Panel } from "../../../ui/primitives";
import { CriativoModal } from "../../CriativoModal";
import { Pill, dataBR } from "../../CriativosLista";
import { VideoCriativo } from "../../VideoCriativo";
import { BibliotecaCriativo } from "../../BibliotecaCriativo";
import type { ArquivoCriativo } from "@/lib/criativos/regras";
import { PRODUTOS, nomeAutomatico, type Criativo, type CriativoEvento, type ProdutoCriativo } from "@/lib/marketing-criativos-const";
import type { Editor } from "../../MarketingClient";
import type { Eu } from "../../CriativoModal";
import type { CriativoDesempenho } from "../../tipos";
import { fmtBRL, fmtNum } from "@/lib/format";

export function CriativoDetalhe({ inicial, historicoInicial, eu, arquivos, estreiaMeta = null, podeEditar, desempenho, podeDesempenho }: {
  inicial: Criativo;
  /** Primeiro dia em que um anúncio com este nome rodou na Meta. */
  estreiaMeta?: string | null;
  historicoInicial: CriativoEvento[];
  prefixos: string[];
  eu: Eu;
  arquivos: ArquivoCriativo[];
  podeEditar: boolean;
  desempenho: CriativoDesempenho | null;
  podeDesempenho: boolean;
}) {
  const [c, setC] = useState(inicial);
  const [hist, setHist] = useState(historicoInicial);
  const [editores, setEditores] = useState<Editor[]>([]);
  const [produtos, setProdutos] = useState<ProdutoCriativo[]>(PRODUTOS);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (!podeEditar) return;
    void fetch("/api/marketing/editores").then((r) => r.json()).then((r) => { if (r?.ok) setEditores(r.editores); }).catch(() => {});
    void fetch("/api/marketing/criativos/produtos").then((r) => r.json()).then((r) => { if (r?.ok) setProdutos(r.produtos); }).catch(() => {});
  }, [podeEditar]);

  async function aposSalvar(novo: Criativo) {
    setC(novo);
    setEditando(false);
    const r = await fetch(`/api/marketing/criativos/${novo.id}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setHist(r.historico as CriativoEvento[]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Link href="/marketing" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-dim)", textDecoration: "none", fontSize: 13, fontWeight: 600, minHeight: "var(--tap)" }}>
        <Icon name="chevron-left" size={16} color="var(--text-dim)" /> Marketing · Geral
      </Link>

      <header style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          {/* Nome automático ("SET 01 - {CRB} - {L}") já contém o código:
              repetir "SET-001" em cima dele seria dizer a mesma coisa duas vezes. */}
          {!nomeAutomatico(c) && <div className="stat" style={{ fontSize: 30, color: "var(--azul)" }}>{c.codigo}</div>}
          <h1 className={nomeAutomatico(c) ? "stat" : undefined}
            style={{ fontSize: nomeAutomatico(c) ? 28 : 20, fontWeight: 800, marginTop: 4, lineHeight: 1.2, letterSpacing: nomeAutomatico(c) ? "-0.01em" : undefined, wordBreak: "break-word" }}>{c.nome}</h1>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <Pill texto={c.editorNome || "Sem editor"} icon="user" />
            {c.produto && <Pill texto={c.produto} icon="package" />}
          </div>
        </div>
        {podeEditar && (
          <Botao icone="edit" onClick={() => setEditando(true)}>Editar</Botao>
        )}
      </header>

      {/* A biblioteca vem ANTES da prévia da Meta: o arquivo-fonte é o que o
          time procura no dia a dia; a prévia é o anúncio já publicado. */}
      <Panel title="Biblioteca" subtitle="As peças deste criativo, guardadas aqui dentro." size="sm">
        <BibliotecaCriativo criativoId={c.id} codigo={c.codigo} inicial={arquivos} podeEditar={podeEditar} />
      </Panel>

      <Panel title="Anúncio no ar" subtitle={c.videoUrl ? "Link externo cadastrado no criativo." : "Prévia oficial da Meta — o anúncio como o público vê."} size="sm">
        <VideoCriativo codigo={c.codigo} metaAdId={c.metaAdId} videoUrl={c.videoUrl} altura={520} />
      </Panel>

      {podeDesempenho && (
        <Panel title="Desempenho no tráfego" subtitle="Últimos 90 dias, do armazém da Meta. O vínculo é o código no nome do anúncio." size="sm">
          {desempenho ? (
            <>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))" }}>
                <Metrica label="Faturamento" valor={fmtBRL(desempenho.revenue)} cor="var(--ok)" />
                <Metrica label="Investido" valor={fmtBRL(desempenho.spend)} cor="var(--atencao)" />
                <Metrica label="ROAS" valor={desempenho.roas ? `${desempenho.roas.toFixed(2)}x` : "—"} />
                <Metrica label="Compras" valor={fmtNum(desempenho.purchases)} />
                <Metrica label="CTR" valor={`${desempenho.ctr.toFixed(2)}%`} cor="var(--roxo)" />
                <Metrica label="CPM" valor={fmtBRL(desempenho.cpm)} />
                <Metrica label="CPA" valor={desempenho.cpa ? fmtBRL(desempenho.cpa) : "—"} />
              </div>
              {desempenho.campanhas.length > 0 && (
                <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10 }}>
                  Rodou em {desempenho.anuncios} anúncio{desempenho.anuncios > 1 ? "s" : ""} · {desempenho.campanhas.join(" · ")}
                </p>
              )}
            </>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, padding: "8px 0" }}>
              Nenhum anúncio com o código <strong>{c.codigo}</strong> no nome nos últimos 90 dias.
              Pra ligar o resultado ao cadastro, comece o nome do anúncio na Meta com o código.
            </p>
          )}
        </Panel>
      )}

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
        <Panel title="Informações" size="sm">
          <dl style={{ display: "grid", gap: 10 }}>
            <Linha rotulo="Editor responsável" valor={c.editorNome} icon="user" />
            <Linha rotulo="Produto" valor={c.produto} icon="package" />
            <Linha rotulo="Subiu na biblioteca" valor={dataBR(c.dataCriacao)} icon="calendar-event" />
            <Linha rotulo="Primeiro anúncio na Meta" valor={estreiaMeta ? dataBR(estreiaMeta) : "Ainda não rodou"} icon="calendar-event" />
            <Linha rotulo="Cadastrado por" valor={c.criadorNome} icon="user-check" />
          </dl>
          {c.observacoes && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", marginBottom: 5 }}>Observações</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{c.observacoes}</p>
            </div>
          )}
        </Panel>

        <Panel title="Histórico" subtitle="Quem criou, quem editou e o que mudou." size="sm">
          {hist.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-dim)", padding: "14px 0" }}>Sem registros.</p>
          ) : (
            <ol style={{ display: "flex", flexDirection: "column", gap: 12, listStyle: "none" }}>
              {hist.map((e) => (
                <li key={e.id} style={{ display: "flex", gap: 10 }}>
                  <span style={{ flex: "none", width: 26, height: 26, borderRadius: 999, background: "var(--surface-2)", display: "grid", placeItems: "center" }}>
                    <Icon name={ICONE_ACAO[e.acao] ?? "history"} size={14} color="var(--text-dim)" />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {e.autorNome || "Alguém"} {TEXTO_ACAO[e.acao] ?? "alterou"}{e.campo ? ` · ${e.campo}` : ""}
                    </div>
                    {e.detalhe && <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2, wordBreak: "break-word" }}>{e.detalhe}</div>}
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>{quando(e.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {editando && (
        <CriativoModal modo="editar" criativo={c} eu={eu} editores={editores} produtos={produtos}
          onProdutoCriado={(p) => setProdutos((l) => [...l, p])}
          onFechar={() => setEditando(false)} onSalvo={aposSalvar} />
      )}
    </div>
  );
}

const ICONE_ACAO: Record<string, string> = { criou: "plus", status: "flag", observacao: "message", editou: "edit" };
const TEXTO_ACAO: Record<string, string> = { criou: "criou o criativo", status: "mudou o status", observacao: "anotou", editou: "editou" };

function Metrica({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600 }}>{label}</div>
      <div className="stat" style={{ fontSize: 18, marginTop: 3, color: cor || "var(--text)" }}>{valor}</div>
    </div>
  );
}

function Linha({ rotulo, valor, icon }: { rotulo: string; valor: string | null; icon: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
      <dt style={{ flex: "none", minWidth: 130, fontSize: 12.5, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name={icon} size={14} color="var(--text-dim)" />{rotulo}
      </dt>
      <dd style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, wordBreak: "break-word" }}>{valor || "—"}</dd>
    </div>
  );
}

function quando(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
