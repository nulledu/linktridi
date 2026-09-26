"use client";

// ── Bater ponto por alguém: escolher o instante, e VER o dia que sai disso ────
// Antes era um `confirmar()`: "Registrar a saída da Bia agora?" — sim ou não.
// Mas quem bate ponto pela outra pessoa quase nunca está no instante certo: a
// Bia saiu 17:05 e avisou 17:40, o esquecimento de ontem só aparece hoje de
// manhã. O botão só sabia carimbar AGORA, então a correção virava outro
// caminho (Registros › lançar manual), com a pessoa e o dia escolhidos de novo.
//
// Aqui a batida tem data e hora, e o painel mostra o dia RESULTANTE antes de
// gravar: a linha do tempo com a batida nova no lugar dela, o total trabalhado
// e o saldo contra a meta. É a diferença entre "confia e clica" e "olha o que
// vai acontecer" — e é o que pega o 07:05 digitado no lugar de 17:05.
//
// A prévia é PRÉVIA: quem classifica de verdade é o `reclassificarDia` do
// servidor, que reordena o dia inteiro depois do insert. As duas usam a mesma
// regra (1ª = entrada, última = saída, miolo em pares), mas se um dia
// divergirem, a verdade é a do banco.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { toast } from "../../Toast";
import { Avatar } from "../../ui/Avatar";
import { Acoes, Botao, Campo, Campos, Esp, PainelLateral } from "../../ui/controles";
import { GlassDate, GlassTime } from "../../GlassPicker";
import type { BancoResumo, DiaBanco } from "@/lib/banco-horas";
import type { StatusPessoa, TipoBatida } from "@/lib/ponto";

const hojeSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const agoraSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(11, 16);
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const fmtHoras = (min: number) => { const a = Math.max(0, Math.round(min)); return `${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`; };
const fmtSaldo = (min: number) => { const s = min < 0 ? "−" : "+"; const a = Math.abs(Math.round(min)); return `${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`; };
const minDoRelogio = (v: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
/** Dia da semana sem `new Date(iso)` — que em UTC devolve o dia anterior no Brasil. */
const dowDe = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const ROTULO: Record<TipoBatida, string> = {
  entrada: "Entrada", almoco: "Saída p/ almoço", retorno: "Retorno do almoço",
  intervalo_inicio: "Início de intervalo", intervalo_fim: "Fim de intervalo", saida: "Saída",
};
const ICONE: Record<TipoBatida, string> = {
  entrada: "arrow-forward-up", almoco: "clock-hour-4", retorno: "arrow-back-up",
  intervalo_inicio: "player-pause", intervalo_fim: "player-play", saida: "door-exit",
};

/**
 * A mesma regra do servidor, em cima de horários já ORDENADOS: a primeira é
 * entrada, a última é saída, e o miolo anda em pares (o primeiro par é o
 * almoço, os demais são intervalos). Existe aqui só pra prévia dizer a mesma
 * coisa que o dia vai dizer depois de gravado.
 */
function classificar(qtd: number): TipoBatida[] {
  if (qtd <= 0) return [];
  if (qtd === 1) return ["entrada"];
  const tipos: TipoBatida[] = ["entrada"];
  for (let i = 1; i < qtd - 1; i++) {
    const meio = i - 1;                                    // 0,1 = almoço/retorno; depois, intervalos
    tipos.push(meio === 0 ? "almoco" : meio === 1 ? "retorno" : meio % 2 === 0 ? "intervalo_inicio" : "intervalo_fim");
  }
  tipos.push("saida");
  return tipos;
}

/** Minutos trabalhados = soma dos pares (1ª–2ª, 3ª–4ª…). Ímpar = jornada aberta. */
function trabalhado(minutos: number[]): number {
  let total = 0;
  for (let i = 0; i + 1 < minutos.length; i += 2) total += minutos[i + 1] - minutos[i];
  return total;
}

export function BaterModal({ pessoa, onFechar, onGravado }: {
  pessoa: StatusPessoa;
  onFechar: () => void;
  /** Gravou — quem abriu recarrega lista, banco e o painel da direita. */
  onGravado: () => void;
}) {
  const [dia, setDia] = useState(hojeSP);
  const [hora, setHora] = useState(agoraSP);
  const [salvando, setSalvando] = useState(false);
  const [banco, setBanco] = useState<BancoResumo | null>(null);
  const [erro, setErro] = useState(false);

  // Uma leitura por MÊS escolhido (o padrão é o de hoje, então quase sempre uma
  // só). Mudar a hora não relê nada: a prévia é conta em cima do que já veio.
  const mes = dia.slice(0, 7);
  useEffect(() => {
    let vivo = true;
    setBanco(null); setErro(false);
    fetch(`/api/ponto/banco-horas?pessoaId=${encodeURIComponent(pessoa.id)}&mes=${mes}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!vivo) return; if (j?.banco) setBanco(j.banco as BancoResumo); else setErro(true); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [pessoa.id, mes]);

  const diaAtual: DiaBanco | null = useMemo(
    () => (banco?.dias ?? []).find((d) => d.dia === dia) ?? null,
    [banco, dia],
  );

  const minNova = minDoRelogio(hora);
  const previa = useMemo(() => {
    if (minNova == null) return null;
    const existentes = (diaAtual?.batidas ?? [])
      .map((b) => ({ min: minDoRelogio(b.hora) ?? 0, nova: false }));
    const antes = trabalhado(existentes.map((b) => b.min).sort((a, b) => a - b));
    const todas = [...existentes, { min: minNova, nova: true }].sort((a, b) => a.min - b.min);
    const tipos = classificar(todas.length);
    const depois = trabalhado(todas.map((b) => b.min));
    const meta = diaAtual?.metaMin ?? 0;
    const iNova = todas.findIndex((b) => b.nova);
    return {
      linhas: todas.map((b, i) => ({ ...b, tipo: tipos[i] })),
      antes, depois, meta,
      saldo: depois - meta,
      tipoNova: tipos[iNova],
      // A batida nova mudou o TIPO de alguma que já existia? É o caso que
      // assusta se não for dito: lançar 12:00 no meio do dia faz a antiga
      // "saída" das 12:05 virar "retorno".
      reclassifica: existentes.length > 0 && iNova < todas.length - 1,
    };
  }, [diaAtual, minNova]);

  // Os avisos que valem a pena — cada um é um erro que já aconteceu de verdade.
  const avisos: { icone: string; cor: string; texto: string }[] = [];
  if (minNova == null) avisos.push({ icone: "alert-triangle", cor: "var(--perigo)", texto: "Hora inválida." });
  if (dia > hojeSP()) avisos.push({ icone: "calendar-event", cor: "var(--perigo)", texto: "Essa data ainda não aconteceu." });
  if (dia === hojeSP() && minNova != null && minNova > (minDoRelogio(agoraSP()) ?? 0) + 1)
    avisos.push({ icone: "clock", cor: "var(--atencao)", texto: "Hora no futuro — a batida vai nascer adiantada." });
  if (previa && previa.linhas.some((b) => !b.nova && Math.abs(b.min - (minNova ?? 0)) < 2))
    avisos.push({ icone: "copy", cor: "var(--atencao)", texto: "Já existe uma batida nesse mesmo minuto." });
  if (previa?.reclassifica)
    avisos.push({ icone: "arrows-sort", cor: "var(--info)", texto: "A batida entra no meio do dia e as seguintes são reclassificadas." });
  if (diaAtual && (diaAtual.classe === "folga" || diaAtual.classe === "feriado" || diaAtual.classe === "ferias"))
    avisos.push({ icone: "calendar-off", cor: "var(--info)", texto: `${dataBR(dia)} não é dia de trabalho${diaAtual.motivo ? ` (${diaAtual.motivo})` : ""} — a hora vira extra.` });

  const agora = dia === hojeSP() && hora === agoraSP();
  const podeGravar = minNova != null && dia <= hojeSP() && !salvando;

  async function gravar() {
    if (!podeGravar) return;
    setSalvando(true);
    try {
      const corpo = agora
        ? { pessoaId: pessoa.id }                                    // caminho antigo: o servidor carimba o instante
        : { pessoaId: pessoa.id, dia, hora, tipo: previa?.tipoNova ?? "entrada" };
      const r = await fetch("/api/ponto/registros", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      });
      const j = await r.json();
      if (j?.error) { toast.erro(j.error === "tabela_ausente" ? "Rode o supabase/ponto.sql primeiro." : j.error); return; }
      toast.ok(`${ROTULO[previa?.tipoNova ?? "entrada"]} de ${pessoa.nome.split(" ")[0]} às ${hora}${dia === hojeSP() ? "" : ` de ${dataBR(dia)}`}.`);
      onGravado();
      onFechar();
    } catch { toast.erro("Falha ao registrar."); }
    finally { setSalvando(false); }
  }

  return (
    <PainelLateral
      titulo={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Avatar url={pessoa.fotoUrl} nome={pessoa.nome} size={28} formato="redondo" />
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Bater ponto · {pessoa.nome}</span>
        </span>
      }
      subtitulo="Escolha o momento da batida e confira o dia que sai disso."
      onFechar={onFechar}
      centrado
      largura={560}
      rodape={
        <Acoes>
          <Esp />
          <Botao variante="sutil" onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" icone="clock" carregando={salvando} disabled={!podeGravar} onClick={gravar}>
            {previa ? `Registrar ${ROTULO[previa.tipoNova].toLowerCase()}` : "Registrar"}
          </Botao>
        </Acoes>
      }
    >
      <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
        <Campos min={200}>
          <Campo label="Data">{(id) => <GlassDate id={id} value={dia} onChange={(v) => setDia(v || hojeSP())} clearable={false} max={hojeSP()} placeholder="Escolher data" />}</Campo>
          <Campo label="Hora" dica={dia === hojeSP() ? "O padrão é este minuto." : `${DIAS[dowDe(dia)]}, ${dataBR(dia)}`}>
            {(id) => <GlassTime id={id} value={hora} onChange={(v) => setHora(v || agoraSP())} clearable={false} passo={1} />}
          </Campo>
        </Campos>

        {/* Os atalhos que cobrem o caso real: "agora", "arredonda", e o horário
            que o turno dela previa — que é o que a pessoa quase sempre quer
            quando está corrigindo um esquecimento. */}
        <div className="tab-strip" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Atalho texto="Agora" ativo={agora} onClick={() => { setDia(hojeSP()); setHora(agoraSP()); }} />
          <Atalho texto="Ontem" ativo={dia === ontem()} onClick={() => setDia(ontem())} />
          {minNova != null && <Atalho texto="−15 min" onClick={() => setHora(hhmm(Math.max(0, minNova - 15)))} />}
          {minNova != null && <Atalho texto="Arredondar" onClick={() => setHora(hhmm(Math.min(23 * 60 + 59, Math.round(minNova / 5) * 5)))} />}
          {pessoa.entradaPrevista && <Atalho texto={`Entrada ${pessoa.entradaPrevista}`} onClick={() => setHora(pessoa.entradaPrevista!)} />}
          {pessoa.saidaPrevista && <Atalho texto={`Saída ${pessoa.saidaPrevista}`} onClick={() => setHora(pessoa.saidaPrevista!)} />}
        </div>

        {/* ── A prévia ──────────────────────────────────────────────────────── */}
        <section style={{ display: "grid", gap: 10, border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: 14, background: "var(--surface)", minWidth: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: ".02em", textTransform: "uppercase", color: "var(--text-dim)" }}>
            <Icon name="eye" size={14} color="var(--text-dim)" /> Como o dia {dataBR(dia)} fica
          </span>

          {banco === null && !erro && <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>Lendo o mês…</p>}
          {erro && <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>Não consegui ler o mês desta pessoa — a batida ainda pode ser gravada.</p>}

          {previa && banco !== null && (
            <>
              <div style={{ display: "grid", gap: 2 }}>
                {previa.linhas.map((b, i) => (
                  <div key={`${b.min}-${i}`} style={{
                    display: "flex", alignItems: "center", gap: 9, minWidth: 0,
                    padding: "7px 9px", borderRadius: "var(--r-sm)", minHeight: 36,
                    background: b.nova ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
                    border: b.nova ? "1px solid color-mix(in srgb, var(--primary) 38%, transparent)" : "1px solid transparent",
                  }}>
                    <Icon name={ICONE[b.tipo]} size={15} color={b.nova ? "var(--primary)" : "var(--text-dim)"} />
                    <span className="stat" style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", flex: "none" }}>{hhmm(b.min)}</span>
                    <span style={{ fontSize: 12, color: "var(--text-dim)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ROTULO[b.tipo]}</span>
                    {b.nova && <span style={{ flex: "none", fontSize: 10.5, fontWeight: 800, color: "var(--primary)" }}>NOVA</span>}
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))", gap: 8, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
                <Numero rotulo="Trabalhado" valor={fmtHoras(previa.depois)} sub={previa.antes !== previa.depois ? `era ${fmtHoras(previa.antes)}` : "sem mudança"} />
                <Numero rotulo="Meta do dia" valor={previa.meta ? fmtHoras(previa.meta) : "—"} sub={previa.meta ? "pela jornada dela" : "dia sem meta"} />
                <Numero
                  rotulo="Saldo do dia" valor={previa.meta ? fmtSaldo(previa.saldo) : "—"}
                  sub={previa.linhas.length % 2 === 1 ? "jornada em aberto" : "jornada fechada"}
                  cor={previa.meta ? (previa.saldo < 0 ? "var(--perigo)" : "var(--ok)") : undefined}
                />
              </div>
            </>
          )}

          {avisos.map((a, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: a.cor, minWidth: 0 }}>
              <Icon name={a.icone} size={14} color={a.cor} />
              <span style={{ minWidth: 0 }}>{a.texto}</span>
            </span>
          ))}
        </section>

        <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0 }}>
          A batida fica marcada como <strong>manual</strong>, e o dia inteiro é reclassificado depois de gravada.
        </p>
      </div>
    </PainelLateral>
  );
}

const ontem = () => new Date(Date.now() - 3 * 3600e3 - 86400e3).toISOString().slice(0, 10);

function Atalho({ texto, ativo, onClick }: { texto: string; ativo?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ui-toque" style={{
      flex: "none", minHeight: 32, padding: "0 11px", borderRadius: 999, cursor: "pointer",
      fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
      border: `1px solid ${ativo ? "color-mix(in srgb, var(--primary) 50%, transparent)" : "var(--border)"}`,
      background: ativo ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
      color: ativo ? "var(--primary)" : "var(--text-dim)",
    }}>{texto}</button>
  );
}

function Numero({ rotulo, valor, sub, cor }: { rotulo: string; valor: string; sub: string; cor?: string }) {
  return (
    <div style={{ display: "grid", gap: 1, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, color: "var(--text-dim)", fontWeight: 600 }}>{rotulo}</span>
      <span className="stat" style={{ fontSize: 15, fontWeight: 800, color: cor ?? "var(--text)", letterSpacing: "-0.01em" }}>{valor}</span>
      <span style={{ fontSize: 10.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>
    </div>
  );
}
