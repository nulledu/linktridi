import { AREAS_RESTRITAS, podeConcederArea } from "@/lib/areas";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { ehSuperusuario } from "@/lib/superusuario";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { listarEmpresas } from "@/lib/financeiro/db";
import { requireModule } from "@/lib/require-auth";
import { type ColabRow } from "../../colaboradores/ColaboradoresClient";
import { CadastroDaEquipe } from "./CadastroDaEquipe";

export const dynamic = "force-dynamic";

/**
 * TI › Permissões — o que era `/rh/gestao` (Gestão de equipe), mudado de casa
 * em 22/09/2026 a pedido do dono: gerenciar QUEM ENTRA NO SISTEMA é assunto de
 * TI, não do RH. A tela é a MESMA — o `ColaboradoresHub` com o cadastro das
 * contas, o link de primeiro acesso, a grade de permissões (a ficha com a aba
 * Acesso) e os aparelhos pareados. Não foi reescrita nem copiada.
 *
 * O que MUDOU é a porta: o gate é a área `ti`. `isAdmin` continua sendo o
 * PAPEL, e não a área: criar pessoa, resetar senha e mexer na grade distribuem
 * PODER no sistema inteiro — ter a TI não concede isso, e o servidor também
 * não deixa (CAMPOS_DE_PODER em /api/colaboradores/[id]).
 */
const SCHEMA_LEGADO = { ate: 0 };

export default async function PermissoesTiPage() {
  const db = createSupabaseAdminClient();

  const EMP_FULL = "photo_url,cargo,departamento,perfil,perfis,especialidade,escala,nivel,setor,tablet,mesa,mesas,permissoes,telefone,data_admissao,observacoes,erp_user_id";
  const EMP_LEGACY = "photo_url,cargo,departamento,perfil,perfis,nivel,setor,tablet,mesa,permissoes,telefone,data_admissao,observacoes,erp_user_id";
  const listaProfiles = async () => {
    const sel = (cols: string) => db.from("profiles")
      .select(`id,username,name,role,active,password_set,created_at,employees(${cols})`)
      .order("created_at", { ascending: true });
    // O degrau de cima é PULADO por um minuto depois de falhar: enquanto o SQL
    // não roda, tentar a coluna que não existe custa uma ida inteira em TODA
    // abertura da tela.
    if (SCHEMA_LEGADO.ate > Date.now()) return await sel(EMP_LEGACY);
    const cheio = await sel(EMP_FULL);
    if (!cheio.error) return cheio;
    SCHEMA_LEGADO.ate = Date.now() + 60_000;
    return await sel(EMP_LEGACY);
  };

  // A restrição por empresa do Financeiro mora em `fin_acessos` — tabela do
  // módulo Financeiro. Ausência de linha = sem restrição = vê todas.
  const restricoesFinanceiro = async (): Promise<Record<string, string[]>> => {
    try {
      const { data } = await db.from("fin_acessos").select("user_id,empresa_id").limit(2000);
      const mapa: Record<string, string[]> = {};
      for (const a of (data ?? []) as { user_id: string; empresa_id: string }[]) {
        (mapa[a.user_id] ??= []).push(a.empresa_id);
      }
      return mapa;
    } catch {
      return {};
    }
  };

  // As três leituras não dependem de QUEM é a pessoa — saem na frente enquanto
  // o gate resolve. Nada vaza: se o gate reprovar, ninguém usa o resultado.
  const dadosP = Promise.all([
    listaProfiles(),
    listarEmpresas().catch(() => ({ dados: [], pendente: true })),
    restricoesFinanceiro(),
  ]).catch(() => [{ data: [] }, { dados: [], pendente: true }, {}] as const);

  const me = await requireModule("ti");
  const isAdmin = me.role === "admin";
  const minhasChaves = await resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username });
  const areasQueConcedo = AREAS_RESTRITAS
    .filter((a) => podeConcederArea(a.key, minhasChaves, ehSuperusuario(me.id, me.username)))
    .map((a) => a.key);

  const equipe = dadosP.then(([profilesRes, empresasFinanceiro, restricoesFin]) => ({
    colaboradores: (profilesRes.data ?? []) as ColabRow[],
    empresasFinanceiro: empresasFinanceiro.dados.map((e) => ({ id: e.id, nome: e.nome })),
    restricoesFinanceiro: restricoesFin as Record<string, string[]>,
  }));

  return (
    <CadastroDaEquipe
      meId={me.id}
      isAdmin={isAdmin}
      areasQueConcedo={areasQueConcedo}
      equipe={equipe}
    />
  );
}
