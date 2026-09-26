"use client";

// A parede aberta no NAVEGADOR ouve o mesmo cutucão que a TV.
//
// `PUT /api/config` faz broadcast no tópico `tv:parede` (ver lib/tv-sinal.ts);
// aqui o `/painel` assina esse tópico e, em `config`, refaz a leitura. É o
// mesmo desenho de app/(plataforma)/tridichat/tempo-real.ts: só o nome do
// evento trafega, o dado continua vindo pela rota de sempre; sem Realtime,
// socket caído ou aba sem rede, o poll com recuo segue como garantia.

import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { TV_SINAL_TOPICO } from "@/lib/tv-sinal-nomes";

export function useSinalDaParede(aoMudarConfig: () => void): void {
  // O callback muda a cada render; a ref evita derrubar o socket a cada ciclo.
  const fn = useRef(aoMudarConfig);
  fn.current = aoMudarConfig;

  useEffect(() => {
    let vivo = true;
    let canal: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let tentativas = 0;

    const fechar = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (canal) { try { canal.unsubscribe(); } catch { /* já morto */ } canal = null; }
    };

    // Recuo exponencial com teto de 30 s: Wi-Fi que cai não pode deixar a
    // parede presa só no poll até alguém recarregar.
    const reconectar = () => {
      if (!vivo || timer) return;
      const espera = Math.min(30_000, 1_000 * 2 ** tentativas++);
      timer = setTimeout(() => { timer = null; if (!vivo) return; fechar(); abrir(); }, espera);
    };

    const abrir = () => {
      if (!vivo || canal) return;
      try {
        const supa = createSupabaseBrowserClient();
        canal = supa.channel(TV_SINAL_TOPICO)
          .on("broadcast", { event: "config" }, () => { fn.current(); });
        canal.subscribe((status) => {
          if (status === "SUBSCRIBED") { tentativas = 0; return; }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") reconectar();
        });
      } catch {
        // Sem env do Supabase no navegador: segue só no poll, sem insistir.
        canal = null;
      }
    };

    abrir();

    const aoVoltar = () => { if (!document.hidden) { fechar(); tentativas = 0; abrir(); } };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { vivo = false; document.removeEventListener("visibilitychange", aoVoltar); fechar(); };
  }, []);
}
