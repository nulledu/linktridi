import { normalizarPapeis, type PapelContato } from "@/lib/financeiro/partes";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export class ErroSalvarParte extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ErroSalvarParte";
  }
}

export interface SalvarParteArgs {
  entrada: Record<string, unknown>;
  userId: string;
}

export interface ParteSalva {
  contatoId: string;
  fornecedorId: string | null;
}

const texto = (valor: unknown) => typeof valor === "string" ? valor.trim() : "";
const CNPJ = /^\d{14}$/;

function validarDias(valor: unknown, campo: string) {
  if (valor === undefined || valor === null || valor === "") return;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 0 || numero > 365) {
    throw new ErroSalvarParte(`${campo} deve ser um número inteiro entre 0 e 365.`);
  }
}

function validarFornecedor(valor: unknown) {
  if (valor === undefined) return;
  if (!valor || Array.isArray(valor) || typeof valor !== "object") {
    throw new ErroSalvarParte("Os dados comerciais do fornecedor são inválidos.");
  }
  const fornecedor = valor as Record<string, unknown>;
  validarDias(fornecedor.prazo_dias, "Prazo de pagamento");
  validarDias(fornecedor.prazo_envio_dias, "Prazo de envio");
  if (fornecedor.uf !== undefined && fornecedor.uf !== null && fornecedor.uf !== ""
    && !/^[A-Za-z]{2}$/.test(texto(fornecedor.uf))) {
    throw new ErroSalvarParte("UF do fornecedor inválida.");
  }
  for (const campo of ["aceita_boleto", "ativo"] as const) {
    if (fornecedor[campo] !== undefined && typeof fornecedor[campo] !== "boolean") {
      throw new ErroSalvarParte(`O campo comercial ${campo} deve ser verdadeiro ou falso.`);
    }
  }
}

/**
 * Confere o que a UI pode enviar antes de atravessar a fronteira transacional.
 * A RPC ainda repete as invariáveis: esta validação só devolve erros de formulário
 * úteis, sem transformar dados inválidos em um papel silenciosamente diferente.
 */
function prepararEntrada(entrada: Record<string, unknown>): Record<string, unknown> {
  const nome = texto(entrada.nome);
  if (!nome) throw new ErroSalvarParte("Escreva o nome do cadastro.");

  const natureza = entrada.natureza ?? "pessoa";
  if (natureza !== "pessoa" && natureza !== "empresa") {
    throw new ErroSalvarParte("Natureza deve ser pessoa ou empresa.");
  }

  const recebidos = entrada.papeis ?? ["contato"];
  const papeis = normalizarPapeis(recebidos);
  if (!Array.isArray(recebidos) || recebidos.length !== papeis.length) {
    throw new ErroSalvarParte("Informe apenas papéis válidos, sem repetição.");
  }

  validarFornecedor(entrada.fornecedor);
  if (entrada.fornecedor !== undefined && !papeis.includes("fornecedor")) {
    throw new ErroSalvarParte("Os dados comerciais exigem o papel fornecedor.");
  }

  const cnpjRecebido = entrada.cnpj ?? (entrada.fornecedor as Record<string, unknown> | undefined)?.cnpj;
  const cnpj = texto(cnpjRecebido).replace(/\D/g, "");
  if (cnpjRecebido !== undefined && texto(cnpjRecebido) && !CNPJ.test(cnpj)) {
    throw new ErroSalvarParte("CNPJ deve conter 14 dígitos.");
  }

  if (entrada.ativo !== undefined && typeof entrada.ativo !== "boolean") {
    throw new ErroSalvarParte("O campo ativo deve ser verdadeiro ou falso.");
  }

  return { ...entrada, nome, natureza, papeis: papeis as PapelContato[], ...(cnpj ? { cnpj } : {}) };
}

/**
 * O telefone singular e a lista NÃO podem divergir.
 *
 * `fin_contatos` tem `telefone` (legado, uma linha) e `telefones` (a lista que
 * a TELA mostra). A função de gravação escreve a lista só quando o pedido traz
 * `telefones` — e a tela de Fornecedores não traz: ela manda `contato_fone`,
 * porque é o campo da extensão comercial.
 *
 * O resultado, medido em produção: editar o telefone pelo Fornecedores mudava
 * `telefone` e deixava `telefones` com o número ANTIGO. Como a ficha e o
 * formulário leem a lista, a tela mostrava o número velho depois de salvar — é
 * o "não está salvando" que não é escrita nenhuma, é divergência entre duas
 * colunas que deveriam contar a mesma história.
 *
 * A lista é reconstruída com o número novo na FRENTE e os outros preservados: o
 * contato pode ter o WhatsApp pessoal e o da empresa, e trocar um não pode
 * apagar o outro. Sem duplicar, e sem mexer se o pedido já trouxe a lista —
 * quem manda a lista sabe o que quer.
 */
/** Os pares singular/lista de `fin_contatos`, e de onde o singular pode vir. */
const PARES = [
  { lista: "telefones", singular: "telefone", naExtensao: "contato_fone" },
  { lista: "categorias", singular: "categoria", naExtensao: "categoria" },
] as const;

async function alinharListas(
  entrada: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fornecedor = entrada.fornecedor as Record<string, unknown> | undefined;

  // O que precisa ser alinhado: veio o singular e NÃO veio a lista.
  const pendentes = PARES
    .filter((par) => entrada[par.lista] === undefined)
    .map((par) => ({ par, novo: texto(entrada[par.singular] ?? fornecedor?.[par.naExtensao] ?? "") }))
    .filter((x) => !!x.novo);
  if (!pendentes.length) return entrada;

  const id = texto(entrada.id);
  // Cadastro novo: não há lista anterior, então a lista É o valor que chegou.
  if (!id) {
    return pendentes.reduce((acc, x) => ({ ...acc, [x.par.lista]: [x.novo] }), { ...entrada });
  }

  try {
    const { data } = await createSupabaseAdminClient()
      .from("fin_contatos")
      .select(PARES.map((p) => p.lista).join(","))
      .eq("id", id)
      .maybeSingle();
    const atual = (data ?? {}) as Record<string, string[] | null>;
    return pendentes.reduce((acc, { par, novo }) => {
      const antigos = (atual[par.lista] ?? []).map((t) => texto(t)).filter(Boolean);
      return { ...acc, [par.lista]: [novo, ...antigos.filter((t) => t !== novo)] };
    }, { ...entrada });
  } catch {
    // Sem conseguir ler, alinhar às cegas apagaria os outros valores. Melhor
    // deixar como estava: a divergência é chata, perder um telefone é pior.
    return entrada;
  }
}

export async function salvarParte({ entrada, userId }: SalvarParteArgs): Promise<ParteSalva> {
  const pEntrada = prepararEntrada(await alinharListas(entrada));
  const { data, error } = await createSupabaseAdminClient().rpc("fin_salvar_parte", {
    p_entrada: pEntrada,
    p_user_id: userId,
  }) as {
    data: { contato_id?: unknown; fornecedor_id?: unknown } | null;
    error: { code?: string; message?: string } | null;
  };

  if (error?.code === "23505") {
    throw new ErroSalvarParte("Já existe um cadastro com este CNPJ nesta empresa.", 409);
  }
  if (error) throw new ErroSalvarParte(error.message || "Não deu para salvar.");

  const contatoId = typeof data?.contato_id === "string" ? data.contato_id : null;
  const fornecedorId = typeof data?.fornecedor_id === "string" ? data.fornecedor_id : null;
  if (!contatoId) throw new ErroSalvarParte("A transação não devolveu o contato salvo.");

  return { contatoId, fornecedorId };
}
