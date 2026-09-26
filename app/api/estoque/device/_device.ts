import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// ── Auth do leitor do galpão — mesmo desenho do TridiMarket ──────────────────
// (app/api/tridimarket/device/_device.ts): o aparelho carrega um Bearer token
// opaco, o servidor só guarda o HASH dele. Se este arquivo divergir daquele,
// mirre — é o mesmo problema (autenticar um dispositivo sem sessão de usuário),
// resolvido igual de propósito.

export type DeviceAuth = { id: string; nome: string; localId: string | null };

export type DeviceAuthResult =
  | { ok: true; device: DeviceAuth }
  | { ok: false; reason: "invalid" };

export function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function bearerToken(req: NextRequest): string | null {
  const value = req.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() || null : null;
}

// Autoriza o dispositivo pelo token. Deliberadamente NÃO grava `visto_em`
// aqui — ao contrário do TridiMarket, a rota mais chamada por este leitor é a
// baixa (uma bipagem atrás da outra, em rajada), e escrever a cada chamada
// autenticada multiplicaria updates sem necessidade. Quem carimba `visto_em`
// é só o heartbeat (rota própria, de ritmo baixo).
export async function authorizeDevice(req: NextRequest): Promise<DeviceAuthResult> {
  const token = bearerToken(req);
  if (!token) return { ok: false, reason: "invalid" };
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("estoque_dispositivos")
    .select("id,nome,local_id,ativo")
    .eq("token_hash", tokenDigest(token))
    .eq("ativo", true)
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "invalid" };
  return { ok: true, device: { id: String(data.id), nome: String(data.nome), localId: data.local_id ? String(data.local_id) : null } };
}

// Resposta padrão pra quando authorizeDevice falha — usada por toda rota
// /device/*, pra o leitor sempre receber o mesmo formato de erro.
export function deviceAuthFailure() {
  return NextResponse.json({ error: "invalid_device" }, { status: 401 });
}

export interface OperadorAtivo { id: string; nome: string }

// Confere que `operadorId` (mandado pelo aparelho junto de cada baixa/
// recebimento) é hoje um perfil ATIVO, e devolve o NOME de verdade — nunca o
// que o cliente mandaria, porque o corpo da requisição não carrega nome
// nenhum e um leitor comprometido não pode escrever texto arbitrário no
// registro de quem baixou/recebeu. Não reconfere `estoque:bipar` aqui: a
// permissão já foi checada uma vez no bootstrap (só quem tem a sub aparece no
// diretório), e reconferir a cada bipagem custaria uma consulta extra numa
// rota que roda em rajada.
export async function buscarOperadorAtivo(
  db: ReturnType<typeof createSupabaseAdminClient>,
  operadorId: string,
): Promise<OperadorAtivo | null> {
  const { data } = await db.from("profiles").select("id,name,active").eq("id", operadorId).maybeSingle();
  if (!data || data.active !== true) return null;

  // M3: o operador tem que ser um LEITOR CADASTRADO — ter `codigo_acesso`, o
  // mesmo critério que o coloca no diretório do bootstrap. Sem isto, um token
  // comprometido carimbava a baixa com o id de QUALQUER perfil ativo (inclusive
  // um admin que nunca pôs a mão no galpão), falsificando a auditoria de "quem
  // baixou". O aparelho só manda id que veio do diretório, então isto não muda
  // nada pro uso real — só rejeita id forjado de quem não é operador.
  const { data: emp, error } = await db.from("employees").select("codigo_acesso").eq("id", operadorId).maybeSingle();
  // SÓ rejeita quando a consulta DEU CERTO e não há código. Qualquer erro
  // (coluna `codigo_acesso` ainda inexistente antes da migração, OU um blip de
  // infra) → tolera, mantendo o comportamento antigo (só ativo). Um erro
  // transitório não pode virar `operador_invalido`: o app classifica 4xx como
  // falha DEFINITIVA e a baixa/recebimento sumiria da fila (ver FilaReducer.kt).
  if (!error && !(emp && emp.codigo_acesso)) return null;

  return { id: String(data.id), nome: String(data.name) };
}
