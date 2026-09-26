"use client";

// O cartão de um story no quadro. Hierarquia pedida pelo time, nesta ordem:
// CONTEÚDO (a miniatura ocupa o cartão) → VENDAS (o número grande) →
// CLIQUES e conversão → DATA (carimbo discreto em cima da imagem).
//
// A barrinha no pé é o "indicador de desempenho": vendas deste story contra o
// que mais vendeu no recorte. Lê-se sem número nenhum — cartão cheio vendeu,
// cartão vazio não.

import { useEffect, useState, type CSSProperties } from "react";
import { Icon } from "../../Icon";
import { rotuloDataHora } from "@/lib/marketing-stories/calendario";
import { conversao, formatarConversao } from "@/lib/marketing-stories/metricas";
import { tituloDoStory, type Story } from "@/lib/marketing-stories/tipos";
import { CapaStory, NumeroPop, Selo, linhaDoConteudo, type TipoSelo } from "./pecas";

export interface SeloDoCard { tipo: TipoSelo; texto: string; icone?: string }

/** O selo que o próprio story pede (planejado, repetido), quando a tela não deu um. */
function seloDoStory(s: Story): SeloDoCard | null {
  if (s.status === "planejado") return { tipo: "planejado", texto: "Planejado", icone: "calendar" };
  if (s.repete) return { tipo: "repete", texto: s.repete.mesmaArte ? "Mesma arte" : "Repetido", icone: "copy" };
  return null;
}

export function CardStory({
  s, nomes, maxVendas, selo, posicao, novo, selecionavel, selecionado, modoNumeros, onAbrir, onNumero,
}: {
  s: Story;
  nomes: Map<string, string>;
  /** Maior venda do recorte — é a régua da barrinha. */
  maxVendas: number;
  selo?: SeloDoCard | null;
  /** 1º, 2º… quando o quadro está ordenado por um critério. */
  posicao?: number;
  /** Acabou de ser criado: entra e acende o anel uma vez. */
  novo?: boolean;
  selecionavel?: boolean;
  selecionado?: boolean;
  /** "Lançar números": os dois campos ficam abertos no cartão. */
  modoNumeros?: boolean;
  onAbrir: (s: Story) => void;
  onNumero?: (s: Story, campo: "cliques" | "vendas", n: number) => void;
}) {
  const conv = conversao(s.cliques, s.vendas);
  const titulo = tituloDoStory(s, (id) => nomes.get(id));
  const marca = selo ?? seloDoStory(s);
  const nivel = { "--v": maxVendas > 0 ? Math.min(1, s.vendas / maxVendas) : 0 } as CSSProperties;

  const midia = (
    <span className="sto-card-midia">
      <CapaStory s={s} />
      <span className="sto-card-data">{rotuloDataHora(s.publicadoEm)}</span>
      {marca && (
        <span className="sto-card-selos"><Selo tipo={marca.tipo} icone={marca.icone}>{marca.texto}</Selo></span>
      )}
      {posicao != null && !selecionavel && <span className="sto-card-pos">{posicao}º</span>}
      {selecionavel && (
        <span className="sto-card-check" data-on={selecionado ? "1" : undefined} aria-hidden>
          {selecionado ? <Icon name="check" size={14} /> : null}
        </span>
      )}
    </span>
  );

  if (modoNumeros && onNumero) {
    return (
      <div className="sto-card" data-novo={novo ? "1" : undefined} data-numeros="1">
        <button type="button" className="sto-card-alvo" onClick={() => onAbrir(s)} aria-label={`Abrir ${titulo}`}>
          {midia}
        </button>
        <div className="sto-card-numeros">
          <label>
            <span>Cliques</span>
            <CampoRapido valor={s.cliques} rotulo={`Cliques de ${titulo}`} onSalvar={(n) => onNumero(s, "cliques", n)} />
          </label>
          <label>
            <span>Vendas</span>
            <CampoRapido valor={s.vendas} rotulo={`Vendas de ${titulo}`} onSalvar={(n) => onNumero(s, "vendas", n)} />
          </label>
          <span className="sto-card-conv">{formatarConversao(conv)}</span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button" className="sto-card ui-card-alvo" onClick={() => onAbrir(s)}
      data-novo={novo ? "1" : undefined} data-sel={selecionado ? "1" : undefined}
      aria-pressed={selecionavel ? !!selecionado : undefined}
      aria-label={`${titulo}, ${rotuloDataHora(s.publicadoEm)}: ${s.vendas} vendas, ${s.cliques} cliques, conversão ${formatarConversao(conv)}`}
    >
      {midia}
      <span className="sto-card-corpo">
        <span className="sto-card-vendas">
          <strong><NumeroPop valor={s.vendas} /></strong>
          <small>{s.vendas === 1 ? "venda" : "vendas"}</small>
        </span>
        <span className="sto-card-sub">
          <NumeroPop valor={s.cliques} /> {s.cliques === 1 ? "clique" : "cliques"} · {formatarConversao(conv)}
        </span>
        <span className="sto-card-prod">{s.tema || linhaDoConteudo(s, nomes)}</span>
        <span className="sto-card-nivel" aria-hidden><span style={nivel} /></span>
      </span>
    </button>
  );
}

/**
 * Campo do "Lançar números". Aberto o tempo todo (é pra digitar dezenas em
 * sequência): sair do campo salva, Enter pula pro PRÓXIMO campo do quadro —
 * cliques → vendas → cliques do story seguinte — sem tirar a mão do teclado.
 */
function CampoRapido({ valor, rotulo, onSalvar }: { valor: number; rotulo: string; onSalvar: (n: number) => void }) {
  const [t, setT] = useState(String(valor));
  useEffect(() => { setT(String(valor)); }, [valor]);
  const salvar = () => {
    const limpo = t.replace(/[.\s]/g, "");
    const n = Number(limpo);
    if (!limpo || !Number.isInteger(n) || n < 0) { setT(String(valor)); return; }
    if (n !== valor) onSalvar(n);
  };
  return (
    <input
      className="sto-card-campo" inputMode="numeric" enterKeyHint="next" aria-label={rotulo} value={t}
      onChange={(e) => setT(e.target.value)} onBlur={salvar} onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const todos = [...document.querySelectorAll<HTMLInputElement>(".sto-card-campo")];
        const proximo = todos[todos.indexOf(e.currentTarget) + 1];
        if (proximo) proximo.focus();
        else e.currentTarget.blur();
      }}
    />
  );
}
