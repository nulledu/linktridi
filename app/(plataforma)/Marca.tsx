// Logo de marca de terceiro (Meta, WhatsApp, Google Ads…) em cor oficial.
// Vive ao lado do `Icon.tsx`, mas é outra coisa: o Icon é iconografia própria
// (Tabler, traço, cor da pessoa); a Marca é a logo DA EMPRESA, cheia e colorida,
// só pra identificar a plataforma numa tela de conectar/escolher canal.
//
// Renderiza um `<img>` (não SVG inline) de propósito: os SVGs do thesvg usam
// gradientes com `id="a"`, `id="b"` — dois inline na mesma tela colidiriam de id
// e um herdaria o gradiente do outro. O `<img>` isola cada SVG.
//
// Marca sem logo vendorizada (Mercado Livre, Kwai, Yampi…) cai no `fallbackIcon`
// que a tela já usava — some nada, e a régua de qualidade não quebra por uma
// marca que ainda não tem arquivo.
import { MARCAS, temLogo } from "@/lib/marcas";
import { Icon } from "./Icon";

export function Marca({
  slug,
  size = 24,
  title,
  fallbackIcon,
  cor = "currentColor",
  className,
  style,
}: {
  /** Slug da marca em `lib/marcas.ts` (ex.: "meta", "whatsapp"). */
  slug: string | null | undefined;
  size?: number;
  /** Rótulo acessível; cai no nome da marca do mapa. */
  title?: string;
  /** Ícone Tabler de reserva quando a marca não tem logo vendorizada. */
  fallbackIcon?: string;
  /** Cor do ícone de reserva (a logo, sendo colorida, ignora). */
  cor?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!temLogo(slug)) {
    return fallbackIcon ? (
      <Icon name={fallbackIcon} size={size} color={cor} className={className} style={style} />
    ) : null;
  }

  const m = MARCAS[slug];
  const alt = title ?? m.label;
  const dims = { width: size, height: size };
  const base = { alt, ...dims, loading: "lazy", decoding: "async", draggable: false } as const;
  const imgStyle: React.CSSProperties = { objectFit: "contain", display: "block", ...style };

  // Logo de tinta escura: guarda as duas e o CSS (globals.css) mostra a certa
  // por tema. `.marca-luz` no claro, `.marca-noite` no escuro.
  if (m.temEscuro) {
    return (
      <>
        <img {...base} src={`/marcas/${slug}.svg`} className={`marca-luz${className ? ` ${className}` : ""}`} style={imgStyle} />
        <img {...base} src={`/marcas/${slug}-dark.svg`} className={`marca-noite${className ? ` ${className}` : ""}`} style={imgStyle} />
      </>
    );
  }

  return <img {...base} src={`/marcas/${slug}.svg`} className={className} style={imgStyle} />;
}
