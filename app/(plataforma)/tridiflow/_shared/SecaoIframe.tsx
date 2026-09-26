"use client";

// "Publicar como iframe" — a MESMA seção em todos os editores (config do fluxo,
// modal de publicação do fluxo/quiz e modal da página). O iframe funciona POR
// CIMA de qualquer tipo: `iframeAtivo` liga sem mudar o tipo do projeto —
// o fluxo continua fluxo, o quiz continua quiz, a página continua página, e
// desligar volta tudo ao normal. Só o projeto dedicado (modo "iframe") é que
// liga/desliga pelo próprio `modo`.
import { Icon } from "../../Icon";
import { urlDeIframe, type BotSettings } from "@/lib/tridiflow";
import { Caixa } from "../../ui/controles";

const inp: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9,
  border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
  fontSize: 12.5, outline: "none",
};

export function SecaoIframe({ settings, onChange }: { settings: BotSettings; onChange: (s: BotSettings) => void }) {
  const projetoIframe = settings.modo === "iframe";
  const ligado = projetoIframe || !!settings.iframeAtivo;
  // O campo guarda o que a pessoa COLOU — URL crua ou o código <iframe>
  // inteiro (as configs do snippet valem no publicado, ver iframeEmbed).
  const url = settings.iframeUrl ?? "";
  const extraida = urlDeIframe(url);
  const ehSnippet = /^<iframe/i.test(url.trim());
  const invalida = !!url && !/^https?:\/\//i.test(extraida);
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <Caixa marcado={ligado} onChange={(marc) => {
            // Projeto dedicado liga/desliga pelo modo; os demais pela chave —
            // assim ligar o iframe num quiz NÃO tira ele da lista de quizzes.
            onChange(projetoIframe
              ? { ...settings, modo: marc ? "iframe" : "chat" }
              : { ...settings, iframeAtivo: marc || undefined });
          }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>Publicar como iframe</span>
      </label>
      <p style={{ fontSize: 10.5, color: "var(--text-dim)", margin: "4px 0 0", lineHeight: 1.4 }}>
        O link publicado abre a página abaixo em <strong>tela cheia</strong>, no lugar do conteúdo do projeto.
        Nada se perde — desligue e o projeto volta ao que era. Pixels e custom head continuam disparando.
      </p>
      {ligado && (
        <div style={{ marginTop: 8 }}>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-dim)", marginBottom: 4 }}>URL da página — ou cole o código &lt;iframe&gt; inteiro</span>
            <textarea value={url} rows={ehSnippet ? 3 : 1}
              onChange={(e) => onChange({ ...settings, iframeUrl: e.target.value || undefined })}
              placeholder={'https://exemplo.com/pagina — ou <iframe src="…" style="…"></iframe>'}
              spellCheck={false}
              style={{ ...inp, resize: "vertical", fontFamily: ehSnippet ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined, fontSize: ehSnippet ? 11.5 : 12.5, lineHeight: 1.45 }} />
          </label>
          {invalida && (
            <p style={{ fontSize: 10.5, color: "var(--atencao)", margin: "6px 0 0", display: "flex", alignItems: "center", gap: 5 }}>
              <Icon name="alert-triangle" size={12} color="var(--atencao)" /> A URL precisa começar com http:// ou https:// — pode colar o código &lt;iframe&gt; inteiro.
            </p>
          )}
          {ehSnippet && !invalida && (
            <p style={{ fontSize: 10.5, color: "var(--ok, var(--text-dim))", margin: "6px 0 0", overflowWrap: "anywhere" }}>
              Publicando <code style={{ fontSize: 10.5 }}>{extraida}</code> — com o style e as permissões do código colado.
            </p>
          )}
          <p style={{ fontSize: 10, color: "var(--text-dim)", margin: "6px 0 0", lineHeight: 1.4 }}>
            Alguns sites bloqueiam serem embutidos (X-Frame-Options) — se o link abrir em branco, o site não permite iframe.
            {!projetoIframe && " Sem URL válida, o projeto publica normal."}
          </p>
        </div>
      )}
    </div>
  );
}
