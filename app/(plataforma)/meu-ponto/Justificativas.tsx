"use client";

// ── Justificativas de um dia ─────────────────────────────────────────────────
// A mesma peça serve os dois caminhos, porque o registro é o mesmo:
//
//  · GESTOR — lança pra pessoa, escolhe o efeito, decide pedido pendente.
//  · COLABORADOR — pede pro próprio dia, anexa o atestado, espera decisão.
//
// O que muda entre os dois é `podeDecidir`, e mais nada. Duas telas separadas
// para o mesmo registro é como uma delas passa a mostrar um número que a outra
// não tem — e aqui o número é hora que vira dinheiro.
//
// Um dia aceita VÁRIAS: a pessoa sai 1h de manhã pro dentista e 1h à tarde pro
// banco. São dois motivos, dois efeitos, um dia só.

import { GrupoOpcoes } from "@/app/(plataforma)/ui/formularios";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DiaBanco } from "@/lib/banco-horas";
import {
  ROTULO_EFEITO, ROTULO_TIPO, SELO_STATUS, TIPOS_JUSTIFICATIVA, EFEITOS_JUSTIFICATIVA,
  descreverJustificativa, formatarMinutos, minutosDoRecorte,
  type EfeitoJustificativa, type JanelaDaJornada, type TipoJustificativa,
} from "@/lib/ponto-justificativas";
import type { Justificativa } from "@/lib/ponto";
import { Icon } from "../Icon";
import { toast, confirmar } from "../Toast";
import { Botao, Campo, Campos } from "../ui/controles";
import { enviarArquivoPrivado } from "../ui/enviarArquivo";

type Recorte = "dia" | "janela" | "horas";

const ROTA = "/api/ponto/justificativas";

/** Rótulo curto do recorte, pro cartão da lista. */
function recorteDe(j: Justificativa): Recorte {
  if (j.horaDe && j.horaAte) return "janela";
  if (typeof j.minutos === "number" && j.minutos > 0) return "horas";
  return "dia";
}

export function JustificativasDoDia({
  pessoaId, dia, jornada, podeDecidir, onMudou,
}: {
  pessoaId: string;
  dia: DiaBanco;
  jornada: JanelaDaJornada;
  /** Gestor: lança já aprovado, escolhe o efeito e decide pendências. */
  podeDecidir: boolean;
  onMudou: () => void;
}) {
  const lista = dia.justificativas ?? [];
  const [editando, setEditando] = useState<Justificativa | null>(null);
  const [novo, setNovo] = useState(false);
  const [busy, setBusy] = useState(false);

  async function decidir(j: Justificativa, status: "aprovada" | "recusada") {
    setBusy(true);
    try {
      const r = await fetch(ROTA, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: j.id, status }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.erro(d?.error || "Falha."); return; }
      toast.ok(status === "aprovada" ? "Justificativa aprovada." : "Pedido recusado.");
      onMudou();
    } finally { setBusy(false); }
  }

  async function remover(j: Justificativa) {
    const ok = await confirmar("Apagar esta justificativa?", {
      detalhe: podeDecidir ? "As horas voltam a contar como estavam antes." : "Você pode pedir de novo depois.",
      perigo: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch(`${ROTA}?id=${encodeURIComponent(j.id)}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.erro(d?.error || "Falha."); return; }
      toast.ok("Justificativa removida."); onMudou();
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>Justificativas do dia</div>
        {!novo && !editando && (
          <Botao variante="sutil" tamanho="sm" icone="plus" onClick={() => setNovo(true)}>
            {lista.length ? "Adicionar outra" : podeDecidir ? "Justificar" : "Pedir justificativa"}
          </Botao>
        )}
      </div>

      {/* O que o abono fez de fato. "Justificado" sozinho parecia resolvido: num
          atestado da manhã, o que importa é que 4h foram perdoadas e o resto
          continua devido. */}
      {(dia.abonadoMin || dia.foraMin) && (
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "0 0 8px", lineHeight: 1.5 }}>
          {!!dia.abonadoMin && <>Abonadas <strong style={{ color: "var(--info)" }}>{formatarMinutos(dia.abonadoMin)}</strong>{dia.saldoMin < 0 ? <> · ainda devendo <strong style={{ color: "var(--perigo)" }}>{formatarMinutos(-dia.saldoMin)}</strong></> : " · dia quite"}. </>}
          {!!dia.foraMin && <><strong style={{ color: "var(--ok)" }}>{formatarMinutos(dia.foraMin)}</strong> a serviço da empresa, contadas como trabalho.</>}
        </p>
      )}

      {lista.length === 0 && !novo && (
        <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "0 0 4px", lineHeight: 1.5 }}>
          Nada justificado neste dia. Dá pra justificar o dia inteiro, uma janela de horário
          (&quot;atestado das 08:00 às 13:00&quot;) ou só uma quantidade de horas.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lista.map((j) => (
          editando?.id === j.id ? (
            <FormJustificativa
              key={j.id} pessoaId={pessoaId} dia={dia.dia} jornada={jornada} podeDecidir={podeDecidir}
              inicial={j} onFechar={() => setEditando(null)} onSalvou={() => { setEditando(null); onMudou(); }}
            />
          ) : (
            <CartaoJustificativa
              key={j.id} j={j} jornada={jornada} podeDecidir={podeDecidir} busy={busy}
              onEditar={() => { setNovo(false); setEditando(j); }}
              onRemover={() => remover(j)}
              onDecidir={(s) => decidir(j, s)}
            />
          )
        ))}

        {novo && (
          <FormJustificativa
            pessoaId={pessoaId} dia={dia.dia} jornada={jornada} podeDecidir={podeDecidir}
            inicial={null} onFechar={() => setNovo(false)} onSalvou={() => { setNovo(false); onMudou(); }}
          />
        )}
      </div>
    </div>
  );
}

// ── O cartão de uma justificativa ────────────────────────────────────────────
function CartaoJustificativa({ j, jornada, podeDecidir, busy, onEditar, onRemover, onDecidir }: {
  j: Justificativa; jornada: JanelaDaJornada; podeDecidir: boolean; busy: boolean;
  onEditar: () => void; onRemover: () => void; onDecidir: (s: "aprovada" | "recusada") => void;
}) {
  const tipo = ROTULO_TIPO[j.tipo ?? "outro"] ?? ROTULO_TIPO.outro;
  const status = j.status ?? "aprovada";
  const selo = SELO_STATUS[status];
  const efeito = ROTULO_EFEITO[j.efeito ?? "abona"];
  const min = minutosDoRecorte(j, jornada);

  return (
    <div style={{
      border: `1px solid ${status === "pendente" ? "var(--atencao)" : "var(--border)"}`,
      borderRadius: "var(--r-sm)", background: "var(--surface)", padding: "10px 12px",
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ flex: "none", marginTop: 1, color: efeito.cor }}><Icon name={tipo.icone} size={18} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{tipo.label}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
            {j.horaDe && j.horaAte
              ? <>{j.horaDe}–{j.horaAte}{min != null ? ` · ${formatarMinutos(min)}` : ""}</>
              : min != null ? formatarMinutos(min) : "Dia inteiro"}
            {" · "}
            <span style={{ color: efeito.cor, fontWeight: 700 }}>{efeito.label}</span>
          </div>
          {j.motivo && <div style={{ fontSize: 12, color: "var(--text)", marginTop: 4, lineHeight: 1.45 }}>{j.motivo}</div>}
          {j.arquivo && (
            // `target="_blank"` porque a rota RESPONDE COM REDIRECT pra uma URL
            // assinada de 10 min — abrir na mesma aba trocaria a tela do ponto
            // pela imagem e o "voltar" pediria a assinatura de novo.
            <a href={j.arquivo} target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 11.5, fontWeight: 700, color: "var(--info)", textDecoration: "none", minHeight: 28 }}>
              <Icon name="paperclip" size={14} />{j.arquivoNome || "Ver comprovante"}
            </a>
          )}
          {status !== "aprovada" && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 11, fontWeight: 800, color: selo.cor }}>
              <Icon name={selo.icone} size={13} />{selo.label}
            </div>
          )}
          {j.decisaoMotivo && <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 3, fontStyle: "italic" }}>{j.decisaoMotivo}</div>}
        </div>
      </div>

      {/* Ações embaixo e SEMPRE visíveis: no celular não existe hover, e ação
          escondida atrás dele simplesmente não existe. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {podeDecidir && status === "pendente" && (
          <>
            <Botao variante="primario" tamanho="sm" icone="check" disabled={busy} onClick={() => onDecidir("aprovada")}>Aprovar</Botao>
            {/* Recusar não encosta em Aprovar: as duas decidem o atestado de
                alguém, e a 320px elas nasciam grudadas. */}
            <span style={{ flex: 1, minWidth: 12 }} />
            <Botao variante="sutil" tamanho="sm" icone="x" disabled={busy} onClick={() => onDecidir("recusada")}>Recusar</Botao>
          </>
        )}
        {(podeDecidir || status === "pendente") && (
          <Botao variante="sutil" tamanho="sm" icone="pencil" disabled={busy} onClick={onEditar}>Editar</Botao>
        )}
        {/* O destrutivo NÃO encosta no resto: apagar aqui é apagar o atestado
            que alguém mandou, e no celular o polegar erra por 4px. */}
        {(podeDecidir || status === "pendente") && <span style={{ flex: 1, minWidth: 12 }} />}
        {(podeDecidir || status === "pendente") && (
          <Botao variante="perigo" tamanho="sm" icone="trash" disabled={busy} onClick={onRemover}>Apagar</Botao>
        )}
      </div>
    </div>
  );
}

// ── O formulário ─────────────────────────────────────────────────────────────
function FormJustificativa({ pessoaId, dia, jornada, podeDecidir, inicial, onFechar, onSalvou }: {
  pessoaId: string; dia: string; jornada: JanelaDaJornada; podeDecidir: boolean;
  inicial: Justificativa | null; onFechar: () => void; onSalvou: () => void;
}) {
  const [tipo, setTipo] = useState<TipoJustificativa>(inicial?.tipo ?? "atestado");
  const [efeito, setEfeito] = useState<EfeitoJustificativa>(inicial?.efeito ?? ROTULO_TIPO.atestado.efeito);
  const [recorte, setRecorte] = useState<Recorte>(inicial ? recorteDe(inicial) : "janela");
  const [de, setDe] = useState(inicial?.horaDe ?? jornada.entradaPrevista?.slice(0, 5) ?? "08:00");
  const [ate, setAte] = useState(inicial?.horaAte ?? jornada.almocoInicio?.slice(0, 5) ?? "12:00");
  const [horas, setHoras] = useState(() => {
    const m = inicial?.minutos;
    return typeof m === "number" && m > 0 ? String(Math.round((m / 60) * 100) / 100) : "1";
  });
  const [motivo, setMotivo] = useState(inicial?.motivo ?? "");
  const [arquivo, setArquivo] = useState<{ url: string; nome: string } | null>(
    inicial?.arquivo ? { url: inicial.arquivo, nome: inicial.arquivoNome || "Comprovante" } : null,
  );
  const [subindo, setSubindo] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [sinal, setSinal] = useState(0);
  const [busy, setBusy] = useState(false);
  const arquivoRef = useRef<HTMLInputElement | null>(null);

  // Trocar o TIPO reposiciona o efeito sugerido — mas só enquanto o gestor não
  // mexeu nele à mão. Sobrescrever uma escolha explícita seria desfazer o que a
  // pessoa acabou de decidir.
  const efeitoTocado = useRef(false);
  useEffect(() => {
    if (!efeitoTocado.current) setEfeito(ROTULO_TIPO[tipo].efeito);
  }, [tipo]);

  const minutosPrevistos = useMemo(() => minutosDoRecorte({
    horaDe: recorte === "janela" ? de : null,
    horaAte: recorte === "janela" ? ate : null,
    minutos: recorte === "horas" ? Math.round(Number(horas.replace(",", ".")) * 60) : null,
  }, jornada), [recorte, de, ate, horas, jornada]);

  async function escolherArquivo(f: File | null) {
    if (!f) return;
    setErro(null);
    setSubindo(0.01);
    try {
      // `bucketReserva: null` de propósito: sem o B2 configurado, o plano B
      // subiria o atestado num bucket PÚBLICO do Supabase — documento médico
      // aberto na internet. Melhor recusar e dizer.
      const r = await enviarArquivoPrivado(f, "atestados", (p) => setSubindo(Math.max(0.01, p)), null);
      setArquivo({ url: r.url, nome: r.nome });
      toast.ok("Comprovante anexado.");
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      setErro(msg === "storage_off"
        ? "O armazenamento de arquivos está desligado — salve sem anexo e avise o TI."
        : "Não deu pra enviar o arquivo. Tente uma foto menor (até 8 MB).");
      setSinal((s) => s + 1);
    } finally { setSubindo(0); }
  }

  async function salvar() {
    setErro(null);
    if (recorte === "janela" && (!de || !ate || ate <= de)) {
      setErro("A hora final tem que ser depois da inicial."); setSinal((s) => s + 1); return;
    }
    const min = recorte === "horas" ? Math.round(Number(horas.replace(",", ".")) * 60) : null;
    if (recorte === "horas" && (!min || min <= 0)) {
      setErro("Diga quantas horas."); setSinal((s) => s + 1); return;
    }
    setBusy(true);
    try {
      const r = await fetch(ROTA, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: inicial?.id, pessoaId, dia, tipo, efeito, motivo: motivo.trim() || null,
          horaDe: recorte === "janela" ? de : null,
          horaAte: recorte === "janela" ? ate : null,
          minutos: min,
          arquivo: arquivo?.url ?? null,
          arquivoNome: arquivo?.nome ?? null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d?.error || "Falha ao salvar."); setSinal((s) => s + 1); return; }
      toast.ok(d?.pendente ? "Pedido enviado — o RH vai avaliar." : "Justificativa salva.");
      onSalvou();
    } finally { setBusy(false); }
  }

  const tipoAtual = ROTULO_TIPO[tipo];

  return (
    <div style={{ border: "1px solid var(--primary)", borderRadius: "var(--r-sm)", background: "var(--surface)", padding: 12 }}>
      {/* ── Tipo ────────────────────────────────────────────────────────────
          Grade que colapsa sozinha: `minmax(min(100%, 150px), 1fr)` é idêntico
          no computador e vira uma coluna a 320px, sem media query. */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>O que aconteceu?</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 6, marginBottom: 4 }}>
        {TIPOS_JUSTIFICATIVA.map((t) => {
          const r = ROTULO_TIPO[t];
          const ativo = tipo === t;
          return (
            <button key={t} type="button" onClick={() => setTipo(t)}
              style={{
                display: "flex", alignItems: "center", gap: 7, textAlign: "left", cursor: "pointer",
                minHeight: "var(--tap)", padding: "8px 10px", borderRadius: "var(--r-sm)",
                border: `1px solid ${ativo ? "var(--primary)" : "var(--border)"}`,
                background: ativo ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "transparent",
                color: "var(--text)", fontSize: 12.5, fontWeight: ativo ? 800 : 600,
              }}>
              <Icon name={r.icone} size={16} />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "0 0 12px", lineHeight: 1.45 }}>{tipoAtual.ajuda}</p>

      {/* ── Recorte ─────────────────────────────────────────────────────────
          É o coração do pedido: "não vir de manhã" é uma janela, "ficou 2h
          fora" é uma quantidade, e faltar é o dia inteiro. */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Quanto do dia?</div>
      <div className="tab-strip" style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {([["dia", "Dia inteiro"], ["janela", "Das … às …"], ["horas", "Só X horas"]] as [Recorte, string][]).map(([v, lab]) => (
          <button key={v} type="button" onClick={() => setRecorte(v)}
            style={{
              flex: "none", minHeight: "var(--tap)", padding: "8px 14px", borderRadius: "var(--r-sm)", cursor: "pointer",
              border: `1px solid ${recorte === v ? "var(--primary)" : "var(--border)"}`,
              background: recorte === v ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "transparent",
              color: "var(--text)", fontSize: 12.5, fontWeight: recorte === v ? 800 : 600,
            }}>{lab}</button>
        ))}
      </div>

      {recorte === "janela" && (
        <Campos min={130}>
          <Campo label="Das">{(id) => (
            <input id={id} type="time" value={de} onChange={(e) => setDe(e.target.value)} style={{ minHeight: "var(--tap)" }} />
          )}</Campo>
          <Campo label="Às">{(id) => (
            <input id={id} type="time" value={ate} onChange={(e) => setAte(e.target.value)} style={{ minHeight: "var(--tap)" }} />
          )}</Campo>
        </Campos>
      )}
      {recorte === "horas" && (
        <Campos min={160}>
          <Campo label="Horas fora" dica="Use vírgula pra meia hora: 1,5">{(id) => (
            <input id={id} type="text" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} style={{ minHeight: "var(--tap)" }} />
          )}</Campo>
        </Campos>
      )}

      {/* O número que a conta vai usar, dito antes de salvar. Numa escala 08–18
          com almoço 12–13, "das 08:00 às 13:00" vale 4h de jornada, não 5h — e
          adivinhar isso depois, olhando o saldo, é caça ao fantasma. */}
      {recorte !== "dia" && (
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "2px 0 12px", lineHeight: 1.45 }}>
          {minutosPrevistos != null && minutosPrevistos > 0
            ? <>Conta como <strong style={{ color: "var(--text)" }}>{formatarMinutos(minutosPrevistos)}</strong> de jornada{jornada.almocoInicio && jornada.almocoFim ? " (o almoço não entra)" : ""}.</>
            : "Esse intervalo não pega nada da jornada do dia."}
        </p>
      )}

      {/* ── Efeito ──────────────────────────────────────────────────────────
          Só o gestor escolhe. Deixar o colaborador marcar "conta como
          trabalhada" seria autoabono com outro nome — o pedido dele leva o
          efeito sugerido pelo tipo, e quem aprova confirma ou troca. */}
      {podeDecidir ? (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>E as horas?</div>
          <div style={{ marginBottom: 12 }}>
            <GrupoOpcoes cartao valor={efeito} aoMudar={(ef) => { efeitoTocado.current = true; setEfeito(ef); }}
              opcoes={EFEITOS_JUSTIFICATIVA.map((ef) => ({ valor: ef, rotulo: ROTULO_EFEITO[ef].label, descricao: ROTULO_EFEITO[ef].descricao, cor: ROTULO_EFEITO[ef].cor }))} />
          </div>
        </>
      ) : (
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "0 0 12px", lineHeight: 1.45 }}>
          Seu pedido vai pro RH como <strong style={{ color: "var(--text)" }}>{ROTULO_EFEITO[ROTULO_TIPO[tipo].efeito].label.toLowerCase()}</strong>.
          Nada muda no seu banco de horas até alguém aprovar.
        </p>
      )}

      <Campo label="Motivo (opcional)" erro={erro ?? undefined} sinal={sinal}>{(id) => (
        <textarea id={id} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2}
          placeholder="Ex.: consulta no cardiologista, retorno às 14h"
          style={{ resize: "vertical", minHeight: 62 }} />
      )}</Campo>

      {/* ── Anexo ───────────────────────────────────────────────────────────
          Sempre opcional, mas em destaque nos tipos que pedem comprovante. Vai
          pro B2 na área `atestados`, de leitura restrita: nem todo mundo que
          enxerga o ponto pode abrir um documento de saúde. */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
          Comprovante {tipoAtual.pedeAnexo ? <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>· recomendado</span> : <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>· opcional</span>}
        </div>
        {arquivo ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <a href={arquivo.url} target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--info)", textDecoration: "none", minHeight: "var(--tap)" }}>
              <Icon name="paperclip" size={15} />{arquivo.nome}
            </a>
            <Botao variante="sutil" tamanho="sm" icone="x" onClick={() => setArquivo(null)}>Tirar</Botao>
          </div>
        ) : (
          <>
            <Botao variante="sutil" icone="camera" disabled={subindo > 0} onClick={() => arquivoRef.current?.click()}>
              {subindo > 0 ? `Enviando… ${Math.round(subindo * 100)}%` : "Anexar foto ou PDF"}
            </Botao>
            <input
              ref={arquivoRef} type="file" hidden
              accept="image/*,application/pdf"
              onChange={(e) => { void escolherArquivo(e.target.files?.[0] ?? null); e.target.value = ""; }}
            />
            <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "6px 0 0", lineHeight: 1.45 }}>
              Foto do atestado, declaração ou convocação. Até 8 MB de imagem (10 MB em PDF).
              Só o RH e quem administra o ponto conseguem abrir.
            </p>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
        <Botao variante="sutil" onClick={onFechar} disabled={busy}>Cancelar</Botao>
        <Botao variante="primario" onClick={salvar} disabled={busy || subindo > 0}>
          {inicial ? "Salvar" : podeDecidir ? "Justificar" : "Enviar pedido"}
        </Botao>
      </div>
    </div>
  );
}

export { descreverJustificativa };
