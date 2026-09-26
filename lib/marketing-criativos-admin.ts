// Quem escolhe o editor de um criativo: admin ou superusuário. Todo o resto
// sobe no próprio nome. Separado do módulo de criativos pra página e rotas
// usarem a MESMA regra (a tela esconde o seletor; a rota é quem garante).
import { ehSuperusuario } from "@/lib/superusuario";

export function ehAdmin(p: { id: string; username?: string | null; role?: string | null }): boolean {
  return p.role === "admin" || ehSuperusuario(p.id, p.username ?? null);
}
