import { NextRequest, NextResponse, after } from "next/server";
import { recarimbarFaixaDasOrdens } from "@/lib/atividade-faixa-ordens";
import { normalizarReceita } from "@/lib/estoque-receita-de-producao";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { isHierarquia } from "@/lib/estoque-hierarquia";
import { isColunaAusente, lerItensEstoque } from "@/lib/estoque-colunas";
import { normalizarSku, skuInvalido } from "@/lib/estoque-sku";
import { UNIDADE_PADRAO, normalizarUnidade } from "@/lib/estoque-unidade-compra";
import { verificarReabastecimento } from "@/lib/requisicoes";
import { lerConfig } from "@/lib/estoque-automacao";
import { meuNivel, resolveMyModuleKeys } from "@/lib/perfis";
import { podeCadastrarEstoque, poderesDoEstoque } from "@/lib/estoque-permissoes";
import { podeVerCustoNivel } from "@/lib/niveis";
import type { Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// supabase/estoque_hierarquia_unidades.sql roda NA MÃO — enquanto ninguém
// rodou, escrever hierarquia/produzido/serializado/fornecedor_id/local_id/
// largura_mm/altura_mm/espessura_mm/dim_unidade/cor/custo_em falha com 42703
// (coluna inexistente). Isso é ESCRITA: pode falhar alto, avisando a pessoa
// exatamente o que rodar — ver o catch de isColunaAusente() no POST e no
// PATCH. A LEITURA (GET) é outra história: ela precisa continuar de pé pra
// todo mundo, então usa lerItensEstoque() (lib/estoque-colunas.ts), que cai
// pro trio antigo (tipo/classe/tipo_item) sozinha quando a migração não rodou.
const SCHEMA_DESATUALIZADO = {
  error: "schema_desatualizado",
  detalhe: "Rode supabase/estoque_hierarquia_unidades.sql no Supabase — o catálogo lê normalmente, mas salvar exige as colunas novas.",
} as const;

/** Campo numérico opcional: "" e null viram null, resto vira número ≥ 0. */
const numOuNulo = (v: unknown): number | null =>
  v === undefined || v === null || v === "" ? null : Math.max(0, Number(v) || 0);

// ── SKU: a checagem de unicidade que o banco não tem ─────────────────────────
// Não existe UNIQUE em `estoque_itens.sku` (ver supabase/estoque_sku_unico.sql,
// que precisa ser rodado na mão). Sem esta checagem, dois itens com o mesmo SKU
// só se revelam MUITO depois: cada um calcula o próprio `max(seq)`, os dois
// montam o mesmo `codigo`, a UNIQUE de `estoque_unidades.codigo` barra o
// segundo, o retry recalcula exatamente a mesma coisa três vezes e a tela
// acusa "duas gerações ao mesmo tempo — tente de novo". Tentar de novo nunca
// resolve, e a causa apontada é a errada.
const paraIlike = (s: string) => s.replace(/([\\%_])/g, "\\$1");

async function donoDoSkuNoBanco(
  db: ReturnType<typeof createSupabaseAdminClient>,
  sku: string,
  exceto?: string,
): Promise<{ id: string; nome: string } | null> {
  // `ilike` sem curinga = igualdade sem ligar pra caixa: SKU antigo gravado
  // minúsculo ("iJIFYU7") tem que colidir com "IJIFYU7" digitado hoje.
  let q = db.from("estoque_itens").select("id,nome").ilike("sku", paraIlike(sku)).limit(1);
  if (exceto) q = q.neq("id", exceto);
  const { data, error } = await q;
  if (error) return null; // falha de leitura não bloqueia o cadastro; o índice único (quando rodado) é a rede de baixo
  return ((data ?? [])[0] as { id: string; nome: string } | undefined) ?? null;
}

/** Valida + procura dono. Devolve a resposta de erro pronta, ou null. */
async function problemaDeSku(
  db: ReturnType<typeof createSupabaseAdminClient>,
  sku: string,
  exceto?: string,
): Promise<NextResponse | null> {
  const invalido = skuInvalido(sku);
  if (invalido) return NextResponse.json({ error: "sku_invalido", detalhe: invalido }, { status: 400 });
  const dono = await donoDoSkuNoBanco(db, sku, exceto);
  if (dono) {
    return NextResponse.json({
      error: "sku_duplicado",
      detalhe: `O SKU ${sku} já é do item "${dono.nome}". O código de cada etiqueta começa pelo SKU, então dois itens não podem dividir o mesmo.`,
    }, { status: 409 });
  }
  return null;
}

/** Quantas etiquetas existem pro item. Tabela ausente conta como zero. */
async function quantasEtiquetas(db: ReturnType<typeof createSupabaseAdminClient>, itemId: string): Promise<number> {
  const { count, error } = await db
    .from("estoque_unidades")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId);
  if (error) return 0; // schema ainda não rodado (42P01) ou leitura falhou: não é motivo pra travar o cadastro
  return count ?? 0;
}

// A guarda `estoque_itens_guarda` (supabase/estoque_hierarquia_unidades.sql
// §6b) recusa ligar a etiqueta num item com estoque digitado e nenhuma
// etiqueta, e recusa desligar com etiqueta viva. Ela levanta `check_violation`
// (23514) com uma frase pronta, em português, explicando o que fazer — passar
// essa frase adiante é melhor do que reescrevê-la aqui e as duas versões
// derivarem. Sem isto virava 500 "failed", que a tela mostrava como erro
// genérico (ou, antes, engolia).
function erroDeBanco(error: { code?: string; message?: string }): NextResponse {
  if (isColunaAusente(error)) {
    // Duas migrações de mão diferentes; apontar o arquivo errado manda a
    // pessoa rodar um SQL que ela já rodou e concluir que "não funcionou".
    if (/producao_/.test(error.message ?? "")) {
      return NextResponse.json({
        error: "schema_desatualizado",
        detalhe: "Rode supabase/estoque_producao_receita.sql no Supabase — a receita da atividade (instrução e tempo) ainda não tem colunas.",
      }, { status: 409 });
    }
    return NextResponse.json(SCHEMA_DESATUALIZADO, { status: 409 });
  }
  if (error.code === "23514") return NextResponse.json({ error: "guarda_estoque", detalhe: error.message }, { status: 409 });
  if (error.code === "23505") {
    // ── A frase tem de dizer O QUE FAZER, não só o que houve ─────────────────
    //
    // Este ramo é a CORRIDA, não o engano: a checagem prévia (`problemaDeSku`)
    // já teria pego um SKU visivelmente ocupado e nomeado o dono. Chegar aqui
    // significa que o SKU foi tomado ENTRE a checagem e a gravação — duas abas
    // cadastrando, ou a sugestão da tela calculada sobre um catálogo que
    // envelheceu enquanto o modal estava aberto.
    //
    // A frase antiga ("Esse SKU já é de outro item…") descrevia a regra e
    // deixava a pessoa sem saída: ela não sabia qual número usar, e tentar de
    // novo com o mesmo campo dá o mesmo erro. Agora ela diz que basta reabrir
    // pra receber o próximo número livre, que é a ação que resolve.
    return NextResponse.json({
      error: "sku_duplicado",
      detalhe: "Esse SKU acabou de ser usado por outro item — provavelmente em outra aba ou por outra pessoa. " +
        "Feche e abra o cadastro: ele já vem com o próximo número livre.",
    }, { status: 409 });
  }
  return NextResponse.json({ error: "failed", detalhe: error.message, detail: error.message }, { status: 500 });
}

// Mexer no catálogo: a regra mora em lib/estoque-permissoes.ts porque a rota
// irmã de triagem em lote (classificar/) precisa do MESMO portão.
//
// Duas perguntas, não uma: o QUE existe (`estoque:cadastrar`) e QUANTO tem
// (`estoque:ajustar`). O antigo `estoque:itens` voltou a ser só ver, então ele
// não gateia mais escrita nenhuma daqui.

// Vê custo/preço se: nível ≥ 4 (legado) OU tem a sub-permissão estoque:precos.
async function verCusto(me: { id: string; role: string; username?: string | null }): Promise<boolean> {
  if (podeVerCustoNivel((await meuNivel(me as { id: string; role: Role })).nivel)) return true;
  // `username` junto: o bypass de superusuário casa por id OU username.
  return (await resolveMyModuleKeys({ id: me.id, role: me.role as Role, username: me.username })).includes("estoque:precos");
}

// GET → catálogo (todos os itens). Qualquer usuário autenticado.
export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const data = await lerItensEstoque(db);
  const podeVerCusto = await verCusto(me); // nível ≥ 4 OU sub estoque:precos
  const itens = data.map((it: Record<string, unknown>) => {
    if (podeVerCusto) return it;
    const { custo: _omit, custo_em: _omit2, ...rest } = it; // remove custo p/ não-admin
    void _omit; void _omit2;
    return rest;
  });
  // `podeCadastrar` e `podeAjustar` são o que a tela usa pra decidir cada
  // botão. `podeGerir` continua indo junto — é "pode mexer em alguma coisa" —
  // porque as provas de `/dev-*` e telas que só perguntam "sou espectador?"
  // ainda leem esse nome, e tirá-lo faria elas nascerem em modo leitura.
  const poderes = await poderesDoEstoque(me);
  return NextResponse.json({
    itens,
    podeGerir: poderes.cadastrar || poderes.ajustar,
    podeCadastrar: poderes.cadastrar,
    podeAjustar: poderes.ajustar,
    podeVerCusto,
  });
}

// POST → cria item.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  // ── As duas recusas pedem AÇÕES OPOSTAS, então não podem ter a mesma cara ──
  // A tela cai num "Não foi possível salvar. Tente de novo." quando a resposta
  // não traz `detalhe` — e "tente de novo" é conselho errado nos dois casos:
  // sessão morta pede entrar de novo, falta de permissão pede pedir a chave.
  if (!me) return NextResponse.json({ error: "unauthorized", detalhe: "Sua sessão expirou. Entre de novo e refaça o cadastro — o que você digitou não foi gravado." }, { status: 401 });
  if (!(await podeCadastrarEstoque(me))) return NextResponse.json({ error: "forbidden", detalhe: "Você não tem permissão pra cadastrar item. Peça a quem administra a sub-permissão \"Cadastrar e apagar item\" do Estoque." }, { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json", detalhe: "O formulário chegou ilegível. Recarregue a página e tente de novo." }, { status: 400 }); }
  const nome = String(b.nome || "").trim();
  if (!nome) return NextResponse.json({ error: "missing_nome", detalhe: "O item precisa de um nome." }, { status: 400 });
  if (!isHierarquia(b.hierarquia)) return NextResponse.json({ error: "hierarquia_invalida", detalhe: "Escolha a hierarquia — é ela que diz do que o item é feito." }, { status: 400 });
  const db = createSupabaseAdminClient();
  const sku = b.sku ? normalizarSku(String(b.sku)) : null;
  if (sku) {
    const problema = await problemaDeSku(db, sku);
    if (problema) return problema;
  }
  const { data, error } = await db.from("estoque_itens").insert({
    nome,
    hierarquia: String(b.hierarquia),
    produzido: !!b.produzido,
    serializado: !!b.serializado,
    ...(await verCusto(me) && b.custo !== undefined ? { custo: Math.max(0, Number(b.custo) || 0), custo_em: new Date().toISOString() } : {}),
    categoria: b.categoria ? String(b.categoria).trim() : null,
    // A receita no CREATE, pelo mesmo caminho do PATCH. Condicional: um corpo
    // sem receita não pode falhar num banco sem as colunas.
    ...(b.producao_instrucao !== undefined || b.producao_tempo_min !== undefined || b.producao_lote_de !== undefined
        || b.producao_tipo !== undefined || b.producao_maquina_id !== undefined
      ? (() => {
          const rec = normalizarReceita({ instrucao: b.producao_instrucao, tempoMin: b.producao_tempo_min, loteDe: b.producao_lote_de, tipo: b.producao_tipo, maquinaId: b.producao_maquina_id });
          return { producao_instrucao: rec.instrucao, producao_tempo_min: rec.tempoMin, producao_lote_de: rec.loteDe, producao_tipo: rec.tipo, producao_maquina_id: rec.maquinaId };
        })()
      : {}),
    // Quem faz e se repõe sozinho — condicionais pelo mesmo motivo da receita:
    // corpo que não fala deles não pode falhar num banco sem as colunas.
    ...(b.setor_responsavel !== undefined
      ? { setor_responsavel: b.setor_responsavel ? String(b.setor_responsavel).trim() : null } : {}),
    ...(b.producao_automatica !== undefined ? { producao_automatica: !!b.producao_automatica } : {}),
    imagem_url: b.imagem_url ? String(b.imagem_url) : null,
    // Normaliza no SERVIDOR, não só no seletor: a importação da planilha
    // manda "UNIDADE"/"PARES"/"GALÃO" direto, e unidade escrita de dois jeitos
    // é filtro que não casa e soma que não fecha.
    unidade: normalizarUnidade(b.unidade as string) || UNIDADE_PADRAO,
    quantidade: Math.max(0, Number(b.quantidade) || 0),
    qtd_minima: Math.max(0, Number(b.qtd_minima) || 0),
    sku,
    estoque_ideal: b.estoque_ideal !== undefined && b.estoque_ideal !== "" ? Math.max(0, Number(b.estoque_ideal) || 0) : null,
    requisitavel: !!b.requisitavel,
    setor_requisicao: b.requisitavel && b.setor_requisicao ? String(b.setor_requisicao) : null,
    fornecedor_id: b.fornecedor_id ? String(b.fornecedor_id) : null,
    local_id: b.local_id ? String(b.local_id) : null,
    largura_mm: numOuNulo(b.largura_mm),
    altura_mm: numOuNulo(b.altura_mm),
    espessura_mm: numOuNulo(b.espessura_mm),
    dim_unidade: ["mm", "cm", "m"].includes(String(b.dim_unidade)) ? String(b.dim_unidade) : "mm",
    cor: b.cor ? String(b.cor).trim() : null,
  }).select("id").single();
  if (error) return erroDeBanco(error);
  return NextResponse.json({ item: data });
}

// PATCH → edita item (qualquer campo).
export async function PATCH(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const poderes = await poderesDoEstoque(me);
  if (!poderes.cadastrar && !poderes.ajustar) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  // ── A única rota partida entre as duas permissões ──────────────────────────
  // O editor manda a ficha INTEIRA num PATCH só (nome, sku, dimensões… e a
  // quantidade). Recusar o lote com 403 porque um campo não é dela deixaria
  // quem tem `ajustar` sem conseguir corrigir a prateleira — e quem tem só
  // `cadastrar` sem conseguir renomear um item. Então o corte é POR CAMPO,
  // aqui, antes de montar o patch: o que a pessoa não pode escrever sai do
  // corpo e o resto grava normalmente.
  const DE_QUANTIDADE = new Set(["quantidade"]);
  if (!poderes.ajustar) for (const k of DE_QUANTIDADE) delete b[k];
  if (!poderes.cadastrar) for (const k of Object.keys(b)) if (k !== "id" && !DE_QUANTIDADE.has(k)) delete b[k];
  const db = createSupabaseAdminClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.nome !== undefined) patch.nome = String(b.nome).trim();
  if (b.categoria !== undefined) patch.categoria = b.categoria ? String(b.categoria).trim() : null;
  if (b.imagem_url !== undefined) patch.imagem_url = b.imagem_url ? String(b.imagem_url) : null;
  if (b.unidade !== undefined) patch.unidade = normalizarUnidade(b.unidade as string) || UNIDADE_PADRAO;
  if (b.quantidade !== undefined) patch.quantidade = Math.max(0, Number(b.quantidade) || 0);
  if (b.qtd_minima !== undefined) patch.qtd_minima = Math.max(0, Number(b.qtd_minima) || 0);
  if (b.custo !== undefined && await verCusto(me)) {
    // custo: nível≥4 ou sub estoque:precos; custo_em = valor da última compra
    patch.custo = Math.max(0, Number(b.custo) || 0);
    patch.custo_em = new Date().toISOString();
  }
  if (b.sku !== undefined) {
    const novo = b.sku ? normalizarSku(String(b.sku)) : null;
    if (novo) {
      const problema = await problemaDeSku(db, novo, id);
      if (problema) return problema;
    } else if (await quantasEtiquetas(db, id) > 0) {
      // Apagar o SKU de um item que JÁ tem etiqueta impressa deixa a prateleira
      // cheia de códigos "PEC-0001-000042" sem dono no cadastro — e a próxima
      // geração inventa outro SKU, criando uma segunda família de código pro
      // mesmo item. Era o que acontecia sozinho: o modal continuava com o SKU
      // vazio em memória depois da geração e o Salvar seguinte mandava null.
      return NextResponse.json({
        error: "sku_em_uso",
        detalhe: "Este item já tem etiquetas impressas com esse SKU — apagá-lo deixaria as etiquetas sem dono. Troque por outro SKU (as etiquetas antigas continuam válidas) em vez de esvaziar o campo.",
      }, { status: 409 });
    }
    patch.sku = novo;
  }
  if (b.estoque_ideal !== undefined) patch.estoque_ideal = b.estoque_ideal === "" || b.estoque_ideal === null ? null : Math.max(0, Number(b.estoque_ideal) || 0);
  if (b.requisitavel !== undefined) patch.requisitavel = !!b.requisitavel;
  if (b.setor_requisicao !== undefined) patch.setor_requisicao = b.setor_requisicao ? String(b.setor_requisicao) : null;
  if (b.ativo !== undefined) patch.ativo = !!b.ativo;
  if (b.hierarquia !== undefined && isHierarquia(b.hierarquia)) patch.hierarquia = String(b.hierarquia);
  if (b.produzido !== undefined) patch.produzido = !!b.produzido;
  if (b.serializado !== undefined) patch.serializado = !!b.serializado;
  if (b.fornecedor_id !== undefined) patch.fornecedor_id = b.fornecedor_id ? String(b.fornecedor_id) : null;
  if (b.local_id !== undefined) patch.local_id = b.local_id ? String(b.local_id) : null;
  if (b.largura_mm !== undefined) patch.largura_mm = numOuNulo(b.largura_mm);
  if (b.altura_mm !== undefined) patch.altura_mm = numOuNulo(b.altura_mm);
  if (b.espessura_mm !== undefined) patch.espessura_mm = numOuNulo(b.espessura_mm);
  if (b.dim_unidade !== undefined && ["mm", "cm", "m"].includes(String(b.dim_unidade))) patch.dim_unidade = String(b.dim_unidade);
  if (b.cor !== undefined) patch.cor = b.cor ? String(b.cor).trim() : null;
  // ── A receita de produção (instrução + tempo por lote) ────────────────────
  // Vira o `detalhe` e o `tempo_estimado_min` da atividade de reposição — ver
  // lib/estoque-receita-de-producao.ts. Normaliza AQUI: instrução vazia grava
  // NULL (string vazia viraria bloco de instrução em branco na atividade).
  if (b.producao_instrucao !== undefined || b.producao_tempo_min !== undefined || b.producao_lote_de !== undefined
      || b.producao_tipo !== undefined || b.producao_maquina_id !== undefined) {
    const rec = normalizarReceita({ instrucao: b.producao_instrucao, tempoMin: b.producao_tempo_min, loteDe: b.producao_lote_de, tipo: b.producao_tipo, maquinaId: b.producao_maquina_id });
    if (b.producao_instrucao !== undefined) patch.producao_instrucao = rec.instrucao;
    if (b.producao_tempo_min !== undefined) patch.producao_tempo_min = rec.tempoMin;
    if (b.producao_lote_de !== undefined) patch.producao_lote_de = rec.loteDe;
    // O tipo e a máquina viajam JUNTOS, mesmo quando só um veio: normalizar
    // separado deixaria uma máquina escolhida sobreviver à troca pra manual.
    if (b.producao_tipo !== undefined || b.producao_maquina_id !== undefined) {
      patch.producao_tipo = rec.tipo;
      patch.producao_maquina_id = rec.maquinaId;
    }
  }
  // ── Quem faz, e se repõe sozinho ─────────────────────────────────────────
  // `setor_responsavel` é a única fonte EXPLÍCITA da faixa da ordem
  // (máquinas/preparo/produção). Sem ele a faixa era adivinhada pela
  // categoria, e adivinhação erra: "Bolinha Puxador" é categoria "Carimbos" e
  // ia pro montador, sendo que quem faz a bolinha é a máquina.
  // `producao_automatica` é o interruptor por item: nem tudo que fica abaixo
  // do mínimo deve virar atividade.
  if (b.setor_responsavel !== undefined) {
    patch.setor_responsavel = b.setor_responsavel ? String(b.setor_responsavel).trim() : null;
  }
  if (b.producao_automatica !== undefined) patch.producao_automatica = !!b.producao_automatica;

  // ── A quantidade com TRAVA (compare-and-swap) ──────────────────────────────
  // Quem manda `quantidade_antes` diz "mudei de X pra Y". A quantidade só é
  // gravada se o banco ainda estiver em X — e num UPDATE separado, pra a trava
  // não levar junto nome, categoria e o resto da ficha. Duas coisas que isto
  // resolve:
  //  · o editor abria com 40, alguém bipava uma saída (38), e renomear o item
  //    gravava 40 de volta — a baixa sumia sem ninguém ver;
  //  · a fila de salvamento em segundo plano reenvia depois de uma queda: com
  //    a trava, repetir "40 → 41" é inofensivo (o banco já está em 41).
  const antes = b.quantidade_antes;
  const casQtd = antes !== undefined && antes !== null && patch.quantidade !== undefined;
  const qtdNova = patch.quantidade as number | undefined;
  if (casQtd) delete patch.quantidade;

  let { error } = await db.from("estoque_itens").update(patch).eq("id", id);
  // Banco sem as colunas novas (SQL pendente): grava o resto em vez de
  // derrubar o save inteiro — mesma tolerância da receita de produção.
  if (error && /setor_responsavel|producao_automatica/i.test(error.message ?? "")) {
    const { setor_responsavel: _sr, producao_automatica: _pa, ...resto } = patch;
    ({ error } = await db.from("estoque_itens").update(resto).eq("id", id));
  }
  if (error) return erroDeBanco(error);

  if (casQtd) {
    const { data: trocou, error: eQtd } = await db.from("estoque_itens")
      .update({ quantidade: qtdNova, updated_at: new Date().toISOString() })
      .eq("id", id).eq("quantidade", Math.max(0, Number(antes) || 0)).select("id");
    if (eQtd) return erroDeBanco(eQtd);
    if (!trocou?.length) {
      const { data: agora } = await db.from("estoque_itens").select("quantidade").eq("id", id).maybeSingle();
      const atual = Number((agora as { quantidade?: number } | null)?.quantidade ?? 0);
      // Já está no número pedido = era um reenvio do mesmo pedido. Deu certo.
      if (atual !== qtdNova) {
        return NextResponse.json({
          error: "estoque_mudou", atual,
          detalhe: `A quantidade mudou enquanto você mexia — agora está ${atual}. O resto foi salvo; confira a quantidade e ajuste de novo.`,
        }, { status: 409 });
      }
    }
  }

  // ── O que é DERIVADO roda depois da resposta ─────────────────────────────
  // Era aqui que salvar demorava: a varredura de reposição (catálogo inteiro,
  // cadeia, criação de ordens) rodava DENTRO do PATCH toda vez que o corpo
  // trazia `quantidade` — e o editor sempre trazia. `after()` entrega o "ok"
  // na hora e faz o resto em seguida, na mesma invocação. E o editor agora só
  // manda a quantidade quando ela mudou.
  const setorNovo = patch.setor_responsavel as string | null | undefined;
  const mexeuNaQtd = casQtd || b.quantidade !== undefined;
  if (setorNovo !== undefined || mexeuNaQtd) {
    after(async () => {
      // Trocar QUEM FAZ vale pras ordens que já estão na fila, não só pras
      // próximas — ver lib/atividade-faixa-ordens.ts.
      if (setorNovo !== undefined) {
        const { data: it } = await db.from("estoque_itens").select("nome,categoria").eq("id", id).maybeSingle();
        if (it) await recarimbarFaixaDasOrdens(db, [{ ...(it as { nome: string; categoria: string | null }), setor_responsavel: setorNovo }]);
      }
      // Mudou a quantidade → checa a regra de estoque e cria reposição se faltar
      // — SÓ com a automação ligada (Estoque › Produção do dia). Antes varria
      // mesmo desligada: o interruptor segurava a varredura do dia e nada mais,
      // e mexer num saldo criava ordem igual. Em 11/09 o dono pediu as
      // automáticas desligadas; desligar tem de valer pra todo caminho.
      if (mexeuNaQtd) {
        try { if ((await lerConfig(db)).automacao_ativa) await verificarReabastecimento(); } catch { /* derivado */ }
      }
    });
  }
  return NextResponse.json({ ok: true });
}

// DELETE ?id= → remove item.
export async function DELETE(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await podeCadastrarEstoque(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const db = createSupabaseAdminClient();
  await db.from("estoque_itens").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
