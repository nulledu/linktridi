// ── O que digitar no painel do provedor de DNS ───────────────────────────────
// Puro e testável: entra um host, sai a instrução exata ("crie um CNAME chamado
// `loja` apontando pra cname.vercel-dns.com").
//
// Mora aqui, e não dentro de uma tela, porque agora são DUAS telas dando a
// mesma instrução — Domínios do TridiFlow e Configurações da loja. Duas cópias
// da regra viram duas instruções diferentes na primeira correção, e quem
// seguir a desatualizada aponta o DNS errado e passa horas achando que o
// sistema está quebrado.

/**
 * Sufixos de DOIS níveis. Sem esta lista, "gedux.com.br" pareceria um
 * subdomínio de "com.br" e a instrução sairia mandando criar um CNAME — mas a
 * raiz não aceita CNAME, e o site inteiro do cliente cairia.
 */
const SUFIXOS2 = ["com.br", "net.br", "org.br", "gov.br", "edu.br", "adv.br", "ind.br", "co.uk", "com.au", "com.pt", "co.jp"];

/** Provedores comuns no Brasil — só pra tela dizer onde a pessoa procura. */
export const PROVEDORES = ["Registro.br", "Hostinger", "GoDaddy", "Cloudflare", "HostGator", "Locaweb"];

/** IP e destino da Vercel. Num lugar só: mudou lá, muda nas duas telas. */
export const VERCEL_A = "76.76.21.21";
export const VERCEL_CNAME = "cname.vercel-dns.com";

/**
 * União discriminada de propósito: "não é raiz" e "tem subdomínio" são a MESMA
 * afirmação, e escrever `sub: string | null` com `apex: boolean` obrigaria todo
 * uso a tratar um quarto caso que não existe (raiz com subdomínio). Assim o
 * `if (apex)` já estreita o tipo.
 */
export type PartesHost =
  | { sub: string; apex: false }   // loja.tridi.com.br
  | { sub: null; apex: true };     // tridi.com.br

/** Divide o host em subdomínio + raiz. Aceita com `https://` e com caminho. */
export function partesHost(host: string): PartesHost {
  const h = (host || "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!h.includes(".")) return { sub: null, apex: true };
  const suf = SUFIXOS2.find((s) => h.endsWith("." + s));
  const base = suf ? h.slice(0, -(suf.length + 1)) : h.replace(/\.[^.]+$/, "");
  const labels = base.split(".").filter(Boolean);
  if (labels.length <= 1) return { sub: null, apex: true };
  return { sub: labels.slice(0, -1).join("."), apex: false };
}

export interface LinhaDns { campo: string; valor: string; dica: string }

/** Registro certo pro endereço: subdomínio usa CNAME; raiz precisa de A. */
export function dnsPara(host: string): LinhaDns[] {
  const partes = partesHost(host);
  if (partes.apex) {
    return [
      { campo: "Tipo", valor: "A", dica: "raiz não aceita CNAME" },
      { campo: "Nome / Host", valor: "@", dica: "@ significa o domínio raiz" },
      { campo: "Aponta para (valor)", valor: VERCEL_A, dica: "o IP da Vercel" },
    ];
  }
  return [
    { campo: "Tipo", valor: "CNAME", dica: "o tipo do registro" },
    { campo: "Nome / Host", valor: partes.sub, dica: "só o subdomínio — a parte antes do seu domínio" },
    { campo: "Aponta para (valor)", valor: VERCEL_CNAME, dica: "o destino do registro" },
  ];
}

/**
 * Endereço de EXEMPLO, pra tela ter o que mostrar antes de existir cadastro.
 *
 * O subdomínio muda com o contexto ("chat" pro link do bot, "loja" pra
 * vitrine) e é a única diferença entre as duas telas. Antes isso era um
 * parâmetro do `dnsPara` que nunca disparava: se o host TEM subdomínio, o
 * subdomínio nunca é vazio, então o padrão era código morto se fingindo de
 * regra. O teste é que mostrou.
 */
export const hostExemplo = (sub: string) => `${sub}.suaempresa.com.br`;

/** Normaliza o que a pessoa digitou pro formato que o cadastro guarda. */
export function limparHost(host: string): string {
  return (host || "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
}
