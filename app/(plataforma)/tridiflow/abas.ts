// As abas do workspace TridiFlow e a sub que cada uma exige.
//
// Fonte ÚNICA: a sidebar (TridiflowShell) monta o menu daqui e o dashboard
// escolhe daqui pra onde mandar quem não tem "projetos". Duas listas separadas
// divergiriam no primeiro item novo — e a divergência apareceria como um item
// de menu que leva direto pro 403.
// LinkTridi e a Central de Tutoriais NÃO moram aqui (set/2026): são a aba
// "Páginas" do Marketing · Geral, com rotas em /marketing/linktridi e
// /marketing/tutoriais. As chaves continuam `tridiflow:*`.
export interface AbaTF { href: string; label: string; icon: string; chave: string; exact?: boolean }

export const ABAS: AbaTF[] = [
  { href: "/tridiflow", label: "Dashboard", icon: "layout-grid", chave: "tridiflow:projetos", exact: true },
  { href: "/tridiflow/meus-bots", label: "Projetos", icon: "folder", chave: "tridiflow:projetos" },
  { href: "/tridiflow/meus-bots?tipo=flow", label: "Fluxos", icon: "message-chatbot", chave: "tridiflow:projetos" },
  { href: "/tridiflow/meus-bots?tipo=quiz", label: "Quizzes", icon: "list-numbers", chave: "tridiflow:projetos" },
  { href: "/tridiflow/meus-bots?tipo=page", label: "Páginas", icon: "file-text", chave: "tridiflow:projetos" },
  { href: "/tridiflow/templates", label: "Templates", icon: "template", chave: "tridiflow:templates" },
  { href: "/tridiflow/temas", label: "Temas", icon: "palette", chave: "tridiflow:temas" },
  { href: "/tridiflow/integracoes", label: "Integrações", icon: "plug", chave: "tridiflow:integracoes" },
  { href: "/tridiflow/contatos", label: "Contatos", icon: "users", chave: "tridiflow:contatos" },
  { href: "/tridiflow/analytics", label: "Analytics", icon: "chart-dots", chave: "tridiflow:analytics" },
];

export const CHAVE_CONFIG = "tridiflow:configuracoes";

// Primeira aba que estas chaves abrem — o destino de quem entra sem "projetos".
export function PRIMEIRA_ABA(keys: string[]): string | null {
  return ABAS.find((a) => a.href !== "/tridiflow" && keys.includes(a.chave))?.href
    ?? (keys.includes(CHAVE_CONFIG) ? "/tridiflow/configuracoes" : null);
}

// Todas as chaves do workspace — o banco de provas (/dev-*) monta a sidebar
// completa sem login, então não tem grade de permissão pra consultar.
export const TODAS_AS_CHAVES: string[] = [...new Set(ABAS.map((a) => a.chave)), CHAVE_CONFIG];
