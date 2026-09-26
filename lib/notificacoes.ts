// Helper de notificações (server). Resiliente: se a tabela ainda não existir,
// não quebra o fluxo que disparou (mensagem/atividade/etc).
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type TipoNotif = "mensagem" | "tarefa" | "lembrete" | "solicitacao" | "sistema" | "admin";

export interface NovaNotif {
  user_id: string; tipo: TipoNotif; titulo: string;
  corpo?: string | null; link?: string | null; de_nome?: string | null;
}

// Cria uma ou várias notificações de uma vez (best-effort).
export async function notificar(notifs: NovaNotif | NovaNotif[]): Promise<void> {
  const lista = (Array.isArray(notifs) ? notifs : [notifs]).filter((n) => n.user_id && n.titulo);
  if (!lista.length) return;
  try {
    const db = createSupabaseAdminClient();
    await db.from("notificacoes").insert(lista.map((n) => ({
      user_id: n.user_id, tipo: n.tipo, titulo: n.titulo,
      corpo: n.corpo ?? null, link: n.link ?? null, de_nome: n.de_nome ?? null,
    })));
  } catch { /* tabela ausente → ignora */ }
}
