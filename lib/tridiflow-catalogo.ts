// ── TridiFlow · catálogo único de templates ──────────────────────────────────
//
// A Biblioteca de Templates listava só `FUNIL_TEMPLATES` — DOIS itens, os dois
// de chat. Os 5 templates de página existiam e só apareciam no modal "o que
// você deseja criar?"; os 4 de quiz nem isso. A tela que devia ser a porta de
// entrada do produto mostrava 2 de 11.
//
// Aqui os três catálogos viram uma lista só, com a forma que o card precisa.
// Cada fonte continua dona do que sabe: fluxo tem grupos, quiz tem etapas,
// página tem seções. O que este arquivo faz é TRADUZIR os três pra "passos" e
// "métricas" — não reimplementar nenhum.
//
// Puro e client-safe.

import { FUNIL_TEMPLATES } from "./tridiflow-templates";
import { QUIZ_TEMPLATES } from "./tridiflow-quiz-templates";
import { TEMPLATES_PAGINA } from "./tridiflow-pagina-templates";
import { QUIZ_TIPOS, ehPergunta } from "./tridiflow-quiz";
import { todosBlocos } from "./tridiflow-pagina";
import type { TipoProjeto } from "./tridiflow-db";

export interface MetricaTemplate { label: string; valor: number }

export interface ItemCatalogo {
  /** Único no catálogo inteiro: `flow:chancela`, `quiz:diagnostico`, `page:vsl`.
   *  O id CRU (sem prefixo) é o que vai pro POST — os três catálogos têm ids
   *  próprios e "branco" existe em dois deles. */
  chave: string;
  templateId: string;
  tipo: TipoProjeto;
  nome: string;
  descricao: string;
  icone: string;
  /** Categoria do catálogo de origem, quando houver (só o de chat tem). */
  categoria?: string;
  /** Prévia da estrutura, na ordem — vira o mini-fluxo do card. */
  passos: string[];
  metricas: MetricaTemplate[];
}

export const ROTULO_TIPO: Record<TipoProjeto, string> = {
  flow: "Fluxo",
  quiz: "Quiz",
  page: "Página",
  iframe: "Iframe",
  linktridi: "LinkTridi",
};

/** Plural escrito à mão: `${rotulo}s` dava "Quizs", e a sidebar já dizia
 *  "Quizzes" — duas grafias pro mesmo lugar na mesma tela. */
export const ROTULO_TIPO_PLURAL: Record<TipoProjeto, string> = {
  flow: "Fluxos",
  quiz: "Quizzes",
  page: "Páginas",
  iframe: "Iframes",
  linktridi: "LinkTridi",
};

export const ICONE_TIPO: Record<TipoProjeto, string> = {
  flow: "message-chatbot",
  quiz: "list-numbers",
  page: "file-text",
  iframe: "world-www",
  linktridi: "link",
};

/** Monta o catálogo inteiro.
 *
 *  É uma FUNÇÃO e não uma constante de módulo de propósito: `TEMPLATES_PAGINA`
 *  expõe `doc` como getter que remonta a árvore a cada leitura, então deixar
 *  isso rodando no import faria toda tela que importa este arquivo pagar a
 *  montagem de 5 páginas. Quem chama guarda o resultado. */
export function catalogoCompleto(): ItemCatalogo[] {
  const fluxos: ItemCatalogo[] = FUNIL_TEMPLATES.map((t) => ({
    chave: `flow:${t.id}`,
    templateId: t.id,
    tipo: "flow",
    nome: t.nome,
    descricao: t.descricao,
    icone: t.icone,
    categoria: t.categoria,
    passos: t.fluxo.groups.map((g) => g.title),
    metricas: [
      { label: "Etapas", valor: t.fluxo.groups.length },
      { label: "Blocos", valor: t.fluxo.groups.reduce((a, g) => a + g.blocks.length, 0) },
      { label: "Variáveis", valor: t.fluxo.variables.length },
    ],
  }));

  const quizzes: ItemCatalogo[] = QUIZ_TEMPLATES.map((t) => {
    const q = t.montar();
    return {
      chave: `quiz:${t.id}`,
      templateId: t.id,
      tipo: "quiz",
      nome: t.nome,
      descricao: t.descricao,
      icone: t.icone,
      // O tipo da etapa diz mais que o texto dela: "Capa › Escolha única ›
      // Análise › Oferta" é a forma do funil, que é o que se compara entre
      // templates. O título é do conteúdo, e o conteúdo vai ser trocado.
      passos: q.steps.map((s) => QUIZ_TIPOS.find((x) => x.id === s.tipo)?.label ?? s.tipo),
      metricas: [
        { label: "Etapas", valor: q.steps.length },
        { label: "Perguntas", valor: q.steps.filter(ehPergunta).length },
        { label: "Tags", valor: new Set(q.steps.flatMap((s) => (s.opcoes ?? []).map((o) => o.tag).filter(Boolean))).size },
      ],
    };
  });

  const paginas: ItemCatalogo[] = TEMPLATES_PAGINA.map((t) => {
    const doc = t.doc;   // getter: uma leitura só, guardada aqui
    return {
      chave: `page:${t.id}`,
      templateId: t.id,
      tipo: "page",
      nome: t.nome,
      descricao: t.descricao,
      icone: t.icone,
      categoria: t.categoria,
      // Seção sem nome vira "Seção 3": um card com lacunas no meio do caminho
      // parece template quebrado, e nome de seção é opcional no modelo.
      passos: doc.secoes.map((s, i) => s.nome?.trim() || `Seção ${i + 1}`),
      metricas: [
        { label: "Seções", valor: doc.secoes.length },
        { label: "Blocos", valor: todosBlocos(doc).length },
      ],
    };
  });

  return [...fluxos, ...quizzes, ...paginas];
}

/** Filtro da tela: tipo + busca por nome/descrição. */
export function filtrarCatalogo(itens: ItemCatalogo[], tipo: TipoProjeto | "todos", busca: string): ItemCatalogo[] {
  const q = busca.trim().toLowerCase();
  return itens.filter((t) =>
    (tipo === "todos" || t.tipo === tipo) &&
    (!q || t.nome.toLowerCase().includes(q) || t.descricao.toLowerCase().includes(q)));
}

/** Onde o projeto recém-criado abre. Cada tipo tem editor próprio. */
export const editorDoTipo = (tipo: TipoProjeto, id: string): string =>
  tipo === "page" ? `/tridiflow/p/${id}` : tipo === "quiz" ? `/tridiflow/q/${id}` : `/tridiflow/${id}`;
