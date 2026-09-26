// ── As operações que mexem em dinheiro ───────────────────────────────────────
// Confirmar compra, pagar, reverter, transferir, gerar recorrência. É o §16 da
// especificação, e é a parte do módulo em que errar custa caro de verdade.
//
// SOBRE ATOMICIDADE, SEM ENROLAR. O app fala com o Postgres pelo PostgREST, que
// não abre transação entre chamadas — não existe `BEGIN … COMMIT` daqui. Então
// a garantia NÃO vem de transação: vem de IDEMPOTÊNCIA + ORDEM.
//
//   · Idempotência: todo fato automático carrega uma chave determinística
//     (`compra:<id>:<parcela>`, `rec:<id>:<AAAA-MM>`, `pag:<compromisso>`), e o
//     índice único do banco recusa a segunda gravação. Clique duplo, retry de
//     timeout e job reexecutado terminam no MESMO estado.
//   · Ordem: os filhos nascem ANTES de o pai virar de status. Se a chamada cair
//     no meio, sobra uma compra ainda "rascunho" com parcelas já criadas —
//     rodar de novo termina o serviço e não duplica nada. O contrário (virar o
//     status primeiro) deixaria uma compra "confirmada" sem compromisso, que é
//     dívida que some da agenda.
//
// Onde isso não basta — a transferência, que são duas pernas — a operação
// desfaz a primeira perna se a segunda falhar, e o `transfer_group_id` deixa o
// par rastreável.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  centavos, chaveDaCompra, chaveDaFolha, competenciaDe, diaSeguro, geracoesPendentes,
  hojeISO, parcelasDaCompra,
} from "./calculos";
import { upsertIdempotente, ehSemIndiceParaOnConflict, auditar } from "./db";
import { materializarOcorrencia } from "./materializar-recorrencia";
import { LANCAMENTO, type LancamentoTipo, type Plano } from "./tipos";

const db = () => createSupabaseAdminClient();

/** Quem fez. `id` nulo é a máquina (o cron das recorrências), e fica assim na auditoria. */
export interface Autor { id: string | null; nome: string }

export interface Resultado<T = unknown> {
  ok: boolean;
  erro?: string;
  jaEstava?: boolean;     // a operação já tinha sido feita — não é falha
  dados?: T;
}

/** Violação de unicidade: para nós é "já existe", não erro. */
const ehDuplicado = (e: { code?: string; message?: string } | null) =>
  e?.code === "23505" || (e?.message ?? "").includes("duplicate key");

// ── Confirmar compra (§7, §16, §22) ──────────────────────────────────────────

/**
 * Vira a compra de rascunho para confirmada, criando o plano de pagamento e os
 * compromissos correspondentes.
 *
 * "Compra de R$ 9.000 em 3x gera exatamente 3 compromissos" e "reprocessar não
 * duplica parcelas" são os dois testes de aceite do §22 que passam por aqui.
 */
export async function confirmarCompra(
  compraId: string, autor: Autor,
): Promise<Resultado<{ compromissos: number }>> {
  const { data: compra, error } = await db()
    .from("fin_compras")
    .select("id,empresa_id,descricao,data,categoria,valor_total,plano,parcelas,prazo_dias,primeiro_vencimento,conta_id,fornecedor_id,status,gera_patrimonio")
    .eq("id", compraId)
    .maybeSingle();

  if (error || !compra) return { ok: false, erro: "Compra não encontrada." };
  if (compra.status === "cancelada") return { ok: false, erro: "Compra cancelada não pode ser confirmada." };

  const parcelas = parcelasDaCompra({
    valor_total: Number(compra.valor_total),
    plano: compra.plano as Plano,
    parcelas: compra.parcelas,
    prazo_dias: compra.prazo_dias,
    data: compra.data,
    primeiro_vencimento: compra.primeiro_vencimento,
  });

  // 1. Plano. `ignoreDuplicates` + unique(compra_id, numero): reprocessar não
  //    cria a 4ª parcela de uma compra de 3x.
  const { error: erroParcelas } = await db()
    .from("fin_compra_parcelas")
    .upsert(
      parcelas.map((p) => ({ compra_id: compra.id, numero: p.numero, vencimento: p.vencimento, valor: p.valor })),
      { onConflict: "compra_id,numero", ignoreDuplicates: true },
    );
  if (erroParcelas && !ehDuplicado(erroParcelas)) return { ok: false, erro: erroParcelas.message };

  // 2. Compromissos. A chave determinística é a trava — não a ausência deles.
  const { error: erroCompromissos } = await upsertIdempotente(
    "fin_compromissos",
    parcelas.map((p) => ({
        empresa_id: compra.empresa_id,
        descricao: parcelas.length > 1
          ? `${compra.descricao} (${p.numero}/${parcelas.length})`
          : compra.descricao,
        categoria: compra.categoria,
        valor: p.valor,
        vencimento: p.vencimento,
        competencia: competenciaDe(p.vencimento),
        status: "pendente",
        origem: "compra",
        origem_id: compra.id,
        parcela_numero: p.numero,
        parcela_total: parcelas.length,
        conta_id: compra.conta_id,
        fornecedor_id: compra.fornecedor_id,
        idempotency_key: chaveDaCompra(compra.id, p.numero),
        created_by: autor.id,
      })),
    "empresa_id,idempotency_key",
  );
  if (erroCompromissos) return { ok: false, erro: erroCompromissos.message ?? "Não deu para lançar as parcelas." };

  // 3. O bem, quando a compra foi marcada como patrimônio (§7).
  //    NÃO lança despesa: o custo já foi contado na compra que o originou, e
  //    contar de novo dobraria a saída no dashboard (§21). O que nasce aqui é
  //    só o registro gerencial do bem.
  if (compra.gera_patrimonio) await nascerPatrimonio(compra, autor);

  // 4. Só agora o pai muda de status.
  if (compra.status === "rascunho") {
    await db().from("fin_compras").update({ status: "confirmada", updated_by: autor.id }).eq("id", compra.id);
  }

  await auditar({
    empresa_id: compra.empresa_id, entidade: "compra", entidade_id: compra.id,
    acao: "confirmar", user_id: autor.id, user_nome: autor.nome,
    dados: { parcelas: parcelas.length, valor_total: compra.valor_total },
  });

  return { ok: true, dados: { compromissos: parcelas.length } };
}

// ── Pagar compromisso (§6, §16, §22) ─────────────────────────────────────────

/**
 * Dá baixa: grava o movimento, marca o compromisso e atualiza a origem.
 *
 * "Clique duplo em pagar gera somente um movimento" (§22) sai do índice único
 * em `(empresa_id, idempotency_key)`: a segunda gravação bate no banco e volta
 * como `jaEstava`, não como erro na cara de quem clicou.
 */
export async function pagarCompromisso(
  entrada: { compromissoId: string; contaId: string; valor?: number; data?: string; observacao?: string },
  autor: Autor,
): Promise<Resultado<{ movimento_id: string | null }>> {
  const { data: c, error } = await db()
    .from("fin_compromissos")
    .select("id,empresa_id,descricao,valor,status,origem,origem_id")
    .eq("id", entrada.compromissoId)
    .maybeSingle();

  if (error || !c) return { ok: false, erro: "Compromisso não encontrado." };
  if (c.status === "cancelado") return { ok: false, erro: "Compromisso cancelado não pode ser pago." };
  if (c.status === "pago") return { ok: true, jaEstava: true, dados: { movimento_id: null } };

  const { data: conta } = await db()
    .from("fin_contas").select("id,empresa_id").eq("id", entrada.contaId).maybeSingle();
  if (!conta) return { ok: false, erro: "Conta não encontrada." };
  // §2: nunca deixar um pagamento da Tridi sair da conta da Gedux. O gatilho do
  // banco também barra; aqui a mensagem fica legível em vez de virar exceção.
  if (conta.empresa_id !== c.empresa_id) return { ok: false, erro: "A conta é de outra empresa." };

  const valor = centavos(entrada.valor ?? Number(c.valor));
  const quando = entrada.data ?? hojeISO();

  const { data: mov, error: erroMov } = await db()
    .from("fin_movimentos")
    .insert({
      empresa_id: c.empresa_id,
      conta_id: entrada.contaId,
      tipo: "saida",
      valor: -Math.abs(valor),          // saída é negativa: o saldo é uma soma
      descricao: entrada.observacao || c.descricao,
      compromisso_id: c.id,
      ocorrido_em: `${quando}T12:00:00Z`,
      status: "confirmado",
      idempotency_key: `pag:${c.id}`,
      created_by: autor.id,
    })
    .select("id")
    .maybeSingle();

  if (erroMov && !ehDuplicado(erroMov)) return { ok: false, erro: erroMov.message };
  // Duplicado = outro clique chegou primeiro. O estado final é o mesmo, então
  // isto é sucesso — devolver erro faria a tela dizer "falhou" para uma conta
  // que acabou de ser paga.
  const jaEstava = !!erroMov && ehDuplicado(erroMov);

  // `pago_em` é a DATA DO PAGAMENTO, a mesma do movimento — não o instante do
  // clique. Com `new Date()` uma baixa lançada às 22h (ou retroativa, para
  // ontem) ficava com "Pago em" num dia diferente do extrato da conta.
  await db()
    .from("fin_compromissos")
    .update({
      status: "pago", pago_em: `${quando}T12:00:00Z`, pago_valor: valor,
      conta_id: entrada.contaId, updated_by: autor.id,
    })
    .eq("id", c.id)
    .neq("status", "pago");

  // A origem acompanha: compra totalmente paga vira "recebida" só quando não
  // sobra parcela em aberto (§21 — o compromisso ATUALIZA a origem, não a cria).
  if (c.origem === "compra" && c.origem_id) await sincronizarCompra(c.origem_id);

  await auditar({
    empresa_id: c.empresa_id, entidade: "compromisso", entidade_id: c.id,
    acao: jaEstava ? "pagar-repetido" : "pagar", user_id: autor.id, user_nome: autor.nome,
    dados: { valor, conta_id: entrada.contaId },
  });

  return { ok: true, jaEstava, dados: { movimento_id: mov?.id ?? null } };
}

/**
 * O bem que nasce de uma compra marcada como patrimônio (§7).
 *
 * A chave `pat:compra:<id>` + o índice único de `fin_patrimonio` são o que
 * impede o mesmo bem de existir duas vezes quando a confirmação da compra é
 * reprocessada — e patrimônio duplicado não é uma linha a mais numa lista: é o
 * total do patrimônio da empresa contando duas vezes o que existe uma vez só.
 *
 * O CÓDIGO é o único ponto que precisa de tentativa: ele vem de "o maior + 1", e
 * duas confirmações no mesmo segundo leem o mesmo maior. O índice único de
 * código recusa a segunda, e aí basta pegar o próximo — três tentativas cobrem
 * qualquer disputa real.
 */
async function nascerPatrimonio(
  compra: { id: string; empresa_id: string; descricao: string; data: string; valor_total: number; fornecedor_id: string | null },
  autor: Autor,
): Promise<void> {
  const { proximoCodigoPatrimonio } = await import("./db");
  const chave = `pat:compra:${compra.id}`;

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const linha = {
          empresa_id: compra.empresa_id,
          codigo: await proximoCodigoPatrimonio(compra.empresa_id),
          descricao: compra.descricao,
          // A compra tem categoria de COMPRA ("patrimonio"), que não é uma
          // categoria de BEM. Entra como "outros" para alguém classificar —
          // chutar "equipamentos" encheria o relatório de palpite nosso.
          categoria: "outros",
          fornecedor_id: compra.fornecedor_id,
          compra_id: compra.id,
          valor: centavos(Number(compra.valor_total)),
          aquisicao: compra.data,
          status: "em_uso",
          idempotency_key: chave,
          created_by: autor.id,
    };
    let { error } = await db()
      .from("fin_patrimonio")
      .upsert(linha, { onConflict: "empresa_id,idempotency_key", ignoreDuplicates: true });
    // Banco sem o índice total (financeiro_indice_total.sql ainda não rodou):
    // insere direto; o duplicado de chave ou de código cai no tratamento abaixo.
    if (ehSemIndiceParaOnConflict(error)) ({ error } = await db().from("fin_patrimonio").insert(linha));

    if (!error) return;                       // criado, ou já existia
    if (!ehDuplicado(error)) return;          // erro de verdade: não insiste
    // Duplicado pode ser a CHAVE (já nasceu — nada a fazer) ou o CÓDIGO (outra
    // confirmação pegou o número primeiro). Só o segundo caso merece tentar de
    // novo; o primeiro sai na próxima volta sem criar nada, porque a chave
    // continua batendo.
    if ((error.message ?? "").includes("fin_patrimonio_idem")) return;
  }
}

/** Compra cujas parcelas foram todas pagas passa a "recebida". */
async function sincronizarCompra(compraId: string): Promise<void> {
  try {
    const { data } = await db()
      .from("fin_compromissos")
      .select("status")
      .eq("origem", "compra")
      .eq("origem_id", compraId)
      .limit(200);
    const linhas = (data ?? []) as { status: string }[];
    if (!linhas.length) return;
    const tudoQuitado = linhas.every((l) => l.status === "pago" || l.status === "cancelado");
    if (tudoQuitado) await db().from("fin_compras").update({ status: "recebida" }).eq("id", compraId);
  } catch { /* sincronizar status não pode derrubar a baixa que já aconteceu */ }
}

// ── Reverter pagamento (§16, §19, §22) ───────────────────────────────────────

/**
 * Reverte a baixa PRESERVANDO o movimento original (§19: movimento confirmado
 * é imutável). Nasce um movimento de reversão apontando para ele, e o
 * compromisso volta para "pendente". Apagar seria mais curto e destruiria o
 * extrato — a conta bateria com nada.
 */
export async function reverterPagamento(
  compromissoId: string, autor: Autor,
): Promise<Resultado<{ reversao_id: string | null }>> {
  const { data: c } = await db()
    .from("fin_compromissos")
    .select("id,empresa_id,descricao,status")
    .eq("id", compromissoId)
    .maybeSingle();
  if (!c) return { ok: false, erro: "Compromisso não encontrado." };
  if (c.status !== "pago") return { ok: true, jaEstava: true, dados: { reversao_id: null } };

  const { data: original } = await db()
    .from("fin_movimentos")
    .select("id,conta_id,valor,empresa_id")
    .eq("compromisso_id", c.id)
    .eq("status", "confirmado")
    .order("ocorrido_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  let reversaoId: string | null = null;
  if (original) {
    const { data: rev, error } = await db()
      .from("fin_movimentos")
      .insert({
        empresa_id: original.empresa_id,
        conta_id: original.conta_id,
        tipo: "reversao",
        valor: -Number(original.valor),          // desfaz exatamente o sinal do original
        descricao: `Estorno — ${c.descricao}`,
        compromisso_id: c.id,
        reverte_id: original.id,
        status: "confirmado",
        idempotency_key: `rev:${original.id}`,
        created_by: autor.id,
      })
      .select("id")
      .maybeSingle();
    if (error && !ehDuplicado(error)) return { ok: false, erro: error.message };
    reversaoId = rev?.id ?? null;
    await db().from("fin_movimentos").update({ status: "revertido" }).eq("id", original.id);
  }

  await db()
    .from("fin_compromissos")
    .update({ status: "pendente", pago_em: null, pago_valor: null, updated_by: autor.id })
    .eq("id", c.id);

  await auditar({
    empresa_id: c.empresa_id, entidade: "compromisso", entidade_id: c.id,
    acao: "reverter", user_id: autor.id, user_nome: autor.nome,
    dados: { movimento_original: original?.id ?? null, reversao: reversaoId },
  });

  return { ok: true, dados: { reversao_id: reversaoId } };
}

// ── Transferência entre contas (§11, §16) ────────────────────────────────────

/**
 * Duas pernas com o mesmo `transfer_group_id`. Se a segunda falhar, a primeira
 * é desfeita: sem isso a transferência sumiria dinheiro de uma conta sem
 * colocar na outra, e o extrato ficaria mentindo até alguém conferir na mão.
 */
export async function transferir(
  entrada: { empresaId: string; deId: string; paraId: string; valor: number; data?: string; descricao?: string },
  autor: Autor,
): Promise<Resultado<{ grupo: string }>> {
  const valor = Math.abs(centavos(entrada.valor));
  if (!valor) return { ok: false, erro: "Informe um valor." };
  if (entrada.deId === entrada.paraId) return { ok: false, erro: "Escolha duas contas diferentes." };

  const { data: contas } = await db()
    .from("fin_contas").select("id,empresa_id,nome").in("id", [entrada.deId, entrada.paraId]).limit(2);
  const lista = (contas ?? []) as { id: string; empresa_id: string; nome: string }[];
  if (lista.length !== 2) return { ok: false, erro: "Conta não encontrada." };
  if (lista.some((c) => c.empresa_id !== entrada.empresaId)) return { ok: false, erro: "As contas são de outra empresa." };

  const grupo = crypto.randomUUID();
  const quando = `${entrada.data ?? hojeISO()}T12:00:00Z`;
  const nome = (id: string) => lista.find((c) => c.id === id)?.nome ?? "conta";
  const texto = entrada.descricao || `Transferência ${nome(entrada.deId)} → ${nome(entrada.paraId)}`;

  const { data: saida, error: erroSaida } = await db()
    .from("fin_movimentos")
    .insert({
      empresa_id: entrada.empresaId, conta_id: entrada.deId, tipo: "transferencia",
      valor: -valor, descricao: texto, transfer_group_id: grupo,
      ocorrido_em: quando, status: "confirmado", idempotency_key: `trf:${grupo}:out`, created_by: autor.id,
    })
    .select("id")
    .maybeSingle();
  if (erroSaida) return { ok: false, erro: erroSaida.message };

  const { error: erroEntrada } = await db().from("fin_movimentos").insert({
    empresa_id: entrada.empresaId, conta_id: entrada.paraId, tipo: "transferencia",
    valor, descricao: texto, transfer_group_id: grupo,
    ocorrido_em: quando, status: "confirmado", idempotency_key: `trf:${grupo}:in`, created_by: autor.id,
  });

  if (erroEntrada) {
    // A perna que entrou falhou: desfazer a que saiu. Ainda não foi vista por
    // ninguém (mesmo instante), então apagar aqui é honesto — não é reescrever
    // extrato, é não deixar meia transferência de pé.
    if (saida?.id) await db().from("fin_movimentos").delete().eq("id", saida.id);
    return { ok: false, erro: erroEntrada.message };
  }

  await auditar({
    empresa_id: entrada.empresaId, entidade: "movimento", entidade_id: saida?.id ?? null,
    acao: "transferir", user_id: autor.id, user_nome: autor.nome,
    dados: { de: entrada.deId, para: entrada.paraId, valor, grupo },
  });

  return { ok: true, dados: { grupo } };
}

// ── Ajuste de saldo (§11) ────────────────────────────────────────────────────

/**
 * Corrige o saldo lançando um movimento de ajuste.
 *
 * ERA A ÚNICA OPERAÇÃO DE DINHEIRO SEM TRAVA no módulo. Clique duplo criava
 * DOIS ajustes e dobrava a correção — e como o saldo é derivado da soma dos
 * movimentos, não existe estado de "já ajustei" para a tela detectar: o número
 * simplesmente fica errado, e a pessoa ajusta de novo tentando consertar.
 *
 * A chave aqui não pode ser permanente como as outras. "Tarifa não lançada" de
 * R$ 12 é um ajuste que pode acontecer de verdade duas vezes, em meses
 * diferentes — uma chave eterna recusaria o segundo lançamento legítimo. Então
 * ela leva o MINUTO: o mesmo ajuste repetido dentro do mesmo minuto é o clique
 * duplo e é recusado; daqui a uma hora, ou no mês que vem, passa normalmente.
 */
export async function ajustarSaldo(
  entrada: { empresaId: string; contaId: string; valor: number; motivo: string },
  autor: Autor,
): Promise<Resultado> {
  const valor = centavos(entrada.valor);
  if (!valor) return { ok: false, erro: "Informe um valor diferente de zero." };
  const motivo = entrada.motivo?.trim();
  if (!motivo) return { ok: false, erro: "Escreva o motivo do ajuste." };

  const minuto = new Date().toISOString().slice(0, 16);   // AAAA-MM-DDTHH:MM
  const chave = `aj:${entrada.contaId}:${valor}:${minuto}`;

  const { error } = await db().from("fin_movimentos").insert({
    empresa_id: entrada.empresaId, conta_id: entrada.contaId, tipo: "ajuste",
    valor, descricao: `Ajuste — ${motivo}`, status: "confirmado",
    idempotency_key: chave, created_by: autor.id,
  });

  // Duplicado = o mesmo ajuste chegou de novo no mesmo minuto. O estado final é
  // o que a pessoa pediu, então isto é sucesso: devolver erro faria a tela
  // dizer "falhou" para um ajuste que acabou de ser gravado, e o próximo
  // reflexo é tentar mais uma vez.
  if (error && !ehDuplicado(error)) return { ok: false, erro: error.message };
  const jaEstava = !!error && ehDuplicado(error);

  await auditar({
    empresa_id: entrada.empresaId, entidade: "conta", entidade_id: entrada.contaId,
    acao: jaEstava ? "ajustar-saldo-repetido" : "ajustar-saldo",
    user_id: autor.id, user_nome: autor.nome,
    dados: { valor, motivo },
  });
  return { ok: true, jaEstava };
}

// ── Folha do mês (§13) ───────────────────────────────────────────────────────

/**
 * Transforma as pessoas ativas nos compromissos da folha daquela competência.
 *
 * A Visão Geral já mostrava "Folha do mês" — mas era só uma soma de
 * salário + benefício, uma projeção que nunca virava obrigação na agenda. Quem
 * olhava o "a pagar em 30 dias" não via a maior conta do mês lá dentro.
 *
 * §13: salário-base é PROJEÇÃO e o fechamento confirma o valor real. É por isso
 * que isto GERA e não trava: o compromisso nasce com o valor projetado, e editar
 * o valor dele antes de pagar é o fechamento. Rodar de novo depois de editar não
 * desfaz a edição — a chave `folha:<pessoa>:<AAAA-MM>` já existe e o banco
 * recusa a segunda gravação.
 *
 * Desligado não entra. Afastado ENTRA: afastamento não suspende salário por si
 * só, e decidir isso pela pessoa seria o sistema inventando regra trabalhista.
 */
export async function gerarFolha(
  empresaId: string, competencia: string, autor: Autor,
): Promise<Resultado<{ criados: number; pessoas: number; total: number }>> {
  const comp = competenciaDe(competencia);
  const [ano, mes] = comp.split("-").map(Number);

  // `gratificacao` entra na lista com tolerância: quem ainda não rodou o SQL
  // novo continua gerando a folha sem ela, em vez de ver a tela morrer num 400
  // do PostgREST por coluna inexistente.
  const colunas = "id,nome,salario_base,beneficios,dia_pagamento,status";
  let { data, error } = await db()
    .from("fin_colaboradores")
    .select(`${colunas},gratificacao`)
    .eq("empresa_id", empresaId)
    .neq("status", "desligado")
    .limit(500);
  if (error) {
    ({ data, error } = await db()
      .from("fin_colaboradores")
      .select(colunas)
      .eq("empresa_id", empresaId)
      .neq("status", "desligado")
      .limit(500));
  }
  if (error) return { ok: false, erro: error.message };

  const pessoas = (data ?? []) as {
    id: string; nome: string; salario_base: number; beneficios: number;
    gratificacao?: number | null; dia_pagamento: number | null; status: string;
  }[];

  // O que muda no mês: bônus e hora extra somam, vale/falta/farmácia/mercadinho
  // descontam. O sinal vem do catálogo de tipos, nunca do número gravado.
  const ajuste = new Map<string, number>();
  const { data: lanc } = await db()
    .from("fin_folha_lancamentos")
    .select("colaborador_id,tipo,valor")
    .eq("empresa_id", empresaId)
    .eq("competencia", comp)
    .limit(2000);
  for (const l of (lanc ?? []) as { colaborador_id: string; tipo: LancamentoTipo; valor: number }[]) {
    const sinal = LANCAMENTO[l.tipo]?.sinal ?? 0;
    ajuste.set(l.colaborador_id, (ajuste.get(l.colaborador_id) ?? 0) + sinal * Number(l.valor));
  }

  /** Bruto + gratificação + o que o mês mudou, nunca abaixo de zero. */
  const aPagarDe = (p: (typeof pessoas)[number]) =>
    Math.max(0, centavos(
      Number(p.salario_base) + Number(p.beneficios) + Number(p.gratificacao ?? 0)
      + (ajuste.get(p.id) ?? 0),
    ));
  // Quem está com salário e benefício zerados não vira uma conta de R$ 0,00 na
  // agenda — isso é cadastro pela metade, não obrigação.
  const aPagar = pessoas.filter((p) => aPagarDe(p) > 0);
  if (!aPagar.length) return { ok: true, dados: { criados: 0, pessoas: pessoas.length, total: 0 } };

  const linhas = aPagar.map((p) => {
    const valor = aPagarDe(p);
    return {
      empresa_id: empresaId,
      descricao: `Folha — ${p.nome}`,
      categoria: "colaboradores",
      valor,
      // `diaSeguro` porque "todo dia 31" em fevereiro tem que virar 28, e não
      // escorregar para março — folha paga no mês seguinte é problema sério.
      vencimento: diaSeguro(ano, mes, p.dia_pagamento ?? 5),
      competencia: comp,
      status: "previsto",
      origem: "folha",
      origem_id: p.id,
      colaborador_id: p.id,
      idempotency_key: chaveDaFolha(p.id, comp),
      created_by: autor.id,
    };
  });

  const { error: erroInsert } = await upsertIdempotente(
    "fin_compromissos", linhas, "empresa_id,idempotency_key");
  if (erroInsert) return { ok: false, erro: erroInsert.message ?? "Não deu para gerar a folha." };

  const total = centavos(linhas.reduce((s, l) => s + l.valor, 0));
  await auditar({
    empresa_id: empresaId, entidade: "folha", acao: "gerar",
    user_id: autor.id, user_nome: autor.nome,
    dados: { competencia: comp, pessoas: aPagar.length, total },
  });

  return { ok: true, dados: { criados: linhas.length, pessoas: aPagar.length, total } };
}

// ── Gerador de recorrências (§10, §16, §22) ──────────────────────────────────

/**
 * Transforma as regras ativas nos compromissos que faltam, até `ate`.
 *
 * "Recorrência gera exatamente um compromisso por competência" (§22) sai da
 * chave `rec:<id>:<AAAA-MM>`: rodar o gerador dez vezes no mesmo dia não muda
 * nada depois da primeira.
 *
 * `proxima_competencia` só anda DEPOIS de os compromissos existirem. Andar
 * antes deixaria um buraco permanente na agenda se a chamada caísse no meio —
 * e um buraco na agenda é uma conta que ninguém paga.
 */
export async function gerarRecorrencias(
  empresaId: string, ate: string, autor: Autor, opts: { recorrenciaId?: string } = {},
): Promise<Resultado<{ criados: number; regras: number }>> {
  // `recorrenciaId` gera UMA regra só. É o que a agenda usa quando alguém
  // clica numa previsão: lançar aquela conta não pode lançar de tabela as
  // outras nove que ainda não venceram. O caminho é o MESMO — a chave de
  // idempotência é a mesma —, então clicar na previsão e mandar gerar tudo no
  // minuto seguinte não cria a conta duas vezes.
  let q = db()
    .from("fin_recorrencias")
    .select("id,empresa_id,descricao,categoria,valor,periodicidade,intervalo_meses,dia_vencimento,conta_id,fornecedor_id,inicio,fim,proxima_competencia,status")
    .eq("empresa_id", empresaId)
    .eq("status", "ativa");
  if (opts.recorrenciaId) q = q.eq("id", opts.recorrenciaId);
  const { data, error } = await q.limit(300);
  if (error) return { ok: false, erro: error.message };

  const regras = (data ?? []) as {
    id: string; descricao: string; categoria: string | null; valor: number;
    periodicidade: string; intervalo_meses: number; dia_vencimento: number;
    conta_id: string | null; fornecedor_id: string | null;
    inicio: string; fim: string | null; proxima_competencia: string | null; status: string;
  }[];

  let criados = 0;
  for (const r of regras) {
    const pendentes = geracoesPendentes(
      {
        id: r.id, valor: Number(r.valor),
        periodicidade: r.periodicidade as never, intervalo_meses: r.intervalo_meses,
        dia_vencimento: r.dia_vencimento, inicio: r.inicio, fim: r.fim,
        proxima_competencia: r.proxima_competencia, status: r.status,
      },
      ate,
    );
    if (!pendentes.length) continue;

    for (const pendente of pendentes) {
      const materializada = await materializarOcorrencia(empresaId, r.id, pendente.competencia, autor);
      if (materializada.ok && materializada.dados?.criado) criados++;
    }
  }

  if (criados) {
    await auditar({
      empresa_id: empresaId, entidade: "recorrencia", acao: "gerar",
      user_id: autor.id, user_nome: autor.nome, dados: { criados, regras: regras.length, ate },
    });
  }
  return { ok: true, dados: { criados, regras: regras.length } };
}
