"use client";

// Comparar 2 a 4 stories lado a lado. A primeira linha é a LEITURA em uma
// frase ("B teve 2,5× mais cliques, mas A vendeu 50% mais") — o número que o
// time ia tirar de cabeça olhando dois prints no Miro. Embaixo, cada story com
// três barras (vendas, cliques, conversão) medidas contra o maior do grupo; o
// vencedor de cada uma fica cheio, com o troféu.

import type { CSSProperties } from "react";
import { Icon } from "../../Icon";
import { Botao, PainelLateral } from "../../ui/controles";
import { rotuloDataHora } from "@/lib/marketing-stories/calendario";
import {
  conversao, formatarConversao, formatarInteiro, leituraDaComparacao, maisCliques, melhorConversao, melhorPorVendas,
} from "@/lib/marketing-stories/metricas";
import { tituloDoStory, type Story } from "@/lib/marketing-stories/tipos";
import { CapaStory, linhaDoConteudo } from "./pecas";

export const MAX_COMPARAR = 4;

/** A barra que aparece embaixo enquanto a pessoa escolhe quem comparar. */
export function BarraComparar({ n, onComparar, onSair }: { n: number; onComparar: () => void; onSair: () => void }) {
  return (
    <div className="sto-cmp-barra" role="region" aria-label="Comparar stories">
      <Icon name="git-compare" size={16} />
      <span className="sto-cmp-barra-txt" aria-live="polite">
        {n === 0 ? "Toque em 2 a 4 stories" : `${n} de ${MAX_COMPARAR} selecionado${n > 1 ? "s" : ""}`}
      </span>
      <Botao variante="sutil" tamanho="sm" onClick={onSair}>Cancelar</Botao>
      <Botao variante="primario" tamanho="sm" disabled={n < 2} onClick={onComparar}>Comparar</Botao>
    </div>
  );
}

function Metrica({ rotulo, texto, fracao, vence }: { rotulo: string; texto: string; fracao: number; vence: boolean }) {
  return (
    <div className="sto-cmp-metrica" data-vence={vence ? "1" : undefined}>
      <div className="sto-cmp-metrica-cab">
        <span>{rotulo}</span>
        {vence && <Icon name="trophy" size={13} />}
        <strong>{texto}</strong>
      </div>
      <span className="sto-cmp-trilho" aria-hidden><span style={{ "--v": fracao } as CSSProperties} /></span>
    </div>
  );
}

export function PainelComparar({ lista, nomes, onFechar, onAbrir }: {
  lista: Story[]; nomes: Map<string, string>; onFechar: () => void; onAbrir: (s: Story) => void;
}) {
  const letra = (s: Story) => String.fromCharCode(65 + Math.max(0, lista.findIndex((x) => x.id === s.id)));
  const convDe = (s: Story) => conversao(s.cliques, s.vendas);
  const max = {
    vendas: Math.max(0, ...lista.map((s) => s.vendas)),
    cliques: Math.max(0, ...lista.map((s) => s.cliques)),
    conv: Math.max(0, ...lista.map((s) => convDe(s) ?? 0)),
  };
  // Aqui a pessoa escolheu quem entra, então a conversão disputa mesmo com
  // pouca amostra — mas quem tem amostra continua na frente.
  const vence = {
    vendas: melhorPorVendas(lista)?.id,
    cliques: maisCliques(lista)?.id,
    conv: (melhorConversao(lista) ?? melhorConversao(lista, 1))?.id,
  };
  const leitura = leituraDaComparacao(lista, letra);

  return (
    <PainelLateral titulo={`Comparando ${lista.length} stories`} subtitulo="Mais clique nem sempre é mais venda"
      centrado largura={980} onFechar={onFechar}>
      {leitura && <p className="sto-cmp-leitura"><Icon name="bulb" size={16} /> <span>{leitura}</span></p>}
      <div className="sto-cmp">
        {lista.map((s) => {
          const c = convDe(s);
          return (
            <article key={s.id} className="sto-cmp-col">
              <button type="button" className="sto-cmp-capa" onClick={() => onAbrir(s)} aria-label={`Abrir o story ${letra(s)}`}>
                <CapaStory s={s} carregar="eager" />
                <span className="sto-cmp-letra">{letra(s)}</span>
              </button>
              <div className="sto-cmp-meta">
                <strong>{tituloDoStory(s, (id) => nomes.get(id))}</strong>
                <span>{rotuloDataHora(s.publicadoEm)} · {linhaDoConteudo(s, nomes)}</span>
              </div>
              <Metrica rotulo="Vendas" texto={formatarInteiro(s.vendas)}
                fracao={max.vendas ? s.vendas / max.vendas : 0} vence={vence.vendas === s.id} />
              <Metrica rotulo="Cliques" texto={formatarInteiro(s.cliques)}
                fracao={max.cliques ? s.cliques / max.cliques : 0} vence={vence.cliques === s.id} />
              <Metrica rotulo="Conversão" texto={formatarConversao(c)}
                fracao={max.conv && c ? c / max.conv : 0} vence={vence.conv === s.id} />
            </article>
          );
        })}
      </div>
    </PainelLateral>
  );
}
