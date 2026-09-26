// ── Conferência de atividade: DESLIGADA (pedido do dono, 11/09/2026) ─────────
//
// "Quando termina uma atividade não adiciona nada no estoque — tudo é
// conferência e adição no estoque." Atividade concluída não entra no estoque
// por nenhum caminho e não existe mais fila de "a conferir": peça produzida
// entra pelo próprio Estoque, à mão (+/−, ajuste, entrada). A baixa da ficha
// ("desconta"), que só acontecia na aprovação da conferência, fica parada junto
// — decisão do dono: "desliga por enquanto".
//
// As rotas da conferência (web e tablet) respondem "desligada" por esta
// constante. O motor (lib/estoque-conferencia.ts) fica: o histórico, a
// genealogia da peça e as notas antigas ainda leem o que ele gravou. Religar é
// trocar pra `true` e devolver as portas (aba Conferir do Estoque, cartão do
// /operacao, coluna "A conferir" do quadro).
export const CONFERENCIA_DE_ATIVIDADE_LIGADA = false;

/** A fila vazia, no formato que o tablet do estoque já entende (`qcDesligado`). */
export const FILA_DESLIGADA = { atividades: [], qcDesligado: true, travadas: 0 };

/** O código de recusa das rotas de registrar conferência. */
export const ERRO_CONFERENCIA_DESLIGADA = "conferencia_desligada";
