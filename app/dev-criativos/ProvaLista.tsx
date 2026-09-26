"use client";

// A lista de criativos (Marketing › Geral) com dado de mentira: grade que chega
// escalonada, capa que sai do esqueleto, filtros que pulam, copiar o nome e a
// troca de vista deslizante. O "carregando" liga a espera no formato do cartão.

import { useCallback, useState } from "react";
import { CriativosLista, type Capas } from "../(plataforma)/marketing/CriativosLista";
import type { Criativo, ProdutoCriativo } from "@/lib/marketing-criativos-const";
import { Caixa } from "../(plataforma)/ui/controles";

const arte = (cor: string, texto: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">` +
      `<rect width="400" height="500" fill="${cor}"/>` +
      `<text x="50%" y="50%" fill="#fff" font-family="system-ui" font-size="56" font-weight="700"` +
      ` text-anchor="middle" dominant-baseline="middle">${texto}</text></svg>`,
  )}`;

const CRIATIVO = (n: number, p: Partial<Criativo> = {}): Criativo => ({
  id: `c${n}`, prefixo: "SET", numero: n, ano: 2026, variacao: "", codigo: `SET-${String(n).padStart(2, "0")}`,
  nome: `SET ${String(n).padStart(2, "0")} - {CRB} - {L}`, editorId: null, editorNome: "Larissa",
  produto: n % 2 ? "Carimbo" : "Chancela", plataforma: "meta", tipo: "video" as Criativo["tipo"],
  campanha: null, status: "ativo" as Criativo["status"], observacoes: null, metaAdId: null, videoUrl: null,
  dataCriacao: `2026-09-${String(n + 1).padStart(2, "0")}`, criadorNome: "Larissa",
  createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-01T12:00:00Z", ...p,
} as Criativo);

const CRIATIVOS = [1, 2, 3, 4, 5, 6].map((n) => CRIATIVO(n));
const CAPAS: Capas = Object.fromEntries(
  ["#5b46f0", "#0f9d58", "#d93025", "#f29900"].map((cor, i) => [`c${i + 1}`, {
    id: `a${i}`, criativoId: `c${i + 1}`, url: arte(cor, `SET 0${i + 1}`), nome: "capa.png", mime: "image/png",
    tipo: "imagem", tamanho: 300_000, largura: 400, altura: 500, duracao: null, formato: "4:5",
    principal: true, autorNome: "Equipe", createdAt: "2026-09-01T12:00:00Z",
  }]),
) as Capas;
const PRODUTOS: ProdutoCriativo[] = [{ nome: "Carimbo", tag: "CRB" }, { nome: "Chancela", tag: "CH" }];

export function ProvaLista() {
  const [carregando, setCarregando] = useState(false);
  const recarregar = useCallback(async () => {}, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: "var(--tap)", fontSize: 13 }}>
        <Caixa marcado={carregando} onChange={(marc) => setCarregando(marc)} />
        Mostrar carregando
      </label>
      <CriativosLista
        criativos={carregando ? null : CRIATIVOS}
        capas={CAPAS}
        estreias={{ c1: "2026-09-03", c2: "2026-09-05" }}
        editores={[{ id: "e1", nome: "Larissa", departamento: null }]}
        produtos={PRODUTOS}
        recarregar={recarregar}
        podeCriar
        onNovo={() => {}}
      />
    </div>
  );
}
