"use client";

// ── Compensação: o par dia trabalhado ↔ dia de folga ────────────────────────
// Duas peças, usadas nos DOIS lugares onde a pergunta aparece: a ficha do
// colaborador (RH) e a gaveta da pessoa no painel de Ponto. Uma implementação
// só, porque duas telas registrando a mesma coisa é como elas divergem — e
// aqui divergir significa perdoar uma jornada de um jeito num lugar e de outro
// no outro.

import { useCallback, useEffect, useMemo, useState } from "react";
import { GlassDate, GlassSelect } from "../GlassPicker";
import { Acoes, Botao, BotaoApagar, Campo, Campos, PainelLateral, useAcao } from "./controles";
import { Icon } from "../Icon";
import { toast } from "../Toast";
import { NotaRodape } from "../financeiro/ui";
import {
  ROTULO_COMPENSACAO, SELO_COMPENSACAO, TIPOS_COMPENSACAO,
  type Compensacao, type TipoCompensacao,
} from "@/lib/jornada/tipos";

interface Conflito { dia: string; tipo: string; detalhe: string; bloqueia: boolean }
interface Conferencia { conflitos: Conflito[]; minutosSugeridos: number; ok: boolean }

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const brCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** minutos → "8:00". */
export const hhmmDeMin = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
/** "8:00" / "8" / "8h30" → minutos. null quando não dá pra ler. */
export function minDeHhmm(v: string): number | null {
  const t = v.trim().replace(/h/i, ":").replace(/,/, ".");
  if (!t) return null;
  const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(t);
  if (m) {
    const min = Number(m[1]) * 60 + Number(m[2] ?? 0);
    return min > 0 && min <= 24 * 60 ? min : null;
  }
  return null;
}

// ── O formulário ─────────────────────────────────────────────────────────────

export function FormularioCompensacao({ employeeId, nome, diaOrigem: origemInicial, diaFolga: folgaInicial, onFechar, aoSalvar }: {
  /** `profiles.id` do colaborador — NÃO o id da pessoa do Ponto. */
  employeeId: string;
  nome: string;
  diaOrigem?: string;
  diaFolga?: string;
  onFechar: () => void;
  aoSalvar?: () => void;
}) {
  const hoje = useMemo(() => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), []);
  const [tipo, setTipo] = useState<TipoCompensacao>("feriado_trocado");
  const [diaOrigem, setDiaOrigem] = useState(origemInicial ?? hoje);
  const [diaFolga, setDiaFolga] = useState(folgaInicial ?? "");
  const [horas, setHoras] = useState("");
  const [observacao, setObservacao] = useState("");
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [erro, setErro] = useState("");

  // ── A conferência ao vivo ──────────────────────────────────────────────────
  // Avisa enquanto a pessoa escolhe ("esse dia já é feriado") em vez de aceitar
  // e explodir no salvar. Não é a trava: `criarCompensacao` confere de novo no
  // servidor — conferência de tela é conveniência.
  const conferir = useCallback(async (sinal: AbortSignal) => {
    if (!diaOrigem || !diaFolga || diaOrigem === diaFolga) { setConf(null); return; }
    setConferindo(true);
    try {
      const q = new URLSearchParams({ employee_id: employeeId, tipo, dia_origem: diaOrigem, dia_folga: diaFolga });
      const r = await fetch(`/api/rh/compensacoes/conferir?${q}`, { signal: sinal });
      const j = (await r.json().catch(() => null)) as Conferencia | null;
      if (!sinal.aborted) setConf(r.ok ? j : null);
    } catch { /* abortado ou rede: a tela segue sem o aviso */ }
    finally { if (!sinal.aborted) setConferindo(false); }
  }, [employeeId, tipo, diaOrigem, diaFolga]);

  useEffect(() => {
    const ctrl = new AbortController();
    // 350 ms: o calendário dispara uma mudança por clique, e conferir a cada
    // clique seria uma ida ao servidor por dia navegado.
    const t = setTimeout(() => void conferir(ctrl.signal), 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [conferir]);

  const bloqueios = conf?.conflitos.filter((c) => c.bloqueia) ?? [];
  const avisos = conf?.conflitos.filter((c) => !c.bloqueia) ?? [];
  const sugerido = conf?.minutosSugeridos ?? 0;
  const minutos = minDeHhmm(horas) ?? sugerido;

  const salvar = useAcao(async () => {
    setErro("");
    if (!diaFolga) { setErro("Escolha o dia de folga."); return false; }
    if (diaOrigem === diaFolga) { setErro("O dia trabalhado e o dia de folga precisam ser diferentes."); return false; }
    if (horas.trim() && minDeHhmm(horas) === null) { setErro("Escreva as horas como 8:00."); return false; }
    if (minutos <= 0) { setErro("Informe quantas horas o par vale."); return false; }
    const r = await fetch("/api/rh/compensacoes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: employeeId, tipo, dia_origem: diaOrigem, dia_folga: diaFolga, minutos, observacao: observacao.trim() || null }),
    });
    const j = (await r.json().catch(() => ({}))) as { erro?: string };
    if (!r.ok) { setErro(j.erro ?? "Não foi possível registrar."); return false; }
    toast(`${ROTULO_COMPENSACAO[tipo].label} registrada.`);
    aoSalvar?.();
    onFechar();
    return true;
  });

  return (
    <PainelLateral
      titulo="Registrar compensação"
      subtitulo={nome}
      onFechar={onFechar}
      largura={520}
      centrado
      soFechaNoX
      rodape={
        <Acoes>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" icone="check" estado={salvar.estado}
            disabled={bloqueios.length > 0 || conferindo}
            onClick={() => salvar.rodar()}>
            Registrar
          </Botao>
        </Acoes>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {erro && <p role="alert" style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--perigo)" }}>{erro}</p>}

        <Campo label="O que aconteceu" largo>
          {(id) => (
            <GlassSelect id={id} value={tipo} onChange={(v) => setTipo(v as TipoCompensacao)}
              options={TIPOS_COMPENSACAO.map((t) => ({ value: t, label: ROTULO_COMPENSACAO[t].label }))} />
          )}
        </Campo>
        <NotaRodape icone="info-circle">{ROTULO_COMPENSACAO[tipo].descricao}</NotaRodape>

        <Campos min={180}>
          <Campo label="Dia trabalhado" dica="O dia que empresta as horas.">
            {(id) => <GlassDate id={id} value={diaOrigem} onChange={setDiaOrigem} clearable={false} placeholder="Escolher data" />}
          </Campo>
          <Campo label="Dia de folga" dica="O dia que a pessoa não trabalha.">
            {(id) => <GlassDate id={id} value={diaFolga} onChange={setDiaFolga} clearable={false} placeholder="Escolher data" />}
          </Campo>
          <Campo label="Horas do par" dica={sugerido > 0 ? `Sugerido: ${hhmmDeMin(sugerido)} (a jornada do dia de folga).` : "Ex.: 8:00"}>
            {(id) => (
              <input id={id} value={horas} inputMode="numeric"
                placeholder={sugerido > 0 ? hhmmDeMin(sugerido) : "8:00"}
                onChange={(e) => setHoras(e.target.value)} />
            )}
          </Campo>
        </Campos>

        {/* ── O que o par vai fazer, em português ───────────────────────────
            Aprovar uma compensação perdoa uma jornada inteira e reserva hora
            que viraria dinheiro. Quem clica precisa ler a consequência antes. */}
        {diaFolga && diaOrigem !== diaFolga && bloqueios.length === 0 && minutos > 0 && (
          <NotaRodape icone="arrows-exchange">
            {tipo === "compensacao_jornada"
              ? `${br(diaFolga)} fica sem trabalho e a pessoa repõe ${hhmmDeMin(minutos)} em ${br(diaOrigem)}. Até repor, o dia conta como hora devida — mas não como falta.`
              : `${hhmmDeMin(minutos)} de ${br(diaOrigem)} ficam reservadas e quitam ${br(diaFolga)}. Essas horas não viram hora extra nem entram na folha.`}
          </NotaRodape>
        )}

        {bloqueios.map((c, i) => (
          <p key={i} role="alert" style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, fontWeight: 600, color: "var(--perigo)" }}>
            <Icon name="alert-triangle" size={15} /> {c.detalhe}
          </p>
        ))}
        {avisos.map((c, i) => (
          <NotaRodape key={i} icone="info-circle" destaque>{c.detalhe}</NotaRodape>
        ))}

        <Campo label="Observação" largo>
          {(id) => <textarea id={id} rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional — o combinado, quem autorizou…" />}
        </Campo>
      </div>
    </PainelLateral>
  );
}

// ── A lista ──────────────────────────────────────────────────────────────────

export function ListaDeCompensacoes({ employeeId, podeEditar: podeForcado, recarregarEm, aoMudar, aoSaberPoder }: {
  employeeId: string;
  /** Deixe de fora pra usar o que a própria rota respondeu — é o caminho do
   *  painel de Ponto, que não conhece os poderes de RH de quem está olhando. */
  podeEditar?: boolean;
  /** Muda este número pra forçar uma releitura (depois de registrar). */
  recarregarEm?: number;
  aoMudar?: () => void;
  aoSaberPoder?: (pode: boolean) => void;
}) {
  const [lista, setLista] = useState<Compensacao[] | null>(null);
  const [pendenteSchema, setPendenteSchema] = useState(false);
  const [podeDaRota, setPodeDaRota] = useState(false);
  const podeEditar = podeForcado ?? podeDaRota;

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/rh/compensacoes?employee_id=${encodeURIComponent(employeeId)}`);
    const j = (await r.json().catch(() => null)) as { compensacoes?: Compensacao[]; pendenteSchema?: boolean; podeEditar?: boolean } | null;
    if (!r.ok || !j) { setLista([]); aoSaberPoder?.(false); return; }
    setLista(j.compensacoes ?? []);
    setPendenteSchema(!!j.pendenteSchema);
    setPodeDaRota(!!j.podeEditar);
    aoSaberPoder?.(!!j.podeEditar);
  }, [employeeId, aoSaberPoder]);

  useEffect(() => { void carregar(); }, [carregar, recarregarEm]);

  const mudar = async (c: Compensacao, status: Compensacao["status"]) => {
    const r = await fetch("/api/rh/compensacoes", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, status, employee_id: employeeId, detalhe: `${brCurto(c.diaOrigem)} → ${brCurto(c.diaFolga)}` }),
    });
    const j = (await r.json().catch(() => ({}))) as { erro?: string };
    if (!r.ok) { toast(j.erro ?? "Não foi possível mudar a situação.", "erro"); return; }
    toast(`Compensação ${SELO_COMPENSACAO[status].label.toLowerCase()}.`);
    void carregar();
    aoMudar?.();
  };

  const apagar = async (c: Compensacao) => {
    const r = await fetch(`/api/rh/compensacoes?id=${encodeURIComponent(c.id)}`, { method: "DELETE" });
    if (!r.ok) { toast("Não foi possível apagar.", "erro"); return; }
    toast("Compensação apagada.");
    void carregar();
    aoMudar?.();
  };

  if (lista === null) return <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)" }}>Carregando…</p>;
  if (pendenteSchema) return <NotaRodape icone="info-circle" destaque>Rode <code>supabase/rh_jornada.sql</code> para registrar compensações.</NotaRodape>;
  if (!lista.length) return <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)" }}>Nenhuma compensação registrada.</p>;

  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 2 }}>
      {lista.map((c) => {
        const selo = SELO_COMPENSACAO[c.status];
        return (
          <li key={c.id} style={{ display: "grid", gap: 6, padding: "8px 2px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minHeight: "var(--tap)" }}>
              <Icon name="arrows-exchange" size={15} color="var(--roxo)" />
              <strong style={{ fontSize: 13 }}>
                {br(c.diaOrigem)} trabalhado → {br(c.diaFolga)} de folga
              </strong>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: selo.cor, background: `color-mix(in srgb, ${selo.cor} 14%, transparent)`, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
                {selo.label}
              </span>
            </div>
            <small style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
              {ROTULO_COMPENSACAO[c.tipo].label} · {hhmmDeMin(c.minutos)}
              {c.aprovadorNome ? ` · por ${c.aprovadorNome}` : ""}
              {c.observacao ? ` · ${c.observacao}` : ""}
            </small>
            {podeEditar && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {c.status !== "aprovada" && <Botao tamanho="sm" icone="check" onClick={() => void mudar(c, "aprovada")}>Aprovar</Botao>}
                {c.status === "aprovada" && <Botao tamanho="sm" icone="circle-minus" onClick={() => void mudar(c, "cancelada")}>Cancelar</Botao>}
                {c.status === "pendente" && <Botao tamanho="sm" icone="x" onClick={() => void mudar(c, "recusada")}>Recusar</Botao>}
                <BotaoApagar tamanho="sm" aoConfirmar={() => void apagar(c)} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── O bloco inteiro ──────────────────────────────────────────────────────────
// Título + botão de registrar + a lista. É o que a ficha do colaborador e a
// gaveta do Ponto plantam, cada uma no seu lugar, sem repetir a fiação.
//
// Quem pode registrar sai da PRÓPRIA rota (`podeEditar`), e não de uma prop
// vinda de cima: o painel de Ponto não conhece os poderes de RH de quem está
// olhando, e oferecer um botão que o servidor recusa é pior que não oferecer.
export function BlocoDeCompensacoes({ employeeId, nome, titulo = "Compensações", aoMudar }: {
  employeeId: string;
  nome: string;
  titulo?: string;
  aoMudar?: () => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [pode, setPode] = useState(false);
  const [geracao, setGeracao] = useState(0);
  const saberPoder = useCallback((p: boolean) => setPode(p), []);

  return (
    <section style={{ display: "grid", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minHeight: "var(--tap)" }}>
        <strong style={{ fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 7 }}>
          <Icon name="arrows-exchange" size={15} color="var(--roxo)" /> {titulo}
        </strong>
        {pode && (
          <Botao tamanho="sm" icone="plus" onClick={() => setAbrindo(true)}>Registrar</Botao>
        )}
      </div>
      <ListaDeCompensacoes
        employeeId={employeeId}
        recarregarEm={geracao}
        aoSaberPoder={saberPoder}
        aoMudar={aoMudar}
      />
      {abrindo && (
        <FormularioCompensacao
          employeeId={employeeId}
          nome={nome}
          onFechar={() => setAbrindo(false)}
          aoSalvar={() => { setGeracao((g) => g + 1); aoMudar?.(); }}
        />
      )}
    </section>
  );
}
