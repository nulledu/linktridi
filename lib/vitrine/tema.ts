// ── O tema: ajustes globais, normalização e as operações do editor ───────────
// Domínio puro. O editor chama estas funções e guarda o que elas devolvem; ele
// não mexe no objeto do tema com a mão. É o que mantém desfazer, prévia e
// "publicar" olhando o mesmo dado — e o que permite testar reordenação sem
// montar tela nenhuma.
//
// Toda função aqui é PURA: recebe tema, devolve tema novo. Mutar o objeto faria
// o React não repintar a prévia, que é o defeito mais chato de achar num editor.

import type {
  Ajuste, BlocoSalvo, EsquemaSecao, SecaoSalva, Tema, Template,
} from "./tipos";
import { SEM_VALOR, TEMPLATES, VERSAO_TEMA } from "./tipos";
import { esquemaDaSecao } from "./registro";

// ── Ajustes globais ──────────────────────────────────────────────────────────
// Espelham o `settings_schema.json` do tema. São eles que alimentam as
// variáveis CSS do `css-variables.liquid` — trocar um aqui repinta a loja
// inteira, que é exatamente o que a aba "Tema" do editor faz.

export const AJUSTES_GLOBAIS: { grupo: string; ajustes: Ajuste[] }[] = [
  {
    grupo: "Cor da loja",
    ajustes: [
      {
        // Padrão VAZIO de propósito: vazio significa "ainda não escolhida", e
        // aí `corDeAssinatura` cai no destaque — que é o campo que sempre
        // cumpriu esse papel. Um padrão com cor faria todo tema antigo passar a
        // dizer que a assinatura é um azul que a loja nunca usou.
        tipo: "cor", id: "signature_color", label: "Cor de assinatura", padrao: "",
        info: "Trocar esta cor repinta destaque, links, botões, cabeçalho, rodapé e tudo que for da mesma família.",
      },
    ],
  },
  {
    grupo: "Cores",
    ajustes: [
      { tipo: "cor", id: "heading_color", label: "Títulos", padrao: "#1e2d7d" },
      { tipo: "cor", id: "text_color", label: "Texto", padrao: "#737b97" },
      { tipo: "cor", id: "accent_color", label: "Destaque", padrao: "#00badb" },
      { tipo: "cor", id: "link_color", label: "Links", padrao: "#00badb" },
      { tipo: "cor", id: "border_color", label: "Bordas", padrao: "#e7e7e7" },
      { tipo: "cor", id: "background", label: "Fundo da página", padrao: "#f7f7f7" },
      { tipo: "cor", id: "secondary_background", label: "Fundo dos cards", padrao: "#ffffff" },
      { tipo: "cor", id: "error_color", label: "Erro", padrao: "#f71b1b" },
      { tipo: "cor", id: "success_color", label: "Sucesso", padrao: "#00d864" },
    ],
  },
  {
    grupo: "Botões",
    ajustes: [
      { tipo: "cor", id: "primary_button_background", label: "Fundo do botão principal", padrao: "#00badb" },
      { tipo: "cor", id: "primary_button_text_color", label: "Texto do botão principal", padrao: "#ffffff" },
      { tipo: "cor", id: "secondary_button_background", label: "Fundo do botão secundário", padrao: "#1e2d7d" },
      { tipo: "cor", id: "secondary_button_text_color", label: "Texto do botão secundário", padrao: "#ffffff" },
    ],
  },
  {
    grupo: "Cabeçalho e rodapé",
    ajustes: [
      { tipo: "cor", id: "header_background", label: "Fundo do cabeçalho", padrao: "#1e2d7d" },
      { tipo: "cor", id: "header_text_color", label: "Texto do cabeçalho", padrao: "#ffffff" },
      { tipo: "cor", id: "header_light_text_color", label: "Texto secundário do cabeçalho", padrao: "#e7e7e7" },
      { tipo: "cor", id: "header_accent_color", label: "Destaque do cabeçalho", padrao: "#00badb" },
      { tipo: "cor", id: "footer_background", label: "Fundo do rodapé", padrao: "#1e2d7d" },
      { tipo: "cor", id: "footer_text_color", label: "Texto do rodapé", padrao: "#ffffff" },
    ],
  },
  {
    grupo: "Tipografia",
    ajustes: [
      {
        tipo: "opcao", id: "heading_font", label: "Fonte dos títulos", padrao: "poppins_n6",
        opcoes: [
          { valor: "poppins_n6", label: "Poppins Semibold" },
          { valor: "poppins_n7", label: "Poppins Bold" },
          { valor: "montserrat_n6", label: "Montserrat Semibold" },
          { valor: "inter_n6", label: "Inter Semibold" },
        ],
      },
      {
        tipo: "opcao", id: "text_font", label: "Fonte do texto", padrao: "poppins_n4",
        opcoes: [
          { valor: "poppins_n4", label: "Poppins Regular" },
          { valor: "montserrat_n4", label: "Montserrat Regular" },
          { valor: "inter_n4", label: "Inter Regular" },
        ],
      },
      { tipo: "numero", id: "base_text_font_size", label: "Tamanho do texto", padrao: 15, min: 12, max: 20, passo: 1, unidade: "px" },
      { tipo: "chave", id: "underline_links", label: "Sublinhar links", padrao: true },
    ],
  },
  {
    grupo: "Card de produto",
    ajustes: [
      { tipo: "cor", id: "product_cor_do_preco", label: "Preço", padrao: "#1e2d7d" },
      { tipo: "cor", id: "product_cor_do_preco_riscado", label: "Preço riscado", padrao: "#a4a9be" },
      { tipo: "cor", id: "product_cor_dos_titles", label: "Nome do produto", padrao: "#1e2d7d" },
      { tipo: "cor", id: "product_on_sale_accent", label: "Selo de promoção", padrao: "#ee0000" },
      { tipo: "cor", id: "product_in_stock_color", label: "Em estoque", padrao: "#00d864" },
      { tipo: "cor", id: "product_low_stock_color", label: "Estoque baixo", padrao: "#ee0000" },
      { tipo: "cor", id: "product_sold_out_color", label: "Esgotado", padrao: "#d1d1d4" },
      { tipo: "chave", id: "show_secondary_image", label: "Trocar a foto ao passar o mouse", padrao: true },
      { tipo: "chave", id: "show_discount", label: "Mostrar o desconto", padrao: true },
      {
        tipo: "opcao", id: "discount_mode", label: "Desconto em", padrao: "percentage",
        opcoes: [{ valor: "percentage", label: "Porcentagem" }, { valor: "value", label: "Reais" }],
      },
      {
        tipo: "opcao", id: "product_image_size", label: "Formato da foto", padrao: "square",
        opcoes: [
          { valor: "natural", label: "Natural" },
          { valor: "square", label: "Quadrada" },
          { valor: "portrait", label: "Retrato" },
          { valor: "landscape", label: "Paisagem" },
        ],
      },
      { tipo: "chave", id: "animation_image_zoom", label: "Zoom ao passar o mouse", padrao: false },
      { tipo: "titulo", id: "t_parcelas", label: "Parcelamento" },
      // A loja original cravou "ou 12x de …" no meio do `product-item.liquid`,
      // com o fator de juro escrito na mão. Vira ajuste pra que a cópia fique
      // idêntica sem a próxima loja herdar o juro de outra pessoa.
      { tipo: "chave", id: "show_installments", label: "Mostrar parcelamento", padrao: false },
      { tipo: "numero", id: "installments_count", label: "Em quantas vezes", padrao: 12, min: 2, max: 18, passo: 1 },
      { tipo: "numero", id: "installments_factor", label: "Fator de juro", padrao: 1.2161, min: 1, max: 2, passo: 0.0001, info: "1 = sem juro. O tema original usava 1,2161." },
    ],
  },
  {
    grupo: "Carrinho",
    ajustes: [
      {
        tipo: "opcao", id: "cart_type", label: "Ao adicionar ao carrinho", padrao: "drawer",
        opcoes: [
          { valor: "drawer", label: "Abrir a gaveta" },
          { valor: "page", label: "Ir para o carrinho" },
        ],
      },
      { tipo: "chave", id: "cart_show_free_shipping_threshold", label: "Barra de frete grátis", padrao: false },
      { tipo: "texto", id: "cart_free_shipping_threshold", label: "Valor do frete grátis", padrao: "200" },
    ],
  },
];

/** Todos os ajustes globais em lista única — para valor padrão e validação. */
export const AJUSTES_GLOBAIS_PLANOS: Ajuste[] = AJUSTES_GLOBAIS.flatMap((g) => g.ajustes);

// ── Valores padrão ───────────────────────────────────────────────────────────

/** O valor inicial de um ajuste. `undefined` quando o ajuste não guarda valor. */
function padraoDe(a: Ajuste): unknown {
  if (SEM_VALOR.includes(a.tipo)) return undefined;
  if ("padrao" in a && a.padrao !== undefined) return a.padrao;
  switch (a.tipo) {
    case "chave": return false;
    case "numero": return 0;
    default: return "";
  }
}

export function ajustesPadrao(lista: Ajuste[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of lista) {
    const v = padraoDe(a);
    if (v !== undefined) out[a.id] = v;
  }
  return out;
}

// ── Identificadores ──────────────────────────────────────────────────────────

/**
 * Id de seção ou bloco. Precisa ser estável e único DENTRO do tema — é a chave
 * do React na lista arrastável e o alvo do "rolar até a seção" na prévia.
 *
 * `contador` em vez de aleatório: `Math.random()` é proibido em roteiro de
 * workflow e, mais importante, um id previsível deixa o teste de reordenação
 * legível. A unicidade vem de conferir contra as chaves já usadas.
 */
export function novoId(prefixo: string, usados: Iterable<string>): string {
  const jaTem = new Set(usados);
  for (let i = 1; ; i++) {
    const id = `${prefixo}_${i}`;
    if (!jaTem.has(id)) return id;
  }
}

// ── Criação e normalização ───────────────────────────────────────────────────

export function criarSecao(esquema: EsquemaSecao, usados: Iterable<string>): { id: string; secao: SecaoSalva } {
  const secao: SecaoSalva = { tipo: esquema.tipo, ajustes: ajustesPadrao(esquema.ajustes) };
  const iniciais = esquema.blocosIniciais ?? [];
  if (iniciais.length) {
    secao.blocos = {};
    secao.ordemBlocos = [];
    for (const tipoBloco of iniciais) {
      const eb = esquema.blocos?.find((b) => b.tipo === tipoBloco);
      if (!eb) continue;
      const id = novoId(tipoBloco, secao.ordemBlocos);
      secao.blocos[id] = { tipo: tipoBloco, ajustes: ajustesPadrao(eb.ajustes) };
      secao.ordemBlocos.push(id);
    }
  }
  return { id: novoId(esquema.tipo, usados), secao };
}

const ordemVazia = (): Record<Template, string[]> => {
  const o = {} as Record<Template, string[]>;
  for (const t of TEMPLATES) o[t] = [];
  return o;
};

export function temaVazio(modelo = "warehouse"): Tema {
  return {
    versao: VERSAO_TEMA,
    modelo,
    ajustes: ajustesPadrao(AJUSTES_GLOBAIS_PLANOS),
    secoes: {},
    fixas: { topo: [], rodape: [] },
    ordem: ordemVazia(),
  };
}

/**
 * Põe de pé um tema vindo do banco.
 *
 * Nada aqui confia no dado guardado: um tema salvo mês passado não conhece a
 * seção que entrou ontem, e um tema mexido à mão pode apontar pra seção que não
 * existe mais. Normalizar na LEITURA é o que evita a vitrine quebrar na cara do
 * visitante por causa de um JSON velho — a alternativa seria migração, e
 * migração de jsonb de loja publicada é o tipo de coisa que só se descobre
 * quebrada em produção.
 */
export function normalizarTema(bruto: unknown, modelo = "warehouse"): Tema {
  const base = temaVazio(modelo);
  if (!bruto || typeof bruto !== "object") return base;
  const t = bruto as Partial<Tema>;

  const ajustes = { ...base.ajustes };
  if (t.ajustes && typeof t.ajustes === "object") {
    for (const a of AJUSTES_GLOBAIS_PLANOS) {
      const v = (t.ajustes as Record<string, unknown>)[a.id];
      if (v !== undefined) ajustes[a.id] = v;
    }
  }

  // Seções: só as de tipo conhecido sobrevivem, e cada uma recebe os ajustes
  // que o schema ganhou desde que ela foi salva.
  const secoes: Record<string, SecaoSalva> = {};
  for (const [id, bruta] of Object.entries(t.secoes ?? {})) {
    if (!bruta || typeof bruta !== "object") continue;
    const esquema = esquemaDaSecao((bruta as SecaoSalva).tipo);
    if (!esquema) continue;
    const s = bruta as SecaoSalva;
    const nova: SecaoSalva = {
      tipo: esquema.tipo,
      ajustes: { ...ajustesPadrao(esquema.ajustes), ...(s.ajustes ?? {}) },
      desativada: s.desativada === true,
    };
    if (esquema.blocos?.length) {
      const blocos: Record<string, BlocoSalvo> = {};
      for (const [bid, bb] of Object.entries(s.blocos ?? {})) {
        const eb = esquema.blocos.find((x) => x.tipo === (bb as BlocoSalvo)?.tipo);
        if (!eb) continue;
        blocos[bid] = {
          tipo: eb.tipo,
          ajustes: { ...ajustesPadrao(eb.ajustes), ...((bb as BlocoSalvo).ajustes ?? {}) },
          desativado: (bb as BlocoSalvo).desativado === true,
        };
      }
      nova.blocos = blocos;
      // A ordem manda, mas bloco fora dela some da tela sem ninguém entender —
      // então o que sobrou entra no fim em vez de sumir.
      const ordem = (s.ordemBlocos ?? []).filter((b) => blocos[b]);
      for (const b of Object.keys(blocos)) if (!ordem.includes(b)) ordem.push(b);
      nova.ordemBlocos = ordem;
    }
    secoes[id] = nova;
  }

  const limpa = (ids: unknown, faixa?: "topo" | "rodape") =>
    (Array.isArray(ids) ? (ids as string[]) : []).filter((id) => {
      const s = secoes[id];
      if (!s) return false;
      const e = esquemaDaSecao(s.tipo);
      if (!e) return false;
      if (faixa) return e.alcance.onde === "fixa" && e.alcance.faixa === faixa;
      return e.alcance.onde !== "fixa";
    });

  const ordem = ordemVazia();
  for (const tpl of TEMPLATES) ordem[tpl] = limpa(t.ordem?.[tpl]);

  return {
    versao: VERSAO_TEMA,
    modelo: typeof t.modelo === "string" ? t.modelo : modelo,
    ajustes,
    secoes,
    fixas: { topo: limpa(t.fixas?.topo, "topo"), rodape: limpa(t.fixas?.rodape, "rodape") },
    ordem,
  };
}

// ── Operações do editor ──────────────────────────────────────────────────────

const clonar = (t: Tema): Tema => JSON.parse(JSON.stringify(t)) as Tema;

export function adicionarSecao(tema: Tema, tipo: string, template: Template, posicao?: number): Tema {
  const esquema = esquemaDaSecao(tipo);
  if (!esquema || esquema.alcance.onde === "fixa") return tema;
  // Seção presa a um template não entra em outro: a seção de produto na home
  // renderizaria sem produto nenhum, e o editor mostraria um bloco morto que a
  // pessoa não entende por que não pinta.
  if (esquema.alcance.onde === "template" && !esquema.alcance.templates.includes(template)) return tema;
  const t = clonar(tema);
  const { id, secao } = criarSecao(esquema, Object.keys(t.secoes));
  t.secoes[id] = secao;
  const lista = t.ordem[template];
  lista.splice(posicao ?? lista.length, 0, id);
  return t;
}

export function removerSecao(tema: Tema, id: string): Tema {
  const t = clonar(tema);
  delete t.secoes[id];
  for (const tpl of TEMPLATES) t.ordem[tpl] = t.ordem[tpl].filter((x) => x !== id);
  t.fixas.topo = t.fixas.topo.filter((x) => x !== id);
  t.fixas.rodape = t.fixas.rodape.filter((x) => x !== id);
  return t;
}

export function moverSecao(tema: Tema, template: Template, de: number, para: number): Tema {
  const t = clonar(tema);
  const lista = t.ordem[template];
  if (de < 0 || de >= lista.length) return tema;
  const alvo = Math.max(0, Math.min(lista.length - 1, para));
  const [id] = lista.splice(de, 1);
  lista.splice(alvo, 0, id);
  return t;
}

export function ajustarSecao(tema: Tema, id: string, chave: string, valor: unknown): Tema {
  if (!tema.secoes[id]) return tema;
  const t = clonar(tema);
  t.secoes[id].ajustes[chave] = valor;
  return t;
}

export function alternarSecao(tema: Tema, id: string): Tema {
  if (!tema.secoes[id]) return tema;
  const t = clonar(tema);
  t.secoes[id].desativada = !t.secoes[id].desativada;
  return t;
}

export function adicionarBloco(tema: Tema, secaoId: string, tipoBloco: string): Tema {
  const secao = tema.secoes[secaoId];
  const esquema = secao && esquemaDaSecao(secao.tipo);
  const eb = esquema?.blocos?.find((b) => b.tipo === tipoBloco);
  if (!esquema || !eb) return tema;
  const atuais = secao.ordemBlocos ?? [];
  if (esquema.limiteBlocos != null && atuais.length >= esquema.limiteBlocos) return tema;
  if (eb.limite != null && atuais.filter((b) => secao.blocos?.[b]?.tipo === tipoBloco).length >= eb.limite) return tema;

  const t = clonar(tema);
  const s = t.secoes[secaoId];
  s.blocos ??= {};
  s.ordemBlocos ??= [];
  const id = novoId(tipoBloco, s.ordemBlocos);
  s.blocos[id] = { tipo: tipoBloco, ajustes: ajustesPadrao(eb.ajustes) };
  s.ordemBlocos.push(id);
  return t;
}

export function removerBloco(tema: Tema, secaoId: string, blocoId: string): Tema {
  const s = tema.secoes[secaoId];
  if (!s?.blocos?.[blocoId]) return tema;
  const t = clonar(tema);
  delete t.secoes[secaoId].blocos![blocoId];
  t.secoes[secaoId].ordemBlocos = (t.secoes[secaoId].ordemBlocos ?? []).filter((b) => b !== blocoId);
  return t;
}

export function moverBloco(tema: Tema, secaoId: string, de: number, para: number): Tema {
  const s = tema.secoes[secaoId];
  const ordem = s?.ordemBlocos;
  if (!ordem || de < 0 || de >= ordem.length) return tema;
  const t = clonar(tema);
  const lista = t.secoes[secaoId].ordemBlocos!;
  const alvo = Math.max(0, Math.min(lista.length - 1, para));
  const [id] = lista.splice(de, 1);
  lista.splice(alvo, 0, id);
  return t;
}

export function ajustarBloco(tema: Tema, secaoId: string, blocoId: string, chave: string, valor: unknown): Tema {
  if (!tema.secoes[secaoId]?.blocos?.[blocoId]) return tema;
  const t = clonar(tema);
  t.secoes[secaoId].blocos![blocoId].ajustes[chave] = valor;
  return t;
}

export function ajustarGlobal(tema: Tema, chave: string, valor: unknown): Tema {
  const t = clonar(tema);
  t.ajustes[chave] = valor;
  return t;
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/** As seções de um template, na ordem, já sem as desativadas. */
export function secoesDoTemplate(tema: Tema, template: Template): { id: string; secao: SecaoSalva }[] {
  return tema.ordem[template]
    .map((id) => ({ id, secao: tema.secoes[id] }))
    .filter((x) => x.secao && !x.secao.desativada);
}

export function secoesFixas(tema: Tema, faixa: "topo" | "rodape"): { id: string; secao: SecaoSalva }[] {
  return tema.fixas[faixa]
    .map((id) => ({ id, secao: tema.secoes[id] }))
    .filter((x) => x.secao && !x.secao.desativada);
}

/** Os blocos de uma seção, na ordem, já sem os desativados. */
export function blocosDaSecao(secao: SecaoSalva): { id: string; bloco: BlocoSalvo }[] {
  return (secao.ordemBlocos ?? [])
    .map((id) => ({ id, bloco: secao.blocos?.[id] as BlocoSalvo }))
    .filter((x) => x.bloco && !x.bloco.desativado);
}
