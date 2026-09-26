// ── Quem pode o quê em Atividades ────────────────────────────────────────────
//
// A régua ÚNICA: a página, cada rota de /api/atividades*, os modelos de
// produção e o quadro embutido em Pessoas perguntam aqui. É a trava da nota de
// paridade (MEMORY: "RBAC page/API gate parity") — a página abrir por uma
// regra e a API recusar por outra foi exatamente como Atividades ficou presa a
// Pessoas: a tela abria pelo cargo, as rotas pela área `colaboradores`.
//
// Três níveis (lib/areas.ts): ver, atribuir, configurar. O papel `admin`
// atravessa, como no resto do sistema.
import { papelOuChave } from "@/lib/acesso";

export type NivelAtividades = "ver" | "atribuir" | "configurar" | "autorizar";
type Quem = Parameters<typeof papelOuChave>[0];

export function podeAtividades(me: Quem, nivel: NivelAtividades): Promise<boolean> {
  return papelOuChave(me, ["admin"], `atividades:${nivel}`);
}

/** Os três de uma vez, a partir das chaves já resolvidas (página/servidor). */
export function poderesDeAtividades(chaves: readonly string[], role: string): Record<NivelAtividades, boolean> {
  const admin = role === "admin";
  return {
    ver: admin || chaves.includes("atividades:ver"),
    atribuir: admin || chaves.includes("atividades:atribuir"),
    configurar: admin || chaves.includes("atividades:configurar"),
    autorizar: admin || chaves.includes("atividades:autorizar"),
  };
}
