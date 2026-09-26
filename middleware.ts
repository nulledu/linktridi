import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { cachedByToken, sessionKey } from "@/lib/auth-cache";
import { previewBypassAtivo } from "@/lib/preview-bypass";
import { ehRotaPublica } from "@/lib/middleware-rotas";
import { limitarValidade } from "@/lib/auth-cookie";
import { ehCaminhoDeVitrine, respostaComIdentidade } from "@/lib/lojas-visitante";

// Rotas/seções públicas (não exigem login). O kiosk e o tv-app dependem destas.
// /api/ponto/sync e /api/ponto/bater são do TABLET do ponto — autenticam por
// x-device-token dentro da rota (getDevice), não por sessão.
// /f e /api/f = player público do TridiFlow (bots publicados que rodam no anúncio).
// /api/tridimarket/device = o TOTEM Android (pareamento, PIN, compra, heartbeat):
// autentica por Bearer token dentro da rota (authorizeDevice), igual ao ponto —
// NUNCA teve cookie de sessão. Faltava aqui: o middleware redirecionava pra
// /login (HTML) antes da rota rodar, e o app recebia HTML em vez do JSON
// esperado — era o "no tablet não acontece nada" ao tentar logar por PIN.
// Sem isso, /api/tridimarket/employees, /products etc. (painel ADMIN, dentro do
// Gaius logado) continuam exigindo sessão normalmente — só o namespace /device
// é público.
// /api/estoque/device = o LEITOR do galpão (app estoque-app), pela mesma razão
// e com o mesmo desenho: Bearer token conferido por authorizeDevice dentro da
// rota, nunca cookie. Sem esta linha o middleware devolvia {"error":"unauthorized"}
// pra TODA chamada do aparelho — inclusive a ativação, que é anônima de
// propósito (troca um código de uso único por um token). O resto de
// /api/estoque/* (unidades, locais, fornecedores) continua exigindo sessão:
// só o namespace /device é público.
// /api/worker = o WORKER de leitura de nota (PC da empresa): autentica por
// Bearer token (TRIDIMARKET_WORKER_TOKEN) dentro da rota, igual ao tablet —
// nunca teve cookie de sessão. Sem estar aqui, o middleware redirecionava pra
// /login (HTML) antes da rota rodar e o worker recebia HTML em vez de JSON.
// /p e /api/p = PÁGINAS publicadas do TridiFlow (landing/VSL que rodam no
// anúncio). Mesma natureza do /f do chat: é o destino do tráfego pago, não pode
// exigir login. /api/p recebe evento e formulário do visitante.
// /primeiro-acesso = a tela do LINK que o admin gera pra pessoa criar a senha
// dela. Tem que ser pública pela definição do problema: quem abre esse link
// ainda NÃO tem senha, então não teria como passar por um gate de sessão. O que
// autoriza ali é o token do link (32 bytes, uso único, com prazo), conferido
// dentro da rota — mesmo desenho dos aparelhos do galpão.
// `/l` = vitrine pública das lojas (/l/<slug> e /l/<slug>/<produto>). Pública
// pela definição: é o catálogo que o cliente abre pelo anúncio. Ela só mostra
// loja `publicada` e produto `ativo`, e a consulta dela nunca traz o `custo`.
//
// `/api/l` é o pedido vindo dessa vitrine — a única rota de ESCRITA aberta a
// quem não tem sessão. Ela se defende sozinha: freio por IP, preço calculado no
// servidor (nunca o que o navegador mandou) e recusa se a loja não tiver
// carrinho ligado. Sem este prefixo aqui o checkout falharia calado, que é a
// pior forma de falhar: o cliente vê "enviando" e o pedido nunca existe.
// `/g` = a etiqueta de PRATELEIRA do galpão (/g/<codigo>): o QR impresso abre a
// conferência do lugar em qualquer celular, sem login — decisão explícita do
// dono, e a página é só leitura (nunca preço/custo/fornecedor). Como rota
// pública sem cookie, ela sai no `if (isPublic)` abaixo sem montar cliente
// Supabase — cada scan não pode custar um getUser(). NÃO entra em
// BOT_ONLY_PREFIXES: domínio próprio é vitrine/bot de marketing, e a etiqueta
// do galpão não tem nada que fazer lá.
// `/opengraph-image` é o card de compartilhamento gerado pelo `next/og`. Sem
// este prefixo o robô do WhatsApp/Slack leva 307 pro login e o link sai sem
// imagem — a meta tag existe, a imagem nunca carrega. É PNG estático, não
// carrega dado nenhum do banco.
// `/api/version` é o SHA do deploy e o modo de armazenamento ("b2"/"supabase"):
// nada do banco, nada de pessoa — e é como se confere de fora se as variáveis
// do B2 chegaram na Vercel.
const PUBLIC_PREFIXES = ["/login", "/api/version", "/primeiro-acesso", "/api/auth/primeiro-acesso", "/painel", "/apk", "/f", "/p", "/l", "/g", "/api/l", "/ab", "/privacidade", "/termos", "/exclusao-de-dados", "/opengraph-image",
  // Página de status, pública por decisão do dono (15/09/2026): só leitura, e os
  // dados vêm do Gatus na VPS direto pro navegador. O aviso na tela e o selo
  // continuam só pra quem tem `administracao:status` (admin, TI e gestor).
  "/status", "/api/status", "/api/status-cron", "/api/f", "/api/p",
  // Formulário público de candidatura (RH → Currículos) e o webhook que o
  // TridiFlow chama: anônimos por natureza (candidato não tem conta). O envio
  // é gateado por carimbo HMAC e o webhook por Bearer token, dentro da rota.
  "/curriculo", "/candidatura", "/api/candidatura", "/api/t", "/api/sales", "/api/config",
  // TV de logística (app tv-central). Prefixo PRÓPRIO e não "/api/logistica":
  // liberar o módulo inteiro exporia nome e telefone de cliente sem sessão.
  // Mesma regra em "/api/atividades/painel" (chamadas de aceite na parede):
  // o prefixo com "/painel" NÃO abre "/api/atividades" — ver a barra em
  // `ehRotaPublica`.
  "/api/logistica/painel", "/api/producao/painel", "/api/estoque/painel", "/api/atividades/painel", "/api/maquinas/painel", "/api/tv/device", "/api/auth", "/api/device", "/api/tridimarket/device", "/api/estoque/device", "/api/worker", "/api/ponto/sync", "/api/ponto/bater", "/api/ponto/amostra", "/api/ponto/cadastro", "/api/ponto/limpeza", "/api/ponto/foto", "/api/recebimento/tablet",
  // Cron diário das recorrências do Financeiro. Prefixo PRÓPRIO, e não
  // "/api/financeiro": ali toda rota exige sessão de uma pessoa; o cron é a
  // máquina, autentica por CRON_SECRET dentro da própria rota.
  "/api/financeiro-cron", "/api/lojas-cron", "/api/contingencia-cron",
  // Webhook da Yampi e o cron que o cobre. A Yampi chega sem cookie, e o portão
  // é o HMAC-SHA256 do corpo conferido DENTRO da rota — mesma ideia do webhook
  // de leads X1; o sync confere o CRON_SECRET. Prefixos EXATOS e não
  // "/api/yampi": ao lado mora `/api/yampi/painel`, que é rota de PESSOA (os
  // widgets da Tridify) e precisa passar pela sessão do middleware.
  "/api/yampi/webhook", "/api/yampi/sync"];
// Rotas de MÁQUINA (crons do vercel.json e webhook de leads X1): chegam sem
// cookie e se autenticam DENTRO da rota (CRON_SECRET / X1_WEBHOOK_SECRET, e o
// /api/trafego/sync também aceita sessão com a área `trafego`). Casamento por
// caminho EXATO, não por prefixo: nada abaixo nem ao lado herda a abertura.
// Sem isto o gate de sessão dava 401 antes de a rota rodar e os crons nunca
// executavam. Saem antes de montar o cliente do Supabase (zero getClaims).
const MACHINE_EXACT = new Set(["/api/sync", "/api/meta/refresh", "/api/trafego/sync", "/api/trafego/warm", "/api/webhooks/leads-x1"]);

// Bypass de DESENVOLVIMENTO p/ visualizar o app de atividades em WebView antigo
// (que não persiste cookie). Gated por previewBypassAtivo() — falso em produção
// (A1 da auditoria): senão o flag ligado no Vercel tornaria /app, /api/atividades
// e /api/insumos públicas em produção.
const PREVIEW_BYPASS = previewBypassAtivo();
const BYPASS_PREFIXES = ["/app", "/api/atividades", "/api/insumos"];

// Preview de dev da Tridify (/dev-tridify): público SÓ fora de produção. A
// própria página também dá 404 em produção — dupla trava, nunca vaza publicado.
const DEV_ONLY_PREFIXES = process.env.NODE_ENV !== "production" ? ["/dev-tridify", "/dev-tridify-visual", "/dev-tridimarket", "/dev-tridiflow-pagina", "/dev-mobile", "/dev-market-produto", "/dev-logistica", "/dev-chat", "/dev-painel", "/dev-produtividade", "/dev-fotos-mercadinho", "/dev-fotos-estoque", "/dev-aquecimento", "/dev-estoque-item", "/dev-recebimento", "/dev-lojas", "/previa/dev", "/dev-impressao", "/dev-micro", "/dev-analytics", "/dev-operacao", "/dev-painel-setor", "/dev-painel-maquinas", "/dev-quadro-maquinas", "/dev-frota", "/dev-financeiro", "/dev-estoque-lugar", "/dev-telas", "/dev-contingencia", "/dev-tutoriais", "/dev-tutoriais-admin", "/dev-marketplaces", "/dev-linktridi", "/dev-criativos", "/dev-atividades", "/dev-stories", "/dev-status", "/dev-infra", "/dev-rh", "/dev-screen-size", "/dev-3d", "/dev-producao", "/dev-design", "/api/dev-montagem"] : [];

// ── Isolamento por domínio ───────────────────────────────────────────────────
// Um domínio próprio (ex.: chat.suaempresa.com.br) aponta pro MESMO projeto, então
// por padrão ele serviria o site inteiro — /login, /painel, /administracao…
// Aqui o domínio próprio vira "só o bot": qualquer coisa fora do player some (404).
// O ERP continua acessível só pelos hosts do app.
//
// Hosts do app: *.vercel.app (produção e previews), localhost e o que estiver em
// APP_HOSTS (lista separada por vírgula) — use isso se um dia quiser o ERP num
// domínio próprio também.
const APP_HOSTS = (process.env.APP_HOSTS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
function ehHostDoApp(hostHeader: string | null): boolean {
  const h = (hostHeader || "").split(":")[0].toLowerCase();
  if (!h) return true;                                   // sem host → não bloqueia
  if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".local")) return true;
  if (h.endsWith(".vercel.app")) return true;
  // A isolação "domínio próprio = SÓ o bot" é OPT-IN: só vale quando APP_HOSTS
  // está configurado. Sem ela, NÃO trancar o ERP (fail-open) — antes, qualquer
  // domínio próprio sem APP_HOSTS levava 404 em /login e /api/auth/login e
  // NINGUÉM conseguia logar. Pra reativar o bot-only nos domínios de bot,
  // configure APP_HOSTS no Vercel com o(s) host(s) do ERP.
  if (APP_HOSTS.length === 0) return true;
  return APP_HOSTS.includes(h);
}
// No domínio próprio só existe isto: a página do bot, as rotas que ele chama e
// os assets do Next (senão a página não hidrata).
// Um domínio próprio serve o bot E as páginas publicadas — os dois são
// destino de anúncio e moram no mesmo cadastro de domínio (tridiflow_dominios).
// Sem /p aqui, uma landing em ofertas.carimbostridi.com.br daria 404.
//
// `/l` entrou junto porque a LOJA passou a morar no mesmo cadastro: um domínio
// pode apontar pra uma vitrine em vez de um bot. Sem ele, clicar num produto a
// partir da raiz do domínio próprio daria 404 no segundo clique.
// `/raiz` é o destino da reescrita de `/` no site público — sem ele aqui, a
// própria reescrita cairia no 404 abaixo e a raiz continuaria quebrada.
// `/curriculo` (18/09/2026, slug antigo `/candidatura`, que redireciona): o
// formulário de currículo mora no site público
// www.carimbostridii.com.br. A página abre lá (pede a config ao Gaius) e as
// chamadas `/api/candidatura/*` são REPASSADAS ao Gaius abaixo — o site
// público não tem banco nem chave do B2.
const BOT_ONLY_PREFIXES = ["/f", "/p", "/l", "/raiz", "/curriculo", "/candidatura", "/api/f", "/api/p", "/api/l", "/api/candidatura", "/_next"];

/** Onde mora o banco quando esta instância não tem (site público / VPS). */
const GAIUS_BASE = (process.env.PLAYER_API_BASE || "").trim().replace(/\/+$/, "");

// APENAS_PLAYER=1 → esta INSTÂNCIA inteira só serve o player, seja qual for o
// host. É o modo do servidor dedicado aos chats (VPS): mesmo código do Gaius,
// mas ali o ERP não existe — nem por IP, nem por host errado, nem por engano.
const APENAS_PLAYER = process.env.APENAS_PLAYER === "1";

/** É rota de API? Casa `/api` e `/api/...`, mas NÃO `/apionline` — o `startsWith`
 *  ingênuo (`path.startsWith("/api")`) casaria qualquer página começando com
 *  essas quatro letras e passaria a devolver JSON pra quem esperava HTML. */
export const ehRotaDeApi = (path: string) => path === "/api" || path.startsWith("/api/");

// Mantém a sessão Supabase fresca nos cookies e protege as rotas da plataforma:
// sem sessão → /login. O gating por papel é feito no layout/páginas (requireRole).
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;

  // A etiqueta do galpão escreve a URL do QR em MAIÚSCULAS (/G/A-01-1): o modo
  // alfanumérico do QR não tem minúscula, e usá-lo derruba o símbolo de 29 pra
  // 25 módulos — 1,5mm a menos em cada uma das ~55 placas. O host o navegador
  // já normaliza sozinho; o caminho é reescrito aqui, ANTES de qualquer coisa,
  // pra /G cair na mesma página pública /g sem duplicar rota (o filesystem do
  // macOS nem deixaria app/G e app/g coexistirem).
  if (path === "/G" || path.startsWith("/G/")) {
    return NextResponse.rewrite(new URL(`/g${path.slice(2)}${request.nextUrl.search}`, request.url));
  }

  // Servidor dedicado aos chats (APENAS_PLAYER) ou domínio próprio → só o bot.
  // Vem ANTES de tudo: nem o /login aparece lá.
  if (APENAS_PLAYER || !ehHostDoApp(request.headers.get("x-forwarded-host") || request.headers.get("host"))) {
    // A RAIZ de um domínio próprio serve a vitrine da loja ligada a ele.
    //
    // Quem digita `carimbostridi.com.br` chega em `/`, que não é rota de bot e
    // daria 404. A reescrita manda pra `/l`, e é LÁ que o host vira loja — o
    // middleware roda em toda requisição do projeto, e uma ida ao banco aqui
    // dentro é exatamente o tempo parado que já pausou o projeto por CPU na
    // Vercel. Domínio sem loja ligada continua terminando em 404, só que
    // decidido por uma página que pode cachear a resposta.
    //
    // No SITE PÚBLICO (APENAS_PLAYER) não existe vitrine: aquela instância roda
    // sem banco e serve tutorial, currículo e LinkTridi. Mandar `/` pra `/l` ali
    // dava o 404 DO GAIUS na raiz de um domínio que, pra quem visita, é um site
    // independente — a marca do ERP vazando pela porta da frente. `/raiz`
    // pergunta ao Gaius o que aquele domínio publica e leva pra lá.
    if (path === "/") {
      return NextResponse.rewrite(new URL(APENAS_PLAYER ? "/raiz" : "/l", request.url));
    }
    const liberado = ehRotaPublica(path, BOT_ONLY_PREFIXES);
    if (!liberado) return new NextResponse(null, { status: 404 });
    // Candidatura no site público: iniciar, presign do currículo e o envio
    // rodam no Gaius (banco, B2, carimbo HMAC). O navegador fala com o mesmo
    // domínio; o repasse é aqui, sem CORS e sem chave nenhuma deste lado.
    if (GAIUS_BASE && (path === "/api/candidatura" || path.startsWith("/api/candidatura/"))) {
      return NextResponse.rewrite(new URL(`${path}${request.nextUrl.search}`, GAIUS_BASE));
    }
    return response;   // o player é público — não precisa de sessão
  }

  const prefixes = [...(PREVIEW_BYPASS ? [...PUBLIC_PREFIXES, ...BYPASS_PREFIXES] : PUBLIC_PREFIXES), ...DEV_ONLY_PREFIXES];
  const isPublic = MACHINE_EXACT.has(path) || ehRotaPublica(path, prefixes);

  // Rota pública → NUNCA bloqueia por papel, então o único motivo de gastar um
  // getUser() aqui seria renovar o cookie de quem já está logado. Não compensa
  // o risco (A2 da auditoria): o gate anterior só saía barato quando NÃO havia
  // cookie de sessão, e olhava apenas o NOME do cookie sb-*auth-token, nunca a
  // validade. Um `Cookie: sb-x-auth-token=<lixo rotativo>` forjado furava essa
  // saída e caía no getUser() abaixo — e como sessionKey usa o VALOR do cookie,
  // valor novo a cada request = cache-miss sempre = UM round-trip HTTP ao
  // /auth/v1/user por requisição. É o mesmo "Fluid Active CPU" que já pausou o
  // projeto (11h53m/4h), agora disparável de FORA numa rota que deveria custar
  // zero — e os valores rotativos ainda enchiam o auth-cache até o teto,
  // evictando as sessões legítimas. Quem está logado renova o cookie no próximo
  // acesso a rota protegida (o Shell, os polls, as APIs — o tempo todo); só quem
  // ficasse >1h SÓ numa URL pública sem tocar em mais nada re-loga, irrelevante.
  // A vitrine pública ganha identidade ANÔNIMA aqui — e só aqui, porque o
  // middleware é o único ponto do caminho de uma página que grava cookie.
  //
  // Não custa ida ao banco nenhuma: é leitura de cookie e, no máximo, um uuid.
  // Fica DENTRO do `try` porque middleware que lança vira 500 em cima da loja
  // de um cliente — e um relatório de acesso não vale derrubar uma venda.
  if (ehCaminhoDeVitrine(path)) {
    try {
      return respostaComIdentidade(request, request.headers.get("host"));
    } catch {
      return response;
    }
  }

  if (isPublic) return response;

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Sem env de auth no runtime → NÃO derruba o site inteiro (era MIDDLEWARE_
  // INVOCATION_FAILED em toda rota, inclusive /login). Deixa passar; as páginas
  // protegidas re-checam a sessão no servidor (requireModule) e redirecionam.
  if (!supaUrl || !supaKey) return response;

  try {
    // Em http (ex.: tablet via localhost/adb reverse) NÃO marca Secure, senão o
    // WebView descarta o cookie de sessão re-gravado no refresh e o login cai.
    const proto = request.headers.get("x-forwarded-proto");
    const secure = proto ? proto.split(",")[0].trim() === "https" : request.nextUrl.protocol === "https:";
    const supabase = createServerClient(supaUrl, supaKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { ...limitarValidade(options), secure })
          );
        },
      },
    });
    // Memoizado pelo cookie de sessão (lib/auth-cache): o middleware casa TODA
    // rota, então sem isso cada fetch da tela pagava uma ida ao /auth/v1/user.
    //
    // `getClaims()` em vez de `getUser()`: o projeto assina o JWT com chave
    // assimétrica (ES256), então a verificação é LOCAL — assinatura conferida
    // com o JWKS público, que o auth-js baixa uma vez e guarda em memória. O
    // que era um round-trip HTTP por cache-miss vira microssegundos de
    // WebCrypto. O refresh do cookie continua igual (getClaims passa pelo
    // getSession, que renova token vencido e grava via setAll), e num token
    // HS256 legado ele cai sozinho no getUser() — mesmo custo de antes, nunca
    // menos seguro.
    const user = await cachedByToken(
      sessionKey(request.cookies.getAll()),
      async () => {
        const { data, error } = await supabase.auth.getClaims();
        // Blip de rede/5xx do Auth NÃO é "deslogado": lança, o auth-cache não
        // guarda rejeição, e o catch abaixo deixa seguir (a rota re-checa).
        if (error && isAuthRetryableFetchError(error)) throw error;
        return data?.claims ?? null;
      }
    );

    if (!user && !isPublic) {
      // API responde 401 JSON; só PÁGINA é redirecionada pro /login.
      //
      // Redirecionar uma rota de API era um defeito silencioso e caro: o
      // `fetch` do navegador SEGUE o redirect sozinho, chega no /login e recebe
      // **200 com HTML**. Do lado do cliente isso é indistinguível de sucesso —
      // `r.ok` é `true` e o `catch` não roda. Toda escrita otimista do sistema
      // (196 chamadas, das quais 129 checam exatamente `r.ok`) mantinha o
      // estado novo na tela: a pessoa via "aprovado", "salvo", "concluído" — e
      // nada tinha sido gravado.
      //
      // É a aba que ficou aberta desde ontem, com a sessão expirando em
      // silêncio. Medido: PATCH /api/central/solicitacoes devolvia
      // `{ status: 200, ok: true, corpo: "<!DOCTYPE html>…" }`.
      //
      // Corrigir AQUI e não nos 129 componentes: quem checa `r.ok` está certo,
      // quem mentia era a resposta. Uma linha conserta todos de uma vez.
      if (ehRotaDeApi(path)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  } catch (e) {
    // Blip de auth/rede/edge: NÃO 500 no site todo. As páginas re-checam a sessão
    // (requireModule) e redirecionam pra /login se preciso — segurança preservada.
    console.error("[middleware] auth check falhou, seguindo sem bloquear:", e);
  }
  return response;
}

// Cobre tudo, menos estáticos do Next e arquivos com extensão (assets).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
