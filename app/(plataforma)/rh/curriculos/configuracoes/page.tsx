import { requireRh } from "@/lib/rh/gate";
import { lerFormularioEEtapas, listarVagas } from "@/lib/rh/curriculos/dados";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

export const dynamic = "force-dynamic";

/**
 * RH → Currículos → Configurações. Quem configura o formulário é quem tem
 * `rh:curriculos_integracao` — a mesma chave do link e das vagas, e a mesma
 * que a API de gravação confere.
 */
export default async function ConfiguracoesCurriculosPage() {
  const { poderes } = await requireRh("curriculos_integracao");
  const [{ form, etapas }, vagas] = await Promise.all([lerFormularioEEtapas(), listarVagas()]);
  return (
    <ConfiguracoesClient
      inicial={form.dados.config}
      personalizado={form.dados.personalizado}
      vagas={vagas.dados}
      podeEditarVagas={poderes.curriculosEditar}
      etapasProcesso={etapas.dados}
      schemaPendente={form.pendente || vagas.pendente}
    />
  );
}
