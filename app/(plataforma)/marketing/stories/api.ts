"use client";

// ── Stories · o contrato da tela com os dados ────────────────────────────────
// A tela conversa com uma `StoriesApi`, não com `fetch` direto. Em produção é
// a `apiHttp` abaixo (as rotas de /api/marketing/stories); no banco de provas
// (/dev-stories) é uma versão em memória com as MESMAS regras (métricas,
// repetição) — é o que deixa conferir o quadro inteiro sem login e sem banco.

import type { LinhaTipo, Resumo } from "@/lib/marketing-stories/metricas";
import type { ConteudoStory } from "@/lib/marketing-stories/semelhanca";
import type { NovoStory, ParecidoStory, PatchStory, Story } from "@/lib/marketing-stories/tipos";
import { salvarEmSegundoPlano } from "../../ui/salvarEmSegundoPlano";
import { descartarNoServidor, enviarMidia, type MidiaPreparada } from "./midiaStory";

export interface MesDeStories { stories: Story[]; campanhas: string[]; sqlPendente: boolean }

export type OrdemBusca = "recentes" | "vendas" | "cliques" | "conversao";
export interface FiltroBusca {
  q?: string;
  de?: string;
  ate?: string;
  produtoId?: string;
  tipo?: string;
  campanha?: string;
  ordem?: OrdemBusca;
  offset?: number;
  limite?: number;
}
export interface BuscaStories { stories: Story[]; total: number; resumo: Resumo; porTipo: LinhaTipo[]; sqlPendente: boolean }
export interface Semelhantes { parecidos: ParecidoStory[]; mesmoFormato: { total: number; ultimo: string | null } }
export type Criado = { ok: true; story: Story } | { ok: false; erro: string };

export interface StoriesApi {
  listarMes(mes: string): Promise<MesDeStories>;
  buscar(f: FiltroBusca): Promise<BuscaStories>;
  detalhe(id: string): Promise<{ story: Story; parecidos: ParecidoStory[] } | null>;
  semelhantes(c: ConteudoStory & { excluirId?: string }): Promise<Semelhantes>;
  criar(d: NovoStory): Promise<Criado>;
  /** Otimista: a tela já mostra o valor novo; o pedido vai pela fila de
   *  salvamento (repete sozinho, avisa por toast se o servidor recusar). */
  atualizar(id: string, patch: PatchStory, rotulo: string): void;
  excluir(id: string): Promise<boolean>;
  enviarMidia(m: MidiaPreparada, aoProgredir?: (fracao: number) => void): Promise<{ midiaUrl: string; capaUrl: string | null }>;
  /** Arquivo que subiu e não virou story. */
  descartarMidia(urls: string[]): void;
}

const ERROS: Record<string, string> = {
  sql_pendente: "A tabela de stories ainda não existe no banco. Rode supabase/marketing_stories.sql.",
  sem_permissao: "Você não tem permissão pra registrar stories (Marketing · criar).",
  data_invalida: "A data do story não é válida.",
  data_obrigatoria: "Informe a data do story.",
  midia_invalida: "O arquivo não é de story. Envie de novo.",
  midia_sem_tipo: "O arquivo não é de story. Envie de novo.",
  cliques_invalido: "Cliques precisa ser um número inteiro.",
  vendas_invalido: "Vendas precisa ser um número inteiro.",
  link_invalido: "O link precisa começar com http:// ou https://.",
  produto_invalido: "Esse produto não existe mais. Escolha outro.",
};

export function textoDoErro(codigo?: string | null): string {
  return (codigo && ERROS[codigo]) || codigo || "Não deu pra salvar o story. Tente de novo.";
}

/** JSON de verdade ou `null`. Sessão vencida chega como 200 + HTML do login
 *  (ver ui/rede.ts) — e isso aqui já foi "salvo" que não salvou. */
async function lerJson(r: Response): Promise<Record<string, unknown> | null> {
  if (r.redirected) return null;
  return (await r.json().catch(() => null)) as Record<string, unknown> | null;
}

const SESSAO = "Sua sessão expirou. Entre de novo e tente outra vez.";

export const apiHttp: StoriesApi = {
  async listarMes(mes) {
    const j = await lerJson(await fetch(`/api/marketing/stories?mes=${encodeURIComponent(mes)}`));
    if (!j?.ok) throw new Error(textoDoErro((j?.error as string) ?? null));
    return { stories: j.stories as Story[], campanhas: (j.campanhas as string[]) ?? [], sqlPendente: !!j.sqlPendente };
  },

  async buscar(f) {
    const p = new URLSearchParams({ busca: "1" });
    const campos: Record<string, unknown> = {
      q: f.q, de: f.de, ate: f.ate, produto: f.produtoId, tipo: f.tipo, campanha: f.campanha,
      ordem: f.ordem, offset: f.offset, limite: f.limite,
    };
    for (const [k, v] of Object.entries(campos)) if (v != null && v !== "") p.set(k, String(v));
    const j = await lerJson(await fetch(`/api/marketing/stories?${p}`));
    if (!j?.ok) throw new Error(textoDoErro((j?.error as string) ?? null));
    return j as unknown as BuscaStories;
  },

  async detalhe(id) {
    const j = await lerJson(await fetch(`/api/marketing/stories/${id}`));
    return j?.ok ? { story: j.story as Story, parecidos: (j.parecidos as ParecidoStory[]) ?? [] } : null;
  },

  async semelhantes(c) {
    const j = await lerJson(await fetch("/api/marketing/stories/semelhantes", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c),
    }));
    return j?.ok
      ? { parecidos: (j.parecidos as ParecidoStory[]) ?? [], mesmoFormato: j.mesmoFormato as Semelhantes["mesmoFormato"] }
      : { parecidos: [], mesmoFormato: { total: 0, ultimo: null } };
  },

  async criar(d) {
    let r: Response;
    try {
      r = await fetch("/api/marketing/stories", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(d),
      });
    } catch {
      return { ok: false, erro: "Sem conexão com o servidor. Confira a internet e tente de novo." };
    }
    const j = await lerJson(r);
    if (!j) return { ok: false, erro: SESSAO };
    return j.ok ? { ok: true, story: j.story as Story } : { ok: false, erro: textoDoErro(j.error as string) };
  },

  atualizar(id, patch, rotulo) {
    // Uma chave por story E por conjunto de campos: dois números trocados em
    // seguida (cliques, depois vendas) não podem virar um pedido só — o
    // segundo substituiria o primeiro na fila e o clique se perderia.
    salvarEmSegundoPlano({
      chave: `story:${id}:${Object.keys(patch).sort().join(",")}`,
      rotulo, url: `/api/marketing/stories/${id}`, method: "PATCH", body: patch,
    });
  },

  async excluir(id) {
    const j = await lerJson(await fetch(`/api/marketing/stories/${id}`, { method: "DELETE" }).catch(() => new Response(null)));
    return !!j?.ok;
  },

  enviarMidia: (m, p) => enviarMidia(m, p),
  descartarMidia: (urls) => descartarNoServidor(urls),
};
