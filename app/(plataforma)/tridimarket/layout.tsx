import { requireModule } from "@/lib/require-auth";
import { acessoBruto } from "@/lib/perfis";
import { TridiMarketShell } from "./TridiMarketShell";

export const dynamic = "force-dynamic";

// Gate IDÊNTICO ao de requireMarketAdmin() nas rotas /api/tridimarket/*: a
// área RESTRITA "tridimarket", e só ela. Divergir aqui produz o clássico "a
// página abre e a API devolve 403" — a tela carrega vazia e ninguém entende.
//
// O papel NÃO entra na conta de propósito: ser admin do sistema não abre o
// mercadinho (ver lib/areas.ts → restrita), e exigir admin aqui impediria
// liberar o mercadinho pra quem cuida dele sem ser admin de tudo.
export default async function TridiMarketLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireModule("tridimarket");
  // A foto sai da MESMA linha de `employees` que o gate acima já leu
  // (`acessoBruto`): cache-hit, não ida nova ao banco.
  const photoUrl = profile ? (await acessoBruto(profile.id).catch(() => null))?.photo_url ?? null : null;
  return (
    <TridiMarketShell name={profile?.name ?? "Você"} role={profile?.role ?? ""} photoUrl={photoUrl}>
      {children}
    </TridiMarketShell>
  );
}
