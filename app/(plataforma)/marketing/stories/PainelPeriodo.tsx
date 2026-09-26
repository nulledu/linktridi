"use client";

// O topo do quadro: poucos números e muito significado.
//
//  • Quatro números do recorte (mês, ou a semana escolhida): stories
//    publicados, cliques, vendas, conversão.
//  • O MELHOR STORY do recorte, grande, com o print — é o "quem venceu a
//    semana" que o time tirava do Miro no domingo.
//  • Os outros dois pódios, pequenos: o que mais levou gente ao link e o que
//    melhor converteu. Três perguntas, três respostas: usar só vendas pra tudo
//    esconderia que mais clique não é mais venda.
//  • No mês, as vendas por semana em barras (a da semana que mais vendeu fica
//    cheia). Tocar numa barra abre aquela semana.
//
// Movimento (Kinetics, na escala do app): os números contam até o valor
// (`NumeroVivo`) e recontam quando mudam; quando outro story assume o topo, o
// destaque troca com uma entrada curta e um brilho que passa UMA vez.

import { Icon } from "../../Icon";
import { NumeroVivo } from "../../ui/micro";
import { MonoRoundedBarChart } from "../../ui/monocharts/MonoRoundedBarChart";
import { rotuloDataHora } from "@/lib/marketing-stories/calendario";
import {
  CLIQUES_MIN_CONVERSAO, conversao, formatarConversao, formatarInteiro, maisCliques, melhorConversao, melhorPorVendas,
  resumir, type GrupoSemana,
} from "@/lib/marketing-stories/metricas";
import { tituloDoStory, type Story } from "@/lib/marketing-stories/tipos";
import { CapaStory, MiniStory, NumeroPop } from "./pecas";

function Numero({ rotulo, valor, forte, ehConversao }: {
  rotulo: string; valor: number | null; forte?: boolean; ehConversao?: boolean;
}) {
  return (
    <div className="sto-kpi" data-forte={forte ? "1" : undefined}>
      <span className="sto-kpi-rot">{rotulo}</span>
      <span className="sto-kpi-val">
        {valor == null
          ? "—"
          : <NumeroVivo valor={valor} formatar={ehConversao ? (n) => formatarConversao(n) : formatarInteiro} />}
      </span>
    </div>
  );
}

function Destaque({ s, titulo, nomes, onAbrir }: {
  s: Story; titulo: string; nomes: Map<string, string>; onAbrir: (s: Story) => void;
}) {
  const nome = tituloDoStory(s, (id) => nomes.get(id));
  return (
    <button type="button" className="sto-melhor ui-card-alvo" onClick={() => onAbrir(s)} aria-label={`${titulo}: ${nome}, ${s.vendas} vendas`}>
      <span className="sto-melhor-capa">
        <CapaStory s={s} carregar="eager" />
        <span className="sto-melhor-brilho" aria-hidden />
      </span>
      <span className="sto-melhor-txt">
        <span className="sto-melhor-rot"><Icon name="trophy" size={14} /> {titulo}</span>
        <span className="sto-melhor-vendas">
          <strong><NumeroPop valor={s.vendas} /></strong> <small>{s.vendas === 1 ? "venda" : "vendas"}</small>
        </span>
        <span className="sto-melhor-linha">
          {formatarInteiro(s.cliques)} cliques · {formatarConversao(conversao(s.cliques, s.vendas))} de conversão
        </span>
        <span className="sto-melhor-nome">“{nome}”</span>
        <span className="sto-melhor-data">{rotuloDataHora(s.publicadoEm)}</span>
      </span>
    </button>
  );
}

export function PainelPeriodo({ titulo, modo, stories, grupos, semanaAtiva, nomes, carregando, onSemana, onAbrir }: {
  /** "Setembro 2026" ou "Semana 2 · 7–13 set". */
  titulo: string;
  modo: "mes" | "semana";
  /** Os stories do recorte (já com os filtros de produto/tipo/campanha). */
  stories: Story[];
  grupos: GrupoSemana<Story>[];
  semanaAtiva: number | null;
  nomes: Map<string, string>;
  carregando: boolean;
  onSemana: (n: number) => void;
  onAbrir: (s: Story) => void;
}) {
  const r = resumir(stories);
  const melhor = melhorPorVendas(stories);
  const clicado = maisCliques(stories);
  const convertido = melhorConversao(stories);
  const quem = modo === "mes" ? "do mês" : "da semana";

  // A barra cheia é a semana que mais vendeu; com uma semana aberta, é ela.
  const vendasSemana = grupos.map((g) => g.resumo.vendas);
  const pico = vendasSemana.some((v) => v > 0) ? vendasSemana.indexOf(Math.max(...vendasSemana)) : undefined;
  const destaque = semanaAtiva ? grupos.findIndex((g) => g.semana.n === semanaAtiva) : pico;

  return (
    <section className="sto-periodo" aria-label={`Resumo de ${titulo}`} aria-busy={carregando || undefined}>
      <div className="sto-periodo-nums mc-card">
        <div className="mc-rot">{titulo}</div>
        <div className="sto-kpis">
          <Numero rotulo="Stories publicados" valor={carregando ? null : r.publicados} />
          <Numero rotulo="Cliques" valor={carregando ? null : r.cliques} />
          <Numero rotulo="Vendas" valor={carregando ? null : r.vendas} forte />
          <Numero rotulo="Conversão" valor={carregando ? null : r.conversao} ehConversao />
        </div>
        {grupos.length > 0 && (
          <div className="sto-periodo-semanas">
            <div className="sto-periodo-sub">
              Vendas por semana
              <span>{semanaAtiva ? "toque de novo pra ver o mês" : "toque numa barra pra abrir a semana"}</span>
            </div>
            <MonoRoundedBarChart
              semCartao compact eixoY={false} altura={118} nomePrimario="Vendas"
              pontos={grupos.map((g) => ({ label: `S${g.semana.n}`, primary: g.resumo.vendas }))}
              destaque={destaque != null && destaque >= 0 ? destaque : undefined}
              aoClicar={(i) => onSemana(grupos[i].semana.n)}
              formatar={formatarInteiro}
            />
          </div>
        )}
      </div>

      <div className="sto-periodo-destaque">
        {melhor ? (
          <Destaque key={melhor.id} s={melhor} titulo={`Melhor story ${quem}`} nomes={nomes} onAbrir={onAbrir} />
        ) : (
          <div className="sto-melhor sto-melhor-vazio">
            <Icon name="trophy" size={22} />
            <span>
              <strong>Melhor story {quem}</strong>
              {carregando ? "Carregando…" : "Aparece aqui assim que um story tiver venda anotada."}
            </span>
          </div>
        )}
        {(clicado || convertido) && (
          <div className="sto-podio">
            {clicado && (
              <MiniStory key={`c${clicado.id}`} s={clicado} titulo="Mais cliques"
                valor={`${formatarInteiro(clicado.cliques)} cliques`}
                detalhe={`${formatarInteiro(clicado.vendas)} vendas`} onAbrir={() => onAbrir(clicado)} />
            )}
            {convertido && (
              <MiniStory key={`v${convertido.id}`} s={convertido} titulo="Melhor conversão"
                valor={formatarConversao(conversao(convertido.cliques, convertido.vendas))}
                detalhe={`${convertido.vendas} em ${formatarInteiro(convertido.cliques)} cliques`}
                onAbrir={() => onAbrir(convertido)} />
            )}
            {!convertido && clicado && (
              <p className="sto-dica">Melhor conversão entra a partir de {CLIQUES_MIN_CONVERSAO} cliques.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
