"use client";

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { Alert } from "@heroui/react";
import { Icon } from "../Icon";
import { BotaoIcone } from "./controles";

// ── Alerta: o ÚNICO aviso de sistema do app ─────────────────────────────────
// Havia um `Aviso` escrito à mão por módulo (Estoque, TridiMarket, TridiFlow,
// Webhooks, Etiquetas…), cada um com seu padding, seu raio e seu jeito de
// misturar a cor. Este é a anatomia do Alert do HeroUI v3 (Indicator, Content,
// Title, Description) com três coisas nossas por cima:
//
//   • ícone do Tabler, nunca o SVG embutido do HeroUI (regra do CLAUDE.md);
//   • cor de estado da paleta semântica (`--ok`/`--atencao`/`--perigo`/…),
//     calibrada por tema — as `--success`/`--danger` do HeroUI não são;
//   • ação e "dispensar" com alvo de 44px no celular (o `CloseButton` do
//     HeroUI tem 24px), e a ação desce pra baixo do texto quando o bloco é
//     estreito — por container query, então vale num painel lateral de 400px
//     no computador também, não só no celular.
//
// O mesmo componente desenha o toast (`flutuante`): o aviso que cai do alto e
// a faixa dentro da tela passam a ser a mesma peça, com o mesmo vocabulário.

export type TomAlerta = "neutro" | "info" | "destaque" | "ok" | "atencao" | "perigo";

const STATUS: Record<TomAlerta, "default" | "accent" | "success" | "warning" | "danger"> = {
  neutro: "default", info: "accent", destaque: "accent", ok: "success", atencao: "warning", perigo: "danger",
};

export const ICONE_DO_TOM: Record<TomAlerta, string> = {
  neutro: "info-circle", info: "info-circle", destaque: "sparkles", ok: "circle-check", atencao: "alert-triangle", perigo: "alert-triangle",
};

type Props = Omit<HTMLAttributes<HTMLDivElement>, "title" | "children"> & {
  tom?: TomAlerta;
  /** Linha forte. Sem título, a descrição vira o texto principal. */
  titulo?: ReactNode;
  /** Descrição — texto, lista, link. */
  children?: ReactNode;
  /** Nome do Tabler; `false` tira o ícone. Padrão: o do tom. */
  icone?: string | false;
  /** Troca o ícone por um giro ("sincronizando…"). */
  carregando?: boolean;
  /** Botão(ões) do kit — `<Botao tamanho="sm">`. Fica à direita quando cabe,
   *  embaixo do texto quando o bloco é estreito. */
  acao?: ReactNode;
  /** Mostra o "dispensar". Quem chama tira o alerta da tela. */
  aoFechar?: () => void;
  /** Rótulo do "dispensar" pro leitor de tela (padrão "Dispensar"). */
  rotuloFechar?: string;
  /** Vidro + sombra: o aviso que flutua por cima da tela (toast). */
  flutuante?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function Alerta({
  tom = "neutro", titulo, children, icone, carregando, acao, aoFechar, rotuloFechar = "Dispensar", flutuante, className, role, ...rest
}: Props) {
  const nomeIcone = icone === false ? null : (icone ?? ICONE_DO_TOM[tom]);
  // Erro e atenção interrompem o leitor de tela; o resto espera a vez. O toast
  // não se anuncia sozinho: a pilha já é uma região `aria-live`, e anunciar
  // duas vezes lê a frase duas vezes.
  const papel = role ?? (flutuante ? undefined : tom === "perigo" || tom === "atencao" ? "alert" : "status");
  return (
    <Alert
      status={STATUS[tom]}
      role={papel}
      data-tom={tom}
      data-flutuante={flutuante ? "1" : undefined}
      data-so-texto={titulo ? undefined : "1"}
      className={["ui-alerta", flutuante && "glass glass-spec", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {(nomeIcone || carregando) && (
        <Alert.Indicator className="ui-alerta__ico" aria-hidden>
          {carregando
            ? <span className="spin" style={{ display: "inline-flex" }}><Icon name="loader" size={flutuante ? 15 : 18} /></span>
            : <Icon name={nomeIcone!} size={flutuante ? 15 : 18} />}
        </Alert.Indicator>
      )}
      <Alert.Content className="ui-alerta__corpo">
        {titulo && <Alert.Title>{titulo}</Alert.Title>}
        {children != null && children !== false && <Alert.Description>{children}</Alert.Description>}
      </Alert.Content>
      {acao && <div className="ui-alerta__acoes" onClick={(e) => e.stopPropagation()}>{acao}</div>}
      {aoFechar && (
        <BotaoIcone
          icone="x" titulo={rotuloFechar} tamanho="sm" variante="sutil"
          className="ui-alerta__fechar"
          onClick={(e) => { e.stopPropagation(); aoFechar(); }}
        />
      )}
    </Alert>
  );
}
