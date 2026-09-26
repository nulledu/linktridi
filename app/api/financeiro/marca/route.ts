// ── Marca · o logo de empresa, banco, fornecedor e contato ───────────────────
// UMA rota para os quatro, em vez de uma pasta `[id]/logo` por entidade. O que
// muda entre eles não é o mecanismo (subir arquivo, gravar caminho, auditar) —
// é só QUAL CHAVE cada um exige, e isso cabe num mapa.
//
// A permissão segue a TELA que oferece a ação, igual aos anexos. Conta é o
// único tipo com dois caminhos legítimos: a ficha operacional exige `contas`,
// enquanto a galeria central exige `config`. Os demais seguem seu dono
// (`config`, `cadastros` ou `folha`). Uma chave única de "marca" deixaria
// alguém trocar a imagem de um cadastro que não pode nem abrir.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida, esquecerEmpresas } from "@/lib/financeiro/db";
import { esquecerLogo, guardarLogo, TABELA_DA_MARCA, TIPOS_DE_MARCA, type TipoDeMarca } from "@/lib/financeiro/anexos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { concluirTrocaDeMarca } from "@/lib/financeiro/marca-consistente";
import { resolverContatoDaMarcaFornecedor } from "@/lib/financeiro/marca-fornecedor";
import { BUCKET } from "@/lib/financeiro/anexos";
import { podeEditarMarca } from "@/lib/financeiro/permissao-marca";

export const dynamic = "force-dynamic";

const ehTipo = (v: unknown): v is TipoDeMarca => TIPOS_DE_MARCA.includes(v as TipoDeMarca);

/**
 * Como cada tabela chama a coluna do nome.
 *
 * Cinco das seis têm `nome`; `fin_recorrencias` tem `descricao`. Assumir `nome`
 * para todas fazia a consulta voltar 42703 — que este arquivo classifica como
 * "schema atrasado" e traduz para "rode os arquivos de supabase/". Ou seja: um
 * erro de programação nosso mandava a pessoa rodar SQL que já estava rodado,
 * procurar defeito onde não havia, e a foto simplesmente não subia.
 */
const COLUNA_NOME: Record<TipoDeMarca, string> = {
  empresa: "nome", conta: "nome", fornecedor: "nome",
  contato: "nome", colaborador: "nome", recorrencia: "descricao",
  patrimonio: "descricao",
};

/** As colunas que a marca precisa ler, montadas a partir do tipo. */
const colunasDaMarca = (tipo: TipoDeMarca) =>
  ["id", `nome:${COLUNA_NOME[tipo]}`, ...(tipo === "empresa" ? [] : ["empresa_id"]), "logo_url"].join(",");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Acha o registro — e DIZ A VERDADE quando não acha.
 *
 * A versão anterior fazia `const { data } = await …` e jogava o `error` fora:
 * qualquer falha da consulta (id que não é uuid, tabela ausente, schema
 * atrasado) virava "Registro não encontrado", que manda a pessoa procurar no
 * lugar errado — o registro está lá. Foi exatamente o que aconteceu ao subir
 * o logo de uma empresa.
 *
 * O id é conferido ANTES da consulta: texto que não é uuid chega no Postgres
 * como 22P02, um erro cru que não explica nada.
 */
async function acharRegistro(
  db: ReturnType<typeof createSupabaseAdminClient>, tipo: TipoDeMarca, id: string, colunas: string,
): Promise<{ ok: true; linha: Record<string, unknown> } | { ok: false; resposta: NextResponse }> {
  if (!UUID.test(id)) {
    return { ok: false, resposta: NextResponse.json(
      { erro: `Identificador inválido para ${tipo}: "${id}".` }, { status: 400 }) };
  }
  const { data, error } = await db.from(TABELA_DA_MARCA[tipo]).select(colunas).eq("id", id).maybeSingle();
  if (error) {
    // `42703` (coluna não existe) saiu desta lista de propósito. Ele quase
    // nunca é banco atrasado — é a consulta pedindo uma coluna errada, e
    // traduzi-lo para "rode os arquivos de supabase/" manda a pessoa procurar
    // no lugar errado enquanto o defeito está aqui. Tabela ausente (42P01,
    // PGRST205) continua sendo schema de verdade.
    const faltaSchema = ["42P01", "PGRST205", "PGRST204"].includes(error.code ?? "");
    return { ok: false, resposta: NextResponse.json(
      {
        erro: faltaSchema
          ? `A tabela de ${tipo} está atrás do código — rode os arquivos de supabase/.`
          : `Não deu para ler o cadastro de ${tipo}: ${error.message}`,
      },
      { status: faltaSchema ? 503 : 500 },
    ) };
  }
  if (!data) {
    return { ok: false, resposta: NextResponse.json(
      { erro: `Nenhum(a) ${tipo} com este identificador. Feche e abra a tela — a lista pode estar velha.` },
      { status: 404 }) };
  }
  return { ok: true, linha: data as Record<string, unknown> };
}

/**
 * Fornecedor ainda é um ID que compras e telas antigas conhecem, mas sua marca
 * é da identidade. Enquanto a migração não chegou neste banco, a coluna
 * `contato_id` pode não existir: nesse caso a rota segue usando a linha legada.
 */
async function resolverMarcaCanonicaDeFornecedor(
  db: ReturnType<typeof createSupabaseAdminClient>, id: string,
): Promise<{ contatoId: string | null } | { resposta: NextResponse }> {
  if (!UUID.test(id)) return { contatoId: null };
  return resolverContatoDaMarcaFornecedor(
    async () => await db.from("fin_fornecedores").select("contato_id").eq("id", id).maybeSingle(),
  );
}

/** POST multipart: file, tipo, id. Sobe a imagem e grava o caminho. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ erro: "Envio inválido." }, { status: 400 });

  const arquivo = form.get("file");
  const tipo = String(form.get("tipo") ?? "");
  const id = String(form.get("id") ?? "");

  if (!(arquivo instanceof File) || !ehTipo(tipo) || !id) {
    return NextResponse.json({ erro: "Parâmetros inválidos." }, { status: 400 });
  }

  const eu = await apiFinanceiro();
  if (!eu || !podeEditarMarca(tipo, eu.poderes)) {
    return NextResponse.json({ erro: "Sem permissão para alterar esta imagem." }, { status: 403 });
  }

  const db = createSupabaseAdminClient();
  const resolucao = tipo === "fornecedor"
    ? await resolverMarcaCanonicaDeFornecedor(db, id) : { contatoId: null };
  if ("resposta" in resolucao) return resolucao.resposta;
  const contatoId = resolucao.contatoId;
  const tipoDaMarca: TipoDeMarca = contatoId ? "contato" : tipo;
  const idDaMarca = contatoId ?? id;
  const tabela = TABELA_DA_MARCA[tipoDaMarca];

  // `fin_empresas` é a única sem `empresa_id` — ela É a empresa. Nas outras a
  // conferência por empresa é obrigatória (§17): sem ela, quem tem o
  // Financeiro da Gedux trocaria o logo de um fornecedor da Tridi mandando um
  // id na mão.
  const achado = await acharRegistro(db, tipoDaMarca, idDaMarca, colunasDaMarca(tipoDaMarca));
  if (!achado.ok) return achado.resposta;
  const linha = achado.linha;

  const empresaId = tipoDaMarca === "empresa" ? (linha.id as string) : (linha.empresa_id as string);
  if (tipoDaMarca !== "empresa" && !(await empresaPermitida(eu.profile.id, empresaId))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const r = await guardarLogo({
    tipo: tipoDaMarca, id: idDaMarca,
    nome: arquivo.name || "logo",
    mime: arquivo.type || "application/octet-stream",
    bytes: await arquivo.arrayBuffer(),
    tamanho: arquivo.size ?? 0,
  });
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });

  const anterior = linha.logo_url as string | null | undefined;
  const troca = await concluirTrocaDeMarca({
    caminhoNovo: r.caminho,
    caminhoAnterior: anterior,
    atualizar: async () => {
      const { error } = await db.from(tabela).update({ logo_url: r.caminho }).eq("id", idDaMarca);
      return error;
    },
    remover: async (caminhos) => {
      await db.storage.from(BUCKET).remove(caminhos);
    },
  });
  if (!troca.ok) return NextResponse.json({ erro: troca.erro }, { status: 400 });
  esquecerLogo(anterior);
  esquecerLogo(r.caminho);

  // O arquivo antigo NÃO é apagado: um link assinado dele pode estar aberto na
  // aba de alguém, válido por até uma hora. Fica órfão no bucket — barato, e
  // melhor do que arrancar a imagem debaixo de quem está olhando pra ela.
  if (tipo === "empresa") esquecerEmpresas();
  await auditar({
    empresa_id: empresaId, entidade: tipoDaMarca, entidade_id: idDaMarca, acao: "editar",
    user_id: eu.profile.id, user_nome: eu.profile.name, dados: { logo: "trocado" },
  });

  return NextResponse.json({ ok: true });
}

/** DELETE ?tipo=&id= — tira a imagem e devolve o registro ao ícone de reserva. */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const id = searchParams.get("id");

  if (!ehTipo(tipo) || !id) return NextResponse.json({ erro: "Parâmetros inválidos." }, { status: 400 });

  const eu = await apiFinanceiro();
  if (!eu || !podeEditarMarca(tipo, eu.poderes)) {
    return NextResponse.json({ erro: "Sem permissão para alterar esta imagem." }, { status: 403 });
  }

  const db = createSupabaseAdminClient();
  const resolucao = tipo === "fornecedor"
    ? await resolverMarcaCanonicaDeFornecedor(db, id) : { contatoId: null };
  if ("resposta" in resolucao) return resolucao.resposta;
  const contatoId = resolucao.contatoId;
  const tipoDaMarca: TipoDeMarca = contatoId ? "contato" : tipo;
  const idDaMarca = contatoId ?? id;
  const tabela = TABELA_DA_MARCA[tipoDaMarca];
  const achado = await acharRegistro(db, tipoDaMarca, idDaMarca, colunasDaMarca(tipoDaMarca));
  if (!achado.ok) return achado.resposta;
  const linha = achado.linha;

  const empresaId = tipoDaMarca === "empresa" ? (linha.id as string) : (linha.empresa_id as string);
  if (tipoDaMarca !== "empresa" && !(await empresaPermitida(eu.profile.id, empresaId))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const { error } = await db.from(tabela).update({ logo_url: null }).eq("id", idDaMarca);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  esquecerLogo(linha.logo_url as string | null | undefined);

  if (tipo === "empresa") esquecerEmpresas();
  await auditar({
    empresa_id: empresaId, entidade: tipoDaMarca, entidade_id: idDaMarca, acao: "editar",
    user_id: eu.profile.id, user_nome: eu.profile.name, dados: { logo: "removido" },
  });

  return NextResponse.json({ ok: true });
}
