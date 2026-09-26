"use client";

import { useEffect, useState } from "react";

// useState que lembra do valor no navegador (localStorage). Usado p/ manter a
// última aba visitada de cada módulo — o usuário volta e cai onde estava.
export function useSticky<T extends string>(key: string, inicial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(inicial);
  useEffect(() => {
    try { const s = localStorage.getItem(key); if (s) setV(s as T); } catch { /* sem storage */ }
  }, [key]);
  const set = (nv: T) => { setV(nv); try { localStorage.setItem(key, nv); } catch { /* */ } };
  return [v, set];
}
