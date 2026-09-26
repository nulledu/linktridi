"use client";

// A lista de telas com os slides REAIS do perfil publicado — a mesma que roda
// em Configurações › Telas, só que sem a sessão. Lê `/api/config` (rota
// pública), então o que aparece aqui é o que o editor mostraria.

import { useEffect, useState } from "react";
import { ListaDeTelas } from "../(plataforma)/painel-tv/ListaDeTelas";
import type { Perfil, Slide } from "@/lib/painel-layout";
import { comTelasAtualizadas } from "@/lib/painel-layout";

export function TelasProvaClient() {
  const [perfis, setPerfis] = useState<Perfil[] | null>(null);
  const [iPerfil, setIPerfil] = useState(0);
  const [slides, setSlides] = useState<Slide[]>([]);

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((c) => {
        // O mesmo upgrade que o editor aplica na leitura — senão a prova
        // mostraria o layout cru e não o que a pessoa vê.
        const lista = comTelasAtualizadas(c.perfis ?? []);
        setPerfis(lista);
        setSlides(lista[0]?.slides ?? []);
      })
      .catch(() => setPerfis([]));
  }, []);

  if (!perfis) return <div style={{ padding: 24, color: "var(--text-dim)" }}>Carregando…</div>;
  if (perfis.length === 0) return <div style={{ padding: 24 }}>Nenhum perfil publicado no ERP.</div>;

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Prova · Lista de telas</h1>
        <p style={{ fontSize: 13.5, color: "var(--text-dim)", margin: "4px 0 0" }}>
          A mesma lista de Configurações › Telas, com os perfis reais. Aqui nada é salvo.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {perfis.map((p, i) => (
          <button
            key={p.id}
            className="ui-btn"
            data-v={i === iPerfil ? "primario" : "secundario"}
            onClick={() => {
              setIPerfil(i);
              setSlides(p.slides);
            }}
          >
            {p.nome} · {p.slides.length}
          </button>
        ))}
      </div>

      <ListaDeTelas slides={slides} intervaloPadraoMs={20000} onChange={setSlides} />

      <details style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
        <summary style={{ cursor: "pointer" }}>o que seria salvo (ativo e duração de cada tela)</summary>
        <pre style={{ overflowX: "auto", fontSize: 12 }}>
          {JSON.stringify(slides.map((s) => ({ nome: s.nome, ativo: s.ativo, duracaoMs: s.duracaoMs })), null, 2)}
        </pre>
      </details>
    </div>
  );
}
