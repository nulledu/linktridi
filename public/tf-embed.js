/* TridiFlow — widget de embed (bubble). Uso:
   <script src="https://SEU_HOST/tf-embed.js" data-bot="https://SEU_HOST/f/SLUG" data-cor="#6d28d9"></script>
   Cria um botão flutuante que abre o bot num painel (iframe). Sem dependências. */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var url = s.getAttribute("data-bot");
  if (!url) return;
  var cor = s.getAttribute("data-cor") || "#6d28d9";
  var pos = s.getAttribute("data-pos") === "left" ? "left" : "right";
  if (window.__tfEmbed) return; window.__tfEmbed = true;

  var aberto = false;
  var lado = pos + ":20px";

  var painel = document.createElement("div");
  painel.style.cssText = "position:fixed;bottom:92px;" + lado + ";width:380px;max-width:calc(100vw - 40px);height:600px;max-height:calc(100vh - 130px);z-index:2147483000;border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.28);background:#fff;display:none;opacity:0;transform:translateY(12px);transition:opacity .2s ease,transform .2s ease";
  var frame = document.createElement("iframe");
  frame.style.cssText = "width:100%;height:100%;border:0";
  frame.setAttribute("title", "Chat");
  painel.appendChild(frame);

  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Abrir chat");
  btn.style.cssText = "position:fixed;bottom:20px;" + lado + ";width:60px;height:60px;border:0;border-radius:50%;background:" + cor + ";color:#fff;cursor:pointer;z-index:2147483001;box-shadow:0 10px 26px -6px rgba(0,0,0,.4);display:grid;place-items:center;transition:transform .15s ease";
  btn.onmouseenter = function () { btn.style.transform = "scale(1.06)"; };
  btn.onmouseleave = function () { btn.style.transform = "scale(1)"; };
  var iconeChat = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-13a3 3 0 0 1 3 -3h10a3 3 0 0 1 3 3v6a3 3 0 0 1 -3 3h-9l-4 4"/><path d="M9.5 9h.01"/><path d="M14.5 9h.01"/><path d="M9.5 13a3.5 3.5 0 0 0 5 0"/></svg>';
  var iconeX = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';
  btn.innerHTML = iconeChat;

  btn.onclick = function () {
    aberto = !aberto;
    if (aberto) {
      if (!frame.src) frame.src = url;
      painel.style.display = "block";
      requestAnimationFrame(function () { painel.style.opacity = "1"; painel.style.transform = "none"; });
      btn.innerHTML = iconeX;
    } else {
      painel.style.opacity = "0"; painel.style.transform = "translateY(12px)";
      setTimeout(function () { painel.style.display = "none"; }, 200);
      btn.innerHTML = iconeChat;
    }
  };

  document.body.appendChild(painel);
  document.body.appendChild(btn);
})();
