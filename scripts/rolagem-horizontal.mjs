#!/usr/bin/env node
// ── Varredura de rolagem horizontal ──────────────────────────────────────────
//
// Abre cada tela do banco de provas num Chrome de verdade, em larguras de
// celular, tablet e notebook, e mede `documentElement.scrollWidth - clientWidth`.
// Quando sobra largura, aponta os elementos culpados.
//
// POR QUE UM SCRIPT E NÃO UM TESTE: a trava do `npm test`
// (`lib/__tests__/rolagem-horizontal.test.ts`) pega as causas MECÂNICAS lendo o
// código — faixa de grade rígida, piso de largura sem bloco que role, tabela
// solta. Ela não sabe somar padding com fonte com o que o dado real trouxe.
// Isso só o navegador mede, e navegador não roda no vitest.
//
// Uso (com o `npm run dev` de pé):
//     node scripts/rolagem-horizontal.mjs
//     node scripts/rolagem-horizontal.mjs /dev-mobile /dev-tridify     # só estas
//     LARGURAS=320,768 BASE=http://localhost:3001 node scripts/...
//
// Sem argumento ele descobre as rotas sozinho: todo `/dev-*` com `page.tsx`
// mais os modos `?ws=` que o `app/dev-mobile/page.tsx` declara. É de propósito
// — lista escrita à mão envelhece calada, e tela nova sem medição é justamente
// como a rolagem lateral volta.
//
// LEIA O RESULTADO ASSIM:
//   ROLA  → a página rola de lado. É o defeito na sua forma clássica.
//   CORTA → sobra largura mas a fundação CORTA (`overflow-x: clip` até 760px).
//           Não rola, mas o excedente fica INALCANÇÁVEL — igualmente defeito.
//   ok    → sobra zero.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const BASE = process.env.BASE || "http://localhost:3000";
const PORTA = Number(process.env.PORTA_CDP || 9333);
const LARGURAS = (process.env.LARGURAS || "320,390,430,768,1024").split(",").map(Number);
const ESPERA = Number(process.env.ESPERA || 2200);   // tempo pro cliente montar

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// ── Descoberta das rotas ─────────────────────────────────────────────────────
function rotasDoBancoDeProvas() {
  const rotas = [];
  const anda = (dir, prefixo) => {
    for (const nome of readdirSync(dir)) {
      const full = join(dir, nome);
      if (statSync(full).isDirectory()) anda(full, `${prefixo}/${nome}`);
      else if (nome === "page.tsx") rotas.push(prefixo || "/");
    }
  };
  const app = join(RAIZ, "app");
  for (const nome of readdirSync(app)) {
    if (!nome.startsWith("dev-")) continue;
    anda(join(app, nome), `/${nome}`);
  }
  // Segmento dinâmico não é endereço: `[[...rota]]` vira a própria raiz.
  const limpas = rotas.map((r) => r.replace(/\/\[\[?\.*\.\.\.?[^\]]*\]\]?/g, "")).filter(Boolean);

  // Boa parte da cobertura não está no CAMINHO e sim na query: cada `?ws=` do
  // /dev-mobile monta uma tela REAL da plataforma com dados falsos, e alguns
  // harnesses usam `?tela=` pro mesmo fim. Ler os modos do próprio código é o
  // que faz tela nova entrar na medição sem ninguém cadastrar nada.
  const modos = [];
  const juntaModos = (dir, raiz, chavesDaUrl) => {
    for (const nome of readdirSync(dir)) {
      const full = join(dir, nome);
      if (statSync(full).isDirectory()) { juntaModos(full, raiz, chavesDaUrl); continue; }
      if (!/\.tsx$/.test(nome)) continue;
      const txt = readFileSync(full, "utf8");
      for (const [, chave, valor] of txt.matchAll(/\b(\w+) === "([a-z0-9-]+)"/g)) {
        // Só o que vem da URL. `tela` no /dev-recebimento é `useState` de abas
        // internas: virar `?tela=locais` daria três medições da MESMA tela,
        // parecendo cobertura sem cobrir nada.
        if (chavesDaUrl.has(chave)) modos.push(`${raiz}?${chave}=${valor}`);
      }
    }
  };
  for (const nome of readdirSync(app)) {
    if (!nome.startsWith("dev-")) continue;
    let pagina = "";
    try { pagina = readFileSync(join(app, nome, "page.tsx"), "utf8"); } catch { continue; }
    // As chaves declaradas no tipo do `searchParams` — é o contrato da rota.
    const tipo = pagina.match(/searchParams\s*:\s*Promise<\{([^}]*)\}>/);
    const chaves = new Set(tipo ? [...tipo[1].matchAll(/(\w+)\s*\??\s*:/g)].map((m) => m[1]) : []);
    if (chaves.size) juntaModos(join(app, nome), `/${nome}`, chaves);
  }

  return [...new Set([...limpas, ...modos])].sort();
}

// ── Sobra de propósito ───────────────────────────────────────────────────────
// O `/dev-mobile` é o corpo de prova da FUNDAÇÃO: ele monta de propósito uma
// `<table>` crua e larga pra provar que `table { display: block; overflow-x:
// auto }` faz a tabela rolar dentro do bloco. Essa regra vale até 760px, então
// acima disso o corpo de prova estoura — e tem que estourar mesmo, senão ele
// não estaria provando nada. Tela de verdade nunca entra aqui: toda tabela do
// sistema já nasce dentro de `TabelaOuCards` ou de um `overflowX: auto`.
const DE_PROPOSITO = [
  { rota: "/dev-mobile", acima: 760, motivo: "tabela crua é o corpo de prova da regra da fundação (só vale até 760px)" },
];
const ehDeProposito = (rota, largura) =>
  DE_PROPOSITO.find((d) => d.rota === rota && largura > d.acima);

// ── CDP mínimo (sem dependência: o Node traz WebSocket) ──────────────────────
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

class Sessao {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); }
  static async abrir(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const s = new Sessao(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      const p = m.id && s.pend.get(m.id);
      if (!p) return;
      s.pend.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    };
    return s;
  }
  envia(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      this.pend.set(id, { res, rej });
      setTimeout(() => { if (this.pend.delete(id)) rej(new Error(`timeout ${method}`)); }, 40000);
    });
  }
  fecha() { try { this.ws.close(); } catch { /* já foi */ } }
}

// ── O que roda DENTRO da página ──────────────────────────────────────────────
// Duas armadilhas conhecidas moram aqui (ver a memória "vazamento por elemento
// posicionado"):
//   1. filho de contêiner que ROLA reporta rect grande e é recortado de
//      propósito — contá-lo é falso positivo;
//   2. html/body têm `overflow-x: clip` na fundação, então subir a árvore até o
//      html marca TUDO como contido — falso negativo. A subida para no body.
const AUDITORIA = String.raw`
(() => {
  const de = document.documentElement;
  const cw = de.clientWidth;
  const sobra = de.scrollWidth - cw;

  // "Sobrar" e "rolar" são coisas diferentes: até 760px a fundação corta em vez
  // de rolar, e o excedente vira conteúdo inalcançável.
  const antes = window.scrollX;
  window.scrollTo(9999, window.scrollY);
  const rola = Math.round(window.scrollX);
  window.scrollTo(antes, window.scrollY);
  if (sobra <= 0) return { sobra: 0, rola, culpados: [] };

  function recortado(el, pos) {
    let p = el.parentElement;
    while (p && p !== document.body && p !== de) {
      if (pos !== "fixed" && /(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) {
        if (el.getBoundingClientRect().right > p.getBoundingClientRect().right + 1) return true;
      }
      p = p.parentElement;
    }
    return false;
  }

  function nome(el) {
    const cls = (typeof el.className === "string" && el.className.trim())
      ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    const est = (el.getAttribute("style") || "").slice(0, 90);
    return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + cls + (est ? " {" + est + "}" : "");
  }

  const brutos = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const pos = getComputedStyle(el).position;
    // position:fixed não entra na extensão rolável do documento; incluí-lo faz
    // o relatório apontar sempre a mesma camada decorativa de fundo.
    if (pos === "fixed") continue;
    const passa = Math.max(r.right - cw, -r.left);
    if (passa <= 1 || recortado(el, pos)) continue;
    brutos.push({ el, passa, r, pos });
  }
  // Só o culpado mais FUNDO de cada linhagem: quando pai e filho passam, quem
  // estica é o filho — o pai só está esticado por ele.
  const set = new Set(brutos.map((b) => b.el));
  return {
    sobra, rola,
    culpados: brutos
      .filter((b) => ![...b.el.children].some((c) => set.has(c)))
      .sort((a, b) => b.passa - a.passa).slice(0, 6)
      .map((b) => ({
        quem: nome(b.el), passa: Math.round(b.passa), pos: b.pos,
        pai: b.el.parentElement ? nome(b.el.parentElement) : "-",
      })),
  };
})()
`;

async function medir(rota, largura) {
  const alvo = await (await fetch(`http://127.0.0.1:${PORTA}/json/new?about:blank`, { method: "PUT" })).json();
  const s = await Sessao.abrir(alvo.webSocketDebuggerUrl);
  try {
    await s.envia("Page.enable");
    await s.envia("Emulation.setDeviceMetricsOverride", { width: largura, height: 820, deviceScaleFactor: 1, mobile: largura < 900 });
    await s.envia("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await s.envia("Page.navigate", { url: BASE + rota });
    await dorme(ESPERA);
    const { result } = await s.envia("Runtime.evaluate", { expression: AUDITORIA, returnByValue: true });
    return result.value;
  } finally {
    s.fecha();
    await fetch(`http://127.0.0.1:${PORTA}/json/close/${alvo.id}`).catch(() => {});
  }
}

// ── Corrida ──────────────────────────────────────────────────────────────────
const rotas = process.argv.slice(2).length ? process.argv.slice(2) : rotasDoBancoDeProvas();

try { await fetch(BASE, { method: "HEAD" }); } catch {
  console.error(`Nada respondendo em ${BASE}. Suba o servidor (npm run dev) antes.`);
  process.exit(2);
}

const perfil = mkdtempSync(join(tmpdir(), "rolagem-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`,
  // SEM `--hide-scrollbars`: essa flag é confortável pra screenshot e mentirosa
  // pra medição. Ela devolve os ~15px da barra de rolagem à área útil e some
  // com a família inteira de bugs de `100vw` — `width: 100vw` é a viewport COM
  // a barra, então num monitor real ele nasce 15px maior que o espaço que tem.
  // Foi assim que o /painel escapou da primeira varredura.
  // Na emulação de celular o Chrome usa barra sobreposta, então lá a flag não
  // faria diferença nenhuma de qualquer jeito.
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--force-device-scale-factor=1",
], { stdio: "ignore" });
chrome.on("error", (e) => { console.error(`Chrome não abriu (${CHROME}): ${e.message}`); process.exit(2); });

let vivo = false;
for (let i = 0; i < 100 && !vivo; i++) {
  try { await fetch(`http://127.0.0.1:${PORTA}/json/version`); vivo = true; } catch { await dorme(200); }
}
if (!vivo) { chrome.kill(); console.error("Chrome não subiu o depurador."); process.exit(2); }

console.log(`${rotas.length} rotas × ${LARGURAS.length} larguras = ${rotas.length * LARGURAS.length} medições\n`);
let ruins = 0, rolando = 0;
for (const largura of LARGURAS) {
  for (const rota of rotas) {
    let r;
    try { r = await medir(rota, largura); } catch (e) { r = { erro: String(e.message) }; }
    // `Runtime.evaluate` devolve `value: undefined` quando a rota ainda não
    // pintou nada dentro do ESPERA (build a frio do Turbopack, rota pesada).
    // Sem esta linha a varredura INTEIRA morria com um TypeError na primeira
    // rota lenta, e as outras 359 medições nunca aconteciam — o modo de falha
    // pior possível numa ferramenta de auditoria: silêncio parecendo verde.
    if (!r) r = { erro: "sem resposta dentro do tempo de espera" };
    if (r.erro) { ruins++; console.log(`ERRO \t${largura}\t${rota}\t${r.erro}`); continue; }
    if (r.sobra <= 0) continue;
    const combinado = ehDeProposito(rota, largura);
    if (combinado) { console.log(`prova\t${largura}\t${rota}\tsobra=${r.sobra}px — ${combinado.motivo}`); continue; }
    ruins++;
    if (r.rola > 0) rolando++;
    console.log(`${r.rola > 0 ? "ROLA " : "CORTA"}\t${largura}\t${rota}\tsobra=${r.sobra}px`);
    for (const c of r.culpados) console.log(`        +${c.passa}px [${c.pos}] ${c.quem}\n            dentro de ${c.pai}`);
  }
}

console.log(ruins === 0
  ? `\nNenhuma sobra de largura em ${rotas.length * LARGURAS.length} medições.`
  : `\n${ruins} medições com sobra de largura (${rolando} rolando de verdade).`);

chrome.kill();
// O `kill` só PEDE pro Chrome sair; ele ainda está fechando os arquivos do
// perfil quando o `rmSync` chega, e o diretório volta a encher no meio da
// remoção (ENOTEMPTY). `force` não cobre esse caso — ele ignora "não existe",
// não "reapareceu". Com as tentativas o diretório sai; se ainda assim ficar,
// é lixo em /tmp que o sistema limpa, e derrubar a varredura por causa disso
// imprimiria um stack trace logo abaixo de "nenhuma sobra" — o oposto do que
// aconteceu.
try {
  rmSync(perfil, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
} catch { /* perfil temporário: o sistema limpa */ }
// `process.exit` NÃO espera a saída pendente quando stdout é um cano (a
// varredura rodando dentro de outro processo, que é como ela costuma rodar).
// No terminal a escrita é síncrona e ninguém nota; pelo cano só o cabeçalho
// chegava e o relatório inteiro — inclusive a linha que diz se passou — sumia,
// deixando um exit 0 sem nada que o explique. Drenar antes de sair custa um
// tick e devolve a única coisa que a ferramenta produz.
await new Promise((pronto) => process.stdout.write("", pronto));
process.exit(ruins === 0 ? 0 : 1);
