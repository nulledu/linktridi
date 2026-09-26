// Leitura de UM tutorial na página pública — funções puras.
//
// Quem abre esta página acabou de comprar um carimbo, uma chancela, um sinete
// ou um cortador, e está com o produto numa mão e o celular na outra. O que
// mora aqui é a parte da página que dá pra decidir sem DOM: o "Você vai
// precisar", os passos feitos guardados no aparelho, a mensagem pronta do
// WhatsApp, o gesto do passo a passo e os metadados do link compartilhado.
//
// Puro (sem banco, sem DOM, sem React): roda no servidor, no navegador e no
// teste.
import type { Metadata } from "next";
import { semTags } from "@/lib/vitrine/higienizar";
import {
  DIFICULDADES, atalhosPadrao, contarPassos, htmlDoConteudo, linkWhatsapp, metaDoTutorial, urlPublicaSegura,
  type AtalhoCentral, type BlocoTutorial, type MaterialTutorial, type Tutorial, type TutorialBlocoPasso,
} from "@/lib/tridiflow-tutoriais";

// ── Métricas que a página manda ──────────────────────────────────────────────
// CONTRATO com a rota /api/p/tutorial-metrica: são estes os campos que ela
// aceita. Os motivos do "ainda não" existem porque "não resolveu" sozinho não
// diz o que consertar — o guia, o catálogo ou o produto.
export type CampoMotivo = "motivo_produto" | "motivo_passo" | "motivo_resultado" | "motivo_outro";
export type CampoMetricaLeitura = "vistas" | "uteis" | "inuteis" | "contatos" | CampoMotivo;
export const CAMPOS_METRICA_LEITURA: readonly CampoMetricaLeitura[] = [
  "vistas", "uteis", "inuteis", "contatos", "motivo_produto", "motivo_passo", "motivo_resultado", "motivo_outro",
];

/** Os motivos do "Ainda não", na ordem em que aparecem. `frase` é o que entra
 *  na mensagem do WhatsApp — o atendente lê o problema antes do "oi". */
export const MOTIVOS_NAO: readonly { campo: CampoMotivo; rotulo: string; icone: string; frase: string }[] = [
  { campo: "motivo_produto", rotulo: "Não achei meu produto", icone: "package", frase: "Não achei o meu produto no tutorial." },
  { campo: "motivo_passo", rotulo: "Um passo ficou confuso", icone: "help-circle", frase: "Um passo ficou confuso." },
  { campo: "motivo_resultado", rotulo: "O resultado saiu errado", icone: "alert-triangle", frase: "O resultado saiu errado." },
  { campo: "motivo_outro", rotulo: "Outro motivo", icone: "dots", frase: "Ainda não consegui resolver." },
];

// ── Mensagem pronta do WhatsApp ──────────────────────────────────────────────
/** De onde veio o "fale com a gente": um motivo do "ainda não" ou o bloco
 *  "Deu errado?". */
export type OrigemContato = CampoMotivo | "problemas";
const FRASE_DA_ORIGEM: Record<OrigemContato, string> = {
  ...Object.fromEntries(MOTIVOS_NAO.map((m) => [m.campo, m.frase])) as Record<CampoMotivo, string>,
  problemas: "Olhei o “Deu errado?” e ainda não resolveu.",
};

/** A pessoa não precisa explicar do zero: o atendente recebe o nome do guia, o
 *  passo em que ela está e o que deu errado. Só vai o que a própria página
 *  mostra — nada pessoal na URL. */
export function mensagemWhatsapp({ titulo, passo, motivo }: {
  titulo: string; passo?: number | null; motivo?: OrigemContato | null;
}): string {
  const partes = [`Olá! Vim do tutorial “${titulo.trim() || "sem título"}”.`];
  if (passo && passo > 0) partes.push(`Estou no passo ${passo}.`);
  partes.push(motivo ? FRASE_DA_ORIGEM[motivo] : "Preciso de ajuda.");
  return partes.join(" ");
}

/** Gaveta do catálogo: estado DA CENTRAL, que só ela lê no `?c=` — a página do
 *  guia não conhece o parâmetro. */
const GAVETA_CATALOGO = "?c=_catalogo";
/** Endereço escrito pra central: é o que a sugestão do editor grava no
 *  Catálogo. Na página do guia ele resolveria contra /p/<slug>/<guia>, e o
 *  botão do meio recarregaria o próprio tutorial em vez de abrir o catálogo. */
const daCentral = (a: AtalhoCentral) => a.acao === "link" && a.url.startsWith("?");

/** Barra do rodapé: a que a central configurou, ou a padrão — que ganha o
 *  Catálogo quando a central tem vitrine e o Contato quando tem WhatsApp,
 *  igual à da central. Sair da lista pra ler um guia não pode tirar da pessoa
 *  o caminho até a loja. Sem `centralUrl` nada é reescrito: um "?c=" solto
 *  apontaria pro próprio guia. */
export function barraDoTutorial(atalhos: AtalhoCentral[], whatsapp: string, { centralUrl = "", temCatalogo = false, temIdeias = false }: {
  /** Raiz da central de quem vê: `/p/<slug>` no ar, a da prévia na prévia. */
  centralUrl?: string;
  /** A central tem vitrine ligada (`catalogoLoja` preenchido). */
  temCatalogo?: boolean;
  /** A central tem reels: o atalho "Ideias" vira link pra central com o feed aberto. */
  temIdeias?: boolean;
} = {}): AtalhoCentral[] {
  const configurados = centralUrl ? atalhos.map((a) => (daCentral(a) ? { ...a, url: `${centralUrl}${a.url}` } : a)) : atalhos;
  return atalhosPadrao(temCatalogo && centralUrl ? `${centralUrl}${GAVETA_CATALOGO}` : undefined, linkWhatsapp(whatsapp) || undefined, configurados, temIdeias && !!centralUrl)
    .map((a) => a.acao === "ideias" ? { ...a, acao: "link" as const, url: `${centralUrl}?v=ideias` } : a);
}

// ── "Você vai precisar" ──────────────────────────────────────────────────────
/** Tempo do guia. O digitado é quanto leva pra FAZER e sai seco ("5 min"); a
 *  estimativa de leitura ganha o "≈" — prometer 2 minutos exatos pra carimbar
 *  um tecido seria mentir com precisão. */
export function tempoDoTutorial(t: Pick<Tutorial, "descricao" | "blocos" | "duracaoMinutos">): { minutos: number; estimado: boolean; texto: string } {
  const { minutos } = metaDoTutorial(t);
  const estimado = t.duracaoMinutos == null;
  return { minutos, estimado, texto: `${estimado ? "≈ " : ""}${minutos} min` };
}

export interface ResumoPrecisa {
  /** Só com material. Tempo, dificuldade e passos saíram da página em
   *  24/09/26 (ruído antes do conteúdo); o cartão ficou só pra lista do que
   *  comprar. */
  mostrar: boolean;
  tempo: string; dificuldade: string | null; passos: number; materiais: MaterialTutorial[];
}
export function precisaDoTutorial(t: Pick<Tutorial, "descricao" | "blocos" | "duracaoMinutos" | "dificuldade" | "materiais">): ResumoPrecisa {
  const passos = contarPassos(t.blocos);
  const dificuldade = t.dificuldade ? DIFICULDADES[t.dificuldade] ?? null : null;
  const materiais = (t.materiais ?? []).filter((m) => m.nome.trim());
  return { mostrar: materiais.length > 0, tempo: tempoDoTutorial(t).texto, dificuldade, passos, materiais };
}

/** Produtos que a página precisa resolver no servidor: os dos blocos de
 *  produto E os dos materiais — numa ida só ao banco, não duas. */
export function idsDeProdutos(t: Pick<Tutorial, "blocos" | "materiais">): string[] {
  const ids = [
    ...t.blocos.flatMap((b) => (b.tipo === "produto" ? [b.produtoId] : [])),
    ...(t.materiais ?? []).map((m) => m.produtoId),
  ];
  return [...new Set(ids.map((x) => (x || "").trim()).filter(Boolean))];
}

// ── Passos ───────────────────────────────────────────────────────────────────
const ehPasso = (b: BlocoTutorial): b is TutorialBlocoPasso => b.tipo === "passo";

/** O sumário (e o trilho do computador) só existe a partir de TRÊS passos:
 *  com dois, ele é maior que o caminho que encurta. Mora aqui, e não no
 *  componente, porque a página (servidor) decide o layout de duas colunas
 *  com o mesmo número. */
export const MINIMO_SUMARIO = 3;

/** O que as peças de cliente precisam saber de cada passo: id (pra guardar o
 *  "feito"), número e título. Só isso atravessa pro navegador como dado — o
 *  conteúdo segue desenhado no servidor. */
export interface PassoRef { id: string; n: number; titulo: string }
export function referenciasDosPassos(blocos: BlocoTutorial[]): PassoRef[] {
  return blocos.filter(ehPasso).map((b, i) => ({ id: b.id, n: i + 1, titulo: b.titulo || `Passo ${i + 1}` }));
}

/** Um passo inteiro pro modo "um passo por vez": o texto já HIGIENIZADO aqui,
 *  no servidor — o navegador só desenha. */
export interface PassoConteudo extends PassoRef { html: string; imagemUrl: string; imagemAlt: string; videoUrl: string; videoCapaUrl: string }
export function conteudoDosPassos(blocos: BlocoTutorial[]): PassoConteudo[] {
  return blocos.filter(ehPasso).map((b, i) => ({
    id: b.id, n: i + 1, titulo: b.titulo || `Passo ${i + 1}`, html: htmlDoConteudo(b.conteudo),
    imagemUrl: b.imagemUrl, imagemAlt: b.imagemAlt, videoUrl: b.videoUrl, videoCapaUrl: b.videoCapaUrl,
  }));
}

/** Onde o "feito" mora no aparelho. A prévia do editor (sem central
 *  publicada) tem chave própria: marcar passo testando o rascunho não pode
 *  aparecer marcado pra quem abrir o guia no ar no mesmo navegador. */
export const chaveFeitos = (botId: string | null | undefined, handle: string): string =>
  `tut-feitos:${botId || "previa"}:${handle}`;

/** Lê o que ficou guardado. O guia pode ter mudado desde a última visita: id
 *  de passo que não existe mais cai fora, e a ordem volta a ser a do guia. */
export function lerFeitos(bruto: string | null | undefined, ids: readonly string[]): string[] {
  if (!bruto) return [];
  try {
    const v: unknown = JSON.parse(bruto);
    if (!Array.isArray(v)) return [];
    const marcados = new Set(v.filter((x): x is string => typeof x === "string"));
    return ids.filter((id) => marcados.has(id));
  } catch { return []; }
}

/** Marca ou desmarca um passo. Guardar por ID (e não pelo número) é o que
 *  mantém o feito no passo certo quando alguém reordena o guia. */
export function alternarFeito(feitos: readonly string[], id: string, ids: readonly string[]): string[] {
  const marcados = new Set(feitos);
  if (marcados.has(id)) marcados.delete(id); else marcados.add(id);
  return ids.filter((x) => marcados.has(x));
}

export const textoAndamento = (feitos: number, total: number): string =>
  `${feitos} de ${total} ${total === 1 ? "passo feito" : "passos feitos"}`;

/** Onde o modo passo a passo abre: no passo que está na tela; sem isso, no
 *  primeiro que falta — quem volta amanhã retoma de onde parou. */
export function passoInicialDoModo(ids: readonly string[], feitos: readonly string[], atual: number | null): number {
  if (atual && atual >= 1 && atual <= ids.length) return atual;
  const i = ids.findIndex((id) => !feitos.includes(id));
  return i >= 0 ? i + 1 : 1;
}

// ── Gesto do passo a passo ───────────────────────────────────────────────────
export const LIMIAR_GESTO = 60;
/** Arrastar pro lado troca de passo: pra esquerda avança (+1), pra direita
 *  volta (-1). Menos de 60px é toque trêmulo, e arrasto mais inclinado que
 *  ~34° é a pessoa rolando o texto — trocar o passo nessa hora faria ela
 *  perder a linha que estava lendo. */
export function direcaoDoGesto(dx: number, dy: number, limiar = LIMIAR_GESTO): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  if (Math.abs(dx) < limiar) return 0;
  if (Math.abs(dy) > Math.abs(dx) * 0.67) return 0;
  return dx < 0 ? 1 : -1;
}

// ── Metadados do link compartilhado ──────────────────────────────────────────
/** Resumo do cartão de link (WhatsApp, Instagram): uns 80 caracteres, cortado
 *  na palavra. O WhatsApp mostra duas linhas — o resto vira "…" no meio da
 *  palavra se a gente não cortar antes. */
export function resumoCurto(texto: string, limite = 80): string {
  const t = semTags(texto || "");
  if (t.length <= limite) return t;
  const corte = t.slice(0, limite - 1);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > limite * 0.5 ? corte.slice(0, espaco) : corte).replace(/[\s,.;:!?–—-]+$/, "")}…`;
}

/** Só o nome do servidor, sem porta nem nada que dê pra injetar num endereço. */
const hostValido = (host: string): string => {
  const h = (host || "").trim().toLowerCase().split(":")[0];
  return /^[a-z0-9.-]+$/.test(h) ? h : "";
};

/** A capa no og:image TEM de ser absoluta: robô de WhatsApp/Meta não resolve
 *  "/storage/capa.webp" contra a página. Caminho relativo ganha o host de quem
 *  pediu; `data:`, `mailto:` e afins não viram imagem. */
export function urlAbsoluta(valor: string, host: string): string {
  const seguro = urlPublicaSegura(valor);
  if (!seguro || seguro.startsWith("#")) return "";
  if (/^https?:\/\//i.test(seguro)) return seguro;
  const h = hostValido(host);
  return seguro.startsWith("/") && h ? `https://${h}${seguro}` : "";
}

/** Metadados da página do tutorial. O título do cartão é o do GUIA, sem a
 *  marca: no WhatsApp a pessoa quer ler "Como trocar o refil", e o nome da
 *  central já vem no domínio. Continua fora do Google (noindex) — a central
 *  é pra quem comprou, não pra busca. */
export function metadadosDoTutorial({ tutorial, centralTitulo, host, slug }: {
  tutorial: Pick<Tutorial, "titulo" | "descricao" | "capaUrl" | "handle">;
  centralTitulo: string; host: string; slug: string;
}): Metadata {
  const titulo = tutorial.titulo.trim();
  const descricao = semTags(tutorial.descricao || "").slice(0, 160);
  const curta = resumoCurto(tutorial.descricao, 80) || undefined;
  const h = hostValido(host);
  // Canônica SEM query: o `?utm=` de quem compartilhou não pode virar o
  // endereço que o próximo compartilha.
  const url = h ? `https://${h}/p/${encodeURIComponent(slug)}/${encodeURIComponent(tutorial.handle)}` : undefined;
  const capa = urlAbsoluta(tutorial.capaUrl, h);
  return {
    title: centralTitulo ? `${titulo} — ${centralTitulo}` : titulo,
    description: descricao || undefined,
    robots: { index: false, follow: false },
    openGraph: { title: titulo, description: curta, url, type: "article", images: capa ? [{ url: capa, alt: titulo }] : undefined },
    twitter: { card: "summary_large_image", title: titulo, description: curta, images: capa ? [capa] : undefined },
  };
}
