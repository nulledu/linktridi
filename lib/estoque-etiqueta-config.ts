// ── Estoque · a configuração de impressão do galpão ──────────────────────────
//
// A altura da etiqueta e o número de cópias moravam SÓ no DataStore de cada
// tablet. Dois aparelhos no mesmo galpão imprimiam tiras diferentes e ninguém
// tinha como saber, porque o ajuste está dentro do modo totem — pra conferir,
// alguém tinha que ir até o aparelho.
//
// Aqui eles viram decisão do escritório: gravados em `estoque_config` (a mesma
// linha única de `lib/estoque-automacao.ts`) e descidos pro tablet pelo
// bootstrap.
//
// O QUE NÃO SOBE PRO ESCRITÓRIO, e é decisão, não esquecimento:
//
//  · a FOLGA DA GUILHOTINA. Ela corrige onde a lâmina DAQUELE aparelho corta;
//    o comentário de ConfigImpressora.kt já dizia isso ("rolo e lâmina variam
//    por unidade"). Travá-la daqui seria decidir por um hardware que o
//    escritório não está olhando, e o sintoma apareceria como etiqueta grudada
//    na seguinte, no meio de um recebimento.
//  · qual impressora Bluetooth usar. É o rádio pareado naquele tablet.
//
// Leitura DEGRADA (sem a tabela/coluna, devolve o padrão e a tela explica o
// que rodar); escrita FALHA ALTO com a frase do que falta. Mesma assimetria de
// lib/estoque-colunas.ts.

import { code128Modulos, ZONA_QUIETA_MODULOS } from "./code128";

// O Supabase não tem tipos gerados aqui; fronteira dinâmica isolada nesta
// camada, como em lib/estoque-colunas.ts e lib/estoque-automacao.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface ConfigImpressao {
  /** Altura da tira, em mm. O tablet obedece; o navegador também. */
  alturaMm: number;
  /**
   * Largura IMPRIMÍVEL da tira, em mm — o que a cabeça térmica de fato alcança.
   *
   * NÃO é a largura do rolo, e a diferença é o erro caro: um rolo de 80mm tem
   * ~72mm imprimíveis (4mm de cada borda a cabeça não toca) e um de 58mm tem
   * ~48mm. Guardar "80" e descontar 8 daria a resposta errada pro rolo de 58,
   * onde o desconto é 10. Guardando o que vira TINTA, a conta é uma só e o que
   * a tela desenha é o que sai do papel.
   */
  larguraMm: number;
  /** Quantas tiras IGUAIS saem por etiqueta (uma na caixa, uma na ficha…). */
  copias: number;
  /**
   * Os campos que o galpão mandou NÃO imprimir. Vazio = a etiqueta de sempre.
   *
   * Guarda-se o que está DESLIGADO, e não o que está ligado, de propósito: o
   * dia em que a etiqueta ganhar um campo novo, ele nasce ligado em todo mundo.
   * Guardando a lista positiva, o campo novo nasceria DESLIGADO em cada banco
   * que já tivesse uma linha gravada — invisível, sem erro nenhum, e com a
   * conclusão de que "a atualização não veio".
   */
  ocultos: CampoEtiqueta[];
}

// ── Quais campos vão impressos ───────────────────────────────────────────────
//
// O tamanho da etiqueta virou ajuste; o CONTEÚDO dela ainda era fixo. Um galpão
// que não usa prateleira numerada imprimia a linha do detalhe vazia, e um que
// refaz a etiqueta toda semana não tinha uso pra data.
//
// ── POR QUE ISTO NÃO É "MAIS UM INTERRUPTOR" ────────────────────────────────
//
// Porque desligar um campo DEVOLVE espaço em vez de gastar — e no desenho
// empilhado ficou claro em qual EIXO cada um devolve.
//
// A cor e o detalhe da prateleira devolvem LARGURA: a vaga sai da faixa de cima
// e o nome, que abre a faixa, engorda na hora. O código escrito e a data
// devolvem ALTURA, e só JUNTOS — os dois dividem a faixa do pé, então desligar
// um deixa a faixa de pé pelo outro. Desligados os dois, os 3,4mm dela voltam
// DIRETO pra barra: a 14mm a barra sai com 9mm em vez de 5,6, que é a diferença
// entre bipar e não bipar. É o que faz a etiqueta pequena valer a pena.
//
// ── O QUE NÃO ENTRA NESTA LISTA ─────────────────────────────────────────────
//
//  · o NOME e as BARRAS. São a etiqueta.
//  · o LOCAL e o SELO DA CAIXA. Já somem sozinhos quando a peça não os tem —
//    um interruptor aqui não daria poder nenhum, só uma segunda maneira de a
//    mesma coisa estar desligada.
//
// A chave é a MESMA string no banco, aqui e no Kotlin (`EtiquetaLayout.
// CampoEtiqueta`). Um mapa de tradução seria a quarta coisa a manter em dia.

export type CampoEtiqueta = "cor_dimensoes" | "data_responsavel" | "codigo_legivel" | "local_detalhe";

export const CAMPOS_DA_ETIQUETA: {
  key: CampoEtiqueta;
  rotulo: string;
  /** O que a etiqueta perde ao desligá-lo — e o que ganha em troca. */
  troca: string;
}[] = [
  {
    key: "cor_dimensoes",
    rotulo: "Cor e dimensões",
    troca: "É a única linha que se confere OLHANDO a peça: a chapa branca é branca e 2750×1840 se " +
      "mede com trena. Desligada, a linha dela vira altura pro nome — que passa a caber em duas " +
      "linhas em etiquetas mais baixas.",
  },
  {
    key: "data_responsavel",
    rotulo: "Data e responsável",
    troca: "A data impressa é a única testemunha de quando a peça entrou — estoque velho não se " +
      "descobre de outro jeito. Desligue só se a etiqueta é refeita com frequência.",
  },
  {
    key: "codigo_legivel",
    rotulo: "Código escrito embaixo das barras",
    troca: "É a rede pra quando a barra borra e alguém digita no ERP. Desligado, os ~3,5mm dele " +
      "viram BARRA — o maior ganho desta lista, e o que faz uma tira baixa continuar bipável.",
  },
  {
    key: "local_detalhe",
    rotulo: "Detalhe da prateleira",
    troca: "O “C3 · B2” embaixo do local. Some sozinho quando a peça não tem prateleira registrada; " +
      "desligue se o galpão guarda o endereço fino só no sistema.",
  },
];

const CHAVES_DE_CAMPO = new Set<string>(CAMPOS_DA_ETIQUETA.map((c) => c.key));

/** A lista limpa: só chaves conhecidas, sem repetição e em ordem estável. */
export function normalizarCampos(bruto: unknown): CampoEtiqueta[] {
  if (!Array.isArray(bruto)) return [];
  const pedidos = new Set(bruto.map((v) => String(v).trim()));
  // Percorre o CATÁLOGO e não a entrada: a ordem gravada passa a ser a ordem do
  // desenho, então duas telas nunca mostram os mesmos campos em ordens
  // diferentes e o `join` de duas listas iguais compara igual.
  return CAMPOS_DA_ETIQUETA.filter((c) => pedidos.has(c.key)).map((c) => c.key);
}

/**
 * 18mm é o alvo do desenho (não um meio-termo). Era 15 — a tira de 72×15 foi
 * impressa de verdade na Goldensky e cabia inteira —, e o dono pediu mais:
 * "aumenta um pouco a etiqueta pra ficar com 18mm". Os 3mm a mais vão todos
 * pras BARRAS, que é onde rendem; nenhum texto muda de tamanho. Uma cópia
 * continua sendo o normal.
 *
 * O mesmo número mora em `EtiquetaLayout.ALTURA_PADRAO_MM` no app do tablet, e
 * o teste de contrato quebra se os dois divergirem.
 */
export const CONFIG_IMPRESSAO_PADRAO: ConfigImpressao = { alturaMm: 18, larguraMm: 72, copias: 1, ocultos: [] };

// ── Os limites, e por que eles são estes ─────────────────────────────────────
//
// Os mesmos números de `EtiquetaLayout` no app do tablet
// (estoque-app/.../impressora/EtiquetaLayout.kt). Estão repetidos aqui porque
// os dois lados imprimem a MESMA etiqueta e nenhum importa o outro; a trava
// contra divergência é o teste `etiqueta-config.test.ts`, que compara estes
// valores com os que o arquivo Kotlin declara.
export const ALTURA_MINIMA_MM = 10;
export const ALTURA_MAXIMA_MM = 80;
export const COPIAS_MAXIMAS = 3;

/**
 * A faixa de LARGURA, e por que ela para em 72.
 *
 * 72mm é a cabeça térmica desta impressora, não uma escolha: pedir 90 não
 * imprime 90 — o excedente simplesmente não sai, em silêncio, e a pessoa
 * descobre no papel depois de gastar o rolo. Por isso a faixa recusa aqui, em
 * vez de aceitar o número e cortar na hora de imprimir.
 *
 * 25mm é o piso, e é generoso: nesta largura ainda cabe um código curto. Quem
 * recusa uma etiqueta estreita demais NÃO é este número — é `problemaDaLargura`,
 * que conhece o código de verdade. Códigos têm comprimentos diferentes, e um
 * piso fixo ou recusaria etiqueta boa ou deixaria passar código ilegível.
 */
export const LARGURA_MINIMA_MM = 25;
export const LARGURA_MAXIMA_MM = 72;

/** 203 dpi ÷ 25,4 = 8 pontos por milímetro. É a régua da impressora. */
export const PONTOS_POR_MM = 8;

/** Margem lateral, em mm — a mesma do layout do tablet (`EtiquetaLayout.MARGEM`). */
export const MARGEM_LATERAL_MM = 1;

/**
 * Tamanhos que uma pessoa escolhe com UM toque em vez de digitar dois números.
 *
 * A lista é fixa e curta de propósito. O que o dono pediu — tamanho
 * personalizado — é o campo digitável ao lado; isto aqui é o atalho pros
 * tamanhos que o galpão de fato usa, e existe porque atravessar de 10 a 80mm
 * de um em um é onde a paciência acaba.
 *
 * Os nomes falam de ROLO e não de milímetro imprimível: quem troca o papel
 * segura uma bobina com "58mm" escrito nela, não uma régua.
 */
export const TAMANHOS_COMUNS: { nome: string; larguraMm: number; alturaMm: number; dica: string }[] = [
  { nome: "Produto · rolo 80", larguraMm: 72, alturaMm: 18, dica: "o padrão do galpão: 72mm imprimíveis dos 80mm de bobina" },
  { nome: "Produto · rolo 58", larguraMm: 48, alturaMm: 18, dica: "48mm imprimíveis dos 58mm de bobina" },
  { nome: "Prateleira", larguraMm: 72, alturaMm: 30, dica: "tira alta: sobra vira barra, que é leitor pegando de longe" },
  { nome: "Estreita", larguraMm: 40, alturaMm: 18, dica: "cabe o texto, mas a barra sai no traço mínimo — só para código curto" },
];

/**
 * Altura de barra que um leitor comum precisa. Abaixo disso a pessoa passa a
 * bipar três vezes por peça e conclui que "o leitor está ruim" — a norma
 * (ISO/IEC 15416) fala em 15% da largura do símbolo ou 6,4mm, o que for maior;
 * 8mm é a folga que a prática pediu.
 *
 * NÃO É CONFIGURÁVEL, e a tela recusa em vez de oferecer: limite que o usuário
 * escolhe é limite que alguém escolhe errado no dia em que está com pressa. O
 * que a tela oferece é a faixa em que este piso está garantido.
 */
export const ALTURA_MINIMA_BARRAS_MM = 8;

/**
 * Menor letra que ainda se lê em papel térmico barato. Medido no galpão, com a
 * tira na mão. Também NÃO é configurável: abaixo disso o layout prefere CORTAR
 * texto a encolher a letra — nome cortado que se lê vale mais que nome inteiro
 * que ninguém decifra, e a identidade da peça está no código de barras.
 */
export const LETRA_MINIMA_MM = 2.8;

/** Margem de cima e de baixo da etiqueta, em mm (a mesma do layout). */
const MARGEM_VERTICAL_MM = 0.5;

/**
 * Vão entre a faixa do topo e as barras, em mm — o mesmo 1mm do tablet
 * (`EtiquetaLayout.VAO_ANTES_DAS_BARRAS`) e o mesmo da etiqueta livre.
 *
 * Ele existe porque barra colada em texto faz o leitor pegar a perna do "p"
 * como se fosse a primeira barra e devolver lixo.
 */
const VAO_ANTES_DAS_BARRAS_MM = 1;

function inteiroNaFaixa(valor: unknown, padrao: number, min: number, max: number): number {
  const n = Math.trunc(Number(valor));
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

/** Prende qualquer entrada na faixa segura — nunca devolve valor inválido. */
export function normalizarConfig(bruto: Partial<Record<keyof ConfigImpressao, unknown>> | null | undefined): ConfigImpressao {
  return {
    alturaMm: inteiroNaFaixa(bruto?.alturaMm, CONFIG_IMPRESSAO_PADRAO.alturaMm, ALTURA_MINIMA_MM, ALTURA_MAXIMA_MM),
    larguraMm: inteiroNaFaixa(bruto?.larguraMm, CONFIG_IMPRESSAO_PADRAO.larguraMm, LARGURA_MINIMA_MM, LARGURA_MAXIMA_MM),
    copias: inteiroNaFaixa(bruto?.copias, CONFIG_IMPRESSAO_PADRAO.copias, 1, COPIAS_MAXIMAS),
    ocultos: normalizarCampos(bruto?.ocultos),
  };
}

/**
 * O que está ERRADO num corpo de PATCH, em frases — vazio quer dizer "pode
 * gravar".
 *
 * Separada de `normalizarConfig` de propósito, e a diferença importa. A
 * normalização PRENDE na faixa: é o que a leitura do banco precisa, porque uma
 * linha antiga fora da faixa não pode derrubar a impressão do galpão. Mas
 * prender um PATCH é conserto silencioso — quem manda 200mm de largura recebe
 * "salvo", imprime, e descobre 72mm no papel sem nunca ter sido avisado. Aqui a
 * resposta é 400 com a frase, e a tela repete a frase.
 *
 * Campo ausente NÃO é erro: a tela salva um ajuste por vez.
 */
export function validarConfig(bruto: Partial<Record<keyof ConfigImpressao, unknown>> | null | undefined): string[] {
  const problemas: string[] = [];
  const numero = (v: unknown) => (v === undefined || v === null ? null : Number(v));

  const altura = numero(bruto?.alturaMm);
  if (altura !== null && (!Number.isFinite(altura) || altura < ALTURA_MINIMA_MM || altura > ALTURA_MAXIMA_MM)) {
    problemas.push(`A altura da etiqueta vai de ${ALTURA_MINIMA_MM} a ${ALTURA_MAXIMA_MM}mm.`);
  }

  const largura = numero(bruto?.larguraMm);
  if (largura !== null && (!Number.isFinite(largura) || largura < LARGURA_MINIMA_MM || largura > LARGURA_MAXIMA_MM)) {
    problemas.push(
      `A largura vai de ${LARGURA_MINIMA_MM} a ${LARGURA_MAXIMA_MM}mm — ${LARGURA_MAXIMA_MM}mm é o que a cabeça ` +
      "térmica alcança num rolo de 80mm, e pedir mais não imprime mais: o excedente não sai, em silêncio.",
    );
  }

  const copias = numero(bruto?.copias);
  if (copias !== null && (!Number.isFinite(copias) || copias < 1 || copias > COPIAS_MAXIMAS)) {
    problemas.push(`As vias de cada etiqueta vão de 1 a ${COPIAS_MAXIMAS}.`);
  }

  // ── Campo desconhecido é ERRO aqui, e é ignorado no tablet ────────────────
  //
  // A assimetria é de propósito e depende de quem está do outro lado. Aqui há
  // alguém esperando resposta: uma chave errada ("codigolegivel", "data") seria
  // gravada, sumiria da lista na próxima leitura e a pessoa concluiria que o
  // ajuste não salva. No tablet (`CampoEtiqueta.deChaves`) a mesma chave é
  // ignorada, porque lá não há ninguém pra corrigir e derrubar a impressão do
  // lote por causa de uma palavra seria pior que imprimir um campo a mais.
  const ocultos = bruto?.ocultos;
  if (ocultos !== undefined && ocultos !== null) {
    if (!Array.isArray(ocultos)) {
      problemas.push("Os campos escondidos têm de vir numa lista.");
    } else {
      const desconhecidos = ocultos.map((v) => String(v)).filter((v) => !CHAVES_DE_CAMPO.has(v));
      if (desconhecidos.length > 0) {
        problemas.push(
          `A etiqueta não tem o campo ${desconhecidos.map((d) => `“${d}”`).join(", ")}. ` +
          `Os que dá pra desligar são: ${CAMPOS_DA_ETIQUETA.map((c) => c.key).join(", ")}.`,
        );
      }
    }
  }

  return problemas;
}

// ── O que a altura escolhida custa ───────────────────────────────────────────

export interface AvaliacaoDaAltura {
  alturaBarrasMm: number;
  /** A barra continua legível por um leitor comum? */
  barrasLegiveis: boolean;
  /** O que essa altura deixa de fora, na ordem em que o layout sacrifica. */
  naoCabe: string[];
  /**
   * O que a tira DE FATO leva, nesta altura e com estes campos.
   *
   * Existe porque a frase de "deu tudo certo" era uma lista fixa escrita na
   * tela, e ela passou a mentir no minuto em que os campos viraram escolha:
   * medido no navegador, desligar o código escrito deixava o número certo
   * ("barras de 14mm") ao lado de uma frase que ainda prometia "…e o código
   * escrito". É o mesmo motivo pelo qual `aviso` é montado a partir de
   * `naoCabe` em vez de um texto por degrau — texto solto não acompanha o
   * layout, e frase que mente ao lado de um número certo é pior que frase
   * nenhuma: ela dá confiança.
   */
  cabe: string[];
  /** A frase pronta pra tela, ou `null` quando cabe tudo. */
  aviso: string | null;
}

/**
 * A aritmética do layout, em mm, para a tela poder AVISAR antes de alguém
 * mandar 40 etiquetas.
 *
 * É o espelho de `EtiquetaLayout.montar` (Kotlin) reduzido ao que a tela
 * precisa dizer. Espelho e não porte: lá a conta é em pontos de impressora
 * (8/mm) e resolve faixas, barras e linhas de base; aqui só interessa "quantos
 * milímetros sobram pra barra" e "a faixa do pé cabe?".
 *
 * ── O QUE MUDOU COM O EMPILHADO ──────────────────────────────────────────────
 *
 * A etiqueta deixou de ter três colunas: o texto empilha em cima e embaixo, e
 * as BARRAS levam a largura útil inteira (é o que devolveu o módulo de 0,25mm).
 * A consequência aqui é que a ALTURA passou a ter um eixo só, e binário:
 *
 *  · a FAIXA DO PÉ (o código escrito à esquerda e "quando · quem" à direita) é
 *    a única coisa que mora abaixo das barras, então é a única que devolve
 *    altura pra elas — e cai INTEIRA, porque os dois dividem uma linha só;
 *  · a faixa do TOPO (nome, cor · dimensões, local) nunca cai: o nome e as
 *    barras são a etiqueta. O que cede lá é LARGURA, e quem responde por isso é
 *    `faixasDaEtiqueta`.
 */
export function avaliarAltura(alturaMm: number, ocultos: CampoEtiqueta[] = []): AvaliacaoDaAltura {
  const altura = inteiroNaFaixa(alturaMm, CONFIG_IMPRESSAO_PADRAO.alturaMm, ALTURA_MINIMA_MM, ALTURA_MAXIMA_MM);
  const util = altura - 2 * MARGEM_VERTICAL_MM;

  // Caixa de uma linha de texto = 1,25 × o corpo da fonte (a descida do "g").
  const linha = LETRA_MINIMA_MM * 1.25;

  const quer = (c: CampoEtiqueta) => !ocultos.includes(c);
  const querOCodigo = quer("codigo_legivel");
  const querRodape = quer("data_responsavel");

  // A faixa do topo custa uma linha, e o vão até as barras 1mm. Isso sai da
  // altura ANTES de qualquer pergunta: no empilhado o texto de cima não é
  // negociável.
  const sobraSemOPe = util - linha - VAO_ANTES_DAS_BARRAS_MM;

  // A faixa do pé só fica se as barras continuarem nos 8mm depois dela. A barra
  // é a razão de a etiqueta existir; o código escrito é a rede pra quando ela
  // borrar, e rede não derruba o que protege.
  const alguemNoPe = querOCodigo || querRodape;
  const cabeOPe = alguemNoPe && sobraSemOPe - linha >= ALTURA_MINIMA_BARRAS_MM;
  const alturaBarrasMm = Math.max(0, cabeOPe ? sobraSemOPe - linha : sobraSemOPe);

  const naoCabe: string[] = [];
  // `quer… &&`: campo desligado NUNCA é "não coube". A frase manda aumentar a
  // altura, e a altura não traz de volta o que ninguém pediu. Os dois entram
  // JUNTOS porque caem juntos — dizer só um faria quem lê colar a tira achando
  // que a data saiu.
  if (alguemNoPe && !cabeOPe) {
    if (querOCodigo) naoCabe.push("o código escrito embaixo das barras");
    if (querRodape) naoCabe.push("a data e o responsável");
  }

  // O que sobrou na tira, na ordem em que ela é lida. O nome e as barras estão
  // sempre aqui — não há como desligá-los, e é isso que os torna a etiqueta.
  const cabe = [
    "o nome",
    ...(quer("cor_dimensoes") ? ["cor e dimensões"] : []),
    ...(quer("local_detalhe") ? ["o local com o detalhe da prateleira"] : ["o local"]),
    "as barras",
    ...(cabeOPe && querOCodigo ? ["o código escrito"] : []),
    ...(cabeOPe && querRodape ? ["data e responsável"] : []),
  ];

  const barrasLegiveis = alturaBarrasMm >= ALTURA_MINIMA_BARRAS_MM;
  return {
    alturaBarrasMm: Math.round(alturaBarrasMm * 10) / 10,
    barrasLegiveis,
    naoCabe,
    cabe,
    aviso: frase(alturaBarrasMm, barrasLegiveis, naoCabe),
  };
}

function frase(alturaBarrasMm: number, legiveis: boolean, naoCabe: string[]): string | null {
  if (!legiveis) {
    return `Barras com ${alturaBarrasMm.toFixed(1)}mm — abaixo dos ${ALTURA_MINIMA_BARRAS_MM}mm ` +
      "que um leitor comum precisa. Aumente a altura.";
  }
  if (naoCabe.length === 0) return null;
  return `Nesta altura não cabe ${emLista(naoCabe)}.`;
}

/** "a, b nem c" — a vírgula do meio e o "nem" do fim, como se fala. */
function emLista(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} nem ${itens[itens.length - 1]}`;
}

/** "a, b e c" — o irmão positivo de `emLista`, pro que a tira LEVA. */
export function emListaE(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

// ── O que a largura escolhida custa ──────────────────────────────────────────
//
// Espelho de `problemaDaLargura` / `maxCaracteresDoCodigo` em
// EtiquetaLayout.kt. A física é a mesma dos dois lados: o Code128 gasta um
// número FIXO de módulos (11 por caractere, mais START, checksum, STOP e as
// duas zonas quietas), e o menor traço que a cabeça térmica sabe queimar é UM
// ponto — 0,125mm a 203 dpi. Se o total não cabe na largura, não existe desenho
// possível: só existe barra cortada na borda do papel.
//
// E barra cortada não é código incompleto, é código que escaneia OUTRA COISA.
// A etiqueta sai bonita, alguém cola na peça, e o defeito aparece semanas
// depois quando o leitor devolve um número que não existe no ERP.

/**
 * O menor traço que a cabeça queima: um ponto. Não é preferência, é a física.
 *
 * É a regra de RECUSA, não o alvo — ver `MODULO_ALVO_PONTOS`.
 */
export const MODULO_MINIMO_PONTOS = 1;

/**
 * O módulo que a etiqueta PROCURA: dois pontos, 0,25mm.
 *
 * É o mesmo da impressão livre, que é a tira que o dono comparou e chamou de
 * boa. Quem o alcança é o desenho EMPILHADO, não uma constante: dando a largura
 * útil inteira às barras, o código do galpão (264 módulos) sai com 2 pontos a
 * 72mm sem que ninguém peça. Espelho de `EtiquetaLayout.MODULO_ALVO_PONTOS`.
 */
export const MODULO_ALVO_PONTOS = 2;

/** Largura útil (descontadas as margens laterais) de uma etiqueta, em mm. */
export function larguraUtilMm(larguraMm: number): number {
  const l = inteiroNaFaixa(larguraMm, CONFIG_IMPRESSAO_PADRAO.larguraMm, LARGURA_MINIMA_MM, LARGURA_MAXIMA_MM);
  return l - 2 * MARGEM_LATERAL_MM;
}

/** O maior código, em caracteres, que ainda vira barras nesta largura. */
export function maxCaracteresDoCodigoNaEtiqueta(larguraMm: number): number {
  const utilPontos = larguraUtilMm(larguraMm) * PONTOS_POR_MM;
  // START + checksum + STOP com a barra de terminação = 35 módulos; 10 de zona
  // quieta de cada lado; 11 por caractere.
  const fixos = 35 + 2 * ZONA_QUIETA_MODULOS;
  return Math.max(0, Math.floor((Math.floor(utilPontos / MODULO_MINIMO_PONTOS) - fixos) / 11));
}

/**
 * O que impede ESTE código de virar barras NESTA largura, ou `null`.
 *
 * A frase é a mesma que o tablet dá, e ela sempre diz O QUE FAZER — "aumente a
 * largura ou encurte o código" —, porque quem lê está de frente pra uma
 * impressora esperando papel.
 */
export function problemaDaLargura(codigo: string, larguraMm: number): string | null {
  const limpo = codigo.trim();
  if (!limpo) return null;
  let modulos: number;
  try {
    modulos = code128Modulos(limpo);
  } catch {
    // Caractere que o Code128-B não desenha é outro problema, com outra frase
    // (ver `motivoDoCodigoRecusado` em lib/estoque-impressao-livre.ts). Aqui a
    // pergunta é só de largura, e responder por ela seria dar o conselho errado.
    return null;
  }
  const utilMm = larguraUtilMm(larguraMm);
  const pedidoMm = (modulos * MODULO_MINIMO_PONTOS) / PONTOS_POR_MM;
  if (pedidoMm <= utilMm) return null;
  return `O código “${limpo}” pede ${pedidoMm.toFixed(0)}mm de barras e nesta largura sobram ` +
    `${utilMm.toFixed(0)}mm. Aumente a largura ou encurte o código — barra espremida não vira ` +
    "código ilegível, vira código que escaneia outra coisa.";
}

/** Vão entre duas vagas da mesma faixa, em mm — o mesmo respiro do tablet. */
const VAO_ENTRE_VAGAS_MM = 1.5;

/**
 * Mínimos das vagas de texto, em mm. O porquê de cada um está em
 * `EtiquetaLayout.kt`, junto da ordem em que elas cedem.
 */
const MINIMO_DO_NOME_MM = 10;
const MINIMO_DA_COR_MM = 10;

/**
 * A vaga do local é RESERVA FIXA, não proporção — como a do selo.
 *
 * "GAL-A" tem cinco caracteres por construção (8,9mm em Arial a 2,8mm) e
 * "GAL-A · C3 · B2" tem quinze (21mm): ao contrário do nome e da cor, o tamanho
 * dele não depende do cadastro. Reparti-lo por peso dava dois defeitos ao mesmo
 * tempo — a 72mm sobrava vaga vazia à direita, e a 56mm a fatia caía abaixo do
 * mínimo e derrubava a COR junto, que é a ordem de sacrifício ao contrário.
 */
const LARGURA_DO_LOCAL_MM = 10;

/**
 * O detalhe da prateleira mora na faixa do PÉ, e o número explica por quê.
 *
 * Colado no local ("GAL-A · C3 · B2") ele custava 21mm da faixa do topo, e com
 * ele o nome e a cor caíam de 30 e 27mm para 24,3 e 21,6: a etiqueta padrão
 * passava a sair com dois campos cortados E um aviso permanente na tela. Aviso
 * que está sempre aceso é aviso que ninguém lê.
 *
 * Sozinho, "C3 · B2" mede 9,6mm, e na faixa do pé sobra: 31,9 do código escrito
 * + 9,6 dele + 23,3 do horário + dois vãos = 67,8mm nos 70 que a tira tem. Tudo
 * cabe, sem uma reticência e sem aviso nenhum.
 */
const MINIMO_DO_DETALHE_MM = 9;

/**
 * Os pesos da repartição — os MESMOS números do tablet
 * (`EtiquetaLayout.PESO_*`), e o porquê deles está lá: saem do que cada texto
 * mede a 2,8mm.
 */
// Igual: "Folha de alavanca" mede 24,1mm e "Branco · 2750×1840" 25,4mm, e a
// 72mm a divisão dá 28,5mm pra cada — os dois inteiros, com folga. Uma
// proporção a favor do nome (9 : 8) deixava a cor com 25,3 contra 25,4, e a
// diferença virava reticência na tela. Décimo de milímetro não é margem.
const PESO_DO_NOME = 1;
const PESO_DA_COR = 1;
const PESO_DO_CODIGO_LEGIVEL = 10;
const PESO_DO_DETALHE = 3;
const PESO_DO_RODAPE = 7;

/** Largura reservada pro quadro do selo, em mm (`EtiquetaLayout.Selo.LARGURA_RESERVADA`). */
const LARGURA_DO_SELO_MM = 10;

export interface FaixasDaEtiqueta {
  /** Vaga do nome — abre a faixa do topo, à esquerda. */
  nomeMm: number;
  /** Cor · dimensões. `0` quando cedeu ou foi desligada. */
  corDimensoesMm: number;
  /** Local — "GAL-A", em negrito. `0` quando cedeu. */
  localMm: number;
  /** Quadro do selo, encostado na borda direita. `0` quando não é caixa. */
  seloMm: number;
  /** "C3 · B2", no meio da faixa do pé. `0` quando cedeu ou foi desligado. */
  detalheDoLocalMm: number;
  /** O "C3 · B2" saiu impresso? */
  mostraDetalheDoLocal: boolean;
  /** As barras — a largura ÚTIL inteira, menos a sobra de centralização. */
  barrasMm: number;
  /** O código escrito, à esquerda da faixa do pé. */
  codigoLegivelMm: number;
  /** "04/08 18:57 · João", à direita da faixa do pé. */
  rodapeMm: number;
  vaoMm: number;
  /** Largura de um módulo, em pontos. 2 é o alvo; 1 é o piso da cabeça térmica. */
  moduloPontos: number;
}

/**
 * As faixas empilhadas, em milímetros, para a largura escolhida.
 *
 * ESPELHO de `EtiquetaLayout.montar` (Kotlin), e existe porque a prévia da web
 * mentia: a coluna do código era fixa em 34mm, então numa etiqueta de 40mm ela
 * sozinha comia a tira inteira e o desenho na tela não tinha relação com o
 * papel. Prévia que mente é pior que prévia nenhuma — ela dá confiança.
 *
 * A ordem de sacrifício é a mesma do tablet, e o motivo de cada uma está lá: o
 * detalhe da prateleira cede primeiro, depois a cor, depois o local. O nome e o
 * selo nunca cedem.
 *
 * A trava contra os dois lados divergirem são os números fixados nos DOIS
 * testes (`etiqueta-config.test.ts` em mm, `EtiquetaLarguraTest.kt` em pontos).
 */
export function faixasDaEtiqueta(
  codigo: string,
  larguraMm: number,
  opcoes: { temLocal: boolean; ehCaixa?: boolean; ocultos?: CampoEtiqueta[] } = { temLocal: true },
): FaixasDaEtiqueta {
  const ehCaixa = opcoes.ehCaixa === true;
  const ocultos = opcoes.ocultos ?? [];
  const quer = (c: CampoEtiqueta) => !ocultos.includes(c);

  let modulos = 0;
  try { modulos = code128Modulos(codigo); } catch { modulos = 0; }

  // ── A conta inteira é feita em PONTOS, e isso é a trava ──────────────────
  //
  // O módulo é um número inteiro de pontos (o código se dimensiona, não se
  // estica), e o Kotlin reparte as vagas com divisão INTEIRA. Fazer a mesma
  // conta aqui em milímetros de ponto flutuante daria vagas 0,03mm diferentes —
  // invisível no papel, e o bastante pra impedir que os dois lados sejam
  // comparados por igualdade. Em pontos, os dois números são o MESMO número.
  const utilPontos = larguraUtilMm(larguraMm) * PONTOS_POR_MM;
  const vaoPontos = VAO_ENTRE_VAGAS_MM * PONTOS_POR_MM;

  // As BARRAS levam a largura útil inteira — sem teto de 60%. É a linha que o
  // redesenho existe pra escrever: 560 pontos ÷ 264 módulos = 2 pontos por
  // módulo, 0,25mm, contra o 1 ponto que as três colunas deixavam.
  const moduloPontos = Math.max(MODULO_MINIMO_PONTOS, Math.floor(utilPontos / (modulos || 1)));
  const barrasPontos = modulos ? modulos * moduloPontos : 0;

  // ── A faixa do topo ──────────────────────────────────────────────────────
  const seloPontos = ehCaixa ? Math.min(LARGURA_DO_SELO_MM * PONTOS_POR_MM, utilPontos) : 0;
  const paraOTexto = Math.max(0, utilPontos - (ehCaixa ? seloPontos + vaoPontos : 0));

  let comCor = quer("cor_dimensoes");
  let comLocal = opcoes.temLocal;
  let vagas = medirOTopo(paraOTexto, comCor, comLocal);
  // A ordem destes passos É a ordem de sacrifício (ver `Peca` no Kotlin).
  if (!vagas && comCor) { comCor = false; vagas = medirOTopo(paraOTexto, comCor, comLocal); }
  if (!vagas && comLocal) { comLocal = false; vagas = medirOTopo(paraOTexto, comCor, comLocal); }
  const faixas = vagas ?? repartir(paraOTexto, [PESO_DO_NOME]);

  let i = 1;
  const corPontos = comCor ? faixas[i++] : 0;
  const localPontos = comLocal ? faixas[i] : 0;

  // ── A faixa do pé ────────────────────────────────────────────────────────
  const querOCodigo = quer("codigo_legivel");
  const querRodape = quer("data_responsavel");
  // O DETALHE só existe se a peça tem local (senão "C3 · B2" não quer dizer
  // nada) e se a vaga chega aos 9,6mm que ele mede — cortado no meio ("C3 · B…")
  // ele manda procurar numa baia que não existe, que é pior que não sair.
  let comDetalhe = quer("local_detalhe") && comLocal;
  const pesosDoPe = () => [
    ...(querOCodigo ? [PESO_DO_CODIGO_LEGIVEL] : []),
    ...(comDetalhe ? [PESO_DO_DETALHE] : []),
    ...(querRodape ? [PESO_DO_RODAPE] : []),
  ];
  let pe = medirOPe(utilPontos, pesosDoPe(), querOCodigo, comDetalhe);
  if (!pe && comDetalhe) { comDetalhe = false; pe = medirOPe(utilPontos, pesosDoPe(), querOCodigo, comDetalhe); }
  // Nem no piso: o código escrito e o horário cortam com reticências, que é o
  // que eles já faziam.
  const doPe = pe ?? repartir(utilPontos, pesosDoPe());
  let j = 0;
  const codigoLegivelPontos = querOCodigo ? doPe[j++] : 0;
  const detalhePontos = comDetalhe ? doPe[j++] : 0;
  const rodapePontos = querRodape ? doPe[j] : 0;

  const mm = (pontos: number) => pontos / PONTOS_POR_MM;
  return {
    nomeMm: mm(faixas[0]),
    corDimensoesMm: mm(corPontos),
    localMm: mm(localPontos),
    seloMm: mm(seloPontos),
    detalheDoLocalMm: mm(detalhePontos),
    mostraDetalheDoLocal: comDetalhe,
    barrasMm: mm(barrasPontos),
    codigoLegivelMm: mm(codigoLegivelPontos),
    rodapeMm: mm(rodapePontos),
    vaoMm: VAO_ENTRE_VAGAS_MM,
    moduloPontos,
  };
}

/**
 * Reparte uma largura entre vagas, na proporção dos pesos e descontando os
 * vãos. Espelho de `EtiquetaLayout.repartir`, com a MESMA divisão acumulada:
 * arredondar uma vez por vaga deixaria pontos sem dono e a última vaga não
 * encostaria na margem direita.
 */
function repartir(disponivelPontos: number, pesos: number[]): number[] {
  if (!pesos.length) return [];
  const sobra = Math.max(0, disponivelPontos - VAO_ENTRE_VAGAS_MM * PONTOS_POR_MM * (pesos.length - 1));
  const total = Math.max(1, pesos.reduce((a, b) => a + b, 0));
  let ate = 0;
  let borda = 0;
  return pesos.map((peso) => {
    ate += peso;
    const fim = Math.floor((sobra * ate) / total);
    const largura = fim - borda;
    borda = fim;
    return largura;
  });
}

/**
 * As vagas da faixa do topo NESTA combinação, ou `null` quando alguma delas
 * ficaria abaixo do mínimo dela.
 *
 * Devolver `null` em vez de "a maior que couber" é o que faz a etiqueta NUNCA
 * piorar ao ser alargada: quem pergunta tenta a combinação mais rica primeiro e
 * vai cedendo na ordem de `Peca`, então uma tira mais larga nunca responde
 * `null` onde a mais estreita respondeu com vagas.
 *
 * Espelho de `EtiquetaLayout.medirOTopo`.
 */
function medirOTopo(disponivelPontos: number, comCor: boolean, comLocal: boolean): number[] | null {
  // O local sai FIXO da conta antes de qualquer proporção — o tamanho dele não
  // depende do cadastro. O que sobra é do nome e da cor, 9 : 8, que é a
  // proporção do que os dois MEDEM ("Folha de alavanca" 24,1mm,
  // "Branco · 2750×1840" 25,4mm). A 72mm isso dá 30 e 27: inteiros.
  const doLocal = comLocal ? LARGURA_DO_LOCAL_MM * PONTOS_POR_MM : 0;
  const paraNomeECor = disponivelPontos - doLocal - (comLocal ? VAO_ENTRE_VAGAS_MM * PONTOS_POR_MM : 0);
  if (paraNomeECor <= 0) return null;

  const pesos = [PESO_DO_NOME, ...(comCor ? [PESO_DA_COR] : [])];
  const minimos = [MINIMO_DO_NOME_MM, ...(comCor ? [MINIMO_DA_COR_MM] : [])]
    .map((v) => v * PONTOS_POR_MM);

  const vagas = repartir(paraNomeECor, pesos);
  if (vagas.some((v, i) => v < minimos[i])) return null;
  return comLocal ? [...vagas, doLocal] : vagas;
}

/**
 * As vagas da faixa do pé, ou `null` quando o DETALHE não teria os 9,6mm que
 * ele mede. Espelho de `EtiquetaLayout.medirOPe`.
 *
 * Só o detalhe faz a conta falhar. O código escrito e o horário cortam com
 * reticências desde sempre — a diferença é o que um corte significa:
 * "MDF6MM-BR-18-00…" ainda é reconhecível com a peça na mão e "04/08 18:57 · Jo"
 * ainda diz o turno; "C3 · B…" manda procurar numa baia que não existe.
 */
function medirOPe(
  disponivelPontos: number,
  pesos: number[],
  comCodigo: boolean,
  comDetalhe: boolean,
): number[] | null {
  if (!pesos.length) return [];
  const vagas = repartir(disponivelPontos, pesos);
  if (!comDetalhe) return vagas;
  return vagas[comCodigo ? 1 : 0] >= MINIMO_DO_DETALHE_MM * PONTOS_POR_MM ? vagas : null;
}

export interface AvaliacaoDaLargura {
  larguraUtilMm: number;
  /** Quantos caracteres o código de barras aceita aqui. */
  maxCaracteresDoCodigo: number;
  /** Sobra largura pra vaga do local ao lado do nome? */
  cabeAColunaDoLocal: boolean;
  /** As barras chegam nos 0,25mm de módulo que o leitor pega de primeira? */
  moduloNoAlvo: boolean;
  /** A frase pronta pra tela, ou `null` quando a largura não tira nada. */
  aviso: string | null;
}

/**
 * O que a largura escolhida deixa de fora — o irmão de `avaliarAltura`.
 *
 * No empilhado a largura ganhou um segundo trabalho, e é o mais importante: ela
 * é quem dá MÓDULO às barras. Antes o código ficava preso a 60% da largura útil
 * e alargar a tira quase não engordava a barra; agora cada milímetro a mais é
 * milímetro de barra, e é por isso que a frase fala primeiro do traço.
 */
export function avaliarLargura(larguraMm: number, codigoExemplo = "MDF6MM-BR-18-000042"): AvaliacaoDaLargura {
  const utilMm = larguraUtilMm(larguraMm);
  const maxCaracteres = maxCaracteresDoCodigoNaEtiqueta(larguraMm);

  // ── A frase tem de descrever a MESMA etiqueta que a prévia desenha ────────
  //
  // A prévia mostra a etiqueta mais cheia que existe, uma CAIXA — e é ela que
  // aperta primeiro, porque o selo reserva 10mm da faixa do topo. Descrever a
  // etiqueta comum enquanto o desenho mostra a de caixa foi um defeito real:
  // medido no navegador a 48mm, a frase dizia que a coluna sumia e o desenho
  // mostrava ela lá.
  const caixa = faixasDaEtiqueta(codigoExemplo, larguraMm, { temLocal: true, ehCaixa: true });
  const cabeAColunaDoLocal = caixa.localMm > 0;
  const moduloNoAlvo = caixa.moduloPontos >= MODULO_ALVO_PONTOS;

  const problema = problemaDaLargura(codigoExemplo, larguraMm);
  const aviso = problema ?? (
    cabeAColunaDoLocal && moduloNoAlvo
      ? null
      : [
          !moduloNoAlvo
            ? `Nesta largura as barras saem com ${(caixa.moduloPontos / PONTOS_POR_MM).toFixed(3)}mm de traço — ` +
              "o código é comprido demais pra tira, e o leitor vai precisar de duas ou três passadas. " +
              "Alargue a etiqueta ou encurte o código."
            : null,
          !cabeAColunaDoLocal
            ? "Nesta largura a etiqueta sai só com o nome e as barras — o local não cabe ao lado. " +
              "Onde a peça está se descobre olhando a prateleira; o código, não."
            : null,
        ].filter(Boolean).join(" ")
  );

  return {
    larguraUtilMm: utilMm,
    maxCaracteresDoCodigo: maxCaracteres,
    cabeAColunaDoLocal,
    moduloNoAlvo,
    aviso,
  };
}

// ── Banco ────────────────────────────────────────────────────────────────────

/** A tabela/coluna ainda não existe: supabase/estoque_impressao.sql não rodou. */
export function faltaOSql(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  if (erro.code === "42703" || erro.code === "42P01") return true;
  return /column .* does not exist|relation .* does not exist|Could not find the table|schema cache/i.test(erro.message ?? "");
}

export const FRASE_SEM_SQL =
  "Rode supabase/estoque_impressao.sql (ou o consolidado estoque_pendente_tudo.sql) no Supabase — " +
  "a configuração de impressão ainda não tem onde ser guardada.";

export interface ConfigImpressaoLida extends ConfigImpressao {
  /**
   * `false` = ninguém definiu nada, e estes números são o padrão do desenho. É
   * o que faz o tablet continuar mandando no próprio ajuste em vez de obedecer
   * a um valor inventado.
   */
  definida: boolean;
  /**
   * Não deu pra ler porque a COLUNA não existe — o SQL não rodou.
   *
   * Separado de `definida` de propósito: uma queda de rede também deixa
   * `definida: false`, e mandar "rode o SQL" nesse caso é apontar o dedo pro
   * lugar errado. Quem lê a frase é o dono, com o SQL Editor aberto.
   */
  faltaSql: boolean;
  atualizadoEm: string | null;
}

/**
 * Lê a configuração. Sem o SQL, devolve o padrão com `definida: false` — a
 * tela continua de pé, mostra os números do desenho e explica o que rodar.
 */
export async function lerConfigImpressao(db: Db): Promise<ConfigImpressaoLida> {
  const ler = (colunas: string) =>
    db.from("estoque_config").select(colunas).eq("id", true).maybeSingle();

  let { data, error } = await ler(
    "etiqueta_altura_mm,etiqueta_largura_mm,etiqueta_copias,etiqueta_ocultos,etiqueta_atualizado_em",
  );

  // Os CAMPOS ESCONDIDOS chegaram depois da largura, que chegou depois da
  // altura — três gerações do mesmo §8, e um banco pode estar em qualquer uma
  // delas. Cada tentativa tira a coluna mais nova: sem esta escada, um `select`
  // com uma coluna inexistente falharia INTEIRO e jogaria a altura já escolhida
  // pelo escritório de volta pro padrão, ainda mandando "rode o SQL" pra quem
  // acabou de rodar a versão anterior.
  if (error && faltaOSql(error)) {
    ({ data, error } = await ler("etiqueta_altura_mm,etiqueta_largura_mm,etiqueta_copias,etiqueta_atualizado_em"));
  }

  // A LARGURA chegou depois. Um banco onde só a parte antiga do §8 rodou tem
  // `etiqueta_altura_mm` e não tem `etiqueta_largura_mm` — e um `select` com
  // uma coluna inexistente falha INTEIRO, o que jogaria a altura já escolhida
  // pelo escritório de volta pro padrão e ainda mandaria "rode o SQL" pra quem
  // acabou de rodá-lo. Segunda tentativa sem a coluna nova: a largura cai no
  // padrão do desenho (72mm, que é o que o galpão imprime hoje) e o resto
  // continua valendo.
  if (error && faltaOSql(error)) {
    ({ data, error } = await ler("etiqueta_altura_mm,etiqueta_copias,etiqueta_atualizado_em"));
  }

  if (error || !data) {
    // Erro que NÃO é "falta o SQL" (rede, RLS) também cai no padrão: a
    // impressão não pode parar porque a configuração não foi lida — ela tem um
    // valor certo conhecido, e é este.
    return { ...CONFIG_IMPRESSAO_PADRAO, definida: false, faltaSql: faltaOSql(error), atualizadoEm: null };
  }

  const linha = data as {
    etiqueta_altura_mm?: unknown; etiqueta_largura_mm?: unknown;
    etiqueta_copias?: unknown; etiqueta_ocultos?: unknown;
    etiqueta_atualizado_em?: string | null;
  };
  return {
    ...normalizarConfig({
      alturaMm: linha.etiqueta_altura_mm,
      larguraMm: linha.etiqueta_largura_mm,
      copias: linha.etiqueta_copias,
      // Sem a coluna, `undefined` → lista vazia → a etiqueta de sempre, com
      // todos os campos. É o mundo de hoje, que é a resposta certa.
      ocultos: linha.etiqueta_ocultos,
    }),
    definida: true,
    faltaSql: false,
    atualizadoEm: linha.etiqueta_atualizado_em ?? null,
  };
}

/**
 * Teto da lista de SKUs marcados como CAIXA.
 *
 * Ela é curta por natureza — só os itens que fogem do padrão entram —, mas
 * viaja no bootstrap do tablet, que roda a cada ciclo do worker. Listagem sem
 * `.limit()` é o começo de toda conta de egress deste projeto.
 */
export const TETO_SKUS_CAIXA = 300;

/**
 * Os SKUs cujo item é CAIXA. Vem em SKU e não em id porque o código de uma
 * unidade é `<SKU>-<sequencial>`: quem tem a etiqueta na mão deduz o tipo sem
 * uma segunda consulta, e o tablet faz isso offline.
 *
 * Sem a coluna (SQL não rodado) a resposta certa é "nenhum item é caixa" — que
 * é exatamente o mundo de hoje: a etiqueta segue mostrando o número quando a
 * quantidade passa de 1, como sempre fez.
 */
export async function lerSkusDeCaixa(db: Db, limite = TETO_SKUS_CAIXA): Promise<{ skus: string[]; faltaSql: boolean }> {
  const { data, error } = await db
    .from("estoque_itens")
    .select("sku")
    .eq("etiqueta_tipo", "caixa")
    .not("sku", "is", null)
    .limit(limite);

  if (error) return { skus: [], faltaSql: faltaOSql(error) };
  return { skus: ((data ?? []) as { sku: string | null }[]).flatMap((r) => (r.sku ? [r.sku] : [])), faltaSql: false };
}

/**
 * Grava. Devolve `{ ok: false, motivo }` em vez de lançar quando o que falta é
 * o SQL — quem chama transforma isso num 409 com a frase pronta.
 */
export async function gravarConfigImpressao(
  db: Db,
  bruto: Partial<Record<keyof ConfigImpressao, unknown>>,
  porId: string | null,
): Promise<{ ok: true; config: ConfigImpressao } | { ok: false; motivo: "sem_sql" | string }> {
  const config = normalizarConfig(bruto);
  // `upsert` e não `update`: a linha única nasce no §1 do SQL, mas um banco que
  // rodou só o arquivo avulso pode ter a tabela sem a linha — e aí um `update`
  // afetaria zero linhas SEM ERRO NENHUM. A tela diria "salvo" e o galpão
  // continuaria imprimindo o valor antigo, que é o pior desfecho possível.
  const base = {
    id: true,
    etiqueta_altura_mm: config.alturaMm,
    etiqueta_largura_mm: config.larguraMm,
    etiqueta_copias: config.copias,
    etiqueta_atualizado_em: new Date().toISOString(),
    etiqueta_atualizado_por: porId,
  };
  const gravar = (linha: Record<string, unknown>) =>
    db.from("estoque_config").upsert(linha, { onConflict: "id" });

  let { error } = await gravar({ ...base, etiqueta_ocultos: config.ocultos });

  // ── A escrita degrada SÓ no que não foi pedido ───────────────────────────
  //
  // A regra da casa é escrita falhar alto: gravar metade do que a pessoa pediu
  // e responder "salvo" é o pior desfecho possível — ela volta pro galpão
  // achando que a etiqueta mudou. Mas com a coluna dos campos isso passaria a
  // castigar quem nunca a usou: num banco com o §8 antigo, mexer só na ALTURA
  // deixaria de salvar, e a frase mandaria rodar um SQL por causa de uma
  // funcionalidade que essa pessoa não tocou.
  //
  // Então a segunda tentativa existe, e só quando não há nada a perder: lista
  // VAZIA é exatamente o padrão da coluna que falta. Quem de fato desligou um
  // campo cai no `if` de baixo e recebe a frase — aí sim há o que rodar.
  if (error && faltaOSql(error) && config.ocultos.length === 0) {
    ({ error } = await gravar(base));
  }

  if (error) return { ok: false, motivo: faltaOSql(error) ? "sem_sql" : (error.message ?? "erro") };
  return { ok: true, config };
}
