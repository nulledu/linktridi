"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// O runtime do lottie-web (~250 KB) só desce quando alguma animação de fato
// vai desenhar — o componente já renderiza null até o JSON chegar, então o
// carregamento tardio não muda nada visível, só tira o peso do bundle da TV.
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

// Cache simples em memória dos JSONs já baixados.
const cache = new Map<string, object>();

// Renderiza uma animação Lottie a partir de /public/animations/<name>.json.
export function LottieAnim({
  name,
  loop = true,
  style,
}: {
  name: "loading" | "target" | "crown" | "rocket";
  loop?: boolean;
  style?: React.CSSProperties;
}) {
  const [data, setData] = useState<object | null>(cache.get(name) ?? null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    if (cache.has(name)) {
      setData(cache.get(name)!);
      return;
    }
    fetch(`/animations/${name}.json`)
      .then((r) => r.json())
      .then((j) => {
        cache.set(name, j);
        if (active.current) setData(j);
      })
      .catch(() => {});
    return () => {
      active.current = false;
    };
  }, [name]);

  if (!data) return null;
  return <Lottie animationData={data} loop={loop} style={style} />;
}
