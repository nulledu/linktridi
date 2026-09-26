import { NextResponse } from "next/server";
import { resumoMaquinas } from "@/lib/painel-maquinas-db";
import { cached } from "@/lib/cache";
import { ritmoAtual } from "@/app/painel/ritmo";

export const dynamic = "force-dynamic";

/**
 * Painel de MÁQUINAS da TV — mesmo desenho de `/api/producao/painel`.
 *
 * 1. **Sessão.** A TV é um aparelho na parede, sem login: entra na lista
 *    pública do middleware, com prefixo PRÓPRIO (`/api/maquinas/painel`).
 * 2. **Dado pessoal.** Não sai nenhum: máquina, referência da programação
 *    ("Pedido #58291") e material. Sem cliente, sem operador, sem valor.
 * 3. **Ritmo.** Cache no servidor — 30 s no expediente. Mais curto que o do
 *    painel de logística porque o progresso é de relógio: com 60 s a barra
 *    andaria aos saltos de um minuto.
 * 4. **Tabela ausente.** Enquanto `supabase/maquinas.sql` não for rodado,
 *    `resumoMaquinas` devolve `null` e a rota responde 200 com
 *    `disponivel: false` — a TV mostra a instrução, não um alarme vermelho.
 */
export async function GET() {
  const ttl = ritmoAtual(30_000);
  const dados = await cached("maquinas:painel", ttl, resumoMaquinas);
  if (!dados) {
    return NextResponse.json({ disponivel: false }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ disponivel: true, ...dados }, { headers: { "Cache-Control": "no-store" } });
}
