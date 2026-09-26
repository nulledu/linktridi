"use client";

// Painel ESQUERDO do editor de páginas: a estrutura em árvore.
//
// Só desenha e avisa — nenhuma edição do documento acontece aqui. Toda mutação
// sobe pelos callbacks (o pai é dono do `doc`, do undo/redo e da paleta de
// blocos). O único estado local é de interface: qual seção está em renomeação e
// qual item está pedindo confirmação de exclusão (nada de window.confirm).

import { useState } from "react";
import { Icon } from "../../../Icon";
import { ACENTO, Vazio, inp } from "../_ui";
import { Botao } from "../../../ui/controles";
import {
  ICONE_BLOCO,
  ROTULO_BLOCO,
  type Bloco,
  type BlocoTipo,
  type PaginaDoc,
  type Secao,
} from "@/lib/tridiflow-pagina";

export interface PropsArvore {
  doc: PaginaDoc;
  selecionado: string | null;
  onSelecionar: (id: string | null) => void;
  onAddSecao: () => void;
  onAddBloco: (secaoId: string) => void;
  onMoverBloco: (blocoId: string, dir: -1 | 1) => void;
  onMoverSecao: (secaoId: string, dir: -1 | 1) => void;
  onDuplicar: (blocoId: string) => void;
  onRemover: (blocoId: string) => void;
  onAlternarOculto: (blocoId: string) => void;
  onRemoverSecao: (secaoId: string) => void;
  onRenomearSecao: (secaoId: string, nome: string) => void;
  /** Soltar o bloco arrastado na seção, na posição indicada. */
  onArrastar: (blocoId: string, secaoId: string, indice: number) => void;
}

// Estado do arrasto, compartilhado pelas linhas. `alvo` é a posição onde a
// barra de inserção aparece — sempre ENTRE dois blocos de uma seção, nunca
// "dentro" de um bloco: soltar tem que ser previsível.
interface Arrasto {
  blocoId: string | null;
  alvo: { secaoId: string; indice: number } | null;
}
const ARRASTO_VAZIO: Arrasto = { blocoId: null, alvo: null };
const TIPO_DND = "application/tf-bloco";

// Os ícones de ICONE_BLOCO foram adicionados ao mapa do Tabler em
// app/(plataforma)/Icon.tsx — usa direto, sem tabela de tradução.
const iconeDe = (tipo: BlocoTipo): string => ICONE_BLOCO[tipo];

const NEG = "var(--tf-neg, var(--perigo))";
const FUNDO_SEL = `color-mix(in srgb, ${ACENTO} 16%, transparent)`;

function corta(s: string, n = 24): string {
  const limpo = s.replace(/\s+/g, " ").trim();
  return limpo.length > n ? `${limpo.slice(0, n)}…` : limpo;
}

/** Resumo curto do conteúdo — é o que diferencia dois "Texto" na lista. */
function resumoBloco(b: Bloco): string {
  switch (b.tipo) {
    case "titulo": case "texto": case "aviso": case "botao":
      return corta(b.texto ?? "");
    case "whatsapp":
      return corta(b.texto || b.telefone || "");
    case "imagem":
      return corta(b.alt || (b.url ?? "").split("/").pop() || "");
    case "video":
      return corta(b.video?.url || (b.video?.iframe ? "código incorporado" : ""));
    case "beneficios":
      return `${b.itens?.length ?? 0} itens`;
    case "faq":
      return `${b.faq?.length ?? 0} perguntas`;
    case "depoimentos":
      return `${b.depoimentos?.length ?? 0} depoimentos`;
    case "formulario":
      return `${b.campos?.length ?? 0} campos`;
    case "oferta":
      return corta(b.oferta?.produto ?? "");
    case "contador":
      return `${b.contador?.minutos ?? 0} min`;
    case "espacador":
      return `${b.altura ?? 0} px`;
    case "colunas":
      return `${b.colunas?.length ?? 0} colunas`;
    case "container":
      return `${b.blocos?.length ?? 0} blocos`;
    default:
      return "";
  }
}

function contarBlocos(blocos: Bloco[]): number {
  let n = 0;
  for (const b of blocos) {
    n += 1;
    if (b.blocos) n += contarBlocos(b.blocos);
    if (b.colunas) for (const c of b.colunas) n += contarBlocos(c.blocos);
  }
  return n;
}

function Mini({ icone, titulo, onClick, cor, desativado }: {
  icone: string; titulo: string; onClick: () => void; cor?: string; desativado?: boolean;
}) {
  return (
    <button
      type="button" title={titulo} aria-label={titulo} disabled={desativado}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        flex: "none", display: "grid", placeItems: "center", width: 20, height: 20, padding: 0,
        borderRadius: 6, border: "none", background: "transparent",
        cursor: desativado ? "default" : "pointer", opacity: desativado ? 0.25 : 1,
      }}
    >
      <Icon name={icone} size={13} color={cor ?? "var(--text-dim)"} />
    </button>
  );
}

/** Linha vira "Excluir? Sim / Não" — confirmação inline, sem diálogo do browser. */
function Confirmar({ onSim, onNao }: { onSim: () => void; onNao: () => void }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
      <Icon name="alert-triangle" size={13} color={NEG} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Excluir?</span>
      <Botao variante="perigo" tamanho="sm" onClick={(e) => { e.stopPropagation(); onSim(); }}>Sim</Botao>
      <Botao variante="sutil" tamanho="sm" onClick={(e) => { e.stopPropagation(); onNao(); }}>Não</Botao>
    </span>
  );
}

function Selo({ icone, titulo }: { icone: string; titulo: string }) {
  return (
    <span
      title={titulo}
      style={{
        flex: "none", display: "grid", placeItems: "center", width: 17, height: 17, borderRadius: 5,
        background: `color-mix(in srgb, ${ACENTO} 18%, transparent)`,
      }}
    >
      <Icon name={icone} size={11} color={ACENTO} />
    </span>
  );
}

function LinhaBloco({ bloco, nivel, p, confirmando, setConfirmando, secaoId, indice, arrasto, setArrasto }: {
  bloco: Bloco; nivel: number; p: PropsArvore;
  confirmando: string | null; setConfirmando: (v: string | null) => void;
  /** Seção que contém esta linha e a posição dela — base do arrasto. */
  secaoId: string; indice: number;
  arrasto: Arrasto; setArrasto: (a: Arrasto) => void;
}) {
  const [hover, setHover] = useState(false);
  const sel = p.selecionado === bloco.id;
  const pedindo = confirmando === bloco.id;
  const temporizado = bloco.visivel?.modo !== undefined && bloco.visivel.modo !== "sempre";
  const acoes = hover || sel;
  const resumo = resumoBloco(bloco);
  const arrastando = arrasto.blocoId === bloco.id;
  // A barra de inserção só é desenhada em linhas do NÍVEL 1: o destino de um
  // arrasto é sempre uma posição na seção, não o interior de outro bloco.
  const marcaAntes = nivel === 1 && arrasto.alvo?.secaoId === secaoId && arrasto.alvo.indice === indice;
  const marcaDepois = nivel === 1 && arrasto.alvo?.secaoId === secaoId && arrasto.alvo.indice === indice + 1;

  // Posição de inserção a partir do ponteiro: metade de cima solta ANTES,
  // metade de baixo solta DEPOIS.
  const posicaoDoPonteiro = (e: React.DragEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY - r.top > r.height / 2 ? indice + 1 : indice;
  };

  const aoPassar = (e: React.DragEvent) => {
    if (nivel !== 1) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const idx = posicaoDoPonteiro(e);
    if (arrasto.alvo?.secaoId !== secaoId || arrasto.alvo?.indice !== idx) {
      setArrasto({ blocoId: arrasto.blocoId, alvo: { secaoId, indice: idx } });
    }
  };

  const aoSoltar = (e: React.DragEvent) => {
    if (nivel !== 1) return;
    e.preventDefault(); e.stopPropagation();
    // O `drop` se vira sozinho: o id sai do dataTransfer e a posição sai do
    // ponteiro. Depender do estado deixado pelo `dragover` quebrava quando os
    // dois eventos caíam no mesmo tick (o React ainda não tinha re-renderizado).
    const id = arrasto.blocoId || e.dataTransfer.getData(TIPO_DND);
    const alvo = arrasto.alvo ?? { secaoId, indice: posicaoDoPonteiro(e) };
    setArrasto(ARRASTO_VAZIO);
    if (id) p.onArrastar(id, alvo.secaoId, alvo.indice);
  };

  return (
    <>
      {marcaAntes && <BarraSolta nivel={nivel} />}
      <div
        draggable={!pedindo}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(TIPO_DND, bloco.id);
          setArrasto({ blocoId: bloco.id, alvo: null });
        }}
        onDragEnd={() => setArrasto(ARRASTO_VAZIO)}
        onDragOver={aoPassar}
        onDrop={aoSoltar}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={(e) => { e.stopPropagation(); p.onSelecionar(bloco.id); }}
        title="Arraste para reordenar"
        style={{
          position: "relative", display: "flex", alignItems: "center", gap: 6,
          padding: "5px 6px 5px 0", paddingLeft: 10 + nivel * 13,
          borderRadius: 8, cursor: arrastando ? "grabbing" : "pointer", minHeight: 28,
          background: sel ? FUNDO_SEL : hover ? "var(--surface-2)" : "transparent",
          opacity: bloco.oculto ? 0.45 : arrastando ? 0.4 : 1,
        }}
      >
        {sel && <span style={{ position: "absolute", left: 2, top: 5, bottom: 5, width: 2, borderRadius: 2, background: ACENTO }} />}
        {pedindo ? (
          <Confirmar
            onSim={() => { setConfirmando(null); p.onRemover(bloco.id); }}
            onNao={() => setConfirmando(null)}
          />
        ) : (
          <>
            <Icon name={iconeDe(bloco.tipo)} size={14} color={sel ? ACENTO : "var(--text-dim)"} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, color: "var(--text)" }}>
              {ROTULO_BLOCO[bloco.tipo]}
              {resumo && <span style={{ color: "var(--text-dim)" }}>{` · ${resumo}`}</span>}
            </span>
            {!acoes && temporizado && <Selo icone="clock" titulo="Aparece com liberação temporizada" />}
            {!acoes && bloco.oculto && <Selo icone="eye-off" titulo="Bloco oculto" />}
            {acoes && (
              <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 1 }}>
                <Mini icone="chevron-up" titulo="Subir" onClick={() => p.onMoverBloco(bloco.id, -1)} />
                <Mini icone="chevron-down" titulo="Descer" onClick={() => p.onMoverBloco(bloco.id, 1)} />
                <Mini icone="copy" titulo="Duplicar" onClick={() => p.onDuplicar(bloco.id)} />
                <Mini
                  icone={bloco.oculto ? "eye-off" : "eye"}
                  titulo={bloco.oculto ? "Mostrar" : "Ocultar"}
                  onClick={() => p.onAlternarOculto(bloco.id)}
                />
                <Mini icone="trash" titulo="Excluir" cor={NEG} onClick={() => setConfirmando(bloco.id)} />
              </span>
            )}
          </>
        )}
      </div>

      {bloco.blocos?.map((f) => (
        <LinhaBloco key={f.id} bloco={f} nivel={nivel + 1} p={p} confirmando={confirmando} setConfirmando={setConfirmando}
          secaoId={secaoId} indice={indice} arrasto={arrasto} setArrasto={setArrasto} />
      ))}

      {bloco.colunas?.map((col, i) => (
        <div key={col.id}>
          <div style={{ padding: "3px 6px 3px 0", paddingLeft: 10 + (nivel + 1) * 13, fontSize: 10.5, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-dim)" }}>
            {`Coluna ${i + 1}`}
          </div>
          {col.blocos.map((f) => (
            <LinhaBloco key={f.id} bloco={f} nivel={nivel + 2} p={p} confirmando={confirmando} setConfirmando={setConfirmando}
              secaoId={secaoId} indice={indice} arrasto={arrasto} setArrasto={setArrasto} />
          ))}
        </div>
      ))}

      {marcaDepois && <BarraSolta nivel={nivel} />}
    </>
  );
}

// Barra fina que mostra ONDE o bloco vai cair.
function BarraSolta({ nivel }: { nivel: number }) {
  return (
    <div aria-hidden style={{
      height: 2, borderRadius: 2, background: ACENTO, margin: "1px 6px 1px 0",
      marginLeft: 10 + nivel * 13, boxShadow: `0 0 0 2px color-mix(in srgb, ${ACENTO} 22%, transparent)`,
    }} />
  );
}

function LinhaSecao({ secao, indice, total, p, confirmando, setConfirmando, arrasto, setArrasto }: {
  secao: Secao; indice: number; total: number; p: PropsArvore;
  confirmando: string | null; setConfirmando: (v: string | null) => void;
  arrasto: Arrasto; setArrasto: (a: Arrasto) => void;
}) {
  const [hover, setHover] = useState(false);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(secao.nome ?? "");
  const sel = p.selecionado === secao.id;
  const pedindo = confirmando === secao.id;
  const qtd = contarBlocos(secao.blocos);

  const abrirRenome = () => { setRascunho(secao.nome ?? ""); setEditando(true); };
  const salvar = () => {
    setEditando(false);
    const nome = rascunho.trim();
    if (nome && nome !== (secao.nome ?? "")) p.onRenomearSecao(secao.id, nome);
  };

  return (
    <div style={{ marginBottom: 6 }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={(e) => { e.stopPropagation(); p.onSelecionar(secao.id); }}
        onDoubleClick={(e) => { e.stopPropagation(); abrirRenome(); }}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 6px 6px 8px",
          borderRadius: 8, cursor: "pointer", minHeight: 30,
          background: sel ? FUNDO_SEL : hover ? "var(--surface-2)" : "transparent",
          opacity: secao.oculto ? 0.45 : 1,
        }}
      >
        {pedindo ? (
          <Confirmar
            onSim={() => { setConfirmando(null); p.onRemoverSecao(secao.id); }}
            onNao={() => setConfirmando(null)}
          />
        ) : editando ? (
          <input
            autoFocus
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={salvar}
            onKeyDown={(e) => {
              if (e.key === "Enter") salvar();
              if (e.key === "Escape") setEditando(false);
            }}
            style={{ ...inp, padding: "4px 7px", fontSize: 12, fontWeight: 700 }}
          />
        ) : (
          <>
            <Icon name="layout-grid" size={14} color={sel ? ACENTO : "var(--text-dim)"} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, fontWeight: 800, color: "var(--text)" }}>
              {secao.nome || "Seção"}
            </span>
            <span style={{ flex: "none", fontSize: 10.5, fontWeight: 700, color: "var(--text-dim)" }}>
              {`${qtd} ${qtd === 1 ? "bloco" : "blocos"}`}
            </span>
            {(hover || sel) && (
              <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 1 }}>
                <Mini icone="plus" titulo="Adicionar bloco" onClick={() => p.onAddBloco(secao.id)} />
                <Mini icone="edit" titulo="Renomear" onClick={abrirRenome} />
                <Mini icone="chevron-up" titulo="Subir" desativado={indice === 0} onClick={() => p.onMoverSecao(secao.id, -1)} />
                <Mini icone="chevron-down" titulo="Descer" desativado={indice === total - 1} onClick={() => p.onMoverSecao(secao.id, 1)} />
                <Mini icone="trash" titulo="Excluir seção" cor={NEG} onClick={() => setConfirmando(secao.id)} />
              </span>
            )}
          </>
        )}
      </div>

      {secao.blocos.length === 0 ? (
        <div style={{ padding: "2px 6px 2px 21px" }}>
          <Botao tamanho="sm" icone="plus" bloco onClick={(e) => { e.stopPropagation(); p.onAddBloco(secao.id); }}>
            Adicionar bloco
          </Botao>
        </div>
      ) : (
        <>
          {secao.blocos.map((b, i) => (
            <LinhaBloco key={b.id} bloco={b} nivel={1} indice={i} secaoId={secao.id} p={p}
              confirmando={confirmando} setConfirmando={setConfirmando}
              arrasto={arrasto} setArrasto={setArrasto} />
          ))}
          {/* Faixa no fim da seção: solta o bloco como último item. Sem ela,
              mandar algo pro fim exigiria mirar a metade de baixo da última
              linha — alvo pequeno demais. */}
          <div
            onDragOver={(e) => {
              if (!arrasto.blocoId) return;
              e.preventDefault();
              const idx = secao.blocos.length;
              if (arrasto.alvo?.secaoId !== secao.id || arrasto.alvo?.indice !== idx) {
                setArrasto({ ...arrasto, alvo: { secaoId: secao.id, indice: idx } });
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = arrasto.blocoId;
              const alvo = arrasto.alvo;
              setArrasto(ARRASTO_VAZIO);
              if (id && alvo) p.onArrastar(id, alvo.secaoId, alvo.indice);
            }}
            style={{ height: arrasto.blocoId ? 16 : 4 }}
          />
        </>
      )}
    </div>
  );
}

export function ArvorePagina(p: PropsArvore) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [arrasto, setArrasto] = useState<Arrasto>(ARRASTO_VAZIO);
  const { doc, onAddSecao, onSelecionar } = p;

  return (
    <div
      // Soltar fora de qualquer alvo cancela — sem isto a barra de inserção
      // ficaria acesa depois de um arrasto abandonado.
      onDragEnd={() => setArrasto(ARRASTO_VAZIO)}
      onDrop={() => setArrasto(ARRASTO_VAZIO)}
      style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: "var(--surface)" }}
    >
      <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-dim)" }}>
          Estrutura
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-dim)" }}>
          {`${doc.secoes.length} ${doc.secoes.length === 1 ? "seção" : "seções"}`}
        </span>
      </div>

      <div
        onClick={() => onSelecionar(null)}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 8px 4px" }}
      >
        {doc.secoes.length === 0 ? (
          <Vazio icone="template" texto="A página está vazia. Crie a primeira seção para começar a montar." />
        ) : (
          doc.secoes.map((s, i) => (
            <LinhaSecao
              key={s.id}
              secao={s}
              indice={i}
              total={doc.secoes.length}
              p={p}
              confirmando={confirmando}
              setConfirmando={setConfirmando}
              arrasto={arrasto}
              setArrasto={setArrasto}
            />
          ))
        )}
      </div>

      <div style={{ flex: "none", padding: 10, borderTop: "1px solid var(--border)" }}>
        <Botao icone="circle-plus" bloco onClick={onAddSecao}>
          Adicionar seção
        </Botao>
      </div>
    </div>
  );
}
