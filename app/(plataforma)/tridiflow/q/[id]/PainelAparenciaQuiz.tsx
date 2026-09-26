"use client";

// ── Aparência do quiz ────────────────────────────────────────────────────────
// Até aqui o quiz não tinha aparência própria: ele lia o `Theme` do chat, então
// mudar a cara do funil mudava a cara da conversa junto. Este painel escreve em
// `quiz.tema`, e TODO campo é opcional — vazio significa "herda do chat", que é
// exatamente como os funis existentes se comportam.
//
// Reusa as peças de `p/_ui.tsx` (as mesmas do editor de página) em vez de
// inventar controle novo: é o que mantém os dois editores parecidos.

import { Campo, LinhaCor, Numero, Secao, Segmentado, Texto } from "../../p/_ui";
import { TEMAS_QUIZ, resolverTemaQuiz, type Quiz, type TemaQuiz } from "@/lib/tridiflow-quiz";
import type { Theme } from "@/lib/tridiflow";

export function PainelAparenciaQuiz({ quiz, onChange, temaChat }: {
  quiz: Quiz;
  onChange: (q: Quiz) => void;
  /** Tema do chat — só pra mostrar de onde vem a cor quando o campo está vazio. */
  temaChat: Theme;
}) {
  const tema = quiz.tema ?? {};
  const efetivo = resolverTemaQuiz(tema, temaChat);

  // Campo vazio some do objeto em vez de virar "" — é o que faz a queda pro
  // tema do chat continuar valendo depois de limpar.
  const set = <K extends keyof TemaQuiz>(k: K, v: TemaQuiz[K] | undefined) => {
    const t: TemaQuiz = { ...tema };
    if (v === undefined || v === "") delete t[k]; else t[k] = v;
    onChange({ ...quiz, tema: Object.keys(t).length ? t : undefined });
  };

  const aplicarPreset = (t: TemaQuiz) => onChange({ ...quiz, tema: { ...tema, ...t } });

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <Secao titulo="Estilos prontos">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 104px), 1fr))", gap: 8 }}>
          {TEMAS_QUIZ.map((p) => (
            <button key={p.id} type="button" onClick={() => aplicarPreset(p.tema)} title={`Aplicar o estilo ${p.rotulo}`}
              style={{
                display: "grid", gap: 7, padding: 9, borderRadius: 11, cursor: "pointer",
                border: "1px solid var(--border)", background: "var(--surface)", minHeight: "var(--tap, 44px)",
              }}>
              <span aria-hidden style={{ display: "flex", height: 30, borderRadius: 7, overflow: "hidden", border: "1px solid var(--border)" }}>
                <span style={{ flex: 2, background: p.tema.corFundo }} />
                <span style={{ flex: 1, background: p.tema.corCartao }} />
                <span style={{ flex: 1, background: p.tema.corBotao }} />
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text)" }}>{p.rotulo}</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.45, margin: "10px 0 0" }}>
          Um estilo pronto preenche as cores de uma vez. Depois dá pra mexer em cada uma.
        </p>
      </Secao>

      <Secao titulo="Cores">
        <LinhaCor label="Fundo" valor={tema.corFundo} onChange={(v) => set("corFundo", v)} padrao={efetivo.fundo} />
        <LinhaCor label="Texto" valor={tema.corTexto} onChange={(v) => set("corTexto", v)} padrao={efetivo.texto} />
        <LinhaCor label="Opções e campos" valor={tema.corCartao} onChange={(v) => set("corCartao", v)} padrao={efetivo.cartao} />
        <LinhaCor label="Botão" valor={tema.corBotao} onChange={(v) => set("corBotao", v)} padrao={efetivo.botao} />
        <LinhaCor label="Texto do botão" valor={tema.corTextoBotao} onChange={(v) => set("corTextoBotao", v)} padrao={efetivo.textoBotao} />
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.45, margin: "8px 0 0" }}>
          Cor em branco herda do tema do chat. Use “limpar” pra voltar a herdar.
        </p>
      </Secao>

      <Secao titulo="Forma">
        <Campo label="Cantos" hint="Vale pra opção, campo e botão.">
          <Numero valor={tema.raio} onChange={(v) => set("raio", v)} min={0} max={40} sufixo="px" />
        </Campo>
        <Campo label="Largura máxima" hint="Só no computador — no celular quem manda é a tela.">
          <Numero valor={tema.larguraMax} onChange={(v) => set("larguraMax", v)} min={360} max={1100} sufixo="px" />
        </Campo>
        <Campo label="Botão principal">
          <Segmentado
            valor={tema.botaoLargura ?? "cheia"}
            onChange={(v) => set("botaoLargura", v === "cheia" ? undefined : v)}
            opcoes={[
              { valor: "cheia", label: "Cheio", titulo: "Ocupa a largura toda" },
              { valor: "auto", label: "Estreito", titulo: "Estreito no computador; no celular continua cheio" },
            ]}
          />
        </Campo>
      </Secao>

      <Secao titulo="Progresso">
        <Campo label="Estilo" hint="Some sozinho na capa e na oferta — lá não há o que ter concluído.">
          <Segmentado
            valor={tema.progresso ?? "barra"}
            onChange={(v) => set("progresso", v === "barra" ? undefined : v)}
            opcoes={[
              { valor: "barra", label: "Barra" },
              { valor: "passos", label: "Passos" },
              { valor: "nenhum", label: "Nenhum" },
            ]}
          />
        </Campo>
      </Secao>

      <Secao titulo="Fonte" aberta={false}>
        <Campo label="Família" hint="Nome de uma fonte instalada no aparelho de quem responde. Sem essa fonte, o navegador usa a próxima da lista.">
          <Texto valor={tema.fonte ?? ""} onChange={(v) => set("fonte", v)} placeholder='Ex.: Georgia, serif' />
        </Campo>
      </Secao>
    </div>
  );
}
