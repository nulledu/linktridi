"use client";

import { useEffect, useRef } from "react";

/**
 * Poll que só roda com a aba VISÍVEL — e recarrega assim que ela volta.
 *
 * Existe porque a regra vivia sendo esquecida: um `setInterval(load, 60_000)`
 * solto continua batendo no banco com a aba esquecida em segundo plano a tarde
 * inteira, e ninguém vê. Foi assim que o egress do Supabase estourou.
 * Ver a seção "Dados: o tick comum tem que voltar VAZIO" no CLAUDE.md.
 *
 * O callback pode mudar de identidade a cada render sem reiniciar o intervalo —
 * fica numa ref. Só `ms` reinicia.
 *
 * ATENÇÃO: numa TV (`/painel`) `document.hidden` nunca é `true`. Lá o intervalo
 * precisa ser generoso de propósito; este hook não salva esse caso.
 */
export function usePollVisivel(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;

  useEffect(() => {
    if (!ms) return;
    const t = setInterval(() => { if (!document.hidden) ref.current(); }, ms);
    // Voltou pra aba: não espera o próximo ciclo pra mostrar o que perdeu.
    const onVis = () => { if (!document.hidden) ref.current(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [ms]);
}

/**
 * Poll que ACELERA com quem está mexendo e RECUA com a tela esquecida aberta.
 *
 * `usePollVisivel` resolve a aba em segundo plano, mas não resolve o caso mais
 * comum do ERP: a aba fica VISÍVEL num segundo monitor a tarde inteira sem
 * ninguém tocar nela. Para o navegador ela está em primeiro plano, então o
 * intervalo curto continua rodando — e cada tick é uma invocação cobrada na
 * Vercel, mesmo quando a resposta é idêntica à anterior. Foi assim que o Hobby
 * bateu 1,1M de invocações e 12h de CPU e pausou o projeto.
 *
 * A regra aqui é simples: o ritmo BASE vale para quem está trabalhando; a cada
 * ciclo sem novidade o intervalo DOBRA até o teto; qualquer sinal de vida
 * (clique, tecla, rolagem, voltar pra aba) devolve o ritmo base na hora.
 *
 * Quem está usando a tela não perde nada — continua atualizando no ritmo base,
 * e o toque que reativa acontece antes do próximo tick de qualquer forma.
 *
 * `fn` pode devolver `true` para dizer "mudou alguma coisa": mudança também
 * devolve o ritmo base, porque dado que acabou de mexer costuma mexer de novo.
 */
/**
 * A mesma política de recuo do `usePollComRecuo`, porém como função solta —
 * para os efeitos que já definem o `load` dentro deles (com flag `active`,
 * `AbortController` etc.) e onde virar hook exigiria remontar a tela inteira.
 *
 * Devolve a função de limpeza; chame no `return` do `useEffect`.
 */
export function agendarComRecuo(
  fn: () => void | boolean | Promise<void | boolean>,
  base: number,
  teto = Math.max(base * 8, 120_000),
): () => void {
  let intervalo = base;
  let timer: ReturnType<typeof setTimeout>;
  let vivo = false;

  const marcarVivo = () => { vivo = true; };
  const eventos = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  for (const e of eventos) window.addEventListener(e, marcarVivo, { passive: true });

  const agendar = () => { timer = setTimeout(rodar, intervalo); };

  async function rodar() {
    if (document.hidden) { intervalo = teto; return agendar(); }
    const mudou = await fn();
    if (vivo || mudou === true) { intervalo = base; vivo = false; }
    else intervalo = Math.min(intervalo * 2, teto);
    agendar();
  }

  const onVis = () => {
    if (document.hidden) return;
    clearTimeout(timer);
    intervalo = base; vivo = false;
    void fn();
    agendar();
  };
  document.addEventListener("visibilitychange", onVis);
  agendar();

  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVis);
    for (const e of eventos) window.removeEventListener(e, marcarVivo);
  };
}

export function usePollComRecuo(
  fn: () => void | boolean | Promise<void | boolean>,
  base: number,
  teto = Math.max(base * 8, 120_000),
) {
  // O callback pode mudar de identidade a cada render sem reagendar nada —
  // fica numa ref, igual ao `usePollVisivel`. Só `base`/`teto` reiniciam.
  const ref = useRef(fn);
  ref.current = fn;

  useEffect(() => {
    if (!base) return;
    return agendarComRecuo(() => ref.current(), base, teto);
  }, [base, teto]);
}
