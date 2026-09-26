"use client";

// ── Marketing · Stories ──────────────────────────────────────────────────────
// O quadro do Miro dentro do Gaius. A organização é a mesma que o time já
// usava — o MÊS, dividido em SEMANAS, cada story representado pelo próprio
// print — e em cima dela vem o que o Miro não fazia sozinho: os números
// somados, o melhor story da semana e do mês, o ranking por vendas, cliques e
// conversão, a busca no histórico inteiro e o aviso de conteúdo repetido.
//
// Três visões do mesmo dado: Quadro (semanas), Calendário (frequência) e
// Histórico (todos os meses, com busca). Registrar é arrastar os prints pra
// cá (ou "Adicionar story"); lançar os números depois é "Lançar números".
//
// Sem poll: o quadro muda quando alguém grava, e quem grava é quem está nele
// (CLAUDE.md · dados). Os dados vêm de uma `StoriesApi` — a de verdade em
// produção, uma em memória no banco de provas (/dev-stories).

import "./stories.css";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Icon } from "../../Icon";
import { toast } from "../../Toast";
import { Botao, BotaoIcone } from "../../ui/controles";
import { McPills } from "../../ui/monocharts/lib";
import type { ProdutoCriativo } from "@/lib/marketing-criativos-const";
import { andarMes, hojeSP, nomeDoMes, partesSP, rotuloFaixa, rotuloMes, semanaDoStory, type Semana } from "@/lib/marketing-stories/calendario";
import { porSemana } from "@/lib/marketing-stories/metricas";
import { normalizar } from "@/lib/marketing-stories/semelhanca";
import type { PatchStory, Story } from "@/lib/marketing-stories/tipos";
import { apiHttp, type BuscaStories, type MesDeStories, type StoriesApi } from "./api";
import { CalendarioStories } from "./Calendario";
import { CardStory } from "./CardStory";
import { BarraComparar, MAX_COMPARAR, PainelComparar } from "./Comparar";
import { DetalheStory } from "./DetalheStory";
import { temArquivo } from "./DropMidia";
import { HistoricoStories } from "./Historico";
import { NovoStory } from "./NovoStory";
import { PainelPeriodo } from "./PainelPeriodo";
import { mapaDeProdutos } from "./pecas";
import { FiltrosQuadro, Quadro, type FiltroQuadro, type RenderCard } from "./Quadro";

type Visao = "quadro" | "calendario" | "historico";
const VISOES: { valor: Visao; rotulo: string }[] = [
  { valor: "quadro", rotulo: "Quadro" },
  { valor: "calendario", rotulo: "Calendário" },
  { valor: "historico", rotulo: "Histórico" },
];
const pad = (n: number) => String(n).padStart(2, "0");

export function StoriesClient({ podeCriar, produtos, onProdutoCriado, api = apiHttp }: {
  /** `marketing:criar` — registrar, editar números, excluir. Sem ela o quadro é só leitura. */
  podeCriar: boolean;
  /** O cadastro de produtos da Biblioteca de Criativos (o MESMO). */
  produtos: ProdutoCriativo[];
  onProdutoCriado?: (p: ProdutoCriativo) => void;
  /** Fonte dos dados. O banco de provas passa uma em memória. */
  api?: StoriesApi;
}) {
  const hoje = hojeSP();
  const mesHoje = hoje.slice(0, 7);
  const [visao, setVisao] = useState<Visao>("quadro");
  const [mes, setMes] = useState(mesHoje);
  const [dados, setDados] = useState<MesDeStories | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroQuadro>("todos");
  const [fProduto, setFProduto] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fCampanha, setFCampanha] = useState("");
  const [historico, setHistorico] = useState<BuscaStories | null>(null);
  const [versaoHist, setVersaoHist] = useState(0);
  const [comparando, setComparando] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [comparacao, setComparacao] = useState(false);
  const [modoNumeros, setModoNumeros] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  // Story aberto a partir de um "parecido" que não está no mês nem na busca.
  const [avulsos, setAvulsos] = useState<Record<string, Story>>({});
  const [novo, setNovo] = useState<{ fila: File[]; data?: string } | null>(null);
  const [recem, setRecem] = useState<string | null>(null);
  const [soltando, setSoltando] = useState(false);
  const profundidade = useRef(0);
  const nomes = useMemo(() => mapaDeProdutos(produtos), [produtos]);

  // ── O mês ──
  // Resposta atrasada é descartada: andar três meses rápido pelas setas não
  // pode terminar mostrando o primeiro.
  const pedido = useRef(0);
  useEffect(() => {
    const meu = ++pedido.current;
    setDados(null);
    setErro(null);
    api.listarMes(mes)
      .then((r) => { if (meu === pedido.current) setDados(r); })
      .catch((e: unknown) => {
        if (meu !== pedido.current) return;
        setErro((e as Error)?.message || "Não deu pra carregar os stories.");
        setDados({ stories: [], campanhas: [], sqlPendente: false });
      });
  }, [api, mes]);

  const trocarMes = (m: string) => {
    setMes(m);
    setFiltro((f) => (f.startsWith("s") ? "todos" : f));
    setSelecionados([]);
  };

  // O anel do story recém-criado toca uma vez; depois a marca sai, senão ele
  // tocaria de novo a cada troca de filtro que remonta o cartão.
  useEffect(() => {
    if (!recem) return;
    const t = setTimeout(() => setRecem(null), 2400);
    return () => clearTimeout(t);
  }, [recem]);

  // ── Recortes ──
  const doMes = useMemo(
    () => (dados?.stories ?? []).filter((s) => partesSP(s.publicadoEm).mes === mes),
    [dados, mes],
  );
  const filtrados = useMemo(() => doMes.filter((s) =>
    (!fProduto || s.produtoId === fProduto)
    && (!fTipo || s.tipo === fTipo)
    && (!fCampanha || normalizar(s.campanha) === normalizar(fCampanha))), [doMes, fProduto, fTipo, fCampanha]);
  const grupos = useMemo(() => porSemana(filtrados, mes), [filtrados, mes]);
  const semanaAtiva = filtro.startsWith("s") ? Number(filtro.slice(1)) : null;
  const grupoAtivo = semanaAtiva ? grupos.find((g) => g.semana.n === semanaAtiva) ?? null : null;
  const escopo = grupoAtivo ? grupoAtivo.stories : filtrados;
  const maxVendas = Math.max(0, ...escopo.map((s) => s.vendas));
  const atencao = filtrados.filter((s) => s.status === "planejado" || s.repete).length;

  const opcoes = useMemo(() => {
    const prod = new Set<string>();
    const tipos = new Set<string>();
    const camp = new Map<string, string>();
    for (const s of doMes) {
      if (s.produtoId) prod.add(s.produtoId);
      if (s.tipo) tipos.add(s.tipo);
      if (s.campanha?.trim()) camp.set(normalizar(s.campanha), s.campanha.trim());
    }
    return {
      produtos: [...prod].map((id) => ({ id, nome: nomes.get(id) ?? "Produto" })),
      tipos: [...tipos],
      campanhas: [...camp.values()],
    };
  }, [doMes, nomes]);

  // Todo story que a tela conhece, pra abrir/comparar pelo id.
  const conhecidos = useMemo(() => {
    const m = new Map<string, Story>();
    for (const s of Object.values(avulsos)) m.set(s.id, s);
    for (const s of historico?.stories ?? []) m.set(s.id, s);
    for (const s of dados?.stories ?? []) m.set(s.id, s);
    return m;
  }, [avulsos, historico, dados]);
  const detalhe = detalheId ? conhecidos.get(detalheId) ?? null : null;

  // ── Escrita ──
  // Otimista: a tela troca na hora e o pedido segue pela fila de salvamento.
  // As três listas (mês, busca, avulsos) trocam juntas — o mesmo story pode
  // estar aberto no detalhe e visível no histórico ao mesmo tempo.
  const editar = useCallback((s: Story, patch: PatchStory, rotulo: string) => {
    const trocar = (l: Story[]) => l.map((x) => (x.id === s.id ? { ...x, ...patch } : x));
    setDados((d) => (d ? { ...d, stories: trocar(d.stories) } : d));
    setHistorico((h) => (h ? { ...h, stories: trocar(h.stories) } : h));
    setAvulsos((a) => (a[s.id] ? { ...a, [s.id]: { ...a[s.id], ...patch } } : a));
    api.atualizar(s.id, patch, rotulo);
  }, [api]);

  const aoCriar = (s: Story) => {
    const alvo = semanaDoStory(s.publicadoEm);
    setRecem(s.id);
    setVersaoHist((v) => v + 1);
    if (alvo.mes === mes) {
      setDados((d) => (d ? { ...d, stories: [...d.stories, s] } : d));
      if (filtro.startsWith("s") && filtro !== `s${alvo.n}`) setFiltro("todos");
    } else {
      trocarMes(alvo.mes);
      toast.info(`O story é de ${rotuloMes(alvo.mes)} — o quadro foi pra lá.`);
    }
  };

  const aoExcluir = (id: string) => {
    setDados((d) => (d ? { ...d, stories: d.stories.filter((x) => x.id !== id) } : d));
    setHistorico((h) => (h ? { ...h, stories: h.stories.filter((x) => x.id !== id), total: Math.max(0, h.total - 1) } : h));
    setSelecionados((l) => l.filter((x) => x !== id));
    setDetalheId(null);
    setVersaoHist((v) => v + 1);
  };

  // ── Abrir, selecionar ──
  const abrirCard = (s: Story) => {
    if (!comparando) { setDetalheId(s.id); return; }
    if (selecionados.includes(s.id)) { setSelecionados(selecionados.filter((x) => x !== s.id)); return; }
    if (selecionados.length >= MAX_COMPARAR) { toast.info(`Dá pra comparar até ${MAX_COMPARAR} stories de uma vez.`); return; }
    setSelecionados([...selecionados, s.id]);
  };

  const abrirPorId = (id: string) => {
    if (conhecidos.has(id)) { setDetalheId(id); return; }
    void api.detalhe(id).then((r) => {
      if (!r) { toast("Esse story não existe mais.", "erro"); return; }
      setAvulsos((a) => ({ ...a, [id]: r.story }));
      setDetalheId(id);
    });
  };

  const alternarComparar = () => {
    setComparando((v) => !v);
    setSelecionados([]);
    setModoNumeros(false);
  };

  const trocarVisao = (v: Visao) => {
    setVisao(v);
    if (v === "calendario") { setComparando(false); setSelecionados([]); }
    if (v !== "quadro") setModoNumeros(false);
  };

  const abrirNovo = (data?: string) => setNovo({ fila: [], data });
  const novoNaSemana = (s?: Semana) => abrirNovo(s ? `${mes}-${pad(s.de)}` : undefined);

  const renderCard: RenderCard = (s, extra = {}) => (
    <div key={s.id} className="sto-cel">
      <CardStory
        s={s} nomes={nomes} maxVendas={extra.maxVendas ?? maxVendas} selo={extra.selo} posicao={extra.posicao}
        novo={recem === s.id} selecionavel={comparando} selecionado={selecionados.includes(s.id)}
        modoNumeros={modoNumeros && podeCriar && !comparando} onAbrir={abrirCard}
        onNumero={(x, campo, n) => editar(x, campo === "cliques" ? { cliques: n } : { vendas: n }, campo === "cliques" ? "Cliques" : "Vendas")}
      />
    </div>
  );

  // ── Soltar arquivos no quadro ──
  // Um story por arquivo; vários de uma vez viram fila no cadastro. Com um
  // painel aberto o quadro não escuta (o cadastro tem a própria área).
  const ocupado = !!novo || !!detalheId || comparacao;
  const soltar = podeCriar ? {
    onDragEnter: (e: DragEvent) => {
      if (ocupado || !temArquivo(e)) return;
      e.preventDefault();
      profundidade.current++;
      setSoltando(true);
    },
    onDragOver: (e: DragEvent) => {
      if (ocupado || !temArquivo(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: () => {
      profundidade.current = Math.max(0, profundidade.current - 1);
      if (!profundidade.current) setSoltando(false);
    },
    onDrop: (e: DragEvent) => {
      if (ocupado || !temArquivo(e)) return;
      e.preventDefault();
      profundidade.current = 0;
      setSoltando(false);
      const arquivos = [...e.dataTransfer.files].filter((f) => /^(image|video)\//.test(f.type)).slice(0, 30);
      if (arquivos.length) setNovo({ fila: arquivos });
      else toast("Solte imagens ou vídeos — um story por arquivo.", "erro");
    },
  } : {};

  const tituloPeriodo = grupoAtivo
    ? `Semana ${grupoAtivo.semana.n} · ${rotuloFaixa(mes, grupoAtivo.semana)}`
    : rotuloMes(mes);
  const contexto = detalhe && partesSP(detalhe.publicadoEm).mes === mes ? doMes : [];
  const campanhas = dados?.campanhas ?? [];

  return (
    <div className="sto" data-comparando={comparando ? "1" : undefined} {...soltar}>
      {soltando && (
        <div className="sto-soltar" aria-hidden>
          <Icon name="upload" size={28} />
          <strong>Solte para adicionar</strong>
          <span>Um story por arquivo — dá pra soltar vários de uma vez.</span>
        </div>
      )}

      <div className="sto-barra">
        {visao === "historico" ? (
          <h2 className="sto-mes-nome">Histórico</h2>
        ) : (
          <div className="sto-mes">
            <BotaoIcone icone="chevron-left" titulo={`Ir para ${rotuloMes(andarMes(mes, -1))}`} onClick={() => trocarMes(andarMes(mes, -1))} />
            <button type="button" className="sto-mes-viz desk-only" onClick={() => trocarMes(andarMes(mes, -1))}>
              {nomeDoMes(andarMes(mes, -1))}
            </button>
            <h2 className="sto-mes-nome" aria-live="polite">{rotuloMes(mes)}</h2>
            <button type="button" className="sto-mes-viz desk-only" onClick={() => trocarMes(andarMes(mes, 1))}>
              {nomeDoMes(andarMes(mes, 1))}
            </button>
            <BotaoIcone icone="chevron-right" titulo={`Ir para ${rotuloMes(andarMes(mes, 1))}`} onClick={() => trocarMes(andarMes(mes, 1))} />
            {mes !== mesHoje && <Botao variante="sutil" tamanho="sm" onClick={() => trocarMes(mesHoje)}>Hoje</Botao>}
          </div>
        )}
        <McPills itens={VISOES} valor={visao} onMuda={trocarVisao} ariaLabel="Visualização" />
        <div className="sto-barra-acoes">
          {podeCriar && visao === "quadro" && (
            <Botao variante={modoNumeros ? "primario" : "sutil"} icone={modoNumeros ? "check" : "keyboard"}
              aria-pressed={modoNumeros} onClick={() => { setModoNumeros((v) => !v); setComparando(false); setSelecionados([]); }}>
              {modoNumeros ? "Pronto" : "Lançar números"}
            </Botao>
          )}
          {visao !== "calendario" && (
            <Botao variante={comparando ? "primario" : "secundario"} icone="git-compare" aria-pressed={comparando} onClick={alternarComparar}>
              Comparar
            </Botao>
          )}
          {podeCriar && (
            <Botao variante="primario" icone="plus" className="sto-acao-principal" onClick={() => abrirNovo()}>
              Adicionar story
            </Botao>
          )}
        </div>
      </div>

      {erro && (
        <p className="sto-aviso" data-forte="1" role="alert"><Icon name="alert-triangle" size={16} /> <span>{erro}</span></p>
      )}
      {(dados?.sqlPendente || historico?.sqlPendente) && (
        <p className="sto-aviso" data-forte="1" role="status">
          <Icon name="database" size={16} />
          <span>A tabela de stories ainda não existe no banco. Rode <code>supabase/marketing_stories.sql</code> no Supabase — até lá o quadro fica vazio e nada é gravado.</span>
        </p>
      )}
      {modoNumeros && visao === "quadro" && (
        <p className="sto-dica">Digite os cliques e as vendas direto nos cartões. Enter pula pro próximo campo; sair do campo salva.</p>
      )}

      {visao === "quadro" && (
        <>
          <PainelPeriodo
            titulo={tituloPeriodo} modo={grupoAtivo ? "semana" : "mes"} stories={escopo} grupos={grupos}
            semanaAtiva={semanaAtiva} nomes={nomes} carregando={!dados}
            onSemana={(n) => setFiltro((f) => (f === `s${n}` ? "todos" : `s${n}`))}
            onAbrir={abrirCard}
          />
          <FiltrosQuadro
            filtro={filtro} onFiltro={setFiltro} grupos={grupos} atencao={atencao}
            produtos={opcoes.produtos} tipos={opcoes.tipos} campanhas={opcoes.campanhas}
            fProduto={fProduto} fTipo={fTipo} fCampanha={fCampanha}
            onProduto={setFProduto} onTipo={setFTipo} onCampanha={setFCampanha}
          />
          <Quadro
            mes={mes} filtro={filtro} grupos={grupos} stories={filtrados} hoje={hoje} carregando={!dados}
            podeCriar={podeCriar} renderCard={renderCard} onNovo={novoNaSemana}
          />
        </>
      )}

      {visao === "calendario" && (
        <CalendarioStories
          key={mes} mes={mes} stories={filtrados} hoje={hoje} carregando={!dados} podeCriar={podeCriar}
          renderCard={renderCard} onNovoNoDia={(data) => abrirNovo(data)}
        />
      )}

      {visao === "historico" && (
        <HistoricoStories
          api={api} produtos={produtos} campanhas={campanhas} resultado={historico} onResultado={setHistorico}
          versao={versaoHist} renderCard={renderCard}
        />
      )}

      {comparando && (
        <BarraComparar n={selecionados.length} onComparar={() => setComparacao(true)} onSair={alternarComparar} />
      )}

      {comparacao && (
        <PainelComparar
          lista={selecionados.map((id) => conhecidos.get(id)).filter((s): s is Story => !!s)}
          nomes={nomes}
          onFechar={() => setComparacao(false)}
          onAbrir={(s) => { setComparacao(false); setDetalheId(s.id); }}
        />
      )}

      {novo && (
        <NovoStory
          api={api} produtos={produtos} onProdutoCriado={onProdutoCriado} campanhas={campanhas}
          fila={novo.fila} dataInicial={novo.data} onFechar={() => setNovo(null)} onCriado={aoCriar}
        />
      )}

      {detalhe && (
        <DetalheStory
          key={detalhe.id} api={api} s={detalhe} nomes={nomes} produtos={produtos} campanhas={campanhas}
          podeEditar={podeCriar} contexto={contexto} onEditar={editar} onExcluido={aoExcluir}
          onAbrirOutro={abrirPorId} onFechar={() => setDetalheId(null)}
        />
      )}
    </div>
  );
}
