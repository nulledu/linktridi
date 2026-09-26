"use client";

// Dados fixos, suficientes pra tela ter conteúdo em todos os blocos: pessoas em
// setores diferentes, metas de equipe (mais de 5, pra exercitar o "Ver todas"),
// atividades concluídas/em andamento/pool/atrasadas.

import { useEffect, useState } from "react";
import type { Atividade, Colaborador } from "@/lib/atividades-catalog";
import type { MetaProgresso } from "@/lib/metas";
import { ProdutividadeMetas } from "../(plataforma)/atividades/ProdutividadeMetas";

const agora = Date.now();
const iso = (msAtras: number) => new Date(agora - msAtras).toISOString();
const min = (n: number) => n * 60_000;

const COLABS: Colaborador[] = [
  { id: "u1", nome: "Ana Ribeiro", setor: "Produção", departamento: "Produção" },
  { id: "u2", nome: "Bruno Tavares", setor: "Produção", departamento: "Produção" },
  { id: "u3", nome: "Carla Mendes", setor: "Logística", departamento: "Logística" },
  { id: "u4", nome: "Diego Alencar", setor: "Comercial", departamento: "Comercial" },
  { id: "u5", nome: "Elisa Prado", setor: "Marketing", departamento: "Marketing" },
];

const base = {
  detalhe: null, por_id: "gestor", por_nome: "Gestão", prazo: null,
  produto_id: null, produto_nome: null, estoque_lancado: false, foto_url: null,
};

const ativ = (o: Partial<Atividade> & { id: string; status: Atividade["status"] }): Atividade => ({
  ...base, categoria: "Almofadas", tarefa: "Montar estrutura da almofada 11",
  para_id: null, para_nome: null, quantidade_alvo: 10, quantidade_feita: 0,
  tempo_estimado_min: 40, iniciada_at: null, created_at: iso(min(600)), concluida_at: null,
  ...o,
} as Atividade);

const ATIVIDADES: Atividade[] = [
  ativ({ id: "a1", status: "concluida", para_id: "u1", para_nome: "Ana Ribeiro", quantidade_feita: 12, iniciada_at: iso(min(180)), concluida_at: iso(min(145)) }),
  ativ({ id: "a2", status: "concluida", para_id: "u1", para_nome: "Ana Ribeiro", quantidade_feita: 8, iniciada_at: iso(min(140)), concluida_at: iso(min(96)) }),
  ativ({ id: "a3", status: "concluida", para_id: "u2", para_nome: "Bruno Tavares", quantidade_feita: 15, iniciada_at: iso(min(200)), concluida_at: iso(min(122)) }),
  ativ({ id: "a4", status: "concluida", para_id: "u3", para_nome: "Carla Mendes", categoria: "Expedição", tarefa: "Separar pedidos do dia", quantidade_feita: 31, iniciada_at: iso(min(300)), concluida_at: iso(min(268)) }),
  ativ({ id: "a5", status: "em_andamento", para_id: "u2", para_nome: "Bruno Tavares", iniciada_at: iso(min(95)) }),
  ativ({ id: "a6", status: "em_andamento", para_id: "u4", para_nome: "Diego Alencar", categoria: "Chancela", tarefa: "Testar chancela", iniciada_at: iso(min(30)) }),
  ativ({ id: "a7", status: "pendente", pool: true, setor: "Produção", categoria: "Carimbos", tarefa: "Testar carimbo" }),
  ativ({ id: "a8", status: "pendente", pool: true, setor: "Produção", urgente: true, categoria: "Puxador", tarefa: "Encaixar parte A na parte B" }),
  ativ({ id: "a9", status: "pendente", para_id: "u5", para_nome: "Elisa Prado", categoria: "Rede social", tarefa: "Colar MDF 3 mm no MDF 6 mm (gabarito)" }),
  ativ({ id: "a10", status: "em_andamento", para_id: "u1", para_nome: "Ana Ribeiro", impedida: true, motivo_impedimento: "Acabou a cola bonder", iniciada_at: iso(min(70)) }),
];

const meta = (id: string, titulo: string, setor: string, alvo: number, atual: number): MetaProgresso => ({
  id, titulo, metrica: "pecas", periodicidade: "mensal", alvo, setor,
  colaborador_id: null, colaborador_nome: null, ativo: true, created_at: iso(min(9999)), por_nome: "Gestão",
  atual, pct: Math.round((atual / alvo) * 100), bateu: atual >= alvo, janelaLabel: "este mês",
} as MetaProgresso);

const METAS: MetaProgresso[] = [
  meta("m1", "Meta de Envios Diária", "Logística", 70, 23),
  meta("m2", "Meta de Envios Mensal", "Logística", 1000, 166),
  meta("m3", "Meta da Produção", "Produção", 1000, 115),
  meta("m4", "Almofadas montadas", "Produção", 400, 412),
  meta("m5", "Chancelas testadas", "Produção", 120, 88),
  meta("m6", "Carimbos finalizados", "Produção", 200, 41),
  meta("m7", "Publicações no mês", "Marketing", 30, 12),
];

export function ProvaProdutividade() {
  // Os dados falsos são carimbados com `Date.now()`, então o HTML do servidor e
  // o do cliente nascem com minutos diferentes e o React acusa hidratação. É
  // artefato DO BANCO DE PROVAS, não da tela — aqui só montamos no cliente.
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  if (!montado) return null;

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 14px 60px" }}>
      <ProdutividadeMetas
        colaboradores={COLABS} atividades={ATIVIDADES} produtos={[{ nome: "Almofada 11" }]}
        metas={METAS} erpUsers={COLABS.map((c) => ({ id: c.id, nome: c.nome }))} podeGerir
      />
    </main>
  );
}
