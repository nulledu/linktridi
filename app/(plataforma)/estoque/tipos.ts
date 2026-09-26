// Tipos compartilhados entre a lista (CatalogoClient) e o editor (ItemEditor).
// Moravam dentro do CatalogoClient, então o editor extraído não teria como
// importá-los sem arrastar a lista junto.

export interface Item {
  id: string;
  nome: string;
  hierarquia: string | null;
  produzido: boolean;
  serializado: boolean;
  categoria: string | null;
  imagem_url: string | null;
  unidade: string;
  quantidade: number;
  qtd_minima: number;
  ativo: boolean;
  custo?: number | null;
  custo_em?: string | null;
  sku?: string | null;
  estoque_ideal?: number | null;
  requisitavel?: boolean;
  setor_requisicao?: string | null;
  fornecedor_id?: string | null;
  local_id?: string | null;
  /** A receita da atividade de reposição — ver lib/estoque-receita-de-producao.ts. */
  producao_instrucao?: string | null;
  producao_tempo_min?: number | null;
  producao_lote_de?: number | null;
  producao_tipo?: string | null;
  producao_maquina_id?: string | null;
  largura_mm?: number | null;
  altura_mm?: number | null;
  espessura_mm?: number | null;
  dim_unidade?: string | null;
  cor?: string | null;
  // Eixos antigos — saem nas tasks 8 a 11. Mantidos opcionais só para esta
  // extração não precisar mexer no comportamento ao mesmo tempo em que move.
  tipo?: string;
  classe?: string | null;
  tipo_item?: string | null;
  setor_responsavel?: string | null;
  /** Interruptor por item: abaixo do mínimo, vira atividade sozinho? */
  producao_automatica?: boolean | null;
}

export interface FichaLinha {
  componente_id: string;
  quantidade: number;
  /** Produzir dá BAIXA deste componente no estoque? Opt-in: ausente = não. */
  desconta?: boolean;
  nome?: string;
  hierarquia?: string | null;
}
