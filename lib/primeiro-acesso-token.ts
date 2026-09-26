import { createHash, randomBytes, timingSafeEqual } from "crypto";

// ── Link de primeiro acesso ──────────────────────────────────────────────────
//
// Substitui o "digite qualquer senha e ela vira a sua". Naquele desenho, o
// segredo era o NOME DE USUÁRIO — e nome de usuário é o nome da pessoa, então
// qualquer um adivinhava e tomava a conta de quem ainda não tinha entrado.
//
// Aqui o segredo é o LINK: 32 bytes aleatórios que só existem porque um admin
// mandou gerar. Quem não tem o link não entra, e não importa quanto tempo a
// pessoa demore para usar — nenhuma conta fica "aberta esperando" só por não ter
// sido acessada ainda. É isso que deixa dezenas de contas pendentes conviverem
// com segurança.
//
// O banco guarda só o HASH do token. Vazar a tabela `profiles` não entrega
// nenhum link utilizável — mesmo raciocínio do token dos aparelhos do galpão.

/** Validade do link. Longa de propósito: não é corrida contra o relógio. */
export const VALIDADE_LINK_DIAS = 14;
export const VALIDADE_LINK_MS = VALIDADE_LINK_DIAS * 24 * 3600 * 1000;

export interface TokenGerado {
  /** Vai no link, mostrado UMA vez a quem gerou. Nunca é guardado. */
  token: string;
  /** O que fica no banco. */
  hash: string;
  /** ISO do vencimento. */
  expiraEm: string;
}

export function gerarTokenPrimeiroAcesso(agora: Date = new Date()): TokenGerado {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashDoToken(token),
    expiraEm: new Date(agora.getTime() + VALIDADE_LINK_MS).toISOString(),
  };
}

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Formato do token, conferido ANTES de ir ao banco (não gasta consulta com lixo). */
export function tokenTemFormato(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Comparação em tempo constante — hash tem tamanho fixo, então é seguro. */
export function hashConfere(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

export type EstadoLink =
  | { valido: true }
  | { valido: false; motivo: "sem_token" | "nao_encontrado" | "ja_usado" | "expirado" };

export interface LinhaDeLink {
  primeiro_acesso_token_hash?: string | null;
  primeiro_acesso_expira_em?: string | null;
  primeiro_acesso_usado_em?: string | null;
}

/**
 * O link ainda vale? PURA — a rota só aplica.
 *
 * Uso único (`usado_em`) e vencimento são checados aqui juntos porque os dois
 * são a mesma pergunta do ponto de vista de quem abriu o link: "isso ainda
 * serve?". Cada motivo é distinto para a TELA poder explicar direito — dizer
 * "link inválido" pra um link que só venceu manda a pessoa procurar erro de
 * digitação em vez de pedir um novo.
 */
export function avaliarLink(linha: LinhaDeLink | null, agora: Date = new Date()): EstadoLink {
  if (!linha || !linha.primeiro_acesso_token_hash) return { valido: false, motivo: "nao_encontrado" };
  if (linha.primeiro_acesso_usado_em) return { valido: false, motivo: "ja_usado" };
  const prazo = linha.primeiro_acesso_expira_em ? new Date(linha.primeiro_acesso_expira_em) : null;
  if (!prazo || Number.isNaN(prazo.getTime())) return { valido: false, motivo: "expirado" };
  if (prazo.getTime() <= agora.getTime()) return { valido: false, motivo: "expirado" };
  return { valido: true };
}

/** Piso da senha escolhida no 1º acesso — o mesmo da troca voluntária. */
export const SENHA_MINIMO = 8;

export function senhaAceitavel(senha: unknown): senha is string {
  return typeof senha === "string" && senha.length >= SENHA_MINIMO;
}

/** Monta o link a partir da origem da requisição (nunca de uma URL fixa). */
export function montarLink(origem: string, token: string): string {
  return `${origem.replace(/\/$/, "")}/primeiro-acesso?t=${token}`;
}

// ── Usuário e e-mail escolhidos no primeiro acesso ───────────────────────────
// A pessoa aproveita o momento pra ajustar como vai entrar. O e-mail é o que
// mais importa: metade das contas não tem um, e sem e-mail não existe "esqueci
// minha senha" nem verificação de acesso de fora. Pedir aqui é o único momento
// em que a própria pessoa está na tela para informar.

/** Normaliza o usuário: minúsculo, sem acento, só letras/números/ponto. */
export function normalizarUsuario(bruto: string): string {
  return bruto
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9.]+/g, "")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 24);
}

export type ProblemaUsuario = "curto" | "reservado";

/**
 * O usuário escolhido é aceitável?
 *
 * `ehReservado` recebe `ehSuperusuario` — e isto NÃO é detalhe: a lista de
 * superusuários casa por USERNAME (lib/superusuario.ts). Sem esta trava, a
 * pessoa digitaria "caio" no próprio primeiro acesso e passaria a atravessar
 * todos os gates do sistema. A checagem mora aqui, junto da validação, pra não
 * depender de alguém lembrar dela na rota.
 */
export function validarUsuarioEscolhido(
  bruto: string,
  ehReservado: (u: string) => boolean,
): { ok: true; valor: string } | { ok: false; motivo: ProblemaUsuario } {
  const valor = normalizarUsuario(bruto);
  if (valor.length < 3) return { ok: false, motivo: "curto" };
  if (ehReservado(valor)) return { ok: false, motivo: "reservado" };
  return { ok: true, valor };
}

/** E-mail: formato simples e minúsculo. Vazio é válido — o campo é opcional. */
export function normalizarEmailEscolhido(bruto: string): { ok: true; valor: string | null } | { ok: false } {
  const v = bruto.trim().toLowerCase();
  if (!v) return { ok: true, valor: null };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || v.length > 160) return { ok: false };
  // O domínio sintético não é e-mail de verdade: aceitar faria a pessoa achar
  // que tem recuperação por e-mail quando não tem.
  if (v.endsWith("@tridi.local")) return { ok: false };
  return { ok: true, valor: v };
}
