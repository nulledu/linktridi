// ── Portão do RH ─────────────────────────────────────────────────────────────
// UM lugar só decide quem entra. A página e a rota de API usam as MESMAS
// chaves, porque a divergência entre as duas é o bug clássico deste
// repositório: a tela abre, toda requisição volta 403, e a leitura de quem está
// na frente do computador é "está quebrado" — não "falta permissão".
// Ver lib/__tests__/gate-por-area.test.ts e lib/__tests__/rh-rotas.test.ts.
//
// Espelha `lib/financeiro/gate.ts` de propósito: é o mesmo problema (área
// restrita, sub por sub, tela que mostra só o que a pessoa pode) e ter duas
// formas diferentes de resolvê-lo é como uma delas fica desatualizada.

import { redirect } from "next/navigation";
import { requireModuleKeys, getProfileForModule, getProfile, type Profile } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";

/** As sub-ações da área (espelham lib/areas.ts → AREAS.rh.subs). */
export type SubRh =
  | "ver" | "editar"
  | "documentos" | "documentos_editar"
  | "atestados" | "atestados_editar"
  | "ponto" | "banco_horas" | "compensacoes_editar"
  | "ferias" | "ferias_editar"
  | "anamnese" | "anamnese_editar"
  | "curriculos" | "curriculos_respostas" | "curriculos_arquivo" | "curriculos_status" | "curriculos_editar" | "curriculos_integracao"
  | "acessos"
  | "calendario" | "calendario_editar" | "calendario_setores" | "calendario_feriados";

export const CHAVE_AREA = "rh";
export const chaveSub = (s: SubRh) => `${CHAVE_AREA}:${s}` as const;

/**
 * Para onde mandar quem não tem a chave.
 *
 * Barreira de permissão NUNCA responde 404. "Não existe" faz a pessoa concluir
 * que o sistema está quebrado — ela não tem como adivinhar que o que falta é
 * uma chave, nem qual pedir. A tela de sem-permissão diz as duas coisas.
 */
export const semPermissaoDoRh = (sub?: SubRh) =>
  `/sem-permissao?area=${encodeURIComponent(sub ? chaveSub(sub) : CHAVE_AREA)}`;

/** Poderes resolvidos desta pessoa, no vocabulário da tela. */
export interface PoderesRh {
  /** Abre o módulo, a lista e a ficha (dados pessoais e profissionais). */
  ver: boolean;
  /** Altera a ficha — inclusive a situação (ativo, afastado, férias, desligado). */
  editar: boolean;
  documentos: boolean;
  documentosEditar: boolean;
  atestados: boolean;
  atestadosEditar: boolean;
  ponto: boolean;
  bancoHoras: boolean;
  /** Registra, edita e aprova o par dia trabalhado ↔ dia de folga. Ler o par
   *  vem com `bancoHoras`; escrever é chave própria. */
  compensacoesEditar: boolean;
  ferias: boolean;
  feriasEditar: boolean;
  /** Ficha anamnésica: dado de saúde, não vem junto com nenhuma outra chave. */
  anamnese: boolean;
  anamneseEditar: boolean;
  /** Abre a lista de candidatos (o mínimo: nome, vaga, cidade, status). */
  curriculos: boolean;
  /** Lê o que o candidato respondeu no formulário. */
  curriculosRespostas: boolean;
  /** Abre e baixa o arquivo do currículo. */
  curriculosArquivo: boolean;
  /** Muda o status e arquiva. */
  curriculosStatus: boolean;
  /** Observação interna, vaga do candidato, cadastro de vagas. */
  curriculosEditar: boolean;
  /** Token do webhook, vaga padrão, liga/desliga o formulário. */
  curriculosIntegracao: boolean;
  calendario: boolean;
  /** Cria, edita e apaga evento interno e data comemorativa própria. */
  calendarioEditar: boolean;
  /** Datas dos setores. */
  calendarioSetores: boolean;
  /** Feriado manual e sincronização com a fonte externa. */
  calendarioFeriados: boolean;
  /** Pode conceder e revogar o RH para outras pessoas. */
  acessos: boolean;
}

export function poderesDe(keys: string[]): PoderesRh {
  const tem = (s: SubRh) => keys.includes(chaveSub(s));
  return {
    ver: tem("ver"),
    editar: tem("editar"),
    documentos: tem("documentos"),
    documentosEditar: tem("documentos_editar"),
    atestados: tem("atestados"),
    atestadosEditar: tem("atestados_editar"),
    ponto: tem("ponto"),
    bancoHoras: tem("banco_horas"),
    compensacoesEditar: tem("compensacoes_editar"),
    ferias: tem("ferias"),
    feriasEditar: tem("ferias_editar"),
    anamnese: tem("anamnese"),
    anamneseEditar: tem("anamnese_editar"),
    curriculos: tem("curriculos"),
    curriculosRespostas: tem("curriculos_respostas"),
    curriculosArquivo: tem("curriculos_arquivo"),
    curriculosStatus: tem("curriculos_status"),
    curriculosEditar: tem("curriculos_editar"),
    curriculosIntegracao: tem("curriculos_integracao"),
    calendario: tem("calendario"),
    calendarioEditar: tem("calendario_editar"),
    calendarioSetores: tem("calendario_setores"),
    calendarioFeriados: tem("calendario_feriados"),
    acessos: tem("acessos"),
  };
}

/** Nenhum poder — o estado de quem tem a porta e nenhuma gaveta. */
export const SEM_PODERES: PoderesRh = poderesDe([]);

/**
 * Gate de PÁGINA. Exige a área e, quando pedido, a sub-ação.
 *
 * Quem tem a área mas não a sub cai na mesma tela de "sem permissão" com a
 * chave FINA no endereço — assim a pessoa consegue pedir "me libera
 * rh:anamnese" em vez de "não consigo abrir uma aba lá".
 */
export async function requireRh(
  sub?: SubRh,
): Promise<{ profile: Profile; keys: string[]; poderes: PoderesRh }> {
  const { profile, keys } = await requireModuleKeys(CHAVE_AREA);
  if (sub && !keys.includes(chaveSub(sub))) redirect(semPermissaoDoRh(sub));
  return { profile, keys, poderes: poderesDe(keys) };
}

/**
 * Gate de API. Devolve `null` quando não pode — a rota responde 403.
 * Nunca redireciona: rota de API que redireciona vira 200 com HTML, e o
 * `r.ok` do lado do cliente lê isso como sucesso (ver a memória
 * "sessão expirada virava salvo").
 */
export async function apiRh(
  sub?: SubRh,
): Promise<{ profile: Profile; keys: string[]; poderes: PoderesRh } | null> {
  const profile = await getProfileForModule(CHAVE_AREA);
  if (!profile) return null;
  const keys = await resolveMyModuleKeys({ id: profile.id, role: profile.role, username: profile.username });
  if (sub && !keys.includes(chaveSub(sub))) return null;
  return { profile, keys, poderes: poderesDe(keys) };
}

/** Só os poderes, sem barrar — para a tela decidir o que mostrar. */
export async function meusPoderes(): Promise<PoderesRh | null> {
  const profile = await getProfile();
  if (!profile) return null;
  const keys = await resolveMyModuleKeys({ id: profile.id, role: profile.role, username: profile.username });
  if (!keys.includes(CHAVE_AREA)) return null;
  return poderesDe(keys);
}
