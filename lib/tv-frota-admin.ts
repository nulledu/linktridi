import { randomBytes } from "crypto";

/**
 * Lado ADMIN da frota — o que o console web usa. Parte pura (gerar código,
 * validar o que o usuário digita ao publicar versão). O banco fica nas rotas.
 */

// Alfabeto sem caracteres ambíguos (0/O, 1/I/L): o código é digitado na TV com
// controle remoto, e "0 ou O?" na frente da parede é atrito garantido.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Código de ativação de uso único (8 chars), digitado na caixa uma vez. */
export function gerarCodigoAtivacao(tamanho = 8): string {
  const bytes = randomBytes(tamanho);
  let out = "";
  for (let i = 0; i < tamanho; i++) out += ALFABETO[bytes[i] % ALFABETO.length];
  return out;
}

export interface VersaoInput {
  versionCode: number;
  versionName: string;
  url: string;
  sha256: string;
  notas?: string;
  obrigatoria?: boolean;
}

export type ValidacaoVersao =
  | { ok: true; versao: Required<Omit<VersaoInput, "notas">> & { notas: string | null } }
  | { ok: false; erro: string };

/**
 * Valida o que o admin envia ao publicar uma versão. O `versionCode` é o
 * mesmo do build.gradle do app — número inteiro crescente; é ele que decide
 * se a frota atualiza (ver `precisaAtualizar`).
 */
export function validarVersaoInput(b: Partial<VersaoInput>): ValidacaoVersao {
  const versionCode = Number(b.versionCode);
  if (!Number.isInteger(versionCode) || versionCode < 1) return { ok: false, erro: "versionCode inválido" };
  const versionName = String(b.versionName ?? "").trim();
  if (!versionName) return { ok: false, erro: "versionName vazio" };
  const url = String(b.url ?? "").trim();
  if (!/^https:\/\//i.test(url)) return { ok: false, erro: "url do APK precisa ser https" };
  const sha256 = String(b.sha256 ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) return { ok: false, erro: "sha256 inválido (64 hex)" };
  return {
    ok: true,
    versao: { versionCode, versionName, url, sha256, obrigatoria: !!b.obrigatoria, notas: b.notas?.trim() || null },
  };
}

/** Ações que o POST do console aceita — conjunto fechado. */
export const ACOES_ADMIN = ["registrar", "renomear", "remover", "publicar_versao", "comando"] as const;
export type AcaoAdmin = (typeof ACOES_ADMIN)[number];
export const acaoValida = (a: unknown): a is AcaoAdmin =>
  typeof a === "string" && (ACOES_ADMIN as readonly string[]).includes(a);
