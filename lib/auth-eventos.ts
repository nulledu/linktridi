import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ehAcessoDeFora } from "@/lib/geo-acesso";

// Registro de acesso — quem entrou, quando, de onde (supabase/auth_eventos.sql).
//
// REGRA DE OURO: gravar aqui NUNCA pode impedir alguém de entrar. A tabela pode
// não existir (SQL não rodado), o banco pode estar lento, a coluna pode mudar —
// e nada disso é motivo pra alguém não conseguir trabalhar. Por isso tudo aqui é
// best-effort e engole o próprio erro.

export type EventoAuth =
  | "login_ok"
  | "login_falha"
  | "primeiro_acesso"
  | "senha_trocada"
  | "bloqueado_geo"
  | "bloqueado_freio";

export interface RegistroAuth {
  evento: EventoAuth;
  perfilId?: string | null;
  identificador?: string | null;
  ip?: string | null;
  pais?: string | null;
  userAgent?: string | null;
}

/**
 * Grava o evento. Não lança, não espera — quem chama não precisa de `await`
 * para responder ao usuário (mas pode dar, se quiser o registro garantido).
 */
export async function registrarEventoAuth(r: RegistroAuth): Promise<void> {
  try {
    const db = createSupabaseAdminClient();
    await db.from("auth_eventos").insert({
      evento: r.evento,
      perfil_id: r.perfilId ?? null,
      // O identificador é o que a pessoa DIGITOU — cortado, porque num ataque
      // isso é entrada não confiável e não vale encher a tabela com lixo.
      identificador: r.identificador ? r.identificador.slice(0, 120) : null,
      ip: r.ip ?? null,
      pais: r.pais ?? null,
      user_agent: r.userAgent ? r.userAgent.slice(0, 300) : null,
      de_fora: ehAcessoDeFora(r.pais ?? null),
    });
  } catch { /* tabela ausente / banco indisponível → segue sem registrar */ }
}
