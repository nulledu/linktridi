"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { toast, confirmar } from "../Toast";
import { GlassSelect, GlassDate } from "../GlassPicker";
import { PainelGeral } from "./ponto/PainelGeral";
import { Botao, BotaoIcone, ChaveVisual, Caixa } from "../ui/controles";
import { Alerta } from "../ui/Alerta";
import type { PontoPessoa, PontoRegistro, TipoBatida } from "@/lib/ponto";
import { useClasseAberta } from "../ui/micro";

// Rótulo/cor/ícone de cada tipo de batida (jornada: entrada → almoço → retorno → saída).
const TIPOS: { key: TipoBatida; label: string; cor: string; icon: string }[] = [
  { key: "entrada", label: "Entrada", cor: "var(--ok)", icon: "chevron-up" },
  { key: "almoco", label: "Almoço", cor: "var(--atencao)", icon: "hourglass-high" },
  { key: "retorno", label: "Retorno", cor: "var(--info)", icon: "chevron-up" },
  { key: "saida", label: "Saída", cor: "var(--perigo)", icon: "chevron-down" },
];
const tipoInfo = (t: string) => TIPOS.find((x) => x.key === t) ?? TIPOS[0];

// ── Controle de Ponto (Administração) ────────────────────────────────────────
// Pessoas (cadastro com foto de perfil + fotos extras p/ o reconhecimento do
// tablet), registros de batidas (por dia/pessoa) e pareamento do tablet.

interface ColabLite { id: string; name: string; erpUserId?: string | null }

export function PontoPanel({ podeGerir = true }: {
  /** Quem pode bater ponto por outra pessoa e mexer em cadastro. */
  podeGerir?: boolean;
} = {}) {
  // Seis abas irmãs (Agora, Registros, Pessoas, Turnos, Tablet, Banco de horas)
  // pediam que a pessoa soubesse ANTES em qual delas mora a resposta — e as
  // respostas eram cruzadas: "quem está atrasado" ficava numa, "quanto essa
  // pessoa deve" noutra, "qual o turno dela" numa terceira.
  //
  // Sobrou UMA tela. O "Espelho" era a última irmã e caiu pelo mesmo motivo:
  // ninguém procura uma tabela de batidas — procura o dia de ALGUÉM, e pra
  // isso já havia que escolher pessoa e data num filtro, que é exatamente o
  // que o painel já sabe. Corrigir hora, lançar o turno e trocar de dia agora
  // moram em "Gerenciar ponto e horas", dentro da pessoa que se está olhando.
  const [pessoas, setPessoas] = useState<PontoPessoa[] | null>(null);
  const [semTabela, setSemTabela] = useState(false);

  function loadPessoas() {
    fetch("/api/ponto/pessoas", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (d?.error === "tabela_ausente") { setSemTabela(true); setPessoas([]); return; }
      setPessoas(d.pessoas ?? []);
    }).catch(() => setPessoas([]));
  }
  useEffect(loadPessoas, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {semTabela && (
        <Alerta tom="atencao">Falta criar as tabelas: rode <strong>supabase/ponto.sql</strong> no Supabase (SQL Editor) e recarregue.</Alerta>
      )}

      <PainelGeral pessoas={pessoas ?? []} podeGerir={podeGerir} onMudouCadastro={loadPessoas} />

    </div>
  );
}

// Dia (fuso SP) de um instante ISO — mesmo deslocamento usado no resto do painel.
const diaSP = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
// Horários previstos da pessoa, na ordem da jornada. É o que permite lançar o
// dia inteiro num clique em vez de digitar quatro horas na mão.
const horariosDoTurno = (p: PontoPessoa | null | undefined): string[] =>
  p ? [p.entradaPrevista, p.almocoInicio, p.almocoFim, p.saidaPrevista].filter((x): x is string => !!x && /^\d{1,2}:\d{2}/.test(x)).map((x) => x.slice(0, 5)) : [];

// Ajuste manual de horas do banco: soma (+) ou tira (−) horas de um dia, sem mexer
// nas batidas. Lista os ajustes existentes da pessoa e permite remover.
interface AjusteItem { id: string; dia: string; minutos: number; motivo: string | null; autorNome: string | null }
// Exportado: reusado no modal do dia da tela "Banco de horas" (MeuPontoClient),
// pra ajustar horas ONDE o admin vê o saldo, sem trocar de aba.
export function AjusteHoras({ pessoaId, dia, nome }: { pessoaId: string; dia: string; nome?: string }) {
  const [ajustes, setAjustes] = useState<AjusteItem[]>([]);
  const [sinal, setSinal] = useState<1 | -1>(-1);   // padrão: tirar
  const [hhmm, setHhmm] = useState("");
  const [motivo, setMotivo] = useState("");
  const [ausente, setAusente] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function load() { fetch(`/api/ponto/ajustes?pessoaId=${pessoaId}`, { cache: "no-store" }).then((r) => r.json()).then((j) => setAjustes(j.ajustes ?? [])).catch(() => {}); }
  useEffect(load, [pessoaId]);

  const parseMin = (s: string): number | null => { const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?$/); if (!m) return null; return (parseInt(m[1]) || 0) * 60 + (parseInt(m[2] || "0") || 0); };
  const fmt = (m: number) => `${m < 0 ? "−" : "+"}${Math.floor(Math.abs(m) / 60)}h${String(Math.abs(m) % 60).padStart(2, "0")}`;
  const brDia = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

  async function salvar() {
    const base = parseMin(hhmm); if (!base || salvando) { if (!base) toast.erro("Informe as horas (ex.: 2:00)."); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/ponto/ajustes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pessoaId, dia, minutos: sinal * base, motivo }) });
      const j = await r.json();
      if (j.ok) { setHhmm(""); setMotivo(""); load(); toast.ok(`${sinal < 0 ? "Tirou" : "Adicionou"} ${Math.floor(base / 60)}h${String(base % 60).padStart(2, "0")} · ${brDia(dia)}`); }
      else if (j.error === "tabela_ausente") setAusente(true);
      else toast.erro(j.error || "Falha ao salvar.");
    } catch { toast.erro("Falha ao salvar."); }
    setSalvando(false);
  }
  async function remover(id: string) { const ok = await confirmar("Remover este ajuste?", { perigo: true }); if (!ok) return; await fetch(`/api/ponto/ajustes?id=${id}`, { method: "DELETE" }); load(); toast.ok("Ajuste removido."); }

  return (
    <div className="glass" style={{ borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13.5, fontWeight: 800 }}>Ajustar horas {nome ? `de ${nome.split(" ")[0]}` : ""} · {brDia(dia)}</div>
      {ausente && <div style={{ fontSize: 12, color: "var(--atencao)" }}>Rode o supabase/ponto_ajustes.sql no servidor.</div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", background: "var(--surface)", borderRadius: 10, padding: 3, border: "1px solid var(--border)" }}>
          {([[-1, "Tirar"], [1, "Adicionar"]] as [1 | -1, string][]).map(([s, l]) => (
            <button key={l} onClick={() => setSinal(s)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: sinal === s ? (s < 0 ? "var(--perigo)" : "var(--primary)") : "transparent", color: sinal === s ? "var(--on-primary)" : "var(--text-dim)" }}>{l}</button>
          ))}
        </div>
        <input value={hhmm} onChange={(e) => setHhmm(e.target.value)} placeholder="2:00" style={{ width: 82, padding: "9px 11px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, textAlign: "center" }} />
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" style={{ flex: "1 1 160px", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5 }} />
        <Botao variante="primario" onClick={salvar} carregando={salvando}>Aplicar</Botao>
      </div>
      {ajustes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          {ajustes.slice(0, 8).map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
              <span style={{ fontWeight: 800, color: a.minutos < 0 ? "var(--perigo)" : "var(--ok)", minWidth: 54 }}>{fmt(a.minutos)}</span>
              <span style={{ color: "var(--text-dim)" }}>{brDia(a.dia)}</span>
              <span style={{ flex: 1, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.motivo || ""}{a.autorNome ? ` · ${a.autorNome}` : ""}</span>
              <BotaoIcone icone="x" titulo="Remover abono" onClick={() => remover(a.id)} style={{ flex: "none" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Batidas de UM dia, editáveis no lugar ────────────────────────────────────
// Nasceu pro modal do dia (calendário do banco de horas): ali o admin já
// escolheu a pessoa E a data, e mesmo assim precisava fechar tudo, ir pro
// Espelho, refiltrar a data e reabrir "Lançar manual" só pra escrever a hora
// que a pessoa entrou. A data é o próprio dia clicado — não há o que escolher.
export function BatidasDoDia({ pessoaId, dia, turno, onMudou }: {
  pessoaId: string; dia: string;
  /** Horários previstos da pessoa, em ordem — habilita "lançar o turno". */
  turno?: string[];
  /** Algo mudou: quem está por fora recarrega o saldo. */
  onMudou?: () => void;
}) {
  const [regs, setRegs] = useState<PontoRegistro[] | null>(null);
  const [novas, setNovas] = useState<string[]>([]);   // horários digitados ainda não gravados
  const [salvando, setSalvando] = useState(false);

  const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

  const load = useCallback(() => {
    const qs = new URLSearchParams({ period: "custom", from: dia, to: dia, pessoa: pessoaId });
    fetch(`/api/ponto/registros?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRegs((d.registros ?? []).filter((r: PontoRegistro) => diaSP(r.batidoEm) === dia)))
      .catch(() => setRegs([]));
  }, [pessoaId, dia]);
  useEffect(load, [load]);

  const jaTem = (regs ?? []).map((r) => hora(r.batidoEm));
  // Duplicata não vira batida: o servidor aceitaria, e o dia ficaria com duas
  // entradas às 08:00 (e uma jornada inventada, porque a conta é por par).
  const validas = [...new Set(novas.filter((h) => /^\d{2}:\d{2}$/.test(h) && !jaTem.includes(h)))].sort();
  const turnoUtil = (turno ?? []).filter((h) => !jaTem.includes(h));

  async function gravar(horas: string[]) {
    if (!horas.length || salvando) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/ponto/registros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pessoaId, dia, horas }) });
      const d = await r.json();
      if (d?.criados) { toast.ok(`${d.criados} batida(s) lançada(s)`); setNovas([]); load(); onMudou?.(); }
      else toast.erro(d?.error === "tabela_ausente" ? "Rode o supabase/ponto.sql primeiro." : d?.error || "Falha ao lançar.");
    } finally { setSalvando(false); }
  }

  async function mover(id: string, d: string, h: string): Promise<boolean> {
    const r = await fetch("/api/ponto/registros", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, dia: d, hora: h }) });
    const j = await r.json();
    if (j?.registro) { toast.ok(`Hora corrigida para ${h}`); load(); onMudou?.(); return true; }
    toast.erro(j?.error || "Falha ao corrigir.");
    return false;
  }

  async function apagar(id: string) {
    const ok = await confirmar("Apagar esta batida?", { perigo: true });
    if (!ok) return;
    const r = await fetch(`/api/ponto/registros?id=${id}`, { method: "DELETE" });
    if ((await r.json())?.ok) { toast.ok("Batida apagada"); load(); onMudou?.(); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)" }}>Batidas do dia</div>

      {regs === null ? (
        <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Carregando…</div>
      ) : regs.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Nenhuma batida neste dia.</div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {[...regs].sort((a, b) => a.batidoEm.localeCompare(b.batidoEm)).map((r) => (
            <BatidaChip key={r.id} r={r} dia={dia} hora={hora} onMover={mover} onApagar={apagar} />
          ))}
        </div>
      )}

      {/* Uma linha por horário novo. `type="time"` abre o relógio nativo no
          celular — é o teclado certo pra digitar 08:12 com o polegar. */}
      {novas.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 8 }}>
          {novas.map((h, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="time" value={h} onChange={(e) => setNovas((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: "var(--r-sm)", border: `1px solid ${h && jaTem.includes(h) ? "var(--perigo)" : "var(--border)"}`, background: "var(--surface)", color: "var(--text)", fontSize: 14 }} />
              <BotaoIcone icone="x" titulo="Tirar este horário" onClick={() => setNovas((l) => l.filter((_, j) => j !== i))} style={{ flex: "none" }} />
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Botao tamanho="sm" variante="sutil" icone="plus" onClick={() => setNovas((l) => [...l, ""])}>Adicionar horário</Botao>
        {turnoUtil.length >= 2 && (
          <Botao tamanho="sm" icone="clock" onClick={() => gravar(turnoUtil)} disabled={salvando} title={`Lança ${turnoUtil.join(" · ")}`}>Lançar o turno</Botao>
        )}
        {validas.length > 0 && (
          <Botao tamanho="sm" variante="primario" icone="check" onClick={() => gravar(validas)} carregando={salvando}>
            {validas.length > 1 ? `Lançar ${validas.length} batidas` : "Lançar batida"}
          </Botao>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
        O tipo (entrada/almoço/retorno/saída) vem da ordem das horas — não precisa acertar o rótulo. Toque na hora de uma batida pra corrigir.
      </div>
    </div>
  );
}

// Chip de uma batida: mostra a hora e o tipo, e a HORA é editável no lugar —
// antes, corrigir 5 minutos exigia apagar (perdendo a selfie e a origem) e
// lançar de novo pelo formulário lá em cima.
export function BatidaChip({ r, dia, hora, onMover, onApagar }: {
  r: PontoRegistro; dia: string; hora: (iso: string) => string;
  onMover: (id: string, dia: string, hora: string) => Promise<boolean>;
  onApagar: (id: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(() => hora(r.batidoEm));
  const [salvando, setSalvando] = useState(false);
  const info = tipoInfo(r.tipo);

  async function salvar() {
    if (!/^\d{2}:\d{2}$/.test(valor) || salvando) return;
    if (valor === hora(r.batidoEm)) { setEditando(false); return; }
    setSalvando(true);
    const ok = await onMover(r.id, dia, valor);
    setSalvando(false);
    if (ok) setEditando(false);
  }

  if (editando) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 999, background: "var(--surface)", border: `1px solid ${info.cor}` }}>
        <Icon name={info.icon} size={13} color={info.cor} />
        <input type="time" value={valor} autoFocus onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") salvar(); if (e.key === "Escape") { setValor(hora(r.batidoEm)); setEditando(false); } }}
          style={{ width: 92, padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }} />
        <BotaoIcone icone="check" titulo="Salvar hora" onClick={salvar} carregando={salvando} style={{ flex: "none" }} />
        <BotaoIcone icone="x" titulo="Cancelar" onClick={() => { setValor(hora(r.batidoEm)); setEditando(false); }} style={{ flex: "none" }} />
      </span>
    );
  }

  return (
    <span title={`${r.origem}${r.confianca != null ? ` · confiança ${(r.confianca * 100).toFixed(0)}%` : ""}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: "var(--surface)", border: "1px solid var(--border)" }}>
      <Icon name={info.icon} size={13} color={info.cor} />
      {/* A hora inteira é o alvo de edição (não um lápis de 12px ao lado). */}
      <button onClick={() => { setValor(hora(r.batidoEm)); setEditando(true); }} title="Corrigir a hora"
        // minWidth 44: "11:02" só ocupa 35px, e a fundação só garante a ALTURA
        // do dedo — a largura tinha que vir daqui.
        style={{ border: "none", background: "none", padding: 0, minWidth: 44, cursor: "pointer", font: "inherit", color: "var(--text)", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3, whiteSpace: "nowrap" }}>
        {hora(r.batidoEm)}
      </button>
      <span style={{ color: "var(--text-dim)", fontWeight: 600, whiteSpace: "nowrap" }}>{info.label.toLowerCase()}</span>
      {r.selfieUrl && (
        // Botão de verdade em volta da miniatura: a <img> com onClick
        // não tinha teclado nem altura de dedo (22px). A fundação dá
        // os 44px no celular; no desktop o botão fica do tamanho da foto.
        <button type="button" onClick={() => window.open(r.selfieUrl!, "_blank", "noopener")}
          title="Ver a selfie" aria-label="Ver a selfie"
          style={{ border: "none", background: "none", padding: 0, cursor: "pointer", display: "grid", placeItems: "center", flex: "none", borderRadius: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.selfieUrl} alt="selfie" style={{ display: "block", width: 22, height: 22, borderRadius: 6, objectFit: "cover" }} />
        </button>
      )}
      {/* nowrap: o `overflow-wrap: anywhere` da fundação partia a
          etiqueta no meio ("manu/al") quando o chip apertava. */}
      {r.origem === "manual" && <span style={{ color: "var(--text-dim)", fontWeight: 600, whiteSpace: "nowrap" }}>manual</span>}
      {/* Apagar batida é destrutivo: alvo de 12px colado na selfie
          clicável virava toque errado no celular. Separado e maior. */}
      <BotaoIcone icone="x" titulo="Apagar batida" onClick={() => onApagar(r.id)} style={{ flex: "none", marginLeft: 10 }} />
    </span>
  );
}

// Modal de lançamento: o DIA INTEIRO de uma vez. O formulário antigo lançava uma
// batida e se fechava — pra registrar entrada/almoço/retorno/saída era reabrir
// quatro vezes, reescolhendo pessoa e dia em cada uma.
export function LancarDiaModal({ pessoas, pessoaInicial, diaInicial, jaTemDe, onLancar, onClose, classe = "" }: {
  /** Classe do ciclo de abertura da receita de modal (`useAbrirFechar`).
   *  OPCIONAL de propósito: este componente tem vários chamadores — provas
   *  `/dev-*` e testes montam ele direto. Sem valor, o modal se comporta
   *  como antes (entra pelo `.apple-modal`, sai por desmonte). */
  classe?: string;

  pessoas: PontoPessoa[]; pessoaInicial?: string; diaInicial: string;
  jaTemDe: (pessoaId: string, dia: string) => string[];
  onLancar: (pessoaId: string, dia: string, horas: string[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const [id, setId] = useState(pessoaInicial || pessoas[0]?.id || "");
  const [dia, setDia] = useState(diaInicial);
  const [horas, setHoras] = useState<string[]>(["", "", "", ""]);
  const [salvando, setSalvando] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const cls = useClasseAberta(classe);

  const pes = pessoas.find((p) => p.id === id) ?? null;
  const turno = horariosDoTurno(pes);
  const jaTem = id ? jaTemDe(id, dia) : [];
  // Já registradas contam como preenchidas: o padrão do turno só completa o que
  // falta, senão "lançar o turno" num dia meio-batido duplicava a entrada.
  const preenchidas = horas.filter(Boolean);
  const conflito = preenchidas.filter((h) => jaTem.includes(h));
  const validas = [...new Set(preenchidas.filter((h) => !jaTem.includes(h)))].sort();

  const rotulo = (i: number) => ["Entrada", "Saída p/ almoço", "Volta do almoço", "Saída"][i] ?? `Batida ${i + 1}`;
  const setHora = (i: number, v: string) => setHoras((l) => l.map((x, j) => (j === i ? v : x)));

  async function salvar() {
    if (!id || !validas.length || salvando) return;
    setSalvando(true);
    const ok = await onLancar(id, dia, validas);
    setSalvando(false);
    if (ok) onClose();
  }

  if (!mounted) return null;
  // Portal p/ document.body pelo mesmo motivo do PessoaModal: fora de ancestral
  // com transform, senão o fixed ancora na coluna e a folha nasce fora da tela.
  return createPortal(
    <div className={`apple-backdrop sheet-host ${cls}`.trim()} onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", zIndex: "var(--z-modal, 1300)", padding: 18 }}>
      <div className={`apple-modal sheet t-modal ${cls}`.trim()} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, maxHeight: "90dvh", overflowY: "auto", borderRadius: 20, border: "1px solid var(--border)", background: "var(--surface-2)", padding: "clamp(16px, 4vw, 24px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, flex: 1, minWidth: 0 }}>Lançar ponto manual</h2>
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onClose} style={{ flex: "none" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <GlassSelect value={id} onChange={setId} placeholder="Pessoa" style={{ flex: "1 1 min(100%, 190px)" }}
              options={pessoas.map((p) => ({ value: p.id, label: p.nome }))} />
            <GlassDate value={dia} onChange={setDia} style={{ flex: "1 1 min(100%, 150px)" }} />
          </div>

          {jaTem.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
              Já registrado neste dia: <b style={{ color: "var(--text)" }}>{jaTem.join(" · ")}</b>. O que você digitar abaixo é somado.
            </div>
          )}

          {/* Um clique preenche os quatro campos com o horário cadastrado. Fica
              editável: quem chegou 8:12 corrige só aquele campo. */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Botao tamanho="sm" icone="clock" onClick={() => setHoras([turno[0] ?? "", turno[1] ?? "", turno[2] ?? "", turno[3] ?? ""])} disabled={turno.length < 2}
              title={turno.length >= 2 ? `Preenche com ${turno.join(" · ")}` : "Cadastre o horário previsto da pessoa em Pessoas"}>Horário do turno</Botao>
            <Botao tamanho="sm" icone="x" onClick={() => setHoras(["", "", "", ""])}>Limpar</Botao>
          </div>

          {/* Grade que colapsa sozinha: dois campos por linha no desktop, um a
              320px, sem media query. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))", gap: 10 }}>
            {horas.map((h, i) => (
              <label key={i} style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>
                {rotulo(i)}
                <input type="time" value={h} onChange={(e) => setHora(i, e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 5, padding: "10px 12px", borderRadius: 11, border: `1px solid ${h && jaTem.includes(h) ? "var(--perigo)" : "var(--border)"}`, background: "var(--surface)", color: "var(--text)", fontSize: 14 }} />
              </label>
            ))}
          </div>

          {/* Batida extra (voltou à noite, saiu no meio do dia). */}
          {horas.length < 8 && (
            <Botao tamanho="sm" variante="sutil" icone="plus" onClick={() => setHoras((l) => [...l, ""])} style={{ width: "fit-content" }}>Mais um horário</Botao>
          )}

          {conflito.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--perigo)", fontWeight: 600, lineHeight: 1.5 }}>
              {conflito.join(" · ")} já existe(m) neste dia — vai ser ignorado(s).
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
            O sistema define entrada/almoço/retorno/saída pela ordem das horas — não precisa acertar o rótulo.
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 2, flexWrap: "wrap" }}>
            <Botao onClick={onClose}>Cancelar</Botao>
            <Botao variante="primario" onClick={salvar} disabled={!id || !validas.length} carregando={salvando}>
              {validas.length > 1 ? `Lançar ${validas.length} batidas` : "Lançar batida"}
            </Botao>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Pessoas ──────────────────────────────────────────────────────────────────
// Modal de cadastro/edição: nome, vínculo com usuário do sistema (opcional),
// foto de perfil + fotos extras (quanto mais fotos, melhor o reconhecimento).
// "8" | "8:48" | "8,8" → minutos/dia. Vazio/invalido → null (usa o padrão 8h).
// Turno vindo da API. A conta da jornada é a MESMA de lib/ponto-turnos (horário
// menos almoço) — repetida aqui só pra não puxar o módulo de servidor pro client.
interface TurnoOpcao {
  id: string; nome: string; entrada: string; saida: string;
  almocoInicio: string | null; almocoFim: string | null;
  trabalhaSabado: boolean; sabadoEntrada: string | null; sabadoSaida: string | null;
}
const minDoRelogio = (v: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec((v ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};
const duracaoMin = (de: string | null | undefined, ate: string | null | undefined): number => {
  const a = minDoRelogio(de), b = minDoRelogio(ate);
  if (a == null || b == null) return 0;
  return b >= a ? b - a : (24 * 60 - a) + b;
};
const minutosDoTurno = (t: TurnoOpcao) =>
  Math.max(0, duracaoMin(t.entrada, t.saida) - (t.almocoInicio && t.almocoFim ? duracaoMin(t.almocoInicio, t.almocoFim) : 0));
const minutosSabadoDoTurno = (t: TurnoOpcao) => (t.trabalhaSabado ? duracaoMin(t.sabadoEntrada, t.sabadoSaida) : 0);

function parseJornadaMin(s: string): number | null {
  const t = s.trim(); if (!t) return null;
  if (t.includes(":")) { const [h, m] = t.split(":").map((x) => Number(x) || 0); return h * 60 + m; }
  const h = Number(t.replace(",", ".")); return isFinite(h) && h > 0 ? Math.round(h * 60) : null;
}
const jornadaMinToStr = (min: number | null | undefined) => (min && min > 0 ? `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}` : "");

export function PessoaModal({ pessoa, onClose, onSaved, colaboradorFixo, classe = "" }: { pessoa: PontoPessoa | null; onClose: () => void; onSaved: () => void; colaboradorFixo?: { id: string; nome: string }; classe?: string }) {
  const idTurno = useId();
  const [nome, setNome] = useState(pessoa?.nome ?? colaboradorFixo?.nome ?? "");
  const [colaboradorId, setColaboradorId] = useState<string>(pessoa?.colaboradorId ?? colaboradorFixo?.id ?? "");
  const [funcSel, setFuncSel] = useState<string>("");   // valor cru do <select> de funcionário (prefixo e:/c:)
  const [fotoUrl, setFotoUrl] = useState<string | null>(pessoa?.fotoUrl ?? null);
  const [fotos, setFotos] = useState<string[]>(pessoa?.fotos ?? []);
  const [ativo, setAtivo] = useState(pessoa?.ativo ?? true);
  const [pin, setPin] = useState("");                                   // vazio = não mexe
  const [limparPin, setLimparPin] = useState(false);
  const [jornadaStr, setJornadaStr] = useState(jornadaMinToStr(pessoa?.jornadaMin));
  const [trabalhaSabado, setTrabalhaSabado] = useState(pessoa?.trabalhaSabado ?? false);
  const [sabadoStr, setSabadoStr] = useState(pessoa?.sabadoMin ? jornadaMinToStr(pessoa.sabadoMin) : "4:00");
  const [estagiario, setEstagiario] = useState(pessoa?.estagiario ?? false);
  const [entradaPrev, setEntradaPrev] = useState(pessoa?.entradaPrevista ?? "");
  const [saidaPrev, setSaidaPrev] = useState(pessoa?.saidaPrevista ?? "");
  const [almocoIni, setAlmocoIni] = useState(pessoa?.almocoInicio ?? "");
  const [almocoFim, setAlmocoFim] = useState(pessoa?.almocoFim ?? "");
  const [turnoId, setTurnoId] = useState(pessoa?.turnoId ?? "");
  const [turnos, setTurnos] = useState<TurnoOpcao[]>([]);

  useEffect(() => {
    fetch("/api/ponto/turnos", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setTurnos(d.turnos ?? [])).catch(() => {});
  }, []);

  // Escolher um turno PREENCHE os campos abaixo. Continuam editáveis: quem tem
  // um horário fora do padrão ajusta na mão sem precisar criar turno só pra ele.
  const aplicarTurnoNoForm = (id: string) => {
    setTurnoId(id);
    const t = turnos.find((x) => x.id === id);
    if (!t) return;
    setEntradaPrev(t.entrada);
    setSaidaPrev(t.saida);
    setAlmocoIni(t.almocoInicio ?? "");
    setAlmocoFim(t.almocoFim ?? "");
    setJornadaStr(jornadaMinToStr(minutosDoTurno(t)));
    setTrabalhaSabado(t.trabalhaSabado);
    if (t.trabalhaSabado) setSabadoStr(jornadaMinToStr(minutosSabadoDoTurno(t)));
  };
  const [colabs, setColabs] = useState<ColabLite[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const cls = useClasseAberta(classe);

  // Usuários do ERP — pra puxar nome + foto de perfil automaticamente no cadastro.
  const [erpUsers, setErpUsers] = useState<Array<{ id: string; nome: string; apelido: string | null; foto_url: string | null }>>([]);
  const [erpBusca, setErpBusca] = useState("");
  const [erpAberto, setErpAberto] = useState(false);
  useEffect(() => {
    fetch("/api/colaboradores", { cache: "no-store" }).then((r) => r.json())
      .then((d) => setColabs(((d.colaboradores ?? []) as Array<{ id: string; name: string | null; username: string; employees?: { erp_user_id?: string | null } | null }>).map((c) => ({ id: c.id, name: c.name || c.username, erpUserId: c.employees?.erp_user_id ?? null }))))
      .catch(() => setColabs([]));
    fetch("/api/erp-users", { cache: "no-store" }).then((r) => r.json())
      .then((d) => setErpUsers(d.users ?? [])).catch(() => setErpUsers([]));
  }, []);

  const erpNome = (u: { nome: string; apelido: string | null }) => u.apelido || u.nome;

  // TODOS os funcionários do ERP viram opção. Ligar ao LOGIN (colaborador_id =
  // employees.id, FK) só quando a pessoa tem conta no sistema; senão fica só o
  // nome (o banco de horas dela aparece pro admin, ela é que não vê o próprio).
  const erpToColab = new Map<string, { id: string; name: string }>();
  for (const c of colabs) if (c.erpUserId) erpToColab.set(c.erpUserId, { id: c.id, name: c.name });
  const colabsSemErp = colabs.filter((c) => !c.erpUserId);   // logins fora do ERP (contas de sistema)

  type Func = { key: string; nome: string; foto: string | null; login: boolean };
  const todosFunc: Func[] = [
    ...erpUsers.map((u) => ({ key: `e:${u.id}`, nome: erpNome(u), foto: u.foto_url, login: erpToColab.has(u.id) })),
    ...colabsSemErp.map((c) => ({ key: `c:${c.id}`, nome: c.name, foto: null, login: true })),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const funcFiltrados = (erpBusca.trim() ? todosFunc.filter((f) => f.nome.toLowerCase().includes(erpBusca.trim().toLowerCase())) : todosFunc).slice(0, 50);
  const funcSelInfo = funcSel ? todosFunc.find((f) => f.key === funcSel) ?? null : null;

  // Reflete o vínculo salvo (colaborador_id) no valor do seletor, ao editar.
  useEffect(() => {
    if (!pessoa?.colaboradorId) { setFuncSel(""); return; }
    const c = colabs.find((x) => x.id === pessoa.colaboradorId);
    setFuncSel(c?.erpUserId ? `e:${c.erpUserId}` : c ? `c:${c.id}` : "");
  }, [colabs, pessoa]);

  function setLink(key: string) {   // deriva o colaborador_id (FK) a partir da opção
    if (!key) { setColaboradorId(""); return; }
    if (key.startsWith("e:")) setColaboradorId(erpToColab.get(key.slice(2))?.id ?? "");   // liga ao login se existir
    else if (key.startsWith("c:")) setColaboradorId(key.slice(2));
  }
  function pickFunc(f: Func) {
    setFuncSel(f.key); setLink(f.key);
    setNome(f.nome); if (f.foto) setFotoUrl(f.foto);
    setErpBusca(""); setErpAberto(false);
  }
  function limparFunc() { setFuncSel(""); setColaboradorId(""); setErpAberto(false); }

  async function upload(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file); fd.append("bucket", "photos");
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const d = await r.json();
    return d?.url ?? null;
  }

  async function addFotos(files: FileList | null, principal: boolean) {
    if (!files?.length) return;
    setSubindo(true);
    try {
      for (const f of Array.from(files)) {
        const url = await upload(f);
        if (!url) { toast.erro("Falha ao subir a foto."); continue; }
        if (principal) { setFotoUrl(url); return; }
        setFotos((l) => [...l, url]);
      }
    } finally { setSubindo(false); }
  }

  async function salvar() {
    if (!nome.trim()) { toast.erro("Dê um nome."); return; }
    // Foto só é EXIGIDA ao cadastrar. Editando, ela vira aviso: "Gerar pros
    // ativos" cria gente sem foto, e exigi-la aqui travava TODA edição dessas
    // pessoas — inclusive desmarcar "Ativa", o único jeito de tirar alguém do
    // tablet sem apagar as batidas.
    if (!fotoUrl && !pessoa) { toast.erro("Adicione a foto de perfil (o reconhecimento precisa dela)."); return; }
    if (pin && !/^\d{4,6}$/.test(pin)) { toast.erro("PIN deve ter 4 a 6 dígitos."); return; }
    setSalvando(true);
    try {
      // Consentimento de biometria já é coberto pelo contrato de trabalho.
      const body: Record<string, unknown> = { id: pessoa?.id, nome, colaboradorId: colaboradorId || null, fotoUrl, fotos, ativo,
        jornadaMin: parseJornadaMin(jornadaStr), trabalhaSabado, sabadoMin: trabalhaSabado ? parseJornadaMin(sabadoStr) : null, estagiario,
        entradaPrevista: entradaPrev.trim() || null, saidaPrevista: saidaPrev.trim() || null,
        // Almoço só vale COMPLETO: metade viraria um desconto inventado.
        almocoInicio: almocoIni.trim() && almocoFim.trim() ? almocoIni.trim() : null,
        almocoFim: almocoIni.trim() && almocoFim.trim() ? almocoFim.trim() : null,
        turnoId: turnoId || null };
      if (limparPin) body.pin = "";           // remove o PIN
      else if (pin) body.pin = pin;           // define/troca; vazio = mantém
      const r = await fetch("/api/ponto/pessoas", { method: pessoa ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d?.error === "tabela_ausente") { toast.erro("Rode o supabase/ponto.sql primeiro."); return; }
      if (d?.error) { toast.erro(d.error); return; }
      // Salvou, mas algum campo NÃO persistiu (coluna ausente) → avisa em alto e bom som.
      if (d?.aviso) { toast.erro(d.aviso); onSaved(); return; }
      toast.ok(pessoa ? "Pessoa atualizada" : "Pessoa cadastrada");
      if (!fotoUrl) toast.erro("Sem foto de perfil o tablet não reconhece esta pessoa.");
      onSaved();
    } finally { setSalvando(false); }
  }

  if (!mounted) return null;
  // Portal p/ document.body: fora de qualquer ancestral com transform/filter, pra
  // o position:fixed valer a TELA inteira (senão o modal sai da tela/corta o topo).
  return createPortal(
    <div className={`apple-backdrop sheet-host ${cls}`.trim()} onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", zIndex: "var(--z-modal, 1300)", padding: 18 }}>
      {/* Padding fluido: 24px no desktop, 16px a 320px — com 24 fixos sobravam
          248px de conteúdo dentro da folha. */}
      <div className={`apple-modal sheet t-modal ${cls}`.trim()} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "90dvh", overflowY: "auto", borderRadius: 20, border: "1px solid var(--border)", background: "var(--surface-2)", padding: "clamp(16px, 4vw, 24px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, flex: 1, minWidth: 0 }}>{pessoa ? "Editar pessoa" : "Cadastrar pessoa"}</h2>
          {/* Ícone Tabler no lugar do "✕": além da regra de ícones, é o que faz a
              fundação dar 44×44 ao botão (regra do svg como filho único). */}
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onClose} style={{ flex: "none" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome de quem bate o ponto"
              style={{ display: "block", width: "100%", marginTop: 5, padding: "10px 13px", borderRadius: 11, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14 }} />
          </label>

          {/* Funcionário — busca com foto; liga ao login quando existe.
              (Escondido quando abre pelo perfil do colaborador: já está fixo.) */}
          {colaboradorFixo ? (
            <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
              Vinculado ao login de <strong style={{ color: "var(--text)" }}>{colaboradorFixo.nome}</strong> — ele vê o próprio banco de horas.
            </div>
          ) : (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 5 }}>Funcionário (opcional)</div>
            {funcSelInfo ? (
              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)" }}>
                <Foto url={funcSelInfo.foto} nome={funcSelInfo.nome} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{funcSelInfo.nome}</div>
                  <div style={{ fontSize: 11.5, color: funcSelInfo.login ? "var(--ok)" : "var(--text-dim)", fontWeight: 600 }}>
                    {funcSelInfo.login ? "Tem login — vê o próprio banco de horas" : "Sem login — entra só com o nome"}
                  </div>
                </div>
                <Botao tamanho="sm" onClick={limparFunc}>Trocar</Botao>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <input value={erpBusca} onChange={(e) => { setErpBusca(e.target.value); setErpAberto(true); }} onFocus={() => setErpAberto(true)}
                  placeholder="Buscar funcionário…"
                  style={{ display: "block", width: "100%", padding: "10px 13px", borderRadius: 11, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14 }} />
                {erpAberto && funcFiltrados.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, marginTop: 4, maxHeight: 300, overflowY: "auto", borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)", boxShadow: "0 12px 40px rgba(0,0,0,.4)", padding: 6 }}>
                    {funcFiltrados.map((f) => (
                      <button key={f.key} type="button" onClick={() => pickFunc(f)}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", borderRadius: 9, border: "none", cursor: "pointer", background: "transparent", textAlign: "left" }}>
                        <Foto url={f.foto} nome={f.nome} size={30} />
                        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nome}</span>
                        {f.login && <span style={{ fontSize: 10, fontWeight: 800, color: "var(--primary-texto, var(--primary))", border: "1px solid var(--primary)", borderRadius: 999, padding: "1px 7px" }}>LOGIN</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.45 }}>Todos os funcionários aparecem aqui. Com login, a pessoa vê o próprio banco de horas; sem login, entra só com o nome.</div>
          </div>
          )}

          {/* Foto de perfil */}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 6 }}>Foto de perfil (rosto de frente, bem iluminado)</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Foto url={fotoUrl} nome={nome || "?"} size={64} />
              <label className="glass" style={{ padding: "9px 15px", borderRadius: 11, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {fotoUrl ? "Trocar foto" : "Escolher foto"}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => addFotos(e.target.files, true)} />
              </label>
            </div>
          </div>

          {/* Fotos extras */}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 6 }}>
              Fotos extras p/ reconhecimento (opcional — ângulos diferentes ajudam)
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {fotos.map((f, i) => (
                <span key={i} style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f} alt={`foto ${i + 1}`} style={{ width: 54, height: 54, borderRadius: 12, objectFit: "cover", border: "1px solid var(--border)" }} />
                  {/* Área de toque de 44×44 TRANSPARENTE com a bolinha vermelha de
                      20px no meio: o círculo cai exatamente onde caía antes (o
                      desktop não muda), mas o alvo deixa de ter 20px. Sem isso o
                      piso de 44px de altura da fundação esticava a bolinha numa
                      elipse de 20×44. */}
                  <button onClick={() => setFotos((l) => l.filter((_, j) => j !== i))} title="Remover foto" aria-label="Remover foto"
                    style={{ position: "absolute", top: -18, right: -18, width: 44, height: 44, padding: 0, border: "none", background: "none", cursor: "pointer", display: "grid", placeItems: "center" }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--perigo)", display: "grid", placeItems: "center" }}>
                      <Icon name="x" size={11} color="#fff" />
                    </span>
                  </button>
                </span>
              ))}
              <label className="glass" style={{ width: 54, height: 54, borderRadius: 12, display: "grid", placeItems: "center", cursor: "pointer", border: "1px dashed var(--border)" }}>
                <Icon name="sparkles" size={18} color="var(--text-dim)" />
                <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => addFotos(e.target.files, false)} />
              </label>
            </div>
          </div>

          {/* PIN — trava anti-fraude: exigido no tablet quando a pessoa é escolhida
              manualmente na lista (evita bater ponto pelo colega). */}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 6 }}>
              PIN de segurança (opcional, 4–6 dígitos){pessoa?.temPin && !limparPin ? " — já definido" : ""}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric"
                placeholder={pessoa?.temPin ? "•••• (deixe vazio p/ manter)" : "ex: 1234"} disabled={limparPin}
                style={{ width: 200, padding: "10px 13px", borderRadius: 11, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, opacity: limparPin ? 0.5 : 1 }} />
              {pessoa?.temPin && (
                <label style={{ display: "flex", gap: 7, alignItems: "center", margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)", cursor: "pointer", width: "fit-content" }}>
                  <Caixa marcado={limparPin} onChange={(marc) => setLimparPin(marc)} /> remover PIN
                </label>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 5 }}>
              Pedido no tablet só quando a pessoa não é reconhecida e escolhe o nome na lista.
            </div>
          </div>

          {/* Jornada — quantas horas/dia (banco de horas) + horário previsto. */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Turno pronto: escolher preenche tudo abaixo de uma vez. */}
            {/* `<div>` e não `<label>`: o gatilho do seletor é um `<button>`, e
                um rótulo que o envolve dispara o botão — a lista de turnos abria
                sozinha ao tocar na palavra "Turno". O vínculo é por `id`. */}
            <div>
              <label id={idTurno} style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 5 }}>Turno</label>
              <GlassSelect
                aria-labelledby={idTurno}
                value={turnoId}
                onChange={(v) => aplicarTurnoNoForm(v)}
                placeholder="Horário personalizado"
                options={[{ value: "", label: "Horário personalizado" }, ...turnos.map((t) => ({ value: t.id, label: t.nome }))]}
              />
              <span style={{ display: "block", fontSize: 12.5, color: "var(--text-dim)", marginTop: 4, fontWeight: 400, lineHeight: 1.45 }}>
                {turnos.length === 0
                  ? "Nenhum turno cadastrado ainda — rode supabase/ponto_turnos.sql."
                  : "Escolher um turno preenche os campos abaixo. Dá pra ajustar depois pra quem foge do padrão."}
              </span>
            </div>

            <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>Jornada — horas por dia
              <input value={jornadaStr} onChange={(e) => setJornadaStr(e.target.value)} placeholder="8:00"
                style={{ display: "block", width: 140, marginTop: 5, padding: "10px 13px", borderRadius: 11, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14 }} />
            </label>
            <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
              Quanto essa pessoa deve trabalhar por dia (base do banco de horas). Ex.: <b>8:00</b>, <b>6:00</b>, <b>8:48</b>. Vazio = padrão 8h.
            </div>
            {/* Trabalha sábado (independente das horas/dia) */}
            <button type="button" role="switch" aria-checked={trabalhaSabado} className="ui-chave-dono" onClick={() => setTrabalhaSabado((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 8, padding: "10px 13px", borderRadius: 12, border: "1px solid var(--border)", background: trabalhaSabado ? "color-mix(in srgb, var(--primary) 10%, var(--surface))" : "var(--surface)", cursor: "pointer", textAlign: "left", width: "fit-content", maxWidth: "100%" }}>
              <ChaveVisual ligado={trabalhaSabado} cor="var(--primary)" />
              <span>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Trabalha sábado</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)" }}>{trabalhaSabado ? "Sábado conta no banco de horas." : "Sábado é folga — não conta no banco de horas."}</span>
              </span>
            </button>
            {trabalhaSabado && (
              <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", marginTop: 4 }}>Horas no sábado
                <input value={sabadoStr} onChange={(e) => setSabadoStr(e.target.value)} placeholder="4:00"
                  style={{ display: "block", width: 140, marginTop: 5, padding: "10px 13px", borderRadius: 11, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14 }} />
                <span style={{ display: "block", fontSize: 12.5, color: "var(--text-dim)", marginTop: 4, fontWeight: 400, lineHeight: 1.45 }}>Padrão <b>4:00</b>. Ajuste pra quem faz menos (ex.: 3:00, 2:00).</span>
              </label>
            )}
            {/* Estagiário: estágio não gera hora extra. O crédito do RELÓGIO é
                descartado; quitar dívida e ajuste manual continuam valendo. */}
            {/* A chave é a `ChaveVisual` do kit, igual à do vizinho "Trabalha
                sábado". Aqui ela era desenhada à mão — dois `<span>` com
                `left` animado —, e ficava 1px mais alta, com outro raio e sem
                o `role="switch"` que o leitor de tela precisa. Duas chaves
                diferentes a dez linhas de distância, no mesmo formulário. */}
            <button type="button" role="switch" aria-checked={estagiario} className="ui-chave-dono" onClick={() => setEstagiario((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 8, minHeight: "var(--tap)", padding: "10px 13px", borderRadius: 12, border: "1px solid var(--border)", background: estagiario ? "color-mix(in srgb, var(--primary) 10%, var(--surface))" : "var(--surface)", cursor: "pointer", textAlign: "left", width: "fit-content", maxWidth: "100%" }}>
              <ChaveVisual ligado={estagiario} cor="var(--primary)" />
              <span>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Estagiário</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)" }}>{estagiario ? "Não acumula hora extra — só lançamento manual do admin." : "Acumula hora extra normalmente."}</span>
              </span>
            </button>
            <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>Entra (referência)
                <input type="time" value={entradaPrev} onChange={(e) => setEntradaPrev(e.target.value)}
                  style={{ display: "block", marginTop: 5, padding: "9px 11px", borderRadius: 11, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14 }} />
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>Sai (referência)
                <input type="time" value={saidaPrev} onChange={(e) => setSaidaPrev(e.target.value)}
                  style={{ display: "block", marginTop: 5, padding: "9px 11px", borderRadius: 11, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14 }} />
              </label>
            </div>

            {/* Almoço: é o que permite cobrar quem estica. Sem preencher, o
                sistema só confere o total do dia. */}
            <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>Sai pro almoço
                <input type="time" value={almocoIni} onChange={(e) => setAlmocoIni(e.target.value)}
                  style={{ display: "block", marginTop: 5, padding: "9px 11px", borderRadius: 11, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14 }} />
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>Volta do almoço
                <input type="time" value={almocoFim} onChange={(e) => setAlmocoFim(e.target.value)}
                  style={{ display: "block", marginTop: 5, padding: "9px 11px", borderRadius: 11, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14 }} />
              </label>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
              {almocoIni && almocoFim
                ? <>Almoço de <b>{jornadaMinToStr(duracaoMin(almocoIni, almocoFim))}</b>. Voltar mais de <b>5 min</b> depois já conta no banco de horas.</>
                : <>Sem almoço definido — o sistema só confere o <b>total do dia</b>, então esticar o almoço passa batido se a pessoa compensar na saída.</>}
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 9, margin: 0, fontSize: 13.5, fontWeight: 600, color: "var(--text)", cursor: "pointer", width: "fit-content" }}>
            <Caixa marcado={ativo} onChange={(marc) => setAtivo(marc)} />
            Ativa (aparece no tablet)
          </label>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            {subindo && <span style={{ fontSize: 12.5, color: "var(--text-dim)", alignSelf: "center" }}>subindo foto…</span>}
            <Botao onClick={onClose}>Cancelar</Botao>
            <Botao variante="primario" onClick={salvar} disabled={subindo} carregando={salvando}>Salvar</Botao>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Tablet (pareamento) ──────────────────────────────────────────────────────
function Foto({ url, nome, size }: { url: string | null; nome: string; size: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={nome} style={{ width: size, height: size, borderRadius: size * 0.3, objectFit: "cover", border: "1px solid var(--border)", flex: "none" }} />;
  }
  return (
    <span style={{ width: size, height: size, borderRadius: size * 0.3, flex: "none", display: "grid", placeItems: "center", background: "var(--surface-2)", fontSize: size * 0.4, fontWeight: 800, color: "var(--text-dim)" }}>
      {(nome || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}
