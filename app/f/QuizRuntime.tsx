"use client";

// ── TridiFlow · runtime do funil de quiz ─────────────────────────────────────
// Uma etapa por tela, sem recarregar página. O ChatRuntime desenha uma conversa;
// este desenha um formulário que se comporta como app: capa → perguntas →
// análise → oferta.
//
// Três decisões que sustentam o resto:
//
// 1. **Escolha única avança sozinha.** Clicar numa opção e depois num "Continuar"
//    é pedir duas vezes a mesma coisa. Múltipla escolha precisa do botão (o
//    sistema não sabe quando você terminou de marcar); escolha única, não.
// 2. **O progresso conta só as PERGUNTAS.** Capa, análise e oferta não são
//    trabalho de quem responde — incluí-las fazia a barra nascer em 33% e nunca
//    fechar em 100%.
// 3. **O estado mora no localStorage a cada passo.** Quem fecha o navegador no
//    meio volta onde parou. É o critério de aceite, e é também o que impede a
//    aba recarregada por engano de zerar um funil de seis perguntas.
//
// As classes seguem o mesmo prefixo `.tf-*` do chat onde a peça é a mesma
// (`.tf-container`, `.tf-choice`), então o CSS personalizado e os presets de
// tema continuam valendo aqui. O que é só do quiz usa `.tfq-*`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Theme } from "@/lib/tridiflow";
import {
  ehPergunta, progresso, resolverTemaQuiz, resultadoDe, resumoDe, tagsDe, CHAVE_RESULTADO, CHAVE_TAGS,
  type Quiz, type QuizResultado, type QuizStep, type QuizOpcao,
} from "@/lib/tridiflow-quiz";

type Vars = Record<string, string>;

export interface QuizRuntimeProps {
  quiz: Quiz;
  theme: Theme;
  customCss?: string;
  /** Chave do localStorage — sem ela o progresso não é retomado (prévia). */
  resumeKey?: string;
  altura?: string;
  varsIniciais?: Vars;
  /** A cada resposta gravada. */
  aoResponder?: (vars: Vars, etapaId: string) => void;
  /** Chegou na oferta: o funil está concluído (vira lead). */
  aoConcluir?: (vars: Vars) => void;
  /** Clicou no CTA da oferta (antes de sair pro checkout). */
  aoOferta?: (vars: Vars) => void;
  /** Envia o arquivo da etapa `upload` e devolve a URL gravada (`/api/arquivos/…`).
   *  Quem faz a rede é o PlayerClient (tem a sessão do funil); ausente/prévia = o
   *  campo de upload fica desabilitado. */
  enviarCurriculo?: (file: File) => Promise<{ url: string; nome: string }>;
  /** Prévia do editor: não grava progresso nem redireciona de verdade. */
  previa?: boolean;
}

const ehEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const digitos = (v: string) => v.replace(/\D/g, "");

/** (11) 91234-5678 enquanto digita — máscara só de exibição, o valor gravado é
 *  o texto formatado (é o que o vendedor lê e o que o destino do lead limpa). */
function mascaraTelefone(v: string): string {
  const d = digitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function QuizRuntime({
  quiz, theme, customCss, resumeKey, altura = "100dvh", varsIniciais = {},
  aoResponder, aoConcluir, aoOferta, enviarCurriculo, previa,
}: QuizRuntimeProps) {
  const steps = quiz.steps;
  const chave = resumeKey ? `tfq:${resumeKey}` : null;

  const [i, setI] = useState(0);
  const [respostas, setRespostas] = useState<Vars>(varsIniciais);
  const [dir, setDir] = useState<1 | -1>(1);
  const [micro, setMicro] = useState<string | null>(null);
  const concluiu = useRef(false);
  const palcoRef = useRef<HTMLDivElement>(null);

  // ── Retomada ───────────────────────────────────────────────────────────────
  // Lida UMA vez, no primeiro quadro do cliente. Não é `useState(() => ...)`
  // porque isso rodaria no servidor também e o HTML renderizado não bateria com
  // o do cliente (hidratação).
  //
  // `restaurado` não é zelo: sem ele o efeito que GRAVA (logo abaixo) roda no
  // mesmo commit que este, ainda com `i = 0`, e sobrescreve o progresso salvo
  // antes de alguém tê-lo lido. Em produção o valor certo acabava sendo
  // reescrito no render seguinte e passava despercebido; no `StrictMode` do
  // desenvolvimento, que monta duas vezes, o zero ficava — e a retomada
  // simplesmente não acontecia. Só grava depois de ter lido.
  const restaurado = useRef(false);
  useEffect(() => {
    if (!chave) { restaurado.current = true; return; }
    try {
      const cru = localStorage.getItem(chave);
      if (cru) {
        const salvo = JSON.parse(cru) as { i?: number; respostas?: Vars };
        // Nunca retoma NA oferta: a pessoa já viu o fim, e reabrir direto no
        // checkout esconde o funil de quem só queria olhar de novo.
        const alvo = Math.min(Math.max(0, salvo.i ?? 0), steps.length - 1);
        if (steps[alvo]?.tipo !== "offer") {
          if (salvo.respostas) setRespostas((v) => ({ ...v, ...salvo.respostas }));
          if (alvo > 0) setI(alvo);
        }
      }
    } catch { /* storage cheio/bloqueado não pode derrubar o funil */ }
    restaurado.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quem decide se GRAVA é a `resumeKey`, não o `previa`. São coisas
  // diferentes: `previa` significa "não redirecione pro checkout de verdade", e
  // amarrar a persistência nela deixava o critério de retomada sem como ser
  // exercitado fora de produção. O editor simplesmente não passa `resumeKey`.
  useEffect(() => {
    if (!chave || !restaurado.current) return;
    try { localStorage.setItem(chave, JSON.stringify({ i, respostas })); } catch { /* storage cheio/bloqueado não derruba o funil */ }
  }, [chave, i, respostas]);

  const step: QuizStep | undefined = steps[i];
  const pct = progresso(steps, i);
  // Contagem de perguntas — só a trilha "passos" usa, e ela precisa do
  // denominador em marcas, não em porcentagem.
  const totalPerguntas = useMemo(() => steps.filter(ehPergunta).length, [steps]);
  const feitas = useMemo(() => steps.slice(0, i).filter(ehPergunta).length, [steps, i]);

  // ── Navegação ──────────────────────────────────────────────────────────────
  const irPara = useCallback((alvo: number, direcao: 1 | -1) => {
    setDir(direcao);
    setI(Math.min(Math.max(0, alvo), steps.length - 1));
    // O palco rola pro topo: numa pergunta longa a próxima nascia no meio.
    requestAnimationFrame(() => palcoRef.current?.scrollTo({ top: 0 }));
  }, [steps.length]);

  const avancar = useCallback((microTexto?: string) => {
    const proximo = i + 1;
    if (proximo >= steps.length) return;
    // Micro-feedback: uma tela de respiro entre a resposta e a próxima pergunta.
    // É curto de propósito — passar de 1,2s deixa de ser feedback e vira espera.
    if (microTexto) {
      setMicro(microTexto);
      window.setTimeout(() => { setMicro(null); irPara(proximo, 1); }, 1100);
      return;
    }
    irPara(proximo, 1);
  }, [i, steps.length, irPara]);

  const voltar = useCallback(() => { if (i > 0) irPara(i - 1, -1); }, [i, irPara]);

  // ── Resposta ───────────────────────────────────────────────────────────────
  const gravar = useCallback((s: QuizStep, valor: string) => {
    if (!s.variavel) return respostas;
    const novas = { ...respostas, [s.variavel]: valor };
    // As tags viajam junto das respostas, na chave reservada: é o que faz o
    // webhook e o CSV enxergarem a segmentação sem coluna nova no banco.
    const tags = tagsDe(steps, novas);
    if (tags.length) novas[CHAVE_TAGS] = tags.join(",");
    setRespostas(novas);
    aoResponder?.(novas, s.id);
    return novas;
  }, [respostas, steps, aoResponder]);

  // Chegou na oferta → o funil está concluído (o lead sai aqui).
  useEffect(() => {
    if (!step || step.tipo !== "offer" || concluiu.current) return;
    concluiu.current = true;
    // Resultado ponderado (quando o funil tem resultados) viaja junto das
    // respostas, na chave reservada — assim webhook, CSV e Resultados enxergam
    // "que perfil deu" sem coluna nova. Sem resultados, `r` é null e nada muda.
    const r = resultadoDe(quiz, respostas);
    const vars = r ? { ...respostas, [CHAVE_RESULTADO]: r.titulo } : respostas;
    if (r) setRespostas(vars);
    aoConcluir?.(vars);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

  // ── Aparência ──────────────────────────────────────────────────────────────
  // O quiz tem tema PRÓPRIO (`quiz.tema`). O tema do chat só entra como queda,
  // que é como todo funil criado antes disto se comportava — por isso quem não
  // definiu aparência nenhuma continua idêntico.
  const c = useMemo(() => resolverTemaQuiz(quiz.tema, theme), [quiz.tema, theme]);
  // Resultado ponderado pra desenhar a oferta (null quando o funil não usa).
  const resultado = useMemo(() => resultadoDe(quiz, respostas), [quiz, respostas]);

  if (!step) {
    return <div className="tf-container tfq-root" style={{ height: altura, display: "grid", placeItems: "center", background: c.fundo, color: c.texto }}>Funil sem etapas.</div>;
  }

  return (
    <div className="tf-container tfq-root" data-btn={c.botaoLargura} style={{
      ["--tfq-botao" as string]: c.botao, ["--tfq-texto-botao" as string]: c.textoBotao,
      ["--tfq-texto" as string]: c.texto, ["--tfq-cartao" as string]: c.cartao,
      ["--tfq-raio" as string]: `${c.raio}px`, ["--tfq-largura" as string]: `${c.larguraMax}px`,
      height: altura, background: c.fundo, color: c.texto, fontFamily: c.fonte,
    }}>
      <style>{CSS_QUIZ}</style>
      {customCss && <style>{customCss}</style>}

      {/* Barra de progresso — some na capa (não há o que ter concluído ainda) e
          na oferta (acabou). O botão de voltar mora ao lado dela: no celular
          essa é a única faixa fixa, e um voltar solto no corpo rolaria pra fora. */}
      {quiz.progresso !== false && c.progresso !== "nenhum" && step.tipo !== "cover" && step.tipo !== "offer" && (
        <div className="tfq-topo">
          <button type="button" className="tfq-voltar" onClick={voltar} disabled={i === 0} aria-label="Voltar uma etapa">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6l6 6" /></svg>
          </button>
          {/* "passos" mostra uma marca por pergunta em vez da régua contínua.
              O papel é o mesmo (dizer quanto falta), então o role/aria não muda
              — quem usa leitor de tela ouve a mesma porcentagem nos dois. */}
          <div className={c.progresso === "passos" ? "tfq-trilha" : "tfq-barra"} role="progressbar"
            aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do funil">
            {c.progresso === "passos"
              ? Array.from({ length: totalPerguntas }, (_, n) => (
                  <span key={n} className={n < feitas ? "tfq-trilha-p tfq-trilha-on" : "tfq-trilha-p"}
                    style={n < feitas ? { background: c.botao } : undefined} />
                ))
              : <div className="tfq-barra-fill" style={{ width: `${pct}%`, background: c.botao }} />}
          </div>
          <span className="tfq-pct" aria-hidden>{pct}%</span>
        </div>
      )}

      <div className="tfq-palco" ref={palcoRef}>
        {micro ? (
          <div className="tfq-etapa tfq-micro" key="micro">
            <div className="tfq-spinner" style={{ borderTopColor: c.botao }} />
            <p className="tfq-micro-txt">{micro}</p>
          </div>
        ) : (
          <div className="tfq-etapa" key={step.id} data-dir={dir === 1 ? "frente" : "tras"}>
            <Etapa
              step={step} steps={steps} respostas={respostas} cores={c} previa={previa}
              resultado={quiz.mostrarResultado === false ? null : resultado} enviarCurriculo={enviarCurriculo}
              aoResponder={(valor, micro) => { gravar(step, valor); avancar(micro); }}
              aoAvancar={() => avancar()}
              aoOferta={() => aoOferta?.(respostas)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Uma etapa ────────────────────────────────────────────────────────────────
type Cores = { fundo: string; texto: string; botao: string; textoBotao: string; cartao: string };

function Etapa({ step, steps, respostas, cores, previa, resultado, enviarCurriculo, aoResponder, aoAvancar, aoOferta }: {
  step: QuizStep; steps: QuizStep[]; respostas: Vars; cores: Cores; previa?: boolean;
  resultado: QuizResultado | null;
  enviarCurriculo?: (file: File) => Promise<{ url: string; nome: string }>;
  aoResponder: (valor: string, micro?: string) => void;
  aoAvancar: () => void;
  aoOferta: () => void;
}) {
  switch (step.tipo) {
    case "cover": return <Capa step={step} onComecar={aoAvancar} />;
    case "content": return <Capa step={step} onComecar={aoAvancar} />;
    case "transition": return <Analise step={step} onFim={aoAvancar} cores={cores} />;
    case "offer": return <Oferta step={step} steps={steps} respostas={respostas} resultado={resultado} previa={previa} onCta={aoOferta} />;
    case "single_choice":
    case "image_choice": return <EscolhaUnica step={step} valor={respostas[step.variavel ?? ""] ?? ""} onEscolher={aoResponder} />;
    case "multiple_choice": return <EscolhaMultipla step={step} valor={respostas[step.variavel ?? ""] ?? ""} onConfirmar={aoResponder} />;
    case "rating": return <Avaliacao step={step} valor={respostas[step.variavel ?? ""] ?? ""} onConfirmar={aoResponder} />;
    case "slider": return <Faixa step={step} valor={respostas[step.variavel ?? ""] ?? ""} onConfirmar={aoResponder} />;
    case "text": return <Texto step={step} valor={respostas[step.variavel ?? ""] ?? ""} onConfirmar={aoResponder} />;
    case "upload": return <Envio step={step} valor={respostas[step.variavel ?? ""] ?? ""} enviar={enviarCurriculo} previa={previa} onConfirmar={aoResponder} />;
    default: return null;
  }
}

function Cabecalho({ titulo, ajuda }: { titulo?: string; ajuda?: string }) {
  return (
    <>
      {titulo && <h1 className="tfq-pergunta">{titulo}</h1>}
      {ajuda && <p className="tfq-ajuda">{ajuda}</p>}
    </>
  );
}

function Capa({ step, onComecar }: { step: QuizStep; onComecar: () => void }) {
  return (
    <div className="tfq-capa">
      {step.imagem && <img src={step.imagem} alt="" className="tfq-capa-img" />}
      <h1 className="tfq-h1">{step.headline || "Comece agora"}</h1>
      {step.subheadline && <p className="tfq-h2">{step.subheadline}</p>}
      <button type="button" className="tf-choice tfq-cta" onClick={onComecar}>{step.botao || "Começar"}</button>
      {/* Indicador de progresso inicial: mostra que existe um caminho e que ele
          é curto. Sem isto a capa promete "2 minutos" sem nada que sustente. */}
      <div className="tfq-passos" aria-hidden>
        <span className="tfq-passo tfq-passo-on" />
        <span className="tfq-passo" /><span className="tfq-passo" /><span className="tfq-passo" />
      </div>
    </div>
  );
}

function EscolhaUnica({ step, valor, onEscolher }: { step: QuizStep; valor: string; onEscolher: (v: string, micro?: string) => void }) {
  // Feedback antes da troca de tela: a opção marca, e só ~180ms depois a etapa
  // avança. Sem essa pausa o clique não tem resposta nenhuma — a tela some.
  const [marcado, setMarcado] = useState<string | null>(null);
  const escolher = (o: QuizOpcao) => {
    if (marcado) return;
    setMarcado(o.label);
    window.setTimeout(() => onEscolher(o.label, step.microFeedback), 180);
  };
  const comImagem = step.tipo === "image_choice";
  return (
    <div className="tfq-bloco">
      <Cabecalho titulo={step.pergunta} ajuda={step.ajuda} />
      <div className={comImagem ? "tfq-grade" : "tfq-opcoes"}>
        {(step.opcoes ?? []).map((o) => {
          const on = (marcado ?? valor) === o.label;
          return (
            <button key={o.id} type="button" onClick={() => escolher(o)}
              className={`tf-choice tfq-opcao${comImagem ? " tfq-opcao-img" : ""}${on ? " tfq-on" : ""}`}>
              {comImagem && o.imagem && <img src={o.imagem} alt="" className="tfq-op-img" />}
              {comImagem && !o.imagem && o.icone && <span className="tfq-op-icone" aria-hidden>{ICONE[o.icone] ?? "●"}</span>}
              <span className="tfq-op-txt">{o.label}</span>
              {!comImagem && <span className="tfq-radio" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EscolhaMultipla({ step, valor, onConfirmar }: { step: QuizStep; valor: string; onConfirmar: (v: string, micro?: string) => void }) {
  const [sel, setSel] = useState<string[]>(valor ? valor.split(",").map((v) => v.trim()).filter(Boolean) : []);
  const teto = step.maxEscolhas && step.maxEscolhas > 0 ? step.maxEscolhas : 0;
  const alternar = (label: string) => {
    setSel((v) => {
      if (v.includes(label)) return v.filter((x) => x !== label);
      if (teto && v.length >= teto) return v;   // no teto, marcar mais não faz nada (o aviso já está na tela)
      return [...v, label];
    });
  };
  const podeSeguir = !step.obrigatorio || sel.length > 0;
  return (
    <div className="tfq-bloco">
      <Cabecalho titulo={step.pergunta} ajuda={step.ajuda} />
      {teto > 0 && <p className="tfq-limite">Escolha até {teto}.</p>}
      <div className="tfq-opcoes">
        {(step.opcoes ?? []).map((o) => {
          const on = sel.includes(o.label);
          return (
            <button key={o.id} type="button" onClick={() => alternar(o.label)} aria-pressed={on}
              className={`tf-choice tfq-opcao${on ? " tfq-on" : ""}`}>
              <span className="tfq-op-txt">{o.label}</span>
              <span className="tfq-check" aria-hidden>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5l9 -9" /></svg>
              </span>
            </button>
          );
        })}
      </div>
      <Rodape>
        <button type="button" className="tf-choice tfq-cta" disabled={!podeSeguir}
          onClick={() => onConfirmar(sel.join(", "), step.microFeedback)}>
          Continuar{sel.length > 0 ? ` (${sel.length})` : ""}
        </button>
      </Rodape>
    </div>
  );
}

function Avaliacao({ step, valor, onConfirmar }: { step: QuizStep; valor: string; onConfirmar: (v: string, micro?: string) => void }) {
  const max = Math.min(10, Math.max(2, step.ratingMax ?? 5));
  // Estrelas só até 5 (uma parede de 10 estrelas não se lê); acima disso, ou
  // quando o autor pediu "números", vira escala tipo NPS.
  const estrelas = (step.ratingEstilo ?? (max <= 5 ? "estrelas" : "numeros")) === "estrelas" && max <= 5;
  const [sel, setSel] = useState<number>(() => (Number.isFinite(Number(valor)) && valor ? Number(valor) : 0));
  const escolher = (n: number) => {
    if (sel && estrelas) return;   // estrela já marcada avança; evita clique duplo
    setSel(n);
    window.setTimeout(() => onConfirmar(String(n), step.microFeedback), 180);
  };
  return (
    <div className="tfq-bloco">
      <Cabecalho titulo={step.pergunta} ajuda={step.ajuda} />
      {estrelas ? (
        <div className="tfq-estrelas" role="radiogroup" aria-label={step.pergunta || "Avaliação"}>
          {Array.from({ length: max }, (_, k) => k + 1).map((n) => (
            <button key={n} type="button" className="tfq-estrela" role="radio" aria-checked={n === sel} aria-label={`${n} de ${max}`} onClick={() => escolher(n)}>
              <svg viewBox="0 0 24 24" width="40" height="40" fill={n <= sel ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                <path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z" />
              </svg>
            </button>
          ))}
        </div>
      ) : (
        <div className="tfq-nps" role="radiogroup" aria-label={step.pergunta || "Avaliação"}>
          {/* NPS clássico começa em 0; escala de números comum começa em 1. */}
          {Array.from({ length: max === 10 ? 11 : max }, (_, k) => (max === 10 ? k : k + 1)).map((n) => (
            <button key={n} type="button" className={`tfq-nps-b${n === sel ? " tfq-on" : ""}`} role="radio" aria-checked={n === sel}
              style={n === sel ? { background: "var(--tfq-botao)", color: "var(--tfq-texto-botao)", borderColor: "transparent" } : undefined}
              onClick={() => escolher(n)}>{n}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** O sufixo ("anos", "kg", "%") sai num span com folga própria, e não colado no
 *  número. Depender de quem escreveu ter digitado um espaço à esquerda não
 *  funciona: o interpretador do JSON dá `trim()` em todo texto — e sem isto o
 *  slider mostrava "43anos". */
function Sufixo({ v }: { v?: string }) {
  const t = (v ?? "").trim();
  return t ? <span className="tfq-sufixo">{t}</span> : null;
}

function Faixa({ step, valor, onConfirmar }: { step: QuizStep; valor: string; onConfirmar: (v: string, micro?: string) => void }) {
  const min = step.min ?? 0, max = step.max ?? 100, passo = step.passo ?? 1;
  const [v, setV] = useState<number>(() => {
    const n = Number(valor);
    return Number.isFinite(n) && valor ? n : Math.round((min + max) / 2);
  });
  const frac = max > min ? (v - min) / (max - min) : 0;
  return (
    <div className="tfq-bloco">
      <Cabecalho titulo={step.pergunta} ajuda={step.ajuda} />
      <div className="tfq-faixa-valor">{v}<Sufixo v={step.sufixo} /></div>
      <input type="range" className="tfq-range" min={min} max={max} step={passo} value={v}
        aria-label={`${step.pergunta || "Valor"} — ${v}${step.sufixo ? ` ${step.sufixo.trim()}` : ""}`}
        onChange={(e) => setV(Number(e.target.value))}
        style={{ ["--tfq-frac" as string]: `${frac * 100}%` }} />
      <div className="tfq-faixa-pontas"><span>{min}<Sufixo v={step.sufixo} /></span><span>{max}<Sufixo v={step.sufixo} /></span></div>
      <Rodape>
        <button type="button" className="tf-choice tfq-cta" onClick={() => onConfirmar(String(v), step.microFeedback)}>Continuar</button>
      </Rodape>
    </div>
  );
}

function Texto({ step, valor, onConfirmar }: { step: QuizStep; valor: string; onConfirmar: (v: string, micro?: string) => void }) {
  const [v, setV] = useState(valor);
  const [tocado, setTocado] = useState(false);
  const fmt = step.formato ?? "texto";
  const erro = (() => {
    if (!tocado) return null;
    const t = v.trim();
    if (step.obrigatorio !== false && !t) return "Preencha pra continuar.";
    if (!t) return null;
    if (fmt === "email" && !ehEmail(t)) return "Esse e-mail parece incompleto.";
    if (fmt === "telefone" && (digitos(t).length < 10 || digitos(t).length > 11)) return "Faltam dígitos no número (com DDD).";
    return null;
  })();
  const vazio = step.obrigatorio !== false && !v.trim();
  const enviar = () => { setTocado(true); if (vazio) return; if (erroDe(v, fmt, step.obrigatorio)) return; onConfirmar(v.trim(), step.microFeedback); };
  return (
    <div className="tfq-bloco">
      <Cabecalho titulo={step.pergunta} ajuda={step.ajuda} />
      <input
        className="tf-input-field tfq-campo"
        // `inputMode` é o que troca o TECLADO do celular. Sem ele, pedir telefone
        // abre o alfabético e a pessoa digita número por número procurando.
        type={fmt === "email" ? "email" : fmt === "numero" ? "text" : fmt === "telefone" ? "tel" : "text"}
        inputMode={fmt === "numero" ? "numeric" : fmt === "telefone" ? "tel" : fmt === "email" ? "email" : "text"}
        autoComplete={fmt === "email" ? "email" : fmt === "telefone" ? "tel" : "off"}
        placeholder={step.placeholder || "Escreva aqui…"}
        value={v} aria-label={step.pergunta || "Resposta"}
        aria-invalid={!!erro} aria-describedby={erro ? "tfq-erro" : undefined}
        onChange={(e) => setV(fmt === "telefone" ? mascaraTelefone(e.target.value) : e.target.value)}
        onBlur={() => setTocado(true)}
        onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
      />
      {erro && <p className="tfq-erro" id="tfq-erro" role="alert">{erro}</p>}
      <Rodape>
        <button type="button" className="tf-choice tfq-cta" disabled={vazio} onClick={enviar}>Continuar</button>
      </Rodape>
    </div>
  );
}
function erroDe(v: string, fmt: string, obrigatorio?: boolean): boolean {
  const t = v.trim();
  if (obrigatorio !== false && !t) return true;
  if (!t) return false;
  if (fmt === "email") return !ehEmail(t);
  if (fmt === "telefone") { const d = digitos(t).length; return d < 10 || d > 11; }
  return false;
}

function Analise({ step, onFim, cores }: { step: QuizStep; onFim: () => void; cores: Cores }) {
  const total = Math.max(600, step.duracaoMs ?? 2600);
  const [p, setP] = useState(0);
  const [prova, setProva] = useState(0);
  const frases = step.provaSocial ?? [];

  useEffect(() => {
    // Contagem por relógio, não por passo fixo: um `setInterval(+1)` termina em
    // tempos diferentes conforme a aba engasga, e a barra parava em 87%.
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const frac = Math.min(1, (performance.now() - t0) / total);
      setP(Math.round(frac * 100));
      if (frac < 1) raf = requestAnimationFrame(tick);
      else onFim();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  useEffect(() => {
    if (frases.length < 2) return;
    const t = window.setInterval(() => setProva((n) => (n + 1) % frases.length), 2200);
    return () => window.clearInterval(t);
  }, [frases.length]);

  return (
    <div className="tfq-analise">
      <div className="tfq-anel" style={{ ["--tfq-p" as string]: `${p}%`, ["--tfq-cor" as string]: cores.botao }}>
        <span className="tfq-anel-n">{p}%</span>
      </div>
      <p className="tfq-carregando">{step.carregando || "Analisando…"}</p>
      {frases.length > 0 && (
        // aria-live: quem usa leitor de tela ouve a prova social trocando em vez
        // de ficar num silêncio de três segundos.
        <p className="tfq-prova" key={prova} aria-live="polite">{frases[prova]}</p>
      )}
    </div>
  );
}

function Envio({ step, valor, enviar, previa, onConfirmar }: {
  step: QuizStep; valor: string;
  enviar?: (file: File) => Promise<{ url: string; nome: string }>;
  previa?: boolean; onConfirmar: (v: string, micro?: string) => void;
}) {
  const [nomeArq, setNomeArq] = useState("");
  const [url, setUrl] = useState(valor || "");
  const [estado, setEstado] = useState<"vazio" | "enviando" | "pronto" | "erro">(valor ? "pronto" : "vazio");
  const [erro, setErro] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const podeEnviar = !!enviar && !previa;

  const escolher = async (file?: File | null) => {
    if (!file || !enviar) return;
    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
    if (!["pdf", "doc", "docx"].includes(ext)) { setErro("Envie um arquivo PDF, DOC ou DOCX."); setEstado("erro"); return; }
    if (file.size > 10 * 1024 * 1024) { setErro("Arquivo muito grande — o limite é 10 MB."); setEstado("erro"); return; }
    setErro(""); setNomeArq(file.name); setEstado("enviando");
    try {
      const r = await enviar(file);
      setUrl(r.url); setNomeArq(r.nome || file.name); setEstado("pronto");
    } catch {
      setErro("Não consegui enviar agora. Tente de novo."); setEstado("erro");
    }
  };

  const podeSeguir = step.obrigatorio === false || previa || (estado === "pronto" && !!url);
  return (
    <div className="tfq-bloco">
      <Cabecalho titulo={step.pergunta} ajuda={step.ajuda} />
      <input ref={inputRef} type="file" hidden
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => escolher(e.target.files?.[0])} />
      <button type="button" className="tfq-drop" data-estado={estado}
        onClick={() => podeEnviar && inputRef.current?.click()} disabled={!podeEnviar || estado === "enviando"}>
        {estado === "enviando"
          ? <span className="tfq-spinner" style={{ borderTopColor: "var(--tfq-botao)" }} />
          : (
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {estado === "pronto"
                ? <><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /><path d="M9 15l2 2l4 -4" /></>
                : <><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 9l5 -5l5 5" /><path d="M12 4l0 12" /></>}
            </svg>
          )}
        <span className="tfq-drop-t">{estado === "enviando" ? "Enviando…" : estado === "pronto" ? nomeArq : "Anexar arquivo"}</span>
        <span className="tfq-drop-s">{estado === "pronto" ? "Toque para trocar" : "PDF, DOC ou DOCX · até 10 MB"}</span>
      </button>
      {erro && <p className="tfq-erro" role="alert">{erro}</p>}
      {!podeEnviar && <p className="tfq-dica-previa">O envio de arquivo funciona no funil publicado.</p>}
      <Rodape>
        <button type="button" className="tf-choice tfq-cta" disabled={!podeSeguir}
          onClick={() => onConfirmar(url, step.microFeedback)}>{step.botao || "Continuar"}</button>
      </Rodape>
    </div>
  );
}

function Oferta({ step, steps, respostas, resultado, previa, onCta }: { step: QuizStep; steps: QuizStep[]; respostas: Vars; resultado: QuizResultado | null; previa?: boolean; onCta: () => void }) {
  const linhas = step.resumo !== false ? resumoDe(steps, respostas) : [];
  // Com resultado ponderado, o diagnóstico do perfil vencedor manda; o que o
  // resultado não define cai no campo da etapa de oferta (dá pra ter resultados
  // que só trocam o título). Sem resultados, é a oferta única de sempre.
  const titulo = resultado?.titulo || step.titulo || "Seu resultado está pronto";
  const descricao = resultado?.descricao ?? step.descricao;
  const videoUrl = resultado?.videoUrl || step.videoUrl;
  const cta = resultado?.cta || step.cta;
  const destino = resultado?.destino || step.destino;
  const ir = () => {
    onCta();
    if (previa || !destino) return;
    // O evento de pixel sai antes; o respiro dá tempo de a requisição partir
    // (o `keepalive` do fetch cobre o resto).
    window.setTimeout(() => { window.location.href = destino; }, 120);
  };
  return (
    <div className="tfq-bloco tfq-oferta">
      <h1 className="tfq-h1">{titulo}</h1>
      {descricao && <p className="tfq-h2">{descricao}</p>}

      {videoUrl && (
        <div className="tfq-vsl">
          {/* Vídeo direto (mp4/webm) toca no player nativo; qualquer outra URL
              (YouTube, Vimeo, Panda…) entra por iframe. */}
          {/\.(mp4|webm|ogg)(\?|$)/i.test(videoUrl)
            ? <video className="tfq-video" src={videoUrl} controls playsInline preload="metadata" />
            : <iframe className="tfq-video" src={videoUrl} title="Vídeo" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy" />}
        </div>
      )}

      {linhas.length > 0 && (
        <div className="tfq-resumo">
          <div className="tfq-resumo-tit">Seu perfil</div>
          {linhas.map((l, n) => (
            <div className="tfq-resumo-linha" key={n}>
              <span className="tfq-resumo-p">{l.pergunta}</span>
              <span className="tfq-resumo-r">{l.resposta}</span>
            </div>
          ))}
        </div>
      )}

      <Rodape>
        <button type="button" className="tf-choice tfq-cta" onClick={ir}>{cta || "Continuar"}</button>
        {previa && destino && <p className="tfq-dica-previa">Na prévia o botão não redireciona. Destino: {destino}</p>}
      </Rodape>
    </div>
  );
}

/** Rodapé grudado embaixo: no celular o botão principal tem que estar ao
 *  alcance do polegar, e uma pergunta com oito opções empurrava o "Continuar"
 *  pra fora da dobra. */
function Rodape({ children }: { children: React.ReactNode }) {
  return <div className="tfq-rodape">{children}</div>;
}

// Ícones do `image_choice` sem imagem. São glyphs, não ícones de UI da
// plataforma — o player é uma página pública, fora do sistema de design do ERP.
const ICONE: Record<string, string> = {
  sparkles: "✦", flame: "▲", star: "★", heart: "♥", bolt: "⚡", check: "✓",
  sun: "☀", moon: "☾", clock: "◷", target: "◎", up: "↑", down: "↓",
};

const CSS_QUIZ = `
.tfq-root { display: flex; flex-direction: column; overflow: hidden; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
.tfq-root *, .tfq-root *::before, .tfq-root *::after { box-sizing: border-box; }

/* ── Topo: voltar + barra ── */
.tfq-topo { flex: none; display: flex; align-items: center; gap: 10px; padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px; }
.tfq-voltar { flex: none; width: 44px; height: 44px; margin-left: -10px; display: grid; place-items: center; border: none; background: none; color: currentColor; opacity: .55; cursor: pointer; border-radius: 50%; }
.tfq-voltar:disabled { opacity: 0; pointer-events: none; }
.tfq-voltar:active { transform: scale(.9); }
/* A TRILHA é o ::before (currentColor a 12%), não o elemento: pintar os dois
   deixava a barra sólida — 100% de progresso o tempo todo, que é a única coisa
   que uma barra não pode dizer errado. */
.tfq-barra { flex: 1; height: 6px; border-radius: 99px; background: transparent; position: relative; overflow: hidden; }
.tfq-barra::before { content: ""; position: absolute; inset: 0; background: currentColor; opacity: .12; }
.tfq-barra-fill { position: relative; height: 100%; border-radius: 99px; transition: width .42s cubic-bezier(.32,.72,0,1); }
/* Trilha por marcas: mesma altura e mesmo lugar da barra, então trocar de estilo
   não mexe no layout do topo. A marca apagada usa currentColor pra funcionar em
   fundo claro e escuro sem cor própria. */
.tfq-trilha { flex: 1; display: flex; gap: 4px; height: 6px; }
.tfq-trilha-p { flex: 1; border-radius: 99px; background: currentColor; opacity: .14; transition: background .3s ease-out, opacity .3s ease-out; }
.tfq-trilha-on { opacity: 1; }
.tfq-pct { flex: none; font-size: 12px; font-weight: 700; opacity: .5; font-variant-numeric: tabular-nums; min-width: 34px; text-align: right; }

/* ── Palco ── */
.tfq-palco { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; }
.tfq-etapa { flex: 1; display: flex; flex-direction: column; padding: 8px 20px calc(20px + env(safe-area-inset-bottom, 0px)); max-width: var(--tfq-largura, 620px); width: 100%; margin: 0 auto; animation: tfqEntra .34s cubic-bezier(.32,.72,0,1) both; }
.tfq-etapa[data-dir="tras"] { animation-name: tfqEntraTras; }
/* Termina em \`none\`, nunca em translateY(0): o transform identidade que fica
   aplicado faz do elemento um bloco de contenção e prende position:fixed. */
@keyframes tfqEntra { from { opacity: 0; transform: translate3d(22px,0,0); } to { opacity: 1; transform: none; } }
@keyframes tfqEntraTras { from { opacity: 0; transform: translate3d(-22px,0,0); } to { opacity: 1; transform: none; } }
.tfq-bloco { flex: 1; display: flex; flex-direction: column; }

/* ── Tipografia: tracking por tamanho (título grande fecha, corpo fica em 0) ── */
.tfq-h1 { font-size: clamp(25px, 6.4vw, 36px); line-height: 1.14; letter-spacing: -.022em; font-weight: 800; margin: 0 0 10px; }
.tfq-h2 { font-size: clamp(15px, 3.8vw, 17px); line-height: 1.5; opacity: .72; margin: 0 0 22px; }
.tfq-pergunta { font-size: clamp(21px, 5.4vw, 27px); line-height: 1.22; letter-spacing: -.015em; font-weight: 800; margin: 14px 0 6px; }
.tfq-ajuda { font-size: 14.5px; line-height: 1.5; opacity: .66; margin: 0 0 18px; }
.tfq-limite { font-size: 12.5px; font-weight: 700; opacity: .55; margin: 0 0 10px; }

/* ── Capa ── */
.tfq-capa { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 24px 0; }
.tfq-capa-img { width: 100%; max-width: 320px; height: auto; border-radius: 18px; margin-bottom: 22px; }
.tfq-capa .tfq-cta { width: 100%; max-width: 380px; }
.tfq-passos { display: flex; gap: 6px; margin-top: 20px; }
.tfq-passo { width: 26px; height: 4px; border-radius: 99px; background: currentColor; opacity: .16; }
.tfq-passo-on { opacity: .5; }

/* ── Opções ── */
.tfq-opcoes { display: flex; flex-direction: column; gap: 10px; }
.tfq-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 148px), 1fr)); gap: 10px; }
.tfq-opcao {
  display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px;
  padding: 14px 16px; border-radius: var(--tfq-raio, 14px); cursor: pointer; text-align: left;
  border: 1.5px solid color-mix(in srgb, currentColor 16%, transparent);
  background: var(--tfq-cartao); color: inherit; font: inherit; font-size: 15.5px; font-weight: 600;
  transition: border-color .16s ease-out, background .16s ease-out, transform .16s cubic-bezier(.32,.72,0,1);
}
.tfq-opcao:hover { border-color: color-mix(in srgb, var(--tfq-botao) 45%, transparent); }
.tfq-opcao:active { transform: scale(.985); }
.tfq-opcao.tfq-on { border-color: var(--tfq-botao); background: color-mix(in srgb, var(--tfq-botao) 9%, var(--tfq-cartao)); }
.tfq-op-txt { flex: 1; min-width: 0; }
.tfq-opcao-img { flex-direction: column; align-items: center; text-align: center; gap: 10px; min-height: 132px; padding: 16px 12px; justify-content: center; }
.tfq-op-img { width: 100%; max-height: 92px; object-fit: cover; border-radius: 10px; }
.tfq-op-icone { font-size: 30px; line-height: 1; opacity: .85; }
.tfq-radio { flex: none; width: 21px; height: 21px; border-radius: 50%; border: 2px solid color-mix(in srgb, currentColor 22%, transparent); position: relative; }
.tfq-on .tfq-radio { border-color: var(--tfq-botao); }
.tfq-on .tfq-radio::after { content: ""; position: absolute; inset: 3px; border-radius: 50%; background: var(--tfq-botao); }
.tfq-check { flex: none; width: 21px; height: 21px; border-radius: 6px; display: grid; place-items: center; border: 2px solid color-mix(in srgb, currentColor 22%, transparent); color: transparent; }
.tfq-on .tfq-check { border-color: var(--tfq-botao); background: var(--tfq-botao); color: var(--tfq-texto-botao); }

/* ── Faixa ── */
.tfq-faixa-valor { font-size: 46px; font-weight: 800; letter-spacing: -.03em; text-align: center; margin: 18px 0 12px; font-variant-numeric: tabular-nums; }
/* O sufixo não compete com o número: menor, mais leve, e com a folga que o
   texto colado não tinha. */
.tfq-sufixo { margin-left: .2em; font-size: .5em; font-weight: 700; opacity: .55; letter-spacing: 0; }
.tfq-faixa-pontas .tfq-sufixo { font-size: 1em; margin-left: .25em; opacity: 1; }
.tfq-range { -webkit-appearance: none; appearance: none; width: 100%; height: 34px; background: transparent; cursor: pointer; }
.tfq-range::-webkit-slider-runnable-track { height: 8px; border-radius: 99px; background: linear-gradient(to right, var(--tfq-botao) var(--tfq-frac), color-mix(in srgb, currentColor 14%, transparent) var(--tfq-frac)); }
.tfq-range::-moz-range-track { height: 8px; border-radius: 99px; background: color-mix(in srgb, currentColor 14%, transparent); }
.tfq-range::-moz-range-progress { height: 8px; border-radius: 99px; background: var(--tfq-botao); }
.tfq-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 30px; height: 30px; margin-top: -11px; border-radius: 50%; background: #fff; border: 2px solid var(--tfq-botao); box-shadow: 0 2px 8px rgba(0,0,0,.18); }
.tfq-range::-moz-range-thumb { width: 30px; height: 30px; border-radius: 50%; background: #fff; border: 2px solid var(--tfq-botao); box-shadow: 0 2px 8px rgba(0,0,0,.18); }
.tfq-faixa-pontas { display: flex; justify-content: space-between; font-size: 12.5px; opacity: .5; font-weight: 600; }

/* ── Campo ── */
.tfq-campo { width: 100%; min-height: 56px; padding: 15px 16px; border-radius: var(--tfq-raio, 14px); font-size: 16px; font-family: inherit; background: var(--tfq-cartao); color: inherit; border: 1.5px solid color-mix(in srgb, currentColor 16%, transparent); outline: none; }
.tfq-campo:focus { border-color: var(--tfq-botao); box-shadow: 0 0 0 3px color-mix(in srgb, var(--tfq-botao) 18%, transparent); }
.tfq-campo[aria-invalid="true"] { border-color: #E5484D; }
.tfq-erro { font-size: 13px; font-weight: 600; color: #E5484D; margin: 8px 0 0; }

/* ── Rodapé e CTA ── */
.tfq-rodape { margin-top: auto; padding-top: 22px; position: sticky; bottom: 0; }
/* Botão "auto" estreita no computador mas continua CHEIO no celular: um CTA
   estreito no toque é alvo menor sem nenhum ganho de leitura. */
.tfq-root[data-btn="auto"] .tfq-cta { width: auto; min-width: 220px; margin-inline: auto; }
@media (max-width: 560px) { .tfq-root[data-btn="auto"] .tfq-cta { width: 100%; } }
.tfq-cta {
  display: block; width: 100%; min-height: 54px; padding: 16px 22px; border: none; border-radius: var(--tfq-raio, 14px);
  background: var(--tfq-botao); color: var(--tfq-texto-botao); font: inherit; font-size: 16.5px; font-weight: 800;
  cursor: pointer; letter-spacing: -.01em;
  transition: transform .16s cubic-bezier(.32,.72,0,1), opacity .16s ease-out;
}
.tfq-cta:active { transform: scale(.975); }
.tfq-cta:disabled { opacity: .38; pointer-events: none; }
.tfq-dica-previa { font-size: 11.5px; opacity: .55; text-align: center; margin: 8px 0 0; word-break: break-all; }

/* ── Análise ── */
.tfq-analise { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 18px; padding: 30px 0; }
.tfq-anel { width: 128px; height: 128px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--tfq-cor) var(--tfq-p), color-mix(in srgb, currentColor 12%, transparent) 0); position: relative; }
.tfq-anel::after { content: ""; position: absolute; inset: 11px; border-radius: 50%; background: var(--tfq-cartao); }
.tfq-anel-n { position: relative; z-index: 1; font-size: 27px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.tfq-carregando { font-size: 17px; font-weight: 700; margin: 0; }
.tfq-prova { font-size: 14px; line-height: 1.5; opacity: .68; margin: 0; max-width: 380px; animation: tfqFade .5s ease-out both; }
@keyframes tfqFade { from { opacity: 0; } to { opacity: .68; } }
/* ── Nota / estrelas (rating) ── */
.tfq-estrelas { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; padding: 10px 0; }
.tfq-estrela { border: none; background: none; padding: 4px; line-height: 0; color: var(--tfq-botao); cursor: pointer; border-radius: 10px; -webkit-tap-highlight-color: transparent; transition: transform .12s cubic-bezier(.32,.72,0,1); }
.tfq-estrela:active { transform: scale(.88); }
.tfq-nps { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; padding: 8px 0; }
.tfq-nps-b { min-width: var(--tap, 44px); min-height: var(--tap, 44px); padding: 0 8px; border-radius: 12px; border: 1px solid color-mix(in srgb, currentColor 20%, transparent); background: var(--tfq-cartao); color: inherit; font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: transform .12s cubic-bezier(.32,.72,0,1); }
.tfq-nps-b:active { transform: scale(.92); }

/* ── Envio de arquivo (upload) ── */
.tfq-drop { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%; padding: 26px 18px; border-radius: var(--tfq-raio, 14px); border: 2px dashed color-mix(in srgb, currentColor 26%, transparent); background: var(--tfq-cartao); color: inherit; cursor: pointer; text-align: center; -webkit-tap-highlight-color: transparent; transition: border-color .16s ease, transform .12s cubic-bezier(.32,.72,0,1); }
.tfq-drop:active { transform: scale(.99); }
.tfq-drop:disabled { cursor: default; opacity: .8; }
.tfq-drop[data-estado="pronto"] { border-style: solid; border-color: var(--tfq-botao); }
.tfq-drop[data-estado="erro"] { border-color: var(--erro, #e5484d); }
.tfq-drop-t { font-size: 15px; font-weight: 700; word-break: break-word; }
.tfq-drop-s { font-size: 12.5px; opacity: .6; }
.tfq-erro { color: var(--erro, #e5484d); font-size: 13px; font-weight: 600; margin: 8px 0 0; text-align: center; }

.tfq-micro { align-items: center; justify-content: center; gap: 16px; text-align: center; }
.tfq-micro-txt { font-size: 17px; font-weight: 700; margin: 0; }
.tfq-spinner { width: 34px; height: 34px; border-radius: 50%; border: 3px solid color-mix(in srgb, currentColor 14%, transparent); border-top-color: currentColor; animation: tfqGira .7s linear infinite; }
@keyframes tfqGira { to { transform: rotate(360deg); } }

/* ── Oferta ── */
.tfq-oferta { padding-top: calc(18px + env(safe-area-inset-top, 0px)); }
.tfq-vsl { margin: 0 0 20px; border-radius: 16px; overflow: hidden; background: #000; }
.tfq-video { display: block; width: 100%; aspect-ratio: 16 / 9; border: none; }
.tfq-resumo { border-radius: 16px; padding: 16px 18px; background: var(--tfq-cartao); border: 1px solid color-mix(in srgb, currentColor 12%, transparent); }
.tfq-resumo-tit { font-size: 11px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; opacity: .5; margin-bottom: 10px; }
.tfq-resumo-linha { display: flex; gap: 12px; padding: 7px 0; font-size: 14px; }
.tfq-resumo-linha + .tfq-resumo-linha { border-top: 1px solid color-mix(in srgb, currentColor 9%, transparent); }
.tfq-resumo-p { flex: 1; min-width: 0; opacity: .62; }
.tfq-resumo-r { flex: none; max-width: 55%; text-align: right; font-weight: 700; }

@media (prefers-reduced-motion: reduce) {
  .tfq-etapa { animation: tfqSurge .2s ease-out both; }
  .tfq-barra-fill, .tfq-opcao, .tfq-cta { transition: none; }
  .tfq-opcao:active, .tfq-cta:active, .tfq-voltar:active { transform: none; }
  .tfq-spinner { animation-duration: 1.8s; }
  @keyframes tfqSurge { from { opacity: 0; } to { opacity: 1; } }
}
`;
