import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { tokenDigest } from "../_device";

export const dynamic = "force-dynamic";

/**
 * POST /api/tv/device/registrar — a TV se cadastra SOZINHA na frota.
 *
 * Por que existe, já havendo `/activate` com código: porque o código obrigava
 * um vai-e-vem entre o computador e a escada — abrir o console, cadastrar,
 * copiar 8 caracteres, digitar no controle remoto, letra por letra. Numa
 * frota de TVs de galpão isso é o bastante para ninguém usar.
 *
 * Aqui a pessoa digita só o NOME da TV e o aparelho já entra na frota.
 *
 * O que protege, e o que NÃO protege:
 * • Confere um segredo embutido no APK (`TV_REGISTRO_SEGREDO`). Ele impede
 *   registro casual de quem não tem o APK — mas quem tem o arquivo consegue
 *   extraí-lo. Não é autenticação forte, e não finge ser.
 * • O que realmente segura o risco é o ALCANCE do token: ele só serve para
 *   ler painel público, dizer "estou viva" e receber comando desta frota.
 *   Não lê dado de cliente, não escreve nada no ERP.
 * • Um aparelho indevido aparece na lista com nome e IP, e sai de lá com um
 *   clique em Remover.
 *
 * Idempotente pelo nome: reinstalar o app na MESMA TV reaproveita a linha em
 * vez de encher o console de duplicatas.
 */

const TETO = 30, JANELA_MS = 10 * 60_000;
const balde = new Map<string, { n: number; ate: number }>();
function excedido(ip: string): boolean {
  const b = balde.get(ip);
  return !!b && b.ate >= Date.now() && b.n >= TETO;
}
function consumir(ip: string) {
  const agora = Date.now();
  const b = balde.get(ip);
  if (!b || b.ate < agora) balde.set(ip, { n: 1, ate: agora + JANELA_MS });
  else b.n++;
  // Rota pública: o tamanho do Map é decidido por quem chama. Passou de 1000,
  // poda só o que já venceu — IP ainda freado continua freado.
  if (balde.size > 1000) for (const [k, v] of balde) if (v.ate < agora) balde.delete(k);
}
const ipDe = (req: NextRequest) =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "sem-ip";

export async function POST(req: NextRequest) {
  const ip = ipDe(req);
  if (excedido(ip)) return NextResponse.json({ error: "muitas_tentativas" }, { status: 429 });
  consumir(ip);

  let b: { nome?: string; segredo?: string; modelo?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  // O segredo só é exigido quando o servidor tem um configurado. Sem a variável
  // de ambiente, a checagem sairia rejeitando toda TV — e uma frota inteira
  // parada por causa de um env esquecido é pior do que o risco que ela cobre.
  const esperado = process.env.TV_REGISTRO_SEGREDO;
  if (esperado && b.segredo !== esperado) {
    return NextResponse.json({ error: "segredo_invalido" }, { status: 401 });
  }

  const nome = String(b.nome ?? "").trim().slice(0, 60);
  if (!nome) return NextResponse.json({ error: "nome_vazio" }, { status: 400 });

  const token = randomBytes(32).toString("base64url");
  const nowIso = new Date().toISOString();
  const db = createSupabaseAdminClient();

  // Mesma TV registrando de novo (reinstalação): reaproveita a linha.
  const { data: existente } = await db.from("tv_dispositivos")
    .select("id").ilike("nome", nome).maybeSingle();

  const campos = {
    token_hash: tokenDigest(token), codigo_ativacao: null, ativo: true,
    modelo: b.modelo ?? null, ip, visto_em: nowIso,
  };

  const { data, error } = existente
    ? await db.from("tv_dispositivos").update(campos)
        .eq("id", (existente as { id: string }).id).select("id,nome").maybeSingle()
    : await db.from("tv_dispositivos").insert({ nome, ...campos })
        .select("id,nome").maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "falha", detail: error?.message }, { status: 500 });
  }
  return NextResponse.json({ token, dispositivo: data });
}
