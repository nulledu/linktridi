"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@heroui/react";

/**
 * Avatar — UM componente, porque existiam CINCO.
 *
 * Cada tela tinha a sua cópia (Colaboradores ×2, Design, Funções, Meu Ponto), e
 * as cópias divergiram no que ninguém revisa: o formato (círculo em três,
 * quadrado arredondado em uma), o fundo das iniciais (cinza em quatro, cor de
 * destaque em outra) e a maiúscula (`.toUpperCase()` em três, ausente em uma —
 * por isso "mikael" aparecia com "m" minúsculo em Colaboradores e "M" no resto).
 * A mesma pessoa tinha aparências diferentes dependendo da tela.
 *
 * Três defeitos que só existiam porque não havia um dono:
 *
 * 1. NADA CONTINHA A FOTO. Sem borda e sem fundo, o retrato entrava direto no
 *    cartão — e o fundo da foto virava parte do cartão. Selfie contra parede
 *    branca se dissolvia no card branco e parecia "mais clara"; foto de fundo
 *    escuro lia como bloco sólido. A grade parecia desigual, mas as fotos é que
 *    eram desiguais e não havia nada segurando cada uma dentro do seu limite.
 *    O anel de 1px resolve: toda foto passa a ter uma aresta, qualquer que seja
 *    o que a pessoa fotografou atrás de si.
 *
 * 2. LINK MORTO VIRAVA CAIXA QUEBRADA. `<img>` sem `onError`: se a URL expira
 *    ou o arquivo some, o navegador desenha o ícone de imagem quebrada. Agora
 *    cai nas iniciais — o mesmo destino de quem nunca teve foto.
 *
 * 3. FOTO COM TRANSPARÊNCIA vazava o cartão. O fundo neutro por baixo dá um
 *    piso a PNG com alfa.
 */
/** Selo preso ao avatar — é o `Badge` do HeroUI, com as cores da casa. */
export type SeloAvatar = {
  /** Número, texto curto ("Novo", "99+") ou `<Icon>`. Sem conteúdo = pontinho de status. */
  conteudo?: ReactNode;
  cor?: "default" | "accent" | "success" | "warning" | "danger";
  variante?: "primary" | "secondary" | "soft";
  tamanho?: "sm" | "md" | "lg";
  posicao?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  /** Cor fora da paleta semântica (ex.: medalha do pódio). Vira `--badge-bg`. */
  fundo?: string;
  tinta?: string;
  /** Texto pra leitor de tela — o avatar é `aria-hidden`, o selo não pode depender dele. */
  rotulo?: string;
};

/** Ancora qualquer peça (avatar do kit ou não) com o selo do sistema. */
export function ComSelo({ selo, children }: { selo?: SeloAvatar | null; children: ReactNode }) {
  if (!selo) return <>{children}</>;
  const { conteudo, cor = "danger", variante = "primary", tamanho = "sm", posicao, fundo, tinta, rotulo } = selo;
  // Sem conteúdo o selo é status (online, pendência): a doc do HeroUI o põe
  // embaixo à direita. Com número/texto, em cima à direita.
  const lugar = posicao ?? (conteudo == null ? "bottom-right" : "top-right");
  return (
    <Badge.Anchor className="selo-avatar">
      {children}
      <Badge color={cor} variant={variante} size={tamanho} placement={lugar} aria-label={rotulo}
        style={{ ...(fundo ? { "--badge-bg": fundo } : {}), ...(tinta ? { "--badge-fg": tinta } : {}) } as React.CSSProperties}>
        {conteudo}
      </Badge>
    </Badge.Anchor>
  );
}

export function Avatar({ selo, ...resto }: Parameters<typeof AvatarBase>[0] & { selo?: SeloAvatar | null }) {
  return selo ? <ComSelo selo={selo}><AvatarBase {...resto} /></ComSelo> : <AvatarBase {...resto} />;
}

function AvatarBase({
  url, nome, size = 44, formato = "quadrado", className,
}: {
  url: string | null | undefined;
  nome: string;
  size?: number;
  /** "quadrado" = squircle (grades e listas). "redondo" = pessoa isolada. */
  formato?: "quadrado" | "redondo";
  className?: string;
}) {
  const [falhou, setFalhou] = useState(false);
  // Trocar de pessoa numa lista virtualizada reaproveita o componente: sem
  // isto, a falha da foto anterior grudava na próxima.
  useEffect(() => { setFalhou(false); }, [url]);

  // Raio por PROPORÇÃO (`size * 0.24`) produzia 6, 7, 10, 11, 15px conforme o
  // tamanho — valores que não existem em lugar nenhum do sistema. A escala tem
  // quatro degraus de propósito ("quatro degraus, não quinze", em globals.css);
  // uma peça nova que inventa o seu próprio raio é como o defeito começa.
  const raio = formato === "redondo" ? "50%"
    : size <= 30 ? "var(--r-xs)"
      : size <= 52 ? "var(--r-sm)"
        : "var(--r-md)";
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: raio, flex: "0 0 auto",
    // O anel é o que dá uma ARESTA a toda foto, inclusive as de fundo claro.
    // Vem de `--text` por color-mix pra funcionar nos dois temas sem uma
    // segunda regra: 12% do texto sobre qualquer superfície é sempre um fio
    // visível, e nunca uma borda pesada.
    boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent)",
    background: "var(--surface-2)",
  };

  if (url && !falhou) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url} alt="" aria-hidden className={className}
        onError={() => setFalhou(true)}
        style={{ ...base, objectFit: "cover" }}
      />
    );
  }

  return (
    <span className={className} aria-hidden style={{
      ...base, display: "grid", placeItems: "center",
      fontWeight: 800, fontSize: Math.round(size * 0.4), color: "var(--text-dim)",
      lineHeight: 1, userSelect: "none",
    }}>
      {(nome || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}
