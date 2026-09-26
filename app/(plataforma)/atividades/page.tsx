import { requireModuleKeys } from "@/lib/require-auth";
import { colaboradoresDeTodosOsSetores, listAtividades, listCanceladas } from "@/lib/atividades";
import { poderesDeAtividades } from "@/lib/atividades-acesso";
import { listItensDaVisao, modelosDaVisao } from "@/lib/atividades-visao-servidor";
import { presencaAgora } from "@/lib/ponto";
import { listRecusadas } from "@/lib/atividades-recusadas";
import { AtividadesShell } from "./AtividadesShell";

export const dynamic = "force-dynamic";

// Porta da área Atividades (Operacional). Antes abria pelo CARGO; agora pela
// chave da área, a mesma régua das rotas (lib/atividades-acesso.ts). As três
// chaves descem pra tela esconder o que a pessoa não pode — a rota recusaria.
export default async function AtividadesPage() {
  const { profile: me, keys } = await requireModuleKeys("atividades");
  const pode = poderesDeAtividades(keys, me.role);
  const [colaboradores, atividades, canceladas, modelos, visao, recusadas] = await Promise.all([
    colaboradoresDeTodosOsSetores(),
    listAtividades(),
    // A coluna Cancelada do Histórico: elas ficam fora das listas de trabalho.
    listCanceladas().catch(() => []),
    modelosDaVisao().catch(() => []),
    listItensDaVisao().catch(() => ({ itens: [], personalizado: false, grupos: [], configPronta: true })),
    // Fila de recusadas no tablet: só quem libera a recusa (atividades:autorizar).
    pode.autorizar ? listRecusadas().catch(() => []) : Promise.resolve([]),
  ]);
  // Quem está na empresa agora (ponto): pinta a bolinha de cada pessoa na
  // Visão geral. Tolerante: sem o ponto ninguém fica vermelho — todo mundo
  // conta como presente, como no envio de atividade.
  const pres = await presencaAgora(colaboradores.map((c) => c.id)).catch(() => null);
  const presenca = pres ? { registrados: [...pres.registrados], presentes: [...pres.presentes] } : null;
  return (
    <AtividadesShell
      pode={pode} colaboradores={colaboradores} initial={atividades} canceladas={canceladas}
      modelos={modelos} itensVisao={visao.itens} personalizado={visao.personalizado} grupos={visao.grupos}
      configPronta={visao.configPronta} presenca={presenca} recusadas={recusadas}
    />
  );
}
