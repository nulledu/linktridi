import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /apk — baixa o APK da versão publicada da frota.
 *
 * Existe por um motivo prático do galpão: o gerenciador de arquivos de várias
 * TV box ESCONDE arquivos `.apk`, então o pen drive vira um beco sem saída —
 * a caixa monta a mídia, lista os outros arquivos e simplesmente omite o
 * instalador. Pelo navegador da TV o Android baixa e abre o instalador
 * direto, sem passar por gerenciador nenhum.
 *
 * O endereço é curto de propósito: quem digita isto está usando o controle
 * remoto, letra por letra, num teclado de tela.
 *
 * Redireciona (302) em vez de servir os bytes: o arquivo mora no Storage do
 * Supabase, e passar 9 MB pela função serverless a cada instalação seria
 * pagar execução por algo que o CDN entrega de graça.
 */
export async function GET() {
  try {
    const db = createSupabaseAdminClient();
    // A versão publicada de maior version_code — a mesma fonte que o agente
    // da frota consulta, então o que a TV baixa à mão é o que ela receberia
    // sozinha depois de ativada.
    const { data } = await db
      .from("tv_versoes")
      .select("url,version_name")
      .eq("publicada", true)
      .order("version_code", { ascending: false })
      .limit(1)
      .maybeSingle();

    const url = (data as { url?: string } | null)?.url ?? APK_PADRAO;
    return NextResponse.redirect(url, 302);
  } catch {
    // Tabela ainda não criada (SQL da frota não rodado): cai no arquivo fixo,
    // que é justamente o caso de quem está instalando a PRIMEIRA vez.
    return NextResponse.redirect(APK_PADRAO, 302);
  }
}

/**
 * O APK de partida, para quando ainda não há versão publicada no console.
 * É o mesmo arquivo que vai no pen drive.
 */
const APK_PADRAO =
  "https://tzariztovuuwyeoogbxg.supabase.co/storage/v1/object/public/apks/tv/tridi-v1.4.apk";
