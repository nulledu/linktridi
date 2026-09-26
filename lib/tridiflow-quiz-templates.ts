// ── TridiFlow · templates de QUIZ ────────────────────────────────────────────
// O equivalente de `tridiflow-templates.ts` (chat) e `tridiflow-pagina-templates.ts`
// (página) para o funil de etapas.
//
// Cada template já nasce com pergunta, opção E TAG preenchidas. A tag é o que
// faz a segmentação chegar no webhook e no CRM sem ninguém configurar nada
// (ver CHAVE_TAGS em tridiflow-quiz.ts), e é justamente o campo que a pessoa
// esquece de preencher quando começa do zero — por isso vem pronto.
//
// Puro e client-safe: nada daqui toca banco ou rede.

import { novaEtapa, uidQuiz, type Quiz, type QuizOpcao, type QuizStep } from "./tridiflow-quiz";

const op = (label: string, tag: string, icone?: string): QuizOpcao => ({ id: uidQuiz(), label, tag, icone });

/** Etapa a partir do padrão do tipo, com os campos que o template sobrescreve.
 *  Herdar de `novaEtapa` evita que um campo novo do modelo nasça vazio aqui. */
const etapa = (tipo: QuizStep["tipo"], patch: Partial<QuizStep>, indice = 0): QuizStep =>
  ({ ...novaEtapa(tipo, indice), ...patch, id: uidQuiz() });

// ── Diagnóstico ──────────────────────────────────────────────────────────────
// O formato clássico de funil de quiz: a pessoa se descreve, o funil "analisa"
// e devolve um plano. A captura de contato vem DEPOIS das perguntas fáceis —
// pedir e-mail na primeira tela derruba a taxa de início.
const DIAGNOSTICO = (): Quiz => ({
  titulo: "Diagnóstico personalizado",
  progresso: true,
  steps: [
    etapa("cover", {
      headline: "Descubra em 2 minutos o que está travando o seu resultado",
      subheadline: "São 4 perguntas rápidas. No fim você recebe um diagnóstico feito pra sua situação.",
      botao: "Começar o diagnóstico",
    }),
    etapa("single_choice", {
      pergunta: "Onde você está hoje?",
      variavel: "momento",
      obrigatorio: true,
      opcoes: [
        op("Ainda não comecei", "momento_zero"),
        op("Comecei, mas travei", "momento_travado"),
        op("Já tenho resultado e quero escalar", "momento_escala"),
      ],
    }),
    etapa("single_choice", {
      pergunta: "O que mais te atrapalha agora?",
      variavel: "dor",
      obrigatorio: true,
      opcoes: [
        op("Falta de tempo", "dor_tempo"),
        op("Falta de clareza no que fazer", "dor_clareza"),
        op("Falta de dinheiro pra investir", "dor_verba"),
        op("Tento, mas não sai do lugar", "dor_execucao"),
      ],
    }),
    etapa("multiple_choice", {
      pergunta: "O que você já tentou? (pode marcar mais de uma)",
      variavel: "tentativas",
      opcoes: [
        op("Cursos e conteúdo gratuito", "tentou_conteudo"),
        op("Contratei alguém pra fazer", "tentou_terceiro"),
        op("Fiz por conta própria", "tentou_sozinho"),
        op("Ainda não tentei nada", "tentou_nada"),
      ],
    }),
    etapa("text", {
      pergunta: "Pra onde eu mando o seu diagnóstico?",
      ajuda: "Só uso pra te enviar o resultado.",
      variavel: "email",
      formato: "email",
      placeholder: "nome@email.com",
      obrigatorio: true,
      microFeedback: "Perfeito, montando o seu diagnóstico…",
    }),
    etapa("transition", {
      carregando: "Cruzando as suas respostas…",
      duracaoMs: 2800,
      provaSocial: [
        "Mais de 5.000 diagnósticos gerados este mês.",
        "94% das pessoas descobrem o gargalo já na primeira leitura.",
      ],
    }),
    etapa("offer", {
      titulo: "Seu diagnóstico está pronto",
      descricao: "Com base no que você respondeu, este é o caminho mais curto pro seu caso.",
      cta: "Ver o meu plano",
      resumo: true,
    }),
  ],
});

// ── Qualificação ─────────────────────────────────────────────────────────────
// Feito pra alimentar time comercial: separa quem tem verba e urgência de quem
// está só olhando, e termina pedindo o WhatsApp.
const QUALIFICACAO = (): Quiz => ({
  titulo: "Qualificação de lead",
  progresso: true,
  steps: [
    etapa("cover", {
      headline: "Veja se a nossa solução serve pro seu caso",
      subheadline: "3 perguntas. Se fizer sentido, um especialista fala com você.",
      botao: "Quero ver",
    }),
    etapa("single_choice", {
      pergunta: "Qual o tamanho da sua operação?",
      variavel: "porte",
      obrigatorio: true,
      opcoes: [
        op("Sou só eu", "porte_solo"),
        op("De 2 a 10 pessoas", "porte_pequeno"),
        op("De 11 a 50 pessoas", "porte_medio"),
        op("Mais de 50 pessoas", "porte_grande"),
      ],
    }),
    etapa("single_choice", {
      pergunta: "Quando você pretende resolver isso?",
      variavel: "urgencia",
      obrigatorio: true,
      opcoes: [
        op("Essa semana", "urgencia_agora"),
        op("Nas próximas semanas", "urgencia_mes"),
        op("Ainda estou pesquisando", "urgencia_pesquisa"),
      ],
    }),
    etapa("slider", {
      pergunta: "Quanto você já investe por mês nisso hoje?",
      variavel: "investimento",
      min: 0, max: 20000, passo: 500, sufixo: " reais",
    }),
    etapa("text", {
      pergunta: "Qual o seu WhatsApp?",
      ajuda: "É por onde o especialista fala com você.",
      variavel: "telefone",
      formato: "telefone",
      placeholder: "(11) 91234-5678",
      obrigatorio: true,
    }),
    etapa("transition", {
      carregando: "Verificando a disponibilidade da agenda…",
      duracaoMs: 2200,
      provaSocial: ["Retorno em até 1 dia útil."],
    }),
    etapa("offer", {
      titulo: "Boa — o seu perfil se encaixa",
      descricao: "Escolha o melhor horário e a conversa já sai com o seu contexto na mão.",
      cta: "Escolher horário",
      resumo: true,
    }),
  ],
});

// ── Recomendação ─────────────────────────────────────────────────────────────
// "Qual é o certo pra mim?" — o quiz que vende catálogo. Usa escolha por imagem,
// que converte melhor que texto quando o produto é visual.
// Este é o template que mostra o RESULTADO PONDERADO: cada estilo puxa pra um
// perfil, o uso dá um empurrãozinho, e a oferta do fim vira a recomendação que
// somou mais (`pontos` por resultado → `resultadoDe`). Os ids dos resultados são
// fixos de propósito: é por eles que os `pontos` das opções apontam.
const RECOMENDACAO = (): Quiz => ({
  titulo: "Qual é o ideal pra você",
  progresso: true,
  resultados: [
    { id: "rec_classico", titulo: "O Clássico é a sua cara", descricao: "Atemporal e discreto: combina com quem valoriza o que não sai de moda.", cta: "Ver o Clássico" },
    { id: "rec_moderno", titulo: "O Moderno combina com você", descricao: "Limpo e versátil, pro dia a dia com um toque atual.", cta: "Ver o Moderno", padrao: true },
    { id: "rec_ousado", titulo: "O Ousado é o seu", descricao: "Pra chamar atenção e fugir do comum.", cta: "Ver o Ousado" },
  ],
  steps: [
    etapa("cover", {
      headline: "Qual é o ideal pra você?",
      subheadline: "Responda 3 perguntas e veja a recomendação certa em vez de escolher no escuro.",
      botao: "Descobrir",
    }),
    etapa("image_choice", {
      pergunta: "Qual estilo combina mais com você?",
      variavel: "estilo",
      obrigatorio: true,
      opcoes: [
        { ...op("Clássico", "estilo_classico", "crown"), pontos: { rec_classico: 3 } },
        { ...op("Moderno", "estilo_moderno", "sparkles"), pontos: { rec_moderno: 3 } },
        { ...op("Ousado", "estilo_ousado", "rocket"), pontos: { rec_ousado: 3 } },
      ],
    }),
    etapa("single_choice", {
      pergunta: "Pra que você vai usar?",
      variavel: "uso",
      obrigatorio: true,
      opcoes: [
        { ...op("Todo dia", "uso_diario"), pontos: { rec_moderno: 1 } },
        { ...op("Em ocasiões especiais", "uso_ocasional"), pontos: { rec_classico: 1 } },
        { ...op("Pra presentear", "uso_presente"), pontos: { rec_ousado: 1 } },
      ],
    }),
    etapa("slider", {
      pergunta: "Quanto você quer investir?",
      variavel: "faixa",
      min: 50, max: 2000, passo: 50, sufixo: " reais",
    }),
    etapa("transition", {
      carregando: "Procurando a melhor combinação…",
      duracaoMs: 2400,
      provaSocial: ["9 em cada 10 pessoas levam a primeira recomendação."],
    }),
    etapa("offer", {
      titulo: "Achamos o seu",
      descricao: "É o que mais combina com o que você respondeu.",
      cta: "Ver a recomendação",
      resumo: true,
    }),
  ],
});

// ── Candidatura ──────────────────────────────────────────────────────────────
// Um funil de vaga que NÃO parece formulário de RH: etapas curtas, uma coisa por
// tela, e no fim o upload do currículo. Pré-qualifica sozinho — cada resposta de
// qualificação soma pontos pra um perfil (forte/médio/inicial). `mostrarResultado:
// false` porque o CANDIDATO vê só "Candidatura enviada!"; o perfil e o score são
// pra triagem (tela de Resultados). Tema claro com o roxo da marca; progresso em
// barra porque são muitas etapas (a fileira de "passos" ficaria apertada).
const CANDIDATURA = (): Quiz => ({
  titulo: "Quiz de Candidatura",
  progresso: true,
  mostrarResultado: false,
  tema: {
    corFundo: "#FFFFFF", corTexto: "#1C1C22", corCartao: "#F5F3FA",
    corBotao: "#6D1192", corTextoBotao: "#FFFFFF", raio: 16, progresso: "barra", botaoLargura: "cheia",
  },
  resultados: [
    { id: "forte", titulo: "Candidato forte", descricao: "Bom encaixe de experiência e disponibilidade." },
    { id: "medio", titulo: "Candidato mediano", descricao: "Encaixe parcial — vale uma conversa.", padrao: true },
    { id: "inicial", titulo: "Perfil inicial", descricao: "Pouca experiência na área; avaliar potencial." },
  ],
  steps: [
    etapa("cover", {
      headline: "Vamos conhecer você",
      subheadline: "Responda algumas perguntas rápidas pra gente entender seu perfil. Leva cerca de 2 minutos.",
      botao: "Começar",
    }),

    // ── Vaga ──
    etapa("single_choice", {
      pergunta: "Qual vaga você está se candidatando?",
      variavel: "vaga", obrigatorio: true,
      opcoes: [op("Produção", "vaga_producao"), op("Vendas", "vaga_vendas"), op("Atendimento", "vaga_atendimento"), op("Administrativo", "vaga_admin"), op("Logística", "vaga_logistica"), op("Outra", "vaga_outra")],
    }),
    etapa("single_choice", {
      pergunta: "Como ficou sabendo dessa oportunidade?",
      variavel: "origem", obrigatorio: true,
      opcoes: [op("Instagram", "origem_instagram"), op("Indicação de alguém", "origem_indicacao"), op("Site / Google", "origem_site"), op("Outro", "origem_outro")],
    }),
    etapa("single_choice", {
      pergunta: "Você já trabalhou com algo parecido?",
      variavel: "ja_similar", obrigatorio: true,
      opcoes: [{ ...op("Sim", "similar_sim"), pontos: { forte: 1, medio: 1 } }, op("Não", "similar_nao")],
    }),

    // ── Dados básicos ──
    etapa("text", { pergunta: "Qual é o seu nome completo?", variavel: "nome", formato: "texto", placeholder: "Seu nome", obrigatorio: true }),
    etapa("text", { pergunta: "Qual o seu WhatsApp?", ajuda: "É por onde a gente fala com você.", variavel: "telefone", formato: "telefone", placeholder: "(11) 91234-5678", obrigatorio: true }),
    etapa("text", { pergunta: "E o seu melhor e-mail?", variavel: "email", formato: "email", placeholder: "nome@email.com", obrigatorio: true }),
    etapa("text", { pergunta: "De qual cidade e estado você é?", variavel: "cidade", formato: "texto", placeholder: "Cidade / UF", obrigatorio: true }),
    etapa("slider", { pergunta: "Qual é a sua idade?", variavel: "idade", min: 16, max: 70, passo: 1, sufixo: " anos" }),

    // ── Experiência ──
    etapa("single_choice", {
      pergunta: "Você possui experiência profissional?",
      variavel: "tem_experiencia", obrigatorio: true,
      opcoes: [{ ...op("Sim", "exp_sim"), pontos: { medio: 1 } }, { ...op("Não", "exp_nao"), pontos: { inicial: 1 } }],
    }),
    etapa("text", { pergunta: "Qual foi o seu último trabalho?", ajuda: "Se ainda não teve, pode pular.", variavel: "ultimo_trabalho", formato: "texto", placeholder: "Empresa ou tipo de trabalho", obrigatorio: false }),
    etapa("single_choice", {
      pergunta: "Quanto tempo você ficou nessa empresa?",
      variavel: "tempo_empresa", obrigatorio: false,
      opcoes: [op("Menos de 6 meses", "tempo_curto"), { ...op("6 meses a 1 ano", "tempo_medio"), pontos: { medio: 1 } }, { ...op("1 a 3 anos", "tempo_bom"), pontos: { forte: 1 } }, { ...op("Mais de 3 anos", "tempo_longo"), pontos: { forte: 2 } }],
    }),
    etapa("text", { pergunta: "Qual era a sua principal função?", variavel: "funcao", formato: "texto", placeholder: "O que você fazia", obrigatorio: false }),
    etapa("single_choice", {
      pergunta: "Já trabalhou nessa área anteriormente?",
      variavel: "ja_area", obrigatorio: true,
      opcoes: [{ ...op("Sim", "area_sim"), pontos: { forte: 2 } }, op("Não", "area_nao")],
    }),

    // ── Respiro ──
    etapa("content", {
      headline: "Você está indo bem!",
      subheadline: "Agora, as perguntas que ajudam a gente a te posicionar na vaga certa.",
      botao: "Continuar",
    }),

    // ── Qualificação (é aqui que o perfil se forma) ──
    etapa("single_choice", {
      pergunta: "Qual o seu nível de experiência nessa área?",
      variavel: "nivel", obrigatorio: true,
      opcoes: [op("Sem experiência", "nivel_zero"), { ...op("Iniciante", "nivel_inic"), pontos: { inicial: 2 } }, { ...op("Intermediário", "nivel_inter"), pontos: { medio: 3 } }, { ...op("Experiente", "nivel_exp"), pontos: { forte: 4 } }],
    }),
    etapa("single_choice", {
      pergunta: "Você tem disponibilidade para trabalhar presencialmente?",
      variavel: "presencial", obrigatorio: true,
      opcoes: [{ ...op("Sim", "presencial_sim"), pontos: { forte: 2, medio: 2 } }, op("Não", "presencial_nao")],
    }),
    etapa("single_choice", {
      pergunta: "Qual período você tem disponibilidade?",
      variavel: "periodo", obrigatorio: true,
      opcoes: [{ ...op("Integral", "periodo_integral"), pontos: { forte: 2 } }, { ...op("Manhã", "periodo_manha"), pontos: { medio: 1 } }, { ...op("Tarde", "periodo_tarde"), pontos: { medio: 1 } }, { ...op("Noite", "periodo_noite"), pontos: { medio: 1 } }],
    }),
    etapa("single_choice", {
      pergunta: "Consegue começar imediatamente?",
      variavel: "inicio", obrigatorio: true,
      opcoes: [{ ...op("Sim, agora", "inicio_ja"), pontos: { forte: 2 } }, { ...op("Em breve", "inicio_breve"), pontos: { medio: 1 } }, op("Ainda não", "inicio_nao")],
    }),
    etapa("single_choice", {
      pergunta: "Tem algum curso ou formação relacionada à vaga?",
      variavel: "formacao", obrigatorio: true,
      opcoes: [{ ...op("Sim", "formacao_sim"), pontos: { forte: 1, medio: 1 } }, op("Não", "formacao_nao")],
    }),
    etapa("text", { pergunta: "Quais ferramentas ou programas você sabe usar?", ajuda: "Pode listar separando por vírgula. Se não souber nenhum, é só pular.", variavel: "ferramentas", formato: "texto", placeholder: "Ex.: Excel, WhatsApp Business, ERP…", obrigatorio: false }),

    // ── Perfil profissional (aberto, curto) ──
    etapa("text", { pergunta: "Por que você seria uma boa pessoa pra essa vaga?", variavel: "motivo", formato: "texto", placeholder: "Escreva em poucas linhas", obrigatorio: false }),
    etapa("text", { pergunta: "Conte rapidinho uma experiência da qual você se orgulha.", variavel: "orgulho", formato: "texto", placeholder: "Pode ser do trabalho ou da vida", obrigatorio: false }),

    // ── Currículo ──
    etapa("upload", {
      pergunta: "Quase terminando! Envie seu currículo",
      ajuda: "Formatos aceitos: PDF, DOC ou DOCX.",
      variavel: "curriculo", botao: "Concluir candidatura", obrigatorio: true,
    }),

    // ── Final (o candidato vê isto; o perfil/score fica na triagem) ──
    etapa("offer", {
      titulo: "Candidatura enviada!",
      descricao: "Obrigado pelo seu interesse em fazer parte da nossa equipe. Seu perfil vai ser analisado e, se avançar pra próxima etapa, a gente entra em contato.",
      cta: "Voltar ao início",
      destino: "",
      resumo: false,
    }),
  ],
});

const BRANCO = (): Quiz => ({
  titulo: "Novo quiz",
  progresso: true,
  steps: [novaEtapa("cover"), novaEtapa("single_choice", 0), novaEtapa("transition"), novaEtapa("offer")],
});

export interface TemplateQuiz {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  /** Só na hora de usar: montar cria ids novos, então cada uso é independente. */
  montar: () => Quiz;
}

export const QUIZ_TEMPLATES: TemplateQuiz[] = [
  {
    id: "diagnostico", nome: "Diagnóstico personalizado", icone: "target-arrow",
    descricao: "Capa, 4 perguntas de perfil, captura de e-mail, análise e oferta. O formato que mais converte em lista fria.",
    montar: DIAGNOSTICO,
  },
  {
    id: "qualificacao", nome: "Qualificação de lead", icone: "user-check",
    descricao: "Separa quem tem verba e urgência de quem está pesquisando, e termina pedindo o WhatsApp.",
    montar: QUALIFICACAO,
  },
  {
    id: "recomendacao", nome: "Qual é o ideal pra você", icone: "bulb",
    descricao: "Escolha por imagem, faixa de preço e recomendação no fim. Bom pra catálogo.",
    montar: RECOMENDACAO,
  },
  {
    id: "candidatura", nome: "Quiz de Candidatura", icone: "id-badge",
    descricao: "Vaga → dados → experiência → qualificação → currículo. Pré-qualifica o candidato sozinho e recebe o CV em PDF/DOC/DOCX.",
    montar: CANDIDATURA,
  },
  {
    id: "branco", nome: "Começar em branco", icone: "file-text",
    descricao: "Capa, uma pergunta, análise e oferta. Você monta o resto.",
    montar: BRANCO,
  },
];

export function templateQuizPorId(id: string | undefined): TemplateQuiz | null {
  return QUIZ_TEMPLATES.find((t) => t.id === id) ?? null;
}
