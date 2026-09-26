"use client";

import { tfSet } from "./ajustes-na-conta";
import { useEffect, useState } from "react";

// A chave "Com imposto" do topo da Tridify. Preferência da pessoa neste
// navegador (padrão: com imposto, que é o custo real); o evento avisa quem
// não recebe o panorama por prop — o modal do criativo busca a própria análise.
const CHAVE = "tridify:com-imposto";
const EVENTO = "tridify:com-imposto";

function ler(): boolean {
  try { return localStorage.getItem(CHAVE) !== "0"; } catch { return true; }
}

export function useComImposto(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(ler());
    const ouvir = () => setOn(ler());
    window.addEventListener(EVENTO, ouvir);
    return () => window.removeEventListener(EVENTO, ouvir);
  }, []);
  const mudar = (v: boolean) => {
    try { tfSet(CHAVE, v ? "1" : "0"); } catch { /* sem storage: vale só nesta tela */ }
    setOn(v);
    window.dispatchEvent(new Event(EVENTO));
  };
  return [on, mudar];
}
