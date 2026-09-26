import { hojeISO } from "@/lib/financeiro/calculos";
import { requireRh } from "@/lib/rh/gate";
import { lerConfig, lerEtapas, listarCandidatos } from "@/lib/rh/curriculos/dados";
import { CurriculosClient } from "./CurriculosClient";

export const dynamic = "force-dynamic";

/**
 * RH → Currículos — o painel de candidatos.
 *
 * A lista inteira desce pronta (teto de 600, só as colunas do resumo — nada
 * de resposta nem arquivo). O resumo da triagem (`perfil`) e o link do
 * currículo só vêm pra quem tem a gaveta de cada um. Filtrar, trocar de
 * visão e mover no Kanban é local; o perfil é rota própria.
 */
export default async function CurriculosPage() {
  const { poderes } = await requireRh("curriculos");
  const [{ dados, pendente }, cfg, etapas] = await Promise.all([
    listarCandidatos({ comPerfil: poderes.curriculosRespostas, comArquivo: poderes.curriculosArquivo }),
    lerConfig(),
    lerEtapas(),
  ]);

  return (
    <CurriculosClient
      lista={dados.lista}
      vagas={dados.vagas}
      etapas={etapas.dados}
      saturou={dados.saturou}
      hoje={hojeISO()}
      poderes={poderes}
      integracao={cfg.dados}
      schemaPendente={pendente || cfg.pendente || etapas.pendente}
    />
  );
}
