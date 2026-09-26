import type { TipoDeMarca } from "./anexos";
import type { PoderesFinanceiro } from "./gate";

/**
 * Mantém a permissão da imagem igual à permissão da tela que oferece a ação.
 * Conta é o único tipo com dois donos legítimos: a ficha operacional usa
 * `contas`, e a galeria central de marcas usa `config`.
 */
export function podeEditarMarca(tipo: TipoDeMarca, poderes: PoderesFinanceiro): boolean {
  switch (tipo) {
    case "empresa": return poderes.config;
    case "conta": return poderes.contas || poderes.config;
    case "fornecedor":
    case "contato":
    case "recorrencia": return poderes.cadastros;
    case "colaborador": return poderes.folha;
    case "patrimonio": return poderes.patrimonio;
  }
}
