"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertDialog, Button, Toast, toast as toastHeroUI, type HeroUIToastOptions } from "@heroui/react";
import { Icon } from "./Icon";
import { DesfazerHost } from "./ui/Desfazer";

// ── Toasts + confirmação premium (substitui alert()/confirm() nativos) ──
// Uso de qualquer lugar (client): toast("Salvo!"), toast.erro("Falhou"),
// e `await confirmar("Remover?")` → Promise<boolean>. Um único host no Shell.

// Notificação = o Toast do HeroUI v3 (pilha que se expande no hover, fila,
// pausa com o mouse em cima e com a aba em segundo plano, Alt+T leva o foco
// pra região). A API continua a nossa — `toast.ok("Salvo")` em 130+ lugares —
// e aqui ela vira a do HeroUI com duas coisas da casa: ícone do Tabler (o
// padrão dele não é Tabler) e a cor de estado da paleta semântica (globals.css,
// bloco "Toast do HeroUI").
type Tipo = "ok" | "erro" | "info" | "atencao" | "neutro";
export interface OpcoesToast {
  /** Linha de apoio embaixo do título. */
  descricao?: ReactNode;
  /** Um botão. Depois de rodar, o aviso sai. */
  acao?: { rotulo: string; onClick: () => void };
  /** Nome do Tabler no lugar do ícone do tipo. */
  icone?: string;
  /** Giro no lugar do ícone e não sai sozinho — troque com `toast.atualizar`. */
  carregando?: boolean;
  /** Milissegundos de vida; 0 = fica até a pessoa dispensar. */
  duracao?: number;
  aoFechar?: () => void;
}

const VARIANTE: Record<Tipo, NonNullable<HeroUIToastOptions["variant"]>> = {
  ok: "success", erro: "danger", info: "accent", atencao: "warning", neutro: "default",
};
const ICONE: Record<Tipo, string> = {
  ok: "circle-check", erro: "alert-triangle", info: "info-circle", atencao: "alert-triangle", neutro: "bell",
};
// Erro e atenção ficam mais: é o que a pessoa precisa LER, não só perceber.
// Descrição e ação somam tempo — tem mais o que ler, ou onde tocar.
const VIDA_MS: Record<Tipo, number> = { ok: 4000, info: 4000, neutro: 4000, atencao: 6000, erro: 6000 };

function opcoes(tipo: Tipo, o: OpcoesToast, id: () => string): HeroUIToastOptions {
  return {
    variant: VARIANTE[tipo],
    description: o.descricao,
    indicator: <Icon name={o.icone ?? ICONE[tipo]} size={16} />,
    // Explícito sempre: no `update` o que não vem é HERDADO, e o giro de
    // "salvando…" ficaria rodando no "salvo".
    isLoading: !!o.carregando,
    timeout: o.duracao ?? (o.carregando ? 0 : VIDA_MS[tipo] + (o.descricao ? 1500 : 0) + (o.acao ? 2500 : 0)),
    onClose: o.aoFechar,
    actionProps: o.acao
      ? { children: o.acao.rotulo, variant: tipo === "erro" ? "danger" : "tertiary", onPress: () => { o.acao!.onClick(); toastHeroUI.close(id()); } }
      : undefined,
  };
}

/** Mostra uma notificação e devolve o id (pra `toast.atualizar`/`toast.fechar`). */
export function toast(texto: ReactNode, tipo: Tipo = "ok", o: OpcoesToast = {}): string {
  let id = "";
  id = toastHeroUI(texto, opcoes(tipo, o, () => id));
  return id;
}
toast.ok = (t: ReactNode, o?: OpcoesToast) => toast(t, "ok", o);
toast.erro = (t: ReactNode, o?: OpcoesToast) => toast(t, "erro", o);
toast.info = (t: ReactNode, o?: OpcoesToast) => toast(t, "info", o);
toast.atencao = (t: ReactNode, o?: OpcoesToast) => toast(t, "atencao", o);
toast.neutro = (t: ReactNode, o?: OpcoesToast) => toast(t, "neutro", o);
/** Troca o aviso no lugar (mesma posição na pilha) — "salvando…" → "salvo". */
toast.atualizar = (id: string, texto: ReactNode, tipo: Tipo = "ok", o: OpcoesToast = {}) => {
  toastHeroUI.update(id, texto, opcoes(tipo, o, () => id));
};
toast.fechar = (id: string) => toastHeroUI.close(id);
/** "Enviando…" com giro enquanto a promessa corre; vira ok ou erro no lugar.
 *  Devolve a própria promessa, pra quem chamou continuar com o resultado. */
toast.promessa = <T,>(p: Promise<T>, m: { carregando: ReactNode; ok: ReactNode | ((d: T) => ReactNode); erro: ReactNode | ((e: Error) => ReactNode) }): Promise<T> => {
  const id = toast(m.carregando, "neutro", { carregando: true });
  p.then(
    (d) => toast.atualizar(id, typeof m.ok === "function" ? (m.ok as (d: T) => ReactNode)(d) : m.ok, "ok"),
    (e: unknown) => toast.atualizar(id, typeof m.erro === "function" ? (m.erro as (e: Error) => ReactNode)(e instanceof Error ? e : new Error(String(e))) : m.erro, "erro"),
  );
  return p;
};

type TomConfirmacao = "destaque" | "sucesso" | "atencao" | "perigo";
/** `tom` manda na cor e no ícone; `perigo: true` continua valendo (vira tom
 *  "perigo"). `acao`/`cancelar` trocam o rótulo dos botões. */
export interface OpcoesConfirmar { detalhe?: string; perigo?: boolean; tom?: TomConfirmacao; acao?: string; cancelar?: string }
interface ConfirmReq extends OpcoesConfirmar { id: number; texto: string; resolve: (v: boolean) => void }

let _confirm: ((r: Omit<ConfirmReq, "id" | "resolve">) => Promise<boolean>) | null = null;

export function confirmar(texto: string, opts?: OpcoesConfirmar): Promise<boolean> {
  return _confirm ? _confirm({ texto, ...opts }) : Promise.resolve(window.confirm(texto));
}

// Tom → status do AlertDialog do HeroUI + ícone Tabler (o ícone padrão dele
// não é Tabler) + variante do botão de ação.
const TOM: Record<TomConfirmacao, { status: "accent" | "success" | "warning" | "danger"; icone: string; botao: "primary" | "danger" }> = {
  destaque: { status: "accent", icone: "info-circle", botao: "primary" },
  sucesso: { status: "success", icone: "circle-check", botao: "primary" },
  atencao: { status: "warning", icone: "alert-triangle", botao: "primary" },
  perigo: { status: "danger", icone: "alert-triangle", botao: "danger" },
};

export function ToastHost() {
  const [conf, setConf] = useState<ConfirmReq | null>(null);
  const [mounted, setMounted] = useState(false);

  // A pergunta continua desenhada enquanto a saída roda: `conf` vira null no
  // clique (a promessa resolve na hora, ninguém espera a animação), e o
  // AlertDialog segura o nó montado durante o `data-exiting` — sem guardar o
  // último pedido ele sairia de cena em branco.
  const ultimoConf = useRef<ConfirmReq | null>(null);
  if (conf) ultimoConf.current = conf;
  const pergunta = conf ?? ultimoConf.current;
  const tom = TOM[pergunta?.tom ?? (pergunta?.perigo ? "perigo" : "destaque")];

  // Só cria o portal no client — no SSR `document` não existe (evita 500).
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let n = 1;
    _confirm = (r) => new Promise<boolean>((resolve) => setConf({ ...r, id: n++, resolve }));
    return () => { _confirm = null; };
  }, []);

  function fechar(v: boolean) { if (conf) { conf.resolve(v); setConf(null); } }

  if (!mounted) return null;
  return createPortal(
    <>
      {/* Região das notificações. No alto e no centro, como sempre foi no
          app — embaixo, no celular, ela nasceria em cima da barra de abas.
          O HeroUI se porta sozinho, com z-index acima de modal e painel. */}
      <Toast.Provider placement="top" maxVisibleToasts={3} width={420} aria-label="Notificações" />

      {/* Aviso "Desfazer" de ação destrutiva — `desfazer()` de qualquer lugar. */}
      <DesfazerHost />

      {/* Confirmação: AlertDialog do HeroUI (foco preso, `role="alertdialog"`,
          trava de rolagem, e no celular nasce preso embaixo — placement
          "auto"). Ele se porta sozinho pro body. Fechar por fora (Esc ou
          toque no fundo) é sempre "não": desistir nunca destrói nada, então
          não há motivo pra prender a pessoa. `.alerta-sistema` traz as cores
          e o alvo de toque da casa (globals.css). */}
      <AlertDialog.Backdrop className="alerta-sistema" variant="blur"
        isOpen={!!conf} onOpenChange={(aberto) => { if (!aberto) fechar(false); }}
        isDismissable isKeyboardDismissDisabled={false}>
        <AlertDialog.Container placement="auto" size="sm">
          <AlertDialog.Dialog>
            {pergunta && (
              <>
                <AlertDialog.Header>
                  <AlertDialog.Icon status={tom.status}>
                    <Icon name={tom.icone} size={20} />
                  </AlertDialog.Icon>
                  <AlertDialog.Heading>{pergunta.texto}</AlertDialog.Heading>
                </AlertDialog.Header>
                {pergunta.detalhe && (
                  <AlertDialog.Body><p>{pergunta.detalhe}</p></AlertDialog.Body>
                )}
                <AlertDialog.Footer>
                  <Button variant="tertiary" onPress={() => fechar(false)}>{pergunta.cancelar ?? "Cancelar"}</Button>
                  <Button variant={tom.botao} onPress={() => fechar(true)}>{pergunta.acao ?? "Confirmar"}</Button>
                </AlertDialog.Footer>
              </>
            )}
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>,
    document.body,
  );
}
