// Webhooks — no TridiFlow o webhook é POR BOT: ao concluir o funil, o lead
// (respostas + UTMs) é enviado por POST pra URL configurada. Este server component
// busca o estado real (quais bots têm webhook) e entrega ao WebhooksClient, que
// tem o guia passo a passo + o testador ao vivo.
import { integracoesResumo, webhookGlobalLeads, type BotIntegracoes } from "@/lib/tridiflow-db";
import { WebhooksClient, type BotWebhook } from "./WebhooksClient";

export async function WebhooksInfo() {
  const bots = await integracoesResumo().catch(() => [] as BotIntegracoes[]);
  const lista: BotWebhook[] = bots.map((b) => ({ id: b.id, nome: b.nome, leadWebhook: b.leadWebhook }));
  return <WebhooksClient bots={lista} global={webhookGlobalLeads()} />;
}
