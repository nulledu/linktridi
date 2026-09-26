// Catálogo de atividades (modelado no PDF "ATIVIDADES DIÁRIAS – PRODUÇÃO TRIDI").
// Client-safe: sem dependências de servidor, pode ser importado no browser.

export interface AtividadeTarefa { categoria: string; nome: string }

export const CATALOGO: AtividadeTarefa[] = [
  // Estrutura por TAMANHO: os componentes do estoque são por medida (acolchoado,
  // fundo, lateral costa/frente/rolamento em 6, 11, 16 e 22). Uma ordem única
  // "montar estrutura" não diria qual peça consumir nem permitiria contar a
  // produção por tamanho.
  ...["6", "11", "16", "22"].map((t) => ({ categoria: "Almofadas", nome: `Montar estrutura da almofada ${t}` })),
  ...["Montar carcaça (colar tiras e encaixar tampa)", "Passar cola silicone no contorno interno da almofada", "Passar cola branca em toda superfície da base", "Colar o EVA na base", "Passar cola silicone em toda superfície do EVA", "Colar o feltro no EVA"].map((nome) => ({ categoria: "Almofadas", nome })),
  ...["Limpeza das peças (laterais, travas, cruz, pinça, reforços, bolinha, alavancas)", "Carcaça: colar as três travas nas laterais com cola bonder", "Alavanca: colar as 4 alavancas com cola (pino central)", "Alavanca: colar a alavanca sem cola", "Clichê: colar reforço superior na pinça superior", "Clichê: colar reforço inferior na pinça inferior", "Clichê: colar cruz na pinça inferior", "Clichê: encaixar elevador no furo da pinça inferior", "Clichê: encaixar mola no furo da pinça inferior", "Clichê: colar pinça superior com cola bonder na cruz", "Clichê: apertar parafuso pequeno (pinças)", "Clichê: colar acrílicos inferior e superior na pinça", "Juntando: travar a alavanca na carcaça com parafuso grande", "Juntando: colar bolinha esquerda e direita", "Juntando: colar os PS's internos e externos", "Juntando: encaixar o clichê completo na carcaça", "Testar chancela"].map((nome) => ({ categoria: "Chancela", nome })),
  ...["Lavar as borrachas com detergente e água", "Retirar a dupla face do MDF de 3 mm", "Colar as borrachas no MDF de 3 mm", "Colar MDF de 3 mm no MDF de 6 mm com cola bonder", "Colar puxador no MDF de 6 mm com cola bonder", "Montar puxadores (fêmea, macho e círculo)", "Testar carimbo", "Recortar teste", "Colar teste no carimbo"].map((nome) => ({ categoria: "Carimbos", nome })),
  { categoria: "Puxador", nome: "Encaixar parte A na parte B" },
  { categoria: "Puxador", nome: "Colar a bolinha na peça AB (gabarito)" },
  { categoria: "Coração", nome: "Colar o quadradinho no coração (gabarito)" },
  { categoria: "Rede social", nome: "Colar MDF 3 mm no MDF 6 mm (gabarito)" },
  ...["Tintas papel coloridas 30 ml (máq. automática)", "Tinta papel preta 30 ml (máq. automática)", "Tinta papel preta 60 ml (máq. automática)", "Tinta isopor preta 30 ml (máq. manual)", "Tintas isopor coloridas 30 ml (máq. manual)", "Tinta plástico preta 50 ml (seringa de ferro)", "Tintas plástico coloridas 50 ml (seringa de ferro)", "Fixador 10 ml (seringa)", "Etiquetar tintas",
    // Nomes que a POOL de Tintas gera (lib/producao-receita). Precisam existir
    // aqui também: se o seletor manual e a pool usam nomes diferentes pra mesma
    // tarefa, a produtividade por tarefa conta cada um separado.
    "Envasar tinta plástica (padrão preta)", "Envasar tinta de papel (padrão preta)", "Envasar tinta de isopor (padrão preta)"]
    .map((nome) => ({ categoria: "Envase de tintas", nome })),
  // "Insumos" = o que era "Preparação de chapas". Renomeado e reescrito com o
  // vocabulário atual da produção (a força da dupla face — fraca × forte em
  // tiras — muda a tarefa, então entra no nome). Manter as duas categorias
  // deixaria dois nomes pra mesma tarefa no seletor e racharia a contagem de
  // produtividade por tarefa.
  ...["Pintar chapa 3 mm MDF (2 faces)", "Pintar chapa 6 mm MDF (2 faces)", "Pintar chapa 3 mm MDF (1 face)",
    "Colar dupla face FRACA na chapa 3 mm (MDF)",
    "Colar EVA na chapa 3 mm (já com dupla face)",
    "Preparar folha de EVA com feltro (cola silicone)",
    "Preparar chapa 6 mm LAMINADA com dupla face forte em tiras (1 lado)",
    "Colar dupla face forte em tiras no lado fosco do PS",
    "Aplicar cola transferível no filete de laminado",
    "Colar feltro na chapa 3 mm (cola PVA)"].map((nome) => ({ categoria: "Insumos", nome })),
  // Manutenção de máquina: o horário faz parte da ordem (a mesma troca às 7:00 e
  // às 9:30 são duas execuções distintas, cada uma com seu responsável).
  // ATENÇÃO: isto é só o catálogo — o sistema NÃO agenda sozinho; alguém cria a
  // ordem do dia (ver nota de recorrência no chat).
  ...["Trocar fitas do bico (máquinas MDF) — 07:00", "Trocar fitas do bico (máquinas MDF) — 09:30",
    "Trocar fitas do bico (máquinas MDF) — 12:30", "Trocar fitas do bico (máquinas MDF) — 15:00",
    "Limpar lentes (máquinas MDF + borracha) — 07:00", "Limpar lentes (máquinas MDF + borracha) — 12:30"]
    .map((nome) => ({ categoria: "Manutenção", nome })),
  ...["Recortar manual (chancela e carimbos)", "Carimbar e montar caixas (P + M)", "Enrolar etiquetas (P + M, dourada/prata)", "Passar argola no polvo", "Recortar e inserir cheirinho no polvo", "Encaixar olho no polvo", "Kit brinde (polvo + coração + manual)", "Montar decorativos"].map((nome) => ({ categoria: "Atividades complementares", nome })),
];

export const CATEGORIAS = [...new Set(CATALOGO.map((c) => c.categoria))];

// ── Tipos e cálculos puros (client-safe) ──
// Os três estados do trabalho MAIS os da cadeia de produção, que o banco já
// grava: `aguardando_material` (não dá pra fazer ainda) e `cancelada` (saiu da
// fila — cancelada pelo gestor ou recusada por quem ia fazer). As listas de
// trabalho cortam os dois (lib/atividades.ts › foraDaCadeia); quem os mostra é
// o Histórico e o painel de Produção.
export type AtividadeStatus = "pendente" | "em_andamento" | "concluida" | "aguardando_material" | "cancelada";
/** Os três que o quadro de trabalho move. */
export const STATUS_DE_TRABALHO = ["pendente", "em_andamento", "concluida"] as const;
export type StatusDeTrabalho = (typeof STATUS_DE_TRABALHO)[number];

export interface Atividade {
  id: string;
  categoria: string;
  tarefa: string;
  detalhe: string | null;
  para_id: string | null;            // null = ordem no pool (sem dono ainda)
  para_nome: string | null;
  por_id: string;
  por_nome: string;
  status: AtividadeStatus;
  setor?: string | null;             // setor do pool
  pool?: boolean;                    // true = ordem de pool (cai pro funcionário livre)
  urgente?: boolean;                 // fura a fila + chama mais forte
  ordem?: number | null;             // fase (menor = mais cedo)
  lote?: string | null;              // agrupa a produção gerada de uma vez
  claimed_at?: string | null;
  aceita_at?: string | null;         // toque em "Aceitar" no tablet (atividades_ordens_v2.sql)
  prazo: string | null;
  quantidade_alvo: number;
  quantidade_feita: number;
  tempo_estimado_min: number | null;
  iniciada_at: string | null;
  produto_id: number | null;        // produto do estoque que esta atividade produz
  produto_nome: string | null;
  estoque_lancado: boolean;          // já contabilizou no estoque ao concluir?
  created_at: string;
  concluida_at: string | null;
  foto_url: string | null;           // foto que comprova o que foi produzido
  impedida?: boolean;                // colaborador marcou "não consigo fazer"
  motivo_impedimento?: string | null;
  prioridade?: Prioridade | null;    // null/ausente = Média (ou Alta, se urgente)
}

// ── Prioridade (11/09/2026) ─────────────────────────────────────────────────
// Coluna nova (supabase/atividades_prioridade.sql). Antes dela só existia o
// `urgente` do tablet — por isso ele conta como Alta quando a prioridade não
// foi escolhida.
export type Prioridade = "alta" | "media" | "baixa";
export const PRIORIDADES: readonly Prioridade[] = ["alta", "media", "baixa"];
export const ROTULO_PRIORIDADE: Record<Prioridade, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
export const ehPrioridade = (v: unknown): v is Prioridade => v === "alta" || v === "media" || v === "baixa";
export function prioridadeDe(a: Pick<Atividade, "prioridade" | "urgente">): Prioridade {
  if (ehPrioridade(a.prioridade)) return a.prioridade;
  return a.urgente ? "alta" : "media";
}

export interface Colaborador {
  id: string; nome: string; setor: string | null; departamento?: string | null; fotoUrl?: string | null;
  /** Máquinas/Preparo/Chancela/Carimbo/Ambos — decide a faixa que a pessoa pega (lib/atividade-faixa.ts). */
  especialidade?: string | null;
}

export interface Produtividade {
  para_id: string; nome: string;
  total: number; concluidas: number; emAndamento: number; pendentes: number;
  feito: number; alvo: number;
  tempoEstimadoMin: number; tempoRealMin: number;
}

export function resumoProdutividade(lista: Atividade[]): Produtividade[] {
  const map = new Map<string, Produtividade>();
  for (const a of lista) {
    if (!a.para_id) continue;   // ordem do pool sem dono não entra na produtividade por pessoa
    let p = map.get(a.para_id);
    if (!p) { p = { para_id: a.para_id, nome: a.para_nome ?? "—", total: 0, concluidas: 0, emAndamento: 0, pendentes: 0, feito: 0, alvo: 0, tempoEstimadoMin: 0, tempoRealMin: 0 }; map.set(a.para_id, p); }
    p.total++;
    if (a.status === "concluida") p.concluidas++;
    else if (a.status === "em_andamento") p.emAndamento++;
    else p.pendentes++;
    p.feito += a.quantidade_feita || 0;
    p.alvo += a.quantidade_alvo || 0;
    if (a.status === "concluida") {
      p.tempoEstimadoMin += a.tempo_estimado_min || 0;
      if (a.iniciada_at && a.concluida_at) {
        const dt = (Date.parse(a.concluida_at) - Date.parse(a.iniciada_at)) / 60000;
        if (dt > 0) p.tempoRealMin += Math.round(dt);
      }
    }
  }
  return [...map.values()].sort((a, b) => b.feito - a.feito || b.concluidas - a.concluidas);
}
