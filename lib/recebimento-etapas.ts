// ── Chegou ≠ está no estoque ─────────────────────────────────────────────────
//
// Até aqui receber era UM ato: quem confirmava a chegada no tablet da recepção
// dava entrada no estoque no mesmo toque. Na prática são duas coisas, em
// lugares, horas e mãos diferentes:
//
//   ETAPA 1 · CHEGOU   — a mercadoria entrou pela porta e alguém assinou. Pode
//                        ser na recepção, sem ninguém abrir a caixa.
//   ETAPA 2 · GUARDADO — alguém do galpão abriu, conferiu, etiquetou e guardou.
//                        É AQUI que a quantidade sobe e as etiquetas nascem.
//
// Enquanto eram um ato só, a mercadoria "existia no estoque" com a caixa ainda
// fechada no corredor — e o inventário só descobria meses depois.
//
// Este arquivo é PURO de propósito (nenhum import de servidor): ele é a régua
// única usada pelo `lib/recebimento.ts` (que escreve) e pela tela
// `estoque/RecebimentoPanel.tsx` (que desenha). Régua duplicada é como o número
// da tela e o do galpão passam a discordar.

export type StatusCompra =
  | "solicitado" | "comprado" | "aguardando_entrega"
  | "chegou" | "chegou_parcial" | "divergencia" | "recebido" | "cancelado";

/**
 * Qual das duas etapas este evento registra.
 *
 * `ambas` é o comportamento histórico (chegou e guardou no mesmo toque) e
 * continua sendo o default de `confirmarRecebimento`: o totem do galpão bipa
 * com a caixa na mão, e ali as duas coisas de fato acontecem juntas. Quem
 * precisa separar pede a etapa explicitamente.
 */
export type EtapaRecebimento = "chegada" | "estoque" | "ambas";

/**
 * Status que NÃO terminaram — a compra continua no radar de alguém.
 * `chegou` entra aqui: mercadoria parada no corredor é pendência, não fim.
 */
export const STATUS_PENDENTES: StatusCompra[] = [
  "comprado", "aguardando_entrega", "chegou_parcial", "chegou", "divergencia",
];

/**
 * Status que ainda esperam MERCADORIA CHEGAR — é o que o tablet da recepção e
 * o totem mostram na tela de receber. `chegou` fica de fora: o que já chegou
 * inteiro não pode ser "confirmado como chegado" de novo (viraria entrada em
 * dobro na conta de quem confere).
 */
export const STATUS_AGUARDANDO_CHEGADA: StatusCompra[] = [
  "comprado", "aguardando_entrega", "chegou_parcial", "divergencia",
];

/**
 * Para onde cada status novo cai num banco que ainda não conhece o CHECK novo
 * (`supabase/recebimento_v4.sql` não rodado).
 *
 * `chegou` → `divergencia` não é enfeite: `divergencia` é o único status legado
 * que significa exatamente "chegou e o estoque NÃO subiu" — a compra fica
 * pendente, em vermelho, com o motivo em `estoque_erro`, e a tela já sabe
 * desenhar isso. O que não pode acontecer é virar `recebido`, que é terminal e
 * promete estoque.
 */
export const STATUS_LEGADO: Partial<Record<StatusCompra, StatusCompra>> = {
  chegou: "divergencia",
};

/** A parte de `compras` que as regras de etapa precisam ler. */
export interface CompraEtapas {
  status: StatusCompra;
  quantidade_comprada: number;
  quantidade_recebida: number;
  /** Quanto já foi GUARDADO (entrou no estoque). Ausente = banco sem a coluna. */
  quantidade_guardada?: number | null;
  /** Motivo de o que chegou não estar no estoque. */
  estoque_erro?: string | null;
}

const n = (v: unknown) => Number(v ?? 0) || 0;

// ── A marca que o banco antigo carrega ───────────────────────────────────────
//
// Sem a coluna `quantidade_guardada` (supabase/recebimento_v4.sql não rodado),
// o único lugar onde cabe "chegou e NÃO está no estoque" é o texto de
// `estoque_erro`. Enquanto ele era um sim/não, a informação que se perdia era
// QUANTO — e o buraco é caro:
//
//   comprada 10 · chegam 5 · o galpão guarda os 5 · chegam os outros 5
//
// No sim/não, a segunda chegada reacende a marca e a compra volta a valer ZERO
// guardado. A tela oferece "guardar 10", o galpão guarda 10, e o estoque fica
// com 15 peças de uma compra de 10. O número escrito na frase é o que impede
// isso: a frase é a mesma que a pessoa lê no card, e o número é a memória.
const MARCA_A_GUARDAR = /faltam\s+(\d+(?:[.,]\d+)?)\s+para guardar/i;

/** Número curto e em português (2,5 e não 2.5) — a frase é lida por gente. */
function numeroCurto(v: number): string {
  return String(Math.round((Number(v) || 0) * 1000) / 1000).replace(".", ",");
}

/**
 * A frase de `compras.estoque_erro` no banco ANTIGO. Diz o que aconteceu, o que
 * fazer e — em `faltam N para guardar` — quanto, que é o que
 * `faltaGuardarDoAviso` lê de volta.
 */
export function avisoDeFaltaGuardar(quanto: number, motivo?: string | null): string {
  const q = numeroCurto(quanto);
  return motivo
    ? `${motivo} · faltam ${q} para guardar`
    : `ninguém guardou ainda — faltam ${q} para guardar; dê entrada pela aba Recebimento ou pelo totem do galpão`;
}

/** Quanto a frase diz que falta guardar, ou `null` se ela não carrega número. */
export function faltaGuardarDoAviso(erro: string | null | undefined): number | null {
  const m = MARCA_A_GUARDAR.exec(String(erro ?? ""));
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  return Number.isFinite(v) ? Math.max(0, v) : null;
}

/**
 * Quanto desta compra já ESTÁ no estoque.
 *
 * Com a coluna `quantidade_guardada` a resposta é direta. Sem ela (banco antes
 * da migração) o número é deduzido do mundo antigo, onde chegar e entrar no
 * estoque eram o mesmo ato: tudo que chegou está guardado, MENOS quando ficou
 * registrado que o estoque não subiu (`estoque_erro`) — que é justamente a
 * marca que a etapa 1 deixa enquanto o banco não sabe dizer "chegou".
 */
export function guardadaAte(c: CompraEtapas): number {
  if (typeof c.quantidade_guardada === "number") return c.quantidade_guardada;
  // Terminal é terminal: compra encerrada na mão não volta pra fila de guardar.
  if (c.status === "recebido" || c.status === "cancelado") return n(c.quantidade_recebida);
  // A frase com número ganha do sim/não: ela sabe distinguir "nada guardado" de
  // "metade guardada", e é a diferença entre somar 5 e somar 10 no estoque.
  const marcado = faltaGuardarDoAviso(c.estoque_erro);
  if (marcado != null) return Math.max(0, n(c.quantidade_recebida) - marcado);
  if (c.status === "chegou" || c.estoque_erro) return 0;
  return n(c.quantidade_recebida);
}

/** Quanto chegou e ainda não foi guardado. */
export function faltaGuardar(c: CompraEtapas): number {
  return Math.max(0, n(c.quantidade_recebida) - guardadaAte(c));
}

/** Quanto ainda nem chegou. */
export function faltaChegar(c: CompraEtapas): number {
  return Math.max(0, n(c.quantidade_comprada) - n(c.quantidade_recebida));
}

/**
 * A FILA do corredor: chegou, ninguém guardou. É o que a aba Recebimento
 * mostra em "A guardar" e o que o totem do galpão lista pra dar entrada.
 */
export function precisaGuardar(c: CompraEtapas): boolean {
  if (c.status === "cancelado" || c.status === "recebido") return false;
  return faltaGuardar(c) > 0;
}

/**
 * O status da compra depois de um evento. Puro, porque é a única coisa deste
 * módulo que mexe no que a tela inteira lê — e regra assim precisa de teste,
 * não de leitura atenta.
 */
export function statusAposEvento(i: {
  statusAtual: StatusCompra;
  comprada: number;
  /** Total que já chegou (acumulado, incluindo este evento). */
  recebidaTotal: number;
  /** Total que já entrou no estoque (acumulado, incluindo este evento). */
  guardadaTotal: number;
  /** Conferência apontou problema (quantidade/embalagem/produto errado). */
  houveDivergencia: boolean;
  /** O lançamento no estoque foi TENTADO e falhou. */
  falhaEstoque: boolean;
}): StatusCompra {
  if (i.statusAtual === "cancelado") return "cancelado";

  const aChegar = n(i.comprada) - n(i.recebidaTotal);
  const aGuardar = n(i.recebidaTotal) - n(i.guardadaTotal);

  let s: StatusCompra;
  if (aChegar > 0) {
    // Ainda falta mercadoria. Enquanto nada chegou, o status não muda: dizer
    // "chegou parcialmente" quando chegou ZERO é a mentira mais fácil de contar.
    s = n(i.recebidaTotal) > 0 ? "chegou_parcial" : (i.houveDivergencia ? "divergencia" : i.statusAtual);
  } else if (i.houveDivergencia) {
    s = "divergencia";
  } else if (aGuardar > 0) {
    s = "chegou";
  } else {
    s = "recebido";
  }

  // Estoque que foi tentado e falhou é ERRO, não "espera": precisa de gente
  // olhando. `chegou` seria calmo demais pra uma etiqueta que não nasceu.
  if (i.falhaEstoque && (s === "recebido" || s === "chegou")) s = "divergencia";
  return s;
}
