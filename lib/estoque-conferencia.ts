// ── Conferência da produção: CERTO ou ERRADO ─────────────────────────────────
// O ato único que fecha o ciclo do galpão. A pessoa bipou a caixa de material
// limpo no COMEÇO do trabalho (ela saiu do estoque naquele momento, amarrada à
// atividade — ver `atividadeId` em lib/estoque-baixa.ts), montou, e concluiu
// dizendo QUANTAS peças fez. O gerente vai até a caixa pronta e diz só isto:
//
//   CERTO  → nasce UMA etiqueta (a caixa lacrada) com a quantidade que a
//            PESSOA registrou ao concluir, o estoque recebe automaticamente e
//            a atividade fecha. Se o item ainda não é etiquetado, ele passa a
//            ser aqui mesmo — quando dá pra fazer isso sem perder saldo, e
//            quem confere pode ajustar. Quando não dá (pilha antiga, granel),
//            a aprovação soma na contagem como sempre e a resposta diz o que
//            fazer pra sair papel da próxima vez (`preparo`); ver
//            lib/estoque-etiquetavel.ts, que é a regra.
//   ERRADO → não entra nada e a atividade REABRE pra pessoa refazer, com os
//            defeitos marcados. O material de entrada já saiu do estoque lá no
//            começo, então a perda se contabiliza sozinha — ninguém lança nada.
//
// Uma função só, chamada das duas rotas (web e tablet) — se admitir estoque e
// fechar a atividade fossem dois passos soltos, alguém faria um e esqueceria o
// outro (é literalmente o problema que esta feature existe pra resolver).
//
// Mesma família de lib/estoque-baixa.ts e lib/recebimento.ts: toca banco (ao
// contrário de lib/estoque-qualidade.ts, que é puro).
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resultadoValido, defeitoValido, textoDaReprovacao, type ResultadoKey } from "@/lib/estoque-qualidade";
import { gerarUnidades, schemaDesatualizado, ErroSchemaDesatualizado } from "@/lib/estoque-unidades-gerar";
import { estadoDeEtiqueta, type EstadoEtiqueta } from "@/lib/estoque-etiquetavel";
import { padraoDeNomeExato, umItemPeloNome, ErroNomeAmbiguo, TETO_NOMES } from "@/lib/estoque-nome";
import { notificar } from "@/lib/notificacoes";
import { liberarEsperasDoItem } from "@/lib/producao-liberacao";
import { baixaPelaFicha } from "@/lib/producao-em-cadeia";

export { ErroNomeAmbiguo };

export { ErroSchemaDesatualizado };

export class ErroResultadoInvalido extends Error { constructor() { super("resultado_invalido"); } }
export class ErroDefeitoInvalido extends Error { constructor() { super("defeito_invalido"); } }
// O único controle que existe aqui: quem confere não pode ser quem fez.
export class ErroConferenteEExecutor extends Error { constructor() { super("conferente_e_executor"); } }
export class ErroAtividadeNaoEncontrada extends Error { constructor() { super("atividade_nao_encontrada"); } }
// Segunda APROVAÇÃO pra mesma atividade (dois toques, dois gestores na mesma
// caixa) — o operationId da rota já cobre o retry de rede; isto cobre a
// duplicata genuína, que dobraria peça no estoque se deixasse passar.
// Reprovação repetida é legítima e NÃO cai aqui: é o refazer.
export class ErroAtividadeJaConferida extends Error { constructor() { super("atividade_ja_conferida"); } }
export class ErroItemNaoEncontrado extends Error { constructor() { super("item_nao_encontrado"); } }
// Aprovou sem dizer EM QUE item a produção entra. Não é erro de cadastro nem
// de nome: a atividade nasceu só com a tarefa em texto ("Montar alavancas"), e
// quem confere é quem sabe que aquilo vira "Alavanca" no catálogo.
export class ErroDestinoNaoEscolhido extends Error { constructor() { super("destino_nao_escolhido"); } }
// Aprovar exige saber QUANTAS peças entram — é a quantidade que a pessoa
// registrou ao concluir. Sem ela (e sem alvo) a caixa nasceria vazia, e o
// `check (quantidade > 0)` do banco recusaria a etiqueta depois de a
// conferência já estar gravada.
export class ErroQuantidadeIndefinida extends Error { constructor() { super("quantidade_indefinida"); } }

export interface RegistrarConferenciaInput {
  atividadeId: string;
  /**
   * EM QUAL ITEM DO CATÁLOGO esta produção entra, escolhido por quem confere.
   *
   * A atividade quase nunca aponta um item: ela nasce com uma tarefa em texto
   * ("Montar alavancas") e uma categoria, porque quem lança o trabalho não
   * conhece o catálogo de 192 linhas. Exigir o vínculo na CRIAÇÃO foi o que
   * produziu 103 atividades concluídas que a fila descartava (ver
   * lib/estoque-fila-conferencia.ts) — o vínculo virou parte da conferência.
   *
   * Só a APROVAÇÃO precisa dele: reprovar não toca no estoque, então segue sem
   * destino nenhum. Quando vem nulo, o item é resolvido por `produto_nome` como
   * sempre foi — o caminho antigo continua de pé.
   */
  destinoId?: string | null;
  /** 'certo' ou 'errado'. Não há meio termo — ver lib/estoque-qualidade.ts. */
  resultado: ResultadoKey | string;
  /** Por que estava errado. Ignorado (zerado) no 'certo'. */
  defeitos: string[];
  obs: string | null;
  /** Nunca vem do corpo da requisição sem checar — resolvido por
   *  buscarOperadorAtivo antes de chegar aqui, igual ao resto do device auth. */
  conferidoPorId: string;
  conferidoPorNome: string;
  /** Quando a conferência de fato ACONTECEU no aparelho — default agora(). */
  ocorridoEm: string | null;
  /**
   * Quem confere tem `estoque:ajustar` (ou papel do galpão)?
   *
   * Só isto libera LIGAR a etiquetagem de um item no meio da aprovação
   * (`converter_agora`). A conferência roda sob `estoque:itens`, que hoje é só
   * VER, e a rota do tablet não checa poder nenhum — sem esta pergunta,
   * aprovar viraria a porta lateral que /api/estoque/unidades/preparar fecha de
   * propósito. Sem poder, o item cai em `precisa_preparo`: a aprovação segue
   * somando na contagem e a resposta diz a quem pedir.
   *
   * Nunca vem do corpo da requisição — as duas rotas resolvem contra o perfil.
   */
  podeAjustar?: boolean;
}

export interface EtiquetaConferencia {
  codigo: string;
  /**
   * A unidade (caixa) que este código representa.
   *
   * Só o CÓDIGO voltava, e o registro de impressão (`etiqueta_impressoes`)
   * gravava `unidade_id: null` — a coluna do livro de impressões era sempre
   * nula, embora a unidade existisse e estivesse amarrada à conferência. Dava
   * pra saber que um código foi impresso, não pra ir da etiqueta até a caixa e
   * até a conferência que a criou.
   */
  unidadeId?: string | null;
  nome: string;
  corDimensoes?: string;
  /** Peças DENTRO desta caixa — é o número que vai impresso na etiqueta. */
  quantidade: number;
  local: string;
  localDetalhe?: string;
  responsavel: string;
  data: string;
}

export interface ResultadoConferencia {
  resultado: ResultadoKey;
  /** Peças que ENTRARAM no estoque. Sempre 0 no errado. */
  quantidade: number;
  /** O código da caixa que nasceu — no máximo um. Vazio no errado. */
  unidades: string[];
  /** No máximo uma: a caixa é uma etiqueta só, valendo `quantidade` peças. */
  etiquetas: EtiquetaConferencia[];
  /** `true` quando o errado devolveu a atividade pra pessoa refazer. */
  reaberta: boolean;
  /**
   * Aprovou, entrou no estoque — e NÃO saiu etiqueta, porque o item ainda não é
   * etiquetado (pilha antiga) ou nunca vai ser (granel, fração). Presente só
   * nesses dois casos: quando a caixa nasce, não há nada a preparar.
   *
   * Não é erro nem recusa — a aprovação aconteceu. É o que a tela usa pra
   * mostrar a frase e, pra quem pode ajustar, oferecer o gesto de preparar o
   * item (POST /api/estoque/unidades/preparar). Sem isto o item some do mundo
   * das etiquetas em silêncio, que é exatamente como 219 itens ficaram sem
   * nenhuma.
   */
  preparo?: {
    estado: EstadoEtiqueta;
    motivo: string;
    /**
     * Contagem ANTES desta aprovação — é a pilha que precisa virar papel, e o
     * número que o gesto de preparo oferece ("uma caixa de 191" ou "191
     * etiquetas"). Depois de somar já não serve: ninguém prepara o que acabou
     * de entrar sem saber o que já havia.
     */
    quantidade: number;
    /** Código da unidade ("un", "kg"), pra tela escrever "191 unidades". */
    unidade: string | null;
    /**
     * Quem preparar. A tela só conhece o item quando ELA escolheu o destino —
     * na atividade que já vinha com `produto_nome`, o item foi resolvido aqui
     * dentro, e sem estes dois campos o gesto não teria em que item mexer.
     */
    itemId: string;
    itemNome: string;
  };
  /**
   * O que esta aprovação TIROU do estoque pela ficha técnica — só as linhas
   * com o toggle "desconta" ligado (por padrão nenhuma). Ausente quando nada
   * foi descontado nem pulado.
   */
  baixaFicha?: {
    /** Saiu do estoque. `saldo` é o que sobrou; `faltou` > 0 quer dizer que o
     *  estoque dizia ter menos do que a produção gastou — a contagem estava errada. */
    descontados: { nome: string; quantidade: number; saldo: number; faltou: number }[];
    /** Não saiu, com o porquê (item etiquetado sai por bipe, não por conta). */
    pulados: { nome: string; motivo: string }[];
  };
}

interface ItemRow {
  id: string;
  nome: string;
  serializado: boolean;
  quantidade: number | null;
  /** Pesa na decisão da etiqueta: kg/L/m nunca cabem numa caixa de `int > 0`. */
  unidade: string | null;
  local_id: string | null;
  cor: string | null;
  largura_mm: number | null;
  altura_mm: number | null;
}

// "Branco · 2750×1840" — omite a parte que faltar (item sem cor, ou sem as
// duas dimensões) em vez de imprimir "· ×" na etiqueta.
//
// Exportada porque a REIMPRESSÃO (app/api/estoque/unidades/etiqueta) tem de
// montar exatamente a mesma etiqueta: se cada lado montasse a sua, a segunda
// via da caixa sairia diferente da primeira, e etiqueta que não bate com a
// anterior é etiqueta em que ninguém confia.
export function corDimensoesDoItem(item: Pick<ItemRow, "cor" | "largura_mm" | "altura_mm">): string | undefined {
  const partes: string[] = [];
  if (item.cor) partes.push(item.cor);
  if (item.largura_mm != null && item.altura_mm != null) {
    partes.push(`${Math.round(item.largura_mm)}×${Math.round(item.altura_mm)}`);
  }
  return partes.length ? partes.join(" · ") : undefined;
}

/**
 * Registra a conferência de UMA atividade de produção. Em ORDEM, tudo o que
 * segue roda uma vez só por conferência (a rota do tablet garante isso por
 * `operationId`; ver app/api/estoque/device/conferencia/route.ts):
 *
 *  1. Valida `resultado` e cada `defeito` contra o catálogo fechado.
 *  2. Recusa quando quem confere é quem fez.
 *  3. Recusa a segunda APROVAÇÃO da mesma atividade (reprovar de novo pode).
 *  4. Grava a conferência (histórico — sobrevive a uma falha no passo 6).
 *  5. No CERTO: gera a caixa (uma etiqueta valendo N peças) — ligando a
 *     etiquetagem na hora quando o item está zerado, é contável e quem confere
 *     pode ajustar — ou soma na contagem do item que ainda não é etiquetado,
 *     devolvendo em `preparo` o que fazer. No ERRADO: não toca no estoque. Se o
 *     estoque NÃO receber, a conferência do passo 4 é desfeita — uma aprovação
 *     gravada tranca a atividade pra sempre (ver `desfazerConferencia`).
 *  6. Fecha a atividade (certo) ou REABRE pra refazer (errado).
 */
export async function registrarConferencia(input: RegistrarConferenciaInput): Promise<ResultadoConferencia> {
  if (!resultadoValido(input.resultado)) throw new ErroResultadoInvalido();
  const resultado: ResultadoKey = input.resultado;
  const certo = resultado === "certo";

  // Defeito só existe no errado: no certo não há o que marcar, por definição.
  // Zerar (em vez de recusar) evita que um chip esquecido na tela derrube uma
  // aprovação legítima.
  const defeitos = certo ? [] : input.defeitos ?? [];
  if (defeitos.some((d) => !defeitoValido(d))) throw new ErroDefeitoInvalido();

  const db = createSupabaseAdminClient();

  const { data: atividadeRow, error: eAtiv } = await db
    .from("atividades")
    .select("para_id,para_nome,produto_nome,tarefa,quantidade_alvo,quantidade_feita,status")
    .eq("id", input.atividadeId)
    .maybeSingle();
  if (eAtiv) throw new Error(eAtiv.message);
  if (!atividadeRow) throw new ErroAtividadeNaoEncontrada();
  const atividade = atividadeRow as {
    para_id: string; para_nome: string; produto_nome: string | null; tarefa: string | null;
    quantidade_alvo: number; quantidade_feita: number; status: string;
  };

  // 2) O único controle que existe aqui.
  if (atividade.para_id === input.conferidoPorId) throw new ErroConferenteEExecutor();

  // 3) Já APROVADA antes (por outra requisição, outro operationId)?
  //
  // O erro NÃO pode ser engolido aqui. `data` vem `null` tanto quando não há
  // conferência quanto quando a consulta falhou, e as duas leituras levam a
  // caminhos opostos: a primeira manda seguir, a segunda não sabe de nada. Um
  // timeout ou uma queda de conexão neste SELECT fazia a duplicata passar
  // direto — a MESMA caixa entrava no estoque duas vezes.
  //
  // O filtro por `resultado = 'certo'` é o mesmo do índice único PARCIAL do
  // banco (supabase/estoque_conferencias.sql): reprovação repetida é o
  // refazer, e travar isso travaria metade do ciclo.
  //
  // Sem a tabela (o SQL ainda não rodou) o erro é `schemaDesatualizado` e vira
  // 409/503 `schema_desatualizado`, com frase pronta nos dois clientes — em vez
  // de seguir e estourar no INSERT três consultas depois.
  const { data: aprovada, error: eDup } = await db
    .from("estoque_conferencias")
    .select("id")
    .eq("atividade_id", input.atividadeId)
    .eq("resultado", "certo")
    .limit(1)
    .maybeSingle();
  if (eDup) { if (schemaDesatualizado(eDup)) throw new ErroSchemaDesatualizado(); throw new Error(eDup.message); }
  if (aprovada) throw new ErroAtividadeJaConferida();

  // O item é resolvido por NOME (igual lib/requisicoes.ts) — a atividade não
  // guarda item_id, só produto_nome.
  //
  // Duas armadilhas fechadas aqui, as duas do mesmo `ilike`:
  //
  //  · o nome ia CRU, e `ilike` é LIKE: "ADESIVO 100% PP" virava o padrão
  //    "ADESIVO 100" + qualquer coisa (e `_` casa um caractere qualquer). A
  //    aprovação dava entrada no primeiro item que casasse. Agora o padrão vai
  //    escapado e o casamento é refeito em JavaScript (lib/estoque-nome.ts).
  //  · `.limit(1)` escondia a DUPLICATA. Não há UNIQUE em `estoque_itens.nome`,
  //    então duas linhas que diferem por maiúscula recebiam estoque de forma
  //    não determinística — hoje numa, amanhã na outra. Pedir várias e recusar
  //    quando mais de uma casa (`ErroNomeAmbiguo`) troca "deposita ao acaso"
  //    por uma frase que diz o que consertar.
  //
  // No ERRADO o item é só enfeite do histórico: reprovar não depende do
  // catálogo, e recusar a reprovação por causa de um nome que não casa deixaria
  // a caixa errada presa na fila pra sempre. Por isso a ambiguidade só derruba
  // a APROVAÇÃO — no errado o item vira `null` e a reprovação segue.
  //
  // O DESTINO ESCOLHIDO NA HORA ganha do nome. Quem confere está olhando a
  // caixa e diz "isto é Alavanca"; o id vem de uma lista real do catálogo, então
  // não há nome ambíguo, casamento aproximado nem cadastro pra corrigir antes.
  // O caminho por nome continua para as atividades que já nasciam vinculadas.
  const COLUNAS_ITEM = "id,nome,serializado,quantidade,unidade,local_id,cor,largura_mm,altura_mm";
  let item: ItemRow | null = null;
  if (input.destinoId) {
    const { data: escolhido, error: eEscolhido } = await db
      .from("estoque_itens")
      .select(COLUNAS_ITEM)
      .eq("id", input.destinoId)
      .maybeSingle();
    if (eEscolhido) {
      if (schemaDesatualizado(eEscolhido)) throw new ErroSchemaDesatualizado();
      throw new Error(eEscolhido.message);
    }
    // Item apagado do catálogo entre a tela carregar e o toque confirmar. Sem
    // esta linha o `certo` seguiria com item nulo e cairia no
    // `item_nao_encontrado` genérico, que manda arrumar um nome que ninguém
    // digitou.
    if (!escolhido) throw new ErroItemNaoEncontrado();
    item = escolhido as ItemRow;
  } else if (atividade.produto_nome) {
    const { data: itemRows, error: eItem } = await db
      .from("estoque_itens")
      .select(COLUNAS_ITEM)
      .ilike("nome", padraoDeNomeExato(atividade.produto_nome))
      .limit(TETO_NOMES);
    if (eItem) { if (schemaDesatualizado(eItem)) throw new ErroSchemaDesatualizado(); throw new Error(eItem.message); }
    try {
      item = umItemPeloNome((itemRows ?? []) as ItemRow[], atividade.produto_nome);
    } catch (e) {
      if (!(e instanceof ErroNomeAmbiguo)) throw e;
      if (certo) throw e;
      item = null;
    }
  }
  // Aprovar sem NADA que diga onde a peça entra (a atividade não aponta produto
  // e ninguém escolheu destino) é o caso mais comum das 103 atividades órfãs, e
  // ele tem frase própria: "escolha o item" é uma ação, "este produto não está
  // no catálogo com esse nome" manda arrumar um nome que ninguém digitou.
  if (certo && !item && !input.destinoId && !atividade.produto_nome) throw new ErroDestinoNaoEscolhido();
  if (certo && !item) throw new ErroItemNaoEncontrado();

  // Quantas peças entram: o que a PESSOA registrou ao concluir. O gerente não
  // digita quantidade neste fluxo — ele diz certo ou errado, e a caixa nasce
  // com o que foi produzido. `quantidade_alvo` é a rede pra quem concluiu sem
  // informar nada (o campo nasce 0), senão a caixa nasceria vazia.
  const feita = Math.max(0, Math.trunc(Number(atividade.quantidade_feita) || 0));
  const alvo = Math.max(0, Math.trunc(Number(atividade.quantidade_alvo) || 0));
  const quantidade = certo ? (feita > 0 ? feita : alvo) : 0;
  if (certo && quantidade <= 0) throw new ErroQuantidadeIndefinida();

  let local: { nome: string; codigo: string } | null = null;
  if (certo && item?.local_id) {
    const { data: localRow } = await db.from("estoque_locais").select("nome,codigo").eq("id", item.local_id).maybeSingle();
    if (localRow) local = localRow as { nome: string; codigo: string };
  }

  // 4) Grava a conferência ANTES de mexer em estoque/atividade — o histórico
  // de "o que o gestor viu" existe mesmo se o passo 5 falhar no meio.
  const conferidoEm = input.ocorridoEm || new Date().toISOString();
  const { data: gravada, error: eConf } = await db.from("estoque_conferencias").insert({
    atividade_id: input.atividadeId,
    item_id: item?.id ?? null,
    executor_id: atividade.para_id,
    executor_nome: atividade.para_nome,
    conferido_por_id: input.conferidoPorId,
    conferido_por_nome: input.conferidoPorNome,
    resultado,
    quantidade,
    defeitos,
    obs: input.obs,
    conferido_em: conferidoEm,
  }).select("id").maybeSingle();
  if (eConf) {
    if (schemaDesatualizado(eConf)) throw new ErroSchemaDesatualizado();
    // 23505 = o índice único PARCIAL de `atividade_id` where resultado='certo'
    // (supabase/estoque_conferencias.sql) barrou uma segunda APROVAÇÃO da mesma
    // atividade. É a duplicata que a checagem lá em cima tenta pegar, chegando
    // pela janela entre o SELECT e este INSERT — dois gestores na mesma caixa,
    // ou o reenvio da fila do tablet junto com o toque na web. Mesma resposta do
    // caminho já conhecido (409 `atividade_ja_conferida`, com frase pronta nos
    // dois clientes), nunca um 500 com texto de constraint do Postgres na cara
    // de quem confere.
    if ((eConf as { code?: string }).code === "23505") throw new ErroAtividadeJaConferida();
    throw new Error(eConf.message);
  }
  const conferenciaId = (gravada as { id?: string } | null)?.id ?? null;

  /**
   * Desfaz a conferência quando o estoque NÃO recebeu nada.
   *
   * Gravar antes de mexer no estoque (passo 4) existe pra o histórico do que o
   * gestor viu sobreviver a uma falha no meio. Só que uma APROVAÇÃO gravada é
   * exatamente o que tranca a atividade: a checagem do passo 3 e o índice único
   * parcial do banco recusam a segunda aprovação. Se a caixa não chegou a
   * nascer, a linha não é histórico — é uma aprovação que diz "50 peças
   * entraram" quando nenhuma entrou, e que impede pra sempre a tentativa que
   * faria as 50 entrarem de verdade. A atividade fica `estoque_lancado = false`
   * com aprovação gravada: sai da fila de pendentes, vira só o contador
   * `travadas`, e não há tela no sistema que a destrave.
   *
   * O caminho que torna isso rotina e não azar: `gerarUnidades` grava
   * `estoque_unidades.quantidade` quando a caixa vale mais de uma peça, e essa
   * coluna vem de SQL que roda NA MÃO. Num banco onde `estoque_conferencias` já
   * existe e a coluna da caixa ainda não — rodar `estoque_conferencias.sql`
   * sozinho é isso —, TODA aprovação de caixa com mais de uma peça caía aqui.
   *
   * Só vale ENQUANTO nada entrou. Depois que a unidade existe, apagar liberaria
   * uma segunda aprovação e uma SEGUNDA caixa: trancado é ruim, contado duas
   * vezes é pior. Por isso o `try` fecha antes de a etiqueta nascer.
   *
   * Falha no próprio delete é engolida: o erro que interessa a quem confere é o
   * original (é ele que diz o que fazer), e o desfecho sem o delete é o de
   * antes, não um pior.
   */
  async function desfazerConferencia(): Promise<void> {
    if (!conferenciaId) return;
    try { await db.from("estoque_conferencias").delete().eq("id", conferenciaId); } catch { /* ver acima */ }
  }

  // 5) Só o CERTO entra no estoque.
  const unidades: string[] = [];
  const etiquetas: EtiquetaConferencia[] = [];
  let unidadeId: string | null = null;
  let preparo: ResultadoConferencia["preparo"];

  if (certo && item) {
    // Em que pé o item está diante da etiqueta — a regra inteira mora em
    // lib/estoque-etiquetavel.ts, com o porquê de cada estado. Aqui só se
    // OBEDECE a ela, com uma ressalva de permissão: ligar a etiquetagem no meio
    // da aprovação é escrever no cadastro, e a conferência roda sob uma chave de
    // leitura. Sem `podeAjustar`, `converter_agora` vira `precisa_preparo` — a
    // aprovação continua igual, só não converte nada por conta própria.
    const decisao = estadoDeEtiqueta(item);
    const semPoder = decisao.estado === "converter_agora" && !input.podeAjustar;
    const estado: EstadoEtiqueta = semPoder ? "precisa_preparo" : decisao.estado;
    const motivo = semPoder
      ? "Este item ainda não é etiquetado, e preparar item pra etiqueta exige permissão de ajuste de estoque. Peça a quem cuida do estoque pra prepará-lo — a aprovação continua somando na contagem enquanto isso."
      : decisao.motivo;
    const cunhaCaixa = estado === "ja_etiquetado" || estado === "converter_agora";

    try {
      if (cunhaCaixa) {
        if (estado === "converter_agora") {
          // Item zerado e contável: passa a ser etiquetado AGORA, antes de a
          // caixa nascer (gerarUnidades recusa item não serializado). Sem saldo
          // na linha, a guarda (a) do banco — que barra ligar a serialização de
          // quem tem pilha e nenhuma etiqueta — deixa passar, e não há número
          // pra truncar. Se o passo seguinte falhar, o item fica etiquetado e
          // vazio: é o estado que a próxima tentativa quer de qualquer forma.
          const { error: eSerie } = await db
            .from("estoque_itens")
            .update({ serializado: true, updated_at: new Date().toISOString() })
            .eq("id", item.id);
          if (eSerie) {
            if (schemaDesatualizado(eSerie)) throw new ErroSchemaDesatualizado();
            throw new Error(eSerie.message);
          }
        }
        // UMA etiqueta valendo `quantidade` peças — a caixa lacrada. Gerar N
        // etiquetas pra N peças é o que ninguém faz no galpão: são 50 folhas
        // dentro de uma caixa só, com um código só colado por fora.
        const [unidade] = await gerarUnidades({
          item_id: item.id,
          quantidade: 1,
          pecasPorUnidade: quantidade,
          origem: "producao",
          // criado_por é quem FEZ a peça, não quem conferiu — mesma regra da
          // etiqueta logo abaixo.
          criado_por_id: atividade.para_id,
          criado_por: atividade.para_nome,
        });
        if (unidade) {
          unidades.push(unidade.codigo);
          unidadeId = unidade.id;
          // Etiqueta montada pelo SERVIDOR — o leitor só recebia código antes
          // disso, e por não saber o item nem a localização imprimia o SKU cru.
          etiquetas.push({
            codigo: unidade.codigo,
            unidadeId: unidade.id,
            nome: item.nome,
            corDimensoes: corDimensoesDoItem(item),
            quantidade,
            local: local?.codigo ?? "",
            localDetalhe: local?.nome,
            // Responsável é quem FEZ (não quem conferiu) — a etiqueta acompanha
            // a peça, e o que importa nela é a autoria do trabalho.
            responsavel: atividade.para_nome,
            data: conferidoEm,
          });
        }
      } else {
        // Pilha antiga (`precisa_preparo`) ou item que nunca vira etiqueta
        // (`nao_etiquetavel`): soma direto em `quantidade`, exatamente como
        // sempre fez. A produção NÃO pode parar por causa de um item que ainda
        // não foi preparado — o que muda é que a resposta passa a dizer isso em
        // vez de a etiqueta simplesmente não aparecer.
        const { error: eQtd } = await db
          .from("estoque_itens")
          .update({ quantidade: Math.max(0, (Number(item.quantidade) || 0) + quantidade), updated_at: new Date().toISOString() })
          .eq("id", item.id);
        if (eQtd) throw new Error(eQtd.message);
        preparo = {
          estado, motivo,
          quantidade: Math.max(0, Number(item.quantidade) || 0),
          unidade: item.unidade,
          itemId: item.id, itemNome: item.nome,
        };
      }
    } catch (e) {
      // Chegar aqui é: NADA entrou no estoque. Os dois ramos acima só falham
      // antes de escrever (ligar a etiquetagem estoura, a geração da caixa
      // estoura, ou o UPDATE da quantidade volta erro) — depois deles não há
      // mais nada que possa lançar. Ligar `serializado` sozinho não é entrada
      // de estoque: a linha continua zerada. Então a aprovação gravada no passo
      // 4 é uma trava sem contrapartida, e sai. Ver `desfazerConferencia`.
      await desfazerConferencia();
      throw e;
    }
  }

  // Amarra a caixa à conferência que a criou. Erro aqui é IGNORADO de
  // propósito: a etiqueta já existe e o estoque já recebeu, então estourar
  // agora faria o gerente ver "falhou" e conferir de novo — e a segunda
  // tentativa bateria no índice único, deixando a caixa no limbo. Perder o
  // vínculo é uma informação a menos no histórico; perder o resto é pior.
  if (unidadeId && conferenciaId) {
    await db.from("estoque_conferencias").update({ unidade_id: unidadeId }).eq("id", conferenciaId);
  }

  // 5b) A BAIXA PELA FICHA — o toggle "desconta" de cada linha. Depois da
  // entrada, e nunca capaz de desfazê-la: se a baixa falhar, a peça aprovada
  // continua no estoque e a resposta diz o que não saiu.
  const baixaFicha = certo && item
    ? await descontarPelaFicha(db, item, quantidade, input.atividadeId, atividade.para_nome)
    : undefined;

  // 6) Fecha (certo) ou REABRE (errado) a atividade.
  //
  // `estoque_lancado = true` é o carimbo de "esta já foi conferida": é ele que
  // tira a atividade da fila (as duas rotas de pendentes filtram por `false`) e
  // o único lugar do sistema que o escreve é aqui — concluir NÃO dá entrada no
  // estoque (lib/__tests__/estoque-entra-so-por-conferencia.test.ts).
  //
  // `concluida_at` é carimbado SÓ se a atividade ainda não estava concluída.
  // Na prática ela sempre está — a fila de conferência só lista
  // `status='concluida'` —, e sobrescrever trocaria a hora em que o OPERADOR
  // terminou pela hora em que o GESTOR conferiu. Como todo tempo do sistema é
  // `concluida_at - iniciada_at`, uma peça começada segunda 09:00 e terminada
  // 10:00, conferida quinta 14:00, passaria a dizer "levou 77h" na ficha de
  // quem produziu. Quando a CONFERÊNCIA aconteceu já está gravado em
  // `estoque_conferencias.conferido_em`, que é o lugar dela.
  //
  // Aprovando com destino escolhido, o vínculo VOLTA pra atividade: a partir
  // daqui ela sabe que "Montar alavancas" virou "Alavanca". Sem isso, a
  // escolha do gerente moraria só em `estoque_conferencias.item_id` e toda
  // tela que lê a atividade (Produção do dia, a ficha de quem produziu, a
  // própria fila) continuaria dizendo "sem produto" pra um trabalho que já tem
  // destino. Só preenche o que está VAZIO — sobrescrever um produto que a
  // atividade já tinha seria a conferência reescrevendo o que foi pedido.
  const fecha: Record<string, unknown> = certo
    ? {
        status: "concluida", quantidade_feita: quantidade, estoque_lancado: true,
        ...(item && !atividade.produto_nome ? { produto_nome: item.nome } : {}),
      }
    // Errado: volta pra bancada. `concluida_at` vira nulo porque o trabalho
    // NÃO está concluído — deixar o carimbo da tentativa reprovada faria a
    // atividade reaberta contar como terminada em todo cálculo de tempo, e
    // quem refizer vai carimbar de novo ao concluir (é o que o PATCH de
    // /api/atividades faz na transição de status).
    : { status: "em_andamento", estoque_lancado: false, concluida_at: null };
  if (certo && atividade.status !== "concluida") fecha.concluida_at = conferidoEm;
  const { error: eFecha } = await db
    .from("atividades")
    .update(fecha)
    .eq("id", input.atividadeId);
  if (eFecha) throw new Error(eFecha.message);

  // 7) REPROVOU: avisa quem produziu, com o motivo junto.
  //
  // Sem isto o errado era MUDO. A atividade voltava pra `em_andamento` e
  // reaparecia em /minhas-atividades como tarefa comum — sem selo de recusa,
  // sem os defeitos marcados, sem a observação que o gestor digitou. A pessoa
  // ia embora achando que tinha fechado e voltava no dia seguinte com uma
  // tarefa "em andamento" que jurava ter concluído, sem saber o que corrigir.
  // O módulo inteiro de Estoque não notificava ninguém, ao contrário da
  // reposição automática, que avisa quem recebe (lib/requisicoes.ts).
  //
  // DEPOIS do update de propósito: avisar antes de a atividade voltar mandaria
  // a pessoa pra uma tela onde não há nada pra refazer se o update falhar.
  // `notificar` é best-effort e nunca lança (tabela ausente → ignora), então
  // uma notificação que não sai não desfaz uma reprovação que já aconteceu.
  if (!certo) {
    await notificar({
      user_id: atividade.para_id,
      tipo: "tarefa",
      // A tarefa vem antes do "uma atividade" genérico: quase nenhuma atividade
      // tem produto, e "Uma atividade voltou pra refazer" não diz à pessoa QUAL
      // das cinco que ela concluiu hoje precisa ser refeita.
      titulo: `${atividade.produto_nome ?? atividade.tarefa ?? "Uma atividade"} voltou pra refazer`,
      corpo: textoDaReprovacao(defeitos, input.obs),
      link: "/minhas-atividades",
      de_nome: input.conferidoPorNome,
    });
  }

  // Estoque ENTROU (etiqueta cunhada ou soma direta) e a conferência inteira
  // deu certo: quem estava "aguardando_material" por este item pode andar.
  // NO FIM de propósito, e fire-and-forget: a liberação é derivada, nunca
  // derruba nem atrasa a conferência (o try mora dentro da função) — e rodar
  // no meio consumiria respostas fora de ordem em quem observa as escritas.
  if (certo && item) void liberarEsperasDoItem(item.id);

  return {
    resultado, quantidade, unidades, etiquetas, reaberta: !certo,
    ...(preparo ? { preparo } : {}),
    ...(baixaFicha ? { baixaFicha } : {}),
  };
}

/**
 * Tira do estoque o que a produção aprovada gastou, pela ficha do item — só as
 * linhas com o toggle "desconta" LIGADO (o padrão é nenhuma: decisão do dono).
 *
 * Por que aqui e não ao concluir: a peça só ENTRA no estoque na conferência
 * (lib/__tests__/estoque-entra-so-por-conferencia.test.ts). Descontar o
 * material na conclusão faria reprovação e refazer gastarem duas vezes.
 *
 * Três portas fechadas:
 *  · o que JÁ saiu por bipe nesta atividade (`baixa_atividade_id`) não sai de
 *    novo — é a outra porta de baixa, e as duas juntas tirariam em dobro;
 *  · item ETIQUETADO não tem saldo em número (quem conta é o gatilho das
 *    etiquetas, e o banco recusa escrever `quantidade` nele): fica em
 *    `pulados`, com o motivo — ele sai pelo bipe da caixa;
 *  · NUNCA lança. A aprovação já gravou e a peça já entrou; estourar agora
 *    faria o gerente conferir de novo e bater em "já conferida". Qualquer
 *    falha vira um `pulado` com o motivo.
 */
async function descontarPelaFicha(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  item: { id: string; nome: string },
  aprovadas: number,
  atividadeId: string,
  porNome: string | null,
): Promise<ResultadoConferencia["baixaFicha"]> {
  try {
    // Só as linhas LIGADAS. Sem a coluna (SQL não rodado) o erro cai no catch:
    // nada desconta, que é exatamente o padrão.
    const { data: linhas, error } = await db.from("ficha_tecnica")
      .select("componente_id,quantidade,desconta").eq("item_id", item.id).eq("desconta", true).limit(200);
    if (error || !linhas?.length) return undefined;

    const ids = [...new Set((linhas as { componente_id: string }[]).map((l) => l.componente_id))];
    const [{ data: comps }, { data: bip, error: eBip }] = await Promise.all([
      db.from("estoque_itens").select("id,nome,quantidade,serializado").in("id", ids).limit(200),
      // O que o bipe desta atividade já tirou. Sem a coluna, conjunto vazio.
      db.from("estoque_unidades").select("item_id").eq("baixa_atividade_id", atividadeId).limit(500),
    ]);
    const bipados = new Set(((eBip ? [] : bip ?? []) as { item_id: string }[]).map((u) => u.item_id));
    const porId = new Map<string, { id: string; nome: string; quantidade: number | null; serializado: boolean | null }>(
      ((comps ?? []) as { id: string; nome: string; quantidade: number | null; serializado: boolean | null }[]).map((c) => [c.id, c]),
    );

    const plano = baixaPelaFicha(aprovadas, (linhas as { componente_id: string; quantidade: number; desconta: boolean }[]).map((l) => ({
      componenteId: l.componente_id,
      nome: porId.get(l.componente_id)?.nome ?? "componente",
      quantidade: Number(l.quantidade) || 0,
      desconta: l.desconta,
    })), bipados);

    const descontados: NonNullable<ResultadoConferencia["baixaFicha"]>["descontados"] = [];
    const pulados: NonNullable<ResultadoConferencia["baixaFicha"]>["pulados"] = [];
    for (const b of plano) {
      const c = porId.get(b.componenteId);
      if (!c) { pulados.push({ nome: b.nome, motivo: "componente não existe mais no catálogo" }); continue; }
      if (c.serializado) { pulados.push({ nome: c.nome, motivo: "item etiquetado — sai pelo bipe da caixa" }); continue; }
      const antes = Math.max(0, Number(c.quantidade) || 0);
      const saldo = Math.max(0, antes - b.quantidade);
      const { error: eUpd } = await db.from("estoque_itens")
        .update({ quantidade: saldo, updated_at: new Date().toISOString() }).eq("id", c.id);
      if (eUpd) { pulados.push({ nome: c.nome, motivo: "o banco recusou a baixa" }); continue; }
      descontados.push({ nome: c.nome, quantidade: b.quantidade, saldo, faltou: Math.max(0, b.quantidade - antes) });
      // O rastro, no mesmo formato da entrada do tablet. Erro engolido pelo
      // mesmo motivo de lá: o saldo já mudou; perder a linha do histórico é
      // uma informação a menos, e repetir a baixa é número errado.
      await db.from("estoque_movimentos").insert({
        item_id: c.id, produto_nome: c.nome, delta: -b.quantidade,
        motivo: `baixa pela ficha · ${aprovadas} ${item.nome}`,
        origem: "atividade", por_nome: porNome,
      }).then(() => undefined, () => undefined);
    }
    return descontados.length || pulados.length ? { descontados, pulados } : undefined;
  } catch {
    return undefined;
  }
}
