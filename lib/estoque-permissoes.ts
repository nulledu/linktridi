import { resolveMyModuleKeys } from "./perfis";
import type { Role } from "./rbac";

// Quem pode MEXER no catálogo do estoque. Morava dentro de
// app/api/estoque-itens/route.ts, mas a triagem em lote (rota irmã) precisa
// exatamente do mesmo portão — e duas cópias de uma regra de permissão viram
// duas regras assim que alguém ajusta uma delas.

export const PAPEIS_DO_ESTOQUE = ["admin", "estoquista", "gerente_producao"];

export interface QuemSou {
  id: string;
  role: string;
  username?: string | null;
}

/**
 * Papel de sempre OU a sub-permissão "Ver catálogo / itens" da grade — é ela
 * que diz "esta pessoa trabalha no estoque". Sem a segunda metade, a área
 * liberada abria a tela e todo botão de salvar voltava 403.
 */
export async function podeGerirEstoque(me: QuemSou): Promise<boolean> {
  if (PAPEIS_DO_ESTOQUE.includes(me.role)) return true;
  const keys = await resolveMyModuleKeys({ id: me.id, role: me.role as Role, username: me.username });
  return keys.includes("estoque:itens");
}

/**
 * Uma volta só no resolvedor, respondendo as duas perguntas. `podeGerirEstoque`
 * continua existindo pro que NÃO foi separado (conferir, imprimir etiqueta,
 * produção do dia) — mas quem precisa das duas respostas não deve chamar dois
 * helpers e pagar duas resoluções.
 */
async function poderes(me: QuemSou): Promise<{ cadastrar: boolean; ajustar: boolean; bipar: boolean }> {
  if (PAPEIS_DO_ESTOQUE.includes(me.role)) return { cadastrar: true, ajustar: true, bipar: true };
  const keys = await resolveMyModuleKeys({ id: me.id, role: me.role as Role, username: me.username });
  return {
    cadastrar: keys.includes("estoque:cadastrar"),
    ajustar: keys.includes("estoque:ajustar"),
    bipar: keys.includes("estoque:bipar"),
  };
}

export async function poderesDoEstoque(me: QuemSou) { return poderes(me); }

/**
 * Quem pode mexer no CADASTRO: criar item, editar, apagar, importar planilha,
 * classificar em lote e escrever ficha técnica. É o "o QUE existe no catálogo".
 *
 * Repare que NÃO basta `estoque:itens` — ele voltou a ser só "ver". Quem tinha
 * a área ligada antes desta separação não herda isto: a sub é `sensivel`, fica
 * fora do back-compat de `chavesDasAreas()` e o admin liga de propósito. Os
 * papéis do galpão continuam atravessando, então ninguém para no dia seguinte.
 */
export async function podeCadastrarEstoque(me: QuemSou): Promise<boolean> {
  return (await poderes(me)).cadastrar;
}

/**
 * Quem pode mexer na QUANTIDADE: ajuste manual de saldo, gerar as etiquetas de
 * unidade (cada etiqueta é uma unidade a mais) e disparar a reposição. É o
 * "QUANTO tem".
 *
 * Não confundir com `estoque:bipar`, que é a saída operacional lendo o código.
 * Bipar tira o que já existe; ajustar cria e corrige o número.
 */
export async function podeAjustarEstoque(me: QuemSou): Promise<boolean> {
  return (await poderes(me)).ajustar;
}

/**
 * Quem pode TIRAR do estoque lendo o código — a saída operacional do galpão.
 *
 * `estoque:bipar` OU `estoque:ajustar`, e a primeira é a que resolve um
 * conflito real: a saída por bipagem existia em duas formas (baixar a etiqueta
 * de unidade e diminuir o saldo do produto), cada uma atrás de uma chave
 * diferente. Quem recebeu só "bipar" — o operador do galpão, exatamente a
 * pessoa para quem a tela foi feita — conseguia baixar etiqueta e levava 403 ao
 * bipar a etiqueta de produto, que é o caso de 96% do catálogo.
 *
 * A direção contrária continua fechada: ENTRAR com mercadoria segue exigindo
 * `ajustar`. Tirar o que já está lá é operação; somar é correção de número.
 */
export async function podeBiparSaida(me: QuemSou): Promise<boolean> {
  const p = await poderes(me);
  return p.bipar || p.ajustar;
}

/**
 * Fornecedor saiu daqui.
 *
 * Ele deixou de ter cadastro próprio no estoque: agora é o do Financeiro, e a
 * chave passou a ser `financeiro:cadastros`. A função mora em
 * `lib/estoque-fornecedor-fonte.ts`, junto do resto da fronteira com o módulo
 * restrito — deixá-la aqui, no meio das chaves do galpão, convidaria a próxima
 * pessoa a "consertar" acrescentando `estoque:fornecedores` de volta e reabrir
 * a porta lateral para dentro da área trancada.
 */
export { podeGerirFornecedores } from "./estoque-fornecedor-fonte";
