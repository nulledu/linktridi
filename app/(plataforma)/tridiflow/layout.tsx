import { getProfile } from "@/lib/require-auth";
import { acessoBruto, resolveMyModuleKeys } from "@/lib/perfis";
import { TridiflowShell } from "./TridiflowShell";

export const dynamic = "force-dynamic";

// Layout do workspace TridiFlow: sidebar própria (some no editor). Persiste
// entre as telas do workspace (não remonta ao navegar).
export default async function TridiflowLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  // A foto sai da MESMA linha de `employees` que o `resolveMyModuleKeys` logo
  // abaixo vai ler de qualquer jeito (`acessoBruto`, cacheado): cache-hit, não
  // ida nova ao banco.
  const photoUrl = profile ? (await acessoBruto(profile.id).catch(() => null))?.photo_url ?? null : null;
  // As chaves da pessoa: a sidebar só mostra as abas que a grade liberou.
  const keys = profile
    ? await resolveMyModuleKeys({ id: profile.id, role: profile.role, username: profile.username })
    : [];

  return (
    <TridiflowShell name={profile?.name ?? "Você"} role={profile?.role ?? ""} photoUrl={photoUrl} keys={keys}>
      {children}
    </TridiflowShell>
  );
}
