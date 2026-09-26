// ── De onde a pessoa está acessando ──────────────────────────────────────────
//
// A Vercel resolve o IP em país no edge e entrega o resultado num cabeçalho — em
// Next 16 o `request.geo` não existe mais, então lê-se o cabeçalho cru.
//
// POR QUE COMEÇA SÓ REGISTRANDO: geolocalização de IP ERRA. Chip 4G roteado por
// outro país, VPN corporativa, faixa de IP nova mal classificada, alguém em
// viagem. E a assimetria é cruel: quem for barrado por engano é justamente quem
// precisa entrar pra desfazer o bloqueio. Então primeiro se OLHA (modo
// "registrar") e só depois se tranca, com dado real na mão.
//
// Configuração por ambiente. O PADRÃO já é "registrar" — de propósito: registrar
// não bloqueia ninguém (é só uma linha gravada por login), e sem dado nenhum não
// há como decidir se vale ligar o bloqueio. Deixar a coleta dependendo de alguém
// lembrar de configurar uma variável era garantir que a decisão fosse tomada às
// cegas, meses depois, achando que "ninguém acessa de fora".
//
//   GEO_MODO    = "off" | "registrar" | "bloquear"   (padrão: "registrar")
//   GEO_PAISES  = "BR,PT"                             (padrão: "BR")
//
// Só o "bloquear" exige ação consciente — que é como tem que ser: é o único
// modo que pode deixar alguém de fora.

export type ModoGeo = "off" | "registrar" | "bloquear";

/** Cabeçalho da Vercel. `null` quando não dá pra saber (dev local, edge sem geo). */
export function paisDaRequisicao(cabecalhos: Headers): string | null {
  const p =
    cabecalhos.get("x-vercel-ip-country") ||
    cabecalhos.get("cf-ipcountry") ||      // caso um dia passe por Cloudflare
    "";
  const limpo = p.trim().toUpperCase();
  return limpo && limpo !== "XX" ? limpo : null;
}

export function modoGeo(env: Record<string, string | undefined> = process.env): ModoGeo {
  const m = (env.GEO_MODO || "registrar").trim().toLowerCase();
  if (m === "bloquear") return "bloquear";
  if (m === "off") return "off";
  // Qualquer outra coisa (inclusive erro de digitação) cai em "registrar", que
  // é o modo que não pode prejudicar ninguém. Um GEO_MODO escrito errado nunca
  // deve virar bloqueio por acidente.
  return "registrar";
}

export function paisesPermitidos(env: Record<string, string | undefined> = process.env): string[] {
  const bruto = (env.GEO_PAISES || "BR").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  return bruto.length ? bruto : ["BR"];
}

export type VeredictoGeo =
  | { permitir: true; motivo: "desligado" | "pais_permitido" | "pais_desconhecido" | "isento"; pais: string | null }
  | { permitir: false; motivo: "pais_bloqueado"; pais: string };

/**
 * Decide o acesso pela localidade. PURA — a rota só aplica.
 *
 * Três garantias deliberadas:
 *  · `fail-open` no país desconhecido. Sem o cabeçalho (dev, edge sem geo, IP
 *    novo) NÃO se bloqueia: barrar quem não se conseguiu identificar transforma
 *    uma falha de infraestrutura em gente trancada fora do trabalho.
 *  · modo "registrar" nunca bloqueia — só devolve o país pra quem for anotar.
 *  · `isento` existe pra quem viaja (profiles.geo_livre): sem uma saída por
 *    pessoa, a primeira viagem do dono do sistema vira um chamado de suporte
 *    que ninguém consegue atender, porque quem atenderia está fora do país.
 */
export function avaliarGeo(
  pais: string | null,
  opts: { modo?: ModoGeo; permitidos?: string[]; isento?: boolean } = {},
): VeredictoGeo {
  const modo = opts.modo ?? modoGeo();
  const permitidos = opts.permitidos ?? paisesPermitidos();

  if (modo === "off") return { permitir: true, motivo: "desligado", pais };
  if (pais === null) return { permitir: true, motivo: "pais_desconhecido", pais: null };
  if (permitidos.includes(pais)) return { permitir: true, motivo: "pais_permitido", pais };
  if (opts.isento) return { permitir: true, motivo: "isento", pais };
  if (modo === "registrar") return { permitir: true, motivo: "pais_permitido", pais };
  return { permitir: false, motivo: "pais_bloqueado", pais };
}

/** `true` quando o acesso veio de fora da lista — serve pro alerta, mesmo sem bloquear. */
export function ehAcessoDeFora(pais: string | null, permitidos: string[] = paisesPermitidos()): boolean {
  return pais !== null && !permitidos.includes(pais);
}
