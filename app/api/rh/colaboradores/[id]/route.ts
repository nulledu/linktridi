import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { invalidate } from "@/lib/cache";
import { AREAS_RESTRITAS, podeConcederArea } from "@/lib/areas";
import { ehSuperusuario } from "@/lib/superusuario";
import { listarEmpresas } from "@/lib/financeiro/db";
import { apiRh } from "@/lib/rh/gate";
import {
  anamneseDe, anotarNoHistorico, atestadosDe, colaboradorPorId, documentosDe,
  empresasDoFinanceiroDe, feriasDe, fichaDe, historicoDe, linhaDoColaborador,
} from "@/lib/rh/dados";
import { ehSituacao, type RhSituacao } from "@/lib/rh/tipos";

export const dynamic = "force-dynamic";

/** Texto do corpo, aparado, com teto — vazio vira `null` (a coluna é anulável). */
function texto(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

/** Data ISO ou `null`. Qualquer outra coisa é descartada, não rejeitada: o
 *  formulário manda `""` para campo de data vazio o tempo todo. */
function data(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Os campos da ficha de RH (`rh_fichas`). O que não está aqui não é gravado. */
const CAMPOS_FICHA = {
  data_nascimento: data, cpf: texto, rg: texto, estado_civil: texto,
  email_pessoal: texto, contato_emergencia: texto, telefone_emergencia: texto,
  cep: texto, logradouro: texto, numero: texto, complemento: texto,
  bairro: texto, cidade: texto, uf: texto,
} as const;


/**
 * GET — tudo o que a ficha em pop-up precisa, numa ida só.
 *
 * A ficha deixou de ser rota e virou painel (o padrão do Financeiro: clicar na
 * linha não troca de tela). Isso trocou "um render de servidor por pessoa" por
 * "um fetch por pessoa" — e o fetch só compensa se for UM. Sete chamadas em
 * sequência custariam 250–700 ms cada, e abrir alguém levaria segundos.
 *
 * A REGRA DE PRIVACIDADE MORA AQUI, não na tela: cada gaveta só é LIDA quando
 * quem pediu tem a chave. Mandar tudo e esconder aba no cliente é decoração —
 * o dado viajou, e quem abre o inspetor o encontra.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const eu = await apiRh("ver");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await ctx.params;
  const colaborador = await colaboradorPorId(id);
  if (!colaborador) return NextResponse.json({ erro: "Colaborador não encontrado." }, { status: 404 });

  const p = eu.poderes;
  const vazio = { dados: [], pendente: false } as const;

  const [ficha, documentos, atestados, ferias, historico, linha, empresasFin, empresasMarcadas] =
    await Promise.all([
      fichaDe(id),
      p.documentos ? documentosDe(id) : Promise.resolve(vazio),
      p.atestados ? atestadosDe(id) : Promise.resolve(vazio),
      p.ferias ? feriasDe(id) : Promise.resolve(vazio),
      historicoDe(id),
      linhaDoColaborador(id),
      listarEmpresas().then((r) => r.dados.map((e) => ({ id: e.id, nome: e.nome }))).catch(() => []),
      empresasDoFinanceiroDe(id),
    ]);

  // Fora do `Promise.all` de propósito — ver o comentário acima.
  const anamnese = p.anamnese ? (await anamneseDe(id)).dados : null;

  // A grade de permissões distribui PODER no sistema inteiro, e por isso
  // continua sendo do PAPEL admin — ter o RH não concede. O servidor de
  // /api/colaboradores/[id] é quem trava de verdade (CAMPOS_DE_PODER); isto
  // aqui só evita mandar à tela um painel que ela não poderá salvar.
  const souAdmin = eu.profile.role === "admin";
  const areasQueConcedo = AREAS_RESTRITAS
    .filter((a) => podeConcederArea(a.key, eu.keys, ehSuperusuario(eu.profile.id, eu.profile.username)))
    .map((a) => a.key);

  return NextResponse.json({
    colaborador,
    ficha: ficha.dados,
    documentos: documentos.dados,
    atestados: atestados.dados,
    ferias: ferias.dados,
    historico: historico.dados,
    anamnese,
    linha,
    empresasFinanceiro: empresasFin,
    empresasMarcadas,
    areasQueConcedo,
    souAdmin,
    souEu: eu.profile.id === id,
    schemaPendente: ficha.pendente,
  });
}

/**
 * PUT — salva a ficha do colaborador.
 *
 * Escreve em DUAS tabelas, e a divisão não é arbitrária: cargo, setor,
 * departamento, telefone e admissão já moravam em `employees` (é de lá que a
 * sidebar, o ponto e o comercial os leem), então duplicá-los em `rh_fichas`
 * criaria duas verdades. O que é novo do RH — documentos pessoais, endereço,
 * emergência, situação — mora em `rh_fichas`.
 *
 * `employees` é lida pelo GATE de toda página protegida e vive em cache de 30 s
 * (`acessoBruto`); sem o `invalidate` a foto e o setor ficariam meio minuto
 * atrás do que a tela acabou de gravar.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const eu = await apiRh("editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await ctx.params;
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const db = createSupabaseAdminClient();

  // O ANTES, para o histórico saber o que mudou. Uma ida barata (duas colunas
  // de duas tabelas) que evita escrever "cargo alterado" quando nada mudou.
  const [antesEmp, antesFicha] = await Promise.all([
    db.from("employees").select("cargo,setor,departamento").eq("id", id).maybeSingle(),
    db.from("rh_fichas").select("situacao").eq("employee_id", id).maybeSingle(),
  ]);

  const emp = {
    cargo: texto(corpo.cargo, 120),
    setor: texto(corpo.setor, 120),
    departamento: texto(corpo.departamento, 120),
    telefone: texto(corpo.telefone, 40),
    data_admissao: data(corpo.data_admissao),
    updated_at: new Date().toISOString(),
  };

  const { error: erroEmp } = await db.from("employees").update(emp).eq("id", id);
  if (erroEmp) return NextResponse.json({ erro: erroEmp.message }, { status: 500 });
  invalidate(`emp-acesso:${id}`);

  const situacao: RhSituacao = ehSituacao(corpo.situacao) ? corpo.situacao : "ativo";
  const ficha: Record<string, unknown> = {
    employee_id: id,
    situacao,
    observacoes: texto(corpo.observacoes, 4000),
    updated_by: eu.profile.id,
  };
  for (const [chave, limpar] of Object.entries(CAMPOS_FICHA)) {
    ficha[chave] = limpar(corpo[chave]);
  }

  // `upsert` porque a ficha pode não existir: o passo 8 do SQL cria uma para
  // quem já estava na empresa, mas quem for cadastrado depois chega sem.
  const { error: erroFicha } = await db.from("rh_fichas").upsert(ficha, { onConflict: "employee_id" });
  if (erroFicha) {
    // O `employees` já gravou. Dizer "não salvou" seria mentira — e a pessoa
    // salvaria de novo achando que perdeu tudo.
    return NextResponse.json(
      { erro: "O cadastro foi salvo, mas a ficha de RH não: " + erroFicha.message },
      { status: 500 },
    );
  }

  // ── Histórico: uma linha por coisa que REALMENTE mudou ──────────────────────
  const autor = { autor_id: eu.profile.id, autor_nome: eu.profile.name };
  const de = antesEmp.data as { cargo?: string | null; setor?: string | null; departamento?: string | null } | null;
  const situacaoAntes = (antesFicha.data as { situacao?: string } | null)?.situacao;

  if (de && de.cargo !== emp.cargo) {
    await anotarNoHistorico({
      employee_id: id, tipo: "cargo", titulo: "Cargo alterado",
      detalhe: `${de.cargo || "sem cargo"} → ${emp.cargo || "sem cargo"}`,
      dados: { de: de.cargo, para: emp.cargo }, ...autor,
    });
  }
  if (de && de.setor !== emp.setor) {
    await anotarNoHistorico({
      employee_id: id, tipo: "setor", titulo: "Setor alterado",
      detalhe: `${de.setor || "sem setor"} → ${emp.setor || "sem setor"}`,
      dados: { de: de.setor, para: emp.setor }, ...autor,
    });
  }
  if (situacaoAntes && situacaoAntes !== situacao) {
    await anotarNoHistorico({
      employee_id: id,
      tipo: situacao === "desligado" ? "desligamento" : "situacao",
      titulo: situacao === "desligado" ? "Colaborador desligado" : "Situação alterada",
      detalhe: `${situacaoAntes} → ${situacao}`,
      dados: { de: situacaoAntes, para: situacao }, ...autor,
    });
  }

  return NextResponse.json({ ok: true });
}
