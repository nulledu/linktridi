// Tipos do painel de Marketing · Geral, compartilhados entre a rota
// /api/marketing/painel (servidor) e a tela (cliente). Ficam num arquivo à
// parte pra tela não importar nada de servidor.
import type { Criativo } from "@/lib/marketing-criativos-const";

// Só TIPO — `export type` é apagado na compilação, então a tela não arrasta o
// módulo de servidor (que lê o armazém da Meta) pro bundle do navegador.
export type { Desempenho, CriativoDesempenho, TotaisDesempenho } from "@/lib/marketing-desempenho";

export interface PainelMarketing {
  hoje: string;
  producao: {
    total: number; hoje: number; semana: number; mes: number;
    mediaDiaria: number;                 // média no período escolhido
    dias: number;                        // janela do gráfico (7 · 30 · 90)
    ultimo: Criativo | null;
    serie: { dia: string; n: number }[]; // um ponto por dia da janela
  };
  equipe: { editor: string; total: number; mes: number; semana: number }[];
  resultados: {
    hoje: number; semana: number; mes: number;
    hojeAnterior: number; semanaAnterior: number; mesAnterior: number;
    pedidosMes: number;
    serie: { dia: string; valor: number }[];   // faturamento orgânico na janela
    indisponivel: boolean;                     // vendas não carregaram
  };
}
