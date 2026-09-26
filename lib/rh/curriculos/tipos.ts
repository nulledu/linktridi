// ── RH → Currículos: vocabulário ─────────────────────────────────────────────
// O que a tela, a API e o formulário público compartilham. Sem importar nada
// do servidor: este arquivo roda no navegador do candidato também.

import type { Selo } from "@/lib/financeiro/tipos";
import type { PerfilCandidato, Pergunta } from "./formulario";
import { ARQUIVADO, ETAPAS_PADRAO, ehIdEtapa } from "./etapas";

/**
 * A etapa do processo onde o candidato está (coluna `status`), ou
 * `arquivado`. Texto: as etapas são configuráveis — ver `etapas.ts`.
 */
export type StatusCandidato = string;

export const STATUS_CANDIDATO: StatusCandidato[] = [...ETAPAS_PADRAO.map((e) => e.id), ARQUIVADO];

export const ehStatus = (v: unknown): v is StatusCandidato => ehIdEtapa(v);

/** Selos das etapas PADRÃO — pra tela que ainda não recebeu a config. Prefira `seloDaEtapa`. */
export const SELO_STATUS: Record<string, Selo> = Object.fromEntries(
  [...ETAPAS_PADRAO.map((e) => [e.id, { label: e.label, cor: e.cor }] as const), [ARQUIVADO, { label: "Arquivado", cor: "var(--neutro)" }] as const],
);

export const ICONE_STATUS: Record<string, string> = Object.fromEntries([...ETAPAS_PADRAO.map((e) => [e.id, e.icone]), [ARQUIVADO, "archive"]]);

/** Origem do candidato. Só `tridiflow` recebe hoje; o resto é a arquitetura. */
export type OrigemCandidato = "tridiflow" | "site" | "instagram" | "indicacao" | "indeed" | "linkedin" | "outro";

export const ORIGENS: { valor: OrigemCandidato; label: string; icone: string }[] = [
  { valor: "tridiflow", label: "TridiFlow", icone: "message-chatbot" },
  { valor: "site", label: "Site", icone: "world" },
  { valor: "instagram", label: "Instagram", icone: "brand-instagram" },
  { valor: "indicacao", label: "Indicação", icone: "users" },
  { valor: "indeed", label: "Indeed", icone: "briefcase" },
  { valor: "linkedin", label: "LinkedIn", icone: "briefcase" },
  { valor: "outro", label: "Outra", icone: "dots" },
];

export const rotuloOrigem = (o: string) => ORIGENS.find((x) => x.valor === o)?.label ?? o;

export interface RespostaCandidato {
  chave: string;
  pergunta: string;
  resposta: string;
  /** Etapa do formulário de onde veio (`formacao`, `experiencia`, `vaga`…). Candidatos antigos não têm. */
  etapa?: string;
}

export interface CurriculoAnexo {
  chave: string;
  /** `/api/arquivos/<chave>` — relativo, nunca URL do B2. */
  url: string;
  nome: string;
  tipo: string;
  tamanho: number;
  enviado_em: string;
}

export interface VagaRh {
  id: string;
  titulo: string;
  setor: string | null;
  descricao: string | null;
  status: "aberta" | "pausada" | "encerrada";
  created_at: string;
  /** Perguntas específicas desta vaga — entram na etapa que recebe as da vaga. */
  perguntas?: Pergunta[];
  /** Preenchido pela leitura da lista. */
  candidatos?: number;
}

/** A linha da LISTA — o mínimo. Sem respostas, sem arquivo, sem observação. */
export interface CandidatoResumo {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  vaga_id: string | null;
  vaga: string | null;
  status: StatusCandidato;
  origem: string;
  recebido_em: string;
  visto_em: string | null;
  tem_curriculo: boolean;
  /** Resumo da triagem (ocupação, formação, experiência, etiquetas). `null` pra
   *  quem não tem `rh:curriculos_respostas` — é derivado das respostas. */
  perfil: PerfilCandidato | null;
  /** Entrevista marcada (ISO), quando houver. */
  entrevista_em: string | null;
  /** Etiquetas postas À MÃO pelo RH (as da triagem estão em `perfil.tags`). */
  tags: string[];
  /** Quando entrou na etapa atual — é o "parado há N dias". */
  etapa_em: string | null;
  updated_at: string | null;
  /** `/api/arquivos/<chave>` — só pra quem tem `rh:curriculos_arquivo`. */
  curriculo_url: string | null;
  curriculo_nome: string | null;
}

export interface ObservacaoCandidato {
  id: string;
  texto: string;
  autor_nome: string | null;
  created_at: string;
}

export type TipoHistoricoCandidato = "recebido" | "status" | "observacao" | "vaga" | "dados" | "curriculo" | "visto" | "entrevista" | "tag";

export interface HistoricoCandidato {
  id: string;
  tipo: TipoHistoricoCandidato;
  titulo: string;
  detalhe: string | null;
  autor_nome: string | null;
  created_at: string;
}

/** O perfil, já recortado pelas chaves de quem pediu (`null` = sem a gaveta). */
export interface CandidatoDetalhe extends CandidatoResumo {
  origem_detalhe: Record<string, unknown>;
  dados: Record<string, unknown>;
  respostas: RespostaCandidato[] | null;
  curriculo: CurriculoAnexo | null;
  observacoes: ObservacaoCandidato[] | null;
  historico: HistoricoCandidato[];
  arquivado_em: string | null;
}

export interface ResumoCurriculos {
  total: number;
  novos: number;
  em_analise: number;
  entrevistas: number;
  aprovados: number;
  arquivados: number;
  /** `novo` e ainda não aberto — o número do menu. */
  nao_vistos: number;
}

export interface ConfigIntegracao {
  formulario_ativo: boolean;
  webhook_configurado: boolean;
  webhook_token_dica: string | null;
  webhook_gerado_em: string | null;
  vaga_padrao_id: string | null;
  ultima_recepcao_em: string | null;
  ultima_recepcao_fonte: string | null;
  ultimo_erro: string | null;
  ultimo_erro_em: string | null;
}

export const iniciaisDe = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("") || "?";

export const TETO_OBSERVACAO = 2000;

/** Os números do topo da lista. Puro: roda no banco de provas sem servidor. */
export function resumir(lista: CandidatoResumo[]): ResumoCurriculos {
  const r: ResumoCurriculos = { total: 0, novos: 0, em_analise: 0, entrevistas: 0, aprovados: 0, arquivados: 0, nao_vistos: 0 };
  for (const c of lista) {
    r.total++;
    if (c.status === "novo") { r.novos++; if (!c.visto_em) r.nao_vistos++; }
    else if (c.status === "em_analise") r.em_analise++;
    else if (c.status === "entrevista") r.entrevistas++;
    else if (c.status === "aprovado") r.aprovados++;
    else if (c.status === "arquivado") r.arquivados++;
  }
  return r;
}
