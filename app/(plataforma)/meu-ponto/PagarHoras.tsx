"use client";

// ── Pagar horas a favor ──────────────────────────────────────────────────────
// Quando a pessoa tem horas A MAIS e a empresa paga em dinheiro, elas saem do
// banco. Não é ajuste manual nem justificativa: é uma quitação, com data,
// quanto e por quê — e dá pra desfazer.
//
// O pagamento é POR MÊS, porque é assim que a conta fecha: pagar o extra de
// julho não pode encostar em agosto. O mês vem selecionado (o que está na tela)
// e os outros meses com extra em aberto aparecem do lado — a folha é sempre "as
// horas do mês tal".
//
// A régua existe porque "quanto pagar" é uma decisão contínua, não uma
// digitação: o valor gruda no dedo, o extrato embaixo mostra AO VIVO quais
// créditos aquele valor consome (os mais antigos primeiro, que são os que
// vencem antes). Quem prefere o número exato digita — os dois caminhos mexem
// no mesmo estado.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BancoResumo, AbertoItem } from "@/lib/banco-horas";
import { Icon } from "../Icon";
import { toast, confirmar } from "../Toast";
import { Acoes, Botao, Campo, Campos, Esp, PainelLateral } from "../ui/controles";
import { Alerta } from "../ui/Alerta";

const PASSO = 15;   // minutos por degrau da régua (e das setas do teclado)

const fmtHoras = (min: number) => { const a = Math.max(0, Math.round(min)); return `${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`; };
const dataBR = (dia: string) => dia.split("-").reverse().join("/");
const hojeSp = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const mesLabel = (mes: string) => { const [y, m] = mes.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(/^\w/, (c) => c.toUpperCase()); };
// "jul/26". O `toLocaleDateString` com `month: "short"` devolve "jul. de 26" em
// pt-BR — três palavras num chip que precisa caber ao lado de outros cinco.
const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (mes: string) => { const [y, m] = mes.split("-").map(Number); return `${MES_CURTO[m - 1]}/${String(y).slice(2)}`; };
/** Janela ISO do mês "YYYY-MM" — é o que o servidor usa pra achar o crédito. */
const janelaDoMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return { de: `${mes}-01`, ate: `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` };
};
/** Mês inteiro vira o nome do mês; intervalo antigo (de antes da conta mensal)
 *  continua aparecendo como as duas datas. */
const rotuloJanela = (de: string, ate: string): string => {
  const mes = de.slice(0, 7);
  const j = janelaDoMes(mes);
  return de === j.de && ate === j.ate ? mesLabel(mes) : `${dataBR(de)}–${dataBR(ate)}`;
};
const parseHHMM = (s: string): number | null => { const m = s.trim().match(/^(\d{1,3})(?::(\d{1,2}))?$/); if (!m) return null; return (parseInt(m[1]) || 0) * 60 + (parseInt(m[2] || "0") || 0); };

/** Encaixa no degrau de 15 min, mas as PONTAS são exatas: o crédito de 12h37
 *  precisa poder ser pago inteiro, senão sobram 7 minutos que ninguém entende. */
function encaixar(v: number, max: number): number {
  if (v >= max - PASSO / 2) return max;
  if (v <= PASSO / 2) return 0;
  return Math.min(max, Math.max(0, Math.round(v / PASSO) * PASSO));
}

/** Quais créditos esse valor consome — na MESMA ordem do servidor: primeiro as
 *  horas ESPECIAIS (domingo/feriado pago, as que têm adicional e por isso
 *  precisam virar dinheiro), depois as comuns, sempre da mais antiga pra mais
 *  nova. Se este extrato divergir do ledger, ele vira mentira. */
function consumo(creditos: AbertoItem[], min: number): (AbertoItem & { usa: number })[] {
  const out: (AbertoItem & { usa: number })[] = [];
  let falta = min;
  for (const so of [true, false]) {
    for (const c of creditos) {
      if (falta <= 0) break;
      if (!!c.especial !== so) continue;
      const usa = Math.min(falta, c.min);
      out.push({ ...c, usa });
      falta -= usa;
    }
  }
  return out;
}
/** Quanto do que está sendo pago é hora especial. */
const somaEspecial = (fila: (AbertoItem & { usa: number })[]) => fila.filter((c) => c.especial).reduce((s, c) => s + c.usa, 0);

// ── Botão + painel ───────────────────────────────────────────────────────────
export function PagarHorasAcao({ banco, mes, onFeito }: { banco: BancoResumo; mes?: string; onFeito: () => void }) {
  const [aberto, setAberto] = useState(false);
  const credito = banco.ledger?.creditoMin ?? 0;
  if (credito <= 0) return null;
  return (
    <>
      <Botao icone="cash" onClick={() => setAberto(true)}>Pagar horas</Botao>
      {aberto && <PainelPagar banco={banco} mes={mes ?? banco.de.slice(0, 7)} onFechar={() => setAberto(false)} onFeito={onFeito} />}
    </>
  );
}

function PainelPagar({ banco, mes, onFechar, onFeito }: { banco: BancoResumo; mes: string; onFechar: () => void; onFeito: () => void }) {
  const L = banco.ledger;
  // ── Qual MÊS esse pagamento quita ──
  // O mês da tela vem selecionado. "Banco inteiro" continua existindo pro caso
  // de quitar tudo de uma vez, mas não é mais o padrão: pagar "tudo" quando a
  // conversa era sobre julho quitava agosto sem ninguém pedir.
  const [alvo, setAlvo] = useState<string>(mes);   // "YYYY-MM" ou "tudo"
  const porMes = alvo !== "tudo";
  const janela = useMemo(() => (porMes ? janelaDoMes(alvo) : null), [porMes, alvo]);
  const creditos = useMemo(
    () => (janela ? (L.creditos ?? []).filter((c) => c.dia >= janela.de && c.dia <= janela.ate) : (L.creditos ?? [])),
    [L.creditos, janela],
  );
  const max = useMemo(() => creditos.reduce((s, c) => s + c.min, 0), [creditos]);

  // Meses que ainda têm extra em aberto — as folhas que dá pra pagar. O mês da
  // tela entra sempre, mesmo zerado: é o assunto de quem abriu o painel.
  const opcoes = useMemo(() => {
    const comCredito = (L.meses ?? []).filter((m) => m.creditoMin > 0).map((m) => m.mes);
    const todos = comCredito.includes(mes) ? comCredito : [mes, ...comCredito];
    return [...todos].sort().reverse();
  }, [L.meses, mes]);

  const [min, setMin] = useState(0);             // definido pelo efeito abaixo (pagar o mês inteiro)
  const [digitado, setDigitado] = useState("");  // "" = o número vem da régua
  const [dia, setDia] = useState(hojeSp());
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const definir = useCallback((v: number) => { setMin(encaixar(v, max)); setDigitado(""); }, [max]);
  // Trocar o mês troca o teto — e o caso comum é pagar o mês inteiro, então o
  // valor acompanha. Antes o número antigo ficava e o botão prometia "Pagar 12h"
  // com 3h disponíveis, que o servidor recusava.
  useEffect(() => { setMin(max); setDigitado(""); }, [max]);
  const fila = useMemo(() => consumo(creditos, min), [creditos, min]);
  const especialPago = useMemo(() => somaEspecial(fila), [fila]);
  const especialDisponivel = useMemo(() => creditos.filter((c) => c.especial).reduce((s, c) => s + c.min, 0), [creditos]);
  const restante = max - min;
  const atalhos = useMemo(() => [60, 240, 480].filter((v) => v < max), [max]);
  // Crédito de OUTROS meses: a pessoa precisa saber que ele NÃO vai ser pago
  // aqui — senão "paguei tudo" e o saldo continua de pé vira surpresa.
  const foraDaJanela = porMes ? L.creditoMin - max : 0;

  async function pagar() {
    if (min <= 0 || salvando) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/ponto/pagamentos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pessoaId: banco.pessoaId, minutos: min, dia, observacao: obs, ...(janela ? { de: janela.de, ate: janela.ate } : {}) }),
      });
      const j = await r.json();
      if (j.ok) { toast.ok(`${fmtHoras(min)} marcadas como pagas.`); onFechar(); onFeito(); return; }
      if (j.error === "tabela_ausente") toast.erro("Rode o supabase/ponto_pagamentos.sql primeiro.");
      else if (j.error === "sem_credito") { toast.erro(`Só há ${fmtHoras(j.disponivel ?? 0)} a favor agora.`); onFeito(); }
      else toast.erro(j.error || "Falha ao registrar o pagamento.");
    } catch { toast.erro("Falha ao registrar o pagamento."); }
    finally { setSalvando(false); }
  }

  return (
    <PainelLateral
      titulo="Pagar horas a favor"
      subtitulo={`${banco.nome} · ${porMes ? `${fmtHoras(max)} a favor em ${mesLabel(alvo)}` : `${fmtHoras(L.creditoMin)} a favor no banco`}`}
      onFechar={onFechar}
      largura={480}
      rodape={
        <Acoes>
          <Botao variante="sutil" onClick={onFechar}>Cancelar</Botao>
          <Esp />
          <Botao variante="primario" icone="cash" onClick={pagar} disabled={min <= 0} carregando={salvando}>
            {min > 0 ? `Pagar ${fmtHoras(min)}` : "Escolha quanto pagar"}
          </Botao>
        </Acoes>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* O QUE está sendo pago vem antes de QUANTO: trocar o mês muda o teto
            da régua, então perguntar o valor primeiro seria pedir duas vezes a
            mesma coisa. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>Qual mês está sendo pago</div>
          <div className="tab-strip" style={{ gap: 7 }}>
            {opcoes.map((m) => (
              <button key={m} type="button" className="hr-chip hr-chip--ok" aria-pressed={alvo === m} onClick={() => setAlvo(m)}>
                {mesCurto(m)}
              </button>
            ))}
            <button type="button" className="hr-chip" aria-pressed={alvo === "tudo"} onClick={() => setAlvo("tudo")}>Banco inteiro</button>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
            {porMes
              ? <>Quita só o extra de <strong style={{ color: "var(--text)" }}>{mesLabel(alvo)}</strong> — os outros meses ficam onde estão.</>
              : <>Consome o crédito <strong style={{ color: "var(--text)" }}>mais antigo primeiro</strong> (o que vence antes), de qualquer mês.</>}
          </p>
        </div>

        {/* Quanto está sendo pago — e o que sobra. O número é o assunto da tela. */}
        <div>
          <div className="stat" style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.05, color: min > 0 ? "var(--ok)" : "var(--text-dim)", letterSpacing: "-0.02em" }}>
            {fmtHoras(min)}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 4 }}>
            {max === 0
              ? <>nenhuma hora a favor {porMes ? `em ${mesLabel(alvo)}` : "no banco"}</>
              : restante > 0
                ? <>sobram <strong style={{ color: "var(--text)" }}>{fmtHoras(restante)}</strong> a favor {porMes ? `em ${mesLabel(alvo)}` : "no banco"}</>
                : porMes ? `${mesLabel(alvo)} fica quitado` : "o banco fica zerado — nada a compensar nem a receber"}
          </div>
          {/* Quanto do valor é hora com ADICIONAL. É a informação que muda o
              cheque: 4h de domingo não custam o mesmo que 4h de terça. */}
          {especialPago > 0 && (
            <div style={{ fontSize: 12, color: "var(--text)", marginTop: 6, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "var(--indigo)", background: "color-mix(in srgb,var(--indigo) 16%,transparent)", borderRadius: "var(--r-xs)", padding: "1px 6px" }}>especial</span>
              <span><strong className="stat">{fmtHoras(especialPago)}</strong> de domingo/feriado pago{min - especialPago > 0 ? <> · <strong className="stat">{fmtHoras(min - especialPago)}</strong> comuns</> : null}</span>
            </div>
          )}
          {especialDisponivel > 0 && (
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 4 }}>
              {porMes ? mesLabel(alvo) : "O banco"} tem <strong style={{ color: "var(--text)" }}>{fmtHoras(especialDisponivel)}</strong> de hora especial no total.
            </div>
          )}
          {foraDaJanela > 0 && (
            <Alerta tom="atencao" style={{ marginTop: 10 }}>
              Existem <strong>{fmtHoras(foraDaJanela)}</strong> a favor <strong>fora</strong> desse mês. Elas continuam no banco (e continuam correndo pro vencimento).
            </Alerta>
          )}
        </div>

        <Regua valor={min} max={max} onValor={definir} />

        {/* Atalhos: o caso comum (tudo) primeiro. */}
        <div className="tab-strip" style={{ gap: 7 }}>
          <button type="button" className="hr-chip hr-chip--ok" aria-pressed={min === max} onClick={() => definir(max)} disabled={max <= 0}>Tudo · {fmtHoras(max)}</button>
          {atalhos.map((v) => (
            <button key={v} type="button" className="hr-chip hr-chip--ok" aria-pressed={min === v} onClick={() => definir(v)}>{fmtHoras(v)}</button>
          ))}
          <button type="button" className="hr-chip hr-chip--ok" aria-pressed={min === 0} onClick={() => definir(0)}>Zerar</button>
        </div>

        {/* Extrato: exatamente quais horas somem do banco. */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <Icon name="receipt" size={15} color="var(--text-dim)" />
            <strong style={{ fontSize: 12.5, color: "var(--text)" }}>Sai do banco</strong>
            <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>· as especiais primeiro, depois as mais antigas</span>
          </div>
          {fila.length === 0
            ? <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>Nada ainda — escolha quanto pagar acima.</p>
            : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {fila.slice(0, 6).map((c) => (
                  <div key={c.dia} className="hr-fifo">
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", flex: "none" }}>{dataBR(c.dia)}</span>
                    {c.especial && (
                      <span title="Domingo ou feriado pago — hora com adicional na folha"
                        style={{ fontSize: 10, fontWeight: 800, color: "var(--indigo)", background: "color-mix(in srgb,var(--indigo) 16%,transparent)", borderRadius: "var(--r-xs)", padding: "1px 6px", flex: "none" }}>
                        especial
                      </span>
                    )}
                    <span style={{ fontSize: 11.5, color: c.vencido ? "var(--atencao)" : "var(--text-dim)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.vencido ? "já expirou (passou de 3 meses)" : `expirava em ${dataBR(c.venceEm)}`}
                    </span>
                    <span className="stat" style={{ fontSize: 12.5, fontWeight: 800, color: "var(--ok)", flex: "none" }}>{fmtHoras(c.usa)}</span>
                  </div>
                ))}
                {fila.length > 6 && (
                  <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>e mais {fila.length - 6} dia(s) · {fmtHoras(fila.slice(6).reduce((s, c) => s + c.usa, 0))}</span>
                )}
              </div>}
        </div>

        <Campos min={170}>
          <Campo label="Quanto (h:mm)" dica="Se preferir digitar o valor exato.">
            {(id) => (
              <input id={id} inputMode="numeric" placeholder={fmtHoras(min).replace("h", ":")} value={digitado}
                onChange={(e) => {
                  setDigitado(e.target.value);
                  const v = parseHHMM(e.target.value);
                  if (v !== null) setMin(Math.min(max, Math.max(0, v)));
                }} />
            )}
          </Campo>
          <Campo label="Dia do pagamento" dica="Quando a empresa pagou.">
            {(id) => <input id={id} type="date" max={hojeSp()} value={dia} onChange={(e) => setDia(e.target.value)} />}
          </Campo>
          <Campo label="Observação" largo dica="Aparece no histórico. Ex.: pago na folha do mês seguinte.">
            {(id) => <input id={id} value={obs} onChange={(e) => setObs(e.target.value)} placeholder={porMes ? `horas de ${mesLabel(alvo).toLowerCase()}` : "folha do mês"} maxLength={120} />}
          </Campo>
        </Campos>

        <p style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
          As horas pagas <strong>saem do banco</strong>: deixam de contar como crédito a compensar e não expiram mais.
          Isso não apaga batida nenhuma — o histórico do ponto continua igual, e o pagamento pode ser desfeito.
        </p>
      </div>
    </PainelLateral>
  );
}

// ── Régua ────────────────────────────────────────────────────────────────────
// O valor segue o dedo 1:1. Pegar NO BOTÃO respeita onde a pessoa pegou (não
// salta); tocar no trilho leva o botão até ali — é o gesto que a pessoa espera
// de cada um dos dois alvos.
function Regua({ valor, max, onValor }: { valor: number; max: number; onValor: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const desloc = useRef(0);          // distância entre o dedo e o centro do botão
  const ultimo = useRef(valor);      // último degrau anunciado (evita repetir o toque)
  const [arrastando, setArrastando] = useState(false);
  const pct = max > 0 ? (valor / max) * 100 : 0;

  const valorEm = (clientX: number): number => {
    const el = ref.current;
    if (!el || max <= 0) return 0;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return ((clientX - desloc.current - r.left) / r.width) * max;
  };

  function aoPegar(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || max <= 0) return;
    const r = el.getBoundingClientRect();
    const xBotao = r.left + (valor / max) * r.width;
    // Pegou em cima do botão (±18px)? Mantém o deslocamento: o botão não pula
    // pro dedo, ele continua exatamente onde estava e passa a segui-lo.
    desloc.current = Math.abs(e.clientX - xBotao) <= 18 ? e.clientX - xBotao : 0;
    el.setPointerCapture(e.pointerId);
    setArrastando(true);
    onValor(valorEm(e.clientX));
    el.focus();
  }
  function aoMover(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastando) return;
    const v = encaixar(valorEm(e.clientX), max);
    if (v !== ultimo.current) {
      ultimo.current = v;
      // Um toque curtinho a cada degrau: o dedo sente o encaixe que o olho vê.
      try { navigator.vibrate?.(3); } catch { /* sem vibração, sem problema */ }
    }
    onValor(valorEm(e.clientX));
  }
  function aoSoltar() { setArrastando(false); desloc.current = 0; }

  function aoTeclar(e: React.KeyboardEvent) {
    const passo = e.shiftKey ? 60 : PASSO;
    const mapa: Record<string, number> = { ArrowLeft: -passo, ArrowDown: -passo, ArrowRight: passo, ArrowUp: passo, PageUp: 60, PageDown: -60 };
    if (e.key in mapa) { e.preventDefault(); onValor(valor + mapa[e.key]); return; }
    if (e.key === "Home") { e.preventDefault(); onValor(0); }
    if (e.key === "End") { e.preventDefault(); onValor(max); }
  }

  return (
    <div
      ref={ref}
      className="hr-regua"
      data-arrastando={arrastando ? "1" : undefined}
      role="slider"
      tabIndex={0}
      aria-label="Quantas horas pagar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={valor}
      aria-valuetext={fmtHoras(valor)}
      onPointerDown={aoPegar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      onKeyDown={aoTeclar}
    >
      <div className="hr-regua-trilho">
        <div className="hr-regua-cheio" style={{ width: `${pct}%` }} />
      </div>
      <div className="hr-regua-botao" style={{ left: `${pct}%` }} />
    </div>
  );
}

// ── Histórico: o que já foi pago ─────────────────────────────────────────────
export function HistoricoPagamentos({ banco, podeDesfazer, onFeito }: { banco: BancoResumo; podeDesfazer: boolean; onFeito: () => void }) {
  const pagos = banco.ledger?.pagamentos ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  if (pagos.length === 0) return null;

  async function desfazer(id: string, min: number) {
    const ok = await confirmar(`Desfazer o pagamento de ${fmtHoras(min)}?`, { detalhe: "As horas voltam pro banco como crédito, com o prazo original de 3 meses.", perigo: true });
    if (!ok) return;
    setBusy(id);
    try {
      const r = await fetch(`/api/ponto/pagamentos?id=${id}`, { method: "DELETE" });
      if (!r.ok) { toast.erro("Falha ao desfazer."); return; }
      toast.ok("Pagamento desfeito."); onFeito();
    } finally { setBusy(null); }
  }

  return (
    <div className="glass" style={{ borderRadius: "var(--r-md)", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <Icon name="cash" size={16} color="var(--ok)" />
        <strong style={{ fontSize: 13.5, color: "var(--text)" }}>Horas pagas</strong>
        <span className="stat" style={{ fontSize: 13, fontWeight: 800, color: "var(--ok)" }}>{fmtHoras(banco.ledger.pagoMin)}</span>
        <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>· já saíram do banco</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pagos.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", flex: "none" }}>{dataBR(p.dia)}</span>
            <span className="stat" style={{ fontSize: 12.5, fontWeight: 800, color: "var(--ok)", flex: "none" }}>{fmtHoras(p.min)}</span>
            {/* A janela é a diferença entre "pagamos 8h" e "pagamos as 8h de
                julho". Sem ela no histórico, dois pagamentos iguais ficam
                indistinguíveis na hora de conferir a folha. */}
            {p.de && p.ate && (
              <span title={`Quitou o crédito gerado de ${dataBR(p.de)} a ${dataBR(p.ate)}`}
                style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-dim)", background: "var(--surface-2)", borderRadius: "var(--r-xs)", padding: "2px 7px", flex: "none", whiteSpace: "nowrap" }}>
                {rotuloJanela(p.de, p.ate)}
              </span>
            )}
            <span style={{ fontSize: 11.5, color: "var(--text-dim)", flex: "1 1 120px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.observacao || "sem observação"}{p.autorNome ? ` · ${p.autorNome}` : ""}
            </span>
            {p.aplicadoMin < p.min && (
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--atencao)", background: "color-mix(in srgb,var(--atencao) 16%,transparent)", borderRadius: "var(--r-xs)", padding: "1px 7px" }}>
                só {fmtHoras(p.aplicadoMin)} tinham saldo
              </span>
            )}
            {podeDesfazer && (
              <Botao variante="sutil" tamanho="sm" icone="arrow-back-up" onClick={() => desfazer(p.id, p.min)} carregando={busy === p.id}>Desfazer</Botao>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
