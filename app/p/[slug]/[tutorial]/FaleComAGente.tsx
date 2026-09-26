"use client";

// "Fale com a gente" pelo WhatsApp, com a mensagem já escrita.
//
// A mensagem leva o nome do guia, o passo em que a pessoa está (quando a
// página sabe) e o motivo — o atendente responde o problema em vez de
// perguntar "qual tutorial?". O passo vem do estado da leitura, então o
// endereço nasce igual no servidor (sem passo) e se completa depois de montar.
//
// O toque também conta um "contato": é o número que diz quais guias ainda
// empurram a pessoa pro atendimento.
import type { ReactNode } from "react";
import { Icon } from "@/app/(plataforma)/Icon";
import { linkWhatsapp } from "@/lib/tridiflow-tutoriais";
import { mensagemWhatsapp, type OrigemContato } from "@/lib/tridiflow-tutoriais-leitura";
import { useLeitura } from "./LeituraTutorial";
import { enviarMetrica } from "./metrica";

/** Um contato por tutorial, por navegador, por dia — o mesmo critério do voto.
 *  Sem a guarda, o toque repetido (o app que não abriu e a pessoa tocou de
 *  novo, ou os dois botões da página: o do "Deu errado?" e o do "Ainda não")
 *  somava dois chamados de uma pessoa só, e o número que diz se o guia poupa
 *  atendimento saía inflado — contador diário não tem como ser limpo depois.
 *  O dia é o de São Paulo, o mesmo que o banco grava: quem volta amanhã com
 *  outro problema é outro chamado. Uma chave só por tutorial (o valor é o
 *  dia), pra não deixar uma chave por dia acumulando no aparelho. */
function contarContato(botId: string | undefined, handle: string): void {
  if (!botId || !handle) return;
  const chave = `tut-contato:${botId}:${handle}`;
  try {
    // Dentro do try: navegador antigo sem a tabela de fusos lança no
    // construtor, e isso não pode derrubar o link de quem pediu ajuda.
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (localStorage.getItem(chave) === hoje) return;
    localStorage.setItem(chave, hoje);
  } catch { /* armazenamento bloqueado (janela anônima): conta sem a guarda, como o voto */ }
  enviarMetrica(botId, handle, "contatos");
}

export function FaleComAGente({ whatsapp, titulo, handle, botId, motivo, children }: {
  whatsapp: string; titulo: string; handle: string;
  /** Sem ele (prévia do editor) o link funciona, mas nada é contado. */
  botId?: string;
  motivo?: OrigemContato | null;
  children: ReactNode;
}) {
  const { atual } = useLeitura();
  const href = linkWhatsapp(whatsapp, mensagemWhatsapp({ titulo, passo: atual, motivo }));
  if (!href) return null;
  return (
    <a className="tut-botao tut-fale" data-sec="1" href={href} target="_blank" rel="noreferrer noopener"
      onClick={() => contarContato(botId, handle)}>
      <Icon name="brand-whatsapp" size={17} />{children}
    </a>
  );
}
