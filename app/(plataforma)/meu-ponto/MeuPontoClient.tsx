"use client";

import { GrupoOpcoes } from "@/app/(plataforma)/ui/formularios";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { BancoResumo, DiaBanco, ClasseDia, MesBanco } from "@/lib/banco-horas";
import { CLASSES_DIA, ROTULO_CLASSE, fundoDaClasse } from "@/lib/jornada/tipos";
import { Icon } from "../Icon";
import { confirmar, toast } from "../Toast";
import { AjusteHoras, BatidasDoDia } from "../administracao/PontoPanel";
import { PagarHorasAcao, HistoricoPagamentos } from "./PagarHoras";
import { JustificativasDoDia } from "./Justificativas";
import { PedidosPendentes } from "./PedidosPendentes";
import { IntervalosAutomaticos } from "./IntervalosAutomaticos";
import type { JanelaDaJornada } from "@/lib/ponto-justificativas";
import { useIsMobile } from "../ui/useMediaQuery";
import { Avatar as AvatarBase } from "../ui/Avatar";
import { Botao, BotaoIcone } from "../ui/controles";
import { Alerta, type TomAlerta } from "../ui/Alerta";
import { Fila, TrocaIcone, useOnda } from "../ui/micro";
// ── fmt helpers (inline: não importar do lib server) ─────────────────────────
const fmtSaldo = (min: number) => { const s = min < 0 ? "−" : "+"; const a = Math.abs(min); return `${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`; };
const fmtHoras = (min: number) => { const a = Math.max(0, min); return `${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`; };
const saldoCor = (min: number) => (min > 5 ? "var(--ok)" : min < -5 ? "var(--perigo)" : "var(--text)");
const TIPO_LABEL: Record<string, string> = { entrada: "Entrada", almoco: "Almoço", retorno: "Retorno", saida: "Saída" };
const TIPO_COR: Record<string, string> = { entrada: "var(--ok)", almoco: "var(--atencao)", retorno: "var(--info)", saida: "var(--perigo)" };

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
// Rótulo, cor e fundo da classe do dia vêm do vocabulário único
// (`lib/jornada/tipos.ts`). Era uma cópia local, e cópia local é como uma tela
// passa a chamar de "Falta" um dia que o cálculo já sabe que era férias.
const CLASSE_LABEL = Object.fromEntries(CLASSES_DIA.map((c) => [c, ROTULO_CLASSE[c].label])) as Record<ClasseDia, string>;
const CLASSE_COR = Object.fromEntries(CLASSES_DIA.map((c) => [c, ROTULO_CLASSE[c].cor])) as Record<ClasseDia, string>;
const bgClasse = fundoDaClasse;

const mesAtual = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);
const mesLabel = (mes: string) => { const [y, m] = mes.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(/^\w/, (c) => c.toUpperCase()); };
const addMes = (mes: string, d: number) => { const [y, m] = mes.split("-").map(Number); const x = new Date(y, m - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; };

// ── Período = MÊS FECHADO ────────────────────────────────────────────────────
// A conta do banco de horas é mensal (01 ao último dia): as horas de julho se
// resolvem em julho, e dia 01 abre um mês novo. Por isso a tela navega por mês,
// e não por intervalo livre: um recorte de 16/07 a 15/08 misturaria dois placares
// que não se somam, e era exatamente aí que "as horas extras do mês" apareciam
// erradas.
const diaLabel = (dia: string) => { const [y, m, d] = dia.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }); };

/** O placar do mês pedido. Zerado quando o mês não existe no ledger (mês antes
 *  do início do banco, ou resposta antiga sem `meses`). */
const mesDoLedger = (meses: MesBanco[] | undefined, mes: string): MesBanco =>
  meses?.find((m) => m.mes === mes)
  ?? { mes, geradoMin: 0, devidoMin: 0, creditoMin: 0, debitoMin: 0, pagoMin: 0, saldoMin: 0, corrente: mes === mesAtual(), geradoEspecialMin: 0, creditoEspecialMin: 0, pagoEspecialMin: 0 };
const dataBR = (dia: string) => { const [y, m, d] = dia.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }); };

type TipoFeriado = "folga" | "troca";
type Feriado = { dia: string; descricao: string | null; tipo?: TipoFeriado };
/** Rótulo do tipo — o que muda é a hora de quem TRABALHA no feriado. */
const FERIADO_LABEL: Record<TipoFeriado, string> = { folga: "Feriado", troca: "Feriado trocado" };
type Resp = {
  escopo: "eu" | "pessoa" | "todos"; mes: string; metaHoras: number; isAdmin: boolean;
  banco?: BancoResumo | null; pessoas?: BancoResumo[]; feriados?: Feriado[]; semVinculo?: boolean; error?: string;
};

// `isAdmin` = enxerga a EQUIPE (papel admin ou área do ponto na grade).
// `podeLancar` = ações que reescrevem batida de todo mundo ("marcar todo mundo
// certo"), que seguem sendo só do admin. Sem essa separação o botão aparecia
// pra quem recebeu a área e a API respondia 403.
// `pessoaFixa` = já entra no detalhe DESSA pessoa, sem passar pela lista da
// equipe e sem "voltar" (quem escolheu a pessoa foi a tela de fora — o drawer
// do painel de ponto). `embutido` tira o cabeçalho de página e as ferramentas
// de mês inteiro: dentro de um painel lateral o título já é o da pessoa, e
// repetir "Banco de horas" em 22px ali é ruído.
export function MeuPontoClient({ isAdmin, nome, soMeu = false, podeLancar, pessoaFixa, embutido }: { isAdmin: boolean; nome: string; soMeu?: boolean; podeLancar?: boolean; pessoaFixa?: string; embutido?: boolean }) {
  const podeLancarEm = podeLancar ?? isAdmin;
  const [mes, setMes] = useState<string>(() => mesAtual());   // "YYYY-MM" — a unidade de conta
  const [sel, setSel] = useState<string | null>(pessoaFixa ?? null);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [diaAcao, setDiaAcao] = useState<DiaBanco | null>(null);   // dia aberto no modal (admin)

  const load = useCallback(() => {
    setLoading(true); setErr(false);
    const q = new URLSearchParams({ mes });
    if (soMeu) q.set("escopo", "eu");
    else if (pessoaFixa) q.set("pessoaId", pessoaFixa);
    else if (isAdmin && sel) q.set("pessoaId", sel);
    fetch(`/api/ponto/banco-horas?${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Resp) => { if (j?.error) setErr(true); else setData(j); })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, [mes, isAdmin, sel, soMeu, pessoaFixa]);
  useEffect(() => { load(); }, [load]);

  // Mapa (não Set): o TIPO do feriado decide se a hora de quem trabalhou nele
  // tem adicional ("folga") ou volta como folga combinada ("troca").
  const feriadosSet = useMemo(() => new Map((data?.feriados ?? []).map((f) => [f.dia, (f.tipo === "troca" ? "troca" : "folga") as TipoFeriado])), [data]);
  const gerivel = isAdmin && !soMeu;   // admin gerenciando (feriado/justificativa)
  // Abrir o dia não é o mesmo que gerir o dia. O colaborador precisa abrir pra
  // PEDIR justificativa do próprio ponto — ele não lança batida, não marca
  // feriado e não ajusta hora, e é `gerivel` que continua guardando isso.
  //
  // Quem manda é o ESCOPO que a API devolveu, não a prop: `/meu-ponto` monta
  // sem `soMeu`, e um não-admin ali recebe `escopo: "eu"` — olhando só pra
  // prop, justamente a pessoa dona do ponto ficaria sem conseguir abrir o dia.
  // De quebra, o admin que abre o PRÓPRIO ponto pela Central entra como
  // colaborador: ele pede, e a aprovação continua sendo do painel da equipe.
  const abrivel = gerivel || soMeu || data?.escopo === "eu";

  /** `tipo` null = desmarcar. Marcar de novo com outro tipo só troca o tipo. */
  async function definirFeriado(dia: string, tipo: TipoFeriado | null) {
    if (!gerivel) return;
    setBusy(true);
    try {
      const r = tipo === null
        ? await fetch(`/api/ponto/feriados?dia=${dia}`, { method: "DELETE" })
        : await fetch("/api/ponto/feriados", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dia, tipo }) });
      const d = await r.json();
      if (!r.ok) { toast.erro(d?.error === "tabela_ausente" || /ponto_feriados/.test(d?.error || "") ? "Rode o supabase/ponto_feriados.sql primeiro." : d?.error || "Falha."); return; }
      toast.ok(tipo === null ? "Feriado removido." : tipo === "troca" ? "Feriado trocado marcado." : "Feriado marcado."); load();
    } finally { setBusy(false); }
  }
  /** Atalho do calendário: marca feriado comum ou desmarca. */
  const toggleFeriado = (dia: string) => definirFeriado(dia, feriadosSet.has(dia) ? null : "folga");

  async function preencher() {
    const ok = await confirmar(`Marcar todo mundo "certinho" em ${mesLabel(mes)}?`, { detalhe: "Zera as batidas do mês e preenche a jornada completa em cada dia útil (respeitando fim de semana e feriados), até hoje. Bom pra começar do zero.", perigo: true });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch("/api/ponto/preencher", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mes }) });
      const d = await r.json();
      if (!r.ok) { toast.erro(d?.error || "Falha ao preencher."); return; }
      toast.ok(`${d.pessoas} pessoa(s) · ${d.registros} batidas geradas.`); load();
    } finally { setBusy(false); }
  }

  const mostrarLista = isAdmin && !sel && !soMeu && !pessoaFixa;
  const desde = data?.banco?.ledger?.desde ?? data?.pessoas?.[0]?.ledger?.desde ?? null;
  const mesNav = <PeriodoBarra mes={mes} onMes={setMes} desde={desde} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: embutido ? undefined : 980, margin: "0 auto", paddingBottom: embutido ? 0 : 40 }}>
      {/* Embutido (drawer da pessoa): sem título de página nem ferramentas do
          mês inteiro — o cabeçalho de fora já diz de quem é. Só a navegação de
          mês e o "i" das regras, que continuam sendo desta tela. */}
      {embutido ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {mesNav}
          <RegrasInfo />
        </div>
      ) : (
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ width: 44, height: 44, borderRadius: "var(--r-sm)", display: "grid", placeItems: "center", background: "var(--primary)", flex: "none" }}>
          <Icon name="clock" size={24} color="#fff" />
        </div>
        {/* `minWidth: 0` deixava o título encolher até 32px de largura, e
            "Banco de horas" saía UMA LETRA POR LINHA: o ícone (44), o botão de
            ajuda (44) e o seletor de mês (206) somam 294 de uma linha de 362, e
            o bloco do título, sendo o único que encolhe, absorvia toda a
            diferença em vez de empurrar o seletor pra linha de baixo.
            Uma base de 200px força a quebra — que é o que `flexWrap` já queria
            fazer e o `minWidth: 0` impedia. */}
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "var(--text)" }}>Banco de horas</h1>
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>
            {isAdmin && !soMeu
              ? "Sair mais cedo desconta do banco antes de virar dívida (crédito vale 3 meses). Pagar em dinheiro é por mês. Hora extra só passando de 10 min no dia."
              : "Sair mais cedo desconta das suas horas a favor antes de virar dívida (elas valem 3 meses). Hora extra só passando de 10 min no dia."}
          </p>
        </div>
        <RegrasInfo />
        {mesNav}
      </div>
      )}

      {/* Ferramentas de admin */}
      {podeLancarEm && !soMeu && !embutido && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Botao icone="circle-check" onClick={preencher} disabled={busy}>
            Marcar todo mundo certo (o mês)
          </Botao>
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Abra uma pessoa pra ver o calendário, lançar batidas e justificar dias.</span>
        </div>
      )}
      {podeLancarEm && isAdmin && !soMeu && !embutido && !sel && <IntervalosAutomaticos onMudou={load} />}

      {isAdmin && sel && !pessoaFixa && (
        <Botao variante="sutil" icone="chevron-left" onClick={() => setSel(null)} style={{ alignSelf: "flex-start" }}>
          Voltar para a equipe
        </Botao>
      )}

      {loading && !data && <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Somando as batidas…</p>}
      {err && <div className="glass" style={{ padding: 20, borderRadius: "var(--r-md)", color: "var(--text-dim)" }}>Não consegui carregar o banco de horas.</div>}

      {data && !err && (
        mostrarLista
          ? <>
              {/* A fila de decisão vem ANTES da lista: pedido parado não muda
                  hora nenhuma, e um pedido invisível é a pessoa descobrindo no
                  fim do mês que o atestado nunca chegou a ninguém. */}
              {gerivel && (
                <PedidosPendentes
                  nomePorPessoa={new Map((data.pessoas ?? []).map((p) => [p.pessoaId, p.nome]))}
                  onDecidido={load}
                />
              )}
              <EquipeVisao pessoas={data.pessoas ?? []} mes={mes} onAbrir={setSel} />
            </>
          : data.semVinculo
            ? <div className="glass" style={{ padding: 22, borderRadius: "var(--r-md)", color: "var(--text-dim)", lineHeight: 1.6 }}>
                Seu usuário ainda não está vinculado a um cadastro de ponto. Peça pro admin te vincular pelo seu perfil (aba <strong>Ponto</strong>) que suas horas aparecem aqui.
              </div>
            : data.banco
              ? <>
                  {/* Embutido no drawer, o cabeçalho de fora já traz o nome e o
                      cartão de saldo logo abaixo já diz quanto e até quando —
                      este aviso repetiria a mesma frase duas vezes na mesma tela. */}
                  {!embutido && <AvisoSaldo banco={data.banco} mes={mes} propria={data.escopo === "eu"} />}
                  {/* Pagar horas é DINHEIRO, não correção de ponto: fica só com
                      quem tem o papel de admin (a API cobra o mesmo). Quem
                      recebeu a área do ponto na grade continua justificando e
                      marcando feriado, mas não quita saldo. */}
                  <BancoDetalhe banco={data.banco} mes={mes} donoNome={data.escopo === "eu" ? nome : undefined} gerivel={gerivel} abrivel={abrivel} podePagar={podeLancarEm && !soMeu} onFeito={load} semIdentidade={embutido} feriados={feriadosSet} onToggleFeriado={toggleFeriado} onDiaClick={(d) => { if (abrivel && d.classe !== "futuro" && d.classe !== "pre") setDiaAcao(d); }} onSaiu={pessoaFixa ? undefined : () => { setSel(null); load(); }} />
                </>
              : <div className="glass" style={{ padding: 22, borderRadius: "var(--r-md)", color: "var(--text-dim)" }}>Sem dados neste período.</div>
      )}

      {diaAcao && data?.banco && (
        <DiaAcoesModal
          dia={diaAcao} pessoaId={data.banco.pessoaId} pessoaNome={data.banco.nome}
          turno={[data.banco.entradaPrevista, data.banco.almocoInicio, data.banco.almocoFim, data.banco.saidaPrevista]
            .filter((h): h is string => !!h && /^\d{1,2}:\d{2}/.test(h)).map((h) => h.slice(0, 5))}
          feriado={feriadosSet.get(diaAcao.dia) ?? null} busy={busy} gerivel={gerivel}
          jornada={{
            entradaPrevista: data.banco.entradaPrevista, saidaPrevista: data.banco.saidaPrevista,
            almocoInicio: data.banco.almocoInicio, almocoFim: data.banco.almocoFim,
            jornadaMin: diaAcao.metaMin || data.banco.jornadaMin,
          }}
          onMudou={load}
          onFechar={() => { setDiaAcao(null); load(); }}
          onFeriado={(t) => definirFeriado(diaAcao.dia, t)}
        />
      )}
    </div>
  );
}


// ── Barra de mês ─────────────────────────────────────────────────────────────
// Um mês por vez, porque é assim que a conta fecha. As setas pulam de mês e a
// lista mostra todos os meses desde o início do banco — quem confere a folha de
// julho escolhe julho, e o número que aparece é o de julho, ponto.
function PeriodoBarra({ mes, onMes, desde }: { mes: string; onMes: (m: string) => void; desde: string | null }) {
  const atual = mesAtual();
  // Todos os meses do início do banco (ou 12 meses atrás, quando ainda não sabe)
  // até o mês corrente — mês no futuro é tela vazia.
  const opcoes = useMemo(() => {
    const primeiro = (desde ?? addMes(atual, -11)).slice(0, 7);
    const out: string[] = [];
    for (let m = primeiro; m <= atual && out.length < 120; m = addMes(m, 1)) out.push(m);
    if (!out.includes(mes)) out.unshift(mes);   // mês vindo de fora da lista continua selecionável
    return out.reverse();                       // o mais recente primeiro
  }, [desde, atual, mes]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 260px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: 4, flex: "none" }}>
          <BotaoIcone icone="chevron-left" titulo="Mês anterior" tamanho="sm" onClick={() => onMes(addMes(mes, -1))} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", minWidth: 140, textAlign: "center" }}>{mesLabel(mes)}</span>
          <BotaoIcone icone="chevron-right" titulo="Próximo mês" tamanho="sm" onClick={() => onMes(addMes(mes, 1))} disabled={mes >= atual} />
        </div>
        {/* `select` nativo: no celular abre a roleta do sistema, que é o melhor
            seletor de lista que existe no aparelho — e tem 44px de alvo. */}
        <select value={mes} onChange={(e) => onMes(e.target.value)} aria-label="Mês do banco de horas"
          style={{ minHeight: "var(--tap)", width: "min(100%, 210px)", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontWeight: 600, padding: "0 10px" }}>
          {opcoes.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </select>
      </div>
      <div className="tab-strip" style={{ gap: 6 }}>
        {([["Este mês", atual], ["Mês passado", addMes(atual, -1)]] as [string, string][]).map(([rot, m]) => (
          <button key={rot} type="button" className="hr-chip" aria-pressed={mes === m} onClick={() => onMes(m)}>{rot}</button>
        ))}
      </div>
    </div>
  );
}

// ── Admin: visão da equipe — resumo + alertas + tabela ordenável ─────────────
// Tudo aqui fala do MÊS aberto: "extra do mês", "a pagar do mês". A coluna de
// saldo total continua existindo (é o acumulado do banco), mas quem confere a
// folha pergunta pelo mês — e era esse número que a tela não mostrava.
type SortKey = "nome" | "trabalhado" | "extraMes" | "devidoMes" | "pagoMes" | "saldo";
const sortVal = (p: BancoResumo, k: SortKey, mes: string): number | string => {
  const m = mesDoLedger(p.ledger?.meses, mes);
  return {
    nome: p.nome.toLowerCase(), trabalhado: p.trabalhadoMin,
    extraMes: m.creditoMin, devidoMes: m.debitoMin, pagoMes: m.pagoMin, saldo: p.saldoMin,
  }[k];
};

// Rótulos curtos dos chips de ordenação do celular (a tabela do desktop usa os
// títulos das colunas; no cartão não há cabeçalho pra clicar).
const ORDENAR_POR: { k: SortKey; label: string }[] = [
  { k: "extraMes", label: "Extra do mês" }, { k: "devidoMes", label: "A pagar" }, { k: "nome", label: "Nome" },
  { k: "trabalhado", label: "Trab." }, { k: "pagoMes", label: "Pago" }, { k: "saldo", label: "Saldo total" },
];

// Busca sem acento: quem procura "leo" no teclado do celular quer achar "Léo".
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function EquipeVisao({ pessoas, mes, onAbrir }: { pessoas: BancoResumo[]; mes: string; onAbrir: (id: string) => void }) {
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "extraMes", dir: -1 });   // mais extra primeiro
  const [busca, setBusca] = useState("");
  const celular = useIsMobile();

  const tot = useMemo(() => {
    let saldo = 0, extra = 0, devido = 0, pago = 0, faltasN = 0, comFalta = 0;
    for (const p of pessoas) {
      const L = p.ledger; const m = mesDoLedger(L?.meses, mes);
      saldo += p.saldoMin; extra += m.creditoMin; devido += m.debitoMin; pago += m.pagoMin;
      const nf = L?.faltasNaoJustificadas.length ?? 0;
      faltasN += nf; if (nf > 0) comFalta++;
    }
    return { saldo, extra, devido, pago, faltasN, comFalta };
  }, [pessoas, mes]);

  const atencao = useMemo(() =>
    pessoas.filter((p) => (p.ledger?.faltasNaoJustificadas.length ?? 0) > 0 || mesDoLedger(p.ledger?.meses, mes).debitoMin > 0),
    [pessoas, mes]);

  const ordenadas = useMemo(() => {
    const arr = [...pessoas];
    arr.sort((a, b) => { const va = sortVal(a, sort.k, mes), vb = sortVal(b, sort.k, mes); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; });
    return arr;
  }, [pessoas, sort, mes]);

  // A busca filtra só a LISTA. Os cards de resumo e o bloco de atenção continuam
  // falando do time inteiro — senão procurar um nome faria o total do time
  // "mudar", e esse número é o que a pessoa está conferindo.
  const visiveis = useMemo(() => {
    const q = norm(busca.trim());
    return q ? ordenadas.filter((p) => norm(p.nome).includes(q)) : ordenadas;
  }, [ordenadas, busca]);

  const toggleSort = (k: SortKey) => setSort((s) => s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "nome" ? 1 : -1 });

  if (pessoas.length === 0) return <div className="glass" style={{ padding: 22, borderRadius: "var(--r-md)", color: "var(--text-dim)" }}>Nenhuma pessoa no ponto ainda.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Cards de resumo do time — do MÊS aberto */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 12 }}>
        <ResumoCard label={`Extra de ${mesLabel(mes)}`} value={fmtHoras(tot.extra)} cor={tot.extra > 0 ? "var(--ok)" : "var(--text)"} sub={tot.pago > 0 ? `${fmtHoras(tot.pago)} já pagas` : "em aberto no mês"} subCor={tot.pago > 0 ? "var(--ok)" : undefined} />
        <ResumoCard label="A compensar no mês" value={fmtHoras(tot.devido)} cor={tot.devido > 0 ? "var(--perigo)" : "var(--text)"} sub={tot.devido > 0 ? "horas que a equipe deve" : "ninguém devendo"} />
        <ResumoCard label="Pendências" value={String(tot.faltasN)} cor={tot.faltasN > 0 ? "var(--perigo)" : "var(--text)"} sub={tot.faltasN > 0 ? `falta(s) sem justificar` : "nada a justificar"} />
        <ResumoCard label="Saldo do time (total)" value={fmtSaldo(tot.saldo)} cor={saldoCor(tot.saldo)} sub={`${pessoas.length} pessoa(s) · todos os meses`} />
      </div>

      {/* Alertas: quem precisa de atenção */}
      {atencao.length > 0 && (
        <div className="glass" style={{ padding: "14px 16px", borderRadius: "var(--r-md)", border: "1px solid color-mix(in srgb,var(--atencao) 40%,transparent)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Icon name="alert-triangle" size={16} color="var(--atencao)" />
            <strong style={{ fontSize: 13.5, color: "var(--text)" }}>Precisa de atenção ({atencao.length})</strong>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {atencao.map((p) => {
              const L = p.ledger; const nf = L?.faltasNaoJustificadas.length ?? 0;
              const m = mesDoLedger(L?.meses, mes);
              return (
                <button key={p.pessoaId} onClick={() => onAbrir(p.pessoaId)}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "2px 0", width: "100%" }}>
                  <Avatar url={p.fotoUrl} nome={p.nome} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {nf > 0 && <Badge cor="var(--perigo)">{nf} falta(s) s/ justificar</Badge>}
                    {m.debitoMin > 0 && <Badge cor="var(--atencao)">deve {fmtHoras(m.debitoMin)} no mês</Badge>}
                  </span>
                  <Icon name="chevron-right" size={16} color="var(--text-dim)" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabela ordenável — superfície SÓLIDA (sem .glass/backdrop-filter): o
          hover das linhas troca o background, e sobre backdrop-filter o Chrome não
          repinta limpo → deixava "quadrado gigante" acumulando o realce. */}
      {/* Busca — colada na lista, que é o que ela filtra. */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 220px", minWidth: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "0 12px", minHeight: "var(--tap)" }}>
          <Icon name="search" size={15} color="var(--text-dim)" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa…" aria-label="Buscar pessoa"
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "var(--text)", fontFamily: "inherit", fontSize: 13.5, padding: "9px 0" }} />
          {busca && (
            <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca"
              style={{ border: "none", background: "none", cursor: "pointer", display: "grid", placeItems: "center", flex: "none", width: 28, height: 28 }}>
              <Icon name="x" size={14} color="var(--text-dim)" />
            </button>
          )}
        </label>
        {busca.trim() && <span style={{ fontSize: 12, color: "var(--text-dim)", flex: "none" }}>{visiveis.length} de {pessoas.length}</span>}
      </div>

      {/* CELULAR: a tabela tem 640px de largura mínima — rolar de lado fazia
          perder a coluna do NOME (a referência) assim que arrastava. Vira lista
          de cartões, com a ordenação exposta em chips que rolam de lado. */}
      {celular ? (
        <>
          <div className="tab-strip" style={{ gap: 6, marginBottom: 2 }}>
            <span style={{ flex: "none", alignSelf: "center", fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", paddingRight: 2 }}>Ordenar:</span>
            {ORDENAR_POR.map(({ k, label }) => {
              const on = sort.k === k;
              return (
                <button key={k} onClick={() => toggleSort(k)} aria-pressed={on}
                  style={{ flex: "none", whiteSpace: "nowrap", padding: "7px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? "transparent" : "var(--border)"}`, background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: on ? "var(--on-primary, #fff)" : "var(--text)" }}>
                  {label}{on ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visiveis.map((p) => {
              const m = mesDoLedger(p.ledger?.meses, mes);
              const par = (rot: string, val: string, cor?: string) => (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-dim)" }}>{rot}</span>
                  <span className="stat" style={{ fontWeight: 700, color: cor ?? "var(--text)" }}>{val}</span>
                </div>
              );
              return (
                <div key={p.pessoaId} onClick={() => onAbrir(p.pessoaId)}
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: 14, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <Avatar url={p.fotoUrl} nome={p.nome} />
                    <span style={{ fontSize: 14.5, fontWeight: 800, color: "var(--text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
                    <span className="stat" style={{ fontSize: 17, fontWeight: 800, color: saldoCor(m.saldoMin), flex: "none" }}>{fmtSaldo(m.saldoMin)}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {par("Trab. no mês", fmtHoras(p.trabalhadoMin))}
                    {par("Extra do mês", m.creditoMin > 0 ? fmtHoras(m.creditoMin) : "—", m.creditoMin > 0 ? "var(--ok)" : "var(--text-dim)")}
                    {par("A compensar", m.debitoMin > 0 ? fmtHoras(m.debitoMin) : "—", m.debitoMin > 0 ? "var(--perigo)" : "var(--text-dim)")}
                    {par("Já pago", m.pagoMin > 0 ? fmtHoras(m.pagoMin) : "—", m.pagoMin > 0 ? "var(--ok)" : "var(--text-dim)")}
                    {par("Saldo total", fmtSaldo(p.saldoMin), saldoCor(p.saldoMin))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
      <div style={{ borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 640 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.8fr) 1fr 1fr 1fr 1fr 1fr", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
              <Th k="nome" sort={sort} on={toggleSort} align="left">Pessoa</Th>
              <Th k="trabalhado" sort={sort} on={toggleSort}>Trab. no mês</Th>
              <Th k="extraMes" sort={sort} on={toggleSort}>Extra do mês</Th>
              <Th k="devidoMes" sort={sort} on={toggleSort}>A compensar</Th>
              <Th k="pagoMes" sort={sort} on={toggleSort}>Já pago</Th>
              <Th k="saldo" sort={sort} on={toggleSort}>Saldo total</Th>
            </div>
            {visiveis.map((p, i) => {
              const m = mesDoLedger(p.ledger?.meses, mes);
              return (
                <div key={p.pessoaId} onClick={() => onAbrir(p.pessoaId)} className="mt-linha"
                  style={{ display: "grid", gridTemplateColumns: "minmax(0,1.8fr) 1fr 1fr 1fr 1fr 1fr", gap: 8, padding: "11px 16px", alignItems: "center", cursor: "pointer", borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Avatar url={p.fotoUrl} nome={p.nome} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
                  </div>
                  <Cell>{fmtHoras(p.trabalhadoMin)}</Cell>
                  <Cell cor={m.creditoMin > 0 ? "var(--ok)" : "var(--text-dim)"}>{m.creditoMin > 0 ? fmtHoras(m.creditoMin) : "—"}</Cell>
                  <Cell cor={m.debitoMin > 0 ? "var(--perigo)" : "var(--text-dim)"}>{m.debitoMin > 0 ? fmtHoras(m.debitoMin) : "—"}</Cell>
                  <Cell cor={m.pagoMin > 0 ? "var(--ok)" : "var(--text-dim)"}>{m.pagoMin > 0 ? fmtHoras(m.pagoMin) : "—"}</Cell>
                  <div style={{ textAlign: "right" }}>
                    <span className="stat" style={{ fontSize: 16, fontWeight: 800, color: saldoCor(p.saldoMin) }}>{fmtSaldo(p.saldoMin)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}
      {visiveis.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-dim)", padding: "10px 4px", margin: 0 }}>Ninguém com “{busca.trim()}”.</p>
      )}
      <p style={{ fontSize: 11.5, color: "var(--text-dim)", padding: "0 4px" }}>
        {celular ? "Toque numa pessoa pra ver o calendário, lançar batidas e justificar dias." : "Clique numa pessoa pra ver o calendário, lançar batidas e justificar dias. Toque nos títulos pra ordenar."}
      </p>
    </div>
  );
}

// ── Botão "i": regras do banco de horas (inclui o acordo mensal) ─────────────
function RegrasInfo() {
  const [aberto, setAberto] = useState(false);
  // Portal + mounted: o modal era `position:fixed` DENTRO de um card `.glass`
  // (backdrop-filter cria bloco de contenção pro fixed) → caía no rodapé do card
  // em vez de centralizar na tela. Renderiza no body pra escapar disso.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const item = (titulo: string, corpo: React.ReactNode) => (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)", flex: "none", marginTop: 6 }} />
      <div><strong style={{ color: "var(--text)" }}>{titulo}</strong> <span style={{ color: "var(--text-dim)" }}>{corpo}</span></div>
    </div>
  );
  return (
    <>
      <BotaoIcone icone="info-circle" titulo="Como funciona o banco de horas" variante="secundario" onClick={() => setAberto(true)} style={{ flex: "none" }} />
      {aberto && mounted && createPortal(
        <div onClick={() => setAberto(false)} className="apple-backdrop sheet-host"
          style={{ position: "fixed", inset: 0, zIndex: "var(--z-modal, 1300)", display: "grid", placeItems: "center", padding: 18 }}>
          <div onClick={(e) => e.stopPropagation()} className="glass pop-solid sheet"
            style={{ width: "min(520px, 100%)", maxHeight: "85dvh", overflowY: "auto", borderRadius: "var(--r-md)", padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <Icon name="info-circle" size={20} color="var(--primary-texto)" />
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: "var(--text)" }}>Como funciona o banco de horas</h3>
              <BotaoIcone icone="x" titulo="Fechar" onClick={() => setAberto(false)} style={{ marginLeft: "auto" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11, fontSize: 13.5, lineHeight: 1.55 }}>
              {item("Compensar vem antes de dever:", <>trabalhou menos num dia? Sai primeiro <strong style={{ color: "var(--text)" }}>das horas a favor</strong> que ainda estão no banco — de qualquer mês, começando pelas mais antigas (as que expiram antes). <strong style={{ color: "var(--text)" }}>Só o que passar do que havia</strong> vira dívida a compensar ou pagar.</>)}
              {item("O mês continua sendo a folha:", <>cada mês mostra o que <strong style={{ color: "var(--text)" }}>gerou</strong> (histórico, não muda mais) e o que ainda está <strong style={{ color: "var(--text)" }}>em aberto</strong> nele. Pagar em dinheiro é sempre por mês: pagar julho não mexe em agosto.</>)}
              {item("Hora extra:", <>só a partir de <strong style={{ color: "var(--text)" }}>10 minutos a mais no dia</strong>. Abaixo disso não é hora extra, é arredondamento de quem bate o ponto na mão.</>)}
              {item("Tolerância (CLT art. 58):", <>até <strong style={{ color: "var(--text)" }}>5 min em cada marcação</strong> e <strong style={{ color: "var(--text)" }}>10 min somados no dia</strong>. Dentro disso, a diferença some — não vira dívida <em>nem</em> hora extra. Estourou, conta o tempo <strong style={{ color: "var(--text)" }}>real inteiro</strong>, desde o primeiro minuto: 12 min de atraso são 12 de dívida, não 2.</>)}
              {item("Pagar as horas do mês:", <>quita <strong style={{ color: "var(--text)" }}>só o extra daquele mês</strong>. Pagar julho não mexe em agosto, e vice-versa.</>)}
              {item("Dívida do mês:", "prazo de 1 mês pra compensar, contado do dia devido.")}
              {item("Horas a favor:", "expiram 3 meses depois do dia em que foram trabalhadas a mais, se não forem pagas.")}
              {item("Falta o dia inteiro:", "não tem tolerância — o dia deve a carga completa. Justificar registra o motivo; abonar é que perdoa as horas.")}
              {item("Sábado:", "quem trabalha sábado tem o dia contado como qualquer outro, com a carga própria. Quem não trabalha, é folga — não existe atraso nem falta, e o que trabalhar vira crédito.")}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Aviso do MÊS (pessoa): o que aquele mês deixou em aberto ─────────────────
// Fala do mês que está na tela, não do acumulado: "em julho você tem 3h a
// receber" é a frase que a pessoa procura. O total do banco aparece no cartão
// de baixo.
// Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
function AvisoSaldo({ banco, mes, propria }: { banco: BancoResumo; mes: string; propria: boolean }) {
  const L = banco.ledger;
  if (!L) return null;
  const m = mesDoLedger(L.meses, mes);
  const quem = propria ? "Você" : banco.nome.split(" ")[0];
  const box = (tom: TomAlerta, icon: string, titulo: string, corpo: React.ReactNode) => (
    <Alerta tom={tom} icone={icon} titulo={titulo}>{corpo}</Alerta>
  );

  if (m.debitoMin > 0) {
    return box("perigo", "alert-triangle", `${quem} deve ${fmtHoras(m.debitoMin)} de ${mesLabel(mes)}`, <>
      Prazo pra compensar: <strong>1 mês</strong> contado do dia devido. O banco já estava zerado — por isso virou dívida.
      {" "}Horas trabalhadas a mais <strong>abatem a dívida primeiro</strong>, de qualquer mês: só o que sobrar vira extra.
      {m.pagoMin > 0 && <> Já foram pagas <strong>{fmtHoras(m.pagoMin)}</strong> deste mês.</>}
    </>);
  }
  if (m.creditoMin > 0) {
    return box("ok", "circle-check", `${quem} tem ${fmtHoras(m.creditoMin)} a receber de ${mesLabel(mes)}`, <>
      Extra do mês ainda em aberto{m.pagoMin > 0 ? <>, já descontadas as <strong>{fmtHoras(m.pagoMin)}</strong> pagas</> : null}.
      {" "}Se ela trabalhar menos algum dia, sai daqui antes de virar dívida — e o que não for usado <strong>expira em 3 meses</strong>.
      {L.creditoExpiradoMin > 0 && <> <strong style={{ color: "var(--atencao)" }}>{fmtHoras(L.creditoExpiradoMin)} no banco já passaram de 3 meses.</strong></>}
    </>);
  }
  return box("info", "circle-check", `${mesLabel(mes)} está fechado`, <>
    Sem horas a pagar nem a receber neste mês{m.pagoMin > 0 ? <> — as <strong>{fmtHoras(m.pagoMin)}</strong> de extra já foram pagas</> : null}.
    {" "}Hora extra só a partir de <strong>10 min no dia</strong>; diferenças menores não contam pros dois lados.
  </>);
}

function ResumoCard({ label, value, cor, sub, subCor }: { label: string; value: string; cor: string; sub: string; subCor?: string }) {
  return (
    <div className="glass glass-spec" style={{ padding: "14px 16px", borderRadius: "var(--r-md)" }}>
      <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>{label}</div>
      <div className="stat" style={{ fontSize: 26, color: cor, marginTop: 3, lineHeight: 1.1, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 11, color: subCor ?? "var(--text-dim)", marginTop: 3, fontWeight: subCor ? 700 : 400 }}>{sub}</div>
    </div>
  );
}
function Th({ k, sort, on, children, align = "right" }: { k: SortKey; sort: { k: SortKey; dir: 1 | -1 }; on: (k: SortKey) => void; children: React.ReactNode; align?: "left" | "right" }) {
  const ativo = sort.k === k;
  return (
    <button onClick={() => on(k)} style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: align === "left" ? "flex-start" : "flex-end", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11.5, fontWeight: 800, letterSpacing: 0.2, textTransform: "uppercase", color: ativo ? "var(--text)" : "var(--text-dim)" }}>
      {children}
      {ativo && <TrocaIcone ligado={sort.dir === 1} a="chevron-down" b="chevron-up" size={13} corA="var(--text)" corB="var(--text)" />}
    </button>
  );
}
function Cell({ children, cor }: { children: React.ReactNode; cor?: string }) {
  return <div className="stat" style={{ textAlign: "right", fontSize: 13.5, fontWeight: 700, color: cor ?? "var(--text)" }}>{children}</div>;
}

function Badge({ children, cor }: { children: React.ReactNode; cor: string }) {
  return <span style={{ fontSize: 10.5, fontWeight: 800, color: cor, background: `color-mix(in srgb, ${cor} 16%, transparent)`, borderRadius: "var(--r-xs)", padding: "1px 6px" }}>{children}</span>;
}

// ── Detalhe: banco corrido + KPIs + calendário + dias ───────────────────────
function BancoDetalhe({ banco, mes, donoNome, gerivel, abrivel, podePagar, onFeito, semIdentidade, feriados, onToggleFeriado, onDiaClick, onSaiu }: { banco: BancoResumo; mes: string; donoNome?: string; gerivel: boolean; abrivel: boolean; podePagar: boolean; onFeito: () => void; semIdentidade?: boolean; feriados: Map<string, TipoFeriado>; onToggleFeriado: (dia: string) => void; onDiaClick: (d: DiaBanco) => void; onSaiu?: () => void }) {
  const jornada = fmtHoras(banco.jornadaMin);
  const comBatida = banco.dias.filter((d) => d.batidas.length > 0 || d.classe === "falta" || d.justificada);
  const L = banco.ledger;
  const kpis = [
    { label: "Trabalhado no mês", value: fmtHoras(banco.trabalhadoMin), cor: "var(--text)", sub: `${banco.diasTrabalhados} dia(s) com ponto` },
    { label: "Faltas s/ justificar", value: String(L?.faltasNaoJustificadas.length ?? 0), cor: (L?.faltasNaoJustificadas.length ?? 0) > 0 ? "var(--perigo)" : "var(--text)", sub: "dia inteiro sem bater" },
    { label: "Jornada", value: jornada, cor: "var(--text-dim)", sub: `por dia${banco.entradaPrevista && banco.saidaPrevista ? ` · ${banco.entradaPrevista}–${banco.saidaPrevista}` : ""}` },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* No drawer o nome e a foto já são o cabeçalho do painel — repetir aqui
          empurra o saldo (que é o assunto) pra baixo da dobra. Sobra só a linha
          do período, que continua sendo informação desta tela. */}
      {semIdentidade ? (
        <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Compensa com o banco · folha por mês · banco desde {dataBR(L.desde)} · fuso de São Paulo</div>
      ) : (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar url={banco.fotoUrl} nome={banco.nome} big />
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{donoNome && banco.nome === donoNome ? "Você" : banco.nome}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Compensa com o banco · folha por mês · banco desde {dataBR(L.desde)} · fuso de São Paulo</div>
        </div>
      </div>
      )}

      {/* O mês aberto (headline) + o total do banco embaixo */}
      <BancoCorrido L={L} banco={banco} mes={mes} podePagar={podePagar} onFeito={onFeito} />

      {/* O que já foi pago em dinheiro — some quando não houve pagamento.
          A pessoa vê o próprio histórico (transparência); desfazer é do admin. */}
      <HistoricoPagamentos banco={banco} podeDesfazer={podePagar} onFeito={onFeito} />

      {/* Faltas não justificadas */}
      {L.faltasNaoJustificadas.length > 0 && (
        <Alerta tom="perigo" titulo="Dia(s) sem justificativa">
          <p style={{ margin: "0 0 8px" }}>Dia inteiro sem bater ponto. Ninguém folga o dia todo sem justificar.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {L.faltasNaoJustificadas.map((f) => (
              <button key={f.dia} disabled={!abrivel} onClick={() => { const d = banco.dias.find((x) => x.dia === f.dia); if (d) onDiaClick(d); }}
                style={{ minHeight: "var(--tap)", fontSize: 12, fontWeight: 700, color: "var(--perigo)", background: "color-mix(in srgb,var(--perigo) 14%,transparent)", border: "none", borderRadius: "var(--r-xs)", padding: "4px 10px", cursor: abrivel ? "pointer" : "default" }}>
                {dataBR(f.dia)} · −{fmtHoras(f.min)}{abrivel ? " · justificar" : ""}
              </button>
            ))}
          </div>
        </Alerta>
      )}

      {/* `.mt-num` e não `NumeroVivo`: estes valores são TEXTO ("8:48", a
          jornada), não número — contar até eles não existe. O que falta mesmo é
          largura estável, senão a fileira dança quando o minuto vira. */}
      <Fila className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12 }}>
        {kpis.map((k) => (
          <div key={k.label} className="glass glass-spec mt-eleva" style={{ padding: "14px 16px", borderRadius: "var(--r-md)" }}>
            <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>{k.label}</div>
            <div className="stat mt-num" style={{ fontSize: 26, color: k.cor, marginTop: 3, lineHeight: 1.1, fontWeight: 800 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>{k.sub}</div>
          </div>
        ))}
      </Fila>

      <Calendario banco={banco} feriados={feriados} gerivel={gerivel} abrivel={abrivel} onDiaClick={onDiaClick} onToggleFeriado={onToggleFeriado} />

      {comBatida.length > 0 && (
        <div className="glass" style={{ borderRadius: "var(--r-md)", overflow: "hidden" }}>
          <Fila>
            {[...comBatida].reverse().map((d, i) => <LinhaDia key={d.dia} d={d} border={i > 0} abrivel={abrivel} onClick={() => onDiaClick(d)} />)}
          </Fila>
        </div>
      )}

      <p style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
        Jornada de <strong>{jornada}/dia</strong>: trabalhou <strong>mais de 10 min</strong> num dia → hora extra;
        trabalhou menos → sai primeiro das <strong>horas a favor</strong> que ainda estão no banco (elas valem 3 meses) e só o que passar disso vira dívida.
        Sábado só conta pra quem tem sábado no cadastro; domingo nunca; feriado é folga de todo mundo.
        Trabalhou em <strong>domingo ou feriado</strong> → a hora extra é <strong>especial</strong> (adicional na folha).
        No <strong>feriado trocado</strong> ela entra como extra comum, pra ser devolvida na folga combinada.
        Justificar um dia registra o motivo — e ali se escolhe se a empresa <strong>abona</strong> as horas ou se a pessoa <strong>compensa</strong>.
      </p>

      {gerivel && onSaiu && <TirarDoBanco banco={banco} onSaiu={onSaiu} />}
    </div>
  );
}

// ── Tirar a pessoa do banco de horas ─────────────────────────────────────────
// Não apaga nada: marca o cadastro do ponto como INATIVO. A pessoa some desta
// lista, do painel do ponto e da sincronização do tablet, mas as batidas e o
// saldo continuam guardados — quem sai da empresa não pode levar o histórico
// junto (e quem voltar não precisa recomeçar do zero).
function TirarDoBanco({ banco, onSaiu }: { banco: BancoResumo; onSaiu: () => void }) {
  const [busy, setBusy] = useState(false);
  const saldo = banco.ledger?.saldoMin ?? 0;

  async function tirar() {
    const ok = await confirmar(`Tirar ${banco.nome} do banco de horas?`, {
      detalhe: saldo !== 0
        ? `Atenção: ainda há ${fmtSaldo(saldo)} em aberto — ${saldo > 0 ? "horas a favor que deixam de aparecer pra pagar" : "horas devidas que deixam de ser cobradas"}. A pessoa sai desta lista, do painel do ponto e do tablet; as batidas e o saldo ficam guardados. Pra trazer de volta: Ponto › Pessoas.`
        : "A pessoa sai desta lista, do painel do ponto e do tablet. As batidas e o saldo ficam guardados — pra trazer de volta: Ponto › Pessoas.",
      perigo: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch("/api/ponto/pessoas", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: banco.pessoaId, ativo: false }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d?.error) { toast.erro(d?.error === "tabela_ausente" ? "Rode o supabase/ponto.sql primeiro." : d?.error || "Não consegui tirar do banco."); return; }
      toast.ok(`${banco.nome} saiu do banco de horas.`);
      onSaiu();
    } catch { toast.erro("Não consegui tirar do banco."); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 2 }}>
      <Botao variante="perigo" icone="user-off" onClick={tirar} carregando={busy}>
        Tirar do banco de horas
      </Botao>
    </div>
  );
}

// Headline do MÊS: o extra daquele mês, o que ele deve, o que já foi pago —
// mais o total do banco numa linha discreta embaixo. Antes o número grande era o
// acumulado desde 15/07, então trocar de mês não mudava nada na tela e "as horas
// extras de julho" simplesmente não existiam em lugar nenhum.
//
// É aqui que "pagar horas" mora: o botão nasce colado no número que ele muda —
// controle perto do que ele afeta, sem precisar de rótulo explicando.
function BancoCorrido({ L, banco, mes, podePagar, onFeito }: { L: BancoResumo["ledger"]; banco: BancoResumo; mes: string; podePagar: boolean; onFeito: () => void }) {
  const m = mesDoLedger(L.meses, mes);
  const extra = m.creditoMin;
  return (
    <div className="glass glass-spec" style={{ padding: 18, borderRadius: "var(--r-md)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        {/* O número grande é o SALDO DO BANCO (todos os meses) — é ele que
            responde "quantas horas eu tenho", e é ele que sobrevive à virada do
            mês. O mês vira o recorte pequeno logo abaixo: ninguém abre esta tela
            pra saber quanto agosto rendeu, e sim quanto há guardado. */}
        <div style={{ flex: "none" }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>Saldo do banco</div>
          <div className="stat" style={{ fontSize: 34, fontWeight: 800, color: saldoCor(L.saldoMin), lineHeight: 1.05 }}>{fmtSaldo(L.saldoMin)}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>todos os meses</div>
        </div>
        <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 8 }}>
          {extra > 0 && (
            <PrazoLinha cor="var(--ok)" titulo={`Extra do mês: ${fmtHoras(extra)}`}
              detalhe={m.devidoMin > 0 ? `já descontadas ${fmtHoras(m.devidoMin)} de dias que ficaram devendo` : "a receber ou compensar com dia mais curto"}
              alerta={L.creditoExpiradoMin > 0 ? `${fmtHoras(L.creditoExpiradoMin)} no banco passaram de 3 meses` : ""} />
          )}
          {/* Hora comum e hora com ADICIONAL não valem o mesmo dinheiro — quem
              fecha a folha precisa ver as duas separadas, não só o total. */}
          {(m.creditoEspecialMin ?? 0) > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingLeft: 19 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--indigo)", background: "color-mix(in srgb,var(--indigo) 16%,transparent)", borderRadius: "var(--r-xs)", padding: "1px 7px" }}>especial</span>
              <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
                <strong className="stat" style={{ color: "var(--text)" }}>{fmtHoras(m.creditoEspecialMin)}</strong> de domingo/feriado pago
                {extra - m.creditoEspecialMin > 0 && <> · <strong className="stat" style={{ color: "var(--text)" }}>{fmtHoras(extra - m.creditoEspecialMin)}</strong> comuns</>}
              </span>
            </div>
          )}
          {m.debitoMin > 0 && (
            <PrazoLinha cor="var(--perigo)" titulo={`Deve ${fmtHoras(m.debitoMin)} no mês`}
              detalhe={m.geradoMin > 0 ? `já abatidas ${fmtHoras(m.geradoMin)} de extra` : "prazo de 1 mês pra compensar"}
              alerta={L.debitoVencidoMin > 0 ? `${fmtHoras(L.debitoVencidoMin)} no banco já venceram` : ""} />
          )}
          {m.pagoMin > 0 && (
            <PrazoLinha cor="var(--ok)" titulo={`Pagas em dinheiro: ${fmtHoras(m.pagoMin)}`} detalhe="saíram do banco" alerta="" />
          )}
          {extra === 0 && m.debitoMin === 0 && m.pagoMin === 0 && (
            <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Nada em aberto neste mês — nem a pagar, nem a receber.</div>
          )}
          {/* O mês continua existindo, agora como recorte: é ele que a folha
              paga, então não pode sumir — só deixou de ser o título da tela. */}
          <div style={{ fontSize: 12, color: "var(--text-dim)", borderTop: "1px solid var(--border)", paddingTop: 7 }}>
            {m.debitoMin > 0 ? "A compensar" : "Horas extras"} de {mesLabel(mes)}: <strong className="stat" style={{ color: saldoCor(m.saldoMin) }}>{fmtSaldo(m.saldoMin)}</strong>
            <span style={{ marginLeft: 6 }}>· {m.corrente ? "mês em andamento" : "mês fechado"}</span>
          </div>
        </div>
        {/* Último no JSX (e não flutuando com `order`) pra sair à direita no
            computador e cair sozinho na linha de baixo no celular, onde o
            polegar alcança. Some quando não há crédito — o próprio botão sabe. */}
        {podePagar && <div style={{ marginLeft: "auto", flex: "none" }}><PagarHorasAcao banco={banco} mes={mes} onFeito={onFeito} /></div>}
      </div>
    </div>
  );
}
function PrazoLinha({ cor, titulo, detalhe, alerta }: { cor: string; titulo: string; detalhe: string; alerta: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: cor, flex: "none" }} />
      <strong style={{ fontSize: 14, color: "var(--text)" }}>{titulo}</strong>
      {detalhe && <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>· {detalhe}</span>}
      {alerta && <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--atencao)", background: "color-mix(in srgb,var(--atencao) 16%,transparent)", borderRadius: "var(--r-xs)", padding: "1px 7px", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="alert-triangle" size={12} color="var(--atencao)" /> {alerta}</span>}
    </div>
  );
}

function Calendario({ banco, feriados, gerivel, abrivel, onDiaClick, onToggleFeriado }: { banco: BancoResumo; feriados: Map<string, TipoFeriado>; gerivel: boolean; abrivel: boolean; onDiaClick: (d: DiaBanco) => void; onToggleFeriado: (dia: string) => void }) {
  // Um bloco por mês: o intervalo pode cruzar a virada ("16/07 a 15/08"), e uma
  // grade só, contínua, colocaria 31/07 e 01/08 lado a lado embaixo de rótulos
  // de semana que não são os deles.
  const meses: { mes: string; dias: DiaBanco[] }[] = [];
  for (const d of banco.dias) {
    const m = d.dia.slice(0, 7);
    if (meses[meses.length - 1]?.mes !== m) meses.push({ mes: m, dias: [] });
    meses[meses.length - 1].dias.push(d);
  }
  return (
    <div className="glass" style={{ padding: 16, borderRadius: "var(--r-md)", display: "flex", flexDirection: "column", gap: 14 }}>
      {meses.map(({ mes, dias }) => (
      <div key={mes}>
      {meses.length > 1 && <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-dim)", marginBottom: 6 }}>{mesLabel(mes)}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
        {DOW.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-dim)", paddingBottom: 2 }}>{d}</div>)}
        {Array.from({ length: dias[0]?.dow ?? 0 }).map((_, i) => <div key={"b" + i} />)}
        {dias.map((d) => {
          const num = Number(d.dia.slice(8));
          const feriado = feriados.get(d.dia) ?? null;
          const clicavel = abrivel && d.classe !== "futuro" && d.classe !== "pre";
          return (
            <button key={d.dia} disabled={!clicavel} onClick={() => onDiaClick(d)}
              // O par de compensação viaja no título junto com o resto: sem ele,
              // um feriado trabalhado que virou folga aparecia com saldo ZERO e
              // nenhuma explicação de onde as 8h foram parar.
              title={`${diaLabel(d.dia)} · ${feriado ? FERIADO_LABEL[feriado] : CLASSE_LABEL[d.classe]}${d.trabalhadoMin ? ` · ${fmtHoras(d.trabalhadoMin)}` : ""}${d.saldoMin ? ` · ${fmtSaldo(d.saldoMin)}${d.especial && d.saldoMin > 0 ? " especial" : ""}` : ""}${d.reservadoMin ? ` · ${fmtHoras(d.reservadoMin)} trocadas por folga` : ""}${d.compensacao ? ` · ref. ${d.compensacao.outroDia.slice(8, 10)}/${d.compensacao.outroDia.slice(5, 7)}` : ""}${d.motivo ? ` · ${d.motivo}` : ""}`}
              style={{ aspectRatio: "1 / 1", borderRadius: "var(--r-xs)", padding: 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, position: "relative",
                border: feriado ? `1.5px ${feriado === "troca" ? "dashed" : "solid"} var(--indigo)` : "1px solid var(--border)", cursor: clicavel ? "pointer" : "default",
                background: bgClasse(d.classe), color: d.classe === "futuro" || d.classe === "pre" ? "var(--text-dim)" : "var(--text)", opacity: d.classe === "futuro" || d.classe === "pre" ? 0.4 : 1 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{num}</span>
              {(d.classe === "trabalhado" || d.classe === "parcial") && d.saldoMin !== 0
                ? <span style={{ fontSize: 8.5, fontWeight: 800, color: saldoCor(d.saldoMin) }}>{fmtSaldo(d.saldoMin)}</span>
                : d.trabalhadoMin > 0 ? <span style={{ fontSize: 8.5, opacity: 0.75 }}>{Math.round(d.trabalhadoMin / 6) / 10}h</span>
                : d.classe === "falta" ? <span style={{ fontSize: 8.5, color: "var(--perigo)", fontWeight: 700 }}>falta</span>
                : d.classe === "justificada" ? <span style={{ fontSize: 8.5, color: "var(--info)", fontWeight: 700 }}>justif.</span> : null}
              {d.justificada && <span style={{ position: "absolute", top: 3, right: 3, width: 6, height: 6, borderRadius: 3, background: "var(--info)" }} />}
            </button>
          );
        })}
      </div>
      </div>
      ))}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {([["trabalhado", "Trabalhado"], ["parcial", "Parcial/aberto"], ["falta", "Falta"], ["justificada", "Justificado"], ["folga", "Folga (fds)"], ["feriado", "Feriado"]] as [ClasseDia, string][]).map(([c, l]) => (
          <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-dim)" }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: bgClasse(c), border: `1px solid ${CLASSE_COR[c]}` }} /> {l}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: "var(--text-dim)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, border: "1.5px solid var(--indigo)" }} /> Feriado (extra com adicional)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, border: "1.5px dashed var(--indigo)" }} /> Feriado trocado (extra comum)
        </span>
      </div>
      {gerivel
        ? <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Clique num dia pra <strong>lançar batida</strong>, <strong>justificar</strong> ou <strong>marcar feriado</strong> (feriado vale pra todo mundo).</div>
        : abrivel ? <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Toque num dia pra <strong>pedir justificativa</strong> — atestado da manhã, consulta, as horas que você ficou fora. Dá pra anexar a foto do atestado.</div> : null}
    </div>
  );
}

function LinhaDia({ d, border, abrivel, onClick, style }: { d: DiaBanco; border: boolean; abrivel: boolean; onClick: () => void; style?: CSSProperties }) {
  const aberto = d.classe === "aberto";
  // Só é ALVO quando dá pra abrir o dia. Uma linha que acende ao toque e não
  // faz nada é pior que uma linha inerte: promete uma tela que não vem.
  const alvo = abrivel && d.classe !== "pre";
  const onda = useOnda();
  return (
    <div
      onClick={() => { if (alvo) onClick(); }}
      onPointerDown={alvo ? onda : undefined}
      className={alvo ? "mt-linha mt-anel" : undefined}
      // `style` por último: é por ele que chega o `--mt-i` da `Fila`, e é ele
      // que faz a lista entrar em cascata em vez de toda no mesmo quadro.
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: border ? "1px solid var(--border)" : "none", flexWrap: "wrap", cursor: alvo ? "pointer" : "default", ...style }}>
      <div style={{ width: 96, flex: "none" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", textTransform: "capitalize" }}>{diaLabel(d.dia)}</div>
        {aberto && <div style={{ fontSize: 10.5, color: "var(--atencao)", fontWeight: 700 }}>em aberto</div>}
        {d.classe === "falta" && <div style={{ fontSize: 10.5, color: "var(--perigo)", fontWeight: 700 }}>falta</div>}
        {/* "justificado" sozinho parecia resolvido. O que importa é se as horas
            foram perdoadas ou se continuam devidas. */}
        {d.justificada && <div style={{ fontSize: 10.5, color: d.abonada ? "var(--info)" : "var(--atencao)", fontWeight: 700 }}>{d.abonada ? "abonado" : "justificado · a compensar"}</div>}
      </div>
      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6, minWidth: 140 }}>
        {d.batidas.map((b, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--text)", background: "var(--surface-2)", borderRadius: "var(--r-xs)", padding: "3px 8px" }}>
            <span style={{ width: 7, height: 7, borderRadius: 3, background: TIPO_COR[b.tipo] ?? "var(--text-dim)" }} />
            {TIPO_LABEL[b.tipo] ?? b.tipo} {b.hora}
          </span>
        ))}
        {d.batidas.length === 0 && d.motivo && <span style={{ fontSize: 12, color: "var(--text-dim)", fontStyle: "italic" }}>{d.motivo}</span>}
        {d.batidas.length === 0 && !d.motivo && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>—</span>}
      </div>
      <div style={{ textAlign: "right", minWidth: 92 }}>
        <div className="stat" style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>{fmtHoras(d.trabalhadoMin)}</div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: aberto ? "var(--text-dim)" : saldoCor(d.saldoMin) }}>{aberto ? "—" : fmtSaldo(d.saldoMin)}</div>
        {/* Hora que só devolveu o que a pessoa devia não é hora extra — e sem
            dizer isso a linha parece "ganhei 40 min" num dia que zerou dívida. */}
        {!aberto && !!d.quitadoMin && (
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--info)" }}
               title="Horas devolvidas ao banco — abatem a dívida, não viram hora extra">
            {fmtHoras(d.quitadoMin)} abatendo dívida
          </div>
        )}
        {/* Sem isto o tempo a mais some sem explicação e parece que o ponto não
            chegou. O corte é o teto de 2h do dia da escala, e vale só para a
            sobra depois de quitar a dívida. */}
        {!aberto && !!d.extraCortadoMin && (
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)" }}
               title="Teto de 2h de hora extra por dia (quitar dívida não tem teto)">
            {fmtHoras(d.extraCortadoMin)} acima do teto
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal do dia ────────────────────────────────────────────────────────────
// Dois públicos, um modal. O GESTOR (`gerivel`) vê tudo: batidas, feriado,
// justificativas e ajuste de horas. O COLABORADOR vê só as justificativas do
// próprio dia — é onde ele pede o abono do atestado e anexa a foto. Separar em
// duas telas faria a mesma regra ser escrita duas vezes.
function DiaAcoesModal({ dia, pessoaId, pessoaNome, turno, feriado, busy, gerivel, jornada, onFechar, onMudou, onFeriado }: {
  dia: DiaBanco; pessoaId: string; pessoaNome: string; turno: string[]; feriado: TipoFeriado | null; busy: boolean;
  gerivel: boolean; jornada: JanelaDaJornada;
  onFechar: () => void; onMudou: () => void; onFeriado: (tipo: TipoFeriado | null) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  // .sheet-host/.sheet: no celular vira folha presa embaixo (o padrão da
  // fundação), com rolagem interna — o teclado do "motivo" não empurra mais o
  // botão de salvar pra fora da tela. `dvh` porque `vh` inclui a barra do
  // navegador e o rodapé nascia atrás dela.
  return createPortal(
    <div onClick={onFechar} className="sheet-host" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: "var(--z-modal, 1300)", padding: 24, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 460, maxHeight: "88dvh", overflowY: "auto", borderRadius: "var(--r-md)", padding: 20, background: "var(--bg)", border: "1px solid var(--border)", boxShadow: "0 24px 70px rgba(0,0,0,.55)", marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: "var(--text)", textTransform: "capitalize" }}>{diaLabel(dia.dia)}</h3>
          <BotaoIcone icone="x" titulo="Fechar" onClick={onFechar} />
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "0 0 14px" }}>
          {pessoaNome} · {CLASSE_LABEL[dia.classe]}{dia.trabalhadoMin ? ` · ${fmtHoras(dia.trabalhadoMin)}` : ""}{dia.saldoMin ? ` · ${fmtSaldo(dia.saldoMin)}` : ""}
        </p>

        {/* As batidas vêm PRIMEIRO: quem abre um dia do calendário quase sempre
            quer arrumar a hora que a pessoa entrou ou saiu. Justificar e marcar
            feriado são o caso raro, e ficam logo abaixo. */}
        {gerivel && (
          <div style={{ marginBottom: 16 }}>
            <BatidasDoDia pessoaId={pessoaId} dia={dia.dia} turno={turno} onMudou={onMudou} />
          </div>
        )}

        {/* Feriado — e de qual TIPO. Nos dois ninguém deve a jornada; o que muda
            é a hora de quem TRABALHA no feriado: adicional na folha, ou crédito
            comum que vai ser devolvido como folga noutro dia.

            Só pro gestor: feriado vale pra TODO MUNDO, e uma tela pessoal não é
            lugar de mexer no calendário da empresa inteira. */}
        {gerivel && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Feriado (vale pra todo mundo)</div>
          <GrupoOpcoes cartao desligado={busy} valor={feriado ?? "normal"}
            aoMudar={(v) => onFeriado(v === "normal" ? null : v)}
            opcoes={[
              { valor: "normal", rotulo: "Dia normal", descricao: "Expediente comum — a jornada do dia é cobrada.", cor: "var(--text-dim)" },
              { valor: "folga", rotulo: "Feriado", descricao: "Ninguém deve a jornada. Quem trabalhar gera hora extra ESPECIAL, com adicional na folha (igual domingo).", cor: "var(--indigo)" },
              { valor: "troca", rotulo: "Feriado trocado", descricao: "Ninguém deve a jornada, mas quem trabalhar gera hora extra COMUM — ela some quando a pessoa tirar a folga combinada (ex.: trabalha meio período na quinta e não vem no sábado).", cor: "var(--indigo)" },
            ] as { valor: TipoFeriado | "normal"; rotulo: string; descricao: string; cor: string }[]} />
        </div>
        )}

        {/* ── Justificativas ──────────────────────────────────────────────────
            Era um campo de texto e um "abonar" tudo-ou-nada. Agora é uma lista:
            tipo, recorte de horas, anexo e — pro gestor — a decisão de cada
            pedido. O dia aceita várias porque a vida real tem várias. */}
        <JustificativasDoDia
          pessoaId={pessoaId} dia={dia} jornada={jornada}
          podeDecidir={gerivel} onMudou={onMudou}
        />

        {/* Somar/tirar horas DESTE dia — mesmo componente da aba Registros, aqui
            onde o admin já vê o saldo (não precisa trocar de aba). */}
        {gerivel && (
          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <AjusteHoras pessoaId={pessoaId} dia={dia.dia} nome={pessoaNome} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// As iniciais aqui nasciam na cor de DESTAQUE, e só aqui: a mesma pessoa sem
// foto aparecia colorida no Meu Ponto e cinza em todo o resto. Passou pro
// cinza comum — inicial não é uma ação nem um estado, é um espaço reservado.
function Avatar({ url, nome, big }: { url: string | null; nome: string; big?: boolean }) {
  return <AvatarBase url={url} nome={nome} size={big ? 48 : 40} formato="redondo" />;
}
