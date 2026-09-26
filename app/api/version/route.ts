import { NextResponse } from "next/server";
import { b2Configurado } from "@/lib/armazenamento/privado";
import { TV_SINAL_TOPICO } from "@/lib/tv-sinal-nomes";

export const dynamic = "force-dynamic";

// Versão do deploy atual. Muda a cada push (Vercel injeta o commit SHA).
// O cliente compara com a versão que carregou e avisa quando há atualização.
const VERSION = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev";

export function GET() {
  // `armazenamento` diz onde o arquivo PRIVADO novo vai parar neste deploy.
  // "supabase" em produção = variáveis B2_* faltando na Vercel. Só o modo,
  // sem tocar na rede: esta rota é consultada pelo cliente a cada carga.
  return NextResponse.json(
    {
      version: VERSION,
      armazenamento: b2Configurado() ? "b2" : "supabase",
      // Onde a TV escuta o sinal em tempo real (ver lib/tv-sinal.ts). URL e
      // chave anon são públicas — o site já as embute no navegador. Pública
      // e sem banco: a TV lê uma vez ao abrir e guarda.
      sinal: process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? { url: process.env.NEXT_PUBLIC_SUPABASE_URL, chave: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, topico: TV_SINAL_TOPICO }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
