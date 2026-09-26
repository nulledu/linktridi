"use client";

import { useEffect, useState } from "react";

/**
 * O painel para a TV box velha: a MESMA página, mostrada como IMAGEM.
 *
 * O WebView de fábrica dessas caixas (Allwinner H3 / Android 7 / Chrome 55, de
 * 2016) não tem CSS Grid, clamp nem container queries — o painel moderno não
 * desenha ali. Em vez de tentar consertar um motor de 2016 (polyfill trava
 * numa Mali-400), o servidor renderiza cada slide num Chrome atual e sobe o PNG
 * (ver scripts/painel-render.mjs + o cron). Aqui a TV só cicla essas imagens.
 *
 * Fica IDÊNTICO ao link porque é o pixel do link. E roda em qualquer WebView:
 * usa só `<img>`, opacity e setTimeout — nada além do que existia em 2016.
 *
 * Duas armadilhas do Chrome 55 que moldam este arquivo:
 * • CORS: `fetch` de JSON em outra origem (o Storage) é bloqueado. Então a
 *   lista de slides vem do `/api/config` (MESMA origem, já usado pelo painel),
 *   e as imagens entram por `<img src>` — que carrega cross-origin sem CORS.
 * • `AbortController` não existe: nada aqui usa fetch com sinal de aborto.
 */
const BASE_IMG = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/paineis`;

export function ImagemDoPainel() {
  const [slides, setSlides] = useState<{ url: string; ms: number }[] | null>(null);
  const [i, setI] = useState(0);
  const [carimbo, setCarimbo] = useState(() => Math.floor(Date.now() / 60000));

  // A chave vem da URL — o mesmo endereço que o app abre.
  const chave = (() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search);
    const perfil = q.get("perfil")?.trim();
    if (perfil) return { tipo: "perfil" as const, id: perfil };
    const t = q.get("tipo")?.trim();
    return t ? { tipo: "tipo" as const, id: t } : null;
  })();

  // Descobre quantos slides e o ritmo pelo /api/config (mesma origem, sem CORS).
  useEffect(() => {
    if (!chave) return;
    let vivo = true;
    const montar = (n: number, ms: number, prefixo: string) =>
      Array.from({ length: Math.max(1, n) }, (_, k) => ({ url: `${BASE_IMG}/${prefixo}-${k}.png`, ms }));
    const buscar = () =>
      fetch("/api/config", { cache: "no-store" })
        .then((r) => r.json())
        .then((c) => {
          if (!vivo) return;
          const ms = c.slideIntervalMs || 20000;
          if (chave.tipo === "perfil") {
            const p = (c.perfis || []).find((x: { id: string }) => x.id === chave.id);
            setSlides(montar(p?.slides?.length || 1, ms, `perfil-${chave.id}`));
          } else {
            // Painel por tipo (sem perfil): renderizado com o mesmo prefixo.
            setSlides(montar(1, ms, `tipo-${chave.id}`));
          }
        })
        .catch(() => { /* mantém o que já tinha */ });
    buscar();
    const id = setInterval(buscar, 5 * 60000); // novos slides entram sem recarregar
    return () => { vivo = false; clearInterval(id); };
  }, [chave?.tipo, chave?.id]);

  // Avança os slides no ritmo configurado.
  useEffect(() => {
    if (!slides || slides.length <= 1) return;
    const id = setTimeout(() => setI((n) => (n + 1) % slides.length), slides[i % slides.length]?.ms ?? 20000);
    return () => clearTimeout(id);
  }, [slides, i]);

  // Recarrega a imagem a cada minuto (o cron re-renderiza no servidor).
  useEffect(() => {
    const id = setInterval(() => setCarimbo(Math.floor(Date.now() / 60000)), 60000);
    return () => clearInterval(id);
  }, []);

  const fundo = "#f5f4fa"; // a pele clara da parede
  const base = { position: "fixed", inset: 0, width: "100%", height: "100%", background: fundo } as const;
  if (!slides) return <div style={base} />; // nunca preto: fundo claro liso

  const total = slides.length;
  return (
    <div style={base}>
      {slides.map((s, n) => (
        <img
          key={n}
          src={`${s.url}?t=${carimbo}`}
          alt=""
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "contain", background: fundo,
            opacity: n === (i % total) ? 1 : 0,
            transition: "opacity .5s ease",
          }}
        />
      ))}
    </div>
  );
}
