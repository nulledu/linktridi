"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { anotarPrefDaConta, gravarPrefDaConta, lerPrefsDaConta } from "@/lib/prefs-da-conta";

// Preferência de UI por usuário: instantânea via localStorage + sincronizada com
// o servidor (tabela user_prefs) pra seguir a conta entre dispositivos.
//
// Estratégia:
//  1) na montagem, aplica o valor do localStorage na hora (rápido, funciona off-line);
//  2) lê as prefs da conta e, se o servidor tiver valor salvo, adota — o servidor
//     manda no cross-device (foi salvo em outro aparelho) e atualiza o localStorage.
//     A leitura é UMA por carregamento, dividida com as outras telas
//     (lib/prefs-da-conta.ts): o Cockpit, a Visão geral e o UTM faziam cada um o
//     próprio GET de todas as chaves;
//  3) ao salvar, grava no localStorage e anota na leitura compartilhada na hora
//     (remontar não desfaz a troca) e envia pro servidor com debounce. Sair da
//     página ou da tela no meio do debounce não perde a escrita: ela é enviada
//     na hora, com keepalive.
//
// `baseKey` é a chave no servidor (ex.: "trafego.colunas"); no localStorage vira
// "baseKey.<userId>" pra isolar contas no mesmo aparelho. `sanitize` valida/normaliza
// o valor lido (retorne null pra rejeitar e manter o padrão).
export function useSyncedPref<T>(
  baseKey: string,
  userId: string,
  inicial: T,
  sanitize: (parsed: unknown) => T | null = (p) => p as T,
): [T, (v: T) => void] {
  const lsKey = `${baseKey}.${userId || "anon"}`;
  const [val, setVal] = useState<T>(inicial);
  const sanRef = useRef(sanitize);
  sanRef.current = sanitize;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aEnviar = useRef<{ v: T } | null>(null);

  useEffect(() => {
    const aplicar = (raw: unknown) => {
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        const limpo = sanRef.current(parsed);
        if (limpo != null) setVal(limpo);
      } catch { /* valor corrompido → ignora */ }
    };
    try { const raw = localStorage.getItem(lsKey); if (raw) aplicar(raw); } catch { /* localStorage indisponível */ }
    let ativo = true;
    void lerPrefsDaConta().then((prefs) => {
      if (!ativo || !prefs) return;                 // off-line ou sem tabela → segue com o local
      const v = prefs[baseKey];
      if (v != null) { aplicar(v); try { localStorage.setItem(lsKey, JSON.stringify(v)); } catch { /* ignora */ } }
    });
    return () => { ativo = false; };
  }, [lsKey, baseKey]);

  // Envia o que estiver no debounce: ao sair da página (pagehide) e ao desmontar.
  useEffect(() => {
    const despachar = () => {
      if (!timer.current || !aEnviar.current) return;
      clearTimeout(timer.current);
      timer.current = null;
      void gravarPrefDaConta(baseKey, aEnviar.current.v);
      aEnviar.current = null;
    };
    window.addEventListener("pagehide", despachar);
    return () => { window.removeEventListener("pagehide", despachar); despachar(); };
  }, [baseKey]);

  const salvar = useCallback((next: T) => {
    setVal(next);
    try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch { /* ignora */ }
    anotarPrefDaConta(baseKey, next);
    aEnviar.current = { v: next };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      aEnviar.current = null;
      void gravarPrefDaConta(baseKey, next);   // falhou → tenta de novo na próxima alteração
    }, 500);
  }, [lsKey, baseKey]);

  return [val, salvar];
}
