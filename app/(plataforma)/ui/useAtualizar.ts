"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

/**
 * `router.refresh()` que DIZ quando terminou.
 *
 * Depois de salvar, a tela fecha o formulário e pede a árvore nova ao servidor;
 * até ela chegar (meio segundo, às vezes dois), a lista continua a de antes —
 * o compromisso recém-pago ainda aparece "Pendente", a compra nova não está na
 * tabela — e nada na tela diz que algo está a caminho. A pessoa clica de novo,
 * ou conclui que não salvou.
 *
 * Embrulhar o refresh numa transição devolve `atualizando`: quem chamou mantém
 * o botão girando (`carregando={salvando || atualizando}`) e mostra
 * "Atualizando…" no título da lista até o dado de verdade estar na tela.
 *
 * É UMA requisição por clique da pessoa, a mesma de antes — nada aqui roda
 * sozinho nem em intervalo (CLAUDE.md → "Dados").
 */
export function useAtualizar() {
  const router = useRouter();
  const [atualizando, iniciar] = useTransition();
  const atualizar = useCallback(() => {
    iniciar(() => { router.refresh(); });
  }, [router]);
  return { atualizar, atualizando };
}
