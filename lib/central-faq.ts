// FAQ curada do GAIUS — responde com "cara de IA", mas é match por palavras-chave
// (sem IA/API real). Cada item: gatilhos (palavras), resposta e links úteis.

export interface FaqItem {
  id: string;
  titulo: string;
  gatilhos: string[];          // palavras/expressões que disparam a resposta
  resposta: string;
  links?: { label: string; href: string }[];
}

export const FAQ: FaqItem[] = [
  {
    id: "encontrar-pedido",
    titulo: "Encontrar um pedido",
    gatilhos: ["pedido", "encontrar pedido", "achar pedido", "buscar pedido", "localizar pedido", "número do pedido", "status do pedido", "rastrear pedido"],
    resposta: "Pra encontrar um pedido, abra o módulo Comercial e use a busca no topo — dá pra procurar por número, cliente ou produto. Cada pedido mostra o status atual (produção, design, logística) e o histórico.",
    links: [{ label: "Ir para Comercial", href: "/comercial" }],
  },
  {
    id: "criar-solicitacao",
    titulo: "Pedir algo a um setor",
    gatilhos: ["solicitação", "solicitar", "pedir", "preciso de", "requisitar", "guias", "pedir peça", "pedir material", "abrir solicitação"],
    resposta: "Na aba Solicitações, clique em \"Nova solicitação\". Escolha o tipo (ex: Produto/peça, Compra, Estoque…) — o setor responsável já vem sugerido. Quem recebe aprova ou recusa, e o pedido fica em \"Enviadas por você\" até ser respondido.",
    links: [{ label: "Abrir Solicitações", href: "/central/solicitacoes" }],
  },
  {
    id: "estoque",
    titulo: "Ver ou repor estoque",
    gatilhos: ["estoque", "quantidade", "falta", "repor", "reposição", "item", "matéria-prima", "componente", "catálogo"],
    resposta: "O módulo Estoque mostra o catálogo com quantidade atual, mínimo e ideal de cada item. Itens abaixo do mínimo geram reposição automática. Pra repor algo específico, você também pode abrir uma Solicitação do tipo Estoque ou Compra.",
    links: [{ label: "Ir para Estoque", href: "/estoque" }, { label: "Nova solicitação", href: "/central/solicitacoes" }],
  },
  {
    id: "atividades",
    titulo: "Minhas tarefas do dia",
    gatilhos: ["atividade", "tarefa", "minhas atividades", "o que fazer", "pendência", "pendente", "trabalho do dia"],
    resposta: "Suas tarefas ficam em \"Minhas atividades\" no menu Operação. Lá você vê o que está pendente, marca como em andamento e conclui. Quem é gerente também atribui atividades para a equipe.",
    links: [{ label: "Minhas atividades", href: "/minhas-atividades" }],
  },
  {
    id: "mensagens",
    titulo: "Conversar com alguém",
    gatilhos: ["mensagem", "conversar", "chat", "falar com", "mandar recado", "grupo", "avisar"],
    resposta: "Mensagens tem entrada própria no menu lateral — não fica mais dentro da Central. Lá você conversa com qualquer colega ou setor: clique no botão de nova conversa, busque a pessoa e comece. Dá pra anexar imagem, responder, reagir e fixar mensagens importantes.",
    links: [{ label: "Abrir Mensagens", href: "/mensagens" }],
  },
  {
    id: "niveis-permissao",
    titulo: "Por que não vejo um módulo",
    gatilhos: ["permissão", "acesso", "não consigo ver", "não aparece", "bloqueado", "nível", "liberar acesso", "não tenho acesso"],
    resposta: "O que cada pessoa vê depende do seu Nível (1 a 5). Níveis mais altos liberam mais módulos — por exemplo, custos e Financeiro só a partir do nível 4. Se você precisa de um acesso que não tem, peça ao seu gestor ou abra um chamado aqui.",
  },
  {
    id: "produto-ficha",
    titulo: "Ficha técnica / composição do produto",
    gatilhos: ["ficha técnica", "composição", "do que é feito", "componentes do produto", "bom", "árvore", "montagem"],
    resposta: "No Estoque, ao editar um item, você define o Tipo (produto, peça, componente, matéria-prima), o setor responsável e a Ficha técnica — quais componentes e quantidades aquele item usa. É isso que monta a árvore de produção.",
    links: [{ label: "Ir para Estoque", href: "/estoque" }],
  },
  {
    id: "metas",
    titulo: "Metas e desempenho",
    gatilhos: ["meta", "objetivo", "desempenho", "resultado", "vendas do mês", "bater meta"],
    resposta: "As metas ficam no módulo Metas, e o acompanhamento de resultados no Analytics. Vendedoras e gerentes veem o progresso do próprio setor; níveis mais altos veem o quadro completo.",
    links: [{ label: "Ver Analytics", href: "/analytics" }],
  },
  {
    id: "cadastrar-item",
    titulo: "Cadastrar um item/produto no estoque",
    gatilhos: ["cadastrar produto", "criar item", "adicionar produto", "novo item", "novo produto", "registrar item", "cadastrar item"],
    resposta: "No módulo Estoque, na aba Catálogo, clique em \"+ Componentes-Peças\" (ou no item p/ editar). Dá pra definir nome, categoria, foto, tipo (produto/peça/componente/matéria-prima), setor responsável, ficha técnica (componentes que ele usa) e estoque mínimo/ideal.",
    links: [{ label: "Ir para Estoque", href: "/estoque" }],
  },
  {
    id: "tráfego-marketing",
    titulo: "Entender tráfego e ROAS",
    gatilhos: ["tráfego", "roas", "anúncio", "meta ads", "facebook ads", "campanha", "gasto em tráfego", "marketing pago"],
    resposta: "Na aba Comercial → Marketing você vê o Faturamento do tráfego (só campanhas pagas), o ROAS do tráfego (receita paga ÷ gasto), o gasto mensal e o teto. Cada conta de anúncio aparece separada em Carimbo/Chancela.",
    links: [{ label: "Ver Comercial", href: "/comercial" }],
  },
  {
    id: "adicionar-pessoa",
    titulo: "Adicionar ou editar um colaborador",
    gatilhos: ["adicionar colaborador", "novo funcionário", "cadastrar pessoa", "criar usuário", "adicionar pessoa", "novo colaborador", "contratar"],
    resposta: "No módulo Pessoas você cadastra colaboradores: nome, usuário, setor, cargo e o Nível de acesso (1 a 5). O nível define o que a pessoa enxerga no sistema. Só admin/gestores têm acesso a esse módulo.",
    links: [{ label: "Ir para Pessoas", href: "/colaboradores" }],
  },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export interface FaqMatch { item: FaqItem; score: number }

// Retorna o melhor item da FAQ p/ a pergunta, com um score 0..1. Acima de ~0.18 é confiável.
export function buscarFaq(pergunta: string): FaqMatch | null {
  const q = norm(pergunta);
  if (!q.trim()) return null;
  const palavras = q.split(/\s+/).filter((w) => w.length >= 3);
  let melhor: FaqMatch | null = null;
  for (const item of FAQ) {
    let score = 0;
    for (const g of item.gatilhos) {
      const gn = norm(g);
      if (q.includes(gn)) score += gn.includes(" ") ? 3 : 1.5; // expressão completa vale mais
      else for (const w of palavras) if (gn.includes(w)) score += 0.5;
    }
    const norm01 = score / 6; // ~normaliza
    if (!melhor || norm01 > melhor.score) melhor = { item, score: Math.min(1, norm01) };
  }
  return melhor && melhor.score > 0 ? melhor : null;
}

export const LIMIAR_CONFIANCA = 0.18;
