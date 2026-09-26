import { requireFinanceiro } from "@/lib/financeiro/gate";
import { empresasDoUsuario, listarEmpresas } from "@/lib/financeiro/db";
import { assinarLogos } from "@/lib/financeiro/anexos";
import { acessoBruto } from "@/lib/perfis";
import { empresaEscolhida } from "./empresa";
import { SLUG_GERAL } from "./cookie";
import { FinanceiroShell } from "./FinanceiroShell";

export const dynamic = "force-dynamic";

/**
 * O gate mora AQUI e cobre `/financeiro/**` inteiro. Tela nova nasce protegida
 * sem ninguém precisar lembrar da linha — que é exatamente como uma página
 * acaba aberta para quem não deveria.
 *
 * A área é RESTRITA: nem o papel "admin" nem o card "Administrador — acesso
 * total" abrem isto (ver lib/areas.ts e lib/permissions.ts). Entra quem teve o
 * quadradinho ligado, uma pessoa por vez.
 */
export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  // Mesma ideia do `contextoFinanceiro`: a lista de empresas sai na frente do
  // gate, porque não depende de quem é a pessoa. O trilho do módulo aparece em
  // toda navegação — é a ida que mais se repete no Financeiro.
  void listarEmpresas().catch(() => null);

  const { profile, poderes } = await requireFinanceiro();
  // Tudo o que o layout precisa, numa rodada só: empresas (já com os logos
  // assinados na sequência da MESMA promessa — assinar dependia da lista e
  // ficava numa ida separada depois da rodada inteira), cookie e a foto.
  // A foto era uma ida SEPARADA, em sequência, em toda navegação. Agora sai da
  // MESMA linha de `employees` que o gate acima já leu (`acessoBruto`):
  // cache-hit, e salvar a ficha — que derruba `emp-acesso:` — troca o avatar na
  // hora, em vez de esperar os 5 min da chave própria que ninguém invalidava.
  const [{ empresas, pendente, assinados }, slug, ficha] = await Promise.all([
    empresasDoUsuario(profile.id).then(async ({ dados, pendente }) => ({
      empresas: dados, pendente,
      assinados: await assinarLogos(dados.map((e) => e.logo_url)),
    })),
    empresaEscolhida(),
    acessoBruto(profile.id).catch(() => null),   // sem foto: cai na letra do nome
  ]);
  const photoUrl = ficha?.photo_url ?? null;

  // Mesma regra do `contextoFinanceiro`: "ver geral" só existe com mais de uma
  // empresa. As duas contas precisam bater, senão o seletor mostra "Visão
  // geral" e as telas continuam mostrando uma empresa só.
  const geral = slug === SLUG_GERAL && empresas.length > 1;
  const ativa = empresas.find((e) => e.slug === slug) ?? empresas[0] ?? null;

  // O logo da empresa vive no bucket PRIVADO: o banco guarda o caminho e quem
  // assina o link é o servidor, aqui, por até uma hora. Assinar as duas de uma
  // vez porque o seletor mostra a lista inteira aberta — um link por empresa
  // abriria uma conexão por linha só para desenhar o quadradinho.
  const logos = Object.fromEntries(
    empresas
      .map((e) => [e.id, e.logo_url ? assinados.get(e.logo_url) : null] as const)
      .filter((par): par is readonly [string, string] => !!par[1]),
  );

  return (
    <FinanceiroShell
      name={profile.name}
      role={profile.role}
      photoUrl={photoUrl}
      empresas={empresas}
      empresaAtiva={geral ? null : ativa}
      logos={logos}
      geral={geral}
      poderes={poderes}
      schemaPendente={pendente}
    >
      {children}
    </FinanceiroShell>
  );
}
