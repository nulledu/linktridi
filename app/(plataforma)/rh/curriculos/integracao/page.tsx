import { requireRh } from "@/lib/rh/gate";
import { lerConfig, listarVagas } from "@/lib/rh/curriculos/dados";
import { IntegracaoClient } from "./IntegracaoClient";

export const dynamic = "force-dynamic";

/**
 * RH → Currículos → Candidaturas.
 *
 * UMA porta de entrada: o formulário público de candidatura (liga/desliga,
 * link solto e link por vaga). Não há integração a configurar — quem responde
 * cai direto em Currículos.
 */
const SITE_PUBLICO = "https://www.carimbostridii.com.br";

export default async function IntegracaoPage() {
  const { poderes } = await requireRh("curriculos_integracao");
  const [cfg, vagas] = await Promise.all([lerConfig(), listarVagas()]);
  // O link divulgado é SEMPRE o do site público (o formulário mora lá desde
  // 19/09/2026), nunca o domínio do Gaius em que o RH está logado.
  const base = SITE_PUBLICO;
  return <IntegracaoClient inicial={cfg.dados} vagas={vagas.dados} base={base} poderes={poderes} schemaPendente={cfg.pendente} />;
}
