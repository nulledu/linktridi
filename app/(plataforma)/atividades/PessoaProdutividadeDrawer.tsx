"use client";

// ── Drawer de produtividade da pessoa ────────────────────────────────────────
// A tabela responde "quem entregou quanto". A pergunta seguinte é sempre
// "entregou o quê?" — e ela não cabe numa coluna. Aqui ficam as atividades do
// período, as que ainda estão abertas e as metas individuais dela.
//
// Painel, não página: a comparação entre as pessoas continua atrás, e fechar
// devolve a lista no mesmo lugar.

import { useEffect, useMemo, useState } from "react";
import type { Atividade } from "@/lib/atividades-catalog";
import type { MetaProgresso } from "@/lib/metas";
import { Icon } from "../Icon";
import { PainelLateral } from "../ui/controles";
import { Badge, BarraMeta, type LinhaProdutividade, type Periodo } from "./ProdutividadeMetas";

const fmtMin = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min}min`);
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");
const dia = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "");

// Meia-noite (fuso São Paulo) do início do recorte — extraída pra fora do
// useMemo de baixo porque o painel de Qualidade (QC) precisa do MESMO corte
// de data que a lista de atividades concluídas, e duplicar a conta é como
// duas versões dela divergem sem ninguém notar.
function inicioDoRecorte(periodo: Periodo): number {
  const sp = new Date(Date.now() - 3 * 3600 * 1000);
  const meiaNoite = (off: number) => Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() - off, 3, 0, 0);
  return periodo === "hoje" ? meiaNoite(0) : periodo === "7d" ? meiaNoite(6) : meiaNoite(29);
}

export function PessoaProdutividadeDrawer({ linha, atividades, metas, periodo, onFechar }: {
  linha: LinhaProdutividade;
  atividades: Atividade[];
  metas: MetaProgresso[];
  periodo: Periodo;
  onFechar: () => void;
}) {
  const desdeMs = useMemo(() => inicioDoRecorte(periodo), [periodo]);
  const { feitas, abertas } = useMemo(() => {
    const minhas = atividades.filter((a) => a.para_id === linha.id);
    return {
      feitas: minhas
        .filter((a) => a.status === "concluida" && a.concluida_at && Date.parse(a.concluida_at) >= desdeMs)
        .sort((a, b) => (b.concluida_at || "").localeCompare(a.concluida_at || "")),
      abertas: minhas.filter((a) => a.status !== "concluida"),
    };
  }, [atividades, linha.id, desdeMs]);

  const rotulo = periodo === "hoje" ? "hoje" : periodo === "7d" ? "nos 7 dias" : "nos 30 dias";
  const durMin = (a: Atividade) => (a.iniciada_at && a.concluida_at ? Math.round((Date.parse(a.concluida_at) - Date.parse(a.iniciada_at)) / 60000) : null);

  return (
    <PainelLateral
      titulo={linha.nome}
      subtitulo={<span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{linha.setor} · {linha.concluidas} concluída(s) {rotulo} <Badge valor={linha.eficiencia} /></span>}
      largura={560}
      onFechar={onFechar}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Os mesmos números da linha da tabela, sem virar cartão: quem abriu já
            viu a linha — repetir em quadros grandes é dizer duas vezes. */}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <Numero rotulo="Peças" valor={String(linha.pecas || "—")} />
          <Numero rotulo="Tempo médio" valor={linha.mediaMin != null ? fmtMin(linha.mediaMin) : "—"} />
          <Numero rotulo="Em aberto" valor={String(linha.abertas)} cor={linha.abertas > 0 ? "var(--atencao)" : undefined} />
        </div>

        {/* Nota do QC (conferência de qualidade) — feature irmã em construção em
            paralelo (lib/estoque-qualidade.ts). Vive logo abaixo dos números de
            produtividade porque é a mesma pergunta ("como esta pessoa entrega?")
            olhada por outro ângulo: não só quanto, mas o quão bem. */}
        <PainelQualidade pessoaId={linha.id} desdeMs={desdeMs} rotulo={rotulo} />

        {metas.length > 0 && (
          <Bloco icone="target" titulo="Metas individuais">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {metas.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: "1 1 130px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.titulo}<span style={{ fontWeight: 400, color: "var(--text-dim)" }}> · {m.janelaLabel || m.periodicidade}</span>
                  </span>
                  <span className="stat" style={{ fontSize: 13, fontWeight: 700, flex: "none" }}>{m.atual}<span style={{ color: "var(--text-dim)", fontWeight: 400 }}>/{m.alvo}</span></span>
                  <BarraMeta m={m} />
                </div>
              ))}
            </div>
          </Bloco>
        )}

        {abertas.length > 0 && (
          <Bloco icone="player-play" titulo={`Em aberto · ${abertas.length}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {abertas.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: a.impedida ? "var(--perigo)" : a.status === "em_andamento" ? "var(--primary)" : "var(--atencao)" }} />
                  <span style={{ fontSize: 13, color: "var(--text)", flex: "1 1 140px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.tarefa}</span>
                  {a.impedida && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--perigo)", flex: "none" }}>{a.motivo_impedimento || "impedida"}</span>}
                  <span style={{ fontSize: 11.5, color: "var(--text-dim)", flex: "none" }}>{a.status === "em_andamento" ? `desde ${hora(a.iniciada_at)}` : "aguardando"}</span>
                </div>
              ))}
            </div>
          </Bloco>
        )}

        <Bloco icone="circle-check" titulo={`Concluídas ${rotulo} · ${feitas.length}`}>
          {feitas.length === 0
            ? <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>Nada concluído nesse recorte.</p>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {feitas.slice(0, 30).map((a) => {
                  const d = durMin(a);
                  // Passou do estimado? É o mesmo julgamento da eficiência, na linha.
                  const estourou = d != null && a.tempo_estimado_min != null && d > a.tempo_estimado_min;
                  return (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                      <span className="stat" style={{ fontSize: 11.5, color: "var(--text-dim)", flex: "none", minWidth: 38 }}>{dia(a.concluida_at)}</span>
                      <span style={{ fontSize: 13, color: "var(--text)", flex: "1 1 140px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.tarefa}</span>
                      {a.quantidade_feita > 0 && <span className="stat" style={{ fontSize: 11.5, color: "var(--text-dim)", flex: "none" }}>{a.quantidade_feita} pç</span>}
                      <span className="stat" style={{ fontSize: 12, fontWeight: 700, flex: "none", color: d == null ? "var(--text-dim)" : estourou ? "var(--atencao)" : "var(--ok)" }}>
                        {d != null ? fmtMin(d) : "—"}
                      </span>
                    </div>
                  );
                })}
                {feitas.length > 30 && <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>e mais {feitas.length - 30}…</span>}
              </div>
            )}
        </Bloco>
      </div>
    </PainelLateral>
  );
}

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600 }}>{rotulo}</div>
      <div className="stat" style={{ fontSize: 22, fontWeight: 800, color: cor ?? "var(--text)", lineHeight: 1.15 }}>{valor}</div>
    </div>
  );
}

function Bloco({ icone, titulo, children }: { icone: string; titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
        <Icon name={icone} size={15} color="var(--text-dim)" />
        <strong style={{ fontSize: 12.5, color: "var(--text)" }}>{titulo}</strong>
      </div>
      {children}
    </div>
  );
}

// ── Qualidade (QC) ───────────────────────────────────────────────────────────
// GET /api/estoque/score devolve `{ score: Score & { rotulo } }`, com `Score`
// de lib/estoque-qualidade.ts (scoreDe/rotuloDoScore) — os dois foram
// construídos em paralelo por outro agente enquanto este arquivo era escrito,
// então `normalizarScore` continua tolerante (chave ausente, tipo errado,
// 404/erro de rede) mesmo já sabendo a forma real. Duas divergências do que
// se supôs no meio do caminho: não existe campo de "peças" pronto — sai de
// `aprovadas + recusadas`, o tamanho do lote que o gestor de fato avaliou; e
// os defeitos vêm como `{ key, label, vezes }`, não `{ nome, qtd }`.
interface ScoreQualidade {
  media: number | null;
  total: number;
  pecas: number | null;
  taxaAprovacao: number | null;
  rotulo: string | null;
  defeitos: { nome: string; qtd: number }[];
}

function normalizarDefeitos(raw: unknown): { nome: string; qtd: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).map((item) => {
    if (typeof item === "string") return { nome: item, qtd: 0 };
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const nome = o.label ?? o.nome ?? o.defeito ?? o.tag ?? o.motivo;
      const qtd = o.vezes ?? o.qtd ?? o.quantidade ?? o.total ?? o.count;
      return { nome: typeof nome === "string" ? nome : "—", qtd: typeof qtd === "number" ? qtd : 0 };
    }
    return { nome: "—", qtd: 0 };
  }).filter((d) => d.nome !== "—");
}

function normalizarScore(raw: unknown): ScoreQualidade | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const s = (d.score && typeof d.score === "object" ? d.score : d) as Record<string, unknown>;
  const media = typeof s.media === "number" ? s.media : null;
  const total = typeof s.total === "number" ? s.total : 0;
  const taxaAprovacao = typeof s.taxaAprovacao === "number" ? s.taxaAprovacao : null;
  const aprovadas = typeof s.aprovadas === "number" ? s.aprovadas : null;
  const recusadas = typeof s.recusadas === "number" ? s.recusadas : null;
  // Fallback (s.pecas) cobre um contrato futuro que decida expor a soma pronta.
  const pecasBruto = s.pecas ?? (aprovadas != null && recusadas != null ? aprovadas + recusadas : null);
  return {
    media, total, taxaAprovacao,
    rotulo: typeof s.rotulo === "string" ? s.rotulo : null,
    pecas: typeof pecasBruto === "number" ? pecasBruto : null,
    defeitos: normalizarDefeitos(s.defeitosMaisComuns),
  };
}

// Só usado se a rota, por algum motivo, não mandar `rotulo` pronto (ela manda —
// rotuloDoScore em lib/estoque-qualidade.ts). Mesmos limiares, pra nunca ler
// "Bom" aqui e "Excelente" lá por causa de um arredondamento diferente.
function labelDaMedia(media: number): string {
  if (media >= 4.5) return "Excelente";
  if (media >= 3.5) return "Bom";
  if (media >= 2.5) return "Mediano";
  if (media >= 1.5) return "Ruim";
  return "Péssimo";
}

/**
 * Por que três estados e não dois.
 *
 * O painel tratava qualquer resposta não-ok como ausência de dado, e caía na
 * mesma frase do "nunca conferiram". Não é hipótese: /atividades é liberada por
 * PAPEL e /api/estoque/score por ÁREA ("colaboradores", restrita e ligada
 * pessoa a pessoa). Um gerente sem esse quadradinho abria a ficha de qualquer
 * colaborador e lia que ninguém nunca conferiu o trabalho dele — podendo haver
 * quarenta conferências. Erro de rede e 500 diziam a mesma coisa.
 *
 * "Sem amostra", "não posso ver" e "não deu pra carregar" são três fatos
 * diferentes, e só o primeiro é sobre a pessoa.
 */
type EstadoQualidade =
  | { tipo: "carregando" }
  | { tipo: "ok"; score: ScoreQualidade | null }
  | { tipo: "sem_permissao" }
  | { tipo: "falhou" };

function PainelQualidade({ pessoaId, desdeMs, rotulo }: { pessoaId: string; desdeMs: number; rotulo: string }) {
  const [estado, setEstado] = useState<EstadoQualidade>({ tipo: "carregando" });

  useEffect(() => {
    let vivo = true;
    setEstado({ tipo: "carregando" });
    const desde = new Date(desdeMs).toISOString();
    fetch(`/api/estoque/score?pessoa=${encodeURIComponent(pessoaId)}&desde=${encodeURIComponent(desde)}`)
      .then(async (r) => {
        if (!vivo) return;
        // 401 junto com 403: sessão que caiu não é "sem conferências" nem
        // "sem permissão" — é a mesma conversa de "não dá pra ver daqui".
        if (r.status === 403 || r.status === 401) { setEstado({ tipo: "sem_permissao" }); return; }
        if (!r.ok) { setEstado({ tipo: "falhou" }); return; }
        const d = await r.json().catch(() => null);
        if (vivo) setEstado({ tipo: "ok", score: normalizarScore(d) });
      })
      .catch(() => { if (vivo) setEstado({ tipo: "falhou" }); });
    return () => { vivo = false; };
  }, [pessoaId, desdeMs]);

  // O título carrega o recorte, como os blocos vizinhos ("Concluídas nos 7
  // dias"): os números daqui também são filtrados pelo período (o `desde` vai
  // na consulta), e sem dizer isso "4,2 · Bom · 3 conferências" lia como o
  // histórico inteiro da pessoa quando é só a semana.
  const titulo = `Qualidade ${rotulo}`;

  // Sem estado de "carregando" próprio — o resto do painel já está de pé; um
  // spinner só neste bloco piscaria por uma fração de segundo à toa.
  if (estado.tipo === "carregando") return null;

  if (estado.tipo === "sem_permissao") {
    return (
      <Bloco icone="lock" titulo={titulo}>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>Você não tem acesso à qualidade desta pessoa.</p>
      </Bloco>
    );
  }

  if (estado.tipo === "falhou") {
    return (
      <Bloco icone="alert-triangle" titulo={titulo}>
        <p style={{ fontSize: 12.5, color: "var(--atencao)", margin: 0 }}>Não deu pra carregar a qualidade agora.</p>
      </Bloco>
    );
  }

  const score = estado.score;
  if (!score || score.media == null) {
    // `media: null` é "ninguém conferiu ainda" — nunca 0. Um 0 aqui leria como
    // "péssimo" quando o fato é "sem amostra", e são julgamentos opostos.
    return (
      <Bloco icone="star" titulo={titulo}>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>Ainda sem conferências registradas {rotulo}.</p>
      </Bloco>
    );
  }

  // taxaAprovacao pode chegar como fração (0–1) ou já em pontos percentuais —
  // o placar ainda está em construção em paralelo, então os dois formatos são
  // prováveis; a tela não pode escolher errado e mostrar "420%" ou "0%".
  const pct = score.taxaAprovacao != null ? Math.round(score.taxaAprovacao <= 1 ? score.taxaAprovacao * 100 : score.taxaAprovacao) : null;

  return (
    <Bloco icone="star" titulo={titulo}>
      {/* O número nunca aparece sozinho: 4,2 em 3 peças e 4,2 em 300 não são o
          mesmo fato, e sem o tamanho da amostra ao lado um gestor age em cima
          de um arredondamento. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", rowGap: 4 }}>
        <span className="stat" style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>{score.media.toFixed(1).replace(".", ",")}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>{score.rotulo ?? labelDaMedia(score.media)}</span>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
          · {score.total} {score.total === 1 ? "conferência" : "conferências"}
          {score.pecas != null && ` · ${score.pecas} pç`}
          {pct != null && ` · ${pct}% aprovação`}
        </span>
      </div>
      {score.defeitos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {score.defeitos.map((d) => (
            <span key={d.nome} className="stat" style={{
              fontSize: 11, fontWeight: 700, color: "var(--atencao)",
              background: "color-mix(in srgb, var(--atencao) 12%, transparent)", padding: "3px 9px", borderRadius: 999,
            }}>
              {d.nome}{d.qtd > 0 && ` · ${d.qtd}`}
            </span>
          ))}
        </div>
      )}
    </Bloco>
  );
}
