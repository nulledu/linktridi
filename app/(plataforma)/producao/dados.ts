"use client";

import { useLeitura } from "../ui/useLeitura";
export { dadoDe, type Leitura } from "../ui/useLeitura";
import type { MaquinaControle } from "@/lib/maquina-fila";
import type { Quadro } from "@/lib/maquina-quadro";

/**
 * As duas leituras de máquina que a Produção inteira divide: a fila de cada
 * máquina (`/api/maquinas/programacoes`, com OEE) e o quadro (programações +
 * atividades, por raia). Mesmo endpoint da tela de operar e do kanban — a
 * Visão geral não tem rota própria, pra nunca contar diferente das subáreas.
 *
 * Sem poll: as duas telas que MEXEM nisso (operar máquina, quadro) recarregam
 * depois de cada ação; aqui é leitura, e quem quer o agora recarrega a tela.
 * O snapshot do ERP (`useProduction`) é o único que se atualiza sozinho.
 */
const lerMaquinas = (d: Record<string, unknown>) => ({ maquinas: (d.maquinas ?? []) as MaquinaControle[], controla: d.controla === true });
const lerQuadro = (d: Record<string, unknown>) => (d.quadro ?? d) as Quadro;

export const useMaquinas = () => useLeitura("/api/maquinas/programacoes", lerMaquinas);
export const useQuadro = () => useLeitura("/api/maquinas/quadro", lerQuadro);

