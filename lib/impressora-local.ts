// ── As impressoras DESTE computador ──────────────────────────────────────────
//
// O galpão imprimia por dois caminhos e nenhum deles é uma Zebra. Este arquivo
// é a régua do terceiro: quais saídas existem, o que cada uma exige, e por que
// a que parece mais simples é a que falha calada.
//
// ── POR QUE A LISTA É LOCAL, E NÃO UMA TABELA NO BANCO ──────────────────────
//
// Porque "qual impressora está ligada nesta máquina" é propriedade DA MÁQUINA,
// não da empresa. Duas coisas tornam isso não-negociável:
//
//  1. A PERMISSÃO DE USB É DO NAVEGADOR. Quem autoriza `navigator.usb` é a
//     pessoa, naquele computador, naquele perfil do Chrome — e não há API pra
//     transferir essa autorização. Uma lista compartilhada mostraria a Zebra do
//     escritório pra quem está no galpão, e o botão dela voltaria erro sem
//     explicação possível.
//  2. Duas estações têm impressoras DIFERENTES. Uma configuração única faria a
//     segunda estação imprimir no tamanho da primeira.
//
// O que É da empresa continua no banco: o TAMANHO da etiqueta e quais campos
// saem (`estoque_config`, ver lib/estoque-etiqueta-config.ts). A separação é
// exata — o banco decide o que a etiqueta É, a máquina decide por onde ela sai.
//
// Nada aqui toca `window`: é a régua, e ela é conferida em milissegundos. Quem
// fala com o hardware é `app/(plataforma)/estoque/impressao/enviar.ts`.

import { DPI_SUPORTADOS, ehDpiSuportado, type DpiZpl } from "./etiqueta-zpl";
import {
  ALTURA_MAXIMA_MM, ALTURA_MINIMA_MM, LARGURA_MAXIMA_MM, LARGURA_MINIMA_MM,
} from "./estoque-etiqueta-config";

// ── As saídas ────────────────────────────────────────────────────────────────

export type SaidaDeImpressao = "zebra_usb" | "zebra_agente" | "navegador" | "tablet";

export interface DefSaida {
  key: SaidaDeImpressao;
  label: string;
  /** Ícone Tabler — precisa existir no mapa de app/(plataforma)/Icon.tsx. */
  icon: string;
  /** O que ela faz, em uma frase, pra quem está escolhendo. */
  resumo: string;
  /** O que precisa estar de pé pra ela funcionar. */
  exige: string;
  /** `true` quando a etiqueta sai em ZPL (a impressora desenha o código). */
  zpl: boolean;
}

export const SAIDAS: DefSaida[] = [
  {
    key: "zebra_usb",
    label: "Zebra no cabo USB",
    icon: "plug",
    resumo: "O navegador fala direto com a impressora. Sem instalar nada, sem diálogo de impressão.",
    exige: "Chrome ou Edge, e a impressora NÃO pode estar tomada pelo driver do sistema.",
    zpl: true,
  },
  {
    key: "zebra_agente",
    label: "Zebra pelo Browser Print",
    icon: "device-desktop",
    resumo: "Usa o aplicativo Zebra Browser Print instalado na máquina. É o caminho de quem já tem o driver.",
    exige: "Zebra Browser Print rodando (ele fica em segundo plano, na bandeja).",
    zpl: true,
  },
  {
    key: "navegador",
    label: "Diálogo de impressão",
    icon: "printer",
    resumo: "A folha de etiquetas de sempre. Serve em qualquer impressora que tenha driver.",
    exige: "Nada. É o caminho que sempre funciona.",
    zpl: false,
  },
  {
    key: "tablet",
    label: "Térmica do tablet",
    icon: "device-mobile",
    resumo: "Manda pra fila do tablet do galpão, que imprime na térmica Bluetooth pareada nele.",
    exige: "Um tablet ativo e com rede.",
    zpl: false,
  },
];

/**
 * As duas resoluções, escritas como quem escolhe as reconhece.
 *
 * "203 dpi" sozinho não diz nada a quem está com a impressora na mesa; "8
 * pontos por mm — o comum" diz, e é a informação que faz alguém acertar de
 * primeira em vez de tentar as duas e conferir o papel.
 */
export const DPI_SUPORTADOS_ROTULO: { dpi: DpiZpl; rotulo: string }[] = [
  { dpi: 203, rotulo: "203 dpi · a comum" },
  { dpi: 300, rotulo: "300 dpi · a de alta" },
];

export function defDaSaida(saida: SaidaDeImpressao): DefSaida {
  return SAIDAS.find((s) => s.key === saida) ?? SAIDAS[2];
}

// ── O cadastro de uma impressora ─────────────────────────────────────────────

export interface ImpressoraLocal {
  /** Gerado na máquina. Só serve pra escolher na lista. */
  id: string;
  nome: string;
  saida: SaidaDeImpressao;
  /**
   * A resolução da CABEÇA. Não há como descobri-la conversando com a
   * impressora, e errá-la encolhe a etiqueta inteira a dois terços — por isso
   * ela é campo do cadastro e não um palpite. Ver `zplDeTeste`.
   */
  dpi: DpiZpl;
  /** Tamanho da etiqueta DESTE rolo, em mm. Sobrepõe o padrão da empresa. */
  larguraMm: number;
  alturaMm: number;
  /**
   * Nome do aparelho como o agente Zebra o chama. Só em `zebra_agente`: o
   * Browser Print endereça por nome, e a máquina pode ter duas Zebras.
   */
  agenteUid?: string | null;
  /** Marcada como a de todo dia — a que já vem escolhida ao abrir. */
  padrao?: boolean;
}

export const NOME_MAXIMO = 40;

function naFaixa(v: unknown, padrao: number, min: number, max: number): number {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

function saidaValida(v: unknown): SaidaDeImpressao {
  return SAIDAS.some((s) => s.key === v) ? (v as SaidaDeImpressao) : "navegador";
}

/**
 * Prende qualquer entrada num cadastro válido.
 *
 * Isto lê `localStorage`, que é texto que a pessoa pode editar e que sobrevive
 * a versões antigas do app. Um `dpi: 0` vindo de lá dividiria por zero no
 * gerador; um `alturaMm: 9999` mandaria a impressora alimentar meio rolo numa
 * etiqueta só.
 */
export function normalizarImpressora(bruto: unknown, id = ""): ImpressoraLocal {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const dpiBruto = Number(b.dpi);
  return {
    id: String(b.id ?? id ?? "").trim() || id,
    nome: String(b.nome ?? "").trim().slice(0, NOME_MAXIMO) || "Impressora",
    saida: saidaValida(b.saida),
    dpi: ehDpiSuportado(dpiBruto) ? (dpiBruto as DpiZpl) : 203,
    larguraMm: naFaixa(b.larguraMm, 72, LARGURA_MINIMA_MM, LARGURA_MAXIMA_MM),
    alturaMm: naFaixa(b.alturaMm, 18, ALTURA_MINIMA_MM, ALTURA_MAXIMA_MM),
    agenteUid: b.agenteUid ? String(b.agenteUid).slice(0, 80) : null,
    padrao: b.padrao === true,
  };
}

/** Os problemas do cadastro, em frases. Vazio = pode salvar. */
export function validarImpressora(p: Partial<ImpressoraLocal>): string[] {
  const problemas: string[] = [];
  if (!String(p.nome ?? "").trim()) {
    problemas.push("Dê um nome à impressora — com duas no galpão, “Impressora” não diz qual é.");
  }
  if (!ehDpiSuportado(p.dpi)) {
    problemas.push(
      `Escolha a resolução da cabeça (${DPI_SUPORTADOS.join(" ou ")} dpi). ` +
      "Ela está escrita na etiqueta de identificação do aparelho, e errá-la faz a etiqueta " +
      "sair com dois terços do tamanho — imprima a tira de teste se estiver na dúvida.",
    );
  }
  if (p.saida === "zebra_agente" && !String(p.agenteUid ?? "").trim()) {
    problemas.push("Escolha qual aparelho do Browser Print vai receber — a máquina pode ter mais de um.");
  }
  return problemas;
}

/**
 * A lista inteira, normalizada, com no máximo UMA padrão.
 *
 * Duas marcadas como padrão é estado que o `localStorage` alcança sozinho (duas
 * abas salvando ao mesmo tempo), e aí "a impressora de todo dia" passa a
 * depender da ordem da lista — que muda quando alguém renomeia. A última marcada
 * ganha, e a decisão fica escrita aqui em vez de emergir do acaso.
 */
export function normalizarLista(bruto: unknown): ImpressoraLocal[] {
  if (!Array.isArray(bruto)) return [];
  const lista = bruto.map((b, i) => normalizarImpressora(b, `imp_${i}`)).filter((p) => p.id);
  const ultimaPadrao = lista.map((p) => p.padrao).lastIndexOf(true);
  return lista.map((p, i) => ({ ...p, padrao: i === ultimaPadrao }));
}

/**
 * Qual usar agora: a pedida, senão a padrão, senão a primeira, senão nenhuma.
 *
 * `null` é resposta legítima e a tela precisa dela: sem impressora cadastrada o
 * caminho é o diálogo do navegador, que sempre funciona — e não um erro.
 */
export function escolherImpressora(lista: ImpressoraLocal[], preferidaId?: string | null): ImpressoraLocal | null {
  if (!lista.length) return null;
  const pedida = preferidaId ? lista.find((p) => p.id === preferidaId) : null;
  return pedida ?? lista.find((p) => p.padrao) ?? lista[0];
}

// ── O que o navegador desta pessoa consegue fazer ────────────────────────────

export interface Ambiente {
  /** `navigator.usb` existe. */
  temWebUsb: boolean;
  /** O agente Zebra respondeu. */
  temAgente: boolean;
  /** Windows toma a interface USB da impressora quando o driver está instalado. */
  ehWindows: boolean;
  /** A página está em HTTPS (ou localhost). WebUSB exige. */
  seguro: boolean;
}

export type Veredito = "pronta" | "pede_permissao" | "indisponivel";

export interface DiagnosticoDaSaida {
  veredito: Veredito;
  /** O que está acontecendo, em uma frase. */
  frase: string;
  /** O que fazer, quando há o que fazer. */
  saida?: SaidaDeImpressao;
}

/**
 * O diagnóstico de uma saída NESTE navegador.
 *
 * Existe porque as falhas de impressão local são todas mudas: o WebUSB no
 * Safari não é "erro", é a API não existir; a impressora tomada pelo driver do
 * Windows devolve um `NotFoundError` que não menciona driver nenhum; e o agente
 * Zebra desligado é um `fetch` que só estoura no timeout. Cada uma dessas
 * viraria "não imprime" no relato de quem está na frente da máquina.
 *
 * Toda resposta indisponível aponta OUTRA saída. Nunca existe beco: o diálogo
 * do navegador funciona em qualquer lugar, e mandar a pessoa embora sem
 * alternativa é o que faz alguém desistir e imprimir à mão.
 */
export function diagnosticarSaida(saida: SaidaDeImpressao, amb: Ambiente): DiagnosticoDaSaida {
  if (saida === "navegador" || saida === "tablet") {
    return { veredito: "pronta", frase: defDaSaida(saida).resumo };
  }

  if (saida === "zebra_usb") {
    if (!amb.seguro) {
      return {
        veredito: "indisponivel",
        frase: "Falar com USB só é permitido em página segura (https). Use o diálogo de impressão.",
        saida: "navegador",
      };
    }
    if (!amb.temWebUsb) {
      return {
        veredito: "indisponivel",
        frase: "Este navegador não fala USB — é o caso do Safari e do Firefox. " +
          (amb.temAgente
            ? "O Browser Print está rodando nesta máquina e resolve."
            : "No Chrome ou no Edge funciona; aqui, use o diálogo de impressão."),
        saida: amb.temAgente ? "zebra_agente" : "navegador",
      };
    }
    if (amb.ehWindows) {
      // Não é "indisponível": funciona quando a impressora está sem driver ou
      // com o WinUSB. É "pede permissão" com o aviso do que costuma dar errado —
      // porque o erro que o Windows devolve nesse caso não menciona driver.
      return {
        veredito: "pede_permissao",
        frase: "No Windows, a impressora precisa aparecer na lista ao clicar. " +
          "Se ela não aparecer, o driver da Zebra está segurando o cabo: use o Browser Print.",
        saida: "zebra_agente",
      };
    }
    return { veredito: "pede_permissao", frase: "Clique para escolher a impressora na lista do navegador." };
  }

  // zebra_agente
  if (!amb.temAgente) {
    return {
      veredito: "indisponivel",
      frase: "O Zebra Browser Print não respondeu. Ele fica em segundo plano, na bandeja do sistema — " +
        "abra o aplicativo e tente de novo.",
      saida: amb.temWebUsb ? "zebra_usb" : "navegador",
    };
  }
  return { veredito: "pronta", frase: "O Browser Print respondeu." };
}

/**
 * A saída que a tela deve oferecer primeiro, dado o que existe nesta máquina.
 *
 * A ordem NÃO é por elegância técnica: é por quantos passos a pessoa precisa dar
 * antes de sair papel. USB direto não instala nada; o agente já está instalado
 * quando existe; o diálogo sempre está lá.
 */
export function saidaRecomendada(amb: Ambiente): SaidaDeImpressao {
  if (amb.temWebUsb && amb.seguro && !amb.ehWindows) return "zebra_usb";
  if (amb.temAgente) return "zebra_agente";
  if (amb.temWebUsb && amb.seguro) return "zebra_usb";
  return "navegador";
}
