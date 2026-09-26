import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { isColunaAusente } from "@/lib/estoque-colunas";
import { podeCadastrarEstoque } from "@/lib/estoque-permissoes";
import {
  empresaParaCriar, fornecedoresDoFinanceiro, podeGerirFornecedores,
} from "@/lib/estoque-fornecedor-fonte";
import {
  chaveDeFornecedor, lerPlanilha, planejarImportacao,
  type FornecedorDoCatalogo, type ItemDoCatalogo, type Plano,
} from "@/lib/estoque-importacao";

export const dynamic = "force-dynamic";

// ── Importar planilha pro catálogo ───────────────────────────────────────────
//
// O galpão controla estoque numa planilha há meses e vai continuar recebendo
// planilha de fornecedor — por isso isto é uma PORTA, não um script de carga
// que se roda uma vez e se joga fora.
//
// A rota tem dois modos e um só caminho de código:
//
//   sem `confirmar` → devolve o PLANO (quantos novos, quantos atualizados e o
//                     que muda em cada um). Não escreve nada.
//   com `confirmar` → recalcula o MESMO plano, do zero, contra o catálogo
//                     daquele instante, e só então escreve.
//
// O plano é recalculado no servidor de propósito. Aceitar de volta o plano que
// o navegador mostrou seria escrever o que ninguém conferiu: entre ver e
// confirmar, outra pessoa pode ter mexido no item — e o número que a tela
// prometeu ("0 → 229") não seria mais o que aconteceria.
//
// O que esta rota NÃO faz: `verificarReabastecimento()`. O PATCH item a item do
// catálogo chama, porque lá é uma pessoa mexendo num item. Aqui são 93 de uma
// vez, e a reposição automática criaria dezenas de atividades de produção no
// mesmo segundo — a carga inicial de um catálogo não é uma decisão de comprar.
// Quem quiser isso aperta "Repor estoque" no catálogo, que já existe.

/** Teto de linhas por importação. A planilha do galpão tem 93; 500 é folga com
 *  fim — sem teto, um arquivo torto vira centenas de escritas em sequência. */
const TETO_LINHAS = 500;
/** ~400 KB de texto colado. Acima disso não é planilha de estoque. */
const TETO_TEXTO = 400_000;
/** Itens por `insert`. Fatiar dá dois ganhos: nenhum pedido gigante, e quando
 *  um bloco falha dá pra reprocessar linha a linha e apontar QUAL falhou. */
const BLOCO = 25;

const SCHEMA_DESATUALIZADO = {
  error: "schema_desatualizado",
  detalhe: "Rode supabase/estoque_hierarquia_unidades.sql no Supabase — a importação escreve em colunas que este banco ainda não tem.",
} as const;

interface Falha { linha: number; nome: string; detalhe: string }

export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await podeCadastrarEstoque(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const texto = String(b.texto ?? "");
  if (!texto.trim()) {
    return NextResponse.json({ error: "sem_texto", detalhe: "Cole a lista (ou escolha o arquivo) antes de conferir." }, { status: 400 });
  }
  if (texto.length > TETO_TEXTO) {
    return NextResponse.json({
      error: "texto_grande",
      detalhe: `O texto tem ${texto.length} caracteres; o limite é ${TETO_TEXTO}. Importe por partes.`,
    }, { status: 400 });
  }

  const leitura = lerPlanilha(texto);
  if (leitura.linhas.length === 0) {
    return NextResponse.json({
      error: "sem_linhas",
      detalhe: "Não achei nenhuma linha com conteúdo. Cada linha é um item: nome, estoque, ponto de reposição, unidade, fornecedor.",
    }, { status: 400 });
  }
  if (leitura.linhas.length > TETO_LINHAS) {
    return NextResponse.json({
      error: "linhas_demais",
      detalhe: `São ${leitura.linhas.length} linhas de uma vez; o limite é ${TETO_LINHAS}. Importe por partes.`,
    }, { status: 400 });
  }

  const db = createSupabaseAdminClient();

  // O catálogo inteiro, porque o casamento é por nome NORMALIZADO: um
  // `.in("nome", …)` só acharia quem está escrito exatamente igual, e é
  // justamente o "escrito diferente" que cria a duplicata.
  const { data: linhasItens, error: erroItens } = await db
    .from("estoque_itens")
    .select("id,nome,serializado,quantidade,qtd_minima,unidade,fornecedor_id")
    .limit(5000);
  if (erroItens) {
    if (isColunaAusente(erroItens)) return NextResponse.json(SCHEMA_DESATUALIZADO, { status: 409 });
    return NextResponse.json({ error: "failed", detalhe: erroItens.message }, { status: 500 });
  }
  const itens = (linhasItens ?? []) as ItemDoCatalogo[];

  // Fornecedores vêm do FINANCEIRO (ver lib/estoque-fornecedor-fonte.ts). Se o
  // SQL do Financeiro ainda não rodou, a importação continua — fornecedor é
  // campo extra, item é o essencial. O plano diz quais nomes ficaram de fora em
  // vez de sumir com eles.
  const { fornecedores: doFinanceiro, pendente: financeiroPendente } = await fornecedoresDoFinanceiro();
  const fornecedores = doFinanceiro.map((f) => ({ id: f.id, nome: f.nome })) as FornecedorDoCatalogo[];

  // Criar fornecedor agora é escrever DENTRO da área restrita: exige
  // `financeiro:cadastros` e uma empresa definida. Quem não tem os dois importa
  // igual — só vincula ao que já existe, e o plano lista o que ficou de fora.
  // Antes bastava `estoque:fornecedores`, e um "Madereira X" sem o "i" viraria
  // fornecedor novo lá dentro sem ninguém do galpão poder desfazer.
  const empresaDoCadastro = (await podeGerirFornecedores(me)) ? await empresaParaCriar(me) : null;
  const empresaId = empresaDoCadastro && !("erro" in empresaDoCadastro) ? empresaDoCadastro.id : null;
  const podeCriarFornecedor = !financeiroPendente && !!empresaId;

  const plano = planejarImportacao({ linhas: leitura.linhas, itens, fornecedores, podeCriarFornecedor });

  if (!b.confirmar) {
    return NextResponse.json({ ok: true, aplicado: false, leitura: resumoDaLeitura(leitura), plano });
  }

  // ── Daqui pra baixo, escreve ───────────────────────────────────────────────
  const falhas: Falha[] = [];

  // 1. Fornecedores que faltam. Vêm primeiro porque o item aponta pra eles.
  // MESMA chave do plano (`chaveDeFornecedor`): se aqui a chave fosse outra, o
  // item que o plano prometeu vincular a um fornecedor existente entraria com
  // `fornecedor_id` nulo, calado.
  const idPorFornecedor = new Map<string, string>(fornecedores.map((f) => [chaveDeFornecedor(f.nome), f.id]));
  let fornecedoresCriados = 0;
  for (const nome of plano.fornecedoresNovos) {
    const { data, error } = await db
      .from("fin_fornecedores")
      .insert({ empresa_id: empresaId as string, nome, created_by: me.id })
      .select("id")
      .single();
    if (error || !data) {
      // 23505 = alguém criou no meio do caminho. Não é falha da importação: só
      // significa que o vínculo será resolvido na próxima leitura.
      falhas.push({ linha: 0, nome, detalhe: `Fornecedor "${nome}" não foi criado: ${error?.message ?? "sem id de volta"}` });
      continue;
    }
    idPorFornecedor.set(chaveDeFornecedor(nome), (data as { id: string }).id);
    fornecedoresCriados++;
  }

  const idDoFornecedor = (nome: string | null): string | null =>
    (nome ? idPorFornecedor.get(chaveDeFornecedor(nome)) ?? null : null);

  // 2. Itens novos, em blocos. Nascem SEM hierarquia — a coluna é nulável e
  //    `escrita.campos` não a inclui de propósito (ver lib/estoque-importacao).
  let criados = 0;
  const novos = plano.novos;
  for (let i = 0; i < novos.length; i += BLOCO) {
    const bloco = novos.slice(i, i + BLOCO);
    const linhasNovas = bloco.map((n) => ({ ...n.escrita.campos, fornecedor_id: idDoFornecedor(n.escrita.fornecedor) }));
    const { data, error } = await db.from("estoque_itens").insert(linhasNovas).select("id");
    if (!error) { criados += (data ?? []).length; continue; }
    if (isColunaAusente(error)) return NextResponse.json(SCHEMA_DESATUALIZADO, { status: 409 });
    // Um bloco inteiro cai por causa de UMA linha (o `nome` tem UNIQUE). Repete
    // linha a linha pra que 24 itens bons não sejam perdidos junto com o ruim —
    // e pra poder dizer qual foi.
    for (const n of bloco) {
      const so = { ...n.escrita.campos, fornecedor_id: idDoFornecedor(n.escrita.fornecedor) };
      const r = await db.from("estoque_itens").insert(so).select("id").single();
      if (r.error) falhas.push({ linha: n.linha, nome: n.nome, detalhe: r.error.message });
      else criados++;
    }
  }

  // 3. Itens que já existem. Um `update` por item: são poucos (12 na planilha
  //    do galpão) e cada um tem um patch diferente.
  let atualizados = 0;
  for (const a of plano.atualizados) {
    const patch: Record<string, unknown> = { ...a.escrita.campos, updated_at: new Date().toISOString() };
    if (a.escrita.fornecedor) {
      const fid = idDoFornecedor(a.escrita.fornecedor);
      if (fid) patch.fornecedor_id = fid;
    }
    const { error } = await db.from("estoque_itens").update(patch).eq("id", a.id);
    if (error) {
      if (isColunaAusente(error)) return NextResponse.json(SCHEMA_DESATUALIZADO, { status: 409 });
      // 23514 é a guarda do serializado falando. O plano já tira a quantidade
      // desses itens; se ainda assim chegou aqui, a mensagem do banco (em
      // português, pronta) é melhor do que qualquer coisa reescrita aqui.
      falhas.push({ linha: a.linha, nome: a.nome, detalhe: error.message });
      continue;
    }
    atualizados++;
  }

  return NextResponse.json({
    ok: true,
    aplicado: true,
    criados,
    atualizados,
    fornecedoresCriados,
    pulados: plano.pulados.length,
    falhas,
    leitura: resumoDaLeitura(leitura),
    plano,
  });
}

/** O que a tela mostra sobre a LEITURA (não sobre o banco): quais colunas foram
 *  reconhecidas. Sem isto, uma planilha cujo "mínimo" caiu na coluna do estoque
 *  passa despercebida — os números batem, no campo errado. */
function resumoDaLeitura(l: ReturnType<typeof lerPlanilha>) {
  return { comCabecalho: l.comCabecalho, colunas: l.colunas, separador: l.separador, linhas: l.linhas.length };
}

export type RespostaImportar =
  | { ok: true; aplicado: false; leitura: ReturnType<typeof resumoDaLeitura>; plano: Plano }
  | {
      ok: true; aplicado: true; criados: number; atualizados: number;
      fornecedoresCriados: number; pulados: number; falhas: Falha[];
      leitura: ReturnType<typeof resumoDaLeitura>; plano: Plano;
    };
