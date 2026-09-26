// ── A porta de entrada da planilha ───────────────────────────────────────────
//
// O galpão controla estoque numa planilha há meses e vai continuar recebendo
// planilha de fornecedor. Isto NÃO é um script de carga de uma vez só: é a
// regra, pura e testável, de como uma lista colada vira decisão — o que é novo,
// o que é atualização, e o que ninguém deve tocar.
//
// Três coisas mandam no desenho:
//
// 1. CASAR POR NOME, SEM LIGAR PRA ACENTO, CAIXA OU ESPAÇO SOBRANDO. A atividade
//    e o recebimento resolvem produto POR NOME — dois itens chamados quase a
//    mesma coisa ("ROLO  KRAFT" com dois espaços e "Rolo Kraft") são veneno:
//    metade das baixas vai pra um, metade pro outro, e nenhum dos dois números
//    fecha. O `unique` do banco é literal e não pega nada disso.
// 2. O PLANO É CALCULADO ANTES E MOSTRADO. Ninguém aperta um botão que escreve
//    em 93 itens sem ver a lista. Por isso a saída daqui descreve mudança a
//    mudança ("estoque 0 → 229") em vez de já gravar.
// 3. ITEM SERIALIZADO TEM DONO. `quantidade` de item contado por etiqueta é
//    mantida por trigger; escrever nela é RECUSADO pelo banco
//    (`estoque_itens_guarda`). Aqui esse campo é tirado do plano e o item é
//    dito em voz alta, em vez de a importação inteira estourar no meio.
// 4. NA DÚVIDA ENTRE CRIAR E PERGUNTAR, PERGUNTA. Casar por nome é generoso
//    (acento, caixa, espaço), mas pontuação continua distinguindo item — e é aí
//    que mora o racha: "ROLO-KRAFT" entraria ao lado de "ROLO KRAFT" sem que o
//    `unique` literal do Postgres reclamasse. Por isso existe uma segunda chave,
//    a FROUXA (`chaveFrouxaDeNome`), usada só pra RECUSAR a criação e devolver a
//    decisão pro humano. Ela nunca casa item sozinha.
// 5. UNIDADE E FORNECEDOR PASSAM PELO MESMO VOCABULÁRIO DO RESTO DO SISTEMA.
//    Esta rota escreve DIRETO em `estoque_itens`, então as normalizações de
//    `/api/estoque/*` não a cobrem: sem chamar `normalizarUnidade` e
//    `normalizarFornecedor` daqui, a importação recria por uma porta lateral as
//    duas duplicatas que aquelas telas existem pra evitar.
//
// Nada aqui toca banco nem rede: a rota (app/api/estoque/importar) chama estas
// funções duas vezes com o MESMO texto — uma pra mostrar, outra pra gravar.

import { normalizarUnidade, UNIDADE_PADRAO } from "./estoque-unidade-compra";
import { normalizarFornecedor } from "./estoque-fornecedores-semelhanca";

/** Colunas que a planilha do galpão traz. Hierarquia NÃO está aqui de
 *  propósito: item importado nasce sem classificação e o dono decide depois
 *  (chutar por nome erra em silêncio, e ninguém revisa o que parece pronto). */
export type Campo = "nome" | "quantidade" | "qtd_minima" | "unidade" | "fornecedor";

export interface LinhaPlanilha {
  /** Número da linha no texto colado (1-based, contando o cabeçalho) — é o que
   *  a pessoa procura na planilha quando alguma linha é recusada. */
  linha: number;
  nome: string;
  quantidade: number | null;
  qtd_minima: number | null;
  unidade: string | null;
  fornecedor: string | null;
}

export interface ItemDoCatalogo {
  id: string;
  nome: string;
  serializado?: boolean | null;
  quantidade?: number | null;
  qtd_minima?: number | null;
  unidade?: string | null;
  fornecedor_id?: string | null;
}

export interface FornecedorDoCatalogo { id: string; nome: string }

// ── Casamento de nome ────────────────────────────────────────────────────────

/**
 * A chave pela qual dois nomes são "o mesmo item".
 *
 * Tira acento (NFD + corte das marcas de combinação), baixa a caixa e colapsa
 * QUALQUER corrida de espaço em um só — inclusive tabulação, quebra de linha e
 * o espaço-duro ( ) que o Excel adora colar junto. "ROLO  KRAFT" e
 * "Rolo Kraft" viram a mesma chave; "Café" e "cafe" também.
 *
 * O que ela NÃO faz: mexer em pontuação, plural ou abreviação. "MDF 6mm" e
 * "MDF 6 mm" continuam sendo dois itens — casar por palpite criaria fusão
 * silenciosa de itens diferentes, que é pior que a duplicata.
 */
export function chaveDeNome(nome: string | null | undefined): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // as marcas que o NFD separou do acento
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** O nome como ele deve ser GRAVADO: caixa e acento originais, mas sem espaço
 *  duplo nem sobra nas pontas. Um item novo chamado "ROLO  KRAFT" entraria com
 *  dois espaços e a busca por nome do recebimento nunca mais o acharia. */
export function nomeLimpo(nome: string): string {
  return nome.replace(/\s+/g, " ").trim();
}

/**
 * A chave FROUXA: só letras e números, na ordem. "ROLO-KRAFT", "ROLO – KRAFT",
 * "SIERRA(CERQUEIRA)" e "MDF 6mm" perdem a pontuação e o espaço.
 *
 * Ela NÃO casa item — quem casa é `chaveDeNome`, e de propósito, porque juntar
 * por palpite funde itens diferentes. Esta serve pra uma pergunta mais estreita
 * e mais perigosa: **estou prestes a CRIAR um item que só difere de um que já
 * existe por pontuação?** `lib/recebimento.ts` resolve item por `ilike("nome")`,
 * que é cego a caixa e a mais nada: com "ROLO KRAFT" e "ROLO-KRAFT" no catálogo,
 * metade das entradas vai pra um e metade pro outro, e nenhum dos dois números
 * fecha. O `unique` do Postgres é literal e deixa os dois entrarem.
 *
 * Como duas sequências idênticas de letras e números com pontuação diferente
 * praticamente nunca são produtos diferentes, a colisão vira uma linha RECUSADA
 * com o nome do item do catálogo junto — o humano decide qual grafia vale, em
 * vez de descobrir o racha três meses depois pelo estoque que não bate.
 */
export function chaveFrouxaDeNome(nome: string | null | undefined): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** A chave pela qual dois FORNECEDORES são o mesmo cadastro — a MESMA da tela
 *  de Fornecedores (`normalizarFornecedor`), que também ignora sufixo jurídico.
 *  Usar `chaveDeNome` aqui faria a importação criar "TINTA MÁGICA LTDA" ao lado
 *  de "TINTA MAGICA": o índice único é `lower(nome)` e não pega isso — seria
 *  recriar pela porta lateral exatamente a duplicata que aquela tela existe pra
 *  evitar. */
export const chaveDeFornecedor = (nome: string | null | undefined): string =>
  normalizarFornecedor(String(nome ?? ""));

// ── Números da planilha ──────────────────────────────────────────────────────

/**
 * Número como uma planilha brasileira escreve: "1.234,5", "1234,5", "229",
 * "12 un", "R$ 4,50". Devolve `null` pra célula vazia, traço ou lixo — e `null`
 * quer dizer "a planilha não falou disso", nunca "zere o campo".
 *
 * A regra dos separadores: se os dois aparecem, o ÚLTIMO é o decimal (é o que
 * distingue "1.234,5" de "1,234.5"). Só ponto e no formato de milhar
 * ("1.234") é milhar; qualquer outro ponto é decimal.
 */
export function parsearNumero(bruto: string | null | undefined): number | null {
  const cru = (bruto ?? "").trim();
  if (!cru) return null;
  const limpo = cru.replace(/[^\d,.-]/g, "");
  if (!limpo || !/\d/.test(limpo)) return null;

  const ultimaVirgula = limpo.lastIndexOf(",");
  const ultimoPonto = limpo.lastIndexOf(".");
  let normal: string;
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    const decimal = ultimaVirgula > ultimoPonto ? "," : ".";
    const milhar = decimal === "," ? "." : ",";
    normal = limpo.split(milhar).join("").replace(decimal, ".");
  } else if (ultimaVirgula >= 0) {
    normal = limpo.replace(/,/g, ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(limpo)) {
    normal = limpo.split(".").join(""); // "1.234" = mil duzentos e trinta e quatro
  } else {
    normal = limpo;
  }
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** Estoque não é negativo. Planilha com "-3" quer dizer "faltando 3", não
 *  "menos três na prateleira" — o banco guarda a prateleira. */
const naoNegativo = (n: number) => (n < 0 ? 0 : n);

// ── Leitura do texto colado ──────────────────────────────────────────────────

const SEP_LINHA = /\r\n|\r|\n/;

/**
 * Separador do arquivo. Excel copiado pra área de transferência vem com TAB;
 * CSV brasileiro vem com ponto e vírgula (justamente porque a vírgula é o
 * decimal); vírgula é o último recurso. A ordem é essa e não "o que aparece
 * mais": num arquivo com "1,5" em toda linha, a vírgula ganharia a contagem e
 * partiria os números ao meio.
 */
export function separadorDe(texto: string): string {
  const linha = texto.split(SEP_LINHA).find((l) => l.trim()) ?? "";
  const fora = semAspas(linha);
  if (fora.includes("\t")) return "\t";
  if (fora.includes(";")) return ";";
  if (fora.includes(",")) return ",";
  return "\t"; // uma coluna só: qualquer separador dá o mesmo resultado
}

/** O texto sem o conteúdo entre aspas — usado só pra escolher o separador, pra
 *  que um `;` dentro de "Fulano; Cia" não decida o formato do arquivo. */
function semAspas(linha: string): string {
  let fora = "";
  let dentro = false;
  for (const c of linha) {
    if (c === '"') { dentro = !dentro; continue; }
    if (!dentro) fora += c;
  }
  return fora;
}

/** Divide uma linha respeitando aspas duplas (o Excel cita todo campo que
 *  contém o separador, e `"" ` é a aspa escapada). */
export function dividirLinha(linha: string, sep: string): string[] {
  const out: string[] = [];
  let atual = "";
  let dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentro) {
      if (c === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i++; } else dentro = false;
      } else atual += c;
    } else if (c === '"') dentro = true;
    else if (c === sep) { out.push(atual); atual = ""; }
    else atual += c;
  }
  out.push(atual);
  return out.map((s) => s.trim());
}

/** Cabeçalhos exatos que já vimos. A lista é conveniência; quem faz o trabalho
 *  de verdade é a busca por pedaço abaixo, porque cabeçalho de planilha real
 *  quase nunca é a palavra seca ("QTD. MÍNIMA", "Estoque atual"). */
const ALIAS: Record<Campo, string[]> = {
  nome: ["nome", "item", "itens", "produto", "produtos", "descricao", "material", "materiais", "insumo", "mercadoria"],
  quantidade: ["quantidade", "qtd", "qtde", "estoque", "estoque atual", "saldo", "atual", "em estoque"],
  qtd_minima: ["minimo", "minima", "min", "estoque minimo", "ponto de reposicao", "reposicao", "ponto de pedido"],
  unidade: ["unidade", "un", "und", "unid", "uni", "medida", "unidade de medida"],
  fornecedor: ["fornecedor", "fornecedores", "fabricante", "marca", "onde comprar"],
};

/** Ordem das colunas quando a planilha não tem cabeçalho nenhum. É a ordem em
 *  que o dono descreveu a planilha do galpão. */
const POSICIONAL: Campo[] = ["nome", "quantidade", "qtd_minima", "unidade", "fornecedor"];

export function campoDoCabecalho(celula: string): Campo | null {
  const k = chaveDeNome(celula);
  if (!k) return null;
  for (const campo of Object.keys(ALIAS) as Campo[]) if (ALIAS[campo].includes(k)) return campo;
  // Por PEDAÇO, e a ordem importa: "quantidade mínima" tem que cair no mínimo,
  // não na quantidade — por isso o mínimo é testado primeiro.
  if (/minim|reposi|min\./.test(k)) return "qtd_minima";
  if (/quantidad|qtde|qtd|estoque|saldo/.test(k)) return "quantidade";
  if (/unidad|medida/.test(k)) return "unidade";
  if (/fornec|fabricant/.test(k)) return "fornecedor";
  if (/nome|item|produt|descri|material|insumo/.test(k)) return "nome";
  return null;
}

export interface Leitura {
  linhas: LinhaPlanilha[];
  /** A primeira linha era cabeçalho? Vira texto na tela: quem colou sem
   *  cabeçalho precisa saber que a ordem posicional foi assumida. */
  comCabecalho: boolean;
  /** Qual coluna virou qual campo — a tela mostra isso antes de gravar, senão
   *  a pessoa não tem como perceber que "mínimo" caiu no lugar do estoque. */
  colunas: Partial<Record<Campo, number>>;
  separador: string;
}

/**
 * Lê o texto colado/subido. Nunca lança: texto torto vira linha sem nome, e a
 * linha sem nome vira um problema NOMEADO no plano — estourar aqui deixaria a
 * pessoa com "erro ao importar" e nenhuma pista de qual linha.
 */
export function lerPlanilha(texto: string): Leitura {
  const separador = separadorDe(texto);
  const cruas = texto.split(SEP_LINHA);

  // Cabeçalho: só se a primeira linha com conteúdo tiver uma coluna de NOME
  // reconhecível. Sem essa exigência, uma planilha sem cabeçalho perderia o
  // primeiro item — ele viraria "cabeçalho" e sumiria calado.
  let idxCabecalho = -1;
  let colunas: Partial<Record<Campo, number>> = {};
  for (let i = 0; i < cruas.length; i++) {
    if (!cruas[i].trim()) continue;
    const celulas = dividirLinha(cruas[i], separador);
    const mapa: Partial<Record<Campo, number>> = {};
    celulas.forEach((c, j) => {
      const campo = campoDoCabecalho(c);
      if (campo && mapa[campo] === undefined) mapa[campo] = j;
    });
    // Duas colunas reconhecidas, ou uma coluna só cujo título é EXATAMENTE uma
    // das palavras de cabeçalho ("Nome", "Produto"). A exigência de duas existe
    // porque um item de verdade pode se chamar "Material 3"; a exceção de uma
    // existe porque a lista de nomes puxada do Excel vem com o título junto, e
    // sem ela o cabeçalho viraria um item chamado "Produto".
    const soCabecalho = celulas.length === 1 && ALIAS.nome.includes(chaveDeNome(celulas[0]));
    if (mapa.nome !== undefined && (Object.keys(mapa).length >= 2 || soCabecalho)) { idxCabecalho = i; colunas = mapa; }
    break; // só a primeira linha com conteúdo pode ser cabeçalho
  }
  const comCabecalho = idxCabecalho >= 0;
  if (!comCabecalho) POSICIONAL.forEach((campo, j) => { colunas[campo] = j; });

  const linhas: LinhaPlanilha[] = [];
  for (let i = 0; i < cruas.length; i++) {
    if (i === idxCabecalho) continue;
    const crua = cruas[i];
    if (!crua.trim()) continue; // linha em branco não é problema, é respiro
    const celulas = dividirLinha(crua, separador);
    const pega = (campo: Campo): string => {
      const j = colunas[campo];
      return j === undefined ? "" : (celulas[j] ?? "").trim();
    };
    const nome = pega("nome");
    const quantidade = parsearNumero(pega("quantidade"));
    const qtd_minima = parsearNumero(pega("qtd_minima"));
    const unidade = pega("unidade") || null;
    const fornecedor = pega("fornecedor") || null;
    // Linha só com separadores ("; ; ;") não tem nada dentro: não é erro de
    // ninguém, é rodapé de planilha.
    if (!nome && quantidade === null && qtd_minima === null && !unidade && !fornecedor) continue;
    linhas.push({ linha: i + 1, nome, quantidade, qtd_minima, unidade, fornecedor });
  }
  return { linhas, comCabecalho, colunas, separador };
}

// ── O plano ──────────────────────────────────────────────────────────────────

export type MotivoDescarte = "sem_nome" | "duplicada_no_arquivo" | "nome_ambiguo" | "quase_duplicata";

export interface Descarte {
  linha: number;
  nome: string;
  motivo: MotivoDescarte;
  /** Frase pronta, em português, dizendo o que fazer. */
  detalhe: string;
}

export interface CampoMudado {
  campo: "quantidade" | "qtd_minima" | "unidade" | "fornecedor";
  rotulo: string;
  de: string;
  para: string;
}

/** O que vai pro banco. `fornecedor` fica de fora de `campos` porque pode
 *  depender de um cadastro que ainda não existe — quem resolve o id é a rota,
 *  depois de criar os fornecedores que faltam. */
export interface Escrita {
  campos: Record<string, string | number>;
  fornecedor: string | null;
}

export interface ItemNovo {
  linha: number;
  /** Já limpo — é exatamente o que vai pra coluna `nome`. */
  nome: string;
  quantidade: number;
  qtd_minima: number;
  unidade: string;
  fornecedor: string | null;
  escrita: Escrita;
}

export interface ItemAtualizado {
  linha: number;
  id: string;
  /** O nome do BANCO. A importação nunca renomeia: casar "ROLO  KRAFT" com
   *  "Rolo Kraft" é pra achar o item, não pra rebatizá-lo pelo jeito que a
   *  planilha daquele fornecedor escreve. */
  nome: string;
  nomePlanilha: string;
  mudancas: CampoMudado[];
  /** Item contado por etiqueta: o estoque da planilha foi deixado de fora. */
  estoqueTravado: boolean;
  escrita: Escrita;
}

export interface ItemPulado {
  linha: number;
  id: string;
  nome: string;
  quantidadePlanilha: number | null;
  quantidadeSistema: number;
}

export interface Plano {
  novos: ItemNovo[];
  atualizados: ItemAtualizado[];
  /** Já batem com a planilha — nada a fazer. */
  iguais: { linha: number; nome: string }[];
  /** Serializados cuja única diferença era o estoque: nada sobrou pra gravar. */
  pulados: ItemPulado[];
  descartes: Descarte[];
  /** Fornecedores da planilha que ainda não existem no cadastro. */
  fornecedoresNovos: string[];
  /** Fornecedores que a planilha traz e a importação NÃO vai vincular (sem
   *  permissão de fornecedores, ou o cadastro nem existe neste banco). */
  fornecedoresIgnorados: string[];
  totalLinhas: number;
}

export interface OpcoesPlano {
  linhas: LinhaPlanilha[];
  itens: ItemDoCatalogo[];
  fornecedores?: FornecedorDoCatalogo[];
  /** Pode CRIAR fornecedor que ainda não existe? Quem só tem `estoque:itens`
   *  não pode — e sem isto a importação seria uma porta lateral pra criar
   *  cadastro que a tela de Fornecedores nega. */
  podeCriarFornecedor?: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/**
 * O plano inteiro, sem tocar em banco. Roda DUAS vezes com a mesma entrada: uma
 * pra mostrar na tela, outra na hora de gravar (recalculada do zero, contra o
 * catálogo daquele instante — confiar no plano que o navegador devolveu seria
 * aceitar escrita que ninguém conferiu).
 */
export function planejarImportacao({ linhas, itens, fornecedores = [], podeCriarFornecedor = false }: OpcoesPlano): Plano {
  // Índice do catálogo por chave de nome. Duas linhas do BANCO com a mesma
  // chave (ex.: "Cola Bonder" e "COLA BONDER" — o `unique` do Postgres é
  // literal e deixa as duas passarem) tornam o casamento ambíguo: escolher uma
  // delas no palpite é escrever no item errado.
  const porChave = new Map<string, ItemDoCatalogo[]>();
  // Índice pela chave FROUXA (sem pontuação): não serve pra casar item, só pra
  // barrar a criação de um "ROLO-KRAFT" ao lado do "ROLO KRAFT" que já existe.
  const porChaveFrouxa = new Map<string, ItemDoCatalogo>();
  for (const it of itens) {
    const k = chaveDeNome(it.nome);
    const lista = porChave.get(k);
    if (lista) lista.push(it); else porChave.set(k, [it]);
    const f = chaveFrouxaDeNome(it.nome);
    if (f && !porChaveFrouxa.has(f)) porChaveFrouxa.set(f, it);
  }

  const fornecedorPorChave = new Map<string, FornecedorDoCatalogo>();
  for (const f of fornecedores) {
    const k = chaveDeFornecedor(f.nome);
    if (k && !fornecedorPorChave.has(k)) fornecedorPorChave.set(k, f);
  }
  const fornecedorPorId = new Map<string, FornecedorDoCatalogo>(fornecedores.map((f) => [f.id, f]));

  const plano: Plano = {
    novos: [], atualizados: [], iguais: [], pulados: [], descartes: [],
    fornecedoresNovos: [], fornecedoresIgnorados: [], totalLinhas: linhas.length,
  };

  const vistas = new Map<string, number>();       // chave → linha que ficou com ela
  const novosNoArquivo = new Set<string>();       // pra não criar o mesmo item duas vezes
  // Chave frouxa → nome que já vai ser criado nesta importação. Sem isto, o
  // MESMO arquivo trazendo "ROLO KRAFT" e "ROLO-KRAFT" criaria os dois.
  const frouxasNovas = new Map<string, { linha: number; nome: string }>();
  // Chave de fornecedor → a grafia que vai ser cadastrada. É um MAPA, não um
  // conjunto de nomes crus: o mesmo fornecedor escrito de dois jeitos no MESMO
  // arquivo ("Tinta Mágica Ltda." na linha 2, "TINTA MAGICA" na linha 5) é o
  // caso comum de planilha de galpão, e um `Set` de texto guardaria os dois —
  // a rota criaria dois cadastros e os itens ficariam divididos entre eles.
  // É exatamente a duplicata que `chaveDeFornecedor` existe pra impedir; ela já
  // barrava contra o catálogo EXISTENTE e não contra o próprio arquivo.
  // Vale a primeira grafia, e as linhas seguintes apontam pra ela.
  const fornecedoresNovos = new Map<string, string>();
  const fornecedoresIgnorados = new Set<string>();

  for (const l of linhas) {
    const nome = nomeLimpo(l.nome);
    if (!nome) {
      plano.descartes.push({
        linha: l.linha, nome: "", motivo: "sem_nome",
        detalhe: "Linha sem nome de item — só nome identifica o produto aqui.",
      });
      continue;
    }
    const chave = chaveDeNome(nome);

    const antes = vistas.get(chave);
    if (antes !== undefined) {
      plano.descartes.push({
        linha: l.linha, nome, motivo: "duplicada_no_arquivo",
        detalhe: `Mesmo item da linha ${antes} (nome igual sem contar acento, maiúscula ou espaço a mais). Vale a primeira; junte as duas na planilha se os números forem diferentes.`,
      });
      continue;
    }
    vistas.set(chave, l.linha);

    // ── Fornecedor: resolve agora, ou marca pra criar ──
    const fornecedorTexto = l.fornecedor ? nomeLimpo(l.fornecedor) : null;
    let fornecedorAlvo: string | null = null; // nome a vincular (a rota vira id)
    if (fornecedorTexto) {
      const chaveForn = chaveDeFornecedor(fornecedorTexto);
      const achado = fornecedorPorChave.get(chaveForn);
      if (achado) fornecedorAlvo = achado.nome;
      else if (podeCriarFornecedor) {
        // `??=`: a primeira grafia do arquivo é a que vale. As próximas linhas
        // recebem ela de volta, então todas apontam pro MESMO cadastro.
        const jaEscolhido = fornecedoresNovos.get(chaveForn);
        if (jaEscolhido) fornecedorAlvo = jaEscolhido;
        else { fornecedorAlvo = fornecedorTexto; fornecedoresNovos.set(chaveForn, fornecedorTexto); }
      }
      else fornecedoresIgnorados.add(fornecedorTexto);
    }

    const existentes = porChave.get(chave) ?? [];
    if (existentes.length > 1) {
      plano.descartes.push({
        linha: l.linha, nome, motivo: "nome_ambiguo",
        detalhe: `O catálogo tem ${existentes.length} itens com esse mesmo nome. Resolva a duplicata no catálogo antes de importar — escrever num deles no palpite quebraria as baixas do outro.`,
      });
      continue;
    }

    // ── Item novo ──
    if (existentes.length === 0) {
      if (novosNoArquivo.has(chave)) continue; // já contado acima; guarda de sanidade

      // Antes de criar: este nome só difere de um que já existe por pontuação?
      // Criar assim racha o estoque em dois sem ninguém ver (o recebimento
      // resolve item por `ilike("nome")`, cego a hífen e parêntese). Recusar a
      // linha devolve a escolha da grafia pra quem conhece o galpão.
      const frouxa = chaveFrouxaDeNome(nome);
      const gemeoCatalogo = frouxa ? porChaveFrouxa.get(frouxa) : undefined;
      if (gemeoCatalogo) {
        plano.descartes.push({
          linha: l.linha, nome, motivo: "quase_duplicata",
          detalhe: `O catálogo já tem "${gemeoCatalogo.nome}" — só pontuação ou espaço de diferença. Criar os dois racharia o estoque em dois itens. Se for o mesmo, escreva o nome igual ao do catálogo; se for outro produto, dê a ele um nome que se distinga.`,
        });
        continue;
      }
      const gemeoArquivo = frouxa ? frouxasNovas.get(frouxa) : undefined;
      if (gemeoArquivo) {
        plano.descartes.push({
          linha: l.linha, nome, motivo: "quase_duplicata",
          detalhe: `A linha ${gemeoArquivo.linha} já vai criar "${gemeoArquivo.nome}", que só difere desta por pontuação ou espaço. Deixe uma grafia só na planilha.`,
        });
        continue;
      }
      if (frouxa) frouxasNovas.set(frouxa, { linha: l.linha, nome });

      novosNoArquivo.add(chave);
      const quantidade = naoNegativo(l.quantidade ?? 0);
      const qtd_minima = naoNegativo(l.qtd_minima ?? 0);
      // Vocabulário único de unidade (lib/estoque-unidade-compra.ts): "UNIDADE",
      // "PARES" e "GALÃO" da planilha do galpão viram 'un', 'par' e 'galao'.
      // Esta rota escreve DIRETO em estoque_itens, então a normalização de
      // /api/estoque-itens não a cobre — sem isto o catálogo volta a ter duas
      // grafias pra mesma unidade e o Recebimento não sabe escolher nenhuma.
      const unidade = normalizarUnidade(l.unidade) || UNIDADE_PADRAO;
      plano.novos.push({
        linha: l.linha, nome, quantidade, qtd_minima, unidade,
        fornecedor: fornecedorAlvo,
        escrita: {
          // `hierarquia` fica FORA de propósito: item importado nasce sem
          // classificação (a aba "Não classificados" existe pra isso). Chutar
          // por nome erraria calado, e ninguém revisa o que parece pronto.
          campos: { nome, quantidade, qtd_minima, unidade },
          fornecedor: fornecedorAlvo,
        },
      });
      continue;
    }

    // ── Item que já existe: só o que MUDA ──
    const it = existentes[0];
    const mudancas: CampoMudado[] = [];
    const campos: Record<string, string | number> = {};
    const serializado = !!it.serializado;
    const qtdSistema = num(it.quantidade);
    let estoqueTravado = false;

    if (l.quantidade !== null) {
      const alvo = naoNegativo(l.quantidade);
      if (serializado) {
        // A `quantidade` do serializado é mantida pela trigger a partir das
        // etiquetas; escrever nela é recusado pelo banco (check_violation).
        // Tirar do plano é o que evita a importação inteira estourar no meio.
        if (alvo !== qtdSistema) estoqueTravado = true;
      } else if (alvo !== qtdSistema) {
        mudancas.push({ campo: "quantidade", rotulo: "estoque", de: String(qtdSistema), para: String(alvo) });
        campos.quantidade = alvo;
      }
    }

    if (l.qtd_minima !== null) {
      const alvo = naoNegativo(l.qtd_minima);
      const atual = num(it.qtd_minima);
      if (alvo !== atual) {
        mudancas.push({ campo: "qtd_minima", rotulo: "ponto de reposição", de: String(atual), para: String(alvo) });
        campos.qtd_minima = alvo;
      }
    }

    if (l.unidade) {
      // Os DOIS lados pelo vocabulário: o item já gravado como 'un' e a planilha
      // dizendo "UNIDADE" são a MESMA unidade. Comparar o texto cru (era o que
      // acontecia aqui) marcava uma mudança que não muda nada e, pior, gravava
      // "UNIDADE" por cima de um 'un' que estava certo — trocando 12 itens bons
      // por 12 itens com a unidade escrita de um jeito que o Recebimento não
      // oferece no seletor.
      const alvo = normalizarUnidade(l.unidade);
      const atual = txt(it.unidade);
      // Célula de unidade ilegível vira "" — não é motivo pra apagar a unidade
      // que o item já tem.
      if (alvo && alvo !== normalizarUnidade(atual)) {
        mudancas.push({ campo: "unidade", rotulo: "unidade", de: atual || "—", para: alvo });
        campos.unidade = alvo;
      }
    }

    let fornecedorEscrita: string | null = null;
    if (fornecedorAlvo) {
      const atual = it.fornecedor_id ? fornecedorPorId.get(it.fornecedor_id)?.nome ?? "" : "";
      if (chaveDeFornecedor(atual) !== chaveDeFornecedor(fornecedorAlvo)) {
        mudancas.push({ campo: "fornecedor", rotulo: "fornecedor", de: atual || "—", para: fornecedorAlvo });
        fornecedorEscrita = fornecedorAlvo;
      }
    }

    if (mudancas.length === 0) {
      if (estoqueTravado) {
        plano.pulados.push({
          linha: l.linha, id: it.id, nome: it.nome,
          quantidadePlanilha: l.quantidade, quantidadeSistema: qtdSistema,
        });
      } else {
        plano.iguais.push({ linha: l.linha, nome: it.nome });
      }
      continue;
    }

    plano.atualizados.push({
      linha: l.linha, id: it.id, nome: it.nome, nomePlanilha: nome,
      mudancas, estoqueTravado,
      escrita: { campos, fornecedor: fornecedorEscrita },
    });
  }

  // Fornecedor só é "novo de verdade" se alguma linha que sobreviveu o usa.
  const usados = new Set<string>();
  for (const n of plano.novos) if (n.fornecedor) usados.add(chaveDeFornecedor(n.fornecedor));
  for (const a of plano.atualizados) if (a.escrita.fornecedor) usados.add(chaveDeFornecedor(a.escrita.fornecedor));
  plano.fornecedoresNovos = [...fornecedoresNovos.values()].filter((f) => usados.has(chaveDeFornecedor(f)));
  plano.fornecedoresIgnorados = [...fornecedoresIgnorados];
  return plano;
}

/** Tem alguma coisa pra escrever? A tela desabilita o botão de aplicar, e a
 *  rota devolve "nada a fazer" em vez de dizer que gravou. */
export const planoEscreve = (p: Plano): boolean => p.novos.length > 0 || p.atualizados.length > 0;
