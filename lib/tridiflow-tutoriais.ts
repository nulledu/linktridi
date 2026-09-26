import { higienizar, semTags } from "@/lib/vitrine/higienizar";
import { limparHtmlTutorial } from "@/lib/tridiflow-tutoriais-html";
export type TutorialStatus = "rascunho" | "publicado";
export type TutorialTipoMidia = "leitura" | "video" | "passos";
export type TutorialSelo = "novo" | "mais_acessado";
export type TutorialDificuldade = "facil" | "media" | "dificil";
export const DIFICULDADES: Record<TutorialDificuldade, string> = { facil: "Fácil", media: "Média", dificil: "Difícil" };

export interface TutorialCategoria { id: string; nome: string; imagemUrl: string; ordem: number; ativa: boolean }
export interface TutorialResumo {
  id: string; categoriaId: string | null; titulo: string; handle: string; descricao: string; capaUrl: string;
  /** Legado: alimentavam a busca e o cartão quando eram digitados à mão. A
   *  busca saiu e o cartão agora conta os passos do conteúdo (`metaDoTutorial`)
   *  — os campos seguem no documento só pra nada salvo se perder. */
  palavrasChave: string[]; duracaoMinutos: number | null; quantidadeEtapas: number | null;
  tipoMidia: TutorialTipoMidia | null; selo: TutorialSelo | null; destaque: boolean; status: TutorialStatus; ordem: number;
}
interface BaseBloco { id: string }
export interface TutorialBlocoTexto extends BaseBloco { tipo: "texto"; titulo: string; conteudo: string }
export interface TutorialBlocoPasso extends BaseBloco {
  tipo: "passo"; titulo: string; conteudo: string; imagemUrl: string; imagemAlt: string; videoUrl: string;
  /** Capa do vídeo ENVIADO (o primeiro quadro, tirado no navegador). Sem ela o
   *  player nasce preto até alguém apertar o play. Vazio = sem capa. */
  videoCapaUrl: string;
}
export interface TutorialBlocoImagem extends BaseBloco { tipo: "imagem"; url: string; alt: string; legenda: string }
export interface TutorialBlocoVideo extends BaseBloco { tipo: "video"; origem: "link" | "upload"; url: string; capaUrl: string; legenda: string }
export interface TutorialBlocoProduto extends BaseBloco { tipo: "produto"; produtoId: string; titulo: string; botao: string }
export interface TutorialBlocoLink extends BaseBloco {
  tipo: "link"; titulo: string; descricao: string; url: string; botao: string;
  /** Endereço (handle) de OUTRO tutorial desta central. Preenchido, ele manda
   *  no destino e é resolvido contra a central de quem está vendo — por isso o
   *  link continua certo na prévia e depois de trocar o endereço da central.
   *  `url` guarda o caminho público da época, pro servidor que ainda não
   *  conhece este campo. Vazio = link externo em `url`. */
  tutorial: string;
}
/** Aviso com significado FIXO, o mesmo do iFixit: Atenção é risco de se
 *  machucar ou estragar a peça; Dica é ajuda a mais; Lembrete é o que fazer
 *  depois de terminar. Um sentido por cor é o que faz a pessoa ler o aviso de
 *  cera quente sem ler o parágrafo inteiro. */
export type EstiloAviso = "atencao" | "dica" | "lembrete";
export const ESTILOS_AVISO: Record<EstiloAviso, { rotulo: string; icone: string }> = {
  atencao: { rotulo: "Atenção", icone: "alert-triangle" },
  dica: { rotulo: "Dica", icone: "bulb" },
  lembrete: { rotulo: "Lembrete", icone: "bell" },
};
export interface TutorialBlocoAviso extends BaseBloco { tipo: "aviso"; estilo: EstiloAviso; conteudo: string }
export interface ProblemaTutorial { id: string; sintoma: string; solucao: string }
/** "Deu errado?" — sintoma e o que fazer. A pergunta que chega no WhatsApp é
 *  quase sempre um sintoma ("saiu borrado"), não um "como faço". */
export interface TutorialBlocoProblemas extends BaseBloco { tipo: "problemas"; titulo: string; itens: ProblemaTutorial[] }
export type BlocoTutorial = TutorialBlocoTexto | TutorialBlocoPasso | TutorialBlocoImagem | TutorialBlocoVideo | TutorialBlocoProduto | TutorialBlocoLink | TutorialBlocoAviso | TutorialBlocoProblemas;
/** Item do "Você vai precisar". `produtoId` liga o item ao produto da loja:
 *  quem não tem a tinta certa compra dali mesmo. Vazio = só o nome. */
export interface MaterialTutorial { id: string; nome: string; produtoId: string }
export interface Tutorial extends TutorialResumo {
  blocos: BlocoTutorial[];
  dificuldade: TutorialDificuldade | null;
  materiais: MaterialTutorial[];
}
/** Barra fixa no rodapé da central pública. Cada atalho é um destino que a
 *  pessoa usa DE FORA do conteúdo — falar com a loja, ver o catálogo, voltar ao
 *  topo — então ele mora na configuração da central, não no tutorial. */
export type AtalhoAcao = "link" | "topo" | "compartilhar" | "ideias";
export interface AtalhoCentral { id: string; rotulo: string; icone: string; acao: AtalhoAcao; url: string; destaque: boolean }
export interface CentralTutoriaisDoc {
  titulo: string; subtitulo: string;
  /** Linha pequena acima do título ("Aprenda no seu ritmo"). Vazia = some. */
  sobrelinha: string;
  /** O título grande pode sair de cena — tem central que só quer os cartões. */
  mostrarTitulo: boolean;
  /** Catálogo de produtos: slug da vitrine publicada. Vazio = sem catálogo. */
  catalogoLoja: string;
  /** Nome do cartão/atalho do catálogo. Vazio = "Catálogo". */
  catalogoRotulo: string;
  /** Círculo "Todos" da fileira de categorias: foto e nome próprios. Vazio =
   *  mosaico das três primeiras capas, que fica ruim quando as capas são
   *  parecidas (viram três manchas iguais) ou quando ainda não há capa. */
  todosImagemUrl: string; todosRotulo: string;
  /** WhatsApp do atendimento, só dígitos com DDI. É o "fale com a gente" de
   *  quem não achou o que procurava ou marcou que o guia não resolveu — um
   *  número só, configurado uma vez. Vazio = a central não oferece contato. */
  whatsapp: string;
  atalhos: AtalhoCentral[]; categorias: TutorialCategoria[]; tutoriais: Tutorial[];
  /** Feed de IDEIAS (reels nossos): onde usar o carimbo. Vira o atalho
   *  "Ideias" da barra e abre em tela cheia, um atrás do outro, sem fim. */
  reels: ReelCentral[];
  /** Depoimentos em formato de stories — a fileira de bolinhas no topo. */
  depoimentos: DepoimentoCentral[];
}

/** Um reel do feed de ideias. `linkUrl` é o carrinho: o botão leva pra onde
 *  a gente escolher (produto na loja, WhatsApp…). */
export interface ReelCentral {
  id: string; titulo: string; legenda: string;
  /** .mp4 enviado ou link do YouTube (Shorts). */
  videoUrl: string; capaUrl: string;
  linkUrl: string; botao: string; ativo: boolean; ordem: number;
}

/** Depoimento de cliente, visto como story: foto ou vídeo em pé + frase. */
export interface DepoimentoCentral {
  id: string; nome: string; texto: string;
  /** Foto/vídeo do story. Vazio = só a frase sobre a cor da página. */
  midiaUrl: string; tipoMidia: "imagem" | "video";
  /** Rostinho da bolinha. Vazio = a própria foto do story. */
  avatarUrl: string; ativo: boolean; ordem: number;
}

const normalizarReel = (x: unknown, i: number): ReelCentral => {
  const r = obj(x);
  return { id: texto(r.id, 80) || idNovo(), titulo: texto(r.titulo, 120), legenda: texto(r.legenda, 400),
    videoUrl: texto(r.videoUrl, 800), capaUrl: texto(r.capaUrl, 800), linkUrl: texto(r.linkUrl, 800),
    botao: texto(r.botao, 40) || "Comprar", ativo: r.ativo !== false, ordem: numero(r.ordem, 0, 1_000_000) ?? i };
};
const normalizarDepoimento = (x: unknown, i: number): DepoimentoCentral => {
  const d = obj(x);
  return { id: texto(d.id, 80) || idNovo(), nome: texto(d.nome, 60), texto: texto(d.texto, 400),
    midiaUrl: texto(d.midiaUrl, 800), tipoMidia: d.tipoMidia === "video" ? "video" : "imagem",
    avatarUrl: texto(d.avatarUrl, 800), ativo: d.ativo !== false, ordem: numero(d.ordem, 0, 1_000_000) ?? i };
};

/** Ícones oferecidos no editor da barra — todos existem no `Icon.tsx`, com o
 *  nome que a pessoa lê no lugar do nome técnico do Tabler. */
export const ICONES_ATALHO: { valor: string; rotulo: string }[] = [
  { valor: "brand-whatsapp", rotulo: "WhatsApp" }, { valor: "phone", rotulo: "Telefone" },
  { valor: "mail", rotulo: "E-mail" }, { valor: "message-circle", rotulo: "Mensagem" },
  { valor: "shopping-bag", rotulo: "Sacola" }, { valor: "package", rotulo: "Caixa" },
  { valor: "world-www", rotulo: "Site" }, { valor: "home", rotulo: "Início" },
  { valor: "search", rotulo: "Busca" }, { valor: "book", rotulo: "Livro" },
  { valor: "star", rotulo: "Estrela" }, { valor: "help-circle", rotulo: "Ajuda" },
];

export const CENTRAL_TUTORIAIS_VAZIA: CentralTutoriaisDoc = {
  titulo: "Tutoriais", subtitulo: "Encontre respostas rápidas e aprenda no seu ritmo.", sobrelinha: "Aprenda no seu ritmo", mostrarTitulo: true, catalogoLoja: "", catalogoRotulo: "", todosImagemUrl: "", todosRotulo: "", whatsapp: "", atalhos: [], categorias: [], tutoriais: [], reels: [], depoimentos: [],
};

/** Categorias por FINALIDADE/MATERIAL — "qual produto eu tenho?". Não existe
 *  uma "Carimbos" genérica: carimbo de sabonete mora em Sabonete, o de caixa
 *  em Embalagens. Ponto de partida do editor; quem edita cria outras. */
export const CATEGORIAS_SUGERIDAS = ["Carimbos para Embalagens", "Sabonete", "Cerâmica", "Madeira", "Limpeza e Conservação"] as const;
/** As sugeridas que ainda não existem (sem acento e sem caixa), já com ordem
 *  depois das atuais. */
export function categoriasSugeridasQueFaltam(existentes: Pick<TutorialCategoria, "nome" | "ordem">[], novoId: () => string): TutorialCategoria[] {
  const tem = new Set(existentes.map((c) => textoDeBusca(c.nome.trim())));
  const base = existentes.reduce((m, c) => Math.max(m, c.ordem + 1), 0);
  return CATEGORIAS_SUGERIDAS.filter((n) => !tem.has(textoDeBusca(n)))
    .map((nome, i) => ({ id: novoId(), nome, imagemUrl: "", ordem: base + i, ativa: true }));
}

export function ehCentralTutoriais(config: { template?: string; centralTutoriais?: unknown } | null | undefined): boolean {
  return config?.template === "central_tutoriais";
}

/** O site de tutoriais mora AQUI, e o endereço não é escolha de tela.
 *
 *  O link circula fora do app — QR impresso em caixa e etiqueta, link em
 *  ficha de produto, no WhatsApp do atendimento. Trocar o domínio não "muda
 *  uma configuração": apaga tudo que já foi impresso, porque o host com dono
 *  só serve o que foi marcado pra ele (`publicacaoDoHost`) e o QR antigo
 *  passa a cair em "página indisponível".
 *
 *  Mesmo valor no gatilho do banco (`supabase/tutoriais_dominio_travado.sql`);
 *  `tutoriais-dominio-travado.test.ts` compara as duas cópias, porque
 *  divergirem é a trava existir só na metade dos caminhos. Pra mudar de
 *  endereço de verdade: troca aqui, roda o SQL de novo e reimprime o QR. */
export const DOMINIO_DOS_TUTORIAIS = "www.carimbostridii.com.br";

/** O que fazer com o domínio que o cliente pediu na identidade da central.
 *
 *  `escrever: undefined` = não toca na coluna. `recusar` = mensagem pro
 *  usuário; a tela nem oferece a troca, então isto só aparece pra quem chamou
 *  a API na mão. */
export type DecisaoDominio = { escrever: string | null | undefined } | { recusar: string };

export function decidirDominioDaCentral(pedido: string | null | undefined, travadoId: string | null): DecisaoDominio {
  // Domínio ainda não cadastrado em TridiFlow › Domínios: não há id pra onde
  // apontar. Melhor deixar a coluna como está do que gravar outro endereço.
  if (!travadoId) {
    return pedido === undefined
      ? { escrever: undefined }
      : { recusar: `O site de tutoriais é fixo em ${DOMINIO_DOS_TUTORIAIS}, mas esse domínio não está cadastrado em TridiFlow › Configurações › Domínios. Cadastre-o antes de salvar.` };
  }
  if (pedido !== undefined && pedido !== travadoId) {
    return { recusar: `O endereço do site de tutoriais é fixo em ${DOMINIO_DOS_TUTORIAIS} — o QR impresso e os links já divulgados apontam pra lá e parariam de abrir. Pra mudar, tem que soltar a trava no código.` };
  }
  return { escrever: travadoId };
}

const idNovo = () => Math.random().toString(36).slice(2, 10);
const lista = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const texto = (v: unknown, max = 400): string => typeof v === "string" ? v.trim().slice(0, max) : "";
const numero = (v: unknown, min: number, max: number): number | null => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null; };
const opcao = <T extends string>(v: unknown, valores: readonly T[]): T | null => typeof v === "string" && valores.includes(v as T) ? v as T : null;
const slug = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);

export function normalizarBlocosTutorial(bruto: unknown): BlocoTutorial[] {
  return lista(bruto).map((item): BlocoTutorial | null => {
    const b = obj(item); const id = texto(b.id, 40) || idNovo();
    switch (b.tipo) {
      case "texto": return { id, tipo: "texto", titulo: texto(b.titulo, 160), conteudo: texto(b.conteudo, 20_000) };
      case "passo": return { id, tipo: "passo", titulo: texto(b.titulo, 160), conteudo: texto(b.conteudo, 8_000), imagemUrl: texto(b.imagemUrl, 800), imagemAlt: texto(b.imagemAlt, 200), videoUrl: texto(b.videoUrl, 800), videoCapaUrl: texto(b.videoCapaUrl, 800) };
      case "imagem": return { id, tipo: "imagem", url: texto(b.url, 800), alt: texto(b.alt, 200), legenda: texto(b.legenda, 400) };
      case "video": return { id, tipo: "video", origem: b.origem === "upload" ? "upload" : "link", url: texto(b.url, 800), capaUrl: texto(b.capaUrl, 800), legenda: texto(b.legenda, 400) };
      case "produto": { const produtoId = texto(b.produtoId, 80); return produtoId ? { id, tipo: "produto", produtoId, titulo: texto(b.titulo, 160), botao: texto(b.botao, 60) || "Ver produto" } : null; }
      case "link": {
        // Link colado com o endereço da central (`/p/<central>/<guia>`) vira
        // referência ao guia: a central mudou de `central-de-tutoriais` pra
        // `tutoriais` e todo "Ver o tutorial de limpeza" colado à mão caiu em 404.
        const url = texto(b.url, 800);
        const colado = /^\/p\/[^/?#]+\/([a-z0-9-]+)\/?$/i.exec(url)?.[1];
        const tutorial = slug(texto(b.tutorial, 160)) || (colado ? slug(colado) : "");
        return { id, tipo: "link", titulo: texto(b.titulo, 160), descricao: texto(b.descricao, 600), url: colado && tutorial ? "" : url, botao: texto(b.botao, 60) || "Saiba mais", tutorial };
      }
      case "aviso": return { id, tipo: "aviso", estilo: opcao(b.estilo, ["atencao", "dica", "lembrete"] as const) ?? "dica", conteudo: texto(b.conteudo, 4_000) };
      case "problemas": return {
        id, tipo: "problemas", titulo: texto(b.titulo, 120) || "Deu errado?",
        itens: lista(b.itens).map((x) => { const p = obj(x); return { id: texto(p.id, 40) || idNovo(), sintoma: texto(p.sintoma, 160), solucao: texto(p.solucao, 2_000) }; })
          .filter((p) => p.sintoma || p.solucao).slice(0, 12),
      };
      default: return null;
    }
  }).filter((b): b is BlocoTutorial => b !== null).slice(0, 100);
}

export function normalizarTutorial(bruto: unknown): Tutorial {
  const t = obj(bruto);
  return {
    id: texto(t.id, 80) || idNovo(), categoriaId: texto(t.categoriaId, 80) || null,
    titulo: texto(t.titulo, 160), handle: slug(texto(t.handle, 160)), descricao: texto(t.descricao, 2_000), capaUrl: texto(t.capaUrl, 800),
    palavrasChave: lista(t.palavrasChave).map((x) => texto(x, 60)).filter(Boolean).slice(0, 30),
    duracaoMinutos: numero(t.duracaoMinutos, 1, 1440), quantidadeEtapas: numero(t.quantidadeEtapas, 1, 200),
    tipoMidia: opcao(t.tipoMidia, ["leitura", "video", "passos"] as const), selo: opcao(t.selo, ["novo", "mais_acessado"] as const),
    destaque: t.destaque === true, status: t.status === "publicado" ? "publicado" : "rascunho", ordem: numero(t.ordem, 0, 1_000_000) ?? 0,
    blocos: normalizarBlocosTutorial(t.blocos),
    dificuldade: opcao(t.dificuldade, ["facil", "media", "dificil"] as const),
    materiais: lista(t.materiais).map((x) => { const m = obj(x); return { id: texto(m.id, 40) || idNovo(), nome: texto(m.nome, 80), produtoId: texto(m.produtoId, 80) }; })
      .filter((m) => m.nome).slice(0, 20),
  };
}

/** Barra que a central usa quando ninguém configurou nada.
 *
 *  Só entram aqui os destinos que existem SEM configuração: o início, o
 *  catálogo (se a central tiver um ligado) e o WhatsApp (se a central tiver o
 *  número). Com um item só a barra nem aparece: um botão preso no rodapé pra
 *  repetir o que a página já mostra é ruído.
 *
 *  Nada de destaque no padrão: o botão redondo do meio precisa de itens dos
 *  dois lados pra ficar centrado, e com dois ele nasceria torto. */
/** A barra do rodapé é FIXA: Tutoriais, Loja e Compartilhar — nada mais. Os
 *  atalhos configurados no editor só emprestam o ENDEREÇO da loja; "Site",
 *  "Catálogo" e afins saíram. "Contato" saiu em 24/09/26 a pedido — no lugar
 *  entrou Compartilhar (menu nativo do celular), que não depende de
 *  configuração e mantém a Loja centrada com um item de cada lado.
 *  `_whatsappHref` fica na assinatura porque os chamadores ainda passam. */
export function atalhosPadrao(catalogoHref?: string, _whatsappHref?: string, configurados: AtalhoCentral[] = [], temIdeias = false): AtalhoCentral[] {
  const link = (a: AtalhoCentral) => a.acao === "link" && !!a.url;
  const loja = configurados.find((a) => link(a) && /loja|cat[aá]logo|shop/i.test(a.rotulo)) ?? configurados.find((a) => link(a) && a.icone === "shopping-bag");
  const lojaUrl = loja?.url || catalogoHref;
  const barra: AtalhoCentral[] = [
    { id: "_inicio", rotulo: "Tutoriais", icone: "home", acao: "topo", url: "", destaque: false },
  ];
  if (lojaUrl) barra.push({ id: "_catalogo", rotulo: "Loja", icone: "shopping-bag", acao: "link", url: lojaUrl, destaque: true });
  // O feed de ideias (reels) tomou o lugar do contato/compartilhar em 25/09/26:
  // quem chega na central quer ver o carimbo em uso, e o WhatsApp continua no
  // "Não achou?" do fim da lista.
  if (temIdeias) barra.push({ id: "_ideias", rotulo: "Ideias", icone: "player-play", acao: "ideias", url: "", destaque: false });
  else barra.push({ id: "_compartilhar", rotulo: "Compartilhar", icone: "share", acao: "compartilhar", url: "", destaque: false });
  return barra;
}

/** A barra só existe com DOIS ou mais atalhos: um botão sozinho preso no
 *  rodapé come 64px de tela pra repetir o que já está na página. E o destaque
 *  (o botão redondo do meio) é UM — o segundo marcado volta a ser comum. */
export function normalizarAtalhos(bruto: unknown): AtalhoCentral[] {
  let jaTemDestaque = false;
  return lista(bruto).map((x) => {
    const a = obj(x);
    // "buscar" saiu com o campo de busca; o que já estava salvo vira "topo"
    // em vez de sumir da barra sem explicação.
    const bruta = opcao(a.acao, ["link", "buscar", "topo", "compartilhar"] as const) ?? "link";
    const acao: AtalhoAcao = bruta === "buscar" ? "topo" : bruta;
    const destaque = a.destaque === true && !jaTemDestaque;
    if (destaque) jaTemDestaque = true;
    return {
      id: texto(a.id, 40) || idNovo(), rotulo: texto(a.rotulo, 24),
      icone: texto(a.icone, 40) || "world-www", acao, url: texto(a.url, 800), destaque,
    };
  }).filter((a) => a.rotulo && (a.acao !== "link" || a.url)).slice(0, 5);
}

/** Só dígitos, com o 55 do Brasil quando a pessoa digitou DDD + número. */
export function numeroWhatsapp(valor: string): string {
  const d = String(valor ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length === 10 || d.length === 11 ? `55${d}` : d.slice(0, 15);
}

/** Link do WhatsApp com a mensagem já escrita — o atendente recebe o nome do
 *  tutorial e o passo, e a pessoa não precisa explicar do zero. Nada pessoal
 *  vai na URL: só o que a própria página mostra. */
export function linkWhatsapp(numero: string, mensagem = ""): string {
  const n = numeroWhatsapp(numero);
  if (!n) return "";
  return `https://wa.me/${n}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ""}`;
}

export function normalizarCentralTutoriais(bruto: unknown): CentralTutoriaisDoc {
  const d = obj(bruto);
  const existe = !!bruto && typeof bruto === "object";
  return {
    // "Central de Tutoriais" era o nome padrão; a página agora se chama só
    // "Tutoriais" — central salva com o nome antigo ganha o novo sozinha.
    titulo: ((t) => t === "Central de Tutoriais" ? "Tutoriais" : t)(texto(d.titulo, 120)) || CENTRAL_TUTORIAIS_VAZIA.titulo,
    subtitulo: typeof d.subtitulo === "string" ? texto(d.subtitulo, 240) : existe ? "" : CENTRAL_TUTORIAIS_VAZIA.subtitulo,
    // Central antiga não tem o campo: nesse caso vale o texto que ela já
    // mostrava. Campo presente e vazio é escolha — a linha some.
    sobrelinha: typeof d.sobrelinha === "string" ? texto(d.sobrelinha, 60) : "Aprenda no seu ritmo",
    mostrarTitulo: d.mostrarTitulo !== false,
    catalogoLoja: texto(d.catalogoLoja, 200),
    catalogoRotulo: texto(d.catalogoRotulo, 40),
    todosImagemUrl: texto(d.todosImagemUrl, 800),
    todosRotulo: texto(d.todosRotulo, 40),
    whatsapp: numeroWhatsapp(texto(d.whatsapp, 40)),
    atalhos: normalizarAtalhos(d.atalhos),
    categorias: lista(d.categorias).map((x) => { const c = obj(x); return { id: texto(c.id, 80) || idNovo(), nome: texto(c.nome, 80), imagemUrl: texto(c.imagemUrl, 800), ordem: numero(c.ordem, 0, 1_000_000) ?? 0, ativa: c.ativa !== false }; }).filter((c) => c.nome).slice(0, 50).sort((a, b) => a.ordem - b.ordem),
    tutoriais: lista(d.tutoriais).map(normalizarTutorial).filter((t) => t.titulo).slice(0, 500).sort((a, b) => a.ordem - b.ordem),
    reels: lista(d.reels).map(normalizarReel).filter((r) => r.videoUrl).slice(0, 200).sort((a, b) => a.ordem - b.ordem),
    depoimentos: lista(d.depoimentos).map(normalizarDepoimento).filter((x) => x.nome && (x.midiaUrl || x.texto)).slice(0, 100).sort((a, b) => a.ordem - b.ordem),
  };
}

/** A descrição do produto vem do ERP com HTML dentro ("<p><strong>ALMOFADAS…"),
 *  às vezes já escapado em entidades. O cartão do tutorial é um RESUMO de duas
 *  linhas: sem isto a página despejava a ficha inteira do produto como texto
 *  cru, com as tags à vista. Decodifica, tira tags e corta na frase. */
export function resumoDoProduto(bruto: string, limite = 180): string {
  const decodificado = String(bruto || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  // Tag vira ESPAÇO, não vazio: `</p><li>` sumindo colava "ALMOFADAS6x6cm".
  // O `semTags` depois cuida do que sobrou e junta os espaços repetidos.
  const texto = semTags(decodificado.replace(/<[^>]+>/g, " "));
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > limite * 0.6 ? corte.slice(0, espaco) : corte).trimEnd()}…`;
}
/** Soma de um tutorial na janela pedida. `contatos` e `motivos` só vêm depois
 *  do SQL dos motivos (supabase/tutorial_metricas_motivos.sql): ausente quer
 *  dizer "ainda não medido", e a tela não deve mostrar isso como zero. */
export interface MetricaTutorial {
  handle: string; vistas: number; uteis: number; inuteis: number;
  /** Quantas vezes alguém abriu o WhatsApp a partir do tutorial. */
  contatos?: number;
  /** Motivo do "não resolveu", um contador por opção. */
  motivos?: { produto: number; passo: number; resultado: number; outro: number };
}

/** Percentual de "resolveu" — `null` quando ninguém votou. 0 de 0 não é 0%, e
 *  mostrar 0% queimaria um guia que simplesmente ainda não foi avaliado. */
export function proveitoDe(m: { uteis: number; inuteis: number } | undefined | null): number | null {
  if (!m) return null;
  const total = m.uteis + m.inuteis;
  return total > 0 ? Math.round((m.uteis / total) * 100) : null;
}

export function handleDoTutorial(titulo: string, existentes: string[] = []): string {
  const raiz = slug(titulo) || "tutorial"; if (!existentes.includes(raiz)) return raiz;
  let n = 2; while (existentes.includes(`${raiz}-${n}`)) n += 1; return `${raiz}-${n}`;
}
export function moverItem<T extends { id: string }>(itens: T[], id: string, delta: -1 | 1): T[] {
  const atual = itens.findIndex((x) => x.id === id); const destino = atual + delta;
  if (atual < 0 || destino < 0 || destino >= itens.length) return itens;
  const copia = [...itens]; [copia[atual], copia[destino]] = [copia[destino], copia[atual]]; return copia;
}
export function reordenarItem<T extends { id: string; ordem: number }>(itens: T[], id: string, delta: -1 | 1): T[] {
  return moverItem(itens, id, delta).map((item, ordem) => ({ ...item, ordem }));
}
/** Comparação sem acento e sem caixa — a mesma da central pública e do editor. */
export const textoDeBusca = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
export function filtrarTutoriais<T extends Pick<TutorialResumo, "categoriaId" | "titulo" | "descricao" | "palavrasChave" | "destaque" | "ordem">>(itens: T[], termo: string, categoriaId: string | null): T[] {
  const q = textoDeBusca(termo.trim());
  return itens.filter((t) => !categoriaId || t.categoriaId === categoriaId).filter((t) => !q || textoDeBusca([t.titulo, t.descricao, t.palavrasChave.join(" ")].join(" ")).includes(q)).sort((a, b) => Number(b.destaque) - Number(a.destaque) || a.ordem - b.ordem);
}

// ── Texto do tutorial ────────────────────────────────────────────────────────
// Vocabulário fechado e conversão de texto puro: `lib/tridiflow-tutoriais-html.ts`.
export { textoParaHtml } from "@/lib/tridiflow-tutoriais-html";

/** O HTML que a página pública desenha: no vocabulário do tutorial e, por
 *  cima, o `higienizar` de toda página pública (rel nos links). */
export const htmlDoConteudo = (conteudo: string): string => higienizar(limparHtmlTutorial(conteudo));

// ── O que o cartão da central mostra ─────────────────────────────────────────
// "Quantidade de etapas" e "Formato" eram digitados à mão — e mentiam assim
// que alguém acrescentava um passo. Agora saem do próprio conteúdo.
const PALAVRAS_POR_MINUTO = 180;
const palavras = (html: string) => (html ? semTags(html).split(/\s+/).filter(Boolean).length : 0);

/** Minutos de leitura: 180 palavras por minuto (texto de instrução se lê
 *  devagar) e um minuto a mais por vídeo. Nunca zero. */
export function minutosDeLeitura(t: Pick<Tutorial, "descricao" | "blocos">): number {
  let n = palavras(t.descricao);
  let videos = 0;
  for (const b of t.blocos) {
    switch (b.tipo) {
      case "texto": n += palavras(b.titulo) + palavras(b.conteudo); break;
      case "passo": n += palavras(b.titulo) + palavras(b.conteudo); if (b.videoUrl) videos += 1; break;
      case "imagem": n += palavras(b.legenda); break;
      case "video": n += palavras(b.legenda); videos += 1; break;
      case "aviso": n += palavras(b.conteudo); break;
      case "problemas": for (const p of b.itens) n += palavras(p.sintoma) + palavras(p.solucao); break;
      case "link": case "produto": n += palavras(b.titulo); break;
    }
  }
  return Math.max(1, Math.ceil(n / PALAVRAS_POR_MINUTO) + videos);
}

export const contarPassos = (blocos: BlocoTutorial[]): number => blocos.filter((b) => b.tipo === "passo").length;
export const temVideo = (blocos: BlocoTutorial[]): boolean => blocos.some((b) => b.tipo === "video" || (b.tipo === "passo" && !!b.videoUrl));

export type IconeMeta = "player-play" | "list-numbers" | "clock";
export interface MetaCartao { icone: IconeMeta; texto: string; passos: number; minutos: number; video: boolean }

/** "4 passos · 3 min". O tempo digitado (quanto leva pra FAZER) vale mais que
 *  a estimativa de leitura — carimbar um tecido demora mais que ler como. */
export function metaDoTutorial(t: Pick<Tutorial, "descricao" | "blocos" | "duracaoMinutos">): MetaCartao {
  const passos = contarPassos(t.blocos);
  const video = temVideo(t.blocos);
  const minutos = t.duracaoMinutos ?? minutosDeLeitura(t);
  const texto = [passos >= 2 ? `${passos} passos` : null, `${minutos} min`].filter(Boolean).join(" · ");
  return { icone: video ? "player-play" : passos >= 2 ? "list-numbers" : "clock", texto, passos, minutos, video };
}

/** O que a LISTAGEM da central precisa de cada tutorial — sem o conteúdo.
 *  Mandar os blocos de todos os guias pra desenhar cartões fazia a página da
 *  central carregar o texto inteiro da central inteira. */
export interface TutorialCartao {
  id: string; categoriaId: string | null; titulo: string; handle: string; descricao: string; capaUrl: string;
  selo: TutorialSelo | null; destaque: boolean; ordem: number; meta: MetaCartao;
}
export function cartaoDoTutorial(t: Tutorial): TutorialCartao {
  return {
    id: t.id, categoriaId: t.categoriaId, titulo: t.titulo, handle: t.handle, descricao: t.descricao, capaUrl: t.capaUrl,
    selo: t.selo, destaque: t.destaque, ordem: t.ordem, meta: metaDoTutorial(t),
  };
}

// ── Endereços ────────────────────────────────────────────────────────────────
export type TutorialVideoEmbed = { tipo: "youtube" | "vimeo" | "arquivo"; url: string; id?: string;
  /** Link de Shorts (`/shorts/<id>`): já nasce 9:16, sem esperar a sonda. */
  vertical?: boolean };
/** Endereço colado à mão quase nunca vem com esquema: quem copia da barra do
 *  navegador traz "youtube.com/watch?v=…" ou "loja.com.br/produto". Sem isto o
 *  `new URL()` estoura e o bloco SOME da página sem dizer por quê — o defeito
 *  aparece como "o link não funciona". Caminho relativo ("/p/loja") passa
 *  intacto; `mailto:`/`tel:` também. */
export function normalizarUrlPublica(valor: string): string {
  const v = (valor || "").trim();
  if (!v) return "";
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (v.startsWith("/") || v.startsWith("#")) return v;
  // "wa.me/55…", "site.com/x": tem ponto antes da primeira barra = é domínio.
  return /^[^\s/]+\.[^\s/]{2,}/.test(v) ? `https://${v}` : v;
}

/** Origem de mentira (`.invalid` é reservado) contra a qual o caminho é resolvido. */
const ORIGEM_DO_CAMINHO = "https://central.invalid";

/** Endereço que pode ir num `href` da página pública, ou "" se não pode.
 *  "//outro.site" parece caminho mas leva pra fora: fica de fora também. */
export function urlPublicaSegura(valor: string): string {
  const bruto = normalizarUrlPublica(valor);
  if (!bruto) return "";
  if (bruto.startsWith("/") || bruto.startsWith("#")) {
    // Olhar só o `//` literal não basta: o navegador lê `\` como `/` e ignora
    // tab e quebra de linha no meio do endereço, então "/\outro.site" e
    // "/<tab>/outro.site" também saem da central — e saíam com cara de link
    // interno (mesma aba, seta de "continua aqui"). Quem decide é o próprio
    // parser de URL: resolvido, o caminho tem de continuar na mesma origem.
    const caminho = bruto.replace(/[\t\n\r]/g, "");
    try { return new URL(caminho, ORIGEM_DO_CAMINHO).origin === ORIGEM_DO_CAMINHO ? caminho : ""; } catch { return ""; }
  }
  try {
    const u = new URL(bruto);
    return ["http:", "https:", "mailto:", "tel:"].includes(u.protocol) ? u.toString() : "";
  } catch { return ""; }
}

/** Destino do bloco de link: outro tutorial (resolvido contra a central de
 *  quem está vendo — publicada ou prévia) ou o endereço externo. */
export function hrefDoLink(b: Pick<TutorialBlocoLink, "tutorial" | "url">, centralUrl: string): string {
  return b.tutorial ? `${centralUrl.replace(/\/+$/, "")}/${b.tutorial}` : urlPublicaSegura(b.url);
}

/** Largura × altura lidas do cabeçalho de um JPEG (marcador SOF), sem decodificar.
 *  Serve pra sonda de proporção do YouTube: o `oar2.jpg` vem na proporção REAL
 *  do vídeo (1080×1920 num Shorts, 1280×720 num normal) e os primeiros KB já
 *  trazem o SOF — o link `watch?v=` de um Shorts não diz que ele é vertical. */
export function dimensoesDoJpeg(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xFF) return null;
    const m = b[i + 1];
    if (m === 0xFF) { i++; continue; }
    // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC).
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      const h = (b[i + 5] << 8) | b[i + 6], w = (b[i + 7] << 8) | b[i + 8];
      return w && h ? { w, h } : null;
    }
    if (m === 0xDA || m === 0xD9) return null; // começou a imagem sem SOF
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

/** Um recorte em FRAÇÕES (0..1) da mídia: onde começa e quanto ocupa. */
export type RegiaoVideo = { x: number; y: number; w: number; h: number };
export const REGIAO_INTEIRA: RegiaoVideo = { x: 0, y: 0, w: 1, h: 1 };

/** Onde está o conteúdo numa imagem RGBA, fora das barras pretas das bordas.
 *  Coluna/linha "tem conteúdo" quando mais de 4% dos pixels passam do limiar
 *  de luminância — barra de vídeo é preto chapado, e um pixel claro solto de
 *  compressão não conta. Imagem escura demais pra decidir não é recortada. */
export function regiaoSemBarras(px: { width: number; height: number; data: ArrayLike<number> }, limiar = 28): RegiaoVideo {
  const { width: W, height: H, data } = px;
  if (!W || !H) return REGIAO_INTEIRA;
  const claro = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] > limiar;
  };
  const coluna = (x: number) => { let n = 0; for (let y = 0; y < H; y++) if (claro(x, y)) n++; return n > H * 0.04; };
  const linha = (y: number) => { let n = 0; for (let x = 0; x < W; x++) if (claro(x, y)) n++; return n > W * 0.04; };
  let x0 = 0; while (x0 < W - 1 && !coluna(x0)) x0++;
  let x1 = W - 1; while (x1 > x0 && !coluna(x1)) x1--;
  let y0 = 0; while (y0 < H - 1 && !linha(y0)) y0++;
  let y1 = H - 1; while (y1 > y0 && !linha(y1)) y1--;
  if (x1 - x0 < W * 0.2 || y1 - y0 < H * 0.2) return REGIAO_INTEIRA;
  return { x: x0 / W, y: y0 / H, w: (x1 - x0 + 1) / W, h: (y1 - y0 + 1) / H };
}

// Proporções de gravação comuns: perto de uma delas (3%), vale ela exata —
// o conteúdo 3:4 medido em 129×172 px vira 3:4, não 0,7500001.
const PROPORCOES_CONHECIDAS = [9 / 16, 2 / 3, 3 / 4, 4 / 5, 1, 4 / 3, 3 / 2, 16 / 9];
const encaixarProporcao = (p: number) => PROPORCOES_CONHECIDAS.find((c) => Math.abs(p / c - 1) < 0.03) ?? p;

/** Traduz o que a miniatura mostra pro QUADRO do vídeo.
 *
 *  A `hqdefault` do YouTube é sempre 4:3 com o quadro do vídeo (proporção
 *  `quadro`, lida do `oar2.jpg`) encaixado no meio — então as barras que ela
 *  mostra são as do encaixe MAIS as gravadas no arquivo (um vídeo 3:4 enviado
 *  em 16:9). Tirando o encaixe, sobra onde o conteúdo está no quadro; é essa
 *  região que o player amplia até encher a caixa, cortando o preto.
 *  Barra fina (<4%) não compensa o recorte; proporção fora de 9:16…16:9 é
 *  leitura errada (miniatura escura) e cai no quadro inteiro. */
export function conteudoDoVideo(quadro: number, naMiniatura: RegiaoVideo, miniatura = 4 / 3): { proporcao: number; regiao: RegiaoVideo } {
  const inteiro = { proporcao: encaixarProporcao(quadro), regiao: REGIAO_INTEIRA };
  if (!(quadro > 0)) return { proporcao: 16 / 9, regiao: REGIAO_INTEIRA };
  const fw = quadro >= miniatura ? 1 : quadro / miniatura;
  const fh = quadro >= miniatura ? miniatura / quadro : 1;
  const fx = (1 - fw) / 2, fy = (1 - fh) / 2;
  const limita = (v: number) => Math.min(1, Math.max(0, v));
  let x = limita((naMiniatura.x - fx) / fw), y = limita((naMiniatura.y - fy) / fh);
  let w = Math.min(1 - x, naMiniatura.w / fw), h = Math.min(1 - y, naMiniatura.h / fh);
  if (w > 0.96) { x = 0; w = 1; }
  if (h > 0.96) { y = 0; h = 1; }
  if (w === 1 && h === 1) return inteiro;
  const proporcao = encaixarProporcao((quadro * w) / h);
  if (proporcao < (9 / 16) * 0.97 || proporcao > (16 / 9) * 1.03) return inteiro;
  return { proporcao, regiao: { x, y, w, h } };
}

/** Estilo que amplia a mídia pra região `r` encher a caixa (overflow: hidden). */
export function estiloDoRecorte(r: RegiaoVideo): { width: string; height: string; left: string; top: string } {
  const pct = (v: number) => `${+(v * 100).toFixed(3)}%`;
  return { width: pct(1 / r.w), height: pct(1 / r.h), left: pct(-r.x / r.w), top: pct(-r.y / r.h) };
}

export function embedDoTutorialVideo(valor: string): TutorialVideoEmbed | null {
  try {
    const u = new URL(normalizarUrlPublica(valor)); if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (["youtu.be", "youtube.com", "m.youtube.com"].includes(host)) { const id = host === "youtu.be" ? u.pathname.split("/").filter(Boolean)[0] : u.searchParams.get("v") || u.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1]; return id && /^[\w-]{5,20}$/.test(id) ? { tipo: "youtube", url: `https://www.youtube-nocookie.com/embed/${id}`, id, ...(/\/shorts\//.test(u.pathname) ? { vertical: true } : {}) } : null; }
    if (host === "vimeo.com" || host === "player.vimeo.com") { const id = u.pathname.match(/(?:video\/)?(\d+)/)?.[1]; return id ? { tipo: "vimeo", url: `https://player.vimeo.com/video/${id}` } : null; }
    return { tipo: "arquivo", url: u.toString() };
  } catch { return null; }
}
