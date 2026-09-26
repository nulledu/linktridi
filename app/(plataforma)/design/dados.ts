"use client";

import { useLeitura } from "../ui/useLeitura";
import type { ProjetoLinha, ResumoDesign, TarefaDesign, ArquivoProjeto } from "@/lib/design-projetos";
import type { Ciclo, EtapaGestao, FluxoPeriodo, Retrabalho } from "@/lib/design-gestao";
import type { EventoDesign } from "@/lib/design-fluxo";
export { dadoDe } from "../ui/useLeitura";

/**
 * As leituras do Design. Todas batem na MESMA leitura do ERP em cache no
 * servidor (1 min). Sem poll: o fluxo muda na escala de minutos, e quem quer
 * o agora recarrega. `useListaProjetos`/`useBiblioteca` só servem às telas
 * guardadas em `_guardado/` — o módulo hoje é uma tela só.
 */

/** O painel de gestão: a tela do módulo. */
export interface RespostaPainel {
  atualizadoEm: string;
  resumo: ResumoDesign;
  etapas: EtapaGestao[];
  gargalo: EtapaGestao | null;
  wipSetor: number;
  fluxo7: FluxoPeriodo;
  entradas: { dia: string; valor: number }[];
  saidas: { dia: string; valor: number }[];
  ciclo: Ciclo;
  retrabalho: Retrabalho;
  envelhecendo: ProjetoLinha[];
  atencao: ProjetoLinha[];
  eventos: EventoDesign[];
  tarefas: TarefaDesign[];
}
export interface RespostaLista {
  atualizadoEm: string;
  total: number;
  porStatus: Record<string, number>;
  porColuna: Record<string, number>;
  responsaveis: string[];
  projetos: ProjetoLinha[];
}
export interface MaterialDesign {
  id: string; nome: string; categoria: string; url: string; mime: string | null; tamanho: number | null;
  tags: string[]; descricao: string | null; pedido_id: number | null; pedido_ref: string | null; criado_nome: string | null; created_at: string;
}
export interface RespostaBiblioteca {
  erp: "ok" | "erro";
  materiaisDisponivel: boolean;
  arquivos: ArquivoProjeto[];
  totalArquivos: number;
  contagem: Record<string, number>;
  materiais: MaterialDesign[];
}

const comoE = <T,>(d: Record<string, unknown>) => d as unknown as T;

export const usePainelDesign = () => useLeitura("/api/design/projetos", comoE<RespostaPainel>);
export const useListaProjetos = (qs: string) => useLeitura(`/api/design/projetos?vista=lista&${qs}`, comoE<RespostaLista>);
export const useBiblioteca = (qs: string) => useLeitura(`/api/design/biblioteca?${qs}`, comoE<RespostaBiblioteca>);
