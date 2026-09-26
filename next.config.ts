import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Só no build do Docker (servidor dos chats): gera o bundle "standalone",
  // que roda com `node server.js` sem node_modules. Na Vercel fica undefined,
  // então o build de produção do Gaius não muda em nada.
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  // Ainda só no Docker: pula a checagem de tipos e de lint DO BUILD. Elas já
  // rodam no Mac antes de todo commit (npm test + tsc) e na Vercel — no VPS o
  // tsc crava 100% de CPU por minutos, a proteção da Hostinger estrangula o
  // processo e o build congela em "Running TypeScript". O servidor só precisa
  // do bundle; o portão de qualidade fica onde sempre ficou.
  ...(process.env.DOCKER_BUILD === "1"
    ? { typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true } }
    : {}),
  // A Oficina lê o docs/DEVKIT.md do disco em tempo de requisição; sem isto
  // o arquivo não entra na função da Vercel e a página nasce vazia.
  outputFileTracingIncludes: { "/oficina-7k3q": ["./docs/DEVKIT.md"] },
  poweredByHeader: false,                    // remove o header X-Powered-By
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      // Bucket público do B2 (lib/armazenamento/publico.ts): URL amigável f00N.backblazeb2.com/file/<bucket>/…
      { protocol: "https", hostname: "*.backblazeb2.com" },
    ],
    formats: ["image/avif", "image/webp"],   // formatos modernos p/ next/image
  },
  // Remove console.* em produção (mantém error/warn) — bundle menor.
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  // Tree-shaking melhor da lib pesada do editor (só carrega o que usa).
  experimental: {
    // Reescreve o import do barril pra puxar só o que a tela usa — recharts e
    // HeroUI são os dois barris mais pesados do app depois do React Flow.
    optimizePackageImports: ["@xyflow/react", "@heroui/react", "recharts"],
  },

  // ── Funil mora no gedux, nunca no Gaius ───────────────────────────────────
  // `/f/<slug>` aberto no endereço da Vercel vai pro mesmo caminho no gedux
  // (VPS dos chats), com a query junto (UTM, fbclid). Redirect de config roda
  // no roteamento da Vercel, antes do middleware e sem acordar função: o
  // anúncio antigo que ainda aponta pra cá não custa invocação nem sessão
  // quebrada. `/api/f/*` fica de fora de propósito — é por ali que o gedux
  // busca o bot e grava sessão. Trava: lib/__tests__/funil-mora-no-gedux.test.ts.
  async redirects() {
    return [
      {
        source: "/f/:caminho*",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        destination: "https://gedux.com.br/f/:caminho*",
        permanent: false,
      },
      // O slug virou `/curriculo` (20/09/2026). O antigo continua respondendo:
      // já foi divulgado em link e QR, e quebrá-lo perde candidato.
      { source: "/candidatura", destination: "/curriculo", permanent: true },
      { source: "/candidatura/personagens/:arquivo*", destination: "/curriculo/personagens/:arquivo*", permanent: true },
    ];
  },

  // ── Cabeçalhos de segurança ────────────────────────────────────────────────
  // Nenhum deles muda o que a aplicação faz — só fecham abusos do NAVEGADOR.
  // O que NÃO está aqui, de propósito:
  //  · CSP: precisa ser levantada em report-only e observada antes de valer,
  //    senão derruba estilo inline e script legítimo do próprio app.
  //  · HSTS com preload: preload é praticamente irreversível (entra numa lista
  //    embutida no navegador). Fica o HSTS simples.
  async headers() {
    const comuns = [
      // Impede o navegador de "adivinhar" o tipo do arquivo — é o que
      // transforma um upload de texto num script executável.
      { key: "X-Content-Type-Options", value: "nosniff" },
      // Não vaza a URL interna do ERP (que tem id de pessoa e de pedido) no
      // Referer ao clicar num link pra fora.
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // `()` DESLIGA o recurso até pra página do próprio site — o navegador
      // recusa sem nem perguntar. A câmera É usada (leitor de código de barras
      // do Estoque/Operação/Mercadinho e foto do item) e a localização também
      // (pergunta "localização" do chat do funil, em /f): as duas ficam só pro
      // próprio site, `(self)`, que ainda nega a qualquer iframe de terceiro.
      // Microfone e pagamento ninguém usa: continuam desligados.
      // Trava: lib/__tests__/permissions-policy.test.ts.
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ];
    return [
      {
        // O ERP inteiro, MENOS o que é feito pra rodar embutido. `/f` (player do
        // TridiFlow), `/p` (páginas publicadas) e `/ab` são destino de anúncio e
        // rodam DENTRO de iframe — negar enquadramento ali quebraria campanha.
        // `/previa` é a prévia do editor de aparência, que roda embutida no
        // PRÓPRIO painel: com `DENY` ela abria em branco, e a tela inteira
        // parecia quebrada sem nenhum erro no console.
        source: "/((?!f/|p/|ab/|previa/|api/f|api/p|api/t).*)",
        headers: [...comuns, { key: "X-Frame-Options", value: "DENY" }],
      },
      {
        // A prévia é enquadrada só pelo próprio site — `SAMEORIGIN`, e não a
        // ausência do cabeçalho: ela mostra a loja de quem está logado, e outro
        // domínio embutindo isso é clickjacking com dado de cliente na tela.
        source: "/previa/:rest*",
        headers: [...comuns, { key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // Nas páginas de anúncio, os cabeçalhos que não atrapalham o embed.
        source: "/:path(f|p|ab)/:rest*",
        headers: comuns,
      },
      {
        // Personagens da candidatura: a URL leva a versão (`?v=N`, em
        // lib/rh/curriculos/personagens.ts), então o arquivo nunca muda sem
        // mudar a URL. Um ano de cache: quem abre o formulário de novo não
        // baixa imagem nenhuma, e a CDN não pergunta à origem.
        source: "/curriculo/personagens/:arquivo*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
