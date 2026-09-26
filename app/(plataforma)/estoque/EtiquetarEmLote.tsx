"use client";

// ── Etiquetar vários itens de uma vez ────────────────────────────────────────
//
// Deixar UM item pronto pra etiquetar custava, pela tela: abrir o card, marcar
// a caixinha, salvar (o modal fechava), clicar no card de novo, rolar até as
// unidades, gerar, digitar a quantidade, gerar, fechar. Sete cliques e dois
// ciclos de modal. Vezes 40 itens: ~280 interações — e ninguém configurou
// nenhum, o que era o problema real do módulo.
//
// Aqui os mesmos 40 itens são uma lista com caixinha e quantidade, e uma
// chamada por bloco de 20. Quem faz o trabalho pesado é
// /api/estoque/unidades/preparar: liga a contagem por etiqueta e gera as
// unidades na ordem que a guarda do banco aceita, item a item, desfazendo se
// falhar no meio.

import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { Acoes, Botao, PainelLateral, Caixa } from "../ui/controles";
import { Alerta } from "../ui/Alerta";
import { useLarguraDeFolha, useTrazerPraVista } from "./painel-visivel";
import { sugerirSku } from "@/lib/estoque-sku";
import type { Item } from "./tipos";

interface Resultado {
  item_id: string;
  nome: string;
  ok: boolean;
  geradas: number;
  sku: string | null;
  erro?: string;
}

/** Itens por chamada — o mesmo teto da rota. Fatiar dá progresso e evita
 *  uma requisição de vários minutos que o navegador pode cortar. */
const BLOCO = 20;

export function EtiquetarEmLote({ itens, rotuloHierarquia, onFechar, onPronto }: {
  /** Os itens SEM etiqueta que estão na tela agora. */
  itens: Item[];
  rotuloHierarquia: string;
  onFechar: () => void;
  /** Alguma coisa mudou no banco — a lista de fora precisa recarregar. */
  onPronto: () => void;
}) {
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [rodando, setRodando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // A lista tem dezenas de linhas e a faixa de erro fica DEPOIS dela; o botão
  // que falhou mora no rodapé fixo. Sem isto o lote recusado não dizia nada.
  const refErro = useTrazerPraVista<HTMLParagraphElement>(erro);
  const largura = useLarguraDeFolha(520);

  const selecionados = useMemo(() => itens.filter((i) => marcados[i.id]), [itens, marcados]);
  const totalEtiquetas = selecionados.reduce((s, i) => s + qtdDe(i, qtds), 0);
  const excedentes = selecionados.filter((i) => qtdDe(i, qtds) > 2000).length;
  const todosMarcados = selecionados.length === itens.length && itens.length > 0;

  // Prévia do SKU automático de quem ainda não tem: a numeração continua de
  // onde o catálogo parou, então dá pra conferir antes que não vai sair
  // "iJIFYU7" na etiqueta.
  const semSku = selecionados.filter((i) => !i.sku).length;
  const skuExemplo = useMemo(() => {
    const alvo = selecionados.find((i) => !i.sku);
    return alvo ? sugerirSku(alvo.hierarquia, itens.map((i) => i.sku ?? null)) : null;
  }, [selecionados, itens]);

  function alternarTodos() {
    setMarcados(todosMarcados ? {} : Object.fromEntries(itens.map((i) => [i.id, true])));
  }

  async function rodar() {
    if (!selecionados.length || rodando) return;
    setRodando(true); setErro(null); setFeitos(0);
    const acumulado: Resultado[] = [];
    try {
      for (let i = 0; i < selecionados.length; i += BLOCO) {
        const bloco = selecionados.slice(i, i + BLOCO);
        const r = await fetch("/api/estoque/unidades/preparar", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itens: bloco.map((it) => ({ item_id: it.id, quantidade: qtdDe(it, qtds) })) }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setErro(String(d.detalhe ?? "Não foi possível etiquetar. Nada além do que já apareceu foi alterado."));
          break;
        }
        acumulado.push(...((d.resultados ?? []) as Resultado[]));
        setFeitos(Math.min(i + BLOCO, selecionados.length));
      }
    } catch {
      setErro("A conexão caiu no meio. O que já foi etiquetado continua etiquetado.");
    } finally {
      setResultados(acumulado);
      setRodando(false);
      onPronto(); // a lista de fora reflete o que deu certo, mesmo com falha parcial
    }
  }

  const falhas = (resultados ?? []).filter((r) => !r.ok);
  const oks = (resultados ?? []).filter((r) => r.ok);

  return (
    <PainelLateral
      titulo="Etiquetar em lote"
      subtitulo={resultados ? "resultado" : `${itens.length} ${rotuloHierarquia.toLowerCase()} sem etiqueta na tela`}
      largura={largura}
      onFechar={() => { if (!rodando) onFechar(); }}
      rodape={
        resultados ? (
          <Acoes>
            <Botao variante="primario" onClick={onFechar}>Fechar</Botao>
          </Acoes>
        ) : (
          <Acoes>
            <Botao variante="sutil" onClick={onFechar} disabled={rodando}>Cancelar</Botao>
            <Botao variante="primario" icone="tag" onClick={rodar} disabled={!selecionados.length} carregando={rodando}>
              {rodando
                ? `Etiquetando ${feitos}/${selecionados.length}`
                : `Etiquetar ${selecionados.length} ${selecionados.length === 1 ? "item" : "itens"}`}
            </Botao>
          </Acoes>
        )
      }
    >
      {resultados ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13.5, margin: 0 }}>
            <strong>{oks.length} {oks.length === 1 ? "item" : "itens"}</strong> {oks.length === 1 ? "passou" : "passaram"} a ser
            contado{oks.length === 1 ? "" : "s"} por etiqueta, com <strong>{oks.reduce((s, r) => s + r.geradas, 0)}</strong> etiqueta(s) geradas.
          </p>
          {falhas.length > 0 && (
            <Alerta tom="perigo" titulo={<>{falhas.length} não passou:</>}>
              {falhas.map((f) => (
                <span key={f.item_id} style={{ display: "block", marginTop: 4 }}>
                  <strong style={{ color: "var(--text)" }}>{f.nome}</strong> — {f.erro}
                </span>
              ))}
            </Alerta>
          )}
          {/* Um `ref` só nos dois lugares: eles são ramos EXCLUSIVOS do mesmo
              ternário (resultado × lista), então nunca existem ao mesmo tempo. */}
          {erro && <p ref={refErro} role="alert" style={{ fontSize: 12.5, color: "var(--perigo)", margin: 0 }}>{erro}</p>}
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0 }}>
            As etiquetas já existem no sistema. Imprima pela ficha de cada item, em “Unidades etiquetadas”.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>
            Cada item marcado passa a ser contado pelas etiquetas, e nasce com uma etiqueta
            por unidade que já está na prateleira. A quantidade vem do estoque atual — mude
            se for contar diferente.
          </p>
          {/* Lista VAZIA tem de dizer que está vazia. Sem isto o painel abria
              com "Marcar todos (0)", nenhuma linha embaixo e um "Etiquetar 0
              itens" apagado no rodapé — três controles mortos e nenhuma frase.
              Acontece de verdade: a lista de fora recarrega enquanto o painel
              está aberto (outra pessoa etiquetou, ou o filtro mudou). */}
          {itens.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
              Nenhum item sem etiqueta nesta tela — ou todos já são contados por etiqueta, ou o
              filtro de cima não deixou nenhum. Feche, ajuste o filtro e abra de novo.
            </p>
          ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Botao tamanho="sm" variante="sutil" icone={todosMarcados ? "square" : "checks"} onClick={alternarTodos}>
              {todosMarcados ? "Desmarcar todos" : `Marcar todos (${itens.length})`}
            </Botao>
            <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
              {selecionados.length} marcado{selecionados.length === 1 ? "" : "s"} · {totalEtiquetas} etiqueta{totalEtiquetas === 1 ? "" : "s"}
            </span>
          </div>
          )}
          {/* O servidor recusa acima de 2000 por item (a essa altura o item é a
              granel na prática). Avisar antes evita rodar o lote pra descobrir
              no relatório de falhas. */}
          {excedentes > 0 && (
            <p style={{ fontSize: 11.5, color: "var(--atencao)", margin: 0 }}>
              {excedentes} {excedentes === 1 ? "item passa" : "itens passam"} de 2000 etiquetas e {excedentes === 1 ? "será recusado" : "serão recusados"} —
              item contado aos milhares costuma ser a granel, e a quantidade digitada serve melhor.
            </p>
          )}
          {semSku > 0 && skuExemplo && (
            <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0 }}>
              <Icon name="info-circle" size={12} color="var(--text-dim)" /> {semSku} sem SKU: o sistema dá o próximo
              livre da hierarquia ({skuExemplo}, {skuExemplo.replace(/(\d+)$/, (n) => String(Number(n) + 1).padStart(n.length, "0"))}…).
            </p>
          )}
          {/* Sem rolagem própria: o painel já rola, e o rodapé com o botão
              principal é fixo. Duas áreas roláveis empilhadas no celular é o
              tipo de coisa que faz o dedo mover a errada. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {itens.map((i) => (
              <Linha key={i.id} item={i} marcado={!!marcados[i.id]} qtd={qtdTexto(i, qtds)}
                onMarcar={(v) => setMarcados((m) => ({ ...m, [i.id]: v }))}
                onQtd={(v) => setQtds((q) => ({ ...q, [i.id]: v }))} />
            ))}
          </div>
          {/* Um `ref` só nos dois lugares: eles são ramos EXCLUSIVOS do mesmo
              ternário (resultado × lista), então nunca existem ao mesmo tempo. */}
          {erro && <p ref={refErro} role="alert" style={{ fontSize: 12.5, color: "var(--perigo)", margin: 0 }}>{erro}</p>}
        </div>
      )}
    </PainelLateral>
  );
}

function qtdTexto(item: Item, qtds: Record<string, string>): string {
  return qtds[item.id] ?? String(Math.max(0, Math.trunc(item.quantidade || 0)));
}
function qtdDe(item: Item, qtds: Record<string, string>): number {
  return Math.max(0, Math.trunc(Number(qtdTexto(item, qtds)) || 0));
}

function Linha({ item, marcado, qtd, onMarcar, onQtd }: {
  item: Item; marcado: boolean; qtd: string;
  onMarcar: (v: boolean) => void; onQtd: (v: string) => void;
}) {
  return (
    // A linha é <div>, não <label>: um <label> em volta da caixinha E do campo
    // de quantidade faz o clique no campo ativar o primeiro controle rotulável
    // — a pessoa ia digitar 12 e desmarcaria o item. O <label> abraça só a
    // caixinha e o nome; a quantidade fica de fora.
    // flexWrap + base de 150px no nome: a 320px a quantidade cai numa segunda
    // linha em vez de espremer o nome do item até sumir.
    // `flex: none`: dentro de uma coluna flex a linha encolheria (o padrão é
    // `shrink: 1`) e o segundo texto sairia cortado pela metade — foi o que
    // acontecia com "3 un em estoque".
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: "none", minHeight: "var(--tap)", padding: "8px 10px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: marcado ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--surface)" }}>
      {/* `1 0 180px`: com `1 1 150px` o bloco ENCOLHIA abaixo da base pra caber
          ao lado da quantidade, e a quebra que o comentário acima promete nunca
          acontecia a 320px — o nome ficava com ~148px e virava "Carimbo de
          bolso…". Sem shrink e com base de 180px a segunda linha acontece de
          verdade no celular, e no painel de 380px os dois seguem lado a lado. */}
      <label style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 0 180px", minWidth: 0, minHeight: "var(--tap)", cursor: "pointer" }}>
        <Caixa marcado={marcado} onChange={(marc) => onMarcar(marc)} />
        <span style={{ minWidth: 0 }}>
          {/* Duas linhas: é o nome que diz em qual item as etiquetas vão ser
              impressas — cortado, a conferência é impossível. */}
          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", fontSize: 13.5, fontWeight: 700, lineHeight: 1.3, overflowWrap: "break-word", overflow: "hidden" }}>{item.nome}</span>
          <span style={{ display: "block", fontSize: 11, color: "var(--text-dim)" }}>
            {item.sku ? item.sku : "sem SKU"} · {item.quantidade} {item.unidade} em estoque
          </span>
        </span>
      </label>
      <span style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
        <input type="number" min={0} max={2000} value={qtd} disabled={!marcado}
          onChange={(e) => onQtd(e.target.value)}
          aria-label={`Etiquetas de ${item.nome}`}
          style={{ width: 76, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--r-xs)", padding: "8px 8px", color: "var(--text)", fontSize: 13, textAlign: "center", opacity: marcado ? 1 : 0.5 }} />
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>etiq.</span>
      </span>
    </div>
  );
}
