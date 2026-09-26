import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { resolverRaizDoDominio } from "@/lib/player-remoto";

// RAIZ de um domínio próprio servido pelo site público (APENAS_PLAYER).
//
// Quem digita `www.carimbostridii.com.br` chega em `/`, que não é rota de
// publicação e antes caía no 404 do Gaius — a marca do ERP aparecendo num
// domínio que, pra quem visita, é um site independente.
//
// O middleware reescreve `/` pra cá só quando APENAS_PLAYER está ligado. Na
// instância do ERP `/` continua indo pra `/l` (a vitrine da loja): aquele
// caminho serve loja de cliente com anúncio rodando e não se mexe por isto.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function RaizDoDominio() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const caminho = await resolverRaizDoDominio(host);
  if (caminho) redirect(caminho);
  return <NadaPublicado />;
}

// Sem nome de produto, sem logo, sem link pro ERP: um domínio que ainda não
// recebeu publicação nenhuma não deve contar ao visitante que existe um Gaius
// atrás. Estilo inline porque esta página não carrega o CSS da plataforma.
function NadaPublicado() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "24px",
      font: "400 15px/1.6 system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#3b3b40", background: "#fafafa" }}>
      <div style={{ maxWidth: "min(100%, 420px)", textAlign: "center" }}>
        <h1 style={{ margin: "0 0 8px", font: "600 20px/1.3 inherit", color: "#18181b" }}>Nada publicado aqui ainda</h1>
        <p style={{ margin: 0, color: "#71717a" }}>Este endereço está no ar, mas nenhuma página foi publicada nele.</p>
      </div>
    </main>
  );
}
