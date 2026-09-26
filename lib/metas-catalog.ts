// Catálogo de métricas e periodicidades para o sistema de Metas. Client-safe.

export type Periodicidade = "diaria" | "semanal" | "mensal";

export const PERIODOS: { key: Periodicidade; label: string }[] = [
  { key: "diaria", label: "Diária" },
  { key: "semanal", label: "Semanal" },
  { key: "mensal", label: "Mensal" },
];

export const PERIODO_LABEL: Record<Periodicidade, string> = {
  diaria: "hoje", semanal: "esta semana", mensal: "este mês",
};

// Fonte para contar a métrica POR pessoa (responsavel_id = usuarios.user_id do ERP).
// dateKind: "iso" (timestamptz) ou "date" (coluna YYYY-MM-DD). valueCol → soma
// a coluna em vez de contar linhas (tabelas já agregadas por dia/pessoa).
export interface IndividualSrc { table: string; dateCol: string; respCol: string; dateKind: "iso" | "date"; valueCol?: string }

// Métricas disponíveis para uma meta. `table`/`col` indicam onde contar no ERP
// (meta de equipe). `individual` indica se dá p/ medir por colaborador.
export interface MetricaDef { key: string; label: string; setor: string; table: string; col: string; individual?: IndividualSrc }

export const METRICAS: MetricaDef[] = [
  { key: "vetores", label: "Vetores feitos", setor: "Design", table: "dash_vetor", col: "data_vetor",
    individual: { table: "dash_vetor", dateCol: "data_vetor", respCol: "responsavel_id", dateKind: "iso" } },
  { key: "contornos", label: "Contornos feitos", setor: "Design", table: "dash_contorno", col: "data_contorno",
    individual: { table: "dash_contorno", dateCol: "data_contorno", respCol: "responsavel_id", dateKind: "iso" } },
  { key: "aprovados", label: "Artes aprovadas", setor: "Design", table: "pedidos", col: "data_aprovado",
    individual: { table: "dash_pedidos_aprovados_por_dia_responsavel", dateCol: "dia", respCol: "responsavel_id", dateKind: "date", valueCol: "quantidade" } },
  { key: "prog_maquina", label: "Programados na máquina", setor: "Produção", table: "pedidos", col: "data_prog_maquina" },
  { key: "producao", label: "Entraram em produção", setor: "Produção", table: "pedidos", col: "data_producao" },
  { key: "fabricados", label: "Fabricados", setor: "Produção", table: "pedidos", col: "data_fabricado" },
  { key: "enviados", label: "Enviados (logística)", setor: "Logística", table: "pedidos", col: "data_envio" },
];

export const metricaByKey = (k: string) => METRICAS.find((m) => m.key === k);
export const METRICAS_INDIVIDUAIS = METRICAS.filter((m) => m.individual);

// Setores disponíveis para escopo de meta de equipe/setor.
export const SETORES = ["Design", "Produção", "Logística", "Comercial", "Marketing", "Geral"];
