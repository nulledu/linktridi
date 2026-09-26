"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Botao } from "./controles";
import "./menuDaConta.css";

/**
 * MenuDaConta — o botão da pessoa que VIRA o cartão da conta.
 *
 * Porte do "Clerk UserButton" do examples.motion.dev, sem a biblioteca Motion:
 * lá o morph é um `layoutId` compartilhado entre dois nós; aqui é UM nó só
 * (`.ui-mc`) que anima largura, altura e raio — a pílula de 44px cresce pro
 * cartão ancorado no mesmo canto. O avatar é o mesmo elemento nos dois
 * estados e só desliza pro centro do cabeçalho. O conteúdo entra com
 * opacidade + desfoque DEPOIS do corpo começar a abrir (atraso de intenção).
 *
 * Tempo e curva saem da escala: abre em --duration-fast, fecha em
 * --duration-quick, sem atraso e sem curva que passa do ponto na saída.
 *
 * Mora dentro do cabeçalho (absolute, não fixed): quem o usa não pode ter
 * `overflow: hidden` no caminho até o canto.
 */
export interface ItemDaConta {
  icone: string;
  rotulo: string;
  onClick: () => void;
  perigo?: boolean;
}

export function MenuDaConta({
  nome, email, foto, itens, lado = "esquerda", rodape,
}: {
  nome: string;
  email?: string;
  foto?: string | null;
  itens: ItemDaConta[];
  /** Canto onde o botão mora; o cartão cresce pro lado oposto. */
  lado?: "esquerda" | "direita";
  /** Linha discreta embaixo das ações (versão, "protegido por…"). */
  rodape?: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [altura, setAltura] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const corpo = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const id = useId();

  // A altura aberta é medida do conteúdo real (nome longo quebra linha, item a
  // mais cresce) — altura fixa cortaria. O conteúdo está sempre no DOM.
  useLayoutEffect(() => {
    const el = corpo.current;
    if (!el) return;
    const medir = () => setAltura(el.offsetHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setAberto(false); gatilho.current?.focus(); }
    };
    document.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      window.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const escolher = (fn: () => void) => { setAberto(false); fn(); };

  return (
    <div ref={raiz} className="ui-mc-raiz" data-lado={lado}>
      <div
        className="ui-mc"
        data-aberto={aberto || undefined}
        style={{ "--mc-h": `${altura}px` } as React.CSSProperties}
      >
        <button
          ref={gatilho}
          type="button"
          className="ui-mc-gatilho"
          aria-label={aberto ? "Fechar menu da conta" : "Abrir menu da conta"}
          aria-expanded={aberto}
          aria-controls={id}
          onClick={() => setAberto(a => !a)}
        >
          <span className="ui-mc-avatar">
            <Avatar url={foto} nome={nome} size={36} formato="redondo" />
          </span>
        </button>

        <div ref={corpo} id={id} className="ui-mc-corpo" inert={!aberto}>
          <div className="ui-mc-cab">
            <p className="ui-mc-nome">{nome}</p>
            {email && <p className="ui-mc-email">{email}</p>}
          </div>
          <div className="ui-mc-acoes">
            {itens.map(it => (
              <Botao
                key={it.rotulo}
                variante={it.perigo ? "perigo" : "sutil"}
                icone={it.icone}
                bloco
                className="ui-mc-item"
                onClick={() => escolher(it.onClick)}
              >
                {it.rotulo}
              </Botao>
            ))}
            {rodape && <div className="ui-mc-rodape">{rodape}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
