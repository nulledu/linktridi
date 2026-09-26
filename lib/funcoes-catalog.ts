// Catálogo de funções — SEM dependências de servidor (seguro p/ client).
export const FUNCOES = [
  { key: "designer_arte", label: "Designer — Arte nova", dash: "design" },
  { key: "designer_aprovacao", label: "Designer — Aprovação", dash: "design" },
  { key: "contorno", label: "Contorno / Vetor", dash: "design" },
  { key: "vendedora", label: "Vendedora (Comercial)", dash: "vendas" },
  { key: "marketing", label: "Marketing", dash: "vendas" },
  { key: "logistica", label: "Logística", dash: "logistica" },
  { key: "producao", label: "Produção", dash: "producao" },
] as const;
export type FuncaoKey = (typeof FUNCOES)[number]["key"];
export const FUNCAO_LABEL: Record<string, string> = Object.fromEntries(FUNCOES.map((f) => [f.key, f.label]));

export interface ErpUser { id: string; nome: string; apelido: string | null; foto_url: string | null; setor_id: number | null }
export interface Funcao { erp_user_id: string; nome: string; foto_url: string | null; funcao: string; active: boolean }
