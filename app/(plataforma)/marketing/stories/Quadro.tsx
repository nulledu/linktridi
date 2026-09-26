"use client";

// O quadro: a lógica do Miro — o mês dividido em semanas, cada semana com os
// prints dos stories que foram ao ar nela — mais os recortes que o Miro não
// dava sem contar à mão (ranking por vendas, cliques e conversão; o que está
// planejado ou repetido).

import type { ReactNode } from "react";
import { Abas } from "../../ui/Abas";
import { Botao } from "../../ui/controles";
import { Fila } from "../../ui/micro";
import { GlassSelect } from "../../GlassPicker";
import { Icon } from "../../Icon";
import { rotuloFaixa, type Semana } from "@/lib/marketing-stories/calendario";
import {
  CLIQUES_MIN_CONVERSAO, formatarConversao, formatarInteiro, melhorPorVendas, ordenar, type GrupoSemana,
} from "@/lib/marketing-stories/metricas";
import { TIPOS_STORY, type Story } from "@/lib/marketing-stories/tipos";
import type { SeloDoCard } from "./CardStory";
import { Vazio } from "./pecas";

export type FiltroQuadro = "todos" | "vendas" | "cliques" | "conversao" | "atencao" | `s${number}`;
export type RenderCard = (s: Story, extra?: { posicao?: number; selo?: SeloDoCard | null; maxVendas?: number }) => ReactNode;

const pad = (n: number) => String(n).padStart(2, "0");

export function FiltrosQuadro({
  filtro, onFiltro, grupos, atencao, produtos, tipos, campanhas, fProduto, fTipo, fCampanha, onProduto, onTipo, onCampanha,
}: {
  filtro: FiltroQuadro;
  onFiltro: (f: FiltroQuadro) => void;
  grupos: GrupoSemana<Story>[];
  atencao: number;
  /** Só o que aparece no mês — filtro que não filtra nada é ruído. */
  produtos: { id: string; nome: string }[];
  tipos: string[];
  campanhas: string[];
  fProduto: string;
  fTipo: string;
  fCampanha: string;
  onProduto: (v: string) => void;
  onTipo: (v: string) => void;
  onCampanha: (v: string) => void;
}) {
  const itens: { valor: FiltroQuadro; rotulo: ReactNode; badge?: ReactNode }[] = [
    { valor: "todos", rotulo: "Todos" },
    ...grupos.map((g) => ({
      valor: `s${g.semana.n}` as FiltroQuadro,
      rotulo: `Semana ${g.semana.n}`,
      badge: g.stories.length ? <span className="sto-aba-qtd">{g.stories.length}</span> : undefined,
    })),
    { valor: "vendas", rotulo: <><Icon name="trophy" size={14} /> Mais vendas</> },
    { valor: "cliques", rotulo: "Mais cliques" },
    { valor: "conversao", rotulo: "Melhor conversão" },
    {
      valor: "atencao", rotulo: "Planejados e repetidos",
      badge: atencao ? <span className="sto-aba-qtd">{atencao}</span> : undefined,
    },
  ];
  const algum = fProduto || fTipo || fCampanha;
  return (
    <div className="sto-filtros">
      <Abas itens={itens} valor={filtro} onMuda={onFiltro} ariaLabel="Recorte do quadro" quebra />
      <div className="sto-filtros-conteudo">
        {produtos.length > 0 && (
          <GlassSelect value={fProduto} onChange={onProduto} title="Produto"
            options={[{ value: "", label: "Todos os produtos" }, ...produtos.map((p) => ({ value: p.id, label: p.nome }))]} />
        )}
        {tipos.length > 0 && (
          <GlassSelect value={fTipo} onChange={onTipo} title="Tipo"
            options={[{ value: "", label: "Todos os tipos" }, ...TIPOS_STORY.filter((t) => tipos.includes(t.valor)).map((t) => ({ value: t.valor, label: t.rotulo }))]} />
        )}
        {campanhas.length > 0 && (
          <GlassSelect value={fCampanha} onChange={onCampanha} title="Campanha"
            options={[{ value: "", label: "Todas as campanhas" }, ...campanhas.map((c) => ({ value: c, label: c }))]} />
        )}
        {algum && (
          <Botao variante="sutil" tamanho="sm" icone="x" onClick={() => { onProduto(""); onTipo(""); onCampanha(""); }}>
            Limpar filtros
          </Botao>
        )}
      </div>
    </div>
  );
}

/** Seis cartões de espera no formato do story — a grade não pula quando os dados chegam. */
export function EsqueletoQuadro({ n = 6 }: { n?: number }) {
  return (
    <div className="sto-grade" aria-hidden>
      {Array.from({ length: n }, (_, i) => <span key={i} className="sto-card-esq skeleton" />)}
    </div>
  );
}

function SecaoSemana({ mes, g, hoje, podeCriar, renderCard, onNovo }: {
  mes: string; g: GrupoSemana<Story>; hoje: string; podeCriar: boolean; renderCard: RenderCard; onNovo: (s: Semana) => void;
}) {
  const melhor = g.stories.length > 1 ? melhorPorVendas(g.stories) : null;
  const futura = `${mes}-${pad(g.semana.de)}` > hoje;
  const maxVendas = Math.max(0, ...g.stories.map((s) => s.vendas));
  const idTitulo = `sto-sem-${mes}-${g.semana.n}`;
  return (
    <section className="sto-semana" aria-labelledby={idTitulo}>
      <header className="sto-semana-cab">
        <h3 className="sto-semana-nome" id={idTitulo}>Semana {g.semana.n}</h3>
        <span className="sto-semana-faixa">{rotuloFaixa(mes, g.semana)}</span>
        {g.stories.length > 0 && (
          <span className="sto-semana-nums">
            <span><strong>{g.resumo.publicados}</strong> {g.resumo.publicados === 1 ? "story" : "stories"}</span>
            <span><strong>{formatarInteiro(g.resumo.cliques)}</strong> cliques</span>
            <span><strong>{formatarInteiro(g.resumo.vendas)}</strong> vendas</span>
            <span><strong>{formatarConversao(g.resumo.conversao)}</strong></span>
          </span>
        )}
      </header>
      {g.stories.length ? (
        <Fila className="sto-grade">
          {g.stories.map((s) => renderCard(s, {
            maxVendas,
            selo: melhor?.id === s.id ? { tipo: "melhor", texto: "Melhor da semana", icone: "trophy" } : undefined,
          }))}
        </Fila>
      ) : (
        <div className="sto-semana-vazia">
          <Icon name={futura ? "calendar-event" : "photo"} size={16} />
          <span>{futura ? "Esta semana ainda não começou." : "Nenhum story nesta semana."}</span>
          {podeCriar && (
            <Botao tamanho="sm" variante="sutil" icone="plus" onClick={() => onNovo(g.semana)}>
              {futura ? "Planejar" : "Adicionar"}
            </Botao>
          )}
        </div>
      )}
    </section>
  );
}

export function Quadro({ mes, filtro, grupos, stories, hoje, carregando, podeCriar, renderCard, onNovo }: {
  mes: string;
  filtro: FiltroQuadro;
  grupos: GrupoSemana<Story>[];
  /** O mês com os filtros de conteúdo aplicados. */
  stories: Story[];
  hoje: string;
  carregando: boolean;
  podeCriar: boolean;
  renderCard: RenderCard;
  onNovo: (semana?: Semana) => void;
}) {
  if (carregando) return <EsqueletoQuadro />;

  if (!stories.length && filtro === "todos") {
    return (
      <Vazio
        icone="photo"
        titulo="Nenhum story neste mês ainda"
        texto={podeCriar ? "Arraste os prints pra cá — dá pra soltar vários de uma vez — ou use Adicionar story." : "Quando o time registrar os stories, eles aparecem aqui por semana."}
        acao={podeCriar ? <Botao variante="primario" icone="plus" onClick={() => onNovo()}>Adicionar story</Botao> : undefined}
      />
    );
  }

  if (filtro === "vendas" || filtro === "cliques" || filtro === "conversao") {
    const lista = ordenar(stories, filtro);
    const conta = (s: Story) => filtro === "vendas" ? s.vendas > 0
      : filtro === "cliques" ? s.cliques > 0
        : s.cliques >= CLIQUES_MIN_CONVERSAO && s.vendas > 0;
    const maxVendas = Math.max(0, ...lista.map((s) => s.vendas));
    return (
      <div className="sto-semana">
        {filtro === "conversao" && (
          <p className="sto-dica">
            Stories com menos de {CLIQUES_MIN_CONVERSAO} cliques vão pro fim: 1 clique e 1 venda não é 100% de conversão.
          </p>
        )}
        <Fila className="sto-grade">
          {lista.map((s, i) => renderCard(s, { posicao: conta(s) ? i + 1 : undefined, maxVendas }))}
        </Fila>
      </div>
    );
  }

  if (filtro === "atencao") {
    const lista = stories.filter((s) => s.status === "planejado" || s.repete);
    return lista.length ? (
      <div className="sto-semana">
        <p className="sto-dica">
          Planejados ainda não foram ao ar. Repetidos têm a mesma arte, ou produto, tipo e tema muito parecidos com um story anterior — abra pra ver qual.
        </p>
        <Fila className="sto-grade">{lista.map((s) => renderCard(s))}</Fila>
      </div>
    ) : (
      <Vazio icone="circle-check" titulo="Nada planejado nem repetido" texto="Todo story deste mês já foi ao ar e nenhum repete um anterior." />
    );
  }

  const n = filtro.startsWith("s") ? Number(filtro.slice(1)) : null;
  const visiveis = n ? grupos.filter((g) => g.semana.n === n) : grupos;
  return (
    <div className="sto-semanas">
      {visiveis.map((g) => (
        <SecaoSemana key={g.semana.n} mes={mes} g={g} hoje={hoje} podeCriar={podeCriar} renderCard={renderCard} onNovo={onNovo} />
      ))}
    </div>
  );
}
