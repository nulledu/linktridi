// ── Vocabulário do Financeiro ────────────────────────────────────────────────
// Um lugar só para os status, as categorias e as cores de cada um. Espalhar
// isso pelas telas é como o mesmo status acaba escrito de três jeitos e pintado
// de quatro cores diferentes.
//
// §14 da especificação: categoria tem CÓDIGO ESTÁVEL. O `id` é o que vai pro
// banco e nunca muda; o `label` é o que aparece na tela e pode ser reescrito à
// vontade, sem tocar em um único histórico.
//
// Cor SEMPRE por token semântico (--ok, --atencao, --perigo, …). Cor escrita na
// mão não tem tema: o verde que fica lindo no escuro some no card branco.
// Ver lib/__tests__/paleta-por-tema.test.ts.

export type EmpresaSlug = string;

export interface Empresa {
  id: string;
  slug: EmpresaSlug;
  nome: string;
  razao_social?: string | null;
  cnpj?: string | null;
  cor?: string | null;
  ordem: number;
  ativa: boolean;
  /** CAMINHO no bucket privado — nunca a URL. Ver `Marca` em ui.tsx. */
  logo_url?: string | null;
  /** Nome de um ícone Tabler, usado quando não há logo. */
  icone?: string | null;
}

/**
 * A identidade visual de uma coisa (empresa, banco, gateway, cartão).
 *
 * As três formas convivem de propósito, na ordem em que a tela tenta: a IMAGEM
 * que alguém subiu, o ÍCONE escolhido, e por último a inicial do nome. A
 * última existe para que nada nasça sem marca — uma conta recém-criada tem de
 * aparecer na lista com alguma coisa, e um quadrado vazio lê como defeito.
 */
export interface MarcaVisual {
  nome: string;
  /** Já assinada pelo servidor; `null` quando não há imagem ou o link falhou. */
  logo?: string | null;
  icone?: string | null;
  cor?: string | null;
}

// ── Status ───────────────────────────────────────────────────────────────────

export const COMPROMISSO_STATUS = ["previsto", "pendente", "agendado", "pago", "atrasado", "cancelado"] as const;
export type CompromissoStatus = (typeof COMPROMISSO_STATUS)[number];

export const COMPRA_STATUS = ["rascunho", "confirmada", "recebida", "cancelada"] as const;
export type CompraStatus = (typeof COMPRA_STATUS)[number];

export const NOTA_STATUS = ["pendente", "autorizada", "cancelada", "rejeitada"] as const;
export type NotaStatus = (typeof NOTA_STATUS)[number];

export const PATRIMONIO_STATUS = ["em_uso", "estoque", "manutencao", "baixado", "vendido"] as const;
export type PatrimonioStatus = (typeof PATRIMONIO_STATUS)[number];

export const RECORRENCIA_STATUS = ["ativa", "pausada", "encerrada"] as const;
export type RecorrenciaStatus = (typeof RECORRENCIA_STATUS)[number];

export const COLABORADOR_STATUS = ["ativo", "afastado", "desligado"] as const;
export type ColaboradorStatus = (typeof COLABORADOR_STATUS)[number];

export const CONTA_TIPOS = ["banco", "gateway", "cartao", "carteira"] as const;
export type ContaTipo = (typeof CONTA_TIPOS)[number];

export const MOVIMENTO_TIPOS = ["entrada", "saida", "transferencia", "ajuste", "reversao"] as const;
export type MovimentoTipo = (typeof MOVIMENTO_TIPOS)[number];

export const COMPROMISSO_ORIGENS = ["manual", "compra", "recorrencia", "folha", "imposto"] as const;
export type CompromissoOrigem = (typeof COMPROMISSO_ORIGENS)[number];

export const PLANOS = ["a_vista", "prazo", "parcelado", "customizado"] as const;
export type Plano = (typeof PLANOS)[number];

export const PERIODICIDADES = ["mensal", "bimestral", "trimestral", "semestral", "anual", "customizada"] as const;
export type Periodicidade = (typeof PERIODICIDADES)[number];

// ── Rótulo + cor de cada status ──────────────────────────────────────────────

export interface Selo { label: string; cor: string }

export const SELO_COMPROMISSO: Record<CompromissoStatus, Selo> = {
  previsto:  { label: "Previsto",  cor: "var(--roxo)" },
  pendente:  { label: "Pendente",  cor: "var(--perigo)" },
  agendado:  { label: "Agendado",  cor: "var(--azul)" },
  pago:      { label: "Pago",      cor: "var(--ok)" },
  atrasado:  { label: "Atrasado",  cor: "var(--perigo-forte)" },
  cancelado: { label: "Cancelado", cor: "var(--neutro)" },
};

export const SELO_COMPRA: Record<CompraStatus, Selo> = {
  rascunho:   { label: "Rascunho",   cor: "var(--neutro)" },
  confirmada: { label: "Confirmada", cor: "var(--azul)" },
  recebida:   { label: "Recebida",   cor: "var(--ok)" },
  cancelada:  { label: "Cancelada",  cor: "var(--perigo)" },
};

export const SELO_NOTA: Record<NotaStatus, Selo> = {
  pendente:   { label: "Pendente",   cor: "var(--atencao)" },
  autorizada: { label: "Autorizada", cor: "var(--ok)" },
  cancelada:  { label: "Cancelada",  cor: "var(--perigo)" },
  rejeitada:  { label: "Rejeitada",  cor: "var(--perigo-forte)" },
};

export const ESTORNO_STATUS = ["em_disputa", "devolvido", "ganho", "perdido"] as const;
export type EstornoStatus = (typeof ESTORNO_STATUS)[number];

export const ESTORNO_TIPOS = ["estorno", "chargeback"] as const;
export type EstornoTipo = (typeof ESTORNO_TIPOS)[number];
export const LABEL_ESTORNO_TIPO: Record<EstornoTipo, string> = {
  estorno: "Estorno", chargeback: "Chargeback",
};

/**
 * A cor conta o estado do DINHEIRO, não o humor do caso: em disputa é âmbar
 * (parado, esperando alguém), devolvido é neutro (saiu, era devido), ganho é
 * verde (ficou em casa) e perdido é vermelho (saiu contra a vontade).
 */
export const SELO_ESTORNO: Record<EstornoStatus, Selo> = {
  em_disputa: { label: "Em disputa", cor: "var(--atencao)" },
  devolvido:  { label: "Devolvido",  cor: "var(--neutro)" },
  ganho:      { label: "Ganho",      cor: "var(--ok)" },
  perdido:    { label: "Perdido",    cor: "var(--perigo)" },
};

export interface Estorno {
  id: string;
  empresa_id: string;
  tipo: EstornoTipo | string;
  status: EstornoStatus | string;
  referencia: string;
  cliente: string | null;
  motivo: string | null;
  observacao: string | null;
  conta_id: string | null;
  valor: number;
  aberto_em: string;
  resolvido_em: string | null;
}

export const SELO_PATRIMONIO: Record<PatrimonioStatus, Selo> = {
  em_uso:     { label: "Em uso",     cor: "var(--ok)" },
  estoque:    { label: "Estoque",    cor: "var(--azul)" },
  manutencao: { label: "Manutenção", cor: "var(--atencao)" },
  baixado:    { label: "Baixado",    cor: "var(--neutro)" },
  vendido:    { label: "Vendido",    cor: "var(--roxo)" },
};

export const SELO_RECORRENCIA: Record<RecorrenciaStatus, Selo> = {
  ativa:     { label: "Ativa",     cor: "var(--ok)" },
  pausada:   { label: "Pausada",   cor: "var(--atencao)" },
  encerrada: { label: "Encerrada", cor: "var(--neutro)" },
};

export const SELO_COLABORADOR: Record<ColaboradorStatus, Selo> = {
  ativo:     { label: "Ativo",     cor: "var(--ok)" },
  afastado:  { label: "Afastado",  cor: "var(--atencao)" },
  desligado: { label: "Desligado", cor: "var(--neutro)" },
};

export const LABEL_CONTA_TIPO: Record<ContaTipo, string> = {
  banco: "Banco", gateway: "Gateway", cartao: "Cartão", carteira: "Carteira/Pix",
};

/**
 * A marca de reserva de cada tipo de conta.
 *
 * Vale enquanto ninguém subiu o logo do banco na tela de configuração — e
 * existe para que NENHUMA conta apareça sem ícone. Um quadrado vazio na lista
 * lê como defeito; um ícone de banco genérico lê como "ainda não configurei".
 */
export const ICONE_CONTA_TIPO: Record<ContaTipo, string> = {
  banco: "building-warehouse", gateway: "link", cartao: "credit-card", carteira: "wallet",
};

/**
 * O catálogo de ícones que a tela de Configurações oferece para marcar uma
 * empresa ou uma conta quando não há logo.
 *
 * É um RECORTE do mapa do Tabler (`Icon.tsx`), não o mapa inteiro — o mapa tem
 * quase 200 entradas, a maioria delas (chevron, arrow-split, calendar-off) sem
 * sentido nenhum como identidade visual. Vinte e poucos símbolos neutros dão
 * conta de diferenciar "Tridi" de "Gedux" sem virar uma busca dentro de uma
 * busca.
 */
export const ICONES_DE_MARCA = [
  "building-warehouse", "home", "world", "flag", "shield",
  "crown", "rocket", "bulb", "target", "trophy", "box", "package",
  "truck", "link", "users", "wallet", "receipt", "tools", "key",
  "device-desktop", "cash", "credit-card", "shopping-bag", "shopping-cart",
  "sun", "moon", "bolt", "droplet", "star",
] as const;

export const LABEL_ORIGEM: Record<CompromissoOrigem, string> = {
  manual: "Manual", compra: "Compra", recorrencia: "Recorrência", folha: "Folha", imposto: "Imposto",
};

export const LABEL_PLANO: Record<Plano, string> = {
  a_vista: "À vista", prazo: "A prazo", parcelado: "Parcelado", customizado: "Customizado",
};

export const LABEL_PERIODICIDADE: Record<Periodicidade, string> = {
  mensal: "Mensal", bimestral: "Bimestral", trimestral: "Trimestral",
  semestral: "Semestral", anual: "Anual", customizada: "Customizada",
};

export const MESES_DA_PERIODICIDADE: Record<Periodicidade, number> = {
  mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12, customizada: 1,
};

// ── Categorias (§14) ─────────────────────────────────────────────────────────
// `id` vai pro banco e é para sempre. `label` é da tela.

export interface Categoria { id: string; label: string; cor: string }

export const CATEGORIAS_COMPRA: Categoria[] = [
  { id: "materia_prima",   label: "Matéria-prima",   cor: "var(--cat-1)" },
  { id: "insumo_direto",   label: "Insumo direto",   cor: "var(--cat-2)" },
  { id: "insumo_indireto", label: "Insumo indireto", cor: "var(--cat-3)" },
  { id: "embalagem",       label: "Embalagem",       cor: "var(--cat-4)" },
  { id: "patrimonio",      label: "Patrimônio",      cor: "var(--cat-5)" },
  { id: "outros",          label: "Outros",          cor: "var(--neutro)" },
];

export const CATEGORIAS_COMPROMISSO: Categoria[] = [
  { id: "software",       label: "Software",           cor: "var(--cat-1)" },
  { id: "aluguel",        label: "Aluguel",            cor: "var(--cat-2)" },
  { id: "internet",       label: "Internet/Telefonia", cor: "var(--cat-3)" },
  { id: "servicos",       label: "Serviços",           cor: "var(--cat-4)" },
  { id: "impostos",       label: "Impostos",           cor: "var(--cat-5)" },
  { id: "colaboradores",  label: "Colaboradores",      cor: "var(--cat-6)" },
  { id: "marketing",      label: "Marketing",          cor: "var(--cat-7)" },
  { id: "materia_prima",  label: "Matéria-prima",      cor: "var(--cat-8)" },
  { id: "outros",         label: "Outros",             cor: "var(--neutro)" },
];

/**
 * O ícone de cada categoria — a CARA da linha quando não há foto.
 *
 * Existe porque o contrário é pior: sem ícone próprio, a linha pegava
 * emprestada a logo do BANCO de onde ela sai, e um imposto aparecia com a
 * marca do Itaú como se fosse dele. Emprestar identidade de outra entidade é
 * o defeito, não a falta de imagem.
 */
export const ICONE_CATEGORIA: Record<string, string> = {
  software: "device-desktop",
  aluguel: "building-warehouse",
  internet: "world-www",
  servicos: "tools",
  impostos: "percentage",
  colaboradores: "users",
  marketing: "speakerphone",
  materia_prima: "package",
  outros: "receipt",
};

/** O ícone da categoria, com "outros" como último degrau. */
export function iconeDaCategoria(id: string | null | undefined): string {
  return ICONE_CATEGORIA[id ?? "outros"] ?? ICONE_CATEGORIA.outros;
}

/**
 * As categorias que o diretório JÁ CONHECE no primeiro dia.
 *
 * `fin_categorias` nasce do uso: ela é semeada com o que já estava escrito nas
 * fichas. Num cadastro novo isso significa lista vazia — e uma lista vazia não
 * ensina nada. A pessoa digita "eletricista" hoje, "Eletricista" na semana que
 * vem e "eletrecista" no mês seguinte, e o filtro passa a ter três linhas para
 * a mesma coisa. Foi para evitar exatamente isso que o cadastro existe.
 *
 * Aqui é sugestão, não catálogo fechado: continua dando para escrever qualquer
 * coisa, e o que for escrito entra no cadastro como sempre entrou. O que muda é
 * o primeiro contato ter de onde escolher.
 *
 * As duas listas são separadas porque o vocabulário é outro: de quem se COMPRA
 * (matéria-prima, embalagem) não é o mesmo de quem se CHAMA (encanador,
 * contador).
 */
export const CATEGORIAS_SUGERIDAS: Record<"fornecedor" | "contato", string[]> = {
  fornecedor: [
    "Matéria-prima", "Insumos", "Embalagem", "Ferramentas", "Máquinas",
    "Equipamentos", "Papelaria", "Limpeza", "Uniformes", "Transporte",
    "Frete", "Combustível", "Manutenção", "Software", "Marketing",
  ],
  contato: [
    "Encanador", "Eletricista", "Marceneiro", "Pedreiro", "Chaveiro",
    "Contador", "Advogado", "Despachante", "Segurança", "Informática",
    "Manutenção", "Cliente", "Parceiro", "Transportadora", "Banco",
  ],
};

export const CATEGORIAS_PATRIMONIO: Categoria[] = [
  { id: "equipamentos",  label: "Equipamentos",       cor: "var(--cat-1)" },
  { id: "maquinas",      label: "Máquinas",           cor: "var(--cat-2)" },
  { id: "computadores",  label: "Computadores",       cor: "var(--cat-3)" },
  { id: "ferramentas",   label: "Ferramentas",        cor: "var(--cat-4)" },
  { id: "moveis",        label: "Móveis e utensílios", cor: "var(--cat-5)" },
  { id: "veiculos",      label: "Veículos",           cor: "var(--cat-6)" },
  { id: "outros",        label: "Outros",             cor: "var(--neutro)" },
];

// Categoria que o banco guardou mas o catálogo não conhece mais NÃO some da
// tela: vira ela mesma, com cor neutra. Sumir seria perder o histórico por uma
// renomeação — exatamente o que o `id` estável existe para evitar.
export function acharCategoria(lista: Categoria[], id: string | null | undefined): Categoria {
  if (!id) return { id: "outros", label: "Outros", cor: "var(--neutro)" };
  return lista.find((c) => c.id === id) ?? { id, label: id, cor: "var(--neutro)" };
}

// ── Linhas ───────────────────────────────────────────────────────────────────

export interface Conta {
  id: string; empresa_id: string; nome: string; tipo: ContaTipo;
  instituicao: string | null; saldo_inicial: number; saldo: number;
  inclui_no_saldo: boolean; ativa: boolean; cor: string | null; ordem: number;
  responsavel_id: string | null;
  /** Só de cartão: quanto ele aguenta. */
  limite: number | null;
  /** Só de cartão: quanto da fatura está aberto. DERIVADO do saldo, não gravado. */
  usado: number | null;
  /** `limite - usado`. Nulo quando não é cartão ou quando não há limite. */
  disponivel: number | null;
  /** O banco em que este cartão está pendurado. */
  conta_mae_id: string | null;
  bandeira: string | null;
  /** Os quatro últimos dígitos — é assim que se reconhece um cartão. */
  final: string | null;
  /** Agência e número da conta — o que se copia na hora de receber um PIX/TED. */
  agencia: string | null;
  numero: string | null;
  logo_url?: string | null;
  icone?: string | null;
}

export interface Fornecedor {
  id: string; empresa_id: string; nome: string; cnpj: string | null;
  /** A categoria ANTIGA, de uma só. Continua preenchida com a primeira de
   *  `categorias` para não quebrar consulta e tela que ainda leem daqui. */
  categoria: string | null;
  /** Um fornecedor de MDF que também vende cola não cabe numa palavra só. */
  categorias: string[];
  contato_nome: string | null; contato_email: string | null; contato_fone: string | null;
  /** Prazo de PAGAMENTO — quando o dinheiro sai. */
  prazo_dias: number | null;
  /** Prazo de ENVIO — quando o material chega. Não é o mesmo número. */
  prazo_envio_dias: number | null;
  forma_pagamento: string | null; ativo: boolean;
  pix_tipo: string | null; pix_chave: string | null;
  banco: string | null; agencia: string | null; conta_numero: string | null;
  aceita_boleto: boolean;
  inscricao_estadual: string | null; site: string | null; whatsapp: string | null;
  cidade: string | null; uf: string | null; endereco: string | null;
  observacao: string | null;
  /** CAMINHO no bucket privado — nunca a URL. Ver `Marca` em ui.tsx. */
  logo_url?: string | null;
  icone?: string | null;
}

/**
 * "Meio que um fornecedor, mas pra outros fins" — encanador, eletricista,
 * chaveiro. Gente que se CHAMA quando precisa, não gente de quem se COMPRA:
 * por isso sem CNPJ, sem prazo de pagamento, sem forma de pagamento — campos
 * que só fazem sentido para quem entra numa compra. `categoria` é o TIPO DE
 * SERVIÇO, texto livre como em Fornecedor — "Encanador" é exemplo, não
 * catálogo fechado.
 */
/** Uma categoria cadastrada — o vocabulário de fornecedor OU o de contato. */
export interface CategoriaFin {
  id: string; empresa_id: string; escopo: "fornecedor" | "contato";
  nome: string; cor: string | null; ordem: number;
}

/** Fornecedor, Cliente, Parceiro, Prestador, Outro — o vocabulário da tela. */
export const CONTATO_TIPOS = ["fornecedor", "cliente", "parceiro", "prestador", "outro"] as const;
export type ContatoTipo = (typeof CONTATO_TIPOS)[number];

export const LABEL_CONTATO_TIPO: Record<ContatoTipo, string> = {
  fornecedor: "Fornecedor", cliente: "Cliente", parceiro: "Parceiro",
  prestador: "Prestador", outro: "Outro",
};

/** Pessoa ou empresa — a empresa é um contato como outro, com gente pendurada. */
export const CONTATO_NATUREZAS = ["pessoa", "empresa"] as const;
export type ContatoNatureza = (typeof CONTATO_NATUREZAS)[number];

export const LABEL_CONTATO_NATUREZA: Record<ContatoNatureza, string> = {
  pessoa: "Pessoa", empresa: "Empresa",
};

export interface Contato {
  id: string; empresa_id: string; nome: string;
  /** `empresa` é uma organização de fora; `pessoa`, gente. */
  natureza: ContatoNatureza;
  /** O contato-EMPRESA a que esta pessoa pertence. Nulo em quem é avulso. */
  organizacao_id: string | null;
  /** A categoria ANTIGA, de uma só. Segue preenchida com a primeira de `categorias`. */
  categoria: string | null;
  categorias: string[];
  /** O telefone ANTIGO. Segue preenchido com o primeiro de `telefones`. */
  telefone: string | null;
  /** Uma pessoa tem o WhatsApp pessoal e o da empresa. */
  telefones: string[];
  email: string | null; endereco: string | null;
  tipo: ContatoTipo | null;
  cargo: string | null;
  /** Onde trabalha, em TEXTO — para quem não vale a pena cadastrar ("o
   *  eletricista do prédio"). Quem tem `organizacao_id` mostra o nome dela. */
  organizacao: string | null;
  site: string | null;
  observacao: string | null; ativo: boolean;
  /** CAMINHO no bucket privado — nunca a URL. Ver `Marca` em ui.tsx. */
  logo_url?: string | null;
  icone?: string | null;
}

/** Os papéis acumuláveis de uma identidade no diretório financeiro. */
export const PAPEIS_CONTATO = ["contato", "fornecedor", "cliente", "parceiro", "prestador", "outro"] as const;
export type PapelContato = (typeof PAPEIS_CONTATO)[number];

/** A ficha canônica e, quando existir, sua extensão operacional de fornecedor. */
export interface ParteFinanceira extends Contato {
  papeis: PapelContato[];
  cnpj: string | null;
  fornecedor: Fornecedor | null;
}

export interface Colaborador {
  id: string; empresa_id: string; employee_id: string | null; nome: string;
  setor: string | null; cargo: string | null; salario_base: number; beneficios: number;
  dia_pagamento: number | null; status: ColaboradorStatus; admissao: string | null;
  /** Fixo mensal, somado ao salário. Diferente do bônus, que é lançado no mês. */
  gratificacao: number;
  /** Quanto vale uma hora desta pessoa — vira sugestão ao lançar hora extra. */
  valor_hora: number;
  /** Conta DA EMPRESA que paga esta pessoa (não a conta dela). */
  conta_id: string | null;
  banco: string | null; agencia: string | null; conta_numero: string | null;
  pix_tipo: string | null; pix_chave: string | null; whatsapp: string | null;
  logo_url: string | null; icone: string | null;
  /** CLT, MEI, PF ou Estágio. */
  vinculo?: string | null;
}

export const LANCAMENTO_TIPOS = [
  "bonus", "horas_extras", "outro_credito",
  "adiantamento", "faltas", "farmacia", "mercadinho", "outro_desconto",
] as const;
export type LancamentoTipo = (typeof LANCAMENTO_TIPOS)[number];

/**
 * O sinal mora AQUI, não no valor gravado.
 *
 * `valor` é sempre positivo no banco (tem `check (valor >= 0)`), e quem sabe se
 * a linha soma ou subtrai é este catálogo. A alternativa — desconto guardado
 * como número negativo — quebra na primeira vez que alguém digita "-200" num
 * campo que já subtrai: o vale vira crédito e o erro só aparece no pagamento.
 */
export const LANCAMENTO: Record<LancamentoTipo, {
  label: string; sinal: 1 | -1; icone: string;
  /** Rótulo da quantidade, quando o tipo é contado (horas, dias). */
  unidade?: string;
}> = {
  bonus:          { label: "Bônus",         sinal:  1, icone: "star" },
  horas_extras:   { label: "Horas extras",  sinal:  1, icone: "clock", unidade: "horas" },
  outro_credito:  { label: "Outro crédito", sinal:  1, icone: "plus" },
  adiantamento:   { label: "Vale",          sinal: -1, icone: "cash" },
  faltas:         { label: "Faltas",        sinal: -1, icone: "ban", unidade: "dias" },
  farmacia:       { label: "Farmácia",      sinal: -1, icone: "heart" },
  mercadinho:     { label: "Mercadinho",    sinal: -1, icone: "shopping-cart" },
  outro_desconto: { label: "Outro desconto", sinal: -1, icone: "minus" },
};

export interface FolhaLancamento {
  id: string; empresa_id: string; colaborador_id: string;
  competencia: string; tipo: LancamentoTipo;
  descricao: string | null; quantidade: number | null; valor: number;
  /** Bônus marcado para repetir todo mês (a ORIGEM). */
  recorrente?: boolean;
  /** A CÓPIA de um bônus recorrente aponta para a origem. */
  origem_id?: string | null;
}

export interface Recorrencia {
  id: string; empresa_id: string; descricao: string; categoria: string; valor: number;
  periodicidade: Periodicidade; intervalo_meses: number; dia_vencimento: number;
  /** De onde SAI o dinheiro. */
  conta_id: string | null;
  /** Para QUEM se paga, quando não é um fornecedor do cadastro (o dono do
   *  galpão não vende nada, mas recebe o aluguel todo mês). */
  contato_id: string | null;
  /** Em qual conta ENTRA — para a recorrência que é receita, não despesa. */
  conta_destino_id: string | null;
  fornecedor_id: string | null;
  forma_pagamento: string | null;
  /** Quem cuida desta regra. Pessoa da folha, como em contas e patrimônio. */
  responsavel_id: string | null;
  inicio: string; fim: string | null; proxima_competencia: string | null;
  status: RecorrenciaStatus;
  logo_url?: string | null;
  icone?: string | null;
  /** O valor muda a cada volta: `valor` passa a ser estimativa. */
  valor_variavel?: boolean | null;
}

export interface Compromisso {
  id: string; empresa_id: string; descricao: string; categoria: string; valor: number;
  vencimento: string; competencia: string | null; status: CompromissoStatus;
  origem: CompromissoOrigem; origem_id: string | null;
  parcela_numero: number | null; parcela_total: number | null;
  conta_id: string | null; fornecedor_id: string | null; contato_id: string | null; colaborador_id: string | null;
  pago_em: string | null; pago_valor: number | null; observacao: string | null;
}

export interface CompraItem {
  id: string; compra_id: string; descricao: string; quantidade: number;
  unidade: string | null; valor_unitario: number; categoria: string | null; ordem: number;
}

export interface Compra {
  id: string; empresa_id: string; fornecedor_id: string | null; descricao: string;
  data: string; categoria: string; valor_total: number; plano: Plano; parcelas: number;
  prazo_dias: number | null; primeiro_vencimento: string | null; forma_pagamento: string | null;
  conta_id: string | null; status: CompraStatus; gera_patrimonio: boolean; observacao: string | null;
}

export interface Nota {
  id: string; empresa_id: string; tipo: "emitida" | "compra"; numero: string | null;
  serie: string | null; parceiro_nome: string | null; fornecedor_id: string | null;
  compra_id: string | null; chave_acesso: string | null; emissao: string;
  valor: number; categoria: string | null; status: NotaStatus;
}

export interface Patrimonio {
  id: string; empresa_id: string; codigo: string; descricao: string; categoria: string;
  local: string | null; responsavel_id: string | null; fornecedor_id: string | null;
  compra_id: string | null; nota_id: string | null; valor: number;
  aquisicao: string | null; garantia_ate: string | null; status: PatrimonioStatus;
  logo_url?: string | null;
  icone?: string | null;
}

export interface Movimento {
  id: string; empresa_id: string; conta_id: string; tipo: MovimentoTipo; valor: number;
  descricao: string; compromisso_id: string | null; transfer_group_id: string | null;
  reverte_id: string | null; ocorrido_em: string; status: "confirmado" | "revertido";
}
