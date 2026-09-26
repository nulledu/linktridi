import { tabletDaProducao } from "@/lib/tablet-da-producao";
import { podeReceberAtividade, setorRecebeAtividade } from "@/lib/atividades-lancador";
import { NextRequest, NextResponse } from "next/server";
import { podePegarDoPool } from "@/lib/device";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { colaboradoresDeTodosOsSetores, listAtividades, listPoolDoSetor, quemEParaOPool } from "@/lib/atividades";
import { podeAtividades } from "@/lib/atividades-acesso";
import { ehPrioridade } from "@/lib/atividades-catalog";
import { ehFaixa } from "@/lib/atividades-lancador";
import { notificar } from "@/lib/notificacoes";
import { presencaAgora } from "@/lib/ponto";
import { TEMPO_PADRAO_MIN } from "@/lib/producao-receita";
import { faixaDaAtividade } from "@/lib/atividade-faixa";
import { cached, invalidate } from "@/lib/cache";

// Quem pode o quê: a área Atividades (lib/atividades-acesso.ts) — ver o quadro
// da equipe, atribuir/mexer no que é dos outros. Antes era o cargo OU a área
// Pessoas; agora é uma área própria, com herança pra quem já abria a tela.

export const dynamic = "force-dynamic";

// GET ?mine=1 → minhas atividades. Sem mine → todas (gerentes/admin).
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const mine = req.nextUrl.searchParams.get("mine") === "1";
  if (mine) return NextResponse.json({ atividades: await listAtividades({ para_id: me.id }) });
  // Aba Atividades do colaborador (área Pessoas): admin vê as de OUTRA pessoa.
  const para = req.nextUrl.searchParams.get("para");
  if (para) {
    if (!(await podeAtividades(me, "ver"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ atividades: await listAtividades({ para_id: para }) });
  }
  if (!(await podeAtividades(me, "ver"))) {
    // Quem não acompanha a equipe vê o que é dele + o pool. Setor E departamento: a Logística é departamento de gente com setor
    // "Produção" — só o setor deixava o pool "Logística" invisível pra ela.
    const { chaves, especialidade } = await quemEParaOPool(me.id);
    const [atividades, poolDoSetor] = await Promise.all([listAtividades({ para_id: me.id }), listPoolDoSetor(chaves)]);
    // A mesma régua do tablet e do "pegar": quem VÊ a ordem consegue pegá-la,
    // e quem não pode pegá-la não a vê. Só o setor deixava peça de máquina no
    // pool de quem é da Logística (11/09).
    const pool = poolDoSetor.filter((a) => podePegarDoPool(especialidade, a));
    return NextResponse.json({ atividades, pool });
  }

  // Quadro do gestor — o GET mais quente do sistema (poll de 10s por aba aberta).
  //
  // `colaboradores` só sai quando pedido. A lista vem do servidor no primeiro
  // render (props do AtividadesClient) e MUDA quando alguém é contratado, ou
  // seja: quase nunca. Mesmo assim `colaboradoresAtribuiveis()` — que é um join
  // com `employees` — rodava a cada ciclo do poll e o cliente jogava fora a
  // resposta. Era trabalho de banco puro, dez vezes por minuto, por gestor.
  const comColaboradores = req.nextUrl.searchParams.get("com") === "colaboradores";

  // Cache curto compartilhado: a lista do gestor é a MESMA para todos os
  // gestores, então N abas polindo viram uma consulta a cada 5s em vez de N.
  //
  // 5s é o teto de defasagem, e é de propósito. As escritas chamam
  // `invalidate`, mas isso só limpa a instância que atendeu a escrita — em
  // serverless o poll seguinte pode cair em outra. Quem mexeu não sente: o
  // cliente já atualiza otimista e segura o poll por 3s. Não use este cache
  // pra nada que precise ser exato no instante da leitura.
  const atividades = await cached("atividades:todas", 5_000, () => listAtividades());

  return NextResponse.json({
    atividades,
    ...(comColaboradores ? { colaboradores: await colaboradoresDeTodosOsSetores() } : {}),
  });
}

// DELETE ?id= → remove uma atividade (gestor ou dono). Confirmação é no front.
export async function DELETE(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { data: row } = await db.from("atividades").select("para_id").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ ok: true });
  const isManager = await podeAtividades(me, "atribuir");
  if (!isManager && (row as { para_id: string }).para_id !== me.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { error } = await db.from("atividades").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  invalidate("atividades:");        // nesta instância; ver a nota do GET
  return NextResponse.json({ ok: true });
}

// POST → cria atribuição. Quem tem Atividades › Atribuir, pra qualquer setor.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeAtividades(me, "atribuir")))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: { categoria?: string; tarefa?: string; detalhe?: string; para_id?: string; setor?: string; pool?: boolean; prazo?: string; quantidade_alvo?: number; tempo_estimado_min?: number; produto_id?: number; produto_nome?: string; confirmar?: boolean; mesa_alvo?: string | null; prioridade?: string; faixa?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const modoPool = !!b.pool || b.para_id === "pool";
  if (!b.tarefa || (!modoPool && !b.para_id)) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  // Destino: pool do setor (sem dono, cai pro tablet) OU pessoa específica.
  let destino: { id: string | null; nome: string | null; setor: string | null };
  if (modoPool) {
    const setor = String(b.setor || "").trim();
    if (!setor) return NextResponse.json({ error: "missing_setor" }, { status: 400 });
    if (!setorRecebeAtividade(setor)) return NextResponse.json({ error: "setor_nao_recebe" }, { status: 403 });
    destino = { id: null, nome: null, setor };
  } else {
    const alvos = await colaboradoresDeTodosOsSetores();
    const alvo = alvos.find((c) => c.id === b.para_id);
    // Alcance: todos os setores. Só recusa quem não existe ou está inativo.
    if (!alvo) return NextResponse.json({ error: "fora_da_hierarquia" }, { status: 403 });
    // Só Produção/Máquinas/Preparo e Logística recebem atividade.
    if (!podeReceberAtividade(alvo)) return NextResponse.json({ error: "setor_nao_recebe", nome: alvo.nome }, { status: 403 });
    destino = { id: alvo.id, nome: alvo.nome, setor: alvo.setor };

    // Atividade DIRIGIDA a uma pessoa: se ela não bateu ponto (não está na empresa),
    // não bloqueia — mas avisa e pede confirmação. O painel reenvia com confirmar:true.
    if (!b.confirmar) {
      const pres = await presencaAgora([alvo.id]).catch(() => null);
      if (pres && pres.registrados.has(alvo.id) && !pres.presentes.has(alvo.id))
        return NextResponse.json({ error: "nao_presente", nome: alvo.nome }, { status: 409 });
    }
  }

  const qtd = Number(b.quantidade_alvo) > 0 ? Math.round(Number(b.quantidade_alvo)) : 1;
  // Tempo padrão de 1h por atividade quando não informado.
  const tempo = Number(b.tempo_estimado_min) > 0 ? Math.round(Number(b.tempo_estimado_min)) : TEMPO_PADRAO_MIN;
  const db = createSupabaseAdminClient();
  // A FAIXA (maquinas/producao/preparo) pra o pool rotear quem pega. Vem do
  // `setor_responsavel` do item produzido; sem item, cai na palavra-chave da
  // tarefa (preparar/chapa/tinta/montar caixa → preparo). Tolerante: sem a
  // coluna setor_responsavel no banco, usa só a tarefa.
  let setorResp: string | null = null;
  const nomeProd = b.produto_nome ? String(b.produto_nome).trim() : null;
  if (nomeProd) {
    try {
      const { data: it } = await db.from("estoque_itens").select("setor_responsavel").ilike("nome", nomeProd).limit(1);
      setorResp = (it?.[0]?.setor_responsavel as string | null) ?? null;
    } catch { /* sem a coluna: fica só a tarefa */ }
  }
  // Quem manda do pop-up da Visão geral ESCOLHEU a faixa (Máquinas/Produção/
  // Preparo): a escolha vence a dedução pelo item e pela palavra-chave.
  const faixa = ehFaixa(b.faixa) ? b.faixa : faixaDaAtividade(setorResp, b.tarefa);
  // mesa_alvo = tablet onde cai. Sem escolha (o PC não tem o seletor), vai pro
  // tablet da Produção — o único que recebe atividade (lib/tablet-da-producao).
  const mesaPedida = (typeof b.mesa_alvo === "string" && b.mesa_alvo.trim()) ? b.mesa_alvo.trim() : null;
  const mesaAlvo = mesaPedida ?? await tabletDaProducao(db).catch(() => null);
  const row: Record<string, unknown> = {
    categoria: b.categoria || "Geral",
    tarefa: b.tarefa,
    detalhe: b.detalhe || null,
    para_id: destino.id,
    para_nome: destino.nome ?? "",   // pool = sem dono; "" satisfaz o NOT NULL
    setor: destino.setor,
    pool: modoPool,
    por_id: me.id,
    por_nome: me.name || me.username,
    status: "pendente",
    prazo: b.prazo || null,
    quantidade_alvo: qtd,
    quantidade_feita: 0,
    tempo_estimado_min: tempo,
    produto_id: null, // produção vai pro CATÁLOGO (estoque_itens) por nome, não pelo estoque antigo
    produto_nome: nomeProd,
    mesa_alvo: mesaAlvo,
    faixa,
  };
  // Prioridade só vai quando foi escolhida: ausente = Média na tela.
  if (ehPrioridade(b.prioridade)) row.prioridade = b.prioridade;
  let { data, error } = await db.from("atividades").insert(row).select().single();
  // Coluna mesa_alvo ainda não criada → insere sem ela.
  if (error && /mesa_alvo/.test(error.message)) { const { mesa_alvo: _mv, ...r } = row; void _mv; ({ data, error } = await db.from("atividades").insert(r).select().single()); }
  // Coluna faixa ainda não criada → insere sem ela.
  if (error && /faixa/.test(error.message)) { const { faixa: _f, ...r } = row; void _f; ({ data, error } = await db.from("atividades").insert(r).select().single()); }
  // Coluna prioridade ainda não criada (supabase/atividades_prioridade.sql) → sem ela.
  if (error && /prioridade/.test(error.message)) { const { prioridade: _p, ...r } = row; void _p; ({ data, error } = await db.from("atividades").insert(r).select().single()); }
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });

  // Notifica o colaborador atribuído (pool não tem dono → sem notificação aqui).
  if (destino.id) {
    await notificar({ user_id: destino.id, tipo: "tarefa", titulo: "Nova atividade", corpo: String(b.tarefa), link: "/minhas-atividades", de_nome: me.name || me.username });
  }
  invalidate("atividades:");          // nesta instância; ver a nota do GET
  return NextResponse.json({ atividade: data });
}

// PATCH → muda status e/ou quantidade feita (dono ou gestor).
// Body: { id, status?, quantidade_feita? }
export async function PATCH(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: { id?: string; status?: string; quantidade_feita?: number; foto_url?: string; prioridade?: string; motivo?: string | null };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const mudaStatus = b.status !== undefined;
  // `cancelada` entrou em 17/09/2026 com a coluna Cancelada do Histórico: a
  // atividade sai da fila de quem faz e fica guardada com o motivo. Só quem
  // distribui trabalho cancela — pra quem faz existe "não consigo fazer"
  // (impedimento), que é outra coisa: ela continua sendo um problema a resolver.
  if (mudaStatus && !["pendente", "em_andamento", "concluida", "cancelada"].includes(b.status || ""))
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data: row } = await db.from("atividades")
    .select("para_id, iniciada_at, quantidade_alvo, quantidade_feita, produto_id, produto_nome, tarefa, estoque_lancado")
    .eq("id", b.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const r = row as { para_id: string; iniciada_at: string | null; quantidade_alvo: number; quantidade_feita: number; produto_id: number | null; produto_nome: string | null; tarefa: string; estoque_lancado: boolean };
  const isOwner = r.para_id === me.id;
  const isManager = await podeAtividades(me, "atribuir");
  if (!isOwner && !isManager) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (b.status === "cancelada" && !isManager) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const patch: Record<string, unknown> = {};
  let qFeita = r.quantidade_feita;
  if (b.quantidade_feita !== undefined) {
    qFeita = Math.max(0, Math.round(Number(b.quantidade_feita) || 0));
    patch.quantidade_feita = qFeita;
    if (!mudaStatus && r.quantidade_alvo > 0 && qFeita >= r.quantidade_alvo) b.status = "concluida";
  }
  if (b.status !== undefined) {
    patch.status = b.status;
    if (b.status === "em_andamento" && !r.iniciada_at) {
      const agora = new Date().toISOString();
      patch.iniciada_at = agora;
      // Iniciar pelo site uma atividade que ainda não tinha começado É o
      // aceite (é o que apaga a chamada "aguardando aceite" na TV do setor).
      patch.aceita_at = agora;
    }
    patch.concluida_at = b.status === "concluida" ? new Date().toISOString() : null;
    // Cancelar guarda o porquê no mesmo campo do impedimento: é o texto que a
    // coluna Cancelada mostra, venha ele do gestor ou do tablet. Voltar pra
    // pendente limpa os dois — senão o card volta pra fila com um aviso
    // vermelho de um problema que já foi resolvido.
    if (b.status === "cancelada") patch.motivo_impedimento = (b.motivo || "").trim() || "Cancelada";
    if (b.status === "pendente") { patch.impedida = false; patch.motivo_impedimento = null; }
    // Reabrir (sair de concluída) zera o registro de "feito" se ele tinha sido
    // preenchido só pela conclusão — evita herdar valor antigo errado.
  }
  if (typeof b.foto_url === "string") patch.foto_url = b.foto_url || null;
  // Prioridade é decisão de quem distribui o trabalho (Atribuir), não de quem faz.
  if (b.prioridade !== undefined) {
    if (!isManager) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!ehPrioridade(b.prioridade)) return NextResponse.json({ error: "invalid_prioridade" }, { status: 400 });
    patch.prioridade = b.prioridade;
  }

  // Concluindo sem ter contado unidade a unidade: a quantidade feita passa a ser
  // a META (a tarefa foi concluída por inteiro). Antes ficava em 0 → "0 feito"
  // no histórico e produtividade subcontada. Se a pessoa contou algo (>0), respeita.
  if (b.status === "concluida" && qFeita <= 0) {
    qFeita = r.quantidade_alvo > 0 ? r.quantidade_alvo : 1;
    patch.quantidade_feita = qFeita;
  }

  // Concluir NÃO dá entrada no estoque. Concluir quer dizer "terminei, está na
  // minha caixa"; quem transforma isso em peça no estoque é a conferência
  // (/api/estoque/device/conferencia), que é onde alguém olha o trabalho, dá a
  // nota e imprime as etiquetas. Por isso `estoque_lancado` continua `false`
  // aqui — é ele que faz a atividade aparecer na fila de "a conferir".

  let { error } = await db.from("atividades").update(patch).eq("id", b.id);
  // Banco sem a coluna `aceita_at` (SQL de ordens v2 não rodado): grava sem o
  // carimbo — mesma tolerância do accept do tablet.
  if (error && patch.aceita_at && /column .* does not exist|Could not find the .* column/i.test(error.message)) {
    delete patch.aceita_at;
    ({ error } = await db.from("atividades").update(patch).eq("id", b.id));
  }
  // Banco sem a coluna `prioridade` (supabase/atividades_prioridade.sql não
  // rodado): diz o que falta em vez de um 500 genérico.
  if (error && patch.prioridade && /prioridade/.test(error.message))
    return NextResponse.json({ error: "sem_coluna_prioridade" }, { status: 409 });
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  invalidate("atividades:");          // nesta instância; ver a nota do GET
  return NextResponse.json({ ok: true });
}
