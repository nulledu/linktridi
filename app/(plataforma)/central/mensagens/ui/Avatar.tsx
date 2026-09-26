"use client";

import { memo, useEffect, useState } from "react";
import { Icon } from "../../../Icon";
import type { StatusPresenca } from "@/lib/chat/tipos";

/** Cor estável a partir do nome — a mesma pessoa tem sempre a mesma cor. */
function corDoNome(nome: string) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 48% 42%)`;
}

export const Avatar = memo(function Avatar({
  nome, src, size = 36, grupo = false, icone = "hash", status, cor,
}: {
  nome: string; src?: string | null; size?: number;
  /** Canal/grupo: quadrado arredondado com ícone em vez de foto. */
  grupo?: boolean; icone?: "hash" | "users" | "speakerphone";
  status?: StatusPresenca; cor?: string | null;
}) {
  // Foto que não carrega (URL do ERP fora do ar, link expirado, bloqueio de
  // referer) NÃO pode virar o ícone de imagem quebrada do navegador: cai na
  // inicial, igual a quem não tem foto. Volta a tentar se a URL mudar.
  const [quebrou, setQuebrou] = useState(false);
  useEffect(() => { setQuebrou(false); }, [src]);
  const foto = src && !quebrou ? src : null;

  return (
    <span
      className={"ch-avatar" + (grupo ? " ch-avatar--quadrado" : "")}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
          onError={() => setQuebrou(true)} />
      ) : grupo ? (
        <span style={{ background: cor || "color-mix(in srgb, var(--primary) 20%, transparent)" }}>
          <Icon name={icone} size={Math.round(size * 0.52)} color={cor ? "#fff" : "var(--primary-texto)"} />
        </span>
      ) : (
        <span style={{ background: corDoNome(nome), fontSize: Math.round(size * 0.4) }}>
          {(nome.trim()[0] ?? "?").toUpperCase()}
        </span>
      )}
      {/* Offline não desenha nada: uma bolinha cinza em cada linha da lista é
          ruído, não informação — o que interessa é quem ESTÁ. E abaixo de 24px
          o ponto com anel come um terço do rosto. */}
      {status && status !== "offline" && size >= 24 && (
        <i className="ch-avatar__status" data-s={status} />
      )}
    </span>
  );
});
