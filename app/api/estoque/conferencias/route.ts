import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfileForModule } from "@/lib/require-auth";
import { CONFERENCIA_DE_ATIVIDADE_LIGADA, ERRO_CONFERENCIA_DESLIGADA } from "@/lib/conferencia-de-atividade";
import { schemaDesatualizado } from "@/lib/estoque-unidades-gerar";
import { podeAjustarEstoque } from "@/lib/estoque-permissoes";
import {
  registrarConferencia,
  ErroResultadoInvalido,
  ErroDefeitoInvalido,
  ErroConferenteEExecutor,
  ErroAtividadeNaoEncontrada,
  ErroAtividadeJaConferida,
  ErroItemNaoEncontrado,
  ErroDestinoNaoEscolhido,
  ErroNomeAmbiguo,
  ErroQuantidadeIndefinida,
  ErroSchemaDesatualizado,
} from "@/lib/estoque-conferencia";

export const dynamic = "force-dynamic";

// Mesmo gate do resto do Estoque no desktop — ver o comentário em
// ./pendentes/route.ts.
const CHAVE = "estoque:itens";

const PAGINA = 50;

/**
 * Teto da consulta que conta as tentativas de cada atividade. 50 conferências
 * na página, então isto dá 10 tentativas por atividade antes de saturar — e
 * quando satura a contagem é DESCARTADA em vez de sair errada (ver abaixo).
 */
const TENTATIVAS_TETO = 500;

interface LinhaConferencia {
  id: string;
  atividade_id: string;
  item_id: string | null;
  executor_id: string | null;
  executor_nome: string | null;
  conferido_por_id: string | null;
  conferido_por_nome: string | null;
  resultado: string;
  quantidade: number;
  defeitos: string[] | null;
  obs: string | null;
  unidade_id: string | null;
  conferido_em: string;
}

/**
 * GET /api/estoque/conferencias — o HISTÓRICO, linha a linha.
 *
 * Antes desta rota, `obs`, `conferido_por_nome` e `conferido_em` eram
 * write-only no sistema inteiro: o gestor digitava "chegou com a borda lascada,
 * falei com o Fulano" e esse texto nunca mais era visto por ninguém. Os únicos
 * SELECTs da tabela liam `id` (checagem de duplicata), `atividade_id` (a fila) e
 * o agregado de /api/estoque/score. Auditar exige a linha, não a média.
 *
 * A MESMA atividade aparece VÁRIAS vezes de propósito — reprovada, reprovada,
 * aprovada. Isso não é lixo a deduplicar: é o histórico do refazer, e é ele que
 * conta se a caixa saiu certa de primeira ou na terceira. Por isso cada linha
 * vem com `tentativa`/`tentativas`, apurados no banco (e não pela posição
 * dentro da página, que mentiria assim que uma tentativa antiga caísse fora da
 * janela).
 *
 * Filtros opcionais: `pessoa` (quem PRODUZIU), `item`, `de`/`ate` (por
 * `conferido_em`) e `antesDe` (cursor de paginação).
 */
export async function GET(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const p = req.nextUrl.searchParams;
  const db = createSupabaseAdminClient();

  let q = db
    .from("estoque_conferencias")
    .select("id,atividade_id,item_id,executor_id,executor_nome,conferido_por_id,conferido_por_nome,resultado,quantidade,defeitos,obs,unidade_id,conferido_em")
    .order("conferido_em", { ascending: false })
    .limit(PAGINA);

  const pessoa = p.get("pessoa");
  if (pessoa) q = q.eq("executor_id", pessoa);
  const item = p.get("item");
  if (item) q = q.eq("item_id", item);
  const de = p.get("de");
  if (de) q = q.gte("conferido_em", de);
  const ate = p.get("ate");
  if (ate) q = q.lte("conferido_em", ate);
  const antesDe = p.get("antesDe");
  if (antesDe) q = q.lt("conferido_em", antesDe);

  const { data, error } = await q;
  // Sem a tabela, o histórico é "ninguém conferiu ainda" — que é a verdade.
  // Mesmo tratamento de /api/estoque/score: um 500 aqui pintaria de vermelho
  // uma aba inteira só porque o QC ainda não foi ligado.
  if (error && schemaDesatualizado(error)) {
    return NextResponse.json({ conferencias: [], proximoCursor: null, qcDesligado: true });
  }
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });

  const linhas = (data ?? []) as LinhaConferencia[];

  // Nome do item numa consulta só pro lote (nunca embed: `tabela(campos)` é o
  // que pesa numa listagem).
  const itemIds = [...new Set(linhas.map((l) => l.item_id).filter((i): i is string => !!i))];
  const nomePorItem = new Map<string, string>();
  if (itemIds.length) {
    const { data: itens } = await db.from("estoque_itens").select("id,nome").in("id", itemIds).limit(PAGINA);
    for (const it of (itens ?? []) as { id: string; nome: string }[]) nomePorItem.set(it.id, it.nome);
  }

  // O código da caixa que NASCEU da aprovação. Sem ele o histórico diz "entraram
  // 50 peças" e não dá pra ir do papel colado na caixa até quem a aprovou —
  // que é a única pergunta que alguém faz olhando uma caixa parada no galpão.
  const unidadeIds = [...new Set(linhas.map((l) => l.unidade_id).filter((u): u is string => !!u))];
  const codigoPorUnidade = new Map<string, string>();
  if (unidadeIds.length) {
    const { data: us } = await db.from("estoque_unidades").select("id,codigo").in("id", unidadeIds).limit(PAGINA);
    for (const u of (us ?? []) as { id: string; codigo: string }[]) codigoPorUnidade.set(u.id, u.codigo);
  }

  // Quantas vezes cada atividade já foi conferida, e qual destas vezes é cada
  // linha. Numerar pela posição DENTRO da página seria mentira: a página é uma
  // janela por data, e a primeira tentativa de uma atividade de três semanas
  // atrás quase nunca cabe nela junto com a última.
  const atividadeIds = [...new Set(linhas.map((l) => l.atividade_id))];
  const ordemPorAtividade = new Map<string, string[]>();
  let contagemConfiavel = false;
  if (atividadeIds.length) {
    const { data: todas, error: eT } = await db
      .from("estoque_conferencias")
      .select("id,atividade_id")
      .in("atividade_id", atividadeIds)
      .order("conferido_em", { ascending: true })
      .limit(TENTATIVAS_TETO);
    const tentativas = (todas ?? []) as { id: string; atividade_id: string }[];
    // Saturou o teto? O corte comeu justamente as tentativas mais NOVAS, então
    // "2ª de 3" sairia numa linha que é a 2ª de sete. Sem contagem é melhor que
    // com contagem errada — a tela simplesmente não numera.
    contagemConfiavel = !eT && tentativas.length < TENTATIVAS_TETO;
    if (contagemConfiavel) {
      for (const t of tentativas) {
        const atual = ordemPorAtividade.get(t.atividade_id);
        if (atual) atual.push(t.id);
        else ordemPorAtividade.set(t.atividade_id, [t.id]);
      }
    }
  }

  const conferencias = linhas.map((l) => {
    const ordem = ordemPorAtividade.get(l.atividade_id);
    const posicao = ordem ? ordem.indexOf(l.id) : -1;
    return {
      id: l.id,
      atividadeId: l.atividade_id,
      itemId: l.item_id,
      itemNome: l.item_id ? nomePorItem.get(l.item_id) ?? null : null,
      executorId: l.executor_id,
      executorNome: l.executor_nome,
      conferidoPorId: l.conferido_por_id,
      conferidoPorNome: l.conferido_por_nome,
      resultado: l.resultado,
      quantidade: l.quantidade,
      unidadeCodigo: l.unidade_id ? codigoPorUnidade.get(l.unidade_id) ?? null : null,
      defeitos: l.defeitos ?? [],
      obs: l.obs,
      conferidoEm: l.conferido_em,
      tentativa: posicao >= 0 ? posicao + 1 : null,
      tentativas: ordem ? ordem.length : null,
    };
  });

  return NextResponse.json({
    conferencias,
    proximoCursor: linhas.length === PAGINA ? linhas[linhas.length - 1].conferido_em : null,
    qcDesligado: false,
  });
}

/**
 * POST /api/estoque/conferencias — registrar a conferência PELA WEB.
 *
 * A REGRA é a mesma função da rota do tablet (`registrarConferencia` de
 * lib/estoque-conferencia.ts), não uma cópia: grava a conferência e, no CERTO,
 * faz nascer a caixa (uma etiqueta valendo o que a pessoa produziu) e fecha a
 * atividade; no ERRADO não entra nada e a atividade reabre pra refazer — um ato
 * só. Três diferenças em relação à irmã do aparelho, todas por causa do
 * contexto:
 *
 *  - `conferidoPorId` NUNCA vem do corpo. No tablet vem, porque lá o operador é
 *    escolhido na tela do galpão; aqui existe sessão, então é sempre `me.id`.
 *    É o que faz "quem confere não pode ser quem fez" valer de verdade — um id
 *    vindo do cliente seria só uma sugestão.
 *  - Sem `operationId`/`estoque_operacoes`: aquilo é a fila offline do Android,
 *    que reenvia até ter certeza que chegou. No navegador não há fila; contra o
 *    duplo clique valem o botão desabilitado e o `ErroAtividadeJaConferida`.
 *  - Sem `ocorridoEm`: no tablet a conferência pode ter acontecido offline há
 *    duas horas. Na web o momento é agora, e aceitar data do cliente só abriria
 *    caminho pra histórico com carimbo escolhido a dedo.
 */
export async function POST(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Conferência de atividade desligada (lib/conferencia-de-atividade.ts):
  // nada entra no estoque por atividade — só pela mão de quem cuida dele.
  if (!CONFERENCIA_DE_ATIVIDADE_LIGADA) return NextResponse.json({ error: ERRO_CONFERENCIA_DESLIGADA }, { status: 410 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "dados_invalidos" }, { status: 400 }); }

  const atividadeId = typeof b.atividadeId === "string" ? b.atividadeId : "";
  // QUANTIDADE NÃO VEM DO CORPO. Ela é a que a pessoa registrou ao concluir a
  // atividade, lida do banco lá dentro — o gerente só diz certo ou errado.
  const resultado = typeof b.resultado === "string" ? b.resultado : "";
  // EM QUE item do catálogo a produção entra, escolhido por quem confere. A
  // atividade quase nunca aponta um produto (ver lib/estoque-fila-conferencia.ts),
  // então este campo é o que torna a aprovação possível. Só a aprovação usa.
  const destinoId = typeof b.destinoId === "string" && b.destinoId ? b.destinoId : null;
  const defeitos = (Array.isArray(b.defeitos) ? b.defeitos : []).map((d) => String(d));
  const obs = b.obs ? String(b.obs).trim().slice(0, 2000) || null : null;

  if (!atividadeId) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });

  // Ligar a etiquetagem de um item zerado no meio da aprovação é escrever no
  // CADASTRO, e esta rota entra por `estoque:itens`, que é só ver. Sem
  // `estoque:ajustar` (ou papel do galpão) a conferência aprova igual, mas não
  // converte item nenhum — senão conferir seria a porta lateral que
  // /api/estoque/unidades/preparar fecha de propósito.
  const podeAjustar = await podeAjustarEstoque(me);

  try {
    const feito = await registrarConferencia({
      atividadeId, destinoId, resultado, defeitos, obs,
      conferidoPorId: me.id, conferidoPorNome: me.name, ocorridoEm: null,
      podeAjustar,
    });
    return NextResponse.json({ ok: true, ...feito });
  } catch (e) {
    if (e instanceof ErroResultadoInvalido) return NextResponse.json({ error: "resultado_invalido" }, { status: 400 });
    if (e instanceof ErroQuantidadeIndefinida) return NextResponse.json({ error: "quantidade_indefinida" }, { status: 400 });
    if (e instanceof ErroDefeitoInvalido) return NextResponse.json({ error: "defeito_invalido" }, { status: 400 });
    if (e instanceof ErroConferenteEExecutor) return NextResponse.json({ error: "conferente_e_executor" }, { status: 400 });
    if (e instanceof ErroAtividadeNaoEncontrada) return NextResponse.json({ error: "atividade_nao_encontrada" }, { status: 404 });
    if (e instanceof ErroAtividadeJaConferida) return NextResponse.json({ error: "atividade_ja_conferida" }, { status: 409 });
    if (e instanceof ErroDestinoNaoEscolhido) return NextResponse.json({ error: "destino_nao_escolhido" }, { status: 400 });
    if (e instanceof ErroItemNaoEncontrado) return NextResponse.json({ error: "item_nao_encontrado" }, { status: 404 });
    // Dois itens com o mesmo nome no catálogo. Aprovar depositaria a caixa em
    // um deles ao acaso — hoje num, amanhã no outro — e ninguém descobriria.
    if (e instanceof ErroNomeAmbiguo) return NextResponse.json({ error: "nome_ambiguo", quantos: e.quantos }, { status: 409 });
    if (e instanceof ErroSchemaDesatualizado) return NextResponse.json({ error: "schema_desatualizado" }, { status: 409 });
    return NextResponse.json({ error: "failed", detail: String((e as Error).message).slice(0, 120) }, { status: 500 });
  }
}
