"use client";

// Peças por atividade — o que cada tarefa CONSOME e quem produz cada peça.
//
// Alimenta os botões de justificativa do tablet ao devolver uma ordem. Sem isto
// o único motivo possível era "Falta material", que não diz QUAL peça faltou e
// não faz ninguém produzi-la: a próxima pessoa a pegar a ordem trava no mesmo
// ponto. Com a peça nomeada, o servidor despacha quem a fabrica.
//
// A semente vem do código (lib/atividades-pecas.ts), tirada da própria cadeia de
// fases das receitas. O que for salvo aqui SUBSTITUI a semente daquela tarefa —
// inteira, não peça a peça (senão remover uma peça a faria reaparecer).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { toast } from "../Toast";
import { Botao, BotaoIcone } from "../ui/controles";
import { TrocaIcone } from "../ui/micro";

interface Peca { peca: string; produz?: string | null; categoria?: string | null }
interface Item { tarefa: string; origem: "banco" | "padrao"; pecas: Peca[] }

export function PecasModal({ tarefasConhecidas, onFechar }: { tarefasConhecidas: string[]; onFechar: () => void }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [temTabela, setTemTabela] = useState(true);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Peca[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { (async () => {
    try {
      const r = await fetch("/api/atividades-pecas", { cache: "no-store" });
      const d = await r.json();
      setItens(d.itens ?? []);
      setTemTabela(d.temTabela !== false);
    } catch { /* mostra vazio */ } finally { setCarregando(false); }
  })(); }, []);

  // Tarefas SEM peça nenhuma também precisam aparecer: é justamente onde falta
  // configurar. A API só devolve as que já têm, então junto com o catálogo.
  const mapa = new Map(itens.map((i) => [i.tarefa, i]));
  for (const t of tarefasConhecidas) if (!mapa.has(t)) mapa.set(t, { tarefa: t, origem: "padrao", pecas: [] });
  const lista = [...mapa.values()]
    .filter((i) => !busca.trim() || i.tarefa.toLowerCase().includes(busca.trim().toLowerCase()))
    .sort((a, b) => a.tarefa.localeCompare(b.tarefa, "pt-BR"));

  function abrir(i: Item) {
    setAberta(i.tarefa);
    setRascunho(i.pecas.length ? i.pecas.map((p) => ({ ...p })) : [{ peca: "", produz: "" }]);
  }

  async function salvar(tarefa: string) {
    setSalvando(true);
    try {
      const pecas = rascunho.filter((p) => p.peca.trim());
      const r = await fetch("/api/atividades-pecas", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tarefa, pecas }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.erro(d.error === "sem_tabela" || d.error === "failed"
          ? "Falta rodar supabase/atividades_pecas.sql no Supabase."
          : "Não salvou. Tente de novo.");
        return;
      }
      setItens((xs) => {
        const outros = xs.filter((x) => x.tarefa !== tarefa);
        return [...outros, { tarefa, origem: "banco", pecas }];
      });
      setAberta(null);
      toast.ok(pecas.length ? `${pecas.length} peça(s) salvas em "${tarefa}".` : `"${tarefa}" agora não depende de peça nenhuma.`);
    } finally { setSalvando(false); }
  }

  const inp: React.CSSProperties = {
    background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9,
    padding: "9px 10px", color: "var(--text)", fontSize: 13, fontWeight: 600,
    minHeight: "var(--tap)", width: "100%", boxSizing: "border-box",
  };

  return createPortal(
    <div onClick={onFechar} className="sheet-host" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1001, padding: "48px 24px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 680, maxHeight: "88dvh", overflowY: "auto", borderRadius: 18, padding: 22, background: "var(--bg)", border: "1px solid var(--border)", boxShadow: "0 24px 70px rgba(0,0,0,.55)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--text)" }}>Peças por atividade</h3>
          <BotaoIcone icone="x" titulo="Fechar" onClick={onFechar} />
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "0 0 14px" }}>
          O que cada tarefa consome. Vira o botão de justificativa no tablet: ao devolver por falta de uma peça, o sistema pede a ordem que a produz.
        </p>

        {!temTabela && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: 11, marginBottom: 14, border: "1px solid color-mix(in srgb, var(--warning, var(--atencao)) 45%, transparent)", background: "color-mix(in srgb, var(--warning, var(--atencao)) 12%, transparent)" }}>
            <Icon name="alert-triangle" size={15} color="var(--warning, var(--atencao))" />
            <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text)" }}>
              Falta rodar <b>supabase/atividades_pecas.sql</b>. Até lá vale só a lista padrão do código e o que você salvar aqui não grava.
            </span>
          </div>
        )}

        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar atividade..." style={{ ...inp, marginBottom: 14 }} />

        {carregando ? (
          <div style={{ fontSize: 13, color: "var(--text-dim)", padding: "8px 2px" }}>Carregando...</div>
        ) : lista.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-dim)", padding: "8px 2px" }}>Nenhuma atividade com esse nome.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lista.map((i) => {
              const editando = aberta === i.tarefa;
              return (
                <div key={i.tarefa} style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", overflow: "hidden" }}>
                  <button onClick={() => (editando ? setAberta(null) : abrir(i))}
                    style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", minHeight: "var(--tap)", background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{i.tarefa}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 1 }}>
                        {i.pecas.length === 0 ? "Sem peças" : i.pecas.map((p) => p.peca).join(" · ")}
                      </div>
                    </div>
                    {i.origem === "banco" && (
                      <span title="Configurada por você" style={{ flex: "none", fontSize: 10, fontWeight: 800, padding: "3px 7px", borderRadius: 999, color: "var(--primary-texto, var(--primary))", background: "color-mix(in srgb, var(--primary) 14%, transparent)" }}>SUA</span>
                    )}
                    <TrocaIcone ligado={editando} a="chevron-right" b="chevron-down" size={16} corA="var(--text-dim)" corB="var(--text-dim)" />
                  </button>

                  {editando && (
                    <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {rascunho.map((p, idx) => (
                        // Uma coluna no celular: dois campos lado a lado a 320px
                        // dariam ~130px cada e o nome da tarefa não caberia.
                        <div key={idx} style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 200px), 1fr) minmax(min(100%, 200px), 1fr) auto", gap: 8, alignItems: "center" }}>
                          <input value={p.peca} placeholder="Peça que pode faltar"
                            onChange={(e) => setRascunho((xs) => xs.map((x, k) => (k === idx ? { ...x, peca: e.target.value } : x)))}
                            style={inp} />
                          <input value={p.produz ?? ""} placeholder="Atividade que produz (vazio = compra)"
                            onChange={(e) => setRascunho((xs) => xs.map((x, k) => (k === idx ? { ...x, produz: e.target.value } : x)))}
                            list="pecas-tarefas" style={inp} />
                          <BotaoIcone icone="trash" titulo="Remover peça" variante="secundario" onClick={() => setRascunho((xs) => xs.filter((_, k) => k !== idx))} />
                        </div>
                      ))}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
                        <Botao icone="plus" onClick={() => setRascunho((xs) => [...xs, { peca: "", produz: "" }])}>Adicionar peça</Botao>
                        <span style={{ flex: 1 }} />
                        <Botao variante="primario" disabled={salvando} onClick={() => salvar(i.tarefa)}>
                          {salvando ? "Salvando..." : "Salvar"}
                        </Botao>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Autocompletar do campo "produz" com as tarefas que o sistema conhece —
            digitar o nome errado ali cria uma ordem que ninguém reconhece. */}
        <datalist id="pecas-tarefas">
          {[...new Set([...tarefasConhecidas, ...itens.map((i) => i.tarefa)])].map((t) => <option key={t} value={t} />)}
        </datalist>
      </div>
    </div>,
    document.body,
  );
}
