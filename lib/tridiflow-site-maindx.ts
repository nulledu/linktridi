// TridiFlow — SITE MAINDX (5 páginas ligadas entre si).
//
// A Maindx vende HARDWARE que já chega com o SOFTWARE rodando, pra qualquer
// pequeno negócio: MEI, loja, salão, lanchonete, prestador de serviço. A
// promessa é investimento baixo que aumenta a venda e melhora a experiência
// do cliente. A linha tem três produtos (Totem, Caixa, Online) numa página só
// de Produtos — vitrine, não uma aba por produto.
//
// Linguagem visual de marca premium: preto, branco e UM violeta (a cor da
// marca), manchete grande de peso médio com o destaque em violeta (tema
// `destaque: "cor"`), muito respiro, um quadro por produto alternando claro e
// escuro com brilho violeta.
//
// Como as páginas se acham: o cabeçalho aponta pra `/p/<slug>` (e
// `/p/maindx-produtos#totem` pra cada produto), e o slug nasce do NOME da
// página (slugLivre em tridiflow-db.ts). Por isso cada template tem o nome
// certinho. Criou com outro nome, é só trocar o slug no Publicar.
//
// Preços, fotos, depoimentos e ficha técnica nascem como MOLDE ("R$ X",
// "Nome do negócio"): prova social e especificação inventadas não podem ir
// pro ar por esquecimento.

import {
  type Bloco, type BlocoTipo, type CampoForm, type CampoTipo, type Estilo, type ItemDepoimento,
  type ItemBento, type ItemFaq, type ItemLista, type ItemSlide, type PaginaConfig, type PaginaDoc, type Plano, type Secao,
  novaSecao, novoBloco, novoId,
} from "./tridiflow-pagina";

// ── Atalhos (mesmo idioma de tridiflow-pagina-templates.ts) ──────────────────
function bloco(tipo: BlocoTipo, ajuste: Partial<Bloco> = {}): Bloco {
  const base = novoBloco(tipo);
  return { ...base, ...ajuste, estilo: { ...base.estilo, ...(ajuste.estilo ?? {}) } };
}
function secao(nome: string, blocos: Bloco[], estilo: Estilo = {}, ancora?: string): Secao {
  const base = novaSecao(nome);
  return { ...base, ancora, estilo: { ...base.estilo, ...estilo }, blocos };
}
const item = (titulo: string, texto?: string): ItemLista => ({ id: novoId("i"), titulo, texto });
const duvida = (pergunta: string, resposta: string): ItemFaq => ({ id: novoId("q"), pergunta, resposta });
const depoimento = (nome: string, texto: string, cargo?: string): ItemDepoimento =>
  ({ id: novoId("d"), nome, texto, cargo, nota: 5 });
const campo = (tipo: CampoTipo, rotulo: string, placeholder?: string, obrigatorio = true): CampoForm =>
  ({ id: novoId("c"), tipo, rotulo, placeholder, obrigatorio });
const recurso = (icone: string, titulo: string, texto: string) => ({ id: novoId("r"), icone, titulo, texto });
const passo = (titulo: string, texto: string) => ({ id: novoId("p"), titulo, texto });
const linhaComp = (recursoNome: string, nos: boolean, eles: boolean) => ({ id: novoId("cp"), recurso: recursoNome, nos, eles });
const plano = (p: Omit<Plano, "id">): Plano => ({ id: novoId("pl"), ...p });
const quadro = (
  tamanho: ItemBento["tamanho"], tom: ItemBento["tom"], etiqueta: string, titulo: string, texto?: string,
  chips?: string[], link?: { texto: string; url: string },
): ItemBento => ({ id: novoId("bt"), tamanho, tom, etiqueta, titulo, texto, chips, link });
const slide = (titulo: string, texto: string, etiqueta?: string): ItemSlide =>
  ({ id: novoId("sl"), titulo, texto, etiqueta, link: { texto: "Ver o kit", url: URL_PLANOS } });

// ── Identidade ───────────────────────────────────────────────────────────────
// Violeta é a cor da marca: botão, destaque do título, ícone, chip, check,
// link "›" e o brilho no fundo das seções escuras. O resto é preto e branco —
// é o contraste com o neutro que faz o violeta parecer premium.
const TINTA = "#7c3aed";         // violeta de marca
const CLARO = "#f6f4fb";         // cinza de vitrine puxado pro lilás
const ESCURO = "#000000";
const BRANCO = "#ffffff";

/** Páginas do site, na ordem do menu. `slug` é o que o nome gera. */
export const SITE_MAINDX = [
  { id: "landing", slug: "maindx", nome: "Maindx", menu: "Início" },
  { id: "maindx-produtos", slug: "maindx-produtos", nome: "Maindx Produtos", menu: "Produtos" },
  { id: "maindx-planos", slug: "maindx-planos", nome: "Maindx Planos", menu: "Planos" },
  { id: "maindx-parceiros", slug: "maindx-parceiros", nome: "Maindx Parceiros", menu: "Parceiros" },
  { id: "maindx-sobre", slug: "maindx-sobre", nome: "Maindx Sobre", menu: "Sobre nós" },
] as const;

const url = (slug: string, ancora?: string) => `/p/${slug}${ancora ? `#${ancora}` : ""}`;
const URL_PRODUTOS = url("maindx-produtos");
const URL_PLANOS = url("maindx-planos");

/** Os três produtos da linha. `ancora` é a seção de cada um em Produtos. */
const PRODUTOS = [
  {
    ancora: "totem", nome: "Maindx Totem",
    frase: "Seu cliente pede e paga sozinho.",
    resumo: "Autoatendimento de balcão ou de chão. Menos fila, ticket maior e a equipe livre pra atender.",
  },
  {
    ancora: "caixa", nome: "Maindx Caixa",
    frase: "Vender no balcão, em três toques.",
    resumo: "Frente de caixa com nota fiscal, todas as formas de pagamento, estoque e fechamento certo.",
  },
  {
    ancora: "online", nome: "Maindx Online",
    frase: "Sua loja vendendo pelo WhatsApp.",
    resumo: "Catálogo digital e atendente com IA que responde e fecha a venda a qualquer hora.",
  },
] as const;

function config(tituloSeo: string, descricaoSeo: string): PaginaConfig {
  return {
    tituloSeo, descricaoSeo,
    corFundo: BRANCO, corTexto: "#1d1d1f", corPrimaria: TINTA, corSuave: CLARO,
    fonte: "inter", fonteTitulo: "inter", raio: 20, sombra: "leve", larguraMax: 1120,
    pesoTitulo: 600, destaque: "cor", rolagemViva: true,
    lembrarProgresso: true,
  };
}

// ── Peças que se repetem ─────────────────────────────────────────────────────
function menu() {
  return SITE_MAINDX.map((p) => ({ id: novoId("lk"), texto: p.menu, url: url(p.slug) }));
}

function cabecalho(): Bloco {
  return bloco("cabecalho", {
    estilo: { padTop: 0, padBottom: 0 },
    cabecalho: { marca: "Maindx", logoUrl: "", links: menu(), rotuloBotao: "Montar meu kit", urlBotao: URL_PLANOS, fixo: true },
  });
}

// Manchete em dois tons: `destaque` é o trecho que recua pro cinza.
const h1 = (texto: string, destaque: string, extra: Estilo = {}, trocas?: string[]) => bloco("titulo", {
  texto, nivel: 1, destaque, trocas,
  estilo: { tamanho: 80, tamanhoMobile: 42, padTop: 72, padBottom: 16, largura: "larga", animacao: "subir", ...extra },
});
const h2 = (texto: string, destaque?: string, extra: Estilo = {}) => bloco("titulo", {
  texto, nivel: 2, destaque,
  estilo: { tamanho: 56, tamanhoMobile: 34, padBottom: 10, largura: "larga", ...extra },
});
const h3 = (texto: string) => bloco("titulo", {
  texto, nivel: 3, estilo: { tamanho: 24, tamanhoMobile: 22, align: "left", padTop: 4, padBottom: 0 },
});
const apoio = (texto: string, extra: Estilo = {}) => bloco("texto", {
  texto, estilo: { tamanho: 20, tamanhoMobile: 18, largura: "normal", align: "center", padBottom: 28, cor: undefined, ...extra },
});
const miudo = (texto: string, extra: Estilo = {}) => bloco("texto", {
  texto, estilo: { tamanho: 14, align: "center", padTop: 4, ...extra },
});
const foto = (alt: string, extra: Estilo = {}) => bloco("imagem", {
  url: "", alt, estilo: { raio: 28, padTop: 48, largura: "larga", ...extra },
});

/** Par de ações: botão principal + link "›". Lado a lado no computador; no
 *  celular a fundação empilha a grade e os dois ficam centrados, um embaixo
 *  do outro. */
function acoes(principal: string, destino: string, secundario: string, destino2: string): Bloco {
  return bloco("colunas", {
    colunasMobile: 2,
    estilo: { largura: "estreita", padTop: 4, padBottom: 0 },
    colunas: [
      { id: novoId("col"), blocos: [bloco("botao", { texto: principal, url: destino, estilo: { align: "center", padTop: 0, padBottom: 0 } })] },
      { id: novoId("col"), blocos: [bloco("botao", { texto: secundario, url: destino2, formato: "link", estilo: { align: "center", padTop: 0, padBottom: 0 } })] },
    ],
  });
}

// Seção escura com um brilho violeta subindo do pé — quase preto em cima,
// violeta profundo embaixo.
const DARK: Estilo = {
  fundo: ESCURO, cor: BRANCO,
  fundoGradienteCustom: { angulo: 180, paradas: [{ cor: "#000000", pos: 0 }, { cor: "#0d0720", pos: 55 }, { cor: "#2a1260", pos: 100 }] },
};

function perguntas(faq: ItemFaq[], fundo?: string): Secao {
  return secao("Perguntas", [
    h2("Perguntas frequentes."),
    apoio("Não achou a sua? A gente responde no WhatsApp."),
    bloco("faq", { estilo: { align: "left", largura: "normal" }, faq }),
  ], { padTop: 112, padBottom: 112, ...(fundo ? { fundo } : {}) });
}

function convite(titulo: string, destaque: string, texto: string): Secao {
  return secao("Convite final", [
    h2(titulo, destaque),
    apoio(texto),
    acoes("Montar meu kit", URL_PLANOS, "Falar com a gente", url("maindx-sobre")),
  ], { padTop: 128, padBottom: 128, ...DARK });
}

// Rodapé comum. Contato nasce SEM destino (vira texto apagado) até alguém
// preencher o número e o e-mail de verdade.
function rodape(): Secao {
  const lk = (texto: string, destino: string) => ({ id: novoId("lk"), texto, url: destino });
  return secao("Rodapé", [
    bloco("rodape", {
      estilo: { align: "left", padTop: 0, padBottom: 0 },
      rodape: {
        marca: "Maindx", logoUrl: "",
        texto: "Equipamento e sistema pra pequenos negócios venderem mais, com instalação e suporte inclusos.",
        colunas: [
          { id: novoId("rc"), titulo: "Produtos", links: PRODUTOS.map((p) => lk(p.nome.replace("Maindx ", ""), url("maindx-produtos", p.ancora))) },
          { id: novoId("rc"), titulo: "Empresa", links: [lk("Planos", URL_PLANOS), lk("Parceiros", url("maindx-parceiros")), lk("Sobre nós", url("maindx-sobre"))] },
          { id: novoId("rc"), titulo: "Contato", links: [lk("WhatsApp", ""), lk("E-mail", ""), lk("Suporte", "")] },
        ],
        linksLegais: [lk("Privacidade", ""), lk("Termos de uso", "")],
      },
    }),
  ], { padTop: 64, padBottom: 32, fundo: CLARO });
}

const depoimentosMolde = () => [
  depoimento("Nome do negócio", "Quanto a venda cresceu no primeiro mês, em uma frase.", "Loja de roupas"),
  depoimento("Nome do negócio", "Como ficou a fila depois do autoatendimento.", "Lanchonete"),
  depoimento("Nome do negócio", "O que mudou no fechamento do caixa.", "Mercadinho"),
  depoimento("Nome do negócio", "Quanto tempo levou da entrega ao primeiro cliente.", "Salão de beleza"),
  depoimento("Nome do negócio", "A venda que a IA fechou de madrugada.", "Loja online"),
  depoimento("Nome do negócio", "Como é o suporte quando algo aperta.", "Cafeteria"),
  depoimento("Nome do negócio", "Por que valeu mais que montar tudo por conta.", "MEI de acessórios"),
  depoimento("Nome do negócio", "O que o cliente comenta sobre a experiência.", "Estética"),
  depoimento("Nome do negócio", "O número que você olha toda semana.", "Pet shop"),
];

// ── 1. Início ────────────────────────────────────────────────────────────────
function montarInicio(): PaginaDoc {
  return {
    versao: 1,
    config: config(
      "Maindx: equipamento e sistema pra pequenos negócios venderem mais",
      "Autoatendimento, caixa e vendas online pra MEIs e pequenos negócios. Instalação e suporte inclusos, com investimento baixo.",
    ),
    secoes: [
      secao("Topo", [
        cabecalho(),
        // A parte cinza se reveza: onde e como o negócio passa a vender mais.
        h1("Venda mais no balcão.", "no balcão.", {}, ["no totem.", "no WhatsApp.", "de madrugada.", "gastando pouco."]),
        apoio("Equipamento e sistema pra pequenos negócios e MEIs. Autoatendimento, caixa e vendas online, instalados e funcionando, com um investimento que cabe no mês."),
        acoes("Ver os produtos", URL_PRODUTOS, "Ver planos", URL_PLANOS),
        foto("A linha Maindx: totem, caixa e celular com a loja online"),
        miudo("Instalação inclusa  ·  Sem multa de cancelamento  ·  Suporte de gente", { padTop: 28, cor: "#a1a1a6" }),
      ], { padTop: 16, padBottom: 96, ...DARK }),

      // Um quadro por produto, alternando claro e escuro.
      ...PRODUTOS.map((p, i) => secao(p.nome, [
        h2(`${p.nome.replace("Maindx ", "")}. ${p.frase}`, p.frase, { padTop: 0 }),
        apoio(p.resumo),
        acoes("Saiba mais", url("maindx-produtos", p.ancora), "Montar kit", URL_PLANOS),
        foto(p.nome, { padTop: 40 }),
      ], { padTop: 112, padBottom: 112, ...(i % 2 === 1 ? DARK : { fundo: i === 0 ? CLARO : BRANCO }) })),

      secao("Tudo que vem junto", [
        h2("Tudo que vem junto. Sem letra miúda.", "Sem letra miúda."),
        apoio("O que outros cobram à parte já vem no plano."),
        bloco("bento", {
          estilo: { align: "left", largura: "larga" },
          bento: [
            quadro("grande", "escuro", "Instalação inclusa", "A gente instala, configura e treina.", "Você não abre caixa, não liga cabo, não configura nada. No dia marcado, o equipamento chega e sai vendendo.", undefined, { texto: "Ver planos", url: URL_PLANOS }),
            quadro("normal", "cor", "Comodato", "Comece sem comprar equipamento.", "Paga só a mensalidade."),
            quadro("normal", "claro", "Suporte", "Gente de verdade.", "No WhatsApp, todos os dias."),
            quadro("largo", "claro", "Relatório", "Uma tela pra tudo que você vende.", "Balcão, totem e WhatsApp somados, por dia, produto e forma de pagamento.", ["Totem", "Caixa", "Online"]),
          ],
        }),
      ], { padTop: 112, padBottom: 112, fundo: BRANCO }),

      secao("Pra qualquer negócio", [
        h2("Feito pro negócio que você tem. Pronto pro que ele vai ser.", "Pronto pro que ele vai ser."),
        apoio("Do MEI que vende sozinho à loja com equipe. Você começa com uma peça e soma as outras quando fizer sentido."),
        bloco("carrossel", {
          estilo: { align: "left", largura: "larga" },
          slides: [
            slide("Lojas e boutiques", "Caixa rápido no balcão, catálogo no WhatsApp.", "Caixa + Online"),
            slide("Lanchonetes e cafés", "Totem no pico e pedido pago antes da cozinha.", "Totem + Caixa"),
            slide("Salões e estética", "Recepção pelo totem, agenda pelo WhatsApp.", "Totem + Online"),
            slide("Mercadinhos", "Estoque, nota e fechamento sem planilha.", "Caixa"),
            slide("Prestadores de serviço", "Orçamento e cobrança pelo celular, com a IA respondendo.", "Online"),
            slide("Quem vende só online", "Loja no WhatsApp atendendo a qualquer hora.", "Online"),
          ],
        }),
      ], { padTop: 112, padBottom: 112, fundo: CLARO }),

      secao("Investimento", [
        h2("Investimento pequeno. Diferença grande.", "Diferença grande."),
        apoio("Montar tudo por conta sai caro e dá trabalho. Com a Maindx, equipamento, sistema, instalação e suporte vêm juntos, num valor por mês."),
        bloco("comparacao", {
          estilo: { largura: "normal" },
          comparacao: {
            colunaNos: "Maindx",
            colunaEles: "Por conta",
            linhas: [
              linhaComp("Equipamento, sistema e instalação num valor só", true, false),
              linhaComp("Começar sem comprar equipamento", true, false),
              linhaComp("Suporte de quem instalou", true, false),
              linhaComp("Balcão, totem e online no mesmo relatório", true, false),
              linhaComp("Um fornecedor pra cada peça", false, true),
            ],
          },
        }),
      ], { padTop: 112, padBottom: 112, ...DARK }),

      secao("Depoimentos", [
        h2("Quem já vende com a Maindx.", "com a Maindx."),
        apoio("Troque pelos depoimentos reais dos clientes, com nome, segmento e foto."),
        bloco("depoimentos", { formato: "colunas", depoimentos: depoimentosMolde() }),
      ], { padTop: 112, padBottom: 112, fundo: BRANCO }),

      perguntas([
        duvida("O que a Maindx vende?", "Equipamento com sistema pra pequenos negócios: totem de autoatendimento, caixa de balcão e vendas online com IA no WhatsApp. Chega instalado e configurado."),
        duvida("Serve pro meu negócio?", "Se você vende produto ou serviço pra cliente final, serve. Loja, alimentação, beleza, mercadinho, prestador de serviço e quem vende só online."),
        duvida("Preciso comprar o equipamento?", "Não necessariamente. Dá pra comprar, parcelar ou usar em comodato junto da mensalidade."),
        duvida("Sou MEI. Tem plano pra mim?", "Tem. O plano de entrada foi pensado pra quem está começando e cabe no caixa de um MEI."),
        duvida("E se eu precisar de ajuda?", "O suporte é feito por gente, no WhatsApp, e a instalação vem com treino."),
      ], CLARO),

      convite("Seu próximo cliente já está a caminho.", "já está a caminho.", "Escolha o kit, a gente instala e você começa a vender no mesmo dia."),
      rodape(),
    ],
  };
}

// ── 2. Produtos ──────────────────────────────────────────────────────────────
// Vitrine da linha: grade com os três, depois um quadro por produto (com
// âncora) e o "tudo conversa" no fim.
function montarProdutos(): PaginaDoc {
  const DETALHE: Record<(typeof PRODUTOS)[number]["ancora"], { destaques: ReturnType<typeof recurso>[]; kit: ItemLista[] }> = {
    totem: {
      destaques: [
        recurso("trending-up", "Ticket maior", "Adicional e combo sugeridos na hora certa, sem vendedor precisar lembrar."),
        recurso("clock-hour-4", "Fila menor", "Vários clientes pedindo ao mesmo tempo."),
        recurso("credit-card", "Pago na hora", "Cartão, aproximação e Pix no próprio totem."),
      ],
      kit: [item("Tela sensível ao toque", "Confirme medida e orientação do modelo."), item("Maquininha integrada"), item("Impressora de comprovante"), item("Suporte de chão ou de balcão")],
    },
    caixa: {
      destaques: [
        recurso("bolt", "Rápido", "Os itens mais vendidos a um toque, busca por nome ou código."),
        recurso("rosette-discount-check", "Com nota", "Nota fiscal emitida direto no fechamento da venda."),
        recurso("shield-check", "Sem susto", "Continua vendendo sem internet e sincroniza depois."),
      ],
      kit: [item("Terminal de caixa com tela de toque"), item("Impressora térmica"), item("Gaveta de dinheiro"), item("Leitor de código de barras"), item("Maquininha integrada")],
    },
    online: {
      destaques: [
        recurso("message-circle", "Atende sozinho", "A IA responde, tira dúvida e fecha a venda no WhatsApp."),
        recurso("world-www", "Catálogo seu", "Link próprio com foto, preço e variação, sem comissão por venda."),
        recurso("users-plus", "Cliente seu", "Contato e histórico ficam na sua base, pra campanha e recompra."),
      ],
      kit: [item("Sem equipamento", "Roda no navegador e no celular."), item("Mesmo número de WhatsApp"), item("Integração com o Caixa e o Totem")],
    },
  };

  return {
    versao: 1,
    config: config(
      "Produtos Maindx: Totem, Caixa e Online",
      "A linha Maindx pra pequenos negócios: totem de autoatendimento, caixa de balcão e vendas online com IA.",
    ),
    secoes: [
      secao("Topo", [
        cabecalho(),
        h1("Três produtos. Um sistema só.", "Um sistema só.", { padBottom: 12 }),
        apoio("Cada peça resolve uma parte da venda e todas conversam entre si. Comece por uma e some as outras quando quiser."),
      ], { padTop: 16, padBottom: 32, fundo: BRANCO }),

      secao("A linha", [
        bloco("bento", {
          estilo: { align: "left", largura: "larga" },
          bento: [
            quadro("grande", "escuro", "Hardware + software", PRODUTOS[0].nome, PRODUTOS[0].frase, ["Autoatendimento", "Pagamento no totem"], { texto: "Explorar", url: url("maindx-produtos", "totem") }),
            quadro("largo", "escuro", "Hardware + software", PRODUTOS[1].nome, PRODUTOS[1].frase, ["Nota fiscal", "Funciona sem internet"], { texto: "Explorar", url: url("maindx-produtos", "caixa") }),
            quadro("largo", "cor", "Software com IA", PRODUTOS[2].nome, PRODUTOS[2].frase, ["WhatsApp", "Sem comissão"], { texto: "Explorar", url: url("maindx-produtos", "online") }),
          ],
        }),
      ], { padTop: 16, padBottom: 112, fundo: BRANCO }),

      ...PRODUTOS.map((p, i) => secao(p.nome, [
        h2(`${p.nome}. ${p.frase}`, p.frase, { padTop: 0 }),
        apoio(p.resumo),
        acoes("Montar com este", URL_PLANOS, "Ver planos", URL_PLANOS),
        foto(p.nome, { padTop: 40, padBottom: 48 }),
        bloco("recursos", { estilo: { align: "left", largura: "larga" }, recursos: DETALHE[p.ancora].destaques }),
        bloco("texto", { texto: "O que vem no kit", estilo: { tamanho: 13, align: "left", largura: "normal", padTop: 40, padBottom: 4, cor: i % 2 === 0 ? "#a1a1a6" : "#6e6e73" } }),
        bloco("beneficios", { estilo: { align: "left", largura: "normal" }, itens: DETALHE[p.ancora].kit }),
      ], { padTop: 112, padBottom: 112, ...(i % 2 === 0 ? DARK : { fundo: CLARO }) }, p.ancora)),

      secao("Tudo conversa", [
        h2("Juntos, eles fazem mais.", "fazem mais."),
        apoio("A venda do totem cai no caixa, o pedido do WhatsApp cai no mesmo lugar, e o relatório soma tudo."),
        bloco("passos", {
          estilo: { align: "left", largura: "normal" },
          passos: [
            passo("O cliente escolhe", "No totem, no balcão ou pelo WhatsApp."),
            passo("Paga do jeito dele", "Cartão, aproximação, Pix ou dinheiro."),
            passo("Você vê tudo", "Cada venda no mesmo caixa e no mesmo relatório."),
          ],
        }),
      ], { padTop: 112, padBottom: 112, fundo: BRANCO }),

      perguntas([
        duvida("Posso começar com um produto só?", "Pode. A maioria começa pelo Caixa ou pelo Online e soma o Totem depois. Tudo entra na mesma conta."),
        duvida("A ficha técnica muda?", "Os modelos podem mudar de geração. Um consultor confirma o equipamento do seu kit antes da instalação."),
        duvida("Funciona sem internet?", "O Caixa continua vendendo e sincroniza quando a conexão volta. O Totem avisa o cliente e direciona pro balcão."),
      ], CLARO),

      convite("Monte o seu kit.", "o seu kit.", "Escolha as peças, a gente instala e configura. Você só liga e vende."),
      rodape(),
    ],
  };
}

// ── 3. Planos ────────────────────────────────────────────────────────────────
function montarPlanos(): PaginaDoc {
  return {
    versao: 1,
    config: config(
      "Planos Maindx",
      "Kits com equipamento, sistema, instalação e suporte. Compra, parcelamento ou comodato, a partir de um valor que cabe no mês.",
    ),
    secoes: [
      secao("Topo", [
        cabecalho(),
        h1("Um kit do tamanho do seu negócio.", "do seu negócio."),
        apoio("Equipamento, sistema, instalação e suporte no mesmo plano. O equipamento pode ser comprado, parcelado ou ficar em comodato."),
      ], { padTop: 16, padBottom: 32, fundo: BRANCO }),

      secao("Kits", [
        bloco("planos", {
          planos: [
            plano({
              nome: "Essencial", preco: "R$ X", periodo: "/mês",
              beneficios: ["Maindx Caixa com nota fiscal", "Terminal, impressora e gaveta", "Relatório de vendas", "Suporte de gente"],
              rotuloBotao: "Quero o Essencial", checkoutUrl: "",
            }),
            plano({
              nome: "Autoatendimento", preco: "R$ X", periodo: "/mês", destaque: true, selo: "Mais escolhido",
              beneficios: ["Tudo do Essencial", "Maindx Totem", "Pagamento no próprio totem", "Instalação e treino"],
              rotuloBotao: "Quero o Autoatendimento", checkoutUrl: "",
            }),
            plano({
              nome: "Completo", preco: "R$ X", periodo: "/mês",
              beneficios: ["Tudo do Autoatendimento", "Maindx Online com IA", "Catálogo no WhatsApp", "Gerente de conta"],
              rotuloBotao: "Quero o Completo", checkoutUrl: "",
            }),
          ],
        }),
        miudo("Preços de molde: troque pelos valores reais antes de publicar.", { cor: "#6e6e73", padTop: 20 }),
      ], { padTop: 16, padBottom: 112, fundo: BRANCO }),

      secao("Todo plano inclui", [
        h2("Em todo plano.", "todo plano."),
        bloco("recursos", {
          estilo: { align: "left", largura: "larga" },
          recursos: [
            recurso("truck-delivery", "Entrega e instalação", "Equipamento instalado e testado com venda de verdade."),
            recurso("users-plus", "Treino", "Você e a equipe saem sabendo usar."),
            recurso("message-circle", "Suporte de gente", "Resposta no WhatsApp, todos os dias."),
            recurso("shield-check", "Garantia", "Defeito de equipamento vira troca, não dor de cabeça."),
          ],
        }),
      ], { padTop: 112, padBottom: 112, fundo: CLARO }),

      secao("Comprar ou comodato", [
        h2("Comprar ou usar em comodato?", "usar em comodato?"),
        apoio("Mesmo sistema e mesmo suporte nos dois. Muda quem é dono do equipamento."),
        bloco("comparacao", {
          estilo: { largura: "normal" },
          comparacao: {
            colunaNos: "Comodato",
            colunaEles: "Compra",
            linhas: [
              linhaComp("Sem investimento inicial no equipamento", true, false),
              linhaComp("Troca por defeito inclusa", true, false),
              linhaComp("Equipamento fica sendo seu", false, true),
              linhaComp("Mensalidade menor", false, true),
            ],
          },
        }),
      ], { padTop: 112, padBottom: 112, ...DARK }),

      secao("Consultor", [
        h2("Quer ajuda pra escolher?", "pra escolher?"),
        apoio("Conta um pouco do seu negócio e a gente responde com a proposta."),
        bloco("formulario", {
          estilo: { align: "left", largura: "estreita" },
          campos: [
            campo("nome", "Seu nome", "Como podemos te chamar?"),
            campo("telefone", "WhatsApp", "(00) 00000-0000"),
            { ...campo("selecao", "Seu negócio"), opcoes: ["Loja", "Alimentação", "Beleza e estética", "Mercadinho", "Serviços", "Só online", "Outro"] },
            campo("texto", "Nome do negócio e cidade", "Ex.: Ateliê Flor, Campinas", false),
          ],
          envio: { acao: "mensagem", mensagem: "Recebemos! A gente chama você no WhatsApp ainda hoje.", rotuloBotao: "Quero uma proposta" },
        }),
      ], { padTop: 112, padBottom: 112, fundo: BRANCO }),

      perguntas([
        duvida("Tem fidelidade?", "Não tem multa de cancelamento. No comodato, o equipamento é devolvido no fim do contrato."),
        duvida("A instalação é cobrada à parte?", "Não. Entrega, instalação e treino estão no plano."),
        duvida("Posso mudar de plano depois?", "Pode. As peças novas entram na mesma conta."),
        duvida("Tenho mais de uma unidade.", "Tem condição própria. Fale com a gente pelo formulário acima."),
      ], CLARO),

      convite("Comece pequeno. Cresça rápido.", "Cresça rápido.", "Escolha o plano, marque a instalação e comece a vender com tudo funcionando."),
      rodape(),
    ],
  };
}

// ── 4. Parceiros ─────────────────────────────────────────────────────────────
function montarParceiros(): PaginaDoc {
  return {
    versao: 1,
    config: config(
      "Seja parceiro Maindx",
      "Leve a Maindx aos pequenos negócios da sua região. Comissão recorrente, treino e suporte do time.",
    ),
    secoes: [
      secao("Topo", [
        cabecalho(),
        h1("Leve a Maindx pra sua região.", "pra sua região."),
        apoio("Pra quem instala automação comercial, vende equipamento ou atende pequenos negócios. Você indica ou revende; o sistema e o suporte ficam com a gente."),
      ], { padTop: 16, padBottom: 96, ...DARK }),

      secao("Por que", [
        h2("O que o parceiro ganha.", "ganha."),
        bloco("recursos", {
          estilo: { align: "left", largura: "larga" },
          recursos: [
            recurso("trending-up", "Receita recorrente", "Comissão enquanto o cliente indicado continuar ativo."),
            recurso("trophy", "Certificação", "Treino no equipamento e no sistema."),
            recurso("target-arrow", "Material de venda", "Apresentação, vídeo e proposta prontos."),
            recurso("message-circle", "Suporte de retaguarda", "O cliente liga pra gente quando aperta."),
          ],
        }),
      ], { padTop: 112, padBottom: 112, fundo: BRANCO }),

      secao("Como entra", [
        h2("Como virar parceiro.", "parceiro."),
        bloco("passos", {
          estilo: { align: "left", largura: "normal" },
          passos: [
            passo("Cadastro", "Preencha o formulário com a sua empresa e a região."),
            passo("Conversa", "O time de parcerias entende o seu modelo."),
            passo("Treino", "Certificação nos três produtos."),
            passo("Primeiro cliente", "A gente acompanha a primeira venda e instalação."),
          ],
        }),
      ], { padTop: 112, padBottom: 112, fundo: CLARO }),

      secao("Cadastro", [
        h2("Cadastro de parceiro.", "parceiro."),
        bloco("formulario", {
          estilo: { align: "left", largura: "estreita" },
          campos: [
            campo("nome", "Seu nome", "Como podemos te chamar?"),
            campo("email", "E-mail", "voce@empresa.com"),
            campo("telefone", "WhatsApp", "(00) 00000-0000"),
            { ...campo("selecao", "Você é…"), opcoes: ["Revenda de automação", "Técnico ou instalador", "Consultor de pequenos negócios", "Outro"] },
            campo("texto", "Empresa e cidades que atende", "Ex.: TecBalcão, região de Ribeirão Preto"),
          ],
          envio: { acao: "mensagem", mensagem: "Recebemos seu cadastro. O time de parcerias chama você em até 2 dias úteis.", rotuloBotao: "Quero ser parceiro" },
        }),
      ], { padTop: 112, padBottom: 112, fundo: BRANCO }),

      perguntas([
        duvida("Preciso ter CNPJ?", "Sim. A comissão é paga pra empresa parceira."),
        duvida("Tenho que comprar estoque de equipamento?", "Não. O equipamento sai da Maindx direto pro cliente."),
        duvida("Quem dá suporte ao cliente?", "O time da Maindx. O parceiro acompanha se quiser."),
      ], CLARO),

      convite("Cresça junto com quem você atende.", "junto com quem você atende.", "Cadastro rápido, treino do time e comissão recorrente."),
      rodape(),
    ],
  };
}

// ── 5. Sobre ─────────────────────────────────────────────────────────────────
function montarSobre(): PaginaDoc {
  return {
    versao: 1,
    config: config(
      "Sobre a Maindx",
      "Por que a Maindx existe: dar ao pequeno negócio a mesma experiência de venda das grandes marcas, com investimento baixo.",
    ),
    secoes: [
      secao("Topo", [
        cabecalho(),
        h1("Experiência de marca grande. Preço de negócio pequeno.", "Preço de negócio pequeno."),
        apoio("A Maindx existe pra que o MEI e a loja do bairro atendam com a mesma qualidade das grandes redes, sem precisar do mesmo investimento."),
      ], { padTop: 16, padBottom: 96, ...DARK }),

      secao("História", [
        h2("De onde viemos.", "viemos."),
        bloco("texto", {
          texto: "Troque este parágrafo pela história real: quando e onde a Maindx começou, quem fundou, qual foi o primeiro cliente e o que mudou desde então. Duas ou três frases bastam.",
          estilo: { tamanho: 20, tamanhoMobile: 18, largura: "normal", align: "center" },
        }),
        foto("Time Maindx"),
      ], { padTop: 112, padBottom: 112, fundo: BRANCO }),

      secao("Valores", [
        h2("No que a gente acredita.", "acredita."),
        bloco("recursos", {
          estilo: { align: "left", largura: "larga" },
          recursos: [
            recurso("shield-check", "Um responsável só", "Se algo para, quem resolve é a gente, do equipamento ao sistema."),
            recurso("star", "Detalhe importa", "A experiência do seu cliente começa no primeiro toque."),
            recurso("message-circle", "Gente de verdade", "Suporte respondido por pessoas que conhecem o seu negócio."),
            recurso("rosette-discount-check", "Sem letra miúda", "Preço, contrato e comodato explicados antes da assinatura."),
          ],
        }),
      ], { padTop: 112, padBottom: 112, fundo: CLARO }),

      convite("Vamos montar o seu.", "o seu.", "Fale com a gente ou veja os kits prontos."),
      rodape(),
    ],
  };
}

// ── Catálogo do site ─────────────────────────────────────────────────────────
export interface DefSiteMaindx { id: string; nome: string; descricao: string; icone: string; montar: () => PaginaDoc }

const MONTADORES: Record<(typeof SITE_MAINDX)[number]["id"], { descricao: string; icone: string; montar: () => PaginaDoc }> = {
  landing: { icone: "layout-dashboard", montar: montarInicio, descricao: "Página inicial: manchete, um quadro por produto, pra qualquer negócio, investimento, depoimentos rolando, dúvidas e convite." },
  "maindx-produtos": { icone: "layout-grid", montar: montarProdutos, descricao: "Vitrine da linha: grade com os três produtos e um quadro detalhado de cada um, com âncora (#totem, #caixa, #online)." },
  "maindx-planos": { icone: "credit-card", montar: montarPlanos, descricao: "Kits com preço, o que todo plano inclui, compra × comodato e formulário de proposta." },
  "maindx-parceiros": { icone: "users", montar: montarParceiros, descricao: "Programa de parceiros: ganhos, como entrar e cadastro." },
  "maindx-sobre": { icone: "building-store", montar: montarSobre, descricao: "Sobre a empresa: propósito, história e valores." },
};

/** As páginas, na ordem do menu, prontas pro catálogo de templates. */
export const PAGINAS_SITE_MAINDX: DefSiteMaindx[] = SITE_MAINDX.map((p) => ({
  id: p.id, nome: p.nome, ...MONTADORES[p.id],
}));

/** Banco de provas: troca `/p/<slug do site>[#âncora]` pelo endereço do
 *  preview, pra navegar entre as páginas sem banco. Em produção nada disso roda. */
export function linkDePreview(destino: string | undefined, paraPreview: (templateId: string) => string): string | undefined {
  if (!destino) return destino;
  const [caminho, ancora] = destino.split("#");
  const achado = SITE_MAINDX.find((p) => caminho === url(p.slug));
  return achado ? `${paraPreview(achado.id)}${ancora ? `#${ancora}` : ""}` : destino;
}
