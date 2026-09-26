"use client";

// Catálogo de produtos dentro da Central de Tutoriais.
//
// Quem chega aqui já está interessado no produto — aprendeu a usar e quer
// comprar. Por isso o catálogo é uma gaveta da própria central, e não um link
// que joga a pessoa pra fora: o caminho de volta continua sendo o mesmo botão.
//
// A lista é buscada SOB DEMANDA, quando a gaveta abre. Trazer o catálogo junto
// com a página faria toda visita à central pagar por uma lista que a maioria
// não abre — e a conta de invocação da Vercel já pausou o projeto uma vez.
import { useEffect, useState } from "react";
import { Icon } from "@/app/(plataforma)/Icon";

export interface ProdutoCatalogo {
  id: string; titulo: string; preco: number; precoDe: number | null;
  imagemUrl: string; paginaHref: string; comprarHref: string; comprarPeloZap: boolean;
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CatalogoCentral({ lojaSlug }: { lojaSlug: string }) {
  const [produtos, setProdutos] = useState<ProdutoCatalogo[] | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setProdutos(null); setErro(false);
    fetch(`/api/f/catalogo?loja=${encodeURIComponent(lojaSlug)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { produtos?: ProdutoCatalogo[] }) => { if (vivo) setProdutos(j.produtos ?? []); })
      .catch(() => { if (vivo) { setErro(true); setProdutos([]); } });
    return () => { vivo = false; };
  }, [lojaSlug]);

  // Esqueleto do TAMANHO do cartão, não um "carregando…" solto: sem isso a
  // lista aparece de repente e empurra a página que a pessoa já estava lendo.
  if (produtos === null) {
    return <div className="tut-produtos" aria-busy="true">
      {[0, 1, 2, 3].map((i) => <div className="tut-produto-card tut-produto-esqueleto" key={i} />)}
    </div>;
  }

  if (!produtos.length) {
    return <div className="tut-vazio">
      <span className="tut-vazio-icone"><Icon name="shopping-bag" size={26} /></span>
      <h2>{erro ? "Não deu para carregar o catálogo" : "Catálogo a caminho"}</h2>
      <p>{erro ? "Tente de novo em instantes." : "Os produtos aparecem aqui assim que forem publicados na loja."}</p>
    </div>;
  }

  return <div className="tut-produtos">
    {produtos.map((p, i) => (
      <article className="tut-produto-card" key={p.id} style={{ "--i": Math.min(i, 6) } as React.CSSProperties}>
        {/* A foto repete o destino do título logo abaixo e não tem texto: no
            leitor de tela ela virava um "link" sem nome (ou a URL lida em voz
            alta) e, no Tab, uma parada inútil por produto. Sai da árvore e da
            ordem de foco, mas continua clicável pro dedo e pro mouse. As duas
            marcações andam juntas — foco dentro de aria-hidden é outro defeito. */}
        <a className="tut-produto-foto" href={p.paginaHref} tabIndex={-1} aria-hidden="true">
          {p.imagemUrl ? <img src={p.imagemUrl} alt="" loading="lazy" decoding="async" /> : <Icon name="package" size={26} />}
        </a>
        <div className="tut-produto-corpo">
          <a className="tut-produto-titulo" href={p.paginaHref}>{p.titulo}</a>
          <p className="tut-produto-preco">
            {p.precoDe && <s>{moeda(p.precoDe)}</s>}
            <strong>{moeda(p.preco)}</strong>
          </p>
          {/* WhatsApp abre em aba nova (é outro aplicativo); o carrinho da
              vitrine continua na mesma aba, senão a pessoa perde o caminho. */}
          <a className="tut-botao" href={p.comprarHref}
            {...(p.comprarPeloZap ? { target: "_blank", rel: "noreferrer noopener" } : null)}>
            <Icon name={p.comprarPeloZap ? "brand-whatsapp" : "shopping-bag"} size={16} />
            {p.comprarPeloZap ? "Comprar pelo WhatsApp" : "Comprar"}
          </a>
        </div>
      </article>
    ))}
  </div>;
}
