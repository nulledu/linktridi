"use client";

// ── As peças do painel de lojas ──────────────────────────────────────────────
// Um cabeçalho de tela. Um número. Um bloco. Três peças, e é só.
//
// ── Por que isto existe ──────────────────────────────────────────────────────
// O módulo tinha CINCO cabeçalhos de página diferentes (`PageHead`, `.in-topo`,
// `.an-topo`, `.lo-topo`, `.tm-topo`) e CINCO jeitos de desenhar o mesmo número
// (`MonoKpi`, `.cl-numeros`, `.lo-num`, `.ml-total`, `.an-par`). Cada tela nova
// inventava o seu, e o resultado é o que se via: navegar entre Início, Análises
// e Clientes parecia navegar entre três produtos.
//
// Coisas que parecem iguais têm que se comportar igual, e coisas que fazem a
// mesma coisa têm que parecer iguais. Quando o mesmo papel tem cinco desenhos,
// a pessoa não constrói modelo mental nenhum — ela relê cada tela do zero.
//
// A regra pra crescer: tela nova USA estas peças. Se uma delas não serve, o
// caminho é mudar a peça aqui — não escrever a sexta.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../Icon";
import { Fila, TrocaIcone } from "../ui/micro";
import "./ui.css";

// ── Copiar link ──────────────────────────────────────────────────────────────

/**
 * Copia o endereço da loja (Kinetics 016): o elo cruza pro visto e volta em
 * ~1,4 s. Alvo de 44px; o rótulo mora no `aria-label`/`title` porque o botão
 * fica encaixado no canto do cartão.
 */
export function CopiarLink({ url, rotulo = "Copiar o link", className = "" }: {
  url: string; rotulo?: string; className?: string;
}) {
  const [ok, setOk] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (relogio.current) clearTimeout(relogio.current); }, []);
  async function copiar(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    try { await navigator.clipboard.writeText(url); } catch { return; }
    setOk(true);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setOk(false), 1400);
  }
  const texto = ok ? "Link copiado" : rotulo;
  return (
    <button type="button" className={`lj-copiar ${className}`.trim()} data-ok={ok ? "1" : undefined}
      onClick={copiar} title={texto} aria-label={texto}>
      <TrocaIcone ligado={ok} a="link" b="check" size={16} corB="var(--ok)" />
    </button>
  );
}

// ── Cabeçalho de tela ────────────────────────────────────────────────────────

/**
 * O topo de toda tela do módulo.
 *
 * Responde as duas primeiras perguntas do wayfinding — onde estou, e o que tem
 * aqui — no mesmo lugar, com o mesmo tamanho, em toda tela. `acao` é a ação
 * PRINCIPAL, uma só: duas ações do mesmo peso não têm principal nenhuma.
 */
export function Cabecalho({ titulo, sub, acao, aside }: {
  titulo: ReactNode;
  sub?: ReactNode;
  /** A ação principal da tela. Uma. */
  acao?: ReactNode;
  /** Contexto à direita que NÃO é ação — período, estado. */
  aside?: ReactNode;
}) {
  return (
    <header className="lj-topo">
      <div className="lj-topo-txt">
        <h1>{titulo}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {(aside || acao) && (
        <div className="lj-topo-dir">
          {aside}
          {acao}
        </div>
      )}
    </header>
  );
}

// ── Números ──────────────────────────────────────────────────────────────────

export interface NumeroDado {
  rotulo: string;
  valor: ReactNode;
  /** Fração: `0.12` = +12%. `null` quando não há com o que comparar. */
  variacao?: number | null;
  /** Quando CAIR é bom (fila de envio, custo). */
  inverter?: boolean;
  /** Linha de apoio embaixo — o que o número quer dizer. */
  nota?: string;
}

/**
 * Uma fileira de números.
 *
 * Sem faísca, sem ícone, sem moldura por número. Isso é deliberado: quatro
 * cartões com borda, ícone e gráfico em miniatura competem entre si e com o
 * gráfico de verdade que vem logo abaixo. O que se quer aqui é LER quatro
 * números — e pra isso o que ajuda é tamanho, alinhamento e espaço, não caixa.
 *
 * A variação vai com o SINAL escrito, não só com a cor: cor sozinha não chega
 * em quem não distingue vermelho de verde.
 */
export function Numeros({ itens, className = "" }: { itens: NumeroDado[]; className?: string }) {
  return (
    <Fila className={`lj-nums ${className}`.trim()}>
      {itens.map((n) => {
        const bom = n.variacao == null || n.variacao === 0
          ? null
          : n.inverter ? n.variacao < 0 : n.variacao > 0;
        return (
          <div className="lj-num" key={n.rotulo}>
            <span className="lj-num-rot">{n.rotulo}</span>
            <strong className="lj-num-val">{n.valor}</strong>
            {n.variacao != null && n.variacao !== 0 && (
              <span className="lj-num-var" data-bom={bom ? "1" : "0"}>
                <Icon name={n.variacao > 0 ? "arrow-up" : "arrow-down"} size={12}
                  color={bom ? "var(--ok)" : "var(--perigo)"} />
                {n.variacao > 0 ? "+" : "−"}{Math.abs(Math.round(n.variacao * 100))}%
              </span>
            )}
            {n.nota && <span className="lj-num-nota">{n.nota}</span>}
          </div>
        );
      })}
    </Fila>
  );
}

// ── Bloco ────────────────────────────────────────────────────────────────────

/**
 * Um bloco de conteúdo com título.
 *
 * O título é do BLOCO, não uma etiqueta em caixa alta de 10px: seções da mesma
 * tela em dois tamanhos e duas caixas diferentes fazem a pessoa procurar a
 * hierarquia em vez de lê-la.
 */
export function Bloco({ titulo, acao, className = "", children }: {
  titulo?: ReactNode;
  acao?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`lj-bloco ${className}`.trim()}>
      {(titulo || acao) && (
        <header className="lj-bloco-cab">
          {titulo && <h2>{titulo}</h2>}
          {acao && <div className="lj-bloco-acao">{acao}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** O que um bloco mostra quando não há o que mostrar. */
export function Vazio({ icone = "inbox", titulo, texto, acao }: {
  icone?: string;
  titulo: string;
  texto?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="lj-vazio t-stagger is-shown">
      <span className="lj-vazio-ico" aria-hidden="true">
        <Icon name={icone} size={19} color="var(--text-dim)" />
      </span>
      <strong className="t-stagger-line t-stagger-line--1">{titulo}</strong>
      {texto && <span className="t-stagger-line t-stagger-line--2">{texto}</span>}
      {acao && <div className="lj-vazio-acao">{acao}</div>}
    </div>
  );
}
