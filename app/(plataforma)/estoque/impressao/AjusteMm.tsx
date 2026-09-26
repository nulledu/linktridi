"use client";

// ── Menos · CAMPO · Mais ─────────────────────────────────────────────────────
//
// O que o dono relatou foi "não tá dando pra ajustar pelo teclado", e ele estava
// certo em duas telas ao mesmo tempo: aqui e no tablet, TODO ajuste era só um
// par de botões +/−. Para atravessar de 10 a 80mm era preciso apertar setenta
// vezes; para chegar a 47mm partindo de 15, quarenta e duas. Ninguém faz isso —
// a pessoa para no primeiro valor tolerável e conclui que o ajuste não serve.
//
// O comentário que estava no `Ajuste` antigo dizia que campo de texto era
// perigoso porque "aceita 300 digitado sem querer". O medo é real e a conclusão
// era errada: quem protege contra 300 é a FAIXA, não a ausência de teclado — e
// a faixa já existe, em três lugares (tela, rota e `check` do banco). Tirar o
// teclado não impedia o valor errado, impedia o valor certo.
//
// Então: os dois. O +/− continua para quem quer 1mm a mais (é o gesto certo pra
// quem está de luva, e agora anda de 1 em 1); o campo, para quem já sabe o
// número. Seta pra cima e pra baixo também andam, porque quem está com o dedo
// no campo não quer procurar o botão.
//
// O valor SÓ é aplicado quando cabe na faixa. Digitar "4" a caminho de "48" não
// pode empurrar a prévia pra 25 e reescrever o campo embaixo do dedo; no
// `blur`, o que sobrou é preso na faixa e mostrado — a correção acontece, mas
// depois que a pessoa terminou de falar.
//
// ── O RASCUNHO, e por que sem ele NADA se digitava ──────────────────────────
//
// A primeira versão deste campo tinha o parágrafo acima e mesmo assim não
// deixava digitar UM número sequer. O defeito estava entre as duas regras, não
// dentro de nenhuma delas:
//
//   `value` vinha de `valor` (campo controlado) e `digitar` só chamava `onMuda`
//   com número JÁ dentro da faixa. Então o dígito parcial não era corrigido —
//   era DESCARTADO, e o React reescrevia o campo com o valor antigo no mesmo
//   quadro. Como o mínimo é 10 (altura) ou 25 (largura), o primeiro dígito de
//   qualquer número está sempre fora da faixa: digitar "3" a caminho de "30"
//   voltava pra "15", e o "0" seguinte caía em "150" — que também é recusado.
//   Medido, não deduzido: o `value` do DOM ficava em "72" depois de teclar 4 e
//   8, e o teste antigo não pegava porque mandava `change` com "48" INTEIRO,
//   uma sequência que o navegador nunca produz depois do descarte.
//
// Ou seja: o campo que nasceu pra atender "não tá dando pra ajustar o teclado"
// aceitava seta e +/− e recusava o teclado. Continuava o mesmo relato.
//
// O conserto é o campo ter RASCUNHO próprio: o que está sendo digitado mora
// aqui e aparece tal como foi teclado, mesmo fora da faixa. Só quando o
// rascunho é um número válido ele sobe pro `onMuda` (a prévia continua sem
// piscar em valor nenhum que a pessoa não escolheu). No `blur` o rascunho morre
// e o que sobrou é preso na faixa — a regra de cima, intacta.
//
// `propagado` é o que distingue "o valor mudou porque EU digitei" de "o valor
// mudou por fora" (atalho de tamanho, +/−, voltar ao padrão). No segundo caso o
// rascunho tem de morrer na hora, senão o campo continuaria mostrando o que foi
// teclado enquanto a etiqueta já desenha outro tamanho.

import { useEffect, useRef, useState } from "react";
import { BotaoIcone } from "../../ui/controles";

export function AjusteMm({
  rotulo,
  valor,
  min,
  max,
  onMuda,
  unidade = "mm",
  unidadeNaFaixa,
  desabilitado = false,
  id,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  onMuda: (v: number) => void;
  unidade?: string;
  /**
   * Como a unidade aparece na linha da faixa. Existe porque "de 1 a 3via" é o
   * que sai quando a unidade concorda com o valor ATUAL (1 via) e a faixa fala
   * do MÁXIMO (3 vias) — dois números na mesma frase, um só plural.
   */
  unidadeNaFaixa?: string;
  desabilitado?: boolean;
  /** Casa o `<label>` com o `<input>`. Um por tela, senão o rótulo aponta pro campo errado. */
  id: string;
}) {
  const preso = (n: number) => Math.min(max, Math.max(min, n));
  // "72mm" cola; "3 vias" não. A diferença é a unidade ser símbolo ou palavra.
  const naFaixa = unidadeNaFaixa ?? unidade;
  const faixa = naFaixa === "mm" ? `de ${min} a ${max}mm` : `de ${min} a ${max} ${naFaixa}`;

  // `null` = o campo espelha `valor`. Texto = tem alguém digitando.
  const [rascunho, setRascunho] = useState<string | null>(null);
  const propagado = useRef(valor);

  useEffect(() => {
    // Veio de fora (atalho, +/−, "voltar ao padrão"): o rascunho não vale mais.
    if (valor !== propagado.current) { propagado.current = valor; setRascunho(null); }
  }, [valor]);

  function digitar(bruto: string) {
    // Só dígitos: o campo é milímetro inteiro, e um "4,5" digitado viraria NaN
    // silencioso — ou pior, 45.
    const limpo = bruto.replace(/\D/g, "").slice(0, 3);
    setRascunho(limpo);
    const n = Number(limpo);
    if (limpo && n >= min && n <= max) { propagado.current = n; onMuda(n); }
  }

  function sair(bruto: string) {
    const n = Number(bruto.replace(/\D/g, ""));
    const final = Number.isFinite(n) && bruto.trim() ? preso(n) : valor;
    setRascunho(null);
    propagado.current = final;
    onMuda(final);
  }

  return (
    <div>
      <label
        htmlFor={id}
        style={{ display: "block", fontSize: 13, color: "var(--text-dim)", marginBottom: 8 }}
      >
        {rotulo}
      </label>
      {/* `flexWrap` não: a 320px a fileira ainda cabe (44 + campo + 44), e
          quebrar deixaria o "+" sozinho numa linha, longe do número que ele
          muda. `minWidth: 0` no campo é o que permite ele encolher. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <BotaoPasso
          icone="minus"
          titulo={`Diminuir ${rotulo.toLowerCase()}`}
          onClick={() => onMuda(preso(valor - 1))}
          desabilitado={desabilitado || valor <= min}
        />
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <input
            id={id}
            // `text` e não `number`: o campo numérico do navegador traz as
            // setinhas minúsculas (alvo de 12px, longe dos 44 que o celular
            // pede), aceita "e" e "+" como se fossem número, e no iOS o teclado
            // ainda vem com letras. `inputMode` resolve o teclado sem nada disso.
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={rascunho ?? String(valor)}
            disabled={desabilitado}
            aria-describedby={`${id}-faixa`}
            onChange={(e) => digitar(e.target.value)}
            onBlur={(e) => sair(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") { e.preventDefault(); onMuda(preso(valor + 1)); }
              if (e.key === "ArrowDown") { e.preventDefault(); onMuda(preso(valor - 1)); }
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            onFocus={(e) => e.target.select()}
            style={{
              width: "100%", minHeight: "var(--tap)", textAlign: "center",
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)", color: "var(--text)",
              // O número grande é o que se lê de longe; o `padding` da direita
              // abre o lugar da unidade, que fica FORA do valor digitável — ter
              // "mm" dentro do campo obrigaria a apagá-lo pra digitar.
              fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums",
              padding: "6px 34px 6px 12px",
            }}
          />
          <span style={{
            position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
            fontSize: 13, color: "var(--text-dim)", pointerEvents: "none",
          }}>
            {unidade}
          </span>
        </div>
        <BotaoPasso
          icone="plus"
          titulo={`Aumentar ${rotulo.toLowerCase()}`}
          onClick={() => onMuda(preso(valor + 1))}
          desabilitado={desabilitado || valor >= max}
        />
      </div>
      <div id={`${id}-faixa`} style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 6 }}>
        {faixa}
      </div>
    </div>
  );
}

/**
 * O passo de 1.
 *
 * Não usa `BotaoIcone` do kit por um motivo só: aqui o alvo tem de ser quadrado
 * e fixo nos 44px em qualquer largura de tela, porque ele divide a fileira com
 * um campo que encolhe. `flex: 0 0 var(--tap)` é o que garante isso a 320px.
 */
function BotaoPasso({ icone, titulo, onClick, desabilitado }: {
  icone: string; titulo: string; onClick: () => void; desabilitado: boolean;
}) {
  return (
    <BotaoIcone icone={icone} titulo={titulo} disabled={desabilitado} onClick={onClick} style={{ flex: "0 0 var(--tap)" }} />
  );
}

// ── Os tamanhos comuns ───────────────────────────────────────────────────────

/**
 * Fileira de atalhos de tamanho.
 *
 * Ela NÃO é a personalização — a personalização é o campo acima. Isto é o
 * atalho pros tamanhos que o galpão de fato usa, e existe porque a pessoa que
 * troca a bobina pensa em "rolo de 58", não em "48mm imprimíveis".
 *
 * `.tab-strip` porque a quatro atalhos a fileira não cabe a 320px e tem de
 * rolar de lado DENTRO dela mesma, nunca a página. Só que a `.tab-strip` da
 * fundação vira rolável apenas até 900px (globals.css:1914): no COMPUTADOR ela
 * continua `inline-flex` com `overflow: visible` e o que não cabe é pintado
 * FORA da caixa — e, como o cartão que a abriga também é `overflow: visible`,
 * fora do CARTÃO. Medido a 1280: a faixa media 560px com 620px de conteúdo e
 * "Estreita 40×15" terminava em x=657 com o cartão terminando em 618 — 39px de
 * botão impressos por cima do vão entre os dois cartões da tela. A página não
 * rolava (o vão absorvia), então medir `scrollWidth` da página dava zero.
 * Daí o invólucro que rola em TODA largura. Nada de `transform` nem
 * `mask-image` nele (ver CLAUDE.md: os dois prendem popover).
 */
export function AtalhosDeTamanho({ tamanhos, larguraMm, alturaMm, onEscolher, desabilitado }: {
  tamanhos: { nome: string; larguraMm: number; alturaMm: number; dica: string }[];
  larguraMm: number;
  alturaMm: number;
  onEscolher: (t: { larguraMm: number; alturaMm: number }) => void;
  desabilitado?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 8 }}>Tamanhos comuns</div>
      <div style={{ overflowX: "auto" }}>
      <div className="tab-strip" style={{ display: "flex", gap: 6 }}>
        {tamanhos.map((t) => {
          const ativo = t.larguraMm === larguraMm && t.alturaMm === alturaMm;
          return (
            <button
              key={t.nome}
              type="button"
              className="ui-btn"
              data-v={ativo ? "primario" : "sutil"}
              data-t="sm"
              aria-pressed={ativo}
              title={t.dica}
              disabled={desabilitado}
              onClick={() => onEscolher({ larguraMm: t.larguraMm, alturaMm: t.alturaMm })}
              style={{ minHeight: "var(--tap)", flex: "0 0 auto", whiteSpace: "nowrap" }}
            >
              {t.nome}
              <span style={{ opacity: 0.7, marginLeft: 6, fontVariantNumeric: "tabular-nums" }}>
                {t.larguraMm}×{t.alturaMm}
              </span>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}
