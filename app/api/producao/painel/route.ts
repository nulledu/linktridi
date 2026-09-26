import { NextResponse } from "next/server";
import { resumoProducaoDoDia } from "@/lib/painel-producao";
import { cached } from "@/lib/cache";
import { ritmoAtual } from "@/app/painel/ritmo";

export const dynamic = "force-dynamic";

/**
 * Painel de Produção da TV — mesmo desenho de `/api/logistica/painel`.
 *
 * 1. **Sessão.** A TV é um aparelho pendurado na parede, sem login: a rota do
 *    ERP (`/api/producao`) passa por `getProfileForModule("producao")` e
 *    devolveria 401. Esta entra na lista pública, ao lado de `/api/sales`.
 * 2. **Dado pessoal.** Sai nome e foto do operador — que é o que o setor pediu
 *    ver na parede, e o mesmo que `/api/sales` já publica no ranking de
 *    vendedores. Nada além disso: sem cliente, sem telefone, sem valor.
 * 3. **Ritmo.** Cache no servidor, um minuto no expediente e dez fora dele. A
 *    TV não tem `document.hidden` — a defesa contra mil ciclos virando mil
 *    leituras é esta (CLAUDE.md, "o tick comum tem que voltar VAZIO").
 */
export async function GET() {
  const ttl = ritmoAtual(60_000);
  const dados = await cached("producao:painel", ttl, resumoProducaoDoDia);
  if (!dados) {
    // 200 com `null`: para a TV, "ainda não sei" e "deu erro" se parecem, e um
    // 500 faria o app trocar a tela por um alarme vermelho a cada ciclo.
    return NextResponse.json({ disponivel: false }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ disponivel: true, ...dados }, { headers: { "Cache-Control": "no-store" } });
}
