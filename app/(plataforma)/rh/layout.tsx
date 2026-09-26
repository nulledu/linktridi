import { cached } from "@/lib/cache";
import { acessoBruto } from "@/lib/perfis";
import { requireRh } from "@/lib/rh/gate";
import { contarNaoVistos } from "@/lib/rh/curriculos/dados";
import { RhShell } from "./RhShell";

export const dynamic = "force-dynamic";

/**
 * O gate mora AQUI e cobre `/rh/**` inteiro. Tela nova nasce protegida sem
 * ninguém precisar lembrar da linha — que é exatamente como uma página acaba
 * aberta para quem não deveria.
 *
 * A área é RESTRITA: nem o papel "admin" nem o card "Administrador — acesso
 * total" abrem isto (ver lib/areas.ts e lib/permissions.ts). Entra quem teve o
 * quadradinho ligado pelo superusuário, uma pessoa por vez.
 *
 * O gate pede só a ÁREA, não a sub: cada página confere a sua. Exigir
 * `rh:ver` aqui trancaria do lado de fora quem tem só o Calendário — e a tela
 * de sem-permissão citaria a chave errada.
 */
export default async function RhLayout({ children }: { children: React.ReactNode }) {
  const { profile, poderes } = await requireRh();

  // A foto era uma ida SEPARADA, em sequência, em toda navegação. Agora sai da
  // MESMA linha de `employees` que o gate acima já leu (`acessoBruto`):
  // cache-hit, e salvar a ficha — que derruba `emp-acesso:` — troca o avatar na
  // hora, em vez de esperar os 5 min da chave própria que ninguém invalidava.
  const photoUrl = (await acessoBruto(profile.id).catch(() => null))?.photo_url ?? null;   // sem foto: cai na letra do nome

  // O "Currículos · 8" do menu. Uma contagem `head: true` (corpo vazio),
  // guardada 60 s no processo: navegar entre as telas do RH não repete a ida,
  // e abrir um perfil zera o número na próxima navegação — que é quando a
  // pessoa olha pro menu de novo. Sem poll.
  const curriculosNovos = poderes.curriculos
    ? await cached("rh:curriculos:novos", 60_000, contarNaoVistos)
    : 0;

  return (
    <RhShell name={profile.name} role={profile.role} photoUrl={photoUrl} poderes={poderes} curriculosNovos={curriculosNovos}>
      {children}
    </RhShell>
  );
}
