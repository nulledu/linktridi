// ── Conferência de qualidade · contrato da tela ──────────────────────────────
// O que /api/estoque/conferencias e .../pendentes devolvem, e a tradução dos
// códigos de erro do servidor pra frases em português.
//
// Módulo PURO de propósito (sem React, sem Supabase): a fila (ConferirClient) e
// o painel (ConferirPainel) precisam dos mesmos tipos, e um importar do outro
// só pra pegar um `interface` cria dependência circular entre duas telas.

import type { EstadoEtiqueta } from "@/lib/estoque-etiquetavel";

/**
 * Em que pé o item está diante da ETIQUETA — o veredicto de
 * `lib/estoque-etiquetavel.ts`, decidido no servidor e mandado pronto.
 *
 * A tela NÃO refaz essa conta, e isso é de propósito: ela depende de duas
 * colunas do catálogo que a conferência não carrega (`quantidade` e `unidade`
 * do item) e, se cada lado calculasse por conta própria, no dia em que a regra
 * mudasse a tela prometeria uma coisa e o servidor faria outra. Aqui chega o
 * estado e a frase; a tela decide só o que desenhar com eles.
 */
export interface PreparoDoItem {
  estado: EstadoEtiqueta;
  /** Frase pronta, em português, dizendo o PRÓXIMO PASSO — não o que houve. */
  motivo: string;
  /** O saldo da contagem antiga. É o número que o gesto de preparo oferece. */
  quantidade: number;
  /** Código da unidade ("un", "kg"…), pra tela escrever "191 unidades". */
  unidade: string | null;
}

/**
 * O que aprovar como CERTO vai produzir, do ponto de vista do PAPEL.
 *
 * Três desfechos, não dois — e a diferença entre os dois novos é justamente o
 * que decide se existe alguma coisa a fazer:
 *
 *   · `sai_etiqueta`   → nasce UMA etiqueta, a caixa lacrada valendo as N peças;
 *   · `falta_preparar` → as peças entram na contagem como sempre, mas o item
 *     ainda não é etiquetado. Isso TEM conserto, e quem tem poder de ajuste
 *     conserta daqui mesmo;
 *   · `nunca_etiqueta` → granel ou quantidade quebrada: não tem conserto e não
 *     adianta oferecer gesto nenhum. Meio quilo não cabe numa caixa lacrada.
 *
 * Prometer papel que não sai deixa o gerente esperando na frente da impressora;
 * não prometer o papel que sai faz ele largar a caixa sem código colado. Por
 * isso são três frases e não uma genérica.
 */
export type DesfechoDaEtiqueta = "sai_etiqueta" | "falta_preparar" | "nunca_etiqueta";

/**
 * Traduz o estado do item + o poder de quem está olhando no que a tela promete.
 *
 * `converter_agora` depende de PODER e não do item: ligar a etiqueta é escrita
 * de catálogo, e a conferência roda sob `estoque:itens`, que é só VER. Sem o
 * poder o servidor não converte — então a tela não pode prometer que converte.
 *
 * Sem `preparo` (servidor ainda sem a regra, ou uma resposta velha em cache
 * depois do deploy) a resposta é a de antes: item etiquetado promete papel, o
 * resto não promete nada. Errar pro lado de não prometer é o erro barato.
 */
export function desfechoDoCerto({ preparo, serializado, podePreparar }: {
  preparo?: PreparoDoItem | null;
  serializado: boolean;
  podePreparar: boolean;
}): { desfecho: DesfechoDaEtiqueta; motivo: string | null; ofereceGesto: boolean } {
  if (!preparo) {
    return { desfecho: serializado ? "sai_etiqueta" : "nunca_etiqueta", motivo: null, ofereceGesto: false };
  }
  switch (preparo.estado) {
    case "ja_etiquetado":
      return { desfecho: "sai_etiqueta", motivo: preparo.motivo, ofereceGesto: false };
    // Zerado e contável: a própria aprovação liga a etiqueta e cunha a caixa,
    // então não há gesto separado a oferecer. Sem poder, ela só soma.
    case "converter_agora":
      return podePreparar
        ? { desfecho: "sai_etiqueta", motivo: preparo.motivo, ofereceGesto: false }
        : { desfecho: "falta_preparar", motivo: preparo.motivo, ofereceGesto: false };
    case "precisa_preparo":
      return { desfecho: "falta_preparar", motivo: preparo.motivo, ofereceGesto: podePreparar };
    default:
      return { desfecho: "nunca_etiqueta", motivo: preparo.motivo, ofereceGesto: false };
  }
}

/**
 * Um item do catálogo oferecido como destino da produção.
 *
 * Vem do servidor já ordenado (lib/estoque-sugestao-item.ts) ou da busca em
 * /api/estoque/conferencias/destinos. Os dois caminhos usam o mesmo formato
 * porque a tela trata os dois igual: é uma escolha, não um palpite aplicado.
 */
export interface DestinoDoCatalogo {
  id: string;
  nome: string;
  categoria: string | null;
  /** Etiquetado (nasce uma caixa) ou só um número no catálogo. */
  serializado: boolean;
  /**
   * Em que pé este item está diante da etiqueta. Viaja junto com o destino
   * porque a promessa muda com o item ESCOLHIDO, não com a atividade: quem
   * confere pode trocar "Alavanca" (etiquetada) por "Cola" (galão) no mesmo
   * painel, e a frase tem de acompanhar o dedo.
   */
  preparo?: PreparoDoItem | null;
  /** 0…1, quanto o nome bate com a tarefa. Ausente na busca manual. */
  forca?: number;
}

/** Uma caixa parada esperando o gerente — GET /api/estoque/conferencias/pendentes */
export interface PendenteConferencia {
  id: string;
  produtoNome: string | null;
  /**
   * O que a pessoa FEZ ("Montar alavancas").
   *
   * É o título da caixa na fila: 103 das 104 atividades concluídas em produção
   * não têm produto nenhum, e é isto que elas têm. Enquanto a fila exigia
   * produto, essas 103 nem apareciam.
   */
  tarefa: string | null;
  /** "150 folhas — suficiente p/ 30 alavancas". Contexto de quem confere. */
  detalhe: string | null;
  /** `null` = o `produto_nome` da atividade não casa com nenhum item do catálogo. */
  itemId: string | null;
  /**
   * O item é etiquetado (uma caixa = uma etiqueta) ou só um número no catálogo?
   * `null` quando não há item. É o que separa "vai sair uma etiqueta pra você
   * colar na caixa" de "a quantidade só é somada" — prometer papel que nunca
   * sai deixa o gerente esperando na frente da impressora.
   */
  itemSerializado: boolean | null;
  /**
   * O veredicto de etiqueta do item que a atividade já aponta. `null` quando
   * não há item — aí quem traz o preparo é o destino escolhido na tela.
   *
   * Substitui o `itemSerializado` na hora de prometer: a flag só separava
   * "sai papel" de "não sai", e "não sai" escondia dois mundos diferentes —
   * o item que ainda PODE virar etiquetado e o que nunca vai virar.
   */
  preparo?: PreparoDoItem | null;
  categoria: string | null;
  quantidadeAlvo: number;
  quantidadeFeita: number;
  executorId: string;
  executorNome: string;
  /**
   * O ROSTO de quem fez. `null` quando não há foto cadastrada — e aí o
   * `Avatar` desenha as iniciais, nunca um buraco.
   *
   * A fila é uma lista de gente que se conhece pelo rosto, não pelo nome
   * completo. Cinco pessoas produzem no galpão, então uma página de 23 cartões
   * repete cinco URLs e o navegador baixa cada uma UMA vez.
   */
  executorFotoUrl?: string | null;
  concluidaEm: string | null;
  /**
   * A FOTO DO TRABALHO PRONTO, tirada por quem fez, na hora de concluir.
   *
   * É a peça mais valiosa da conferência: ela permite comparar o que foi
   * fotografado naquele momento com a caixa que está na frente do gerente
   * agora. Se estiverem diferentes, isso É a conferência.
   *
   * A LISTA não baixa esta imagem — só diz se ela existe. Vinte e três fotos
   * de celular carregadas de uma vez são megabytes por abertura de tela, e no
   * tablet do galpão isso é 3G. Quem baixa é a ficha, uma por decisão.
   */
  fotoUrl?: string | null;
  /**
   * Quanto a atividade levou DE VERDADE, em minutos, já partido pelo servidor
   * (`minutosDaAtividade`, com teto de 12 h). `null` quando não dá pra saber —
   * sem carimbo de início, ou atividade esquecida aberta de um dia pro outro.
   */
  tempoRealMin?: number | null;
  /** Quanto se esperava que levasse. A referência do tempo real. */
  tempoEstimadoMin?: number | null;
  /** Quem faz não confere o próprio trabalho — a tela avisa ANTES de preencher. */
  souEuQuemFez: boolean;
  /**
   * O material que ESTA atividade consumiu — as caixas que a pessoa bipou no
   * começo do trabalho. `null` = nenhuma etiqueta foi bipada nesta atividade.
   *
   * É o dado que diz se as 30 peças saíram de 30 folhas ou de 45, e a tela de
   * bipar promete literalmente que "quem conferir depois vê o que entrou" —
   * até agora ninguém via.
   */
  consumo: ConsumoDaCaixa | null;
  /**
   * Onde isto provavelmente entra, do mais provável pro menos.
   *
   * Vem vazio quando a atividade já aponta um item (não há o que escolher) ou
   * quando nada no catálogo bate com a tarefa. Nunca é aplicado sozinho: quem
   * decide é quem confere, olhando a caixa.
   */
  sugestoes: DestinoDoCatalogo[];
}

/**
 * O que o gerente lê no cartão da fila.
 *
 * A TAREFA vem primeiro de propósito: é o que a pessoa fez e o que está escrito
 * na caixa. O produto só aparece nas poucas atividades que já nasceram
 * vinculadas — e "—" (o que a tela mostrava antes) não é nome de nada.
 */
export function tituloDaPendencia(p: { tarefa?: string | null; produtoNome?: string | null }): string {
  return p.tarefa?.trim() || p.produtoNome?.trim() || "Atividade sem nome";
}

export interface ConsumoDaCaixa {
  /** Quantas ETIQUETAS (caixas) saíram do estoque. */
  etiquetas: number;
  /** Quantas PEÇAS saíram — uma caixa de 50 conta 50, não 1. */
  pecas: number;
}

export interface RespostaPendentes {
  atividades: PendenteConferencia[];
  /** Conferência gravada e o estoque NÃO entrou: o ciclo travou no meio. */
  travadas: number;
  proximoCursor: string | null;
  /** A tabela `estoque_conferencias` não existe — o QC ainda não foi ligado. */
  qcDesligado: boolean;
  /**
   * Quem está olhando tem poder de AJUSTE (`estoque:ajustar` ou papel do
   * galpão)? É o que separa ver o problema de poder resolvê-lo: sem isso,
   * "Preparar este item pra etiqueta" seria um botão que só devolve 403.
   *
   * Mora na resposta e não em cada item porque é sobre a PESSOA, não sobre a
   * caixa — uma flag por carga, não uma por linha.
   */
  podePreparar?: boolean;
  /**
   * `true` = o banco ainda não guarda o vínculo baixa→atividade
   * (`estoque_unidades.baixa_atividade_id`). Diferente de "não consumiu nada":
   * a tela precisa da diferença pra não afirmar que a caixa nasceu do nada.
   */
  consumoIndisponivel?: boolean;
  /** A tela está mostrando a janela da semana (`false`) ou o acervo (`true`). */
  acervo?: boolean;
  /** Quantos dias a janela cobre. */
  dias?: number;
  /**
   * Quantas atividades concluídas ficaram ANTES da janela.
   *
   * O acervo não é listado nem apagado: é contado. No dia em que a fila voltou
   * a enxergar a produção sem produto, o pendente virou 104 cartões de três
   * semanas — e uma fila por onde não se sabe começar não é fila.
   */
  anteriores?: number;
}

/**
 * Uma linha do histórico — GET /api/estoque/conferencias.
 *
 * É UMA TENTATIVA, não uma atividade: a mesma atividade aparece de novo cada
 * vez que volta pra bancada e é conferida outra vez (reprovada, reprovada,
 * aprovada).
 */
export interface LinhaHistorico {
  id: string;
  atividadeId: string;
  itemId: string | null;
  itemNome: string | null;
  executorId: string | null;
  executorNome: string | null;
  conferidoPorId: string | null;
  conferidoPorNome: string | null;
  /** 'certo' ou 'errado'. Texto cru do banco: uma linha de formato
   *  desconhecido vira rótulo neutro em vez de derrubar a tela. */
  resultado: string;
  /** Peças que ENTRARAM no estoque nesta tentativa. Sempre 0 no errado. */
  quantidade: number;
  /** O código da caixa que nasceu daqui. `null` no errado e no item que não é
   *  etiquetado. */
  unidadeCodigo: string | null;
  defeitos: string[];
  obs: string | null;
  conferidoEm: string;
  /** Qual tentativa desta atividade é esta linha (1 = a primeira) e quantas
   *  existem no total. `null` quando a contagem não pôde ser apurada — a tela
   *  então não numera, em vez de numerar errado. */
  tentativa: number | null;
  tentativas: number | null;
}

export interface RespostaHistorico {
  conferencias: LinhaHistorico[];
  proximoCursor: string | null;
  qcDesligado: boolean;
}

/**
 * A frase que o gerente lê quando o servidor recusou a conferência.
 *
 * Cada código ganha frase própria porque cada um pede uma AÇÃO diferente:
 * `conferente_e_executor` é a regra da casa (chame outra pessoa, não tente de
 * novo), `item_nao_encontrado` é cadastro (o produto não existe com esse nome),
 * `schema_desatualizado` é banco (não adianta insistir). Um "erro ao salvar"
 * genérico manda todo mundo tentar de novo pra sempre.
 */
export function mensagemDeErroDeConferencia(codigo: string | null | undefined): string {
  switch (codigo) {
    case "conferente_e_executor":
      return "Você não pode conferir o próprio trabalho. Quem confere tem de ser outra pessoa.";
    // A conferência é binária. Este código só aparece se a tela mandar outra
    // coisa (versão velha em cache depois de um deploy, por exemplo) — a frase
    // manda recarregar em vez de "tente de novo", que tentaria pra sempre.
    case "resultado_invalido":
      return "Só existe certo ou errado. Recarregue a página e escolha de novo.";
    // Aprovar exige saber QUANTAS peças entram, e esse número vem de quem
    // produziu (não do gerente). Sem ele a caixa nasceria vazia.
    case "quantidade_indefinida":
      return "A atividade não diz quantas peças foram feitas, então não há o que dar entrada. Peça pra quem produziu informar a quantidade ao concluir — ou marque como errado, que devolve o trabalho pra ela.";
    case "defeito_invalido":
      return "Um dos defeitos marcados não existe no sistema. Desmarque e tente de novo.";
    case "atividade_nao_encontrada":
      return "Esta atividade não existe mais no sistema.";
    case "atividade_ja_conferida":
      return "Esta atividade já foi conferida por alguém. Atualize a fila pra ver como ficou.";
    case "item_nao_encontrado":
      return "Este produto não está no catálogo com esse nome, então não há onde dar entrada. Avise quem cuida do catálogo.";
    // Aprovou sem dizer EM QUE item a produção entra. Não é cadastro errado: a
    // atividade nasceu só com a tarefa em texto, e quem confere é quem sabe que
    // "Montar alavancas" vira "Alavanca" no catálogo.
    case "destino_nao_escolhido":
      return "Falta dizer em qual item do catálogo estas peças entram. Escolha o destino e confirme de novo — marcar como errado não precisa de destino.";
    // Não há UNIQUE em `estoque_itens.nome`: duas linhas que diferem só por
    // maiúscula recebiam a caixa de forma não determinística — hoje numa,
    // amanhã na outra. Recusar com uma frase acionável é melhor que sortear.
    case "nome_ambiguo":
      return "Há mais de um item no catálogo com este nome, então não dá pra saber em qual dar entrada. Junte ou renomeie os itens duplicados no Catálogo — marcar como errado continua valendo.";
    case "schema_desatualizado":
      return "O controle de qualidade ainda não foi ligado no banco — nada foi gravado. Peça pra rodarem supabase/estoque_conferencias.sql.";
    case "forbidden":
      return "Você não tem permissão pra conferir. Peça a liberação do Estoque em Permissões.";
    // O middleware devolve isto quando a sessão caiu. Sem frase própria a
    // pessoa lê "tente de novo" e tenta pra sempre, porque tentar não resolve.
    case "unauthorized":
      return "Sua sessão expirou e nada foi gravado. Recarregue a página e entre de novo.";
    case "dados_invalidos":
      return "Faltou alguma informação. Escolha certo ou errado e confirme de novo.";
    default:
      return "O sistema recusou esta conferência e nada foi gravado. Tente de novo; se repetir, avise o suporte.";
  }
}

/**
 * A frase de quando PREPARAR o item pra etiqueta não deu certo.
 *
 * Separada da conferência porque a ação é outra e o desfecho também: aqui nada
 * foi conferido, o que falhou foi ligar a etiqueta no item. Dizer "a
 * conferência foi recusada" mandaria o gerente procurar uma caixa que não tem
 * problema nenhum.
 *
 * Quando o servidor manda a frase por item (`resultados[].erro` — a guarda do
 * banco escreve em português), é ELA que aparece; isto aqui é o resto.
 */
export function mensagemDeErroDePreparo(codigo: string | null | undefined): string {
  switch (codigo) {
    case "forbidden":
      return "Você não tem permissão pra preparar item pra etiqueta. Peça o ajuste de estoque em Permissões, ou chame quem cuida do galpão.";
    case "schema_desatualizado":
      return "As unidades etiquetadas ainda não existem no banco. Peça pra rodarem supabase/estoque_hierarquia_unidades.sql — nada foi mudado.";
    case "unauthorized":
      return "Sua sessão expirou e nada foi preparado. Recarregue a página e entre de novo.";
    case "dados_invalidos":
      return "O sistema não entendeu qual item preparar. Feche e abra a conferência de novo.";
    default:
      return "Não deu pra preparar este item agora, e nada foi mudado no estoque. Tente de novo; se repetir, avise o suporte.";
  }
}
