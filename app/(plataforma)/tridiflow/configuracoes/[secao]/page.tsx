import { notFound } from "next/navigation";
import { requireModule } from "@/lib/require-auth";
import { DominiosClient } from "../DominiosClient";
import { RastreamentoInfo } from "../RastreamentoInfo";
import { WebhooksInfo } from "../WebhooksInfo";
import { LogsAtividades } from "../LogsAtividades";
import { EquipeClient } from "../EquipeClient";

export const dynamic = "force-dynamic";

// Só seções que EXISTEM. "Faturas" e "Planos e limites" eram cópia do SaaS de
// referência renderizando um "Em breve" — num ERP interno não há cobrança, então
// saíram do mapa (URL antiga cai no 404, que é o honesto).
const SECOES: Record<string, { titulo: string; subtitulo: string; icone: string }> = {
  dominios: { titulo: "Domínios", subtitulo: "Gerencie seus domínios e subdomínios, configure DNS e atribua a bots.", icone: "world" },
  usuarios: { titulo: "Usuários", subtitulo: "Gerencie quem acessa o workspace e suas permissões.", icone: "user-check" },
  times: { titulo: "Times", subtitulo: "Organize membros em times e defina papéis (Admin, Editor, Visualizador).", icone: "users" },
  webhooks: { titulo: "Webhooks", subtitulo: "Envie eventos do workspace para suas URLs.", icone: "plug" },
  logs: { titulo: "Logs de atividades", subtitulo: "Auditoria das ações no workspace.", icone: "history" },
  rastreamento: { titulo: "Rastreamento & Pixels", subtitulo: "Conecte e gerencie seus pixels, APIs e tags para rastrear eventos.", icone: "chart-dots" },
};

export default async function TridiflowConfigSecaoPage({ params }: { params: Promise<{ secao: string }> }) {
  await requireModule("tridiflow:configuracoes");
  const { secao } = await params;
  const cfg = SECOES[secao];
  if (!cfg) notFound();
  if (secao === "dominios") return <DominiosClient />;
  if (secao === "rastreamento") return <RastreamentoInfo />;
  if (secao === "webhooks") return <WebhooksInfo />;
  if (secao === "logs") return <LogsAtividades />;
  if (secao === "usuarios") return <EquipeClient modo="usuarios" />;
  return <EquipeClient modo="times" />;
}
