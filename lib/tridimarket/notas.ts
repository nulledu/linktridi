// Fila de "nota do supermercado → estoque". A imagem vive num bucket PRIVADO e
// só um worker (num PC da empresa) baixa e lê — nada vai pro Claude. Este módulo
// é a fronteira do servidor com `mercadinho.worker_jobs`; o worker fala com as
// rotas /api/worker/*, o painel com /api/tridimarket/notas.
//
// ── A TABELA É A DO SCHEMA `mercadinho`, e isso importa ─────────────────────
// Este arquivo nasceu contra `public.market_worker_jobs` (colunas kind,
// profile_id, image_path, result, error, attempts, created_at) e foi migrado
// PELA METADE pra `mercadinho.worker_jobs` (tipo, payload, resultado, erro,
// tentativas, criado_em). O resultado eram três quebras que só apareciam em
// produção:
//
//   1. `criarNotaJob` inseria `kind`/`unidade_id`/`image_path`/`created_by` —
//      colunas que não existem aqui. O insert morria em 42703.
//   2. `reivindicarJob` selecionava `status = 'pendente'` e reivindicava com
//      `status = 'queued'`: o update não casava NUNCA, então o worker nunca
//      recebia job. A fila enchia e a tela ficava "processando" pra sempre.
//   3. `mapJob` lia `result`/`error`/`attempts` (não existem) junto de
//      `criado_em`/`atualizado_em` (existem) — metade dos campos vinha vazia.
//
// O vocabulário de fora (queued/processing/done/error) fica como estava, pro
// worker e pra tela não mudarem: a tradução pro CHECK do banco
// ('pendente','processando','ok','erro') mora aqui, num lugar só.
//
import { compactarImagem } from "@/lib/armazenamento/compactar";
import { chaveValida, novaChave } from "@/lib/armazenamento/referencia";
import { b2Configurado, enviarPrivado, urlAssinadaLeitura } from "@/lib/armazenamento/privado";

// O que não é coluna vai em `payload` (jsonb): unidade, empresa, caminho da
// imagem e autor.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const BUCKET = "market-notas";

export interface NotaItemExtraido {
  nome: string;
  quantidade: number;
  precoUnitario: number;   // preço pago por unidade (custo)
  total?: number | null;
  codigo?: string | null;  // código de barras, quando veio do QR fiscal
}

export interface NotaResult {
  fonte: "qr_fiscal" | "ocr";
  emitente?: string | null;
  chave?: string | null;   // chave NFC-e, quando veio do QR
  itens: NotaItemExtraido[];
}

export interface WorkerJob {
  id: string;
  kind: string;
  status: "queued" | "processing" | "done" | "confirmed" | "error" | "failed";
  profileId: string | null;
  companyId: number | null;
  imagePath: string | null;
  result: NotaResult | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

// Tradução entre o CHECK do banco e o vocabulário do worker/tela. Só existem
// quatro estados no banco; `confirmed`/`failed` do lado de fora caem em `ok`/
// `erro`, que é o que a coluna aceita.
const STATUS_DO_BANCO: Record<string, WorkerJob["status"]> = {
  pendente: "queued", processando: "processing", ok: "done", erro: "error",
};
export const STATUS_PRO_BANCO: Record<WorkerJob["status"], string> = {
  queued: "pendente", processing: "processando", done: "ok",
  confirmed: "ok", error: "erro", failed: "erro",
};

// Exportada pra ser testável: é onde as duas convenções se encontram, e foi
// justamente aqui que metade dos campos vinha vazia.
export function mapJob(row: Record<string, unknown>): WorkerJob {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const statusCru = String(row.status ?? "pendente");
  return {
    id: String(row.id),
    kind: String(row.tipo ?? "nota_ocr"),
    status: STATUS_DO_BANCO[statusCru] ?? "queued",
    profileId: payload.profileId ? String(payload.profileId) : null,
    companyId: payload.companyId == null ? null : Number(payload.companyId),
    imagePath: payload.imagePath ? String(payload.imagePath) : null,
    result: (row.resultado as NotaResult | null) ?? null,
    error: row.erro ? String(row.erro) : null,
    attempts: Number(row.tentativas ?? 0),
    createdAt: String(row.criado_em ?? ""),
    updatedAt: String(row.atualizado_em ?? ""),
  };
}

// Sobe a imagem no bucket privado e enfileira o job. Devolve o id do job.
export async function criarNotaJob(
  db: Db,
  params: { profileId: string; companyId?: number | null; bytes: ArrayBuffer; contentType: string; createdBy?: string | null },
): Promise<{ jobId: string }> {
  // Foto de nota entra compactada (WebP ≤1600px) — legível pro OCR e 20× menor.
  { const c = await compactarImagem(params.bytes, params.contentType, "nota");
    params = { ...params, bytes: c.corpo as ArrayBuffer, contentType: c.mime }; }
  const ext = params.contentType.includes("webp") ? "webp" : params.contentType.includes("pdf") ? "pdf" : params.contentType.includes("png") ? "png" : "jpg";
  let nome: string;
  if (b2Configurado()) {
    // Desde set/2026 a foto da nota vai pro Backblaze; o worker recebe uma URL
    // assinada igual à de antes, só que do B2.
    nome = novaChave("documentos", `nota.${ext}`, params.contentType);
    nome = await enviarPrivado(nome, params.bytes, params.contentType);
  } else {
    nome = `${params.profileId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const up = await db.storage.from(BUCKET).upload(nome, params.bytes, { contentType: params.contentType, upsert: false });
    if (up.error) throw up.error;
  }
  const { data, error } = await db.from("worker_jobs").insert({
    tipo: "nota_ocr",
    status: "pendente",
    // Unidade, empresa, caminho da imagem e autor não são colunas desta tabela
    // (ela é a fila genérica do mercadinho): vão no `payload`.
    payload: {
      profileId: params.profileId,
      companyId: params.companyId ?? null,
      imagePath: nome,
      createdBy: params.createdBy ?? null,
    },
  }).select("id").single();
  if (error) throw error;
  return { jobId: String(data.id) };
}

export async function statusNota(db: Db, jobId: string): Promise<WorkerJob | null> {
  const { data, error } = await db.from("worker_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw error;
  return data ? mapJob(data) : null;
}

// Worker pega o job mais antigo em `queued` e o marca `processing` de forma
// otimista (só vira se ainda estava queued — evita dois workers no mesmo job).
// Devolve o job + uma URL ASSINADA de curta duração pra baixar a imagem.
export async function reivindicarJob(db: Db): Promise<{ job: WorkerJob; imageUrl: string | null } | null> {
  const { data: rows, error } = await db.from("worker_jobs")
    .select("*").eq("status", "pendente").order("criado_em", { ascending: true }).limit(1);
  if (error) throw error;
  const alvo = (rows ?? [])[0];
  if (!alvo) return null;
  const agora = new Date().toISOString();
  const { data: claimed, error: claimErr } = await db.from("worker_jobs")
    .update({ status: "processando", tentativas: Number(alvo.tentativas ?? 0) + 1, atualizado_em: agora })
    // `pendente`, não `queued`: o filtro tem que usar o valor DO BANCO, igual
    // ao do select acima. Com 'queued' o update não casava nunca — o job ficava
    // pendente pra sempre e o worker voltava de mãos vazias a cada ciclo.
    .eq("id", alvo.id).eq("status", "pendente").select("*").maybeSingle();
  if (claimErr) throw claimErr;
  if (!claimed) return null; // outro worker levou; o worker tenta de novo
  const caminho = (claimed.payload as { imagePath?: string } | null)?.imagePath ?? null;
  let imageUrl: string | null = null;
  if (caminho && chaveValida(String(caminho))) {
    imageUrl = await urlAssinadaLeitura(String(caminho), 300).catch(() => null);
  } else if (caminho) {
    const signed = await db.storage.from(BUCKET).createSignedUrl(String(caminho), 300);
    imageUrl = signed.data?.signedUrl ?? null;
  }
  return { job: mapJob(claimed), imageUrl };
}

// Item conferido pela pessoa, pronto pra dar entrada. Ou casa com um produto
// existente (productId), ou cria um novo (novoNome).
export interface NotaItemConfirmado {
  productId?: number | null;
  novoNome?: string | null;
  barcode?: string | null;
  quantidade: number;
  custo: number;            // preço pago por unidade
  precoVenda?: number | null; // preço de venda (produto novo); cai no custo se vazio
}

export interface ConfirmarNotaParams {
  // Sem job quando a pessoa DIGITA os itens em vez de fotografar a nota — o
  // worker (PC da empresa) fica desligado com frequência e não pode ser
  // pré-requisito pra dar entrada no estoque.
  jobId?: string | null;
  profileId: string;
  companyId?: number | null;
  itens: NotaItemConfirmado[];
}

// Dá entrada no estoque a partir dos itens conferidos: cria produto novo quando
// preciso, soma no estoque_perfil, guarda o custo (pro lucro) e loga a
// movimentação. No fim, marca o job como confirmado.
export async function confirmarNota(db: Db, p: ConfirmarNotaParams): Promise<{ entrouEstoque: number; criados: number }> {
  const agora = new Date().toISOString();
  let entrouEstoque = 0;
  let criados = 0;

  for (const item of p.itens) {
    const qtd = Number(item.quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) continue;
    let productId = item.productId ? Number(item.productId) : 0;

    // Produto novo: cria em produtos com o custo como base (ou o preço de venda
    // informado). preco_base é o preço de VENDA no totem.
    if (!productId) {
      const nome = (item.novoNome ?? "").trim();
      if (!nome) continue;
      const precoVenda = item.precoVenda != null && item.precoVenda > 0 ? Number(item.precoVenda) : Number(item.custo);
      const { data: novo, error } = await db.from("produtos").insert({
        nome: nome.slice(0, 160),
        preco_padrao: Math.round(precoVenda * 100) / 100,
        codigo_barras: item.barcode ? String(item.barcode).slice(0, 60) : null,
        ativo: true,
      }).select("id").single();
      if (error) throw error;
      productId = Number(novo.id);
      criados++;
    }

    // Soma no estoque da unidade.
    const { data: atual, error: atualErr } = await db.from("estoque")
      .select("quantidade").eq("unidade_id", p.profileId).eq("produto_id", productId).maybeSingle();
    if (atualErr) throw atualErr;
    const prox = Number(atual?.quantidade ?? 0) + qtd;
    if (atual) {
      const { error } = await db.from("estoque").update({ quantidade: prox, atualizado_em: agora })
        .eq("unidade_id", p.profileId).eq("produto_id", productId);
      if (error) throw error;
    } else {
      const { error } = await db.from("estoque").insert({ unidade_id: p.profileId, produto_id: productId, quantidade: prox });
      if (error) throw error;
    }

    // Custo (pro lucro = preço − custo). Tolerante à ausência da tabela.
    try {
      // O custo agora é coluna do próprio produto (era tabela à parte) — é o
      // que destrava margem e lucro reais no painel.
      await db.from("produtos")
        .update({ custo_padrao: Math.round(Number(item.custo) * 100) / 100, atualizado_em: agora })
        .eq("id", productId);
    } catch { /* tabela de custo ausente: entrada de estoque não bloqueia */ }

    // Log de movimentação (tolerante).
    try {
      await db.from("movimentacoes").insert({ unidade_id: p.profileId, produto_id: productId, tipo: "ENTRADA", quantidade: qtd, referencia: "nota" });
    } catch { /* sem tabela de movimentação: segue */ }
    entrouEstoque++;
  }

  // Entrada digitada à mão não tem job pra fechar.
  if (p.jobId) {
    const { error } = await db.from("worker_jobs")
      .update({ status: STATUS_PRO_BANCO.confirmed, atualizado_em: agora }).eq("id", p.jobId);
    if (error) throw error;
  }
  return { entrouEstoque, criados };
}

// Worker devolve o resultado (ou erro). done = itens prontos pra conferência.
export async function completarJob(
  db: Db,
  jobId: string,
  payload: { result?: NotaResult; error?: string },
): Promise<void> {
  const agora = new Date().toISOString();
  // `erro`/`ok` e as colunas `erro`/`resultado`: eram "error"/"done" com as
  // colunas `error`/`result`, e o CHECK da tabela só aceita
  // 'pendente','processando','ok','erro' — então a devolução do worker era
  // recusada pelo banco e o job ficava travado em `processando`.
  const patch: Record<string, unknown> = { atualizado_em: agora };
  if (payload.error) { patch.status = STATUS_PRO_BANCO.error; patch.erro = String(payload.error).slice(0, 2000); }
  else { patch.status = STATUS_PRO_BANCO.done; patch.resultado = payload.result ?? { fonte: "ocr", itens: [] }; patch.erro = null; }
  const { error } = await db.from("worker_jobs").update(patch).eq("id", jobId);
  if (error) throw error;
}
