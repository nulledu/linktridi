// ── Produção em cadeia: as regras puras ──────────────────────────────────────
//
// O motor de reposição (lib/requisicoes.ts) pergunta aqui, ANTES de criar
// "Produzir X": tem material pra isso? Tem material pro material? A resposta é
// uma decisão por nó — a ordem nasce `pendente` (cai no tablet/máquina) ou
// `aguardando_material` (fica invisível pra bancada até o estoque entrar),
// com a lista do que falta, as ordens-filhas a criar e o que precisa ser
// COMPRADO.
//
// Puro, sem banco e sem React: quem carrega ficha técnica e saldos é o motor;
// aqui é só a conta — testada em lib/__tests__/producao-em-cadeia.test.ts.

export interface ComponenteDaFicha {
  componenteId: string;
  nome: string;
  /** Quantidade POR UNIDADE produzida. Pode ser fracionária (0.013889 chapa
   *  por acolchoado) — o arredondamento é no TOTAL, nunca por unidade. */
  quantidade: number;
}

export interface Necessidade {
  itemId: string;
  nome: string;
  necessario: number;
  falta: number;
}

export interface DecisaoDoNo {
  estado: "pendente" | "aguardando_material";
  /** O que falta e trava ESTA ordem (produzíveis e compráveis juntos). */
  esperas: { itemId: string; nome: string; falta: number }[];
  /** Ordens-filhas a criar (componente produzível E ativado). */
  filhos: { itemId: string; nome: string; quantidade: number }[];
  /** Materiais comprados em falta — o aviso pra quem compra. */
  comprar: { itemId: string; nome: string; falta: number }[];
  /** A decisão de cada filho (recursiva) — quem cria usa pro estado dele. */
  decisoesFilhos: Map<string, DecisaoDoNo>;
  /** Segurou por FALTA DE CADASTRO, não por falta de material: o item não tem
   *  ficha técnica, então ninguém sabe do que ele é feito. Quem mostra o
   *  resumo usa isto pra pedir o cadastro em vez de dizer "falta material". */
  semFicha?: boolean;
}

export interface ContextoDaCadeia {
  /** itemId → componentes da ficha técnica dele. */
  fichas: Map<string, ComponenteDaFicha[]>;
  /** itemId → saldo atual. Ausente = 0. */
  saldos: Map<string, number>;
  /**
   * Itens que o galpão sabe produzir: têm receita, ficha técnica própria, ou
   * estão marcados "É produzido aqui dentro".
   *
   * NÃO existe mais `ativados` aqui. O "repor sozinho" do item vale pro
   * MÍNIMO dele — é o gatilho da RAIZ, e quem confere é o motor antes de
   * chamar a cadeia. Como insumo de outro item, quem autoriza a produção é o
   * PAI: exigir o interruptor do filho também deixava "Carcaça de almofada 11"
   * esperando pra sempre por "Base 11", "Tampa 11" e mais quatro peças que têm
   * receita, que o galpão corta, e que viravam aviso de COMPRA porque ninguém
   * tinha ligado seis interruptores de peça.
   */
  produziveis: Set<string>;
}

/**
 * Material que NÃO trava a ordem, mesmo faltando no saldo.
 *
 * O MDF é a exceção pedida pelo dono, e ela é sobre como o galpão trabalha:
 * chapa de MDF se corta do que estiver na bancada, e quem está lá olha e diz
 * se dá ou não dá pra fazer. Travar a ordem por saldo de MDF pararia produção
 * que na prática acontece — e o saldo de chapa é justamente o mais
 * desencontrado do catálogo.
 *
 * A falta continua indo pro aviso de COMPRA: não travar não é fingir que tem.
 */
export function materialNaoTrava(nome: string | null | undefined): boolean {
  return /\bmdf\b/i.test((nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

/** A escada da hierarquia tem 8 degraus — cadeia mais funda que isso é ciclo
 *  ou cadastro quebrado, e parar é melhor que varrer pra sempre. */
export const PROFUNDIDADE_MAX = 8;

/** Ruído da ficha fracionária: 0.013889 é 1/72 escrito com 6 casas, e
 *  72 × 0.013889 = 1.000008 — que É uma chapa, não duas. Arredondar a 4 casas
 *  ANTES do teto engole o ruído da representação decimal sem engolir
 *  necessidade real (0.1111 a mais ainda vira peça inteira). */
const arredondado = (x: number) => Math.round(x * 1e4) / 1e4;

/** Quanto de cada componente esta produção precisa, e quanto falta no saldo. */
export function explodirNecessidades(
  quantidade: number,
  ficha: ComponenteDaFicha[],
  saldos: Map<string, number>,
): Necessidade[] {
  const q = Math.max(0, Math.trunc(Number(quantidade) || 0));
  // O toggle "desconta" da ficha NÃO entra aqui, de propósito: ele decide se a
  // produção dá BAIXA no estoque, não quanto a peça PRECISA. Quinze carcaças
  // precisam de quinze bases com o sistema descontando ou não — e é essa conta
  // que impede ordem de cair na bancada sem material.
  return ficha.map((c) => {
    const necessario = Math.max(0, Math.ceil(arredondado(q * (Number(c.quantidade) || 0))));
    const saldo = Math.max(0, Number(saldos.get(c.componenteId)) || 0);
    return {
      itemId: c.componenteId,
      nome: c.nome,
      necessario,
      falta: Math.max(0, necessario - saldo),
    };
  });
}

/**
 * A decisão de UM nó da cadeia, descendo recursivamente.
 *
 * Regras:
 *  · componente com falta vira ESPERA (a ordem não anda sem ele);
 *  · falta de componente PRODUZÍVEL vira também um FILHO — a ordem dele, com
 *    a quantidade da falta — e a decisão do filho vem junto (o interruptor
 *    "repor sozinho" do filho não entra: quem autoriza é o pai);
 *  · falta de componente comprado vira COMPRAR — aviso, nunca ordem;
 *  · `visitados` corta ciclo (a→b→a: o segundo "a" vira comprar, não filho);
 *  · profundidade máxima 8, os degraus da escada de hierarquia.
 */
export function decidirCadeia(
  itemId: string,
  quantidade: number,
  ctx: ContextoDaCadeia,
  visitados: Set<string> = new Set(),
  profundidade: number = 0,
): DecisaoDoNo {
  const decisao: DecisaoDoNo = {
    estado: "pendente", esperas: [], filhos: [], comprar: [], decisoesFilhos: new Map(),
  };
  const ficha = ctx.fichas.get(itemId) ?? [];
  // SEM FICHA TÉCNICA a ordem NÃO nasce pra bancada. Antes ela saía `pendente`
  // — o motor não achava componente nenhum e concluía "não falta nada" —, e foi
  // assim que "Produzir Folha de borracha A4" caiu no tablet num dia em que o
  // saldo de "Rolo de borracha" era ZERO: o rolo existe no catálogo, mas nada
  // dizia que a folha vem dele. Silêncio de cadastro não é sinal de que tem
  // material; é a ausência de resposta, e a resposta segura é esperar.
  if (!ficha.length) {
    // O ESTADO continua `pendente` — quem decide o que fazer com isso é quem
    // cria. Na RAIZ o motor não cria nada (ordem que ninguém pediu, de item
    // que ninguém sabe do que é feito). No FILHO ele cria normalmente, e a
    // ordem tem que nascer PRONTA PRA BANCADA: "Puxador Macho" não tem ficha,
    // mas a ficha do Puxador pede 176 dele, e cortar os 176 É o trabalho.
    // Marcá-lo `aguardando_material` prenderia o insumo esperando um material
    // que ninguém cadastrou — a cadeia inteira parada no degrau de baixo.
    decisao.semFicha = true;
    return decisao;
  }

  visitados.add(itemId);
  const necessidades = explodirNecessidades(quantidade, ficha, ctx.saldos);
  for (const n of necessidades) {
    if (n.falta <= 0) continue;
    // MDF em falta avisa compras, mas não segura a ordem — ver materialNaoTrava.
    if (materialNaoTrava(n.nome)) {
      decisao.comprar.push({ itemId: n.itemId, nome: n.nome, falta: n.falta });
      continue;
    }
    decisao.esperas.push({ itemId: n.itemId, nome: n.nome, falta: n.falta });
    const podeProduzir = ctx.produziveis.has(n.itemId)
      && !visitados.has(n.itemId) && profundidade < PROFUNDIDADE_MAX;
    if (podeProduzir) {
      decisao.filhos.push({ itemId: n.itemId, nome: n.nome, quantidade: n.falta });
      decisao.decisoesFilhos.set(
        n.itemId,
        decidirCadeia(n.itemId, n.falta, ctx, visitados, profundidade + 1),
      );
    } else {
      decisao.comprar.push({ itemId: n.itemId, nome: n.nome, falta: n.falta });
    }
  }
  decisao.estado = decisao.esperas.length ? "aguardando_material" : "pendente";
  return decisao;
}

/** Uma linha da ficha, do jeito que a BAIXA precisa dela. */
export interface LinhaDeBaixa {
  componenteId: string;
  nome: string;
  /** Por peça — a mesma coluna que a cadeia usa (consome N ou rende fração). */
  quantidade: number;
  /** O toggle da linha. Só `true` explícito dá baixa — o padrão é não. */
  desconta?: boolean | null;
}

/**
 * O que a conferência aprovada tira do estoque, pela ficha do item.
 *
 * Três regras, e cada uma já teria custado estoque:
 *  · só linha com o toggle LIGADO — por decisão do dono nada desconta sozinho;
 *  · arredonda o TOTAL, nunca por peça (80 peças de "rende 72" tiram 2 chapas,
 *    não 80), com a mesma tolerância de float da cadeia;
 *  · componente que JÁ saiu por bipe nesta atividade fica fora: o bipe no
 *    começo do trabalho é a outra porta de baixa, e as duas juntas tirariam o
 *    mesmo material duas vezes no dia em que alguém ligasse o bipe.
 */
export function baixaPelaFicha(
  aprovadas: number,
  linhas: LinhaDeBaixa[],
  jaBaixadosPorBipe: ReadonlySet<string> = new Set(),
): { componenteId: string; nome: string; quantidade: number }[] {
  const q = Math.max(0, Math.trunc(Number(aprovadas) || 0));
  if (!q) return [];
  return linhas
    .filter((l) => l.desconta === true && !jaBaixadosPorBipe.has(l.componenteId))
    .map((l) => ({
      componenteId: l.componenteId,
      nome: l.nome,
      quantidade: Math.max(0, Math.ceil(arredondado(q * (Number(l.quantidade) || 0)))),
    }))
    .filter((b) => b.quantidade > 0);
}

/** A dispensa ("não precisa fazer") segura a recriação enquanto o saldo não
 *  cair abaixo do que estava quando alguém dispensou. */
export function dispensaVale(
  saldoAtual: number,
  saldoDispensa: number | null | undefined,
): boolean {
  if (saldoDispensa == null) return false;
  return (Number(saldoAtual) || 0) >= saldoDispensa;
}

/** A frase que o card do tablet e o painel mostram — a CONTA, não um rótulo. */
export function fraseDeOrigem(saldo: number, minimo: number, alvo: number): string {
  return `Estoque caiu a ${saldo} (mínimo ${minimo}) — repõe até ${alvo}.`;
}
