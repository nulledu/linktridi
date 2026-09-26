"use client";

// ── As peças das telas novas do Financeiro (set/2026) ────────────────────────
// O desenho pedido: número grande com seta pra onde ele leva, uma faixa de
// três painéis por cima, e a lista repartida em cartões de EMPRESA. Tudo aqui
// é desenho — nenhuma consulta sai deste arquivo.

import { Icon } from "../Icon";
import { Cartao, Marca, TituloCartao, ValorKpi, Vazio } from "./ui";
import { Fila } from "../ui/micro";
import { Botao } from "../ui/controles";
import { agruparPorEmpresa } from "@/lib/financeiro/periodo";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { dataBR, moeda } from "@/lib/financeiro/calculos";
import "./financeiro-micro.css";

// ── Pílula que viaja (Kinetics 005) ──────────────────────────────────────────
// Mede o alvo ativo e devolve onde a pílula deve estar. Mesmo contrato do
// `Abas` do kit: `offset*` (nunca o rect, que viria com transform), só anima
// depois da primeira medição e remede quando a fileira muda de largura (fonte
// carregando, janela girando).
type Caixa = { x: number; y: number; w: number; h: number };

function usePilula(raiz: RefObject<HTMLElement | null>, medir: (r: HTMLElement) => Caixa | null, chave: string) {
  const pilula = useRef<HTMLSpanElement>(null);
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const [pronta, setPronta] = useState(false);
  const medirRef = useRef(medir);
  medirRef.current = medir;

  useLayoutEffect(() => {
    if (raiz.current) setCaixa(medirRef.current(raiz.current));
  }, [raiz, chave]);

  // Reflow forçado entre posicionar e ligar a transição: sem ele as duas
  // mutações caem no mesmo cálculo e a pílula desliza de x=0 ao abrir.
  useLayoutEffect(() => {
    if (!caixa || pronta) return;
    void pilula.current?.offsetWidth;
    setPronta(true);
  }, [caixa, pronta]);

  useEffect(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setCaixa(medirRef.current(el)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [raiz]);

  return { pilula, caixa, pronta };
}

// ── Número com seta ──────────────────────────────────────────────────────────

/** O tom pinta o cartão inteiro: o que está pago é verde, o atrasado é vermelho. */
export type TomDoKpi = "neutro" | "ok" | "perigo" | "atencao";

const COR_DO_TOM: Record<TomDoKpi, string> = {
  neutro: "var(--primary-texto)",
  ok: "var(--ok)",
  perigo: "var(--perigo)",
  atencao: "var(--atencao)",
};

/**
 * O número que LEVA a algum lugar.
 *
 * O cartão de número parado obriga a pessoa a traduzir sozinha "R$ 104 mil a
 * pagar" em "filtrar a lista por em aberto". A seta faz isso num toque — e é
 * um `<button>` de verdade, com 44px, não um enfeite.
 */
export function KpiSeta({ icone, rotulo, valor, detalhe, tom = "neutro", aoAbrir, href, tituloDaSeta }: {
  icone: string; rotulo: string; valor: string; detalhe?: string;
  tom?: TomDoKpi;
  /** Sem `aoAbrir` nem `href` o cartão é só número — e a seta nem aparece. */
  aoAbrir?: () => void;
  /** Para a tela de servidor, que não pode mandar função pela fronteira. */
  href?: string;
  tituloDaSeta?: string;
}) {
  const cor = COR_DO_TOM[tom];
  // Degraus mais finos que antes, com piso legível em 15px. O piso importa no
  // celular: a coluna do valor (entre o ícone e a seta, os dois de 44px) tem
  // só ~90px num cartão de carrossel — "R$ 134.899,90" a 19px não cabe nela
  // de jeito nenhum, e o corte virava "R$ 134.…", justo o dado principal do
  // cartão. Os degraus de 12/13/15 caracteres não existiam antes (tudo acima
  // de 12 caía direto em 19px); eles ficam para o valor de verdade ENCOLHER
  // antes de precisar quebrar linha.
  const corpo =
    valor.length > 14 ? 15 :
    valor.length > 12 ? 17 :
    valor.length > 11 ? 20 :
    23;
  // `moeda()` separa "R$" do número com ESPAÇO FIXO (U+00A0, do
  // `Intl.NumberFormat` pt-BR) — de propósito, pra "R$" nunca ficar sozinho
  // no fim de uma frase corrida. Aqui é o oposto: é exatamente onde a quebra
  // deve poder acontecer quando o valor não cabe numa linha só. Sem esta
  // troca `white-space: normal` não tem NENHUM ponto de quebra (espaço fixo
  // não quebra, por definição) e o texto só transborda, sem nunca quebrar.
  const valorExibido = valor.replace(/\u00A0/g, " ");
  return (
    <Cartao
      padding={16}
      style={tom === "neutro" ? undefined : { background: `color-mix(in srgb, ${cor} 7%, var(--surface))` }}
    >
      <div className="fin-kpiseta-row" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span
          aria-hidden
          className="fin-kpiseta-ico"
          style={{
            width: 44, height: 44, flex: "none", borderRadius: 13, display: "grid", placeItems: "center",
            background: `color-mix(in srgb, ${cor} 14%, transparent)`,
          }}
        >
          <Icon name={icone} size={21} color={cor} />
        </span>
        <span style={{ display: "grid", gap: 1, flex: 1, minWidth: 0 }}>
          <small style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)", lineHeight: 1.3 }}>{rotulo}</small>
          {/* Conta até o valor (Kinetics 062), igual ao `Kpi` — o corpo da
              fonte sai do texto FINAL, então nada pula durante a contagem.
              Sem `nowrap`/ellipsis: o valor PODE quebrar linha, mas só no
              espaço que já existe depois do "R$" — não há hífen nem
              `overflow-wrap: anywhere` aqui, então o número nunca parte no
              meio. Duas linhas legíveis valem mais que "R$ 134.…". */}
          <ValorKpi
            valor={valorExibido}
            className="stat"
            style={{
              fontSize: corpo, fontWeight: 800, letterSpacing: "-.02em", color: cor,
              whiteSpace: "normal", wordBreak: "keep-all", overflowWrap: "normal", minWidth: 0,
              fontVariantNumeric: "tabular-nums",
            }}
          />
          {detalhe && (
            <small style={{ fontSize: 11.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {detalhe}
            </small>
          )}
        </span>
        {(aoAbrir || href) && (() => {
          const rotuloDaSeta = tituloDaSeta ?? `Ver ${rotulo.toLowerCase()}`;
          // Alvo de 44×44 (HIG, `var(--tap)`) com a MESMA pegada de 34px no
          // layout: a margem negativa devolve os 10px que o alvo cresceu, e o
          // círculo que se vê continua sendo o de dentro. Era 34×34 — pequeno
          // pro dedo, e é a única ação do cartão.
          const estilo: React.CSSProperties = {
            width: 44, height: 44, margin: -5, flex: "none", display: "grid", placeItems: "center", padding: 0,
            borderRadius: "50%", border: "none", cursor: "pointer", background: "transparent", color: cor,
          };
          const seta = (
            <span aria-hidden style={{ width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${cor} 12%, transparent)` }}>
              <Icon name="chevron-right" size={17} />
            </span>
          );
          return href
            ? <a href={href} title={rotuloDaSeta} aria-label={rotuloDaSeta} style={estilo}>{seta}</a>
            : <button type="button" onClick={aoAbrir} title={rotuloDaSeta} aria-label={rotuloDaSeta} style={estilo}>{seta}</button>;
        })()}
      </div>
    </Cartao>
  );
}

// ── Agenda: a data como carimbo ──────────────────────────────────────────────

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

/** `2026-09-14` → `14` / `SET`. Fatia texto, sem `Date`: fuso não entra aqui. */
export function carimboDaData(iso: string): { dia: string; mes: string } {
  const [, m, d] = iso.slice(0, 10).split("-");
  return { dia: d ?? "--", mes: MESES[Number(m) - 1] ?? "" };
}

export interface ItemDaAgenda {
  chave: string;
  vencimento: string;
  titulo: string;
  sub?: string;
  valor: number;
  /** Já venceu: o carimbo fica vermelho. */
  atrasado?: boolean;
  aoAbrir?: () => void;
}

/**
 * A lista de vencimentos com a data como CARIMBO, não como texto corrido.
 *
 * "14 SET" num bloco à esquerda se lê de relance; "14/09/2026" no meio da
 * frase, não. É a mesma informação com metade do esforço de leitura.
 */
export function Agenda({ itens, vazio }: { itens: ItemDaAgenda[]; vazio?: React.ReactNode }) {
  if (!itens.length) {
    return <>{vazio ?? <Vazio compacto icone="calendar-off" titulo="Nada vencendo por aqui" />}</>;
  }
  // `<Fila>` (Kinetics 054): os vencimentos chegam em cascata, com o atraso
  // saturado pelo `--mt-teto` — a 14ª linha não espera meio segundo.
  return (
    <Fila as="ol" style={{ display: "grid", gap: 6, listStyle: "none", margin: 0, padding: 0 }}>
      {itens.map((i) => {
        const { dia, mes } = carimboDaData(i.vencimento);
        const cor = i.atrasado ? "var(--perigo)" : "var(--primary-texto)";
        const conteudo = (
          <>
            {/* O carimbo é desenho (aria-hidden) — sem isto o leitor de tela
                lia título e valor e NUNCA a data, e "atrasado" era só cor. */}
            <span className="so-leitor">{`Vence em ${dataBR(i.vencimento)}${i.atrasado ? ", atrasado" : ""}. `}</span>
            <span
              aria-hidden
              style={{
                width: 40, flex: "none", display: "grid", placeItems: "center", gap: 0, padding: "5px 0",
                borderRadius: 11, background: `color-mix(in srgb, ${cor} 11%, transparent)`, color: cor,
              }}
            >
              <strong style={{ fontSize: 15, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{dia}</strong>
              <small style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", lineHeight: 1.15 }}>{mes}</small>
            </span>
            <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 1 }}>
              <strong style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {i.titulo}
              </strong>
              {i.sub && (
                <small style={{ fontSize: 11.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i.sub}
                </small>
              )}
            </span>
            <strong style={{ flex: "none", fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {moeda(i.valor)}
            </strong>
          </>
        );
        const estilo: React.CSSProperties = {
          display: "flex", alignItems: "center", gap: 11, minWidth: 0, width: "100%",
          minHeight: "var(--tap)", padding: "4px 2px", textAlign: "start",
          background: "none", border: "none", font: "inherit", color: "inherit",
        };
        return (
          <li key={i.chave} style={{ minWidth: 0 }}>
            {i.aoAbrir
              ? <button type="button" onClick={i.aoAbrir} style={{ ...estilo, cursor: "pointer" }}>{conteudo}</button>
              : <span style={estilo}>{conteudo}</span>}
          </li>
        );
      })}
    </Fila>
  );
}

/**
 * A saída do cartão, na largura toda.
 *
 * O link de texto no rodapé de um painel some no meio do conteúdo; a borda em
 * volta e a largura inteira dizem "isto leva a outro lugar" sem precisar ler.
 */
export function BotaoLargo({ children, href, onClick }: {
  children: React.ReactNode; href?: string; onClick?: () => void;
}) {
  const estilo: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%",
    minHeight: "var(--tap)", marginTop: 12, padding: "0 12px", borderRadius: "var(--r-sm)",
    border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
    font: "inherit", fontSize: 13, fontWeight: 700, textDecoration: "none", cursor: "pointer",
  };
  const dentro = <>{children}<Icon name="chevron-right" size={15} /></>;
  return href
    ? <a href={href} className="ui-card-alvo" style={estilo}>{dentro}</a>
    : <Botao bloco iconeFim="chevron-right" onClick={onClick} style={{ marginTop: 12 }}>{children}</Botao>;
}

/** O "Ver todos →" que mora no CABEÇALHO do painel, não no rodapé. */
export function VerTudo({ href, onClick, children = "Ver todos" }: {
  href?: string; onClick?: () => void; children?: React.ReactNode;
}) {
  const estilo: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 4, flex: "none", minHeight: "var(--tap)",
    padding: "0 6px", marginInlineEnd: -6, borderRadius: "var(--r-sm)", border: "none",
    background: "none", font: "inherit", fontSize: 12.5, fontWeight: 700,
    color: "var(--primary-texto)", textDecoration: "none", cursor: "pointer", whiteSpace: "nowrap",
  };
  const dentro = <>{children}<Icon name="chevron-right" size={14} /></>;
  return href
    ? <a href={href} style={estilo}>{dentro}</a>
    : <button type="button" onClick={onClick} style={estilo}>{dentro}</button>;
}

/**
 * O painel cuja lista ROLA por dentro, em vez de esticar a fileira inteira.
 *
 * Numa faixa lado a lado, o cartão mais alto puxa todos: seis vencimentos
 * deixavam "Por categoria" com meia tela de vazio embaixo. Aqui a lista não
 * conta pra altura — quem decide a fileira são os vizinhos, e este cartão
 * fica do tamanho deles. Ver `.fin-painel-rola` no globals.css.
 */
export function PainelRolante({ icone, titulo, direita, rodape, children }: {
  icone: string; titulo: React.ReactNode; direita?: React.ReactNode;
  rodape?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    // `height: 100%` e não só o `stretch` da fileira: com o miolo absoluto o
    // cartão fica com altura intrínseca pequena, e o navegador conta ELA em
    // vez de esticar. Com 100% ele resolve contra a fileira e copia a altura
    // dos vizinhos — que é o ponto da peça.
    <Cartao style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", height: "100%", minHeight: 0 }}>
      <TituloCartao icone={icone} direita={direita}>{titulo}</TituloCartao>
      {/* Rolagem que só o mouse alcança não existe pra quem usa teclado:
          `tabIndex` deixa as setas rolarem a lista, e a região ganha nome. */}
      <div className="fin-painel-rola">
        <div tabIndex={0} role="region" aria-label={typeof titulo === "string" ? titulo : undefined}>{children}</div>
      </div>
      {rodape}
    </Cartao>
  );
}

// ── Cartão de empresa ────────────────────────────────────────────────────────

/**
 * O bloco de uma empresa dentro de uma lista repartida.
 *
 * O cabeçalho responde as três perguntas de uma vez — de quem é, quantos são,
 * quanto dá — porque em "Visão geral" a mesma conta existe em duas empresas e
 * a coluna sozinha não diz de quem é o número.
 */
export function CartaoEmpresa({ nome, contagem, total, acao, children, rodape }: {
  nome: string;
  /** "11 compromissos", "1 recorrência". Já vem escrito, com o plural certo. */
  contagem: string;
  total?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  return (
    <Cartao padding={0} style={{ display: "grid", gridTemplateRows: "auto 1fr auto", minWidth: 0, overflow: "hidden" }}>
      <header
        style={{
          display: "flex", alignItems: "center", gap: 11, minWidth: 0, flexWrap: "wrap",
          padding: "14px 16px", borderBottom: "1px solid var(--border)",
        }}
      >
        <Marca marca={{ nome, icone: "building-warehouse" }} tamanho={38} raio={11} />
        <span style={{ display: "grid", gap: 1, flex: 1, minWidth: 0 }}>
          <strong role="heading" aria-level={3} style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nome}
          </strong>
          <small style={{ fontSize: 12, color: "var(--text-dim)" }}>
            {contagem}{total ? ` · ${total}` : ""}
          </small>
        </span>
        {acao}
      </header>
      <div style={{ padding: "6px 16px 12px", minWidth: 0, display: "grid", alignContent: "start" }}>{children}</div>
      {rodape && (
        <footer style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", minWidth: 0 }}>{rodape}</footer>
      )}
    </Cartao>
  );
}

/**
 * A lista repartida em CARTÃO por empresa — a mesma peça de Compromissos e
 * Recorrências, para as telas não divergirem uma da outra.
 *
 * Com uma empresa aberta devolve a lista inteira, sem grade nem cabeçalho: o
 * nome da empresa já está no seletor do topo, e repeti-lo em cada bloco seria
 * ruído. Em "Visão geral" cada empresa vira um cartão com o quanto e o
 * quantos, mostrando as primeiras linhas; "Ver todos" abre UMA empresa em
 * largura inteira, sem sair da tela.
 *
 * A empresa sem nada ganha bloco assim mesmo: "esta empresa não tem nada" é
 * uma resposta, e some junto se o bloco sumir.
 */
export function ColunasPorEmpresa<T extends { empresa_id: string }>({
  linhas, empresas, empresaId, empresaNome, largura = 400, porBloco = 5,
  rotulo, total, vazio, children,
}: {
  linhas: T[];
  empresas: { id: string; nome: string }[];
  empresaId: string;
  empresaNome: string;
  /** Largura mínima de cada coluna antes de quebrar. */
  largura?: number;
  /** Quantas linhas o cartão fechado mostra antes do "Ver todos". */
  porBloco?: number;
  /** Como a contagem é lida: `{ um: "compra", muitos: "compras" }`. */
  rotulo?: { um: string; muitos: string };
  /** O total do bloco, já formatado. */
  total?: (itens: T[]) => string | undefined;
  /** O que aparece no cartão de uma empresa sem nada. */
  vazio?: React.ReactNode;
  children: (linhas: T[], empresa: { id: string; nome: string }) => React.ReactNode;
}) {
  const [foco, setFoco] = useState("");
  // Ao abrir UMA empresa, o "Ver todos" que tinha o foco some da tela; sem
  // isto o foco caía no <body> e o leitor de tela recomeçava do topo.
  const voltar = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (foco) voltar.current?.focus(); }, [foco]);
  const geral = !empresaId && empresas.length > 1;
  if (!geral) return <>{children(linhas, { id: empresaId, nome: empresaNome })}</>;

  const todos = agruparPorEmpresa(linhas, empresas, { incluirVazias: true });
  const blocos = foco ? todos.filter((b) => b.empresa.id === foco) : todos;
  if (!blocos.length) return <>{children([], { id: "", nome: "" })}</>;
  const nomes = rotulo ?? { um: "registro", muitos: "registros" };

  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      {foco && (
        <Botao ref={voltar} icone="chevron-left" onClick={() => setFoco("")} style={{ justifySelf: "start" }}>
          Voltar para todas as empresas
        </Botao>
      )}
      <GradeDeEmpresas largura={largura}>
        {blocos.map((b) => {
          const limite = foco === b.empresa.id ? b.itens.length : porBloco;
          const mostrando = Math.min(b.itens.length, limite);
          return (
            <CartaoEmpresa
              key={b.empresa.id}
              nome={b.empresa.nome}
              contagem={`${b.itens.length} ${b.itens.length === 1 ? nomes.um : nomes.muitos}`}
              total={total?.(b.itens)}
              acao={!foco && b.itens.length > porBloco
                ? <BotaoFinDoBloco onClick={() => setFoco(b.empresa.id)} />
                : undefined}
              rodape={
                mostrando < b.itens.length ? (
                  <BotaoLargo onClick={() => setFoco(b.empresa.id)}>
                    Ver {b.itens.length === 1 ? "o" : `os ${b.itens.length}`} {b.itens.length === 1 ? nomes.um : nomes.muitos}
                  </BotaoLargo>
                ) : (
                  <small style={{ display: "block", fontSize: 12, color: "var(--text-dim)" }}>
                    Mostrando {mostrando} de {b.itens.length} {b.itens.length === 1 ? nomes.um : nomes.muitos}
                  </small>
                )
              }
            >
              {b.itens.length === 0
                ? (vazio ?? <Vazio compacto icone="inbox" titulo="Nada cadastrado para esta empresa" />)
                : children(b.itens.slice(0, limite), b.empresa)}
            </CartaoEmpresa>
          );
        })}
      </GradeDeEmpresas>
    </div>
  );
}

/** O "Ver todos" do cabeçalho do cartão — mesmo desenho do resto do módulo. */
function BotaoFinDoBloco({ onClick }: { onClick: () => void }) {
  return <Botao iconeFim="arrow-right" onClick={onClick} style={{ flex: "none" }}>Ver todos</Botao>;
}

/** A grade dos cartões de empresa: colunas no computador, uma só no celular. */
export function GradeDeEmpresas({ children, largura = 400 }: { children: React.ReactNode; largura?: number }) {
  return (
    <div
      style={{
        display: "grid", gap: 16, alignItems: "start", minWidth: 0,
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${largura}px), 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A fileira de abas — o mesmo desenho de Notas, agora no kit.
 *
 * `.tab-strip` é da fundação: no celular ela rola de lado em vez de espremer
 * cinco abas numa tela de 320px, e a aba atual é trazida pra vista.
 */
export function FileiraDeAbas<T extends string>({ abas, valor, aoTrocar }: {
  abas: { id: T; label: string; icone: string; contagem?: React.ReactNode }[];
  valor: T;
  aoTrocar: (v: T) => void;
}) {
  const fileira = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fileira.current?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [valor]);
  // A cor da aba ativa agora é UMA pílula que viaja (Kinetics 005): trocar de
  // aba era um corte seco, a cor sumia de um lugar e aparecia no outro. Até a
  // primeira medição (e sem JS) o botão ativo pinta o próprio fundo.
  const { pilula, caixa, pronta } = usePilula(fileira, (r) => {
    const el = r.querySelector<HTMLElement>('[aria-current="page"]');
    return el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null;
  }, `${valor}|${abas.length}`);
  return (
    <div ref={fileira} className="tab-strip fin-abas" style={{ display: "flex", gap: 8, alignItems: "center", padding: 0 }}>
      {caixa && (
        <span
          ref={pilula}
          aria-hidden
          className="fin-abas-pilula"
          data-pronta={pronta ? "1" : undefined}
          style={{ transform: `translate(${caixa.x}px, ${caixa.y}px)`, width: caixa.w, height: caixa.h }}
        />
      )}
      {abas.map((a) => {
        const ativa = a.id === valor;
        const comPilula = ativa && !!caixa;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => aoTrocar(a.id)}
            aria-current={ativa ? "page" : undefined}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, minHeight: "var(--tap)", flex: "none",
              padding: "0 15px", borderRadius: "var(--r-pill)", cursor: "pointer", whiteSpace: "nowrap",
              fontSize: 13.5, fontWeight: 700,
              color: ativa ? "var(--text)" : "var(--text-dim)",
              background: comPilula ? "transparent" : ativa ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "var(--surface)",
              border: `1px solid ${comPilula ? "transparent" : ativa ? "color-mix(in srgb, var(--primary) 40%, var(--border))" : "var(--border)"}`,
              transition: "color var(--duration-fast) var(--ease-in-out)",
            }}
          >
            <Icon name={a.icone} size={16} color={ativa ? "var(--primary-texto)" : "var(--text-dim)"} />
            {a.label}
            {a.contagem != null && (
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                {a.contagem}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Etiqueta de categoria ────────────────────────────────────────────────────

/** A categoria como pílula da cor dela — lida de relance numa coluna estreita. */
export function Etiqueta({ texto, cor }: { texto: string; cor: string }) {
  return (
    <span
      style={{
        display: "inline-block", maxWidth: "100%", padding: "3px 9px", borderRadius: "var(--r-pill)",
        background: `color-mix(in srgb, ${cor} 14%, transparent)`,
        color: `color-mix(in srgb, ${cor} 82%, var(--text))`,
        fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis",
      }}
    >
      {texto}
    </span>
  );
}

// ── Alternador de visão ──────────────────────────────────────────────────────

/** Dois jeitos de ver a mesma lista: cartões ou tabela. */
export function TrocaDeVisao<T extends string>({ valor, aoTrocar, opcoes }: {
  valor: T; aoTrocar: (v: T) => void; opcoes: { id: T; icone: string; titulo: string }[];
}) {
  // O miolo roxo desliza de um segmento pro outro (Kinetics 005). A pílula é
  // medida no MIOLO de 38×34, não no botão de 44 — o alvo cresce, o desenho não.
  const raiz = useRef<HTMLDivElement>(null);
  const { pilula, caixa, pronta } = usePilula(raiz, (r) => {
    const btn = r.querySelector<HTMLElement>('[aria-pressed="true"]');
    const miolo = btn?.firstElementChild as HTMLElement | null | undefined;
    return btn && miolo
      ? { x: btn.offsetLeft + miolo.offsetLeft, y: btn.offsetTop + miolo.offsetTop, w: miolo.offsetWidth, h: miolo.offsetHeight }
      : null;
  }, `${valor}|${opcoes.length}`);
  return (
    <div ref={raiz} className="fin-visao" style={{ display: "inline-flex", gap: 4, padding: 3, borderRadius: "var(--r-sm)", background: "var(--surface-2)", flex: "none" }}>
      {caixa && (
        <span
          ref={pilula}
          aria-hidden
          className="fin-visao-pilula"
          data-pronta={pronta ? "1" : undefined}
          style={{ transform: `translate(${caixa.x}px, ${caixa.y}px)`, width: caixa.w, height: caixa.h }}
        />
      )}
      {opcoes.map((o) => {
        const ativo = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => aoTrocar(o.id)}
            title={o.titulo}
            aria-label={o.titulo}
            aria-pressed={ativo}
            style={{
              // 44×44 de alvo ocupando os mesmos 38×34 no layout: o segmento
              // que se vê (e pinta de roxo quando ativo) é o miolo.
              width: 44, height: 44, margin: "-5px -3px", display: "grid", placeItems: "center", padding: 0,
              cursor: "pointer", border: "none", background: "transparent",
            }}
          >
            <span
              aria-hidden
              className="fin-visao-ico"
              style={{
                width: 38, height: 34, display: "grid", placeItems: "center",
                borderRadius: "calc(var(--r-sm) - 3px)",
                background: ativo && !caixa ? "var(--primary)" : "transparent",
                color: ativo ? "var(--on-primary, #fff)" : "var(--text-dim)",
              }}
            >
              <Icon name={o.icone} size={17} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
