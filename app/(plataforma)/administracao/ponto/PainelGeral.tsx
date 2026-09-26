"use client";

// ── Painel Geral do Ponto ────────────────────────────────────────────────────
// Funde o antigo "Agora" com o agregado do banco de horas. A pergunta do gestor
// nunca foi "quem está presente?" isolada — era "o dia está de pé e alguém
// precisa de mim?". Isso morava em duas abas: presença numa, saldo/pendência
// noutra, e nenhuma das duas respondia sozinha.
//
// A tela tem três degraus, nessa ordem: quanto (KPIs) → quem precisa de você
// (faixa de atenção) → o dia inteiro (lista + detalhe de quem está escolhido).
//
// O terceiro degrau é um PAR, não uma tela cheia: a lista à esquerda continua
// visível enquanto o painel da direita fala de uma pessoa. Conferir sete
// pessoas era abrir e fechar gaveta sete vezes, e cada volta perdia a posição
// da rolagem. Numa janela estreita não há coluna pra dar (ver `COM_PAINEL`):
// aí o toque volta a abrir a gaveta.
//
// Cor é reservada. O antigo painel pintava quatro cartões grandes e uma lista
// por situação, então tudo gritava igual e nada saltava. Aqui a cor fica no
// selo do KPI, nas pílulas de status e nos motivos — o resto é texto sobre
// superfície.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { Avatar } from "../../ui/Avatar";
import { Abas } from "../../ui/Abas";
import { Botao } from "../../ui/controles";
import { usePollComRecuo } from "../../ui/usePoll";
import { useMediaQuery } from "../../ui/useMediaQuery";
import { PessoaDrawer, rotuloBatida, type PessoaAlvo } from "./PessoaDrawer";
import { BaterModal } from "./BaterModal";
import { DetalheDoDia, DetalheVazio } from "./DetalheDoDia";
import { PessoaModal } from "../PontoPanel";
import type { StatusHoje, StatusPessoa, Situacao, PontoPessoa } from "@/lib/ponto";
import type { BancoResumo } from "@/lib/banco-horas";

const fmtSaldo = (min: number) => { const s = min < 0 ? "−" : "+"; const a = Math.abs(min); return `${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`; };
const fmtHoras = (min: number) => { const a = Math.max(0, min); return `${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`; };
const minAgoraSp = () => { const t = new Date(Date.now() - 3 * 3600 * 1000); return t.getUTCHours() * 60 + t.getUTCMinutes(); };
const minDoRelogio = (v: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec((v ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};
const emMinutos = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min} min`);
// Busca sem acento: quem procura "leo" no teclado do celular quer achar "Léo".
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : null);

// ── Status de uma pessoa AGORA ───────────────────────────────────────────────
// Situação + horário previsto viram um estado só, com a cor que ele merece.
// "Não bateu" sozinho não dizia se a pessoa estava atrasada ou se o turno nem
// tinha começado — era sempre a pergunta seguinte.
type Tom = "ok" | "atencao" | "perigo" | "neutro";
// `foraDaEscala` é ESTRUTURAL, não o rótulo: quem está de férias mostra
// "Férias", quem folga no feriado mostra o nome do feriado, e os dois precisam
// sair da conta de ausentes do mesmo jeito. Comparar `rotulo === "Folga"` era o
// que fazia a pessoa de férias voltar a ser cobrada assim que ganhou rótulo.
interface Estado { rotulo: string; tom: Tom; detalhe?: string; foraDaEscala?: boolean }
const COR: Record<Tom, string> = { ok: "var(--ok)", atencao: "var(--atencao)", perigo: "var(--perigo)", neutro: "var(--text-dim)" };

export function estadoDe(p: StatusPessoa, agora = minAgoraSp()): Estado {
  const entradaPrev = minDoRelogio(p.entradaPrevista);
  const saidaPrev = minDoRelogio(p.saidaPrevista);
  // Hoje não é dia de trabalho dessa pessoa (sábado de quem não faz sábado,
  // domingo, feriado): não existe atraso nem "não bateu". O horário previsto
  // mora no cadastro e vale todo dia — comparar com o relógio sem olhar o
  // calendário acusava de ATRASADO metade da equipe todo sábado.
  // `expediente` pode faltar em resposta antiga (ou fixture): só folga com `false`.
  if (p.expediente === false && p.situacao === "ausente") {
    // Com motivo, o painel diz POR QUE ("Férias", "Atestado", "Independência do
    // Brasil") em vez do genérico "Folga" — era a pergunta seguinte de todo mundo.
    return p.motivo
      ? { rotulo: p.motivo, tom: "neutro", detalhe: "não trabalha hoje", foraDaEscala: true }
      : { rotulo: "Folga", tom: "neutro", detalhe: "não trabalha hoje", foraDaEscala: true };
  }
  if (p.situacao === "ausente") {
    if (entradaPrev != null && agora < entradaPrev) return { rotulo: "A chegar", tom: "neutro", detalhe: `entra ${p.entradaPrevista}` };
    // Tolerância de 5 min, a mesma do banco de horas — não é atraso antes disso.
    if (entradaPrev != null && agora - entradaPrev > 5) return { rotulo: "Atrasado", tom: "perigo", detalhe: emMinutos(agora - entradaPrev) };
    return { rotulo: "Não bateu", tom: "atencao" };
  }
  if (p.situacao === "almoco") return { rotulo: "Em almoço", tom: "atencao", detalhe: hora(p.ultima) ?? undefined };
  if (p.situacao === "saiu") return { rotulo: "Saiu", tom: "neutro", detalhe: hora(p.ultima) ?? undefined };
  // Presente, mas o turno já acabou há mais de 5 min: ainda não bateu a saída.
  if (saidaPrev != null && agora - saidaPrev > 5) return { rotulo: "Sem bater a saída", tom: "atencao", detalhe: `saída ${p.saidaPrevista}` };
  return { rotulo: "Presente", tom: "ok", detalhe: hora(p.entrada) ?? undefined };
}

function Pilula({ estado }: { estado: Estado }) {
  const c = COR[estado.tom];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, flex: "none",
      fontSize: 11.5, fontWeight: 700, color: c, whiteSpace: "nowrap",
      background: `color-mix(in srgb, ${c} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`,
      borderRadius: 999, padding: "3px 10px",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c, flex: "none" }} />
      {estado.rotulo}
    </span>
  );
}

// ── Filtros da lista ─────────────────────────────────────────────────────────
// Seleção ÚNICA (a fileira com a pílula que viaja), e não chips de marcar: a
// pergunta é sempre "me mostra os atrasados", nunca "atrasados MAIS quem saiu".
type Filtro = "todos" | "pendencias" | "presentes" | "almoco" | "atrasados" | "ausentes" | "saiu" | "folga";

/**
 * A partir de onde o par lista+detalhe existe.
 *
 * O corte é da JANELA, mas a conta é da COLUNA DE CONTEÚDO: o Shell come cerca
 * de 348px (barra lateral + respiro), então 1200px de janela deixam ~850px pro
 * par — 560 pra lista e 285 pro painel. Abaixo disso a lista fica com 440px e a
 * coluna do nome com 100, o que é pior que não ter painel nenhum. Não dá pra
 * usar o corte de 900px do `.duo` da fundação aqui: ele mede a janela, e 1024
 * de janela é só 700 de conteúdo.
 */
const COM_PAINEL = "(min-width: 1200px)";

// ── Painel ───────────────────────────────────────────────────────────────────
export function PainelGeral({ pessoas, podeGerir, onMudouCadastro }: {
  /** Cadastro de ponto (pra abrir "editar" direto do painel/gaveta). */
  pessoas: PontoPessoa[];
  podeGerir: boolean;
  onMudouCadastro: () => void;
}) {
  const [d, setD] = useState<StatusHoje | null>(null);
  const [banco, setBanco] = useState<BancoResumo[] | null>(null);
  const [semTabela, setSemTabela] = useState(false);
  const [aberta, setAberta] = useState<PessoaAlvo | null>(null);
  const [batendoAlvo, setBatendoAlvo] = useState<StatusPessoa | null>(null);
  const [editando, setEditando] = useState<PontoPessoa | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  // Quem o painel da direita está mostrando. `null` = ninguém ainda.
  const [selId, setSelId] = useState<string | null>(null);
  // Sobe a cada batida feita por aqui: é o que faz o painel da direita reler o
  // mês da pessoa em vez de continuar mostrando o dia de antes.
  const [geracao, setGeracao] = useState(0);
  // Coluna de apoio não cabe: aí o toque volta a abrir a gaveta, que é a tela
  // cheia. O MESMO booleano decide o que o toque faz e se a grade é de duas
  // colunas — separar as duas coisas deixava a faixa de 900 a 1200px com a
  // grade aberta e só um filho dentro, ou seja, metade da largura vazia.
  const comPainel = useMediaQuery(COM_PAINEL);

  const loadStatus = useCallback(() => {
    return fetch("/api/ponto/status", { cache: "no-store" }).then((r) => r.json()).then((x) => {
      if (x?.error === "tabela_ausente") { setSemTabela(true); return false; }
      if (x?.pessoas) setD(x);
      return false;
    }).catch(() => false);
  }, []);

  // O banco é uma leitura CARA (todo o histórico de todo mundo). Ele não entra
  // no poll: muda por lançamento, não por minuto. Recarrega ao montar e depois
  // de qualquer ação que mexa em batida ou saldo.
  const loadBanco = useCallback(() => {
    fetch("/api/ponto/banco-horas?escopo=todos", { cache: "no-store" })
      .then((r) => r.json()).then((j) => setBanco(j?.pessoas ?? [])).catch(() => setBanco([]));
  }, []);

  useEffect(() => { loadStatus(); loadBanco(); }, [loadStatus, loadBanco]);
  // 30s pra quem está acompanhando as batidas; recua até 5min na tela parada.
  usePollComRecuo(loadStatus, 30_000, 300_000);

  // Bater ponto por alguém abre o modal em vez de um sim/não: a hora certa quase
  // nunca é "agora" (a pessoa saiu 17:05 e avisou 17:40), e o `confirmar()` só
  // sabia carimbar o instante do clique. Ver `BaterModal`.
  function bater(p: StatusPessoa) {
    setBatendoAlvo(p);
  }

  const bancoPorId = useMemo(() => new Map((banco ?? []).map((b) => [b.pessoaId, b])), [banco]);
  const saldoTime = useMemo(() => (banco ?? []).reduce((s, b) => s + b.saldoMin, 0), [banco]);

  // Ordem da lista: quem precisa de atenção primeiro, depois quem está em campo,
  // depois quem já foi. Dentro de cada grupo, alfabética.
  const PESO: Record<Situacao, number> = { ausente: 0, almoco: 1, presente: 2, saiu: 3 };
  const lista = useMemo(() => {
    const agora = minAgoraSp();
    return [...(d?.pessoas ?? [])]
      .map((p) => ({ p, e: estadoDe(p, agora) }))
      .sort((a, b) => (a.e.tom === "perigo" ? -1 : 0) - (b.e.tom === "perigo" ? -1 : 0)
        || PESO[a.p.situacao] - PESO[b.p.situacao]
        || a.p.nome.localeCompare(b.p.nome));
  }, [d]);

  // ── Atenção prioritária ────────────────────────────────────────────────────
  // Um item = uma pessoa + o motivo mais grave dela. Uma linha por pessoa, não
  // uma por problema: três avisos da mesma pessoa viram três cliques no mesmo
  // lugar.
  const atencao = useMemo(() => {
    const agora = minAgoraSp();
    // `fonte` separa o que a PÍLULA de status já diz ("hoje") do que só o banco
    // sabe ("banco"). Sem isso a linha da lista mostrava "Atrasado 20 min" duas
    // vezes lado a lado — uma na pílula, outra no motivo.
    const itens: { p: StatusPessoa | null; id: string; nome: string; fotoUrl: string | null; motivos: { texto: string; tom: Tom; fonte: "hoje" | "banco" }[] }[] = [];
    const porPessoa = new Map<string, typeof itens[number]>();
    const guarda = (id: string, nome: string, fotoUrl: string | null, p: StatusPessoa | null) => {
      let e = porPessoa.get(id);
      if (!e) { e = { p, id, nome, fotoUrl, motivos: [] }; porPessoa.set(id, e); itens.push(e); }
      else if (!e.p && p) e.p = p;
      return e;
    };
    for (const p of d?.pessoas ?? []) {
      const e = estadoDe(p, agora);
      if (e.tom === "perigo") guarda(p.id, p.nome, p.fotoUrl, p).motivos.push({ texto: `Atrasado ${e.detalhe}`, tom: "perigo", fonte: "hoje" });
      else if (e.rotulo === "Sem bater a saída") guarda(p.id, p.nome, p.fotoUrl, p).motivos.push({ texto: "Sem bater a saída", tom: "atencao", fonte: "hoje" });
    }
    for (const b of banco ?? []) {
      const L = b.ledger; if (!L) continue;
      const p = (d?.pessoas ?? []).find((x) => x.id === b.pessoaId) ?? null;
      const nf = L.faltasNaoJustificadas.length;
      if (nf > 0) guarda(b.pessoaId, b.nome, b.fotoUrl, p).motivos.push({ texto: `${nf} falta(s) sem justificar`, tom: "perigo", fonte: "banco" });
      if (L.debitoVencidoMin > 0) guarda(b.pessoaId, b.nome, b.fotoUrl, p).motivos.push({ texto: `${fmtHoras(L.debitoVencidoMin)} vencidas`, tom: "atencao", fonte: "banco" });
      if (L.creditoExpiradoMin > 0) guarda(b.pessoaId, b.nome, b.fotoUrl, p).motivos.push({ texto: `${fmtHoras(L.creditoExpiradoMin)} expiraram`, tom: "atencao", fonte: "banco" });
    }
    const grave = (m: { tom: Tom }[]) => (m.some((x) => x.tom === "perigo") ? 0 : 1);
    return itens.sort((a, b) => grave(a.motivos) - grave(b.motivos) || b.motivos.length - a.motivos.length || a.nome.localeCompare(b.nome));
  }, [d, banco]);

  // O motivo migrou do bloco antigo pra DENTRO da linha: a lista era a resposta
  // de "quem", e a pessoa tinha que subir de novo pra ler o "por quê".
  const motivosPorId = useMemo(() => new Map(atencao.map((a) => [a.id, a.motivos])), [atencao]);

  // ── Contagem de cada filtro ────────────────────────────────────────────────
  // Sai da lista INTEIRA, não da filtrada: o número na aba é o que existe, e
  // não o que sobrou depois de escolher a própria aba.
  const contas = useMemo(() => ({
    todos: lista.length,
    pendencias: atencao.length,
    presentes: lista.filter((x) => x.p.situacao === "presente").length,
    almoco: lista.filter((x) => x.p.situacao === "almoco").length,
    atrasados: lista.filter((x) => x.e.rotulo === "Atrasado").length,
    ausentes: lista.filter((x) => x.p.situacao === "ausente" && !x.e.foraDaEscala).length,
    saiu: lista.filter((x) => x.p.situacao === "saiu").length,
    folga: lista.filter((x) => x.e.foraDaEscala).length,
  }), [lista, atencao]);

  // Aba vazia é aba que não existe: "Atrasados 0" só ocupa largura no celular.
  // "Todos" fica sempre — é o chão da fileira.
  const abas = useMemo(() => {
    const def: { valor: Filtro; rotulo: string }[] = [
      { valor: "todos", rotulo: "Todos" },
      { valor: "pendencias", rotulo: "Pendências" },
      { valor: "presentes", rotulo: "Presentes" },
      { valor: "almoco", rotulo: "Em almoço" },
      { valor: "atrasados", rotulo: "Atrasados" },
      { valor: "ausentes", rotulo: "Ausentes" },
      { valor: "saiu", rotulo: "Saíram" },
      { valor: "folga", rotulo: "Folga" },
    ];
    return def
      .filter((o) => o.valor === "todos" || contas[o.valor] > 0)
      .map((o) => ({ valor: o.valor, rotulo: o.rotulo, badge: <Conta n={contas[o.valor]} /> }));
  }, [contas]);

  // A aba escolhida pode ZERAR sozinha enquanto a tela está aberta (o atrasado
  // chegou). Sem isto o filtro continuaria valendo numa aba que já sumiu da
  // fileira, e a lista ficaria vazia sem nada explicando por quê.
  const filtroAtivo: Filtro = filtro !== "todos" && contas[filtro] === 0 ? "todos" : filtro;

  // A lista mostra TODO MUNDO — não há corte nem "Ver as 24 pessoas". O corte
  // em 12 existia de quando a lista empurrava a página; hoje ela rola dentro do
  // cartão (`.rh-lista-rola`), então esconder metade do time e cobrar um clique
  // pra ver o resto só escondia gente sem economizar nada. Procurar continua
  // sendo o atalho de quem já sabe o nome, não o único jeito de chegar em quem
  // estava depois da 12ª linha.
  // O filtro vale só pra ESTA lista — os KPIs continuam contando o dia inteiro,
  // senão "Presentes 1 de 1" ao digitar um nome viraria um número mentiroso.
  const filtrada = useMemo(() => {
    const q = norm(busca.trim());
    const porFiltro = lista.filter(({ p, e }) => {
      switch (filtroAtivo) {
        case "pendencias": return motivosPorId.has(p.id);
        case "presentes": return p.situacao === "presente";
        case "almoco": return p.situacao === "almoco";
        case "atrasados": return e.rotulo === "Atrasado";
        case "ausentes": return p.situacao === "ausente" && !e.foraDaEscala;
        case "saiu": return p.situacao === "saiu";
        case "folga": return !!e.foraDaEscala;
        default: return true;
      }
    });
    return q ? porFiltro.filter(({ p }) => norm(p.nome).includes(q)) : porFiltro;
  }, [lista, busca, filtroAtivo, motivosPorId]);

  // O painel da direita nasce CHEIO: quase 300px de "escolha alguém" é buraco,
  // e a primeira da lista é justamente quem mais precisa de atenção (a ordem já
  // é essa). Só vale onde o painel existe — sem coluna quem manda é a gaveta.
  //
  // DERIVADO no render, e não sincronizado num efeito. Efeito roda DEPOIS do
  // paint: a primeira pintada saía com o painel "escolha alguém" (curto) e a
  // lista, que divide a linha da grade com ele, nascia no piso de 360px pra
  // esticar no quadro seguinte. Era o "entrei e ela encolheu". Derivando, o
  // primeiro quadro já sai com a pessoa certa escolhida.
  const selVisivel = comPainel
    ? (selId && filtrada.some((x) => x.p.id === selId) ? selId : filtrada[0]?.p.id ?? null)
    : selId;

  function abrirGaveta(id: string, nome: string, fotoUrl: string | null, p?: StatusPessoa | null, diaInicial?: string) {
    const cad = pessoas.find((x) => x.id === id);
    setAberta({
      id, nome, fotoUrl, diaInicial,
      entradaPrevista: p?.entradaPrevista ?? cad?.entradaPrevista ?? null,
      saidaPrevista: p?.saidaPrevista ?? cad?.saidaPrevista ?? null,
      situacao: p ? <Pilula estado={estadoDe(p)} /> : undefined,
    });
  }

  // Um toque, dois destinos. Onde cabe o par, escolher é preencher a coluna da
  // direita; onde não cabe, escolher é abrir a tela cheia.
  function escolher(id: string, nome: string, fotoUrl: string | null, p?: StatusPessoa | null) {
    if (!comPainel) abrirGaveta(id, nome, fotoUrl, p);
    else setSelId(id);
  }

  if (semTabela) return <div className="glass" style={{ padding: 30, borderRadius: "var(--r-md)", textAlign: "center", color: "var(--text-dim)" }}>Rode o <strong>supabase/ponto.sql</strong> pra ativar o painel.</div>;
  if (!d) return <div style={{ color: "var(--text-dim)", fontSize: 14, padding: 20 }}>Carregando…</div>;

  const r = d.resumo;
  const atrasados = contas.atrasados;
  const emFolga = contas.folga;
  const cadastro = (id: string) => pessoas.find((x) => x.id === id) ?? null;
  // Situação viva de quem está aberto (o poll continua rodando por trás).
  const statusAberto = aberta ? (d?.pessoas ?? []).find((x) => x.id === aberta.id) ?? null : null;
  const sel = selVisivel ? lista.find((x) => x.p.id === selVisivel) ?? null : null;
  const selCad = selVisivel ? cadastro(selVisivel) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Quanto — uma linha, cinco números. No celular vira carrossel com
             encaixe (.kpi-row), então nenhum deles encolhe até virar ilegível.
             168px e não 190: com cinco cartões, a diferença é a fileira fechar
             numa linha só num monitor de 1280 (932px de conteúdo) em vez de
             quebrar 4 + 1 e deixar três quartos da segunda linha vazios. */}
      <div className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 168px), 1fr))", gap: 12 }}>
        <Kpi rotulo="Presentes agora" valor={r.presentes} sub={`de ${r.total} no ponto`} cor="var(--ok)" icone="user-check" />
        <Kpi rotulo="Em almoço" valor={r.almoco} sub={r.saiu > 0 ? `${r.saiu} já saíram` : "voltam ao turno"} cor="var(--atencao)" icone="hourglass-high" />
        {/* Quem está de folga hoje NÃO é ausente — o número que o gestor cobra
            é "quem devia ter batido e não bateu". No sábado esse card mostrava
            a equipe inteira em vermelho. */}
        <Kpi rotulo="Ausentes" valor={r.ausentes} sub={atrasados > 0 ? `${atrasados} atrasado(s)` : emFolga > 0 ? `${emFolga} de folga hoje` : "nenhum atraso"} cor={atrasados > 0 ? "var(--perigo)" : "var(--text-dim)"} icone="photo-question" />
        <Kpi rotulo="Saldo do banco" valor={banco === null ? "…" : fmtSaldo(saldoTime)} sub="a favor − a pagar" cor={saldoTime > 5 ? "var(--ok)" : saldoTime < -5 ? "var(--perigo)" : "var(--text)"} icone="wallet" />
        <Kpi rotulo="Pendências" valor={banco === null ? "…" : atencao.length} sub={atencao.length > 0 ? "faltas, atrasos e horas vencidas" : "nada em aberto"} cor={atencao.length > 0 ? "var(--atencao)" : "var(--text-dim)"} icone="alert-triangle" />
      </div>

      {/* 2. Quem precisa de você. Uma FAIXA, não uma lista: o "por quê" de cada
             pessoa agora mora na linha dela, então aqui basta o aviso e o
             caminho — tocar leva pro filtro que já separa esse grupo.
             Só existe quando existe: painel limpo é informação. */}
      {atencao.length > 0 && filtroAtivo !== "pendencias" && (
        <button type="button" onClick={() => setFiltro("pendencias")} className="ponto-linha"
          style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 8, width: "100%", textAlign: "left",
            minHeight: "var(--tap)", cursor: "pointer", padding: "10px 14px", borderRadius: "var(--r-md)",
            background: "color-mix(in srgb, var(--atencao) 8%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--atencao) 34%, var(--border))",
          }}>
          <Icon name="alert-triangle" size={17} color="var(--atencao)" />
          <span style={{ fontSize: 13, color: "var(--text)", flex: "1 1 200px", minWidth: 0 }}>
            <strong style={{ fontWeight: 800 }}>{atencao.length} pessoa(s)</strong> com pendência hoje
            {" — "}<span style={{ color: "var(--text-dim)" }}>{atencao[0].motivos[0].texto.toLowerCase()}{atencao.length > 1 ? " e outras" : ""}</span>
          </span>
          <span style={{ display: "flex", flex: "none" }}>
            {atencao.slice(0, 5).map((a, i) => (
              <span key={a.id} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: "50%", border: "2px solid var(--surface)", display: "inline-flex" }}>
                <Avatar url={a.fotoUrl} nome={a.nome} size={24} formato="redondo" />
              </span>
            ))}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flex: "none", fontSize: 12.5, fontWeight: 800, color: "var(--atencao)" }}>
            Ver <Icon name="chevron-right" size={15} color="var(--atencao)" />
          </span>
        </button>
      )}

      {/* 3. O dia inteiro. Lista à esquerda, pessoa escolhida à direita.
             A grade só existe quando o painel existe: `.duo-lista` com um filho
             só daria à lista `2fr` de uma grade de `3fr` — a tela ficaria com um
             terço da largura em branco. */}
      <div className={comPainel ? "duo duo-lista" : undefined}>
        {/* `alignContent: "start"` é o que impede a fileira de filtros de INCHAR.
            Medido: nesta coluna, dentro do `.duo-lista`, com o painel da
            direita em 700px e a lista curta (filtro "Presentes", uma pessoa),
            a fileira de abas ia de 22px para 207px.

            Por quê: `.duo` é grid sem `align-items`, então a coluna ESTICA até
            a altura do irmão. Sendo ela própria um grid de linhas automáticas,
            o `align-content: normal` (que vale como `stretch`) reparte a sobra
            ENTRE AS LINHAS. Os botões crescem junto, e a pílula do `Abas` — que
            se mede por `offsetHeight` do botão ativo — vira um bloco roxo de
            quase 400px. Com `start`, cada linha fica do tamanho do conteúdo e a
            sobra vai para o fim, onde não atrapalha.

            Só que a sobra "no fim" era o defeito visual: a lista parava no piso
            de 360px e o painel da direita descia 300px mais — dois cartões de
            alturas diferentes lado a lado, com um buraco embaixo da lista. Com
            as linhas DECLARADAS (`auto auto 1fr`) a sobra vai toda pro cartão
            da lista, que passa a terminar na mesma linha do painel. O `1fr`
            consome o espaço livre antes do `align-content`, então o `start`
            continua ali sem nada pra repartir — a fileira de abas não incha.
            `minmax(0, …)` é o que deixa o cartão encolher e a rolagem interna
            do `.rh-lista-rola` entrar em cena; o piso de 360px continua vindo
            do próprio cartão, no `globals.css`. */}
        <div style={{
          display: "grid", gap: 12, minWidth: 0, alignContent: "start",
          ...(comPainel ? { gridTemplateRows: "auto auto minmax(0, 1fr)" } : null),
        }}>
          <Abas itens={abas} valor={filtroAtivo} onMuda={setFiltro} ariaLabel="Filtrar a equipe" quebra />

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 220px", minWidth: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "0 12px", minHeight: "var(--ctl-md)" }}>
              <Icon name="search" size={15} color="var(--text-dim)" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa…"
                style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "var(--text)", fontFamily: "inherit", fontSize: 13.5, padding: "9px 0" }} />
              {busca && (
                <button onClick={() => setBusca("")} aria-label="Limpar busca"
                  style={{ border: "none", background: "none", cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}>
                  <Icon name="x" size={14} color="var(--text-dim)" />
                </button>
              )}
            </label>
            {busca.trim() && (
              <span style={{ fontSize: 12, color: "var(--text-dim)", flex: "none" }}>
                {filtrada.length} de {lista.length}
              </span>
            )}
          </div>

          {/* A lista rola DENTRO do cartão (`.rh-card-lista` + `.rh-lista-rola`,
              as mesmas peças da lista de Colaboradores). Antes a página inteira
              rolava: clicar em alguém do fim da lista de 21 pessoas abria o
              painel lá em cima, fora da vista, e parecia que nada tinha
              acontecido. Com o teto no cartão, o painel da direita nunca sai da
              tela. Abaixo de 900px a classe não vale — ali a coluna é uma só e
              a página rola, que é o certo no celular. */}
          <div className="rh-card-lista" style={{ borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface)", border: "1px solid var(--border)" }}>
            {/* Quatro colunas, e não seis. A coluna "Entrada" dizia a mesma
                hora que a pílula de status já mostra ao lado ("Presente 08:03"),
                e uma coluna "Status" própria deixava o par lista+detalhe sem
                largura pra nenhum dos dois num monitor de 1280. O status desceu
                pra segunda linha do nome, onde ele tem a largura inteira. */}
            <div className="tab-linha-head" style={{ display: "grid", gridTemplateColumns: `minmax(0,1fr) 92px 72px ${podeGerir ? "116px" : "0px"}`, gap: 10, padding: "10px 14px", background: "var(--surface-2)", fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".03em" }}>
              <span>Pessoa</span><span>Ponto hoje</span><span>Banco</span><span />
            </div>
            <div className="rh-lista-rola">
            {filtrada.map(({ p, e }, i) => {
              const b = bancoPorId.get(p.id);
              // Só o que a pílula NÃO diz: "Atrasado 20 min" na pílula e no
              // motivo ao lado é a mesma frase duas vezes na mesma linha.
              const doBanco = (motivosPorId.get(p.id) ?? []).filter((m) => m.fonte === "banco");
              const escolhida = comPainel && p.id === selVisivel;
              // "Ponto hoje": a janela quando o dia fechou, só a entrada quando
              // ainda está aberto. Um traço até a hora atual mentiria — a pessoa
              // pode estar em almoço.
              const janela = p.entrada ? `${hora(p.entrada)}${p.situacao === "saiu" && p.ultima ? ` – ${hora(p.ultima)}` : ""}` : null;
              return (
                <div key={p.id} className="tab-linha ponto-linha" onClick={() => escolher(p.id, p.nome, p.fotoUrl, p)}
                  aria-current={escolhida ? "true" : undefined}
                  style={{
                    display: "grid", gridTemplateColumns: `minmax(0,1fr) 92px 72px ${podeGerir ? "116px" : "0px"}`, gap: 10,
                    padding: "10px 14px", alignItems: "center", cursor: "pointer",
                    borderTop: i > 0 ? "1px solid var(--border)" : "none",
                    // A escolhida ganha fundo e um traço na borda de dentro: sem
                    // marca nenhuma, o painel da direita parecia falar de uma
                    // pessoa qualquer, não daquela linha.
                    background: escolhida ? "color-mix(in srgb, var(--primary) 10%, transparent)" : undefined,
                    boxShadow: escolhida ? "inset 3px 0 0 0 var(--primary)" : undefined,
                  }}>
                  <span className="tl-titulo" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Avatar url={p.fotoUrl} nome={p.nome} size={34} formato="redondo" />
                    <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{p.nome}</span>
                        {/* Quantos dias do mês pedem conserto (falta, dia incompleto,
                            ponto aberto, justificativa sem decisão). É o que diz em
                            quem clicar sem abrir um por um. */}
                        {b && b.problemas > 0 && (
                          <span title={`${b.problemas} ${b.problemas === 1 ? "dia" : "dias"} com problema este mês`}
                            style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 800, color: "var(--perigo)", background: "color-mix(in srgb, var(--perigo) 14%, transparent)", borderRadius: 999, padding: "1px 7px 1px 5px" }}>
                            <Icon name="alert-triangle" size={11} color="var(--perigo)" />
                            <span className="stat">{b.problemas > 99 ? "99+" : b.problemas}</span>
                          </span>
                        )}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
                        <Pilula estado={e} />
                        {e.detalhe && <span style={{ fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{e.detalhe}</span>}
                        {/* A pendência do BANCO (falta, hora vencida) não cabe em
                            nenhuma outra coluna e é o que muda o que a pessoa vai
                            fazer com a linha. */}
                        {doBanco.slice(0, 2).map((m) => (
                          <span key={m.texto} style={{ fontSize: 10.5, fontWeight: 700, color: COR[m.tom], background: `color-mix(in srgb, ${COR[m.tom]} 14%, transparent)`, borderRadius: 999, padding: "1px 7px", whiteSpace: "nowrap" }}>{m.texto}</span>
                        ))}
                      </span>
                    </span>
                  </span>
                  {/* `.stat` = tabular: a coluna de horários alinha na vertical. */}
                  <span className="stat" data-l="Ponto hoje" style={{ fontSize: 12.5, fontWeight: 700, color: janela ? "var(--text)" : "var(--text-dim)", whiteSpace: "nowrap" }}>{janela ?? "—"}</span>
                  <span className="stat" data-l="Banco" style={{ fontSize: 13, fontWeight: 700, color: !b ? "var(--text-dim)" : b.saldoMin > 5 ? "var(--ok)" : b.saldoMin < -5 ? "var(--perigo)" : "var(--text-dim)" }}>
                    {b ? fmtSaldo(b.saldoMin) : "—"}
                  </span>
                  <span className="tl-acao" onClick={(ev) => ev.stopPropagation()} style={{ display: "flex", justifyContent: "flex-end" }}>
                    {podeGerir && p.situacao !== "saiu" && (
                      <Botao tamanho="sm" icone="clock" onClick={() => bater(p)}>{rotuloBatida(p)}</Botao>
                    )}
                  </span>
                </div>
              );
            })}
            {filtrada.length === 0 && (
              <div style={{ padding: 30, textAlign: "center", color: "var(--text-dim)", fontSize: 13.5 }}>
                {busca.trim() ? `Ninguém com “${busca.trim()}”.` : filtroAtivo !== "todos" ? "Ninguém neste filtro agora." : "Ninguém cadastrado no ponto ainda."}
              </div>
            )}
            </div>
          </div>
        </div>

        {/* A coluna de apoio só é montada onde ela cabe: no estreito o `.duo`
            empilharia o painel EMBAIXO da lista inteira, e ninguém rola 24
            linhas pra ver o detalhe de quem acabou de tocar. */}
        {comPainel && (
          <div className="ponto-lado">{sel ? (
          <DetalheDoDia
            key={sel.p.id}
            pessoaId={sel.p.id}
            nome={sel.p.nome}
            fotoUrl={sel.p.fotoUrl}
            situacao={<Pilula estado={sel.e} />}
            entradaPrevista={sel.p.entradaPrevista ?? selCad?.entradaPrevista ?? null}
            saidaPrevista={sel.p.saidaPrevista ?? selCad?.saidaPrevista ?? null}
            status={sel.p}
            podeGerir={podeGerir}
            rotuloDaBatida={rotuloBatida}
            onBater={bater}
            geracao={geracao}
            onEditar={selCad ? () => setEditando(selCad) : undefined}
            onAbrirTudo={() => abrirGaveta(sel.p.id, sel.p.nome, sel.p.fotoUrl, sel.p)}
            onAbrirDia={(dia) => abrirGaveta(sel.p.id, sel.p.nome, sel.p.fotoUrl, sel.p, dia)}
          />
          ) : <DetalheVazio />}</div>
        )}
      </div>

      {aberta && (
        // O status vem da LISTA, não do instante em que a gaveta abriu: o poll
        // continua rodando por trás, e uma foto congelada faria o botão oferecer
        // "bater entrada" pra quem já bateu (inclusive logo depois da própria
        // batida feita ali dentro).
        <PessoaDrawer
          pessoa={statusAberto ? { ...aberta, situacao: <Pilula estado={estadoDe(statusAberto)} /> } : aberta}
          cadastro={cadastro(aberta.id)}
          status={statusAberto}
          onBater={bater}
          podeGerir={podeGerir}
          onFechar={() => { setAberta(null); loadStatus(); loadBanco(); setGeracao((g) => g + 1); }}
          onMudou={() => { onMudouCadastro(); loadStatus(); loadBanco(); setGeracao((g) => g + 1); }}
        />
      )}

      {batendoAlvo && (
        <BaterModal
          pessoa={batendoAlvo}
          onFechar={() => setBatendoAlvo(null)}
          onGravado={() => { loadStatus(); loadBanco(); setGeracao((g) => g + 1); }}
        />
      )}

      {/* Editar cadastro sai do painel da direita sem passar pela gaveta: no par
          lista+detalhe a gaveta seria uma terceira camada só pra chegar num
          modal que já sabe se virar sozinho. */}
      {editando && (
        <PessoaModal pessoa={editando} onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); onMudouCadastro(); loadStatus(); loadBanco(); setGeracao((g) => g + 1); }} />
      )}
    </div>
  );
}

/** Contagem dentro da aba. Satura em 99+ pela mesma razão do resto do app: um
 *  "247" numa aba empurra as vizinhas pra fora da fileira no celular. */
function Conta({ n }: { n: number }) {
  return (
    <span className="stat" style={{
      fontSize: 11, fontWeight: 800, lineHeight: 1, padding: "3px 6px", borderRadius: 999,
      background: "color-mix(in srgb, currentColor 16%, transparent)", color: "inherit", minWidth: 20, textAlign: "center",
    }}>{n > 99 ? "99+" : n}</span>
  );
}

// ── Cartão de número ─────────────────────────────────────────────────────────
// Selo à esquerda, número à direita. O ícone deixou de ser um enfeite de 14px
// colado no rótulo e virou a âncora do cartão: numa fileira de cinco, é ele que
// o olho usa pra achar "banco" sem ler cinco rótulos.
function Kpi({ rotulo, valor, sub, cor, icone }: { rotulo: string; valor: number | string; sub: string; cor: string; icone: string }) {
  return (
    <div className="glass glass-spec" style={{ padding: "14px 15px", borderRadius: "var(--r-md)", display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
      <span style={{
        display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 12, flex: "none",
        background: `color-mix(in srgb, ${cor} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${cor} 26%, transparent)`,
      }}>
        <Icon name={icone} size={18} color={cor} />
      </span>
      <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rotulo}</span>
        {/* Tracking negativo porque o número é grande: em 26px as cifras leem
            espaçadas demais com o tracking do corpo. */}
        <span className="stat" style={{ fontSize: 26, fontWeight: 800, color: cor, lineHeight: 1.15, letterSpacing: "-0.02em" }}>{valor}</span>
        <span style={{ fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>
      </span>
    </div>
  );
}
