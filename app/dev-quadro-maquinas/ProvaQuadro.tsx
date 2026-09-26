"use client";

import { useState } from "react";
import { QuadroVisual, type Destino } from "@/app/(plataforma)/producao/QuadroMaquinas";
import {
  montarQuadro, patchDeStatus, SEM_MAQUINA,
  type LinhaAtividadeQuadro, type LinhaMaquinaQuadro, type LinhaProgQuadro,
} from "@/lib/maquina-quadro";

/**
 * Banco de provas do QUADRO das máquinas — o desenho com dados de MENTIRA.
 *
 * O quadro real só existe depois de `supabase/maquinas.sql` + atividades da
 * faixa "maquinas" no banco. Sem esta página, aprovar o layout (e conferir o
 * celular a 320px) dependeria de criar máquina e programação de verdade a cada
 * ajuste. As raias saem de `montarQuadro` e o mover usa `patchDeStatus` — as
 * MESMAS funções da tela: se a régua mudar, a prova muda junto.
 *
 * Mover aqui é local: aplica o patch na fixture e remonta. É de propósito — o
 * gesto é o que está em prova, não a rota.
 */
const AGORA = new Date();
const ha = (min: number) => new Date(AGORA.getTime() - min * 60000).toISOString();

const MAQUINAS: LinhaMaquinaQuadro[] = [
  { id: "p1", nome: "Laser P1", porte: "P", materiais: "Borracha / Acrílico", parada_motivo: null },
  { id: "p2", nome: "Laser P2", porte: "P", materiais: "Borracha / Acrílico", parada_motivo: null },
  { id: "p3", nome: "Laser P3", porte: "P", materiais: "Borracha / Acrílico", parada_motivo: null },
  { id: "m1", nome: "Laser M1", porte: "M", materiais: "PS / Papel cartão", parada_motivo: null },
  { id: "g1", nome: "Laser G1", porte: "G", materiais: "Chapas MDF", parada_motivo: "Correia trocada — volta 15h30" },
  { id: "g2", nome: "Laser G2", porte: "G", materiais: "Chapas MDF", parada_motivo: null },
];

const PROGS: LinhaProgQuadro[] = [
  { id: "c1", maquina_id: "p1", referencia: "Pedido #58291", material: "Acrílico 3 mm", minutos_estimados: 270, posicao: 0, status: "executando", iniciada_at: ha(140), concluida_at: null },
  { id: "c2", maquina_id: "p1", referencia: "Pedido #58294", material: "Acrílico 2 mm", minutos_estimados: 105, posicao: 1, status: "fila", iniciada_at: null, concluida_at: null },
  { id: "c3", maquina_id: "p1", referencia: "Pedido #58111", material: "MDF 3 mm", minutos_estimados: 140, posicao: 2, status: "fila", iniciada_at: null, concluida_at: null },
  { id: "c4", maquina_id: "p2", referencia: "Programa CH-204", material: "Borracha", minutos_estimados: 75, posicao: 1, status: "fila", iniciada_at: null, concluida_at: null },
  { id: "c5", maquina_id: "p2", referencia: "Pedido #58180", material: "Acrílico 2 mm", minutos_estimados: 60, posicao: 0, status: "concluida", iniciada_at: ha(300), concluida_at: ha(180) },
  { id: "c6", maquina_id: "p3", referencia: "Programa BR-004", material: "Borracha", minutos_estimados: 90, posicao: 1, status: "executando", iniciada_at: ha(20), concluida_at: null },
  { id: "c7", maquina_id: "p3", referencia: "Pedido #58333", material: "Acrílico 3 mm", minutos_estimados: 55, posicao: 2, status: "fila", iniciada_at: null, concluida_at: null },
  { id: "c8", maquina_id: "g2", referencia: "Chapas do lote 88", material: "MDF 6 mm", minutos_estimados: 320, posicao: 1, status: "executando", iniciada_at: ha(35), concluida_at: null },
  { id: "c9", maquina_id: "g2", referencia: "Programa MD-012", material: "MDF 3 mm", minutos_estimados: 95, posicao: 2, status: "fila", iniciada_at: null, concluida_at: null },
  { id: "c10", maquina_id: "g1", referencia: "Programa MD-009", material: "MDF 6 mm", minutos_estimados: 210, posicao: 1, status: "fila", iniciada_at: null, concluida_at: null },
  { id: "c11", maquina_id: "g2", referencia: "Pedido #58120", material: "MDF 3 mm", minutos_estimados: 80, posicao: 0, status: "concluida", iniciada_at: ha(420), concluida_at: ha(330) },
];

const ATIVIDADES: LinhaAtividadeQuadro[] = [
  { id: "a1", tarefa: "Testar chancela", categoria: "Chancela", para_nome: "Davi", status: "em_andamento", urgente: false, tempo_estimado_min: 25, iniciada_at: ha(20), concluida_at: null, maquina_id: "m1", quadro_posicao: 1 },
  { id: "a2", tarefa: "Limpeza das peças (laterais, travas, cruz)", categoria: "Chancela", para_nome: "Bruno", status: "pendente", urgente: true, tempo_estimado_min: 40, iniciada_at: null, concluida_at: null, maquina_id: "m1", quadro_posicao: 2 },
  { id: "a3", tarefa: "Colar EVA na chapa 3 mm", categoria: "Insumos", para_nome: "Davi", status: "pendente", urgente: false, tempo_estimado_min: 55, iniciada_at: null, concluida_at: null, maquina_id: "g1", quadro_posicao: 1 },
  { id: "a4", tarefa: "Recortar teste", categoria: "Carimbos", para_nome: null, status: "pendente", urgente: false, tempo_estimado_min: 15, iniciada_at: null, concluida_at: null, maquina_id: null, quadro_posicao: 0 },
  { id: "a5", tarefa: "Montar puxadores (fêmea, macho e círculo)", categoria: "Carimbos", para_nome: "João", status: "pendente", urgente: false, tempo_estimado_min: 30, iniciada_at: null, concluida_at: null, maquina_id: null, quadro_posicao: 0 },
  { id: "a6", tarefa: "Pintar chapa 6 mm MDF (2 faces)", categoria: "Insumos", para_nome: "Mikael", status: "concluida", urgente: false, tempo_estimado_min: 70, iniciada_at: ha(260), concluida_at: ha(150), maquina_id: "g2", quadro_posicao: 3 },
  { id: "a7", tarefa: "Etiquetar tintas", categoria: "Envase de tintas", para_nome: "Luiz", status: "em_andamento", urgente: false, tempo_estimado_min: 20, iniciada_at: ha(50), concluida_at: null, maquina_id: "m1", quadro_posicao: 4 },
];

export function ProvaQuadro() {
  const [progs, setProgs] = useState(PROGS);
  const [atvs, setAtvs] = useState(ATIVIDADES);
  const quadro = montarQuadro(MAQUINAS, progs, atvs, AGORA);

  function mover(chave: string, tipo: "programacao" | "atividade", id: string, de: Destino, para: Destino) {
    const trocaMaquina = de.maquinaId !== para.maquinaId;
    const destino = para.maquinaId === SEM_MAQUINA ? null : para.maquinaId;
    const aplicar = <T extends { id: string; status: string | null; iniciada_at: string | null }>(l: T[], extra: (r: T) => Partial<T>) =>
      l.map((r) => {
        if (r.id !== id) return r;
        const t = patchDeStatus(tipo, { status: r.status, iniciada_at: r.iniciada_at }, para.status);
        if (!t.ok) return r;
        return { ...r, ...(t.patch as Partial<T>), ...(trocaMaquina ? extra(r) : {}) };
      });
    if (tipo === "programacao") {
      if (trocaMaquina && !destino) return;
      setProgs((l) => aplicar(l, () => ({ maquina_id: destino as string, posicao: 99 })));
    } else {
      setAtvs((l) => aplicar(l, () => ({ maquina_id: destino, quadro_posicao: destino ? 99 : 0 })));
    }
    void chave;
  }

  return (
    <main className="tf-scope" style={{ padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Quadro das máquinas</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-dim)" }}>
        Banco de provas — dados de mentira, mover é local.
      </p>
      <QuadroVisual
        quadro={quadro} moveAtividade movendo={null}
        onMover={(cartao, de, para) => mover(cartao.chave, cartao.tipo, cartao.id, de, para)}
      />
    </main>
  );
}
