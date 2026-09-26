// ── TridiFlow · Funil de quiz ────────────────────────────────────────────────
// O bot do TridiFlow é um CHAT (bolhas, grupos, arestas — espelha o Typebot). Um
// funil de quiz é outra coisa: etapas em tela cheia, uma pergunta por vez, barra
// de progresso, tela de análise e oferta no fim.
//
// Por que um modelo próprio e não mais tipos de bloco no chat: o chat é um GRAFO
// (cada botão é uma saída, o caminho se ramifica), e o quiz é uma FILA (etapa 1,
// 2, 3… e o progresso só existe porque o total é conhecido). Espremer a fila no
// grafo custaria uma aresta por etapa só pra dizer "depois vem a próxima", e a
// barra de progresso não teria denominador. São dois modos do MESMO bot
// (`settings.modo`), com o mesmo slug, os mesmos pixels e o mesmo destino de
// lead — o que muda é quem desenha.
//
// Este arquivo é puro e client-safe: o editor, a prévia e o player publicado
// leem daqui, e é aqui que mora o INTERPRETADOR do JSON de importação.

export type QuizStepTipo =
  | "cover"            // capa / hook
  | "content"          // tela de conteúdo no meio do funil (não é pergunta)
  | "single_choice"    // escolha única
  | "multiple_choice"  // múltipla escolha
  | "image_choice"     // botões com imagem ou ícone
  | "rating"           // nota em estrelas ou escala (satisfação / NPS)
  | "slider"           // faixa numérica
  | "text"             // caixa de texto (texto/e-mail/telefone/número)
  | "upload"           // envio de arquivo (currículo, PDF/DOC/DOCX)
  | "transition"       // tela de análise (0→100%) com prova social
  | "offer";           // diagnóstico + VSL + CTA

export type QuizFormatoTexto = "texto" | "email" | "telefone" | "numero";
export type QuizEstiloRating = "estrelas" | "numeros";

export interface QuizOpcao {
  id: string;
  label: string;
  /** Tag de segmentação levada pro CRM/webhook (ex.: `perfil_iniciante`). */
  tag?: string;
  imagem?: string;   // image_choice: URL
  icone?: string;    // image_choice: nome do ícone Tabler (quando não há imagem)
  /** Pontos que esta opção soma pra cada resultado (id do resultado → pontos).
   *  Vazio/ausente = não pesa em nenhum. É o que faz o quiz ter RESULTADO
   *  ponderado ("descubra seu perfil") sem virar grafo: a fila continua reta,
   *  só o diagnóstico do fim muda conforme a soma. Ver `resultadoDe`. */
  pontos?: Record<string, number>;
}

export interface QuizStep {
  id: string;
  tipo: QuizStepTipo;

  // ── capa ──
  headline?: string;
  subheadline?: string;
  botao?: string;
  imagem?: string;

  // ── pergunta (single/multiple/image/slider/text) ──
  pergunta?: string;
  ajuda?: string;
  opcoes?: QuizOpcao[];
  /** Nome da variável onde a resposta é gravada (vai pro webhook com este nome). */
  variavel?: string;
  obrigatorio?: boolean;
  /** multiple_choice: teto de escolhas (0/undefined = sem teto). */
  maxEscolhas?: number;
  // slider
  min?: number; max?: number; passo?: number; sufixo?: string;
  // rating
  ratingMax?: number;            // topo da escala (5 = estrelas; 10 = NPS)
  ratingEstilo?: QuizEstiloRating;
  // text
  placeholder?: string;
  formato?: QuizFormatoTexto;
  /** Micro-feedback: aparece por ~1s depois de responder ("Ajustando o seu plano…"). */
  microFeedback?: string;

  // ── transição / análise ──
  carregando?: string;
  duracaoMs?: number;
  provaSocial?: string[];

  // ── oferta ──
  titulo?: string;
  descricao?: string;
  videoUrl?: string;
  cta?: string;
  destino?: string;
  /** Mostra o resumo do que a pessoa respondeu acima da oferta. */
  resumo?: boolean;

  /** Rótulo do evento/etapa pro rastreio (`tracking_tag` no JSON). */
  tagRastreio?: string;
}

/** Um resultado/diagnóstico possível do quiz. Cada opção soma pontos pra um ou
 *  mais destes (QuizOpcao.pontos), e o que somar mais é o que a etapa de oferta
 *  mostra. Ausência de `resultados` = oferta única e estática (como sempre foi).
 *  Cada campo cai no da etapa `offer` quando vazio, então dá pra ter resultados
 *  que só trocam o título e reaproveitam o resto. */
export interface QuizResultado {
  id: string;
  titulo: string;
  descricao?: string;
  cta?: string;
  destino?: string;    // checkout/redirect próprio deste resultado
  videoUrl?: string;
  imagem?: string;
  /** Resultado usado quando ninguém pontua (empate em zero). Só um vale. */
  padrao?: boolean;
}

export interface Quiz {
  titulo: string;
  steps: QuizStep[];
  /** Barra de progresso no topo (padrão: ligada). */
  progresso?: boolean;
  /** Resultados ponderados. Vazio/ausente = a oferta é única pra todo mundo. */
  resultados?: QuizResultado[];
  /** A oferta MOSTRA o resultado vencedor? Padrão sim ("descubra seu perfil").
   *  `false` = calcula e grava o resultado (pro backoffice: triagem, score),
   *  mas a tela final mostra o texto fixo da oferta — é o caso da candidatura,
   *  onde o candidato vê "Candidatura enviada!" e o RH vê o perfil. */
  mostrarResultado?: boolean;
  /** Aparência própria do funil. Ausente = herda as cores do chat, que é como
   *  todo quiz criado antes disto se comportava. */
  tema?: TemaQuiz;
}

// ── Tema ─────────────────────────────────────────────────────────────────────
// Até aqui o quiz não tinha aparência própria: ele lia o `Theme` do chat, então
// mudar a cara do funil significava mudar a cara da conversa. Como o CSS do
// player já é escrito em cima de variáveis (`--tfq-botao`, `--tfq-cartao`…),
// dar tema ao quiz é ampliar essa camada — não reescrever a folha.
//
// Todo campo é opcional e cai no tema do chat quando ausente. É isso que faz a
// mudança não alterar nem um pixel dos funis que já existem.

export interface TemaQuiz {
  corFundo?: string;
  corTexto?: string;
  corBotao?: string;
  corTextoBotao?: string;
  /** Fundo das opções e dos campos (o "cartão"). */
  corCartao?: string;
  /** Família CSS já pronta (ex.: `Inter, system-ui, sans-serif`). */
  fonte?: string;
  /** Cantos de opção, campo e botão. */
  raio?: number;
  /** Largura do palco no computador. No celular manda a tela. */
  larguraMax?: number;
  botaoLargura?: "cheia" | "auto";
  progresso?: "barra" | "passos" | "nenhum";
}

/** As cores do chat que servem de queda. Estrutural de propósito: importar
 *  `Theme` aqui criaria ciclo com tridiflow.ts, que já importa `Quiz`. */
export interface CoresDeQueda {
  corFundo?: string; corTextoBot?: string; corBotao?: string;
  corTextoBotao?: string; corBolhaBot?: string;
}

export interface TemaQuizResolvido {
  fundo: string; texto: string; botao: string; textoBotao: string; cartao: string;
  fonte: string; raio: number; larguraMax: number;
  botaoLargura: "cheia" | "auto"; progresso: "barra" | "passos" | "nenhum";
}

/** Cor que pode entrar numa custom property sem virar injeção de CSS.
 *  Custom property é vetor conhecido: `--x: red; background: url(...)` vaza pro
 *  `var(--x)` lá na frente. Só hexadecimal passa; o resto cai no padrão. */
export function corSeguraQuiz(v: string | undefined, padrao: string): string {
  const s = (v ?? "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s) ? s : padrao;
}

/** Família de fonte com charset restrito — mesma razão da cor acima. */
export function fonteSeguraQuiz(v: string | undefined, padrao: string): string {
  const s = (v ?? "").trim().slice(0, 160);
  return s && /^[\w\s,'"-]+$/.test(s) ? s : padrao;
}

const FONTE_SISTEMA = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
const limitar = (n: number | undefined, min: number, max: number, padrao: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : padrao;

export function resolverTemaQuiz(tema: TemaQuiz | undefined, queda: CoresDeQueda | undefined): TemaQuizResolvido {
  const q = queda ?? {};
  return {
    fundo: corSeguraQuiz(tema?.corFundo, corSeguraQuiz(q.corFundo, "#FFFFFF")),
    texto: corSeguraQuiz(tema?.corTexto, corSeguraQuiz(q.corTextoBot, "#1C1C22")),
    botao: corSeguraQuiz(tema?.corBotao, corSeguraQuiz(q.corBotao, "#6D1192")),
    textoBotao: corSeguraQuiz(tema?.corTextoBotao, corSeguraQuiz(q.corTextoBotao, "#FFFFFF")),
    cartao: corSeguraQuiz(tema?.corCartao, corSeguraQuiz(q.corBolhaBot, "#FFFFFF")),
    fonte: fonteSeguraQuiz(tema?.fonte, FONTE_SISTEMA),
    raio: limitar(tema?.raio, 0, 40, 14),
    larguraMax: limitar(tema?.larguraMax, 360, 1100, 620),
    botaoLargura: tema?.botaoLargura === "auto" ? "auto" : "cheia",
    progresso: tema?.progresso === "passos" || tema?.progresso === "nenhum" ? tema.progresso : "barra",
  };
}

export const TEMAS_QUIZ: { id: string; rotulo: string; tema: TemaQuiz }[] = [
  { id: "claro", rotulo: "Claro", tema: { corFundo: "#FFFFFF", corTexto: "#1C1C22", corBotao: "#6D1192", corTextoBotao: "#FFFFFF", corCartao: "#F7F7FA", raio: 14 } },
  { id: "escuro", rotulo: "Escuro", tema: { corFundo: "#0C0C10", corTexto: "#F2F2F5", corBotao: "#A855F7", corTextoBotao: "#FFFFFF", corCartao: "#17171E", raio: 14 } },
  { id: "suave", rotulo: "Suave", tema: { corFundo: "#FBF8F4", corTexto: "#2A2520", corBotao: "#C2703F", corTextoBotao: "#FFFFFF", corCartao: "#FFFFFF", raio: 20 } },
  { id: "vivo", rotulo: "Vivo", tema: { corFundo: "#0B1F3A", corTexto: "#EAF2FF", corBotao: "#22D3A6", corTextoBotao: "#06251C", corCartao: "#122C4E", raio: 18 } },
  { id: "seco", rotulo: "Seco", tema: { corFundo: "#FFFFFF", corTexto: "#000000", corBotao: "#000000", corTextoBotao: "#FFFFFF", corCartao: "#FFFFFF", raio: 0 } },
];

export const uidQuiz = () => Math.random().toString(36).slice(2, 10);

export const QUIZ_TIPOS: { id: QuizStepTipo; label: string; dica: string; icone: string }[] = [
  { id: "cover", label: "Capa", dica: "Título, subtítulo e o botão que começa", icone: "player-play" },
  { id: "content", label: "Conteúdo", dica: "Tela de texto/imagem no meio — não é pergunta", icone: "file-text" },
  { id: "single_choice", label: "Escolha única", dica: "Uma opção — avança sozinho ao clicar", icone: "circle-dot" },
  { id: "multiple_choice", label: "Múltipla escolha", dica: "Várias opções + botão de continuar", icone: "checklist" },
  { id: "image_choice", label: "Imagem / ícone", dica: "Botões grandes com imagem ou ícone", icone: "photo" },
  { id: "rating", label: "Nota / estrelas", dica: "Estrelas (1–5) ou escala tipo NPS (0–10)", icone: "star" },
  { id: "slider", label: "Faixa (slider)", dica: "Número numa régua — idade, renda, nota", icone: "adjustments-horizontal" },
  { id: "text", label: "Caixa de texto", dica: "Texto livre, e-mail, telefone ou número", icone: "keyboard" },
  { id: "upload", label: "Envio de arquivo", dica: "A pessoa anexa um arquivo (currículo: PDF/DOC/DOCX)", icone: "upload" },
  { id: "transition", label: "Análise", dica: "Carregando 0→100% com prova social", icone: "loader" },
  { id: "offer", label: "Oferta", dica: "Diagnóstico, vídeo e o botão do checkout", icone: "tag" },
];

/** Etapas que PERGUNTAM alguma coisa — as únicas que contam no progresso. */
export const ETAPAS_DE_PERGUNTA: QuizStepTipo[] = ["single_choice", "multiple_choice", "image_choice", "rating", "slider", "text"];
export const ehPergunta = (s: QuizStep) => ETAPAS_DE_PERGUNTA.includes(s.tipo);

/** Chave reservada onde as tags coletadas viajam junto das respostas. Fica em
 *  `respostas` (jsonb que já existe) de propósito: assim o webhook, o CSV e a
 *  tela de Resultados enxergam as tags sem coluna nova e sem SQL pra rodar. */
export const CHAVE_TAGS = "tags";

/** Chave reservada onde o RESULTADO ponderado (título do diagnóstico) viaja
 *  junto das respostas — mesma ideia do CHAVE_TAGS: sem coluna nova, sem SQL, e
 *  o webhook/CSV/Resultados passam a ver "que perfil deu" de graça. */
export const CHAVE_RESULTADO = "resultado";

export function novoResultado(n = 1): QuizResultado {
  return { id: uidQuiz(), titulo: `Resultado ${n}`, descricao: "", cta: "", destino: "" };
}

export function novaEtapa(tipo: QuizStepTipo, indice = 0): QuizStep {
  const s: QuizStep = { id: uidQuiz(), tipo };
  const opt = (label: string, tag: string): QuizOpcao => ({ id: uidQuiz(), label, tag });
  switch (tipo) {
    case "cover":
      s.headline = "Descubra o plano ideal pra você em 2 minutos";
      s.subheadline = "Responda a 3 perguntas simples e receba um diagnóstico personalizado.";
      s.botao = "Começar agora";
      break;
    case "content":
      s.headline = "Você sabia?";
      s.subheadline = "Use esta tela pra contar uma história, quebrar uma objeção ou explicar algo antes da próxima pergunta.";
      s.botao = "Continuar";
      break;
    case "rating":
      s.pergunta = "Como você avalia isto?";
      s.variavel = `q${indice + 1}`;
      s.obrigatorio = true;
      s.ratingMax = 5;
      s.ratingEstilo = "estrelas";
      break;
    case "single_choice":
      s.pergunta = "Qual é a sua principal dificuldade hoje?";
      s.variavel = `q${indice + 1}`;
      s.obrigatorio = true;
      s.opcoes = [opt("Primeira opção", "perfil_a"), opt("Segunda opção", "perfil_b"), opt("Terceira opção", "perfil_c")];
      break;
    case "multiple_choice":
      s.pergunta = "O que mais se aplica a você? (pode marcar mais de uma)";
      s.variavel = `q${indice + 1}`;
      s.opcoes = [opt("Primeira opção", "interesse_a"), opt("Segunda opção", "interesse_b")];
      break;
    case "image_choice":
      s.pergunta = "Qual destes combina mais com você?";
      s.variavel = `q${indice + 1}`;
      s.obrigatorio = true;
      s.opcoes = [{ id: uidQuiz(), label: "Opção 1", tag: "visual_a", icone: "sparkles" }, { id: uidQuiz(), label: "Opção 2", tag: "visual_b", icone: "flame" }];
      break;
    case "slider":
      s.pergunta = "Qual é a sua idade?";
      s.variavel = `q${indice + 1}`;
      s.min = 18; s.max = 70; s.passo = 1;
      break;
    case "text":
      s.pergunta = "Pra onde eu mando o seu resultado?";
      s.variavel = "email";
      s.formato = "email";
      s.placeholder = "nome@email.com";
      s.obrigatorio = true;
      break;
    case "upload":
      s.pergunta = "Quase terminando! Envie seu currículo";
      s.ajuda = "Formatos aceitos: PDF, DOC ou DOCX.";
      s.variavel = "curriculo";
      s.botao = "Concluir candidatura";
      s.obrigatorio = true;
      break;
    case "transition":
      s.carregando = "Analisando as suas respostas…";
      s.duracaoMs = 2600;
      s.provaSocial = ["Mais de 5.000 pessoas já descobriram o diagnóstico delas esta semana."];
      break;
    case "offer":
      s.titulo = "Seu diagnóstico está pronto!";
      s.descricao = "Com base no que você respondeu, este é o caminho que recomendamos.";
      s.cta = "Quero o meu plano";
      s.destino = "";
      s.resumo = true;
      break;
  }
  return s;
}

export const QUIZ_PADRAO = (): Quiz => ({
  titulo: "Novo funil",
  progresso: true,
  steps: [novaEtapa("cover"), novaEtapa("single_choice", 0), novaEtapa("transition"), novaEtapa("offer")],
});

// ── Progresso ────────────────────────────────────────────────────────────────
/** % concluído ao ESTAR na etapa `i`. Conta só as perguntas: capa, análise e
 *  oferta não são trabalho da pessoa, e incluí-las fazia a barra pular de 0 pra
 *  33% antes de responder qualquer coisa (e nunca chegar a 100). */
export function progresso(steps: QuizStep[], i: number): number {
  const perguntas = steps.filter(ehPergunta).length;
  if (!perguntas) return steps.length > 1 ? Math.round((i / (steps.length - 1)) * 100) : 100;
  const respondidas = steps.slice(0, i).filter(ehPergunta).length;
  return Math.min(100, Math.round((respondidas / perguntas) * 100));
}

// ── Tags e resumo ────────────────────────────────────────────────────────────
/** Rótulos que uma resposta cobre: o valor INTEIRO (escolha única — vale mesmo
 *  quando o próprio rótulo tem vírgula, ex.: "Sim, agora") E as partes separadas
 *  por vírgula (múltipla escolha, que a EscolhaMultipla junta com ", "). Casar só
 *  pelas partes perdia a opção de rótulo com vírgula; casar só pelo inteiro
 *  perdia a múltipla escolha. */
function rotulosEscolhidos(bruto: string): string[] {
  return [bruto.trim(), ...bruto.split(",").map((v) => v.trim())].filter(Boolean);
}

/** Tags das opções escolhidas, na ordem das etapas, sem repetir. A resposta
 *  guarda o LABEL (é o que a pessoa viu e o que o vendedor precisa ler); a tag
 *  é reencontrada aqui pelo label — assim mudar a tag no editor vale pros leads
 *  novos sem reescrever o que já foi gravado. */
export function tagsDe(steps: QuizStep[], respostas: Record<string, string>): string[] {
  const fora: string[] = [];
  for (const s of steps) {
    if (!s.variavel || !s.opcoes?.length) continue;
    const bruto = respostas[s.variavel];
    if (!bruto) continue;
    const escolhidos = rotulosEscolhidos(bruto);
    for (const esc of escolhidos) {
      const op = s.opcoes.find((o) => o.label === esc);
      if (op?.tag && !fora.includes(op.tag)) fora.push(op.tag);
    }
  }
  return fora;
}

/** O resultado ponderado das respostas — soma os `pontos` das opções escolhidas
 *  por resultado e devolve o que somou mais. Empate → o primeiro da lista
 *  (ordem é decisão do autor); ninguém pontuou → o marcado `padrao`, senão o
 *  primeiro. Sem `resultados` no quiz → null, e a oferta é a estática de sempre.
 *
 *  Casa a opção pelo LABEL (igual ao `tagsDe`), então editar pontos/opções vale
 *  pros leads novos sem reescrever o que já foi gravado. */
export function resultadoDe(quiz: Quiz, respostas: Record<string, string>): QuizResultado | null {
  const rs = quiz.resultados;
  if (!rs?.length) return null;
  const totais = new Map<string, number>();
  for (const r of rs) totais.set(r.id, 0);
  for (const s of quiz.steps) {
    if (!s.variavel || !s.opcoes?.length) continue;
    const bruto = respostas[s.variavel];
    if (!bruto) continue;
    const escolhidos = rotulosEscolhidos(bruto);
    for (const esc of escolhidos) {
      const op = s.opcoes.find((o) => o.label === esc);
      if (!op?.pontos) continue;
      for (const [rid, pts] of Object.entries(op.pontos)) {
        if (totais.has(rid) && typeof pts === "number" && Number.isFinite(pts)) {
          totais.set(rid, (totais.get(rid) ?? 0) + pts);
        }
      }
    }
  }
  let melhor: QuizResultado = rs[0];
  let melhorPts = totais.get(rs[0].id) ?? 0;
  for (const r of rs) {
    const p = totais.get(r.id) ?? 0;
    if (p > melhorPts) { melhorPts = p; melhor = r; }   // `>` (não `>=`): empate fica com o primeiro
  }
  if (melhorPts <= 0) return rs.find((r) => r.padrao) ?? rs[0];
  return melhor;
}

/** O funil usa resultados ponderados? (a oferta passa a variar por perfil). */
export const temResultados = (quiz: Quiz): boolean => !!quiz.resultados?.length;

/** Perfil vencedor + um SCORE 0–100 de qualificação, pra triagem. O score é
 *  independente do perfil: em cada pergunta pontuada, vale o quão "forte" foi a
 *  resposta (o maior valor de pontos da opção escolhida) sobre o máximo possível
 *  daquela pergunta. Assim "87/100" quer dizer "respondeu perto do topo", sem
 *  depender de qual perfil deu. */
export function pontuacaoDe(quiz: Quiz, respostas: Record<string, string>): { resultado: QuizResultado | null; score: number; ganho: number; possivel: number } {
  const resultado = resultadoDe(quiz, respostas);
  const maxDaOpcao = (o: QuizOpcao) => Math.max(0, ...Object.values(o.pontos ?? {}).filter((n) => typeof n === "number" && Number.isFinite(n)));
  let ganho = 0;
  let possivel = 0;
  for (const s of quiz.steps) {
    if (!s.variavel || !s.opcoes?.length) continue;
    const possivelEtapa = Math.max(0, ...s.opcoes.map(maxDaOpcao));
    if (possivelEtapa <= 0) continue;   // pergunta que não pontua não entra no score
    possivel += possivelEtapa;
    const bruto = respostas[s.variavel];
    if (!bruto) continue;
    const escolhidos = rotulosEscolhidos(bruto);
    ganho += Math.max(0, ...s.opcoes.filter((o) => escolhidos.includes(o.label)).map(maxDaOpcao));
  }
  return { resultado, score: possivel > 0 ? Math.round((ganho / possivel) * 100) : 0, ganho, possivel };
}

/** Pergunta → resposta, pro resumo da tela de oferta. Sem interpretação: é o
 *  que a pessoa respondeu, do jeito que respondeu. */
export function resumoDe(steps: QuizStep[], respostas: Record<string, string>): { pergunta: string; resposta: string }[] {
  const linhas: { pergunta: string; resposta: string }[] = [];
  for (const s of steps) {
    if (!ehPergunta(s) || !s.variavel) continue;
    const v = respostas[s.variavel];
    if (!v) continue;
    // O espaço é posto AQUI, não esperado no sufixo: o interpretador trima todo
    // texto do JSON, então " anos" chega como "anos" e a linha virava "43anos".
    linhas.push({ pergunta: s.pergunta || s.variavel, resposta: s.sufixo?.trim() ? `${v} ${s.sufixo.trim()}` : v });
  }
  return linhas;
}

// ── Interpretador do JSON ────────────────────────────────────────────────────
// Formato de troca (o mesmo do enunciado): `{ funnel_title, steps: [...] }`, com
// `step_number` mandando na ordem. Tolerante de propósito — um JSON colado à mão
// vem com campo faltando, tipo desconhecido ou `options` como lista de strings,
// e recusar o arquivo inteiro por causa de uma etapa seria transformar um erro
// de digitação em "não funciona".

type Cru = Record<string, unknown>;
const txt = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const ALIAS_TIPO: Record<string, QuizStepTipo> = {
  cover: "cover", capa: "cover", hook: "cover", intro: "cover", start: "cover",
  content: "content", conteudo: "content", info: "content", texto_livre: "content", secao: "content", section: "content",
  single_choice: "single_choice", single: "single_choice", escolha_unica: "single_choice", radio: "single_choice", choice: "single_choice",
  multiple_choice: "multiple_choice", multiple: "multiple_choice", multi: "multiple_choice", checkbox: "multiple_choice",
  image_choice: "image_choice", image: "image_choice", imagem: "image_choice", icon_choice: "image_choice", cards: "image_choice",
  rating: "rating", nota: "rating", estrelas: "rating", stars: "rating", nps: "rating", avaliacao: "rating",
  slider: "slider", range: "slider", escala: "slider",
  text: "text", texto: "text", input: "text", open_text: "text", email: "text", phone: "text", telefone: "text",
  upload: "upload", arquivo: "upload", file: "upload", curriculo: "upload", cv: "upload", resume: "upload", anexo: "upload",
  transition: "transition", loading: "transition", analise: "transition", analysis: "transition",
  offer: "offer", oferta: "offer", result: "offer", resultado: "offer", diagnostico: "offer",
};

/** Pontos por resultado: `{ resultadoId: número }`. Descarta valor não-numérico
 *  e chave vazia; devolve undefined quando não sobrou nada (opção sem peso). */
function pontosDe(v: unknown): Record<string, number> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Cru)) {
    const n = num(val);
    if (k && n !== undefined) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

function opcoesDe(v: unknown): QuizOpcao[] | undefined {
  if (!Array.isArray(v) || !v.length) return undefined;
  const out: QuizOpcao[] = [];
  for (const item of v) {
    // Aceita `"Ressecamento"` e `{ label, tag }` — colar uma lista de strings é
    // o atalho mais comum e não custa nada suportar.
    if (typeof item === "string") { if (item.trim()) out.push({ id: uidQuiz(), label: item.trim() }); continue; }
    if (!item || typeof item !== "object") continue;
    const o = item as Cru;
    const label = txt(o.label) ?? txt(o.text) ?? txt(o.titulo) ?? txt(o.title) ?? txt(o.value);
    if (!label) continue;
    const pontos = pontosDe(o.points ?? o.pontos);
    out.push({
      id: txt(o.id) ?? uidQuiz(),
      label,
      tag: txt(o.tag) ?? txt(o.tracking_tag) ?? txt(o.segment),
      imagem: txt(o.image) ?? txt(o.imagem) ?? txt(o.image_url),
      icone: txt(o.icon) ?? txt(o.icone),
      ...(pontos ? { pontos } : {}),
    });
  }
  return out.length ? out : undefined;
}

/** Lista de resultados vinda do JSON. Preserva `id`/`key` porque é por ele que
 *  os `points` das opções apontam — gerar id novo aqui quebraria a ligação. */
function resultadosDe(v: unknown): QuizResultado[] | undefined {
  if (!Array.isArray(v) || !v.length) return undefined;
  const out: QuizResultado[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const r = item as Cru;
    const titulo = txt(r.title) ?? txt(r.titulo) ?? txt(r.name) ?? txt(r.headline);
    if (!titulo) continue;
    out.push({
      id: txt(r.id) ?? txt(r.key) ?? uidQuiz(),
      titulo,
      descricao: txt(r.description) ?? txt(r.descricao),
      cta: txt(r.cta) ?? txt(r.cta_button) ?? txt(r.button_text),
      destino: txt(r.redirect_url) ?? txt(r.destino) ?? txt(r.url),
      videoUrl: txt(r.video_url) ?? txt(r.video) ?? txt(r.vsl),
      imagem: txt(r.image) ?? txt(r.imagem),
      ...(r.default === true || r.padrao === true ? { padrao: true } : {}),
    });
  }
  return out.length ? out : undefined;
}

function provaSocialDe(v: unknown): string[] | undefined {
  if (typeof v === "string" && v.trim()) return [v.trim()];
  if (Array.isArray(v)) {
    const l = v.map((x) => (typeof x === "string" ? x.trim() : txt((x as Cru)?.text) ?? txt((x as Cru)?.label) ?? "")).filter(Boolean);
    return l.length ? l : undefined;
  }
  return undefined;
}

export interface ResultadoImport { quiz: Quiz | null; erro?: string; avisos: string[] }

/** JSON (texto ou objeto) → Quiz. Devolve os avisos em vez de escondê-los: uma
 *  etapa descartada em silêncio vira "importou mas faltou uma pergunta". */
export function importarQuiz(entrada: string | Cru): ResultadoImport {
  const avisos: string[] = [];
  let raiz: Cru;
  try {
    raiz = typeof entrada === "string" ? (JSON.parse(entrada) as Cru) : entrada;
  } catch {
    return { quiz: null, erro: "Não consegui ler o JSON — confira vírgulas e aspas.", avisos };
  }
  if (!raiz || typeof raiz !== "object") return { quiz: null, erro: "O JSON precisa ser um objeto.", avisos };

  const cruSteps = Array.isArray(raiz.steps) ? raiz.steps : Array.isArray(raiz.etapas) ? raiz.etapas : null;
  if (!cruSteps) return { quiz: null, erro: "Não achei a lista `steps` no JSON.", avisos };

  // `step_number` manda na ordem quando existe; senão vale a ordem do arquivo.
  const ordenados = cruSteps
    .map((s, i) => ({ s: (s ?? {}) as Cru, i }))
    .sort((a, b) => (num(a.s.step_number) ?? a.i + 1) - (num(b.s.step_number) ?? b.i + 1));

  const steps: QuizStep[] = [];
  let nPergunta = 0;
  for (const { s, i } of ordenados) {
    const bruto = String(s.type ?? s.tipo ?? "").toLowerCase().trim();
    const tipo = ALIAS_TIPO[bruto];
    if (!tipo) { avisos.push(`Etapa ${i + 1}: tipo "${bruto || "(vazio)"}" desconhecido — pulei.`); continue; }

    const step: QuizStep = { id: txt(s.id) ?? uidQuiz(), tipo };
    step.tagRastreio = txt(s.tracking_tag) ?? txt(s.tag_rastreio);

    if (tipo === "cover" || tipo === "content") {
      step.headline = txt(s.headline) ?? txt(s.title) ?? txt(s.titulo);
      step.subheadline = txt(s.subheadline) ?? txt(s.subtitle) ?? txt(s.subtitulo) ?? txt(s.text) ?? txt(s.texto);
      step.botao = txt(s.button_text) ?? txt(s.cta) ?? txt(s.botao) ?? (tipo === "cover" ? "Começar" : "Continuar");
      step.imagem = txt(s.image) ?? txt(s.imagem);
    } else if (tipo === "transition") {
      step.carregando = txt(s.loading_text) ?? txt(s.carregando) ?? "Analisando…";
      step.duracaoMs = num(s.duration_ms) ?? num(s.duracao_ms) ?? 2600;
      step.provaSocial = provaSocialDe(s.social_proof ?? s.prova_social);
    } else if (tipo === "offer") {
      step.titulo = txt(s.title) ?? txt(s.titulo) ?? txt(s.headline);
      step.descricao = txt(s.description) ?? txt(s.descricao);
      step.videoUrl = txt(s.video_url) ?? txt(s.vsl) ?? txt(s.video);
      step.cta = txt(s.cta_button) ?? txt(s.cta) ?? txt(s.button_text) ?? "Continuar";
      step.destino = txt(s.redirect_url) ?? txt(s.destino) ?? txt(s.url);
      step.resumo = s.summary === false || s.resumo === false ? false : true;
    } else if (tipo === "upload") {
      step.pergunta = txt(s.question) ?? txt(s.pergunta) ?? txt(s.headline) ?? txt(s.title) ?? "Envie seu currículo";
      step.ajuda = txt(s.help) ?? txt(s.ajuda) ?? "Formatos aceitos: PDF, DOC ou DOCX.";
      step.variavel = txt(s.variable) ?? txt(s.variavel) ?? txt(s.field) ?? "curriculo";
      step.botao = txt(s.button_text) ?? txt(s.cta) ?? txt(s.botao) ?? "Concluir";
      step.obrigatorio = s.required === false || s.obrigatorio === false ? false : true;
    } else {
      // Perguntas
      nPergunta += 1;
      step.pergunta = txt(s.question) ?? txt(s.pergunta) ?? txt(s.headline) ?? txt(s.title);
      step.ajuda = txt(s.help) ?? txt(s.ajuda) ?? txt(s.subheadline);
      step.variavel = txt(s.variable) ?? txt(s.variavel) ?? txt(s.field) ?? `q${nPergunta}`;
      step.microFeedback = txt(s.micro_feedback) ?? txt(s.feedback);
      step.obrigatorio = s.required === false || s.obrigatorio === false ? false : true;
      if (tipo === "rating") {
        step.ratingMax = num(s.max) ?? num(s.rating_max) ?? num(s.escala) ?? (bruto === "nps" ? 10 : 5);
        const est = String(s.rating_style ?? s.estilo ?? "").toLowerCase();
        step.ratingEstilo = est.includes("num") || bruto === "nps" || (step.ratingMax ?? 5) > 5 ? "numeros" : "estrelas";
      } else if (tipo === "slider") {
        step.min = num(s.min) ?? 0; step.max = num(s.max) ?? 100; step.passo = num(s.step) ?? num(s.passo) ?? 1;
        step.sufixo = txt(s.suffix) ?? txt(s.sufixo);
      } else if (tipo === "text") {
        step.placeholder = txt(s.placeholder) ?? "Escreva aqui…";
        const f = String(s.format ?? s.formato ?? bruto).toLowerCase();
        step.formato = f.includes("mail") ? "email" : f.includes("phone") || f.includes("telefone") ? "telefone" : f.includes("num") ? "numero" : "texto";
        // Um campo de e-mail/telefone sem nome de variável vira `email`/`telefone`:
        // é por esse nome que o destino do lead procura o contato.
        if (!txt(s.variable) && !txt(s.variavel)) step.variavel = step.formato === "email" ? "email" : step.formato === "telefone" ? "telefone" : step.variavel;
      } else {
        step.opcoes = opcoesDe(s.options ?? s.opcoes ?? s.choices);
        if (!step.opcoes) avisos.push(`Etapa ${i + 1}: sem opções — a pergunta entrou vazia.`);
        if (tipo === "multiple_choice") step.maxEscolhas = num(s.max_choices) ?? num(s.max_escolhas);
      }
    }
    steps.push(step);
  }

  if (!steps.length) return { quiz: null, erro: "Nenhuma etapa válida no JSON.", avisos };
  const tema = temaDe(raiz.theme ?? raiz.tema);
  const resultados = resultadosDe(raiz.results ?? raiz.resultados);
  const quiz: Quiz = {
    titulo: txt(raiz.funnel_title) ?? txt(raiz.titulo) ?? txt(raiz.title) ?? "Funil importado",
    progresso: raiz.progress === false || raiz.progresso === false ? false : true,
    steps,
    ...(resultados ? { resultados } : {}),
    ...(raiz.show_result === false || raiz.mostrarResultado === false ? { mostrarResultado: false } : {}),
    ...(tema ? { tema } : {}),
  };
  if (!steps.some((s) => s.tipo === "offer")) avisos.push("O funil não tem etapa de oferta — quem terminar não vai ver nada no fim.");
  return { quiz, avisos };
}

/** Quiz → o mesmo formato de troca do enunciado. Round-trip: exportar e
 *  importar de volta devolve o mesmo funil. */
export function exportarQuiz(quiz: Quiz): Cru {
  const steps = quiz.steps.map((s, i) => {
    const base: Cru = { step_number: i + 1, type: s.tipo };
    if (s.tagRastreio) base.tracking_tag = s.tagRastreio;
    if (s.tipo === "cover" || s.tipo === "content") {
      return { ...base, headline: s.headline ?? "", subheadline: s.subheadline ?? "", button_text: s.botao ?? (s.tipo === "cover" ? "Começar" : "Continuar"), ...(s.imagem ? { image: s.imagem } : {}) };
    }
    if (s.tipo === "transition") {
      return { ...base, loading_text: s.carregando ?? "Analisando…", duration_ms: s.duracaoMs ?? 2600, ...(s.provaSocial?.length ? { social_proof: s.provaSocial } : {}) };
    }
    if (s.tipo === "offer") {
      return {
        ...base, title: s.titulo ?? "", description: s.descricao ?? "", cta_button: s.cta ?? "Continuar",
        ...(s.destino ? { redirect_url: s.destino } : {}), ...(s.videoUrl ? { video_url: s.videoUrl } : {}),
        summary: s.resumo !== false,
      };
    }
    if (s.tipo === "upload") {
      return {
        ...base, question: s.pergunta ?? "", variable: s.variavel ?? "curriculo", required: s.obrigatorio !== false,
        ...(s.ajuda ? { help: s.ajuda } : {}), button_text: s.botao ?? "Concluir",
      };
    }
    const p: Cru = {
      ...base, question: s.pergunta ?? "", variable: s.variavel ?? "", required: s.obrigatorio !== false,
      ...(s.ajuda ? { help: s.ajuda } : {}), ...(s.microFeedback ? { micro_feedback: s.microFeedback } : {}),
    };
    if (s.tipo === "rating") return { ...p, max: s.ratingMax ?? 5, rating_style: s.ratingEstilo ?? "estrelas" };
    if (s.tipo === "slider") return { ...p, min: s.min ?? 0, max: s.max ?? 100, step: s.passo ?? 1, ...(s.sufixo ? { suffix: s.sufixo } : {}) };
    if (s.tipo === "text") return { ...p, format: s.formato ?? "texto", placeholder: s.placeholder ?? "" };
    return {
      ...p,
      ...(s.tipo === "multiple_choice" && s.maxEscolhas ? { max_choices: s.maxEscolhas } : {}),
      options: (s.opcoes ?? []).map((o) => ({
        label: o.label, ...(o.tag ? { tag: o.tag } : {}),
        ...(o.imagem ? { image: o.imagem } : {}), ...(o.icone ? { icon: o.icone } : {}),
        ...(o.pontos && Object.keys(o.pontos).length ? { points: o.pontos } : {}),
      })),
    };
  });
  return {
    funnel_title: quiz.titulo,
    progress: quiz.progresso !== false,
    // Sem isto, exportar e reimportar devolvia o funil sem a aparência — e o
    // arquivo exportado é justamente o que se guarda como backup.
    ...(quiz.tema ? { theme: quiz.tema as unknown as Cru } : {}),
    // `id` sai junto porque os `points` das opções apontam pra ele — sem o id,
    // reimportar geraria ids novos e o peso perderia o alvo.
    ...(quiz.mostrarResultado === false ? { show_result: false } : {}),
    ...(quiz.resultados?.length ? {
      results: quiz.resultados.map((r) => ({
        id: r.id, title: r.titulo,
        ...(r.descricao ? { description: r.descricao } : {}),
        ...(r.cta ? { cta: r.cta } : {}),
        ...(r.destino ? { redirect_url: r.destino } : {}),
        ...(r.videoUrl ? { video_url: r.videoUrl } : {}),
        ...(r.imagem ? { image: r.imagem } : {}),
        ...(r.padrao ? { default: true } : {}),
      })),
    } : {}),
    steps,
  };
}

/** Tema vindo de JSON de fora: só as chaves conhecidas, cada uma saneada.
 *  Devolve undefined quando não sobrou nada — assim o funil cai no tema do chat
 *  em vez de nascer com um tema vazio que sobrescreve tudo com o padrão. */
function temaDe(v: unknown): TemaQuiz | undefined {
  if (!v || typeof v !== "object") return undefined;
  const c = v as Cru;
  const t: TemaQuiz = {};
  const cor = (k: keyof TemaQuiz, bruto: unknown) => {
    const s = txt(bruto);
    if (s && corSeguraQuiz(s, "") !== "") (t as Record<string, unknown>)[k] = s;
  };
  cor("corFundo", c.corFundo ?? c.background);
  cor("corTexto", c.corTexto ?? c.text);
  cor("corBotao", c.corBotao ?? c.button);
  cor("corTextoBotao", c.corTextoBotao ?? c.button_text);
  cor("corCartao", c.corCartao ?? c.card);
  const fonte = txt(c.fonte ?? c.font);
  if (fonte && fonteSeguraQuiz(fonte, "") !== "") t.fonte = fonte;
  const raio = num(c.raio ?? c.radius); if (raio !== undefined) t.raio = raio;
  const larg = num(c.larguraMax ?? c.max_width); if (larg !== undefined) t.larguraMax = larg;
  if (c.botaoLargura === "auto" || c.button_width === "auto") t.botaoLargura = "auto";
  const prog = txt(c.progresso ?? c.progress_style);
  if (prog === "passos" || prog === "nenhum") t.progresso = prog;
  return Object.keys(t).length ? t : undefined;
}
