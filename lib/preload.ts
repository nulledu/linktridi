// ── Pre-paint: o que precisa estar certo ANTES do primeiro quadro ────────────
// Vai INLINE no <head> do layout raiz (app/layout.tsx). É uma string, e não um
// arquivo em public/, porque só um <script> cru e síncrono no <head> roda antes
// do paint. Ele morava em `<Script src="/preload.js" strategy="beforeInteractive">`
// — e no App Router isso não é um <script>: o Next escreve só
// `self.__next_s.push(...)` e quem cria a tag é o runtime, DEPOIS de baixar o
// chunk principal. Até lá a página já tinha pintado no padrão do CSS (escuro):
// era o "mostra o escuro por um segundo e depois vira o claro".
// Trava: lib/__tests__/tema-sem-piscar.test.ts.
//
// ES5 à mão (var/function): roda no WebView do tablet e da TV box (Chrome 67)
// antes de qualquer polyfill, e cada bloco tem o próprio try — um erro na cor
// não pode levar o tema junto.
//
// TEMA. A ESCOLHA (system/light/dark) fica em `data-tema`; o que PINTA é a
// classe `.light`, porque o CSS inteiro fala `.light`. "system" resolve pelo
// matchMedia na hora e segue o SO ao vivo. `color-scheme` inline acompanha pra
// barra de rolagem e controles nativos nascerem no tema certo antes do CSS.
// A cópia do aparelho só serve pro primeiro milissegundo: a conta manda, pela
// porta `window.__gaiusAparencia.conta` que o layout da plataforma chama com o
// valor do banco (regras de versão em lib/tema.ts).
//
// COR DE DESTAQUE. Tinta legível SOBRE a cor escolhida decidida antes do paint
// — senão o botão primário nasce com texto branco e "corrige" depois, piscando.
// Mesmas contas de `tintaSobre()`, `corDeAcao()`, `corDeTexto()` e
// `paletaDeGrafico()` em lib/aparencia.ts (luminância relativa da WCAG),
// duplicadas de propósito porque isto roda antes de qualquer módulo. As
// referências de fundo são a PIOR superfície de cada tema e precisam bater com
// LUM_BG_CLARO/LUM_BG_ESCURO; GIROS e ESPREMER também. Divergir faz a cor mudar
// sozinha no primeiro quadro depois do paint — exatamente o piscar que este
// arquivo existe pra evitar. Trava: grafico-cor-personalizada.test.ts executa
// esta string e compara com o módulo.
//
// MICRO-TRANSIÇÕES. Toda peça que entra na tela nasce invisível e é acesa pelo
// IntersectionObserver; as regras estão trancadas atrás de
// `html[data-mt-pronto]`, então sem esta marca nada esconde nada (erro de
// hidratação ou JS bloqueado não deixam a tela em branco). Precisa ser antes do
// paint: marcar depois mostraria, esconderia e revelaria de novo.
export const PRELOAD_JS = `(function () {
  try { if (typeof globalThis === "undefined") window.globalThis = window; } catch (x) {}
  var e = document.documentElement;
  var ler = function (k) { try { return localStorage.getItem(k); } catch (x) { return null; } };
  var guardar = function (k, v) { try { localStorage.setItem(k, v); } catch (x) {} };
  var mq = null;
  try { mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null; } catch (x) {}

  function tema(p) {
    if (p !== "light" && p !== "dark") p = "system";
    var claro = p === "light" || (p === "system" && !!(mq && mq.matches));
    e.setAttribute("data-tema", p);
    if (claro) e.classList.add("light"); else e.classList.remove("light");
    if (claro) e.classList.remove("dark"); else e.classList.add("dark");
    e.style.colorScheme = claro ? "light" : "dark";
  }

  function accent(a) {
    e.style.setProperty("--primary", a);
    var h = a.trim().toLowerCase().replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length === 6) {
      var c = function (i) {
        var x = parseInt(h.substr(i * 2, 2), 16) / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      var L = 0.2126 * c(0) + 0.7152 * c(1) + 0.0722 * c(2);
      var r = function (x, y) { return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      var claro = r(L, 1) >= r(L, 0.0116);
      var lt = claro ? 1 : 0.0116;
      e.style.setProperty("--on-primary", claro ? "#ffffff" : "#1d1d1f");
      var alvo = claro ? 0 : 255;
      var lum = function (hx) {
        var f = function (i) {
          var x = parseInt(hx.substr(i * 2, 2), 16) / 255;
          return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(0) + 0.7152 * f(1) + 0.0722 * f(2);
      };
      var acao = h;
      for (var p = 0; p <= 0.6 && r(lum(acao), lt) < 4.5; p += 0.02) {
        acao = "";
        for (var i = 0; i < 3; i++) {
          var v = parseInt(h.substr(i * 2, 2), 16);
          acao += ("0" + Math.round(v + (alvo - v) * (p + 0.02)).toString(16)).slice(-2);
        }
      }
      e.style.setProperty("--primary-acao", "#" + acao);
      var texto = function (lumFundo, paraBranco) {
        var c = h;
        for (var q = 0; q <= 0.85 && r(lum(c), lumFundo) < 4.5; q += 0.02) {
          c = "";
          for (var j = 0; j < 3; j++) {
            var vv = parseInt(h.substr(j * 2, 2), 16);
            c += ("0" + Math.round(vv + ((paraBranco ? 255 : 0) - vv) * (q + 0.02)).toString(16)).slice(-2);
          }
        }
        return "#" + c;
      };
      e.style.setProperty("--primary-texto-claro", texto(0.8026, false));   // #e7e7ed
      e.style.setProperty("--primary-texto-escuro", texto(0.0290, true));   // #2e2f38
      try {
        var mx = Math.max, mn = Math.min;
        var rr = parseInt(h.substr(0, 2), 16) / 255, gg = parseInt(h.substr(2, 2), 16) / 255, bb = parseInt(h.substr(4, 2), 16) / 255;
        var vmax = mx(rr, gg, bb), vmin = mn(rr, gg, bb), dd = vmax - vmin;
        var L0 = (vmax + vmin) / 2;
        var S0 = dd === 0 ? 0 : dd / (1 - Math.abs(2 * L0 - 1));
        var H0 = dd === 0 ? 0 : 60 * (vmax === rr ? ((gg - bb) / dd + (gg < bb ? 6 : 0)) : vmax === gg ? (bb - rr) / dd + 2 : (rr - gg) / dd + 4);
        var hex = function (hh, s, l) {
          hh = ((hh % 360) + 360) % 360;
          var cc = (1 - Math.abs(2 * l - 1)) * s;
          var xx = cc * (1 - Math.abs(((hh / 60) % 2) - 1));
          var m0 = l - cc / 2;
          var t = hh < 60 ? [cc, xx, 0] : hh < 120 ? [xx, cc, 0] : hh < 180 ? [0, cc, xx]
            : hh < 240 ? [0, xx, cc] : hh < 300 ? [xx, 0, cc] : [cc, 0, xx];
          var o = "";
          for (var k = 0; k < 3; k++) o += ("0" + Math.round(mn(1, mx(0, t[k] + m0)) * 255).toString(16)).slice(-2);
          return o;
        };
        var calibra = function (hx, lumFundo, paraBranco, piso) {
          var out = hx;
          for (var q = 0; q <= 0.85 && r(lum(out), lumFundo) < piso; q += 0.02) {
            out = "";
            for (var k = 0; k < 3; k++) {
              var v0 = parseInt(hx.substr(k * 2, 2), 16);
              out += ("0" + Math.round(v0 + ((paraBranco ? 255 : 0) - v0) * (q + 0.02)).toString(16)).slice(-2);
            }
          }
          return "#" + out;
        };
        var giros = [0, 38, -34, 76, -68, 150];
        var espremer = { claro: 0.82, escuro: 0.3 };
        var sat = mn(0.82, mx(0.34, S0));
        var claridade = function (hh, ss, alvo) {
          var lo = 0.02, hi = 0.98;
          for (var k = 0; k < 22; k++) {
            var meio = (lo + hi) / 2;
            if (lum(hex(hh, ss, meio)) < alvo) lo = meio; else hi = meio;
          }
          return (lo + hi) / 2;
        };
        var rampa = function (lumFundo, paraBranco) {
          var pri = calibra(h, lumFundo, paraBranco, 4.5);
          var l0 = lum(pri.slice(1));
          var extremo = paraBranco ? 1 : 0;
          var passo = (extremo - l0) * (paraBranco ? espremer.escuro : espremer.claro) / (giros.length - 1);
          var out = [pri];
          for (var gi = 1; gi < giros.length; gi++) {
            var cru = hex(H0 + giros[gi], sat, claridade(H0 + giros[gi], sat, l0 + passo * gi));
            out.push(calibra(cru, lumFundo, paraBranco, 4.5));
          }
          return out;
        };
        var rc = rampa(0.8026, false), re = rampa(0.0290, true);
        for (var gi = 0; gi < giros.length; gi++) {
          e.style.setProperty("--graf-" + (gi + 1) + "-claro", rc[gi]);
          e.style.setProperty("--graf-" + (gi + 1) + "-escuro", re[gi]);
        }
      } catch (x) {}
    }
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", a);
  }

  try { tema(ler("theme")); } catch (x) {}
  try { var a0 = ler("accent"); if (a0) accent(a0); } catch (x) {}

  try {
    var seguir = function () { if (e.getAttribute("data-tema") === "system") tema("system"); };
    if (mq && mq.addEventListener) mq.addEventListener("change", seguir);
    else if (mq && mq.addListener) mq.addListener(seguir);
  } catch (x) {}

  window.__gaiusAparencia = {
    conta: function (c) {
      try {
        if (!c) return;
        var em = ler("aparencia-em");
        if (em === "pendente") return;
        if (em && Number(em) >= Number(c.em)) return;
        if (c.tema) { tema(c.tema); guardar("theme", c.tema); }
        if (c.accent) { accent(c.accent); guardar("accent", c.accent); }
        guardar("aparencia-em", String(c.em));
      } catch (x) {}
    }
  };

  try { localStorage.removeItem("logo-tint"); } catch (x) {}
  try {
    var rm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!(rm && rm.matches)) e.setAttribute("data-mt-pronto", "1");
  } catch (x) {}
  try {
    console.log("%cGaius", "font:800 42px ui-sans-serif;color:#7C3AED;text-shadow:0 2px 18px rgba(124,58,237,.5)");
    console.log("%cSic Parvis Magna.", "font:italic 600 15px ui-serif;color:#8E8E93");
  } catch (x) {}
})();`;
