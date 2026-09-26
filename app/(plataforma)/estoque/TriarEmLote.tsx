"use client";

// ── Classificar vários itens de uma vez ──────────────────────────────────────
//
// Item sem hierarquia não aparece em nenhuma das oito abas do catálogo: está no
// banco e não existe na tela. A planilha do galpão entra com 81 assim ("deixa
// sem categoria por enquanto que eu vou adicionando depois"), e classificar um
// a um custa abrir o card, escolher, salvar e fechar — vezes 81. Esse custo é
// exatamente o que faz ninguém classificar, e aí os 81 ficam invisíveis pra
// sempre.
//
// Aqui são: marcar, escolher UMA hierarquia, e um pedido por bloco. Segue o
// mesmo desenho do EtiquetarEmLote (painel lateral, marcar todos, progresso,
// resultado) porque é a mesma tarefa vista de outro ângulo — duas gramáticas
// diferentes de "ação em lote" na mesma tela seriam duas coisas pra aprender.

import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { Acoes, Botao, PainelLateral, Caixa } from "../ui/controles";
import { useLarguraDeFolha, useTrazerPraVista } from "./painel-visivel";
import { HIERARQUIA_DEFS, hierarquiaLabel } from "@/lib/estoque-hierarquia";
import { sugestoesDeCategoria } from "@/lib/estoque-categoria";
import type { Item } from "./tipos";

/** Ids por chamada — o mesmo teto da rota. Fatiar dá progresso e evita um
 *  pedido gigante que o navegador pode cortar no meio. */
const BLOCO = 100;

export function TriarEmLote({ itens, categoriasEmUso, onFechar, onPronto }: {
  /** Os itens SEM hierarquia que estão na tela agora. */
  itens: Item[];
  /** Categorias que o catálogo inteiro já usa — viram sugestão junto dos
   *  grupos do galpão. */
  categoriasEmUso: string[];
  onFechar: () => void;
  /** Alguma coisa mudou no banco — a lista de fora precisa recarregar. */
  onPronto: () => void;
}) {
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [hierarquia, setHierarquia] = useState("");
  const [categoria, setCategoria] = useState("");
  const [rodando, setRodando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [pronto, setPronto] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Mesma armadilha do EtiquetarEmLote: a faixa de erro fica DEPOIS da lista de
  // itens (81 linhas, no caso que motivou a tela) e o botão está no rodapé fixo.
  const refErro = useTrazerPraVista<HTMLParagraphElement>(erro);
  const largura = useLarguraDeFolha(520);

  const selecionados = useMemo(() => itens.filter((i) => marcados[i.id]), [itens, marcados]);
  const todosMarcados = selecionados.length === itens.length && itens.length > 0;
  const sugestoes = useMemo(() => sugestoesDeCategoria(categoriasEmUso), [categoriasEmUso]);

  function alternarTodos() {
    setMarcados(todosMarcados ? {} : Object.fromEntries(itens.map((i) => [i.id, true])));
  }

  async function rodar() {
    if (!selecionados.length || !hierarquia || rodando) return;
    setRodando(true); setErro(null); setFeitos(0);
    let total = 0;
    try {
      for (let i = 0; i < selecionados.length; i += BLOCO) {
        const bloco = selecionados.slice(i, i + BLOCO);
        const r = await fetch("/api/estoque-itens/classificar", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: bloco.map((it) => it.id),
            hierarquia,
            // Campo vazio = não encosta na categoria de quem já tem uma. É o
            // pedido do dono: a hierarquia sai do buraco agora, a categoria ele
            // vai completando depois.
            ...(categoria.trim() ? { categoria: categoria.trim() } : {}),
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setErro(String(d.detalhe ?? "Não foi possível classificar. O que já passou continua classificado."));
          break;
        }
        total += Number(d.atualizados ?? bloco.length) || 0;
        setFeitos(Math.min(i + BLOCO, selecionados.length));
      }
    } catch {
      setErro("A conexão caiu no meio. O que já foi classificado continua classificado.");
    } finally {
      setPronto(total);
      setRodando(false);
      onPronto(); // a lista de fora reflete o que deu certo, mesmo com falha parcial
    }
  }

  return (
    <PainelLateral
      titulo="Classificar em lote"
      subtitulo={pronto !== null ? "resultado" : `${itens.length} ${itens.length === 1 ? "item sem hierarquia" : "itens sem hierarquia"} na tela`}
      largura={largura}
      onFechar={() => { if (!rodando) onFechar(); }}
      rodape={
        pronto !== null ? (
          <Acoes>
            <Botao variante="primario" onClick={onFechar}>Fechar</Botao>
          </Acoes>
        ) : (
          <Acoes>
            <Botao variante="sutil" onClick={onFechar} disabled={rodando}>Cancelar</Botao>
            <Botao variante="primario" icone="checks" onClick={rodar}
              disabled={!selecionados.length || !hierarquia} carregando={rodando}>
              {rodando
                ? `Classificando ${feitos}/${selecionados.length}`
                : `Classificar ${selecionados.length} ${selecionados.length === 1 ? "item" : "itens"}`}
            </Botao>
          </Acoes>
        )
      }
    >
      {pronto !== null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13.5, margin: 0 }}>
            <strong>{pronto} {pronto === 1 ? "item" : "itens"}</strong> {pronto === 1 ? "passou" : "passaram"} a ser
            {" "}<strong>{hierarquiaLabel(hierarquia).toLowerCase()}</strong>
            {categoria.trim() ? <> na categoria <strong>{categoria.trim()}</strong></> : null}.
          </p>
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0 }}>
            Eles já aparecem na aba {hierarquiaLabel(hierarquia)} do catálogo.
          </p>
          {/* Um `ref` só nos dois lugares: são ramos EXCLUSIVOS do mesmo
              ternário (resultado × formulário), nunca coexistem. */}
          {erro && <p ref={refErro} role="alert" style={{ fontSize: 12.5, color: "var(--perigo)", margin: 0 }}>{erro}</p>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <DoisEixos />

          {/* ── 1. Hierarquia (obrigatória) ──────────────────────────────── */}
          {/* `<div>` e não `<label>`: rótulo em volta de grupo de botões
              dispara o PRIMEIRO deles no clique — a pessoa tocaria no texto
              "Hierarquia" e classificaria tudo como Matéria-Prima calada. */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>1. Hierarquia — do que é feito</div>
            <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "3px 0 7px" }}>
              Vale pros itens marcados. É ela que manda na ficha técnica e no prefixo do SKU.
            </p>
            {/* Grade e não fileira que embrulha, pelo mesmo motivo do ItemEditor:
                com `flex: 1 1 120px` cada botão saía com uma largura, e os dois
                rótulos longos quebravam em duas linhas ficando mais altos que os
                vizinhos. `1fr` iguala a largura e a linha do grid iguala a
                altura. `minmax(min(100%, …))` mantém o colapso a 320px. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 124px), 1fr))", gap: 6 }}>
              {HIERARQUIA_DEFS.map((h) => {
                const on = hierarquia === h.key;
                return (
                  <button key={h.key} type="button" aria-pressed={on} onClick={() => setHierarquia(h.key)}
                    style={{ minHeight: "var(--tap)", padding: "8px 7px", borderRadius: "var(--r-xs)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center", lineHeight: 1.25,
                      border: `1.5px solid ${on ? "var(--primary)" : "var(--border)"}`,
                      background: on ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
                      color: on ? "var(--primary-texto)" : "var(--text)" }}>
                    {/* `flex: none` no ícone: sem isso ele é o primeiro a
                        encolher quando o rótulo quebra em duas linhas
                        ("Matéria-Prima Processada" a 320px) e some, deixando
                        dois botões vizinhos com e sem ícone. */}
                    <Icon name={h.icon} size={14} color="currentColor" style={{ flex: "none" }} /> {h.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 2. Categoria (opcional) ──────────────────────────────────── */}
          <div>
            <label htmlFor="triar-categoria" style={{ fontSize: 12, fontWeight: 800 }}>2. Categoria — pra que serve <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>(opcional)</span></label>
            <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "3px 0 7px" }}>
              Texto livre, sem regra nenhuma. Vazio = não mexe na categoria de quem já tem uma.
            </p>
            <input id="triar-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}
              placeholder="ex.: Máquinas"
              style={{ width: "100%", minHeight: "var(--tap)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 12px", color: "var(--text)", fontSize: 14 }} />
            {/* `overflowX: auto` no INVÓLUCRO, e não só na `.tab-strip`: a faixa
                da fundação só vira rolável até 900px (globals.css:1914). Acima
                disso ela continua `inline-flex` com `overflow: visible`, e o
                que não cabe é PINTADO FORA da caixa — aqui, fora do painel.
                Medido a 1280 com as cinco sugestões: faixa de 483px com 666px
                de conteúdo, a última pílula terminando 183px além da borda da
                faixa e sendo cortada pelo `.ui-side-corpo` 18px depois: duas
                sugestões invisíveis e sem clique, e a página não rola, então
                nenhuma varredura de `scrollWidth` da PÁGINA acusava.
                Sem `transform` nem `mask-image` no invólucro (ver CLAUDE.md). */}
            <div style={{ marginTop: 7, overflowX: "auto" }}>
            <div className="tab-strip" style={{ display: "flex", gap: 6, padding: 0 }}>
              {sugestoes.map((s) => {
                const on = categoria.trim().toLocaleLowerCase("pt-BR") === s.toLocaleLowerCase("pt-BR");
                return (
                  <button key={s} type="button" aria-pressed={on} onClick={() => setCategoria(on ? "" : s)}
                    // Sem `minHeight` inline: estilo inline VENCE a folha, e o
                    // piso de 44px do celular (globals.css) morreria calado —
                    // medido, dava 32px de alvo.
                    style={{ flex: "none", fontSize: 12, padding: "6px 12px", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer", whiteSpace: "nowrap",
                      background: on ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface)",
                      color: on ? "var(--primary-texto)" : "var(--text)" }}>{s}</button>
                );
              })}
            </div>
            </div>
          </div>

          {/* ── 3. Quem entra ────────────────────────────────────────────── */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 800, flex: "1 1 140px" }}>3. Itens</span>
              {/* "Marcar todos (0)" é botão morto. Some junto com a lista. */}
              {itens.length > 0 && (
                <Botao tamanho="sm" variante="sutil" icone={todosMarcados ? "square" : "checks"} onClick={alternarTodos}>
                  {todosMarcados ? "Desmarcar todos" : `Marcar todos (${itens.length})`}
                </Botao>
              )}
            </div>
            {/* Lista VAZIA tem de dizer que está vazia. Sem isto o passo 3 abria
                com "Marcar todos (0)", zero linhas e um "Classificar 0 itens"
                apagado no rodapé — nenhuma palavra explicando. Acontece de
                verdade: a lista de fora recarrega enquanto o painel está aberto
                (outra pessoa classificou, ou o filtro mudou). */}
            {itens.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
                Nenhum item sem hierarquia nesta tela — ou todos já foram classificados, ou o
                filtro de cima não deixou nenhum. Feche, ajuste o filtro e abra de novo.
              </p>
            ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {itens.map((i) => (
                <Linha key={i.id} item={i} marcado={!!marcados[i.id]}
                  onMarcar={(v) => setMarcados((m) => ({ ...m, [i.id]: v }))} />
              ))}
            </div>
            )}
          </div>
          {/* Um `ref` só nos dois lugares: são ramos EXCLUSIVOS do mesmo
              ternário (resultado × formulário), nunca coexistem. */}
          {erro && <p ref={refErro} role="alert" style={{ fontSize: 12.5, color: "var(--perigo)", margin: 0 }}>{erro}</p>}
        </div>
      )}
    </PainelLateral>
  );
}

/** Os dois eixos, lado a lado, pra quem nunca viu esta tela. Sem isto a pessoa
 *  acha que está escolhendo a mesma coisa duas vezes e deixa um dos dois vazio. */
export function DoisEixos({ compacto }: { compacto?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 8 }}>
      <div style={{ padding: "9px 11px", borderRadius: "var(--r-sm)", background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800 }}>
          <Icon name="stack-2" size={14} color="var(--text-dim)" /> Hierarquia
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "3px 0 0", lineHeight: 1.45 }}>
          <strong style={{ color: "var(--text)" }}>Do que o item é feito.</strong> Oito valores fixos; manda nas regras
          de composição{compacto ? "" : " — peça é feita de componente, não de produto"}.
        </p>
      </div>
      <div style={{ padding: "9px 11px", borderRadius: "var(--r-sm)", background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800 }}>
          <Icon name="tag" size={14} color="var(--text-dim)" /> Categoria
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "3px 0 0", lineHeight: 1.45 }}>
          <strong style={{ color: "var(--text)" }}>Pra que serve, de quem é.</strong> Texto livre, agrupa a lista
          {compacto ? "" : " — o mesmo componente pode ser “Máquinas” ou “Logística”"}.
        </p>
      </div>
    </div>
  );
}

function Linha({ item, marcado, onMarcar }: { item: Item; marcado: boolean; onMarcar: (v: boolean) => void }) {
  return (
    // Aqui o <label> pode abraçar a linha inteira: não há segundo controle
    // dentro dela (ver o comentário oposto no EtiquetarEmLote, que tem campo
    // de quantidade).
    <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", padding: "8px 10px", borderRadius: "var(--r-sm)", cursor: "pointer",
      border: "1px solid var(--border)", background: marcado ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--surface)" }}>
      <Caixa marcado={marcado} onChange={(marc) => onMarcar(marc)} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", fontSize: 13.5, fontWeight: 700, lineHeight: 1.3, overflowWrap: "break-word", overflow: "hidden" }}>{item.nome}</span>
        <span style={{ display: "block", fontSize: 11, color: "var(--text-dim)" }}>
          {item.categoria ? item.categoria : "sem categoria"} · {item.quantidade} {item.unidade}
        </span>
      </span>
    </label>
  );
}
