import { importarQuiz, type Quiz } from "@/lib/tridiflow-quiz";

// Funil de prova. É o JSON do contrato COM as etapas que o exemplo não tem
// (múltipla escolha, imagem/ícone, slider e caixa de texto), porque é justamente
// nelas que o celular quebra: grade de duas colunas, régua com o polegar em
// cima, e o teclado subindo por cima do campo em foco.
//
// Passa pelo `importarQuiz` de propósito, e não escrito à mão como objeto: assim
// esta página também é uma prova do interpretador — se ele parar de ler o
// formato, a tela de prova quebra junto e alguém vê.
export const QUIZ_EXEMPLO: Quiz = importarQuiz({
  funnel_title: "Quiz de Diagnóstico de Perfil de Pele",
  // Resultados ponderados: a preocupação e a rotina somam pontos, e a oferta do
  // fim vira o diagnóstico do perfil vencedor (não uma oferta única).
  results: [
    { id: "seca", title: "Rotina de Hidratação Profunda", description: "Sua pele pede barreira e hidratação — montamos uma rotina que devolve o viço sem pesar.", cta_button: "Ver minha rotina de hidratação", redirect_url: "https://seucheckout.com/seca" },
    { id: "oleosa", title: "Rotina de Controle de Oleosidade", description: "Vamos equilibrar a oleosidade sem ressecar, com ativos leves pro dia a dia.", cta_button: "Ver minha rotina anti-oleosidade", redirect_url: "https://seucheckout.com/oleosa", default: true },
    { id: "madura", title: "Rotina Anti-idade", description: "Foco em firmeza e manchas: uma rotina pra suavizar linhas e uniformizar o tom.", cta_button: "Ver minha rotina anti-idade", redirect_url: "https://seucheckout.com/madura" },
  ],
  steps: [
    {
      step_number: 1, type: "cover",
      headline: "Descubra o tratamento ideal para sua pele em 2 minutos",
      subheadline: "Responda a algumas perguntas simples e receba um plano personalizado.",
      button_text: "Iniciar teste gratuito",
    },
    {
      step_number: 2, type: "single_choice",
      question: "Qual é a sua principal preocupação hoje?",
      options: [
        { label: "Ressecamento", tag: "dor_ressecamento", points: { seca: 3 } },
        { label: "Oleosidade extrema", tag: "dor_oleosidade", points: { oleosa: 3 } },
        { label: "Manchas / Melasma", tag: "dor_manchas", points: { madura: 2 } },
        { label: "Linhas de expressão", tag: "dor_linhas", points: { madura: 3 } },
      ],
      tracking_tag: "step_1_skin_concern",
      micro_feedback: "Ajustando o seu plano…",
    },
    {
      step_number: 3, type: "image_choice",
      question: "Como você descreveria a sua rotina hoje?",
      options: [
        { label: "Não tenho rotina", tag: "rotina_nenhuma", icon: "moon", points: { seca: 1 } },
        { label: "Faço o básico", tag: "rotina_basica", icon: "sun", points: { oleosa: 1 } },
        { label: "Já uso ativos", tag: "rotina_avancada", icon: "sparkles", points: { madura: 1 } },
        { label: "Faço com dermato", tag: "rotina_derma", icon: "star", points: { madura: 1 } },
      ],
    },
    {
      step_number: 4, type: "multiple_choice",
      question: "O que você já tentou?",
      help: "Pode marcar mais de uma.",
      max_choices: 3,
      options: [
        { label: "Protetor solar diário", tag: "tentou_protetor" },
        { label: "Ácidos / esfoliantes", tag: "tentou_acidos" },
        { label: "Procedimento estético", tag: "tentou_procedimento" },
        { label: "Nada ainda", tag: "tentou_nada" },
      ],
    },
    {
      step_number: 5, type: "content",
      headline: "Você está quase lá",
      text: "Só mais duas perguntas rápidas e o seu diagnóstico fica pronto. A pele muda com a estação — por isso o plano é feito pro seu momento de agora.",
      button_text: "Continuar",
    },
    { step_number: 6, type: "nps", question: "De 0 a 10, quanto você cuida da sua pele hoje?", variable: "autocuidado" },
    { step_number: 7, type: "slider", question: "Qual é a sua idade?", min: 16, max: 70, step: 1, suffix: " anos", variable: "idade" },
    { step_number: 8, type: "text", format: "telefone", question: "Pra onde eu mando o seu diagnóstico?", placeholder: "(11) 99999-9999" },
    {
      step_number: 9, type: "transition",
      loading_text: "Analisando suas respostas…",
      duration_ms: 2600,
      social_proof: [
        "Mais de 5.000 pessoas já descobriram seu diagnóstico esta semana.",
        "94% relataram melhora visível em 30 dias.",
      ],
    },
    {
      step_number: 10, type: "offer",
      title: "Seu diagnóstico está pronto!",
      description: "Com base nas suas respostas, recomendamos a rotina personalizada abaixo.",
      cta_button: "Garantir meu plano com desconto",
      redirect_url: "https://seucheckout.com/oferta",
    },
  ],
}).quiz!;
