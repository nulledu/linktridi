// ── Portão do Financeiro ─────────────────────────────────────────────────────
// UM lugar só decide quem entra. A página e a rota de API usam as MESMAS
// chaves, porque a divergência entre as duas é o bug clássico deste repositório:
// a tela abre, toda requisição volta 403, e a leitura de quem está na frente do
// computador é "está quebrado" — não "falta permissão".
// Ver lib/__tests__/gate-por-area.test.ts.

import { redirect } from "next/navigation";
import { requireModuleKeys, getProfileForModule, type Profile } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { getProfile } from "@/lib/require-auth";

/** As sub-ações da área (espelham lib/areas.ts → AREAS.financeiro.subs). */
export type SubFinanceiro =
  | "ver" | "compromissos" | "compras" | "notas" | "patrimonio"
  | "cadastros" | "pagar" | "contas" | "folha" | "config" | "acessos";

export const CHAVE_AREA = "financeiro";
export const chaveSub = (s: SubFinanceiro) => `${CHAVE_AREA}:${s}` as const;

/**
 * Para onde mandar quem não tem a chave.
 *
 * Barreira de permissão NUNCA responde 404. "Não existe" faz a pessoa concluir
 * que o sistema está quebrado — ela não tem como adivinhar que o que falta é
 * uma chave, nem qual pedir. A tela de sem-permissão diz as duas coisas.
 */
export const semPermissaoDoFinanceiro = (sub?: SubFinanceiro) =>
  `/sem-permissao?area=${encodeURIComponent(sub ? chaveSub(sub) : CHAVE_AREA)}`;

/** Poderes resolvidos desta pessoa, no vocabulário da tela. */
export interface PoderesFinanceiro {
  ver: boolean; compromissos: boolean; compras: boolean; notas: boolean;
  patrimonio: boolean; cadastros: boolean; pagar: boolean; contas: boolean; folha: boolean;
  /** Cadastrar empresa e definir a marca (logo/ícone) de empresas e contas. */
  config: boolean;
  /** Pode conceder e revogar o Financeiro para outras pessoas. */
  acessos: boolean;
}

export function poderesDe(keys: string[]): PoderesFinanceiro {
  const tem = (s: SubFinanceiro) => keys.includes(chaveSub(s));
  return {
    ver: tem("ver"), compromissos: tem("compromissos"), compras: tem("compras"),
    notas: tem("notas"), patrimonio: tem("patrimonio"), cadastros: tem("cadastros"),
    pagar: tem("pagar"), contas: tem("contas"), folha: tem("folha"), config: tem("config"),
    acessos: tem("acessos"),
  };
}

/**
 * Gate de PÁGINA. Exige a área e, quando pedido, a sub-ação.
 *
 * Quem tem a área mas não a sub cai na mesma tela de "sem permissão" com a
 * chave FINA no endereço — assim a pessoa consegue pedir "me libera
 * financeiro:folha" em vez de "não consigo abrir uma tela lá".
 */
export async function requireFinanceiro(
  sub?: SubFinanceiro,
): Promise<{ profile: Profile; keys: string[]; poderes: PoderesFinanceiro }> {
  const { profile, keys } = await requireModuleKeys(CHAVE_AREA);
  if (sub && !keys.includes(chaveSub(sub))) {
    redirect(`/sem-permissao?area=${encodeURIComponent(chaveSub(sub))}`);
  }
  return { profile, keys, poderes: poderesDe(keys) };
}

/**
 * Gate de API. Devolve `null` quando não pode — a rota responde 403.
 * Nunca redireciona: rota de API que redireciona vira 200 com HTML, e o
 * `r.ok` do lado do cliente lê isso como sucesso (ver a memória
 * "sessão expirada virava salvo").
 */
export async function apiFinanceiro(
  sub?: SubFinanceiro,
): Promise<{ profile: Profile; keys: string[]; poderes: PoderesFinanceiro } | null> {
  const profile = await getProfileForModule(CHAVE_AREA);
  if (!profile) return null;
  const keys = await resolveMyModuleKeys({ id: profile.id, role: profile.role, username: profile.username });
  if (sub && !keys.includes(chaveSub(sub))) return null;
  return { profile, keys, poderes: poderesDe(keys) };
}

/** Só os poderes, sem barrar — para a tela decidir o que mostrar. */
export async function meusPoderes(): Promise<PoderesFinanceiro | null> {
  const profile = await getProfile();
  if (!profile) return null;
  const keys = await resolveMyModuleKeys({ id: profile.id, role: profile.role, username: profile.username });
  if (!keys.includes(CHAVE_AREA)) return null;
  return poderesDe(keys);
}
