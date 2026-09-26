"use client";

// Barra fina de progresso + "voltar ao topo".
//
// Num guia de doze passos lido no celular, a pessoa não sabe se está no meio
// ou perto do fim — e a régua do navegador é invisível na maioria dos
// telefones. A barra é o "quanto falta"; o botão evita a rolagem de volta.
//
// Com passos (2+), a barra conta PASSOS FEITOS, não rolagem: quem rola até o
// fim pra reler o passo 2 não terminou o guia, e a barra cheia mentiria. Sem
// passos (texto corrido), ela segue a rolagem — é o único "quanto falta" ali.
//
// `scaleX` num elemento de largura fixa em vez de animar `width`: largura
// refaz layout a cada quadro, transform não. E a leitura da rolagem vai num
// `requestAnimationFrame` — `scroll` dispara dezenas de vezes por segundo.
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/(plataforma)/Icon";
import { textoAndamento } from "@/lib/tridiflow-tutoriais-leitura";
import { rolarAoTopo } from "../rolagem";
import { useLeitura } from "./LeituraTutorial";

// Cheia vira `none`, não `scaleX(1)`: transform identidade que fica aplicado
// é a armadilha de bloco de contenção do projeto — aqui não haveria filho
// fixo, mas a regra vale sem exceção pra ninguém copiar a exceção.
const escala = (x: number) => (x >= 1 ? "none" : `scaleX(${Math.max(0, x)})`);

export function ProgressoLeitura() {
  const { total, feitos, interagiu } = useLeitura();
  const porPassos = total >= 2;
  const barra = useRef<HTMLDivElement>(null);
  const [longe, setLonge] = useState(false);

  useEffect(() => {
    let pedido = 0;
    const medir = () => {
      pedido = 0;
      const doc = document.documentElement;
      if (!porPassos && barra.current) {
        const altura = doc.scrollHeight - doc.clientHeight;
        barra.current.style.transform = escala(altura > 0 ? window.scrollY / altura : 0);
      }
      setLonge(window.scrollY > doc.clientHeight);
    };
    const aoRolar = () => { if (!pedido) pedido = requestAnimationFrame(medir); };
    medir();
    window.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", aoRolar, { passive: true });
    return () => {
      if (pedido) cancelAnimationFrame(pedido);
      window.removeEventListener("scroll", aoRolar);
      window.removeEventListener("resize", aoRolar);
    };
  }, [porPassos]);

  const fracao = porPassos ? feitos.length / total : null;
  useEffect(() => {
    if (fracao !== null && barra.current) barra.current.style.transform = escala(fracao);
  }, [fracao]);

  return <>
    <div className="tut-progresso" data-modo={porPassos ? "passos" : undefined} aria-hidden="true"><div ref={barra} /></div>
    {/* A região existe desde o primeiro render (vazia): leitor de tela só
        anuncia mudança numa região que ele já conhecia. */}
    {total > 0 && <p className="sr-only" role="status" aria-live="polite">{interagiu ? textoAndamento(feitos.length, total) : ""}</p>}
    {/* `inert` enquanto está escondido: opacidade 0 não tira o botão do Tab
        nem do leitor de tela, e num guia de até duas telas ele nunca aparece —
        o foco parava num controle invisível, com o anel desenhado a opacidade
        0. `aria-hidden` + `tabIndex={-1}` não bastaria: quem acabou de apertá-lo
        pelo teclado continua com o foco nele quando ele some no topo, e o
        Chrome recusa `aria-hidden` em nó focado. `inert` solta esse foco. */}
    <button type="button" className="tut-ao-topo" data-visivel={longe ? "1" : undefined} inert={!longe} onClick={rolarAoTopo}
      aria-label="Voltar ao início do tutorial" title="Voltar ao início">
      <Icon name="arrow-up" size={19} />
    </button>
  </>;
}
