export interface CompromissoRelacionado {
  empresa_id: string;
  conta_id?: string | null;
  contato_id: string | null;
  fornecedor_id: string | null;
}

export interface MarcaRelacionada {
  origem: "contato" | "fornecedor" | "conta" | "empresa";
  id: string;
  nome: string;
  logo_url: string | null;
  icone: string | null;
}

/** Dados mínimos que podem atravessar a fronteira servidor → cliente. */
export interface RelacionadoFinanceiro {
  id: string;
  empresa_id: string;
  nome: string;
  natureza: "pessoa" | "empresa";
  fornecedor: { id: string } | null;
  logo_url?: string | null;
  icone?: string | null;
  /**
   * O que o cadastro já sabe e o formulário pode aproveitar.
   *
   * Quem escolhe "Madeiranit" numa recorrência já disse quase tudo: a
   * categoria dela, como se paga, em quantos dias. Fazer a pessoa repetir isso
   * campo a campo é pedir que ela decore o cadastro — e é como o dado diverge,
   * porque metade das vezes ela digita diferente.
   *
   * SUGESTÃO, nunca imposição: preenche só o que está VAZIO, e o que a pessoa
   * escreveu depois manda. Sobrescrever uma escolha explícita seria pior que
   * não sugerir nada.
   */
  sugestao?: {
    categoria?: string | null;
    forma_pagamento?: string | null;
    prazo_dias?: number | null;
  };
}

export interface FornecedorRelacionado {
  id: string;
  empresa_id: string;
  nome: string;
  logo_url?: string | null;
  icone?: string | null;
}

export interface EmpresaRelacionada {
  id: string;
  nome: string;
  logo_url?: string | null;
  icone?: string | null;
}

export interface ContaRelacionada extends EmpresaRelacionada {
  empresa_id: string;
}

type VinculoRelacionado = Pick<CompromissoRelacionado, "contato_id" | "fornecedor_id">;

/** Reúne os alvos usados por qualquer camada da agenda sem repetir consultas. */
export function idsDeRelacionados(...listas: VinculoRelacionado[][]): {
  contatoIds: string[];
  fornecedorIds: string[];
} {
  const contatos = new Set<string>();
  const fornecedores = new Set<string>();
  for (const lista of listas) {
    for (const item of lista) {
      if (item.contato_id) contatos.add(item.contato_id);
      if (item.fornecedor_id) fornecedores.add(item.fornecedor_id);
    }
  }
  return { contatoIds: [...contatos], fornecedorIds: [...fornecedores] };
}

/** Decodifica a escolha da UI garantindo que nunca existam duas FKs ativas. */
export function idsDoRelacionado(valor: string): { contato_id: string; fornecedor_id: string } {
  const separador = valor.indexOf(":");
  if (separador < 1) return { contato_id: "", fornecedor_id: "" };
  const tipo = valor.slice(0, separador);
  const id = valor.slice(separador + 1);
  if (!id) return { contato_id: "", fornecedor_id: "" };
  if (tipo === "contato") return { contato_id: id, fornecedor_id: "" };
  if (tipo === "fornecedor") return { contato_id: "", fornecedor_id: id };
  return { contato_id: "", fornecedor_id: "" };
}

/**
 * Escolhe a identidade visual de uma obrigação sem assinar URLs nem consultar
 * o banco. A extensão de fornecedor só serve para preservar sua FK: quando há
 * identidade canônica ligada, nome, imagem e ícone pertencem ao contato.
 */
export function marcaRelacionada(
  compromisso: CompromissoRelacionado,
  partes: RelacionadoFinanceiro[],
  fornecedores: FornecedorRelacionado[],
  empresa: EmpresaRelacionada,
  conta?: ContaRelacionada,
): MarcaRelacionada {
  if (compromisso.contato_id) {
    const contato = partes.find((parte) => parte.id === compromisso.contato_id);
    if (contato) return completarLogoComConta(marcaDaParte("contato", contato), conta);
  }

  if (compromisso.fornecedor_id) {
    const contatoCanonico = partes.find(
      (parte) => parte.fornecedor?.id === compromisso.fornecedor_id,
    );
    if (contatoCanonico) return completarLogoComConta(marcaDaParte("fornecedor", contatoCanonico), conta);

    const legado = fornecedores.find(
      (fornecedor) => fornecedor.id === compromisso.fornecedor_id,
    );
    if (legado) {
      return completarLogoComConta({
        origem: "fornecedor",
        id: legado.id,
        nome: legado.nome,
        logo_url: legado.logo_url ?? null,
        icone: legado.icone ?? null,
      }, conta);
    }
  }

  if (conta) {
    return {
      origem: "conta",
      id: conta.id,
      nome: conta.nome,
      logo_url: conta.logo_url ?? null,
      icone: conta.icone ?? null,
    };
  }

  return {
    origem: "empresa",
    id: empresa.id,
    nome: empresa.nome,
    logo_url: empresa.logo_url ?? null,
    icone: empresa.icone ?? null,
  };
}

/**
 * O relacionado SEM foto continua sem foto.
 *
 * Isto já emprestou a logo do BANCO pra quem não tinha a sua: a linha dizia
 * "PRONAMPE" e mostrava a marca do Itaú, porque é de lá que o boleto sai. Ler
 * assim é ler errado — a imagem passa a identificar outra entidade que não a
 * da linha ("imagens erradas", set/2026). Sem foto, quem entra é o ícone da
 * CATEGORIA, escolhido por quem desenha a linha (`iconeDaCategoria`).
 *
 * A conta continua sendo identidade visual quando não há relacionado NENHUM —
 * aí ela é de fato o dono da linha, e não um empréstimo.
 */
function completarLogoComConta(marca: MarcaRelacionada, _conta?: ContaRelacionada): MarcaRelacionada {
  return marca;
}

function marcaDaParte(
  origem: "contato" | "fornecedor",
  parte: RelacionadoFinanceiro,
): MarcaRelacionada {
  return {
    origem,
    id: parte.id,
    nome: parte.nome,
    logo_url: parte.logo_url ?? null,
    icone: parte.icone ?? null,
  };
}
