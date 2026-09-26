"use client";

// ── Dropdown do sistema: menu de AÇÕES ancorado num gatilho ──────────────────
// A gramática é a do Dropdown do HeroUI v3 (itens com ícone, descrição e
// atalho; seções com cabeçalho; separador; item de perigo; seleção única ou
// múltipla com indicador à esquerda), mas a mecânica é a NOSSA: a folha é o
// `Panel` do GlassPicker — portal pro <body>, posição medida da âncora e
// refeita na rolagem em captura, véu de verdade e folha presa embaixo no
// celular, fechamento no ritmo da escala (`--dropdown-close-dur`). O Popover
// do React Aria que o HeroUI usa não vira folha no celular e põe z-index
// 100000 na mão; por isso o visual veio e o motor ficou.
//
// Pra ESCOLHER um valor de uma lista continua sendo o `GlassSelect` — este é o
// "⋯"/"Ações" que dispara coisas. As duas folhas têm o mesmo desenho
// (`.gp-pop`/`.gp-row` no globals.css, bloco "DROPDOWN DO SISTEMA").

import { Tecla } from "./exibicao";
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "../Icon";
import { Panel, useFolha } from "../GlassPicker";
import { Botao, BotaoIcone } from "./controles";

export interface ItemDropdown {
  id: string;
  rotulo: string;
  /** Linha de apoio embaixo do rótulo ("Mover pra lixeira"). */
  descricao?: string;
  /** Nome do ícone do `Icon.tsx` (Tabler). */
  icone?: string;
  /** Teclas do atalho, uma por tecla: `["⌘", "N"]`. Só informa — quem escuta o atalho é a tela. */
  atalho?: string[];
  perigo?: boolean;
  desativado?: boolean;
  /** Visual próprio no lugar do ícone (logo `<Marca>`, avatar). Vence `icone`. */
  inicio?: ReactNode;
  /** Cor própria do ícone (ex.: a cor da origem). Item de perigo ignora e usa `--perigo`. */
  cor?: string;
  /** Item que é LINK: vira `<a>` de verdade — clique do meio e "abrir em nova aba" continuam valendo. */
  href?: string;
  novaAba?: boolean;
  onSelect?: () => void;
}

export interface SecaoDropdown {
  /** Cabeçalho pequeno e apagado da seção. */
  titulo?: string;
  itens: ItemDropdown[];
  /** Seção que ESCOLHE: indicador à esquerda, `aria-checked`. Sem isto, o item só dispara `onSelect`. */
  selecao?: "unica" | "multipla";
  selecionados?: string[];
  onSelecao?: (ids: string[]) => void;
  /** `check` (padrão) ou `ponto` — o ponto lê como "um entre vários" (alinhamento, ordem). */
  indicador?: "check" | "ponto";
}

export interface PropsDoGatilho {
  ref: (el: HTMLElement | null) => void;
  onClick: (e?: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
}

export function Dropdown({
  itens, secoes, gatilho, rotulo, icone, titulo, alinhar = "inicio", largura = 220, cabecalho,
  aberto: abertoControlado, onAbertoChange,
}: {
  /** Atalho pra uma seção só, sem cabeçalho. */
  itens?: ItemDropdown[];
  secoes?: SecaoDropdown[];
  /** Gatilho próprio (avatar, chip…). Espalhe as props no elemento clicável. */
  gatilho?: (p: PropsDoGatilho) => ReactNode;
  /** Sem `gatilho`: com rótulo vira `Botao` secundário com seta; sem, `BotaoIcone` ("⋯" por padrão). */
  rotulo?: string;
  icone?: string;
  /** Nome acessível do menu (e do botão só-ícone). */
  titulo: string;
  alinhar?: "inicio" | "fim";
  largura?: number;
  /** Conteúdo livre no topo da folha (ex.: avatar + e-mail no menu da conta). */
  cabecalho?: ReactNode;
  aberto?: boolean;
  onAbertoChange?: (v: boolean) => void;
}) {
  const [abertoInterno, setAbertoInterno] = useState(false);
  const aberto = abertoControlado ?? abertoInterno;
  const setAberto = (v: boolean) => { if (abertoControlado === undefined) setAbertoInterno(v); onAbertoChange?.(v); };

  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const [foco, setFoco] = useState(-1);
  const menu = useRef<HTMLDivElement>(null);
  const pelaTecla = useRef(false);
  const uid = useId();
  const { vivo, classe } = useFolha(aberto);

  const lista: SecaoDropdown[] = secoes ?? (itens ? [{ itens }] : []);
  // Ordem de navegação por seta: todos os itens, na ordem em que aparecem.
  const planos = lista.flatMap((s, si) => s.itens.map((it) => ({ it, s, si })));

  const fechar = (devolverFoco = true) => {
    setAberto(false);
    if (devolverFoco && menu.current?.contains(document.activeElement)) ancora?.focus();
  };

  // Abriu: o foco vai pro menu (setas funcionam). Pela tecla, o 1º item já
  // nasce ativo, como no menu do sistema; pelo toque, nenhum.
  useEffect(() => {
    if (!aberto) return;
    setFoco(pelaTecla.current ? proximo(-1, 1) : -1);
    pelaTecla.current = false;
    const t = setTimeout(() => menu.current?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  // Item ativo sempre à vista quando a seta passa da borda da folha.
  useEffect(() => {
    if (foco < 0) return;
    menu.current?.querySelector<HTMLElement>(`[data-i="${foco}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [foco]);

  function proximo(de: number, passo: 1 | -1): number {
    const n = planos.length;
    for (let k = 1; k <= n; k++) {
      const i = (de + passo * k + n * 2) % n;
      if (!planos[i].it.desativado) return i;
    }
    return -1;
  }

  const escolher = (i: number) => {
    const alvo = planos[i];
    if (!alvo || alvo.it.desativado) return;
    const { it, s } = alvo;
    if (s.selecao === "multipla") {
      const atual = s.selecionados ?? [];
      s.onSelecao?.(atual.includes(it.id) ? atual.filter((x) => x !== it.id) : [...atual, it.id]);
      it.onSelect?.();
      return;   // múltipla fica aberta: marcar três coisas não pode custar três aberturas
    }
    if (s.selecao === "unica") s.onSelecao?.([it.id]);
    fechar();
    it.onSelect?.();
    // Pela tecla o <a> não navega sozinho (o foco está no menu, não nele).
    if (it.href) { if (it.novaAba) window.open(it.href, "_blank", "noopener"); else window.location.assign(it.href); }
  };

  const onKeyMenu = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setFoco((f) => proximo(f, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFoco((f) => proximo(f < 0 ? planos.length : f, -1)); }
    else if (e.key === "Home") { e.preventDefault(); setFoco(proximo(-1, 1)); }
    else if (e.key === "End") { e.preventDefault(); setFoco(proximo(planos.length, -1)); }
    else if ((e.key === "Enter" || e.key === " ") && foco >= 0) { e.preventDefault(); escolher(foco); }
    else if (e.key === "Tab") fechar(false);
    // Esc fecha SÓ o menu: parado aqui, não chega no atalho de Esc da tela
    // (que fecharia junto a thread/painel de trás).
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(); }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Busca por letra: pula pro próximo item que começa com ela.
      const l = e.key.toLocaleLowerCase("pt-BR");
      const n = planos.length;
      for (let k = 1; k <= n; k++) {
        const i = (foco + k + n) % n;
        if (!planos[i].it.desativado && planos[i].it.rotulo.toLocaleLowerCase("pt-BR").startsWith(l)) { setFoco(i); break; }
      }
    }
  };

  const propsGatilho: PropsDoGatilho = {
    ref: setAncora,
    // O "⋯" costuma morar dentro de um cartão/linha que é clicável inteiro:
    // abrir o menu não pode abrir o cartão junto.
    onClick: (e) => { e?.stopPropagation(); setAberto(!aberto); },
    onKeyDown: (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); pelaTecla.current = true; setAberto(true); }
      else if (e.key === "Enter" || e.key === " ") pelaTecla.current = true;
    },
    "aria-haspopup": "menu",
    "aria-expanded": aberto,
  };

  let i = -1;
  return (
    <>
      {gatilho ? gatilho(propsGatilho) : rotulo ? (
        <Botao variante="secundario" icone={icone} iconeFim="chevron-down" {...propsGatilho}>{rotulo}</Botao>
      ) : (
        <BotaoIcone icone={icone ?? "dots"} titulo={titulo} {...propsGatilho} />
      )}
      {vivo && (
        <Panel anchor={ancora} aberto={aberto} classe={classe} onClose={() => fechar()} alinhar={alinhar}
          width={Math.max(ancora?.offsetWidth ?? 0, largura)}>
          {/* O evento do React atravessa o portal: sem esta parada, escolher um
              item disparava também o onClick do cartão que contém o gatilho. */}
          <div style={{ display: "contents" }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          {cabecalho}
          <div ref={menu} role="menu" aria-label={titulo} tabIndex={-1} className="gp-menu" onKeyDown={onKeyMenu}
            aria-activedescendant={foco >= 0 ? `${uid}-${foco}` : undefined}>
            {lista.map((s, si) => (
              <Fragment key={si}>
                {si > 0 && <div className="gp-sep" role="separator" />}
                <div role="group" aria-label={s.titulo}>
                  {s.titulo && <div className="gp-cab" aria-hidden>{s.titulo}</div>}
                  {s.itens.map((it) => {
                    i++;
                    const idx = i;
                    const marcado = !!s.selecao && (s.selecionados ?? []).includes(it.id);
                    const Tag = it.href ? "a" : "div";
                    return (
                      <Tag key={it.id} id={`${uid}-${idx}`} data-i={idx}
                        role={s.selecao === "multipla" ? "menuitemcheckbox" : s.selecao === "unica" ? "menuitemradio" : "menuitem"}
                        aria-checked={s.selecao ? marcado : undefined}
                        aria-disabled={it.desativado || undefined}
                        className={`gp-row${it.perigo ? " gp-row--perigo" : ""}`}
                        data-ind={s.selecao ? "" : undefined}
                        data-ativo={foco === idx ? "" : undefined}
                        onMouseDown={(e) => e.preventDefault()}
                        onPointerEnter={() => !it.desativado && setFoco(idx)}
                        onPointerLeave={() => setFoco(-1)}
                        {...(it.href ? { href: it.desativado ? undefined : it.href, ...(it.novaAba ? { target: "_blank", rel: "noopener noreferrer" } : null) } : null)}
                        onClick={(e: React.MouseEvent) => {
                          if (!it.href) return escolher(idx);
                          if (it.desativado) { e.preventDefault(); return; }
                          fechar(false); it.onSelect?.();   // o próprio <a> navega
                        }}>
                        {s.selecao && (
                          <span className="gp-ind" aria-hidden>
                            {marcado && (s.indicador === "ponto" ? <span className="gp-ponto" /> : <Icon name="check" size={14} />)}
                          </span>
                        )}
                        {it.inicio ?? (it.icone && <Icon name={it.icone} size={16} color={it.perigo ? "var(--perigo)" : it.cor ?? "var(--text-dim)"} />)}
                        <span className="gp-row-txt">
                          <span className="gp-row-rot">{it.rotulo}</span>
                          {it.descricao && <span className="gp-row-desc">{it.descricao}</span>}
                        </span>
                        {it.atalho && <span className="gp-kbd" aria-hidden>{it.atalho.map((k, j) => <Tecla key={j}>{k}</Tecla>)}</span>}
                      </Tag>
                    );
                  })}
                </div>
              </Fragment>
            ))}
          </div>
          </div>
        </Panel>
      )}
    </>
  );
}
