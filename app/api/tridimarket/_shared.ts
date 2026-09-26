import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createTridiMarketAdminClient } from "../../../lib/tridimarket/client";
import { isMissingMarketSchema, TridiMarketRepository } from "../../../lib/tridimarket/repository";

type MarketAdminProfile = {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
  password_set: boolean;
};

export const profileIdsQuery = z.array(z.string().uuid()).max(20).optional();

export const productPatchInput = z.object({
  id: z.coerce.number().int().positive(),
  profileId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160).optional(),
  price: z.coerce.number().min(0).max(100_000).optional(),
  active: z.boolean().optional(),
  imageUrl: z.string().url().nullable().optional(),
  minimumStock: z.coerce.number().int().min(0).max(1_000_000).optional(),
  allowStockOverride: z.boolean().optional(),
  semCodigo: z.boolean().optional(),
  // Some da lista de busca do totem, mas segue vendável ao bipar.
  ocultoBusca: z.boolean().optional(),
  // Confirmação de que repetir o código de barras é DE PROPÓSITO. Sem ela a
  // rota recusa o repetido — é o que evita criar um duplicado por engano ao
  // digitar um EAN errado, que era o papel da restrição `unique` no banco.
  permitirCodigoRepetido: z.boolean().optional(),
  // Categoria (bebidas, congelados...). null = tirar a categoria. Dava pra
  // definir só ao CRIAR o produto — editar não tinha como, então um produto
  // cadastrado sem categoria ficava preso em "—" pra sempre.
  categoriaId: z.coerce.number().int().positive().nullable().optional(),
  // Código de barras: string vazia ou null = tirar o código (produto passa a
  // ser achado por toque). Só dígitos — bipar produz dígitos, e um código com
  // espaço ou letra nunca casaria com a leitura do scanner.
  codigoBarras: z.string().trim().regex(/^\d*$/).max(20).nullable().optional(),
}).refine((v) => Object.keys(v).some((key) => key !== "id" && key !== "profileId"), "no_changes");

export const employeePatchInput = z.object({
  id: z.coerce.number().int().positive(),
  nome: z.string().trim().min(2).max(120).optional(),
  active: z.boolean().optional(),
  normalLimit: z.coerce.number().min(0).max(1_000_000).optional(),
  pin: z.string().regex(/^\d{4,6}$/).optional(),
  blocked: z.boolean().optional(),
  fotoUrl: z.string().url().max(500).nullable().optional(),
  // Trocar a pessoa de empresa. Muda ONDE a dívida dela cai daqui pra frente;
  // o que já foi comprado continua na empresa de origem (os lançamentos
  // guardam a unidade da época e são imutáveis).
  unidadeId: z.string().uuid().optional(),
  // Vínculo com o usuário do Gaius: uuid pra ligar, null pra desligar.
  usuarioId: z.string().uuid().nullable().optional(),
}).refine((v) => Object.keys(v).some((k) => k !== "id"), "no_changes");

export const paymentInput = z.object({
  employeeId: z.coerce.number().int().positive(),
  profileId: z.string().uuid(),
  amount: z.coerce.number().positive().max(1_000_000),
  method: z.enum(["cash", "pix", "card", "transfer", "other"]).default("other"),
  note: z.string().trim().max(500).optional(),
});

export const ledgerAdjustmentInput = z.object({
  employeeId: z.coerce.number().int().positive(),
  profileId: z.string().uuid(),
  amount: z.coerce.number().min(-1_000_000).max(1_000_000).refine((v) => v !== 0),
  description: z.string().trim().min(3).max(500),
});

export const inventoryAdjustmentInput = z.object({
  productId: z.coerce.number().int().positive(),
  profileId: z.string().uuid(),
  // "Empresa" deixou de existir separada da unidade e o catálogo devolve
  // `companyId: 0` desde então. Com `.positive()` o zero reprovava e TODO
  // ajuste de estoque morria em "invalid_inventory_adjustment", sem dizer
  // qual campo. O valor não é mais usado; fica aceito só para não quebrar
  // quem ainda o envia.
  companyId: z.coerce.number().int().min(0).optional(),
  delta: z.coerce.number().int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0),
  // Observação é OPCIONAL. Era `min(3)` e o caso mais comum — repor o que
  // acabou de chegar — não tem o que explicar: quem não escrevia nada levava
  // "invalid_inventory_adjustment" sem saber qual campo faltava.
  reason: z.string().trim().max(300).optional(),
  // Transferência: `profileId` é a origem, `toProfileId` o destino, e `delta`
  // passa a ser a quantidade que sai de um pra outro (sempre positiva). Sem
  // este campo a rota segue sendo o ajuste de sempre.
  toProfileId: z.string().uuid().optional(),
});

export const deviceCodeInput = z.object({
  profileId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
});

// Ajustes globais do mercadinho (escopo TODAS as empresas). Todos opcionais:
// a tela manda só o que mudou.
export const settingsInput = z.object({
  chequeEspecial: z.boolean().optional(),
  limiteExtra: z.coerce.number().min(0).max(1_000_000).optional(),
  limitePadrao: z.coerce.number().min(0).max(1_000_000).optional(),
  bloquearInadimplente: z.boolean().optional(),
  diasInadimplencia: z.coerce.number().int().min(1).max(365).optional(),
}).refine((v) => Object.keys(v).length > 0, "no_changes");

// Score do funcionário: número = nota do gestor (congela); null = voltar ao automático.
export const scoreInput = z.object({
  employeeId: z.coerce.number().int().positive(),
  score: z.coerce.number().int().min(0).max(100).nullable(),
});

// Confirmação de nota: itens conferidos pela pessoa antes de entrar no estoque.
export const notaConfirmInput = z.object({
  // `mercadinho.worker_jobs.id` é `bigint generated always as identity`, não
  // uuid: com `.uuid()` aqui, confirmar uma nota lida pelo worker respondia
  // `invalid_confirm` — o id chega como "42". E é OPCIONAL porque a entrada
  // digitada à mão não tem job nenhum por trás.
  jobId: z.string().trim().min(1).max(64).optional(),
  profileId: z.string().uuid(),
  // `min(0)`, não `positive()`: o catálogo devolve `companyId: 0` desde que
  // "empresa" deixou de existir separada da unidade — é o mesmo motivo já
  // documentado em `inventoryAdjustmentInput`. Com `positive()` toda confirmação
  // de nota morria em `invalid_confirm` sem dizer qual campo.
  companyId: z.coerce.number().int().min(0).optional(),
  itens: z.array(z.object({
    productId: z.coerce.number().int().positive().nullable().optional(),
    novoNome: z.string().trim().max(160).nullable().optional(),
    barcode: z.string().trim().max(60).nullable().optional(),
    quantidade: z.coerce.number().positive().max(100000),
    custo: z.coerce.number().min(0).max(1000000),
    precoVenda: z.coerce.number().min(0).max(1000000).nullable().optional(),
  }).refine((v) => v.productId || (v.novoNome && v.novoNome.length > 0), "item_sem_produto")).min(1).max(500),
});

// Gate das rotas /api/tridimarket/* (menos as /device/*, que usam token do
// tablet). Uma chave só: a área RESTRITA "tridimarket". O papel não entra na
// conta — ser admin do sistema não dá acesso ao mercadinho, e exigir admin
// aqui impediria liberar o mercadinho pra alguém que não é admin. O gate da
// página (app/(plataforma)/tridimarket/layout.tsx) usa exatamente esta chave;
// divergir produz o clássico "a página abre e a API devolve 403".
export async function requireMarketAdmin(): Promise<MarketAdminProfile | null> {
  // This import remains lazy so validation tests do not initialize the Next.js
  // cookies runtime. Route handlers still use the application's canonical auth.
  const { getProfileForModule } = await import("../../../lib/require-auth");
  const profile = await getProfileForModule("tridimarket");
  return profile ? (profile as MarketAdminProfile) : null;
}

export function marketDb() {
  return createTridiMarketAdminClient();
}

export function marketRepository() {
  return new TridiMarketRepository(marketDb());
}

// Intervalo da consulta, vindo da tela como instantes ISO (from/to). A tela é
// quem sabe o FUSO de quem está olhando — "hoje" é o dia local dela, não o do
// servidor. `days=N` segue aceito só para não quebrar chamadas antigas.
export function parseIntervalo(url: string): { de: string; ate: string } {
  const q = new URL(url).searchParams;
  const de = q.get("from");
  const ate = q.get("to");
  const valido = (v: string | null) => !!v && !Number.isNaN(new Date(v).getTime());
  if (valido(de) && valido(ate)) {
    const [a, b] = new Date(de!) <= new Date(ate!) ? [de!, ate!] : [ate!, de!];
    return { de: new Date(a).toISOString(), ate: new Date(b).toISOString() };
  }
  const dias = Math.min(366, Math.max(1, Number(q.get("days") ?? 30)));
  return { de: new Date(Date.now() - dias * 86_400_000).toISOString(), ate: new Date().toISOString() };
}

export function parseProfileIds(url: string): string[] | undefined {
  const raw = new URL(url).searchParams.getAll("profileId");
  const parsed = profileIdsQuery.safeParse(raw.length ? raw : undefined);
  return parsed.success ? parsed.data : undefined;
}

export function marketApiError(error: unknown) {
  const e = error as { message?: string; code?: string; details?: string; hint?: string };
  if (isMissingMarketSchema(e)) {
    // `detalhe` e `codigo` vão junto de propósito. "market_schema_missing —
    // run_supabase_tridimarket_migration" não diz NADA: o `isMissingMarketSchema`
    // casa com quatro situações diferentes (schema não exposto, tabela
    // inexistente, função inexistente, cache do PostgREST), e sem a mensagem
    // crua do banco a investigação vira adivinhação — foi o que aconteceu com a
    // foto da nota, duas rodadas seguidas.
    //
    // A rota é de admin autenticado (requireMarketAdmin), então mostrar o erro
    // do banco aqui não expõe nada a quem já não pode ler o schema inteiro.
    return NextResponse.json({
      ok: false,
      error: "market_schema_missing",
      action: "run_supabase_tridimarket_migration",
      codigo: e?.code ?? null,
      detalhe: e?.message || e?.details || e?.hint || null,
    }, { status: 503 });
  }
  return NextResponse.json({
    ok: false,
    error: e?.message || "market_error",
    codigo: e?.code ?? null,
    detalhe: e?.details || e?.hint || null,
  }, { status: 500 });
}

export async function audit(actorId: string, action: string, entityType: string, entityId: string | number | null, beforeData?: unknown, afterData?: unknown) {
  const db = marketDb();
  const { error } = await db.from("auditoria").insert({
    autor_id: actorId,
    acao: action,
    entidade: entityType,
    entidade_id: entityId == null ? null : String(entityId),
    antes: beforeData ?? null,
    depois: afterData ?? null,
  });
  if (error && !isMissingMarketSchema(error)) throw error;
}

// Auditoria de ação do TABLET. Diferente de `audit()`: aqui não existe usuário
// logado — o ator é o aparelho, então `actor_id` fica nulo e o tablet é
// identificado no payload.
//
// Grava as DUAS datas de propósito: a do APARELHO (quando a compra aconteceu de
// fato, possivelmente offline) e a do SERVIDOR (quando chegou). A diferença
// entre elas é justamente o sinal que se investiga — relógio adulterado ou fila
// offline longa. Uma data só não conta essa história.
//
// NUNCA derruba a operação: perder uma linha de log é ruim, perder a venda do
// funcionário no tablet é pior. Falha de auditoria é engolida de propósito.
export async function auditDevice(
  deviceId: string,
  action: string,
  entityType: string,
  entityId: string | number | null,
  dados?: Record<string, unknown>,
) {
  try {
    const db = marketDb();
    await db.from("auditoria").insert({
      autor_id: null,
      dispositivo_id: deviceId,
      acao: action,
      entidade: entityType,
      entidade_id: entityId == null ? null : String(entityId),
      depois: { registradoEmServidor: new Date().toISOString(), ...dados },
    });
  } catch { /* auditoria não bloqueia venda */ }
}

export function makeDeviceCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
