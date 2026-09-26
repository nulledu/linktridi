// TridiFlow — exportar/importar projeto como ARQUIVO de template.
//
// O arquivo é o mesmo JSON que já vive no banco (fluxo/página/settings/theme),
// num envelope com formato e versão. Ele existe pra levar um projeto de um
// workspace pro outro (ou guardar uma cópia fria) — por isso ele NUNCA carrega
// endereço de publicação (slug/domínio), status nem ids de linha: template é
// conteúdo, não instância publicada.
//
// Importar não tem rota própria de propósito: o fluxo é o mesmo do editor —
// POST cria o projeto vazio do tipo certo e o PATCH de auto-save grava o
// conteúdo. Nada de segunda porta de escrita pra validar.

import type { BotCompleto, TipoProjeto } from "./tridiflow-db";
import type { BotSettings, Fluxo, Theme } from "./tridiflow";
import { normalizarPagina, type PaginaDoc } from "./tridiflow-pagina";

export const FORMATO_TEMPLATE = "tridiflow-template";

export interface ArquivoTemplate {
  formato: typeof FORMATO_TEMPLATE;
  versao: 1;
  tipo: TipoProjeto;
  nome: string;
  /** Quando o arquivo foi gerado — só informativo. */
  exportadoEm?: string;
  settings?: BotSettings;
  theme?: Theme;
  fluxo?: Fluxo;
  pagina?: PaginaDoc;
}

const TIPOS: TipoProjeto[] = ["flow", "quiz", "page", "iframe", "linktridi"];
const ehTipo = (v: unknown): v is TipoProjeto => TIPOS.includes(v as TipoProjeto);

/** Monta o arquivo a partir do bot completo. O quiz mora em `settings.modo`
 *  (ver tipoDe em tridiflow-db), então exportar settings já leva o quiz. */
export function arquivoDoBot(bot: BotCompleto): ArquivoTemplate {
  const t: ArquivoTemplate = {
    formato: FORMATO_TEMPLATE,
    versao: 1,
    tipo: bot.tipo,
    nome: bot.nome,
    exportadoEm: new Date().toISOString(),
    settings: bot.settings,
    theme: bot.theme,
  };
  // Só o documento do tipo: um arquivo de página com um fluxo de chat dentro
  // seria bagagem morta e confundiria quem abrir o JSON pra ler.
  if (bot.tipo === "page") t.pagina = bot.pagina;
  else t.fluxo = bot.fluxo;
  return t;
}

export function nomeDoArquivo(nome: string): string {
  const base = (nome || "template").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "template";
  return `${base}.tridiflow.json`;
}

export type Leitura =
  | { ok: true; arquivo: ArquivoTemplate }
  | { ok: false; erro: string };

/**
 * Valida o JSON colado/enviado. Aceita duas formas:
 *  1. o envelope exportado por nós;
 *  2. um `PaginaDoc` cru (versao+secoes) — cortesia pra quem copiou o
 *     documento de uma página direto do banco.
 * Qualquer outra coisa volta com um erro que dá pra mostrar no toast.
 */
export function lerArquivoTemplate(bruto: unknown): Leitura {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) {
    return { ok: false, erro: "O arquivo não é um JSON de template." };
  }
  const d = bruto as Record<string, unknown>;

  // Forma 2: documento de página cru.
  if (d.formato === undefined && Array.isArray(d.secoes)) {
    return {
      ok: true,
      arquivo: {
        formato: FORMATO_TEMPLATE, versao: 1, tipo: "page",
        nome: "Página importada", pagina: normalizarPagina(d),
      },
    };
  }

  if (d.formato !== FORMATO_TEMPLATE) {
    return { ok: false, erro: "O arquivo não é um template do TridiFlow (formato desconhecido)." };
  }
  if (d.versao !== 1) {
    return { ok: false, erro: "Este arquivo é de uma versão mais nova do TridiFlow. Atualize o sistema antes de importar." };
  }
  if (!ehTipo(d.tipo)) {
    return { ok: false, erro: "O arquivo não diz que tipo de projeto ele é." };
  }
  const tipo = d.tipo;
  if (tipo === "page" && (!d.pagina || typeof d.pagina !== "object")) {
    return { ok: false, erro: "O arquivo diz ser uma página, mas não tem o documento dela." };
  }
  if (tipo === "flow" && (!d.fluxo || typeof d.fluxo !== "object")) {
    return { ok: false, erro: "O arquivo diz ser um fluxo, mas não tem o documento dele." };
  }

  const nome = typeof d.nome === "string" && d.nome.trim() ? d.nome.trim().slice(0, 120) : "Projeto importado";
  return {
    ok: true,
    arquivo: {
      formato: FORMATO_TEMPLATE, versao: 1, tipo, nome,
      settings: d.settings as BotSettings | undefined,
      theme: d.theme as Theme | undefined,
      fluxo: d.fluxo as Fluxo | undefined,
      // A página passa pelo mesmo normalizador do banco: arquivo velho ou
      // editado à mão não pode quebrar o editor.
      pagina: d.pagina ? normalizarPagina(d.pagina) : undefined,
    },
  };
}

/** Corpo do PATCH que grava o conteúdo no projeto recém-criado. */
export function patchDaImportacao(t: ArquivoTemplate): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (t.settings) p.settings = t.settings;
  if (t.theme) p.theme = t.theme;
  if (t.tipo === "page") { if (t.pagina) p.pagina = t.pagina; }
  else if (t.fluxo) p.fluxo = t.fluxo;
  return p;
}
