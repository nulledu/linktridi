import { cache } from "react";
import { requireFinanceiro, type PoderesFinanceiro, type SubFinanceiro } from "@/lib/financeiro/gate";
import { empresasDoUsuario, listarEmpresas, resolverEmpresa } from "@/lib/financeiro/db";
import { getAuthedUser } from "@/lib/require-auth";
import { empresaEscolhida, SLUG_GERAL } from "./empresa";
import type { Empresa } from "@/lib/financeiro/tipos";
import type { Profile } from "@/lib/require-auth";

export interface ContextoFinanceiro {
  profile: Profile;
  poderes: PoderesFinanceiro;
  /** A empresa aberta — `null` em "ver geral", que não é uma empresa. */
  empresa: Empresa | null;
  empresas: Empresa[];
  /** As empresas que esta tela LÊ: uma, ou todas em "ver geral". */
  escopo: string[];
  /** "Ver geral" está ligado: a tela soma as empresas e não deixa cadastrar. */
  geral: boolean;
  pendente: boolean;
}

/**
 * O que toda página do Financeiro precisa saber antes de desenhar: quem é,
 * o que pode, e em qual empresa está.
 *
 * A empresa é resolvida CONTRA A LISTA DA PESSOA (ver `empresasDoUsuario`), não
 * contra o cookie: um cookie editado com o slug da outra empresa cai no
 * fallback da primeira permitida, e não abre nada que não fosse dela.
 */
export const contextoFinanceiro = cache(async (sub?: SubFinanceiro): Promise<ContextoFinanceiro> => {
  // A lista de empresas não depende de QUEM é a pessoa — só o filtro de acesso
  // depende. Disparada aqui, ela viaja em paralelo com o gate (sessão + grade
  // de áreas) em vez de depois dele: numa instância fria isso é uma ida
  // inteira de 250–700 ms fora do caminho crítico, em TODA tela do módulo.
  // Sem `await` de propósito — quem consome é o `resolverEmpresa` abaixo, que
  // recebe a MESMA promessa pelo cache de processo (e pelo `cache()` do React).
  void listarEmpresas().catch(() => null);
  // Idem para o filtro de acesso (`fin_acessos`): ele só precisa do id, e o id
  // sai do JWT verificado localmente — não precisa esperar o gate inteiro
  // (profiles + employees) pra começar a viajar. Era a última ida em fila do
  // custo fixo de toda tela do módulo.
  void getAuthedUser().then((u) => (u ? empresasDoUsuario(u.id) : null)).catch(() => null);

  const { profile, poderes } = await requireFinanceiro(sub);
  const slug = await empresaEscolhida();
  const { empresa, empresas, pendente } = await resolverEmpresa(profile.id, slug);

  // "Ver geral" só existe com mais de uma empresa liberada: com uma só, ele
  // mostraria exatamente a mesma tela com outro nome — e uma opção que não muda
  // nada é uma opção que faz a pessoa procurar a diferença.
  const geral = slug === SLUG_GERAL && empresas.length > 1;

  return {
    profile, poderes, empresas, pendente,
    // Em geral a empresa é `null` de propósito: quem cadastra precisa dizer EM
    // QUAL empresa, e deixar a primeira aqui faria o botão gravar na Tridi
    // enquanto a tela diz "geral". Silencioso é o pior desfecho possível.
    empresa: geral ? null : empresa,
    geral,
    escopo: geral ? empresas.map((e) => e.id) : empresa ? [empresa.id] : [],
  };
});
// `cache()` do React no export: a Visão Geral chama isto duas vezes (sem sub e
// com "ver") e layout + página também repetem — cada chamada refazia gate +
// resolução inteiros. Memoizado por request e por argumento, vira uma só.
