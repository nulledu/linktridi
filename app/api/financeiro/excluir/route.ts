import { NextResponse } from "next/server";
import { apiFinanceiro, type SubFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida, esquecerEmpresas } from "@/lib/financeiro/db";
import { esquecerLogo } from "@/lib/financeiro/anexos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Apagar de verdade o que ainda não virou história.
 *
 * Faltava em conta, patrimônio, recorrência e empresa: dava para cadastrar e
 * não dava para desfazer. Quem está aprendendo o sistema cria três contas de
 * teste e fica com elas para sempre — e "não consigo excluir o que eu subo" foi
 * exatamente a reclamação.
 *
 * A regra que separa apagar de inativar: **linha com história não some.** Uma
 * conta que já tem movimento explica o extrato do ano passado; um bem que já
 * saiu numa compra explica o custo. Nesses casos a resposta é 409 dizendo o que
 * segura, e o caminho é inativar (que cada tela já tem). O que nunca foi usado
 * some sem deixar buraco.
 *
 * `fin_empresas` é o caso mais perigoso e por isso é o mais travado: só some
 * empresa sem NADA pendurado, e nunca a última que sobrou.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O que pode ser apagado, com a chave que autoriza e o que segura.
 *
 * `nome` é declarado por tabela porque elas não concordam: conta e empresa têm
 * `nome`, patrimônio e recorrência têm `descricao`. Assumir `nome` para todas
 * fazia a rota responder "column fin_recorrencias.nome does not exist" — um
 * erro de programação vazando como se fosse problema do banco de quem usa.
 */
const APAGAVEL = {
  conta: {
    tabela: "fin_contas", chave: "contas" as SubFinanceiro, rotulo: "conta", nome: "nome",
    // Movimento é extrato; compromisso e recorrência apontam para cá.
    segura: [
      { tabela: "fin_movimentos", coluna: "conta_id", diz: "movimentos no extrato" },
      { tabela: "fin_compromissos", coluna: "conta_id", diz: "compromissos" },
      { tabela: "fin_recorrencias", coluna: "conta_id", diz: "recorrências" },
      { tabela: "fin_contas", coluna: "conta_mae_id", diz: "cartões pendurados" },
    ],
  },
  compromisso: {
    tabela: "fin_compromissos", chave: "compromissos" as SubFinanceiro, rotulo: "compromisso",
    nome: "descricao",
    // A marca que aparece na lista vem do RELACIONADO (contato, fornecedor),
    // não da linha: `fin_compromissos` não tem `logo_url`.
    semLogo: true,
    // O `DELETE` da rota de compromissos não apaga: ele CANCELA (status
    // 'cancelado'). É o certo para uma conta que existiu e não vai mais ser
    // paga — mas deixava sem saída a conta lançada por engano, que fica na
    // lista para sempre marcada "Cancelado". Uma linha errada não é história.
    //
    // O que é história aqui é o DINHEIRO: se houve movimento na conta, o
    // extrato precisa continuar explicável. Enquanto nada foi pago, a linha
    // some.
    segura: [{ tabela: "fin_movimentos", coluna: "compromisso_id", diz: "movimentos no extrato" }],
    // Pago sem movimento registrado (baixa antiga, importação) também segura:
    // a data de pagamento é afirmação de que o dinheiro saiu.
    recusaSePreenchido: { coluna: "pago_em", diz: "já foi pago — reverta o pagamento antes" },
  },
  estorno: {
    tabela: "fin_estornos", chave: "compromissos" as SubFinanceiro, rotulo: "estorno", nome: "referencia",
    // Estorno não é tipo de marca: não tem `logo_url` próprio.
    semLogo: true,
    // Nada aponta para um estorno — apagar é sempre livre (com a dupla
    // checagem do BotaoApagar na tela).
    segura: [],
  },
  patrimonio: {
    tabela: "fin_patrimonio", chave: "patrimonio" as SubFinanceiro, rotulo: "bem", nome: "descricao",
    // Bem não é tipo de marca (ver TABELA_DA_MARCA): não tem `logo_url`.
    semLogo: true,
    segura: [],
  },
  recorrencia: {
    tabela: "fin_recorrencias", chave: "cadastros" as SubFinanceiro, rotulo: "recorrência", nome: "descricao",
    // Só o que foi PAGO segura.
    //
    // A primeira versão barrava qualquer compromisso gerado, e isso tornava
    // impossível desfazer o caso mais comum de todos: criar a regra marcando
    // "lançar a primeira" e perceber no segundo seguinte que estava errada. A
    // regra nasce já com um compromisso, então nascia impossível de apagar —
    // e a mensagem falava em "histórico" de uma conta criada dez segundos
    // antes, que ninguém pagou.
    //
    // Compromisso gerado por ela não é história de terceiro: veio DELA. O que
    // é história é o pagamento, porque aí existe dinheiro que saiu e um
    // extrato que precisa continuar explicável. Enquanto nada foi pago, os
    // gerados saem junto (ver `arrasta`).
    segura: [{
      tabela: "fin_compromissos", coluna: "origem_id",
      diz: "compromissos já pagos",
      soQuando: { coluna: "pago_em", operador: "not.is", valor: null },
    }],
    // O que sai junto quando nada segura: os compromissos ainda não pagos que
    // esta regra criou. Deixá-los para trás produziria conta órfã na agenda,
    // apontando para uma regra que já não existe.
    arrasta: [{ tabela: "fin_compromissos", coluna: "origem_id", so: "pago_em.is.null" }],
  },
  colaborador: {
    tabela: "fin_colaboradores", chave: "folha" as SubFinanceiro, rotulo: "pessoa da folha", nome: "nome",
    // O que é história aqui é MÊS PAGO: dinheiro que saiu e um holerite que
    // precisa continuar explicável. Mês não pago e lançamentos saem junto
    // pelo cascade do banco. Compromisso de folha PAGO também segura.
    segura: [
      { tabela: "fin_folha_mensal", coluna: "colaborador_id", diz: "meses de folha já pagos",
        soQuando: { coluna: "pago_em", operador: "not.is", valor: null } },
      { tabela: "fin_compromissos", coluna: "colaborador_id", diz: "pagamentos na agenda já pagos",
        soQuando: { coluna: "pago_em", operador: "not.is", valor: null } },
    ],
  },
  empresa: {
    tabela: "fin_empresas", chave: "config" as SubFinanceiro, rotulo: "empresa", nome: "nome",
    segura: [
      { tabela: "fin_compromissos", coluna: "empresa_id", diz: "compromissos" },
      { tabela: "fin_compras", coluna: "empresa_id", diz: "compras" },
      { tabela: "fin_notas", coluna: "empresa_id", diz: "notas" },
      { tabela: "fin_contas", coluna: "empresa_id", diz: "contas" },
      { tabela: "fin_fornecedores", coluna: "empresa_id", diz: "fornecedores" },
      { tabela: "fin_contatos", coluna: "empresa_id", diz: "contatos" },
      { tabela: "fin_colaboradores", coluna: "empresa_id", diz: "pessoas na folha" },
      { tabela: "fin_patrimonio", coluna: "empresa_id", diz: "patrimônio" },
      { tabela: "fin_recorrencias", coluna: "empresa_id", diz: "recorrências" },
      { tabela: "fin_movimentos", coluna: "empresa_id", diz: "movimentos" },
    ],
  },
} as const;

type Apagavel = keyof typeof APAGAVEL;
const ehApagavel = (v: unknown): v is Apagavel => typeof v === "string" && v in APAGAVEL;

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const id = String(searchParams.get("id") ?? "");

  if (!ehApagavel(tipo)) return NextResponse.json({ erro: "Tipo desconhecido." }, { status: 400 });
  if (!UUID.test(id)) return NextResponse.json({ erro: "Identificador inválido." }, { status: 400 });

  const alvo = APAGAVEL[tipo];
  const eu = await apiFinanceiro(alvo.chave);
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const db = createSupabaseAdminClient();

  // A empresa sai da LINHA, nunca da querystring: aceitar a do cliente
  // deixaria apagar o registro de uma empresa que a pessoa não pode abrir.
  // As colunas são montadas a partir do mapa, e não fixas: as quatro tabelas
  // não concordam nem sobre o nome (`nome` × `descricao`) nem sobre ter logo.
  // Pedir uma coluna que não existe devolve 42703 — um erro de programação que
  // vaza para a tela como se fosse defeito do banco de quem usa.
  const colunas = [
    "id",
    `nome:${alvo.nome}`,
    ...(tipo === "empresa" ? [] : ["empresa_id"]),
    ...("semLogo" in alvo && alvo.semLogo ? [] : ["logo_url"]),
  ].join(",");
  const { data, error } = await db.from(alvo.tabela).select(colunas).eq("id", id).maybeSingle();
  if (error) {
    return NextResponse.json({ erro: `Não deu para ler a ${alvo.rotulo}: ${error.message}` }, { status: 500 });
  }
  const linha = data as { id: string; nome?: string; empresa_id?: string; logo_url?: string | null } | null;
  if (!linha) return NextResponse.json({ erro: `Esta ${alvo.rotulo} já não existe.` }, { status: 404 });

  const empresaId = tipo === "empresa" ? linha.id : (linha.empresa_id as string);
  if (!(await empresaPermitida(eu.profile.id, empresaId))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  // A última empresa não some: sem nenhuma, o módulo inteiro fica sem porta e
  // só um arquivo de SQL destrava.
  if (tipo === "empresa") {
    const { count } = await db.from("fin_empresas").select("id", { count: "exact", head: true });
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { erro: "Esta é a única empresa — apagá-la deixaria o Financeiro sem porta de entrada." },
        { status: 409 },
      );
    }
  }

  // Recusa que se decide na PRÓPRIA linha, sem consultar outra tabela.
  if ("recusaSePreenchido" in alvo && alvo.recusaSePreenchido) {
    const r = alvo.recusaSePreenchido;
    const { data: conferir } = await db
      .from(alvo.tabela).select(r.coluna).eq("id", id).maybeSingle();
    const valor = (conferir as Record<string, unknown> | null)?.[r.coluna];
    if (valor !== null && valor !== undefined) {
      return NextResponse.json(
        { erro: `Não dá para apagar: este ${alvo.rotulo} ${r.diz}.`, emUso: true },
        { status: 409 },
      );
    }
  }

  // O que segura. Head-only: só a contagem viaja, nenhuma linha.
  for (const s of alvo.segura) {
    let consulta = db.from(s.tabela).select("id", { count: "exact", head: true }).eq(s.coluna, id);
    // `soQuando` estreita o que conta como história. Sem ele, TODA linha
    // ligada segura — o que transforma "criei errado agora" em permanente.
    if ("soQuando" in s && s.soQuando) {
      consulta = consulta.not(s.soQuando.coluna, "is", null);
    }
    const { count, error: erroConta } = await consulta;
    if (erroConta) continue;   // tabela ausente num banco atrasado não trava a exclusão
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          erro: `Não dá para apagar: esta ${alvo.rotulo} tem ${count} ${s.diz}. `
            + "Ela explica o histórico — tire de circulação em vez de apagar.",
          emUso: true,
        },
        { status: 409 },
      );
    }
  }

  // Sai junto o que só existe por causa desta linha e ainda não virou história.
  // Depois da conferência acima, de propósito: se algo segurava, já saímos.
  if ("arrasta" in alvo && alvo.arrasta) {
    for (const a of alvo.arrasta) {
      let limpeza = db.from(a.tabela).delete().eq(a.coluna, id);
      if (a.so === "pago_em.is.null") limpeza = limpeza.is("pago_em", null);
      const { error: erroLimpeza } = await limpeza;
      if (erroLimpeza) {
        return NextResponse.json(
          { erro: `Não deu para limpar o que dependia desta ${alvo.rotulo}: ${erroLimpeza.message}` },
          { status: 400 },
        );
      }
    }
  }

  const { error: erroDel } = await db.from(alvo.tabela).delete().eq("id", id);
  if (erroDel) {
    // 23503 = alguma outra tabela ainda aponta para cá. A lista acima cobre o
    // que se conhece; isto é a rede para o vínculo que alguém criar amanhã.
    if (erroDel.code === "23503") {
      return NextResponse.json(
        { erro: `Alguma coisa ainda usa esta ${alvo.rotulo}. Tire de circulação em vez de apagar.`, emUso: true },
        { status: 409 },
      );
    }
    return NextResponse.json({ erro: erroDel.message }, { status: 400 });
  }

  esquecerLogo(linha.logo_url);
  if (tipo === "empresa" || tipo === "conta") esquecerEmpresas();

  await auditar({
    empresa_id: empresaId, entidade: tipo, entidade_id: id, acao: "excluir",
    user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { nome: linha.nome ?? null },
  });

  return NextResponse.json({ ok: true });
}
