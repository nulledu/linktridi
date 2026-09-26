"use client";

// O perfil do candidato — a tela de análise.
//
//   cabeçalho  — quem é, pra qual vaga, em que status, as etiquetas da
//                triagem; alterar status, agendar entrevista, observação,
//                baixar currículo, arquivar
//   esquerda   — o que ele mandou, em blocos: dados pessoais, ocupação atual,
//                formação, experiência, disponibilidade, questionário, currículo
//   direita    — o que o RH fez com isso: observações e o histórico
//
// Cada gaveta chega `null` quando quem abriu não tem a chave, e a tela diz
// qual chave falta em vez de fingir que não há nada. Sem poll: o que muda
// aqui muda por gesto e depois é `router.refresh()`.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PoderesRh } from "@/lib/rh/gate";
import {
  TETO_OBSERVACAO, iniciaisDe, rotuloOrigem,
  type CandidatoDetalhe, type HistoricoCandidato, type RespostaCandidato, type StatusCandidato, type VagaRh,
} from "@/lib/rh/curriculos/tipos";
import { Etiquetas, FolhaEtiquetas, Nota } from "../pecas";
import { ARQUIVADO, seloDaEtapa, type EtapaProcesso } from "@/lib/rh/curriculos/etapas";
import "../curriculos.css";
import { Icon } from "../../../Icon";
import { Acoes, Botao, Campo, PainelLateral, useAcao } from "../../../ui/controles";
import { GlassDate, GlassSelect, GlassTime } from "../../../GlassPicker";
import { toast, confirmar } from "../../../Toast";
import { Cartao, Duo, FichaBloco, FichaContato, FichaLinha, NotaRodape, Selo, TituloCartao, Vazio } from "../../../financeiro/ui";

function dataHoraBR(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " ·");
}
const emMB = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : n > 0 ? `${Math.max(1, Math.round(n / 1024))} KB` : "—");
const tipoLegivel = (t: string, nome: string) => {
  const ext = nome.includes(".") ? nome.split(".").pop()!.toUpperCase() : "";
  return t === "application/pdf" ? "PDF" : ext || "Arquivo";
};

const ICONE_HISTORICO: Record<HistoricoCandidato["tipo"], string> = {
  recebido: "inbox", status: "arrows-sort", observacao: "notes", vaga: "briefcase", dados: "edit", curriculo: "file-text", visto: "eye",
  entrevista: "calendar-event", tag: "tag",
};

/**
 * Em que bloco do perfil cada resposta mora — pela ETAPA do formulário de
 * onde ela veio. Candidato antigo (sem `etapa`) cai todo no questionário.
 */
const BLOCOS: { id: string; titulo: string; icone: string; etapas: string[] }[] = [
  { id: "ocupacao", titulo: "Ocupação atual", icone: "briefcase", etapas: ["conhecer"] },
  { id: "formacao", titulo: "Formação", icone: "school", etapas: ["formacao"] },
  { id: "experiencia", titulo: "Experiência profissional", icone: "building", etapas: ["experiencia"] },
  { id: "disponibilidade", titulo: "Disponibilidade", icone: "clock", etapas: ["disponibilidade"] },
];

function separarRespostas(rs: RespostaCandidato[]) {
  const idade = rs.find((r) => r.chave === "idade")?.resposta ?? null;
  const porBloco = new Map<string, RespostaCandidato[]>();
  const questionario: RespostaCandidato[] = [];
  for (const r of rs) {
    if (r.chave === "idade") continue;
    const b = BLOCOS.find((x) => r.etapa && x.etapas.includes(r.etapa));
    if (b) (porBloco.get(b.id) ?? porBloco.set(b.id, []).get(b.id)!).push(r);
    else questionario.push(r);
  }
  return { idade, porBloco, questionario };
}

async function chamar(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error((j.erro as string) || "Não foi possível salvar.");
  return j;
}

export function CandidatoClient({ inicial, vagas, poderes, etapas }: { inicial: CandidatoDetalhe; vagas: VagaRh[]; poderes: PoderesRh; etapas: EtapaProcesso[] }) {
  const [editandoTags, setEditandoTags] = useState(false);
  const router = useRouter();
  const [c, setC] = useState(inicial);
  useEffect(() => { setC(inicial); }, [inicial]);

  // Primeira abertura: apaga o "novo" do menu. Disparado por ESTA navegação,
  // uma vez; a rota ignora se já tinha `visto_em`.
  useEffect(() => {
    if (inicial.visto_em) return;
    fetch(`/api/rh/curriculos/${inicial.id}/visto`, { method: "POST" }).then(() => router.refresh()).catch(() => { /* informativo */ });
  }, [inicial.id, inicial.visto_em, router]);

  // ── Ações do cabeçalho ─────────────────────────────────────────────────────
  const mudarStatus = useAcao(async (status: StatusCandidato) => {
    await chamar(`/api/rh/curriculos/${c.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    setC((a) => ({ ...a, status }));
    toast(status === ARQUIVADO ? "Candidato arquivado." : `Movido para ${seloDaEtapa(etapas, status).label}.`);
    router.refresh();
    return true;
  }, { aoErrar: (e) => toast((e as Error).message, "erro") });

  const arquivar = async () => {
    const ok = await confirmar(`Arquivar ${c.nome}?`, { detalhe: "O candidato sai da triagem, mas continua na lista em “Arquivados” e pode voltar a qualquer momento." });
    if (ok) void mudarStatus.rodar(ARQUIVADO);
  };

  const mudarVaga = useAcao(async (vaga_id: string) => {
    await chamar(`/api/rh/curriculos/${c.id}`, { method: "PATCH", body: JSON.stringify({ vaga_id: vaga_id || null }) });
    setC((a) => ({ ...a, vaga_id: vaga_id || null, vaga: vagas.find((v) => v.id === vaga_id)?.titulo ?? null }));
    router.refresh();
    return true;
  }, { aoErrar: (e) => toast((e as Error).message, "erro") });

  // ── Observações ────────────────────────────────────────────────────────────
  const [nota, setNota] = useState("");
  const anotar = useAcao(async () => {
    const texto = nota.trim();
    if (!texto) { toast("Escreva a observação.", "erro"); return false; }
    const j = await chamar(`/api/rh/curriculos/${c.id}/observacoes`, { method: "POST", body: JSON.stringify({ texto }) });
    const obs = j.observacao as CandidatoDetalhe["observacoes"] extends (infer T)[] | null ? T : never;
    setC((a) => ({ ...a, observacoes: [obs, ...(a.observacoes ?? [])] }));
    setNota("");
    router.refresh();
    return true;
  }, { aoErrar: (e) => toast((e as Error).message, "erro") });

  // ── Agendar entrevista ─────────────────────────────────────────────────────
  const [agendando, setAgendando] = useState(false);
  const [dia, setDia] = useState("");
  const [hora, setHora] = useState("");
  const agendar = useAcao(async () => {
    if (!dia || !hora) { toast("Escolha o dia e a hora.", "erro"); return false; }
    // Hora de São Paulo (UTC−3, sem horário de verão desde 2019).
    const entrevista_em = new Date(`${dia}T${hora}:00-03:00`).toISOString();
    await chamar(`/api/rh/curriculos/${c.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "entrevista", entrevista_em }) });
    setC((a) => ({ ...a, status: "entrevista", entrevista_em }));
    toast("Entrevista agendada.");
    setAgendando(false);
    router.refresh();
    return true;
  }, { aoErrar: (e) => toast((e as Error).message, "erro") });
  const abrirAgenda = () => {
    const atual = c.entrevista_em ? new Date(c.entrevista_em) : null;
    setDia(atual ? atual.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) : "");
    setHora(atual ? atual.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "");
    setAgendando(true);
  };

  const campoObs = useRef<HTMLTextAreaElement>(null);
  const irParaObservacao = () => {
    campoObs.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    campoObs.current?.focus({ preventScroll: true });
  };

  const selo = seloDaEtapa(etapas, c.status);
  const cv = c.curriculo;
  const blocos = c.respostas ? separarRespostas(c.respostas) : null;
  const ehPdf = !!cv && (cv.tipo === "application/pdf" || /\.pdf$/i.test(cv.nome));
  const [verPdf, setVerPdf] = useState(false);

  return (
    <>
      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <header className="page-head" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
          <Botao variante="sutil" tamanho="sm" icone="arrow-left" onClick={() => router.push("/rh/curriculos")}>
            Currículos
          </Botao>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", color: "var(--text-dim)" }}>RH</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span aria-hidden style={{ width: 52, height: 52, flex: "none", borderRadius: "var(--r-md)", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary-texto) 14%, transparent)", color: "var(--primary-texto)", fontWeight: 800, fontSize: 19, letterSpacing: "-.02em" }}>
            {iniciaisDe(c.nome)}
          </span>
          <div style={{ flex: "1 1 auto", minWidth: 0, display: "grid", gap: 4 }}>
            <h1 style={{ marginBottom: 0 }}>{c.nome}</h1>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: "var(--text-dim)" }}>
              <Selo selo={selo} />
              <span>{c.vaga ?? "Sem vaga definida"}</span>
              <span aria-hidden>·</span>
              <span>Recebido em {dataHoraBR(c.recebido_em)}</span>
              <span aria-hidden>·</span>
              <span>{rotuloOrigem(c.origem)}</span>
            </div>
            {c.perfil?.pontuaveis ? (
              <span style={{ fontSize: 13.5 }}><Nota acertos={c.perfil.acertos} pontuaveis={c.perfil.pontuaveis} /> <span style={{ color: "var(--text-dim)" }}>nas perguntas com resposta certa</span></span>
            ) : null}
            {c.entrevista_em && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: seloDaEtapa(etapas, "entrevista").cor }}>
                <Icon name="calendar-event" size={15} /> Entrevista em {dataHoraBR(c.entrevista_em)}
              </span>
            )}
            {(c.tags.length > 0 || (c.perfil?.tags.length ?? 0) > 0 || poderes.curriculosEditar) && (
              <div style={{ marginTop: 4, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <Etiquetas tags={c.perfil?.tags ?? []} manuais={c.tags} max={10} />
                {poderes.curriculosEditar && <Botao tamanho="sm" variante="sutil" icone="tag" onClick={() => setEditandoTags(true)}>{c.tags.length ? "Etiquetas" : "Etiqueta"}</Botao>}
              </div>
            )}
          </div>

          <div className="tab-strip" style={{ display: "flex", gap: 8, alignItems: "center", padding: 0, minWidth: 0, maxWidth: "100%" }}>
            {poderes.curriculosStatus && (
              <GlassSelect
                title="Mover para a etapa"
                aria-label="Etapa do processo"
                value={c.status}
                onChange={(v) => void mudarStatus.rodar(v as StatusCandidato)}
                options={[
                  ...etapas.filter((e) => e.ativa || e.id === c.status).map((e) => ({ value: e.id, label: e.label })),
                  ...(c.status === ARQUIVADO ? [{ value: ARQUIVADO, label: "Arquivado" }] : []),
                ]}
              />
            )}
            {poderes.curriculosStatus && c.status !== ARQUIVADO && (
              <Botao icone="calendar-plus" onClick={abrirAgenda}>{c.entrevista_em ? "Reagendar" : "Agendar entrevista"}</Botao>
            )}
            {poderes.curriculosEditar && (
              <Botao icone="notes" onClick={irParaObservacao}>Observação</Botao>
            )}
            {cv && (
              <Botao icone="download" onClick={() => window.open(`${cv.url}?download=1&nome=${encodeURIComponent(cv.nome)}`, "_blank", "noopener")}>Baixar currículo</Botao>
            )}
            {poderes.curriculosStatus && c.status !== ARQUIVADO && (
              <Botao variante="sutil" icone="archive" onClick={arquivar} estado={mudarStatus.estado}>Arquivar</Botao>
            )}
          </div>
        </div>

        {/* O caminho: as etapas ativas em fila, a atual acesa. Finais "não
            seguiu" ficam fora da trilha (não são um passo à frente). */}
        {c.status !== ARQUIVADO && (() => {
          const trilha = etapas.filter((e) => e.ativa && (e.papel !== "final_negativo" || e.id === c.status));
          const i = trilha.findIndex((e) => e.id === c.status);
          return (
            <ol className="cv-trilha" aria-label="Etapa do processo" style={{ marginTop: 16 }}>
              {trilha.map((e, k) => (
                <li key={e.id} data-feito={k < i ? "1" : undefined} data-atual={k === i ? "1" : undefined} aria-current={k === i ? "step" : undefined}
                  style={{ ["--cor" as string]: e.cor }}>{e.label}</li>
              ))}
            </ol>
          );
        })()}
      </header>

      <Duo>
        {/* ── Esquerda: o que o candidato mandou ─────────────────────────────── */}
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <Cartao estatico>
            <TituloCartao icone="user">Dados pessoais</TituloCartao>
            <FichaBloco titulo="Contato">
              <FichaLinha rotulo="Nome">{c.nome}</FichaLinha>
              {blocos?.idade && <FichaLinha rotulo="Idade">{blocos.idade} anos</FichaLinha>}
              <FichaLinha rotulo="E-mail">{c.email && <FichaContato tipo="email" valor={c.email} />}</FichaLinha>
              <FichaLinha rotulo="WhatsApp">{c.telefone && <FichaContato tipo="whatsapp" valor={c.telefone} />}</FichaLinha>
              <FichaLinha rotulo="Cidade">{c.cidade}</FichaLinha>
              <FichaLinha rotulo="Candidatura">{dataHoraBR(c.recebido_em)}</FichaLinha>
              <FichaLinha rotulo="Origem">
                {rotuloOrigem(c.origem)}
                {typeof c.origem_detalhe.bot === "string" && <span style={{ color: "var(--text-dim)" }}> · {c.origem_detalhe.bot}</span>}
                {c.origem_detalhe.fonte === "formulario" && <span style={{ color: "var(--text-dim)" }}> · formulário de candidatura</span>}
              </FichaLinha>
            </FichaBloco>
            <FichaBloco titulo="Vaga">
              {poderes.curriculosEditar ? (
                <div style={{ paddingTop: 6 }}>
                  <GlassSelect
                    value={c.vaga_id ?? ""}
                    onChange={(v) => void mudarVaga.rodar(v)}
                    placeholder="Sem vaga definida"
                    options={[{ value: "", label: "Sem vaga definida" }, ...vagas.map((v) => ({ value: v.id, label: v.titulo, disabled: v.status === "encerrada" }))]}
                  />
                  {typeof c.dados.vaga_texto === "string" && (
                    <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-dim)" }}>O candidato escreveu: “{c.dados.vaga_texto}”.</p>
                  )}
                </div>
              ) : (
                <FichaLinha rotulo="Vaga">{c.vaga}</FichaLinha>
              )}
            </FichaBloco>
          </Cartao>

          {c.respostas === null ? (
            <Cartao estatico>
              <TituloCartao icone="list-details">Perfil e respostas</TituloCartao>
              <SemChave chave="rh:curriculos_respostas" o="as respostas do candidato" />
            </Cartao>
          ) : (
            <>
              {BLOCOS.map((b) => {
                const itens = blocos!.porBloco.get(b.id);
                if (!itens?.length) return null;
                return (
                  <Cartao estatico key={b.id}>
                    <TituloCartao icone={b.icone}>{b.titulo}</TituloCartao>
                    <ListaRespostas itens={itens} curta />
                  </Cartao>
                );
              })}
              <Cartao estatico>
                <TituloCartao icone="list-details">Respostas do questionário</TituloCartao>
                {blocos!.questionario.length === 0 ? (
                  <Vazio compacto icone="message" titulo="Sem respostas abertas." detalhe="A candidatura chegou sem o questionário." />
                ) : <ListaRespostas itens={blocos!.questionario} />}
              </Cartao>
            </>
          )}

          <Cartao estatico>
            <TituloCartao icone="file-text">Currículo</TituloCartao>
            {c.curriculo === null && poderes.curriculosArquivo === false ? (
              c.tem_curriculo
                ? <SemChave chave="rh:curriculos_arquivo" o="o arquivo do currículo" />
                : <Vazio compacto icone="file" titulo="Sem currículo anexado." />
            ) : !cv ? (
              <Vazio compacto icone="file" titulo="Sem currículo anexado." detalhe="O candidato não enviou arquivo." />
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span aria-hidden style={{ width: 44, height: 44, borderRadius: "var(--r-sm)", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary-texto) 12%, transparent)", flex: "none" }}>
                    <Icon name="file-text" size={22} color="var(--primary-texto)" />
                  </span>
                  <span style={{ minWidth: 0, flex: "1 1 200px", display: "grid" }}>
                    <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cv.nome}</strong>
                    <small style={{ color: "var(--text-dim)" }}>{tipoLegivel(cv.tipo, cv.nome)} · {emMB(cv.tamanho)} · enviado em {dataHoraBR(cv.enviado_em)}</small>
                  </span>
                  <span className="tab-strip" style={{ display: "flex", gap: 8, padding: 0, minWidth: 0 }}>
                    {ehPdf && <Botao icone="eye" onClick={() => setVerPdf((v) => !v)}>{verPdf ? "Fechar" : "Visualizar"}</Botao>}
                    <Botao icone="external-link" onClick={() => window.open(cv.url, "_blank", "noopener")}>Abrir</Botao>
                    <Botao icone="download" onClick={() => window.open(`${cv.url}?download=1&nome=${encodeURIComponent(cv.nome)}`, "_blank", "noopener")}>Baixar</Botao>
                  </span>
                </div>
                {ehPdf && verPdf && (
                  // O `src` é a rota autenticada: ela confere a sessão e a
                  // chave, e redireciona pra URL assinada de 10 min. O PDF é
                  // servido inline (tipo forçado pela extensão da chave).
                  <iframe
                    title={`Currículo de ${c.nome}`}
                    src={cv.url}
                    style={{ width: "100%", height: "min(80dvh, 900px)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-2)" }}
                  />
                )}
                {!ehPdf && <NotaRodape>DOC e DOCX não abrem dentro do sistema: use “Abrir” ou “Baixar”.</NotaRodape>}
              </div>
            )}
          </Cartao>
        </div>

        {/* ── Direita: o que o RH fez ────────────────────────────────────────── */}
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <Cartao estatico>
            <TituloCartao icone="notes">Observações</TituloCartao>
            {c.observacoes === null ? (
              <SemChave chave="rh:curriculos_editar" o="as observações internas" />
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0 }}>Privadas: só quem edita currículos lê. Nunca vão ao candidato.</p>
                <div className="ui-campo" style={{ display: "grid", gap: 8 }}>
                  <textarea
                    ref={campoObs}
                    value={nota}
                    onChange={(e) => setNota(e.target.value.slice(0, TETO_OBSERVACAO))}
                    placeholder="Ex.: candidato tem experiência relevante em produção."
                    rows={3}
                    aria-label="Nova observação"
                    /* O invólucro é `.ui-campo`: tinta, borda, raio, corpo e
                       respiro já vêm de lá, iguais aos da ficha do RH. */
                    style={{ minHeight: 84 }}
                  />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <small style={{ color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{nota.length}/{TETO_OBSERVACAO}</small>
                    <Botao variante="primario" tamanho="sm" icone="plus" estado={anotar.estado} onClick={() => void anotar.rodar()} disabled={!nota.trim()}>Registrar</Botao>
                  </div>
                </div>
                {c.observacoes.length === 0 ? (
                  <Vazio compacto icone="notes" titulo="Nenhuma observação ainda." />
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                    {c.observacoes.map((o) => (
                      <li key={o.id} style={{ padding: 12, borderRadius: "var(--r-sm)", background: "var(--surface-2)", display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{o.texto}</span>
                        <small style={{ color: "var(--text-dim)" }}>{o.autor_nome ?? "RH"} · {dataHoraBR(o.created_at)}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Cartao>

          <Cartao estatico>
            <TituloCartao icone="history">Histórico</TituloCartao>
            {c.historico.length === 0 ? (
              <Vazio compacto icone="history" titulo="Sem eventos." />
            ) : (
              <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid" }}>
                {c.historico.map((h, i) => (
                  <li key={h.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 10, position: "relative", paddingBottom: i === c.historico.length - 1 ? 0 : 14 }}>
                    <span style={{ display: "grid", justifyItems: "center", gridTemplateRows: "28px 1fr" }}>
                      <span aria-hidden style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: h.tipo === "status" ? `color-mix(in srgb, ${selo.cor} 16%, transparent)` : "var(--surface-2)", color: h.tipo === "status" ? selo.cor : "var(--text-dim)" }}>
                        <Icon name={ICONE_HISTORICO[h.tipo] ?? "circle-dot"} size={14} />
                      </span>
                      {i < c.historico.length - 1 && <span aria-hidden style={{ width: 2, flex: 1, minHeight: 10, marginTop: 4, background: "var(--border)", borderRadius: 2 }} />}
                    </span>
                    <span style={{ display: "grid", gap: 2, minWidth: 0, paddingTop: 4 }}>
                      <small style={{ color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{dataHoraBR(h.created_at)}{h.autor_nome ? ` · ${h.autor_nome}` : ""}</small>
                      <span style={{ fontSize: 13.5, lineHeight: 1.45 }}>{h.titulo}</span>
                      {h.detalhe && <small style={{ color: "var(--text-dim)" }}>{h.detalhe}</small>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Cartao>

          {c.status !== "aprovado" ? null : (
            <NotaRodape icone="user-plus">
              Aprovado. “Converter em colaborador” chega numa próxima etapa — os dados já coletados serão aproveitados.
            </NotaRodape>
          )}
        </div>
      </Duo>

      {editandoTags && (
        <FolhaEtiquetas
          c={c} sugestoes={[]} aoFechar={() => setEditandoTags(false)}
          aoSalvar={(tags) => { setC((a) => ({ ...a, tags })); setEditandoTags(false); router.refresh(); }}
        />
      )}

      {agendando && (
        <PainelLateral
          centrado soFechaNoX icone="calendar-plus" titulo="Agendar entrevista"
          subtitulo={`${c.nome} passa para “Entrevista”.`}
          onFechar={() => setAgendando(false)}
          largura={460}
          rodape={
            <Acoes>
              <Botao variante="sutil" onClick={() => setAgendando(false)}>Cancelar</Botao>
              <Botao variante="primario" icone="check" estado={agendar.estado} onClick={() => void agendar.rodar()}>Agendar</Botao>
            </Acoes>
          }
        >
          <div style={{ display: "grid", gap: 14 }}>
            <Campo label="Dia">{(id) => <GlassDate id={id} value={dia} onChange={setDia} placeholder="Escolha o dia" aria-label="Dia da entrevista" />}</Campo>
            <Campo label="Hora" dica="Horário de Brasília.">{(id) => <GlassTime id={id} value={hora} onChange={setHora} passo={15} aria-label="Hora da entrevista" />}</Campo>
          </div>
        </PainelLateral>
      )}
    </>
  );
}

/** Pergunta em cima, resposta embaixo. `curta`: pergunta e resposta lado a lado, como ficha. */
function ListaRespostas({ itens, curta }: { itens: RespostaCandidato[]; curta?: boolean }) {
  if (curta) {
    return (
      <div style={{ display: "grid" }}>
        {itens.map((r) => <FichaLinha key={r.chave} rotulo={r.pergunta}>{r.resposta}</FichaLinha>)}
      </div>
    );
  }
  return (
    <ol style={{ display: "grid", gap: 4, listStyle: "none", padding: 0, margin: 0 }}>
      {itens.map((r, i) => (
        <li key={`${r.chave}-${i}`} style={{ display: "grid", gap: 4, padding: "12px 0", borderTop: i ? "1px solid var(--border)" : undefined }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>{r.pergunta}</span>
          <span style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.resposta}</span>
        </li>
      ))}
    </ol>
  );
}

function SemChave({ chave, o }: { chave: string; o: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--r-sm)", background: "var(--surface-2)", fontSize: 13, color: "var(--text-dim)" }}>
      <Icon name="key" size={16} />
      <span>Você não tem a chave pra ver {o}. Peça <code>{chave}</code> a quem concede o RH.</span>
    </div>
  );
}


