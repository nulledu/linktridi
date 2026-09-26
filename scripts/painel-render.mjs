// Renderiza cada painel/slide num Chromium DE VERDADE e sobe o PNG pro Storage.
//
// Por que existe: a TV box do galpão é Allwinner H3 / Android 7 / WebView 55
// (Chrome de 2016) — sem CSS Grid, clamp nem container queries. O painel
// moderno não desenha ali de jeito nenhum. Então a página é renderizada AQUI,
// por um Chrome atual, e a TV só mostra a imagem: fica idêntica ao navegador
// porque É o navegador.
//
// Uso: node scripts/painel-render.mjs [base]
//   base = URL do site (default https://tridigaius.vercel.app)
//
// Sobe para o bucket `paineis`: <chave>-<n>.png e um manifesto <chave>.json.
// A chave é `perfil-<id>` ou `tipo-<t>` — o mesmo que o "modo imagem" do painel
// usa para montar as URLs.

import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] || "https://tridigaius.vercel.app";
const PORTA = 9356;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

// ── credenciais do Storage ───────────────────────────────────────────────────
// No CI (GitHub Actions) vêm do ambiente; localmente, do .env.local.
function env(nome) { return process.env[nome]; }
let arquivo = {};
try {
  arquivo = Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
      .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
  );
} catch { /* no CI não há .env.local */ }
const SUPA = env("NEXT_PUBLIC_SUPABASE_URL") || arquivo.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_ROLE")
  || arquivo.SUPABASE_SERVICE_ROLE_KEY || arquivo.SUPABASE_SERVICE_ROLE;
if (!SUPA || !KEY) { console.error("faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(3); }

// O Chrome do runner (Linux/CI) ou o do Mac. `CHROME_BIN` sobrepõe.
const CHROME_BIN = process.env.CHROME_BIN
  || (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "google-chrome");

// ── o que renderizar ─────────────────────────────────────────────────────────
// Descobre os perfis publicados; a logística é 9:16 (retrato).
const cfg = await (await fetch(`${BASE}/api/config`)).json();
const ms = cfg.slideIntervalMs || 20000;
const alvos = [];
for (const p of cfg.perfis || []) {
  const retrato = (p.paraTela || "").includes("9:16") || /logist/i.test(p.nome);
  alvos.push({
    chave: `perfil-${p.id}`,
    url: (n) => `${BASE}/painel?tipo=vendas&perfil=${p.id}&slide=${n}`,
    slides: Math.max(1, (p.slides || []).length),
    w: retrato ? 720 : 1280, h: retrato ? 1280 : 720, ms,
  });
}

// ── Chrome headless + CDP (sem dependência) ──────────────────────────────────
const perfil = mkdtempSync(join(tmpdir(), "render-"));
const chrome = spawn(CHROME_BIN, ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", `--remote-debugging-port=${PORTA}`,
  `--user-data-dir=${perfil}`, "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--force-device-scale-factor=1", "--hide-scrollbars"], { stdio: "ignore" });
chrome.on("error", (e) => { console.error("chrome:", e.message); process.exit(2); });
let vivo = false;
for (let i = 0; i < 100 && !vivo; i++) { try { await fetch(`http://127.0.0.1:${PORTA}/json/version`); vivo = true; } catch { await dorme(200); } }
if (!vivo) { chrome.kill(); console.error("depurador não subiu"); process.exit(2); }

async function sessao() {
  const alvo = await (await fetch(`http://127.0.0.1:${PORTA}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); const p = m.id && pend.get(m.id); if (!p) return; pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); };
  const cmd = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => { pend.set(i, { res, rej }); setTimeout(() => { if (pend.delete(i)) rej(new Error("timeout " + method)); }, 60000); }); };
  return { cmd, fecha: () => ws.close(), alvoId: alvo.id };
}

async function subir(caminho, bytes, tipo) {
  const r = await fetch(`${SUPA}/storage/v1/object/paineis/${caminho}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": tipo, "x-upsert": "true" },
    body: bytes,
  });
  if (!r.ok) throw new Error(`upload ${caminho}: ${r.status} ${await r.text()}`);
}

let total = 0;
for (const a of alvos) {
  const urls = [];
  for (let n = 0; n < a.slides; n++) {
    const s = await sessao();
    await s.cmd("Page.enable");
    await s.cmd("Emulation.setDeviceMetricsOverride", { width: a.w, height: a.h, deviceScaleFactor: 1, mobile: false });
    await s.cmd("Page.navigate", { url: a.url(n) });
    await dorme(8000); // React monta + dados chegam (8s: dados vêm em ~2-3s)
    const { data } = await s.cmd("Page.captureScreenshot", { format: "png" });
    s.fecha();
    await fetch(`http://127.0.0.1:${PORTA}/json/close/${s.alvoId}`).catch(() => {});
    const nome = `${a.chave}-${n}.png`;
    await subir(nome, Buffer.from(data, "base64"), "image/png");
    urls.push({ url: `${SUPA}/storage/v1/object/public/paineis/${nome}`, ms: a.ms });
    total++;
    console.log(`  ${nome} (${a.w}x${a.h})`);
  }
  const manifesto = { chave: a.chave, w: a.w, h: a.h, geradoEm: Date.now(), slides: urls };
  await subir(`${a.chave}.json`, Buffer.from(JSON.stringify(manifesto)), "application/json");
  console.log(`✓ ${a.chave}: ${a.slides} slides + manifesto`);
}
chrome.kill();
console.log(`\n${total} imagens renderizadas e no Storage.`);
