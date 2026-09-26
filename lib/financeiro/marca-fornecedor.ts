import { NextResponse } from "next/server";

type ErroDeConsulta = { code?: string; message?: string };

const CODIGOS_DE_SCHEMA_AUSENTE = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);

function ehErroDeSchemaAusente(erro: unknown): erro is ErroDeConsulta {
  if (!erro || typeof erro !== "object") return false;
  const { code, message } = erro as ErroDeConsulta;
  return CODIGOS_DE_SCHEMA_AUSENTE.has(code ?? "")
    || /\b(?:column|relation|schema)\b.*\b(?:does not exist|not found)\b|schema cache/i.test(message ?? "");
}

/**
 * A coluna de vínculo é a única compatibilidade tolerada: schema antigo usa a
 * marca legada; erro de rede, RLS ou permissão precisa chegar à rota, pois não
 * prova que a coluna não existe.
 */
export function contatoCanonicoDaConsultaFornecedor(resultado: {
  data: Record<string, unknown> | null;
  error: unknown;
}): string | null {
  if (resultado.error) {
    if (ehErroDeSchemaAusente(resultado.error)) return null;
    throw resultado.error;
  }
  return typeof resultado.data?.contato_id === "string" ? resultado.data.contato_id : null;
}

const mensagemDoErro = (erro: unknown) => {
  if (erro instanceof Error) return erro.message;
  if (erro && typeof erro === "object" && typeof (erro as ErroDeConsulta).message === "string") {
    return (erro as ErroDeConsulta).message!;
  }
  return "erro desconhecido";
};

/** Borda HTTP compartilhada por POST e DELETE da marca de fornecedor. */
export async function resolverContatoDaMarcaFornecedor(
  consultar: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>,
): Promise<{ contatoId: string | null } | { resposta: NextResponse }> {
  try {
    return { contatoId: contatoCanonicoDaConsultaFornecedor(await consultar()) };
  } catch (erro) {
    return {
      resposta: NextResponse.json(
        { erro: `Não deu para resolver a marca canônica do fornecedor: ${mensagemDoErro(erro)}` },
        { status: 500 },
      ),
    };
  }
}
