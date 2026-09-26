import { NextResponse } from "next/server";
import { dadosLocais } from "@/lib/rh/curriculos/publico";

export const dynamic = "force-dynamic";

/**
 * PÚBLICO — o pacote que a página de candidatura precisa pra abrir: se está
 * aberta, o formulário configurado e a vaga do link (com as perguntas dela).
 * Quem chama é o site público www.carimbostridii.com.br, que não tem banco.
 * Nada aqui é segredo: é exatamente o que o candidato vê na tela.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const dados = await dadosLocais(u.searchParams.get("vaga"), u.searchParams.get("previa") === "1");
  return NextResponse.json(dados, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
