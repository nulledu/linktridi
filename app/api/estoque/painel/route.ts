import { NextResponse } from "next/server";
import { resumoEstoquePainel } from "@/lib/painel-estoque";
import { cached } from "@/lib/cache";
import { ritmoAtual } from "@/app/painel/ritmo";

export const dynamic = "force-dynamic";

/**
 * Avisos de estoque para a TV do galpão — mesmo desenho de
 * `/api/producao/painel`.
 *
 * 1. **Sessão.** A TV é aparelho de parede, sem login: a rota do ERP passa por
 *    `getProfileForModule("estoque:itens")` e devolveria 403. Esta entra na
 *    lista pública.
 * 2. **Dado.** Sai nome de item, saldo e mínimo — o que o galpão já vê no
 *    quadro branco. Sem custo, sem fornecedor, sem ninguém.
 * 3. **Ritmo.** `cached()` no servidor, um minuto no expediente e dez fora
 *    dele: a TV não tem `document.hidden`, então a defesa é esta.
 */
export async function GET() {
  const ttl = ritmoAtual(60_000);
  const dados = await cached("estoque:painel", ttl, resumoEstoquePainel);
  if (!dados) {
    // 200 com `disponivel: false`: para a parede, "ainda não sei" e "deu erro"
    // se parecem, e um 500 viraria alarme vermelho a cada ciclo.
    return NextResponse.json({ disponivel: false }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ disponivel: true, ...dados }, { headers: { "Cache-Control": "no-store" } });
}
