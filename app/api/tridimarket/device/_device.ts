import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createTridiMarketAdminClient } from "../../../../lib/tridimarket/client";
import { isMissingMarketSchema } from "../../../../lib/tridimarket/repository";
import { validarTokenSessao } from "./_sessao";
import type { MarketEmployee } from "../../../../lib/tridimarket/types";

export const deviceActivationInput = z.object({
  code: z.string().regex(/^\d{6}$/),
  appVersion: z.string().trim().min(1).max(40),
  installationId: z.string().uuid(),
});

export const pinSessionInput = z.object({ pin: z.string().regex(/^\d{4,6}$/) });

export const deviceHeartbeatInput = z.object({
  pendingOperations: z.coerce.number().int().min(0).max(1_000_000),
  appVersion: z.string().trim().min(1).max(40).optional(),
  health: z.record(z.unknown()).optional(),
});

export const devicePurchaseInput = z.object({
  operationId: z.string().uuid(),
  localSequence: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
  companyId: z.coerce.number().int().positive(),
  deviceOccurredAt: z.string().datetime(),
  rulesVersion: z.coerce.number().int().positive().default(1),
  items: z.array(z.object({
    productId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive().max(100),
    unitPrice: z.coerce.number().min(0).max(100_000),
  })).min(1).max(100),
});

export type DeviceAuth = { id: string; profileId: string; name: string };

// Distingue "tablet não pareado/token inválido" (o usuário precisa gerar um
// código novo) de "schema do TridiMarket ainda não foi migrado" (nenhum código
// vai funcionar até a migração rodar). Antes as duas caíam no mesmo
// `invalid_device`, o que fazia parecer que o CÓDIGO estava errado.
export type DeviceAuthResult =
  | { ok: true; device: DeviceAuth }
  | { ok: false; reason: "schema_missing" | "invalid" };

export function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function bearerToken(req: NextRequest): string | null {
  const value = req.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() || null : null;
}

export async function authorizeDevice(req: NextRequest): Promise<DeviceAuthResult> {
  const token = bearerToken(req);
  if (!token) return { ok: false, reason: "invalid" };
  const db = createTridiMarketAdminClient();
  const { data, error } = await db.from("dispositivos").select("id,unidade_id,nome,ativo").eq("token_hash", tokenDigest(token)).eq("ativo", true).maybeSingle();
  if (error) return { ok: false, reason: isMissingMarketSchema(error) ? "schema_missing" : "invalid" };
  if (!data) return { ok: false, reason: "invalid" };
  await db.from("dispositivos").update({ visto_em: new Date().toISOString() }).eq("id", data.id);
  return { ok: true, device: { id: String(data.id), profileId: String(data.unidade_id), name: String(data.nome) } };
}

// Resposta padrão pra quando authorizeDevice falha — usada por toda rota
// /device/*, então o app do totem recebe SEMPRE o motivo certo.
export function deviceAuthFailure(reason: "schema_missing" | "invalid") {
  return reason === "schema_missing"
    ? NextResponse.json({ ok: false, error: "market_schema_missing", action: "run_supabase_tridimarket_migration" }, { status: 503 })
    : NextResponse.json({ ok: false, error: "invalid_device" }, { status: 401 });
}

// O que um código de acesso encontrou no cadastro.
//
// Separar "código não existe" de "existe mas está desativado" é o que permite
// dizer à pessoa desativada o que de fato aconteceu. Antes as duas situações
// devolviam `invalid_pin`, e quem tinha sido desativado ficava tentando o mesmo
// código achando que digitou errado.
export type CandidatoDeLogin = { id: number; unidade_id: string; nome?: string; ativo?: boolean };

export type CodigoClassificado =
  | { tipo: "ativos"; lista: CandidatoDeLogin[] }
  | { tipo: "conta_inativa" }
  | { tipo: "codigo_desconhecido" };

export function classificarCodigo(encontrados: CandidatoDeLogin[]): CodigoClassificado {
  // `ativo` ausente conta como ativo: a coluna só chega quando a consulta a
  // pede, e tratar indefinido como inativo trancaria todo mundo para fora.
  const ativos = encontrados.filter((c) => c.ativo !== false);
  if (ativos.length) return { tipo: "ativos", lista: ativos };
  return encontrados.length ? { tipo: "conta_inativa" } : { tipo: "codigo_desconhecido" };
}

// A sessão é um TOKEN ASSINADO (ver _sessao.ts) — não há tabela pra consultar.
// `momento` permite validar contra a hora em que a ação ACONTECEU no tablet, e
// não contra a hora em que ela finalmente chegou aqui (compra offline).
export async function authorizeEmployeeSession(req: NextRequest, deviceId: string, employeeId: number, momento?: number): Promise<boolean> {
  return validarTokenSessao(req.headers.get("x-market-session"), deviceId, employeeId, momento);
}


// ── O que o TOTEM chama de "em aberto" ──────────────────────────────────────
// No tablet, "Em aberto" é o GASTO DO MÊS — o número que ocupa o limite e que
// combina com o "disponível" logo ao lado. Mandar a dívida acumulada fazia a
// tela dizer "em aberto R$ 499,55" embaixo de "disponível R$ 500,00", que é
// contraditório e assustava quem só queria comprar um café.
//
// A fatura dos meses já fechados continua indo junto (`totalOpen`,
// `previousOpen`) — o app atual ignora campos que não conhece, então quando
// houver versão nova ela já tem o dado sem precisar de rota nova.
export function empregadoParaTotem(e: MarketEmployee) {
  return { ...e, open: e.cycleOpen, totalOpen: e.open, previousOpen: e.previousOpen };
}
