"use client";

// ── Histórico ────────────────────────────────────────────────────────────────
// Todos os stories, de todos os meses, com busca. "carimbo" traz tudo que
// falou de carimbo — pelo nome do produto, pelo tema, pela campanha, pela
// observação — e responde, sem ninguém contar:
//   • quantas vezes já falamos disso (o total);
//   • em que formatos (os blocos por tipo);
//   • o que vendeu mais e o que converteu melhor (a ordem e o pódio por tipo).
//
// A busca roda no servidor sobre o índice em memória (sem acento, palavras em
// qualquer ordem). Espera de digitação só na busca; trocar filtro responde na
// hora. Resposta atrasada é descartada — sem isso, digitar rápido mostraria o
// resultado de uma letra atrás.

import { useEffect, useRef, useState } from "react";
import { GlassSelect } from "../../GlassPicker";
import { Icon } from "../../Icon";
import { Botao } from "../../ui/controles";
import { Fila } from "../../ui/micro";
import { McPills } from "../../ui/monocharts/lib";
import type { ProdutoCriativo } from "@/lib/marketing-criativos-const";
import { ehDia, hojeSP, inicioDaSemana } from "@/lib/marketing-stories/calendario";
import { CLIQUES_MIN_CONVERSAO, formatarConversao, formatarInteiro, type Resumo } from "@/lib/marketing-stories/metricas";
import { TIPOS_STORY, rotuloDoTipo, type Story } from "@/lib/marketing-stories/tipos";
import type { BuscaStories, OrdemBusca, StoriesApi } from "./api";
import { Vazio } from "./pecas";
import { EsqueletoQuadro, type RenderCard } from "./Quadro";

type Periodo = "tudo" | "hoje" | "semana" | "mes" | "custom";
const PASSO = 48;
const RESUMO_VAZIO: Resumo = { stories: 0, publicados: 0, cliques: 0, vendas: 0, conversao: null };

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "tudo", rotulo: "Tudo" },
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "semana", rotulo: "Esta semana" },
  { valor: "mes", rotulo: "Este mês" },
  { valor: "custom", rotulo: "Personalizado" },
];

const ORDENS: { value: OrdemBusca; label: string }[] = [
  { value: "recentes", label: "Mais recentes" },
  { value: "vendas", label: "Mais vendas" },
  { value: "cliques", label: "Mais cliques" },
  { value: "conversao", label: "Melhor conversão" },
];

export function HistoricoStories({ api, produtos, campanhas, resultado, onResultado, versao, renderCard }: {
  api: StoriesApi;
  produtos: ProdutoCriativo[];
  campanhas: string[];
  /** Mora no pai: editar um story no detalhe tem de mudar o cartão daqui também. */
  resultado: BuscaStories | null;
  onResultado: (r: BuscaStories) => void;
  /** Muda quando um story é criado ou apagado — busca de novo. */
  versao: number;
  renderCard: RenderCard;
}) {
  const [q, setQ] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [produto, setProduto] = useState("");
  const [tipo, setTipo] = useState("");
  const [campanha, setCampanha] = useState("");
  const [ordem, setOrdem] = useState<OrdemBusca>("recentes");
  const [limite, setLimite] = useState(PASSO);
  const [carregando, setCarregando] = useState(true);
  const pedido = useRef(0);

  const hoje = hojeSP();
  const janela = periodo === "hoje" ? { de: hoje, ate: hoje }
    : periodo === "semana" ? { de: inicioDaSemana(hoje), ate: hoje }
      : periodo === "mes" ? { de: `${hoje.slice(0, 7)}-01`, ate: hoje }
        : periodo === "custom" && ehDia(de) && ehDia(ate) && de <= ate ? { de, ate }
          : null;
  const jDe = janela?.de;
  const jAte = janela?.ate;

  // Filtro novo volta pra primeira página — no MESMO render, senão sairiam
  // duas buscas (uma com o limite velho, outra com o novo).
  const com = <T,>(set: (v: T) => void) => (v: T) => { setLimite(PASSO); set(v); };

  useEffect(() => {
    const meu = ++pedido.current;
    setCarregando(true);
    const t = setTimeout(() => {
      api.buscar({
        q: q.trim() || undefined, de: jDe, ate: jAte, produtoId: produto || undefined,
        tipo: tipo || undefined, campanha: campanha || undefined, ordem, limite,
      })
        .then((r) => { if (meu === pedido.current) onResultado(r); })
        .catch(() => {
          if (meu === pedido.current) onResultado({ stories: [], total: 0, resumo: RESUMO_VAZIO, porTipo: [], sqlPendente: false });
        })
        .finally(() => { if (meu === pedido.current) setCarregando(false); });
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [api, q, jDe, jAte, produto, tipo, campanha, ordem, limite, versao, onResultado]);

  const r = resultado;
  const lista = r?.stories ?? [];
  const maxVendas = Math.max(0, ...lista.map((s) => s.vendas));
  const conta = (s: Story) => ordem === "vendas" ? s.vendas > 0
    : ordem === "cliques" ? s.cliques > 0
      : ordem === "conversao" ? s.cliques >= CLIQUES_MIN_CONVERSAO && s.vendas > 0
        : false;
  const algum = q || periodo !== "tudo" || produto || tipo || campanha;

  return (
    <section className="sto-hist">
      <label className="sto-hist-busca">
        <Icon name="search" size={18} />
        <input type="search" value={q} onChange={(e) => com(setQ)(e.target.value)} enterKeyHint="search"
          placeholder="Pesquisar produto, tema, campanha, CTA…" aria-label="Pesquisar stories" />
        {q && (
          <button type="button" className="sto-hist-limpar" onClick={() => com(setQ)("")} aria-label="Limpar a busca">
            <Icon name="x" size={16} />
          </button>
        )}
      </label>

      <div className="sto-hist-filtros">
        <McPills itens={PERIODOS} valor={periodo} onMuda={com(setPeriodo)} ariaLabel="Período" />
        {periodo === "custom" && (
          <span className="sto-hist-datas">
            <input type="date" value={de} max={ate || undefined} onChange={(e) => com(setDe)(e.target.value)} aria-label="De" />
            até
            <input type="date" value={ate} min={de || undefined} onChange={(e) => com(setAte)(e.target.value)} aria-label="Até" />
          </span>
        )}
        <GlassSelect value={produto} onChange={com(setProduto)} title="Produto"
          options={[{ value: "", label: "Todos os produtos" }, ...produtos.filter((p) => p.id).map((p) => ({ value: p.id as string, label: p.nome }))]} />
        <GlassSelect value={tipo} onChange={com(setTipo)} title="Tipo"
          options={[{ value: "", label: "Todos os tipos" }, ...TIPOS_STORY.map((t) => ({ value: t.valor, label: t.rotulo }))]} />
        {campanhas.length > 0 && (
          <GlassSelect value={campanha} onChange={com(setCampanha)} title="Campanha"
            options={[{ value: "", label: "Todas as campanhas" }, ...campanhas.map((c) => ({ value: c, label: c }))]} />
        )}
        <GlassSelect value={ordem} onChange={(v) => com(setOrdem)(v as OrdemBusca)} title="Ordem" options={ORDENS} />
      </div>

      {r && r.total > 0 && (
        <div className="sto-hist-resumo">
          <p className="sto-hist-linha">
            <strong>{formatarInteiro(r.total)}</strong> {r.total === 1 ? "story" : "stories"}
            {" · "}<strong>{formatarInteiro(r.resumo.cliques)}</strong> cliques
            {" · "}<strong>{formatarInteiro(r.resumo.vendas)}</strong> vendas
            {" · "}conversão <strong>{formatarConversao(r.resumo.conversao)}</strong>
          </p>
          {r.porTipo.length > 1 && (
            <div className="sto-hist-tipos" aria-label="Por tipo de conteúdo">
              {r.porTipo.map((l, i) => (
                <button key={l.tipo ?? "sem"} type="button" className="sto-hist-tipo" data-on={tipo && tipo === l.tipo ? "1" : undefined}
                  onClick={() => com(setTipo)(tipo === l.tipo ? "" : (l.tipo ?? ""))} disabled={!l.tipo}>
                  {i === 0 && l.vendas > 0 && <Icon name="trophy" size={13} />}
                  <strong>{rotuloDoTipo(l.tipo) ?? "Sem tipo"}</strong>
                  <span>{l.stories} · {formatarInteiro(l.vendas)} vendas · {formatarConversao(l.conversao)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {ordem === "conversao" && (
        <p className="sto-dica">
          Na ordem por conversão, quem tem menos de {CLIQUES_MIN_CONVERSAO} cliques vai pro fim — 1 clique e 1 venda não é 100%.
        </p>
      )}

      {carregando && !r ? (
        <EsqueletoQuadro />
      ) : lista.length ? (
        <Fila className="sto-grade" aria-busy={carregando || undefined}>
          {lista.map((s, i) => renderCard(s, { posicao: conta(s) ? i + 1 : undefined, maxVendas }))}
        </Fila>
      ) : (
        <Vazio icone="search"
          titulo={q ? `Nada com “${q.trim()}”` : algum ? "Nenhum story neste recorte" : "Nenhum story registrado ainda"}
          texto={algum ? "Tente outra palavra ou tire um filtro." : "Os stories registrados no quadro aparecem aqui, de todos os meses."} />
      )}

      {r && lista.length < r.total && (
        <div className="sto-mais-res">
          <Botao carregando={carregando} onClick={() => setLimite((l) => Math.min(240, l + PASSO))}>
            Ver mais ({formatarInteiro(r.total - lista.length)})
          </Botao>
        </div>
      )}
    </section>
  );
}
