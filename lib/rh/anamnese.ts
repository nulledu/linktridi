// ── Os campos da ficha anamnésica ────────────────────────────────────────────
//
// O catálogo mora no CÓDIGO e o conteúdo em `rh_anamnese.dados` (jsonb). É o que
// atende ao pedido de "permitir futuramente incluir campos específicos conforme
// as necessidades da empresa" sem que cada campo novo custe um arquivo de SQL,
// um deploy de banco e uma janela de migração: acrescentar uma linha a esta
// lista já faz o campo existir na tela e ser gravado.
//
// A troca é consciente: `jsonb` não valida nada, então quem valida é este
// arquivo — na leitura (`valorDoCampo`) e na escrita (a rota usa `CAMPOS` para
// descartar chave que não está aqui). Sem isso qualquer corpo de requisição
// viraria coluna.
//
// Nada aqui é diagnóstico nem vira regra de negócio: é o que a pessoa declarou,
// para quem tem a chave `rh:anamnese` ler. Nenhuma outra tela do sistema
// consulta este arquivo.

export type TipoCampoAnamnese = "texto" | "longo" | "escolha" | "sim_nao";

export interface CampoAnamnese {
  chave: string;
  rotulo: string;
  tipo: TipoCampoAnamnese;
  /** Uma linha explicando o que se espera — aparece sob o campo. */
  dica?: string;
  /** Só para `escolha`. A primeira opção é sempre "não informado" (string vazia). */
  opcoes?: string[];
  /** Agrupa os campos em blocos na tela. */
  grupo: string;
}

export const GRUPOS_ANAMNESE = ["Saúde geral", "Histórico", "Hábitos", "Trabalho"] as const;

export const CAMPOS_ANAMNESE: CampoAnamnese[] = [
  // Saúde geral
  { chave: "tipo_sanguineo", rotulo: "Tipo sanguíneo", tipo: "escolha", grupo: "Saúde geral",
    opcoes: ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"] },
  { chave: "alergias", rotulo: "Alergias", tipo: "longo", grupo: "Saúde geral",
    dica: "Medicamentos, alimentos, materiais. Escreva “nenhuma” se for o caso." },
  { chave: "medicamentos", rotulo: "Medicamentos de uso contínuo", tipo: "longo", grupo: "Saúde geral" },
  { chave: "condicoes", rotulo: "Condições de saúde", tipo: "longo", grupo: "Saúde geral",
    dica: "Diabetes, hipertensão, asma, e afins." },
  { chave: "plano_saude", rotulo: "Plano de saúde", tipo: "texto", grupo: "Saúde geral" },

  // Histórico
  { chave: "cirurgias", rotulo: "Cirurgias anteriores", tipo: "longo", grupo: "Histórico" },
  { chave: "internacoes", rotulo: "Internações", tipo: "longo", grupo: "Histórico" },
  { chave: "historico_familiar", rotulo: "Histórico familiar relevante", tipo: "longo", grupo: "Histórico" },

  // Hábitos
  { chave: "fumante", rotulo: "Fumante", tipo: "escolha", grupo: "Hábitos",
    opcoes: ["Não", "Sim", "Ex-fumante"] },
  { chave: "bebida", rotulo: "Consumo de álcool", tipo: "escolha", grupo: "Hábitos",
    opcoes: ["Não", "Socialmente", "Frequente"] },
  { chave: "atividade_fisica", rotulo: "Pratica atividade física", tipo: "sim_nao", grupo: "Hábitos" },

  // Trabalho
  { chave: "restricoes", rotulo: "Restrições para o trabalho", tipo: "longo", grupo: "Trabalho",
    dica: "Esforço, altura, ruído, postura — o que a pessoa não pode fazer." },
  { chave: "acidentes", rotulo: "Acidentes de trabalho anteriores", tipo: "longo", grupo: "Trabalho" },
  { chave: "observacoes", rotulo: "Observações", tipo: "longo", grupo: "Trabalho" },
];

export const CAMPO_POR_CHAVE: Record<string, CampoAnamnese> =
  Object.fromEntries(CAMPOS_ANAMNESE.map((c) => [c.chave, c]));

/**
 * Lê um campo do jsonb com o tipo certo.
 *
 * O banco não garante forma nenhuma (é `jsonb`), então tudo que vem de lá passa
 * por aqui: número virou string, `true` virou `"sim"`, chave que já não existe
 * mais no catálogo some. Sem este funil, um registro antigo derrubaria a tela.
 */
export function valorDoCampo(dados: Record<string, unknown> | null | undefined, chave: string): string {
  const v = dados?.[chave];
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "sim" : "nao";
  if (typeof v === "number") return String(v);
  return typeof v === "string" ? v : "";
}

/**
 * O que vai ser GRAVADO: só as chaves do catálogo, só como texto, sem vazio.
 *
 * Descartar a chave desconhecida é o que impede o corpo da requisição de virar
 * coluna: sem isto, um POST com `{"__proto__": …}` ou com mil campos inventados
 * entraria inteiro no jsonb.
 */
export function limparDados(entrada: unknown): Record<string, string> {
  if (!entrada || typeof entrada !== "object") return {};
  const bruto = entrada as Record<string, unknown>;
  const limpo: Record<string, string> = {};
  for (const campo of CAMPOS_ANAMNESE) {
    const v = bruto[campo.chave];
    if (typeof v !== "string") continue;
    const texto = v.trim().slice(0, 4000);   // teto: é ficha, não prontuário
    if (texto) limpo[campo.chave] = texto;
  }
  return limpo;
}

/** Quantos campos a ficha tem preenchidos — é o que a tela mostra fechada. */
export function quantosPreenchidos(dados: Record<string, unknown> | null | undefined): number {
  if (!dados) return 0;
  return CAMPOS_ANAMNESE.filter((c) => valorDoCampo(dados, c.chave) !== "").length;
}
