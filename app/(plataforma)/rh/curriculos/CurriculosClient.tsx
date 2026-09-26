"use client";

// RH → Currículos: o PAINEL DE CANDIDATOS.
//
// Uma tela só, lida de cima pra baixo como o próprio processo:
//
//   1. o fluxo   — cinco perguntas em uma faixa: quantos chegaram, quantos
//                  precisam de análise, quantos avançam, quantos estão
//                  parados, quantos terminaram. Cada uma é um filtro.
//   2. o recorte — busca rápida + filtros combináveis; o que está ativo
//                  aparece em chips, cada um com o seu "x".
//   3. o quadro  — Kanban por etapa (arrasta no computador, "⋯ → Mover" em
//                  qualquer tela) ou lista pra ler muitos de uma vez.
//
// Toda ação simples (mover, etiqueta, observação, currículo, arquivar) acontece
// aqui, pelo menu "⋯" do candidato — sem abrir o perfil. A mudança entra na
// tela na hora (otimista) e volta atrás se o servidor recusar.
//
// Nada faz poll: a lista desce pronta do servidor e `router.refresh()` depois
// de cada gesto traz o que outra pessoa mudou.

import { useEffect, useMemo, useState } from "react";
import "./curriculos.css";
import { useRouter } from "next/navigation";
import type { PoderesRh } from "@/lib/rh/gate";
import {
  ARQUIVADO, DIAS_PARADO, filasDo, papelDe, seloDaEtapa, type EtapaProcesso, type Fila,
} from "@/lib/rh/curriculos/etapas";
import { type CandidatoResumo, type ConfigIntegracao, type VagaRh } from "@/lib/rh/curriculos/tipos";
import { useSticky } from "../../useSticky";
import { useParamDaUrl } from "../../ui/useParamDaUrl";
import { Icon } from "../../Icon";
import { Botao, Chips } from "../../ui/controles";
import { GlassDate, GlassSelect } from "../../GlassPicker";
import { toast } from "../../Toast";
import {
  AvisoSchema, BuscaDaLista, Cabecalho, Cartao, Filtro, Filtros, NotaRodape, Tabela, Vazio, type Coluna,
} from "../../financeiro/ui";
import { TrocaDeVisao } from "../../financeiro/blocos";
import { Personagem } from "../../../curriculo/Personagem";
import {
  CartaoKanban, Etiquetas, FolhaEtiquetas, FolhaObservacao, Iniciais, MenuAcoes, Nota, SeloEtapa, aviso, dataHoraBR,
  tempoRelativo, type AcaoRapida,
} from "./pecas";

type Visao = "kanban" | "lista";
type Periodo = "" | "hoje" | "7" | "30" | "custom";
type Situacao = "" | "nao_vistos" | "analisados" | "arquivados";

const PERIODOS = [
  { valor: "hoje", label: "Hoje" },
  { valor: "7", label: "Últimos 7 dias" },
  { valor: "30", label: "Últimos 30 dias" },
  { valor: "custom", label: "Escolher datas" },
];
const SITUACOES = [
  { valor: "nao_vistos", label: "Novos (não abertos)" },
  { valor: "analisados", label: "Já analisados" },
  { valor: "arquivados", label: "Arquivados" },
];
const EXPERIENCIAS = [
  { valor: "sim", label: "Com experiência" },
  { valor: "nao", label: "Sem experiência" },
];

const FILAS: { id: Fila; rotulo: string; dica: string; icone: string }[] = [
  { id: "chegaram", rotulo: "Chegaram", dica: "nos últimos 7 dias", icone: "inbox" },
  { id: "analisar", rotulo: "Para analisar", dica: "na etapa de entrada", icone: "eye" },
  { id: "avancando", rotulo: "Avançando", dica: "moveram há pouco", icone: "arrow-right" },
  { id: "parados", rotulo: "Parados", dica: `mais de ${DIAS_PARADO} dias na etapa`, icone: "clock-hour-4" },
  { id: "finalizados", rotulo: "Finalizados", dica: "aprovados, reprovados, contratados", icone: "circle-check" },
];

const diaSP = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const diasAtras = (hoje: string, n: number) => new Date(Date.parse(`${hoje}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function chamar(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error((j.erro as string) || "Não foi possível salvar.");
  return j;
}

/** Experiência do candidato, lida das etiquetas da triagem. */
const experienciaDe = (c: CandidatoResumo): "sim" | "nao" | "" =>
  c.perfil?.tags.includes("Com experiência") ? "sim" : c.perfil?.tags.includes("Sem experiência") ? "nao" : "";

export function CurriculosClient({ lista: inicial, vagas, etapas, saturou, hoje, poderes, integracao, schemaPendente }: {
  lista: CandidatoResumo[];
  vagas: VagaRh[];
  etapas: EtapaProcesso[];
  saturou: boolean;
  hoje: string;
  poderes: PoderesRh;
  integracao: ConfigIntegracao;
  schemaPendente: boolean;
}) {
  const router = useRouter();
  // Configurações e Link e vagas são telas pesadas (editor do formulário):
  // baixo o código e os dados delas em segundo plano, antes do clique.
  useEffect(() => {
    if (!poderes.curriculosIntegracao) return;
    const t = window.setTimeout(() => {
      router.prefetch("/rh/curriculos/configuracoes");
      router.prefetch("/rh/curriculos/integracao");
    }, 800);
    return () => window.clearTimeout(t);
  }, [router, poderes.curriculosIntegracao]);
  // Cópia local: as ações rápidas mexem aqui antes do servidor responder.
  const [lista, setLista] = useState(inicial);
  useEffect(() => { setLista(inicial); }, [inicial]);
  // "agora" congelado por carga: o "há 2 h" e o "parado" não mudam sozinhos na tela.
  const [agora] = useState(() => Date.now());

  const ativas = useMemo(() => etapas.filter((e) => e.ativa), [etapas]);

  // ── O recorte ──────────────────────────────────────────────────────────────
  const [busca, setBusca] = useState("");
  const [fila, setFila] = useState<Fila | "">("");
  const [etapa, setEtapa] = useState("");
  const [vaga, setVaga] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("");
  const [experiencia, setExperiencia] = useState("");
  const [escolaridade, setEscolaridade] = useState("");
  const [cidade, setCidade] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [periodo, setPeriodo] = useState<Periodo>("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [visao, setVisao] = useSticky<Visao>("rh.cv.visao3", "kanban");
  useParamDaUrl("status", setEtapa);
  useParamDaUrl("vaga", setVaga);

  const limpar = () => {
    setBusca(""); setFila(""); setEtapa(""); setVaga(""); setSituacao(""); setExperiencia(""); setEscolaridade("");
    setCidade(""); setTags([]); setPeriodo(""); setDe(""); setAte("");
  };

  // As opções dos filtros saem dos dados — nada de filtro que só devolve vazio.
  const opcoes = useMemo(() => {
    const cont = (f: (c: CandidatoResumo) => string[]) => {
      const m = new Map<string, number>();
      for (const c of lista) for (const v of f(c)) if (v) m.set(v, (m.get(v) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return {
      cidades: cont((c) => [c.cidade ?? ""]).map(([valor, n]) => ({ valor, label: `${valor} (${n})` })),
      escolaridades: cont((c) => [c.perfil?.escolaridade ?? ""]).map(([valor, n]) => ({ valor, label: `${valor} (${n})` })),
      tags: cont((c) => [...c.tags, ...(c.perfil?.tags ?? [])]).slice(0, 14).map(([valor, conta]) => ({ valor, rotulo: valor, conta })),
      manuais: cont((c) => c.tags).map(([t]) => t),
    };
  }, [lista]);

  // Tudo menos a fila — pra cada fila mostrar quantos há NAQUELE recorte.
  const semFila = useMemo(() => {
    const q = normalizar(busca.trim());
    const digitos = q.replace(/\D+/g, "");
    const inicio = periodo === "hoje" ? hoje : periodo === "7" ? diasAtras(hoje, 6) : periodo === "30" ? diasAtras(hoje, 29) : periodo === "custom" ? de : "";
    const fim = periodo === "custom" ? ate : "";
    return lista.filter((c) => {
      // Arquivado só aparece quando se pede.
      if (situacao === "arquivados" ? c.status !== ARQUIVADO : c.status === ARQUIVADO) return false;
      if (situacao === "nao_vistos" && c.visto_em) return false;
      if (situacao === "analisados" && !c.visto_em) return false;
      if (etapa && c.status !== etapa) return false;
      if (vaga && (vaga === "__sem__" ? !!c.vaga_id : c.vaga_id !== vaga)) return false;
      if (experiencia && experienciaDe(c) !== experiencia) return false;
      if (escolaridade && c.perfil?.escolaridade !== escolaridade) return false;
      if (cidade && c.cidade !== cidade) return false;
      if (tags.length && !tags.every((t) => c.tags.includes(t) || c.perfil?.tags.includes(t))) return false;
      if (inicio || fim) {
        const dia = diaSP(c.recebido_em);
        if (inicio && dia < inicio) return false;
        if (fim && dia > fim) return false;
      }
      if (q) {
        const texto = normalizar([c.nome, c.email, c.cidade, c.vaga, c.perfil?.formacao, c.perfil?.experiencia, ...c.tags, ...(c.perfil?.tags ?? [])].filter(Boolean).join(" "));
        if (!texto.includes(q) && !(digitos.length >= 4 && (c.telefone ?? "").replace(/\D+/g, "").includes(digitos))) return false;
      }
      return true;
    });
  }, [lista, busca, situacao, etapa, vaga, experiencia, escolaridade, cidade, tags, periodo, de, ate, hoje]);

  const filasDeCada = useMemo(() => new Map(semFila.map((c) => [c.id, filasDo(c, etapas, agora)])), [semFila, etapas, agora]);
  const contaFila = useMemo(() => {
    const m: Record<Fila, number> = { chegaram: 0, analisar: 0, avancando: 0, parados: 0, finalizados: 0 };
    for (const f of filasDeCada.values()) for (const x of f) m[x]++;
    return m;
  }, [filasDeCada]);
  const filtrados = useMemo(() => (fila ? semFila.filter((c) => filasDeCada.get(c.id)?.has(fila)) : semFila), [semFila, fila, filasDeCada]);

  // ── Chips dos filtros ativos (cada um com o seu "x") ──────────────────────
  const rotuloVaga = (id: string) => (id === "__sem__" ? "Sem vaga" : vagas.find((v) => v.id === id)?.titulo ?? "Vaga");
  const ativos: { id: string; rotulo: string; tirar: () => void }[] = [
    ...(fila ? [{ id: "fila", rotulo: FILAS.find((f) => f.id === fila)!.rotulo, tirar: () => setFila("") }] : []),
    ...(busca ? [{ id: "busca", rotulo: `“${busca}”`, tirar: () => setBusca("") }] : []),
    ...(vaga ? [{ id: "vaga", rotulo: `Vaga: ${rotuloVaga(vaga)}`, tirar: () => setVaga("") }] : []),
    ...(etapa ? [{ id: "etapa", rotulo: `Etapa: ${seloDaEtapa(etapas, etapa).label}`, tirar: () => setEtapa("") }] : []),
    ...(situacao ? [{ id: "sit", rotulo: SITUACOES.find((s) => s.valor === situacao)!.label, tirar: () => setSituacao("") }] : []),
    ...(experiencia ? [{ id: "exp", rotulo: EXPERIENCIAS.find((s) => s.valor === experiencia)!.label, tirar: () => setExperiencia("") }] : []),
    ...(escolaridade ? [{ id: "esc", rotulo: escolaridade, tirar: () => setEscolaridade("") }] : []),
    ...(cidade ? [{ id: "cid", rotulo: cidade, tirar: () => setCidade("") }] : []),
    ...(periodo ? [{ id: "per", rotulo: periodo === "custom" ? `${de || "…"} a ${ate || "…"}` : PERIODOS.find((p) => p.valor === periodo)!.label, tirar: () => { setPeriodo(""); setDe(""); setAte(""); } }] : []),
    ...tags.map((t) => ({ id: `tag-${t}`, rotulo: `#${t}`, tirar: () => setTags((a) => a.filter((x) => x !== t)) })),
  ];
  const filtrosNoPainel = [vaga, etapa, situacao, experiencia, escolaridade, cidade, periodo].filter(Boolean).length + tags.length;

  // ── Ações rápidas ──────────────────────────────────────────────────────────
  const [folha, setFolha] = useState<{ tipo: "tag" | "observacao"; c: CandidatoResumo } | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  const mover = async (c: CandidatoResumo, para: string) => {
    if (c.status === para) return;
    const antes = { status: c.status, etapa_em: c.etapa_em };
    const agoraIso = new Date().toISOString();
    setLista((a) => a.map((x) => (x.id === c.id ? { ...x, status: para, etapa_em: agoraIso } : x)));
    try {
      await chamar(`/api/rh/curriculos/${c.id}/status`, { method: "PATCH", body: JSON.stringify({ status: para }) });
      toast(para === ARQUIVADO ? `${c.nome.split(" ")[0]} arquivado.` : `${c.nome.split(" ")[0]} → ${seloDaEtapa(etapas, para).label}.`);
      router.refresh();
    } catch (e) {
      setLista((a) => a.map((x) => (x.id === c.id ? { ...x, ...antes } : x)));
      toast((e as Error).message, "erro");
    }
  };
  const agir = (c: CandidatoResumo, a: AcaoRapida) => {
    if (a.tipo === "mover") void mover(c, a.para);
    else setFolha({ tipo: a.tipo, c });
  };
  const abrir = (c: CandidatoResumo) => router.push(`/rh/curriculos/${c.id}`);
  const menu = (c: CandidatoResumo) => <MenuAcoes c={c} etapas={etapas} poderes={poderes} aoAgir={(a) => agir(c, a)} />;

  // ── A lista ────────────────────────────────────────────────────────────────
  const colunas: Coluna<CandidatoResumo>[] = [
    {
      chave: "nome", label: "Candidato", largura: "minmax(min(100%, 200px), 1.5fr)", titulo: true,
      celula: (c) => (
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Iniciais nome={c.nome} novo={c.status === "novo" && !c.visto_em} tamanho={32} />
          <span style={{ minWidth: 0, display: "grid" }}>
            <strong style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</strong>
            {(c.tags.length > 0 || (c.perfil?.tags.length ?? 0) > 0) && <span className="desk-only"><Etiquetas tags={c.perfil?.tags ?? []} manuais={c.tags} max={2} /></span>}
          </span>
        </span>
      ),
    },
    { chave: "vaga", label: "Vaga", largura: "minmax(min(100%, 130px), 1fr)", celula: (c) => c.vaga ?? <span style={{ color: "var(--text-dim)" }}>—</span> },
    { chave: "recebido", label: "Candidatura", largura: "104px", celula: (c) => <span title={dataHoraBR(c.recebido_em)} className="mt-num">{tempoRelativo(c.recebido_em, agora)}</span> },
    {
      chave: "etapa", label: "Etapa", largura: "minmax(min(100%, 120px), .9fr)",
      celula: (c) => (
        <span style={{ display: "grid", gap: 2 }}>
          <SeloEtapa etapas={etapas} id={c.status} />
          {aviso(c, etapas, agora) && <small style={{ color: "var(--atencao)", fontWeight: 600 }}>{aviso(c, etapas, agora)}</small>}
        </span>
      ),
    },
    {
      chave: "situacao", label: "Status", largura: "96px",
      celula: (c) => c.status === ARQUIVADO ? <span style={{ color: "var(--text-dim)" }}>Arquivado</span>
        : !c.visto_em ? <span style={{ color: "var(--azul)", fontWeight: 700 }}>Novo</span>
          : <span style={{ color: "var(--text-dim)" }}>Analisado</span>,
    },
    ...(poderes.curriculosRespostas ? [
      { chave: "exp", label: "Experiência", largura: "minmax(min(100%, 120px), 1fr)", soNoComputador: true, celula: (c: CandidatoResumo) => c.perfil?.experiencia ?? <span style={{ color: "var(--text-dim)" }}>—</span> },
      { chave: "nota", label: "Acertos", largura: "84px", celula: (c: CandidatoResumo) => c.perfil?.pontuaveis ? <Nota acertos={c.perfil.acertos} pontuaveis={c.perfil.pontuaveis} compacta /> : <span style={{ color: "var(--text-dim)" }}>—</span> },
      { chave: "esc", label: "Escolaridade", largura: "minmax(min(100%, 110px), .9fr)", soNoComputador: true, celula: (c: CandidatoResumo) => c.perfil?.escolaridade ?? <span style={{ color: "var(--text-dim)" }}>—</span> },
    ] : []),
    { chave: "upd", label: "Atualizado", largura: "96px", soNoComputador: true, celula: (c) => <span className="mt-num" style={{ color: "var(--text-dim)" }}>{tempoRelativo(c.etapa_em ?? c.updated_at ?? c.recebido_em, agora)}</span> },
    { chave: "acoes", label: "", largura: "48px", fim: true, celula: (c) => <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>{menu(c)}</span> },
  ];

  const vazioTotal = lista.length === 0;
  const naoArquivados = lista.filter((c) => c.status !== ARQUIVADO).length;

  return (
    <>
      <Cabecalho
        tarja="RH"
        titulo="Currículos"
        sub={vazioTotal ? "Os candidatos que se inscreverem aparecem aqui." : `${naoArquivados} candidato${naoArquivados === 1 ? "" : "s"} no processo${contaFila.analisar ? ` · ${contaFila.analisar} esperando análise` : ""}.`}
        acoes={
          <>
            <Botao icone="eye" onClick={() => window.open("/curriculo?previa=1", "_blank", "noopener")}>Prévia</Botao>
            {poderes.curriculosIntegracao && <Botao icone="settings" onClick={() => router.push("/rh/curriculos/configuracoes")}>Configurações</Botao>}
            {poderes.curriculosIntegracao && <Botao variante="primario" icone="link" onClick={() => router.push("/rh/curriculos/integracao")}>Link e vagas</Botao>}
          </>
        }
      />

      {schemaPendente && <AvisoSchema modulo="RH" arquivo="supabase/rh_curriculos.sql" />}
      {integracao.ultimo_erro && (
        <div style={{ marginBottom: 16 }}>
          <NotaRodape destaque icone="alert-triangle">
            Não foi possível receber a última candidatura: {integracao.ultimo_erro}
            {integracao.ultima_recepcao_em && <> · Última recepção com sucesso em {dataHoraBR(integracao.ultima_recepcao_em)}.</>}
          </NotaRodape>
        </div>
      )}

      {vazioTotal ? (
        <Cartao estatico>
          <Personagem pose="ele-celular" altura={150} lado="dir" nota="Divulgue o link!" />
          <Vazio
            icone="id-badge"
            titulo={integracao.formulario_ativo ? "Nenhum candidato ainda." : "O formulário de candidatura está fechado."}
            detalhe={integracao.formulario_ativo
              ? "Cada pessoa que enviar a candidatura entra aqui, em “Recebidos”, com as respostas e o currículo."
              : "Abra o formulário e divulgue o link: cada pessoa que responder aparece aqui na hora."}
            acao={poderes.curriculosIntegracao ? <Botao variante="primario" icone="link" onClick={() => router.push("/rh/curriculos/integracao")}>Link e vagas</Botao> : undefined}
          />
        </Cartao>
      ) : (
        <>
          {/* ── 1. O fluxo ─────────────────────────────────────────────────── */}
          <nav aria-label="Fluxo da triagem" className="cv-fluxo tab-strip">
            {FILAS.map((f) => (
              <button key={f.id} type="button" className="cv-fila" aria-pressed={fila === f.id}
                data-tom={f.id === "parados" && contaFila.parados ? "atencao" : f.id === "analisar" && contaFila.analisar ? "destaque" : undefined}
                onClick={() => setFila(fila === f.id ? "" : f.id)} title={`${f.rotulo}: ${f.dica}`}>
                <span className="cv-fila-num mt-num">{contaFila[f.id]}</span>
                <span className="cv-fila-txt"><strong>{f.rotulo}</strong><small>{f.dica}</small></span>
              </button>
            ))}
          </nav>

          {/* ── 2. O recorte ───────────────────────────────────────────────── */}
          <div style={{ display: "grid", gap: 10, margin: "16px 0 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <BuscaDaLista valor={busca} aoBuscar={setBusca} placeholder="Buscar por nome, vaga, cidade, formação, etiqueta…" />
              </div>
              <Botao icone="filter" variante={filtrosAbertos || filtrosNoPainel ? "secundario" : "sutil"} onClick={() => setFiltrosAbertos((v) => !v)} aria-expanded={filtrosAbertos}>
                Filtros{filtrosNoPainel ? ` · ${filtrosNoPainel}` : ""}
              </Botao>
              <TrocaDeVisao<Visao> valor={visao} aoTrocar={setVisao} opcoes={[
                { id: "kanban", icone: "layout-kanban", titulo: "Kanban por etapa" },
                { id: "lista", icone: "table", titulo: "Lista" },
              ]} />
            </div>

            {filtrosAbertos && (
              <Cartao estatico padding={14}>
                <div style={{ display: "grid", gap: 12 }}>
                  <Filtros>
                    <Filtro rotulo="Vaga" valor={vaga} aoMudar={setVaga} opcoes={[
                      ...vagas.map((v) => ({ valor: v.id, label: `${v.titulo}${v.candidatos ? ` (${v.candidatos})` : ""}` })),
                      ...(lista.some((c) => !c.vaga_id) ? [{ valor: "__sem__", label: "Sem vaga definida" }] : []),
                    ]} />
                    <Filtro rotulo="Etapa" valor={etapa} aoMudar={setEtapa} opcoes={etapas.filter((e) => e.ativa || lista.some((c) => c.status === e.id)).map((e) => ({ valor: e.id, label: e.label }))} />
                    <Filtro rotulo="Status" valor={situacao} aoMudar={(v) => setSituacao(v as Situacao)} opcoes={SITUACOES} />
                    {poderes.curriculosRespostas && <Filtro rotulo="Experiência" valor={experiencia} aoMudar={setExperiencia} opcoes={EXPERIENCIAS} />}
                    {opcoes.escolaridades.length > 0 && <Filtro rotulo="Escolaridade" valor={escolaridade} aoMudar={setEscolaridade} opcoes={opcoes.escolaridades} />}
                    {opcoes.cidades.length > 0 && <Filtro rotulo="Localização" valor={cidade} aoMudar={setCidade} opcoes={opcoes.cidades} />}
                    <div style={{ display: "grid", gap: 6, flex: "none" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>Candidatura</span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <GlassSelect value={periodo} onChange={(v) => setPeriodo(v as Periodo)} placeholder="Qualquer data" aria-label="Data da candidatura" style={{ width: 168 }}
                          options={[{ value: "", label: "Qualquer data" }, ...PERIODOS.map((p) => ({ value: p.valor, label: p.label }))]} />
                        {periodo === "custom" && (
                          <>
                            <GlassDate value={de} onChange={setDe} max={ate || hoje} placeholder="De" aria-label="De" style={{ width: 150 }} />
                            <GlassDate value={ate} onChange={setAte} min={de} max={hoje} placeholder="Até" aria-label="Até" style={{ width: 150 }} />
                          </>
                        )}
                      </div>
                    </div>
                  </Filtros>
                  {opcoes.tags.length > 0 && (
                    <div style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>Etiquetas</span>
                      <Chips<string> rotulo="Filtrar por etiqueta" opcoes={opcoes.tags} valor={tags} onMuda={setTags} />
                    </div>
                  )}
                </div>
              </Cartao>
            )}

            {ativos.length > 0 && (
              <div className="cv-ativos" role="list" aria-label="Filtros ativos">
                {ativos.map((a) => (
                  <span key={a.id} role="listitem" className="cv-ativo">
                    {a.rotulo}
                    <button type="button" onClick={a.tirar} aria-label={`Tirar filtro ${a.rotulo}`}><Icon name="x" size={14} /></button>
                  </span>
                ))}
                <Botao tamanho="sm" variante="sutil" onClick={limpar}>Limpar tudo</Botao>
                <span className="mt-num" style={{ fontSize: 12.5, color: "var(--text-dim)", marginLeft: "auto" }}>{filtrados.length} de {lista.length}</span>
              </div>
            )}
          </div>

          {/* ── 3. O quadro ────────────────────────────────────────────────── */}
          {filtrados.length === 0 ? (
            <Cartao estatico>
              <Vazio icone="filter" titulo="Ninguém com esse recorte." detalhe="Tire um dos filtros acima ou limpe todos." acao={<Botao onClick={limpar}>Limpar filtros</Botao>} />
            </Cartao>
          ) : visao === "lista" || situacao === "arquivados" ? (
            <Cartao padding="16px 14px 10px">
              <Tabela colunas={colunas} linhas={filtrados} chaveDe={(c) => c.id} aoClicar={abrir} paginar={40} rotuloItem="candidatos" />
            </Cartao>
          ) : (
            <div className="cv-quadro" role="list" aria-label="Candidatos por etapa">
              {ativas.map((e) => {
                const itens = filtrados.filter((c) => c.status === e.id);
                const final = e.papel === "final_positivo" || e.papel === "final_negativo";
                return (
                  <section key={e.id} role="listitem" className="cv-coluna" data-sobre={sobre === e.id ? "1" : undefined} data-final={final ? "1" : undefined}
                    aria-label={`${e.label}: ${itens.length}`}
                    onDragOver={(ev) => { if (arrastando && poderes.curriculosStatus) { ev.preventDefault(); setSobre(e.id); } }}
                    onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setSobre(null); }}
                    onDrop={(ev) => {
                      ev.preventDefault(); setSobre(null);
                      const c = lista.find((x) => x.id === ev.dataTransfer.getData("text/plain"));
                      if (c) void mover(c, e.id);
                    }}>
                    <header>
                      <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: e.cor, flex: "none" }} />
                      <strong>{e.label}</strong>
                      <span className="mt-num cv-coluna-n">{itens.length}</span>
                    </header>
                    <div className="cv-coluna-corpo">
                      {itens.length === 0 ? (
                        <p className="cv-coluna-vazia">{arrastando ? "Solte aqui" : papelDe(etapas, e.id) === "entrada" ? "Nada novo pra analisar." : "Vazio"}</p>
                      ) : itens.map((c) => (
                        <CartaoKanban key={c.id} c={c} etapas={etapas} agora={agora} podeMover={poderes.curriculosStatus}
                          acoes={menu(c)} aoAbrir={() => abrir(c)} arrastando={arrastando === c.id} aoArrastar={setArrastando} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          {saturou && <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-dim)" }}>Mostrando os 600 mais recentes.</p>}
        </>
      )}

      {folha?.tipo === "tag" && (
        <FolhaEtiquetas c={folha.c} sugestoes={opcoes.manuais} aoFechar={() => setFolha(null)}
          aoSalvar={(t) => { setLista((a) => a.map((x) => (x.id === folha.c.id ? { ...x, tags: t } : x))); setFolha(null); router.refresh(); }} />
      )}
      {folha?.tipo === "observacao" && <FolhaObservacao c={folha.c} aoFechar={() => setFolha(null)} aoSalvar={() => router.refresh()} />}
    </>
  );
}
