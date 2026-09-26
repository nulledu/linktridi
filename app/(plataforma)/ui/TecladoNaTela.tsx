"use client";

// ── O teclado dentro do site ─────────────────────────────────────────────────
//
// O computador do galpão não tem teclado nem mouse: tem uma tela sensível numa
// bancada, luva, e às vezes uma pistola de código. Sem isto, metade da Operação
// simplesmente não se usa — o campo "digite o nome" existe e não há como
// digitar. O teclado do próprio Android resolveria no tablet, mas some no
// monitor sensível ligado a um PC, que é o caso do galpão; e onde ele aparece,
// cobre metade da tela e leva junto o campo que a pessoa está preenchendo.
//
// ── COMO ELE SE LIGA AOS CAMPOS ──────────────────────────────────────────────
//
// Por FOCO, e não por prop. Os painéis da Operação são as telas do Estoque
// reaproveitadas (bipar, conferir, receber, imprimir) — passar um "teclado" por
// dentro delas obrigaria a mexer em cada campo de cada tela, e o próximo campo
// que alguém escrevesse nasceria de fora. Aqui o teclado escuta `focusin`: o
// campo que recebeu o foco é o campo que ele escreve. Campo novo, em qualquer
// painel, já nasce funcionando.
//
// ── AS TRÊS ARMADILHAS QUE ESTE ARQUIVO EVITA ────────────────────────────────
//
// 1. ROUBAR O FOCO. Um `<button>` comum tira o foco do input no `pointerdown`,
//    e aí a tecla escreve no vazio — e a pistola, que também escreve no campo
//    focado, para de funcionar junto. Todas as teclas cancelam o `pointerdown`.
//
// 2. O REACT NÃO VER O TEXTO. Escrever em `el.value` não avisa o React: a tela
//    mostra a letra e o estado continua vazio, então buscar não encontra nada e
//    o campo "volta" sozinho no próximo render. O jeito certo é o setter nativo
//    do protótipo + um evento `input` que borbulha — é o que o React escuta.
//
// 3. DOIS TECLADOS. No tablet, o do sistema abre por cima do nosso. Enquanto
//    este está ligado, o campo focado recebe `inputMode="none"`, que pede ao
//    aparelho para não abrir o dele — e o atributo original volta quando o
//    campo perde o foco, para o resto do app continuar como era.

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

/** Onde o teclado escreve. Textarea entra: "observação" do recebimento é uma. */
type Campo = HTMLInputElement | HTMLTextAreaElement;

const TIPOS_QUE_ACEITAM = new Set([
  "text", "search", "tel", "url", "email", "number", "password", "",
]);

function ehCampoDeTexto(el: EventTarget | null): el is Campo {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.readOnly || el.disabled) return false;
  return TIPOS_QUE_ACEITAM.has(el.type);
}

/**
 * Escreve no campo como se a pessoa tivesse digitado.
 *
 * O setter vem do PROTÓTIPO porque o React troca o do elemento por um seu para
 * saber quando o valor muda; chamando o do protótipo, o valor entra e o evento
 * seguinte passa pela delegação do React normalmente. Sem isso o texto aparece
 * na tela e o `useState` da página continua vazio — o bug mais confuso desta
 * família, porque a tela parece certa.
 */
function escrever(el: Campo, novo: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, novo); else el.value = novo;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** O que a tecla faz com o texto que já está lá, respeitando o cursor. */
function comTecla(el: Campo, tecla: string) {
  const valor = el.value;
  // `selectionStart` é null em alguns tipos (`email`, `number`): aí a régua é o
  // fim do texto, que é onde a pessoa está digitando de qualquer forma.
  const ini = el.selectionStart ?? valor.length;
  const fim = el.selectionEnd ?? valor.length;

  if (tecla === "\b") {
    // Com trecho selecionado, apagar remove a seleção (é o que a pessoa vê
    // marcado); sem seleção, remove o caractere anterior. A consulta seleciona
    // o texto depois de cada bipe, e sem esta distinção o apagar comia uma
    // letra e deixava o resto — parecendo que a tecla falhou.
    if (ini !== fim) return { texto: valor.slice(0, ini) + valor.slice(fim), cursor: ini };
    if (ini === 0) return { texto: valor, cursor: 0 };
    return { texto: valor.slice(0, ini - 1) + valor.slice(fim), cursor: ini - 1 };
  }
  return { texto: valor.slice(0, ini) + tecla + valor.slice(fim), cursor: ini + tecla.length };
}

/**
 * O tique da tecla.
 *
 * Numa tela de vidro não há curso nem clique: o toque não tem nenhuma
 * confirmação física, e é por isso que todo teclado de sistema vibra. Oito
 * milissegundos é o pulso mais curto que o motor consegue formar — sente-se
 * como um toque na ponta do dedo, não como um alarme.
 *
 * Falha em silêncio de propósito: no desktop `vibrate` não existe, e num
 * aparelho com a vibração desligada nas configurações o navegador ignora. A
 * função é acessório do toque, não parte dele — a letra sai igual.
 */
function tique() {
  try { navigator.vibrate?.(8); } catch { /* sem motor, ou bloqueado */ }
}

const LETRAS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

// O bloco numérico é o mais usado do galpão: código de etiqueta, quantidade,
// SKU. Por isso ele é um LAYOUT à parte, com teclas do tamanho de um dedo com
// luva, e não uma fileira estreita em cima das letras.
const NUMEROS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["-", "0", "."],
];

export interface TecladoNaTelaProps {
  /** Fecha o teclado sem desligar o modo — o próximo toque num campo reabre. */
  onFechar?: () => void;
}

export function TecladoNaTela({ onFechar }: TecladoNaTelaProps) {
  const [alvo, setAlvo] = useState<Campo | null>(null);
  /*
   * A SAÍDA PELO MESMO CAMINHO DA ENTRADA.
   *
   * O teclado entra subindo pela borda de baixo; sumir num quadro faz a tela
   * "piscar" e não diz para onde ele foi — e para onde ele foi é a informação
   * que faz a pessoa saber como trazê-lo de volta. Descendo pela mesma borda,
   * o gesto se explica sozinho.
   *
   * Mais rápido do que entrou, como manda a escala de movimento do projeto:
   * abrir é convite, fechar é sair da frente.
   */
  const [saindo, setSaindo] = useState(false);
  const recolher = useCallback(() => {
    if (!onFechar) return;
    setSaindo(true);
    window.setTimeout(() => { setSaindo(false); onFechar(); }, 150);
  }, [onFechar]);
  const [maiuscula, setMaiuscula] = useState(false);
  const [modo, setModo] = useState<"letras" | "numeros">("letras");
  const alvoRef = useRef<Campo | null>(null);
  const caixaRef = useRef<HTMLDivElement | null>(null);
  alvoRef.current = alvo;

  /*
   * A altura real vira `--op-teclado`, e é ela que reserva o espaço embaixo da
   * página (ver `operacao.css`). Medida, e não fixa: o teclado muda de altura
   * entre letras e números, e entre retrato e paisagem — um valor chutado
   * deixaria uma faixa vazia num caso e o campo coberto no outro, que é
   * justamente o defeito do teclado do sistema.
   */
  useEffect(() => {
    const el = caixaRef.current;
    if (!el) return;
    const raiz = document.documentElement;
    const medir = () => raiz.style.setProperty("--op-teclado", `${Math.round(el.getBoundingClientRect().height)}px`);
    medir();
    // Sem `ResizeObserver` (jsdom, navegador antigo) o teclado continua
    // funcionando com a altura medida uma vez — o que falha é só o reajuste ao
    // trocar de layout, e isso não vale derrubar a tela inteira com um erro.
    if (typeof ResizeObserver === "undefined") {
      return () => raiz.style.removeProperty("--op-teclado");
    }
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => { ro.disconnect(); raiz.style.removeProperty("--op-teclado"); };
    // `alvo` nas dependências porque o teclado só existe no DOM quando há campo
    // focado: sem isto a medição rodava uma vez, no vazio, e a reserva de
    // espaço ficava valendo o palpite do CSS para sempre.
  }, [alvo]);

  /*
   * Segue o foco. `focusin` e não `focus` porque só ele borbulha — sem isso
   * seria preciso um listener por campo, e os campos aparecem e somem com os
   * painéis.
   *
   * O `focusout` NÃO limpa o alvo: tocar numa tecla tira o foco do campo por um
   * instante em alguns navegadores, e limpar ali fazia a segunda tecla escrever
   * no nada. Quem troca o alvo é o próximo `focusin`.
   */
  useEffect(() => {
    const entrou = (e: FocusEvent) => {
      if (ehCampoDeTexto(e.target)) {
        setAlvo(e.target);
        // Traz o campo para o meio da tela. Com o teclado ocupando o terço de
        // baixo, um campo que estava no rodapé fica atrás dele — e a pessoa
        // digita sem ver o que está escrevendo.
        const el = e.target;
        requestAnimationFrame(() => el.scrollIntoView({ block: "center", behavior: "smooth" }));
        // Um campo de número abre no bloco numérico: dois toques por
        // preenchimento a menos, e é o teclado que a pessoa esperava.
        const numerico = e.target instanceof HTMLInputElement &&
          (e.target.type === "number" || e.target.inputMode === "numeric" || e.target.inputMode === "decimal");
        if (numerico) setModo("numeros");
      }
    };
    document.addEventListener("focusin", entrou);
    // O campo já focado quando o teclado montou (a Consulta foca sozinha).
    if (ehCampoDeTexto(document.activeElement)) setAlvo(document.activeElement as Campo);

    /*
     * O campo pode SUMIR sem avisar: fechar a tarefa desmonta o painel inteiro,
     * e ninguém dispara `focusout` por isso. Sem esta vigia, o teclado
     * continuava ocupando um terço da tela na lista de tarefas, onde não há
     * nada para escrever — e as teclas escreviam num elemento fora do
     * documento, sem nenhum efeito visível.
     */
    const sumiu = new MutationObserver(() => {
      setAlvo((a) => (a && !a.isConnected ? null : a));
    });
    sumiu.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("focusin", entrou);
      sumiu.disconnect();
    };
  }, []);

  /*
   * Cala o teclado do sistema enquanto este está no ar, e devolve o atributo
   * quando o campo sai. Guardado por elemento: os campos são de outras telas e
   * têm `inputMode` próprio (a tabela de `campos.ts`) — sobrescrever sem
   * restaurar deixaria o resto do app com o teclado errado depois de uma visita
   * à Operação.
   */
  useEffect(() => {
    if (!alvo) return;
    const antes = alvo.getAttribute("inputmode");
    alvo.setAttribute("inputmode", "none");
    return () => {
      if (antes == null) alvo.removeAttribute("inputmode");
      else alvo.setAttribute("inputmode", antes);
    };
  }, [alvo]);

  const digitar = useCallback((tecla: string) => {
    const el = alvoRef.current;
    if (!el) return;
    const { texto, cursor } = comTecla(el, tecla);
    // `maxLength` é do campo, não do teclado: a Consulta corta em 60 e quem
    // digitasse pelo teclado passaria por cima da regra da tela.
    const limite = el.maxLength;
    const final = limite > 0 ? texto.slice(0, limite) : texto;
    escrever(el, final);
    const pos = Math.min(cursor, final.length);
    try { el.setSelectionRange(pos, pos); } catch { /* tipos que não têm cursor */ }
    if (maiuscula) setMaiuscula(false);
    tique();
  }, [maiuscula]);

  /*
   * A LETRA SAI NO TOQUE, NÃO NA SOLTURA.
   *
   * Num teclado, a tecla é o raro caso em que o commit certo é o toque: é assim
   * no iOS e no Android, e é o que permite digitar rápido — soltando a tecla
   * anterior enquanto o dedo já desce na próxima. Esperar o `click` (que só
   * chega no levantar do dedo) coloca a letra atrás do ritmo da mão, e a
   * sensação é de teclado que "engasga" — mesmo com zero de lentidão real.
   *
   * O `click` continua ligado como CAMINHO PARALELO, para quem chega pelo
   * teclado físico ou por leitor de tela (Enter num botão dispara `click` sem
   * nenhum `pointerdown`). A trava abaixo impede a letra dupla quando os dois
   * chegam pelo mesmo toque.
   */
  const veioDoPonteiro = useRef(false);
  const noToque = useCallback((fn: () => void) => (e: React.PointerEvent) => {
    e.preventDefault();
    veioDoPonteiro.current = true;
    fn();
  }, []);
  const noClique = useCallback((fn: () => void) => () => {
    if (veioDoPonteiro.current) { veioDoPonteiro.current = false; return; }
    fn();
  }, []);

  /*
   * Apagar SEGURANDO — como em qualquer teclado.
   *
   * Sem isto, limpar um código lido errado custa doze toques. A primeira
   * repetição espera meio segundo (senão um toque normal apagaria duas letras)
   * e depois acelera até 40ms, que é a curva do teclado do sistema: começa
   * conferindo, termina varrendo.
   */
  const repeticao = useRef<number | null>(null);
  const pararRepeticao = useCallback(() => {
    if (repeticao.current != null) { window.clearTimeout(repeticao.current); repeticao.current = null; }
  }, []);
  const comecarApagar = useCallback(() => {
    pararRepeticao();
    let espera = 500;
    const passo = () => {
      digitar("\b");
      espera = Math.max(40, espera * 0.7);
      repeticao.current = window.setTimeout(passo, espera);
    };
    repeticao.current = window.setTimeout(passo, espera);
  }, [digitar, pararRepeticao]);

  // Solta o relógio se o componente sair no meio de um toque segurado — senão
  // a repetição continua apagando um campo que já não está na tela.
  useEffect(() => pararRepeticao, [pararRepeticao]);

  /**
   * Enter faz o que faria no teclado de verdade: avisa a tela e envia o
   * formulário.
   *
   * Os dois, e nesta ordem, porque as telas do Estoque se dividem: umas ouvem
   * `onKeyDown` (a Consulta trata Enter como "código exato"), outras confiam no
   * `onSubmit`. Se a tela cancelar o evento, o envio não acontece — que é
   * exatamente o contrato do teclado físico.
   */
  const enter = useCallback(() => {
    const el = alvoRef.current;
    if (!el) return;
    const ev = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true });
    const seguiu = el.dispatchEvent(ev);
    if (!seguiu) return;
    const form = el.closest("form");
    if (form) {
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  }, []);

  const linhas = modo === "letras" ? LETRAS : NUMEROS;

  /*
   * SEM CAMPO, SEM TECLADO.
   *
   * O teclado ocupa um terço da tela; deixá-lo no ar na lista de tarefas
   * esconderia duas tarefas para oferecer teclas que não escrevem em lugar
   * nenhum. Ele sobe quando um campo recebe o foco e desce quando o campo sai —
   * que é o contrato que qualquer pessoa já conhece do celular.
   */
  if (!alvo) return null;

  return (
    <div
      ref={caixaRef}
      className="tec"
      data-saindo={saindo ? "1" : undefined}
      role="group"
      aria-label="Teclado na tela"
      // Cancelar aqui cobre o que NÃO é tecla — a moldura, os vãos entre as
      // teclas, a barra de cima. As teclas cancelam no seu próprio
      // `pointerdown` (é lá que elas também escrevem); sem esta rede em volta,
      // um toque que cai num vão de seis pixels tira o foco do campo, e a
      // letra seguinte se perde.
      onPointerDown={(e) => e.preventDefault()}
    >
      <div className="tec-topo">
        <span className="tec-alvo">
          {alvo ? (alvo.getAttribute("aria-label") || alvo.getAttribute("placeholder") || "Campo") : "Toque num campo para escrever"}
        </span>
        <button
          type="button" className="tec-x" aria-label="Fechar o teclado"
          onPointerDown={noToque(recolher)}
          onClick={noClique(recolher)}
        >
          <Icon name="chevron-down" size={20} color="currentColor" />
        </button>
      </div>

      <div className={`tec-teclas${modo === "numeros" ? " tec-num" : ""}`}>
        {linhas.map((linha, i) => (
          <div className="tec-linha" key={i}>
            {i === linhas.length - 1 && modo === "letras" && (
              <button
                type="button" className="tec-t tec-mod" aria-pressed={maiuscula}
                onPointerDown={noToque(() => { setMaiuscula((v) => !v); tique(); })}
                onClick={noClique(() => setMaiuscula((v) => !v))}
              >
                <Icon name="arrow-up" size={20} color="currentColor" />
              </button>
            )}
            {linha.map((t) => (
              <button
                key={t} type="button" className="tec-t"
                onPointerDown={noToque(() => digitar(maiuscula ? t.toUpperCase() : t))}
                onClick={noClique(() => digitar(maiuscula ? t.toUpperCase() : t))}
              >
                {maiuscula ? t.toUpperCase() : t}
              </button>
            ))}
            {/* No numérico o apagar desce para a barra de baixo: como quarta
                tecla da fileira "- 0 .", ele desalinhava a coluna inteira, e
                num teclado de calculadora o que sustenta a mira é justamente a
                grade de três colunas — o dedo vai pelo lugar, não pelo rótulo. */}
            {i === linhas.length - 1 && modo === "letras" && (
              <button
                type="button" className="tec-t tec-mod" aria-label="Apagar"
                onPointerDown={noToque(() => { digitar("\b"); comecarApagar(); })}
                onPointerUp={pararRepeticao}
                onPointerCancel={pararRepeticao}
                onPointerLeave={pararRepeticao}
                onClick={noClique(() => digitar("\b"))}
              >
                <Icon name="backspace" size={20} color="currentColor" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="tec-linha tec-base">
        <button
          type="button" className="tec-t tec-mod"
          onPointerDown={noToque(() => { setModo((m) => (m === "letras" ? "numeros" : "letras")); tique(); })}
          onClick={noClique(() => setModo((m) => (m === "letras" ? "numeros" : "letras")))}
        >
          {modo === "letras" ? "123" : "ABC"}
        </button>
        {modo === "numeros" ? (
          <button
            type="button" className="tec-t tec-espaco" aria-label="Apagar"
            onPointerDown={noToque(() => { digitar("\b"); comecarApagar(); })}
            onPointerUp={pararRepeticao}
            onPointerCancel={pararRepeticao}
            onPointerLeave={pararRepeticao}
            onClick={noClique(() => digitar("\b"))}
          >
            <Icon name="backspace" size={22} color="currentColor" />
          </button>
        ) : (
          <button
            type="button" className="tec-t tec-espaco" aria-label="Espaço"
            onPointerDown={noToque(() => digitar(" "))}
            onClick={noClique(() => digitar(" "))}
          />
        )}
        <button
          type="button" className="tec-t tec-ok"
          onPointerDown={noToque(() => { tique(); enter(); })}
          onClick={noClique(enter)}
        >
          <Icon name="corner-down-left" size={20} color="currentColor" />
          Confirmar
        </button>
      </div>
    </div>
  );
}
