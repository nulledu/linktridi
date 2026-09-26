"use client";

// ── TridiFlow · editor do funil de quiz ──────────────────────────────────────
// O editor de chat é um CANVAS (grafo, arestas, arrastar nós) porque o chat se
// ramifica. O quiz é uma FILA, então o editor dele é uma LISTA — reordenar é
// subir e descer, não puxar aresta. Três colunas: etapas | inspetor | prévia.
//
// O botão de importar/exportar JSON não é conveniência: o formato de troca é
// parte do que o funil promete (colar o JSON de um funil pronto e ele rodar), e
// exportar é o que torna a importação confiável — dá pra ver o que o
// interpretador entendeu.

import { useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { toast } from "../../Toast";
import { GlassSelect } from "../../GlassPicker";
import { QuizRuntime } from "@/app/f/QuizRuntime";
import type { Theme } from "@/lib/tridiflow";
import { Botao, BotaoIcone, Caixa } from "../../ui/controles";
import { Deslizante } from "../../ui/Deslizante";
import {
  QUIZ_TIPOS, ehPergunta, exportarQuiz, importarQuiz, novaEtapa, novoResultado, uidQuiz,
  type Quiz, type QuizOpcao, type QuizResultado, type QuizStep, type QuizStepTipo,
} from "@/lib/tridiflow-quiz";

export function QuizEditor({ quiz, onChange, theme, previewKey }: {
  quiz: Quiz;
  onChange: (q: Quiz) => void;
  theme: Theme;
  previewKey: number;
}) {
  const [selId, setSelId] = useState<string | null>(quiz.steps[0]?.id ?? null);
  const [addAberto, setAddAberto] = useState(false);
  const [json, setJson] = useState<null | "importar" | "exportar">(null);

  const sel = quiz.steps.find((s) => s.id === selId) ?? null;
  const iSel = quiz.steps.findIndex((s) => s.id === selId);

  const patch = (id: string, p: Partial<QuizStep>) =>
    onChange({ ...quiz, steps: quiz.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) });

  const setResultados = (resultados: QuizResultado[]) =>
    onChange({ ...quiz, resultados: resultados.length ? resultados : undefined });

  const adicionar = (tipo: QuizStepTipo) => {
    const nPerguntas = quiz.steps.filter(ehPergunta).length;
    const nova = novaEtapa(tipo, nPerguntas);
    // Entra ANTES da oferta: a oferta é o fim por definição, e uma pergunta
    // criada depois dela nunca seria vista.
    const iOferta = quiz.steps.findIndex((s) => s.tipo === "offer");
    const at = tipo === "offer" || iOferta < 0 ? quiz.steps.length : iOferta;
    const steps = [...quiz.steps.slice(0, at), nova, ...quiz.steps.slice(at)];
    onChange({ ...quiz, steps });
    setSelId(nova.id);
    setAddAberto(false);
  };

  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= quiz.steps.length) return;
    const steps = [...quiz.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    onChange({ ...quiz, steps });
  };

  const duplicar = (s: QuizStep) => {
    const copia: QuizStep = { ...s, id: uidQuiz(), opcoes: s.opcoes?.map((o) => ({ ...o, id: uidQuiz() })), variavel: s.variavel ? `${s.variavel}_2` : undefined };
    const i = quiz.steps.findIndex((x) => x.id === s.id);
    onChange({ ...quiz, steps: [...quiz.steps.slice(0, i + 1), copia, ...quiz.steps.slice(i + 1)] });
    setSelId(copia.id);
  };

  const remover = (id: string) => {
    const steps = quiz.steps.filter((s) => s.id !== id);
    onChange({ ...quiz, steps });
    if (selId === id) setSelId(steps[0]?.id ?? null);
  };

  return (
    <div className="qz-grid">
      {/* ── Coluna 1 · Etapas ─────────────────────────────────────────────── */}
      <div className="glass qz-col" style={{ borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", flex: 1 }}>Etapas</span>
          <BotaoIcone icone="code" titulo="Importar/exportar JSON" variante="secundario" tamanho="sm" onClick={() => setJson("importar")} />
        </div>

        <div className="qz-etapas">
          {quiz.steps.map((s, i) => {
            const meta = QUIZ_TIPOS.find((t) => t.id === s.tipo);
            const on = s.id === selId;
            return (
              <div key={s.id} className={`qz-item${on ? " qz-on" : ""}`} onClick={() => setSelId(s.id)}>
                <span className="qz-num">{String(i + 1).padStart(2, "0")}</span>
                <Icon name={meta?.icone ?? "square"} size={15} color={on ? "var(--primary-texto)" : "var(--text-dim)"} />
                <span className="qz-item-txt">
                  <span className="qz-item-tit">{tituloDaEtapa(s)}</span>
                  <span className="qz-item-sub">{meta?.label ?? s.tipo}</span>
                </span>
                <span className="qz-acoes">
                  <button onClick={(e) => { e.stopPropagation(); mover(i, -1); }} disabled={i === 0} title="Subir" style={btnMini}><Icon name="chevron-up" size={13} color="var(--text-dim)" /></button>
                  <button onClick={(e) => { e.stopPropagation(); mover(i, 1); }} disabled={i === quiz.steps.length - 1} title="Descer" style={btnMini}><Icon name="chevron-down" size={13} color="var(--text-dim)" /></button>
                </span>
              </div>
            );
          })}
          {quiz.steps.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-dim)", padding: "10px 4px", margin: 0 }}>Nenhuma etapa ainda. Comece por uma capa.</p>}
        </div>

        <div style={{ position: "relative" }}>
          <Botao icone="plus" bloco onClick={() => setAddAberto((v) => !v)}>
            Nova etapa
          </Botao>
          {addAberto && (
            <>
              <div onClick={() => setAddAberto(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, zIndex: 41, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "0 18px 46px -18px rgba(0,0,0,.5)", padding: 6, maxHeight: 320, overflowY: "auto" }}>
                {QUIZ_TIPOS.map((t) => (
                  <button key={t.id} onClick={() => adicionar(t.id)}
                    style={{ display: "flex", alignItems: "flex-start", gap: 9, width: "100%", padding: "9px 10px", borderRadius: 8, border: "none", background: "transparent", color: "var(--text)", textAlign: "left", cursor: "pointer" }}>
                    <Icon name={t.icone} size={15} color="var(--primary-texto)" />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{t.label}</span>
                      <span style={{ display: "block", fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>{t.dica}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-dim)", cursor: "pointer", paddingTop: 4, borderTop: "1px solid var(--border)" }}>
          <Caixa marcado={quiz.progresso !== false} onChange={(marc) => onChange({ ...quiz, progresso: marc })} />
          Barra de progresso
        </label>
      </div>

      {/* ── Coluna 2 · Inspetor ───────────────────────────────────────────── */}
      <div className="glass qz-col" style={{ borderRadius: 14, padding: 16, overflowY: "auto" }}>
        {sel ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Icon name={QUIZ_TIPOS.find((t) => t.id === sel.tipo)?.icone ?? "square"} size={17} color="var(--primary-texto)" />
              <strong style={{ fontSize: 15, fontWeight: 800, flex: 1 }}>{QUIZ_TIPOS.find((t) => t.id === sel.tipo)?.label ?? sel.tipo}</strong>
              <BotaoIcone icone="copy" titulo="Duplicar etapa" variante="secundario" tamanho="sm" onClick={() => duplicar(sel)} />
              <BotaoIcone icone="trash" titulo="Excluir etapa" variante="perigo" tamanho="sm" onClick={() => remover(sel.id)} />
            </div>
            <Inspetor
              step={sel} indice={iSel}
              resultados={quiz.resultados} onResultados={setResultados}
              mostrarResultado={quiz.mostrarResultado !== false}
              onMostrarResultado={(v) => onChange({ ...quiz, mostrarResultado: v ? undefined : false })}
              onPatch={(p) => patch(sel.id, p)}
            />
          </>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Escolha uma etapa à esquerda.</p>
        )}
      </div>

      {/* ── Coluna 3 · Prévia ─────────────────────────────────────────────── */}
      <div className="glass qz-col qz-previa-col" style={{ borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)" }}>PRÉVIA AO VIVO</span>
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{quiz.steps.filter(ehPergunta).length} pergunta(s)</span>
        </div>
        <div className="qz-fone">
          {/* `key` inclui o comprimento e a etapa selecionada: mexer no funil
              reinicia a prévia na etapa que está sendo editada, em vez de deixar
              a pessoa navegar de novo até ela a cada tecla. */}
          <QuizRuntime
            key={`${previewKey}-${selId}-${quiz.steps.length}`}
            quiz={iSel > 0 ? { ...quiz, steps: quiz.steps.slice(iSel) } : quiz}
            theme={theme} altura="100%" previa
          />
        </div>
      </div>

      {json && <ModalJson quiz={quiz} aba={json} onAba={setJson} onClose={() => setJson(null)} onImportar={(q) => { onChange(q); setSelId(q.steps[0]?.id ?? null); setJson(null); }} />}
      <style>{CSS_EDITOR}</style>
    </div>
  );
}

function tituloDaEtapa(s: QuizStep): string {
  const t = s.headline || s.pergunta || s.titulo || s.carregando || "";
  return t.trim() ? (t.length > 42 ? `${t.slice(0, 42)}…` : t) : "(sem título)";
}

// ── Inspetor ─────────────────────────────────────────────────────────────────
function Inspetor({ step, indice, resultados, onResultados, mostrarResultado, onMostrarResultado, onPatch }: {
  step: QuizStep; indice: number;
  resultados?: QuizResultado[];
  onResultados: (r: QuizResultado[]) => void;
  mostrarResultado: boolean;
  onMostrarResultado: (v: boolean) => void;
  onPatch: (p: Partial<QuizStep>) => void;
}) {
  const comOpcoes = step.tipo === "single_choice" || step.tipo === "multiple_choice" || step.tipo === "image_choice";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {(step.tipo === "cover" || step.tipo === "content") && (
        <>
          {step.tipo === "content" && (
            <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0, lineHeight: 1.45 }}>
              Tela de conteúdo no meio do funil — não conta como pergunta. Boa pra contar uma história ou quebrar uma objeção antes da próxima etapa.
            </p>
          )}
          <Campo label={step.tipo === "cover" ? "Título (H1)" : "Título"} dica="Curto e específico.">
            <input style={inp} value={step.headline ?? ""} onChange={(e) => onPatch({ headline: e.target.value })} />
          </Campo>
          <Campo label={step.tipo === "cover" ? "Subtítulo (H2)" : "Texto"}>
            <textarea style={{ ...inp, minHeight: 62, resize: "vertical" }} value={step.subheadline ?? ""} onChange={(e) => onPatch({ subheadline: e.target.value })} />
          </Campo>
          <Campo label="Texto do botão">
            <input style={inp} value={step.botao ?? ""} onChange={(e) => onPatch({ botao: e.target.value })} />
          </Campo>
          <Campo label="Imagem (URL)" dica="Opcional — aparece acima do título.">
            <input style={inp} value={step.imagem ?? ""} onChange={(e) => onPatch({ imagem: e.target.value })} placeholder="https://…" />
          </Campo>
        </>
      )}

      {step.tipo === "transition" && (
        <>
          <Campo label="Texto de carregamento">
            <input style={inp} value={step.carregando ?? ""} onChange={(e) => onPatch({ carregando: e.target.value })} />
          </Campo>
          <Campo label="Duração" dica="Tempo do 0% ao 100%.">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Deslizante className="esticar" min={800} max={6000} step={200} value={step.duracaoMs ?? 2600}
                onChange={(v) => onPatch({ duracaoMs: v })} aria-label="Duração" />
              <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 44, textAlign: "right" }}>{((step.duracaoMs ?? 2600) / 1000).toFixed(1)}s</span>
            </div>
          </Campo>
          <Campo label="Prova social" dica="Uma por linha. Com duas ou mais, elas se revezam.">
            <textarea style={{ ...inp, minHeight: 78, resize: "vertical" }}
              value={(step.provaSocial ?? []).join("\n")}
              onChange={(e) => onPatch({ provaSocial: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) })} />
          </Campo>
        </>
      )}

      {step.tipo === "offer" && (
        <>
          <EditorResultados
            resultados={resultados ?? []} onChange={onResultados}
            mostrar={mostrarResultado} onMostrar={onMostrarResultado}
          />
          <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.45, marginTop: -4 }}>
            {!resultados?.length
              ? "Sem resultados, esta é a oferta única que todo mundo vê no fim."
              : mostrarResultado
                ? "Os campos abaixo são o padrão: o resultado vencedor troca o que preencher, e o resto cai aqui."
                : "A tela final mostra os campos abaixo; o resultado é calculado e guardado só pra você ver na triagem."}
          </div>
          <Campo label="Título"><input style={inp} value={step.titulo ?? ""} onChange={(e) => onPatch({ titulo: e.target.value })} /></Campo>
          <Campo label="Descrição">
            <textarea style={{ ...inp, minHeight: 68, resize: "vertical" }} value={step.descricao ?? ""} onChange={(e) => onPatch({ descricao: e.target.value })} />
          </Campo>
          <Campo label="Vídeo / VSL (URL)" dica="mp4 toca no player nativo; YouTube, Vimeo e afins entram por iframe.">
            <input style={inp} value={step.videoUrl ?? ""} onChange={(e) => onPatch({ videoUrl: e.target.value })} placeholder="https://…" />
          </Campo>
          <Campo label="Texto do botão"><input style={inp} value={step.cta ?? ""} onChange={(e) => onPatch({ cta: e.target.value })} /></Campo>
          <Campo label="Destino (checkout)" dica="Pra onde o botão leva. O evento de pixel dispara antes de sair.">
            <input style={inp} value={step.destino ?? ""} onChange={(e) => onPatch({ destino: e.target.value })} placeholder="https://checkout…" />
          </Campo>
          <label style={chk}>
            <Caixa marcado={step.resumo !== false} onChange={(marc) => onPatch({ resumo: marc })} />
            Mostrar o resumo das respostas
          </label>
        </>
      )}

      {step.tipo === "upload" && (
        <>
          <Campo label="Título da tela"><input style={inp} value={step.pergunta ?? ""} onChange={(e) => onPatch({ pergunta: e.target.value })} /></Campo>
          <Campo label="Texto de apoio" dica="Ex.: os formatos aceitos.">
            <input style={inp} value={step.ajuda ?? ""} onChange={(e) => onPatch({ ajuda: e.target.value })} />
          </Campo>
          <Campo label="Variável" dica="Nome do campo no webhook/CSV. O arquivo entra como link `/api/arquivos/…`.">
            <input style={inp} value={step.variavel ?? ""} onChange={(e) => onPatch({ variavel: e.target.value.replace(/[^\w.-]/g, "_") })} placeholder="curriculo" />
          </Campo>
          <Campo label="Texto do botão"><input style={inp} value={step.botao ?? ""} onChange={(e) => onPatch({ botao: e.target.value })} placeholder="Concluir" /></Campo>
          <label style={chk}>
            <Caixa marcado={step.obrigatorio !== false} onChange={(marc) => onPatch({ obrigatorio: marc })} />
            Obrigatório enviar
          </label>
          <p style={{ fontSize: 11, color: "var(--text-dim)", margin: 0, lineHeight: 1.45 }}>
            Aceita PDF, DOC ou DOCX (até 10 MB). O arquivo vai pro armazenamento privado; só quem tem acesso aos funis abre pela tela de Resultados.
          </p>
        </>
      )}

      {ehPergunta(step) && (
        <>
          <Campo label="Pergunta"><input style={inp} value={step.pergunta ?? ""} onChange={(e) => onPatch({ pergunta: e.target.value })} /></Campo>
          <Campo label="Texto de apoio" dica="Opcional — abaixo da pergunta.">
            <input style={inp} value={step.ajuda ?? ""} onChange={(e) => onPatch({ ajuda: e.target.value })} />
          </Campo>
          <Campo label="Variável" dica="Nome do campo no webhook e no CSV. `email` e `telefone` são procurados pelo destino do lead.">
            <input style={inp} value={step.variavel ?? ""} onChange={(e) => onPatch({ variavel: e.target.value.replace(/[^\w.-]/g, "_") })} placeholder={`q${indice + 1}`} />
          </Campo>

          {step.tipo === "slider" && (
            <div style={{ display: "flex", gap: 8 }}>
              <Campo label="Mínimo"><input style={inp} type="number" value={step.min ?? 0} onChange={(e) => onPatch({ min: Number(e.target.value) })} /></Campo>
              <Campo label="Máximo"><input style={inp} type="number" value={step.max ?? 100} onChange={(e) => onPatch({ max: Number(e.target.value) })} /></Campo>
              <Campo label="Passo"><input style={inp} type="number" min={1} value={step.passo ?? 1} onChange={(e) => onPatch({ passo: Math.max(1, Number(e.target.value)) })} /></Campo>
              <Campo label="Sufixo"><input style={inp} value={step.sufixo ?? ""} onChange={(e) => onPatch({ sufixo: e.target.value })} placeholder="anos" /></Campo>
            </div>
          )}

          {step.tipo === "rating" && (
            <>
              <Campo label="Estilo">
                <GlassSelect value={step.ratingEstilo ?? "estrelas"} onChange={(v) => onPatch({ ratingEstilo: v as QuizStep["ratingEstilo"], ratingMax: v === "numeros" ? (step.ratingMax && step.ratingMax > 5 ? step.ratingMax : 10) : 5 })}
                  options={[{ value: "estrelas", label: "Estrelas (1–5)" }, { value: "numeros", label: "Números / NPS" }]} />
              </Campo>
              {step.ratingEstilo === "numeros" && (
                <Campo label="Máximo" dica="10 vira NPS (começa em 0).">
                  <input style={inp} type="number" min={2} max={10} value={step.ratingMax ?? 10} onChange={(e) => onPatch({ ratingMax: Math.min(10, Math.max(2, Number(e.target.value))) })} />
                </Campo>
              )}
            </>
          )}

          {step.tipo === "text" && (
            <>
              <Campo label="Formato" dica="Troca o teclado do celular e a validação.">
                <GlassSelect value={step.formato ?? "texto"} onChange={(v) => onPatch({ formato: v as QuizStep["formato"] })}
                  options={[{ value: "texto", label: "Texto" }, { value: "email", label: "E-mail" }, { value: "telefone", label: "Telefone" }, { value: "numero", label: "Número" }]} />
              </Campo>
              <Campo label="Placeholder"><input style={inp} value={step.placeholder ?? ""} onChange={(e) => onPatch({ placeholder: e.target.value })} /></Campo>
            </>
          )}

          {step.tipo === "multiple_choice" && (
            <Campo label="Máximo de escolhas" dica="0 = sem limite.">
              <input style={inp} type="number" min={0} value={step.maxEscolhas ?? 0} onChange={(e) => onPatch({ maxEscolhas: Math.max(0, Number(e.target.value)) })} />
            </Campo>
          )}

          {comOpcoes && <Opcoes step={step} resultados={resultados} onPatch={onPatch} />}

          <Campo label="Micro-feedback" dica="Tela de respiro de ~1s depois de responder. Vazio = avança direto.">
            <input style={inp} value={step.microFeedback ?? ""} onChange={(e) => onPatch({ microFeedback: e.target.value })} placeholder="Ajustando o seu plano…" />
          </Campo>
          <label style={chk}>
            <Caixa marcado={step.obrigatorio !== false} onChange={(marc) => onPatch({ obrigatorio: marc })} />
            Obrigatória
          </label>
        </>
      )}

      <Campo label="Tag de rastreio" dica="Rótulo desta etapa no relatório (`tracking_tag` no JSON).">
        <input style={inp} value={step.tagRastreio ?? ""} onChange={(e) => onPatch({ tagRastreio: e.target.value })} placeholder="step_1_perfil" />
      </Campo>
    </div>
  );
}

/** Pontos com os zeros/valores inválidos removidos — undefined quando não sobra
 *  nada, pra opção sem peso não carregar `pontos: {}` no documento. */
function limparPontos(p: Record<string, number>): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(p)) if (Number.isFinite(v) && v !== 0) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

function Opcoes({ step, resultados, onPatch }: { step: QuizStep; resultados?: QuizResultado[]; onPatch: (p: Partial<QuizStep>) => void }) {
  const opcoes = step.opcoes ?? [];
  const set = (id: string, p: Partial<QuizOpcao>) => onPatch({ opcoes: opcoes.map((o) => (o.id === id ? { ...o, ...p } : o)) });
  const comVisual = step.tipo === "image_choice";
  const comPontos = !!resultados?.length;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-dim)", marginBottom: 7 }}>
        Opções <span style={{ fontWeight: 500 }}>— a tag vai pro CRM/webhook</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {opcoes.map((o) => (
          <div key={o.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 9, background: "var(--surface)" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input style={{ ...inp, flex: 1 }} value={o.label} onChange={(e) => set(o.id, { label: e.target.value })} placeholder="O que a pessoa lê" />
              <BotaoIcone icone="x" titulo="Remover opção" variante="secundario" tamanho="sm" onClick={() => onPatch({ opcoes: opcoes.filter((x) => x.id !== o.id) })} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "0 8px", background: "var(--bg)" }}>
                <Icon name="tag" size={12} color="var(--text-dim)" />
                <input style={{ ...inp, border: "none", background: "transparent", padding: "7px 0", flex: 1 }} value={o.tag ?? ""}
                  onChange={(e) => set(o.id, { tag: e.target.value.replace(/[^\w.-]/g, "_").toLowerCase() })} placeholder="perfil_iniciante" />
              </span>
              {comVisual && (
                <input style={{ ...inp, flex: 1 }} value={o.imagem ?? ""} onChange={(e) => set(o.id, { imagem: e.target.value })} placeholder="URL da imagem" />
              )}
            </div>
            {comPontos && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", marginBottom: 6 }}>Pontos por resultado</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {resultados!.map((r) => (
                    <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.titulo || "Resultado"}</span>
                      <input type="number" style={{ ...inp, width: 66, flex: "none", padding: "6px 8px", textAlign: "center" }}
                        value={o.pontos?.[r.id] ?? 0}
                        onChange={(e) => set(o.id, { pontos: limparPontos({ ...o.pontos, [r.id]: Number(e.target.value) }) })} />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <Botao tamanho="sm" icone="plus" onClick={() => onPatch({ opcoes: [...opcoes, { id: uidQuiz(), label: `Opção ${opcoes.length + 1}`, tag: "" }] })}
        style={{ marginTop: 8 }}>
        Opção
      </Botao>
    </div>
  );
}

// ── Resultados ponderados ─────────────────────────────────────────────────────
// Mora no inspetor da OFERTA porque é onde o resultado aparece. Enquanto a lista
// está vazia, o quiz é uma oferta única (comportamento de sempre); ao criar o
// primeiro resultado, cada opção ganha os campos de "pontos por resultado".
function EditorResultados({ resultados, onChange, mostrar, onMostrar }: {
  resultados: QuizResultado[]; onChange: (r: QuizResultado[]) => void;
  mostrar: boolean; onMostrar: (v: boolean) => void;
}) {
  const set = (id: string, p: Partial<QuizResultado>) => onChange(resultados.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const marcarPadrao = (id: string, on: boolean) => onChange(resultados.map((r) => ({ ...r, padrao: on && r.id === id })));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Icon name="rosette-discount-check" size={15} color="var(--primary-texto)" />
        <strong style={{ fontSize: 12.5, fontWeight: 800, flex: 1 }}>Resultados ponderados</strong>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{resultados.length || "nenhum"}</span>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-dim)", margin: 0, lineHeight: 1.45 }}>
        Cada opção soma pontos pra um resultado (em “Pontos por resultado”, nas perguntas). O que somar mais é o perfil vencedor.
      </p>
      {resultados.length > 0 && (
        <label style={{ ...chk, fontSize: 12 }}>
          <Caixa marcado={mostrar} onChange={(marc) => onMostrar(marc)} />
          Mostrar o resultado na tela final
          <span style={{ fontSize: 10.5, color: "var(--text-dim)" }}>
            {mostrar ? "(a pessoa vê o perfil)" : "(só a triagem vê; a pessoa vê o texto da oferta)"}
          </span>
        </label>
      )}
      {resultados.map((r, idx) => (
        <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "var(--bg)", display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)" }}>Resultado {idx + 1}</span>
            <span style={{ flex: 1 }} />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-dim)", cursor: "pointer" }} title="Usado quando ninguém pontua">
              <Caixa marcado={!!r.padrao} onChange={(marc) => marcarPadrao(r.id, marc)} />
              padrão
            </label>
            <BotaoIcone icone="x" titulo="Remover resultado" variante="secundario" tamanho="sm" onClick={() => onChange(resultados.filter((x) => x.id !== r.id))} />
          </div>
          <input style={inp} value={r.titulo} onChange={(e) => set(r.id, { titulo: e.target.value })} placeholder="Título do diagnóstico" />
          <textarea style={{ ...inp, minHeight: 52, resize: "vertical" }} value={r.descricao ?? ""} onChange={(e) => set(r.id, { descricao: e.target.value })} placeholder="Descrição (vazio = usa a da oferta)" />
          <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...inp, flex: 1 }} value={r.cta ?? ""} onChange={(e) => set(r.id, { cta: e.target.value })} placeholder="Botão (opcional)" />
            <input style={{ ...inp, flex: 1.4 }} value={r.destino ?? ""} onChange={(e) => set(r.id, { destino: e.target.value })} placeholder="Checkout (opcional)" />
          </div>
        </div>
      ))}
      <Botao tamanho="sm" icone="plus" onClick={() => onChange([...resultados, novoResultado(resultados.length + 1)])}>
        Resultado
      </Botao>
    </div>
  );
}

// ── Importar / exportar JSON ─────────────────────────────────────────────────
function ModalJson({ quiz, aba, onAba, onClose, onImportar }: {
  quiz: Quiz; aba: "importar" | "exportar";
  onAba: (a: "importar" | "exportar") => void;
  onClose: () => void; onImportar: (q: Quiz) => void;
}) {
  const saida = useMemo(() => JSON.stringify(exportarQuiz(quiz), null, 2), [quiz]);
  const [texto, setTexto] = useState("");
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const importar = () => {
    const r = importarQuiz(texto);
    setErro(r.erro ?? null);
    setAvisos(r.avisos);
    if (r.quiz) {
      onImportar(r.quiz);
      toast.ok(r.avisos.length ? `Funil importado com ${r.avisos.length} aviso(s).` : "Funil importado.");
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 5000, background: "color-mix(in srgb, #000 58%, transparent)", backdropFilter: "blur(3px)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "4dvh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 100%)", maxHeight: "90dvh", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "0 24px 70px rgba(0,0,0,.5)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <strong style={{ fontSize: 15.5, fontWeight: 800, flex: "none" }}>JSON do funil</strong>
          <div style={{ display: "flex", gap: 6, flex: 1 }}>
            {(["importar", "exportar"] as const).map((k) => (
              <button key={k} onClick={() => onAba(k)}
                style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid " + (aba === k ? "transparent" : "var(--border)"), background: aba === k ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: aba === k ? "var(--on-primary, #fff)" : "var(--text)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>{k}</button>
            ))}
          </div>
          <BotaoIcone icone="x" titulo="Fechar" onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflowY: "auto" }}>
          {aba === "exportar" ? (
            <>
              <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "0 0 10px" }}>Este é o funil no formato de troca. Copie pra reaproveitar em outro bot ou pra versionar.</p>
              <textarea readOnly value={saida} style={{ ...inp, minHeight: 340, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1.5 }} />
              <Botao variante="primario" onClick={() => { navigator.clipboard.writeText(saida).then(() => toast.ok("JSON copiado.")).catch(() => toast.erro("Não deu pra copiar.")); }}
                style={{ marginTop: 12 }}>Copiar JSON</Botao>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "0 0 10px", lineHeight: 1.5 }}>
                Cole o JSON do funil. Aceita <code>cover</code>, <code>single_choice</code>, <code>multiple_choice</code>, <code>image_choice</code>, <code>slider</code>, <code>text</code>, <code>transition</code> e <code>offer</code> — e também os nomes em português. <strong>Isto substitui as etapas atuais.</strong>
              </p>
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'{\n  "funnel_title": "…",\n  "steps": [ … ]\n}'}
                style={{ ...inp, minHeight: 300, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1.5 }} />
              {erro && <p style={{ fontSize: 12.5, color: "var(--perigo)", fontWeight: 700, margin: "8px 0 0" }}>{erro}</p>}
              {avisos.length > 0 && (
                <ul style={{ fontSize: 12, color: "var(--atencao)", margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.5 }}>
                  {avisos.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              )}
              <Botao variante="primario" onClick={importar} disabled={!texto.trim()} style={{ marginTop: 12 }}>Importar</Botao>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Peças ────────────────────────────────────────────────────────────────────
function Campo({ label, dica, children }: { label: string; dica?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", minWidth: 0, flex: 1 }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 5 }}>{label}</span>
      {children}
      {dica && <span style={{ display: "block", fontSize: 11, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.45 }}>{dica}</span>}
    </label>
  );
}

const inp: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9,
  border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
  fontSize: 13, outline: "none", fontFamily: "inherit",
};
const chk: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-dim)", cursor: "pointer" };
const btnMini: React.CSSProperties = { width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center" };

const CSS_EDITOR = `
.qz-grid { display: grid; grid-template-columns: 268px minmax(0, 1fr) 340px; gap: 12px; flex: 1; min-height: 0; }
.qz-col { min-height: 0; }
.qz-etapas { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.qz-item { display: flex; align-items: center; gap: 8px; padding: 8px 9px; border-radius: 10px; cursor: pointer; border: 1px solid transparent; }
.qz-item:hover { background: var(--surface-2); }
.qz-item.qz-on { background: color-mix(in srgb, var(--primary) 12%, transparent); border-color: color-mix(in srgb, var(--primary) 35%, transparent); }
.qz-num { flex: none; font-size: 10.5px; font-weight: 800; color: var(--text-dim); font-variant-numeric: tabular-nums; }
.qz-item-txt { flex: 1; min-width: 0; }
.qz-item-tit { display: block; font-size: 12.5px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qz-item-sub { display: block; font-size: 10.5px; color: var(--text-dim); margin-top: 1px; }
.qz-acoes { flex: none; display: flex; flex-direction: column; opacity: 0; transition: opacity .12s ease-out; }
.qz-item:hover .qz-acoes, .qz-item.qz-on .qz-acoes { opacity: 1; }
.qz-acoes button:disabled { opacity: .25; cursor: default; }
/* No toque não existe hover: subir e descer etapa precisam estar sempre à
   vista, e com alvo de 44px. Vai por pointer:coarse e não por largura —
   tablet tem 1024px e dedo. */
@media (pointer: coarse) {
  .qz-acoes { opacity: 1; flex-direction: row; gap: 2px; }
  .qz-acoes button { width: var(--tap, 44px); height: var(--tap, 44px); }
}
/* Moldura da prévia: proporção de celular, que é onde o funil roda de verdade. */
.qz-fone { flex: 1; min-height: 0; border-radius: 22px; overflow: hidden; border: 1px solid var(--border); background: var(--surface); }

@media (max-width: 1180px) {
  .qz-grid { grid-template-columns: 240px minmax(0, 1fr); }
  .qz-previa-col { display: none; }
}
@media (max-width: 820px) {
  .qz-grid { grid-template-columns: minmax(0, 1fr); grid-auto-rows: min-content; overflow-y: auto; }
  .qz-etapas { max-height: 240px; }
}
`;
