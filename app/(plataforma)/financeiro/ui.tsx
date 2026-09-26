"use client";

// ── Kit do Financeiro ────────────────────────────────────────────────────────
// As peças que TODAS as telas do módulo usam. Existe por um motivo concreto: a
// regra de celular mora aqui dentro, uma vez só. Uma tela que monte a própria
// tabela na mão vai esquecer o `data-l`, e aí a "tabela" de 6 colunas atravessa
// a tela de 320px — que é como 46 telas quebraram de uma vez neste repositório.
//
// Nada de emoji: iconografia é Tabler, via <Icon>. Nada de cor escrita na mão:
// só token semântico, senão o número some no tema claro.

import { useId, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { agruparPorEmpresa, andarMes, opcoesDePeriodo, type OpcaoPeriodo } from "@/lib/financeiro/periodo";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { travarRolagem } from "../ui/travaRolagem";
import { confirmar, toast } from "../Toast";
import { Botao, BotaoIcone } from "../ui/controles";
import { Alerta } from "../ui/Alerta";
import { Fila, NumeroVivo, origemDaAncora, useAbrirFechar, type OrigemFolha } from "../ui/micro";
import { corDaSerie } from "../ui/graficos";
import { dataBR, hojeISO, moeda } from "@/lib/financeiro/calculos";
import { montarCSV, nomeDoArquivo, type ColunaCSV } from "@/lib/financeiro/csv";
import type { MarcaVisual, Selo as SeloTipo } from "@/lib/financeiro/tipos";
import type { TipoDeMarca } from "@/lib/financeiro/anexos";
import type { Fatia } from "@/lib/financeiro/calculos";

export { moeda };

// ── Cartão base ──────────────────────────────────────────────────────────────

export function Cartao({ children, style, className = "", padding = 18, estatico, id }: {
  children: React.ReactNode; style?: React.CSSProperties; className?: string; padding?: number | string;
  /** Âncora `#id` — é como um "ver tudo" de um painel salta pra lista. */
  id?: string;
  /**
   * Tira a resposta ao ponteiro. Para o cartão que não é peça de conteúdo — o
   * aviso de schema, por exemplo: um banner que levanta no ponteiro promete um
   * clique que não existe, e a promessa vazia é pior que a imobilidade.
   */
  estatico?: boolean;
}) {
  // `.mt-eleva`: sobe no ponteiro, afunda no toque. O afundar é o que falta em
  // quase toda interface — sem ele, entre o dedo e a tela trocar não há
  // resposta nenhuma e a pessoa toca de novo.
  //
  // A borda inline continua ganhando do realce que a classe faria no `:hover`
  // (estilo inline vence folha de estilo), e isso é de propósito: o `AvisoSchema`
  // pinta a própria borda âmbar e ela não pode virar azul ao passar o mouse.
  return (
    <section
      id={id}
      className={[estatico ? "" : "mt-eleva", className].filter(Boolean).join(" ") || undefined}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--r-md)", padding, minWidth: 0, ...style,
      }}
    >
      {children}
    </section>
  );
}

export function TituloCartao({ icone, children, direita }: {
  icone: string; children: React.ReactNode; direita?: React.ReactNode;
}) {
  return (
    // QUEBRA quando não cabe. Sem isto, um `direita` largo (dois seletores, por
    // exemplo) tomava a linha inteira e o `min-width: 0` do <h2> deixava o
    // título espremido numa coluna de uma letra por linha — "L i s t a" — num
    // celular de 320px. Enquanto os dois cabem lado a lado nada muda; quando
    // não cabem, o `direita` desce inteiro para a linha de baixo.
    <header style={{ display: "flex", alignItems: "center", gap: 10, rowGap: 10, flexWrap: "wrap", marginBottom: 16, minWidth: 0 }}>
      <Icon name={icone} size={19} color="var(--primary-texto)" />
      {/* `1 1 12ch`: o título tem prioridade sobre o acessório, e o piso é o
          que decide QUANDO quebrar — sem ele o flex encolhe o <h2> até zero
          antes de considerar passar o `direita` para a linha seguinte. */}
      <h2 style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.01em", flex: "1 1 12ch", minWidth: 0 }}>{children}</h2>
      {direita}
    </header>
  );
}

// ── KPI ──────────────────────────────────────────────────────────────────────

/**
 * Fileira de números. `.kpi-row` é da fundação: no celular ela vira carrossel
 * com encaixe, em vez de espremer seis cartões numa tela de 320px.
 */
export function LinhaKpi({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="kpi-row"
      style={{
        display: "grid", gap: 14, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
      }}
    >
      {children}
    </div>
  );
}

/**
 * A parte numérica de um valor JÁ FORMATADO.
 *
 * O `valor` do KPI chega como texto pronto ("R$ 128.450,00", "12 dias", "—"):
 * é a tela que sabe se aquilo é dinheiro, contagem ou prazo, e tirar essa
 * decisão dela quebraria as oito telas. Para o número poder contar até o valor,
 * ele é reextraído aqui — o prefixo e o sufixo saem da conta e voltam inteiros,
 * então "R$ " e " dias" nunca entram no cálculo nem piscam durante a contagem.
 *
 * Só vale quando existe UM número no texto. "18/08/2026" tem três, e uma data
 * contando de zero até ela seria ruído puro; nesse caso o valor é pintado
 * parado, que é o comportamento de sempre.
 */
const NUMERO_PT = /-?\d+(?:\.\d{3})*(?:,\d+)?/g;

function numeroDoTexto(texto: string) {
  const achados = texto.match(NUMERO_PT);
  if (!achados || achados.length !== 1) return null;
  const bruto = achados[0];
  const n = Number(bruto.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const corte = texto.indexOf(bruto);
  return {
    n,
    antes: texto.slice(0, corte),
    depois: texto.slice(corte + bruto.length),
    // As casas decimais vêm do texto, não de um padrão: "R$ 12,50" tem duas e
    // "R$ 128,5 mil" tem uma. Recontar com um número fixo faria o valor mudar
    // de forma no último quadro da contagem.
    casas: bruto.split(",")[1]?.length ?? 0,
  };
}

/**
 * O valor de um cartão de número, contando até o texto pronto (Kinetics 062).
 * Mora aqui pra `Kpi` e `KpiSeta` (blocos.tsx) contarem do MESMO jeito — o
 * `KpiSeta` pintava o texto parado, e a Visão Geral contava enquanto as telas
 * de lista não. Texto sem número único ("—", uma data) é pintado parado.
 */
export function ValorKpi({ valor, className, style }: {
  valor: string; className?: string; style: React.CSSProperties;
}) {
  const numero = numeroDoTexto(valor);
  if (!numero) return <strong className={className} style={style}>{valor}</strong>;
  return (
    <NumeroVivo
      as="strong"
      className={className}
      style={style}
      valor={numero.n}
      formatar={(v) =>
        numero.antes +
        v.toLocaleString("pt-BR", { minimumFractionDigits: numero.casas, maximumFractionDigits: numero.casas }) +
        numero.depois
      }
    />
  );
}

export function Kpi({ icone, rotulo, valor, cor = "var(--primary-texto)", detalhe }: {
  icone: string; rotulo: string; valor: string; cor?: string; detalhe?: string;
}) {
  /**
   * O tamanho ACOMPANHA o número.
   *
   * Com 22px fixos, "R$ 128.450,00" não cabia na coluna de 190px e saía
   * "R$ 128.450,..." — justamente o saldo, o número mais importante da tela,
   * cortado. Dinheiro truncado é pior que dinheiro em corpo menor: reticências
   * escondem a ordem de grandeza, e é a ordem de grandeza que a pessoa lê
   * primeiro. Quebrar linha no meio de um valor não é opção (o "128" iria para
   * uma linha e o "450,00" para outra), então quem cede é o corpo da fonte.
   */
  const corpo = valor.length > 16 ? 17 : valor.length > 12 ? 19 : 22;

  // O tamanho sai do texto FINAL, não do que está na tela durante a contagem:
  // recalcular quadro a quadro faria o corpo da fonte pular de 22 para 17 no
  // meio da animação, e o cartão inteiro tremeria junto.
  const estiloValor: React.CSSProperties = {
    fontSize: corpo, fontWeight: 800, letterSpacing: "-.02em", color: cor,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums", minWidth: 0,
  };

  // Grade nomeada em vez de duas caixas empilhadas: é ela que permite o valor
  // MUDAR DE LUGAR no celular (ver `.fin-kpi` no globals.css) sem duplicar a
  // marcação. No computador o ícone fica ao lado do bloco de texto; no celular,
  // onde o cartão do carrossel tem 198px e o ícone comeria 27% deles, o valor
  // desce para uma linha própria e usa a largura toda.
  return (
    <Cartao padding={16}>
      <div className="fin-kpi">
        <span
          aria-hidden
          className="fin-kpi-ico"
          style={{
            width: 42, height: 42, flex: "none", borderRadius: 12, display: "grid", placeItems: "center",
            background: `color-mix(in srgb, ${cor} 14%, transparent)`,
          }}
        >
          <Icon name={icone} size={21} color={cor} />
        </span>
        <span className="fin-kpi-rot" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)", lineHeight: 1.3, minWidth: 0 }}>
          {rotulo}
        </span>
        {/* O número CHEGA contando. Serve para os dois momentos em que o KPI
            muda: a primeira pintura e o dado novo — e nos dois o olho é levado
            até o valor sem nada piscar. Quem pediu menos movimento recebe o
            número final na hora (o `NumeroVivo` já cuida disso). */}
        <ValorKpi valor={valor} className="fin-kpi-val" style={estiloValor} />
        {detalhe && (
          <span className="fin-kpi-det" style={{ fontSize: 11.5, color: "var(--text-dim)", minWidth: 0 }}>
            {detalhe}
          </span>
        )}
      </div>
    </Cartao>
  );
}

// ── Selo de status ───────────────────────────────────────────────────────────

export function Selo({ selo }: { selo: SeloTipo }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px",
        borderRadius: "var(--r-pill)", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
        color: selo.cor, background: `color-mix(in srgb, ${selo.cor} 13%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${selo.cor} 26%, transparent)`,
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: selo.cor, flex: "none" }} />
      {selo.label}
    </span>
  );
}

// ── Barras "resumo por X" ────────────────────────────────────────────────────

/**
 * Espessura da pílula. 7px lia como fio; a barra da família mono-rounded é
 * gorda o bastante para a ponta redonda APARECER — é ela que faz a peça
 * pertencer ao mesmo conjunto dos gráficos do resto do sistema.
 */
const ALTURA_BARRA = 9;

/**
 * A barra em pílula do conjunto mono-rounded.
 *
 * É um `<rect>` de SVG com `.mono-barra`, e não uma `<span>` com
 * `border-radius`: é assim que ela herda a tinta, a transição e o crescer
 * escalonado das barras do resto do sistema, sem esta tela guardar uma cópia
 * própria da arte.
 *
 * O SVG NÃO tem `viewBox` de propósito — uma unidade vale um pixel, então a
 * ponta continua um semicírculo em vez de esticar junto com a largura da
 * coluna, que é exatamente o que estraga uma pílula.
 */
function PilulaMono({ fracao, cor, altura = ALTURA_BARRA, indice = 0, opacidade }: {
  fracao: number; cor: string; altura?: number; indice?: number;
  /** Degrau da escada de opacidade do Monocharts, quando a barra acompanha
   *  uma fatia da rosca — ela precisa ter a MESMA tinta e o mesmo degrau. */
  opacidade?: number;
}) {
  return (
    // O desenho fica FORA DO FLUXO, dentro de uma caixa de altura fixa. Não é
    // capricho: um SVG sem `viewBox` não tem largura intrínseca, e na conta de
    // min-content o navegador cai no tamanho padrão de objeto — 300px. Numa
    // coluna de 200px isso estoura o bloco, e a 320px vira exatamente a rolagem
    // lateral que a fundação existe para impedir. Absoluto, ele não contribui
    // com largura nenhuma e o tamanho quem dá é a coluna.
    <span
      aria-hidden
      style={{ position: "relative", display: "block", width: "100%", minWidth: 0, height: altura }}
    >
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
        <rect x="0" y="0" width="100%" height={altura} rx={altura / 2} fill="var(--mono-grade)" />
        <rect
          className="mono-barra"
          data-mt="crescer"
          x="0" y="0" height={altura} rx={altura / 2}
          // Mínimo de 3%: proporção quase zero desenhava uma barra invisível, e
          // "não apareceu" lê como defeito, não como "é pouco".
          width={`${Math.max(3, Math.round(fracao * 100))}%`}
          // A cor vence a tinta da classe porque aqui ela LIGA a barra à fatia
          // correspondente — mesma tinta, mesmo degrau de opacidade. Trocar uma
          // das duas desligaria as peças uma da outra.
          style={{ fill: cor, opacity: opacidade, ["--mt-i" as string]: indice, transformOrigin: "0% 50%" }}
        />
      </svg>
    </span>
  );
}

export function Barras({ fatias, formatar = (v: number) => moeda(v), vazio }: {
  fatias: Fatia[]; formatar?: (v: number) => string;
  /** Mensagem própria para o card vazio. Sem ela, cai no genérico abaixo. */
  vazio?: React.ReactNode;
}) {
  if (!fatias.length) {
    return vazio ?? (
      <Vazio
        compacto
        icone="chart-bar"
        titulo="Nada lançado ainda"
        detalhe="O resumo aparece assim que houver o primeiro registro."
      />
    );
  }
  // Três colunas numa linha só: rótulo · barra · valor.
  //
  // Era rótulo+valor em cima e barra embaixo, ocupando duas alturas por fatia.
  // Numa coluna estreita cinco categorias viravam dez linhas e empurravam o
  // resto do painel para fora da dobra. Em UMA linha o olho compara as barras
  // sem varrer de cima a baixo, que é a única coisa que este bloco existe para
  // responder: qual é a maior.
  //
  // A grade é `auto minmax(0,1fr) auto`, então os rótulos ficam ALINHADOS entre
  // si e as barras começam todas na mesma coluna — com flex, cada linha
  // começaria num lugar diferente e a comparação visual iria por água abaixo.
  return (
    <div style={{ display: "grid", gap: 11, gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center" }}>
      {fatias.map((f, i) => (
        <Fragment key={f.id}>
          <span
            title={f.label}
            style={{
              fontSize: 13, fontWeight: 600, color: "var(--text)", maxWidth: 132,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {f.label}
          </span>
          <PilulaMono fracao={f.proporcao} cor={f.cor} indice={i} />
          <strong style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {formatar(f.valor)}
          </strong>
        </Fragment>
      ))}
    </div>
  );
}

// ── Rosca (distribuição) ─────────────────────────────────────────────────────

/**
 * Rosca com o TOTAL no buraco e a legenda ao lado.
 *
 * Desenhada AQUI, como um `<circle>` com `stroke-dasharray` — não como
 * `<path>` com arco SVG (a matemática de arco erra a bandeira do arco maior
 * assim que uma fatia passa de 50%: é a rosca que vira meia-lua justamente
 * quando uma categoria domina) e não mais pelo `MonoRoundedDonutChart`, que
 * montava o palco e não desenhava o anel — as três telas de cadastro
 * mostravam um retângulo roxo no lugar do gráfico.
 *
 * Uma COR POR FATIA (`corDaSerie`, a rampa derivada do destaque da pessoa):
 * a rosca de fatia única em escada de opacidade não se lia de longe, e é a
 * cor que amarra o arco à linha da legenda.
 *
 * O buraco carrega o TOTAL. Sem ele a rosca é decoração: a pessoa compara as
 * fatias, mas não sabe de quanto está falando.
 *
 * E o buraco RESPONDE ao ponteiro: passar o mouse por um arco (ou pela linha
 * da legenda) apaga o resto do anel e troca o total pelo que aquela fatia é —
 * nome, valor e percentual. O `<title>` do SVG continua lá para quem lê por
 * acessibilidade, mas ler um número exige parar em cima e esperar o balão do
 * sistema; aqui a resposta é imediata e no lugar onde o olho já está.
 */
export function Rosca({ fatias, total, rotuloTotal = "total", tamanho = 168, formatar = moeda }: {
  fatias: Fatia[]; total: string; rotuloTotal?: string; tamanho?: number;
  /** Como cada fatia é lida. Dinheiro por padrão; contagem ("14") quando a rosca é de gente. */
  formatar?: (v: number) => string;
}) {
  // Valor negativo é cortado em vez de somado: um arco negativo não existe,
  // ele só encolheria as outras fatias em silêncio.
  const positivas = fatias.map((f) => ({ ...f, valor: Math.max(f.valor, 0) }));
  const soma = positivas.reduce((s, f) => s + f.valor, 0);
  const espessura = Math.max(10, Math.round(tamanho * 0.13));
  // Quanto a fatia em foco engorda — e o anel já nasce com essa folga no raio,
  // senão a fatia grossa passa da `viewBox` e o navegador CORTA justamente a
  // que está em destaque (o clip do SVG não avisa, só some com o arco).
  const crescer = Math.max(3, Math.round(espessura * 0.28));
  const raio = (tamanho - espessura - crescer) / 2;
  const circ = 2 * Math.PI * raio;
  let acumulado = 0;
  // O total tem que caber NO BURACO. "R$ 15.400,00" com corpo fixo vazava por
  // cima do anel dos dois lados; aqui o corpo cede ao comprimento do texto
  // (0,55em por caractere é a medida da fonte tabular usada nos números).
  const buraco = tamanho - espessura * 2 - crescer;
  // O buraco é REDONDO: a linha de baixo não tem o diâmetro inteiro para si.
  // Medir pelo diâmetro fazia "Administrativo · 13,0%" nascer com 104px de
  // caixa num ponto onde a corda tem 70 — o texto cruzava o anel dos dois
  // lados e o número do centro sumia debaixo dele. `corda(y)` devolve a
  // largura real disponível na altura `y` (distância do centro).
  const raioInterno = raio - espessura / 2;
  const corda = (y: number) => Math.max(24, 2 * Math.sqrt(Math.max(0, raioInterno * raioInterno - y * y)));
  // A fatia em foco: ponteiro no arco OU na linha da legenda — as duas portas
  // acendem a mesma coisa, porque são a mesma coisa.
  const [emFoco, setEmFoco] = useState<string | null>(null);
  const foco = positivas.find((f) => f.id === emFoco) ?? null;
  const fracaoFoco = foco && soma > 0 ? foco.valor / soma : 0;
  // O texto do buraco: o total, ou a fatia. Ambos passam pela MESMA régua de
  // corpo, senão "Desenvolvimento" nasce do tamanho de "R$ 35 mil" e vaza.
  const textoCentro = foco ? formatar(foco.valor) : total;
  // O número ocupa a metade de CIMA do bloco; a corda que lhe interessa é a da
  // sua borda superior, não a do centro.
  const corpoBruto = Math.max(10, Math.min(Math.round(tamanho * 0.17), Math.floor(buraco / Math.max(3, textoCentro.length * 0.62))));
  const corpoTotal = Math.max(10, Math.min(corpoBruto, Math.floor(corda(corpoBruto * 0.9) / Math.max(3, textoCentro.length * 0.62))));
  // A linha de rótulo fica embaixo do número: `y` é a borda de baixo dela.
  const larguraRotulo = Math.round(corda(corpoTotal * 0.55 + 17));

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", minWidth: 0 }}>
      {/* `aspectRatio` e não `height` fixa: com altura travada e
          `maxWidth: 100%`, uma coluna mais estreita que `tamanho` encolhia só
          a largura e a rosca virava ELIPSE. Aqui a altura segue a largura. */}
      <div style={{ position: "relative", width: tamanho, maxWidth: "100%", aspectRatio: "1", flex: "none" }}>
        <svg
          viewBox={`0 0 ${tamanho} ${tamanho}`}
          style={{ width: "100%", height: "100%", display: "block", transform: "rotate(-90deg)" }}
          role="img"
          aria-label={`Rosca: ${positivas.map((f) => `${f.label} ${formatar(f.valor)}`).join(", ")}`}
        >
          {/* O trilho: sem ele, uma rosca de uma fatia só não se lê como anel. */}
          <circle cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none" strokeWidth={espessura}
            stroke="color-mix(in srgb, var(--text) 9%, transparent)" />
          {soma > 0 && positivas.map((f, i) => {
            const fracao = f.valor / soma;
            // 2px de respiro entre fatias — encostadas, duas cores vizinhas
            // viram uma só de longe. Fatia menor que o respiro não some: o
            // `max` garante o fiozinho que prova que ela existe.
            const arco = Math.max(1, fracao * circ - 2);
            const ativa = emFoco === f.id;
            const apagada = emFoco !== null && !ativa;
            const el = (
              <circle
                key={f.id}
                cx={tamanho / 2} cy={tamanho / 2} r={raio}
                fill="none"
                // A fatia em foco ENGORDA para fora do trilho — o anel inteiro
                // não muda de raio, então nada empurra o vizinho de lugar.
                strokeWidth={ativa ? espessura + crescer : espessura}
                stroke={f.cor || corDaSerie(i)}
                strokeDasharray={`${arco.toFixed(2)} ${(circ - arco).toFixed(2)}`}
                strokeDashoffset={(-acumulado * circ).toFixed(2)}
                opacity={apagada ? 0.28 : 1}
                onPointerEnter={() => setEmFoco(f.id)}
                onPointerDown={() => setEmFoco(f.id)}
                onPointerLeave={() => setEmFoco((atual) => (atual === f.id ? null : atual))}
                style={{
                  cursor: "pointer",
                  // Acender é direto; apagar demora um pouco mais e sai sem
                  // pressa — passar o ponteiro por cima de três arcos não pode
                  // virar estroboscópio.
                  transition: `stroke-width ${ativa ? "var(--duration-quick)" : "var(--duration-fast)"} var(--ease-smooth-out), opacity ${ativa ? "var(--duration-quick)" : "var(--duration-fast)"} var(--ease-smooth-out)`,
                }}
              >
                <title>{`${f.label}: ${formatar(f.valor)} (${Math.round(fracao * 100)}%)`}</title>
              </circle>
            );
            acumulado += fracao;
            return el;
          })}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", pointerEvents: "none", padding: espessura }}>
          {/* `key` remonta o bloco a cada troca de fatia: é o que faz a
              animação de troca de texto RODAR de novo em vez de ficar parada
              no primeiro estado. Troca de texto é simétrica — mesma duração
              nos dois sentidos, sem atraso. */}
          <div key={foco?.id ?? "total"} className="rosca-centro" style={{ minWidth: 0 }}>
            <div className="stat" style={{ fontSize: corpoTotal, lineHeight: 1.1, whiteSpace: "nowrap", maxWidth: Math.round(corda(corpoTotal * 0.9)), overflow: "hidden", textOverflow: "ellipsis" }}>{textoCentro}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.15, marginTop: 2, maxWidth: larguraRotulo,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {foco ? `${foco.label} · ${(fracaoFoco * 100).toFixed(1).replace(".", ",")}%` : rotuloTotal}
            </div>
          </div>
        </div>
      </div>

      {/* A legenda diz o que o arco não diz: QUANTO cada fatia vale. Dois
          arcos de 22% e 18% são indistinguíveis; o valor e o percentual ao
          lado resolvem sem cobrir a rosca de rótulos. A barrinha por fatia
          saiu — com uma cor por fatia ela repetia a mesma informação duas
          vezes e empurrava o cartão para baixo. */}
      <div
        style={{ flex: "1 1 140px", minWidth: 0, display: "grid", gap: 9 }}
        onPointerLeave={() => setEmFoco(null)}
      >
        {positivas.map((f, i) => {
          const parte = soma > 0 ? f.valor / soma : 0;
          const ativa = emFoco === f.id;
          const apagada = emFoco !== null && !ativa;
          return (
            <div
              key={f.id}
              className="rosca-item"
              data-ativa={ativa ? "1" : undefined}
              onPointerEnter={() => setEmFoco(f.id)}
              onPointerDown={() => setEmFoco(f.id)}
              onPointerLeave={() => setEmFoco((atual) => (atual === f.id ? null : atual))}
              style={{
                display: "flex", alignItems: "center", gap: 9, minWidth: 0, cursor: "pointer",
                opacity: apagada ? 0.42 : 1,
                transition: `opacity ${ativa ? "var(--duration-quick)" : "var(--duration-fast)"} var(--ease-smooth-out), background ${ativa ? "var(--duration-quick)" : "var(--duration-fast)"} var(--ease-smooth-out)`,
              }}
            >
              {/* MESMA cor da fatia correspondente — legenda que usa outra cor
                  que a rosca é uma legenda que mente. */}
              <span aria-hidden style={{
                width: 9, height: 9, borderRadius: "50%", background: f.cor || corDaSerie(i), flex: "none",
                // O ponto da legenda cresce junto com o arco: é o mesmo gesto
                // visto de dois lugares.
                transform: ativa ? "scale(1.34)" : "none",
                transition: `transform ${ativa ? "var(--duration-quick)" : "var(--duration-fast)"} var(--ease-smooth-out)`,
              }} />
              <span
                style={{
                  flex: 1, minWidth: 0, fontSize: 13, color: "var(--text-dim)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {f.label}
              </span>
              <strong style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
                color: ativa ? "var(--text)" : undefined }}>
                {formatar(f.valor)}
              </strong>
              <span style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {(parte * 100).toFixed(1).replace(".", ",")}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Limpar filtros ───────────────────────────────────────────────────────────

/**
 * Fecha a fileira de filtros, sempre no mesmo lugar.
 *
 * Antes ele SUMIA quando não havia filtro ligado. A intenção era não oferecer
 * uma ação sem efeito, mas o custo era pior: a fileira mudava de largura ao
 * escolher qualquer coisa, e o "limpar" aparecia num lugar diferente conforme
 * a quantidade de filtros. Agora o lugar é fixo e o estado é honesto — sem
 * nada para limpar ele fica `disabled` e apagado, então não promete ação.
 */
export function LimparFiltros({ ativo, aoLimpar }: { ativo: boolean; aoLimpar: () => void }) {
  return (
    <Botao
      variante="sutil"
      icone="filter"
      onClick={aoLimpar}
      disabled={!ativo}
      title={ativo ? "Voltar a mostrar tudo" : "Nenhum filtro ligado"}
      style={{ flex: "none", marginInlineStart: "auto" }}
    >
      Limpar filtros
    </Botao>
  );
}

/**
 * "Atualizando…" discreto, para o canto do título de uma lista enquanto a
 * árvore nova do servidor não chega (ver `useAtualizar`). Sem isto, entre o
 * clique em "Salvar" e a lista nova havia meio segundo em que a tela mostrava
 * o dado de ANTES sem dizer que algo estava a caminho — e a pessoa clicava de
 * novo, ou concluía que não tinha salvado.
 */
export function Atualizando({ ativo }: { ativo: boolean }) {
  if (!ativo) return null;
  return (
    <span
      role="status"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "var(--text-dim)", flex: "none" }}
    >
      <Icon name="loader" size={13} className="spin" color="var(--text-dim)" /> Atualizando…
    </span>
  );
}

// ── Lista lateral (próximas cobranças, últimas movimentações) ────────────────

export function ListaLateral({ itens, vazio }: {
  itens: { chave: string; icone: string; cor?: string; titulo: string; sub?: string; valor: string; valorCor?: string }[];
  vazio?: React.ReactNode;
}) {
  if (!itens.length) return <>{vazio ?? <Vazio compacto icone="inbox" titulo="Nada por aqui ainda" />}</>;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {itens.map((i) => (
        <div key={i.chave} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 2px", minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: 32, height: 32, flex: "none", borderRadius: 9, display: "grid", placeItems: "center",
              background: `color-mix(in srgb, ${i.cor ?? "var(--primary-texto)"} 13%, transparent)`,
            }}
          >
            <Icon name={i.icone} size={16} color={i.cor ?? "var(--primary-texto)"} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong
              style={{ display: "block", fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {i.titulo}
            </strong>
            {i.sub && <small style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{i.sub}</small>}
          </span>
          <strong
            style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", flex: "none", color: i.valorCor ?? "var(--text)", fontVariantNumeric: "tabular-nums" }}
          >
            {i.valor}
          </strong>
        </div>
      ))}
    </div>
  );
}

// ── Tabela que vira card no celular ──────────────────────────────────────────

/**
 * Vão entre colunas. Constante porque entra em DOIS lugares que precisam
 * concordar: o `gap` do grid e a conta da largura mínima. Quando eram dois
 * números soltos, o mínimo saía 60px menor que o real numa tabela de sete
 * colunas — e o grid, sem espaço, espremia a última em vez de deixar o bloco
 * rolar. Do lado de quem olha: "a coluna Status sumiu".
 */
const VAO_COLUNA = 10;

export interface Coluna<T> {
  chave: string;
  label: string;
  largura?: string;               // trilha do grid; use minmax(min(100%,Npx),1fr)
  fim?: boolean;                  // alinha à direita (valores)
  titulo?: boolean;               // no celular, ocupa a linha inteira em negrito
  soNoComputador?: boolean;       // some no card do celular (detalhe secundário)
  // No celular ocupa a linha inteira do card, em vez de meia largura. Para
  // texto que não cabe em metade: numa coluna de 50% o próprio RÓTULO racha no
  // meio da palavra. Prefira isto a `soNoComputador` quando o conteúdo IMPORTA
  // no celular — esconder o detalhe da auditoria num telefone esvazia a tela.
  largo?: boolean;
  celula: (linha: T) => React.ReactNode;
}

/**
 * No computador é grid de colunas; no celular cada linha vira um card de duas
 * colunas com rótulo em cima do valor (`.tab-linha` + `data-l`, da fundação).
 * Nenhuma tela precisa saber disso — é por isso que a peça existe.
 */
export function Tabela<T>({ colunas, linhas, chaveDe, aoClicar, vazio, paginar, rotuloItem = "registros" }: {
  colunas: Coluna<T>[];
  linhas: T[];
  chaveDe: (l: T) => string;
  aoClicar?: (l: T) => void;
  vazio?: React.ReactNode;
  /** Quantas linhas por página. Sem isto a tabela mostra tudo. */
  paginar?: number;
  rotuloItem?: string;
}) {
  const [porPagina, setPorPagina] = useState(paginar ?? 0);
  const [pagina, setPagina] = useState(1);

  const cols = colunas.map((c) => c.largura ?? "minmax(min(100%, 120px), 1fr)").join(" ");

  // `paginando` = está QUEBRANDO em páginas. `mostraRodape` = o rodapé aparece.
  // Não são a mesma coisa, e tratá-las como uma só foi o defeito: com 7 de 7
  // registros a tabela não some com nada, mas a pessoa também não tinha como
  // saber que são 7 — nem que não há mais nada embaixo. O rodapé sempre
  // responde "está vendo tudo?", que é a pergunta de quem chega no fim da
  // lista. Quem não passa `paginar` continua sem rodapé nenhum (é o caso dos
  // painéis de amostra, que mostram os 5 primeiros de propósito).
  const paginando = !!porPagina && linhas.length > porPagina;
  const mostraRodape = !!porPagina && linhas.length > 0;
  const totalPaginas = paginando ? Math.ceil(linhas.length / porPagina) : 1;
  // A página corrente é SATURADA em vez de guardada: filtrar de 40 para 5
  // linhas deixaria a pessoa parada na página 4, olhando uma tabela vazia e
  // achando que o filtro não achou nada.
  const atual = Math.min(pagina, totalPaginas);
  const inicio = paginando ? (atual - 1) * porPagina : 0;
  const visiveis = paginando ? linhas.slice(inicio, inicio + porPagina) : linhas;

  if (!linhas.length) return <>{vazio ?? <Vazio icone="inbox" titulo="Nada para mostrar" />}</>;

  // Largura mínima que estas colunas exigem para caber sem se espremer. Sai das
  // próprias trilhas declaradas — `112px` e o `Npx` de dentro de
  // `minmax(min(100%, Npx), …)` — em vez de ser um número chutado que envelhece
  // toda vez que alguém acrescenta uma coluna.
  //
  // Sem isso a grade transbordava o CARTÃO no computador e ia por cima do
  // painel da direita: as colunas "Valor" e "Status" apareciam escritas sobre
  // "Próximas ações". Com o mínimo declarado e o `overflow-x` do invólucro, o
  // excedente rola DENTRO do bloco — nunca na página (CLAUDE.md).
  const minimoDaTabela = colunas.reduce((soma, c) => {
    const t = c.largura ?? "minmax(min(100%, 120px), 1fr)";
    const dentroDoMin = t.match(/min\(\s*100%\s*,\s*(\d+)px\s*\)/);
    const fixa = t.match(/^\s*(\d+)px\s*$/);
    return soma + Number(dentroDoMin?.[1] ?? fixa?.[1] ?? 120);
    // + os VÃOS, contados abaixo: sem eles o mínimo ficava 60px curto numa
    // tabela de sete colunas, o grid espremia a última e "Status" nascia
    // cortada na borda do cartão em vez de o bloco rolar.
  }, 0) + VAO_COLUNA * Math.max(0, colunas.length - 1);

  return (
    // No celular as linhas viram card (`.tab-linha`), cabem sozinhas e o
    // `min-width` não vale — por isso ele fica no filho, e não aqui.
    <div style={{ overflowX: "auto", overscrollBehaviorX: "contain", minWidth: 0, margin: "0 -4px", padding: "0 4px" }}>
    {/* `.mt-fila`: as linhas entram escalonadas em vez de aparecerem todas de
        uma vez. É o que transforma "200 linhas apareceram" em "a lista
        chegou" — e o atraso satura em `--mt-teto`, então a última linha de uma
        página de 100 não espera quatro segundos. */}
    <div className="fin-tabela mt-fila" style={{ display: "grid", gap: 8, minWidth: minimoDaTabela }}>
      <div
        className="tab-linha-head"
        style={{
          display: "grid", gridTemplateColumns: cols, gap: VAO_COLUNA, padding: "0 12px 8px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {colunas.map((c) => (
          <span
            key={c.chave}
            style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", textAlign: c.fim ? "end" : "start" }}
          >
            {c.label}
          </span>
        ))}
      </div>

      {visiveis.map((l, k) => {
        const conteudo = colunas.map((c) => (
          <span
            key={c.chave}
            data-l={c.titulo ? undefined : c.label}
            className={[
              c.titulo ? "tl-titulo" : "",
              c.largo ? "tl-largo" : "",
              c.soNoComputador ? "desk-only" : "",
            ].filter(Boolean).join(" ") || undefined}
            style={{
              minWidth: 0, fontSize: 13.5, textAlign: c.fim ? "end" : "start",
              // Coluna alinhada à direita é número ou selo — e número não
              // quebra: "R$ 128.900,00" partido em duas linhas vira "R$
              // 128.900,0" e "0", que é um valor diferente à primeira vista. O
              // texto corrido, esse sim, quebra onde der (`anywhere`), senão
              // uma descrição sem espaços estoura a coluna.
              overflowWrap: c.fim ? "normal" : "anywhere",
              whiteSpace: c.fim ? "nowrap" : undefined,
            }}
          >
            {c.celula(l)}
          </span>
        ));

        // `background` e `border` NÃO entram aqui. A linha é um <button> no
        // computador e precisa perder a aparência de botão — mas no celular ela
        // vira CARD e depende do fundo e da borda que `.tab-linha` dá. Estilo
        // inline ganha da folha de estilo, então zerar aqui fazia os cards
        // nascerem sem separação nenhuma, um colado no outro. O reset mora em
        // `.fin-linha`, dentro de um @media que só vale no computador.
        const estilo: React.CSSProperties = {
          display: "grid", gridTemplateColumns: cols, gap: VAO_COLUNA, alignItems: "center",
          padding: "11px 12px", minWidth: 0,
          textAlign: "start", width: "100%", color: "var(--text)",
          // `+ 1` porque o cabeçalho é o primeiro filho da fila: sem o
          // deslocamento a primeira linha entra junto com ele e o escalonamento
          // começa fora de compasso.
          ["--mt-i" as string]: k + 1,
        };

        // `.mt-linha` responde ao ponteiro e ao toque por FUNDO, nunca por
        // `transform`: numa linha de grade o transform não é confiável entre
        // navegadores, e no celular a linha é card — mover o card por baixo do
        // dedo faz a pessoa achar que arrastou alguma coisa.
        return aoClicar ? (
          <button
            key={chaveDe(l)}
            type="button"
            className="tab-linha fin-linha mt-linha"
            onClick={() => aoClicar(l)}
            style={{ ...estilo, cursor: "pointer", minHeight: "var(--tap)" }}
          >
            {conteudo}
          </button>
        ) : (
          <div key={chaveDe(l)} className="tab-linha fin-linha" style={estilo}>
            {conteudo}
          </div>
        );
      })}
    </div>

    {mostraRodape && (
      <Paginacao
        pagina={atual}
        totalPaginas={totalPaginas}
        de={inicio + 1}
        ate={paginando ? Math.min(inicio + porPagina, linhas.length) : linhas.length}
        total={linhas.length}
        porPagina={porPagina}
        rotuloItem={rotuloItem}
        umaPagina={!paginando}
        aoIr={setPagina}
        aoMudarPorPagina={(n) => { setPorPagina(n); setPagina(1); }}
      />
    )}
    </div>
  );
}

/**
 * Rodapé de paginação. Fica no kit, e não em cada tela, porque o detalhe que
 * ninguém lembra é o alvo de toque: setas de 24px são o padrão da web e no
 * celular ninguém acerta.
 */
function Paginacao({ pagina, totalPaginas, de, ate, total, porPagina, rotuloItem, umaPagina, aoIr, aoMudarPorPagina }: {
  pagina: number; totalPaginas: number; de: number; ate: number; total: number;
  porPagina: number; rotuloItem: string;
  /** Cabe tudo numa página: fica só a contagem, sem setas nem números. */
  umaPagina?: boolean;
  aoIr: (n: number) => void; aoMudarPorPagina: (n: number) => void;
}) {
  // Janela de 5 páginas em volta da atual: com 40 páginas, listar todas vira
  // uma fileira mais larga que a tabela.
  const primeira = Math.max(1, Math.min(pagina - 2, totalPaginas - 4));
  const numeros = Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => primeira + i);

  const btn = (ativo: boolean): React.CSSProperties => ({
    minWidth: "var(--tap)", minHeight: "var(--tap)", padding: "0 10px", flex: "none",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    borderRadius: "var(--r-sm)", cursor: "pointer", fontSize: 13.5, fontWeight: ativo ? 800 : 600,
    background: ativo ? "color-mix(in srgb, var(--primary) 13%, transparent)" : "transparent",
    border: `1px solid ${ativo ? "color-mix(in srgb, var(--primary) 38%, var(--border))" : "var(--border)"}`,
    color: ativo ? "var(--primary-texto)" : "var(--text)",
  });

  return (
    <div
      className="tab-strip"
      style={{
        display: "flex", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 12,
        borderTop: "1px solid var(--border)", minWidth: 0, maxWidth: "100%",
      }}
    >
      <span style={{ fontSize: 12.5, color: "var(--text-dim)", flex: "none" }}>
        Mostrando {de} a {ate} de {total} {rotuloItem}
      </span>

      {/* Numa página só, as setas e o "1" sozinho seriam controles que não
          levam a lugar nenhum — some tudo e fica a contagem. */}
      {!umaPagina && (
        <span style={{ display: "flex", gap: 5, alignItems: "center", flex: "none", marginInlineStart: "auto" }}>
          <button type="button" style={btn(false)} disabled={pagina <= 1} onClick={() => aoIr(pagina - 1)} title="Página anterior">
            <Icon name="chevron-left" size={16} color="var(--text-dim)" />
          </button>
          {numeros.map((n) => (
            <button key={n} type="button" style={btn(n === pagina)} onClick={() => aoIr(n)} aria-current={n === pagina ? "page" : undefined}>
              {n}
            </button>
          ))}
          <button type="button" style={btn(false)} disabled={pagina >= totalPaginas} onClick={() => aoIr(pagina + 1)} title="Próxima página">
            <Icon name="chevron-right" size={16} color="var(--text-dim)" />
          </button>
        </span>
      )}

      <label
        style={{
          display: "inline-flex", alignItems: "center", gap: 7, flex: "none", minHeight: "var(--tap)",
          marginInlineStart: umaPagina ? "auto" : undefined,
        }}
      >
        <span style={{ fontSize: 12.5, color: "var(--text-dim)", whiteSpace: "nowrap" }}>Linhas por página</span>
        <select
          value={porPagina}
          onChange={(e) => aoMudarPorPagina(Number(e.target.value))}
          style={{
            minHeight: "var(--tap)", padding: "0 8px", borderRadius: "var(--r-sm)",
            background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13,
          }}
        >
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  );
}

// ── Estado vazio ─────────────────────────────────────────────────────────────

export function Vazio({ icone, titulo, detalhe, acao, compacto }: {
  icone: string; titulo: string; detalhe?: string; acao?: React.ReactNode;
  /**
   * Para dentro de um cartão "resumo" pequeno (Barras, ListaLateral): o mesmo
   * padding generoso que faz sentido quando o vazio é o conteúdo PRINCIPAL da
   * tela (com botão de ação, ocupando a lista inteira) sobra quando ele é só
   * um card lateral de 200px — o card de "R$ 0,00 lançado" ficava com mais
   * espaço em branco do que ícone, e ao lado da lista principal (cheia de
   * filtro, tabela, rodapé) a assimetria lia como "isto quebrou", não como
   * "não tem dado ainda".
   */
  compacto?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid", justifyItems: "center", gap: compacto ? 6 : 9, textAlign: "center",
        padding: compacto ? "14px 12px" : "34px 16px",
      }}
    >
      <Icon name={icone} size={compacto ? 22 : 30} color="var(--text-dim)" />
      <strong style={{ fontSize: compacto ? 13 : 14.5, fontWeight: 700 }}>{titulo}</strong>
      {detalhe && (
        <p style={{ fontSize: compacto ? 12 : 13, color: "var(--text-dim)", maxWidth: 380, lineHeight: 1.5 }}>
          {detalhe}
        </p>
      )}
      {acao}
    </div>
  );
}

// ── Aviso de schema pendente ─────────────────────────────────────────────────

/**
 * `supabase/financeiro.sql` é rodado à mão. Enquanto não for, a tela abre
 * dizendo o que falta — em vez de explodir, e em vez de mostrar zero em tudo,
 * que é pior: zero parece um dado, e alguém acredita nele.
 */
/**
 * O banco do módulo está atrás da tela.
 *
 * `modulo` e `arquivo` viraram props quando o RH passou a usar este mesmo
 * aviso, e por um defeito que chegou como pergunta do dono: a tela do RH
 * mandava rodar `supabase/financeiro.sql`. O aviso existe justamente para
 * dizer O QUE FAZER — apontando o arquivo errado ele vira o contrário, e a
 * pessoa vai rodar um SQL que não tem nada a ver com o que está faltando.
 */
export function AvisoSchema({ modulo = "Financeiro", arquivo = "supabase/financeiro.sql" }: {
  modulo?: string;
  arquivo?: string;
} = {}) {
  // Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
  return (
    <Alerta tom="atencao" titulo={<>O banco do {modulo} está atrás desta tela</>} style={{ marginBottom: 18 }}>
      Ou as tabelas ainda não existem, ou existem numa versão anterior e falta uma coluna
      que esta tela pede. Nos dois casos o remédio é o mesmo: rode <code style={{
        padding: "1px 6px", borderRadius: 6, background: "var(--surface-2)", fontSize: 12.5,
      }}>{arquivo}</code> no SQL Editor do Supabase. O arquivo pode ser rodado
      quantas vezes for preciso — ele não apaga nem duplica nada.
    </Alerta>
  );
}

// ── Cabeçalho da página ──────────────────────────────────────────────────────

export function Cabecalho({ titulo, sub, busca, aoBuscar, acoes, abas, tarja = "FINANCEIRO" }: {
  titulo: string;
  /** Uma linha sob o título, dizendo pra que a tela serve. */
  sub?: string;
  busca?: string;
  aoBuscar?: (v: string) => void;
  acoes?: React.ReactNode;
  abas?: React.ReactNode;
  /** O módulo dono da tela. Virou prop quando o RH passou a usar este mesmo
   *  cabeçalho: a tarja é o que diz DE ONDE a tela veio antes de o título ser
   *  lido, e "FINANCEIRO" acima de "Colaboradores" diria a coisa errada. */
  tarja?: string;
}) {
  return (
    <header className="page-head" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: abas ? 14 : 0 }}>
        {/* Sem `fontSize` inline de propósito: quem manda no tamanho é
            `.page-head h1` do globals.css, que encolhe 32 → 22 → 20 → 19 por
            faixa de tela. Um número inline aqui ganha da fundação e o título
            fica de 30px num celular de 320px, empurrando o conteúdo pra fora
            da primeira dobra. */}
        {/* `0 1 auto`, e não `none`: com subtítulo em toda tela (set/2026), o
            bloco do título ficava da largura da frase inteira e, no celular,
            passava da tela — o `overflow-x: clip` da fundação escondia o fim
            da frase sem rolar (defeito CORTA). Podendo encolher, o subtítulo
            quebra linha; no computador, onde cabe, nada muda. */}
        <div style={{ flex: "0 1 auto", minWidth: 0, display: "grid", gap: 2 }}>
          {/* A tarja do módulo: em Visão geral, com três empresas somadas, ela
              é o que diz de onde a tela veio antes de o título ser lido. */}
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", color: "var(--text-dim)" }}>
            {tarja}
          </span>
          <h1 style={{ marginBottom: 0 }}>{titulo}</h1>
          {sub && <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{sub}</span>}
        </div>
        {aoBuscar && (
          <label
            style={{
              display: "flex", alignItems: "center", gap: 9, flex: "1 1 220px", minWidth: 0,
              minHeight: "var(--tap)", padding: "0 14px", borderRadius: "var(--r-pill)",
              background: "var(--surface)", border: "1px solid var(--border)",
            }}
          >
            <Icon name="search" size={16} color="var(--text-dim)" />
            <input
              value={busca ?? ""}
              onChange={(e) => aoBuscar(e.target.value)}
              placeholder={`Buscar em ${titulo.toLowerCase()}...`}
              aria-label={`Buscar em ${titulo.toLowerCase()}`}
              style={{
                flex: 1, minWidth: 0, border: "none", background: "transparent",
                color: "var(--text)", fontSize: 14, outline: "none",
              }}
            />
          </label>
        )}
        {/* `.tab-strip`: no celular os botões ROLAM de lado em vez de empilhar
            um por linha. Empilhados, "Novo compromisso" + "Exportar" comiam
            duas fileiras de 44px e o primeiro número da tela só aparecia
            depois de rolar. */}
        {/* `minWidth: 0` é obrigatório, não enfeite: esta fileira é item de um
            flex, e item de flex se recusa a encolher abaixo do próprio
            conteúdo (`min-width: auto`). Sem ele os dois botões medem ~440px
            numa tela de 320 e empurram a PÁGINA inteira — o `overflow-x: auto`
            do `.tab-strip` nunca chega a valer, porque nada transborda dentro
            dele: transborda pra fora. */}
        {acoes && (
          <div
            className="tab-strip"
            // Folga de 4px com margem -4: rolador (`overflow-x: auto`) recorta o
            // que passa da caixa, e o contorno/anel dos botões desenha pra fora
            // — com `padding: 0` a borda do primeiro botão saía "comida".
            style={{ display: "flex", gap: 9, alignItems: "center", padding: 4, margin: -4, minWidth: 0, maxWidth: "calc(100% + 8px)" }}
          >
            {acoes}
          </div>
        )}
      </div>
      {abas}
    </header>
  );
}

// ── Botão ────────────────────────────────────────────────────────────────────

export function BotaoFin({ icone, children, primario, onClick, href, titulo }: {
  icone?: string; children?: React.ReactNode; primario?: boolean;
  onClick?: () => void; href?: string; titulo?: string;
}) {
  const cor = primario ? "var(--on-primary, #fff)" : "var(--text)";
  const estilo: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    minHeight: "var(--tap)", padding: "0 16px", borderRadius: "var(--r-pill)",
    fontSize: 13.5, fontWeight: 700, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap",
    color: cor,
    background: primario ? "var(--primary-acao, var(--primary))" : "var(--surface)",
    border: primario ? "none" : "1px solid var(--border)",
  };
  const dentro = (
    <>
      {icone && <Icon name={icone} size={16} color={cor} />}
      {children}
    </>
  );
  return href
    ? <a href={href} title={titulo} className="ui-card-alvo" style={estilo}>{dentro}</a>
    : <Botao variante={primario ? "primario" : "secundario"} icone={icone} title={titulo} onClick={onClick}>{children}</Botao>;
}

// ── Exportar ─────────────────────────────────────────────────────────────────

/**
 * Baixa o que ESTÁ NA TELA em CSV — as linhas já filtradas, não a tabela toda.
 *
 * Exporta no navegador, sem passar por rota de API: os dados já estão aqui, e
 * uma rota por clique em "Exportar" seria invocação paga para reenviar o que a
 * página acabou de mandar. Ver CLAUDE.md → "o tick comum tem que voltar vazio".
 */
export function BotaoExportar<T>({ linhas, colunas, assunto, empresa }: {
  linhas: T[];
  colunas: ColunaCSV<T>[];
  assunto: string;
  empresa: string;
}) {
  const baixar = () => {
    const texto = montarCSV(linhas, colunas);
    const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeDoArquivo(assunto, empresa, hojeISO());
    a.click();
    // Sem o revoke, cada exportação segura o arquivo inteiro na memória da aba
    // até o recarregamento — numa tela que fica aberta o dia todo, isso soma.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <BotaoFin
      icone="download"
      onClick={baixar}
      titulo={linhas.length ? `Baixar ${linhas.length} linha(s) em CSV` : "Nada para exportar"}
    >
      Exportar
    </BotaoFin>
  );
}

/**
 * A busca DENTRO do cartão da lista.
 *
 * A do cabeçalho continua existindo; esta é a mesma, ao alcance de quem já
 * rolou até a tabela. As duas escrevem no MESMO estado de propósito — dois
 * campos com valores diferentes seria a tela mentindo sobre o que está
 * filtrado.
 */
export function BuscaDaLista({ valor, aoBuscar, placeholder = "Buscar…" }: {
  valor: string; aoBuscar: (v: string) => void; placeholder?: string;
}) {
  return (
    <label
      style={{
        display: "flex", alignItems: "center", gap: 9, minWidth: 0, marginBottom: 14,
        minHeight: "var(--tap)", padding: "0 14px", borderRadius: "var(--r-pill)",
        background: "var(--surface-2)", border: "1px solid var(--border)",
      }}
    >
      <Icon name="search" size={16} color="var(--text-dim)" />
      <input
        value={valor}
        onChange={(e) => aoBuscar(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder.replace(/[….\s]+$/, "")}
        style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", color: "var(--text)", fontSize: 14, outline: "none" }}
      />
    </label>
  );
}

// ── Filtros ──────────────────────────────────────────────────────────────────

export interface OpcaoFiltro { valor: string; label: string }

export function Filtros({ children }: { children: React.ReactNode }) {
  // `.fin-filtros` (globals.css): quebra no computador, rola no celular. O
  // porquê de não ser `.tab-strip` está lá — em resumo, com `nowrap` o
  // "Limpar filtros" era empurrado para fora do cartão e ia parar em cima do
  // painel vizinho.
  //
  // `align-items: end` (na classe) alinha pela BASE dos campos: o rótulo fica
  // em cima de cada um e o "Limpar filtros", que não tem rótulo, encosta na
  // mesma linha dos seletores em vez de flutuar no meio.
  return <div className="fin-filtros" style={{ marginBottom: 16 }}>{children}</div>;
}

/**
 * Um filtro da fileira: rótulo em cima, campo embaixo.
 *
 * Era um chip ("Categoria ⌄") que só mostrava o rótulo quando estava desligado
 * e virava "Categoria: Software" quando ligado. Lido de longe, uma fileira de
 * chips não diz POR QUAIS eixos dá para filtrar — o nome do eixo some assim
 * que alguém escolhe alguma coisa. Com o rótulo fixo em cima, a fileira
 * continua respondendo "dá para filtrar por categoria, periodicidade, conta e
 * status" mesmo com os quatro preenchidos.
 *
 * O `<select>` é NATIVO e visível: no celular ele abre a roda do sistema, que
 * é melhor do que qualquer lista que eu desenhasse, e no computador abre a
 * lista do navegador. O que a folha de estilo faz é só tirar a aparência
 * padrão — nenhum comportamento é reimplementado.
 */
export function Filtro({ rotulo, valor, opcoes, aoMudar }: {
  rotulo: string; valor: string; opcoes: OpcaoFiltro[]; aoMudar: (v: string) => void;
}) {
  const idRotulo = useId();
  const ativo = !!valor;
  // O valor ativo SEMPRE aparece, mesmo quando a lista de opções mudou por
  // baixo dele — a única conta "Atrasada" foi paga e "Atrasado" saiu das opções
  // que a tela monta a partir dos dados. Sem esta linha o seletor mostraria
  // "Todas" com a tela filtrada por um critério que ninguém vê: lista vazia, e
  // os filtros jurando que não há filtro nenhum.
  const perdida = ativo && !opcoes.some((o) => o.valor === valor);
  const lista = perdida ? [...opcoes, { valor, label: valor }] : opcoes;

  // `<div>`, nunca `<label>`: o gatilho do seletor é um `<button>`, e um
  // rótulo que o envolve dispara o botão ao ser clicado — o filtro abriria
  // sozinho ao tocar no texto. O vínculo é por `aria-labelledby`.
  return (
    <div style={{ display: "grid", gap: 6, flex: "none", minWidth: 0 }}>
      <span id={idRotulo} style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>{rotulo}</span>
      <div
        data-ativo={ativo ? "1" : undefined}
        style={{
          minWidth: 64, maxWidth: 220,
          // O realce do filtro LIGADO fica no invólucro, e não no gatilho: é
          // ele que precisa continuar visível enquanto a folha está aberta.
          borderRadius: "var(--r-sm)",
          background: ativo ? "color-mix(in srgb, var(--primary) 10%, var(--surface))" : undefined,
          outline: ativo ? "1px solid color-mix(in srgb, var(--primary) 40%, var(--border))" : undefined,
        }}
      >
        <Escolha
          valor={valor}
          vazio="Todas"
          aoEscolher={aoMudar}
          placeholder={`Buscar em ${rotulo.toLocaleLowerCase("pt-BR")}…`}
          opcoes={lista.map((o) => ({ id: o.valor, nome: o.label }))}
          rotuladoPor={idRotulo}
        />
      </div>
    </div>
  );
}

/**
 * O filtro de período das telas do módulo: o seletor (mês passado / este mês /
 * mês que vem / atalhos da tela) mais duas setas que andam de mês em mês. As
 * setas existem porque "ver outubro" não pode exigir abrir um seletor e
 * procurar — é um toque. O período é a string do `lib/financeiro/periodo.ts`.
 */
export function FiltroPeriodo({ valor, aoMudar, hoje, atalhos = [] }: {
  valor: string; aoMudar: (v: string) => void; hoje: string; atalhos?: OpcaoPeriodo[];
}) {
  const opcoes = useMemo(() => opcoesDePeriodo(hoje, valor, atalhos), [hoje, valor, atalhos]);
  // Dois toques rápidos na seta precisam andar DOIS meses: o segundo clique
  // pode chegar antes de o React redesenhar com o valor do primeiro, e aí os
  // dois partiriam do mesmo mês. O ref guarda o último valor pedido.
  const ultimo = useRef(valor);
  ultimo.current = valor;
  const andar = (passo: 1 | -1) => {
    const novo = andarMes(ultimo.current, hoje, passo);
    ultimo.current = novo;
    aoMudar(novo);
  };
  const seta = (passo: 1 | -1, rotulo: string, icone: string) => (
    <BotaoIcone icone={icone} titulo={rotulo} onClick={() => andar(passo)} style={{ flex: "none" }} />
  );
  return (
    <div style={{ display: "flex", alignItems: "end", gap: 6, flex: "none", minWidth: 0 }}>
      {seta(-1, "Mês anterior", "chevron-left")}
      <Filtro rotulo="Período" valor={valor} opcoes={opcoes} aoMudar={aoMudar} />
      {seta(1, "Mês seguinte", "chevron-right")}
    </div>
  );
}

/**
 * A faixa de painéis em CIMA da lista: resumo, gráfico, próximas ações. Antes
 * eles moravam numa coluna à direita, que comia um terço da tela e deixava a
 * lista estreita demais pra virar coluna por empresa. Na horizontal cada
 * painel fica com sua largura e a lista ganha a tela toda.
 */
export function FaixaDePaineis({ children, largura = 280 }: { children: React.ReactNode; largura?: number }) {
  return (
    <div style={{ display: "grid", gap: 16, alignItems: "stretch", marginBottom: 16, gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${largura}px), 1fr))` }}>
      {children}
    </div>
  );
}

// ── Popover ancorado ─────────────────────────────────────────────────────────

// `.rh-scope` entrou quando o RH passou a reusar estes componentes: o portal
// copia a classe de escopo do ancestral, e sem o RH na lista o `Ancorado` e o
// `ModalFormulario` nasceriam no `<body>` sem ela.
const ESCOPOS = ".fin-scope, .tf-scope, .tm-workspace, .rh-scope";

/**
 * Painel que sai da árvore e vai pro `<body>`.
 *
 * Não é preciosismo: guardar propriedade por propriedade de ancestral é jogo
 * perdido — a coluna tem `overflow`, o cartão tem `backdrop-filter`, e no
 * celular a fileira do rail vira BLOCO DE CONTENÇÃO do `position: fixed`, então
 * a folha nasceria recortada dentro de uma faixa de 44px. Sem ancestral não há
 * contexto de empilhamento nem recorte para herdar. Ver CLAUDE.md.
 */
export function Ancorado({ ancora, aberto, aoFechar, largura = 260, children }: {
  ancora: React.RefObject<HTMLElement | null>;
  aberto: boolean;
  aoFechar: () => void;
  largura?: number;
  children: React.ReactNode;
}) {
  const painel = useRef<HTMLDivElement>(null);
  const [caixa, setCaixa] = useState<{ top?: number; bottom?: number; left: number; alturaMax: number; origem: OrigemFolha } | null>(null);
  const [escopo, setEscopo] = useState("");

  /**
   * A folha CRESCE do gatilho e some mais rápido do que apareceu.
   *
   * Abrir é convite, fechar é sair da frente: fechar na mesma duração da
   * abertura faz a folha parecer emperrada bem na hora em que a pessoa já
   * decidiu outra coisa. Quem manda no tempo é o `--dropdown-close-dur`, lido
   * do CSS — não existe um número escrito aqui para sair de sincronia depois.
   */
  const { montado, classe } = useAbrirFechar(aberto, "--dropdown-close-dur");

  useEffect(() => {
    // Fechando, a última medida FICA. Zerar aqui desmontaria o painel no
    // primeiro quadro do fechamento e a saída nunca chegaria a ser vista —
    // seria o corte seco de antes, só que com CSS a mais.
    if (!aberto) return;
    const medir = () => {
      const r = ancora.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8));
      // A folha não pode SAIR DA TELA: quando embaixo não cabe nem uma lista
      // curta e em cima cabe mais, ela abre PARA CIMA (ancorada pelo bottom,
      // para crescer a partir do gatilho e não a partir do teto). Nos dois
      // sentidos ganha um teto de altura e rola por dentro — antes, um
      // dropdown perto do rodapé despejava as últimas opções fora da janela.
      const abaixo = window.innerHeight - r.bottom - 16;
      const acima = r.top - 16;
      const paraCima = abaixo < 300 && acima > abaixo;
      const alturaMax = Math.max(160, Math.min(paraCima ? acima - 8 : abaixo - 8, 440));
      const posicao = paraCima
        ? { bottom: window.innerHeight - r.top + 8, left }
        : { top: r.bottom + 8, left };
      // De qual canto a folha nasce. O olho segue a ORIGEM, não a posição
      // final: crescer do canto errado lê como "apareceu por cima" em vez de
      // "saiu deste botão".
      setCaixa({ ...posicao, alturaMax, origem: origemDaAncora(r, { top: paraCima ? r.top - 100 : r.bottom + 8, left }) });
    };
    setEscopo(ancora.current?.closest(ESCOPOS)?.className ?? "");
    medir();
    // Captura: quem rola aqui é a coluna de conteúdo, não a página — sem `true`
    // o painel fica parado enquanto o botão sobe.
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [aberto, ancora, largura]);

  useEffect(() => {
    if (!aberto) return;
    // O painel não é mais descendente da âncora: "tocou fora" precisa olhar as
    // DUAS caixas, senão clicar numa opção fecharia antes de escolher.
    const onDown = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!ancora.current?.contains(alvo) && !painel.current?.contains(alvo)) aoFechar();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [aberto, ancora, aoFechar]);

  if (!montado || !caixa) return null;
  return createPortal(
    <div className={escopo}>
      <div
        ref={painel}
        className={`gp-pop t-dropdown ${classe}`}
        data-origin={caixa.origem}
        style={{
          position: "fixed", top: caixa.top, bottom: caixa.bottom, left: caixa.left, zIndex: 1400,
          width: largura, maxWidth: "calc(100vw - 16px)", borderRadius: "var(--r-md)", padding: 7,
          maxHeight: caixa.alturaMax, overflowY: "auto", overscrollBehavior: "contain",
          background: "var(--surface)", border: "1px solid var(--border)",
          boxShadow: "0 18px 48px -16px rgba(0,0,0,.45)",
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Ganchinho para quem só quer abrir/fechar sem repetir o `useCallback`. */
export function useAncora() {
  const ref = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const fechar = useCallback(() => setAberto(false), []);
  return { ref, aberto, setAberto, fechar, alternar: () => setAberto((a) => !a) };
}

// ── Passos numerados (os "como funciona" dos mockups) ────────────────────────

/**
 * A trilha "como funciona": passo → seta → passo.
 *
 * A seta ENTRE os passos é o conteúdo, não enfeite: sem ela três cartões lado
 * a lado são três coisas soltas, e a tela deixa de dizer que uma leva à outra
 * — que é justamente o que este bloco existe para explicar (recorrência VIRA
 * compromisso, compra VIRA parcela).
 *
 * No celular a fileira empilha e as setas somem: apontando para baixo elas não
 * acrescentam nada que a ordem de leitura já não diga, e cada uma custaria uma
 * altura de dedo entre um passo e o próximo.
 */
export function Passos({ passos }: {
  passos: { icone: string; titulo: string; detalhe: string }[];
}) {
  // `<Fila>`: passo, seta, passo — nesta ordem, um depois do outro. A trilha
  // existe para dizer que uma coisa LEVA à outra, e uma sequência que aparece
  // inteira de uma vez diz o contrário. Os itens vão numa lista plana, sem
  // `<Fragment>` no meio: a fila carimba o índice em cada filho, e um Fragment
  // não aceita `style` — a seta entra como item da fila, no lugar dela.
  return (
    <Fila
      as="ol"
      style={{
        display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap",
        listStyle: "none", padding: 0, margin: 0,
      }}
    >
      {passos.flatMap((p, i) => [
        <li key={p.titulo} style={{ display: "grid", gap: 9, minWidth: 0, flex: "1 1 190px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Número ANTES do ícone: é ele que diz a ordem, e a ordem é o
                assunto do bloco. Depois do ícone, vira legenda do desenho. */}
            <span
              style={{
                width: 22, height: 22, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center",
                fontSize: 11.5, fontWeight: 800, color: "var(--primary-texto)",
                background: "color-mix(in srgb, var(--primary) 15%, transparent)",
              }}
            >
              {i + 1}
            </span>
            <span
              aria-hidden
              style={{
                width: 38, height: 38, flex: "none", borderRadius: 11, display: "grid", placeItems: "center",
                background: "color-mix(in srgb, var(--primary) 12%, var(--surface-2))",
              }}
            >
              <Icon name={p.icone} size={18} color="var(--primary-texto)" />
            </span>
          </div>
          <strong style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>{p.titulo}</strong>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5 }}>{p.detalhe}</span>
        </li>,
        i < passos.length - 1 ? (
          <li key={`seta-${p.titulo}`} aria-hidden className="desk-only" style={{ flex: "none", paddingTop: 9 }}>
            <Icon name="arrow-right" size={18} color="var(--text-dim)" />
          </li>
        ) : null,
      ])}
    </Fila>
  );
}


// ── Marca (empresa, banco, gateway, cartão) ──────────────────────────────────

/**
 * O quadradinho de identidade que aparece antes do nome.
 *
 * Tenta três coisas, nesta ordem: a IMAGEM que alguém subiu na tela de
 * configuração, o ÍCONE Tabler escolhido, e a INICIAL do nome. A terceira não
 * é enfeite — é o que garante que nada nasça sem marca: uma conta criada agora
 * precisa aparecer na lista com alguma coisa, porque quadrado vazio lê como
 * defeito, não como "ainda não configurei".
 *
 * O logo NÃO vem do banco pronto: lá mora o caminho no bucket privado, e quem
 * assina o link é o servidor, na hora. URL guardada vence — e uma coluna cheia
 * de link morto é pior que coluna vazia.
 *
 * A cor de fundo é derivada da cor da marca com `color-mix`, e não escrita à
 * mão: assim o mesmo componente funciona nos dois temas sem ninguém calibrar
 * dois valores.
 */
export function Marca({ marca, tamanho = 36, raio = 10 }: {
  marca: MarcaVisual; tamanho?: number; raio?: number;
}) {
  const cor = marca.cor || "var(--primary)";
  const base: React.CSSProperties = {
    width: tamanho, height: tamanho, flex: "none", borderRadius: raio,
    display: "grid", placeItems: "center", overflow: "hidden",
  };

  // O link assinado vale por até uma hora (ver `assinarLogos`); quem deixa a
  // aba aberta mais que isso, ou perde o arquivo do bucket por fora do app,
  // vê o `<img>` falhar. SEM este estado, a marca vira um ícone quebrado do
  // navegador parado ali para sempre — pior que nunca ter tido logo nenhum,
  // porque um ícone quebrado lê como "o sistema quebrou", não como "sem logo".
  // `key={marca.logo}` reseta o estado quando o link muda (troca de logo,
  // nova assinatura): sem ela, `quebrou=true` de um link antigo sobreviveria
  // e esconderia um logo novo que carregaria bem.
  const [quebrou, setQuebrou] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // O `onError` sozinho perde a corrida da HIDRATAÇÃO: o HTML vem do
  // servidor com o `<img>` já no lugar, o navegador dispara o pedido (e pode
  // falhar) ENQUANTO A PÁGINA AINDA CARREGA — antes de o React religar os
  // manipuladores de evento. O evento nativo já passou; ninguém escutando,
  // ninguém soube. Por isso confere de novo, uma vez, assim que monta: se o
  // `<img>` que o servidor desenhou já chegou quebrado, `complete` vem `true`
  // e `naturalWidth` vem `0` — sinal de que o `error` disparou no vazio.
  useEffect(() => {
    setQuebrou(false);
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth === 0) setQuebrou(true);
  }, [marca.logo]);

  if (marca.logo && !quebrou) {
    return (
      // O fundo sai da PRÓPRIA IMAGEM, borrada, e não de um `#fff` fixo.
      //
      // O quadradinho é quadrado e quase nenhum logo é: com `contain` sobre
      // branco, um logo deitado ganhava duas barras brancas em cima e embaixo —
      // que é como se lê "imagem mal cortada", não "marca". Trocar para `cover`
      // resolveria a barra e cortaria o nome da empresa pela metade, o que é
      // pior.
      //
      // A saída é a mesma dos tocadores de vídeo: a imagem aparece INTEIRA
      // (`contain`) sobre uma cópia dela mesma esticada e borrada. Nunca sobra
      // barra, nada é cortado, e o fundo combina com a marca sozinho — inclusive
      // com logo de fundo transparente e desenho escuro, o caso que motivou o
      // branco e que no tema escuro sumia.
      //
      // `inset` negativo no lugar de `transform: scale()` de propósito: transform
      // vira contexto de empilhamento e bloco de contenção, e esta marca aparece
      // dentro de linha de tabela e de folha ancorada (ver o CLAUDE.md).
      <span aria-hidden style={{ ...base, position: "relative", background: "var(--surface-2)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={marca.logo}
          alt=""
          aria-hidden
          style={{
            position: "absolute", left: "-25%", top: "-25%", width: "150%", height: "150%",
            objectFit: "cover", filter: "blur(6px) saturate(1.3)", opacity: 0.85,
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          key={marca.logo}
          src={marca.logo}
          alt=""
          width={tamanho}
          height={tamanho}
          onError={() => setQuebrou(true)}
          style={{
            // `absolute`, e não `relative`, por um motivo medido: o pai é
            // `display: grid` com `place-items: center`, então o item NÃO é
            // esticado — o `height: 100%` de um item não esticado volta a
            // resolver contra a altura intrínseca dele. Num logo em pé
            // (64×160) isso dava 124px dentro de um quadrado de 52, e o
            // `overflow: hidden` do pai cortava o topo e a base: exatamente o
            // contrário do que `contain` promete. Logo deitado e quadrado
            // passavam ilesos, que é o que fez o defeito sobreviver.
            //
            // Posicionado, o bloco de contenção é o padding-box do `span`
            // (que é `relative`), então 100% é 52px sem ambiguidade e o
            // `contain` volta a caber a imagem inteira. Prova em
            // `/dev-financeiro` e trava em `marca-enquadramento.dom.test.tsx`.
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "contain", padding: 2, boxSizing: "border-box",
          }}
        />
      </span>
    );
  }

  if (marca.icone) {
    return (
      <span aria-hidden style={{ ...base, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>
        <Icon name={marca.icone} size={Math.round(tamanho * 0.5)} color={cor} />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      style={{
        ...base,
        background: `color-mix(in srgb, ${cor} 14%, transparent)`,
        color: cor, fontSize: Math.round(tamanho * 0.4), fontWeight: 800,
      }}
    >
      {marca.nome.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * O campo de FOTO dentro de um painel de edição.
 *
 * Existe como peça do kit porque a mesma coisa aparece em quatro telas
 * (empresa, banco, fornecedor, contato) e o que muda entre elas é só o `tipo`
 * — copiar o `<input type=file>` escondido, o estado de "subindo" e o
 * tratamento de erro quatro vezes é como as quatro versões acabam divergindo.
 *
 * Só aparece com o registro JÁ SALVO. Enquanto não há `id`, não existe linha
 * para o arquivo apontar: subir a imagem antes de o POST de criação responder
 * deixaria um arquivo órfão no bucket se a criação falhasse no meio. Por isso
 * "Novo contato" não mostra o campo, e a dica diz o porquê em vez de deixar o
 * espaço vazio.
 */
export function CampoMarca({ tipo, id, nome, logo, icone, cor, aoTrocar, aoEscolherPendente }: {
  tipo: TipoDeMarcaNaTela;
  /** `null` = registro ainda não existe (formulário de criação). */
  id: string | null;
  nome: string;
  logo: string | null;
  icone?: string | null;
  cor?: string | null;
  /** Chamado depois de subir ou remover, para a tela recarregar os dados. */
  aoTrocar: () => void;
  /**
   * Com isto, a foto pode ser escolhida ANTES de o registro existir: o
   * componente guarda o arquivo, mostra a prévia, e entrega o `File` ao
   * formulário — que sobe a imagem logo depois do POST devolver o id (ver
   * `enviarMarca`). Sem isto, cadastro novo dizia "a foto entra depois de
   * salvar", e ninguém reabria o cadastro só para isso.
   */
  aoEscolherPendente?: (arquivo: File | null) => void;
}) {
  const arquivo = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  // A prévia do arquivo escolhido antes de salvar. `URL.createObjectURL` é
  // local, não viaja — por isso a Marca mostra a imagem sem nada ter subido.
  const [previa, setPrevia] = useState<string | null>(null);

  if (!id) {
    if (!aoEscolherPendente) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 18 }}>
          <Marca marca={{ nome: nome || "?", icone, cor }} tamanho={52} raio={13} />
          <span style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
            A foto entra depois de salvar — reabra o cadastro para escolher a imagem.
          </span>
        </div>
      );
    }
    return (
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <Marca marca={{ nome: nome || "?", logo: previa, icone, cor }} tamanho={52} raio={13} />
          <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <input
              ref={arquivo}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f && f.size > 2 * 1024 * 1024) { setErro("A imagem passa de 2 MB."); e.target.value = ""; return; }
                setErro("");
                setPrevia(f ? URL.createObjectURL(f) : null);
                aoEscolherPendente(f);
                e.target.value = "";
              }}
            />
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <BotaoFin icone="upload" onClick={() => arquivo.current?.click()}>
                {previa ? "Trocar foto" : "Escolher foto"}
              </BotaoFin>
              {previa && (
                <BotaoFin icone="trash" onClick={() => { setPrevia(null); aoEscolherPendente(null); }}>Remover</BotaoFin>
              )}
            </span>
            <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
              JPG, PNG, WEBP ou SVG — até 2 MB. Sobe junto com o cadastro.
            </span>
          </div>
        </div>
        {erro && (
          <p style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: "var(--perigo)" }} role="alert">{erro}</p>
        )}
      </div>
    );
  }

  async function enviar(f: File) {
    setOcupado(true);
    setErro("");
    try {
      const form = new FormData();
      form.append("file", f);
      form.append("tipo", tipo);
      form.append("id", id as string);
      const r = await fetch("/api/financeiro/marca", { method: "POST", body: form });
      const dados = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) throw new Error(dados.erro ?? "Não deu para subir a imagem.");
      aoTrocar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para subir a imagem.");
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    setOcupado(true);
    setErro("");
    try {
      const r = await fetch(`/api/financeiro/marca?tipo=${tipo}&id=${encodeURIComponent(id as string)}`, { method: "DELETE" });
      const dados = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) throw new Error(dados.erro ?? "Não deu para remover.");
      aoTrocar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para remover.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <Marca marca={{ nome, logo, icone, cor }} tamanho={52} raio={13} />
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <input
            ref={arquivo}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); e.target.value = ""; }}
          />
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <BotaoFin icone="upload" onClick={() => arquivo.current?.click()}>
              {ocupado ? "Enviando…" : logo ? "Trocar foto" : "Escolher foto"}
            </BotaoFin>
            {logo && <BotaoFin icone="trash" onClick={() => void remover()}>Remover</BotaoFin>}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>JPG, PNG, WEBP ou SVG — até 2 MB.</span>
        </div>
      </div>
      {erro && (
        <p style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: "var(--perigo)" }} role="alert">{erro}</p>
      )}
    </div>
  );
}

/**
 * Sobe a foto escolhida antes de salvar, agora que o registro tem id.
 *
 * Devolve a mensagem de erro, ou `null` quando deu certo. NÃO lança: o cadastro
 * já está salvo quando isto roda, e uma foto que falhou não pode fazer a tela
 * dizer que o cadastro falhou — a pessoa reabriria e cadastraria de novo.
 */
export async function enviarMarca(tipo: TipoDeMarcaNaTela, id: string, arquivo: File): Promise<string | null> {
  try {
    const form = new FormData();
    form.append("file", arquivo);
    form.append("tipo", tipo);
    form.append("id", id);
    const r = await fetch("/api/financeiro/marca", { method: "POST", body: form });
    const dados = (await r.json().catch(() => ({}))) as { erro?: string };
    return r.ok ? null : (dados.erro ?? "A foto não subiu.");
  } catch {
    return "A foto não subiu — sem resposta do servidor.";
  }
}

/**
 * O vocabulário de marca da TELA é o mesmo do servidor.
 *
 * Eram três cópias escritas à mão desta união (aqui, no `CampoMarca` e na
 * galeria de Configurações), e foi isso que deixou `patrimonio` de fora quando
 * ele entrou: acrescentar o tipo em `TIPOS_DE_MARCA` não avisou ninguém.
 * `import type` é apagado na compilação, então isto não arrasta o módulo de
 * servidor para o pacote do navegador.
 */
export type TipoDeMarcaNaTela = TipoDeMarca;

// ── Empresa, quando a tela não tem uma ──────────────────────────────────────

/**
 * O seletor de empresa dentro do formulário.
 *
 * Só aparece quando a tela está em "Visão geral" (sem empresa escolhida): ali
 * um cadastro novo precisa dizer em qual empresa nasce, e a primeira versão
 * resolvia isso ESCONDENDO o botão de criar — o que fez parecer que o módulo
 * inteiro tinha quebrado. Perguntar é o certo; sumir nunca foi.
 *
 * É só o `<select>`: cada tela o embrulha no `Campo` do kit que ela já usa.
 */
export function SeletorEmpresa({ id, empresas, valor, aoMudar }: {
  id?: string;
  empresas: { id: string; nome: string }[];
  valor: string;
  aoMudar: (id: string) => void;
}) {
  return (
    <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)}>
      <option value="">Escolha a empresa…</option>
      {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
    </select>
  );
}

// ── Rodapé explicativo e "ver todas" ─────────────────────────────────────────

/**
 * A faixa de uma linha no pé da tela ("as recorrências alimentam compromissos
 * automaticamente").
 *
 * Era um parágrafo cinza solto embaixo do último cartão, e parágrafo solto no
 * fim de página ninguém lê. Dentro de uma faixa com ícone ele vira parte da
 * tela — e é aqui que mora a única explicação de POR QUE a tela existe.
 */
export function NotaRodape({ children, icone = "info-circle", destaque }: {
  children: React.ReactNode; icone?: string; destaque?: boolean;
}) {
  const cor = destaque ? "var(--primary)" : "var(--border)";
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 11, marginTop: 16, padding: "13px 16px",
        borderRadius: "var(--r-md)", minWidth: 0,
        border: `1px solid ${destaque ? `color-mix(in srgb, ${cor} 34%, var(--border))` : cor}`,
        background: destaque ? "color-mix(in srgb, var(--primary) 7%, var(--surface))" : "var(--surface)",
      }}
    >
      <Icon name={icone} size={18} color={destaque ? "var(--primary-texto)" : "var(--text-dim)"} />
      <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.55, minWidth: 0 }}>{children}</p>
    </div>
  );
}

/** O "ver todas as cobranças →" que fecha um painel de amostra. */
export function VerTodas({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="ui-card-alvo"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, minHeight: "var(--tap)",
        padding: "0 10px", marginInlineStart: -10, borderRadius: "var(--r-sm)",
        fontSize: 13, fontWeight: 700, color: "var(--primary-texto)", textDecoration: "none",
      }}
    >
      {children}
      <Icon name="chevron-right" size={15} color="var(--primary-texto)" />
    </a>
  );
}

// ── Próximas ações ───────────────────────────────────────────────────────────

export function ProximasAcoes({ acoes }: {
  acoes: { chave: string; icone: string; cor: string; titulo: string; detalhe: string; href?: string }[];
}) {
  if (!acoes.length) {
    return (
      <Vazio
        compacto icone="circle-check" titulo="Nada pedindo atenção"
        detalhe="Nenhum vencimento próximo, nota solta ou garantia acabando."
      />
    );
  }
  return (
    <div style={{ display: "grid", gap: 7 }}>
      {acoes.map((a) => {
        const dentro = (
          <>
            <span
              aria-hidden
              style={{
                width: 36, height: 36, flex: "none", borderRadius: 10, display: "grid", placeItems: "center",
                background: `color-mix(in srgb, ${a.cor} 14%, transparent)`,
              }}
            >
              <Icon name={a.icone} size={18} color={a.cor} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: "block", fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>{a.titulo}</strong>
              <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{a.detalhe}</span>
            </span>
            <Icon name="chevron-right" size={16} color="var(--text-dim)" />
          </>
        );
        const estilo: React.CSSProperties = {
          display: "flex", alignItems: "center", gap: 12, minHeight: "var(--tap)",
          padding: "9px 10px", borderRadius: "var(--r-sm)", textDecoration: "none", color: "var(--text)",
          background: "transparent", border: "none", width: "100%", textAlign: "start",
        };
        return a.href
          ? <a key={a.chave} href={a.href} className="ui-card-alvo" style={estilo}>{dentro}</a>
          : <div key={a.chave} style={estilo}>{dentro}</div>;
      })}
    </div>
  );
}

// ── Par de painéis ───────────────────────────────────────────────────────────

/**
 * `.duo` da fundação: lado a lado no computador, um sobre o outro no celular.
 *
 * `lista` é o par das telas de listagem — tabela grande à esquerda, painel de
 * apoio à direita. A proporção genérica (1.2fr) dava à tabela pouco mais da
 * metade da tela e as últimas colunas ("Conta", "Status") ficavam fora da
 * vista num monitor de 1440. Do lado de quem olha isso não é "role de lado":
 * é "a tela cortou".
 */
export function Duo({ children, iguais, lista }: {
  children: React.ReactNode; iguais?: boolean; lista?: boolean;
}) {
  const classe = iguais ? "duo duo-eq" : lista ? "duo duo-lista" : "duo";
  return <div className={classe} style={{ alignItems: "start" }}>{children}</div>;
}

// ── Anexos ───────────────────────────────────────────────────────────────────

export type TipoDeAnexo = "compra" | "nota" | "compromisso" | "patrimonio";

interface AnexoNaTela {
  id: string;
  nome: string;
  mime: string | null;
  tamanho: number | null;
  created_at: string;
  link: string | null;
}

/**
 * Por quanto tempo o link listado ainda é confiável.
 *
 * O servidor assina por 5 minutos. A folga de um minuto cobre a viagem da
 * resposta e o relógio do navegador estar adiantado — passando disso a tela
 * REBUSCA em vez de mandar a pessoa para um link que o storage já recusa.
 */
const LINK_CONFIAVEL_MS = 4 * 60 * 1000;

const EXTENSOES_ACEITAS =
  ".pdf,.xml,.jpg,.jpeg,.png,.webp,.heic,.txt,.csv,.xls,.xlsx";

/** "18 KB", "2,4 MB" — o número cru em bytes não diz nada a ninguém. */
function tamanhoLegivel(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0).replace(".", ",")} KB`;
  return `${(kb / 1024).toFixed(1).replace(".", ",")} MB`;
}

function iconeDoArquivo(mime: string | null): string {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "photo";
  if (m.includes("spreadsheet") || m.includes("excel") || m.includes("csv")) return "table";
  if (m.includes("xml")) return "code";
  if (m.includes("pdf") || m.startsWith("text/")) return "file-text";
  return "file";
}

/**
 * Comprovante, XML, PDF — os arquivos de UMA linha do Financeiro.
 *
 * Busca uma vez, ao montar. Não há poll: anexo só muda quando alguém desta tela
 * envia ou remove, e nesses dois casos a lista é refeita na hora.
 *
 * O link vem assinado e vale 5 minutos. Guardá-lo para sempre daria o pior tipo
 * de defeito: a pessoa abre o painel, resolve outra coisa, volta meia hora
 * depois, clica — e leva um erro cru do storage. Por isso o clique confere a
 * idade da listagem e rebusca quando o link já envelheceu.
 */
export function Anexos({ tipo, owner_id, empresa_id, podeEditar, titulo = "Anexos", dica }: {
  tipo: TipoDeAnexo;
  owner_id: string;
  empresa_id: string;
  /** Sem isto a lista é só de leitura — enviar e remover somem. */
  podeEditar?: boolean;
  titulo?: string;
  dica?: string;
}) {
  const [itens, setItens] = useState<AnexoNaTela[] | null>(null);
  const [buscadoEm, setBuscadoEm] = useState(0);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const carregar = useCallback(async (): Promise<AnexoNaTela[] | null> => {
    const busca = new URLSearchParams({ tipo, owner_id, empresa_id });
    try {
      const r = await fetch(`/api/financeiro/anexos?${busca.toString()}`);
      const dados = (await r.json().catch(() => null)) as { anexos?: AnexoNaTela[]; erro?: string } | null;
      // A mensagem do servidor é a que a pessoa precisa ler ("Empresa não
      // permitida", "bucket ainda não existe"). Trocá-la por um genérico
      // esconde justamente o que diz o que fazer a seguir.
      if (!r.ok) { setErro(dados?.erro || "Não foi possível carregar os anexos."); return null; }
      const lista = dados?.anexos ?? [];
      setItens(lista);
      setBuscadoEm(Date.now());
      setConfirmando(null);
      setErro("");
      return lista;
    } catch {
      setErro("Sem resposta do servidor. Confira a conexão e tente de novo.");
      return null;
    }
  }, [tipo, owner_id, empresa_id]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function abrir(e: React.MouseEvent<HTMLAnchorElement>, a: AnexoNaTela) {
    if (a.link && Date.now() - buscadoEm < LINK_CONFIAVEL_MS) return;
    e.preventDefault();
    // A aba nasce ANTES do `await`: depois dele o navegador já não enxerga a
    // abertura como consequência do clique e o bloqueador de pop-up a engole.
    const aba = window.open("", "_blank");
    if (aba) aba.opener = null;
    const lista = await carregar();
    const fresco = lista?.find((x) => x.id === a.id)?.link ?? null;
    if (!fresco) {
      aba?.close();
      setErro("Este arquivo não está mais disponível. Atualize a lista e tente de novo.");
      return;
    }
    if (aba) aba.location.href = fresco;
    else window.open(fresco, "_blank", "noopener");
  }

  async function enviar(arquivo: File) {
    setOcupado(true); setErro("");
    const corpo = new FormData();
    corpo.append("file", arquivo);
    corpo.append("tipo", tipo);
    corpo.append("owner_id", owner_id);
    corpo.append("empresa_id", empresa_id);
    try {
      const r = await fetch("/api/financeiro/anexos", { method: "POST", body: corpo });
      const dados = (await r.json().catch(() => null)) as { ok?: boolean; erro?: string } | null;
      if (!r.ok || !dados?.ok) {
        setErro(dados?.erro || "Não foi possível enviar o arquivo.");
        return;
      }
      // Recarrega em vez de acrescentar o anexo devolvido: o POST responde sem
      // link assinado, e uma linha sem link é uma linha que não abre.
      await carregar();
    } catch {
      setErro("Sem resposta do servidor. Confira a conexão e tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function remover(id: string) {
    setOcupado(true); setErro("");
    const busca = new URLSearchParams({ id, empresa_id, tipo });
    try {
      const r = await fetch(`/api/financeiro/anexos?${busca.toString()}`, { method: "DELETE" });
      const dados = (await r.json().catch(() => null)) as { ok?: boolean; erro?: string } | null;
      if (!r.ok || !dados?.ok) {
        setErro(dados?.erro || "Não foi possível remover o arquivo.");
        return;
      }
      await carregar();
    } catch {
      setErro("Sem resposta do servidor. Confira a conexão e tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 10, minWidth: 0 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <Icon name="paperclip" size={16} color="var(--text-dim)" style={{ flex: "none" }} />
        <h3 style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, letterSpacing: ".01em", color: "var(--text-dim)" }}>
          {titulo}
        </h3>
        {!!itens?.length && (
          <span style={{ flex: "none", fontSize: 12, fontWeight: 800, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
            {itens.length}
          </span>
        )}
      </header>

      {dica && <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5, margin: "-4px 0 0" }}>{dica}</p>}

      {erro && (
        <Alerta tom="perigo">{erro}</Alerta>
      )}

      {/* `itens === null` quer dizer "ainda não sei", e a busca que FALHA também
          deixa null — sem o `&& !erro` a tela mostrava o aviso vermelho e um
          "Carregando anexos…" girando para sempre, ao mesmo tempo. Dois estados
          contraditórios lado a lado: o erro já diz o que houve, e o giro sugere
          que ainda vem coisa. */}
      {itens === null && !erro ? (
        <p style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-dim)" }}>
          <Icon name="loader" size={15} color="var(--text-dim)" className="spin" style={{ flex: "none" }} />
          Carregando anexos...
        </p>
      ) : itens === null ? null : itens.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Nenhum arquivo anexado</p>
      ) : (
        <ul style={{ display: "grid", gap: 4, listStyle: "none", margin: 0, padding: 0, minWidth: 0 }}>
          {itens.map((a) => (
            <li key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <a
                href={a.link ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { void abrir(e, a); }}
                className="ui-card-alvo"
                style={{
                  display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0,
                  minHeight: "var(--tap)", padding: "6px 9px", borderRadius: "var(--r-sm)",
                  textDecoration: "none", color: "var(--text)",
                  background: "var(--surface-2)", border: "1px solid var(--border)",
                }}
              >
                <Icon name={iconeDoArquivo(a.mime)} size={17} color="var(--primary-texto)" style={{ flex: "none" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>
                    {a.nome}
                  </strong>
                  <small style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                    {[tamanhoLegivel(a.tamanho), dataBR(a.created_at)].filter(Boolean).join(" · ")}
                  </small>
                </span>
                <Icon name="external-link" size={15} color="var(--text-dim)" style={{ flex: "none" }} />
              </a>

              {podeEditar && (
                <Botao
                  variante={confirmando === a.id ? "perigo" : "sutil"}
                  icone="trash"
                  disabled={ocupado}
                  title={confirmando === a.id ? "Confirmar remoção" : "Remover anexo"}
                  aria-label={confirmando === a.id ? `Remover ${a.nome} mesmo assim` : `Remover ${a.nome}`}
                  onClick={() => (confirmando === a.id ? void remover(a.id) : setConfirmando(a.id))}
                  style={{ flex: "none" }}
                >
                  {/* Dois toques de propósito: o arquivo apagado não volta, e no
                      celular este botão fica a 12px do link que abre o anexo. */}
                  {confirmando === a.id && "Remover?"}
                </Botao>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeEditar && (
        <label
          style={{
            // `relative` não é enfeite: o <input> abaixo é `absolute` e, sem
            // ancestral posicionado, ele se resolve contra a TELA — dentro de um
            // painel que rola isso estica a extensão do documento sem nada
            // visível estar fora do lugar.
            position: "relative",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            justifySelf: "start", flex: "none", minHeight: "var(--tap)", padding: "0 14px",
            borderRadius: "var(--r-pill)", cursor: ocupado ? "progress" : "pointer",
            fontSize: 13, fontWeight: 700, color: "var(--text)",
            background: "var(--surface)", border: "1px solid var(--border)",
          }}
        >
          <Icon
            name={ocupado ? "loader" : "upload"}
            size={15}
            color="var(--text-dim)"
            className={ocupado ? "spin" : undefined}
          />
          {ocupado ? "Enviando..." : "Anexar arquivo"}
          <input
            type="file"
            accept={EXTENSOES_ACEITAS}
            disabled={ocupado}
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              // O campo é zerado antes do envio: sem isto, escolher o MESMO
              // arquivo de novo (depois de um erro) não dispara `change`.
              e.target.value = "";
              if (arquivo) void enviar(arquivo);
            }}
            style={{
              position: "absolute", opacity: 0, width: 1, height: 1, margin: -1,
              padding: 0, border: 0, overflow: "hidden", clipPath: "inset(50%)",
            }}
          />
        </label>
      )}

      {podeEditar && (
        <small style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
          PDF, XML, imagem, texto ou planilha, até 20 MB. O arquivo é privado: só abre para quem
          tem o Financeiro desta empresa.
        </small>
      )}
    </section>
  );
}

// ── Ficha (o que o clique na linha abre) ─────────────────────────────────────

/**
 * O painel de LEITURA de um registro — a ficha.
 *
 * Existe porque durante um bom tempo o clique na linha era `aoClicar={podeEscrever
 * ? … : undefined}`: quem não tinha a sub de escrita clicava numa lista inteira
 * e não acontecia nada. Não havia mensagem, não havia cursor, não havia pista —
 * a tela simplesmente não respondia, e "não consigo clicar em nada" é como isso
 * chega a quem usa.
 *
 * A separação certa é outra: LER é de quem abre a tela, ESCREVER é de quem tem
 * a chave. Então a linha abre a ficha para todo mundo, e o botão "Editar" só
 * aparece para quem pode — o que também dá um lugar honesto para dizer o que
 * está faltando, em vez de um clique morto.
 */
export function FichaLinha({ rotulo, children, vazio = "—" }: {
  rotulo: string; children?: React.ReactNode; vazio?: string;
}) {
  const preenchido = children !== null && children !== undefined && children !== "";
  return (
    <div
      className="fin-ficha-linha"
      style={{
        display: "grid", gridTemplateColumns: "minmax(min(100%, 116px), 116px) 1fr",
        gap: 12, alignItems: "center", padding: "4px 0", borderTop: "1px solid var(--border)",
        minHeight: 38,
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)" }}>{rotulo}</span>
      <span style={{ fontSize: 13.5, minWidth: 0, overflowWrap: "anywhere", lineHeight: 1.5 }}>
        {preenchido ? children : <span style={{ color: "var(--text-dim)" }}>{vazio}</span>}
      </span>
    </div>
  );
}

/** Um bloco de linhas da ficha, com título. */
export function FichaBloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 16, minWidth: 0 }}>
      <h3 style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".04em", color: "var(--text-dim)", textTransform: "uppercase" }}>
        {titulo}
      </h3>
      <div style={{ marginTop: 4 }}>{children}</div>
    </section>
  );
}

/**
 * O cabeçalho da ficha: marca, nome, e um selo de situação.
 *
 * A marca é a mesma `Marca` da lista de propósito — abrir a ficha e ver outra
 * identidade faria duvidar de que é o mesmo registro.
 */
export function FichaTopo({ marca, titulo, detalhe, selo }: {
  marca: MarcaVisual; titulo: string; detalhe?: React.ReactNode; selo?: React.ReactNode;
}) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
      <Marca marca={marca} tamanho={46} raio={13} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <strong style={{ display: "block", fontSize: 16, fontWeight: 800, letterSpacing: "-.01em", overflowWrap: "anywhere" }}>
          {titulo}
        </strong>
        {detalhe && (
          <span style={{ display: "block", fontSize: 12.5, color: "var(--text-dim)", marginTop: 2 }}>{detalhe}</span>
        )}
      </div>
      {selo}
    </header>
  );
}

/**
 * Um dado que também é AÇÃO: WhatsApp abre a conversa, e-mail abre o cliente,
 * chave PIX copia.
 *
 * Telefone escrito em texto puro obriga a selecionar com o mouse e colar em
 * outro lugar — no celular, a seleção nem sempre pega o número inteiro. É a
 * diferença entre a ficha ser um papel e ser uma ferramenta.
 */
export function FichaContato({ tipo, valor }: { tipo: "whatsapp" | "email" | "site" | "copiar"; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  const so = valor.replace(/\D/g, "");

  if (tipo === "copiar") {
    return (
      <button
        type="button"
        onClick={async () => {
          try { await navigator.clipboard.writeText(valor); setCopiado(true); setTimeout(() => setCopiado(false), 1600); }
          catch { /* sem área de transferência: o texto continua selecionável */ }
        }}
        title="Copiar"
        style={{
          // `--tap` e não 30px: é alvo de dedo, e a regra do projeto é 44.
          // O `padding` vertical fica curto de propósito — quem estica a linha
          // é o `min-height`, então a ficha não ganha altura em quem só lê.
          display: "inline-flex", alignItems: "center", gap: 6, minHeight: "var(--tap)", padding: "3px 10px",
          borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "transparent",
          color: "var(--text)", cursor: "pointer", fontSize: 13.5, maxWidth: "100%", overflowWrap: "anywhere",
        }}
      >
        <Icon name={copiado ? "check" : "copy"} size={14} color={copiado ? "var(--ok)" : "var(--text-dim)"} />
        {copiado ? "Copiado" : valor}
      </button>
    );
  }

  const href = tipo === "whatsapp"
    ? `https://wa.me/${so.length <= 11 ? `55${so}` : so}`
    : tipo === "email" ? `mailto:${valor}`
    : /^https?:\/\//i.test(valor) ? valor : `https://${valor}`;

  return (
    <a
      href={href}
      target={tipo === "email" ? undefined : "_blank"}
      rel="noreferrer"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, minHeight: "var(--tap)",
        color: "var(--primary-texto)", textDecoration: "none", fontWeight: 600, overflowWrap: "anywhere",
      }}
    >
      <Icon
        name={tipo === "whatsapp" ? "brand-whatsapp" : tipo === "email" ? "mail" : "world"}
        size={14}
        color="var(--primary-texto)"
      />
      {valor}
    </a>
  );
}

/**
 * O formulário em modo LEITURA quando falta a permissão de escrever.
 *
 * É a outra metade da `FichaLinha`: nas telas em que o painel É o formulário
 * (contas, recorrências, patrimônio), não faz sentido manter uma segunda tela
 * só de leitura. A linha abre o mesmo painel para todo mundo e este invólucro
 * desliga os campos de quem não pode salvar — com o motivo escrito, em vez do
 * clique morto que existia antes.
 *
 * `<fieldset disabled>` desliga TODO controle descendente de uma vez, nativo, e
 * continua acessível: leitor de tela anuncia o campo como desabilitado. Um
 * `readOnly` em cada `<input>` seria uma linha por campo — e a linha esquecida
 * seria justamente o campo que continua editável.
 *
 * Os três zeros no estilo não são zelo: `<fieldset>` nasce com borda, margem e
 * um `min-width: min-content` INTRÍNSECO que ignora `width: 100%`. Sem
 * `minWidth: 0`, um campo largo dentro dele estica o painel e a folha do
 * celular volta a rolar de lado.
 */
export function SoLeitura({ ativo, children, motivo }: {
  ativo: boolean; children: React.ReactNode; motivo?: string;
}) {
  if (!ativo) return <>{children}</>;
  return (
    <>
      <p
        style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 14, padding: "9px 11px",
          borderRadius: "var(--r-sm)", background: "var(--surface-2)",
          fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5,
        }}
      >
        <Icon name="lock" size={15} color="var(--text-dim)" />
        {motivo ?? "Você abre a ficha, mas não edita: falta a permissão no Financeiro."}
      </p>
      <fieldset disabled style={{ border: 0, margin: 0, padding: 0, minWidth: 0, opacity: 0.75 }}>
        {children}
      </fieldset>
    </>
  );
}

// ── Categorias (mais de uma) ─────────────────────────────────────────────────

/**
 * O seletor de VÁRIAS categorias.
 *
 * Um fornecedor de MDF que também vende cola não cabia em uma palavra só, e
 * quem cadastrava tinha de escolher a "mais certa" — o que faz o outro filtro
 * deixá-lo de fora. Aqui ele marca as duas.
 *
 * O catálogo vem cadastrado (`fin_categorias`), mas o campo aceita nome que
 * ainda não existe: exigir o cadastro antes travaria alguém no meio de um
 * cadastro de fornecedor para ir criar uma categoria noutra tela. O nome novo
 * entra como rótulo e o cadastro é feito depois, na tela de categorias.
 *
 * A PRIMEIRA da lista é a principal — é ela que pinta a linha e manda no
 * filtro. Por isso a ordem é preservada e há como promover uma ao topo: pintar
 * a linha com a média das cores não diria nada, e repetir a linha uma vez por
 * categoria faria a contagem de fornecedores mentir.
 */
export function Categorias(props: Omit<Parametros, "rotuloPrincipal" | "placeholder" | "tipo" | "recadoTeto"> & {
  placeholder?: string;
}) {
  return (
    <ListaDeTextos
      rotuloPrincipal="PRINCIPAL"
      placeholder={props.placeholder ?? "Matéria-prima, embalagem, serviço…"}
      recadoTeto="Oito é o limite. Mais que isso não é categoria, é observação."
      {...props}
    />
  );
}

/**
 * Mais de um WhatsApp. A mesma peça das categorias com outro vocabulário: o
 * primeiro é o que a ficha mostra como botão de conversa, por isso ele é
 * chamado de "principal" e dá para promover outro ao topo.
 */
export function Telefones(props: Omit<Parametros, "rotuloPrincipal" | "placeholder" | "tipo" | "recadoTeto" | "catalogo">) {
  return (
    <ListaDeTextos
      rotuloPrincipal="PRINCIPAL"
      placeholder="(00) 90000-0000"
      tipo="tel"
      recadoTeto="Cinco é o limite."
      catalogo={[]}
      max={5}
      {...props}
    />
  );
}

interface Parametros {
  id?: string;
  escolhidas: string[];
  /** O que já está cadastrado, para escolher sem digitar. Vazio = só digita. */
  catalogo: { nome: string; cor?: string | null }[];
  /** Onde a peça deixa o texto ainda não confirmado, para o formulário ler. */
  pendente?: { current: string };
  aoMudar: (lista: string[]) => void;
  max?: number;
  rotuloPrincipal: string;
  placeholder: string;
  tipo?: "text" | "tel";
  recadoTeto: string;
}

function ListaDeTextos({
  id, escolhidas, catalogo, aoMudar, max = 8, rotuloPrincipal, placeholder, tipo = "text", recadoTeto,
  pendente,
}: Parametros) {
  const [texto, setTexto] = useState("");

  // O que está DIGITADO e ainda não virou etiqueta, visível ao formulário na
  // hora exata em que ele monta o corpo.
  //
  // Só o `blur` não basta, e isso foi medido: ele grava, mas o manipulador do
  // clique em "Salvar" é o da renderização anterior e não enxerga o que
  // acabou de entrar. Depender da ordem entre `blur`, re-render e `click` é
  // depender de um quadro — e foi esse quadro que produziu "digito e não fica
  // nada lá". Um ref é LIDO no instante do salvamento: não há corrida.
  if (pendente) pendente.current = texto;

  // Comparação SEM caixa: "Peças" e "peças" são a mesma, e deixar as duas
  // entrarem é exatamente o defeito que o cadastro de categorias veio resolver.
  const jaTem = (nome: string) =>
    escolhidas.some((c) => c.trim().toLowerCase() === nome.trim().toLowerCase());

  const acrescentar = (bruto: string) => {
    const nome = bruto.trim();
    if (!nome || jaTem(nome) || escolhidas.length >= max) return;
    aoMudar([...escolhidas, nome]);
    setTexto("");
  };

  /**
   * SAIR DO CAMPO GUARDA O QUE FOI DIGITADO.
   *
   * Este é o defeito que fez três correções passarem em branco. O texto ficava
   * num estado LOCAL e só entrava no cadastro por Enter ou pelo botão
   * "Acrescentar". Quem digitava o telefone e clicava direto em **Salvar**
   * perdia o número — em silêncio, com a tela dizendo "Cadastro salvo".
   *
   * Medido em produção pelo log de auditoria: cinco edições seguidas na
   * "Associação Comercial Cerqueira", duas na "CPFL", e as três com telefone,
   * e-mail e endereço vazios no banco. A escrita acontecia; o que ela levava é
   * que estava vazio, porque o valor nunca saiu do input.
   *
   * O `blur` dispara ANTES do `click` do botão, e o React processa os dois em
   * ordem — então o rascunho já está atualizado quando o salvamento monta o
   * corpo. Vale para clicar em Salvar, sair com Tab, ou tocar em qualquer
   * outro campo: o que a pessoa escreveu não se perde por ela não ter
   * adivinhado que faltava um passo.
   */
  const guardarPendente = () => acrescentar(texto);

  const disponiveis = catalogo.filter((c) => !jaTem(c.nome));

  return (
    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
      {escolhidas.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {escolhidas.map((nome, i) => (
            <li key={nome}>
              <span
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32,
                  padding: "3px 3px 3px 10px", borderRadius: "var(--r-pill)",
                  border: "1px solid var(--border)", background: "var(--surface-2)",
                  fontSize: 12.5, fontWeight: 700, maxWidth: "100%",
                }}
              >
                {/* A principal é dita, não deduzida: sem o rótulo, ninguém
                    descobre por que a linha ficou daquela cor. */}
                {i === 0 && escolhidas.length > 1 && (
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", letterSpacing: ".04em" }}>
                    {rotuloPrincipal}
                  </span>
                )}
                <span style={{ overflowWrap: "anywhere" }}>{nome}</span>
                {i > 0 && (
                  <button
                    type="button"
                    title={`Tornar “${nome}” a principal`}
                    onClick={() => aoMudar([nome, ...escolhidas.filter((c) => c !== nome)])}
                    style={{
                      display: "grid", placeItems: "center", width: 26, height: 26, flex: "none",
                      borderRadius: "var(--r-pill)", border: "none", background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <Icon name="arrow-up" size={13} color="var(--text-dim)" />
                  </button>
                )}
                <button
                  type="button"
                  title={`Tirar “${nome}”`}
                  onClick={() => aoMudar(escolhidas.filter((c) => c !== nome))}
                  style={{
                    display: "grid", placeItems: "center", width: 26, height: 26, flex: "none",
                    borderRadius: "var(--r-pill)", border: "none", background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <Icon name="x" size={13} color="var(--text-dim)" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {escolhidas.length < max && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <input
            id={id}
            type={tipo}
            inputMode={tipo === "tel" ? "tel" : undefined}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={guardarPendente}
            onKeyDown={(e) => {
              // Enter acrescenta e NÃO envia o formulário: num painel com um só
              // botão de salvar, o Enter aqui gravaria o cadastro pela metade.
              if (e.key === "Enter") { e.preventDefault(); acrescentar(texto); }
            }}
            list={id && catalogo.length ? `${id}-catalogo` : undefined}
            placeholder={placeholder}
            style={{ flex: "1 1 160px", minWidth: 0 }}
          />
          {id && catalogo.length > 0 && (
            <datalist id={`${id}-catalogo`}>
              {disponiveis.map((c) => <option key={c.nome} value={c.nome} />)}
            </datalist>
          )}
          <BotaoFin icone="plus" onClick={() => acrescentar(texto)}>Acrescentar</BotaoFin>
        </div>
      )}

      {escolhidas.length >= max && (
        <small style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{recadoTeto}</small>
      )}
    </div>
  );
}

// ── Linha rápida ─────────────────────────────────────────────────────────────

/**
 * "Aluguel 8.000 dia 10" — e o formulário se preenche.
 *
 * É o atalho do app de Lembretes da Apple trazido para a agenda de contas: a
 * pessoa escreve do jeito que pensa e os campos de baixo recebem o que a linha
 * entendeu, na hora, a cada tecla. Os chips dizem EXATAMENTE o que foi lido —
 * "Vence 10/09/2026 · R$ 8.000,00" — então não há surpresa: o que não aparece
 * num chip ficou na descrição, visível, para a pessoa corrigir.
 *
 * A linha nunca é obrigatória e nunca tranca os campos: quem prefere preencher
 * um a um simplesmente a ignora. Enter aqui NÃO envia o formulário — leva o
 * foco ao primeiro campo que ainda precisa de atenção.
 */
export function LinhaRapida({ valor, aoMudar, entendido, placeholder, aoEnter }: {
  valor: string;
  aoMudar: (texto: string) => void;
  entendido: string[];
  placeholder?: string;
  /** Chamado no Enter — o formulário decide para onde levar o foco. */
  aoEnter?: () => void;
}) {
  return (
    <div
      style={{
        marginBottom: 16, padding: "12px 12px 10px", borderRadius: "var(--r-md)",
        background: "color-mix(in srgb, var(--primary) 7%, var(--surface))",
        border: "1px solid color-mix(in srgb, var(--primary) 22%, var(--border))",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <Icon name="sparkles" size={17} color="var(--primary-texto)" />
        <input
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aoEnter?.(); } }}
          placeholder={placeholder ?? "Aluguel 8.000 dia 10"}
          aria-label="Linha rápida"
          autoComplete="off"
          style={{
            flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
            fontSize: 15, fontWeight: 600, color: "var(--text)", minHeight: 36,
          }}
        />
        {valor && (
          <button
            type="button"
            title="Limpar"
            aria-label="Limpar"
            onClick={() => aoMudar("")}
            style={{
              // 44×44 na pegada de 36 (margem negativa); transparente, sem mudar a cara.
              display: "grid", placeItems: "center", width: 44, height: 44, margin: -4, flex: "none",
              borderRadius: "var(--r-pill)", border: "none", background: "transparent", cursor: "pointer",
            }}
          >
            <Icon name="x" size={14} color="var(--text-dim)" />
          </button>
        )}
      </div>

      {/* O que foi lido, em chips. Aparecem e somem com a receita de ícone do
          kit — sem deslocar os campos de baixo a cada tecla. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: entendido.length || valor ? 8 : 0, minHeight: 0 }}>
        {/* Entrada própria, sem observador de rolagem: o chip aparece como
            resposta direta à tecla, e um `IntersectionObserver` para "entrou
            na tela" não é o gatilho certo para isso (dentro da folha ele nem
            disparou). `riseIn` termina em `transform: none` — não deixa bloco
            de contenção — e cada chip entra um passo depois do anterior. */}
        {entendido.map((e, i) => (
          <span
            key={e}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", minHeight: 26,
              borderRadius: "var(--r-pill)", fontSize: 12, fontWeight: 700,
              background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary-texto)",
              animation: "riseIn var(--duration-fast) var(--ease-entra) both",
              animationDelay: `calc(var(--duration-stagger) * ${i})`,
            }}
          >
            <Icon name="check" size={12} color="var(--primary-texto)" />
            {e}
          </span>
        ))}
        {valor && !entendido.length && (
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Escreva o valor e quando vence — “dia 10”, “amanhã”, “15/09”.
          </span>
        )}
      </div>
    </div>
  );
}


// ── Modal de formulário: só fecha no X ───────────────────────────────────────

/**
 * O pop-up de cadastrar — e ele só fecha no X.
 *
 * O dono pediu isto com todas as letras: formulário no meio da página não, e o
 * pop-up que não some quando a mão escorrega. Por isso este modal NÃO fecha
 * clicando fora, NÃO fecha no Esc e NÃO fecha arrastando: cada um desses era um
 * jeito de perder vinte campos digitados por um gesto involuntário. O único
 * caminho de saída é o X (44px, no canto) e o "Cancelar" do rodapé — os dois
 * explícitos, os dois alcançáveis pelo polegar.
 *
 * Isto contraria a regra geral do kit (Esc e clique fora fecham), e é de
 * propósito: a regra geral serve a painel de LEITURA, onde não há nada a
 * perder. Num formulário, o custo do fechamento acidental é maior que o
 * custo de um clique a mais.
 *
 * Sobre a fundação: `apple-backdrop` + `apple-modal` do `globals.css` — abre
 * com a receita do sistema, vira folha presa embaixo no celular (≤700px), rola
 * por dentro. Portal no `<body>` porque a coluna de conteúdo tem `overflow:
 * hidden` e o modal nasceria recortado; `.fin-scope` vai junto para os tokens
 * do módulo valerem dentro. Rolagem da página travada enquanto aberto.
 */
export function ModalFormulario({ icone, titulo, subtitulo, aoFechar, rodape, largura = 640, children }: {
  icone: string;
  titulo: string;
  subtitulo?: React.ReactNode;
  /** Chamado SÓ pelo X (e por quem você puser no rodapé). */
  aoFechar: () => void;
  rodape?: React.ReactNode;
  largura?: number;
  children: React.ReactNode;
}) {
  const { classe } = useAbrirFechar(true, "--modal-close-dur");
  const idTitulo = useId();
  const corpo = useRef<HTMLDivElement>(null);

  // Página parada atrás, e o foco entra no primeiro campo: quem abriu um
  // formulário quer digitar, não procurar onde.
  useEffect(() => {
    const soltar = travarRolagem();
    const primeiro = corpo.current?.querySelector<HTMLElement>("input, select, textarea");
    // Relógio, e não `requestAnimationFrame`: aba em segundo plano e painel
    // embutido param de servir quadros, e o foco nunca chegaria. Um tempo
    // curto também deixa a animação de entrada começar antes do teclado subir.
    const t = setTimeout(() => primeiro?.focus(), 40);
    return () => { clearTimeout(t); soltar(); };
  }, []);

  // O Tab circula DENTRO do modal. Sem isto, um Tab a mais cai na página
  // escurecida atrás — e no celular isso leva a rolagem para fora da folha.
  useEffect(() => {
    const onTecla = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !corpo.current) return;
      const lista = [...corpo.current.closest("[role=dialog]")!.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null);
      if (!lista.length) { e.preventDefault(); return; }
      const primeiro = lista[0], ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener("keydown", onTecla);
    return () => document.removeEventListener("keydown", onTecla);
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    // Sem `onMouseDown` no véu: clicar fora NÃO fecha. Ver o comentário acima.
    <div className={`fin-scope apple-backdrop ${classe}`.trim()} style={{ zIndex: "var(--z-modal, 1300)" }}>
      <section
        className={`apple-modal t-modal ${classe}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        style={{
          width: largura, maxWidth: "100%", borderRadius: "var(--r-md)", padding: 0, minWidth: 0,
          display: "grid", gridTemplateRows: "auto 1fr auto", maxHeight: "calc(100dvh - 32px)",
        }}
      >
        <header
          style={{
            display: "flex", alignItems: "flex-start", gap: 10, padding: "16px 16px 12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Icon name={icone} size={19} color="var(--primary-texto)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={idTitulo} style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.01em", lineHeight: 1.25 }}>
              {titulo}
            </h2>
            {subtitulo && (
              <p style={{ marginTop: 3, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.45 }}>{subtitulo}</p>
            )}
          </div>
          <BotaoIcone
            icone="x"
            titulo="Fechar"
            variante="secundario"
            onClick={aoFechar}
            style={{ flex: "none", marginTop: -4, marginRight: -4 }}
          />
        </header>

        {/* O corpo rola; cabeçalho e rodapé ficam presos — no celular o botão
            principal continua debaixo do polegar com a lista longa. */}
        <div ref={corpo} style={{ overflowY: "auto", overscrollBehavior: "contain", padding: 16, minWidth: 0 }}>
          {children}
        </div>

        {rodape && (
          <footer
            style={{
              display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center",
              padding: "12px 16px calc(12px + var(--safe-b))", borderTop: "1px solid var(--border)",
            }}
          >
            {rodape}
          </footer>
        )}
      </section>
    </div>,
    document.body,
  );
}

// ── Apagar de verdade ────────────────────────────────────────────────────────

/**
 * O botão de APAGAR — o que faltava em conta, patrimônio, recorrência e empresa.
 *
 * Dava para cadastrar e não dava para desfazer: quem está aprendendo o sistema
 * cria três contas de teste e fica com elas para sempre. "Não consigo excluir o
 * que eu subo" foi exatamente a reclamação.
 *
 * Apagar ≠ inativar, e as duas coisas continuam existindo:
 *  · APAGAR some com a linha. Só vale para o que nunca foi usado — a rota
 *    recusa (409) o que tem movimento, compromisso ou compra pendurada, e a
 *    mensagem dela chega inteira aqui, dizendo o que segura.
 *  · INATIVAR tira de circulação e guarda a história. É o caminho de quase tudo
 *    que já rodou, e cada tela já tem o seu.
 *
 * A confirmação é obrigatória e nomeia o registro: apagar não tem desfazer, e
 * um "Apagar" ao lado de "Salvar" numa folha estreita é fácil de acertar sem
 * querer.
 */
export function BotaoApagar({ tipo, id, nome, aoApagar, rotulo = "Apagar", detalhe }: {
  tipo: "conta" | "patrimonio" | "recorrencia" | "empresa" | "compromisso" | "colaborador" | "estorno";
  id: string;
  /** Vai na pergunta: "Apagar a conta «Itaú»?" — sem nome, ninguém confere. */
  nome: string;
  /** Chamado depois de apagar, para a tela fechar a folha e recarregar. */
  aoApagar: () => void;
  rotulo?: string;
  /** Uma frase a mais na pergunta, quando apagar tem consequência que não se
   *  vê — como a conta que a recorrência vai gerar de novo no mês que vem. */
  detalhe?: string;
}) {
  const [ocupado, setOcupado] = useState(false);

  async function apagar() {
    if (!(await confirmar(`Apagar ${nome ? `“${nome}”` : "este registro"}?`, {
      detalhe: [
        "Some de vez, e não tem desfazer. O que já tem histórico não é apagado — nesse caso a tela avisa e o caminho é tirar de circulação.",
        detalhe,
      ].filter(Boolean).join(" "),
      perigo: true,
    }))) return;
    setOcupado(true);
    try {
      const r = await fetch(`/api/financeiro/excluir?tipo=${tipo}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const dados = (await r.json().catch(() => ({}))) as { erro?: string; emUso?: boolean };
      if (!r.ok) {
        // A mensagem do servidor chega INTEIRA: é ela que diz "tem 3 movimentos
        // no extrato", e trocá-la por um genérico esconderia o que fazer.
        toast.erro(dados.erro ?? "Não deu para apagar.");
        return;
      }
      toast.ok("Apagado.");
      aoApagar();
    } catch {
      toast.erro("Sem resposta do servidor. Confira a conexão e tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Botao variante="perigo" icone="trash" onClick={apagar} carregando={ocupado}>
      {rotulo}
    </Botao>
  );
}

// ── Escolher com busca ───────────────────────────────────────────────────────

export interface OpcaoEscolha {
  id: string;
  nome: string;
  /** Segunda linha: CNPJ, categoria, o que distingue dois nomes parecidos. */
  detalhe?: string;
  /** Cabeçalho de grupo ("Fornecedores", "Contatos"). */
  grupo?: string;
  marca?: MarcaVisual;
}

/**
 * O seletor que se PESQUISA.
 *
 * O `<select>` nativo faz uma coisa bem — escolher entre poucas opções — e
 * desmonta com muitas: a lista de "Relacionado a" já abre com dez fornecedores
 * e vai crescer, e achar um nome ali é rolar procurando com o olho. Não há
 * busca, não há foto, e o teclado só salta pela primeira letra.
 *
 * Aqui a lista é filtrada enquanto se digita, mostra a marca de cada um e é
 * navegável por teclado inteiro (↑ ↓ ↵ Esc). O painel vai para o `<body>` por
 * portal, via `Ancorado` — a regra do CLAUDE.md: popover não mora dentro da
 * fileira, senão um `transform` de ancestral cria contexto de empilhamento e o
 * clique cai no cartão de baixo.
 *
 * MOVIMENTO (transitions.dev + Apple):
 *  · a folha CRESCE do gatilho (`t-dropdown` com `data-origin`), porque o olho
 *    segue a origem: nascer do canto errado lê como "apareceu por cima";
 *  · fechar é mais rápido que abrir — abrir é convite, fechar é sair da frente;
 *  · o realce da opção responde no `pointerdown`, não no clique: esperar o
 *    `mouseup` para pintar é a latência que faz a lista parecer morta.
 */
export function Escolha({
  valor, opcoes, aoEscolher, id, vazio = "Sem seleção", placeholder = "Buscar…", disabled,
  busca: buscaProp, semVazio, rotuladoPor, aoCriar, rotuloCriar = "Criar",
}: {
  valor: string;
  opcoes: OpcaoEscolha[];
  aoEscolher: (id: string) => void;
  id?: string;
  /** O rótulo da opção "nenhuma" — ela sempre existe, e é a primeira. */
  vazio?: string;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Mostrar o campo de busca. Por padrão ele aparece SOZINHO a partir de oito
   * opções — antes disso ele é ruído: a lista inteira cabe na tela e procurar
   * é mais lento que olhar. Passe `true`/`false` para mandar.
   */
  busca?: boolean;
  /**
   * Tira a opção "nenhuma". Para escolha OBRIGATÓRIA (tipo de conta,
   * periodicidade): oferecer "sem seleção" onde o campo não aceita vazio é
   * mostrar um caminho que não existe.
   */
  semVazio?: boolean;
  /** `id` do texto que rotula este seletor, para o leitor de tela. */
  rotuladoPor?: string;
  /**
   * Criar o que não existe SEM SAIR DA TELA.
   *
   * Sem isto, lançar uma conta de um fornecedor novo custa: descobrir que ele
   * não está na lista, fechar o formulário (perdendo o que já foi digitado),
   * ir em Cadastros, criar, voltar, começar de novo. Cinco passos para uma
   * informação que a pessoa já tem na mão — e é o que faz alguém deixar o
   * campo em branco "para resolver depois", que é quando ele nunca é
   * preenchido.
   *
   * Recebe o texto buscado e devolve o `id` do que foi criado (ou `null` se
   * não deu). A opção só aparece quando a busca não achou nada.
   */
  aoCriar?: (nome: string) => Promise<string | null>;
  rotuloCriar?: string;
}) {
  const gatilho = useRef<HTMLButtonElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(0);
  const [criando, setCriando] = useState(false);

  const escolhida = opcoes.find((o) => o.id === valor) ?? null;

  // Sem acento e sem caixa: quem digita "acrilicos" quer "Acrílicos", e quem
  // digita "PACKIT" quer "Packit". Um filtro que exige o acento certo é um
  // filtro que não acha nada.
  const simples = (t: string) =>
    t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");

  const filtradas = useMemo(() => {
    const t = simples(busca.trim());
    if (!t) return opcoes;
    return opcoes.filter((o) => simples(`${o.nome} ${o.detalhe ?? ""}`).includes(t));
  }, [busca, opcoes]);

  // A opção "nenhuma" entra na navegação como índice 0: sem isso, limpar a
  // escolha pelo teclado é impossível. Em campo obrigatório ela não existe.
  const lista: (OpcaoEscolha | null)[] = useMemo(
    () => (semVazio ? filtradas : [null, ...filtradas]), [filtradas, semVazio]);

  // A busca se paga a partir de umas oito linhas. Abaixo disso a lista toda
  // cabe na tela, e um campo de texto entre o clique e a escolha só atrasa.
  // Com criação, a busca é obrigatória: é ela que dá o NOME do novo cadastro.
  const temBusca = buscaProp ?? (!!aoCriar || opcoes.length >= 8);
  // Criar exige ter digitado: o nome do novo cadastro é o que está na busca.
  const podeCriar = !!aoCriar && !!busca.trim();

  useEffect(() => { setAtivo(0); }, [busca]);
  useEffect(() => {
    if (!aberto) { setBusca(""); return; }
    // O foco vai para a busca no quadro seguinte: o painel ainda não está no
    // DOM no mesmo tick em que `aberto` vira true. Sem busca, o foco vai para
    // o painel — o teclado tem de funcionar dos dois jeitos.
    const q = requestAnimationFrame(() => (temBusca ? campo.current : painelRef.current)?.focus());
    return () => cancelAnimationFrame(q);
  }, [aberto, temBusca]);

  async function criar() {
    const nome = busca.trim();
    if (!aoCriar || !nome || criando) return;
    setCriando(true);
    try {
      const id = await aoCriar(nome);
      if (id) {
        aoEscolher(id);
        setAberto(false);
        gatilho.current?.focus();
      }
    } finally {
      setCriando(false);
    }
  }

  function escolher(o: OpcaoEscolha | null) {
    aoEscolher(o?.id ?? "");
    setAberto(false);
    // O foco VOLTA para o gatilho. Sem isto, quem navegava por teclado perde o
    // lugar e o próximo Tab recomeça do topo da página.
    gatilho.current?.focus();
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => {
        const n = lista.length;
        return n ? (i + (e.key === "ArrowDown" ? 1 : -1) + n) % n : 0;
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Buscou, não achou, e dá para criar: o Enter cria. É o gesto que a
      // pessoa já faria, e obrigá-la a mirar num botão depois de digitar o
      // nome inteiro é um passo a mais sem ganho.
      if (podeCriar && !filtradas.length) { void criar(); return; }
      escolher(lista[ativo] ?? null);
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setAberto(false); gatilho.current?.focus(); }
  }

  return (
    <>
      <button
        ref={gatilho}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={aberto}
        aria-haspopup="listbox"
        aria-labelledby={rotuladoPor}
        disabled={disabled}
        onClick={() => setAberto((v) => !v)}
        className="ui-card-alvo"
        style={{
          display: "flex", alignItems: "center", gap: 9, width: "100%",
          minHeight: "var(--tap)", padding: "0 12px", borderRadius: "var(--r-sm, 11px)",
          border: "1px solid var(--border)", background: "var(--surface)",
          color: escolhida ? "var(--text)" : "var(--text-dim)",
          fontSize: 13.5, textAlign: "left", cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.6 : 1, minWidth: 0,
        }}
      >
        {escolhida?.marca && <Marca marca={escolhida.marca} tamanho={22} raio={6} />}
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {escolhida?.nome ?? vazio}
        </span>
        <span className="esc-seta" style={{ display: "grid", placeItems: "center", lineHeight: 0 }}>
          <Icon name="chevron-down" size={15} color="var(--text-dim)" />
        </span>
      </button>

      <Ancorado ancora={gatilho} aberto={aberto} aoFechar={() => setAberto(false)} largura={320}>
        <div
          ref={painelRef}
          tabIndex={-1}
          onKeyDown={teclado}
          style={{ display: "grid", gap: 0, minWidth: 0, outline: "none" }}
        >
          {temBusca && (
            <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
              <input
                ref={campo}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={placeholder}
                aria-label="Buscar na lista"
                style={{ width: "100%", minHeight: 34, fontSize: 13.5 }}
              />
            </div>
          )}
          <div role="listbox" style={{ maxHeight: 280, overflowY: "auto", overscrollBehavior: "contain", padding: 5 }}>
            {podeCriar && !filtradas.length ? (
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); void criar(); }}
                style={{
                  display: "flex", alignItems: "center", gap: 9, width: "100%",
                  minHeight: 44, padding: "0 10px", borderRadius: 9, minWidth: 0,
                  border: "none", cursor: "pointer", textAlign: "left", fontSize: 13.5,
                  fontWeight: 700, color: "var(--primary-texto)", background: "transparent",
                }}
              >
                <Icon name="plus" size={16} color="var(--primary-texto)" />
                <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                  {criando ? "Criando…" : `${rotuloCriar} “${busca.trim()}”`}
                </span>
              </button>
            ) : lista.length === 1 && busca.trim() && !semVazio ? (
              <p style={{ padding: "14px 10px", fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
                Nada com “{busca.trim()}”.
              </p>
            ) : lista.map((o, i) => {
              const anterior = i > 1 ? lista[i - 1]?.grupo : undefined;
              const cabecalho = o?.grupo && o.grupo !== anterior ? o.grupo : null;
              return (
                <Fragment key={o?.id ?? "__vazio"}>
                  {cabecalho && (
                    <p style={{
                      padding: "9px 10px 5px", fontSize: 11, fontWeight: 800,
                      letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-dim)",
                    }}>{cabecalho}</p>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={(o?.id ?? "") === valor}
                    // `pointerdown`, não `click`: o realce tem de responder no
                    // instante do toque. Esperar o `mouseup` é a latência que
                    // faz a lista parecer morta (Apple, §1).
                    onPointerDown={(e) => { e.preventDefault(); escolher(o); }}
                    onMouseEnter={() => setAtivo(i)}
                    className="esc-opcao"
                    data-ativa={i === ativo ? "1" : undefined}
                    style={{
                      display: "flex", alignItems: "center", gap: 9, width: "100%",
                      minHeight: 38, padding: "0 10px", borderRadius: 9, minWidth: 0,
                      border: "none", cursor: "pointer", textAlign: "left", fontSize: 13.5,
                      color: o ? "var(--text)" : "var(--text-dim)",
                      background: i === ativo ? "var(--surface-2)" : "transparent",
                    }}
                  >
                    {o?.marca && <Marca marca={o.marca} tamanho={22} raio={6} />}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o?.nome ?? vazio}
                      </span>
                      {o?.detalhe && (
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)", overflowWrap: "anywhere" }}>
                          {o.detalhe}
                        </span>
                      )}
                    </span>
                    {(o?.id ?? "") === valor && <Icon name="check" size={15} color="var(--primary-texto)" />}
                  </button>
                </Fragment>
              );
            })}
          </div>
        </div>
      </Ancorado>
    </>
  );
}

// ── Duas ou três opções ──────────────────────────────────────────────────────

/**
 * O controle SEGMENTADO — para vocabulário curto e fixo.
 *
 * "Sim/Não", "Ativo/Inativo", "Pessoa/Empresa": três palavras que cabem lado a
 * lado. Num `<select>` elas custam um clique para abrir, um para escolher e
 * escondem as alternativas até lá; num popover com busca, pior ainda — a folha
 * inteira para escolher entre duas coisas. Aqui as opções estão SEMPRE
 * visíveis e a escolha é um toque.
 *
 * É a regra de escolher o controle pela quantidade: lista que cresce pede
 * busca (`Escolha`), vocabulário fechado e curto pede que tudo apareça de uma
 * vez.
 *
 * A pílula ativa desliza entre as opções (`t-tabs` da escala de movimento) —
 * simétrica de propósito: é uma troca reversível, não abrir e fechar.
 */
export function Alternativas<T extends string>({ valor, opcoes, aoEscolher, id, rotuladoPor }: {
  valor: T;
  opcoes: { id: T; label: string; icone?: string }[];
  aoEscolher: (v: T) => void;
  id?: string;
  rotuladoPor?: string;
}) {
  return (
    // `<div>`, nunca `<label>`: rótulo que envolve um grupo de botões dispara
    // o PRIMEIRO deles ao ser clicado, e a escolha muda sozinha. Já custou
    // caro neste repositório.
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={rotuladoPor}
      style={{
        display: "inline-flex", gap: 3, padding: 3, minWidth: 0, maxWidth: "100%",
        borderRadius: "var(--r-pill)", border: "1px solid var(--border)",
        background: "var(--surface)", overflowX: "auto", scrollbarWidth: "none",
      }}
    >
      {opcoes.map((o) => {
        const ativa = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={ativa}
            // No `pointerdown`: esperar o `mouseup` para pintar é a latência
            // que faz o controle parecer morto.
            onPointerDown={(e) => { e.preventDefault(); aoEscolher(o.id); }}
            className="ui-card-alvo"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              minHeight: "calc(var(--tap) - 8px)", padding: "0 13px", whiteSpace: "nowrap",
              borderRadius: "var(--r-pill)", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: ativa ? 750 : 600,
              color: ativa ? "var(--on-primary, #fff)" : "var(--text-dim)",
              background: ativa ? "var(--primary-acao, var(--primary))" : "transparent",
              transition: "background var(--duration-fast) var(--ease-smooth-out), color var(--duration-fast) var(--ease-smooth-out)",
            }}
          >
            {o.icone && <Icon name={o.icone} size={14} color={ativa ? "var(--on-primary, #fff)" : "var(--text-dim)"} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
