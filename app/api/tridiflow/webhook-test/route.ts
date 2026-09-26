import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { cabecalhosDoDestino, interpretarResposta, payloadExemploWebhook } from "@/lib/tridiflow-db";

export const dynamic = "force-dynamic";

// Testa um webhook: envia um POST de AMOSTRA pra URL (server-side, sem CORS) e
// devolve status + latência. É o que prova pro usuário que o destino funciona.

// Bloqueia alvos internos/privados (SSRF básico) — o webhook tem que ser público.
function hostBloqueado(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "0.0.0.0" || h === "[::1]") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 127 || a === 10 || a === 0) return true;              // loopback / privado / inválido
    if (a === 169 && b === 254) return true;                        // link-local
    if (a === 192 && b === 168) return true;                        // privado
    if (a === 172 && b >= 16 && b <= 31) return true;               // privado
  }
  return false;
}

export async function POST(req: NextRequest) {
  if (!(await getProfileForModule("tridiflow:configuracoes"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: { url?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const url = typeof body.url === "string" ? body.url.trim() : "";

  // Recusa também sai com status de erro: no Network, teste que não passou tem
  // que ficar vermelho — foi por ficar tudo 200 que "não dava pra ver o erro".
  const recusa = (erro: string) => NextResponse.json({ ok: false, erro }, { status: 400 });
  let u: URL;
  try { u = new URL(url); } catch { return recusa("URL inválida — comece com https://"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") return recusa("Use uma URL http(s).");
  if (hostBloqueado(u.hostname)) return recusa("Endereço interno/privado não é permitido — use uma URL pública (n8n, Make, Zapier, seu domínio…).");

  const t0 = Date.now();
  // Cabeçalhos E corpo iguais aos do envio real (o global exige `type` e a
  // chave `Phone`): testar com o payload plano dava 400 e não provava nada.
  const enviado = payloadExemploWebhook(url);
  try {
    const res = await fetch(u.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "X-TridiFlow-Event": "teste", "User-Agent": "TridiFlow-Webhook/1.0",
        ...cabecalhosDoDestino(url),
      },
      body: JSON.stringify(enviado),
      signal: AbortSignal.timeout(6000),
    });
    const ms = Date.now() - t0;
    let corpo = "";
    try { corpo = (await res.text()).slice(0, 300); } catch { /* corpo opcional */ }
    // A distribuição responde 201 mesmo recusando (sucesso:false dentro do
    // corpo) — quem manda é o veredito de dentro, não o status do transporte.
    const { aceito, motivo } = interpretarResposta(corpo);
    // Exceção do TESTE: o payload de amostra usa sempre o mesmo telefone
    // impossível, então a partir do segundo clique a distribuição responde
    // "lead duplicado". Isso PROVA que chegou e foi entendido — tratar como
    // falha faria o testador dizer "não envia" justamente quando envia. No
    // lead de verdade duplicado continua sendo recusa (números são diferentes).
    const duplicado = /duplicad/i.test(motivo ?? "");
    const ok = res.ok && (aceito !== false || duplicado);
    const nota = ok && duplicado
      ? "O destino reconheceu a requisição e respondeu que este contato de teste já existe (o telefone de amostra é sempre o mesmo). Entrega funcionando."
      : undefined;
    // Destino que recusou vira 502 AQUI: com 200 o Network fica todo verde e o
    // erro só existia dentro do JSON — ninguém achava. O corpo vai junto, então
    // a tela continua mostrando status, latência e resposta do destino.
    return NextResponse.json({ ok, status: res.status, ms, corpo, enviado, nota, erro: ok ? undefined : motivo ?? undefined }, { status: ok ? 200 : 502 });
  } catch (e) {
    const ms = Date.now() - t0;
    const erro = (e as Error)?.name === "TimeoutError"
      ? "Tempo esgotado (6s) — a URL não respondeu."
      : "Não foi possível conectar na URL (verifique o endereço).";
    return NextResponse.json({ ok: false, erro, ms, enviado }, { status: 502 });
  }
}
