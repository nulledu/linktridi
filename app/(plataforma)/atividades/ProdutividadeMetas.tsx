"use client";

// ── Produtividade & metas ────────────────────────────────────────────────────
// Meta e atividade eram duas abas, e são a MESMA frase: a meta é o alvo, a
// atividade é o tiro. Separadas, "82 peças" não respondia nada — 82 de quantas?
// Aqui o alvo e o realizado ficam no mesmo número.
//
// A tela tem quatro degraus:
//   1. filtro (período + setor) — de que recorte estamos falando. UM, e ele
//      acompanha a rolagem (`.filtro-fixo`)
//   2. quatro números — o dia está de pé?
//   3. duas colunas: quem entregou o quê (a pergunta) | metas, fila e presença
//      (o apoio)
//   4. o quadro operacional, embutido — o trabalho em si
//
// Eram treze blocos numéricos do mesmo tamanho no topo (sete de KPI, quatro de
// médias, mais dois painéis), então nada saltava: com tudo em destaque, nada
// está em destaque. Ficaram quatro. O resto não sumiu — foi pra "análise
// completa", um degrau abaixo, onde se investiga.
//
// E, por um tempo, a tela teve DOIS filtros e DUAS faixas de número: o painel
// de análise embutido trazia os dele junto, logo abaixo dos daqui. A correção
// não foi apagar a segunda cópia e sim tirar o estado de lá — o recorte é
// desta tela, e o painel recebe pronto (`periodo`/`setor`). Duplicata que some
// por deleção volta na próxima feature; a que some por não ter mais dono, não.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { Atividade, Colaborador } from "@/lib/atividades-catalog";
import { toast } from "../Toast";
import type { MetaProgresso } from "@/lib/metas";
import { rotuloDaTaxa } from "@/lib/estoque-qualidade";
import { Icon } from "../Icon";
import { Botao, BotaoIcone } from "../ui/controles";
import { Momento } from "../ui/Momento";
import { useRouter } from "next/navigation";
import { MetaDrawer } from "../metas/MetasClient";
import { PessoaProdutividadeDrawer } from "./PessoaProdutividadeDrawer";
import { Avatar, ComSelo } from "../ui/Avatar";
import { ChipIcone, MEDALHA, TINTA_MEDALHA } from "../ui/ChipIcone";
import { Digitos, Fila, useFileiraQueLevanta } from "../ui/micro";
import { podio, destaques, resumoRapido, type PessoaMedida, type Destaque } from "@/lib/produtividade-destaques";

export type Periodo = "hoje" | "7d" | "30d";
const PERIODOS: [Periodo, string][] = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"]];

/** A meia-noite do recorte, no fuso de São Paulo. Vive aqui fora porque DUAS
 *  coisas precisam dela: o cálculo local e o `?desde=` da qualidade — e as duas
 *  respondendo por recortes diferentes é como a taxa de acerto de "hoje"
 *  acabaria somando a semana inteira. */
export function desdeDe(periodo: Periodo, agora = Date.now()): number {
  const sp = new Date(agora - 3 * 3600 * 1000);
  const off = periodo === "hoje" ? 0 : periodo === "7d" ? 6 : 29;
  return Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() - off, 3, 0, 0);
}

// Eficiência: tempo estimado ÷ tempo real. Acima de 100% = fez mais rápido que
// o previsto. As faixas são as mesmas do resto do sistema.
export const corEficiencia = (e: number | null) => (e == null ? "var(--text-dim)" : e >= 100 ? "var(--ok)" : e >= 70 ? "var(--atencao)" : "var(--perigo)");
const fmtMin = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min}min`);

export interface LinhaProdutividade {
  id: string; nome: string; setor: string;
  concluidas: number; abertas: number; pecas: number;
  mediaMin: number | null; eficiencia: number | null;
  meta: MetaProgresso | null;
  fotoUrl?: string | null;
  /** Qualidade do QC (`estoque_conferencias`), quando a pessoa foi conferida.
   *  `acerto: null` é "ninguém conferiu ainda" — nunca "errou tudo". */
  acerto?: number | null;
  retrabalhos?: number;
  conferencias?: number;
}

export function ProdutividadeMetas({ colaboradores, atividades, metas, erpUsers, podeGerir }: {
  colaboradores: Colaborador[];
  atividades: Atividade[];
  /** Sem uso desde que o quadro de Atividades saiu de Pessoas (11/09/2026);
   *  fica opcional pra quem ainda passa. */
  produtos?: { nome: string; tipo?: string }[];
  metas: MetaProgresso[];
  erpUsers: { id: string; nome: string }[];
  podeGerir: boolean;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [setor, setSetor] = useState("");        // "" = todos
  const [novaMeta, setNovaMeta] = useState(false);
  const [listaMetas, setListaMetas] = useState(metas);
  const [aberta, setAberta] = useState<LinhaProdutividade | null>(null);
  // O quadro de Atividades saiu de Pessoas (11/09/2026) — era dele a lista
  // viva. Agora os números são a foto do servidor, refeita pelo "Atualizar"
  // (`router.refresh` relê a fronteira de Suspense do slot).
  const router = useRouter();
  const [lista, setLista] = useState<Atividade[]>(atividades);
  useEffect(() => { setLista(atividades); }, [atividades]);
  const [atualizando, iniciar] = useTransition();

  // Presença: mora aqui porque é um cartão da coluna de apoio. Antes vivia
  // dentro do painel de análise, três telas abaixo do lugar onde a pergunta
  // "quem está aí agora?" é feita.
  const [pres, setPres] = useState<{ presentes: number; almoco: number; saiu: number; ausentes: number } | null>(null);
  // Qualidade do time — UMA ida pro recorte inteiro, não uma por pessoa. Sem
  // acesso à área "colaboradores" a rota responde 403 e o mapa fica vazio: a
  // tela perde as colunas de acerto, e não ganha zeros vermelhos na ficha de
  // quem pode ter quarenta conferências certas.
  type Qual = Record<string, { acerto: number | null; total: number; certos: number; errados: number }>;
  const [qual, setQual] = useState<Qual>({});
  const carregarPresenca = useCallback(() => {
    fetch("/api/ponto/status").then((r) => r.json()).then((d) => { if (d?.resumo) setPres(d.resumo); }).catch(() => {});
  }, []);
  useEffect(() => { carregarPresenca(); }, [carregarPresenca]);
  useEffect(() => {
    let vivo = true;
    const desde = new Date(desdeDe(periodo)).toISOString();
    fetch(`/api/estoque/score/equipe?desde=${encodeURIComponent(desde)}`)
      .then((r) => (r.ok ? r.json() : { porPessoa: {} }))
      .then((d) => { if (vivo) setQual(d?.porPessoa ?? {}); })
      .catch(() => { if (vivo) setQual({}); });
    return () => { vivo = false; };
  }, [periodo]);
  function atualizar() {
    carregarPresenca();
    iniciar(() => router.refresh());
  }

  const setorDe = useMemo(() => {
    const m = new Map(colaboradores.map((c) => [c.id, c.departamento || c.setor || "—"]));
    return (id: string | null) => (id && m.get(id)) || "—";
  }, [colaboradores]);
  const fotoDe = useMemo(() => {
    const m = new Map(colaboradores.map((c) => [c.id, c.fotoUrl ?? null]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [colaboradores]);
  const setores = useMemo(
    () => [...new Set(colaboradores.map((c) => c.departamento || c.setor || "").filter(Boolean))].sort(),
    [colaboradores],
  );

  const dados = useMemo(() => {
    const agora = Date.now();
    const desde = desdeDe(periodo, agora);
    const durMin = (a: Atividade) => (a.iniciada_at && a.concluida_at ? (Date.parse(a.concluida_at) - Date.parse(a.iniciada_at)) / 60000 : null);

    const base = setor ? lista.filter((a) => setorDe(a.para_id) === setor) : lista;
    const noPeriodo = base.filter((a) => a.status === "concluida" && a.concluida_at && Date.parse(a.concluida_at) >= desde);
    const emAndamento = base.filter((a) => a.status === "em_andamento" && a.iniciada_at);
    // A fila: o que está esperando alguém pegar (pool) e o que já tem dono mas
    // ainda não foi aceito. Eram dois dos oito mini-cards da faixa duplicada.
    const poolPend = base.filter((a) => a.status === "pendente" && a.pool && !a.para_id);
    const poolUrg = poolPend.filter((a) => a.urgente);
    const dirigidasPend = base.filter((a) => a.status === "pendente" && !!a.para_id);
    // Gargalo = passou do tempo estimado, ou está impedida (alguém reportou que
    // travou). As duas coisas param a esteira do mesmo jeito.
    const atrasadas = emAndamento.filter((a) => a.tempo_estimado_min && agora - Date.parse(a.iniciada_at as string) > a.tempo_estimado_min * 60000);
    const impedidas = base.filter((a) => a.impedida && a.status !== "concluida");
    const gargalos = new Set([...atrasadas, ...impedidas].map((a) => a.id)).size;

    const pecas = noPeriodo.reduce((n, a) => n + (a.quantidade_feita || 0), 0);
    let real = 0, estim = 0, comTempo = 0;
    for (const a of noPeriodo) { const d = durMin(a); if (d && d > 0) { real += d; estim += a.tempo_estimado_min || 0; comTempo++; } }
    const mediaMin = comTempo > 0 ? Math.round(real / comTempo) : 0;
    const eficiencia = real > 0 ? Math.round((estim / real) * 100) : null;

    // Progresso das metas do recorte: média do quanto cada meta andou (teto em
    // 100 por meta, senão uma meta estourada esconde três paradas).
    const metasDoSetor = listaMetas.filter((m) => !setor || (m.setor || "Geral") === setor);
    const progresso = metasDoSetor.length > 0
      ? Math.round(metasDoSetor.reduce((s, m) => s + Math.min(100, m.pct), 0) / metasDoSetor.length)
      : null;
    const batidas = metasDoSetor.filter((m) => m.bateu).length;

    // Uma linha por pessoa: concluídas, abertas, ritmo e a meta individual dela.
    const porPessoa = new Map<string, LinhaProdutividade & { real: number; estim: number; nTempo: number }>();
    const pega = (id: string, nome: string) => {
      let p = porPessoa.get(id);
      if (!p) {
        const q = qual[id];
        p = { id, nome, setor: setorDe(id), concluidas: 0, abertas: 0, pecas: 0, mediaMin: null, eficiencia: null,
              meta: listaMetas.find((m) => m.colaborador_id === id) ?? null, fotoUrl: fotoDe(id),
              acerto: q?.acerto ?? null, retrabalhos: q?.errados ?? 0, conferencias: q?.total ?? 0,
              real: 0, estim: 0, nTempo: 0 };
        porPessoa.set(id, p);
      }
      return p;
    };
    for (const a of noPeriodo) {
      if (!a.para_id) continue;
      const p = pega(a.para_id, a.para_nome || "—");
      p.concluidas++; p.pecas += a.quantidade_feita || 0;
      const d = durMin(a);
      if (d && d > 0) { p.real += d; p.estim += a.tempo_estimado_min || 0; p.nTempo++; }
    }
    for (const a of base) {
      if (!a.para_id || a.status === "concluida") continue;
      pega(a.para_id, a.para_nome || "—").abertas++;
    }
    const linhas = [...porPessoa.values()].map((p) => ({
      ...p,
      mediaMin: p.nTempo > 0 ? Math.round(p.real / p.nTempo) : null,
      eficiencia: p.real > 0 ? Math.round((p.estim / p.real) * 100) : null,
    })).sort((a, b) => b.concluidas - a.concluidas || b.pecas - a.pecas || a.nome.localeCompare(b.nome));

    // Qualidade AGREGADA do recorte: só de quem aparece na tabela, senão o
    // número do topo fala de um time e a lista de baixo mostra outro (o filtro
    // por setor existe justamente pra recortar).
    let certos = 0, conferidos = 0, retrabalhos = 0;
    for (const l of linhas) { certos += Math.max(0, (l.conferencias ?? 0) - (l.retrabalhos ?? 0)); conferidos += l.conferencias ?? 0; retrabalhos += l.retrabalhos ?? 0; }
    const acertoGeral = conferidos > 0 ? certos / conferidos : null;
    const ativos = linhas.filter((l) => l.concluidas > 0 || l.abertas > 0).length;

    const medidas: PessoaMedida[] = linhas.map((l) => ({
      id: l.id, nome: l.nome, setor: l.setor, fotoUrl: l.fotoUrl,
      concluidas: l.concluidas, pecas: l.pecas, mediaMin: l.mediaMin,
      acerto: l.acerto ?? null, retrabalhos: l.retrabalhos ?? 0, conferencias: l.conferencias ?? 0,
    }));

    return { noPeriodo, pecas, mediaMin, eficiencia, gargalos, atrasadas, impedidas, progresso, batidas, metasDoSetor, linhas,
             emAndamento, poolPend, poolUrg, dirigidasPend,
             acertoGeral, conferidos, retrabalhos, ativos,
             podio: podio(medidas), destaques: destaques(medidas), resumo: resumoRapido(medidas) };
  }, [lista, listaMetas, periodo, setor, setorDe, fotoDe, qual]);

  const rotulo = periodo === "hoje" ? "hoje" : periodo === "7d" ? "7 dias" : "30 dias";

  // Ninguém conferido no recorte = as três colunas de qualidade não têm o que
  // dizer. Elas SOMEM em vez de repetir "— — Sem conferências" em cada linha:
  // vinte vezes a mesma frase é ruído que faz a tabela parecer quebrada, e a
  // razão é uma só — cabe ser dita uma vez, embaixo do cabeçalho.
  const temQualidade = dados.conferidos > 0;

  // `minmax(min(100%, 120px), …)` e não `minmax(120px, …)`: mínimo fixo é
  // largura que a faixa não negocia. Aqui a `.tab-linha` vira cartão antes de
  // apertar, mas a regra vale pro dia em que ela não virar.
  const GRID = temQualidade
    ? "minmax(0,1.7fr) minmax(min(100%, 96px), 1fr) 92px 72px 78px 96px 104px 112px"
    : "minmax(0,1.7fr) minmax(min(100%, 96px), 1fr) 92px 72px 104px";

  // Um só lugar onde as ações da tela são escritas — a barra as põe à direita
  // no computador, e a linha logo abaixo as põe no celular.
  const acoes = (
    <>
      {/* "Atualizar" subiu do painel de análise pra cá: é ação da TELA inteira,
          não do último bloco dela. Só ícone porque é utilitário — com rótulo,
          os três botões não cabiam na mesma linha nem no computador. */}
      <BotaoIcone icone="refresh" titulo="Atualizar os dados da tela" onClick={atualizar} carregando={atualizando} />
      {/* "Nova atividade" saiu junto com o quadro (11/09/2026): atribuir é da
          área Atividades, no Operacional. */}
      {podeGerir && <Botao icone="target" onClick={() => setNovaMeta(true)}>Nova meta</Botao>}
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1 · Filtro — um só, pra tudo que está abaixo dele, e ele ACOMPANHA a
             rolagem. Filtro que sai de vista é filtro que alguém recola mais
             abaixo; era exatamente isso que estava acontecendo aqui. */}
      <div className="glass filtro-fixo" style={{ borderRadius: "var(--r-md)", padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {/* `0 1 auto`, não `1 1 260px`: com `grow` a fileira de chips esticava
            até a borda e empurrava os três botões pra uma segunda linha vazia
            mesmo quando os dois grupos cabiam juntos. E `overflow-x` também no
            desktop — a fundação só faz a faixa rolar abaixo de 900px, então
            entre 900 e 1200 com muitos setores os chips vazavam da barra. */}
        <div className="tab-strip" style={{ gap: 7, flex: "0 1 auto", minWidth: 0, overflowX: "auto" }}>
          {PERIODOS.map(([k, lb]) => (
            <button key={k} type="button" className="hr-chip" aria-pressed={periodo === k} onClick={() => setPeriodo(k)}>{lb}</button>
          ))}
          {setores.length > 0 && <span style={{ width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 3px", flex: "none" }} />}
          {setores.length > 0 && (
            <button type="button" className="hr-chip" aria-pressed={!setor} onClick={() => setSetor("")}>Todos os setores</button>
          )}
          {setores.map((st) => (
            <button key={st} type="button" className="hr-chip" aria-pressed={setor === st} onClick={() => setSetor(st === setor ? "" : st)}>{st}</button>
          ))}
        </div>
        {/* No computador as ações moram DENTRO da barra. No celular não: os
            três somam mais que 320px, caíam pra uma segunda e terceira linha e
            a barra — que é fixa — passava a comer metade da tela pra sempre.
            O que precisa estar sempre ao alcance enquanto se rola é o RECORTE;
            criar meta/atividade é uma decisão, não um acompanhamento. */}
        <span className="desk-only" style={{ display: "flex", gap: 8, marginLeft: "auto" }}>{acoes}</span>
      </div>
      <span className="mob-only-flex" style={{ display: "none", gap: 8, flexWrap: "wrap" }}>{acoes}</span>

      {/* 2 · Os quatro números do dia. Eram "Peças / Eficiência / Tempo médio /
             Gargalos" — três deles respondiam sobre a MÉDIA de um time cujo
             tamanho não estava em lugar nenhum, e nenhum falava de qualidade,
             que é o assunto que devolve trabalho pra fila. Peças continua na
             tabela (coluna), eficiência virou a cor do tempo médio de cada
             pessoa, e gargalo já era linha do resumo operacional. */}
      <div className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12 }}>
        <Kpi icone="circle-check" rotulo={`Concluídas · ${rotulo}`} valor={dados.noPeriodo.length} cor="var(--text)"
          sub={dados.pecas > 0 ? `${dados.pecas} peça(s)` : "atividades"} />
        <Kpi icone="users" rotulo="Colaboradores ativos" valor={dados.ativos} cor="var(--text)"
          sub={dados.ativos === 1 ? "pessoa com atividade" : "pessoas com atividade"} />
        <Kpi icone="target" rotulo="Taxa de acerto" cor={corDaTaxa(dados.acertoGeral)}
          valor={dados.acertoGeral == null ? "—" : `${Math.round(dados.acertoGeral * 100)}%`}
          sub={dados.conferidos > 0 ? `${dados.conferidos} conferência(s)` : "sem conferências"} />
        {/* "0 · nada voltou pra refazer" era uma AFIRMAÇÃO tirada da ausência
            de dado: com o QC desligado, ou sem a área "colaboradores", o mapa
            de qualidade chega vazio e a tela dizia que o dia tinha saído
            impecável. Zero conferência não é zero retrabalho — é silêncio. */}
        <Kpi icone="refresh" rotulo="Retrabalhos"
          valor={temQualidade ? dados.retrabalhos : "—"}
          cor={temQualidade && dados.retrabalhos > 0 ? "var(--perigo)" : "var(--text-dim)"}
          sub={!temQualidade ? "sem conferências" : dados.retrabalhos > 0 ? `no recorte de ${rotulo}` : "nada voltou pra refazer"} />
      </div>

      {/* 3 · O pódio e os destaques. A tabela COMPARA, mas não APONTA: quem leu
             as vinte linhas sabe quem puxou o dia; quem passou os olhos, não.
             Aqui a leitura já vem feita — e feita com o que existe: sem
             conferência não há cartão de acerto, e num dia sem retrabalho
             nenhum não há "ponto de atenção" (eleger o pior de um dia impecável
             é acusar alguém de nada). */}
      <div className="duo" style={{ gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)", alignItems: "start" }}>
        <Cartao icone="trophy" titulo="Ranking do dia">
          {dados.podio.length === 0
            ? <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Ninguém concluiu atividade neste recorte ainda.</div>
            : <Podio pessoas={dados.podio} onAbrir={(id) => setAberta(dados.linhas.find((l) => l.id === id) ?? null)} />}
        </Cartao>

        {/* `Fila` carimba o índice em cada filho e a fundação escalona a
            entrada: os quatro destaques sobem em cascata em vez de aparecerem
            todos no mesmo quadro. Eles são quatro frases sobre pessoas
            diferentes — entrar em bloco faz o olho tratar como uma coisa só. */}
        <Fila style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dados.destaques.map((d) => (
            <CartaoDestaque key={d.key} d={d} onAbrir={() => setAberta(dados.linhas.find((l) => l.id === d.pessoa.id) ?? null)} />
          ))}
          {dados.destaques.length === 0 && (
            <Cartao icone="star" titulo="Destaques">
              <div style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.45 }}>
                Sem atividade concluída no recorte — os destaques aparecem sozinhos assim que o dia começar a andar.
              </div>
            </Cartao>
          )}
        </Fila>
      </div>

      {/* 4 · Quem entregou o quê. Cartão por pessoa virava uma parede de
             quadrados idênticos: dez números cada, e a comparação — que é a
             pergunta — exigia ler um por um. Na tabela a coluna compara sozinha. */}
      <div style={{ borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 16px 10px" }}>
          <Icon name="users" size={15} color="var(--text-dim)" />
          <strong style={{ fontSize: 12.5, color: "var(--text)", letterSpacing: "-0.01em" }}>Desempenho por colaborador</strong>
        </div>
        <div className="tab-linha-head" style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "10px 16px", background: "var(--surface-2)", fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".03em" }}>
          <span>Colaborador</span><span>Setor</span><span>Concluídas</span><span>Peças</span>
          {temQualidade && <><span>Acerto</span><span>Retrabalho</span></>}
          <span>Tempo médio</span>
          {temQualidade && <span>Status</span>}
        </div>
        {!temQualidade && dados.linhas.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", fontSize: 11.5, color: "var(--text-dim)", background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
            <Icon name="info-circle" size={13} color="var(--text-dim)" />
            Sem conferência de qualidade neste recorte — acerto, retrabalho e status aparecem quando o QC registrar as primeiras caixas.
          </div>
        )}
        {dados.linhas.map((l) => (
          // Linha de tabela que abre uma ficha é um BOTÃO: sem `role`/`tabIndex`
          // ela não recebe foco, não responde a Enter e não anuncia que é
          // clicável — quem navega por teclado não tinha como abrir ninguém. O
          // `role="button"` ainda traz de brinde a pressão da fundação.
          <div key={l.id} className="tab-linha ponto-linha" role="button" tabIndex={0}
            aria-label={`Abrir a ficha de ${l.nome}`}
            onClick={() => setAberta(l)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAberta(l); } }}
            style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "10px 16px", alignItems: "center", cursor: "pointer", borderTop: "1px solid var(--border)" }}>
            <span className="tl-titulo" style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <Avatar url={l.fotoUrl} nome={l.nome} size={28} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nome}</span>
                {/* A meta perdeu a coluna própria, não o lugar: ela é sobre
                    ESTA pessoa, então mora debaixo do nome dela. */}
                {l.meta && <BarraMeta m={l.meta} />}
              </span>
            </span>
            <span data-l="Setor" style={{ fontSize: 12.5, color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.setor}</span>
            <span className="stat" data-l="Concluídas" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
              {l.concluidas}{l.abertas > 0 && <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 400 }}> +{l.abertas}</span>}
            </span>
            <span className="stat" data-l="Peças" style={{ fontSize: 13.5, color: "var(--text-dim)" }}>{l.pecas || "—"}</span>
            {temQualidade && <>
              <span className="stat" data-l="Acerto" title={(l.conferencias ?? 0) > 0 ? `${l.conferencias} conferência(s)` : "sem conferências"}
                style={{ fontSize: 13.5, fontWeight: 700, color: corDaTaxa(l.acerto ?? null) }}>
                {l.acerto == null ? "—" : `${Math.round(l.acerto * 100)}%`}
              </span>
              {/* Zero conferência não é zero retrabalho: quem não foi conferido
                  fica com "—", e não com um zero que se lê como elogio. */}
              <span className="stat" data-l="Retrabalho" style={{ fontSize: 13.5, fontWeight: 700, color: (l.retrabalhos ?? 0) > 0 ? "var(--perigo)" : "var(--text-dim)" }}>
                {(l.conferencias ?? 0) > 0 ? (l.retrabalhos ?? 0) : "—"}
              </span>
            </>}
            {/* A eficiência (estimado ÷ realizado) perdeu a coluna e virou a COR
                deste número: o tempo médio já é a mesma pergunta, e duas colunas
                pra ela é o que fazia a tabela não caber. */}
            <span className="stat" data-l="Tempo médio" title={l.eficiencia != null ? `Eficiência: ${l.eficiencia}% (estimado ÷ realizado)` : "sem tempo estimado"}
              style={{ fontSize: 13, fontWeight: 600, color: corEficiencia(l.eficiencia) }}>
              {l.mediaMin != null ? fmtMin(l.mediaMin) : "—"}
            </span>
            {temQualidade && <span data-l="Status"><PilulaStatus acerto={l.acerto ?? null} conferencias={l.conferencias ?? 0} /></span>}
          </div>
        ))}
        {dados.linhas.length === 0 && (
          <Momento icone="users" titulo="Nenhuma atividade no período"
            texto={`Ninguém concluiu nem tem atividade aberta ${periodo === "hoje" ? "hoje" : `nos últimos ${rotulo}`}${setor ? ` em ${setor}` : ""}.`} />
        )}
      </div>

      {/* 5 · O resumo falado. É a MESMA informação dos cartões de cima, dita
             como um gerente diria em voz alta — é o que a pessoa lê quando não
             vai ler a tabela. Some inteiro quando não há o que dizer. */}
      {dados.resumo.length > 0 && (
        <div className="glass glass-spec" style={{ borderRadius: "var(--r-md)", padding: "13px 15px", display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 240px), 1fr))`, gap: 14, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <Icon name="bolt" size={15} color="var(--text-dim)" />
            <strong style={{ fontSize: 12.5, color: "var(--text)", letterSpacing: "-0.01em" }}>Resumo rápido</strong>
          </div>
          {dados.resumo.map((f) => (
            <div key={f.titulo} style={{ display: "flex", alignItems: "flex-start", gap: 9, minWidth: 0 }}>
              <ChipIcone icone={f.icone} tom={f.tom} size={30} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--text)", lineHeight: 1.35 }}>{f.titulo}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.35 }}>{f.texto}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 6 · O apoio: metas, estado da fila e presença. Ficava numa coluna ao
             lado da tabela e empurrava os nomes pra meia largura; aqui os três
             dividem a linha, com a mesma anatomia. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12, alignItems: "start" }}>
        <MetasDoSetor metas={dados.metasDoSetor} progresso={dados.progresso} batidas={dados.batidas}
          podeGerir={podeGerir} onNova={() => setNovaMeta(true)}
          onRemover={(id) => {
            // Devolve quem desfaz: se o servidor recusar, a meta volta pro MESMO lugar.
            let antes: MetaProgresso[] = [];
            setListaMetas((p) => { antes = p; return p.filter((m) => m.id !== id); });
            return () => setListaMetas((p) => (p.some((m) => m.id === id) ? p : antes));
          }} />

        <Cartao icone="list-check" titulo="Resumo operacional">
          <Linha cor="var(--ok)" rotulo={`Concluídas · ${rotulo}`} valor={dados.noPeriodo.length} />
          <Linha cor="var(--primary-texto, var(--primary))" rotulo="Em andamento" valor={dados.emAndamento.length} />
          <Linha cor="var(--atencao)" rotulo="Na fila (pool)" valor={dados.poolPend.length}
            nota={dados.poolUrg.length > 0 ? `${dados.poolUrg.length} urgente(s)` : undefined} />
          <Linha cor="var(--text-dim)" rotulo="Aguardando aceite" valor={dados.dirigidasPend.length} />
          <Linha cor="var(--perigo)" rotulo="Atrasadas" valor={dados.atrasadas.length} destaque={dados.atrasadas.length > 0} />
          <Linha cor="var(--perigo)" rotulo="Impedidas" valor={dados.impedidas.length} destaque={dados.impedidas.length > 0} />
        </Cartao>

        <Cartao icone="users" titulo="Presença agora">
          {pres ? (
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", paddingTop: 2 }}>
              <Presente cor="var(--ok)" label="Presentes" n={pres.presentes} />
              <Presente cor="var(--atencao)" label="Almoço" n={pres.almoco} />
              <Presente cor="var(--text-dim)" label="Fora" n={pres.saiu + pres.ausentes} />
            </div>
          ) : <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>—</div>}
        </Cartao>
      </div>

      {novaMeta && (
        <MetaDrawer colaboradores={erpUsers} onFechar={() => setNovaMeta(false)}
          onCriada={(m) => { setListaMetas((p) => [m, ...p]); setNovaMeta(false); }} />
      )}
      {aberta && (
        <PessoaProdutividadeDrawer
          linha={aberta} atividades={atividades} metas={listaMetas.filter((m) => m.colaborador_id === aberta.id)}
          periodo={periodo} onFechar={() => setAberta(null)}
        />
      )}
    </div>
  );
}

// ── Coluna de apoio ──────────────────────────────────────────────────────────
// Uma anatomia só pros três cartões: ícone + título, e o conteúdo em linhas
// rótulo→número alinhadas à direita. O olho desce pela mesma coluna de dígitos
// nos três, em vez de reaprender o desenho a cada bloco.
function Cartao({ icone, titulo, extra, children }: { icone: string; titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass glass-spec" style={{ borderRadius: "var(--r-md)", padding: "13px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, minWidth: 0 }}>
        <Icon name={icone} size={15} color="var(--text-dim)" />
        <strong style={{ fontSize: 12.5, color: "var(--text)", letterSpacing: "-0.01em" }}>{titulo}</strong>
        {extra && <span style={{ marginLeft: "auto", flex: "none" }}>{extra}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function Linha({ cor, rotulo, valor, nota, destaque }: { cor: string; rotulo: string; valor: number; nota?: string; destaque?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, minWidth: 0 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: cor, flex: "none" }} />
      <span style={{ color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rotulo}</span>
      {nota && <span style={{ flex: "none", fontSize: 10.5, fontWeight: 800, color: "var(--perigo)" }}>{nota}</span>}
      <span className="stat" style={{ marginLeft: "auto", flex: "none", fontSize: 14, fontWeight: 800, color: destaque ? cor : "var(--text)" }}>{valor}</span>
    </div>
  );
}

function Presente({ cor, label, n }: { cor: string; label: string; n: number }) {
  return (
    <div>
      <div className="stat" style={{ fontSize: 22, fontWeight: 800, color: cor, lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{label}</div>
    </div>
  );
}

// Metas do setor: o percentual agregado é o TÍTULO do bloco, não um quinto
// KPI lá em cima — ele só quer dizer alguma coisa ao lado das barras que o
// formam. Barras finas: são a régua de um número que está na outra coluna,
// não o assunto principal da tela.
function MetasDoSetor({ metas, progresso, batidas, podeGerir, onNova, onRemover }: {
  metas: MetaProgresso[]; progresso: number | null; batidas: number;
  podeGerir: boolean; onNova: () => void; onRemover: (id: string) => () => void;
}) {
  const daEquipe = metas.filter((m) => !m.colaborador_id);
  const [verTodas, setVerTodas] = useState(false);
  const visiveis = verTodas ? daEquipe : daEquipe.slice(0, 5);

  async function remover(m: MetaProgresso) {
    const desfazer = onRemover(m.id);
    const r = await fetch(`/api/metas?id=${m.id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) {
      desfazer();
      toast.erro(`Não foi possível excluir a meta "${m.titulo}". Ela continua valendo.`);
    }
  }

  const corProg = progresso == null ? "var(--text-dim)" : progresso >= 100 ? "var(--ok)" : progresso >= 70 ? "var(--atencao)" : "var(--perigo)";

  return (
    <Cartao icone="target" titulo="Metas do setor"
      extra={<span className="stat" style={{ fontSize: 13.5, fontWeight: 800, color: corProg }}>
        {progresso == null ? "—" : `${progresso}%`}
        {daEquipe.length > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)" }}> · {batidas}/{metas.length}</span>}
      </span>}>
      {daEquipe.length === 0 && (
        <div style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.45 }}>
          Nenhuma meta de equipe ativa neste recorte.
          {podeGerir && <> <button onClick={onNova} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--primary-texto, var(--primary))", fontWeight: 700, cursor: "pointer" }}>Criar a primeira.</button></>}
        </div>
      )}
      {visiveis.map((m) => {
        const cor = m.bateu ? "var(--ok)" : m.pct >= 70 ? "var(--atencao)" : "var(--primary-texto, var(--primary))";
        return (
          <div key={m.id} style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12.5, minWidth: 0 }}>
              <span title={`${m.titulo} · ${m.setor} · ${m.janelaLabel || m.periodicidade}`}
                style={{ fontWeight: 700, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.titulo}</span>
              <span className="stat" style={{ marginLeft: "auto", flex: "none", fontSize: 12, color: "var(--text-dim)" }}>
                <strong style={{ color: "var(--text)" }}>{m.atual}</strong>/{m.alvo}
              </span>
              <span className="stat" style={{ flex: "none", fontSize: 12, fontWeight: 800, color: cor, minWidth: 34, textAlign: "right" }}>{m.pct}%</span>
              {podeGerir && (
                // SEM `min-height` inline: a fundação dá 44px ao botão de
                // ícone no celular, e inline venceria a folha de estilo na
                // mesma propriedade — foi assim que este alvo mediu 26px.
                // No computador ele continua do tamanho do ícone.
                <BotaoIcone icone="trash" titulo={`Excluir a meta ${m.titulo}`} tamanho="sm" onClick={() => remover(m)} style={{ flex: "none", marginLeft: 2 }} />
              )}
            </div>
            <span style={{ display: "block", height: 4, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden", marginTop: 5 }}>
              <span style={{ display: "block", width: `${Math.min(100, m.pct)}%`, height: "100%", background: cor, borderRadius: 999, transition: "width .4s var(--ease-entra)" }} />
            </span>
          </div>
        );
      })}
      {daEquipe.length > 5 && (
        <Botao variante="sutil" tamanho="sm" onClick={() => setVerTodas((v) => !v)} style={{ alignSelf: "flex-start" }}>
          {verTodas ? "Ver menos" : `Ver todas (${daEquipe.length})`}
        </Botao>
      )}
    </Cartao>
  );
}

function Kpi({ icone, rotulo, valor, sub, cor }: { icone: string; rotulo: string; valor: number | string; sub: string; cor: string }) {
  return (
    <div className="glass glass-spec" style={{ padding: "14px 16px", borderRadius: "var(--r-md)", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
      <ChipIcone icone={icone} tom="neutro" size={42} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rotulo}</div>
        {/* `Digitos` é a receita `number-pop-in`: cada algarismo re-entra
            desfocado quando o número MUDA. Aqui ele muda o tempo todo — trocar
            de "Hoje" pra "30 dias", ou de setor, reescreve os quatro números —
            e sem isso o valor era substituído no mesmo quadro, sem nada dizendo
            que aquele 148 é a resposta de outra pergunta. Só até três
            algarismos, como a receita manda; acima disso o escalonamento por
            dígito vira ruído, e o valor entra direto. */}
        <div className="stat" style={{ fontSize: 28, fontWeight: 800, color: cor, marginTop: 1, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
          {typeof valor === "number" && valor < 1000 && valor >= 0 ? <Digitos valor={valor} /> : valor}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </div>
    </div>
  );
}

/** A cor de uma taxa de acerto (0 a 1). As faixas são as de `rotuloDaTaxa` —
 *  cor e palavra têm que virar na mesma linha, senão "Bom" fica vermelho. */
export function corDaTaxa(taxa: number | null): string {
  if (taxa == null) return "var(--text-dim)";
  if (taxa >= 0.95) return "var(--ok)";
  if (taxa >= 0.85) return "var(--ok)";
  if (taxa >= 0.7) return "var(--atencao)";
  return "var(--perigo)";
}

/** O status é a PALAVRA da taxa, não uma segunda régua. Sem conferência ele
 *  diz isso, em cinza — e não "Péssimo" em vermelho pra quem entrou ontem. */
function PilulaStatus({ acerto, conferencias }: { acerto: number | null; conferencias: number }) {
  // A coluna inteira só existe quando ALGUÉM foi conferido; aqui sobra o caso
  // de quem, nesse recorte, não foi. Um travessão basta — a explicação já foi
  // dada uma vez, embaixo do cabeçalho.
  if (conferencias === 0) {
    return <span title="sem conferências desta pessoa no recorte" style={{ fontSize: 12.5, color: "var(--text-dim)" }}>—</span>;
  }
  const c = corDaTaxa(acerto);
  return (
    <span title={`${conferencias} conferência(s)`} style={{
      display: "inline-block", fontSize: 11, fontWeight: 800, color: c, borderRadius: 999, padding: "3px 10px",
      background: `color-mix(in srgb, ${c} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 28%, transparent)`,
    }}>{rotuloDaTaxa(acerto)}</span>
  );
}

// ── Pódio ────────────────────────────────────────────────────────────────────
// 2º · 1º · 3º, e o do meio maior — a ordem do pódio de verdade, não a da
// lista. Um ranking desenhado em lista é uma tabela pior; desenhado assim, a
// resposta ("quem puxou o dia") chega antes da leitura.
//
// Três colunas de largura igual e tudo em `clamp`: a 320px o pódio encolhe
// junto em vez de virar rolagem lateral ou empilhar três cartões gigantes.
//
// A fileira LEVANTA junto (receita `avatar-group-hover`): quem está sob o
// ponteiro sobe e cresce, os vizinhos sobem menos por queda exponencial da
// distância. Três avatares lado a lado é exatamente o caso da receita, e é o
// que faz o pódio responder como um grupo em vez de três botões soltos.
function Podio({ pessoas, onAbrir }: { pessoas: PessoaMedida[]; onAbrir: (id: string) => void }) {
  const ordem = [pessoas[1], pessoas[0], pessoas[2]].filter(Boolean) as PessoaMedida[];
  const lugarDe = (p: PessoaMedida) => pessoas.indexOf(p) + 1;
  const fileira = useFileiraQueLevanta<HTMLDivElement>();
  return (
    <div {...fileira.daFileira} style={{ display: "grid", gridTemplateColumns: `repeat(${ordem.length}, minmax(0, 1fr))`, gap: 8, alignItems: "end", paddingTop: 4 }}>
      {ordem.map((p, i) => {
        const lugar = lugarDe(p);
        const primeiro = lugar === 1;
        // Ouro/prata/bronze e a tinta que vai em cima delas moram no módulo
        // compartilhado — o painel de desempenho usa as MESMAS três.
        const cor = MEDALHA[lugar - 1] ?? MEDALHA[2];
        return (
          <button key={p.id} type="button" onClick={() => onAbrir(p.id)}
            {...fileira.doItem(i)}
            aria-label={`Abrir a ficha de ${p.nome}, ${lugar}º lugar`}
            // A pressão acompanha o TAMANHO do alvo, que é a regra da fundação:
            // os 0,97 do padrão num bloco de 130px de altura leem como tremor.
            style={{ "--pressao": ".985", background: "none", border: "none", padding: "4px 2px", cursor: "pointer", font: "inherit", textAlign: "center", minWidth: 0, display: "grid", justifyItems: "center", gap: 6 } as React.CSSProperties}>
            <ComSelo selo={{ conteudo: `${lugar}º`, tamanho: primeiro ? "md" : "sm", fundo: cor, tinta: TINTA_MEDALHA }}>
              <span style={{ display: "grid", placeItems: "center", borderRadius: 999, padding: 3, background: `color-mix(in srgb, ${cor} 22%, transparent)` }}>
                <Avatar url={p.fotoUrl} nome={p.nome} size={primeiro ? 76 : 60} formato="redondo" />
              </span>
            </ComSelo>
            <span style={{ minWidth: 0, maxWidth: "100%" }}>
              <span style={{ display: "block", fontSize: primeiro ? 13.5 : 12.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
              <span style={{ display: "block", fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.setor}</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="stat" style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", background: "var(--surface-2)", borderRadius: 999, padding: "3px 9px" }}>
                {p.concluidas} <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>atv</span>
              </span>
              {p.acerto != null && (
                <span className="stat" style={{ fontSize: 12.5, fontWeight: 800, color: corDaTaxa(p.acerto) }}>{Math.round(p.acerto * 100)}%</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Um destaque: a faixa colorida na borda diz o tom antes de qualquer palavra,
 *  e os números ficam à direita, alinhados entre os quatro cartões. */
function CartaoDestaque({ d, onAbrir, style }: { d: Destaque; onAbrir: () => void; style?: React.CSSProperties }) {
  const cor = d.tom === "alerta" ? "var(--perigo)" : "var(--ok)";
  return (
    // `.ui-vidro-alvo`, não `.ui-card-alvo`: este cartão é `.glass`, e vidro que
    // afunda deixa rastro branco no Chrome. A resposta ao toque vem da sombra.
    //
    // O `style` de fora ENTRA na conta e não é opcional por elegância: é por ele
    // que a `Fila` carimba o `--mt-i` de cada filho. Um componente que escreve
    // só o próprio estilo engole o carimbo calado — a cascata simplesmente não
    // acontece, sem erro nenhum pra denunciar.
    <button type="button" onClick={onAbrir} className="glass glass-spec ui-vidro-alvo"
      style={{ ...style, display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", font: "inherit", cursor: "pointer",
        borderRadius: "var(--r-md)", padding: "10px 13px", border: "none", borderLeft: `3px solid ${cor}`, minWidth: 0 }}>
      <ChipIcone icone={d.key === "volume" ? "trending-up" : d.key === "acerto" ? "target" : d.key === "rapidez" ? "clock" : "alert-triangle"} tom={d.tom} size={36} />
      <Avatar url={d.pessoa.fotoUrl} nome={d.pessoa.nome} size={34} formato="redondo" className="desk-only" />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: cor, lineHeight: 1.3 }}>{d.rotulo}</span>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.pessoa.nome}</span>
      </span>
      <span style={{ display: "flex", gap: 14, flex: "none" }}>
        {d.numeros.map((n) => (
          <span key={n.rotulo} style={{ textAlign: "right" }}>
            <span className="stat" style={{ display: "block", fontSize: 15, fontWeight: 800, color: "var(--text)", lineHeight: 1.2 }}>{n.valor}</span>
            <span style={{ display: "block", fontSize: 10.5, color: "var(--text-dim)" }}>{n.rotulo}</span>
          </span>
        ))}
      </span>
    </button>
  );
}

/** Eficiência como pílula: a cor é o julgamento, o número é a prova. */
export function Badge({ valor }: { valor: number | null }) {
  if (valor == null) return <span style={{ fontSize: 11.5, color: "var(--text-dim)", flex: "none" }}>—</span>;
  const c = corEficiencia(valor);
  return (
    <span className="stat" style={{ flex: "none", fontSize: 11.5, fontWeight: 800, color: c, background: `color-mix(in srgb, ${c} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`, borderRadius: 999, padding: "2px 9px" }}>
      {valor}%
    </span>
  );
}

/** Barra da meta individual: o alvo aparece na MESMA linha do realizado. */
export function BarraMeta({ m }: { m: MetaProgresso }) {
  const cor = m.bateu ? "var(--ok)" : m.pct >= 70 ? "var(--atencao)" : "var(--primary-texto, var(--primary))";
  return (
    <span title={`${m.titulo}: ${m.atual}/${m.alvo}`} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 60 }}>
      <span style={{ flex: 1, minWidth: 30, height: 6, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
        <span style={{ display: "block", width: `${Math.min(100, m.pct)}%`, height: "100%", background: cor, borderRadius: 999, transition: "width .4s var(--ease-entra)" }} />
      </span>
      <span className="stat" style={{ fontSize: 11.5, fontWeight: 700, color: cor, flex: "none" }}>{m.pct}%</span>
    </span>
  );
}
