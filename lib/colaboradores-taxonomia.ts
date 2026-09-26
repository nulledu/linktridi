// Taxonomia de RH do GAIUS: Departamento → Perfil.
// Substitui o campo livre "Cargo". O Perfil é o nível de responsabilidade
// dentro do departamento — e, no futuro, a fonte de herança de permissões.

export const DEPARTAMENTOS = [
  "Diretor",
  "Produção",
  "Design",
  "Logística",
  "Estoque",
  "Financeiro",
  "Marketing",
  "Tráfego",
  "Comercial",
  "Pós Venda",
  "Atendimento ao Cliente",
  "Desenvolvimento",
  "Configurações",
] as const;
export type Departamento = (typeof DEPARTAMENTOS)[number];

// Perfis (níveis) por departamento — ajustados à realidade da Tridi.
// Produção não tem Líder. Design tem só Designer (gerência é da Produção).
// Estoque/Logística operacionais; a gestão é da Produção (ver DEFAULT_TEMPLATES).
// Uma pessoa pode ter VÁRIAS funções no mesmo departamento.
export const PERFIS: Record<Departamento, string[]> = {
  "Diretor": ["Diretor", "Sócio"],
  "Produção": ["Operador", "Supervisor", "Gerente"],
  "Design": ["Aprovação de arte", "Vetor", "Contorno"],
  "Logística": ["Operador", "Supervisor", "Gerente"],
  "Estoque": ["Estoquista", "Supervisor", "Gerente"],
  "Financeiro": ["Assistente", "Analista", "Supervisor", "Gerente"],
  "Marketing": ["Gestor de tráfego", "Vendas", "Edição de vídeo", "Social Media", "Designer", "Gestor"],
  "Tráfego": ["Gestor de tráfego", "Analista"],
  "Comercial": ["Líder", "Gerente", "Vendedora"],
  "Pós Venda": ["Atendente", "Analista", "Supervisor"],
  "Atendimento ao Cliente": ["Atendente", "Analista", "Supervisor"],
  "Desenvolvimento": ["Dev", "Líder técnico", "Gerente"],
  "Configurações": ["Operador", "Administrador"],
};

export function perfisDe(dep: string | null | undefined): string[] {
  return dep && dep in PERFIS ? PERFIS[dep as Departamento] : [];
}

// ── TEMPLATES PADRÃO (Departamento·Perfil → módulos liberados) ──
// Base "fora da caixa", antes de qualquer config manual em Pessoas → Perfis.
// Reflete a gestão cruzada: a Produção administra Design, Logística e Estoque.
// (home e minhas-atividades são sempre liberados; não precisam aparecer aqui.)
export const DEFAULT_TEMPLATES: Record<string, Record<string, string[]>> = {
  "Produção": {
    "Operador": ["producao"],
    // Supervisor/Gerente da Produção gerenciam Design, Logística e Estoque.
    "Supervisor": ["producao", "design", "logistica", "estoque", "analytics"],
    "Gerente": ["producao", "design", "logistica", "estoque", "analytics", "colaboradores"],
  },
  "Design": { "Designer": ["design"] },
  "Logística": {
    "Operador": ["logistica"],
    "Supervisor": ["logistica", "producao"],
    "Gerente": ["logistica", "producao", "analytics"],
  },
  "Estoque": {
    "Estoquista": ["estoque"],
    "Supervisor": ["estoque", "producao"],
    "Gerente": ["estoque", "producao", "analytics"],
  },
  // Financeiro é personalizado: só vê o setor Financeiro no Analytics.
  "Financeiro": {
    "Assistente": ["analytics", "set:financeiro"],
    "Analista": ["analytics", "set:financeiro"],
    "Supervisor": ["analytics", "set:financeiro"],
    "Gerente": ["analytics", "set:financeiro", "colaboradores"],
  },
  // Marketing só vê o setor Marketing (visão isolada).
  "Marketing": {
    "Tráfego": ["analytics", "set:marketing"],
    "Social Media": ["analytics", "set:marketing"],
    "Designer": ["analytics", "set:marketing", "design"],
    "Gerente": ["analytics", "set:marketing", "set:comercial", "colaboradores"],
  },
  // Tráfego: gestor de tráfego enxerga o módulo Tráfego Pago + Analytics do setor.
  "Tráfego": {
    "Gestor de tráfego": ["trafego", "analytics", "set:marketing"],
    "Analista": ["trafego", "analytics", "set:marketing"],
  },
  // Comercial gerencia o próprio setor (+ marketplace/vendedoras p/ gestão).
  "Comercial": {
    "Vendedor": ["comercial", "analytics", "set:comercial"],
    "Closer": ["comercial", "analytics", "set:comercial"],
    "Supervisor": ["comercial", "analytics", "set:comercial", "set:vendedoras", "set:marketplace"],
    "Gerente": ["comercial", "analytics", "set:comercial", "set:vendedoras", "set:marketplace", "set:marketing", "colaboradores"],
  },
  // Desenvolvimento faz parte da Produção e ao mesmo tempo não: vê Produção + Analytics.
  "Desenvolvimento": {
    "Dev": ["producao", "analytics"],
    "Líder técnico": ["producao", "analytics", "design"],
    "Gerente": ["producao", "design", "logistica", "estoque", "analytics", "colaboradores"],
  },
};

// Módulos padrão de um (departamento, perfil) — ou null se não houver default.
export function defaultTemplate(dep: string | null | undefined, perfil: string | null | undefined): string[] | null {
  if (!dep || !perfil) return null;
  return DEFAULT_TEMPLATES[dep]?.[perfil] ?? null;
}

// Mapa Departamento → "setor" legado (usado pela atribuição de atividades).
// Mantém a engrenagem de atividades funcionando enquanto a UI usa Departamento.
const DEP_SETOR: Record<Departamento, string> = {
  "Diretor": "Administrativo",
  "Produção": "Produção",
  "Design": "Produção",
  "Logística": "Produção",
  "Estoque": "Estoque",
  "Financeiro": "Administrativo",
  "Marketing": "Vendas",
  "Tráfego": "Vendas",
  "Comercial": "Vendas",
  "Pós Venda": "Vendas",
  "Atendimento ao Cliente": "Vendas",
  "Desenvolvimento": "Administrativo",
  "Configurações": "Administrativo",
};
export function setorDoDepartamento(dep: string | null | undefined): string | null {
  return dep && dep in DEP_SETOR ? DEP_SETOR[dep as Departamento] : null;
}

// Inverso (best-effort): infere o Departamento a partir do `setor` quando o
// departamento não está preenchido. Usado p/ resolver nível de acesso.
export function departamentoDoSetor(setor: string | null | undefined): Departamento | null {
  const s = (setor || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!s) return null;
  if (s.includes("trafeg") || s.includes("trafic") || s.includes("ads")) return "Tráfego";
  if (s.includes("vend") || s.includes("comercial")) return "Comercial";
  if (s.includes("market") || s.includes("social")) return "Marketing";
  if (s.includes("financ")) return "Financeiro";
  if (s.includes("produ") || s.includes("design") || s.includes("logist") || s.includes("arte")) return "Produção";
  if (s.includes("estoq")) return "Estoque";
  return null;
}

// Quais grupos de métricas fazem sentido por departamento (a aba Métricas muda sozinha).
export function metricasDoDepartamento(dep: string | null | undefined): string[] {
  switch (dep) {
    case "Produção": return ["Pedidos", "Tempo médio", "Retrabalho"];
    case "Marketing": return ["ROAS", "CPA", "Leads"];
    case "Tráfego": return ["ROAS", "CPA", "CTR", "Leads"];
    case "Comercial": return ["Conversão", "Ticket", "Pedidos"];
    case "Estoque": return ["Itens movimentados", "Rupturas", "Acuracidade"];
    case "Logística": return ["Enviados", "Prazo médio", "Atrasos"];
    default: return ["Atividades", "Conclusão", "Pendências"];
  }
}
