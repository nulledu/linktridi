"use client";

// Quando o criativo subiu na Meta pela primeira vez (/api/trafego/criativos/estreia).
// Uma pergunta por criativo na sessão: ir e voltar com ← → entre os criativos
// não pergunta de novo, e a data não muda. Falha não fica guardada — a próxima
// abertura tenta outra vez.
import { useEffect, useState } from "react";
import { lerEstreia, type EstreiaCriativo } from "@/lib/criativos-estreia";

const memoria = new Map<string, Promise<EstreiaCriativo | null>>();

function buscar(ads: string): Promise<EstreiaCriativo | null> {
  const guardada = memoria.get(ads);
  if (guardada) return guardada;
  const p = fetch(`/api/trafego/criativos/estreia?ads=${encodeURIComponent(ads)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then(lerEstreia)
    .catch(() => null);
  memoria.set(ads, p);
  void p.then((e) => { if (!e) memoria.delete(ads); });
  return p;
}

export function useEstreiaCriativo(adIds: string[]): EstreiaCriativo | null {
  const ads = [...new Set(adIds.filter(Boolean))].join(",");
  const [resposta, setResposta] = useState<{ ads: string; estreia: EstreiaCriativo | null } | null>(null);
  useEffect(() => {
    if (!ads) return;
    let vivo = true;
    void buscar(ads).then((estreia) => { if (vivo) setResposta({ ads, estreia }); });
    return () => { vivo = false; };
  }, [ads]);
  // A resposta de outro criativo nunca aparece no cabeçalho deste.
  return resposta?.ads === ads ? resposta.estreia : null;
}
