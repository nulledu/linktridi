/* TridiFlow Track — pixel próprio de rastreamento (Fase 2 do Tráfego Pago).
   Instale com:
   <script src="https://SEU_DOMINIO/tf-track.js" data-site="meu-site"></script>
   Captura UTMs (first-touch preservado), cria visitante persistente, controla
   sessão (30 min), registra pageviews e eventos custom, deduplica e envia por
   sendBeacon (resiliente). Funciona em mobile; degrada sem quebrar a página. */
(function () {
  "use strict";
  var THIS = document.currentScript;
  var SITE = (THIS && THIS.getAttribute("data-site")) || "default";
  // Endpoint: data-api explícito, ou deduz da origem do próprio script.
  var API = (THIS && THIS.getAttribute("data-api")) || "";
  if (!API && THIS && THIS.src) { try { API = new URL(THIS.src).origin + "/api/t"; } catch (e) {} }
  if (!API) API = "/api/t";

  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid", "ttclid"];
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function lget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function jget(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // Visitante persistente.
  var vid = lget("tfk_vid"); if (!vid) { vid = uid(); lset("tfk_vid", vid); }

  // UTMs da URL atual.
  function utmsAgora() {
    var qs = new URLSearchParams(location.search), o = {};
    for (var i = 0; i < UTM_KEYS.length; i++) { var v = qs.get(UTM_KEYS[i]); if (v) o[UTM_KEYS[i]] = v.slice(0, 300); }
    return o;
  }
  // First-touch: grava a origem no PRIMEIRO acesso e nunca sobrescreve (preserva
  // a origem mesmo que a pessoa volte por link direto depois).
  var first = jget("tfk_first");
  if (!first) {
    first = utmsAgora();
    first.landing = location.href.slice(0, 500);
    first.referrer = (document.referrer || "").slice(0, 500);
    first.ts = Date.now();
    jset("tfk_first", first);
  }

  // Sessão (expira em 30 min de inatividade).
  var now = Date.now(), sess = jget("tfk_sess");
  if (!sess || now - (sess.last || 0) > 30 * 60 * 1000) sess = { id: uid(), start: now };
  sess.last = now; jset("tfk_sess", sess);

  // Dedup por sessão (evita pageview repetido da mesma URL).
  function jaEnviado(chave) {
    try {
      var k = "tfk_dedup_" + sess.id, set = JSON.parse(sessionStorage.getItem(k) || "{}");
      if (set[chave]) return true; set[chave] = 1; sessionStorage.setItem(k, JSON.stringify(set)); return false;
    } catch (e) { return false; }
  }

  function enviar(evento, dados) {
    var payload = {
      site: SITE, vid: vid, sid: sess.id, evento: evento,
      url: location.href.slice(0, 500), ref: (document.referrer || "").slice(0, 500),
      first: first, utm: utmsAgora(),
      screen: (screen.width || 0) + "x" + (screen.height || 0),
      lang: navigator.language || "", ua: navigator.userAgent || "",
      dados: dados || {}, ts: Date.now(), eid: uid()
    };
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) { navigator.sendBeacon(API, new Blob([body], { type: "text/plain" })); return; }
    } catch (e) {}
    try { fetch(API, { method: "POST", headers: { "Content-Type": "text/plain" }, body: body, keepalive: true, mode: "cors" }).catch(function () {}); } catch (e) {}
  }

  // Pageview automático (uma vez por URL/sessão).
  if (!jaEnviado("pv:" + location.pathname + location.search)) enviar("pageview");

  // Clique em WhatsApp = evento automático (muito comum no funil).
  document.addEventListener("click", function (e) {
    var el = e.target;
    while (el && el !== document) {
      if (el.tagName === "A" && /wa\.me|api\.whatsapp|whatsapp:\/\//i.test(el.getAttribute("href") || "")) { enviar("whatsapp_click"); break; }
      el = el.parentNode;
    }
  }, true);

  // API pública p/ eventos custom: tfTrack('checkout', { valor: 97 })
  window.tfTrack = function (nome, dados) { if (nome) enviar(String(nome).slice(0, 60), dados); };
})();
