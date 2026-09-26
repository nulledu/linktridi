// ── Folha mensal · leitura e escrita ─────────────────────────────────────────
// A parte com banco. As REGRAS (DSR, 5º dia útil, líquido) moram em
// `folha-mensal.ts`, puras e testadas — aqui é só buscar, herdar e gravar.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createTridiMarketAdminClient } from "@/lib/tridimarket/client";
import { centavos } from "./calculos";
import type { FolhaDoMes, PontoDaPessoa } from "./folha-mensal";

const db = () => createSupabaseAdminClient();

const COLS_MES =
  "id,empresa_id,colaborador_id,competencia,salario,bonus,comissao,gratificacao,"
  + "beneficios,vale,convenio_farmacia,mercadinho,faltas,pago,pago_em";
/** As partes da comissão chegaram depois — leitura em degrau, como sempre. */
const COLS_COMISSOES = "comissao_vendas,comissao_trafego,comissao_marketplace,comissao_outros";
/** Os interruptores de entrada automática (financeiro_folha_automatico.sql). */
const COLS_AUTO = "auto_vendas,auto_trafego,auto_marketplace";
/** Booleanos que a regrinha grava junto com as partes. Nulo = padrão pela data. */
export const CAMPOS_AUTO = ["auto_vendas", "auto_trafego", "auto_marketplace"] as const;

/** Campos numéricos que a tela edita direto na tabela. Lista FECHADA: é ela
 *  que impede um corpo malicioso de escrever `pago_em` ou `empresa_id`. */
export const CAMPOS_EDITAVEIS = [
  "salario", "bonus", "gratificacao", "beneficios",
  "vale", "convenio_farmacia", "mercadinho",
  // A comissão é editada PELAS PARTES: o total (`comissao`) é gatilho no
  // banco, e aceitar escrita direta nele seria aceitar um número que o
  // próprio banco descarta.
  "comissao_vendas", "comissao_trafego", "comissao_marketplace", "comissao_outros",
] as const;
export type CampoEditavel = (typeof CAMPOS_EDITAVEIS)[number];

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function linhaDoBanco(r: Record<string, unknown>): FolhaDoMes {
  return {
    id: String(r.id),
    colaborador_id: String(r.colaborador_id),
    competencia: String(r.competencia).slice(0, 10),
    salario: num(r.salario), bonus: num(r.bonus), comissao: num(r.comissao),
    comissao_vendas: num(r.comissao_vendas), comissao_trafego: num(r.comissao_trafego),
    comissao_marketplace: num(r.comissao_marketplace), comissao_outros: num(r.comissao_outros),
    gratificacao: num(r.gratificacao), beneficios: num(r.beneficios),
    vale: num(r.vale), convenio_farmacia: num(r.convenio_farmacia), mercadinho: num(r.mercadinho),
    faltas: Array.isArray(r.faltas) ? (r.faltas as string[]).map((f) => String(f).slice(0, 10)) : [],
    pago: r.pago === true,
    pago_em: r.pago_em ? String(r.pago_em) : null,
    auto_vendas: typeof r.auto_vendas === "boolean" ? r.auto_vendas : null,
    auto_trafego: typeof r.auto_trafego === "boolean" ? r.auto_trafego : null,
    auto_marketplace: typeof r.auto_marketplace === "boolean" ? r.auto_marketplace : null,
  };
}

/**
 * O mês que ainda não existe NASCE daqui.
 *
 * Só salário e gratificação atravessam de um mês para o outro — são os fixos.
 * Bônus, comissão, benefícios, vale, convênio, mercadinho e faltas nascem
 * ZERADOS, que é o pedido literal do dono ("os benefícios, bônus e etc têm que
 * zerar todo mês"): cada um é fato DAQUELE mês, e um desconto que atravessa
 * mês é como o vale de julho vira dívida eterna.
 *
 * A herança vem da linha mais recente ANTERIOR à competência (aumentou em
 * outubro, novembro herda o novo valor); sem mês anterior, do cadastro.
 */
function mesNovo(
  colaborador: { id: string; salario_base: number; gratificacao: number },
  competencia: string,
  herdado: { salario: number; gratificacao: number } | undefined,
): FolhaDoMes {
  return {
    id: null,
    colaborador_id: colaborador.id,
    competencia,
    salario: herdado?.salario ?? num(colaborador.salario_base),
    gratificacao: herdado?.gratificacao ?? num(colaborador.gratificacao),
    bonus: 0, comissao: 0, beneficios: 0,
    comissao_vendas: 0, comissao_trafego: 0, comissao_marketplace: 0, comissao_outros: 0,
    vale: 0, convenio_farmacia: 0, mercadinho: 0,
    faltas: [], pago: false, pago_em: null,
    // Nulo = a regra pela data (setembro/2026 em diante automático).
    auto_vendas: null, auto_trafego: null, auto_marketplace: null,
  };
}

export interface FolhaMensalDoEscopo {
  linhas: FolhaDoMes[];
  /** `colaborador_id` → consumo no mercadinho no mês (só quem tem vínculo). */
  mercadinhoSugerido: Record<string, number>;
  /** O SQL da folha mensal ainda não rodou neste banco. */
  pendente: boolean;
  /** As colunas de comissão por área ainda não existem (SQL em degrau). */
  comissoesPendentes: boolean;
  /** Os interruptores de entrada automática ainda não existem (SQL em degrau). */
  autoPendentes: boolean;
}

/**
 * A folha de uma competência, uma linha por pessoa — materializada ou não.
 *
 * Quem já tem linha gravada vem do banco; quem não tem vem calculado (herança
 * + zeros), SEM gravar: materializar todo mundo no GET encheria a tabela de
 * meses que ninguém tocou. A linha só nasce de verdade na primeira escrita.
 */
/**
 * Em qual degrau de colunas o banco parou, e até quando isso vale. Vive no
 * módulo (o processo aprende, não a requisição): nível 0 = tudo existe,
 * 1 = sem as colunas automáticas, 2 = sem as de comissão também.
 */
const DEGRAU = { ate: 0, nivel: 0 };

export async function folhaDoMes(
  colaboradores: { id: string; empresa_id: string; employee_id: string | null; salario_base: number; gratificacao: number }[],
  competencia: string,
): Promise<FolhaMensalDoEscopo> {
  const ids = colaboradores.map((c) => c.id);
  if (!ids.length) return { linhas: [], mercadinhoSugerido: {}, pendente: false, comissoesPendentes: false, autoPendentes: false };

  const doMesCom = (cols: string) => db().from("fin_folha_mensal").select(cols)
    .in("colaborador_id", ids).eq("competencia", competencia).limit(400);
  // Degrau em três: com interruptores e partes; só as partes; só o básico.
  // Sem elas, a folha continua abrindo inteira (partes zeradas, interruptores
  // no padrão pela data) em vez de cair no modo "SQL não rodado".
  // Enquanto o SQL não roda, o degrau de cima falha SEMPRE — e cada tentativa
  // é uma ida de 250–700 ms paga só para receber PGRST204. O processo lembra
  // por um minuto em qual degrau parou e começa por ele.
  let comissoesPendentes = DEGRAU.ate > Date.now() && DEGRAU.nivel === 2;
  let autoPendentes = DEGRAU.ate > Date.now() && DEGRAU.nivel >= 1;
  const primeiro = autoPendentes
    ? (comissoesPendentes ? doMesCom(COLS_MES) : doMesCom(`${COLS_MES},${COLS_COMISSOES}`))
    : doMesCom(`${COLS_MES},${COLS_COMISSOES},${COLS_AUTO}`);
  const [doMes, anteriores, mercadinhoSugerido] = await Promise.all([
    primeiro.then(async (r: { error: unknown; data: unknown }) => {
      if (!r.error) return r;
      if (comissoesPendentes) return r;   // já é o degrau mais baixo
      autoPendentes = true;
      DEGRAU.ate = Date.now() + 60_000; DEGRAU.nivel = 1;
      const r2 = await doMesCom(`${COLS_MES},${COLS_COMISSOES}`);
      if (!r2.error) return r2;
      comissoesPendentes = true;
      DEGRAU.nivel = 2;
      return doMesCom(COLS_MES);
    }),
    // A linha mais recente ANTERIOR de cada pessoa, para herdar salário.
    // 600 linhas cobrem 23 pessoas × 2 anos; quem passar disso herda do
    // cadastro, que é o comportamento antigo — nunca um erro.
    db().from("fin_folha_mensal").select("colaborador_id,competencia,salario,gratificacao")
      .in("colaborador_id", ids).lt("competencia", competencia)
      .order("competencia", { ascending: false }).limit(600),
    consumoDoMercadinho(colaboradores, competencia),
  ]);

  // Tabela ausente = SQL ainda não rodado. A folha abre no modo calculado e a
  // tela avisa; nada quebra.
  if (doMes.error) {
    return {
      linhas: colaboradores.map((c) => mesNovo(c, competencia, undefined)),
      mercadinhoSugerido,
      pendente: true,
      comissoesPendentes,
      autoPendentes,
    };
  }

  const gravadas = new Map<string, FolhaDoMes>();
  for (const r of (doMes.data ?? []) as Record<string, unknown>[]) {
    const linha = linhaDoBanco(r);
    gravadas.set(linha.colaborador_id, linha);
  }

  const heranca = new Map<string, { salario: number; gratificacao: number }>();
  for (const r of (anteriores.data ?? []) as Record<string, unknown>[]) {
    const cid = String(r.colaborador_id);
    // Ordenado por competência DESC: a primeira vista é a mais recente.
    if (!heranca.has(cid)) heranca.set(cid, { salario: num(r.salario), gratificacao: num(r.gratificacao) });
  }

  return {
    linhas: colaboradores.map((c) => gravadas.get(c.id) ?? mesNovo(c, competencia, heranca.get(c.id))),
    mercadinhoSugerido,
    pendente: false,
    comissoesPendentes,
    autoPendentes,
  };
}

/**
 * O consumo de cada pessoa no mercadinho, no mês TRABALHADO.
 *
 * "Pagamento do mês 9 é referente aos gastos do mês 8": os gastos entram na
 * competência 8, que é a que se paga em setembro — a referência já é a certa
 * porque a folha inteira é indexada pelo mês trabalhado.
 *
 * A ponte é FORTE ou não existe: `mercadinho.funcionarios.usuario_id` =
 * `profiles.id` = `fin_colaboradores.employee_id`. Casar por nome ficou de
 * fora de propósito — folha não desconta por parecido. Quem não tem o vínculo
 * fica de fora da sugestão e o campo continua editável na mão.
 *
 * É SUGESTÃO, não escrita: o valor só entra na folha quando alguém manda
 * aplicar. Descontar dinheiro em silêncio é o tipo de mágica que ninguém
 * consegue auditar depois.
 */
async function consumoDoMercadinho(
  colaboradores: { id: string; employee_id: string | null }[],
  competencia: string,
): Promise<Record<string, number>> {
  const comVinculo = colaboradores.filter((c) => c.employee_id);
  if (!comVinculo.length) return {};
  try {
    const market = createTridiMarketAdminClient();
    const { data: funcionarios, error: erroF } = await market
      .from("funcionarios")
      .select("id,usuario_id")
      .in("usuario_id", comVinculo.map((c) => c.employee_id as string))
      .limit(200);
    if (erroF || !funcionarios?.length) return {};

    const paraColaborador = new Map<number, string>();
    for (const f of funcionarios as { id: number; usuario_id: string }[]) {
      const dono = comVinculo.find((c) => c.employee_id === f.usuario_id);
      if (dono) paraColaborador.set(Number(f.id), dono.id);
    }

    const [ano, mes] = competencia.split("-").map(Number);
    const inicio = `${competencia.slice(0, 8)}01T00:00:00`;
    const fim = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10) + "T00:00:00";
    const { data: vendas, error: erroV } = await market
      .from("vendas")
      .select("funcionario_id,total")
      .in("funcionario_id", [...paraColaborador.keys()])
      .gte("criado_em", inicio).lt("criado_em", fim)
      .limit(5000);
    if (erroV) return {};

    const out: Record<string, number> = {};
    for (const v of (vendas ?? []) as { funcionario_id: number; total: number }[]) {
      const cid = paraColaborador.get(Number(v.funcionario_id));
      if (cid) out[cid] = centavos((out[cid] ?? 0) + num(v.total));
    }
    return out;
  } catch {
    // Mercadinho fora do ar não derruba a folha: a sugestão some, o campo fica.
    return {};
  }
}

const COMPETENCIA = /^\d{4}-\d{2}-01$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Grava (ou corrige) campos do mês de UMA pessoa.
 *
 * A linha que ainda não existe é materializada aqui com a mesma herança do
 * GET — sem isso, o primeiro upsert parcial nasceria com salário zero, e um
 * "marquei como pago" criaria um mês inteiro zerado por baixo.
 */
export async function gravarMesDaFolha(entrada: {
  colaboradorId: string;
  competencia: string;
  patch: Partial<Record<CampoEditavel, number>> & { faltas?: string[]; pago?: boolean };
  autorId: string;
}): Promise<{ ok: true; linha: FolhaDoMes } | { ok: false; erro: string; status: number }> {
  const { colaboradorId, competencia, patch, autorId } = entrada;
  if (!COMPETENCIA.test(competencia)) {
    return { ok: false, erro: "Competência inválida — use o 1º dia do mês.", status: 400 };
  }

  const { data: pessoa, error: erroPessoa } = await db()
    .from("fin_colaboradores")
    .select("id,empresa_id,employee_id,salario_base,gratificacao")
    .eq("id", colaboradorId).maybeSingle();
  if (erroPessoa) return { ok: false, erro: erroPessoa.message, status: 500 };
  if (!pessoa) return { ok: false, erro: "Pessoa não encontrada na folha.", status: 404 };

  // Valores: número, nunca negativo. Desconto negativo é crédito disfarçado.
  const limpo: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITAVEIS) {
    const v = patch[campo];
    if (v === undefined) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return { ok: false, erro: `Valor inválido em ${campo}.`, status: 400 };
    limpo[campo] = centavos(n);
  }
  if (patch.faltas !== undefined) {
    const faltas = [...new Set(patch.faltas.map((f) => String(f).slice(0, 10)))];
    for (const f of faltas) {
      if (!DATA.test(f)) return { ok: false, erro: `Falta com data inválida: ${f}.`, status: 400 };
      // Falta de outro mês nesta competência bagunçaria o DSR calculado — a
      // semana dela não pertence a este pagamento.
      if (f.slice(0, 7) !== competencia.slice(0, 7)) {
        return { ok: false, erro: `A falta ${f} não é do mês ${competencia.slice(0, 7)}.`, status: 400 };
      }
    }
    limpo.faltas = faltas;
  }
  if (patch.pago !== undefined) {
    limpo.pago = patch.pago === true;
    limpo.pago_em = patch.pago === true ? new Date().toISOString() : null;
  }
  // Interruptores da entrada automática: só booleano ou nulo (= volta ao
  // padrão pela data). Qualquer outra coisa é ignorada, nunca inventada.
  for (const campo of CAMPOS_AUTO) {
    const v = (patch as Record<string, unknown>)[campo];
    if (v === undefined) continue;
    limpo[campo] = v === true ? true : v === false ? false : null;
  }
  if (!Object.keys(limpo).length) return { ok: false, erro: "Nada para gravar.", status: 400 };

  // A base da linha: a gravada, ou o mês novo com herança.
  const folha = await folhaDoMes([pessoa as never], competencia);
  if (folha.pendente) {
    return { ok: false, erro: "Falta rodar supabase/financeiro_folha_mensal.sql para guardar a folha por mês.", status: 503 };
  }
  const base = folha.linhas[0];

  // Sem as colunas novas no banco, escrever uma parte de comissão seria
  // perder o número em silêncio — melhor a frase que diz qual SQL falta.
  const mexeuEmComissao = Object.keys(limpo).some((k) => k.startsWith("comissao_"));
  if (folha.comissoesPendentes && mexeuEmComissao) {
    return { ok: false, erro: "Falta rodar supabase/financeiro_folha_comissoes.sql para guardar a comissão por área.", status: 503 };
  }
  // Os interruptores são acessório da regrinha: sem o SQL deles, as PARTES
  // gravam do mesmo jeito e os interruptores caem no padrão pela data. Recusar
  // a gravação inteira aqui deixou agosto sem comissão nenhuma — a pessoa
  // digitava, o servidor devolvia 503 e o número sumia.
  if (folha.autoPendentes) {
    for (const campo of CAMPOS_AUTO) delete limpo[campo];
    if (!Object.keys(limpo).length) return { ok: true, linha: base };
  }

  const { data, error } = await db()
    .from("fin_folha_mensal")
    .upsert(
      {
        empresa_id: (pessoa as { empresa_id: string }).empresa_id,
        colaborador_id: colaboradorId,
        competencia,
        salario: base.salario, bonus: base.bonus, comissao: base.comissao,
        gratificacao: base.gratificacao, beneficios: base.beneficios,
        ...(folha.comissoesPendentes ? {} : {
          comissao_vendas: base.comissao_vendas, comissao_trafego: base.comissao_trafego,
          comissao_marketplace: base.comissao_marketplace, comissao_outros: base.comissao_outros,
        }),
        ...(folha.autoPendentes ? {} : {
          auto_vendas: base.auto_vendas, auto_trafego: base.auto_trafego, auto_marketplace: base.auto_marketplace,
        }),
        vale: base.vale, convenio_farmacia: base.convenio_farmacia, mercadinho: base.mercadinho,
        faltas: base.faltas, pago: base.pago, pago_em: base.pago_em,
        ...limpo,
        updated_by: autorId, created_by: autorId,
      },
      { onConflict: "colaborador_id,competencia" },
    )
    .select(folha.comissoesPendentes ? COLS_MES : folha.autoPendentes ? `${COLS_MES},${COLS_COMISSOES}` : `${COLS_MES},${COLS_COMISSOES},${COLS_AUTO}`)
    .maybeSingle();
  if (error || !data) return { ok: false, erro: error?.message ?? "Não deu para gravar o mês.", status: 400 };

  return { ok: true, linha: linhaDoBanco(data as Record<string, unknown>) };
}

/**
 * Marca as horas A FAVOR do mês trabalhado como pagas em dinheiro — elas SAEM
 * do banco. É o "sim" do fechamento de pagamento: quem confirma que pagou as
 * extras junto com a folha não precisa abrir o módulo de ponto para dar baixa.
 *
 * Mesma mecânica da rota do ponto (`/api/ponto/pagamentos`): o teto é o
 * crédito ABERTO cuja origem está na janela do mês (já descontando pagamentos
 * anteriores — dois fechamentos seguidos não pagam duas vezes), e a janela
 * fica gravada no pagamento para o extrato do ponto contar a história certa.
 * A ponte é a forte de sempre: employee_id → pessoa do ponto; sem vínculo,
 * sem baixa — a folha nunca debita hora "de alguém parecido".
 */
export async function pagarHorasDoMes(entrada: {
  colaboradorId: string;
  competencia: string;
  autorId: string;
  autorNome: string | null;
}): Promise<{ ok: true; min: number } | { ok: false; erro: string }> {
  try {
    const { data: colab } = await db()
      .from("fin_colaboradores").select("id,employee_id")
      .eq("id", entrada.colaboradorId).maybeSingle();
    const employeeId = (colab as { employee_id: string | null } | null)?.employee_id;
    if (!employeeId) return { ok: false, erro: "Sem vínculo com o ponto — dê baixa por lá." };

    const [{ bancoDaPessoa, feriadosDoMes, hojeSp }, { listPessoas, addPagamento }] = await Promise.all([
      import("@/lib/banco-horas"), import("@/lib/ponto"),
    ]);
    const pessoa = (await listPessoas(true)).find((pp) => pp.colaboradorId === employeeId);
    if (!pessoa) return { ok: false, erro: "Pessoa não encontrada no ponto." };

    const hoje = hojeSp();
    const mes = entrada.competencia.slice(0, 7);
    const [ano, m] = mes.split("-").map(Number);
    const de = `${mes}-01`;
    const ate = `${mes}-${String(new Date(Date.UTC(ano, m, 0)).getUTCDate()).padStart(2, "0")}`;
    // O banco NA VIRADA do mês pago — o mesmo retrato que a folha mostra
    // (`pontoDaFolha`). Lido de hoje, o déficit do mês seguinte já tinha
    // comido o crédito da competência: a folha pagava 7h39 e a baixa gravava
    // 0, e a dívida de setembro era "coberta" por hora que já saiu em dinheiro.
    const banco = await bancoDaPessoa(pessoa, mes, await feriadosDoMes(mes), undefined, ate);
    const { creditoAbertoDoMes } = await import("@/lib/banco-horas");
    const disponivel = creditoAbertoDoMes(banco.ledger, mes);
    // Sem crédito não é erro: o mês pode ter fechado no zero, ou já foi pago.
    if (disponivel <= 0) return { ok: true, min: 0 };

    const pago = await addPagamento({
      pessoaId: pessoa.id, dia: hoje, minutos: disponivel,
      observacao: `Folha de ${mes}`,
      autorId: entrada.autorId, autorNome: entrada.autorNome,
      periodoDe: de, periodoAte: ate,
    });
    if (!pago) return { ok: false, erro: "A tabela de pagamentos do ponto ainda não existe." };

    // O resumo do ponto lembrado por 60s ficou para trás — esquece na hora,
    // senão a tela mostra o banco cheio logo depois de dar baixa nele.
    const { invalidate } = await import("@/lib/cache");
    invalidate(`folha:ponto:${mes}`);
    return { ok: true, min: disponivel };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não deu para dar baixa nas horas." };
  }
}

/**
 * As fotos que os funcionários JÁ TÊM no mercadinho.
 *
 * "Puxe as fotos" — e elas existem: o TridiMarket fotografa cada funcionário
 * no cadastro do totem, em bucket público. Medido em produção: TODOS os
 * colaboradores sem foto própria tinham foto lá. Subir de novo a mesma cara,
 * pessoa por pessoa, seria retrabalho de 23 uploads.
 *
 * É RESERVA, nunca substituta: a foto subida na ficha (logo_url) vence — quem
 * escolheu uma imagem decidiu, e o automático não passa por cima. A mesma
 * ponte forte do consumo (usuario_id = employee_id); sem vínculo, sem foto.
 */
export async function fotosDoMercadinho(
  colaboradores: { id: string; employee_id: string | null }[],
): Promise<Record<string, string>> {
  const comVinculo = colaboradores.filter((c) => c.employee_id);
  if (!comVinculo.length) return {};
  try {
    const market = createTridiMarketAdminClient();
    const { data, error } = await market
      .from("funcionarios")
      .select("usuario_id,foto_url")
      .in("usuario_id", comVinculo.map((c) => c.employee_id as string))
      .not("foto_url", "is", null)
      .limit(200);
    if (error || !data) return {};
    const out: Record<string, string> = {};
    for (const f of data as { usuario_id: string; foto_url: string }[]) {
      const dono = comVinculo.find((c) => c.employee_id === f.usuario_id);
      if (dono && f.foto_url) out[dono.id] = f.foto_url;
    }
    return out;
  } catch {
    return {};
  }
}

// ── O que o PONTO já sabe sobre o mês ────────────────────────────────────────

export async function pontoDaFolha(
  colaboradores: { id: string; employee_id: string | null }[],
  competencia: string,
): Promise<Record<string, PontoDaPessoa>> {
  const comVinculo = colaboradores.filter((c) => c.employee_id);
  if (!comVinculo.length) return {};
  const mes = competencia.slice(0, 7);
  try {
    const { cached } = await import("@/lib/cache");
    return await cached(`folha:ponto:${mes}`, 60_000, async () => {
      const [{ bancoDeTodos, creditoAbertoDoMes }, { listPessoas, feriadosMapa, listPagamentos }] = await Promise.all([
        import("@/lib/banco-horas"), import("@/lib/ponto"),
      ]);
      // O banco da folha é o retrato NA VIRADA: a competência de agosto conta
      // horas até 31/08, mesmo consultada em setembro — pedido literal.
      const [anoM, mesM] = mes.split("-").map(Number);
      const fimDoMes = `${mes}-${String(new Date(Date.UTC(anoM, mesM, 0)).getUTCDate()).padStart(2, "0")}`;
      // `feriadosMapa` só é insumo do BANCO; escrito como `await` dentro da
      // lista, ele segurava as outras duas leituras — que não precisam dele —
      // por uma ida inteira. Encadeado, as três saem juntas.
      const feriadosP = feriadosMapa(mes);
      const [resumos, pessoas, pagamentos] = await Promise.all([
        feriadosP.then((f) => bancoDeTodos(mes, f, undefined, fimDoMes)), listPessoas(true),
        // Horas do mês já pagas em dinheiro: pagamento com a JANELA deste mês.
        // O `desde` filtra pelo dia do pagamento, que nunca vem antes do mês
        // trabalhado — pagar agosto acontece em agosto ou depois.
        listPagamentos(null, `${mes}-01`),
      ]);
      const pagasPorPessoa = new Map<string, number>();
      for (const pg of pagamentos) {
        if (pg.periodoDe?.slice(0, 7) !== mes) continue;
        pagasPorPessoa.set(pg.pessoaId, (pagasPorPessoa.get(pg.pessoaId) ?? 0) + pg.minutos);
      }
      // pessoaId do ponto → colaborador do financeiro, pela ponte forte.
      const donoDoPonto = new Map<string, string>();
      for (const pp of pessoas) {
        const dono = comVinculo.find((c) => c.employee_id === pp.colaboradorId);
        if (dono) donoDoPonto.set(pp.id, dono.id);
      }
      const out: Record<string, PontoDaPessoa> = {};
      for (const r of resumos) {
        const cid = donoDoPonto.get(r.pessoaId);
        if (!cid) continue;
        out[cid] = {
          // A MESMA conta que a baixa usa (`pagarHorasDoMes`): crédito do mês
          // ainda aberto. `saldoMesMin` — a soma crua dos dias — divergia dela
          // sempre que o mês compensou contra outro ou já teve baixa.
          extrasMesMin: creditoAbertoDoMes(r.ledger, mes),
          bancoMin: r.ledger.saldoMin,
          pagasMesMin: pagasPorPessoa.get(r.pessoaId) ?? 0,
          // Só as faltas DESTE mês: o DSR de outra semana não pertence a este
          // pagamento.
          faltasDoPonto: r.ledger.faltasNaoJustificadas
            .map((f) => f.dia).filter((d) => d.startsWith(mes)),
        };
      }
      return out;
    });
  } catch {
    return {};
  }
}
