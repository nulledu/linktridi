// Atalho de leitura do acesso resolvido, pra usar dentro de rota que já tem o
// perfil na mão e precisa combinar "papel de sempre" com "chave da grade".
//
// Existe por um motivo concreto: o contrato da grade é "ligar o card libera a
// página E as APIs daquela área", e o que quebrava esse contrato era sempre a
// mesma linha — `me.role === "admin"` (ou uma lista de papéis) decidindo
// sozinha, num arquivo escrito antes da grade existir. O efeito era o report
// clássico: "a permissão está ativa e a pessoa continua bloqueada".
//
// Ver a trava em lib/__tests__/gate-por-area.test.ts.
import { resolveMyModuleKeys } from "@/lib/perfis";
import type { Role } from "@/lib/rbac";

export interface Quem { id: string; role: string; username?: string | null }

/** Tem ao menos UMA das chaves resolvidas (área ou sub-permissão)? */
export async function temChave(me: Quem, ...chaves: string[]): Promise<boolean> {
  const minhas = await resolveMyModuleKeys({ id: me.id, role: me.role as Role, username: me.username });
  return chaves.some((k) => minhas.includes(k));
}

/** Papel na lista de sempre OU chave da grade. O padrão dos gates legados. */
export async function papelOuChave(me: Quem, papeis: readonly string[], ...chaves: string[]): Promise<boolean> {
  if (papeis.includes(me.role)) return true;
  return temChave(me, ...chaves);
}
