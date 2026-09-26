"use client";

// Os controles da leitura que dependem do aparelho — o que a pessoa marcou,
// se o navegador sabe manter a tela acesa. Tudo aqui nasce do servidor igual
// (nada marcado, sem botão de tela) e muda só depois de montar: é o que deixa
// a hidratação bater.
import type { ReactNode } from "react";
import { Icon } from "@/app/(plataforma)/Icon";
import { textoAndamento } from "@/lib/tridiflow-tutoriais-leitura";
import { rolarAte } from "../rolagem";
import { useLeitura } from "./LeituraTutorial";

/** A seção de um passo. O conteúdo chega pronto do servidor (`children`); aqui
 *  só entram a âncora e a marca de feito, que esmaece o passo.
 *  `tabIndex={-1}`: a âncora leva até o passo E o leitor de tela continua a
 *  leitura DALI, em vez de recomeçar do topo. */
export function PassoSecao({ n, children }: { n: number; children: ReactNode }) {
  const { ehFeito } = useLeitura();
  return (
    <section className="tut-bloco tut-passo" id={`passo-${n}`} data-passo={n} tabIndex={-1}
      aria-labelledby={`passo-${n}-titulo`} data-feito={ehFeito(n) ? "1" : undefined}>
      {children}
    </section>
  );
}

/** "Feito" do passo: 44px, na ponta do polegar, no FIM do passo — é onde a
 *  pessoa está quando termina de fazer.
 *  Nome acessível FIXO, estado só no `aria-pressed`: se o nome trocasse junto,
 *  o leitor de tela diria o estado duas vezes ("Feito, pressionado"). O texto
 *  visível troca mesmo assim (quem enxerga não depende do ícone pequeno) e
 *  continua dentro do nome — quem comanda por voz acha o botão pelo que vê. */
export function BotaoFeito({ n }: { n: number }) {
  const l = useLeitura();
  const feito = l.ehFeito(n);
  return (
    <button type="button" className="tut-feito" aria-pressed={feito} aria-label="Marcar como feito" onClick={() => {
      // Marcou: a página leva ao próximo passo — sem isso a pessoa rola com o
      // dedo sujo de tinta. Desmarcar não mexe na página.
      if (l.alternar(n)) rolarAte(document.getElementById(`passo-${n + 1}`), "start");
    }}>
      <Icon name={feito ? "circle-check" : "circle"} size={19} />
      <span>{feito ? "Feito" : "Marcar como feito"}</span>
    </button>
  );
}

/** "2 de 5 passos feitos · Recomeçar". Só existe com algo marcado: quem volta
 *  amanhã pra refazer o processo precisa de um jeito de zerar. */
export function Andamento() {
  const l = useLeitura();
  if (!l.total || !l.feitos.length) return null;
  return (
    <p className="tut-andamento">
      <Icon name="circle-check" size={17} />
      <span>{textoAndamento(l.feitos.length, l.total)}</span>
      <button type="button" className="tut-recomecar" onClick={() => {
        l.recomecar();
        // O botão some com o que ele apagou; o foco vai pro primeiro passo em
        // vez de cair no nada (o leitor de tela recomeçaria do topo).
        document.getElementById("passo-1")?.focus({ preventScroll: true });
      }}>
        <Icon name="refresh" size={15} />Recomeçar
      </button>
    </p>
  );
}

/** Só aparece onde o navegador sabe fazer (Wake Lock): botão que não funciona
 *  é pior que botão nenhum. */
export function BotaoTelaAcesa() {
  const l = useLeitura();
  if (!l.suportaTela) return null;
  return (
    <button type="button" className="tut-botao tut-tela" data-sec="1" aria-pressed={l.telaAcesa}
      onClick={() => (l.telaAcesa ? l.desligarTela() : l.ligarTela())}>
      <Icon name="sun" size={16} />Manter tela acesa
    </button>
  );
}

export function BotaoPassoAPasso() {
  const l = useLeitura();
  if (l.total < 2) return null;
  return (
    <button type="button" className="tut-botao tut-botao-modo" onClick={(e) => l.abrirModo(e.currentTarget)}>
      <Icon name="arrows-maximize" size={16} />Passo a passo em tela cheia
    </button>
  );
}
