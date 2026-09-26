"use client";

// ── Funil (redesign 18/09, referência UTMify/ClickFunnels) ──────────────────
// O funil deixou o trapézio de clip-path e virou o desenho que essas duas
// ferramentas consagraram: BARRAS CENTRADAS empilhadas, largura proporcional
// ao valor — a silhueta de funil aparece sozinha, sem geometria recortada. O
// que o trapézio tinha de defeito morre junto: texto DENTRO da forma (branco
// sobre cor, ilegível no claro e apertado na última etapa), canto que
// arredondava errado quando a altura mudava, e a forma deitada que precisava
// de 560px e de um alternador próprio. Aqui o rótulo, o número e o "% do
// topo" moram FORA da forma, em tinta de token (dois temas de graça), e a
// taxa de passagem fica ENTRE as etapas, com a seta — que é onde a perda
// acontece. Um desenho só, em pé, pra toda largura a partir de 320px.
// A rampa de cor continua a de lib/funil-forma (corDaFaixa — escuro no topo,
// claro embaixo, derivada da cor da pessoa).

import type { CSSProperties } from "react";
import { ALTURA_FAIXA } from "@/lib/funil-forma";
import { fmtNum } from "@/lib/format";

export type TomTaxa = "bom" | "atencao" | "ruim" | "neutro";

export interface EtapaFunil {
  chave: string;
  nome: string;
  valor: number;
  /** Texto pronto do valor (quando a etapa tem formato próprio). */
  texto?: string;
  /** Quanto seguiu da etapa de cima, já formatado ("1,7%"). */
  taxa?: string;
  taxaTom?: TomTaxa;
  /** Ícone Tabler; sem ele, sai do nome/chave da etapa. */
  icone?: string;
}

/** "1,7%" no formato da casa (vírgula, uma casa abaixo de 10). Abaixo de
 *  0,1% vira "<0,1%" — arredondar 1 compra em 18.740 pra "0%" afirmava que
 *  não houve conversão, e houve. */
export function pctFunil(p: number): string {
  if (p > 0 && p < 0.1) return "<0,1%";
  return `${p.toLocaleString("pt-BR", { maximumFractionDigits: p < 10 ? 1 : 0 })}%`;
}

export function FunilForma({
  etapas, formatar = fmtNum, onEtapa, ativa, rotulo = "Funil", alturaFaixa = ALTURA_FAIXA, orientacao = "vertical",
}: {
  etapas: EtapaFunil[];
  formatar?: (n: number) => string;
  /** Com isto cada faixa vira botão. */
  onEtapa?: (chave: string) => void;
  ativa?: string | null;
  rotulo?: string;
  /**
   * Altura da faixa em px, quando quem chama sabe a caixa que tem. O padrão
   * (64) é o funil de página, que rola. Dentro de card de painel a caixa é
   * FIXA: com 64 travado, cinco etapas pediam 373px numa caixa de 318 e o
   * <CabeNaCaixa> salvava dando zoom — encolhendo o texto junto, que é o
   * "funil cortado". Passando a altura, ele CABE no tamanho certo.
   */
  alturaFaixa?: number;
  /** "deitada": fileiras horizontais (rótulo + pílula + perda em vermelho),
   *  o desenho de leitura de vazamento do mockup — cabe em qualquer largura. */
  orientacao?: "vertical" | "deitada";
}) {
  const n = etapas.length;
  const topo = etapas[0]?.valor ?? 0;
  // Escala: quando a 1ª etapa esmaga as outras (impressões vs cliques é 60:1
  // num funil comum), TODAS as barras de baixo colapsariam no piso e o funil
  // viraria "uma barra e quatro palitos". Regra: 1ª etapa acima de 6× a 2ª
  // SAI da escala — desenha inteira com as pontas esmaecidas ("continua além
  // da tela") e a legenda avisa; as demais se comparam entre si, que é a
  // comparação que dá pra ler. Abaixo de 6× a escala é uma só, linear.
  const maiorResto = Math.max(1, ...etapas.slice(1).map((e) => e.valor));
  const foraDeEscala = n > 1 && topo > 6 * maiorResto;
  const base = foraDeEscala ? maiorResto : Math.max(1, topo, maiorResto);
  // Fração (0..1) de cada etapa na escala. Piso de 8%: etapa quase zerada
  // ainda desenha — sumir diria "não existe", e ela existe (é o gargalo).
  const frac = etapas.map((e, i) =>
    i === 0 && foraDeEscala ? 1 : Math.min(1, Math.max(0.08, e.valor / base)));
  // Cor da etapa (ajuste 19/09, reclamação do dono: "as cores não combinam"):
  // a rampa antiga (corDaFaixa) misturava a cor da pessoa com PRETO — os
  // roxos acinzentados do design velho. Agora é a MESMA linguagem do resto do
  // painel: a cor da pessoa desbotando degrau a degrau contra a SUPERFÍCIE do
  // tema (100% → 45%), viva no claro e no escuro. A última etapa segue VERDE:
  // ganho é cor de estado, não de rampa.
  const corDa = (i: number) => {
    if (i === n - 1 && n > 1) return "var(--tf-pos, var(--ok))";
    const t = n > 1 ? i / (n - 1) : 0;
    // 100→62 (era →45): a ponta clara ficava lavada demais e o branco de
    // dentro perdia apoio.
    return `color-mix(in srgb, var(--graf-1, var(--primary)) ${Math.round(100 - 38 * t)}%, var(--surface))`;
  };
  // Taxa de passagem i-1 → i, em número (pra achar o maior vazamento).
  const passagemDe = (i: number) => (i > 0 && etapas[i - 1].valor > 0 ? (etapas[i].valor / etapas[i - 1].valor) * 100 : null);
  const avisoEscala = foraDeEscala
    ? ` ${etapas[0].nome} está fora de escala (${Math.round(topo / maiorResto)}× a maior das outras).`
    : "";

  if (orientacao === "deitada") {
    // HORIZONTAL (mockup 19/09): uma FILEIRA por etapa — rótulo e valor à
    // esquerda, a PÍLULA alinhada à esquerda com largura ∝ % do topo, o % ao
    // lado e a PERDA em vermelho na ponta. A legenda aponta o MAIOR
    // vazamento, com a conta pronta.
    let pior: number | null = null;
    for (let i = 1; i < n; i++) { const p = passagemDe(i); if (p != null && (pior == null || p < (passagemDe(pior) ?? 101))) pior = i; }
    const piorTaxa = pior != null ? passagemDe(pior) : null;
    return (
      <div className="funil-bloco" data-deitado="">
        <div role="group" aria-label={rotulo} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {etapas.map((e, i) => {
            const perda = i > 0 ? etapas[i - 1].valor - e.valor : null;
            const pct = topo > 0 ? pctFunil((e.valor / topo) * 100) : "—";
            const miolo = (
              <>
                <span className="funil-rotuloH">
                  <span className="funil-nome">{e.nome}</span>
                  <span className="stat funil-do-topo">{e.texto ?? formatar(e.valor)}</span>
                </span>
                <span className="funil-trilhoH">
                  {/* A pílula vive num TRILHO próprio: a largura em % é do
                      trilho, e o % de texto fica FORA dele — com a pílula em
                      100% o rótulo invadia a coluna da perda. */}
                  <span className="funil-trilhoH-pista">
                    <span className="funil-pilula" data-fora-de-escala={i === 0 && foraDeEscala ? "" : undefined}
                      style={{ width: `${(frac[i] * 100).toFixed(2)}%`, ["--funil-cor" as string]: corDa(i), background: i === 0 && foraDeEscala ? undefined : corDa(i) }} />
                  </span>
                  <span className="stat funil-do-topo">{pct}</span>
                </span>
                {/* Perda NEGATIVA é ganho (etapa maior que a anterior acontece
                    em dado real de atribuição): vira +N em verde, não "−-N". */}
                <span className="stat funil-perda" style={perda == null ? { color: "var(--text-dim)", fontWeight: 500 } : perda < 0 ? { color: "var(--tf-pos, var(--ok))" } : undefined}>
                  {perda == null ? "—" : perda < 0 ? `+${formatar(-perda)}` : `−${formatar(perda)}`}
                </span>
              </>
            );
            return onEtapa
              ? <button key={e.chave} type="button" className="funil-linhaH funil-faixa" aria-pressed={ativa === e.chave} onClick={() => onEtapa(e.chave)}>{miolo}</button>
              : <div key={e.chave} className="funil-linhaH funil-faixa">{miolo}</div>;
          })}
        </div>
        {pior != null && piorTaxa != null && (
          <p className="funil-legenda" data-tom="ruim">
            <i aria-hidden="true" />
            Maior vazamento: {etapas[pior - 1].nome} → {etapas[pior].nome} retém apenas {pctFunil(piorTaxa)} (−{formatar(etapas[pior - 1].valor - etapas[pior].valor)}).{avisoEscala}
          </p>
        )}
      </div>
    );
  }

  // VERTICAL (ajuste 19/09, depois do dado real): BARRAS retangulares
  // centradas que estreitam até o "quadrão" final — o mesmo vocabulário do
  // horizontal, em pé. O trapézio do mockup morreu no primeiro dado de
  // verdade: com 1,5% de passagem, topo largo + fundo estreito virava
  // gravata-borboleta e o texto estourava da forma. A barra tem PISO de
  // largura no CSS (o texto sempre cabe); número e "NOME · %" seguem DENTRO,
  // "X% passam" entre as etapas, rodapé com a conta.
  const ultimo = etapas[n - 1];
  const convTotal = topo > 0 && n > 1 ? pctFunil((ultimo.valor / topo) * 100) : null;
  return (
    <div className="funil-bloco" style={alturaFaixa === ALTURA_FAIXA ? undefined : ({ "--funil-faixa-h": `${alturaFaixa}px` } as CSSProperties)}>
      <div className="funil" role="group" aria-label={rotulo}>
        {etapas.map((e, i) => {
          const p = passagemDe(i);
          const miolo = (
            <>
              <strong className="funil-valor">{e.texto ?? formatar(e.valor)}</strong>
              <span className="funil-nome"><span>{e.nome}</span>{topo > 0 ? ` · ${pctFunil((e.valor / topo) * 100)}` : ""}</span>
            </>
          );
          return (
            <div key={e.chave} style={{ minWidth: 0 }}>
              {i > 0 && p != null && (
                <span className="funil-passa"><i aria-hidden="true" />{pctFunil(p)} passam<i aria-hidden="true" /></span>
              )}
              {onEtapa ? (
                <button type="button" className="funil-faixa" aria-pressed={ativa === e.chave} onClick={() => onEtapa(e.chave)}
                  data-fora-de-escala={i === 0 && foraDeEscala ? "" : undefined}
                  style={{ width: `${(frac[i] * 100).toFixed(2)}%`, ["--funil-cor" as string]: corDa(i), background: i === 0 && foraDeEscala ? undefined : corDa(i) }}>{miolo}</button>
              ) : (
                <div className="funil-faixa" data-fora-de-escala={i === 0 && foraDeEscala ? "" : undefined}
                  style={{ width: `${(frac[i] * 100).toFixed(2)}%`, ["--funil-cor" as string]: corDa(i), background: i === 0 && foraDeEscala ? undefined : corDa(i) }}>{miolo}</div>
              )}
            </div>
          );
        })}
      </div>
      {convTotal != null && (
        <p className="funil-legenda">
          <i aria-hidden="true" />
          {formatar(topo)} {etapas[0].nome.toLowerCase()} entram · {formatar(ultimo.valor)} {ultimo.nome.toLowerCase()} saem · {convTotal} de conversão.{avisoEscala}
        </p>
      )}
    </div>
  );
}

/**
 * O funil DEITADO: atalho pra `FunilForma orientacao="deitada"` — as fileiras
 * de pílulas com a perda em vermelho (mockup 19/09).
 */
export function FunilFormaHorizontal({
  etapas, formatar = fmtNum, rotulo = "Funil",
}: {
  etapas: EtapaFunil[];
  formatar?: (n: number) => string;
  rotulo?: string;
}) {
  return <FunilForma etapas={etapas} formatar={formatar} rotulo={rotulo} orientacao="deitada" />;
}

/**
 * "Taxas de conversão" — a coluna ao lado do funil: uma linha do tempo com a
 * conversão de cada passagem escrita grande. Repete o número da pílula de
 * propósito: aqui ele é lido de relance, em coluna, sem procurar na faixa.
 */
export function TaxasDoFunil({ passagens }: { passagens: { de: string; para: string; taxa: string; tom?: TomTaxa }[] }) {
  if (passagens.length === 0) return null;
  return (
    <div className="funil-taxas">
      <div className="funil-taxas-titulo">Taxas de conversão</div>
      <ol>
        {passagens.map((x) => (
          <li key={x.para}>
            <div className="funil-taxas-linha">
              <span>{x.para}</span>
              <strong data-tom={x.tom ?? "neutro"}>{x.taxa}</strong>
            </div>
            <small>conversão de {x.de.toLowerCase()}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
