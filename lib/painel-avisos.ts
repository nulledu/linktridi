import type { AvisoInput } from "./config-schema";

/**
 * Quais avisos valem AGORA, para uma parede.
 *
 * A conta mora aqui, e não na tela, porque ela é a mesma em três lugares que
 * não podem divergir: a prévia do editor, o painel web e o aplicativo da TV.
 * Um aviso que a prévia mostra e a parede não (ou o contrário) faz quem
 * escreveu duvidar do sistema inteiro na primeira vez.
 *
 * `hojeISO` entra por parâmetro de propósito: quem chama sabe o fuso (São
 * Paulo, sempre — ver `hojeISO()` do financeiro). Ler o relógio aqui dentro
 * deixaria a função sem teste possível e ainda ficaria à mercê do relógio do
 * aparelho, que numa TV box costuma vir errado de fábrica.
 */
export function avisosValidos(
  avisos: AvisoInput[] | null | undefined,
  perfilId: string | null | undefined,
  hojeISO: string,
): AvisoInput[] {
  if (!avisos || avisos.length === 0) return [];
  return avisos.filter((a) => {
    if (!a.ativo) return false;
    if (!a.texto.trim()) return false;
    // Datas em `YYYY-MM-DD` comparam como TEXTO, e é de propósito: a ordem
    // alfabética dessa forma é a ordem cronológica, e não há fuso nem
    // horário de verão para atrapalhar. `new Date("2026-08-29")` seria UTC e
    // viraria ontem às 21h em São Paulo.
    if (a.de && hojeISO < a.de) return false;
    if (a.ate && hojeISO > a.ate) return false;
    // Sem perfil escolhido, a lista dos perfis do aviso não pode ser
    // verificada — então só passam os avisos que valem para todas as paredes.
    const paraTodos = !a.perfis || a.perfis.length === 0;
    if (paraTodos) return true;
    if (!perfilId) return false;
    return a.perfis.some((p) => p.toLowerCase() === perfilId.toLowerCase());
  });
}

/**
 * O aviso que TOMA a tela, se houver.
 *
 * Só um: dois recados simultâneos disputando a parede inteira não seriam lidos
 * nem um nem outro. Ganha o primeiro da lista — a ordem em que foram escritos
 * é a ordem que quem escreveu enxerga no editor.
 */
export function avisoQueAssume(validos: AvisoInput[]): AvisoInput | null {
  return validos.find((a) => a.assumeTela) ?? null;
}

/**
 * Cor, ícone e nome de cada tom.
 *
 * Cor de ESTADO vem do TOKEN, nunca do hex: o mesmo vermelho que se lê bem no
 * tema escuro reprova em contraste sobre o cartão branco do claro, e o editor
 * dos avisos é usado nos dois. A contraparte na TV (`Aviso.kt`) tem o próprio
 * mapa, porque lá não existe variável de CSS — mas os dois falam dos mesmos
 * quatro tons, e é isso que faz o que a pessoa escolhe ao escrever ser o que
 * aparece na parede.
 */
export const TOM_DO_AVISO = {
  aviso: { rotulo: "Aviso", cor: "var(--primary)", icone: "speakerphone" },
  alerta: { rotulo: "Atenção", cor: "var(--atencao)", icone: "alert-triangle" },
  parada: { rotulo: "Parada", cor: "var(--perigo)", icone: "alert-triangle" },
  festa: { rotulo: "Comemoração", cor: "var(--ok)", icone: "trophy" },
} as const;
