"use client";

// Renderiza UM bloco. Um switch sobre `tipo` — mesmo idioma do editor de fluxos.
//
// Nada aqui usa dangerouslySetInnerHTML: todo texto do usuário vira nó de texto
// do React (escapado) e toda URL passa por urlSegura/urlImagemSegura.

import { useCallback, useEffect, useRef, useState } from "react";
import { Accordion, Avatar, Card, Chip, Separator, buttonVariants } from "@heroui/react";

import type { Bloco, ItemDepoimento, LinkCabecalho } from "@/lib/tridiflow-pagina";
import { GLIFOS_CONTEUDO, glifoRecurso } from "@/lib/tridiflow-pagina-glifos";
import { classeDispositivo, estiloCss, larguraCss, linkWhatsapp, urlImagemSegura, urlSegura, TEXTO } from "@/lib/tridiflow-pagina-estilo";
import { deveMostrar } from "@/lib/tridiflow-pagina-runtime";
import { interpolar } from "@/lib/tridiflow";
import { mostraNaVariante } from "@/lib/tridiflow-ab";
import { MIME_BLOCO, type AcaoBloco, type CtxPagina } from "./contexto";
import { VideoBloco } from "./VideoBloco";
import { OfertaBloco } from "./OfertaBloco";
import { FormBloco } from "./FormBloco";

export function BlocoView({ bloco, ctx, paginaId, secaoId, indice }: {
  bloco: Bloco; ctx: CtxPagina; paginaId: string;
  /** Só os blocos NA RAIZ da seção recebem estes dois — e só eles aceitam
   *  arraste. Bloco dentro de container/colunas não: `moverBlocoPara` insere na
   *  raiz da seção, então soltar ali tiraria o bloco de dentro do container sem
   *  a pessoa ter pedido isso. */
  secaoId?: string; indice?: number;
}) {
  // TODO hook vem ANTES de qualquer `return` — um bloco some e volta a toda
  // hora (liberação temporizada, troca de aparelho), e chamar o hook depois do
  // return mudava a quantidade de hooks entre renders. O React acusava
  // "Expected static flag was missing" e o estado da animação embaralhava.
  const anim = useAnimacao(bloco, ctx);
  // Lado em que o bloco arrastado vai cair. null = nada pairando aqui.
  const [queda, setQueda] = useState<"antes" | "depois" | null>(null);

  if (bloco.oculto) return null;

  // Teste A/B: o bloco marcado com a OUTRA versão não existe nesta visita.
  // Vale no preview também — um editor que mostra as duas versões juntas está
  // mentindo sobre a página que foi ao ar. Quem edita a outra versão troca no
  // alternador da barra; a árvore lateral continua listando as duas.
  if (!mostraNaVariante(bloco.teste, ctx.variante)) return null;

  // No PREVIEW o "celular" é uma moldura estreita: esconder tem que ser em JS.
  // No ar, quem esconde é o CSS (classeDispositivo) — assim o HTML do servidor
  // e o do cliente são iguais e não há hydration mismatch.
  const mobile = ctx.viewport === "mobile";
  if (ctx.modo === "preview") {
    if (mobile && bloco.estilo?.ocultarMobile) return null;
    if (!mobile && bloco.estilo?.ocultarDesktop) return null;
  }

  // Liberação temporizada. No preview com `revelarTudo`, mostra tudo — senão o
  // gestor não conseguiria editar a oferta que só aparece aos 8 minutos.
  const liberado = ctx.liberados.has(bloco.id);
  const visivel = ctx.modo === "preview" && ctx.revelarTudo
    ? true
    : deveMostrar(bloco.visivel, ctx.estado, liberado);
  if (!visivel) return null;

  const temGatilho = (bloco.visivel?.modo ?? "sempre") !== "sempre";
  const selecionado = ctx.modo === "preview" && ctx.selecionado === bloco.id;

  const aoClicar = (e: React.MouseEvent) => {
    if (ctx.modo !== "preview") return;
    e.stopPropagation();
    ctx.onSelecionar?.(bloco.id);
  };

  // Arraste no canvas: só no editor, só em bloco da raiz da seção.
  const arrastavel = ctx.modo === "preview" && !!ctx.onMoverBloco && secaoId !== undefined && indice !== undefined;
  // Metade de cima = cai ANTES; metade de baixo = cai DEPOIS.
  const ladoDoPonteiro = (e: React.DragEvent): "antes" | "depois" => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? "antes" : "depois";
  };
  const eventosQueda = !arrastavel ? {} : {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(MIME_BLOCO)) return;   // arquivo, link, texto: ignora
      e.preventDefault();
      setQueda(ladoDoPonteiro(e));
    },
    onDragLeave: () => setQueda(null),
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData(MIME_BLOCO);
      setQueda(null);
      if (!id || id === bloco.id) return;    // soltar em cima de si mesmo não é movimento
      e.preventDefault();
      e.stopPropagation();
      // O lado vem DO PRÓPRIO evento de soltar, não do estado que o dragover
      // guardou: o estado é de um render anterior e pode estar defasado — era
      // por isso que soltar embaixo movia como se fosse em cima.
      ctx.onMoverBloco!(id, secaoId!, indice! + (ladoDoPonteiro(e) === "depois" ? 1 : 0));
    },
  };

  return (
    <div
      ref={anim.ref}
      data-bloco={bloco.id}
      onClick={aoClicar}
      {...eventosQueda}
      className={`${classeDispositivo(bloco.estilo)}${anim.classe}`}
      style={{
        ...estiloCss(bloco.estilo, mobile),
        // "Largura" do inspetor: o bloco vira uma coluna centrada. "cheia" é
        // o comportamento de sempre (ocupa a seção inteira).
        ...(bloco.estilo?.largura && bloco.estilo.largura !== "cheia"
          ? { maxWidth: larguraCss(bloco.estilo.largura), width: "100%", marginInline: "auto" }
          : {}),
        ...anim.style,
        position: "relative",
        ...(ctx.modo === "preview" ? {
          // Bloco com liberação temporizada é MARCADO, não apagado. Antes ele
          // vinha a 62% de opacidade e, num template de VSL (onde quase tudo é
          // temporizado), metade da página ficava lavada e difícil de editar.
          // O selo e a borda tracejada já dizem "isto não abre de cara".
          outline: selecionado
            ? "2px solid var(--tf-accent, var(--primary-texto))"
            : temGatilho && ctx.revelarTudo
              ? "1px dashed color-mix(in srgb, var(--tf-accent, var(--primary)) 55%, transparent)"
              : "1px dashed transparent",
          outlineOffset: 2, borderRadius: 6, cursor: "pointer",
        } : {}),
      }}
    >
      {ctx.modo === "preview" && temGatilho && ctx.revelarTudo && <SeloGatilho bloco={bloco} />}
      {queda && <MarcaQueda lado={queda} />}
      {ctx.modo === "preview" && ctx.onAcaoBloco && (
        <AcoesBloco bloco={bloco} selecionado={selecionado} onAcao={ctx.onAcaoBloco} arrastavel={arrastavel} />
      )}
      <Conteudo bloco={bloco} ctx={ctx} paginaId={paginaId} />
    </div>
  );
}

// Ações do bloco NO CANVAS. Só aparecem com o mouse em cima (ou quando o bloco
// está selecionado) — a página fica limpa, sem uma fileira de botões por cima
// do conteúdo. Existe só no editor: a publicada não recebe `onAcaoBloco`, então
// nem esta marcação vai pro ar.
// Paths do Tabler, embutidos aqui de propósito: o mapa de ícones da plataforma
// só existe no ERP e importá-lo neste arquivo (que é o renderer da página
// PUBLICADA) levaria o mapa inteiro pro bundle público sem necessidade.
const TRACO = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const GLIFO: Record<string, string> = {
  subir: "M6 15l6 -6l6 6",
  descer: "M6 9l6 6l6 -6",
  duplicar: "M8 8m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2",
  ocultar: "M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6",
  mostrar: "M10.585 10.587a2 2 0 0 0 2.829 2.828 M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87 M3 3l18 18",
  excluir: "M4 7l16 0 M10 11l0 6 M14 11l0 6 M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12 M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3",
  arrastar: "M9 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M9 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M9 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M15 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M15 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M15 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
};

function Glifo({ nome, cor }: { nome: string; cor: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden style={{ color: cor, display: "block" }}>
      {GLIFO[nome].split(" M").map((d, i) => <path key={i} d={i ? `M${d}` : d} {...TRACO} />)}
    </svg>
  );
}

// Ícone de CONTEÚDO (grade de recursos, comparação, garantia). Desenha os paths
// embutidos em GLIFOS_CONTEUDO — o renderer público não importa o mapa de ícones
// do ERP (ver lib/tridiflow-pagina-glifos.ts). Mantém a regra do arquivo (nada
// de dangerouslySetInnerHTML): extrai só os `d="…"` e monta cada <path> — os
// valores são paths do Tabler que a gente escreveu, nunca entrada de fora.
function GlifoConteudo({ nome, size = 22, cor = "currentColor", preenche = false }: {
  nome: string; size?: number; cor?: string; preenche?: boolean;
}) {
  const markup = GLIFOS_CONTEUDO[nome];
  if (!markup) return null;
  const ds = markup.match(/d="[^"]*"/g)?.map((m) => m.slice(3, -1)) ?? [];
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" aria-hidden
      fill={preenche ? cor : "none"} stroke={preenche ? "none" : cor}
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", flex: "none", color: cor }}
    >
      {ds.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// Onde o bloco arrastado vai cair. Linha grossa na borda de cima ou de baixo —
// a mesma leitura de qualquer editor: "solta aqui e ele entra nesta posição".
function MarcaQueda({ lado }: { lado: "antes" | "depois" }) {
  return (
    <div aria-hidden style={{
      position: "absolute", left: 0, right: 0, height: 3, zIndex: 6, borderRadius: 3,
      background: "var(--tf-accent, var(--primary))", pointerEvents: "none",
      ...(lado === "antes" ? { top: -2 } : { bottom: -2 }),
    }} />
  );
}

function AcoesBloco({ bloco, selecionado, onAcao, arrastavel }: {
  bloco: Bloco; selecionado: boolean; onAcao: (id: string, a: AcaoBloco) => void; arrastavel: boolean;
}) {
  const [sobre, setSobre] = useState(false);
  const mostrar = sobre || selecionado;
  const botoes: { a: AcaoBloco; icone: string; titulo: string; perigo?: boolean }[] = [
    { a: "subir", icone: "subir", titulo: "Subir" },
    { a: "descer", icone: "descer", titulo: "Descer" },
    { a: "duplicar", icone: "duplicar", titulo: "Duplicar" },
    { a: "ocultar", icone: bloco.oculto ? "mostrar" : "ocultar", titulo: bloco.oculto ? "Mostrar" : "Ocultar" },
    { a: "excluir", icone: "excluir", titulo: "Excluir", perigo: true },
  ];
  return (
    <div
      onMouseEnter={() => setSobre(true)}
      onMouseLeave={() => setSobre(false)}
      // A faixa cobre o topo do bloco pra captar o hover, mas só desenha os
      // botões quando precisa — sem isso ela roubaria cliques do conteúdo.
      style={{ position: "absolute", top: -14, right: 0, zIndex: 5, display: "flex", justifyContent: "flex-end", pointerEvents: "none" }}
    >
      <div style={{
        display: "flex", gap: 1, padding: 2, borderRadius: 9, pointerEvents: "auto",
        background: "var(--surface, #fff)", border: "1px solid var(--border, #e5e5ea)",
        boxShadow: "0 4px 14px -6px rgba(0,0,0,.35)",
        opacity: mostrar ? 1 : 0, transition: "opacity .12s ease",
      }}>
        {/* Pega de arraste. É ELA que é arrastável, não o bloco inteiro: se o
            bloco fosse, selecionar texto dentro dele viraria arraste. */}
        {arrastavel && (
          <div
            draggable
            title="Arrastar para mover"
            aria-label="Arrastar para mover"
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.setData(MIME_BLOCO, bloco.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            style={{ width: 26, height: 26, display: "grid", placeItems: "center", borderRadius: 7, cursor: "grab" }}
          >
            <Glifo nome="arrastar" cor="var(--text-dim, var(--neutro))" />
          </div>
        )}
        {botoes.map((b) => (
          <button
            key={b.a} type="button" title={b.titulo} aria-label={b.titulo}
            onClick={(e) => { e.stopPropagation(); onAcao(bloco.id, b.a); }}
            style={{
              width: 26, height: 26, display: "grid", placeItems: "center", borderRadius: 7,
              border: "none", background: "transparent", cursor: "pointer",
            }}
          >
            <Glifo nome={b.icone} cor={b.perigo ? "var(--tf-neg, var(--perigo))" : "var(--text-dim, var(--neutro))"} />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Animação de entrada do bloco.
 *
 * O JS só decide QUANDO (bloco entrou na tela) — a transição em si é CSS. É o
 * que mantém a página leve: nenhuma biblioteca de animação, nada rodando em
 * requestAnimationFrame.
 *
 * Dispara uma vez só: um bloco que re-anima toda vez que o visitante rola de
 * volta cansa e atrapalha a leitura.
 *
 * REGRA DURA: conteúdo NUNCA pode ficar escondido. A animação começa em
 * opacity:0, então qualquer falha em avisar "entrou na tela" apagaria o bloco
 * da página. Duas travas contra isso:
 *
 *  1. `threshold: 0` — basta um pixel cruzar. Com o 0.15 de antes, um bloco
 *     MAIS ALTO que a tela nunca chegava a 15% visível e sumia pra sempre
 *     (15% de um bloco de 10 telas = 1,5 tela, impossível de ver de uma vez).
 *  2. Um prazo de segurança: se em 1,2 s o observer não avisou nada — API
 *     bloqueada, layout estranho, aba em segundo plano — o bloco aparece do
 *     mesmo jeito. Perder a animação é irrelevante; perder a oferta não é.
 */
function useAnimacao(bloco: Bloco, ctx: CtxPagina): {
  ref: (n: HTMLDivElement | null) => void; classe: string; style: React.CSSProperties;
} {
  const [dentro, setDentro] = useState(false);
  const limpar = useRef<(() => void) | null>(null);
  const a = bloco.estilo?.animacao ?? "nenhuma";
  const ativa = a !== "nenhuma" && ctx.modo === "publicado" && !ctx.config.semAnimacoes;
  const contInua = a === "pulsar" || a === "brilho";   // repetem, não dependem de entrar na tela

  const ref = useCallback((n: HTMLDivElement | null) => {
    limpar.current?.();
    limpar.current = null;
    if (!n || !ativa || contInua) return;
    if (typeof IntersectionObserver === "undefined") { setDentro(true); return; }

    const ob = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { setDentro(true); ob.disconnect(); }
    }, { threshold: 0, rootMargin: "0px 0px -40px 0px" });
    ob.observe(n);

    const prazo = setTimeout(() => setDentro(true), 1200);
    limpar.current = () => { ob.disconnect(); clearTimeout(prazo); };
  }, [ativa, contInua]);

  // Desmontou (bloco removido, troca de aparelho): não deixa observer/timer soltos.
  useEffect(() => () => { limpar.current?.(); }, []);

  if (!ativa) return { ref, classe: "", style: {} };
  if (contInua) return { ref, classe: ` tfp-anim-${a}`, style: {} };
  return {
    ref,
    classe: ` tfp-anim tfp-anim-${a}${dentro ? " tfp-in" : ""}`,
    style: bloco.estilo?.animacaoAtraso
      ? ({ ["--tfp-anim-delay" as string]: `${bloco.estilo.animacaoAtraso}ms` } as React.CSSProperties)
      : {},
  };
}

function SeloGatilho({ bloco }: { bloco: Bloco }) {
  const v = bloco.visivel!;
  const txt = v.modo === "apos_tempo" ? `aparece em ${v.segundos ?? 0}s (${v.base === "video" ? "do vídeo" : "da página"})`
    : v.modo === "apos_percentual" ? `aparece com ${v.percentual ?? 50}% do vídeo`
    : "aparece ao terminar o vídeo";
  return (
    <span style={{
      position: "absolute", top: -9, right: 6, zIndex: 2,
      background: "var(--tf-accent, var(--primary))", color: "#fff",
      fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
    }}>{txt}</span>
  );
}

function Conteudo({ bloco, ctx, paginaId }: { bloco: Bloco; ctx: CtxPagina; paginaId: string }) {
  const primaria = ctx.config.corPrimaria || "var(--primary-texto)";

  switch (bloco.tipo) {
    case "titulo": {
      const Tag = (`h${bloco.nivel ?? 1}`) as "h1" | "h2" | "h3";
      return (
        <Editavel ctx={ctx} bloco={bloco} como={Tag} destaque={bloco.destaque} destaqueSobreCor={!!bloco.estilo?.cor}
          trocas={ctx.modo === "publicado" ? bloco.trocas : undefined}
          // Cor própria do bloco ganha da cor de título da página — senão o
          // título some numa seção escura (o globals pinta h1–h3 com --tfp-title).
          // H1 é display: mais fechado e mais justo que o título de seção — em
          // 60–80px o -.02em e o 1.18 do corpo deixam a manchete frouxa.
          // `balance` reparte as linhas por igual (nada de uma palavra sozinha
          // embaixo).
          style={{
            margin: 0, fontWeight: "var(--tfp-title-weight, 800)" as unknown as number, textWrap: "balance",
            letterSpacing: bloco.nivel === 1 || bloco.nivel === undefined ? "-.04em" : "-.025em",
            lineHeight: bloco.nivel === 1 || bloco.nivel === undefined ? 1.04 : 1.14,
            ...(bloco.estilo?.cor ? { color: "inherit" } : {}),
          }} />
      );
    }

    case "texto": {
      if (bloco.formato === "selo") {
        // Etiqueta curta acima do título: pílula com ponto na cor primária.
        return (
          <span className="tfp-selo" style={{ ["--tfp-selo-cor" as string]: primaria }}>
            <span aria-hidden className="tfp-selo-ponto" />
            <Editavel ctx={ctx} bloco={bloco} como="span" style={{}} />
          </span>
        );
      }
      // whiteSpace preserva as quebras que a pessoa digitou, sem aceitar HTML.
      // O `p { max-width: 68ch }` do globals.css também vale aqui, e com
      // margem 0 a coluna de leitura ficava presa à esquerda num bloco
      // centralizado. A margem acompanha o alinhamento do bloco.
      const al = bloco.estilo?.align ?? "center";
      const margem = al === "center" ? "0 auto" : al === "right" ? "0 0 0 auto" : 0;
      return <Editavel ctx={ctx} bloco={bloco} como="p" style={{ margin: margem, lineHeight: 1.55, whiteSpace: "pre-wrap" }} />;
    }

    case "imagem": {
      const src = urlImagemSegura(bloco.url);
      if (!src) return <Placeholder texto="Escolha uma imagem" />;
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={bloco.alt ?? ""} loading="lazy" style={{ maxWidth: "100%", height: "auto", borderRadius: bloco.estilo?.raio ?? 0, display: "block", marginInline: "auto" }} />;
    }

    case "video":
      return <VideoBloco bloco={bloco} onProgresso={ctx.onVideo} interativo={ctx.modo === "publicado"} />;

    case "beneficios":
      if (bloco.formato === "pilulas") {
        return (
          <ul className="tfp-pilulas">
            {(bloco.itens ?? []).map((i) => (
              <li key={i.id} title={i.texto || undefined}>
                <Chip size="lg" variant="soft" color="accent" className="tfp-pilula">
                  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" {...TRACO} strokeWidth={2.6}><path d="M5 12l5 5l10 -10" /></svg>
                  <Chip.Label>{i.titulo}</Chip.Label>
                </Chip>
              </li>
            ))}
          </ul>
        );
      }
      return (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 11 }}>
          {(bloco.itens ?? []).map((i) => (
            <li key={i.id} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
              <span aria-hidden style={{
                flex: "none", width: 22, height: 22, borderRadius: "50%", marginTop: 1,
                background: `color-mix(in srgb, ${primaria} 16%, transparent)`, color: primaria,
                display: "grid", placeItems: "center", fontSize: 12, fontWeight: 900,
              }}>✓</span>
              <span>
                <strong style={{ display: "block", fontWeight: 700 }}>{i.titulo}</strong>
                {i.texto && <span style={{ fontSize: 14, opacity: TEXTO.secundario, lineHeight: 1.45 }}>{i.texto}</span>}
              </span>
            </li>
          ))}
        </ul>
      );

    case "faq":
      // Accordion do HeroUI (React Aria): teclado, aria-expanded e a abertura
      // animada vêm prontos. stopPropagation: no editor o clique na pergunta
      // não pode selecionar o bloco inteiro.
      return (
        <Accordion variant="surface" className="tfp-faq" onClick={(e) => e.stopPropagation()}>
          {(bloco.faq ?? []).map((f) => (
            <Accordion.Item key={f.id} id={f.id}>
              <Accordion.Heading>
                <Accordion.Trigger>
                  {f.pergunta}
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body>{f.resposta}</Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      );

    case "depoimentos":
      if (bloco.formato === "colunas") return <DepoimentosEmColunas bloco={bloco} ctx={ctx} primaria={primaria} />;
      return (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: ctx.viewport === "mobile" ? "1fr" : "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}>
          {(bloco.depoimentos ?? []).map((d) => <CartaoDepoimento key={d.id} d={d} raio={bloco.estilo?.raio} />)}
        </div>
      );

    case "logos": {
      const lista = bloco.logos ?? [];
      return (
        <div style={{
          display: "grid", gap: "18px 26px", alignItems: "center", justifyItems: "center",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 110px), 1fr))",
        }}>
          {lista.map((l) => {
            const src = urlImagemSegura(l.url);
            if (!src) return ctx.modo === "preview" ? <Placeholder key={l.id} texto="Logo" /> : null;
            // eslint-disable-next-line @next/next/no-img-element
            return <img key={l.id} src={src} alt={l.alt ?? ""} loading="lazy"
              style={{ maxHeight: 42, maxWidth: "100%", objectFit: "contain", filter: "grayscale(1)", opacity: 0.72 }} />;
          })}
        </div>
      );
    }

    case "metricas": {
      const lista = bloco.metricas ?? [];
      const cols = ctx.viewport === "mobile" ? "repeat(auto-fit, minmax(min(100%, 130px), 1fr))" : "repeat(auto-fit, minmax(min(100%, 150px), 1fr))";
      return (
        <div style={{ display: "grid", gap: 18, gridTemplateColumns: cols, textAlign: "center" }}>
          {lista.map((m) => (
            <div key={m.id}>
              <strong style={{ display: "block", fontSize: 40, fontWeight: 900, color: primaria, letterSpacing: "-.03em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{m.numero}</strong>
              <span style={{ display: "block", marginTop: 5, fontSize: 14, opacity: TEXTO.secundario, lineHeight: 1.35 }}>{m.rotulo}</span>
            </div>
          ))}
        </div>
      );
    }

    case "galeria": {
      const lista = bloco.galeria ?? [];
      return (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))" }}>
          {lista.map((g) => {
            const src = urlImagemSegura(g.url);
            if (!src) return ctx.modo === "preview" ? <Placeholder key={g.id} texto="Imagem" /> : null;
            return (
              <figure key={g.id} style={{ margin: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={g.alt ?? ""} loading="lazy"
                  style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: bloco.estilo?.raio ?? 12, display: "block" }} />
                {g.legenda && <figcaption style={{ fontSize: 12, opacity: TEXTO.apagado, marginTop: 5, textAlign: "center" }}>{g.legenda}</figcaption>}
              </figure>
            );
          })}
        </div>
      );
    }

    case "recursos": {
      const lista = bloco.recursos ?? [];
      // Colunas pelo NÚMERO de itens, não por auto-fit: 6 itens com auto-fit
      // davam 4 + 2 órfãos. Múltiplo de 3 → 3 colunas; 4 → 4 (2 no tablet).
      // O recolhimento (2 no tablet, 1 no celular) é CSS (.tfp-recursos).
      const n = lista.length;
      const colsDesk = n <= 3 ? Math.max(1, n) : n % 3 === 0 ? 3 : n % 4 === 0 ? 4 : 3;
      return (
        <div className={`tfp-recursos${ctx.modo === "preview" && ctx.viewport === "mobile" ? " tfp-recursos-1" : ""}`}
          style={{ ["--tfp-rc" as string]: String(colsDesk) }}>
          {lista.map((r) => (
            <Card key={r.id} className="tfp-card tfp-recurso" style={{ borderRadius: bloco.estilo?.raio }}>
              <Card.Header>
                <span aria-hidden className="tfp-card-icone">
                  <GlifoConteudo nome={glifoRecurso(r.icone)} size={22} cor="currentColor" />
                </span>
                <Card.Title>{r.titulo}</Card.Title>
                {r.texto && <Card.Description>{r.texto}</Card.Description>}
              </Card.Header>
            </Card>
          ))}
        </div>
      );
    }

    case "passos": {
      const lista = bloco.passos ?? [];
      return (
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 14, textAlign: "left" }}>
          {lista.map((p, i) => (
            <li key={p.id} style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
              <span aria-hidden style={{
                flex: "none", width: 30, height: 30, borderRadius: "50%", marginTop: 1,
                background: primaria, color: "#fff", display: "grid", placeItems: "center",
                fontWeight: 900, fontSize: 14, fontVariantNumeric: "tabular-nums",
              }}>{i + 1}</span>
              <span>
                <strong style={{ display: "block", fontWeight: 700, fontSize: 16 }}>{p.titulo}</strong>
                {p.texto && <span style={{ fontSize: 14, opacity: TEXTO.secundario, lineHeight: 1.45 }}>{p.texto}</span>}
              </span>
            </li>
          ))}
        </ol>
      );
    }

    case "comparacao": {
      const c = bloco.comparacao ?? { linhas: [] };
      const cabCss: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".03em", opacity: TEXTO.secundario, textAlign: "center", padding: "0 2px 8px" };
      return (
        <Card className="tfp-card tfp-comparacao" style={{ textAlign: "left", overflow: "hidden", padding: 0, gap: 0, borderRadius: bloco.estilo?.raio }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 3.6rem 3.6rem", alignItems: "center", padding: "16px 16px 4px" }}>
            <span />
            <span style={cabCss}>{c.colunaNos || "Nós"}</span>
            <span style={cabCss}>{c.colunaEles || "Outros"}</span>
          </div>
          {(c.linhas ?? []).map((l) => (
            <div key={l.id} style={{
              display: "grid", gridTemplateColumns: "minmax(0, 1fr) 3.6rem 3.6rem", alignItems: "center",
              padding: "13px 16px", borderTop: "1px solid var(--separator)",
            }}>
              <span style={{ fontSize: 14.5, lineHeight: 1.35 }}>{l.recurso}</span>
              <span style={{ display: "grid", placeItems: "center" }}>
                {l.nos ? <GlifoConteudo nome="circle-check" size={20} cor="var(--accent-texto)" /> : <GlifoConteudo nome="circle-x" size={20} cor="color-mix(in srgb, currentColor 34%, transparent)" />}
              </span>
              <span style={{ display: "grid", placeItems: "center" }}>
                {l.eles ? <GlifoConteudo nome="circle-check" size={20} cor="var(--accent-texto)" /> : <GlifoConteudo nome="circle-x" size={20} cor="color-mix(in srgb, currentColor 34%, transparent)" />}
              </span>
            </div>
          ))}
        </Card>
      );
    }

    case "planos": {
      const lista = bloco.planos ?? [];
      const cols = ctx.viewport === "mobile" ? "1fr" : "repeat(auto-fit, minmax(min(100%, 230px), 1fr))";
      return (
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: cols, alignItems: "stretch", textAlign: "left" }}>
          {lista.map((p) => {
            const destino = urlSegura(p.checkoutUrl);
            return (
              <Card key={p.id} className={`tfp-card tfp-plano${p.destaque ? " tfp-plano-destaque" : ""}`} style={{ borderRadius: bloco.estilo?.raio }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <Card.Title className="tfp-plano-nome">{p.nome}</Card.Title>
                  {p.selo && <Chip size="sm" variant="primary" color="accent">{p.selo}</Chip>}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
                  {p.precoAntes && <span style={{ fontSize: 14, textDecoration: "line-through", opacity: TEXTO.apagado }}>{p.precoAntes}</span>}
                  <span style={{ fontSize: 30, fontWeight: 900, color: primaria, letterSpacing: "-.02em" }}>{p.preco}</span>
                  {p.periodo && <span style={{ fontSize: 13, opacity: TEXTO.secundario }}>{p.periodo}</span>}
                </div>
                <Separator />
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10, flex: 1 }}>
                  {(p.beneficios ?? []).map((b, i) => (
                    <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, lineHeight: 1.4 }}>
                      <GlifoConteudo nome="circle-check" size={18} cor="var(--accent-texto)" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={destino || undefined}
                  target={ctx.modo === "publicado" && /^https?:/i.test(destino) ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (ctx.modo === "preview") { e.preventDefault(); return; }
                    ctx.onEvento("cta_clicked", { blocoId: bloco.id, origem: "plano", plano: p.nome, destino });
                  }}
                  className={buttonVariants({ variant: p.destaque ? "primary" : "tertiary", size: "lg", fullWidth: true })}
                  style={raioBotao(bloco.estilo?.raio)}
                >{p.rotuloBotao || "Assinar"}</a>
              </Card>
            );
          })}
        </div>
      );
    }

    case "garantia": {
      const g = bloco.garantia ?? { titulo: "" };
      return (
        <Card variant="secondary" className="tfp-card" style={{ alignItems: "center", gap: 10, textAlign: "center", borderRadius: bloco.estilo?.raio }}>
          <span aria-hidden style={{
            width: 56, height: 56, borderRadius: "50%", display: "grid", placeItems: "center",
            background: `color-mix(in srgb, ${primaria} 14%, transparent)`, color: primaria,
          }}>
            <GlifoConteudo nome="shield-check" size={30} cor={primaria} />
          </span>
          <strong style={{ fontSize: 18, fontWeight: 800 }}>{g.titulo}</strong>
          {g.texto && <span style={{ fontSize: 14.5, opacity: TEXTO.secundario, lineHeight: 1.5, maxWidth: 460 }}>{g.texto}</span>}
          {g.selo && <Chip size="sm" variant="soft" color="accent">{g.selo}</Chip>}
        </Card>
      );
    }

    case "botao": {
      const destino = urlSegura(bloco.url);
      return (
        <a
          href={destino || undefined}
          // Aba nova só pra fora do site: link pra outra página do mesmo site
          // (/p/…, âncora) abre no lugar, como navegação comum.
          target={ctx.modo === "publicado" && /^https?:/i.test(destino) ? "_blank" : undefined}
          rel="noopener noreferrer"
          onClick={(e) => {
            if (ctx.modo === "preview") { e.preventDefault(); return; }
            ctx.onEvento("cta_clicked", { blocoId: bloco.id, origem: "botao", destino });
          }}
          className={bloco.formato === "link"
            ? "tfp-botao-link"
            : buttonVariants({ size: "lg", variant: bloco.formato === "contorno" ? "outline" : "primary" })}
          style={bloco.formato === "link" ? undefined : raioBotao(bloco.estilo?.raio)}
        >
          {bloco.texto || "Clique aqui"}
          {bloco.formato === "link" && <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" {...TRACO}><path d="M9 6l6 6l-6 6" /></svg>}
        </a>
      );
    }

    case "whatsapp": {
      const wa = linkWhatsapp(bloco.telefone, bloco.mensagem);
      return (
        <a
          href={wa || undefined}
          target="_blank" rel="noopener noreferrer"
          onClick={(e) => {
            if (ctx.modo === "preview") { e.preventDefault(); return; }
            ctx.onEvento("cta_clicked", { blocoId: bloco.id, origem: "whatsapp" });
          }}
          className={`${buttonVariants({ size: "lg" })} tfp-botao-whatsapp`}
          style={raioBotao(bloco.estilo?.raio)}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M17.6 6.3A7.9 7.9 0 0 0 12 4a7.9 7.9 0 0 0-6.8 11.9L4 20l4.2-1.1A7.9 7.9 0 0 0 12 20a7.9 7.9 0 0 0 5.6-13.7ZM12 18.6c-1.2 0-2.4-.3-3.4-.9l-.2-.1-2.5.6.7-2.4-.2-.3a6.6 6.6 0 1 1 5.6 3.1Zm3.6-4.9c-.2-.1-1.2-.6-1.3-.6-.2-.1-.3-.1-.4.1l-.6.7c-.1.1-.2.2-.4.1a5.4 5.4 0 0 1-2.6-2.3c-.2-.3.2-.3.5-1 .1-.1 0-.3 0-.4l-.6-1.4c-.2-.4-.3-.3-.5-.3h-.3a.8.8 0 0 0-.5.3c-.2.2-.7.7-.7 1.7s.7 2 .8 2.1c.1.1 1.4 2.2 3.5 3.1 1.3.5 1.8.6 2.4.5.4 0 1.2-.5 1.4-1 .2-.5.2-.9.1-1-.1-.1-.2-.1-.4-.2Z" />
          </svg>
          {bloco.texto || "Falar no WhatsApp"}
        </a>
      );
    }

    case "formulario":
      return <FormBloco bloco={bloco} ctx={ctx} paginaId={paginaId} />;

    case "oferta":
      return <OfertaBloco bloco={bloco} ctx={ctx} />;

    case "contador":
      return <Contador bloco={bloco} primaria={primaria} congelado={ctx.modo === "preview"} />;

    case "aviso":
      return <Editavel ctx={ctx} bloco={bloco} como="div" style={{ fontWeight: 700, fontSize: 14.5, padding: "10px 4px" }} />;

    case "espacador":
      return <div style={{ height: bloco.altura ?? 32 }} />;

    case "divisor":
      return <hr style={{ border: 0, borderTop: `1px solid ${bloco.estilo?.borda || "color-mix(in srgb, currentColor 18%, transparent)"}`, margin: 0 }} />;

    case "bento":
      return <BentoView bloco={bloco} ctx={ctx} />;

    case "carrossel":
      return <CarrosselView bloco={bloco} ctx={ctx} />;

    case "cabecalho":
      return <CabecalhoView bloco={bloco} ctx={ctx} primaria={primaria} />;

    case "rodape":
      return <RodapeView bloco={bloco} ctx={ctx} />;

    case "container":
      return (
        <div style={{ display: "grid", gap: 12 }}>
          {(bloco.blocos ?? []).map((f) => <BlocoView key={f.id} bloco={f} ctx={ctx} paginaId={paginaId} />)}
        </div>
      );

    case "colunas": {
      const cols = bloco.colunas ?? [];
      const n = Math.max(1, cols.length);
      // Mobile-first: no celular empilha (1 coluna) por padrão — a maior parte
      // do tráfego de campanha chega por lá. No preview o JS simula; no ar
      // quem empilha é a media query da classe .tfp-cols (globals.css).
      const empilhaNoPreview = ctx.modo === "preview" && ctx.viewport === "mobile" && (bloco.colunasMobile ?? 1) === 1;
      return (
        <div
          className={`tfp-cols${(bloco.colunasMobile ?? 1) === 1 ? " tfp-cols-stack" : ""}`}
          style={{
            display: "grid", gap: 14, alignItems: "start",
            gridTemplateColumns: empilhaNoPreview ? "1fr" : `repeat(${n}, 1fr)`,
            ["--tfp-cols" as string]: String(n),
          }}
        >
          {cols.map((c) => (
            <div key={c.id} style={{ display: "grid", gap: 12 }}>
              {c.blocos.map((f) => <BlocoView key={f.id} bloco={f} ctx={ctx} paginaId={paginaId} />)}
            </div>
          ))}
        </div>
      );
    }

    default:
      return null;
  }
}

/**
 * Texto do bloco pronto pra tela.
 *
 * `{{nome}}` vira o valor só na página PUBLICADA. No editor a tag continua
 * visível de propósito: quem está escrevendo precisa enxergar o que escreveu
 * pra conseguir mudar — uma tag que some vira texto que ninguém acha. E durante
 * a edição o valor cru é obrigatório, senão o `confirmar()` gravaria o texto já
 * substituído por cima do modelo.
 *
 * Sai como nó de texto (o arquivo inteiro evita dangerouslySetInnerHTML), então
 * um valor vindo da URL nunca vira marcação.
 */
function texto(ctx: CtxPagina, bruto: string | undefined, editando: boolean): string {
  const t = bruto ?? "";
  return ctx.modo === "publicado" && !editando ? interpolar(t, ctx.vars) : t;
}

/**
 * Texto editável NA PRÓPRIA PÁGINA (só no editor).
 *
 * Grava no `blur`, nunca a cada tecla: se o documento mudasse a cada letra, o
 * React re-renderizaria o nó contentEditable e o cursor pularia pro começo —
 * é o bug clássico desse tipo de campo. Enter confirma, Esc cancela.
 *
 * Lê `innerText` (nunca innerHTML): o que entra no documento é texto puro,
 * então colar conteúdo formatado de outro site não injeta marcação nenhuma.
 */
function Editavel({ ctx, bloco, como: Tag, style, destaque, destaqueSobreCor, trocas }: {
  ctx: CtxPagina; bloco: Bloco; como: "h1" | "h2" | "h3" | "p" | "div" | "span"; style: React.CSSProperties;
  /** Trecho a pintar em serifa itálica. Só fora da edição: durante a edição o
   *  nó precisa ser texto puro, senão o innerText confirmado viria picotado. */
  destaque?: string;
  /** O título tem cor própria (ex.: branco sobre fundo escuro): o destaque
   *  mistura a primária com ESSA cor, senão o índigo some no fundo escuro. */
  destaqueSobreCor?: boolean;
  /** Palavras que se revezam no lugar do destaque (só na página no ar). */
  trocas?: string[];
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [editando, setEditando] = useState(false);
  const podeEditar = ctx.modo === "preview" && !!ctx.onEditarTexto;

  // Confirma DIRETO, sem depender de um blur() de volta. A primeira versão fazia
  // o Enter chamar blur() e esperar o onBlur — um caminho a mais pra falhar, e
  // falhava: o bloco ficava preso em modo de edição. Enter e clique-fora agora
  // chamam exatamente a mesma função.
  const confirmar = () => {
    if (!editando) return;
    setEditando(false);
    const novo = (ref.current?.innerText ?? "").replace(/ /g, " ");
    // Texto vazio desfaz em vez de apagar o bloco: apagar tudo sem querer e
    // ficar com um título em branco é pior que não ter editado.
    if (novo.trim() && novo !== (bloco.texto ?? "")) ctx.onEditarTexto?.(bloco.id, novo.trim());
    else if (ref.current) ref.current.innerText = bloco.texto ?? "";
  };

  const abrir = (e: React.MouseEvent) => {
    if (!podeEditar || editando) return;
    e.stopPropagation();
    setEditando(true);
    // Espera o nó virar editável, foca e SELECIONA o conteúdo — assim digitar
    // substitui o texto de exemplo, que é o que se espera de um placeholder.
    setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const faixa = document.createRange();
      faixa.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(faixa);
    }, 0);
  };

  return (
    <Tag
      ref={ref as React.Ref<never>}
      contentEditable={editando}
      suppressContentEditableWarning
      onDoubleClick={abrir}
      onBlur={editando ? confirmar : undefined}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (!editando) return;
        e.stopPropagation();
        // "Return" é o nome que algumas pilhas de entrada mandam no lugar de
        // "Enter"; aceitar os dois não custa nada e evita ficar preso editando.
        if ((e.key === "Enter" || e.key === "Return") && !e.shiftKey) { e.preventDefault(); confirmar(); }
        if (e.key === "Escape") {
          e.preventDefault();
          if (ref.current) ref.current.innerText = bloco.texto ?? "";
          setEditando(false);
        }
      }}
      title={podeEditar && !editando ? "Clique duas vezes para editar" : undefined}
      style={{
        ...style,
        ...(editando ? { outline: "2px solid var(--tf-accent, var(--primary-texto))", outlineOffset: 3, borderRadius: 4, cursor: "text" } : {}),
      }}
    >{comDestaque(texto(ctx, bloco.texto, editando), editando ? undefined : destaque, destaqueSobreCor, trocas)}</Tag>
  );
}

/** Quebra o texto em volta da PRIMEIRA ocorrência do destaque. */
function comDestaque(t: string, destaque: string | undefined, sobreCor = false, trocas?: string[]): React.ReactNode {
  const d = destaque?.trim();
  const i = d ? t.indexOf(d) : -1;
  if (!d || i < 0) return t;
  const palavras = [d, ...(trocas ?? []).map((x) => x.trim()).filter(Boolean)];
  const classe = `tfp-destaque${sobreCor ? " tfp-destaque-sobre-cor" : ""}`;
  return (
    <>
      {t.slice(0, i)}
      {palavras.length > 1
        ? <TrocaDePalavras palavras={palavras} classe={classe} />
        : <em className={classe}>{d}</em>}
      {t.slice(i + d.length)}
    </>
  );
}

// ── Troca de palavra no título ───────────────────────────────────────────────
// O trecho em destaque se reveza entre palavras, letra a letra, como painel
// virando (cada letra gira no eixo X com 44ms de atraso sobre a anterior).
//   · Todas as palavras moram na MESMA célula de grade (inline-grid): a
//     largura é a da maior, então a manchete não pula a cada troca.
//   · Leitor de tela ouve só a primeira palavra (a animação é aria-hidden).
//   · Aba em segundo plano pausa; "reduzir movimento" fica na primeira.
//   · É timer visual, sem busca de dado nenhuma (ver orcamento-de-execucao).
const TROCA_MS = 2600;

function TrocaDePalavras({ palavras, classe }: { palavras: string[]; classe: string }) {
  const [atual, setAtual] = useState(0);
  const [anterior, setAnterior] = useState<number | null>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let t: ReturnType<typeof setInterval> | null = null;
    const ligar = () => {
      if (t || document.hidden) return;
      t = setInterval(() => {
        setAtual((a) => { setAnterior(a); return (a + 1) % palavras.length; });
      }, TROCA_MS);
    };
    const desligar = () => { if (t) { clearInterval(t); t = null; } };
    const aoMudarVisibilidade = () => (document.hidden ? desligar() : ligar());
    ligar();
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => { desligar(); document.removeEventListener("visibilitychange", aoMudarVisibilidade); };
  }, [palavras.length]);

  return (
    <em className={`${classe} tfp-troca`}>
      <span className="tfp-sr">{palavras[0]}</span>
      <span className="tfp-troca-grade" aria-hidden>
        {palavras.map((p, k) => (
          <span key={k} className="tfp-troca-palavra"
            data-estado={k === atual ? (anterior === null ? "fixa" : "entra") : k === anterior ? "sai" : "oculta"}>
            {Array.from(p).map((ch, j) => (
              <span key={`${atual}-${j}`} className="tfp-troca-letra" style={{ ["--i" as string]: j }}>{ch === " " ? "\u00a0" : ch}</span>
            ))}
          </span>
        ))}
      </span>
    </em>
  );
}

// ── Depoimentos em colunas rolando ───────────────────────────────────────────
// Três colunas (duas no tablet, uma no celular) sobem devagar em velocidades
// diferentes, e o véu em cima e embaixo esconde a emenda. Cada coluna é a
// lista DUAS vezes: a animação anda -50% e recomeça do mesmo quadro, sem pulo.
// A segunda cópia é aria-hidden — leitor de tela ouve cada depoimento uma vez.
// Tudo CSS (globals.css, .tfp-dep-*): no ar não tem JS rodando por quadro.
const RITMO_COLUNA = [15, 19, 17];   // segundos por volta — desencontrados de propósito

function DepoimentosEmColunas({ bloco, ctx, primaria }: { bloco: Bloco; ctx: CtxPagina; primaria: string }) {
  const lista = bloco.depoimentos ?? [];
  const colunas = [0, 1, 2].map((c) => lista.filter((_, i) => i % 3 === c)).filter((c) => c.length);
  // Com poucos depoimentos a coluna fica mais baixa que a janela e o laço
  // aparece: repete a lista até ter corpo pra rolar.
  const encher = (c: typeof lista) => (c.length >= 3 ? c : Array.from({ length: Math.ceil(3 / c.length) }, () => c).flat());
  const simMobile = ctx.modo === "preview" && ctx.viewport === "mobile";
  return (
    <div className={`tfp-dep-colunas${simMobile ? " tfp-dep-1col" : ""}`} style={{ ["--tfp-dep-cor" as string]: primaria }}>
      {colunas.map((coluna, c) => (
        <div key={c} className="tfp-dep-coluna" data-col={c}>
          <div className="tfp-dep-trilho" style={{ animationDuration: `${RITMO_COLUNA[c]}s` }}>
            {[0, 1].map((copia) => (
              <div key={copia} className="tfp-dep-copia" aria-hidden={copia === 1 || undefined}>
                {encher(coluna).map((d, i) => <CartaoDepoimento key={`${d.id}-${i}`} d={d} raio={bloco.estilo?.raio ?? 24} semNota />)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Link de quadro/cartão ────────────────────────────────────────────────────
// "Explorar →": pílula no pé do quadro. No editor não navega.
function LinkDoQuadro({ link, ctx, blocoId, classe }: { link?: { texto: string; url: string }; ctx: CtxPagina; blocoId: string; classe: string }) {
  if (!link?.texto) return null;
  const destino = urlSegura(link.url);
  return (
    <a className={classe} href={destino || undefined}
      target={ctx.modo === "publicado" && /^https?:/i.test(destino) ? "_blank" : undefined}
      rel={/^https?:/i.test(destino) ? "noopener noreferrer" : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (ctx.modo === "preview") { e.preventDefault(); return; }
        ctx.onEvento("cta_clicked", { blocoId, origem: "quadro", destino });
      }}>
      {link.texto}
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" {...TRACO}><path d="M5 12l14 0 M13 18l6 -6 M13 6l6 6" /></svg>
    </a>
  );
}

// ── Bento ────────────────────────────────────────────────────────────────────
// Grade de quadros de tamanhos diferentes (normal 1×1, largo 2×1, alto 1×2,
// grande 2×2) em 4 colunas; 2 no tablet e 1 no celular (CSS .tfp-bento).
// Quadro com foto: a imagem cobre o quadro e um véu escuro garante o texto.
function BentoView({ bloco, ctx }: { bloco: Bloco; ctx: CtxPagina }) {
  const quadros = bloco.bento ?? [];
  return (
    <div className={`tfp-bento${ctx.modo === "preview" && ctx.viewport === "mobile" ? " tfp-bento-1" : ""}`}>
      {quadros.map((q) => {
        const img = urlImagemSegura(q.imagemUrl);
        return (
          <article key={q.id} className={`tfp-bento-q tfp-bento-${q.tamanho} tfp-bento-${q.tom}${img ? " tfp-bento-foto" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {img && <img className="tfp-bento-img" src={img} alt="" loading="lazy" />}
            <div className="tfp-bento-topo">
              {q.etiqueta && <span className="tfp-bento-etiqueta">{q.etiqueta}</span>}
              <h3 className="tfp-bento-titulo">{q.titulo}</h3>
              {q.texto && <p className="tfp-bento-texto">{q.texto}</p>}
            </div>
            {(q.chips?.length || q.link?.texto) && (
              <div className="tfp-bento-pe">
                {!!q.chips?.length && <ul className="tfp-bento-chips">{q.chips.map((c, i) => <li key={i}>{c}</li>)}</ul>}
                <LinkDoQuadro link={q.link} ctx={ctx} blocoId={bloco.id} classe="tfp-bento-link" />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

// ── Carrossel de cartões ─────────────────────────────────────────────────────
// Fileira que desliza de lado com encaixe (scroll-snap). A rolagem é DENTRO do
// bloco — a página nunca ganha largura. As setas andam quase uma tela e se
// apagam nas pontas; no celular o dedo faz o trabalho e as setas continuam.
function CarrosselView({ bloco, ctx }: { bloco: Bloco; ctx: CtxPagina }) {
  const cartoes = bloco.slides ?? [];
  const trilho = useRef<HTMLDivElement | null>(null);
  const [pontas, setPontas] = useState({ inicio: true, fim: false });

  const medir = useCallback(() => {
    const el = trilho.current;
    if (!el) return;
    setPontas({ inicio: el.scrollLeft <= 2, fim: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [medir, cartoes.length]);

  const andar = (dir: 1 | -1) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = trilho.current;
    if (!el) return;
    const suave = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: suave ? "smooth" : "auto" });
  };

  return (
    <div className="tfp-car">
      <div ref={trilho} className="tfp-car-trilho" onScroll={medir} tabIndex={0} role="region" aria-label="Cartões — role de lado">
        {cartoes.map((c) => {
          const img = urlImagemSegura(c.imagemUrl);
          return (
            <article key={c.id} className="tfp-car-cartao">
              {c.etiqueta && <span className="tfp-bento-etiqueta">{c.etiqueta}</span>}
              <h3 className="tfp-car-titulo">{c.titulo}</h3>
              {c.texto && <p className="tfp-car-texto">{c.texto}</p>}
              <LinkDoQuadro link={c.link} ctx={ctx} blocoId={bloco.id} classe="tfp-botao-link" />
              {img
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className="tfp-car-img" src={img} alt="" loading="lazy" />
                : <span className="tfp-car-img tfp-car-img-vazia" aria-hidden />}
            </article>
          );
        })}
      </div>
      {cartoes.length > 1 && (
        <div className="tfp-car-ctrl">
          <button type="button" className="tfp-car-seta" aria-label="Anterior" disabled={pontas.inicio} onClick={andar(-1)}>
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" {...TRACO}><path d="M15 6l-6 6l6 6" /></svg>
          </button>
          <button type="button" className="tfp-car-seta" aria-label="Próximo" disabled={pontas.fim} onClick={andar(1)}>
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" {...TRACO}><path d="M9 6l6 6l-6 6" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Rodapé ───────────────────────────────────────────────────────────────────
// Marca + frase à esquerda, colunas de links à direita, linha legal embaixo.
// Link sem destino (contato ainda não preenchido) vira texto, não link morto.
function RodapeView({ bloco, ctx }: { bloco: Bloco; ctx: CtxPagina }) {
  const r = bloco.rodape;
  if (!r) return null;
  const logo = urlImagemSegura(r.logoUrl);
  const noEditor = ctx.modo === "preview";
  const link = (l: { id: string; texto: string; url: string }) => {
    const destino = urlSegura(l.url);
    if (!destino) return <span className="tfp-rod-link tfp-rod-sem">{l.texto}</span>;
    const fora = /^https?:/i.test(destino);
    return (
      <a className="tfp-rod-link" href={destino} target={fora && !noEditor ? "_blank" : undefined} rel={fora ? "noopener noreferrer" : undefined}
        onClick={(e) => { if (noEditor) e.preventDefault(); }}>{l.texto}</a>
    );
  };
  return (
    <footer className={`tfp-rod${noEditor && ctx.viewport === "mobile" ? " tfp-rod-estreito" : ""}`}>
      <div className="tfp-rod-topo">
        <div className="tfp-rod-marca">
          {logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logo} alt={r.marca || ""} />
            : <strong>{r.marca}</strong>}
          {r.texto && <p>{r.texto}</p>}
        </div>
        {r.colunas.length > 0 && (
          <nav className="tfp-rod-colunas" aria-label="Rodapé">
            {r.colunas.map((c) => (
              <div key={c.id}>
                <h2 className="tfp-rod-titulo">{c.titulo}</h2>
                <ul>{c.links.map((l) => <li key={l.id}>{link(l)}</li>)}</ul>
              </div>
            ))}
          </nav>
        )}
      </div>
      <Separator className="tfp-rod-sep" />
      <div className="tfp-rod-base">
        <span>© {new Date().getFullYear()} {r.marca}</span>
        {r.linksLegais.length > 0 && <ul>{r.linksLegais.map((l) => <li key={l.id}>{link(l)}</li>)}</ul>}
      </div>
    </footer>
  );
}

// ── Cabeçalho ────────────────────────────────────────────────────────────────
// Pílula flutuante: marca, menu de texto e botão. Link com `filhos` vira item
// com seta que abre um submenu ancorado nele. No celular o menu some e entra
// o botão ☰, que abre a lista inteira logo abaixo da pílula.
//
// Sem portal DE PROPÓSITO: o submenu mora dentro de .tfp-pagina e herda os
// tokens da página (cor, fundo). Portado pro <body> ele pegaria o tema do ERP
// e o modo escuro de quem visita. Nenhum ancestral do cabeçalho tem transform
// nem overflow — a seção de topo é só fundo.
const SETA_BAIXO = "M6 9l6 6l6 -6";
const MENU = "M4 6h16 M4 12h16 M4 18h16";
const FECHAR = "M18 6l-12 12 M6 6l12 12";

function CabecalhoView({ bloco, ctx }: { bloco: Bloco; ctx: CtxPagina; primaria: string }) {
  const c = bloco.cabecalho;
  const [aberto, setAberto] = useState<string | null>(null);       // id do item com submenu aberto
  const [menuMovel, setMenuMovel] = useState(false);
  const raiz = useRef<HTMLElement | null>(null);
  const fechaHover = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Preso no topo só na página no ar: no editor ele flutuaria sobre o painel.
  const fixo = !!c?.fixo && ctx.modo === "publicado";
  const [rolou, setRolou] = useState(false);

  // Depois que a pessoa começa a rolar, a pílula fica mais sólida e ganha
  // sombra — separa do conteúdo que passa por baixo. Um rAF por quadro, no
  // máximo, e só troca o estado quando cruza o limiar.
  useEffect(() => {
    if (!fixo) return;
    let quadro = 0;
    const medir = () => { quadro = 0; setRolou(window.scrollY > 8); };
    const aoRolar = () => { if (!quadro) quadro = requestAnimationFrame(medir); };
    medir();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => { window.removeEventListener("scroll", aoRolar); if (quadro) cancelAnimationFrame(quadro); };
  }, [fixo]);

  // Tocou fora ou apertou Esc: fecha. Só escuta enquanto algo está aberto.
  useEffect(() => {
    if (!aberto && !menuMovel) return;
    const fora = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) { setAberto(null); setMenuMovel(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setAberto(null); setMenuMovel(false); } };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto, menuMovel]);

  if (!c) return null;
  const logo = urlImagemSegura(c.logoUrl);
  const destinoBotao = urlSegura(c.urlBotao);
  const noEditor = ctx.modo === "preview";
  const simMobile = noEditor && ctx.viewport === "mobile";
  const segurar = (e: React.MouseEvent) => { e.stopPropagation(); if (noEditor) e.preventDefault(); };
  const idMenu = `tfp-sub-${bloco.id}`;

  // Mouse: abre ao passar e fecha com um respiro de 140ms (atravessar o vão
  // entre o item e o painel não fecha). Toque e teclado: clique alterna.
  const entrar = (id: string) => (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    if (fechaHover.current) clearTimeout(fechaHover.current);
    setAberto(id);
  };
  const sair = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    fechaHover.current = setTimeout(() => setAberto(null), 140);
  };

  const itemSub = (f: LinkCabecalho) => (
    <li key={f.id}>
      <a className="tfp-sub-item" href={urlSegura(f.url) || "#"} onClick={segurar}>
        <span className="tfp-sub-titulo">{f.texto}</span>
        {f.descricao && <span className="tfp-sub-desc">{f.descricao}</span>}
      </a>
    </li>
  );

  return (
    <>
    {/* Fixo, a pílula sai do fluxo: este espaço guarda o lugar dela pra
        manchete não subir por baixo. */}
    {fixo && <div className="tfp-cab-espaco" aria-hidden />}
    <nav ref={raiz} aria-label="Principal"
      className={`tfp-cab${simMobile ? " tfp-cab-estreito" : ""}${menuMovel ? " tfp-cab-aberto" : ""}${fixo ? " tfp-cab-fixo" : ""}${fixo && rolou ? " tfp-cab-rolou" : ""}`}>
      <span className="tfp-cab-marca">
        {logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logo} alt={c.marca || ""} />
          : c.marca}
      </span>

      {c.links.length > 0 && (
        <ul className="tfp-cab-links">
          {c.links.map((l) => l.filhos?.length ? (
            <li key={l.id} className="tfp-cab-temsub" onPointerEnter={entrar(l.id)} onPointerLeave={sair}>
              <button
                type="button" className="tfp-cab-link" aria-expanded={aberto === l.id} aria-controls={`${idMenu}-${l.id}`}
                onClick={(e) => { e.stopPropagation(); setAberto((a) => (a === l.id ? null : l.id)); }}
              >
                {l.texto}
                <svg aria-hidden className="tfp-cab-seta" width="15" height="15" viewBox="0 0 24 24" {...TRACO}><path d={SETA_BAIXO} /></svg>
              </button>
              <div id={`${idMenu}-${l.id}`} className="tfp-sub" data-aberto={aberto === l.id || undefined} inert={aberto !== l.id || undefined}>
                <ul>{l.filhos.map(itemSub)}</ul>
              </div>
            </li>
          ) : (
            <li key={l.id}><a className="tfp-cab-link" href={urlSegura(l.url) || "#"} onClick={segurar}>{l.texto}</a></li>
          ))}
        </ul>
      )}

      <span className="tfp-cab-acoes">
        {c.rotuloBotao && (
          <a
            className={`${buttonVariants({ size: "md" })} tfp-cab-botao`}
            href={destinoBotao || undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (noEditor) { e.preventDefault(); return; }
              ctx.onEvento("cta_clicked", { blocoId: bloco.id, origem: "cabecalho", destino: destinoBotao });
            }}
          >{c.rotuloBotao}</a>
        )}
        {c.links.length > 0 && (
          <button
            type="button" className="tfp-cab-menu" aria-label={menuMovel ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuMovel} aria-controls={`${idMenu}-movel`}
            onClick={(e) => { e.stopPropagation(); setMenuMovel((v) => !v); }}
          >
            <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" {...TRACO}><path d={menuMovel ? FECHAR : MENU} /></svg>
          </button>
        )}
      </span>

      {/* Menu do celular: a lista inteira, com os submenus já abertos. */}
      <div id={`${idMenu}-movel`} className="tfp-cab-movel" data-aberto={menuMovel || undefined} inert={!menuMovel || undefined}>
        <ul>
          {c.links.map((l) => l.filhos?.length ? (
            <li key={l.id} className="tfp-movel-grupo">
              <span className="tfp-movel-rotulo">{l.texto}</span>
              <ul>{l.filhos.map(itemSub)}</ul>
            </li>
          ) : (
            <li key={l.id}><a className="tfp-sub-item" href={urlSegura(l.url) || "#"} onClick={segurar}><span className="tfp-sub-titulo">{l.texto}</span></a></li>
          ))}
        </ul>
      </div>
    </nav>
    </>
  );
}

// Botões são o `button` do HeroUI (buttonVariants numa <a>): a cor vem de
// --accent, que o globals.css amarra na primária da página (.tfp-pagina).
// O raio escolhido no inspetor continua valendo por cima.
function raioBotao(raio?: number): React.CSSProperties | undefined {
  return raio != null ? { borderRadius: raio } : undefined;
}

// Depoimento: Card + Avatar do HeroUI. Usado na grade e nas colunas rolando.
function CartaoDepoimento({ d, raio, semNota = false }: { d: ItemDepoimento; raio?: number; semNota?: boolean }) {
  const foto = urlImagemSegura(d.fotoUrl);
  return (
    <Card render={(props) => <figure {...props} />} className="tfp-card tfp-dep-card" style={{ borderRadius: raio }}>
      {!semNota && !!d.nota && <div className="tfp-dep-nota" aria-label={`${d.nota} de 5`}>{"★".repeat(Math.min(5, d.nota))}</div>}
      <blockquote>{d.texto}</blockquote>
      <figcaption>
        <Avatar size="md" color="accent">
          {foto && <Avatar.Image src={foto} alt="" />}
          <Avatar.Fallback>{d.nome.charAt(0).toUpperCase()}</Avatar.Fallback>
        </Avatar>
        <span>
          <strong>{d.nome}</strong>
          {d.cargo && <span>{d.cargo}</span>}
        </span>
      </figcaption>
    </Card>
  );
}

function Placeholder({ texto }: { texto: string }) {
  return (
    <div style={{
      padding: "26px 12px", borderRadius: 12, fontSize: 13, opacity: TEXTO.secundario,
      border: "1px dashed color-mix(in srgb, currentColor 28%, transparent)",
      background: "color-mix(in srgb, currentColor 5%, transparent)",
    }}>{texto}</div>
  );
}

function Contador({ bloco, primaria, congelado }: { bloco: Bloco; primaria: string; congelado: boolean }) {
  const total = Math.max(1, bloco.contador?.minutos ?? 15) * 60;
  const [resta, setResta] = useState(total);
  useEffect(() => {
    if (congelado) return;
    setResta(total);
    const t = setInterval(() => {
      setResta((r) => {
        if (r <= 1) {
          if (bloco.contador?.aoZerar === "reinicia") return total;
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [total, congelado, bloco.contador?.aoZerar]);

  if (resta === 0 && bloco.contador?.aoZerar === "some") return null;
  const mm = String(Math.floor(resta / 60)).padStart(2, "0");
  const ss = String(resta % 60).padStart(2, "0");
  return (
    <div>
      {bloco.contador?.rotulo && <div style={{ fontSize: 13, opacity: TEXTO.secundario, marginBottom: 4 }}>{bloco.contador.rotulo}</div>}
      <strong style={{ fontSize: 32, fontWeight: 900, color: primaria, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{mm}:{ss}</strong>
    </div>
  );
}
