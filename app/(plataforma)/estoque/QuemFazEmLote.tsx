"use client";

// ── Quem faz, em lote ────────────────────────────────────────────────────────
//
// "Quem faz esta peça" decide pra quem a ordem pode cair no tablet (Máquinas,
// Produção ou Preparo). Marcar um por um custa abrir o card, rolar até a seção
// de produção, escolher, salvar e fechar — vezes as 17 peças de almofada,
// as pinças, a trava… Esse custo é o que deixa o campo vazio, e com ele vazio
// a faixa é adivinhada pela categoria: "Almofadas" vira produção e a peça de
// máquina cai pro montador. Aqui é filtrar o catálogo, marcar, escolher UMA
// opção e um pedido por bloco.
//
// Mesmo desenho do TriarEmLote e do EtiquetarEmLote (painel lateral, marcar
// todos, progresso, resultado): duas gramáticas de "ação em lote" na mesma
// tela seriam duas coisas pra aprender.

import { useMemo, useState } from "react";
import { Acoes, Botao, PainelLateral, Caixa } from "../ui/controles";
import { useLarguraDeFolha, useTrazerPraVista } from "./painel-visivel";
import { QUEM_FAZ, AJUDA_AUTOMATICO, faixaDoSetorResponsavel } from "@/lib/atividade-faixa";
import type { Item } from "./tipos";

/** Ids por chamada — a rota aceita até 200; fatiar dá progresso. */
const BLOCO = 100;

type Escolha = "maquinas" | "producao" | "preparo" | "auto";

const rotuloDaFaixa = (setor: string | null | undefined): string => {
  const f = faixaDoSetorResponsavel(setor);
  return f ? (QUEM_FAZ.find((o) => o.faixa === f)?.rotulo ?? "Produção") : "automático";
};

export function QuemFazEmLote({ itens, onFechar, onPronto }: {
  /** Os itens na tela agora (o filtro de fora já escolheu quais). */
  itens: Item[];
  onFechar: () => void;
  /** Alguma coisa mudou no banco — a lista de fora precisa recarregar. */
  onPronto: () => void;
}) {
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [rodando, setRodando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [pronto, setPronto] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const refErro = useTrazerPraVista<HTMLParagraphElement>(erro);
  const largura = useLarguraDeFolha(520);

  const selecionados = useMemo(() => itens.filter((i) => marcados[i.id]), [itens, marcados]);
  const todosMarcados = selecionados.length === itens.length && itens.length > 0;
  const rotuloEscolha = escolha === "auto" ? "Automático" : QUEM_FAZ.find((o) => o.faixa === escolha)?.rotulo ?? "";

  function alternarTodos() {
    setMarcados(todosMarcados ? {} : Object.fromEntries(itens.map((i) => [i.id, true])));
  }

  async function rodar() {
    if (!selecionados.length || !escolha || rodando) return;
    setRodando(true); setErro(null); setFeitos(0);
    const valor = escolha === "auto" ? null : QUEM_FAZ.find((o) => o.faixa === escolha)?.valor ?? null;
    let total = 0;
    try {
      for (let i = 0; i < selecionados.length; i += BLOCO) {
        const bloco = selecionados.slice(i, i + BLOCO);
        const r = await fetch("/api/estoque-itens/classificar", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: bloco.map((it) => it.id), setor_responsavel: valor }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setErro(String(d.detalhe ?? "Não foi possível gravar. O que já passou continua gravado."));
          break;
        }
        total += Number(d.atualizados ?? bloco.length) || 0;
        setFeitos(Math.min(i + BLOCO, selecionados.length));
      }
    } catch {
      setErro("A conexão caiu no meio. O que já foi gravado continua gravado.");
    } finally {
      setPronto(total);
      setRodando(false);
      onPronto();
    }
  }

  const chip = (on: boolean): React.CSSProperties => ({
    minHeight: "var(--tap)", padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    border: on ? "1px solid var(--primary-acao, var(--primary))" : "1px solid var(--border)",
    background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)",
    color: on ? "var(--on-primary, #fff)" : "var(--text)",
  });

  return (
    <PainelLateral
      titulo="Quem faz, em lote"
      subtitulo={pronto !== null ? "resultado" : `${itens.length} ${itens.length === 1 ? "item" : "itens"} na tela`}
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
              disabled={!selecionados.length || !escolha} carregando={rodando}>
              {rodando
                ? `Gravando ${feitos}/${selecionados.length}`
                : `Gravar ${selecionados.length} ${selecionados.length === 1 ? "item" : "itens"}`}
            </Botao>
          </Acoes>
        )
      }
    >
      {pronto !== null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13.5, margin: 0 }}>
            <strong>{pronto} {pronto === 1 ? "item" : "itens"}</strong> {pronto === 1 ? "passou" : "passaram"} a ser feitos por{" "}
            <strong>{rotuloEscolha.toLowerCase()}</strong>.
          </p>
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0 }}>
            Vale já pras ordens que estão na fila: a que estava chamando a pessoa errada no tablet voltou pro pool.
          </p>
          {erro && <p ref={refErro} role="alert" style={{ fontSize: 12.5, color: "var(--perigo)", margin: 0 }}>{erro}</p>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ── 1. Quem faz ──────────────────────────────────────────────── */}
          {/* `<div>` e não `<label>`: rótulo em volta de grupo de botões
              dispara o primeiro deles no clique. */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>1. Quem faz</div>
            <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "3px 0 7px" }}>
              Só quem tem essa especialidade recebe a ordem no tablet.
            </p>
            <div role="group" aria-label="Quem faz" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {QUEM_FAZ.map((o) => (
                <button key={o.faixa} type="button" aria-pressed={escolha === o.faixa}
                  onClick={() => setEscolha(o.faixa)} style={chip(escolha === o.faixa)}>{o.rotulo}</button>
              ))}
              <button type="button" aria-pressed={escolha === "auto"} onClick={() => setEscolha("auto")} style={chip(escolha === "auto")}>
                Automático
              </button>
            </div>
            {escolha && (
              <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "7px 0 0" }}>
                {escolha === "auto" ? AJUDA_AUTOMATICO : QUEM_FAZ.find((o) => o.faixa === escolha)?.ajuda}
              </p>
            )}
          </div>

          {/* ── 2. Itens ─────────────────────────────────────────────────── */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 800, flex: "1 1 140px" }}>2. Itens</span>
              {itens.length > 0 && (
                <Botao tamanho="sm" variante="sutil" icone={todosMarcados ? "square" : "checks"} onClick={alternarTodos}>
                  {todosMarcados ? "Desmarcar todos" : `Marcar todos (${itens.length})`}
                </Botao>
              )}
            </div>
            {itens.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
                Nenhum item nesta tela. Feche, ajuste o filtro (ex.: busque “almofada”) e abra de novo.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {itens.map((i) => (
                  // Aqui o <label> pode abraçar a linha inteira: não há segundo
                  // controle dentro dela.
                  <label key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", padding: "8px 10px", borderRadius: "var(--r-sm)", cursor: "pointer",
                    border: "1px solid var(--border)", background: marcados[i.id] ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--surface)" }}>
                    <Caixa marcado={!!marcados[i.id]} onChange={(marc) => setMarcados((m) => ({ ...m, [i.id]: marc }))} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", fontSize: 13.5, fontWeight: 700, lineHeight: 1.3, overflowWrap: "break-word", overflow: "hidden" }}>{i.nome}</span>
                      <span style={{ display: "block", fontSize: 11, color: "var(--text-dim)" }}>
                        {i.categoria || "sem categoria"} · hoje: {rotuloDaFaixa(i.setor_responsavel)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {erro && <p ref={refErro} role="alert" style={{ fontSize: 12.5, color: "var(--perigo)", margin: 0 }}>{erro}</p>}
        </div>
      )}
    </PainelLateral>
  );
}
