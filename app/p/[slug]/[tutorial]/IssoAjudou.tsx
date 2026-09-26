"use client";

// "Este tutorial resolveu?" — a única pergunta que diz quais guias resolvem e
// quais só adiam o chamado.
//
// Decisões que a fazem valer:
//  • Um voto por tutorial por navegador (localStorage). Sem isso o mesmo
//    dedo entediado empurra o número e o dado deixa de servir pra decidir.
//  • A resposta fica no LUGAR da pergunta — nada de modal nem balão novo
//    empurrando o conteúdo de quem já terminou de ler.
//  • "Ainda não" pergunta o PORQUÊ com quatro respostas prontas: "não
//    resolveu" sozinho não diz se o problema é o guia, o catálogo ou o
//    produto. O motivo conta uma vez; trocar depois só muda a mensagem.
//  • Com WhatsApp na central, a saída é falar com alguém, com a mensagem já
//    escrita (guia, passo e motivo).
//  • Falha de rede não vira erro na cara de ninguém: o voto é acessório, e a
//    pessoa acabou de fazer um favor.
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/(plataforma)/Icon";
import { MOTIVOS_NAO, type CampoMotivo } from "@/lib/tridiflow-tutoriais-leitura";
import { FaleComAGente } from "./FaleComAGente";
import { enviarMetrica } from "./metrica";

type Voto = "uteis" | "inuteis";
const chave = (botId: string, handle: string) => `tut-voto:${botId}:${handle}`;
const chaveMotivo = (botId: string, handle: string) => `tut-motivo:${botId}:${handle}`;
const ehMotivo = (v: unknown): v is CampoMotivo => MOTIVOS_NAO.some((m) => m.campo === v);

export function IssoAjudou({ botId, handle, titulo = "", whatsapp = "" }: {
  botId: string; handle: string;
  /** Vai na mensagem do WhatsApp — o atendente sabe de qual guia se trata. */
  titulo?: string;
  /** Número da central. Vazio = sem o botão de falar com alguém. */
  whatsapp?: string;
}) {
  const [votou, setVotou] = useState<Voto | null>(null);
  const [motivo, setMotivo] = useState<CampoMotivo | null>(null);
  const [pronto, setPronto] = useState(false);
  const [mexeu, setMexeu] = useState(false);
  const resposta = useRef<HTMLParagraphElement>(null);

  // Lê no efeito, nunca no primeiro render: o servidor não tem localStorage e
  // a hidratação divergiria.
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(chave(botId, handle));
      if (salvo === "uteis" || salvo === "inuteis") setVotou(salvo);
      const m = localStorage.getItem(chaveMotivo(botId, handle));
      if (ehMotivo(m)) setMotivo(m);
    } catch { /* navegador anônimo com armazenamento bloqueado */ }
    setPronto(true);
  }, [botId, handle]);

  // O botão tocado some junto com a pergunta; o foco vai pra resposta em vez
  // de cair no começo da página (o leitor de tela recomeçaria do topo).
  useEffect(() => { if (mexeu) resposta.current?.focus({ preventScroll: true }); }, [mexeu, votou]);

  const votar = (campo: Voto) => {
    setVotou(campo);
    setMexeu(true);
    try { localStorage.setItem(chave(botId, handle), campo); } catch { /* idem */ }
    enviarMetrica(botId, handle, campo);
  };

  const escolher = (campo: CampoMotivo) => {
    const primeiraEscolha = motivo === null;
    setMotivo(campo);
    try { localStorage.setItem(chaveMotivo(botId, handle), campo); } catch { /* idem */ }
    // Só a primeira escolha conta: trocar de ideia muda a mensagem do
    // WhatsApp, não soma um segundo "não" no guia.
    if (primeiraEscolha) enviarMetrica(botId, handle, campo);
  };

  if (!pronto) return null;
  return (
    <section className="tut-ajudou" aria-labelledby="tut-ajudou-pergunta">
      {votou === null && <>
        <strong id="tut-ajudou-pergunta">Este tutorial resolveu?</strong>
        <div className="tut-ajudou-botoes">
          <button type="button" className="tut-botao" data-sec="1" onClick={() => votar("uteis")}>
            <Icon name="mood-smile" size={16} />Sim, resolveu
          </button>
          <button type="button" className="tut-botao" data-sec="1" onClick={() => votar("inuteis")}>
            <Icon name="mood-sad" size={16} />Ainda não
          </button>
        </div>
      </>}

      {votou === "uteis" && (
        <p id="tut-ajudou-pergunta" ref={resposta} tabIndex={-1} className="tut-ajudou-obrigado" aria-live="polite">
          <Icon name="circle-check" size={18} />Que bom. Obrigado por avisar.
        </p>
      )}

      {votou === "inuteis" && <>
        <p id="tut-ajudou-pergunta" ref={resposta} tabIndex={-1} className="tut-ajudou-obrigado" aria-live="polite">
          <Icon name={motivo ? "circle-check" : "message-circle"} size={18} />
          {motivo ? "Obrigado — vamos melhorar este guia." : "Que pena. O que aconteceu?"}
        </p>
        <div className="tut-motivos" role="group" aria-label="O que aconteceu?">
          {MOTIVOS_NAO.map((m) => (
            <button key={m.campo} type="button" className="tut-motivo" aria-pressed={motivo === m.campo} onClick={() => escolher(m.campo)}>
              <Icon name={m.icone} size={17} />{m.rotulo}
            </button>
          ))}
        </div>
        {whatsapp && (
          <FaleComAGente whatsapp={whatsapp} titulo={titulo} handle={handle} botId={botId} motivo={motivo}>
            Falar no WhatsApp
          </FaleComAGente>
        )}
      </>}
    </section>
  );
}
