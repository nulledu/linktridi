// Dados de exemplo do criador de lojas.
//
// Etapa de INTERFACE: as telas são reais, os dados não. Fica num arquivo à
// parte (e não espalhado nos componentes) porque quando a persistência entrar
// o que muda é a origem — os componentes continuam recebendo `Loja[]`,
// `Produto[]`, `Pedido[]`. Trocar isto por uma consulta não deve reescrever
// tela nenhuma.
//
// Sem `Date.now()` e sem id aleatório: a data é fixa e o id é escrito à mão,
// senão o servidor renderiza um valor e o cliente outro (erro de hidratação).

import type { Loja, Pedido, Produto } from "./lojas";

export const CATEGORIAS_DEMO = [
  "Carimbos",
  "Chancelas",
  "Sinetes e cera",
  "Kits",
  "Acessórios",
];

export const LOJAS_DEMO: Loja[] = [
  {
    id: "carimbos-tridi",
    nome: "Carimbos Tridi",
    slug: "carimbos-tridi",
    dominio: "carimbostridi.com.br",
    status: "publicada",
    // A loja de exemplo vende pelos dois caminhos — é o que faz a prova em
    // /dev-lojas exercitar o botão do WhatsApp E o carrinho.
    checkout: "ambos",
    whatsapp: "5514998544623",
    cor: "var(--primary-texto)",
    criadaEm: "2026-02-11T09:00:00.000Z",
  },
  {
    id: "tridi-atacado",
    nome: "Tridi Atacado",
    slug: "tridi-atacado",
    dominio: null,
    status: "rascunho",
    checkout: "nenhum",
    whatsapp: "",
    cor: "var(--azul)",
    criadaEm: "2026-07-30T14:20:00.000Z",
  },
];

export const PRODUTOS_DEMO: Produto[] = [
  {
    id: "p-carimbo-embalagem",
    lojaId: "carimbos-tridi",
    titulo: "Carimbo Personalizado para Todas as Embalagens",
    descricao:
      "Carimbo com a sua logo, feito para marcar sacola, caixa e etiqueta. Acompanha almofada entintada.",
    imagens: [],
    preco: 89.9,
    precoPromocional: null,
    custo: 31.5,
    estoque: 42,
    venderSemEstoque: true,
    sku: "CAR-EMB-01",
    codigoBarras: "7891000100011",
    categorias: ["Carimbos"],
    status: "ativo",
    atualizadoEm: "2026-08-12T11:30:00.000Z",
  },
  {
    id: "p-chancela-mdf",
    lojaId: "carimbos-tridi",
    titulo: "Chancela Personalizada - MDF",
    descricao: "Gravação em alto relevo com a sua logo. Ideal para papel e embalagem rígida.",
    imagens: [],
    preco: 242.9,
    precoPromocional: null,
    custo: 96.0,
    estoque: 8,
    venderSemEstoque: false,
    sku: "CHA-MDF-01",
    codigoBarras: "7891000100028",
    categorias: ["Chancelas"],
    status: "ativo",
    atualizadoEm: "2026-08-09T16:05:00.000Z",
  },
  {
    id: "p-kit-chancela-carimbo",
    lojaId: "carimbos-tridi",
    titulo: "Kit Chancela MDF + Carimbo Personalizado",
    descricao: "O par completo: chancela de alto relevo e carimbo para o dia a dia.",
    imagens: [],
    preco: 297.9,
    precoPromocional: null,
    custo: 121.4,
    estoque: 5,
    venderSemEstoque: false,
    sku: "KIT-CHA-CAR",
    codigoBarras: "7891000100035",
    categorias: ["Kits", "Chancelas"],
    status: "ativo",
    atualizadoEm: "2026-08-13T08:45:00.000Z",
  },
  {
    id: "p-carimbo-cera",
    lojaId: "carimbos-tridi",
    titulo: "Carimbo de Cera - Sinete Personalizado",
    descricao: "Sinete com a sua logo para lacre de cera. Deixa o envelope com cara de convite.",
    imagens: [],
    preco: 157.9,
    precoPromocional: 115.9,
    custo: 48.2,
    estoque: 23,
    venderSemEstoque: true,
    sku: "SIN-CERA-01",
    codigoBarras: "7891000100042",
    categorias: ["Sinetes e cera"],
    status: "ativo",
    atualizadoEm: "2026-08-14T07:10:00.000Z",
  },
  {
    id: "p-carimbo-ceramica",
    lojaId: "carimbos-tridi",
    titulo: "Carimbo Personalizado para Cerâmica",
    descricao: "Marca a peça antes da queima. Feito sob medida para o seu ateliê.",
    imagens: [],
    preco: 81.9,
    precoPromocional: null,
    custo: 27.9,
    estoque: 0,
    venderSemEstoque: true,
    sku: "CAR-CER-01",
    codigoBarras: "7891000100059",
    categorias: ["Carimbos"],
    status: "ativo",
    atualizadoEm: "2026-08-01T10:00:00.000Z",
  },
  {
    id: "p-carimbo-sabonete",
    lojaId: "carimbos-tridi",
    titulo: "Carimbo Personalizado para Sabonete",
    descricao: "Relevo limpo em sabonete artesanal, com a sua marca.",
    imagens: [],
    preco: 81.9,
    precoPromocional: null,
    custo: 27.9,
    estoque: 17,
    venderSemEstoque: true,
    sku: "CAR-SAB-01",
    codigoBarras: "7891000100066",
    categorias: ["Carimbos"],
    status: "ativo",
    atualizadoEm: "2026-07-28T13:25:00.000Z",
  },
  {
    id: "p-carimbo-isopor",
    lojaId: "carimbos-tridi",
    titulo: "Carimbo Personalizado para Isopor",
    descricao: "Tinta que fixa no isopor sem borrar. Para marmita e delivery.",
    imagens: [],
    preco: 94.9,
    precoPromocional: null,
    custo: 33.0,
    estoque: 11,
    venderSemEstoque: true,
    sku: "CAR-ISO-01",
    codigoBarras: "7891000100073",
    categorias: ["Carimbos"],
    status: "rascunho",
    atualizadoEm: "2026-08-13T18:40:00.000Z",
  },
  {
    id: "p-carimbo-sacola",
    lojaId: "carimbos-tridi",
    titulo: "Carimbo Personalizado para Sacola Plástica",
    descricao: "Marca sacola plástica de qualquer cor com as suas redes sociais.",
    imagens: [],
    preco: 99.9,
    precoPromocional: null,
    custo: 34.5,
    estoque: 3,
    venderSemEstoque: false,
    sku: "CAR-SAC-01",
    codigoBarras: "7891000100080",
    categorias: ["Carimbos", "Acessórios"],
    status: "inativo",
    atualizadoEm: "2026-06-19T09:15:00.000Z",
  },
];

export const PEDIDOS_DEMO: Pedido[] = [
  {
    id: "o-1042",
    lojaId: "carimbos-tridi",
    numero: 1042,
    cliente: "Marina Bueno",
    itens: [{ produtoId: "p-carimbo-cera", titulo: "Carimbo de Cera - Sinete", quantidade: 1, precoUnitario: 115.9 }],
    total: 115.9,
    pagamento: "pago",
    envio: "preparando",
    feitoEm: "2026-08-14T10:12:00.000Z",
  },
  {
    id: "o-1041",
    lojaId: "carimbos-tridi",
    numero: 1041,
    cliente: "Doces da Vovó",
    itens: [
      { produtoId: "p-kit-chancela-carimbo", titulo: "Kit Chancela MDF + Carimbo", quantidade: 1, precoUnitario: 297.9 },
      { produtoId: "p-carimbo-sabonete", titulo: "Carimbo para Sabonete", quantidade: 2, precoUnitario: 81.9 },
    ],
    total: 461.7,
    pagamento: "pago",
    envio: "enviado",
    feitoEm: "2026-08-13T15:48:00.000Z",
  },
  {
    id: "o-1040",
    lojaId: "carimbos-tridi",
    numero: 1040,
    cliente: "Ateliê Terra Nova",
    itens: [{ produtoId: "p-carimbo-ceramica", titulo: "Carimbo para Cerâmica", quantidade: 3, precoUnitario: 81.9 }],
    total: 245.7,
    pagamento: "pendente",
    envio: "nao_enviado",
    feitoEm: "2026-08-13T09:02:00.000Z",
  },
  {
    id: "o-1039",
    lojaId: "carimbos-tridi",
    numero: 1039,
    cliente: "Verdant Botanicals",
    itens: [{ produtoId: "p-chancela-mdf", titulo: "Chancela Personalizada - MDF", quantidade: 1, precoUnitario: 242.9 }],
    total: 242.9,
    pagamento: "pago",
    envio: "entregue",
    feitoEm: "2026-08-11T17:33:00.000Z",
  },
];

export const lojaPorId = (id: string): Loja | null => LOJAS_DEMO.find((l) => l.id === id) ?? null;

export const produtosDaLoja = (lojaId: string): Produto[] =>
  PRODUTOS_DEMO.filter((p) => p.lojaId === lojaId);

export const produtoPorId = (lojaId: string, produtoId: string): Produto | null =>
  PRODUTOS_DEMO.find((p) => p.lojaId === lojaId && p.id === produtoId) ?? null;

export const pedidosDaLoja = (lojaId: string): Pedido[] =>
  PEDIDOS_DEMO.filter((p) => p.lojaId === lojaId);
