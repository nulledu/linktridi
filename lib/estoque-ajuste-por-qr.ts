// ── Ajustar estoque pelo QR da prateleira ───────────────────────────────────
//
// A etiqueta de prateleira já tem QR e ele abre `/g/<codigo>` — uma página
// PÚBLICA, só leitura, que mostra o que está registrado naquele lugar. Quem
// aponta a câmera vê o estoque; ninguém edita nada.
//
// O pedido é a outra metade: "quem tem permissão" consegue somar e tirar dali
// mesmo. Estar de pé na frente da prateleira é justamente o momento em que se
// descobre que o número está errado — e ter que voltar ao computador é o que
// faz ninguém corrigir.
//
// ── DUAS COISAS QUE ESTE ARQUIVO PROTEGE ────────────────────────────────────
//
// 1. O SCAN CONTINUA BARATO. `/g` é ISR com `revalidate = 60` porque foi
//    EXECUÇÃO (não egress) que pausou este projeto na Vercel. Se a página
//    passasse a ler a sessão pra decidir se mostra o botão, ela deixaria de ser
//    cacheável e todo scan viraria invocação — o mutirão de conferência
//    voltaria a custar o que custou em agosto. Por isso quem pergunta "posso
//    ajustar?" é o CLIQUE, nunca o carregamento.
//
// 2. O MOTIVO É O MESMO VOCABULÁRIO DO RESTO. Entrada reusa os três motivos de
//    `estoque-entrada.ts`; saída reusa `MOTIVOS_BAIXA` de `estoque-unidades.ts`,
//    cujas chaves batem uma a uma com o `check` do banco. Inventar um terceiro
//    conjunto aqui faria o histórico do galpão ter três vocabulários pro mesmo
//    evento, e nenhum relatório fecharia.

import { MOTIVOS_DE_ENTRADA, motivoDeEntradaValido, type MotivoDeEntrada } from "./estoque-entrada";
import { MOTIVOS_BAIXA } from "./estoque-unidades";

export type SentidoDoAjuste = "entrada" | "saida";

/** Os motivos que a tela oferece, por sentido. */
export function motivosDoAjuste(sentido: SentidoDoAjuste): { key: string; label: string }[] {
  return sentido === "entrada"
    ? MOTIVOS_DE_ENTRADA.map((m) => ({ key: m.key, label: m.label }))
    : MOTIVOS_BAIXA.map((m) => ({ key: m.key, label: m.label }));
}

export function motivoValidoNoAjuste(sentido: SentidoDoAjuste, motivo: unknown): boolean {
  if (typeof motivo !== "string" || !motivo) return false;
  return sentido === "entrada"
    ? motivoDeEntradaValido(motivo)
    : MOTIVOS_BAIXA.some((m) => m.key === motivo);
}

/**
 * Teto por ajuste.
 *
 * Era 200, e o número virou parede: contagem de prateleira de item miúdo
 * (parafuso, fita, saquinho) passa de 200 sem esforço, e mandar a pessoa
 * dividir o mesmo ajuste em três não deixa o estoque mais certo — só espalha
 * o mesmo movimento em três linhas de histórico. O teto continua existindo
 * como freio de digitação (um zero a mais no celular), agora num patamar que
 * nenhuma contagem legítima encosta.
 */
export const MAX_POR_AJUSTE = 5_000;

export interface ItemDoAjuste {
  id: string;
  nome: string;
  quantidade: number | null;
  unidade: string | null;
  serializado: boolean | null;
}

/**
 * O que impede o ajuste, em português, ou `null` quando pode.
 *
 * `podeAjustar` entra aqui e não fica só na rota porque a TELA precisa da mesma
 * resposta: um botão que aparece e depois é negado pelo servidor é pior que um
 * botão que não aparece.
 */
export function problemaDoAjuste(args: {
  item: ItemDoAjuste | null;
  sentido: SentidoDoAjuste;
  quantidade: number;
  motivo: unknown;
  podeAjustar: boolean;
}): string | null {
  const { item, sentido, quantidade, motivo, podeAjustar } = args;

  if (!podeAjustar) {
    return "Você não tem permissão pra mexer na quantidade do estoque. " +
      "Peça a quem administra a sub-permissão “Ajustar quantidade” do Estoque.";
  }
  if (!item) return "Item não encontrado.";
  if (item.serializado) {
    // O número dele é a soma das etiquetas, mantida por gatilho: somar ou tirar
    // na mão cria um valor que a próxima recontagem apaga, sem avisar ninguém.
    return `“${item.nome}” é contado por etiqueta — o número vem da soma delas. ` +
      "Pra tirar, bipe a etiqueta; pra entrar, gere as etiquetas na ficha do item.";
  }
  if (!Number.isFinite(quantidade) || Math.trunc(quantidade) !== quantidade || quantidade < 1) {
    return "Diga quantas peças — um número inteiro, a partir de 1.";
  }
  if (quantidade > MAX_POR_AJUSTE) {
    return `${quantidade} de uma vez é demais por aqui (máximo ${MAX_POR_AJUSTE.toLocaleString("pt-BR")}). ` +
      "Confira se não sobrou um zero. Movimento desse tamanho é decisão de escritório: " +
      "use Receber (entrada) ou a aba Bipar (saída).";
  }
  if (!motivoValidoNoAjuste(sentido, motivo)) {
    return sentido === "entrada"
      ? "Escolha de onde esta peça veio."
      : "Escolha pra onde esta peça foi.";
  }
  if (sentido === "saida") {
    const tem = Math.max(0, Number(item.quantidade) || 0);
    if (quantidade > tem) {
      // Deixar o estoque negativo é o começo de um número que ninguém confia
      // mais. Se de fato saiu mais do que o sistema tinha, o que está errado é o
      // saldo — e corrigir saldo é somar, não tirar mais.
      return `O sistema tem ${tem} ${item.unidade?.trim() || "un"} de “${item.nome}” e você está tirando ${quantidade}. ` +
        "Se sobrou menos do que isso na prateleira, some a diferença primeiro (Achei na prateleira) e tire depois.";
    }
  }
  return null;
}

/** O saldo depois do ajuste. Nunca desce de zero — ver `problemaDoAjuste`. */
export function saldoDepoisDoAjuste(item: ItemDoAjuste, sentido: SentidoDoAjuste, quantidade: number): number {
  const antes = Math.max(0, Number(item.quantidade) || 0);
  const n = Math.max(0, Math.trunc(quantidade) || 0);
  return sentido === "entrada" ? antes + n : Math.max(0, antes - n);
}

/** A linha que vai pro histórico. Diz o sentido, o motivo e de onde partiu. */
export function motivoParaHistorico(sentido: SentidoDoAjuste, motivo: string, obs?: string | null): string {
  const base = sentido === "entrada" ? `entrada:${motivo}` : `saida:${motivo}`;
  const nota = obs?.trim() ? ` · ${obs.trim().slice(0, 160)}` : "";
  return `${base} (qr)${nota}`;
}

/** A frase do recibo na tela. Diz o que MUDOU — a tela é o comprovante. */
export function fraseDoAjuste(item: ItemDoAjuste, sentido: SentidoDoAjuste, quantidade: number, saldo: number): string {
  const un = item.unidade?.trim() || "un";
  const sinal = sentido === "entrada" ? "+" : "−";
  return `${sinal}${quantidade} ${item.nome} · agora ${saldo} ${un}`;
}

export type { MotivoDeEntrada };
