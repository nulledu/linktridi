import { redirect } from "next/navigation";
import { getProfile } from "@/lib/require-auth";
import { navForKeys } from "@/lib/rbac";
import { acessoBruto, resolveMyModuleKeys } from "@/lib/perfis";
import { MODULES } from "@/lib/rbac";
import { getPrefsDoShell } from "@/lib/user-prefs";
import { scriptAparenciaDaConta } from "@/lib/tema";
import { Shell } from "./Shell";

export const dynamic = "force-dynamic";

// Layout do shell: exige sessão válida e injeta a nav filtrada pelo papel.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Tema, cor e barra recolhida salvos na CONTA — a mesma escolha em qualquer
  // aparelho, numa leitura só. Sai antes do Promise.all de baixo pra correr
  // junto com ele (não vira uma segunda onda de espera) e é cacheada, com a
  // gravação derrubando o cache.
  // `undefined` = não deu pra ler ≠ conta sem nada salvo (campos `null`).
  const prefsP = getPrefsDoShell(profile.id).catch(() => undefined);

  // Acesso resolvido por Departamento ↓ Perfil ↓ Permissões (fallback p/ papel)
  // e a foto do avatar. A foto mora na MESMA linha de `employees` que decide o
  // acesso (acessoBruto, que o getProfile já disparou junto com `profiles`):
  // nenhuma ida própria ao banco, e salvar a ficha — que derruba `emp-acesso:`
  // — troca o avatar na hora, não em até 5 min.
  const [allowedKeys, ficha] = await Promise.all([
    resolveMyModuleKeys({ id: profile.id, role: profile.role, username: profile.username }),
    acessoBruto(profile.id).catch(() => null),        // sem foto
  ]);
  const photoUrl = ficha?.photo_url ?? null;
  const modules = MODULES.filter((m) => allowedKeys.includes(m.key));
  const prefs = await prefsP;

  return (
    <>
      {/* A escolha da conta aplicada ANTES do shell pintar: roda aqui, no
          meio do HTML, antes da primeira linha da interface — e só troca o
          que a cópia do aparelho tiver de mais velho (lib/tema.ts). Sem isto a
          conta só entraria depois da hidratação, com a tela já pintada. */}
      <script dangerouslySetInnerHTML={{ __html: scriptAparenciaDaConta(prefs?.aparencia ?? null) }} />
      <Shell nav={navForKeys(allowedKeys)} modules={modules} name={profile.name} role={profile.role} photoUrl={photoUrl}
        podeAvisar={allowedKeys.includes("administracao:notificacoes")}
        verStatus={allowedKeys.includes("administracao:status")}
        aparenciaNaConta={prefs === undefined ? undefined : prefs.aparencia !== null}
        railConta={prefs === undefined ? undefined : prefs.rail}>
        {children}
      </Shell>
    </>
  );
}
