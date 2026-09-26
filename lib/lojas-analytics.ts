// ── Analytics da vitrine — o domínio ─────────────────────────────────────────
// Classificar de ONDE a pessoa veio, DE ONDE ela está e SE ela é gente. Nada
// aqui toca banco nem React: é o miolo testável, e é onde moram as decisões que
// depois ninguém consegue auditar olhando um gráfico.
//
// ── Por que a contagem é no SERVIDOR e não por pixel ─────────────────────────
//
// A escolha óbvia seria um `<img src="/px?...">`: é como todo mundo faz. Este
// projeto não faz, por dois motivos que pesam mais que o costume.
//
//   1. INVOCAÇÃO. Um pixel é +1 invocação por visualização de página. Este
//      projeto já foi PAUSADO pela Vercel por estourar invocação (1,1M num teto
//      de 1M). A página já é uma invocação; contar dentro dela, com `after()` —
//      que roda depois da resposta sair —, custa zero e não atrasa nada.
//   2. BLOQUEADOR. Endereço com cara de rastreamento é bloqueado por extensão
//      em 20–30% do tráfego. O número que o lojista vê tem que ser o número, não
//      "o número de quem não usa bloqueador".
//
// O preço da escolha é este, e ele é pago com filtro: sem pixel, ROBÔ e
// PREFETCH também chegam à renderização. `ehRobo` e `ehPrefetch` existem por
// causa disso — sem os dois, "acessos" viraria "vezes que a Vercel renderizou".

// ── Robô ─────────────────────────────────────────────────────────────────────

/**
 * Robôs conhecidos, por user-agent.
 *
 * Lista de BLOQUEIO e não de permissão — ao contrário do higienizador de HTML,
 * aqui errar por omissão é barato (um robô a mais numa contagem) e errar por
 * excesso é caro (some gente de verdade do relatório). O `bot|crawler|spider`
 * genérico pega a maioria; os nomeados são os que não trazem essas palavras.
 */
const ROBOS = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|monitor|pingdom|lighthouse|headless|curl|wget|python-requests|axios|postman|semrush|ahrefs|screaming|gtmetrix|pagespeed|uptime/i;

export function ehRobo(userAgent: string | null): boolean {
  const ua = (userAgent || "").trim();
  // User-agent vazio é robô mal-educado ou requisição de máquina. Navegador
  // sempre manda um.
  if (!ua) return true;
  return ROBOS.test(ua);
}

/**
 * Requisição que o navegador fez ADIANTANDO, sem ninguém ter aberto a página.
 *
 * O `<Link>` do Next busca a página quando o link entra na tela. Contar isso
 * como visita faria uma vitrine com dez produtos registrar dez visualizações
 * pra quem só rolou a home.
 */
export function ehPrefetch(cabecalhos: Headers): boolean {
  return (
    cabecalhos.get("next-router-prefetch") === "1" ||
    /prefetch/i.test(cabecalhos.get("sec-purpose") || "") ||
    /prefetch/i.test(cabecalhos.get("purpose") || "") ||
    cabecalhos.get("x-moz") === "prefetch"
  );
}

// ── Dispositivo ──────────────────────────────────────────────────────────────

export type Dispositivo = "celular" | "tablet" | "computador";

export function dispositivoDe(userAgent: string | null): Dispositivo {
  const ua = userAgent || "";
  // Tablet ANTES de celular: o iPad manda "Mobile" no user-agent, e a ordem
  // invertida classificaria todo iPad como celular.
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return "celular";
  return "computador";
}

// ── Onde a pessoa está ───────────────────────────────────────────────────────

/** As 27 unidades federativas. Serve de validação: sigla fora daqui é ruído. */
export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const NOME_DA_UF: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};

/**
 * O estado de quem está acessando, pelo cabeçalho de geolocalização da Vercel.
 *
 * `x-vercel-ip-country-region` traz o código ISO-3166-2 da subdivisão — pro
 * Brasil, a sigla da UF. Só é aceito quando o país É o Brasil: "SP" também
 * existe em outros países (e "PR" é a Coreia do Norte inteira em ISO-3166-1),
 * e sem a checagem um acesso de fora entraria no relatório como São Paulo.
 *
 * `null` quando não dá pra saber — desenvolvimento local, VPN, faixa de IP nova.
 * Geolocalização por IP ERRA, e o relatório precisa dizer "não sei" em vez de
 * chutar (é a mesma postura de `lib/geo-acesso.ts`).
 */
export function ufDaRequisicao(cabecalhos: Headers): string | null {
  const pais = (cabecalhos.get("x-vercel-ip-country") || "").trim().toUpperCase();
  if (pais !== "BR") return null;
  const regiao = (cabecalhos.get("x-vercel-ip-country-region") || "").trim().toUpperCase();
  // Vem como "SP" ou "BR-SP", dependendo do provedor de geolocalização.
  const sigla = regiao.replace(/^BR-/, "");
  return (UFS as readonly string[]).includes(sigla) ? sigla : null;
}

export function paisDaRequisicaoDaVitrine(cabecalhos: Headers): string | null {
  const p = (cabecalhos.get("x-vercel-ip-country") || "").trim().toUpperCase();
  return p && p !== "XX" ? p : null;
}

// ── De onde a pessoa veio ────────────────────────────────────────────────────

export type Canal = "direto" | "busca" | "social" | "indicacao" | "campanha" | "email";

export const ROTULO_CANAL: Record<Canal, string> = {
  direto: "Direto",
  busca: "Busca",
  social: "Redes sociais",
  indicacao: "Indicação",
  campanha: "Campanha",
  email: "E-mail",
};

export interface Origem {
  canal: Canal;
  /** Quem trouxe: "google", "instagram", "blog.exemplo.com", `utm_source`. */
  fonte: string | null;
  campanha: string | null;
  /** Host do referrer externo, guardado pra auditoria do que foi classificado. */
  referencia: string | null;
}

const BUSCADORES = /^(www\.)?(google|bing|yahoo|duckduckgo|ecosia|yandex|baidu|ask|brave|search\.)/i;
/** Encurtadores e hosts ambíguos, casados pelo host INTEIRO.
 *  `t.me` é Telegram e `t.co` é o X: os dois viram a marca "t", então a marca
 *  sozinha não resolve — o host completo tem que ser consultado antes. */
const SOCIAIS_POR_HOST: Record<string, string> = {
  "t.me": "telegram", "t.co": "x", "fb.me": "facebook", "youtu.be": "youtube",
  "wa.me": "whatsapp", "api.whatsapp.com": "whatsapp", "chat.whatsapp.com": "whatsapp",
  "lnkd.in": "linkedin", "pin.it": "pinterest",
};

/** O resto, casado pela marca do host (`l.instagram.com` → `instagram`). */
const SOCIAIS: Record<string, string> = {
  instagram: "instagram", facebook: "facebook", tiktok: "tiktok", twitter: "x",
  x: "x", linkedin: "linkedin", pinterest: "pinterest", youtube: "youtube",
  reddit: "reddit", threads: "threads", kwai: "kwai", telegram: "telegram",
  whatsapp: "whatsapp", snapchat: "snapchat", tumblr: "tumblr",
};

/** `https://www.google.com/search?q=x` → `www.google.com`. Vazio vira `null`. */
export function hostDe(url: string | null | undefined): string | null {
  const bruto = (url || "").trim();
  if (!bruto) return null;
  try {
    return new URL(bruto).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * A marca do host: `l.instagram.com` → `instagram`, `blog.parceiro.com.br` →
 * `parceiro`, `www.google.com` → `google`.
 *
 * Tira o sufixo público e fica com o ÚLTIMO rótulo do que sobrou. Ficar com
 * tudo que sobra ("l.instagram") faria cada subdomínio virar uma origem
 * diferente no relatório — `l.instagram.com` e `www.instagram.com` são o mesmo
 * Instagram, e apareceriam como duas linhas.
 *
 * O sufixo tem duas partes quando termina em país de duas letras precedido de
 * um rótulo curto ("com.br", "co.uk"); senão, uma.
 */
function marcaDoHost(host: string): string {
  const partes = host.replace(/^www\./, "").split(".");
  const ehComposto =
    partes.length > 2 &&
    partes[partes.length - 1].length === 2 &&
    partes[partes.length - 2].length <= 3;
  const restante = partes.slice(0, Math.max(1, partes.length - (ehComposto ? 2 : 1)));
  return restante[restante.length - 1] || host;
}

const limpar = (v: string | null | undefined, max = 80): string | null => {
  const s = (v || "").trim().toLowerCase().slice(0, max);
  return s || null;
};

/**
 * Classifica a origem de uma visita.
 *
 * A ordem importa e é a de CONFIANÇA, não a de conveniência:
 *
 *   1. `utm_*`, quando existe. É o lojista dizendo de onde vem — ninguém sabe
 *      melhor que ele que aquele link estava no story de terça.
 *   2. o referrer, quando é de fora da própria loja.
 *   3. "direto", que é honestamente "não sei": digitou, veio de aplicativo, de
 *      PDF, de e-mail sem marcação. Chamar isso de "direto" é a convenção do
 *      mercado, e vale lembrar que ela junta coisas bem diferentes.
 *
 * Referrer do PRÓPRIO domínio não conta: navegar de uma página pra outra da
 * loja não é uma origem nova — seria a loja "indicando" a si mesma, e o
 * relatório mostraria a própria vitrine como maior parceira.
 */
export function classificarOrigem(
  referrer: string | null | undefined,
  parametros: URLSearchParams | Record<string, string | undefined>,
  hostDaLoja: string | null,
): Origem {
  const pegar = (k: string): string | null => {
    const v = parametros instanceof URLSearchParams ? parametros.get(k) : parametros[k];
    return limpar(v);
  };

  const host = hostDe(referrer);
  // O host da loja pode chegar como "loja.com.br" ou "www.loja.com.br".
  const proprio = !!host && !!hostDaLoja &&
    host.replace(/^www\./, "") === hostDaLoja.replace(/^www\./, "");
  const referencia = proprio ? null : host;

  const utmSource = pegar("utm_source");
  const utmMedium = pegar("utm_medium");
  const campanha = pegar("utm_campaign") ?? pegar("utm_content");

  if (utmSource || utmMedium || campanha) {
    const meio = utmMedium || "";
    // `utm_medium` diz o TIPO de mídia; ele é quem decide o canal quando existe.
    const canal: Canal =
      /email|e-mail|newsletter|mail/.test(meio) ? "email"
      : /social|paid_social|stories|feed/.test(meio) ? "social"
      : /cpc|ppc|paid|ads|display|banner|retarget/.test(meio) ? "campanha"
      : /organic|search|seo/.test(meio) ? "busca"
      : /referral|indica/.test(meio) ? "indicacao"
      : "campanha";
    return { canal, fonte: utmSource ?? (referencia ? marcaDoHost(referencia) : null), campanha, referencia };
  }

  if (!referencia) return { canal: "direto", fonte: null, campanha: null, referencia: null };

  if (BUSCADORES.test(referencia)) {
    return { canal: "busca", fonte: marcaDoHost(referencia), campanha: null, referencia };
  }

  const semWww = referencia.replace(/^www\./, "");
  const social = SOCIAIS_POR_HOST[semWww] ?? SOCIAIS[marcaDoHost(referencia)];
  if (social) return { canal: "social", fonte: social, campanha: null, referencia };

  const marca = marcaDoHost(referencia);

  return { canal: "indicacao", fonte: marca, campanha: null, referencia };
}

// ── Sessão ───────────────────────────────────────────────────────────────────

/** Depois disto parada, a próxima visualização começa uma sessão NOVA. */
export const INATIVIDADE_DA_SESSAO_MS = 30 * 60 * 1000;

/** Um ano. É o que define "visitante recorrente". */
export const VALIDADE_DO_VISITANTE_MS = 365 * 24 * 3600 * 1000;

/**
 * Quanto tempo a origem da PRIMEIRA visita continua valendo pra atribuir um
 * pedido. Trinta dias é a janela de mercado, e o motivo é comportamental: quem
 * descobre a loja por um anúncio hoje muitas vezes volta direto pra comprar
 * depois — sem a janela, esse pedido apareceria como "direto" e o anúncio
 * pareceria não ter vendido nada.
 */
export const VALIDADE_DA_ATRIBUICAO_MS = 30 * 24 * 3600 * 1000;

export const COOKIE_VISITANTE = "lv";
export const COOKIE_SESSAO = "ls";
export const COOKIE_ATRIBUICAO = "la";

/** Serializa a origem pro cookie de atribuição: `canal|fonte|campanha`. */
export const serializarAtribuicao = (o: Origem): string =>
  [o.canal, o.fonte ?? "", o.campanha ?? ""].join("|").slice(0, 180);

export function lerAtribuicao(bruto: string | null | undefined): Origem | null {
  const s = (bruto || "").trim();
  if (!s) return null;
  const [canal, fonte, campanha] = s.split("|");
  const valido: Canal[] = ["direto", "busca", "social", "indicacao", "campanha", "email"];
  if (!valido.includes(canal as Canal)) return null;
  return {
    canal: canal as Canal,
    fonte: fonte || null,
    campanha: campanha || null,
    referencia: null,
  };
}
