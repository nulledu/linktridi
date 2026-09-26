"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GRÁFICOS MONO-ROUNDED
//
// Direção de arte única para todo gráfico do sistema. O visual mora no
// `globals.css` (bloco "GRÁFICO MONO-ROUNDED"); aqui está a geometria.
//
// A regra que organiza tudo: **a cor do gráfico é a cor DA PESSOA.** A rampa
// `--graf-1..6` deriva do destaque escolhido no painel do usuário (giros de
// matiz em volta dele, ver `paletaDeGrafico` em `lib/aparencia.ts`), então
// trocar o destaque de violeta pra jade repinta todo gráfico do app junto com
// botão, sidebar e marca. Antes repintava tudo MENOS o gráfico: a Tridify tinha
// seis cores escolhidas no arquivo, o painel de TV outras oito, e nenhuma tinha
// relação com a identidade escolhida.
//
// Três coisas continuam fora da rampa, e cada uma por um motivo:
//  · a série de APOIO (meta, ano passado, linha de base) é cinza tracejada — se
//    ela também fosse colorida, disputaria atenção com o dado que a pessoa veio
//    ver;
//  · cor de ESTADO (lucro/prejuízo, dentro/fora da meta) vem da paleta
//    semântica, não daqui: verde significa uma coisa e não pode virar rosa
//    porque alguém trocou o destaque;
//  · a parede de TV pode pedir `data-graf="mono"` e voltar pra tinta e cinza —
//    seis matizes vizinhos a três metros viram um borrão.
//
// A rampa inteira é calibrada pela MESMA conta do texto (`corDeTexto`), contra a
// pior superfície de cada tema. Um traço de gráfico é tinta fina sobre uma
// superfície, igual a um link — não tinha por que ter medida própria.
//
// Por que SVG à mão e não uma biblioteca: o alvo do `browserslist` deste
// repositório vai até o Chrome 51 (o WebView do tablet do galpão), o painel de
// TV renderiza sem interação nenhuma, e o bundle já carrega o ERP inteiro.
// A conta abaixo cabe em um arquivo.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../Icon";

// ── Geometria ────────────────────────────────────────────────────────────────

export type Ponto = { rotulo: string; valor: number };

/**
 * Curva cúbica MONÓTONA (Fritsch–Carlson). É o "rounded" do nome: o traço
 * passa por todos os pontos com curvas suaves.
 *
 * Monótona e não um spline qualquer porque um spline comum ULTRAPASSA os
 * pontos: entre duas vendas de 100 e 0 a curva desce abaixo de zero e o
 * gráfico mostra um prejuízo que não existiu. A correção de Fritsch–Carlson
 * garante que a curva nunca sai do intervalo dos dados vizinhos.
 */
export function caminhoSuave(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  if (n === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;

  // Inclinação de cada segmento.
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    d.push(dx === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx);
  }

  // Tangente em cada ponto: média das inclinações vizinhas.
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) {
    // Extremo local (a curva vira): tangente ZERO. Sem isto a curva estufa
    // pra fora justamente no pico, que é o ponto que a pessoa está olhando.
    m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  }
  m.push(d[n - 2]);

  // Correção de Fritsch–Carlson: encolhe a tangente quando ela é agressiva
  // demais para o segmento. É o que impede o "passar do ponto".
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }

  let caminho = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (pts[i + 1].x - pts[i].x) / 3;
    caminho +=
      ` C${(pts[i].x + dx).toFixed(2)},${(pts[i].y + m[i] * dx).toFixed(2)}` +
      ` ${(pts[i + 1].x - dx).toFixed(2)},${(pts[i + 1].y - m[i + 1] * dx).toFixed(2)}` +
      ` ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`;
  }
  return caminho;
}

/** Comprimento aproximado de um caminho, pra alimentar o `stroke-dasharray` do
 *  desenho progressivo. Aproximar pela soma das retas erra pouco (a curva é
 *  suave) e evita depender de `getTotalLength`, que exige o nó já no DOM. */
export function comprimento(pts: { x: number; y: number }[], sx = 1, sy = 1): number {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += Math.hypot((pts[i].x - pts[i - 1].x) * sx, (pts[i].y - pts[i - 1].y) * sy);
  return Math.ceil(t * 1.06) || 1;
}

/** Escala HORIZONTAL do palco: quanto o `preserveAspectRatio="none"` estica o
 *  viewBox pra caber na largura real. Ela existe por causa do
 *  `vector-effect: non-scaling-stroke`: o tracejado do desenho progressivo é
 *  medido em PIXEL DE TELA, não em unidade do viewBox. Num card largo o
 *  caminho real fica 2–3× maior que a soma das retas, o `stroke-dasharray`
 *  curto demais vira padrão REPETIDO e a linha nasce com buracos — o defeito
 *  aparecia como "gráfico com parte invisível" no painel do Marketing. */
export function useEscalaX(ref: { current: Element | null }, W: number): number {
  const [sx, setSx] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setSx(w / W);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, W]);
  return sx;
}

/** Escala "bonita" pro eixo: 1, 2, 2.5 ou 5 vezes uma potência de 10. Um teto
 *  cru (o próprio máximo) põe a linha de grade em 8.437, que ninguém lê. */
export function tetoRedondo(max: number): number {
  if (max <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const r = max / p;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p;
}

const nf = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/**
 * Cor da enésima série, da rampa personalizada.
 *
 * `--graf-1..6` derivam da cor que a pessoa escolheu (ver `paletaDeGrafico` em
 * `lib/aparencia.ts`): a primeira série é a própria cor do sistema e as
 * seguintes são giros de matiz em volta dela. Trocar o destaque repinta todo
 * gráfico do app.
 *
 * Cicla em 6 e não estoura: com mais de seis séries no mesmo palco o problema
 * não é de cor, é de gráfico — e aí a rampa repetir é o menor dos defeitos.
 */
export const corDaSerie = (i: number) => `var(--graf-${(i % 6) + 1})`;
/** Número curto pro eixo: 12.400 vira "12,4 mil". Rótulo de eixo é referência,
 *  não valor exato — o exato aparece na dica. */
export function curto(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return nf(n);
}

// ── Casca do cartão ──────────────────────────────────────────────────────────

/**
 * Cartão de gráfico: rótulo em caixa alta, selo com o tipo, número grande e o
 * palco embaixo. O palco é a moldura própria do gráfico — sem ele o traço
 * encosta na borda do cartão e o gráfico lê como adesivo colado.
 */
/**
 * O que um gráfico mostra quando não há o que mostrar.
 *
 * Não é enfeite: é a correção de um defeito. Com dado zerado o eixo do
 * `MonoLinha` imprimia "0 0 1 1 1" (o teto arredondado de zero é 1, e cinco
 * linhas de grade sobre 1 arredondam para isso), a faísca do KPI virava três
 * tracinhos soltos e a rosca desenhava um anel cinza gigante ao lado de um
 * texto espremido em quatro linhas. Três desenhos diferentes, todos dizendo a
 * mesma coisa — "não tem nada aqui" — e nenhum dizendo isso.
 *
 * Um gráfico sem dado não é um gráfico. Ocupa a mesma altura pra o cartão não
 * pular quando o primeiro dado chegar, e entra com a subida escalonada do
 * `t-stagger`: a linha de cima primeiro, a de apoio 40 ms depois, que é o ritmo
 * com que se lê.
 */
export function MonoVazio({
  altura = 170, icone = "chart-line", titulo = "Ainda sem dado", texto,
}: {
  altura?: number;
  icone?: string;
  titulo?: string;
  texto?: string;
}) {
  return (
    <div className="mono-vazio t-stagger is-shown" style={{ minHeight: altura }}>
      <span className="mono-vazio-ico" aria-hidden="true">
        <Icon name={icone} size={20} color="var(--text-dim)" />
      </span>
      <strong className="t-stagger-line t-stagger-line--1">{titulo}</strong>
      {texto && <span className="t-stagger-line t-stagger-line--2">{texto}</span>}
    </div>
  );
}

export function MonoCartao({
  rotulo, selo, valor, unidade, acoes, legenda, className = "", style, children,
}: {
  rotulo: string;
  /** O TIPO do gráfico ("Linha", "Barras"). Diz o que a pessoa está vendo
   *  antes de ela decifrar o desenho. */
  selo?: string;
  valor?: ReactNode;
  unidade?: string;
  acoes?: ReactNode;
  legenda?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={className ? `mono-card glass glass-spec mt-eleva ${className}` : "mono-card glass glass-spec mt-eleva"} style={style}>
      <div className="mono-cab">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span className="mono-rot">{rotulo}</span>
            {selo && <span className="mono-selo">{selo}</span>}
          </div>
          {valor !== undefined && (
            <div className="mono-valor">{valor}{unidade && <small>{unidade}</small>}</div>
          )}
        </div>
        {acoes && <div style={{ flex: "none" }}>{acoes}</div>}
      </div>
      <div className="mono-palco">{children}</div>
      {legenda && <div className="mono-legenda">{legenda}</div>}
    </div>
  );
}

/** Entrada de legenda. Repete o TRAÇO (cheio × tracejado) e não só a cor —
 *  em preto e branco, ou pra quem não distingue matiz, duas cores viram a mesma
 *  coisa. */
export function MonoLegenda({ itens, desligadas, aoAlternar }: {
  itens: { nome: string; apoio?: boolean; cor?: string }[];
  /** Nomes das séries escondidas. Só vale com `aoAlternar`. */
  desligadas?: ReadonlySet<string>;
  /**
   * Torna cada entrada um botão que liga/desliga a série no gráfico. Quem
   * chama filtra as séries (use `useSeriesLigadas`) — a legenda só avisa. A
   * entrada desligada continua na legenda, apagada: se sumisse, não haveria
   * onde clicar pra trazer a linha de volta.
   */
  aoAlternar?: (nome: string) => void;
}) {
  // O índice da legenda tem que ser o MESMO que o do gráfico, senão o quadradinho
  // e o traço saem em cores diferentes e a legenda passa a mentir. As entradas de
  // apoio não consomem posição na rampa — no gráfico elas também não consomem.
  let serie = 0;
  return (
    <>
      {itens.map((it) => {
        const cor = it.apoio ? undefined : it.cor || corDaSerie(serie++);
        const traco = <i style={cor ? { borderTopColor: cor } : undefined} />;
        if (!aoAlternar) {
          return <span key={it.nome} data-mono={it.apoio ? "apoio" : undefined}>{traco}{it.nome}</span>;
        }
        const ligada = !desligadas?.has(it.nome);
        return (
          <button key={it.nome} type="button" className="mono-leg-alt" data-mono={it.apoio ? "apoio" : undefined}
            aria-pressed={ligada} title={ligada ? `Esconder ${it.nome}` : `Mostrar ${it.nome}`}
            onClick={() => aoAlternar(it.nome)}>
            {traco}{it.nome}
          </button>
        );
      })}
    </>
  );
}

/**
 * Estado de "quais linhas estão ligadas" pra um gráfico com legenda
 * alternável. Nunca deixa desligar a ÚLTIMA série ligada — gráfico vazio não
 * responde pergunta nenhuma e parece quebrado.
 */
export function useSeriesLigadas(nomes: string[], inicialDesligadas: string[] = []) {
  const [desligadas, setDesligadas] = useState<Set<string>>(() => new Set(inicialDesligadas));
  const alternar = useCallback((nome: string) => {
    setDesligadas((d) => {
      const n = new Set(d);
      if (n.has(nome)) n.delete(nome);
      else if (nomes.filter((x) => !n.has(x)).length > 1) n.add(nome);
      return n;
    });
  }, [nomes]);
  return { desligadas, alternar, ligada: (nome: string) => !desligadas.has(nome) };
}

// ── Dica ao passar o ponteiro ────────────────────────────────────────────────

/** Índice sob o ponteiro, medido em fração da largura. Funciona igual no dedo
 *  (o `pointer*` cobre toque) — no celular a pessoa arrasta o dedo pela linha
 *  e lê os valores, que é o gesto natural ali. */
function useCursor(n: number) {
  const caixa = useRef<HTMLDivElement | null>(null);
  const [i, setI] = useState<number | null>(null);

  const mover = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = caixa.current;
    if (!el || n < 1) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setI(Math.round(f * (n - 1)));
  }, [n]);

  const sair = useCallback(() => setI(null), []);
  return { caixa, i, props: { onPointerMove: mover, onPointerLeave: sair, onPointerCancel: sair } };
}

function Dica({ x, texto, valor, cor }: { x: number; texto: string; valor: string; cor?: string }) {
  // O balão vira de lado nas pontas, senão sai do cartão: à esquerda ancora
  // pela esquerda, à direita pela direita, no meio centraliza.
  const desloc = x > 72 ? "-100%" : x < 16 ? "0%" : "-50%";
  return (
    <div
      style={{
        position: "absolute", left: `${x}%`, top: 2, transform: `translateX(${desloc})`,
        background: "var(--pop-bg, var(--surface-2))", border: "1px solid var(--border)",
        borderRadius: "var(--r-xs)", padding: "5px 9px", fontSize: 12, fontWeight: 700,
        whiteSpace: "nowrap", pointerEvents: "none", zIndex: 4,
        boxShadow: "0 2px 6px rgb(0 0 0 / .18), 0 12px 30px -14px rgb(0 0 0 / .5)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ color: "var(--text-dim)", marginRight: 6 }}>{texto}</span>
      <span style={{ color: cor || "var(--text)" }}>{valor}</span>
    </div>
  );
}

// ── Linha / área ─────────────────────────────────────────────────────────────

export type SerieMono = {
  nome: string;
  pontos: Ponto[];
  /** Série de apoio: cinza e tracejada. Só UMA série é a principal. */
  apoio?: boolean;
  /** Cor explícita. Use só quando ela SIGNIFICA algo (verde = lucro). */
  cor?: string;
};

/**
 * Linha (ou área) mono-rounded. O primeiro traço se desenha da esquerda pra
 * direita na primeira pintura — o único movimento do gráfico, e o que diz
 * "este dado acabou de chegar" sem piscar a tela.
 */
export function MonoLinha({
  series, altura = 170, area = false, formatar = nf, grade = 4, eixoX = true, eixoY = true, rotuloDe,
}: {
  series: SerieMono[];
  altura?: number;
  area?: boolean;
  formatar?: (n: number) => string;
  /** Quantas linhas de grade horizontais. */
  grade?: number;
  eixoX?: boolean;
  eixoY?: boolean;
  /** Encurta o rótulo do eixo X (ex.: "2026-08-18" → "18/08"). */
  rotuloDe?: (r: string) => string;
}) {
  const id = useId().replace(/:/g, "");
  const principal = series.find((s) => !s.apoio) || series[0];
  const n = Math.max(...series.map((s) => s.pontos.length), 1);
  const { caixa, i: hi, props } = useCursor(n);
  // Escala do palco: alimenta o `--mono-comp` em pixel de tela (ver `useEscalaX`).
  const escalaX = useEscalaX(caixa, 480);

  // Tudo zerado é "não aconteceu nada", não é uma curva rente ao chão. Desenhar
  // o palco assim imprimia um eixo de rótulos repetidos e uma linha reta que
  // parece defeito — o vazio explicado informa mais que o gráfico vazio.
  const maiorValor = Math.max(0, ...series.flatMap((s) => s.pontos.map((p) => p.valor)));
  const semDado = maiorValor <= 0 || !series.some((s) => s.pontos.length);

  // Depois dos ganchos, sempre: sair antes mudaria a quantidade de `useId` /
  // `useCursor` que o React vê entre um render e outro.
  if (semDado) return <MonoVazio altura={altura} icone="chart-line" texto="A curva aparece quando o primeiro número entrar." />;

  // Sistema de coordenadas fixo: o SVG estica em largura por `preserveAspect
  // Ratio="none"` e o `non-scaling-stroke` do CSS segura a espessura do traço.
  const W = 480, H = altura;
  const padE = eixoY ? 38 : 8, padD = 10, padT = 12, padB = eixoX ? 20 : 8;

  const teto = tetoRedondo(Math.max(1, ...series.flatMap((s) => s.pontos.map((p) => p.valor))));
  const x = (k: number) => padE + (n <= 1 ? (W - padE - padD) / 2 : (k / (n - 1)) * (W - padE - padD));
  const y = (v: number) => padT + (1 - v / teto) * (H - padT - padB);

  const linhasGrade = Array.from({ length: grade + 1 }, (_, k) => (teto / grade) * k);

  // Posição de cada série na rampa de cor, contando só as que recebem cor.
  const posicaoNaRampa = (() => {
    let p = 0;
    return series.map((s) => (s.apoio ? -1 : p++));
  })();

  return (
    <div ref={caixa} style={{ position: "relative", width: "100%", minWidth: 0 }} {...props}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: altura, display: "block" }}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${principal?.nome || "Série"}: ${principal?.pontos.length || 0} pontos, máximo ${formatar(Math.max(0, ...(principal?.pontos.map((p) => p.valor) || [0])))}`}
      >
        <defs>
          {/* Cor do degradê por STYLE e na mesma conta do traço: como atributo,
              `var(--graf-n)` não resolve, e `currentColor` dentro de <defs>
              herda do <svg>, não do <g> da série — três áreas saíam cinzas. */}
          {series.map((s, k) => {
            const tinta = s.cor || (s.apoio ? "var(--mono-tinta)" : corDaSerie(posicaoNaRampa[k]));
            return (
              <linearGradient key={k} id={`${id}-g${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: tinta, stopOpacity: 0.22 }} />
                <stop offset="100%" style={{ stopColor: tinta, stopOpacity: 0 }} />
              </linearGradient>
            );
          })}
        </defs>

        {/* Grade só horizontal: linha vertical num gráfico de tempo compete com
            o traço e não ajuda a ler nenhum valor. */}
        {linhasGrade.map((v, k) => (
          <line key={k} className="mono-grade-linha" x1={padE} y1={y(v)} x2={W - padD} y2={y(v)} />
        ))}
        {series.map((s, k) => {
          const pts = s.pontos.map((p, j) => ({ x: x(j), y: y(p.valor) }));
          if (!pts.length) return null;
          const linha = caminhoSuave(pts);
          // Sem cor explícita, cada série pega a sua da rampa personalizada.
          // Antes todas caíam em `--mono-tinta` e duas séries no mesmo palco
          // saíam IDÊNTICAS — indistinguíveis, com a legenda dizendo que eram
          // coisas diferentes. A de apoio fica fora: ela é a meta/linha de base,
          // e o cinza tracejado é o que a mantém de fundo.
          //
          // A posição na rampa é `posicaoNaRampa[k]`, não `k`: uma série de apoio
          // no meio da lista não pode consumir uma cor, senão a legenda (que
          // conta do mesmo jeito) aponta o quadradinho errado.
          const cor = s.apoio ? undefined : s.cor || corDaSerie(posicaoNaRampa[k]);
          return (
            <g key={s.nome} style={cor ? { color: cor } : undefined}>
              {area && !s.apoio && (
                <path
                  d={`${linha} L${pts[pts.length - 1].x.toFixed(2)},${H - padB} L${pts[0].x.toFixed(2)},${H - padB} Z`}
                  fill={`url(#${id}-g${k})`}
                  style={{ color: cor || "var(--mono-tinta)" }}
                />
              )}
              <path
                className="mono-serie"
                data-mono={s.apoio ? "apoio" : undefined}
                data-mt="desenhar"
                d={linha}
                style={{
                  ...(cor ? { stroke: cor } : null),
                  ["--mono-comp" as string]: comprimento(pts, escalaX),
                }}
              />
            </g>
          );
        })}

        {hi != null && (
          <line className="mono-cursor" x1={x(hi)} y1={padT} x2={x(hi)} y2={H - padB} />
        )}
        {hi != null && series.filter((s) => !s.apoio).map((s) => {
          const p = s.pontos[hi];
          if (!p) return null;
          return <circle key={s.nome} className="mono-ponto" cx={x(hi)} cy={y(p.valor)} r={4.5} style={s.cor ? { fill: s.cor } : undefined} />;
        })}

      </svg>

      {/* Rótulos de eixo — em HTML pelo mesmo motivo do <circle>/tooltip abaixo:
          o viewBox estica só a largura, e um <text> dentro dele sai com as
          letras esticadas junto. Vertical usa px cru (a altura não estica);
          horizontal usa % (acompanha o mesmo esticamento do resto do palco). */}
      {eixoY && linhasGrade.map((v, k) => (
        <span key={`t${k}`} className="mono-eixo-txt" style={{
          position: "absolute", left: `${((padE - 6) / W) * 100}%`, top: y(v),
          transform: "translate(-100%, -50%)", whiteSpace: "nowrap", pointerEvents: "none",
        }}>{curto(v)}</span>
      ))}
      {eixoX && principal?.pontos.map((p, k) => {
        // Um rótulo a cada N pontos: 30 dias em 480px de viewBox viram uma
        // mancha preta ilegível. Sempre mostra o primeiro e o último.
        const salto = Math.max(1, Math.ceil(n / 6));
        if (k % salto !== 0 && k !== n - 1) return null;
        const ancora = k === 0 ? "start" : k === n - 1 ? "end" : "middle";
        return (
          <span key={k} className="mono-eixo-txt" style={{
            position: "absolute", left: `${(x(k) / W) * 100}%`, top: H - 5,
            transform: `translate(${ancora === "start" ? "0" : ancora === "end" ? "-100%" : "-50%"}, -100%)`,
            whiteSpace: "nowrap", pointerEvents: "none",
          }}>{rotuloDe ? rotuloDe(p.rotulo) : p.rotulo}</span>
        );
      })}

      {hi != null && principal?.pontos[hi] && (
        <Dica
          x={(x(hi) / W) * 100}
          texto={rotuloDe ? rotuloDe(principal.pontos[hi].rotulo) : principal.pontos[hi].rotulo}
          valor={formatar(principal.pontos[hi].valor)}
          cor={principal.cor}
        />
      )}
    </div>
  );
}

/** Área é linha com preenchimento — atalho pra não repetir `area` em toda tela. */
export function MonoArea(p: Omit<Parameters<typeof MonoLinha>[0], "area">) {
  return <MonoLinha {...p} area />;
}

// ── Barras pílula ────────────────────────────────────────────────────────────

/**
 * Barras em PÍLULA — a assinatura do conjunto. O raio é metade da largura da
 * barra, e a base fica reta na linha de base: `rx` no `<rect>` arredondaria os
 * quatro cantos e a barra pareceria flutuar.
 */
export function MonoBarras({
  pontos, altura = 170, formatar = nf, destaque, horizontal = false, rotuloDe,
}: {
  pontos: Ponto[];
  altura?: number;
  formatar?: (n: number) => string;
  /** Índice pintado na cor de destaque (o "hoje", o recorde). */
  destaque?: number;
  horizontal?: boolean;
  rotuloDe?: (r: string) => string;
}) {
  const n = pontos.length || 1;
  const { caixa, i: hi, props } = useCursor(n);
  const W = 480, H = altura, padE = 38, padD = 10, padT = 12, padB = 20;
  const teto = tetoRedondo(Math.max(1, ...pontos.map((p) => p.valor)));

  if (horizontal) {
    const alturaBarra = Math.min(26, (H - padT - padB) / Math.max(1, n) - 6);
    return (
      <div ref={caixa} style={{ position: "relative", width: "100%", minWidth: 0 }} {...props}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: altura, display: "block" }} role="img"
          aria-label={`Barras: ${pontos.map((p) => `${p.rotulo} ${formatar(p.valor)}`).join(", ")}`}>
          {pontos.map((p, k) => {
            const yy = padT + k * ((H - padT - padB) / Math.max(1, n)) + 3;
            const larg = Math.max(alturaBarra, (p.valor / teto) * (W - padE - padD));
            return (
              <g key={p.rotulo + k}>
                <text className="mono-eixo-txt" x={padE - 6} y={yy + alturaBarra / 2 + 3} textAnchor="end">
                  {rotuloDe ? rotuloDe(p.rotulo) : p.rotulo}
                </text>
                <rect
                  className="mono-barra" data-mono={k === destaque ? "alta" : undefined} data-mt="crescer"
                  x={padE} y={yy} width={larg} height={alturaBarra}
                  rx={alturaBarra / 2}
                  style={{ ["--mt-i" as string]: k, transformOrigin: "0% 50%" }}
                />
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  const vao = (W - padE - padD) / n;
  const larguraBarra = Math.min(30, Math.max(5, vao * 0.55));

  return (
    <div ref={caixa} style={{ position: "relative", width: "100%", minWidth: 0 }} {...props}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: altura, display: "block" }} role="img"
        aria-label={`Barras: ${pontos.map((p) => `${p.rotulo} ${formatar(p.valor)}`).join(", ")}`}>
        {Array.from({ length: 5 }, (_, k) => {
          const v = (teto / 4) * k;
          const yy = padT + (1 - v / teto) * (H - padT - padB);
          return (
            <g key={k}>
              <line className="mono-grade-linha" x1={padE} y1={yy} x2={W - padD} y2={yy} />
              <text className="mono-eixo-txt" x={padE - 6} y={yy + 3} textAnchor="end">{curto(v)}</text>
            </g>
          );
        })}
        {pontos.map((p, k) => {
          const cx = padE + vao * k + vao / 2;
          // Piso na altura: uma barra de 1px não lê como "pouco", lê como
          // "nada". O mínimo é a própria largura, então a pílula fecha.
          const alt = Math.max(larguraBarra, (p.valor / teto) * (H - padT - padB));
          return (
            <rect
              key={p.rotulo + k}
              className="mono-barra"
              data-mono={k === destaque ? "alta" : undefined}
              data-mt="crescer"
              x={cx - larguraBarra / 2}
              y={H - padB - alt}
              width={larguraBarra}
              height={alt}
              rx={larguraBarra / 2}
              opacity={hi != null && hi !== k ? 0.42 : 1}
              style={{ ["--mt-i" as string]: k }}
            />
          );
        })}
        {pontos.map((p, k) => {
          const salto = Math.max(1, Math.ceil(n / 7));
          if (k % salto !== 0 && k !== n - 1) return null;
          return (
            <text key={`r${k}`} className="mono-eixo-txt" x={padE + vao * k + vao / 2} y={H - 5} textAnchor="middle">
              {rotuloDe ? rotuloDe(p.rotulo) : p.rotulo}
            </text>
          );
        })}
      </svg>
      {hi != null && pontos[hi] && (
        <Dica
          x={((padE + vao * hi + vao / 2) / W) * 100}
          texto={rotuloDe ? rotuloDe(pontos[hi].rotulo) : pontos[hi].rotulo}
          valor={formatar(pontos[hi].valor)}
        />
      )}
    </div>
  );
}

/** Barras empilhadas: uma pílula por coluna, com as fatias recortadas dentro
 *  dela. A rampa de tom (100%, 74%, 48%…) substitui uma paleta de cores —
 *  três categorias em três cores obrigam a consultar a legenda a cada coluna;
 *  três tons do mesmo cinza se leem por ordem. */
export function MonoBarrasEmpilhadas({
  colunas, altura = 170, formatar = nf,
}: {
  colunas: { rotulo: string; fatias: { nome: string; valor: number; cor?: string }[] }[];
  altura?: number;
  formatar?: (n: number) => string;
}) {
  const id = useId().replace(/:/g, "");
  const n = colunas.length || 1;
  const W = 480, H = altura, padE = 38, padD = 10, padT = 12, padB = 20;
  const teto = tetoRedondo(Math.max(1, ...colunas.map((c) => c.fatias.reduce((s, f) => s + f.valor, 0))));
  const vao = (W - padE - padD) / n;
  const larg = Math.min(30, Math.max(6, vao * 0.55));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: altura, display: "block" }} role="img"
      aria-label={`Barras empilhadas de ${n} colunas`}>
      {Array.from({ length: 5 }, (_, k) => {
        const v = (teto / 4) * k;
        const yy = padT + (1 - v / teto) * (H - padT - padB);
        return (
          <g key={k}>
            <line className="mono-grade-linha" x1={padE} y1={yy} x2={W - padD} y2={yy} />
            <text className="mono-eixo-txt" x={padE - 6} y={yy + 3} textAnchor="end">{curto(v)}</text>
          </g>
        );
      })}
      {colunas.map((c, k) => {
        const cx = padE + vao * k + vao / 2;
        const soma = c.fatias.reduce((s, f) => s + f.valor, 0);
        const altTotal = Math.max(larg, (soma / teto) * (H - padT - padB));
        const base = H - padB;
        let acumulado = 0;
        return (
          // A PÍLULA é da COLUNA, não da fatia de cima. Arredondar só a última
          // fatia parece certo até ela ser mais baixa que o raio: o SVG limita o
          // `ry` a metade da altura, a fatia de 15px com raio 15 vira uma cúpula
          // achatada e — como ela é a mais clara da rampa — lê como um blob
          // solto flutuando acima da barra. Medido: fatia de 14,96px com rx 15.
          //
          // Recortando a coluna inteira, as fatias são retângulos retos e quem
          // arredonda é o recorte. A fronteira entre fatias fica nítida e o topo
          // é uma pílula de verdade em qualquer proporção de dado.
          <g key={c.rotulo + k} clipPath={`url(#${id}-c${k})`}>
            <defs>
              <clipPath id={`${id}-c${k}`}>
                <rect x={cx - larg / 2} y={base - altTotal} width={larg} height={altTotal} rx={larg / 2} />
              </clipPath>
            </defs>
            {c.fatias.map((f, j) => {
              const alt = (f.valor / teto) * (H - padT - padB);
              const yy = base - acumulado - alt;
              acumulado += alt;
              return (
                <rect
                  key={f.nome}
                  className="mono-barra"
                  data-mt="crescer"
                  x={cx - larg / 2} y={yy} width={larg} height={Math.max(1, alt)}
                  style={{ ["--mt-i" as string]: k, ...{ fill: f.cor || corDaSerie(j) } }}
                >
                  <title>{`${c.rotulo} · ${f.nome}: ${formatar(f.valor)}`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}
      {/* O rótulo fica FORA do <g> recortado: dentro dele o recorte da coluna
          cortaria o texto do eixo pela metade. */}
      {colunas.map((c, k) => (
        <text key={`r${c.rotulo}${k}`} className="mono-eixo-txt" x={padE + vao * k + vao / 2} y={H - 5} textAnchor="middle">
          {c.rotulo}
        </text>
      ))}
    </svg>
  );
}

// ── Rosca e arco ─────────────────────────────────────────────────────────────

/**
 * Rosca de pontas retas com fresta entre fatias. Desenhada como um círculo com
 * `stroke-dasharray` em vez de `<path>` com arcos: a matemática de arco SVG
 * (`A rx ry ...`) erra a bandeira do arco maior em fatias > 50% — o bug
 * clássico de rosca que vira meia-lua quando uma categoria domina.
 */
export function MonoRosca({
  fatias, tamanho = 168, espessura = 16, centro, formatar = nf,
}: {
  fatias: { nome: string; valor: number; cor?: string }[];
  tamanho?: number;
  espessura?: number;
  /** O que fica escrito no buraco. */
  centro?: ReactNode;
  formatar?: (n: number) => string;
}) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  // INTERATIVA (19/09, pedido do dono): apontar uma fatia a engrossa, apaga
  // as vizinhas e o CENTRO passa a dizer o que ela é (nome, valor, %). Vale
  // pra toda rosca do app de uma vez — no toque, tocar a fatia faz o mesmo.
  const [foco, setFoco] = useState<number | null>(null);
  // Rosca de total zero era um anel cinza do tamanho cheio ao lado de um texto
  // espremido: o maior elemento da tela sendo o que menos informa.
  if (total <= 0) {
    return <MonoVazio altura={tamanho} icone="chart-pie" texto="As fatias aparecem na primeira venda." />;
  }
  // −3 no raio: o traço da fatia FOCADA engrossa +4 (2px pra cada lado), e
  // sem essa folga ele estourava a caixa do svg — a rosca "quase saindo do
  // widget". A folga vive dentro do viewBox; nada vaza do card.
  const r = (tamanho - espessura) / 2 - 3;
  const circ = 2 * Math.PI * r;
  const fFoco = foco != null ? fatias[foco] : null;

  return (
    <div style={{ position: "relative", width: tamanho, maxWidth: "100%", margin: "0 auto", aspectRatio: "1" }}
      onPointerLeave={() => setFoco(null)}>
      <svg viewBox={`0 0 ${tamanho} ${tamanho}`} style={{ width: "100%", height: "100%", display: "block", transform: "rotate(-90deg)" }}
        role="img" aria-label={`Rosca: ${fatias.map((f) => `${f.nome} ${formatar(f.valor)}`).join(", ")}`}>
        <circle
          cx={tamanho / 2} cy={tamanho / 2} r={r}
          fill="none" stroke="var(--mono-grade)" strokeWidth={espessura}
        />
        {(() => {
          // HOVER (25/09, bug "um lado se sobrepõe ao outro"): com ponta
          // REDONDA cada fatia avança espessura/2 sobre a vizinha, e a que
          // vem depois no DOM pinta por cima — ao engrossar a focada, a ponta
          // dela ficava por baixo da seguinte e a seguinte invadia. Agora a
          // ponta é reta, cada fatia deixa uma fresta de 2px e a FOCADA é
          // desenhada por último: nenhuma fatia cobre a outra.
          const fresta = fatias.filter((f) => f.valor > 0).length > 1 ? 2 : 0;
          let acc = 0;
          const arcos = fatias.map((f, k) => {
            const frac = f.valor / total;
            const ini = acc; acc += frac;
            return { f, k, frac, ini };
          });
          const ordem = foco == null ? arcos : [...arcos.filter((a) => a.k !== foco), arcos[foco]];
          return ordem.map(({ f, k, frac, ini }) => (
            <circle
              key={f.nome}
              className="mono-arco"
              data-mt="encher"
              cx={tamanho / 2} cy={tamanho / 2} r={r}
              fill="none"
              stroke={f.cor || corDaSerie(k)}
              strokeWidth={foco === k ? espessura + 4 : espessura}
              strokeLinecap="butt"
              strokeDasharray={`${Math.max(0, frac * circ - fresta).toFixed(2)} ${circ.toFixed(2)}`}
              strokeDashoffset={(-ini * circ).toFixed(2)}
              onPointerEnter={() => setFoco(k)}
              onPointerDown={() => setFoco(k)}
              style={{
                ["--mono-comp" as string]: circ.toFixed(0),
                opacity: foco != null && foco !== k ? 0.3 : 1,
                transition: "opacity var(--duration-quick, 150ms) var(--ease-out, ease-out), stroke-width var(--duration-quick, 150ms) var(--ease-out, ease-out)",
                cursor: "default",
              }}
            >
              <title>{`${f.nome}: ${formatar(f.valor)} (${Math.round(frac * 100)}%)`}</title>
            </circle>
          ));
        })()}
      </svg>
      {(centro !== undefined || fFoco) && (
        <div style={{
          position: "absolute", inset: 0, display: "grid", placeItems: "center",
          textAlign: "center", pointerEvents: "none", padding: espessura + 6,
        }}>
          {fFoco ? (
            <span style={{ lineHeight: 1.3, minWidth: 0 }}>
              <strong className="stat" style={{ display: "block", fontSize: 15, fontWeight: 800, color: "var(--text)" }}>{formatar(fFoco.valor)}</strong>
              <span style={{ display: "block", fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: tamanho - espessura * 2 - 24 }}>
                {fFoco.nome} · {Math.round((fFoco.valor / total) * 100)}%
              </span>
            </span>
          ) : centro}
        </div>
      )}
    </div>
  );
}

/** Arco de medidor (0 a 100%). Meia-lua com ponta arredondada. */
export function MonoArco({
  valor, maximo = 100, tamanho = 170, espessura = 14, cor, rotulo,
}: {
  valor: number; maximo?: number; tamanho?: number; espessura?: number; cor?: string; rotulo?: ReactNode;
}) {
  const frac = Math.min(1, Math.max(0, maximo === 0 ? 0 : valor / maximo));
  const r = (tamanho - espessura) / 2;
  // Meia-volta: o arco vai de 180° a 360°, então o comprimento útil é metade
  // da circunferência.
  const meia = Math.PI * r;

  return (
    <div style={{ position: "relative", width: tamanho, maxWidth: "100%", margin: "0 auto" }}>
      <svg viewBox={`0 0 ${tamanho} ${tamanho / 2 + espessura}`} style={{ width: "100%", display: "block" }}
        role="img" aria-label={`${Math.round(frac * 100)}%`}>
        <path
          d={`M${espessura / 2},${tamanho / 2} A${r},${r} 0 0 1 ${tamanho - espessura / 2},${tamanho / 2}`}
          fill="none" stroke="var(--mono-grade)" strokeWidth={espessura} strokeLinecap="round"
        />
        <path
          className="mono-arco"
          data-mt="desenhar"
          d={`M${espessura / 2},${tamanho / 2} A${r},${r} 0 0 1 ${tamanho - espessura / 2},${tamanho / 2}`}
          fill="none" stroke={cor || "var(--mono-tinta)"} strokeWidth={espessura} strokeLinecap="round"
          strokeDasharray={`${(frac * meia).toFixed(2)} ${meia.toFixed(2)}`}
          style={{ ["--mono-comp" as string]: meia.toFixed(0) }}
        />
      </svg>
      {rotulo !== undefined && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, textAlign: "center", pointerEvents: "none" }}>{rotulo}</div>
      )}
    </div>
  );
}

// ── Funil ────────────────────────────────────────────────────────────────────

/** Funil: cada etapa é uma pílula e a largura é a taxa contra a PRIMEIRA
 *  etapa. A queda percentual vai escrita ao lado — num funil o que importa é
 *  onde as pessoas somem, e isso não se lê comparando larguras. */
export function MonoFunil({
  etapas, formatar = nf,
}: {
  etapas: { nome: string; valor: number }[];
  formatar?: (n: number) => string;
}) {
  const base = etapas[0]?.valor || 1;
  return (
    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
      {etapas.map((e, k) => {
        const frac = Math.max(0.04, e.valor / base);
        const anterior = k > 0 ? etapas[k - 1].valor : null;
        const queda = anterior && anterior > 0 ? 1 - e.valor / anterior : null;
        return (
          <div key={e.nome} style={{ display: "grid", gap: 3, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, minWidth: 0 }}>
              <span style={{ color: "var(--text-dim)", fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.nome}</span>
              <strong className="mt-num" style={{ marginLeft: "auto", flex: "none" }}>{formatar(e.valor)}</strong>
              {queda != null && (
                <span className="mt-num" style={{ flex: "none", fontSize: 11, fontWeight: 700, color: queda > 0.5 ? "var(--perigo)" : "var(--text-dim)" }}>
                  -{Math.round(queda * 100)}%
                </span>
              )}
            </div>
            <div style={{ height: 12, borderRadius: 999, background: "var(--mono-grade)", overflow: "hidden" }}>
              <div
                className="mono-barra"
                data-mt="crescer"
                style={{
                  width: `${(frac * 100).toFixed(1)}%`, height: "100%", borderRadius: 999,
                  background: `color-mix(in srgb, var(--mono-tinta) ${100 - k * 14}%, transparent)`,
                  ["--mt-i" as string]: k,
                  transformOrigin: "0% 50%",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Malha de atividade (mapa de calor) ───────────────────────────────────────

/** Grade de células por intensidade. Serve pra "atividade por dia", "vendas
 *  por hora × dia da semana" e o calendário de produção. */
export function MonoMalha({
  celulas, colunas = 20, formatar = nf,
}: {
  celulas: { chave: string; valor: number; titulo?: string }[];
  colunas?: number;
  formatar?: (n: number) => string;
}) {
  const max = Math.max(1, ...celulas.map((c) => c.valor));
  return (
    <div className="mono-malha" style={{ ["--mono-cols" as string]: colunas }} role="img"
      aria-label={`Mapa de atividade com ${celulas.length} células, máximo ${formatar(max)}`}>
      {celulas.map((c) => (
        <span
          key={c.chave}
          className="mono-celula"
          style={{ ["--mono-n" as string]: Math.round((c.valor / max) * 88) + (c.valor > 0 ? 12 : 0) }}
          title={c.titulo || `${c.chave}: ${formatar(c.valor)}`}
        />
      ))}
    </div>
  );
}

// ── Faísca e KPI ─────────────────────────────────────────────────────────────

/** Faísca: a mesma curva monótona, sem eixo nem grade. Cabe dentro de um KPI. */
export function MonoFaisca({ valores, altura = 34, cor, area = true }: {
  valores: number[]; altura?: number; cor?: string; area?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const n = valores.length;
  if (!n) return <div style={{ height: altura }} />;
  const W = 120, H = altura, pad = 3;
  const max = Math.max(...valores), min = Math.min(...valores);

  // Sem variação nenhuma (o caso comum: tudo zero) a faísca virava três
  // tracinhos soltos — o desenho da linha é animado por `stroke-dasharray`, e
  // sobre uma reta o tracejado fica à mostra. Uma régua discreta diz "nada
  // aconteceu" sem parecer que o gráfico quebrou.
  if (max === min) {
    return (
      <div style={{ height: altura, display: "flex", alignItems: "center" }} aria-hidden="true">
        <span style={{ display: "block", width: "100%", height: 1, background: "var(--mono-grade, var(--border))" }} />
      </div>
    );
  }

  const faixa = max - min || 1;
  const pts = valores.map((v, i) => ({
    x: pad + (n <= 1 ? (W - pad * 2) / 2 : (i / (n - 1)) * (W - pad * 2)),
    y: pad + (1 - (v - min) / faixa) * (H - pad * 2),
  }));
  const linha = caminhoSuave(pts);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: altura, display: "block" }} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
          {/* stop-color via STYLE, não atributo: atributo de apresentação não
              aceita var(), e a tinta da faísca agora pode chegar como token
              (--tf-spark) de um escopo acima. Mesmo desenho quando é cor crua. */}
          <stop offset="0%" style={{ stopColor: cor || "currentColor", stopOpacity: 0.26 }} />
          <stop offset="100%" style={{ stopColor: cor || "currentColor", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {area && <path d={`${linha} L${pts[n - 1].x.toFixed(2)},${H} L${pts[0].x.toFixed(2)},${H} Z`} fill={`url(#${id}-f)`} style={{ color: cor || "var(--mono-tinta)" }} />}
      <path className="mono-serie" data-mt="desenhar" d={linha}
        style={{ stroke: cor || corDaSerie(0), strokeWidth: 2, ["--mono-comp" as string]: comprimento(pts) }} />
    </svg>
  );
}

/**
 * Cartão de KPI mono-rounded: rótulo, número que conta, variação e faísca.
 * A variação NÃO é só a seta colorida — o sinal vai escrito, porque cor
 * sozinha não chega em quem não distingue vermelho de verde.
 */
export function MonoKpi({
  rotulo, valor, formatar = nf, variacao, inverter, historico, icone, cor, aoClicar, style,
}: {
  rotulo: string;
  valor: number;
  formatar?: (n: number) => string;
  /** Fração (0.12 = +12%). */
  variacao?: number | null;
  /** Quando cair é bom (custo, devolução). */
  inverter?: boolean;
  historico?: number[];
  icone?: string;
  cor?: string;
  aoClicar?: () => void;
  /**
   * Estilo de fora. Existe por causa do `Fila`: ele carimba `--mt-i` (o índice
   * do item) em cada filho por `style`, e um componente que não repassa a prop
   * simplesmente engole o índice — a fileira inteira entra no mesmo quadro e o
   * escalonamento não acontece, sem erro nenhum pra denunciar.
   */
  style?: CSSProperties;
}) {
  const bom = variacao == null ? null : inverter ? variacao < 0 : variacao > 0;
  const corVar = variacao == null || variacao === 0 ? "var(--text-dim)" : bom ? "var(--ok)" : "var(--perigo)";
  const Tag = aoClicar ? "button" : "div";

  return (
    <Tag
      onClick={aoClicar}
      className={`mono-card glass glass-spec mt-eleva${aoClicar ? " ui-card-alvo" : ""}`}
      style={{ textAlign: "left", width: "100%", cursor: aoClicar ? "pointer" : undefined, color: "var(--text)", font: "inherit", ...style }}
    >
      <div className="mono-cab">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="mono-rot" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {icone && <Icon name={icone} size={13} color={cor || "var(--text-dim)"} />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rotulo}</span>
          </span>
          <div className="mono-valor" style={cor ? { color: cor } : undefined}>
            <NumeroSimples valor={valor} formatar={formatar} />
          </div>
          {variacao != null && (
            <div className="mt-num" style={{ fontSize: 11.5, fontWeight: 700, color: corVar, marginTop: 2 }}>
              {variacao > 0 ? "+" : ""}{(variacao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
              <span style={{ color: "var(--text-dim)", fontWeight: 600 }}> vs anterior</span>
            </div>
          )}
        </div>
      </div>
      {historico && historico.length > 1 && (
        <MonoFaisca valores={historico} cor={cor} />
      )}
    </Tag>
  );
}

/** Número que conta até o valor.
 *
 *  Começa NO valor, não em zero: na primeira pintura o dado já é o que o
 *  servidor mandou, e contar do zero toda vez que a tela monta transformaria
 *  cada navegação num espetáculo. A contagem só acontece quando o número MUDA
 *  no cliente — que é exatamente o momento em que ela informa alguma coisa
 *  ("o poll trouxe dado novo"). */
function NumeroSimples({ valor, formatar }: { valor: number; formatar: (n: number) => string }) {
  // Mesma blindagem do `NumeroVivo` (ui/micro.tsx): o quadro intermediário vive
  // separado, e sem contagem em curso o texto sai do `valor` de verdade. Guardar
  // o número mostrado no estado deixava um valor PARCIAL na tela sempre que a
  // animação morria no meio — e um número errado que parece certo é pior que
  // gráfico nenhum.
  const [emVoo, setEmVoo] = useState<number | null>(null);
  const antes = useRef(valor);

  useEffect(() => {
    const de = antes.current;
    antes.current = valor;
    if (de === valor) { setEmVoo(null); return; }
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setEmVoo(null); return; }
    let q = 0, t0 = 0;
    const passo = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / 700);
      if (p >= 1) { setEmVoo(null); return; }
      setEmVoo(de + (valor - de) * (1 - Math.pow(2, -10 * p)));
      q = requestAnimationFrame(passo);
    };
    q = requestAnimationFrame(passo);
    return () => { cancelAnimationFrame(q); setEmVoo(null); };
  }, [valor]);

  return <span className="mt-num">{formatar(emVoo ?? valor)}</span>;
}
