"use client";

// ── Aquecimento · gaveta do ativo ────────────────────────────────────────────
// A linha do tempo PREVISTO × REAL, que é o coração do módulo.
//
// Um eixo só, com a marca do HOJE no meio. Acima, sólido: o que aconteceu —
// etapas cumpridas e o que o roteiro não previu (a denúncia, o recurso, o
// bloqueio). Abaixo, contornado: o que o roteiro ainda espera.
//
// Etapa vencida fica ACIMA do HOJE e continua contornada — e por isso lê como
// atrasada sem badge, sem vermelho e sem chrome nenhum. A informação está na
// POSIÇÃO. Marcar como feito faz ela atravessar a linha e virar sólida, e a
// travessia é animada (FLIP + mola) porque um item que se teleporta some de um
// lugar e aparece em outro: ninguém entende que é o mesmo item que se moveu.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PainelLateral, Botao, Acoes } from "../../ui/controles";
import { PillRitmo, PillStatus, medir, travessia } from "./pecas";
import { EditarAtivo } from "./EditarAtivo";
import {
  STATUS, congelado, hojeISO, pendenciasDe, progressoDe, ritmoDe, somaDias, diffDias,
  rotuloStatus, corStatus,
  type Ativo, type Etapa, type Evento, type Marco, type Roteiro, type StatusAtivo,
} from "@/lib/marketing-aquecimento-const";

interface Props {
  ativo: Ativo;
  etapas: Etapa[];
  marcos: Marco[];
  podeEditar: boolean;
  onFechar: () => void;
  onMarcar: (itens: { ativoId: string; etapaId: string }[]) => Promise<boolean>;
  onDesmarcar: (ativoId: string, etapaId: string) => Promise<boolean>;
  onStatus: (id: string, status: StatusAtivo, nota?: string) => Promise<boolean>;
  onNota: (id: string, texto: string) => Promise<boolean>;
  onEditar: (patch: Record<string, unknown>) => Promise<boolean>;
  onRemover: (id: string) => Promise<boolean>;
  /** Contexto pro formulario de edicao (BMs pra vincular, aparelhos ja usados). */
  roteiros: Roteiro[];
  bms: Ativo[];
  aparelhos: string[];
}

type Item =
  | { k: "real"; ordem: number; quando: string; titulo: string; quem: string | null; cor: string; etapaId?: string; congelado?: boolean }
  | { k: "hoje"; ordem: number }
  | { k: "futuro"; ordem: number; quando: string; titulo: string; etapaId: string; atraso: number };

const curto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function GavetaAtivo(p: Props) {
  const { ativo, etapas, marcos, podeEditar } = p;
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [nota, setNota] = useState("");
  const [trocandoStatus, setTrocandoStatus] = useState(false);
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const eixo = useRef<HTMLDivElement>(null);
  const marcada = useRef<{ id: string; topo: number } | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/marketing/aquecimento/ativo?id=${ativo.id}`)
      .then((x) => x.json()).catch(() => null);
    setEventos(r?.ok ? (r.eventos as Evento[]) : []);
  }, [ativo.id]);

  // Sem poll: o histórico de um ativo não muda sozinho — muda quando alguém
  // nesta tela mexe nele (ver CLAUDE.md · dados).
  useEffect(() => { void carregar(); }, [carregar]);

  const prog = progressoDe(etapas, marcos);
  const ritmo = ritmoDe(ativo, etapas, marcos);
  const pend = useMemo(() => pendenciasDe(ativo, etapas, marcos), [ativo, etapas, marcos]);

  const itens = useMemo<Item[]>(() => montar(ativo, etapas, marcos, eventos ?? []), [ativo, etapas, marcos, eventos]);

  // Depois do re-render, o item recém-marcado anima do lugar antigo até o novo.
  useEffect(() => {
    const alvo = marcada.current;
    if (!alvo || !eixo.current) return;
    marcada.current = null;
    travessia(eixo.current.querySelector<HTMLElement>(`[data-etapa="${alvo.id}"]`), alvo.topo);
  }, [itens]);

  async function marcar(etapaId: string) {
    if (ocupado) return;
    setOcupado(true);
    const el = eixo.current?.querySelector<HTMLElement>(`[data-etapa="${etapaId}"]`) ?? null;
    marcada.current = { id: etapaId, topo: medir(el) ?? 0 };
    const ok = await p.onMarcar([{ ativoId: ativo.id, etapaId }]);
    if (ok) await carregar(); else marcada.current = null;
    setOcupado(false);
  }

  async function desmarcar(etapaId: string) {
    if (ocupado) return;
    setOcupado(true);
    if (await p.onDesmarcar(ativo.id, etapaId)) await carregar();
    setOcupado(false);
  }

  async function trocar(st: StatusAtivo) {
    if (ocupado || st === ativo.status) { setTrocandoStatus(false); return; }
    setOcupado(true);
    if (await p.onStatus(ativo.id, st)) await carregar();
    setTrocandoStatus(false);
    setOcupado(false);
  }

  async function anotar() {
    const t = nota.trim();
    if (!t || ocupado) return;
    setOcupado(true);
    if (await p.onNota(ativo.id, t)) { setNota(""); await carregar(); }
    setOcupado(false);
  }

  const dia = diffDias(ativo.iniciadoEm, ativo.pausadoEm && congelado(ativo.status) ? ativo.pausadoEm : hojeISO());
  const ultimoDia = etapas.filter((e) => !e.removidaEm).reduce((m, e) => Math.max(m, e.dia), 0);

  // A etapa cumprida mais recente — a única que oferece "Desmarcar".
  const ultimoMarcado = useMemo(() => {
    if (!marcos.length) return null;
    const ordem = new Map(etapas.map((e) => [e.id, e.dia]));
    return marcos
      .filter((m) => ordem.has(m.etapaId))
      .sort((a, b) => (ordem.get(a.etapaId)! - ordem.get(b.etapaId)!))
      .at(-1)?.etapaId ?? null;
  }, [marcos, etapas]);

  return (
    <PainelLateral
      titulo={ativo.nome}
      subtitulo={
        // Um `join` só: montar em dois `<span>` deixava o "· dia 9 de 21" cair
        // sozinho na linha de baixo, começando por um separador órfão.
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {[ativo.identificador, ativo.operadora, ativo.aparelho, ativo.responsavelNome,
            ultimoDia ? `dia ${dia} de ${ultimoDia}` : null].filter(Boolean).join(" · ")}
        </span>
      }
      largura={470}
      onFechar={p.onFechar}
      rodape={podeEditar ? (
        <Acoes>
          <Botao variante="sutil" icone="settings"
            onClick={() => { setEditando((v) => !v); setTrocandoStatus(false); }}>
            {editando ? "Fechar edição" : "Editar"}
          </Botao>
          <Botao variante="secundario" icone="pencil"
            onClick={() => { setTrocandoStatus((v) => !v); setEditando(false); }}>
            Mudar status
          </Botao>
        </Acoes>
      ) : undefined}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <PillStatus status={ativo.status} />
          <PillRitmo ritmo={ritmo} />
          {prog.total > 0 && (
            <span style={{ fontSize: 12.5, color: "var(--text-dim)", alignSelf: "center", fontVariantNumeric: "tabular-nums" }}>
              {prog.feito} de {prog.total} etapas
            </span>
          )}
        </div>

        {trocandoStatus && podeEditar && (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 7, padding: 12, borderRadius: 14,
            background: "var(--surface-2)", border: "1px solid var(--border)",
          }}>
            {STATUS.map((s) => (
              <button key={s.key} type="button" onClick={() => void trocar(s.key)} disabled={ocupado}
                className="aq-chip"
                style={{
                  padding: "0 12px", borderRadius: 999, font: "inherit", fontSize: 13,
                  fontWeight: 600, cursor: "pointer", color: s.key === ativo.status ? "var(--bg)" : s.cor,
                  background: s.key === ativo.status ? s.cor : `color-mix(in srgb, ${s.cor} 13%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${s.cor} 40%, transparent)`,
                }}>
                {s.label}
              </button>
            ))}
            {congelado(ativo.status) && (
              <p style={{ margin: "4px 0 0", flexBasis: "100%", fontSize: 12, color: "var(--text-dim)" }}>
                O prazo deste ativo está congelado desde {ativo.pausadoEm ? curto(ativo.pausadoEm) : "hoje"} —
                ele não acumula atraso enquanto estiver assim.
              </p>
            )}
          </div>
        )}

        {editando && podeEditar && (
          <EditarAtivo ativo={ativo} roteiros={p.roteiros} bms={p.bms} aparelhos={p.aparelhos}
            onSalvar={p.onEditar}
            onRemover={async () => { const ok = await p.onRemover(ativo.id); if (ok) p.onFechar(); return ok; }}
            onCancelar={() => setEditando(false)} />
        )}

        <Linha itens={itens} eixo={eixo} podeEditar={podeEditar} ocupado={ocupado}
          ultimoMarcado={ultimoMarcado} onMarcar={marcar} onDesmarcar={desmarcar} />

        {podeEditar && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <label style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)", marginBottom: 5 }}>
                Anotar o que aconteceu fora do roteiro
              </span>
              <input value={nota} onChange={(e) => setNota(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void anotar(); }}
                placeholder="Recebeu aviso de spam, recurso enviado…"
                maxLength={600}
                style={{ width: "100%", minHeight: "var(--tap)", fontSize: 14 }} />
            </label>
            <Botao variante="secundario" icone="plus" onClick={anotar} disabled={!nota.trim() || ocupado}>
              Anotar
            </Botao>
          </div>
        )}

        {!pend.length && prog.total > 0 && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>
            Roteiro concluído. Se ainda não mudou o status para <b>Aquecido</b>, mude — é
            ele que tira o ativo da fila de trabalho.
          </p>
        )}
      </div>
    </PainelLateral>
  );
}

// ── Montagem do eixo ─────────────────────────────────────────────────────────
// Uma lista só, ordenada por data: marcos e eventos viram "real"; pendências
// viram "futuro"; e a marca do HOJE entra entre os dois. É essa mistura que faz
// a comparação previsto × real aparecer sem precisar de duas colunas.
function montar(ativo: Ativo, etapas: Etapa[], marcos: Marco[], eventos: Evento[]): Item[] {
  const porEtapa = new Map(etapas.map((e) => [e.id, e]));
  const reais: Item[] = [];

  for (const m of marcos) {
    const e = porEtapa.get(m.etapaId);
    if (!e) continue;
    const previsto = somaDias(ativo.iniciadoEm, e.dia);
    const desvio = diffDias(previsto, m.feitoEm);
    reais.push({
      k: "real", ordem: emOrdem(m.feitoEm), quando:
        `${curto(m.feitoEm)} · D+${e.dia}${desvio ? ` (${desvio > 0 ? "+" : "−"}${Math.abs(desvio)}d)` : ""}`,
      titulo: e.titulo, quem: m.autorNome, cor: desvio < 0 ? "var(--rosa)" : "var(--ok)",
      etapaId: e.id,
    });
  }

  // Evento de etapa é o mesmo fato do marco — apareceria duplicado. O log só
  // entra aqui com o que o roteiro NÃO previu, que é o que ele existe pra contar.
  for (const ev of eventos) {
    if (ev.tipo === "etapa") continue;
    const dia = ev.createdAt.slice(0, 10);
    reais.push({
      k: "real", ordem: emOrdem(dia), quando: `${curto(dia)} · fora do roteiro`,
      titulo: ev.tipo === "status"
        ? `Status: ${ev.statusAntes ? `${rotuloStatus(ev.statusAntes)} → ` : ""}${ev.statusDepois ? rotuloStatus(ev.statusDepois) : "—"}${ev.texto ? ` — ${ev.texto}` : ""}`
        : (ev.texto ?? "Anotação"),
      quem: ev.autorNome,
      cor: ev.tipo === "status" && ev.statusDepois
        ? corStatus(ev.statusDepois)
        : "var(--info)",
      congelado: ev.tipo === "status" && !!ev.statusDepois && congelado(ev.statusDepois),
    });
  }

  reais.sort((a, b) => a.ordem - b.ordem);

  const futuros: Item[] = pendenciasDe(ativo, etapas, marcos).map((pd) => ({
    k: "futuro", ordem: emOrdem(pd.venceEm), quando: pd.atraso > 0
      ? `venceu ${curto(pd.venceEm)} · ${pd.atraso} ${pd.atraso === 1 ? "dia" : "dias"} atrasado`
      : `${curto(pd.venceEm)} · D+${pd.etapa.dia}`,
    titulo: pd.etapa.titulo, etapaId: pd.etapa.id, atraso: pd.atraso,
  }));

  // A marca do HOJE entra DEPOIS das etapas vencidas: é o que faz a etapa
  // atrasada ficar acima da linha e ainda contornada — atrasada pela posição.
  const vencidas = futuros.filter((f) => f.k === "futuro" && f.atraso >= 0);
  const porVir = futuros.filter((f) => f.k === "futuro" && f.atraso < 0);

  return [...reais, ...vencidas, { k: "hoje", ordem: 0 } as Item, ...porVir]
    .map((it, i) => ({ ...it, ordem: i }));
}

const emOrdem = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();

function Linha({ itens, eixo, podeEditar, ocupado, ultimoMarcado, onMarcar, onDesmarcar }: {
  itens: Item[];
  eixo: React.RefObject<HTMLDivElement | null>;
  podeEditar: boolean;
  ocupado: boolean;
  /** Só a ÚLTIMA etapa cumprida oferece "Desmarcar". Um botão por etapa fazia
   *  uma ação de CORREÇÃO ocupar o mesmo espaço do conteúdo — com 8 etapas a
   *  rolagem virava uma coluna de "Desmarcar". E o erro que se desfaz é sempre
   *  o que acabou de acontecer; desfazer o dia 1 três semanas depois não é
   *  correção, é reescrever história. */
  ultimoMarcado: string | null;
  onMarcar: (etapaId: string) => void;
  onDesmarcar: (etapaId: string) => void;
}) {
  return (
    <div ref={eixo} style={{ position: "relative", paddingLeft: 28 }}>
      <span aria-hidden style={{
        position: "absolute", left: 8, top: 6, bottom: 6, width: 1.5, background: "var(--border)",
      }} />
      {itens.map((it, i) => {
        if (it.k === "hoje") {
          return (
            <div key="hoje" style={{
              position: "relative", display: "flex", alignItems: "center", gap: 9,
              margin: "0 0 19px -28px", paddingLeft: 28,
            }}>
              <span aria-hidden style={{
                position: "absolute", left: 2, width: 12, height: 12, borderRadius: "50%",
                background: "var(--info)",
                boxShadow: "0 0 0 4px color-mix(in srgb, var(--info) 22%, transparent)",
              }} />
              <span style={{
                fontSize: 11.5, fontWeight: 700, letterSpacing: ".06em",
                textTransform: "uppercase", color: "var(--info)",
              }}>hoje · {curto(hojeISO())}</span>
              <i style={{ flex: 1, height: 1.5, background: "linear-gradient(90deg, var(--info), transparent)" }} />
            </div>
          );
        }

        const real = it.k === "real";
        const atrasada = it.k === "futuro" && it.atraso >= 0;
        const cor = real ? it.cor : atrasada ? "var(--atencao)" : "var(--text-dim)";

        return (
          <div key={`${it.k}-${i}`} data-etapa={it.k === "futuro" ? it.etapaId : undefined}
            style={{
              position: "relative", padding: "0 0 19px",
              opacity: real && it.congelado ? .55 : 1,
            }}>
            <span aria-hidden style={{
              position: "absolute", left: -24, top: 5, width: 11, height: 11, borderRadius: "50%",
              background: real ? cor : "var(--surface)", border: `2px solid ${cor}`,
              boxShadow: "0 0 0 4px var(--surface)",
            }} />
            <div style={{
              fontSize: 11.5, fontVariantNumeric: "tabular-nums", letterSpacing: ".012em",
              color: atrasada ? "var(--atencao)" : "var(--text-dim)",
              fontWeight: atrasada ? 640 : 500,
            }}>{it.quando}</div>
            <p style={{
              margin: "1px 0 0", letterSpacing: "-.006em",
              fontWeight: real ? 560 : 500, color: real ? "var(--text)" : "var(--text-dim)",
            }}>{it.titulo}</p>
            {real && it.quem && (
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>{it.quem}</div>
            )}

            {podeEditar && it.k === "futuro" && (
              <Botao tamanho="sm" icone="check" onClick={() => onMarcar(it.etapaId)} disabled={ocupado} style={{ marginTop: 8 }}>Marcar como feito</Botao>
            )}
            {podeEditar && real && it.etapaId && it.etapaId === ultimoMarcado && (
              <Botao variante="sutil" tamanho="sm" onClick={() => onDesmarcar(it.etapaId!)} disabled={ocupado} title="Desmarcar (fica registrado no histórico)" style={{ marginTop: 6 }}>Desmarcar</Botao>
            )}
          </div>
        );
      })}
    </div>
  );
}
