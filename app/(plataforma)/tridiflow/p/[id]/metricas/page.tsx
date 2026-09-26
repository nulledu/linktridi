import { notFound } from "next/navigation";
import { requireModule } from "@/lib/require-auth";
import { getBot } from "@/lib/tridiflow-db";
import { MetricasPaginaClient } from "./MetricasPaginaClient";

export const dynamic = "force-dynamic";

export default async function MetricasPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("tridiflow:projetos");
  const { id } = await params;
  const bot = await getBot(id).catch(() => null);
  if (!bot || bot.tipo !== "page") notFound();
  return <MetricasPaginaClient id={bot.id} nome={bot.nome} slug={bot.slug} host={bot.dominioHost} />;
}
