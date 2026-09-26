// ── O formulário de candidatura: perguntas, etapas e condições ──────────────
// Até 18/09/2026 eram 12 etapas fixas, uma pergunta por tela. Agora o
// formulário é CONFIGURÁVEL (Currículos → Configurações) e condicional: a
// resposta de "O que você faz atualmente?" decide se aparecem as perguntas de
// estudo, de trabalho, as duas, ou a de experiência anterior.
//
// A estrutura é a mesma pros três lugares que leem o formulário, e nada aqui
// importa do servidor:
//   • o navegador do candidato monta as telas (`telasDoFormulario`);
//   • o servidor confere o envio com a MESMA regra (`pendenciaDoEnvio`) —
//     desligar o JavaScript não pula pergunta obrigatória;
//   • o RH lê as respostas com a pergunta por extenso (`respostasLegiveis`) e
//     o resumo da triagem (`perfilDoCandidato`).
//
// O que o banco guarda (`rh_curriculos_config.formulario`) passa SEMPRE por
// `normalizarFormulario`: config velha, parcial ou quebrada vira uma config
// válida — as perguntas do sistema (nome, contato, currículo) não somem nunca.

import { ehPose, type Pose } from "./personagens";

// ── Vocabulário ──────────────────────────────────────────────────────────────

export type TipoPergunta =
  | "texto" | "longo" | "unica" | "multipla" | "numero" | "data" | "upload" | "simnao" | "email" | "telefone";

export const TIPOS_PERGUNTA: { valor: TipoPergunta; label: string; icone: string; so_sistema?: boolean }[] = [
  { valor: "texto", label: "Texto", icone: "align-left" },
  { valor: "longo", label: "Texto longo", icone: "notes" },
  { valor: "unica", label: "Seleção única", icone: "circle-dot" },
  { valor: "multipla", label: "Múltipla escolha", icone: "list-check" },
  { valor: "numero", label: "Número", icone: "hash" },
  { valor: "data", label: "Data", icone: "calendar" },
  { valor: "upload", label: "Upload", icone: "file-upload" },
  { valor: "simnao", label: "Sim/Não", icone: "circle-check" },
  { valor: "email", label: "E-mail", icone: "mail", so_sistema: true },
  { valor: "telefone", label: "WhatsApp", icone: "brand-whatsapp", so_sistema: true },
];

export const temOpcoes = (t: TipoPergunta) => t === "unica" || t === "multipla" || t === "simnao";

export interface Opcao {
  valor: string;
  label: string;
  icone?: string;
  /** Etiqueta que a triagem põe no candidato que escolheu esta opção. */
  tag?: string;
  /**
   * GABARITO: é a resposta certa (vale 1 acerto). Nunca sai pro navegador
   * do candidato — `semGabarito()` tira antes de a página montar; quem corrige
   * é o servidor, no envio, com a config lida do banco.
   */
  certa?: boolean;
}

export type OperadorCondicao = "igual" | "diferente" | "em" | "fora" | "preenchido";

export const OPERADORES: { valor: OperadorCondicao; label: string }[] = [
  { valor: "em", label: "for uma destas" },
  { valor: "fora", label: "não for nenhuma destas" },
  { valor: "igual", label: "for igual a" },
  { valor: "diferente", label: "for diferente de" },
  { valor: "preenchido", label: "estiver respondida" },
];

/** "Mostrar só se <pergunta> <op> <valores>". Várias condições = todas valem. */
export interface Condicao {
  pergunta: string;
  op: OperadorCondicao;
  valores?: string[];
}

export interface Pergunta {
  /** A chave gravada na resposta. `[a-z0-9_]`, única no formulário. */
  id: string;
  /** Pode ter um trecho entre `*…*`, que sai em roxo. */
  titulo: string;
  tipo: TipoPergunta;
  obrigatoria: boolean;
  ativa: boolean;
  ajuda?: string;
  placeholder?: string;
  /** Teto de caracteres (texto, longo). */
  teto?: number;
  min?: number;
  max?: number;
  opcoes?: Opcao[];
  quando?: Condicao[];
  /** Ícone do campo (texto, e-mail, número…). */
  icone?: string;
  /** Do sistema: não apaga, não troca de tipo nem de chave. */
  fixa?: boolean;
  /** Vai pra coluna própria do candidato, não pra lista de respostas. */
  coluna?: "nome" | "email" | "telefone" | "cidade";
  autocomplete?: string;
}

export interface EtapaFormulario {
  id: string;
  /** Rótulo pequeno do cabeçalho ("Sua formação"). */
  rotulo: string;
  /** Título grande quando a etapa mostra as perguntas juntas. */
  titulo: string;
  sub?: string;
  ativa: boolean;
  /** Ids das perguntas, na ordem. */
  perguntas: string[];
  /** Cada pergunta numa tela (as condicionadas à anterior vêm junto). */
  uma_por_tela?: boolean;
  /** Onde entram as perguntas específicas da vaga do link. */
  recebe_vaga?: boolean;
  personagem?: Pose | null;
  /** Onde o personagem fica no pé do cartão (como nas referências). */
  posicao?: "esq" | "dir" | "centro";
  /** A frase manuscrita ao lado do personagem. */
  nota?: string;
  /** Lado da frase. Sem ele, oposto ao personagem. */
  nota_lado?: "esq" | "dir";
  /** Do sistema: não desliga. */
  fixa?: boolean;
}

export interface ConfigFormulario {
  versao: 2;
  abertura: {
    ativa: boolean;
    titulo: string;
    sub: string;
    destaques: { icone: string; titulo: string; sub: string }[];
    personagem: Pose | null;
    nota: string;
  };
  final: {
    titulo: string;
    sub: string;
    proximo: string;
    personagem: Pose | null;
    nota: string;
  };
  /** Logo no topo do formulário. Sem ela, o nome "Tridi" em texto. */
  logo_url: string | null;
  /** Desligado, nenhuma ilustração aparece — sobra a frase manuscrita. */
  personagens: boolean;
  etapas: EtapaFormulario[];
  perguntas: Pergunta[];
}

export type Valor = string | string[];
export type Respostas = Record<string, Valor>;

// ── As opções que se repetem ─────────────────────────────────────────────────

const TEMPO: Opcao[] = [
  { valor: "menos_6m", label: "Menos de 6 meses" },
  { valor: "6m_1a", label: "6 meses a 1 ano" },
  { valor: "1a_2a", label: "1 a 2 anos" },
  { valor: "2a_5a", label: "2 a 5 anos" },
  { valor: "mais_5a", label: "Mais de 5 anos" },
];

export const SIM_NAO: Opcao[] = [
  { valor: "sim", label: "Sim", icone: "check" },
  { valor: "nao", label: "Não", icone: "x" },
];

const ESTUDANDO = ["estudo", "trabalho_estudo"];
const SEM_EMPREGO_ATUAL = ["estudo", "procurando", "outro"];
// Valores do "Seu momento" que pedem detalhe.
const MOMENTO_ESTUDA = ["ensino_medio", "curso_tecnico", "faculdade", "trabalho_estudo"];
const MOMENTO_CURSO = ["curso_tecnico", "faculdade", "trabalho_estudo"];
const MOMENTO_TRABALHA = ["trabalhando", "trabalho_estudo"];

// ── O formulário padrão ──────────────────────────────────────────────────────
// É o ponto de partida da config e o que vale enquanto o SQL não rodou.

export const PERGUNTAS_PADRAO: Pergunta[] = [
  // 01 · Vamos começar
  // O fluxo PADRÃO é o das referências do dono (12 telas, uma pergunta por
  // tela). As perguntas condicionais de ocupação/formação/experiência/
  // disponibilidade ficam no banco de perguntas, com as etapas DESLIGADAS —
  // o RH liga em Configurações → Etapas.
  { id: "nome", titulo: "Como podemos *te chamar?*", tipo: "texto", obrigatoria: true, ativa: true, fixa: true, coluna: "nome", icone: "user", ajuda: "Pode ser seu primeiro nome, como você prefere ser chamado por aqui.", placeholder: "Digite seu primeiro nome", teto: 120, autocomplete: "given-name" },
  {
    id: "momento", titulo: "Qual opção mais *combina com sua situação hoje?*", tipo: "unica", obrigatoria: true, ativa: true,
    ajuda: "Isso ajuda a gente a entender melhor seu contexto — não existe resposta certa.",
    opcoes: [
      { valor: "ensino_medio", label: "Estou no ensino médio", icone: "school", tag: "Estudando" },
      { valor: "curso_tecnico", label: "Faço curso técnico", icone: "settings", tag: "Estudando" },
      { valor: "faculdade", label: "Estou na faculdade", icone: "book", tag: "Ensino superior" },
      { valor: "concluido", label: "Já concluí meus estudos", icone: "circle-check" },
      { valor: "trabalhando", label: "Estou trabalhando atualmente", icone: "briefcase", tag: "Trabalhando" },
      { valor: "trabalho_estudo", label: "Trabalho e estudo", icone: "book", tag: "Trabalha e estuda" },
      { valor: "outro", label: "Outro momento", icone: "dots" },
    ],
  },
  {
    id: "area", titulo: "Qual área mais desperta seu *interesse hoje?*", tipo: "unica", obrigatoria: true, ativa: true,
    opcoes: [
      { valor: "comercial", label: "Comercial", icone: "chart-bar" },
      { valor: "marketing", label: "Marketing e criação", icone: "palette" },
      { valor: "tecnologia", label: "Tecnologia", icone: "code" },
      { valor: "producao", label: "Produção", icone: "building-factory-2" },
      { valor: "logistica", label: "Logística", icone: "package" },
      { valor: "administrativo", label: "Administrativo / financeiro", icone: "file-description" },
      { valor: "atendimento", label: "Atendimento", icone: "headset" },
      { valor: "nao_sei", label: "Ainda não sei — quero descobrir", icone: "compass" },
    ],
  },
  { id: "aprender", titulo: "Tem alguma coisa que você gostaria muito de *aprender ou melhorar* em *você?*", tipo: "longo", obrigatoria: true, ativa: true, placeholder: "Ex.: quero melhorar minha comunicação e aprender mais sobre tecnologia e automação.", teto: 500 },
  { id: "historia", titulo: "Você já participou de algum projeto, curso, trabalho ou atividade *que te marcou?*", tipo: "longo", obrigatoria: true, ativa: true, ajuda: "Pode ser escola, esporte, voluntariado, trabalho ou algo que você fez por conta própria. Se ainda não teve experiência, tudo bem.", placeholder: "Conte aqui…", teto: 500 },
  { id: "email", titulo: "E-mail", tipo: "email", obrigatoria: true, ativa: true, fixa: true, coluna: "email", icone: "mail", placeholder: "voce@email.com", autocomplete: "email" },
  { id: "telefone", titulo: "WhatsApp", tipo: "telefone", obrigatoria: true, ativa: true, fixa: true, coluna: "telefone", icone: "brand-whatsapp", placeholder: "(14) 99999-9999", autocomplete: "tel" },

  // 02 · Queremos conhecer você
  { id: "cidade", titulo: "Cidade", tipo: "texto", obrigatoria: false, ativa: true, coluna: "cidade", icone: "map-pin", placeholder: "Cerqueira César, SP", teto: 120, autocomplete: "address-level2" },
  { id: "idade", titulo: "Idade", tipo: "numero", obrigatoria: true, ativa: true, icone: "cake", placeholder: "Ex.: 19", min: 14, max: 90 },
  {
    id: "ocupacao", titulo: "O que você faz atualmente?", tipo: "unica", obrigatoria: true, ativa: true,
    opcoes: [
      { valor: "trabalho", label: "Trabalho atualmente", icone: "briefcase", tag: "Trabalhando" },
      { valor: "estudo", label: "Estou estudando", icone: "school", tag: "Estudando" },
      { valor: "trabalho_estudo", label: "Trabalho e estudo", icone: "book", tag: "Trabalha e estuda" },
      { valor: "procurando", label: "Estou procurando emprego", icone: "search", tag: "Procurando emprego" },
      { valor: "outro", label: "Outro", icone: "dots" },
    ],
  },
  { id: "ocupacao_outro", titulo: "Conte o que você faz hoje", tipo: "texto", obrigatoria: true, ativa: true, icone: "edit", placeholder: "Ex.: cuido da família, sou autônomo…", teto: 160, quando: [{ pergunta: "ocupacao", op: "igual", valores: ["outro"] }] },

  // 03 · Sua formação — quem estuda conta o curso; quem não estuda, a escolaridade
  // Detalhe do "Seu momento" (19/09/26): só aparece o que vale pra resposta.
  // Ensino médio → só onde estuda; técnico/faculdade → curso + onde;
  // trabalhando → onde, cargo e tempo; trabalho e estudo → os dois.
  { id: "curso", titulo: "O que você está estudando?", tipo: "texto", obrigatoria: true, ativa: true, icone: "school", placeholder: "Curso ou área (ex.: Administração)", teto: 120, quando: [{ pergunta: "momento", op: "em", valores: MOMENTO_CURSO }] },
  { id: "instituicao", titulo: "Onde você estuda?", tipo: "texto", obrigatoria: true, ativa: true, icone: "building", placeholder: "Nome da escola, faculdade ou instituição", teto: 120, quando: [{ pergunta: "momento", op: "em", valores: MOMENTO_ESTUDA }] },
  {
    id: "nivel", titulo: "Qual o nível do curso?", tipo: "unica", obrigatoria: true, ativa: true, quando: [{ pergunta: "ocupacao", op: "em", valores: ESTUDANDO }],
    opcoes: [
      { valor: "medio", label: "Ensino médio" },
      { valor: "tecnico", label: "Técnico" },
      { valor: "superior", label: "Superior", tag: "Ensino superior" },
      { valor: "pos", label: "Pós-graduação", tag: "Ensino superior" },
      { valor: "livre", label: "Curso livre" },
    ],
  },
  { id: "periodo", titulo: "Em que período ou ano você está?", tipo: "texto", obrigatoria: false, ativa: true, icone: "calendar", placeholder: "Ex.: 4º período, 2º ano", teto: 40, quando: [{ pergunta: "ocupacao", op: "em", valores: ESTUDANDO }] },
  {
    id: "modalidade", titulo: "Modalidade", tipo: "unica", obrigatoria: true, ativa: true, quando: [{ pergunta: "ocupacao", op: "em", valores: ESTUDANDO }],
    opcoes: [
      { valor: "presencial", label: "Presencial" },
      { valor: "ead", label: "EAD" },
      { valor: "hibrido", label: "Híbrido" },
    ],
  },
  {
    id: "escolaridade", titulo: "Até onde você estudou?", tipo: "unica", obrigatoria: true, ativa: true, quando: [{ pergunta: "ocupacao", op: "fora", valores: ESTUDANDO }],
    opcoes: [
      { valor: "fundamental", label: "Ensino fundamental" },
      { valor: "medio_incompleto", label: "Ensino médio incompleto" },
      { valor: "medio", label: "Ensino médio completo" },
      { valor: "tecnico", label: "Curso técnico" },
      { valor: "superior_incompleto", label: "Superior incompleto", tag: "Ensino superior" },
      { valor: "superior", label: "Superior completo", tag: "Ensino superior" },
    ],
  },

  // 04 · Sua experiência — trabalho atual OU experiência anterior
  { id: "empresa_atual", titulo: "Onde você trabalha?", tipo: "texto", obrigatoria: true, ativa: true, icone: "building", placeholder: "Nome da empresa", teto: 120, quando: [{ pergunta: "momento", op: "em", valores: MOMENTO_TRABALHA }] },
  { id: "cargo_atual", titulo: "Qual seu cargo ou função?", tipo: "texto", obrigatoria: true, ativa: true, icone: "briefcase", placeholder: "Ex.: Assistente administrativo", teto: 120, quando: [{ pergunta: "momento", op: "em", valores: MOMENTO_TRABALHA }] },
  { id: "tempo_atual", titulo: "Há quanto tempo trabalha lá?", tipo: "unica", obrigatoria: false, ativa: true, opcoes: TEMPO, quando: [{ pergunta: "momento", op: "em", valores: MOMENTO_TRABALHA }] },
  { id: "ja_trabalhou", titulo: "Você já trabalhou anteriormente?", tipo: "simnao", obrigatoria: true, ativa: true, opcoes: SIM_NAO, quando: [{ pergunta: "ocupacao", op: "em", valores: SEM_EMPREGO_ATUAL }] },
  { id: "ultima_ocupacao", titulo: "Qual foi sua última ocupação?", tipo: "texto", obrigatoria: true, ativa: true, icone: "briefcase", placeholder: "Ex.: Atendente", teto: 120, quando: [{ pergunta: "ja_trabalhou", op: "igual", valores: ["sim"] }] },
  { id: "ultima_empresa", titulo: "Onde trabalhou?", tipo: "texto", obrigatoria: false, ativa: true, icone: "building", placeholder: "Nome da empresa", teto: 120, quando: [{ pergunta: "ja_trabalhou", op: "igual", valores: ["sim"] }] },
  { id: "ultimo_tempo", titulo: "Por quanto tempo?", tipo: "unica", obrigatoria: true, ativa: true, opcoes: TEMPO, quando: [{ pergunta: "ja_trabalhou", op: "igual", valores: ["sim"] }] },

  // 05 · Disponibilidade
  {
    id: "horario", titulo: "Em quais horários você pode trabalhar?", tipo: "multipla", obrigatoria: true, ativa: true,
    opcoes: [
      { valor: "manha", label: "Manhã", icone: "sun" },
      { valor: "tarde", label: "Tarde", icone: "sun" },
      { valor: "noite", label: "Noite", icone: "moon" },
      { valor: "fds", label: "Fins de semana", icone: "calendar" },
    ],
  },
  {
    id: "jornada", titulo: "Que jornada você procura?", tipo: "unica", obrigatoria: true, ativa: true,
    opcoes: [
      { valor: "integral", label: "Período integral" },
      { valor: "meio", label: "Meio período" },
      { valor: "estagio", label: "Estágio" },
      { valor: "qualquer", label: "Qualquer uma" },
    ],
  },
  {
    id: "inicio", titulo: "Quando você pode começar?", tipo: "unica", obrigatoria: true, ativa: true,
    opcoes: [
      { valor: "imediato", label: "Imediatamente", tag: "Disponível imediatamente" },
      { valor: "15d", label: "Em até 15 dias" },
      { valor: "30d", label: "Em até 30 dias" },
      { valor: "mais_30d", label: "Mais de 30 dias" },
    ],
  },

  // 06 · Conte um pouco mais — uma por tela; as da vaga entram no começo
  {
    id: "como_conheceu", titulo: "Como você conheceu a *Tridi?*", tipo: "unica", obrigatoria: true, ativa: true,
    opcoes: [
      { valor: "instagram", label: "Instagram", icone: "brand-instagram" },
      { valor: "indicacao", label: "Indicação", icone: "users" },
      { valor: "google", label: "Google", icone: "brand-google" },
      { valor: "escola", label: "Escola/curso", icone: "school" },
      { valor: "ja_conhecia", label: "Já conhecia a empresa", icone: "building" },
      { valor: "outro", label: "Outro", icone: "dots" },
    ],
  },
  { id: "conhece_alguem", titulo: "Você conhece alguém que trabalha na empresa?", tipo: "simnao", obrigatoria: false, ativa: true, opcoes: SIM_NAO },
  { id: "conhece_quem", titulo: "Se sim, qual o nome?", tipo: "texto", obrigatoria: false, ativa: true, icone: "user", placeholder: "Nome de quem você conhece", teto: 120, quando: [{ pergunta: "conhece_alguem", op: "igual", valores: ["sim"] }] },
  {
    id: "tarefa", titulo: "Você recebe uma tarefa que nunca fez antes. *O que faz primeiro?*", tipo: "unica", obrigatoria: true, ativa: true,
    opcoes: [
      { valor: "espero", label: "Espero alguém me explicar exatamente como fazer", icone: "book" },
      { valor: "pergunto", label: "Pergunto tudo antes de começar", icone: "message" },
      { valor: "pesquiso", label: "Pesquiso, tento entender e depois tiro dúvidas específicas", icone: "search", certa: true },
      { valor: "comeco", label: "Começo de qualquer jeito e vou corrigindo", icone: "bolt" },
    ],
  },
  {
    id: "iniciativa", titulo: "Você percebe um problema que não é exatamente responsabilidade sua. *O que faz?*", tipo: "unica", obrigatoria: true, ativa: true,
    opcoes: [
      { valor: "deixo", label: "Deixo para quem é responsável resolver", icone: "users" },
      { valor: "aviso", label: "Aviso alguém e sigo meu trabalho", icone: "message" },
      { valor: "entendo", label: "Entendo o problema e tento levar uma possível solução", icone: "bulb", certa: true },
      { valor: "resolvo", label: "Resolvo sozinho sem comunicar ninguém", icone: "settings" },
    ],
  },
  {
    id: "social", titulo: "Quando você entra em um lugar ou grupo novo, você costuma esperar alguém te chamar ou *gosta de se aproximar e conhecer as pessoas?*",
    tipo: "unica", obrigatoria: true, ativa: true,
    opcoes: [
      { valor: "espero", label: "Espero alguém vir falar comigo", icone: "clock" },
      { valor: "observo", label: "Observo um pouco e depois me aproximo", icone: "eye" },
      { valor: "aproximo", label: "Gosto de me aproximar e conhecer as pessoas", icone: "users", certa: true },
      { valor: "depende", label: "Depende do lugar e das pessoas", icone: "dots" },
    ],
  },
  {
    id: "persistencia", titulo: "Quando alguma coisa não dá certo de primeira, *o que você costuma fazer?*", tipo: "unica", obrigatoria: true, ativa: true,
    opcoes: [
      { valor: "mesmo_jeito", label: "Tento novamente do mesmo jeito", icone: "refresh" },
      { valor: "entendo", label: "Procuro entender o que deu errado e tento de outra forma", icone: "chart-bar", certa: true },
      { valor: "ajuda", label: "Peço ajuda imediatamente", icone: "users" },
      { valor: "frustrado", label: "Fico um pouco frustrado, mas depois tento novamente", icone: "heart" },
      { valor: "desisto", label: "Costumo perder o interesse e partir para outra coisa", icone: "x" },
    ],
  },
  { id: "simplificacao", titulo: "Você prefere fazer algo de um jeito mais simples ou seguir exatamente o jeito que já foi feito antes? *Por quê?*", tipo: "longo", obrigatoria: true, ativa: true, placeholder: "Conte aqui…", teto: 1000 },
  { id: "priorizacao", titulo: "Quando você tem muitas coisas para fazer ao mesmo tempo, *como decide por onde começar?*", tipo: "longo", obrigatoria: true, ativa: true, placeholder: "Conte aqui…", teto: 1000 },
  { id: "motivo", titulo: "Por que você gostaria de trabalhar na Tridi?", tipo: "longo", obrigatoria: true, ativa: true, ajuda: "Não precisa escrever algo formal. Queremos entender o que realmente te chamou atenção.", placeholder: "Conte aqui…", teto: 1000 },
  { id: "orgulho", titulo: "Conte algo que você criou, melhorou ou resolveu e que te deu muito orgulho.", tipo: "longo", obrigatoria: true, ativa: true, ajuda: "Pode ser algo pequeno. O que importa é entender como você agiu.", placeholder: "Conte aqui…", teto: 1000 },

  // 07 · Seu currículo
  { id: "curriculo", titulo: "Currículo", tipo: "upload", obrigatoria: true, ativa: true, fixa: true },
];

/** Uma etapa = uma tela, igual às referências (N de 12 conta a abertura como 1). */
const tela = (id: string, rotulo: string, perguntas: string[], personagem: Pose | null, posicao: "esq" | "dir" | "centro", nota: string, extra: Partial<EtapaFormulario> = {}): EtapaFormulario =>
  ({ id, rotulo, titulo: "", ativa: true, uma_por_tela: true, perguntas, personagem, posicao, nota, ...extra });

export const ETAPAS_PADRAO: EtapaFormulario[] = [
  tela("nome", "Vamos começar", ["nome"], "ele-acenando", "dir", "Prazer em te conhecer!", { fixa: true }),
  tela("momento", "Seu momento", ["momento"], "ela-pensando", "esq", "Cada história conta!"),
  // Só aparece pra quem estuda e/ou trabalha — e só com as perguntas que valem.
  // Duas telas curtas em vez de uma longa: quem trabalha E estuda vê as duas.
  {
    id: "momento_estudo", rotulo: "Seu momento", titulo: "Sobre os *seus estudos*", ativa: true,
    perguntas: ["curso", "instituicao"],
    personagem: "ela-estudando", posicao: "esq", nota: "Aprender sempre leva mais longe!",
  },
  {
    id: "momento_trabalho", rotulo: "Seu momento", titulo: "Sobre o *seu trabalho*", ativa: true,
    perguntas: ["empresa_atual", "cargo_atual", "tempo_atual"],
    personagem: "ele-joinha", posicao: "dir", nota: "Toda experiência conta!",
  },
  // "Interesses" saiu do fluxo a pedido do dono (19/09/26) — fica guardada, desligada.
  tela("area", "Interesses", ["area"], "ele-joinha", "dir", "Aqui tem espaço pra você!", { ativa: false }),
  tela("aprender", "Aprendizado", ["aprender"], "ela-estudando", "esq", "Aprender sempre leva mais longe!"),
  tela("historia", "Sua história", ["historia"], "ele-acenando", "centro", "Cada experiência conta!", { nota_lado: "dir" }),
  tela("social", "Relacionamento", ["social"], "ele-acenando", "dir", "Toda conexão começa com um oi!"),
  tela("tarefa", "Como você pensa", ["tarefa"], "ela-pensando", "centro", "Sempre aprendendo mais!", { nota_lado: "esq" }),
  tela("iniciativa", "Iniciativa", ["iniciativa"], "ele-ideia", "centro", "Iniciativa também transforma!", { nota_lado: "esq" }),
  tela("persistencia", "Persistência", ["persistencia"], "ela-comemorando", "dir", "Erros também ensinam!"),
  tela("simplificacao", "Simplificação", ["simplificacao"], "ele-celular", "dir", "Boas ideias transformam!"),
  tela("priorizacao", "Priorização", ["priorizacao"], "ela-comemorando", "dir", "Organização hoje, grandes conquistas amanhã!"),
  tela("motivo", "Motivação", ["motivo"], "ela-comemorando", "esq", "Sonhos também constroem grandes carreiras!", { recebe_vaga: true }),
  tela("orgulho", "Na prática", ["orgulho"], "ele-joinha", "dir", "Atitude gera impacto!"),
  {
    id: "contato", rotulo: "Contato", titulo: "Como podemos *falar com você?*", ativa: true, fixa: true,
    sub: "Vamos usar essas informações para entrar em contato sobre os próximos passos da sua candidatura.",
    perguntas: ["email", "telefone"], personagem: "ele-celular", posicao: "esq", nota: "Assim fica mais fácil falar com você!",
  },
  {
    id: "origem", rotulo: "Origem e indicação", titulo: "Como você conheceu *a Tridi?*", ativa: true,
    perguntas: ["como_conheceu", "conhece_alguem", "conhece_quem"], personagem: "ela-curriculo", posicao: "dir", nota: "Indicações também fazem parte da nossa história!",
  },
  // Guardadas, desligadas: o fluxo condicional (ocupação → formação →
  // experiência → disponibilidade) e a indicação. O RH liga em Etapas.
  { id: "conhecer", rotulo: "Queremos conhecer você", titulo: "Conta um pouco *sobre você.*", ativa: false, perguntas: ["cidade", "idade", "ocupacao", "ocupacao_outro"], personagem: null },
  { id: "formacao", rotulo: "Sua formação", titulo: "Sobre os *seus estudos*", ativa: false, perguntas: ["nivel", "periodo", "modalidade", "escolaridade"], personagem: null },
  { id: "experiencia", rotulo: "Sua experiência", titulo: "Sua *experiência* até aqui", ativa: false, perguntas: ["ja_trabalhou", "ultima_ocupacao", "ultima_empresa", "ultimo_tempo"], personagem: null },
  { id: "disponibilidade", rotulo: "Disponibilidade", titulo: "Quando e como *você pode trabalhar?*", ativa: false, perguntas: ["horario", "jornada", "inicio"], personagem: null },
  {
    id: "curriculo", rotulo: "Currículo", titulo: "Agora sim: *envie seu currículo.*", sub: "Aceitamos PDF, Word ou uma foto do currículo.",
    ativa: true, fixa: true, perguntas: ["curriculo"], personagem: "ela-curriculo", posicao: "dir", nota: "Seu futuro começa aqui!",
  },
];

export const FORMULARIO_PADRAO: ConfigFormulario = {
  versao: 2,
  abertura: {
    ativa: true,
    titulo: "Queremos conhecer mais do *que o seu currículo.*",
    sub: "São algumas perguntas rápidas para entendermos como você pensa, aprende e onde pode se encaixar melhor por aqui.",
    destaques: [
      { icone: "school", titulo: "Aqui você não precisa saber tudo.", sub: "Mas precisa aprender." },
      { icone: "chart-bar", titulo: "Você vai ter autonomia.", sub: "Mas autonomia vem acompanhada de responsabilidade." },
      { icone: "users", titulo: "Estamos construindo vários projetos.", sub: "Quem entra hoje pode crescer junto com eles." },
    ],
    personagem: "ela-pensando",
    nota: "Bora nessa?",
  },
  final: {
    titulo: "Candidatura concluída, *{nome}.*",
    sub: "Seu currículo mostra sua trajetória. Suas respostas ajudam a mostrar como você pensa e onde pode chegar.",
    proximo: "Se houver compatibilidade com alguma oportunidade, nosso time entra em contato.",
    personagem: "ela-comemorando",
    nota: "Obrigado por fazer parte dessa jornada!",
  },
  logo_url: null,
  personagens: true,
  etapas: ETAPAS_PADRAO,
  perguntas: PERGUNTAS_PADRAO,
};

/** As perguntas que não podem sumir — sem elas o candidato não chega inteiro. */
export const PERGUNTAS_FIXAS = PERGUNTAS_PADRAO.filter((p) => p.fixa).map((p) => p.id);

// ── Normalização (o que vem do banco nunca é confiável) ──────────────────────

const ID_OK = /^[a-z][a-z0-9_]{0,39}$/;
const txt = (v: unknown, max: number, padrao = "") => (typeof v === "string" ? v.slice(0, max) : padrao);
const ehTipo = (v: unknown): v is TipoPergunta => TIPOS_PERGUNTA.some((t) => t.valor === v);
const ehOp = (v: unknown): v is OperadorCondicao => OPERADORES.some((o) => o.valor === v);

export const idDePergunta = (base: string) =>
  (base.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "p_$1") || "pergunta").slice(0, 32);

function normalizarOpcoes(v: unknown): Opcao[] {
  if (!Array.isArray(v)) return [];
  const vistos = new Set<string>();
  const out: Opcao[] = [];
  for (const o of v.slice(0, 30)) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    const label = txt(r.label, 160).trim();
    if (!label) continue;
    let valor = txt(r.valor, 40).trim() || idDePergunta(label);
    while (vistos.has(valor)) valor += "_";
    vistos.add(valor);
    const op: Opcao = { valor, label };
    if (typeof r.icone === "string" && r.icone) op.icone = r.icone.slice(0, 40);
    const tag = txt(r.tag, 40).trim();
    if (tag) op.tag = tag;
    if (r.certa === true) op.certa = true;
    out.push(op);
  }
  return out;
}

function normalizarCondicoes(v: unknown): Condicao[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Condicao[] = [];
  for (const c of v.slice(0, 5)) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    const pergunta = txt(r.pergunta, 40);
    if (!ID_OK.test(pergunta) || !ehOp(r.op)) continue;
    const valores = Array.isArray(r.valores) ? r.valores.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 40)).slice(0, 30) : [];
    out.push({ pergunta, op: r.op, ...(r.op === "preenchido" ? {} : { valores }) });
  }
  return out.length ? out : undefined;
}

/** Uma pergunta crua → pergunta válida, ou `null`. `base` é a do sistema, quando existe. */
export function normalizarPergunta(v: unknown, base?: Pergunta): Pergunta | null {
  if (!v || typeof v !== "object") return base ?? null;
  const r = v as Record<string, unknown>;
  const id = base?.id ?? txt(r.id, 40);
  if (!ID_OK.test(id)) return null;
  const tipo = base?.fixa ? base.tipo : ehTipo(r.tipo) && !TIPOS_PERGUNTA.find((t) => t.valor === r.tipo)?.so_sistema ? r.tipo : base?.tipo ?? "texto";
  const titulo = txt(r.titulo, 300).trim() || base?.titulo || "";
  if (!titulo) return null;
  const p: Pergunta = {
    id, titulo, tipo,
    obrigatoria: base?.fixa && base.coluna ? true : r.obrigatoria === true,
    ativa: base?.fixa ? true : r.ativa !== false,
  };
  const ajuda = txt(r.ajuda, 300).trim(); if (ajuda) p.ajuda = ajuda;
  const placeholder = txt(r.placeholder, 160).trim(); if (placeholder) p.placeholder = placeholder;
  if (typeof r.teto === "number" && r.teto > 0) p.teto = Math.min(5000, Math.round(r.teto));
  else if (tipo === "longo") p.teto = 1000;
  else if (tipo === "texto") p.teto = 160;
  if (typeof r.min === "number" && Number.isFinite(r.min)) p.min = r.min;
  if (typeof r.max === "number" && Number.isFinite(r.max)) p.max = r.max;
  if (temOpcoes(tipo)) {
    const ops = normalizarOpcoes(r.opcoes);
    // Sim/Não tem sempre as duas opções; só a etiqueta de cada uma muda.
    p.opcoes = tipo === "simnao"
      ? SIM_NAO.map((s) => {
        const o = ops.find((x) => x.valor === s.valor);
        return { ...s, ...(o?.tag ? { tag: o.tag } : {}), ...(o?.certa ? { certa: true } : {}) };
      })
      : ops.length ? ops : base?.opcoes ?? [];
  }
  const quando = normalizarCondicoes(r.quando);
  if (quando) p.quando = quando;
  if (typeof r.icone === "string" && r.icone) p.icone = r.icone.slice(0, 40);
  else if (base?.icone) p.icone = base.icone;
  if (base?.fixa) p.fixa = true;
  // Coluna própria (nome, contato, cidade) vem sempre do padrão, fixa ou não.
  if (base?.coluna) p.coluna = base.coluna;
  if (base?.autocomplete) p.autocomplete = base.autocomplete;
  return p;
}

/**
 * Config crua do banco → config válida. Garante as perguntas fixas, tira
 * pergunta duplicada ou órfã, e põe numa etapa qualquer pergunta que ficou
 * sem casa. Idempotente: normalizar duas vezes dá o mesmo.
 */
export function normalizarFormulario(bruto: unknown): ConfigFormulario {
  const P = FORMULARIO_PADRAO;
  if (!bruto || typeof bruto !== "object") return structuredClone(P);
  const r = bruto as Record<string, unknown>;

  // Perguntas: as do banco na ordem do banco; as fixas que faltarem voltam.
  const porId = new Map<string, Pergunta>();
  const brutas = Array.isArray(r.perguntas) ? r.perguntas.slice(0, 120) : P.perguntas;
  for (const b of brutas) {
    const id = b && typeof b === "object" ? (b as Record<string, unknown>).id : null;
    const base = typeof id === "string" ? P.perguntas.find((x) => x.id === id) : undefined;
    const p = normalizarPergunta(b, base);
    if (p && !porId.has(p.id)) porId.set(p.id, p);
  }
  for (const f of P.perguntas.filter((x) => x.fixa)) if (!porId.has(f.id)) porId.set(f.id, structuredClone(f));

  // Etapas: as do banco; as fixas que faltarem voltam, na posição padrão.
  const etapas: EtapaFormulario[] = [];
  const vistas = new Set<string>();
  const usadas = new Set<string>();
  const brutasE = Array.isArray(r.etapas) ? r.etapas.slice(0, 32) : P.etapas;
  for (const b of brutasE) {
    if (!b || typeof b !== "object") continue;
    const e = b as Record<string, unknown>;
    const id = txt(e.id, 40);
    if (!ID_OK.test(id) || vistas.has(id)) continue;
    const base = P.etapas.find((x) => x.id === id);
    const perguntas = (Array.isArray(e.perguntas) ? e.perguntas : [])
      .filter((x): x is string => typeof x === "string" && porId.has(x) && !usadas.has(x));
    for (const x of perguntas) usadas.add(x);
    vistas.add(id);
    etapas.push({
      id,
      rotulo: txt(e.rotulo, 60).trim() || base?.rotulo || "Etapa",
      titulo: txt(e.titulo, 200).trim() || base?.titulo || "",
      ...(txt(e.sub, 300).trim() ? { sub: txt(e.sub, 300).trim() } : {}),
      ativa: base?.fixa ? true : e.ativa !== false,
      perguntas,
      ...(e.uma_por_tela === true ? { uma_por_tela: true } : {}),
      ...(e.recebe_vaga === true ? { recebe_vaga: true } : {}),
      personagem: ehPose(e.personagem) ? e.personagem : null,
      ...(e.posicao === "esq" || e.posicao === "dir" || e.posicao === "centro" ? { posicao: e.posicao } : {}),
      ...(e.nota_lado === "esq" || e.nota_lado === "dir" ? { nota_lado: e.nota_lado } : {}),
      ...(txt(e.nota, 80).trim() ? { nota: txt(e.nota, 80).trim() } : {}),
      ...(base?.fixa ? { fixa: true } : {}),
    });
  }
  for (const [k, f] of P.etapas.entries()) {
    if (!f.fixa || vistas.has(f.id)) continue;
    const livres = f.perguntas.filter((x) => !usadas.has(x) && porId.has(x));
    for (const x of livres) usadas.add(x);
    etapas.splice(Math.min(k, etapas.length), 0, { ...structuredClone(f), perguntas: livres });
    vistas.add(f.id);
  }
  // Fixa fora da etapa dela (movida por engano) volta pra casa; a upload do
  // currículo mora SEMPRE na etapa do currículo.
  for (const f of P.perguntas.filter((x) => x.fixa)) {
    if (usadas.has(f.id)) continue;
    // A etapa de casa pode ter sido tirada (ex.: "conhecer"): aí vai pra
    // primeira etapa que não é a do currículo.
    const casa = P.etapas.find((e) => e.perguntas.includes(f.id))!;
    const destino = f.tipo === "upload"
      ? etapas.find((e) => e.id === "curriculo")!
      : etapas.find((e) => e.id === casa.id) ?? etapas.find((e) => e.id !== "curriculo") ?? etapas[0];
    destino.perguntas.push(f.id);
    usadas.add(f.id);
  }
  // Pergunta sem etapa vai pra "Conte um pouco mais" (ou a penúltima).
  const sobra = [...porId.keys()].filter((id) => !usadas.has(id));
  if (sobra.length) (etapas.find((e) => e.id === "motivo") ?? etapas.at(-2) ?? etapas[0]).perguntas.push(...sobra);
  // Uma etapa só recebe as perguntas da vaga.
  const comVaga = etapas.filter((e) => e.recebe_vaga);
  if (comVaga.length !== 1) {
    for (const e of etapas) delete e.recebe_vaga;
    (etapas.find((e) => e.id === "motivo") ?? etapas.find((e) => e.id !== "curriculo" && e.id !== "dados") ?? etapas[0]).recebe_vaga = true;
  }
  // O currículo é sempre a última etapa.
  const iCv = etapas.findIndex((e) => e.id === "curriculo");
  if (iCv >= 0 && iCv !== etapas.length - 1) etapas.push(...etapas.splice(iCv, 1));

  const ab = (r.abertura && typeof r.abertura === "object" ? r.abertura : {}) as Record<string, unknown>;
  const fim = (r.final && typeof r.final === "object" ? r.final : {}) as Record<string, unknown>;
  const destaques = Array.isArray(ab.destaques)
    ? ab.destaques.slice(0, 4).map((d) => {
      const x = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
      return { icone: txt(x.icone, 40) || "sparkles", titulo: txt(x.titulo, 120).trim(), sub: txt(x.sub, 160).trim() };
    }).filter((d) => d.titulo)
    : P.abertura.destaques;
  const logo = txt(r.logo_url, 500).trim();

  return {
    versao: 2,
    abertura: {
      ativa: ab.ativa !== false,
      titulo: txt(ab.titulo, 200).trim() || P.abertura.titulo,
      sub: typeof ab.sub === "string" ? ab.sub.slice(0, 400) : P.abertura.sub,
      destaques,
      personagem: "personagem" in ab ? (ehPose(ab.personagem) ? ab.personagem : null) : P.abertura.personagem,
      nota: typeof ab.nota === "string" ? ab.nota.slice(0, 80) : P.abertura.nota,
    },
    final: {
      titulo: txt(fim.titulo, 200).trim() || P.final.titulo,
      sub: typeof fim.sub === "string" ? fim.sub.slice(0, 400) : P.final.sub,
      proximo: typeof fim.proximo === "string" ? fim.proximo.slice(0, 400) : P.final.proximo,
      personagem: "personagem" in fim ? (ehPose(fim.personagem) ? fim.personagem : null) : P.final.personagem,
      nota: typeof fim.nota === "string" ? fim.nota.slice(0, 80) : P.final.nota,
    },
    logo_url: /^(https:\/\/|\/)[^\s"'<>]+$/.test(logo) ? logo : null,
    personagens: r.personagens !== false,
    etapas,
    perguntas: [...porId.values()],
  };
}

/** Perguntas específicas de uma vaga (jsonb de `rh_vagas.perguntas`). Chave com prefixo `v_`. */
export function normalizarPerguntasDaVaga(v: unknown): Pergunta[] {
  if (!Array.isArray(v)) return [];
  const out: Pergunta[] = [];
  const ids = new Set<string>();
  for (const b of v.slice(0, 20)) {
    const p = normalizarPergunta(b);
    if (!p || p.tipo === "upload") continue;
    if (!p.id.startsWith("v_")) p.id = `v_${p.id}`.slice(0, 40);
    if (ids.has(p.id)) continue;
    ids.add(p.id);
    delete p.fixa; delete p.coluna;
    out.push(p);
  }
  return out;
}

// ── Condições e telas ────────────────────────────────────────────────────────

const vazio = (v: Valor | undefined) => v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");
const comoLista = (v: Valor | undefined): string[] => (v == null ? [] : Array.isArray(v) ? v : [String(v)]);

export function condicaoBate(c: Condicao, v: Valor | undefined): boolean {
  const lista = comoLista(v);
  const alvo = c.valores ?? [];
  switch (c.op) {
    case "preenchido": return !vazio(v);
    case "igual": return lista.length > 0 && lista.every((x) => alvo.includes(x)) && alvo.some((x) => lista.includes(x));
    case "diferente": return !(lista.length > 0 && alvo.some((x) => lista.includes(x)));
    case "em": return lista.some((x) => alvo.includes(x));
    case "fora": return !lista.some((x) => alvo.includes(x));
  }
}

/** Todas as perguntas da config + as da vaga, por id. */
function catalogo(cfg: ConfigFormulario, daVaga: Pergunta[]): Map<string, Pergunta> {
  const m = new Map<string, Pergunta>();
  for (const p of cfg.perguntas) m.set(p.id, p);
  for (const p of daVaga) if (!m.has(p.id)) m.set(p.id, p);
  return m;
}

/** As perguntas de cada etapa ativa, na ordem, com as da vaga no lugar certo. */
export function perguntasPorEtapa(cfg: ConfigFormulario, daVaga: Pergunta[] = []): { etapa: EtapaFormulario; perguntas: Pergunta[] }[] {
  const cat = catalogo(cfg, daVaga);
  return cfg.etapas.filter((e) => e.ativa).map((etapa) => ({
    etapa,
    perguntas: [
      ...(etapa.recebe_vaga ? daVaga : []),
      ...etapa.perguntas.map((id) => cat.get(id)).filter((p): p is Pergunta => !!p && p.ativa),
    ],
  }));
}

/**
 * Quem está VISÍVEL com estas respostas. Em ordem: uma pergunta cuja
 * condição aponta pra outra escondida trata a outra como vazia — a resposta
 * velha de uma pergunta que sumiu não reabre nada.
 */
export function visiveis(cfg: ConfigFormulario, r: Respostas, daVaga: Pergunta[] = []): Set<string> {
  const on = new Set<string>();
  for (const { perguntas } of perguntasPorEtapa(cfg, daVaga)) {
    for (const p of perguntas) {
      const ok = (p.quando ?? []).every((c) => condicaoBate(c, on.has(c.pergunta) ? r[c.pergunta] : undefined));
      if (ok) on.add(p.id);
    }
  }
  return on;
}

export interface Tela {
  etapa: EtapaFormulario;
  /** Posição da etapa entre as que têm alguma pergunta visível (0-based). */
  numero: number;
  perguntas: Pergunta[];
  /** A primeira tela da etapa (é onde o personagem aparece). */
  primeira: boolean;
}

/**
 * As telas do formulário para estas respostas. Etapa sem pergunta visível
 * some (quem não estuda nem vê "Sua formação" se o RH desligar a
 * escolaridade). Em `uma_por_tela`, a pergunta condicionada a outra da mesma
 * tela vem junto dela ("Conhece alguém? Sim → Qual o nome?").
 */
export function telasDoFormulario(cfg: ConfigFormulario, r: Respostas, daVaga: Pergunta[] = []): { telas: Tela[]; totalEtapas: number } {
  const on = visiveis(cfg, r, daVaga);
  const telas: Tela[] = [];
  let numero = 0;
  for (const { etapa, perguntas } of perguntasPorEtapa(cfg, daVaga)) {
    const vis = perguntas.filter((p) => on.has(p.id));
    if (!vis.length) continue;
    if (!etapa.uma_por_tela) {
      telas.push({ etapa, numero, perguntas: vis, primeira: true });
    } else {
      // Agrupa com a condição olhando a pergunta ORIGINAL (não só as
      // visíveis): "Qual o nome?" fica na tela do "Conhece alguém?" mesmo
      // antes de aparecer, então a tela não muda de tamanho ao responder.
      const grupos: Pergunta[][] = [];
      for (const p of perguntas) {
        const ultimo = grupos.at(-1);
        const dependeDoGrupo = !!ultimo && (p.quando ?? []).some((c) => ultimo.some((q) => q.id === c.pergunta));
        if (dependeDoGrupo) ultimo!.push(p); else grupos.push([p]);
      }
      let primeira = true;
      for (const g of grupos) {
        const gv = g.filter((p) => on.has(p.id));
        if (!gv.length) continue;
        telas.push({ etapa, numero, perguntas: gv, primeira });
        primeira = false;
      }
    }
    numero++;
  }
  return { telas, totalEtapas: numero };
}

// ── Validação ────────────────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const soDigitos = (v: string) => v.replace(/\D+/g, "");
const semEstrela = (t: string) => t.replace(/\*/g, "").trim();

/** O que falta numa pergunta — `null` quando está boa. */
export function pendenciaDaPergunta(p: Pergunta, v: Valor | undefined): string | null {
  const s = Array.isArray(v) ? "" : String(v ?? "").trim();
  if (vazio(v)) return p.obrigatoria ? (temOpcoes(p.tipo) ? `${semEstrela(p.titulo)}: escolha uma opção.` : p.tipo === "upload" ? `${semEstrela(p.titulo)}: envie o arquivo.` : `${semEstrela(p.titulo)}: preencha para continuar.`) : null;
  switch (p.tipo) {
    case "email": return EMAIL.test(s) ? null : "Informe um e-mail válido.";
    case "telefone": { const d = soDigitos(s); return d.length >= 10 && d.length <= 13 ? null : "Informe um WhatsApp com DDD."; }
    case "numero": {
      const n = Number(s.replace(",", "."));
      if (!Number.isFinite(n)) return `${semEstrela(p.titulo)}: digite um número.`;
      if (p.min != null && n < p.min) return `${semEstrela(p.titulo)}: mínimo de ${p.min}.`;
      if (p.max != null && n > p.max) return `${semEstrela(p.titulo)}: máximo de ${p.max}.`;
      return null;
    }
    case "data": return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? null : `${semEstrela(p.titulo)}: data inválida.`;
    case "unica": case "simnao":
      return (p.opcoes ?? []).some((o) => o.valor === s) ? null : `${semEstrela(p.titulo)}: escolha uma opção.`;
    case "multipla": {
      const lista = comoLista(v);
      return lista.every((x) => (p.opcoes ?? []).some((o) => o.valor === x)) ? null : `${semEstrela(p.titulo)}: opção inválida.`;
    }
    case "texto": case "longo":
      return p.teto && s.length > p.teto ? `${semEstrela(p.titulo)}: máximo de ${p.teto} caracteres.` : null;
    case "upload":
      return /^[\w./-]{8,200}$/.test(s) ? null : `${semEstrela(p.titulo)}: envie o arquivo de novo.`;
  }
}

export function pendenciaDaTela(t: Tela, r: Respostas): string | null {
  for (const p of t.perguntas) {
    const e = pendenciaDaPergunta(p, r[p.id]);
    if (e) return e;
  }
  return null;
}

/** Tudo o que está visível, de uma vez — é o que o servidor confere. */
export function pendenciaDoEnvio(cfg: ConfigFormulario, r: Respostas, daVaga: Pergunta[] = []): string | null {
  for (const t of telasDoFormulario(cfg, r, daVaga).telas) {
    const e = pendenciaDaTela(t, r);
    if (e) return `${t.etapa.rotulo} · ${e}`;
  }
  return null;
}

/** Só as respostas visíveis, limpas e com teto — o resto é descartado. */
export function limparRespostas(cfg: ConfigFormulario, bruto: unknown, daVaga: Pergunta[] = []): Respostas {
  const c = (bruto && typeof bruto === "object" && !Array.isArray(bruto) ? bruto : {}) as Record<string, unknown>;
  const cat = catalogo(cfg, daVaga);
  const pre: Respostas = {};
  for (const [id, p] of cat) {
    const v = c[id];
    if (p.tipo === "multipla") {
      if (Array.isArray(v)) pre[id] = v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 60)).slice(0, 30);
    } else if (typeof v === "string") pre[id] = v.trim().slice(0, p.teto ?? 300);
    else if (typeof v === "number" && Number.isFinite(v)) pre[id] = String(v);
  }
  const on = visiveis(cfg, pre, daVaga);
  return Object.fromEntries(Object.entries(pre).filter(([id, v]) => on.has(id) && !vazio(v)));
}

// ── O que o RH lê ────────────────────────────────────────────────────────────

/** Pergunta legível de uma chave — das perguntas atuais, ou a chave arrumada. */
export function perguntaDe(chave: string, cfg: ConfigFormulario = FORMULARIO_PADRAO): string {
  const p = cfg.perguntas.find((x) => x.id === chave) ?? PERGUNTAS_PADRAO.find((x) => x.id === chave);
  if (p) return semEstrela(p.titulo);
  return chave.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function rotuloDe(p: Pergunta, v: Valor | undefined): string {
  if (vazio(v)) return "";
  if (temOpcoes(p.tipo)) {
    return comoLista(v).map((x) => p.opcoes?.find((o) => o.valor === x)?.label ?? x).join(", ");
  }
  if (p.tipo === "data") { const s = String(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join("/") : s; }
  return Array.isArray(v) ? v.join(", ") : String(v);
}

/**
 * As respostas na ordem do formulário, com a pergunta por extenso, o rótulo
 * da opção e a ETAPA de onde vieram — é por ela que o perfil do candidato
 * separa "Formação", "Experiência", "Disponibilidade". Os campos com coluna
 * própria (nome, contato, cidade) e o upload do currículo ficam fora.
 */
export function respostasLegiveis(
  cfg: ConfigFormulario, r: Respostas, daVaga: Pergunta[] = [], nomesDeArquivo: Record<string, string> = {},
): { chave: string; pergunta: string; resposta: string; etapa: string }[] {
  const on = visiveis(cfg, r, daVaga);
  const out: { chave: string; pergunta: string; resposta: string; etapa: string }[] = [];
  for (const { etapa, perguntas } of perguntasPorEtapa(cfg, daVaga)) {
    for (const p of perguntas) {
      if (!on.has(p.id) || p.coluna || p.id === "curriculo") continue;
      const resposta = p.tipo === "upload" ? nomesDeArquivo[p.id] ?? "Arquivo anexado" : rotuloDe(p, r[p.id]);
      if (!resposta) continue;
      out.push({ chave: p.id, pergunta: semEstrela(p.titulo), resposta, etapa: p.id.startsWith("v_") ? "vaga" : etapa.id });
    }
  }
  return out;
}

// ── A triagem: o resumo e as etiquetas do candidato ─────────────────────────

export interface PerfilCandidato {
  /** "Estou estudando" — o rótulo da ocupação. */
  ocupacao: string | null;
  /** "Administração — 4º período · Uninove (EAD)" */
  formacao: string | null;
  /** "Assistente administrativo · Empresa X · 1 a 2 anos" */
  experiencia: string | null;
  /** Nível: "Superior", "Ensino médio completo"… — é o filtro de escolaridade. */
  escolaridade?: string | null;
  /** Acertos nas perguntas com gabarito (visíveis pra esta pessoa). */
  acertos?: number;
  /** Quantas perguntas com gabarito ela respondeu. 0 = nada a pontuar. */
  pontuaveis?: number;
  /** "Manhã, Tarde · Período integral · Imediatamente" */
  disponibilidade: string | null;
  tags: string[];
}

export const PERFIL_VAZIO: PerfilCandidato = { ocupacao: null, formacao: null, experiencia: null, disponibilidade: null, tags: [] };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "para", "com", "e", "em", "auxiliar", "assistente", "jovem", "aprendiz", "estagio", "estagiario", "vaga"]);

/**
 * Função PURA. O que o RH precisa ver sem abrir o perfil: ocupação,
 * formação, experiência, disponibilidade e as etiquetas. Etiqueta vem de
 * três lugares — a regra fixa (estudando, sem experiência, currículo), a
 * experiência relacionada à vaga (palavra do título da vaga no cargo), e a
 * `tag` que o RH pôs em qualquer opção na configuração.
 */
export function perfilDoCandidato(
  cfg: ConfigFormulario, r: Respostas, opts: { daVaga?: Pergunta[]; vaga?: string | null; temCurriculo?: boolean } = {},
): PerfilCandidato {
  const daVaga = opts.daVaga ?? [];
  const cat = catalogo(cfg, daVaga);
  const on = visiveis(cfg, r, daVaga);
  const val = (id: string) => (on.has(id) ? r[id] : undefined);
  const rot = (id: string) => { const p = cat.get(id); return p ? rotuloDe(p, val(id)) : ""; };
  const junta = (...xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).join(" · ") || null;

  const ocupacao = rot("ocupacao") || rot("momento") || null;

  let formacao: string | null = null;
  if (!vazio(val("curso"))) {
    const curso = [rot("curso"), rot("periodo")].filter(Boolean).join(" — ");
    const onde = rot("instituicao") ? `${rot("instituicao")}${rot("modalidade") ? ` (${rot("modalidade")})` : ""}` : rot("modalidade");
    formacao = junta(curso, onde);
  } else if (!vazio(val("escolaridade"))) formacao = rot("escolaridade");

  let experiencia: string | null = null;
  const cargo = String(val("cargo_atual") ?? val("ultima_ocupacao") ?? "").trim();
  if (!vazio(val("cargo_atual"))) experiencia = junta(rot("cargo_atual"), rot("empresa_atual"), rot("tempo_atual"));
  else if (val("ja_trabalhou") === "sim") experiencia = junta(rot("ultima_ocupacao"), rot("ultima_empresa"), rot("ultimo_tempo"));
  else if (val("ja_trabalhou") === "nao") experiencia = "Primeiro emprego";

  const disponibilidade = junta(rot("horario"), rot("jornada"), rot("inicio"));

  const tags: string[] = [];
  const add = (t: string) => { if (t && !tags.includes(t)) tags.push(t); };
  // Etiquetas das opções escolhidas (inclui a da ocupação: "Estudando"…)
  for (const id of on) {
    const p = cat.get(id);
    if (!p || !temOpcoes(p.tipo)) continue;
    for (const x of comoLista(r[id])) { const t = p.opcoes?.find((o) => o.valor === x)?.tag; if (t) add(t); }
  }
  if (!vazio(val("cargo_atual")) || val("ja_trabalhou") === "sim") add("Com experiência");
  else if (val("ja_trabalhou") === "nao") add("Sem experiência");
  if (cargo && opts.vaga) {
    const palavras = norm(opts.vaga).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !PALAVRAS_VAZIAS.has(w));
    const c = norm(cargo);
    if (palavras.some((w) => c.includes(w.slice(0, Math.max(4, w.length - 2))))) add("Experiência na área");
  }
  if (opts.temCurriculo) add("Currículo enviado");

  const escolaridade = rot("nivel") || rot("escolaridade") || null;

  // A nota: perguntas de escolha com alguma opção marcada como certa. Múltipla
  // escolha acerta quando marcou TODAS as certas e nenhuma errada.
  let acertos = 0, pontuaveis = 0;
  for (const id of on) {
    const p = cat.get(id);
    if (!p || !temOpcoes(p.tipo)) continue;
    const certas = (p.opcoes ?? []).filter((o) => o.certa).map((o) => o.valor);
    if (!certas.length || vazio(r[id])) continue;
    pontuaveis++;
    const marcadas = comoLista(r[id]);
    if (marcadas.length === certas.length && marcadas.every((x) => certas.includes(x))) acertos++;
  }
  return { ocupacao, formacao, experiencia, escolaridade, disponibilidade, tags, acertos, pontuaveis };
}

/** O título com o miolo em `*…*` separado, pra tela pintar de roxo. `{nome}` é trocado. */
export function partesDoTitulo(titulo: string, vars: Record<string, string> = {}): { texto: string; destaque: boolean }[] {
  const comVars = titulo.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
  return comVars.split("*").map((texto, i) => ({ texto, destaque: i % 2 === 1 })).filter((p) => p.texto);
}

// ── Carimbos do navegador ────────────────────────────────────────────────────

/** Horas até a mesma pessoa poder enviar de novo (o servidor confere pelo contato). */
export const JANELA_REENVIO_H = 24;
export const CHAVE_ENVIADO = "cd:enviado_em";
/** Rascunho (respostas + tela). `v2`: o formato de antes não serve mais. */
export const CHAVE_RASCUNHO = "cd:rascunho:v2";

/**
 * A config SEM o gabarito — é a única que pode ir pro navegador do candidato
 * (a página pública e `/api/candidatura/config`). Com o `certa` visível no
 * HTML, qualquer um abria o código-fonte e marcava a resposta "certa".
 */
export function semGabarito(cfg: ConfigFormulario): ConfigFormulario {
  const limpa = (p: Pergunta): Pergunta => (p.opcoes?.some((o) => o.certa)
    ? { ...p, opcoes: p.opcoes.map(({ certa: _c, ...o }) => { void _c; return o; }) }
    : p);
  return { ...cfg, perguntas: cfg.perguntas.map(limpa) };
}
export const perguntasSemGabarito = (ps: Pergunta[]): Pergunta[] => semGabarito({ ...FORMULARIO_PADRAO, perguntas: ps }).perguntas;
