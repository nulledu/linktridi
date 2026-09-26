const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

// Sem a cor da pessoa (valor ausente ou estranho), a folha sai em tinta e
// cinza — o mesmo recurso do `data-graf="mono"` —, não numa cor de marca inventada.
const ACCENT_PADRAO = "#16161a";

/** A cor vem do `getComputedStyle`, mas entra num <style>: só passa o que tem cara de cor. */
function accentSeguro(value: string | undefined): string {
  const v = (value ?? "").trim();
  return v && v.length <= 64 && /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|color)\([0-9a-z\s.,%/+-]+\))$/i.test(v) ? v : ACCENT_PADRAO;
}

function printableContent(report: HTMLElement): string {
  const clone = report.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("iframe, script, video, button, .ci-report-controls, .ci-report-actions").forEach((node) => node.remove());
  // Na tela só o slide atual aparece; no papel vão todos.
  clone.querySelectorAll("[hidden], [inert], [aria-hidden]").forEach((node) => {
    if (!node.classList.contains("ci-slide")) return;
    node.removeAttribute("hidden");
    node.removeAttribute("inert");
    node.removeAttribute("aria-hidden");
  });
  return clone.innerHTML;
}

// Espelho do deck do globals.css (bloco "Apresentação para editores"), com a
// paleta de papel no lugar dos tokens do tema: a folha é sempre clara, mesmo
// quando quem exporta está no tema escuro. As medidas são as MESMAS em `cqi` —
// aqui o palco é a folha A4 deitada (297mm), então o PDF sai com a composição
// da tela. Mudou o slide lá, muda aqui; o teste confere que toda classe usada
// nos slides tem regra neste arquivo.
const PRINT_CSS = `
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; animation: none !important; transition: none !important; }
  html, body { margin: 0; padding: 0; background: #eef1f8; color: var(--text); font-family: Manrope, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .ci-slides { display: block; width: 297mm; container: ci-folha / inline-size; }
  .ci-slide { position: relative; display: flex; flex-direction: column; gap: 2cqi; width: 297mm; height: 210mm; overflow: hidden; padding: 4.6cqi 5.2cqi; background: #ffffff; color: var(--text); break-after: page; page-break-after: always; }
  .ci-slide:last-child { break-after: auto; page-break-after: auto; }
  .ci-slide-kicker { display: flex; align-items: center; gap: .9cqi; color: var(--primary-texto); font-size: 1.05cqi; font-weight: 800; letter-spacing: .12em; line-height: 1.2; text-transform: uppercase; }
  .ci-slide-kicker::before { content: ""; width: 2.4cqi; height: 2px; border-radius: 2px; background: currentColor; }
  .ci-slide-body { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: 2.4cqi; }
  .ci-slide h2, .ci-slide h3 { margin: 0; color: var(--text); font-weight: 800; letter-spacing: -.035em; line-height: 1.04; text-wrap: balance; }
  .ci-slide h2 { font-size: 5.2cqi; overflow-wrap: anywhere; }
  .ci-slide h3 { max-width: 30ch; font-size: 3.4cqi; }
  .ci-slide p { max-width: 62ch; margin: 0; color: var(--text-dim); font-size: 1.4cqi; line-height: 1.5; }
  .ci-slide-foot { display: flex; justify-content: space-between; gap: 2cqi; padding-top: 1.3cqi; border-top: 1px solid var(--border); color: var(--text-dim); font-size: 1cqi; font-variant-numeric: tabular-nums; }
  .ci-cover { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4cqi; }
  .ci-cover[data-midia] { grid-template-columns: 22cqi minmax(0, 1fr) auto; }
  .ci-cover-media { align-self: stretch; min-height: 0; margin: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 1cqi; background: #f3f4f8; }
  .ci-cover-media img { width: 100%; height: 100%; display: block; object-fit: cover; }
  .ci-cover-text { min-width: 0; display: flex; flex-direction: column; gap: 1.6cqi; }
  .ci-slide .ci-cover-period { color: var(--text); font-size: 1.7cqi; font-weight: 650; }
  .ci-cover-meta { display: flex; flex-wrap: wrap; gap: .8cqi; }
  .ci-cover-meta span { padding: .45cqi 1.1cqi; border: 1px solid var(--border); border-radius: 999px; color: var(--text-dim); font-size: 1.1cqi; font-weight: 650; }
  .ci-cover-score { display: grid; justify-items: center; gap: 1cqi; }
  .ci-cover-score > span { color: var(--text-dim); font-size: 1cqi; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .ci-ring { position: relative; width: 16cqi; aspect-ratio: 1; }
  .ci-ring svg { width: 100%; height: 100%; display: block; }
  .ci-ring circle { fill: none; stroke-width: 7; }
  .ci-ring-trilho { stroke: #e9eaf0; }
  .ci-ring-valor { stroke: var(--primary); stroke-linecap: round; }
  .ci-ring > div { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; }
  .ci-ring strong { color: var(--text); font-size: 4.8cqi; font-weight: 800; letter-spacing: -.05em; line-height: 1; font-variant-numeric: tabular-nums; }
  .ci-ring small { margin-top: .3cqi; color: var(--text-dim); font-size: 1cqi; }
  .ci-signals { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3cqi; }
  .ci-signal { min-width: 0; display: flex; flex-direction: column; gap: .8cqi; padding-top: 1.6cqi; border-top: 2px solid var(--text); }
  .ci-signal small { color: var(--text); font-size: 1.35cqi; font-weight: 800; }
  .ci-signal strong { color: var(--text); font-size: 5.4cqi; font-weight: 800; letter-spacing: -.05em; line-height: .95; font-variant-numeric: tabular-nums; }
  .ci-signal-name { color: var(--text-dim); font-size: 1.15cqi; font-weight: 600; line-height: 1.35; }
  .ci-signal-bars { display: grid; gap: .55cqi; margin-top: .6cqi; }
  .ci-signal-bars i, .ci-legend i { display: block; height: .7cqi; border-radius: 999px; background: var(--primary); }
  .ci-signal-bars i { width: calc(var(--v, 0) * 100%); }
  .ci-signal-bars i[data-apoio], .ci-legend i[data-apoio] { background: none; border: 1px dashed #9a9fad; }
  .ci-signal em { color: var(--text-dim); font-size: 1.2cqi; font-style: normal; font-weight: 750; }
  .ci-signal em[data-verdict="acima"] { color: var(--pos); }
  .ci-signal em[data-verdict="abaixo"] { color: var(--neg); }
  .ci-legend { display: flex; flex-wrap: wrap; gap: .8cqi 2.4cqi; color: var(--text-dim); font-size: 1cqi; }
  .ci-legend span { display: inline-flex; align-items: center; gap: .7cqi; }
  .ci-legend i { width: 2.4cqi; }
  .ci-retention { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); align-items: center; gap: 4.4cqi; }
  .ci-funil { display: grid; gap: .7cqi; margin: 0; padding: 0; list-style: none; }
  .ci-funil li { display: flex; align-items: center; justify-content: center; gap: 1.2cqi; height: 5.4cqi; color: #fff; }
  .ci-funil li:first-child { border-radius: 1.2cqi 1.2cqi 0 0; }
  .ci-funil span { color: rgba(255, 255, 255, .86); font-size: 1.3cqi; font-weight: 650; white-space: nowrap; }
  .ci-funil strong { color: #fff; font-size: 1.6cqi; font-weight: 800; font-variant-numeric: tabular-nums; }
  .ci-funil li[data-queda] strong { padding: 0 .8cqi; border-radius: 999px; background: color-mix(in srgb, var(--neg) 82%, #000); }
  .ci-bar { height: 1.4cqi; overflow: hidden; border-radius: 999px; background: #eceef3; }
  .ci-bar i { display: block; width: calc(var(--v, 0) * 100%); height: 100%; border-radius: inherit; background: var(--primary); }
  .ci-retention-callout { display: grid; gap: 1cqi; padding-left: 2.4cqi; border-left: 2px solid var(--primary); }
  .ci-retention-callout small { color: var(--text-dim); font-size: 1cqi; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .ci-retention-callout strong { color: var(--text); font-size: 4.2cqi; font-weight: 800; letter-spacing: -.045em; line-height: 1; }
  .ci-reading { display: flex; flex-direction: column; gap: 2cqi; }
  .ci-reading h3 { max-width: 24ch; font-size: 4.2cqi; }
  .ci-slide .ci-reading-evidence { display: inline-flex; align-items: center; gap: .8cqi; width: fit-content; max-width: 100%; padding: .7cqi 1.3cqi; border: 1px solid var(--border); border-radius: 999px; color: var(--text); font-size: 1.2cqi; font-weight: 700; font-variant-numeric: tabular-nums; }
  .ci-editor-note { display: flex; align-items: flex-start; gap: 1.2cqi; max-width: 64ch; padding-top: 1.6cqi; border-top: 1px solid var(--border); color: var(--text-dim); font-size: 1.25cqi; line-height: 1.5; }
  .ci-reading-evidence > svg, .ci-editor-note > svg { flex: none; width: 1.7cqi; height: 1.7cqi; }
  .ci-editor-tests { display: grid; margin: 0; padding: 0; list-style: none; }
  .ci-editor-tests li { display: grid; grid-template-columns: 6cqi minmax(0, 1fr); align-items: baseline; gap: 2cqi; padding: 1.5cqi 0; border-top: 1px solid var(--border); }
  .ci-editor-tests li:last-child { border-bottom: 1px solid var(--border); }
  .ci-editor-tests b { color: var(--primary-texto); font-size: 3cqi; font-weight: 800; letter-spacing: -.04em; line-height: 1; font-variant-numeric: tabular-nums; }
  .ci-editor-tests span { display: block; color: var(--text); font-size: 1.9cqi; font-weight: 700; letter-spacing: -.015em; line-height: 1.25; }
  .ci-editor-tests small { display: block; margin-top: .5cqi; color: var(--text-dim); font-size: 1.15cqi; }
  .ci-engajamento { display: grid; gap: 2.6cqi; }
  .ci-eng-grupo { display: grid; gap: 1.2cqi; min-width: 0; }
  .ci-eng-titulo { color: var(--text-dim); font-size: 1cqi; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .ci-eng-itens { display: grid; grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr)); gap: 2.4cqi; }
  .ci-eng-item { min-width: 0; display: flex; flex-direction: column; gap: .6cqi; padding-top: 1.2cqi; border-top: 1px solid var(--border); }
  .ci-eng-item > span { color: var(--text-dim); font-size: 1.2cqi; font-weight: 700; }
  .ci-eng-item strong { color: var(--text); font-size: 3cqi; font-weight: 800; letter-spacing: -.045em; line-height: 1; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .ci-eng-grupo[data-grupo="publico"] .ci-eng-item strong { font-size: 4.4cqi; }
  .ci-eng-item em { color: var(--text-dim); font-size: 1.05cqi; font-style: normal; font-weight: 700; line-height: 1.35; }
  .ci-eng-item em[data-tom="bom"] { color: var(--pos); }
  .ci-eng-item em[data-tom="ruim"] { color: var(--neg); }
  .ci-slide .ci-eng-aviso { font-size: 1.1cqi; }
`;

export function buildPrintableReportHtml(report: HTMLElement, title: string, options: { accent?: string } = {}): string {
  const accent = accentSeguro(options.accent);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --primary: ${accent};
    --primary-texto: color-mix(in srgb, ${accent} 80%, #000000);
    --text: #16161a; --text-dim: #5e6472; --border: #e2e4eb;
    --pos: #1b7632; --neg: #be342b;
  }
${PRINT_CSS}
</style>
</head>
<body><main class="ci-slides">${printableContent(report)}</main>
<script>
  window.addEventListener("load", async () => {
    const images = Array.from(document.images);
    await Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.onload = image.onerror = resolve; })));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    window.addEventListener("afterprint", () => window.close(), { once: true });
    setTimeout(() => { window.focus(); window.print(); }, 80);
  });
</script></body></html>`;
}

export function printCreativeReport(report: HTMLElement, title: string, options: { accent?: string } = {}): boolean {
  const popup = window.open("", "_blank", "popup,width=1200,height=850");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(buildPrintableReportHtml(report, title, options));
  popup.document.close();
  popup.focus();
  return true;
}
