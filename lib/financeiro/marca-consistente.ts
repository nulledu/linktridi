export interface TrocaDeMarca {
  caminhoNovo: string;
  caminhoAnterior: string | null | undefined;
  atualizar: () => Promise<{ message?: string } | null>;
  remover: (caminhos: string[]) => Promise<void>;
}

/** Fecha a fronteira storage → banco e compensa o lado que já mudou se o outro falhar. */
export async function concluirTrocaDeMarca(
  troca: TrocaDeMarca,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const erro = await troca.atualizar();
  if (erro) {
    await troca.remover([troca.caminhoNovo]).catch(() => {});
    return { ok: false, erro: erro.message || "Não deu para atualizar o cadastro." };
  }
  if (troca.caminhoAnterior && troca.caminhoAnterior !== troca.caminhoNovo) {
    await troca.remover([troca.caminhoAnterior]).catch(() => {});
  }
  return { ok: true };
}
