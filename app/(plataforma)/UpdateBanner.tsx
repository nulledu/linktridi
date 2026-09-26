"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Botao } from "./ui/controles";

// Avisa quando saiu uma nova versão do sistema (novo deploy) e oferece atualizar.
// Guarda a versão que carregou; consulta /api/version de tempos em tempos; se
// mudou, mostra a faixa. Um novo deploy também pode quebrar chunks antigos —
// recarregar resolve.
//
// O intervalo é FOLGADO de propósito (10min, era 90s). Esta faixa vive no Shell,
// ou seja em toda tela: a 90s eram ~960 invocações por dia por aba aberta só pra
// perguntar um número de versão que muda algumas vezes por dia. O
// `visibilitychange` abaixo é quem faz o trabalho de verdade — quem volta pra
// aba descobre na hora, que é exatamente quando importa.
const INTERVALO_MS = 10 * 60_000;

export function UpdateBanner() {
  const [novaVersao, setNovaVersao] = useState(false);

  useEffect(() => {
    let atual: string | null = null;
    let vivo = true;

    async function checar() {
      // Já achou a versão nova: a faixa está na tela e não há nada a descobrir.
      // Sem isto o poll seguia batendo pra sempre atrás de quem já foi avisado.
      if (!vivo || novaVersao) return;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const d = await r.json();
        const v = d?.version as string | undefined;
        if (!v || v === "dev") return;
        if (atual == null) atual = v;                 // 1ª leitura = versão carregada
        else if (v !== atual) setNovaVersao(true);    // mudou → tem update
      } catch { /* offline — ignora */ }
    }

    checar();
    const id = setInterval(() => { if (!document.hidden) checar(); }, INTERVALO_MS);
    // Reconferir ao voltar pra aba (usuário volta depois de um tempo).
    const onVis = () => { if (!document.hidden) checar(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { vivo = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [novaVersao]);

  if (!novaVersao) return null;

  return (
    <div className="glass glass-spec update-banner" style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px 12px 16px", borderRadius: 16,
      border: "1px solid var(--border)", boxShadow: "0 16px 50px rgba(0,0,0,.28)",
      animation: "riseIn .35s ease both",
    }}>
      <span style={{ width: 32, height: 32, borderRadius: 10, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 16%, transparent)" }}>
        <Icon name="sparkles" size={17} color="var(--primary-texto)" />
      </span>
      <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3, color: "var(--text)" }}>
        Nova versão disponível.<span style={{ color: "var(--text-dim)" }}> Atualize pra pegar as novidades.</span>
      </div>
      <Botao variante="primario" tamanho="sm" onClick={() => window.location.reload()} style={{ marginLeft: 4, flex: "none" }}>Atualizar</Botao>
    </div>
  );
}
