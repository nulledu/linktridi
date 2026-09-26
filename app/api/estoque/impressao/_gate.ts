import { getProfile } from "@/lib/require-auth";
import { papelOuChave, type Quem } from "@/lib/acesso";

// ── Quem lê e quem MUDA a configuração de impressão ──────────────────────────
//
// Duas portas diferentes de propósito.
//
// LER é de quem imprime: a folha de etiquetas do navegador busca a altura, o
// número de cópias e quais SKUs são caixa antes de desenhar. Se essa leitura
// exigisse permissão de gestão, quem só bipa imprimiria a tira no tamanho
// errado — e a permissão que faltava não apareceria em lugar nenhum, só o papel
// sairia diferente do dos outros.
//
// MUDAR é de admin e gerente. É uma decisão que vale pro galpão inteiro e pros
// dois tablets: altura errada é rolo inteiro perdido antes de alguém notar.
//
// Nenhuma chave nova: a grade é default-deny, então chave inventada aqui
// nasceria sem ninguém tendo — a tela abriria e todo botão voltaria 403. As
// chaves são as que o módulo já usa (`estoque:itens` pra quem mexe no catálogo,
// `estoque:bipar` pra quem só opera).

/** Papéis que já mandam no estoque físico — a lista que o módulo inteiro usa. */
const PAPEIS_DO_ESTOQUE = ["admin", "estoquista", "gerente_producao"] as const;

/**
 * Quem MUDA: admin e gerente, como o dono pediu.
 *
 * `estoquista` sai da lista de papéis aqui (e só aqui, dentro do módulo): ele
 * mexe no catálogo o dia inteiro, mas quem decide o tamanho da etiqueta de
 * todos os aparelhos é quem responde pelo galpão. Um estoquista com a chave
 * `estoque:itens` explicitamente concedida na grade continua entrando — a
 * grade é a decisão de um humano sobre aquela pessoa; o papel é um atalho.
 */
const PAPEIS_QUE_CONFIGURAM = ["admin", "gerente_producao"] as const;

export async function quemEstaPedindo(): Promise<Quem | null> {
  const me = await getProfile();
  return me ? (me as Quem) : null;
}

export function podeLerImpressao(me: Quem): Promise<boolean> {
  return papelOuChave(me, PAPEIS_DO_ESTOQUE, "estoque:itens", "estoque:bipar", "estoque:compras");
}

export function podeConfigurarImpressao(me: Quem): Promise<boolean> {
  // `papelOuChave` e não uma comparação de papel escrita aqui: é ela que
  // garante que a chave da grade também abre a porta. O contrato do módulo é
  // "ligar o card libera a página E as APIs"; um `role === "gerente"` solto
  // quebra esse contrato em silêncio, e o report que chega é sempre o mesmo —
  // "a permissão está ativa e a pessoa continua bloqueada".
  return papelOuChave(me, PAPEIS_QUE_CONFIGURAM, "estoque:itens");
}
