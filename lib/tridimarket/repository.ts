import { createHash } from "crypto";
import { faturasPorMes, financialStatus, roundMoney, saldoPessoa, scoreAutomatico } from "./domain";
import { unirPessoas, type ContaComCodigo } from "./identidade";
import { MARKET_SETTINGS_PADRAO, type MarketDeviceHealth, type MarketEmployee, type MarketOverview, type MarketPerson, type MarketProduct, type MarketProfile, type MarketPurchaseInput, type MarketSettings, type MarketSyncResult, type MarketUnitSummary } from "./types";
import { movimentoPorHora, produtosMenosVendidos, dividaPorFuncionario } from "./dashboard";
import { agruparLancamentos } from "./razao";

// ── TridiMarket · acesso a dados (schema `mercadinho`) ──────────────────────
// Sistema PRÓPRIO, do zero: nada aqui toca o ERP antigo do mercadinho, que foi
// aposentado. O schema vive no banco principal (supabase/mercadinho-novo.sql) e
// o cliente já entra apontado pra ele — por isso as queries usam nome simples
// (`produtos`, `vendas`), sem prefixo.
//
// Três coisas mudaram de VERDADE em relação ao antigo (não é renomear):
//  1. `venda_itens` tem QUANTIDADE. O antigo gravava uma linha por unidade, e o
//     código contava linhas pra saber quantos itens saíram.
//  2. A dívida sai do RAZÃO (`lancamentos`), não de recalcular vendas em aberto.
//     Uma fonte só de verdade: compra soma, pagamento abate.
//  3. Mínimo de estoque e "pode vender sem ter" moram no próprio `estoque`
//     (eram uma tabela de regras à parte).

// O Supabase não tem tipos gerados aqui; a fronteira dinâmica fica isolada
// nesta camada e tudo que sai é convertido pros tipos Market*.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const DEFAULT_MARKET_LIMIT = 500;

// Schema ausente/não exposto: o PostgREST devolve PGRST106 (schema não está em
// "Exposed schemas") ou 42P01 (tabela não existe). Os dois querem a mesma
// resposta na tela: "rode a migração / publique o schema", não um erro cru.
// Recorte de UMA fatura, em ms. `ate` é exclusivo (a fatura de agosto termina
// no instante em que setembro começa).
export interface JanelaDeFatura { de: number; ate: number }

export function isMissingMarketSchema(error: { message?: string; code?: string } | null | undefined): boolean {
  const m = error?.message ?? "";
  // 42703 é COLUNA inexistente e NÃO é schema faltando. Ele caía aqui por causa
  // do /does not exist/ genérico, e o resultado era grave: toda rota escrita
  // contra um nome de coluna errado respondia "mercadinho em manutenção", que
  // manda procurar migração em vez do bug. Foi assim que venda manual, ajuste
  // de estoque e geração de código de tablet ficaram quebrados sem ninguém ver
  // o motivo. Coluna errada agora vaza como erro de verdade.
  if (error?.code === "42703") return false;
  return error?.code === "PGRST106" || error?.code === "42P01"
    || /schema must be one of|Only the following schemas are exposed|schema cache/i.test(m)
    || /relation .* does not exist/i.test(m);
}

// Lê TODAS as linhas paginando com .range(). O PostgREST corta em 1000 SEM
// erro — foi o que zerou a dívida de todo mundo quando as vendas passaram de
// 13 mil. `q` precisa de .order() estável, senão as páginas repetem/pulam.
async function fetchTudo<T>(q: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>, passo = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de <= 200_000; de += passo) {
    const { data, error } = await q(de, de + passo - 1);
    if (error) throw error;
    const linhas = (data ?? []) as T[];
    out.push(...linhas);
    if (linhas.length < passo) break;
  }
  return out;
}

export interface IntervaloConsulta { de: string; ate: string }

function intervaloPadrao(): IntervaloConsulta {
  const agora = new Date();
  const inicio = new Date(agora);
  inicio.setHours(0, 0, 0, 0);
  return { de: inicio.toISOString(), ate: agora.toISOString() };
}

// ── Linhas cruas do banco ───────────────────────────────────────────────────
type LinhaUnidade = { id: string; nome: string; ativo: boolean; descricao: string | null };
type LinhaFuncionario = { id: number; unidade_id: string; nome: string; foto_url: string | null; ativo: boolean; limite_proprio: number | null; bloqueado: boolean; codigo_acesso?: string | null; usuario_id?: string | null };
type LinhaProduto = { id: number; nome: string; codigo_barras: string | null; categoria_id: number | null; preco_padrao: number; custo_padrao: number | null; imagem_url: string | null; ativo: boolean; sem_codigo: boolean; oculto_busca?: boolean };
type LinhaEstoque = { unidade_id: string; produto_id: number; quantidade: number; minimo: number; permite_negativo: boolean };
type LinhaVenda = { id: number; unidade_id: string; funcionario_id: number; total: number; pago: boolean; criado_em: string };
type LinhaItem = { venda_id: number; produto_id: number; quantidade: number; preco_unit: number };
type LinhaLancamento = { funcionario_id: number; tipo: string; valor: number; ocorrido_em: string; venda_id: number | null };

export class TridiMarketRepository {
  constructor(private readonly db: Db) {}

  // ── Unidades ──────────────────────────────────────────────────────────────
  async profiles(pedidas?: string[]): Promise<MarketProfile[]> {
    let q = this.db.from("unidades").select("id,nome,ativo,descricao").eq("ativo", true);
    if (pedidas?.length) q = q.in("id", pedidas);
    const { data, error } = await q.order("nome");
    if (error) throw error;
    return (data ?? []).map((u: LinhaUnidade) => ({
      id: String(u.id), name: u.nome, active: u.ativo !== false, description: u.descricao ?? null,
    }));
  }

  private async idsDasUnidades(pedidas?: string[]): Promise<string[]> {
    return (await this.profiles(pedidas)).map((p) => p.id);
  }

  // Schema pronto? Serve pro aviso da tela quando a migração não rodou ou o
  // schema não foi publicado em Exposed schemas.
  async schemaReady(): Promise<boolean> {
    try {
      const { error } = await this.db.from("unidades").select("id").limit(1);
      return !error;
    } catch { return false; }
  }

  // ── Ajustes globais (linha única) ─────────────────────────────────────────
  async settings(): Promise<MarketSettings> {
    try {
      const { data, error } = await this.db.from("ajustes").select("*").eq("id", 1).maybeSingle();
      if (error || !data) return MARKET_SETTINGS_PADRAO;
      return {
        chequeEspecial: data.cheque_especial === true,
        limiteExtra: Number(data.limite_extra ?? 0),
        limitePadrao: Number(data.limite_padrao ?? DEFAULT_MARKET_LIMIT),
        bloquearInadimplente: data.bloquear_inadimplente === true,
        diasInadimplencia: Number(data.dias_inadimplencia ?? 30),
      };
    } catch { return MARKET_SETTINGS_PADRAO; }
  }

  async saveSettings(patch: Partial<MarketSettings>, userId?: string | null): Promise<MarketSettings> {
    const upd: Record<string, unknown> = { id: 1, atualizado_em: new Date().toISOString() };
    if (patch.chequeEspecial !== undefined) upd.cheque_especial = patch.chequeEspecial;
    if (patch.limiteExtra !== undefined) upd.limite_extra = patch.limiteExtra;
    if (patch.limitePadrao !== undefined) upd.limite_padrao = patch.limitePadrao;
    if (patch.bloquearInadimplente !== undefined) upd.bloquear_inadimplente = patch.bloquearInadimplente;
    if (patch.diasInadimplencia !== undefined) upd.dias_inadimplencia = patch.diasInadimplencia;
    const { error } = await this.db.from("ajustes").upsert(upd, { onConflict: "id" });
    if (error) throw error;
    await this.registrar(userId ?? null, "ajustes.salvar", "ajustes", "1", null, patch);
    return this.settings();
  }

  // ── Score (nota do gestor) ────────────────────────────────────────────────
  async scores(ids?: number[]): Promise<Map<number, { score: number; manual: boolean }>> {
    const mapa = new Map<number, { score: number; manual: boolean }>();
    try {
      let q = this.db.from("scores").select("funcionario_id,score,manual");
      if (ids?.length) q = q.in("funcionario_id", ids);
      const { data, error } = await q;
      if (error) return mapa;
      for (const r of data ?? []) {
        mapa.set(Number(r.funcionario_id), { score: Number(r.score ?? 0), manual: r.manual !== false });
      }
    } catch { /* sem tabela: cai no automático */ }
    return mapa;
  }

  async setScore(funcionarioId: number, score: number | null, userId?: string | null): Promise<{ score: number; manual: boolean }> {
    if (score == null) {
      await this.db.from("scores").delete().eq("funcionario_id", funcionarioId);
      await this.registrar(userId ?? null, "score.automatico", "funcionario", funcionarioId, null, null);
      return { score: 0, manual: false };
    }
    const valor = Math.max(0, Math.min(100, Math.round(score)));
    const { error } = await this.db.from("scores").upsert(
      { funcionario_id: funcionarioId, score: valor, manual: true, atualizado_em: new Date().toISOString() },
      { onConflict: "funcionario_id" },
    );
    if (error) throw error;
    await this.registrar(userId ?? null, "score.manual", "funcionario", funcionarioId, null, { score: valor });
    return { score: valor, manual: true };
  }

  // ── Catálogo ──────────────────────────────────────────────────────────────
  // Preço e estoque são POR UNIDADE; o produto em si é global. Sem unidade
  // escolhida, usa a primeira ativa (o painel sempre manda uma).
  async products(unidades?: string[]): Promise<MarketProduct[]> {
    const ids = await this.idsDasUnidades(unidades);
    const alvo = ids[0] ?? null;

    // `oculto_busca` é opcional: enquanto o SQL de supabase/tridimarket_oculto_
    // busca.sql não tiver sido rodado a coluna não existe e o PostgREST devolve
    // 42703 pra query INTEIRA — o catálogo sumiria do painel e do tablet por
    // causa de uma coluna nova. Por isso tenta com ela e cai pro select antigo.
    const COLS = "id,nome,codigo_barras,categoria_id,preco_padrao,custo_padrao,imagem_url,ativo,sem_codigo";
    const lerProdutos = (cols: string) =>
      fetchTudo<LinhaProduto>((a, b) => this.db.from("produtos").select(cols).order("nome").range(a, b));

    const [produtos, categorias, estoques, precos] = await Promise.all([
      lerProdutos(`${COLS},oculto_busca`).catch(() => lerProdutos(COLS)),
      this.db.from("categorias").select("id,nome").then((r: { data: unknown }) => ((r.data ?? []) as Array<{ id: number; nome: string }>)),
      alvo ? fetchTudo<LinhaEstoque>((a, b) => this.db.from("estoque")
        .select("unidade_id,produto_id,quantidade,minimo,permite_negativo").eq("unidade_id", alvo).order("produto_id").range(a, b)) : Promise.resolve([]),
      alvo ? fetchTudo<{ produto_id: number; preco: number }>((a, b) => this.db.from("precos")
        .select("produto_id,preco").eq("unidade_id", alvo).order("produto_id").range(a, b)) : Promise.resolve([]),
    ]);

    const catPorId = new Map<number, string>(categorias.map((c: { id: number; nome: string }) => [Number(c.id), String(c.nome)]));
    const estPorProduto = new Map(estoques.map((e) => [Number(e.produto_id), e]));
    const precoPorProduto = new Map(precos.map((p) => [Number(p.produto_id), Number(p.preco)]));

    // EM QUAIS empresas cada produto existe. "Existir numa empresa" = ter linha
    // de preço lá. Sem isto, a lista mostrava TODO produto em TODA empresa
    // (só preço e estoque mudavam), então tirar um produto de uma empresa não
    // tinha efeito visível nenhum — parecia que salvar não fazia nada.
    const todosPrecos = await fetchTudo<{ produto_id: number; unidade_id: string }>((a, b) =>
      this.db.from("precos").select("produto_id,unidade_id").order("produto_id").range(a, b));
    const unidadesPorProduto = new Map<number, string[]>();
    for (const linha of todosPrecos) {
      const lista = unidadesPorProduto.get(Number(linha.produto_id)) ?? [];
      lista.push(String(linha.unidade_id));
      unidadesPorProduto.set(Number(linha.produto_id), lista);
    }

    return produtos
      // Escopo numa empresa: só o que existe nela. Produto que nunca teve preço
      // em lugar nenhum continua aparecendo — senão um cadastro incompleto
      // sumiria da tela e ninguém conseguiria consertá-lo.
      .filter((p) => {
        if (!alvo) return true;
        const onde = unidadesPorProduto.get(Number(p.id));
        return !onde?.length || onde.includes(alvo);
      })
      .map((p) => {
      const est = estPorProduto.get(Number(p.id));
      return {
        id: Number(p.id),
        companyId: 0,                       // não existe mais "empresa" separada da unidade
        barcode: p.codigo_barras ?? null,
        name: p.nome,
        price: roundMoney(precoPorProduto.get(Number(p.id)) ?? Number(p.preco_padrao ?? 0)),
        imageUrl: p.imagem_url ?? null,
        categoryId: p.categoria_id == null ? null : Number(p.categoria_id),
        categoryName: p.categoria_id == null ? null : (catPorId.get(Number(p.categoria_id)) ?? null),
        active: p.ativo !== false,
        stock: Number(est?.quantidade ?? 0),
        minimumStock: Number(est?.minimo ?? 5),
        allowStockOverride: est?.permite_negativo !== false,
        semCodigo: p.sem_codigo === true,
        // Escolhido a dedo no painel: some da lista de busca do totem, mas
        // continua vendável ao bipar. Coluna opcional (ver o select acima).
        ocultoBusca: p.oculto_busca === true,
        // Empresas em que ele existe — é o que o formulário de edição precisa
        // pra vir com as caixas certas já marcadas.
        unidades: unidadesPorProduto.get(Number(p.id)) ?? [],
      };
    });
  }

  // ── Pessoas (agrupa quem tem conta em mais de uma unidade) ────────────────

  async people(unidades?: string[], gastoPorConta?: Map<number, number>, fatura?: JanelaDeFatura): Promise<MarketPerson[]> {
    const contas = await this.employees(unidades, true, fatura) as ContaComCodigo[];
    try {
      const { data } = await this.db.from("pessoa_unidade").select("funcionario_id,unidade_id");
      const manual = new Map((data ?? []).map((r: Record<string, unknown>) => [Number(r.funcionario_id), String(r.unidade_id)]));
      for (const c of contas) {
        const escolha = manual.get(c.id);
        if (escolha) c.empresaPrincipalManual = escolha as string;
      }
    } catch { /* sem escolha manual: decide pelo maior consumo */ }
    return unirPessoas(contas, gastoPorConta);
  }

  // ── Funcionários + saldo ──────────────────────────────────────────────────
  // O saldo vem do RAZÃO: compra soma, pagamento abate. O `saldoPessoa` recebe
  // as compras (pra saber a IDADE de cada dívida e marcar atraso) e o total já
  // abatido — mesma regra FIFO de antes, agora sobre uma fonte só.
  // `fatura` recorta QUAL fatura mostrar (o mês que o gestor escolheu no
  // seletor). Não confundir com o limite: o limite responde SEMPRE à fatura
  // ABERTA — olhar a fatura de agosto não pode dizer que a pessoa tem menos
  // crédito hoje.
  async employees(unidades?: string[], comCodigo = false, fatura?: JanelaDeFatura): Promise<MarketEmployee[]> {
    const ids = await this.idsDasUnidades(unidades);
    if (!ids.length) return [];

    // `usuario_id` (vínculo com o usuário do Gaius) vem de
    // mercadinho-cadastros.sql. Sem ele a lista inteira falharia, então a
    // consulta cai pra versão sem a coluna — a tela só fica sem o vínculo.
    const colunas = (comVinculo: boolean) =>
      `id,unidade_id,nome,foto_url,ativo,limite_proprio,bloqueado${comCodigo ? ",codigo_acesso" : ""}${comVinculo ? ",usuario_id" : ""}`;
    const carregarFuncionarios = async () => {
      try { return await fetchTudo<LinhaFuncionario>((a, b) => this.db.from("funcionarios").select(colunas(true)).in("unidade_id", ids).order("id").range(a, b)); }
      catch (e) {
        if (!/usuario_id/i.test((e as { message?: string })?.message ?? "")) throw e;
        return fetchTudo<LinhaFuncionario>((a, b) => this.db.from("funcionarios").select(colunas(false)).in("unidade_id", ids).order("id").range(a, b));
      }
    };

    const [funcionarios, lancamentos, ajustes] = await Promise.all([
      carregarFuncionarios(),
      fetchTudo<LinhaLancamento>((a, b) => this.db.from("lancamentos")
        .select("funcionario_id,tipo,valor,ocorrido_em,venda_id").in("unidade_id", ids).order("id").range(a, b)),
      this.settings(),
    ]);

    const idsFunc = funcionarios.map((f) => Number(f.id));
    const [scoreMap, creditos] = await Promise.all([
      this.scores(idsFunc),
      this.db.from("creditos").select("funcionario_id,limite_extra,bloqueado")
        .then((r: { data: unknown }) => new Map(((r.data ?? []) as Array<Record<string, unknown>>)
          .map((c) => [Number(c.funcionario_id), { extra: Number(c.limite_extra ?? 0), bloqueado: c.bloqueado === true }])))
        .catch(() => new Map<number, { extra: number; bloqueado: boolean }>()),
    ]);

    // Dívidas datadas × crédito solto. A correção de uma venda pertence ÀQUELA
    // venda e não vira crédito genérico — ver agruparLancamentos.
    const { comprasPor, abatePor } = agruparLancamentos(lancamentos);

    // Pagamento é DINHEIRO que entrou. Estorno de venda editada não é: contá-lo
    // aqui subia o score de quem só teve uma compra corrigida e ainda carimbava
    // um "último pagamento" que nunca existiu.
    const quitacoesPor = new Map<number, number>();
    const ultimoPagamento = new Map<number, string>();
    for (const l of lancamentos) {
      if (l.tipo !== "pagamento" || Number(l.valor) >= 0) continue;
      const uid = Number(l.funcionario_id);
      quitacoesPor.set(uid, (quitacoesPor.get(uid) ?? 0) + 1);
      const atual = ultimoPagamento.get(uid);
      if (!atual || l.ocorrido_em > atual) ultimoPagamento.set(uid, l.ocorrido_em);
    }

    const agora = Date.now();
    return funcionarios.map((f) => {
      const uid = Number(f.id);
      const compras = comprasPor.get(uid) ?? [];
      const abate = abatePor.get(uid) ?? 0;
      // Fatura ABERTA: é ela que ocupa o limite, sempre.
      const saldo = saldoPessoa(compras, abate, agora, ajustes.diasInadimplencia);
      // Fatura OLHADA: a do mês que o gestor escolheu (padrão = a aberta).
      const olhada = fatura
        ? saldoPessoa(compras, abate, agora, ajustes.diasInadimplencia, fatura.de, fatura.ate)
        : saldo;
      const credito = creditos.get(uid);
      const limiteNormal = roundMoney(f.limite_proprio ?? ajustes.limitePadrao);
      const extra = roundMoney(credito?.extra ?? (ajustes.chequeEspecial ? ajustes.limiteExtra : 0));
      const capacidade = limiteNormal + extra;
      const aberto = roundMoney(saldo.open);
      const bloqueado = f.bloqueado === true || credito?.bloqueado === true
        || (ajustes.bloquearInadimplente && saldo.overdue > 0);
      const salvo = scoreMap.get(uid);
      const score = salvo?.manual
        ? salvo.score
        : scoreAutomatico({ quitacoes: quitacoesPor.get(uid) ?? 0, emAtraso: saldo.overdue > 0 });

      const base: MarketEmployee = {
        id: uid,
        profileId: String(f.unidade_id),
        companyId: 0,
        name: f.nome,
        imageUrl: f.foto_url ?? null,
        // Vínculo com o usuário do Gaius. Sem ele chegar até a tela, o
        // formulário de edição abria sempre em "Sem vínculo" e SALVAR APAGAVA
        // o vínculo de quem já tinha.
        usuarioId: f.usuario_id ?? null,
        active: f.ativo !== false,
        normalLimit: limiteNormal,
        overdraftLimit: extra,
        open: aberto,
        cycleOpen: roundMoney(olhada.cycleOpen),
        previousOpen: roundMoney(olhada.previousOpen),
        faturas: faturasPorMes(compras, abate, agora),
        // Sempre o calendário de HOJE, nunca o recorte olhado: é o número que
        // se cobra ("deve do mês passado") e o que ela já gastou no mês novo.
        currentMonth: roundMoney(saldo.cycleOpen),
        closedUntil: roundMoney(Math.max(0, saldo.open - saldo.cycleOpen)),
        overdue: roundMoney(saldo.overdue),
        // O LIMITE responde ao gasto DO MÊS, não à dívida acumulada: na virada
        // ele volta cheio e a fatura anterior segue como cobrança à parte.
        available: roundMoney(Math.max(0, capacidade - saldo.cycleOpen)),
        status: financialStatus(saldo.cycleOpen, saldo.overdue, capacidade, bloqueado),
        lastPaymentAt: ultimoPagamento.get(uid) ?? null,
        score: Math.max(0, Math.min(100, Math.round(score))),
        scoreManual: salvo?.manual === true,
      };
      // `codigoAcesso` só sai daqui pra agrupar a mesma pessoa (unirPessoas);
      // nunca vai pra resposta da API.
      return comCodigo ? ({ ...base, codigoAcesso: f.codigo_acesso ?? null } as ContaComCodigo) : base;
    });
  }

  // ── Painel ────────────────────────────────────────────────────────────────
  async overview(unidades?: string[], intervalo: IntervaloConsulta = intervaloPadrao()): Promise<MarketOverview> {
    const perfis = await this.profiles(unidades);
    const ids = perfis.map((p) => p.id);
    const { de: desde, ate: ateQuando } = intervalo;
    if (!ids.length) return this.painelVazio(intervalo);

    const [vendas, funcionarios, produtos, pronto] = await Promise.all([
      fetchTudo<LinhaVenda>((a, b) => this.db.from("vendas")
        .select("id,unidade_id,funcionario_id,total,pago,criado_em")
        .in("unidade_id", ids).gte("criado_em", desde).lte("criado_em", ateQuando).order("id").range(a, b)),
      this.employees(ids),
      this.products(ids),
      this.schemaReady(),
    ]);

    const idsVenda = vendas.map((v) => Number(v.id));
    const itens = idsVenda.length ? await this.itensDasVendas(idsVenda) : [];

    // Consumo e recebimento — `vendas.total` já vem somado do banco.
    let consumed = 0, received = 0;
    const serie = new Map<string, { consumed: number; received: number }>();
    for (const v of vendas) {
      const valor = Number(v.total) || 0;
      consumed += valor;
      if (v.pago) received += valor;
      const dia = String(v.criado_em).slice(0, 10);
      const ponto = serie.get(dia) ?? { consumed: 0, received: 0 };
      ponto.consumed += valor;
      if (v.pago) ponto.received += valor;
      serie.set(dia, ponto);
    }

    // Mix e ranking de produtos — agora somando QUANTIDADE (não contando linhas).
    const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
    const porCategoria = new Map<string, { items: number; revenue: number }>();
    const porProduto = new Map<number, { units: number; revenue: number }>();
    let itemsSold = 0;
    for (const it of itens) {
      const qtd = Number(it.quantidade) || 0;
      const valor = qtd * (Number(it.preco_unit) || 0);
      itemsSold += qtd;
      const prod = produtoPorId.get(Number(it.produto_id));
      const cat = prod?.categoryName ?? "Sem categoria";
      const ca = porCategoria.get(cat) ?? { items: 0, revenue: 0 };
      ca.items += qtd; ca.revenue += valor; porCategoria.set(cat, ca);
      const pa = porProduto.get(Number(it.produto_id)) ?? { units: 0, revenue: 0 };
      pa.units += qtd; pa.revenue += valor; porProduto.set(Number(it.produto_id), pa);
    }

    const categories = [...porCategoria.entries()]
      .map(([name, v]) => ({ name, items: v.items, revenue: roundMoney(v.revenue), share: itemsSold ? v.items / itemsSold : 0 }))
      .sort((a, b) => b.items - a.items);
    const topProducts = [...porProduto.entries()]
      .map(([id, v]) => ({ id, name: produtoPorId.get(id)?.name ?? `Produto ${id}`, imageUrl: produtoPorId.get(id)?.imageUrl ?? null, units: v.units, revenue: roundMoney(v.revenue) }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    // Compras recentes
    const funcPorId = new Map(funcionarios.map((f) => [f.id, f]));
    const unidadePorId = new Map(perfis.map((p) => [p.id, p.name]));
    const itensPorVenda = new Map<number, number>();
    for (const it of itens) itensPorVenda.set(Number(it.venda_id), (itensPorVenda.get(Number(it.venda_id)) ?? 0) + (Number(it.quantidade) || 0));
    const recentPurchases = [...vendas]
      .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))
      .slice(0, 12)
      .map((v) => {
        const f = funcPorId.get(Number(v.funcionario_id));
        return {
          id: Number(v.id), at: String(v.criado_em), employeeId: Number(v.funcionario_id),
          employeeName: f?.name ?? `#${v.funcionario_id}`, employeeImage: f?.imageUrl ?? null,
          unitName: unidadePorId.get(String(v.unidade_id)) ?? null,
          items: itensPorVenda.get(Number(v.id)) ?? 0,
          total: roundMoney(Number(v.total) || 0), paid: v.pago === true,
        };
      });

    const gastoPorConta = new Map<number, number>();
    for (const v of vendas) gastoPorConta.set(Number(v.funcionario_id), (gastoPorConta.get(Number(v.funcionario_id)) ?? 0) + (Number(v.total) || 0));
    const pessoas = await this.people(ids, gastoPorConta);

    const devices = await this.devices(ids, new Map(perfis.map((p) => [p.id, p.name])));
    // Compras presas: operações que chegaram e não fecharam (REVISAR) ou que o
    // tablet ainda está subindo. É o alerta de "tem venda sem entrar no caixa".
    const pendingSync = await this.pendentesDeSync(ids);
    const purchases = vendas.length;
    const activeEmployees = new Set(vendas.map((v) => Number(v.funcionario_id))).size;
    const criticalStock = produtos.filter((p) => p.active && p.stock <= p.minimumStock).length;
    const open = pessoas.reduce((s, p) => s + p.open, 0);
    const overdue = pessoas.reduce((s, p) => s + p.overdue, 0);

    const hourly = movimentoPorHora(vendas.map((v) => ({ at: String(v.criado_em), revenue: Number(v.total) || 0 })));
    const slowProducts = produtosMenosVendidos(produtos, porProduto, 8);
    const debtByEmployee = dividaPorFuncionario(pessoas, 10);

    // Ranking por unidade (quem mais consumiu no período).
    const porUnidade = new Map<string, { revenue: number; purchases: number }>();
    for (const v of vendas) {
      const k = String(v.unidade_id);
      const agg = porUnidade.get(k) ?? { revenue: 0, purchases: 0 };
      agg.revenue += Number(v.total) || 0; agg.purchases += 1;
      porUnidade.set(k, agg);
    }
    const topCompanies = [...porUnidade.entries()]
      .map(([profileId, v]) => ({ profileId, name: unidadePorId.get(profileId) ?? "—", revenue: roundMoney(v.revenue), purchases: v.purchases }))
      .sort((a, b) => b.revenue - a.revenue);

    // Últimos 7 dias — recorte FIXO, independente do período escolhido (é um
    // termômetro de "como está a semana", não do filtro em tela).
    const seteDias = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const vendas7 = await fetchTudo<{ criado_em: string; total: number }>((a, b) => this.db.from("vendas")
      .select("criado_em,total").in("unidade_id", ids).gte("criado_em", seteDias).order("id").range(a, b));
    const porDia7 = new Map<string, number>();
    for (const v of vendas7) {
      const dia = String(v.criado_em).slice(0, 10);
      porDia7.set(dia, (porDia7.get(dia) ?? 0) + (Number(v.total) || 0));
    }
    const salesLast7 = [...porDia7.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, total]) => ({ day, total: roundMoney(total) }));

    const dias = Math.max(1, Math.round((new Date(ateQuando).getTime() - new Date(desde).getTime()) / 86_400_000));
    return {
      consumed: roundMoney(consumed), received: roundMoney(received),
      open: roundMoney(open), overdue: roundMoney(overdue),
      delinquentEmployees: pessoas.filter((p) => p.overdue > 0).length,
      criticalStock,
      pendingSync,
      offlineDevices: devices.filter((d) => d.active && !d.online).length,
      series: [...serie.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, v]) => ({ day, consumed: roundMoney(v.consumed), received: roundMoney(v.received) })),
      employeeAttention: pessoas.filter((p) => p.overdue > 0 || p.open > 0).sort((a, b) => b.open - a.open).slice(0, 6),
      people: pessoas,
      stockAttention: produtos.filter((p) => p.active).sort((a, b) => a.stock - b.stock).slice(0, 6),
      units: await this.resumoPorUnidade(perfis, funcionarios, produtos, pessoas),
      ticket: purchases > 0 ? roundMoney(consumed / purchases) : 0,
      purchases, activeEmployees, itemsSold,
      categories, topProducts, topCompanies, salesLast7,
      topSpenders: [...pessoas].filter((p) => p.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 6),
      hourly, slowProducts, debtByEmployee,
      recentPurchases, devices,
      periodDays: dias, periodStart: desde, periodEnd: ateQuando,
      schemaReady: pronto,
    };
  }

  private async itensDasVendas(idsVenda: number[]): Promise<LinhaItem[]> {
    const out: LinhaItem[] = [];
    for (let i = 0; i < idsVenda.length; i += 500) {
      const lote = idsVenda.slice(i, i + 500);
      const linhas = await fetchTudo<LinhaItem>((a, b) => this.db.from("venda_itens")
        .select("venda_id,produto_id,quantidade,preco_unit").in("venda_id", lote).order("id").range(a, b));
      out.push(...linhas);
    }
    return out;
  }

  // Operações que não chegaram a SINCRONIZADA — venda registrada no aparelho e
  // ainda não fechada no servidor.
  private async pendentesDeSync(ids: string[]): Promise<number> {
    try {
      const { count } = await this.db.from("operacoes_compra")
        .select("operacao_id", { head: true, count: "exact" })
        .in("unidade_id", ids).neq("status", "SINCRONIZADA");
      return Number(count ?? 0);
    } catch { return 0; }
  }

  private async devices(ids: string[], nomePorUnidade = new Map<string, string>()): Promise<MarketDeviceHealth[]> {
    try {
      // `select("*")` de propósito: a coluna `pendencias` é nova
      // (supabase/tridimarket-pendencias-tablet.sql) e listar colunas faria o
      // PostgREST recusar a consulta INTEIRA em banco que ainda não rodou o SQL
      // — a aba Tablets ficaria vazia em vez de só sem esse número.
      const { data } = await this.db.from("dispositivos")
        .select("*").in("unidade_id", ids).order("nome").limit(500);
      const agora = Date.now();
      return ((data ?? []) as Array<Record<string, unknown>>).map((d) => {
        const visto = d.visto_em ? new Date(String(d.visto_em)).getTime() : 0;
        return {
          id: String(d.id), name: String(d.nome ?? "Tablet"),
          unitName: nomePorUnidade.get(String(d.unidade_id)) ?? null,
          active: d.ativo !== false,
          online: visto > 0 && agora - visto < 30 * 60_000,
          lastSeenAt: d.visto_em ? String(d.visto_em) : null,
          minutesSinceSeen: visto > 0 ? Math.round((agora - visto) / 60_000) : null,
          // Compras que estão NO APARELHO e ainda não subiram. Só o tablet sabe
          // esse número (a fila vive no SQLite dele), e ele o manda em todo
          // heartbeat. Era `0` fixo aqui, então o painel jurava "nada preso"
          // mesmo com venda encalhada — que é como uma falha de envio passava
          // dias sem ninguém ver.
          pendingOperations: Math.max(0, Number(d.pendencias) || 0),
        };
      });
    } catch { return []; }
  }

  private async resumoPorUnidade(
    perfis: MarketProfile[], funcionarios: MarketEmployee[], produtos: MarketProduct[], pessoas: MarketPerson[],
  ): Promise<MarketUnitSummary[]> {
    return perfis.map((p) => {
      const doGrupo = pessoas.filter((x) => x.mainProfileId === p.id);
      return {
        profileId: p.id, name: p.name,
        employees: funcionarios.filter((f) => f.profileId === p.id && f.active).length,
        open: roundMoney(doGrupo.reduce((s, x) => s + x.open, 0)),
        overdue: roundMoney(doGrupo.reduce((s, x) => s + x.overdue, 0)),
        products: produtos.filter((x) => x.active).length,
        criticalStock: produtos.filter((x) => x.active && x.stock <= x.minimumStock).length,
      } as MarketUnitSummary;
    });
  }

  private painelVazio(intervalo: IntervaloConsulta): MarketOverview {
    return {
      consumed: 0, received: 0, open: 0, overdue: 0, delinquentEmployees: 0, criticalStock: 0,
      pendingSync: 0, offlineDevices: 0, series: [], employeeAttention: [], people: [],
      stockAttention: [], units: [], ticket: 0, purchases: 0, activeEmployees: 0, itemsSold: 0,
      categories: [], topProducts: [], topCompanies: [], salesLast7: [], topSpenders: [], hourly: movimentoPorHora([]),
      slowProducts: [], debtByEmployee: [], recentPurchases: [], devices: [],
      periodDays: 1, periodStart: intervalo.de, periodEnd: intervalo.ate, schemaReady: false,
    };
  }

  // ── Compra vinda do tablet ────────────────────────────────────────────────
  // Toda a regra (idempotência, estoque que trava em zero, razão) vive na RPC
  // `registrar_compra` — uma transação só. Aqui é só o repasse.
  async syncPurchase(input: MarketPurchaseInput): Promise<MarketSyncResult> {
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const itens = (input.items ?? []).map((i) => ({
      produto_id: i.productId, quantidade: i.quantity, preco_unit: i.unitPrice,
    }));
    const { data, error } = await this.db.rpc("registrar_compra", {
      p_operacao_id: input.operationId,
      p_dispositivo_id: input.deviceId,
      p_funcionario_id: input.employeeId,
      p_unidade_id: input.stockProfileId ?? input.profileId,
      p_ocorrido_em: input.deviceOccurredAt,
      p_hash_payload: hash,
      p_itens: itens,
      p_sequencia: input.localSequence ?? null,
    });
    if (error) throw error;
    const linha = Array.isArray(data) ? data[0] : data;
    // A RPC fala português; o app e o tablet falam os estados antigos.
    const traduz: Record<string, MarketSyncResult["status"]> = {
      SINCRONIZADA: "SYNCED", REVISAR: "REQUIRES_REVIEW", REJEITADA: "REJECTED",
      ESTORNADA: "REVERSED", SINCRONIZANDO: "SYNCING",
    };
    return {
      operationId: input.operationId,
      status: traduz[String(linha?.status)] ?? "REQUIRES_REVIEW",
      saleId: linha?.venda_id ?? null,
      reason: linha?.motivo ?? null,
      serverReceivedAt: linha?.recebido_em ?? new Date().toISOString(),
    };
  }

  // Trilha de auditoria — nunca derruba a operação que a gerou.
  private async registrar(autor: string | null, acao: string, entidade: string, id: string | number | null, antes?: unknown, depois?: unknown) {
    try {
      await this.db.from("auditoria").insert({
        autor_id: autor, acao, entidade,
        entidade_id: id == null ? null : String(id),
        antes: antes ?? null, depois: depois ?? null,
      });
    } catch { /* log não bloqueia */ }
  }
}
