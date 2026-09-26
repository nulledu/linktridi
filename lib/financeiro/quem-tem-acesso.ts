import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { AREAS, chavesDasAreas } from "@/lib/areas";
import { ehSuperusuario } from "@/lib/superusuario";
import { listarEmpresas } from "./db";

/**
 * Quem entra no Financeiro — e com o quê.
 *
 * É LEITURA. Quem concede continua sendo a grade de Pessoas › Gestão de equipe
 * (o dono pediu isso, e a Configuração não pode virar uma segunda porta de
 * permissão). Mas a pergunta "quem consegue ver a folha hoje?" precisava de
 * resposta sem abrir a ficha de cada pessoa — e é aqui que ela mora.
 *
 * A resolução é a MESMA de `resolveMyModuleKeys`: `chavesDasAreas` sobre a
 * grade, com o `implica` valendo. Calcular de outro jeito aqui daria uma lista
 * que discorda do que a pessoa realmente consegue abrir.
 */

export interface PessoaComAcesso {
  id: string;
  nome: string;
  username: string | null;
  /** Rótulos legíveis das subs do Financeiro que ela resolve. */
  subs: string[];
  /** `true` para quem é superusuário: entra pela lista fixa do código. */
  superusuario: boolean;
  /** Nomes das empresas liberadas em `fin_acessos`; vazio = todas. */
  empresas: string[];
}

const ROTULO_DA_SUB: Record<string, string> = Object.fromEntries(
  (AREAS.find((a) => a.key === "financeiro")?.subs ?? []).map((s) => [`financeiro:${s.key}`, s.label]),
);

export async function quemTemAcesso(): Promise<PessoaComAcesso[]> {
  const db = createSupabaseAdminClient();
  try {
    const [{ data: perfis }, { data: fichas }, { data: acessos }, empresas] = await Promise.all([
      db.from("profiles").select("id,name,username").eq("active", true).limit(500),
      db.from("employees").select("id,permissoes").limit(500),
      db.from("fin_acessos").select("user_id,empresa_id").limit(500),
      listarEmpresas({ todas: true }),
    ]);

    const grade = new Map(
      ((fichas ?? []) as { id: string; permissoes: Record<string, boolean> | null }[])
        .map((f) => [f.id, f.permissoes]),
    );
    const nomeDaEmpresa = new Map(empresas.dados.map((e) => [e.id, e.nome]));
    const empresasDe = new Map<string, string[]>();
    for (const a of (acessos ?? []) as { user_id: string; empresa_id: string }[]) {
      const lista = empresasDe.get(a.user_id) ?? [];
      const nome = nomeDaEmpresa.get(a.empresa_id);
      if (nome) lista.push(nome);
      empresasDe.set(a.user_id, lista);
    }

    const saida: PessoaComAcesso[] = [];
    for (const p of (perfis ?? []) as { id: string; name: string | null; username: string | null }[]) {
      const chaves = chavesDasAreas(grade.get(p.id) ?? null).filter((k) => k.startsWith("financeiro"));
      const superusuario = ehSuperusuario(p.id, p.username);
      // O superusuário tem a porta e a governança mesmo sem grade; o resto das
      // chaves dele vem da grade como qualquer pessoa (CHAVES_SO_POR_CONCESSAO).
      if (!chaves.length && !superusuario) continue;
      const subs = chaves
        .filter((k) => k !== "financeiro")
        .map((k) => ROTULO_DA_SUB[k] ?? k.replace("financeiro:", ""));
      saida.push({
        id: p.id,
        nome: (p.name ?? "").trim() || p.username || "Sem nome",
        username: p.username,
        subs: [...new Set(subs)].sort((a, b) => a.localeCompare(b, "pt-BR")),
        superusuario,
        empresas: empresasDe.get(p.id) ?? [],
      });
    }
    return saida.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  } catch {
    // Tabela ausente (fin_acessos antes do SQL) ou falha de leitura: a tela
    // mostra o card vazio com o aviso, e o resto das Configurações abre normal.
    return [];
  }
}
