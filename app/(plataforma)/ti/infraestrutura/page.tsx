import { requireModule } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { DadosDaEquipe } from "../../colaboradores/GestaoDeEquipe";
import type { ColabRow } from "../../colaboradores/ColaboradoresClient";
import { InfraHub } from "../../infraestrutura/InfraHub";

export const dynamic = "force-dynamic";

// ── TI › Infra (Acessos & Infra) ─────────────────────────────────────────────
// A tela de /infraestrutura, mudada de casa em 22/09/2026: Acessos & Infra
// virou uma subárea da TI — um item só na barra. O GATE NÃO MUDOU: a página
// continua abrindo pela área `infraestrutura`, e o Cofre pela sub
// `infraestrutura:cofre` — ninguém ganhou nem perdeu acesso na mudança; quem
// só tem Infra entra na TI direto por aqui.
export default async function InfraNaTiPage() {
  const db = createSupabaseAdminClient();
  // A lista de pessoas serve o seletor de responsável e o Cofre. Só o que as
  // duas telas usam (nome, foto, cargo) — nada do embed pesado de Pessoas.
  const pessoasP = db.from("profiles")
    .select("id,username,name,role,active,password_set,created_at,employees(photo_url,cargo)")
    .order("name", { ascending: true })
    .limit(500);

  const me = await requireModule("infraestrutura");
  const minhasChaves = await resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username });
  const podeCofre = minhasChaves.includes("infraestrutura:cofre");

  // O CofreAcessos espera a MESMA promessa de Pessoas (`use()` atrás do
  // Suspense do dynamic). Os campos do Financeiro não existem aqui — o cofre
  // não os usa; são exigência do tipo compartilhado com a Gestão de equipe.
  const equipe: Promise<DadosDaEquipe> = Promise.resolve(pessoasP).then((r) => ({
    colaboradores: ((r.data ?? []) as unknown) as ColabRow[],
    empresasFinanceiro: [],
    restricoesFinanceiro: {},
  }));

  return <InfraHub podeCofre={podeCofre} equipe={equipe} />;
}
