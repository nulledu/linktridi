// TridiFlow — TEMPLATES DE PÁGINA.
//
// São pontos de partida editáveis, não layouts fechados: cada template devolve
// um `PaginaDoc` novo em folha, montado com `novaSecao`/`novoBloco` pra herdar
// os padrões da fábrica (estilo, visibilidade, campos por tipo) e nunca nascer
// inválido.
//
// ATENÇÃO ao motivo de tudo aqui ser função: `novoBloco` sorteia ids. Se o doc
// fosse uma constante avaliada uma vez, duas páginas criadas do mesmo template
// compartilhariam os MESMOS ids de bloco — e id repetido quebra seleção no
// editor e os gatilhos de liberação no runtime. Por isso `doc` é um getter que
// remonta a árvore a cada leitura e `templatePaginaPorId` sempre devolve um doc
// recém-construído.

import {
  type Bloco, type BlocoTipo, type CampoForm, type CampoTipo, type Estilo,
  type ItemDepoimento, type ItemFaq, type ItemLista, type PaginaConfig,
  type PaginaDoc, type Secao, type Visibilidade,
  novaSecao, novoBloco, novoId,
} from "./tridiflow-pagina";
import { PAGINAS_SITE_MAINDX } from "./tridiflow-site-maindx";

export interface TemplatePagina {
  id: string;
  nome: string;
  descricao: string;
  icone: string;      // nome de ícone Tabler existente em app/(plataforma)/Icon.tsx
  /** Tipo gravado em `config.template` (rótulo da listagem). Ausente = o id. */
  tipo?: string;
  /** Agrupa templates que andam juntos (as páginas de um mesmo site). */
  categoria?: string;
  doc: PaginaDoc;
}

// ── Atalhos de montagem ──────────────────────────────────────────────────────
// `bloco()` parte SEMPRE do `novoBloco(tipo)` e só sobrescreve o que o template
// precisa — o estilo é mesclado (não substituído) pra não perder os padrões.
function bloco(tipo: BlocoTipo, ajuste: Partial<Bloco> = {}): Bloco {
  const base = novoBloco(tipo);
  return { ...base, ...ajuste, estilo: { ...base.estilo, ...(ajuste.estilo ?? {}) } };
}

function secao(nome: string, blocos: Bloco[], estilo: Estilo = {}): Secao {
  const base = novaSecao(nome);
  return { ...base, estilo: { ...base.estilo, ...estilo }, blocos };
}

const item = (titulo: string, texto?: string): ItemLista => ({ id: novoId("i"), titulo, texto });
const duvida = (pergunta: string, resposta: string): ItemFaq => ({ id: novoId("q"), pergunta, resposta });
const depoimento = (nome: string, texto: string, cargo?: string): ItemDepoimento =>
  ({ id: novoId("d"), nome, texto, cargo, nota: 5 });
const campo = (tipo: CampoTipo, rotulo: string, placeholder?: string): CampoForm =>
  ({ id: novoId("c"), tipo, rotulo, placeholder, obrigatorio: true });
const metrica = (numero: string, rotulo: string) => ({ id: novoId("m"), numero, rotulo });
const recurso = (icone: string, titulo: string, texto: string) => ({ id: novoId("r"), icone, titulo, texto });
const linhaComp = (recursoNome: string, nos: boolean, eles: boolean) => ({ id: novoId("cp"), recurso: recursoNome, nos, eles });

/** Liberar só depois de N segundos de VÍDEO assistido (coração da VSL). */
const aposVideo = (segundos: number): Visibilidade => ({ modo: "apos_tempo", segundos, base: "video" });

const CONFIG: PaginaConfig = {
  corFundo: "#ffffff", corTexto: "#111114", corPrimaria: "#7c3aed",
  fonte: "sistema", larguraMax: 720, lembrarProgresso: true,
};

const config = (tituloSeo: string, descricaoSeo: string): PaginaConfig =>
  ({ ...CONFIG, tituloSeo, descricaoSeo });

// ── 1. VSL ───────────────────────────────────────────────────────────────────
function montarVsl(): PaginaDoc {
  return {
    versao: 1,
    config: config(
      "Personalize suas embalagens sem depender de gráfica",
      "Assista ao vídeo e veja como um único carimbo personaliza embalagens, cartões e etiquetas por centavos a unidade.",
    ),
    secoes: [
      secao("Topo — vídeo", [
        bloco("titulo", {
          texto: "Sua marca em cada embalagem, sem depender de gráfica",
          nivel: 1,
          estilo: { tamanho: 40, tamanhoMobile: 28, padBottom: 8 },
        }),
        bloco("texto", {
          texto: "Assista ao vídeo abaixo: em poucos minutos você entende como centenas de empreendedores personalizam embalagens, etiquetas e cartões com um único carimbo — gastando centavos por unidade e sem pedir nada pra gráfica.",
          estilo: { tamanho: 17, padBottom: 20 },
        }),
        bloco("video", {
          video: { fonte: "url", url: "", capaUrl: "", autoplay: true, mudo: true, controles: false, proporcao: "16:9" },
          estilo: { padBottom: 16, largura: "normal" },
        }),
        bloco("aviso", {
          texto: "Assista até o final: a condição especial aparece só pra quem chega no fim do vídeo.",
          estilo: { fundo: "#FEF3C7", cor: "#92400E", raio: 10, padX: 14, padTop: 12, padBottom: 12 },
        }),
      ], { padTop: 48, padBottom: 24 }),

      secao("Quem já usa", [
        bloco("titulo", {
          texto: "Quem já testou não volta atrás",
          nivel: 2,
          visivel: aposVideo(180),
          estilo: { tamanho: 26, tamanhoMobile: 22, padBottom: 4 },
        }),
        bloco("depoimentos", {
          visivel: aposVideo(180),
          depoimentos: [
            depoimento("Ana Paula", "Comecei carimbando as sacolinhas e virou a identidade da loja. Cliente sempre comenta que a embalagem parece de marca grande.", "Doceria artesanal"),
            depoimento("Rafael Menezes", "Eu gastava quase R$ 400 por mês em etiqueta impressa. Com o carimbo, esse custo praticamente sumiu.", "Loja de roupas"),
            depoimento("Juliana Rocha", "Chegou rápido, o traço sai limpinho e uso todo dia há mais de um ano. Melhor compra do ateliê.", "Ateliê de velas"),
          ],
        }),
      ], { padTop: 24, padBottom: 24 }),

      secao("Oferta liberada", [
        bloco("titulo", {
          texto: "Condição liberada pra você que assistiu até aqui",
          nivel: 2,
          visivel: aposVideo(300),
          estilo: { tamanho: 28, tamanhoMobile: 22, padBottom: 4 },
        }),
        bloco("contador", {
          visivel: aposVideo(300),
          contador: { minutos: 15, rotulo: "Esta condição expira em", aoZerar: "fica" },
          estilo: { padBottom: 8 },
        }),
        bloco("oferta", {
          visivel: aposVideo(300),
          oferta: {
            produto: "Kit Carimbo Personalizado",
            descricao: "Carimbo de borracha sólida cortada a laser, feito com a sua arte. Você aprova o modelo antes da fabricação.",
            imagemUrl: "",
            precoAntes: "R$ 297",
            preco: "R$ 197",
            parcelamento: "ou 12x de R$ 19,90 no cartão",
            beneficios: [
              "Arte personalizada com a sua logo (a gente cria se você não tiver)",
              "Traço definido, sem falhas nem borrões",
              "Menos de R$ 0,30 por embalagem personalizada",
              "Durabilidade de mais de 5 anos de uso diário",
              "Frete grátis para todo o Brasil",
            ],
            rotuloBotao: "Quero meu carimbo personalizado",
            checkoutUrl: "",
            selo: "Condição do vídeo",
            garantia: "7 dias de garantia — não gostou, devolvemos o valor",
            extra: "Fabricação e envio em até 3 dias úteis após a aprovação da arte",
            destaque: true,
          },
        }),
      ], { padTop: 24, padBottom: 24 }),

      secao("Dúvidas", [
        bloco("titulo", {
          texto: "Perguntas frequentes",
          nivel: 2,
          estilo: { tamanho: 24, tamanhoMobile: 20, padBottom: 4 },
        }),
        bloco("faq", {
          faq: [
            duvida("Como funciona depois que eu compro?", "Chamamos você no WhatsApp para coletar a arte, mandamos um modelo do carimbo para sua aprovação e só então fabricamos. O envio sai em até 3 dias úteis após o aceite."),
            duvida("Não tenho logo. Consigo comprar mesmo assim?", "Sim. Nossa equipe monta a arte com o nome da sua marca sem custo extra e envia para você aprovar antes de qualquer produção."),
            duvida("Serve em qual tipo de embalagem?", "Papel kraft, sacolas, caixas, etiquetas, tags, envelopes e cartões. Em superfícies lisas, basta usar a tinta indicada no manual que enviamos junto."),
            duvida("Quanto tempo o carimbo dura?", "Com uso diário e limpeza simples, passa de 5 anos. A borracha é sólida e cortada a laser, não é aquele carimbo de papelaria."),
            duvida("E se eu não gostar?", "Você tem 7 dias após o recebimento para pedir a devolução integral do valor. Sem burocracia."),
          ],
        }),
      ], { padTop: 24, padBottom: 16 }),

      secao("Fechamento", [
        bloco("aviso", {
          texto: "Lote atual com frete grátis e brinde: encerramos assim que as unidades separadas acabarem.",
          estilo: { fundo: "#F3E8FF", cor: "#5B21B6", raio: 12, padX: 16, padTop: 14, padBottom: 14 },
        }),
      ], { padTop: 8, padBottom: 56 }),
    ],
  };
}

// ── 2. Captura ───────────────────────────────────────────────────────────────
function montarCaptura(): PaginaDoc {
  return {
    versao: 1,
    config: config(
      "Receba o catálogo e o orçamento personalizado",
      "Deixe seus dados e enviamos o catálogo completo com os modelos, prazos e valores.",
    ),
    secoes: [
      secao("Captura", [
        bloco("titulo", {
          texto: "Receba o catálogo completo e um orçamento sob medida",
          nivel: 1,
          estilo: { tamanho: 36, tamanhoMobile: 26, padBottom: 8 },
        }),
        bloco("texto", {
          texto: "Preencha os campos abaixo e mandamos, no seu WhatsApp e e-mail, os modelos disponíveis, os prazos de produção e o valor exato para o tamanho que a sua marca precisa.",
          estilo: { tamanho: 17, padBottom: 20 },
        }),
        bloco("beneficios", {
          estilo: { align: "left", padBottom: 20 },
          itens: [
            item("Catálogo com todos os modelos", "Carimbos, chancelas e kits, com medidas e aplicações reais."),
            item("Orçamento no seu tamanho", "Você recebe o valor certo, sem precisar adivinhar."),
            item("Atendimento humano no WhatsApp", "Uma pessoa de verdade tira suas dúvidas antes de qualquer compra."),
            item("Sem compromisso", "Receber o material não te obriga a nada."),
          ],
        }),
        bloco("formulario", {
          estilo: { align: "left" },
          campos: [
            campo("nome", "Seu nome", "Como podemos te chamar?"),
            campo("email", "Seu e-mail", "voce@email.com"),
            campo("telefone", "Seu WhatsApp", "(00) 00000-0000"),
          ],
          envio: {
            acao: "mensagem",
            mensagem: "Prontinho! Recebemos seus dados e já estamos enviando o catálogo no seu WhatsApp.",
            rotuloBotao: "Quero receber o catálogo",
          },
        }),
      ], { padTop: 56, padBottom: 56 }),
    ],
  };
}

// ── 3. Venda simples ─────────────────────────────────────────────────────────
function montarVenda(): PaginaDoc {
  return {
    versao: 1,
    config: config(
      "Carimbo personalizado com a sua marca",
      "Embalagens com cara de marca profissional por centavos a unidade. Produção em até 3 dias úteis.",
    ),
    secoes: [
      secao("Topo", [
        bloco("titulo", {
          texto: "Transforme embalagem simples em embalagem de marca",
          nivel: 1,
          estilo: { tamanho: 36, tamanhoMobile: 26, padBottom: 8 },
        }),
        bloco("imagem", {
          url: "",
          alt: "Carimbo personalizado aplicado em uma embalagem kraft",
          estilo: { raio: 14, padBottom: 16 },
        }),
        bloco("texto", {
          texto: "Um carimbo feito com a sua arte, em borracha sólida cortada a laser. A mesma embalagem que você já compra passa a sair da sua mão com a identidade da sua marca — e você não depende de gráfica pra isso.",
          estilo: { tamanho: 17 },
        }),
      ], { padTop: 48, padBottom: 24 }),

      secao("Números", [
        bloco("metricas", {
          metricas: [
            metrica("+8 mil", "carimbos entregues"),
            metrica("4,9/5", "nota dos clientes"),
            metrica("3 dias", "para produzir e enviar"),
          ],
        }),
      ], { padTop: 8, padBottom: 8 }),

      secao("Benefícios", [
        bloco("titulo", {
          texto: "Por que vale mais que etiqueta impressa",
          nivel: 2,
          estilo: { tamanho: 26, tamanhoMobile: 22, padBottom: 4 },
        }),
        bloco("recursos", {
          estilo: { align: "left" },
          recursos: [
            recurso("credit-card", "Centavos por unidade", "Menos de R$ 0,30 por embalagem — a etiqueta impressa não chega perto."),
            recurso("bolt", "Um carimbo, tudo", "Sacola, caixa, tag, envelope e cartão com a mesma peça."),
            recurso("rosette-discount-check", "Traço limpo", "Corte a laser em borracha sólida, sem borrão. Não é carimbo de papelaria."),
            recurso("rocket", "Sem depender de ninguém", "Acabou a etiqueta? É só carimbar na hora, sem pedir nada pra gráfica."),
          ],
        }),
      ], { padTop: 16, padBottom: 16 }),

      secao("Comparação", [
        bloco("titulo", {
          texto: "Carimbo × etiqueta impressa",
          nivel: 2,
          estilo: { tamanho: 24, tamanhoMobile: 20, padBottom: 8 },
        }),
        bloco("comparacao", {
          comparacao: {
            colunaNos: "Carimbo",
            colunaEles: "Etiqueta",
            linhas: [
              linhaComp("Custo baixo por unidade", true, false),
              linhaComp("Serve em qualquer embalagem", true, false),
              linhaComp("Reposição na hora", true, false),
              linhaComp("Depende de fornecedor", false, true),
            ],
          },
        }),
      ], { padTop: 8, padBottom: 16 }),

      secao("Oferta", [
        bloco("oferta", {
          oferta: {
            produto: "Carimbo Personalizado Tridi",
            descricao: "Feito com a sua arte, aprovado por você antes da fabricação.",
            imagemUrl: "",
            precoAntes: "R$ 297",
            preco: "R$ 197",
            parcelamento: "ou 12x de R$ 19,90 no cartão",
            beneficios: [
              "Criação da arte inclusa",
              "Modelo enviado para aprovação antes de produzir",
              "Frete grátis para todo o Brasil",
              "Brinde surpresa no pedido",
            ],
            rotuloBotao: "Comprar agora",
            checkoutUrl: "",
            selo: "Mais vendido",
            garantia: "7 dias de garantia",
            extra: "Produção e envio em até 3 dias úteis após a aprovação",
            destaque: true,
          },
        }),
      ], { padTop: 16, padBottom: 24 }),

      secao("Prova social", [
        bloco("titulo", {
          texto: "O que dizem quem já comprou",
          nivel: 2,
          estilo: { tamanho: 24, tamanhoMobile: 20, padBottom: 4 },
        }),
        bloco("depoimentos", {
          depoimentos: [
            depoimento("Camila Duarte", "A embalagem ficou com outra cara. Vendi mais só de mudar a apresentação.", "Loja de acessórios"),
            depoimento("Marcos Vinícius", "Atendimento explicou tudo, aprovei a arte no mesmo dia e recebi na semana seguinte.", "Hamburgueria"),
          ],
        }),
      ], { padTop: 24, padBottom: 16 }),

      secao("Garantia", [
        bloco("garantia", {
          garantia: {
            titulo: "7 dias de garantia total",
            texto: "Recebeu e não gostou? Devolvemos 100% do valor em até 7 dias, sem burocracia e sem perguntas.",
            selo: "Compra 100% segura",
            dias: 7,
          },
        }),
      ], { padTop: 8, padBottom: 16 }),

      secao("Dúvidas", [
        bloco("faq", {
          faq: [
            duvida("Quanto tempo demora para chegar?", "Depois que você aprova a arte, fabricamos e enviamos em até 3 dias úteis. O prazo de entrega depende da sua região."),
            duvida("Posso mandar minha própria arte?", "Pode. Aceitamos PNG, JPG, PDF e arquivos vetoriais. Se você não tiver arte, nossa equipe cria sem custo extra."),
            duvida("Qual tinta devo usar?", "Enviamos a recomendação junto com o carimbo, de acordo com o material da sua embalagem."),
          ],
          estilo: { align: "left" },
        }),
      ], { padTop: 16, padBottom: 16 }),

      secao("Fechamento", [
        bloco("botao", {
          texto: "Quero meu carimbo personalizado",
          url: "",
          estilo: { padTop: 8, padBottom: 8 },
        }),
        bloco("texto", {
          texto: "Compra segura. Garantia de 7 dias após o recebimento.",
          estilo: { tamanho: 14, cor: "#6b7280" },
        }),
      ], { padTop: 8, padBottom: 56 }),
    ],
  };
}

// ── 4. Obrigado ──────────────────────────────────────────────────────────────
function montarObrigado(): PaginaDoc {
  return {
    versao: 1,
    config: config(
      "Recebemos seu pedido",
      "Confirmação de pedido — o próximo passo acontece no WhatsApp.",
    ),
    secoes: [
      secao("Confirmação", [
        bloco("titulo", {
          texto: "Tudo certo! Recebemos seus dados",
          nivel: 1,
          estilo: { tamanho: 34, tamanhoMobile: 26, padBottom: 8 },
        }),
        bloco("texto", {
          texto: "O próximo passo é rapidinho: nossa equipe vai te chamar no WhatsApp para coletar a arte, montar o modelo do seu carimbo e enviar para você aprovar. Depois da sua aprovação, produzimos e despachamos em até 3 dias úteis.",
          estilo: { tamanho: 17, padBottom: 20 },
        }),
        bloco("whatsapp", {
          texto: "Falar agora no WhatsApp",
          telefone: "",
          mensagem: "Olá! Acabei de finalizar meu pedido e quero enviar a arte do carimbo.",
          estilo: { padBottom: 16 },
        }),
        bloco("texto", {
          texto: "Não precisa esperar: se preferir adiantar, já pode mandar sua arte pelo botão acima.",
          estilo: { tamanho: 14, cor: "#6b7280" },
        }),
      ], { padTop: 64, padBottom: 64 }),
    ],
  };
}

// ── 5. Em branco ─────────────────────────────────────────────────────────────
function montarBranco(): PaginaDoc {
  return { versao: 1, secoes: [novaSecao("Seção")], config: { ...CONFIG } };
}

// ── Catálogo ─────────────────────────────────────────────────────────────────
interface DefTemplate { id: string; nome: string; descricao: string; icone: string; tipo?: string; categoria?: string; montar: () => PaginaDoc }

const DEFINICOES: DefTemplate[] = [
  {
    id: "vsl", nome: "Página com VSL", icone: "player-play",
    descricao: "Vídeo no topo e liberação temporizada: depoimentos aos 3 minutos, oferta aos 5. Ideal para vender pelo argumento do vídeo.",
    montar: montarVsl,
  },
  {
    id: "captura", nome: "Página de captura", icone: "mail",
    descricao: "Título, benefícios e formulário de nome, e-mail e WhatsApp. Para gerar lead antes de falar de preço.",
    montar: montarCaptura,
  },
  {
    id: "venda", nome: "Página de venda simples", icone: "shopping-cart",
    descricao: "Estrutura clássica de vendas: imagem, benefícios, card de oferta, depoimentos, dúvidas e botão final.",
    montar: montarVenda,
  },
  {
    id: "obrigado", nome: "Página de obrigado", icone: "circle-check",
    descricao: "Confirmação pós-compra ou pós-cadastro, com o próximo passo puxando o cliente para o WhatsApp.",
    montar: montarObrigado,
  },
  {
    id: "branco", nome: "Começar em branco", icone: "file-text",
    descricao: "Uma seção vazia. Você monta a página do zero, bloco por bloco.",
    montar: montarBranco,
  },
  // Site Maindx: 7 páginas que se ligam pelo cabeçalho (lib/tridiflow-site-maindx.ts).
  ...PAGINAS_SITE_MAINDX.map((p) => ({ ...p, tipo: "landing", categoria: "Site Maindx" })),
];

// `doc` é getter: cada leitura devolve uma árvore nova, com ids novos.
export const TEMPLATES_PAGINA: TemplatePagina[] = DEFINICOES.map((d) => ({
  id: d.id,
  nome: d.nome,
  descricao: d.descricao,
  icone: d.icone,
  tipo: d.tipo,
  categoria: d.categoria,
  get doc(): PaginaDoc { return d.montar(); },
}));

/** Devolve o template com um documento RECÉM-MONTADO (ids exclusivos daquela página). */
export function templatePaginaPorId(id: string | undefined): TemplatePagina | null {
  if (!id) return null;
  const d = DEFINICOES.find((t) => t.id === id);
  if (!d) return null;
  return { id: d.id, nome: d.nome, descricao: d.descricao, icone: d.icone, tipo: d.tipo, categoria: d.categoria, doc: d.montar() };
}
