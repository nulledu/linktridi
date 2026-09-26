import { NextRequest, NextResponse } from "next/server";
import { painelAtividadesDoSetor, type SetorPainel } from "@/lib/painel-atividades";
import { cached } from "@/lib/cache";
import { ritmoAtual } from "@/app/painel/ritmo";

export const dynamic = "force-dynamic";

/**
 * Atividades do setor pra TV da parede — mesmo desenho de `/api/producao/painel`.
 *
 * 1. **Sessão.** A TV não tem login; a rota entra na lista pública do
 *    middleware, ao lado das outras `/api/*'/painel`.
 * 2. **Dado pessoal.** Nome e foto de colaborador saem (precedente do ranking
 *    de vendedores e do painel de produção). Texto livre NÃO sai: `detalhe` e
 *    `instrucoes` podem carregar nome de cliente e ficam fora do payload —
 *    trava em `lib/__tests__/painel-atividades.test.ts`.
 * 3. **Ritmo.** Cache no servidor. O TTL é mais curto que o dos outros painéis
 *    (20s no expediente) porque esta rota carrega a CHAMADA DE ACEITE — o
 *    tempo entre "caiu" e "apareceu na parede" é o produto. A consulta é do
 *    Supabase novo (tabela pequena, colunas nomeadas, teto), não do ERP; e as
 *    escritas de atividades chamam `invalidate("atividades:")`, que derruba
 *    esta chave junto na instância que atendeu a escrita.
 */
export async function GET(req: NextRequest) {
  const bruto = req.nextUrl.searchParams.get("setor");
  const setor: SetorPainel = bruto === "logistica" ? "logistica" : "producao";
  const ttl = ritmoAtual(20_000);
  const dados = await cached(`atividades:painel:${setor}`, ttl, () => painelAtividadesDoSetor(setor));
  if (!dados) {
    // 200 com `disponivel:false`: pra TV, "ainda não sei" e "deu erro" se
    // parecem, e um 500 viraria alarme vermelho a cada ciclo.
    return NextResponse.json({ disponivel: false }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ disponivel: true, ...dados }, { headers: { "Cache-Control": "no-store" } });
}
