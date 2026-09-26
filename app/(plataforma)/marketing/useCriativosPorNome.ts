"use client";

// ── Liga nome de anúncio (Meta) → criativo cadastrado (Marketing) ────────────
// O Tridify tem o nome do anúncio; o Marketing tem o criativo com a peça. A
// ponte é o CÓDIGO no nome ("JL-041 depoimento 15s"). Este hook recebe todos
// os nomes de uma lista, extrai os códigos no navegador (sem ida ao servidor),
// e faz UMA consulta pelos códigos — nunca uma por linha do ranking.
//
// `alvoDe(nome, adId)` devolve o que o VisorCriativo precisa: com criativo
// (id, capa, meta_ad_id) quando o código existe; só o anúncio quando não.
import { useEffect, useMemo, useState } from "react";
import { codigoDoNome } from "@/lib/marketing-criativos-const";
import type { ArquivoCriativo } from "@/lib/criativos/regras";
import type { AlvoDoVisor } from "./VisorCriativo";

export interface CriativoLigado {
  id: string;
  codigo: string;
  nome: string;
  metaAdId: string | null;
  videoUrl: string | null;
  status: string;
  capa: ArquivoCriativo | null;
}

const ROTA = "/api/marketing/criativos/por-codigo";

export function useCriativosPorNome(nomes: (string | null | undefined)[]) {
  // Códigos únicos, ordenados: a chave de memo muda só quando a LISTA muda de
  // verdade, não a cada re-render do ranking.
  const codigos = useMemo(() => {
    const s = new Set<string>();
    for (const n of nomes) { const c = codigoDoNome(n || ""); if (c) s.add(c); }
    return [...s].sort();
  }, [nomes]);
  const chave = codigos.join(",");

  const [mapa, setMapa] = useState<Record<string, CriativoLigado>>({});
  const [carregado, setCarregado] = useState("");

  useEffect(() => {
    if (!chave) { setMapa({}); setCarregado(""); return; }
    let vivo = true;
    fetch(ROTA, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigos }) })
      .then((r) => r.json())
      .then((j) => { if (vivo && j?.ok) { setMapa(j.criativos as Record<string, CriativoLigado>); setCarregado(chave); } })
      .catch(() => { /* sem ligação: o visor cai na visão da Meta */ });
    return () => { vivo = false; };
  }, [chave, codigos]);

  const porNome = (nome: string | null | undefined): CriativoLigado | null => {
    const c = codigoDoNome(nome || "");
    return c ? (mapa[c] ?? null) : null;
  };

  const alvoDe = (nome: string | null | undefined, adId?: string | null): AlvoDoVisor => {
    const c = porNome(nome);
    const codigo = codigoDoNome(nome || "");
    return c
      ? { codigo: c.codigo, criativoId: c.id, nome: c.nome, metaAdId: c.metaAdId ?? adId ?? null, videoUrl: c.videoUrl, nomeAnuncio: nome ?? null }
      : { codigo, criativoId: null, nome: null, metaAdId: adId ?? null, videoUrl: null, nomeAnuncio: nome ?? null };
  };

  return { porNome, alvoDe, pronto: carregado === chave, mapa };
}
