// Fonte única de RBAC: papéis, módulos e quem acessa o quê.

export type Role =
  | "admin"
  | "gerente_producao"
  | "gerente_vendas"
  | "estoquista"
  | "colaborador";

export const ROLES: Role[] = [
  "admin",
  "gerente_producao",
  "gerente_vendas",
  "estoquista",
  "colaborador",
];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  gerente_producao: "Gerente de Produção",
  gerente_vendas: "Gerente de Vendas",
  estoquista: "Estoquista",
  colaborador: "Colaborador",
};

// ── 5 NÍVEIS DE ACESSO ──────────────────────────────────────────────
// Nível 5 = mais poder (vê tudo, inclusive custos/financeiro). Nível 1 = chão de fábrica.
// Cada papel é um nível. Conforme entrar mais gente com outros cargos, mapeie o
// cargo para o papel mais próximo aqui — nada de permissão solta espalhada pelo código.
export const ROLE_LEVEL: Record<Role, number> = {
  admin: 5,
  gerente_vendas: 4,
  gerente_producao: 4,
  estoquista: 3,
  colaborador: 2,
  // (nível 1 fica reservado para dispositivos/quiosque-tablet, sem painel)
};

export const ROLE_DESC: Record<Role, string> = {
  admin: "Acesso total. Único que vê CUSTOS e financeiro. Cria colaboradores e configura tudo.",
  gerente_vendas: "Gestão de Vendas/Analytics e colaboradores. Vê faturamento, NÃO vê custo de itens.",
  gerente_producao: "Gestão de Produção, Design, Logística, Estoque e colaboradores. NÃO vê custo.",
  estoquista: "Gerencia o Estoque (quantidades/itens). NÃO vê custo dos itens.",
  colaborador: "Operacional: registra as próprias vendas/atividades. Vê só o que é dele.",
};

// Custo dos itens de estoque é confidencial: só o nível máximo (admin) enxerga.
export function canSeeCusto(role: Role): boolean {
  return role === "admin";
}

// Cada módulo do shell: chave (= segmento da rota), rótulo e papéis com acesso.
export interface ModuleDef {
  key: string;
  label: string;
  href: string;
  icon: string; // nome do ícone (Tabler) usado na sidebar
  roles: Role[];
  ready: boolean; // false = placeholder "em breve"
}

export const MODULES: ModuleDef[] = [
  { key: "central", label: "Central", href: "/central", icon: "layout-grid", roles: ["admin", "gerente_producao", "gerente_vendas", "estoquista", "colaborador"], ready: true },
  { key: "analytics", label: "Analytics", href: "/analytics", icon: "chart-line", roles: ["admin", "gerente_producao", "gerente_vendas"], ready: true },
  { key: "producao", label: "Produção", href: "/producao", icon: "tools", roles: ["admin", "gerente_producao"], ready: true },
  { key: "design", label: "Design", href: "/design", icon: "palette", roles: ["admin", "gerente_producao"], ready: true },
  { key: "logistica", label: "Logística", href: "/logistica", icon: "truck", roles: ["admin", "gerente_producao"], ready: true },
  { key: "estoque", label: "Estoque", href: "/estoque", icon: "building-warehouse", roles: ["admin", "estoquista", "gerente_producao"], ready: true },
  // 3D — biblioteca dos arquivos que rodam nas impressoras 3D (MVP). A área
  // vai crescer pra máquinas, programações e kanban de produção; a chave `3d`
  // já é a porta de tudo isso. `roles: ["admin"]` é só o fallback legado —
  // quem manda é o quadradinho `3d` da grade (lib/areas.ts).
  { key: "3d", label: "3D", href: "/3d", icon: "box", roles: ["admin"], ready: true },
  // Área própria desde 11/09 (antes abria só pelo cargo ou por Pessoas). Ver lib/areas.ts.
  { key: "atividades", label: "Atividades", href: "/atividades", icon: "checklist", roles: ["admin", "gerente_producao", "gerente_vendas"], ready: true },
  // RH — a porta de Recursos Humanos. Área RESTRITA: `roles: []` de propósito,
  // igual ao Financeiro. Nenhum papel abre isto, nem admin; quem manda é a
  // chave "rh" da grade, ligada pessoa a pessoa pelo superusuário.
  { key: "rh", label: "RH", href: "/rh", icon: "id-badge", roles: [], ready: true },
  // Pessoas foi absorvida pelo RH (set/2026). O módulo continua existindo
  // porque a chave `colaboradores` ainda gateia o ponto, os dispositivos e o
  // CRUD do colaborador (ver `pessoasDoRh` em lib/areas.ts), e porque
  // `/colaboradores` segue de pé como atalho — mas ele agora REDIRECIONA para
  // `/rh/colaboradores`. Fica em MODULOS_DISCRETOS para não anunciar duas
  // portas para a mesma tela: a barra, o ⌘K e a barra do celular mostram só RH.
  { key: "colaboradores", label: "Pessoas", href: "/colaboradores", icon: "users", roles: ["admin", "gerente_producao", "gerente_vendas"], ready: true },
  // Acessos & Infra — domínios, hospedagens, VPS e o cofre de senhas. A área
  // abre pela chave "infraestrutura" da grade (lib/areas.ts); `roles` é só o
  // fallback legado por papel. As abas Cofre e E-mails lá dentro exigem a sub
  // `infraestrutura:cofre` — a área sozinha (domínios/hospedagens) não a concede.
  // Desde 22/09/2026 a tela mora DENTRO da TI (/ti/infraestrutura) e o item
  // próprio saiu da barra (ver NAV_HIDDEN): a porta visível é "TI". A chave e
  // o gate não mudaram — este registro existe pro ⌘K e pro fallback por papel.
  { key: "infraestrutura", label: "Acessos & Infra", href: "/ti/infraestrutura", icon: "key", roles: ["admin"], ready: true },
  { key: "comercial", label: "Comercial", href: "/comercial", icon: "trending-up", roles: ["admin", "gerente_vendas", "colaborador"], ready: true },
  // Marketing · Geral — painel do setor de marketing (produção de criativos +
  // resultado do orgânico). É a primeira aba de dentro de Marketing.
  { key: "marketing", label: "Geral", href: "/marketing", icon: "speakerphone", roles: ["admin", "gerente_vendas"], ready: true },
  // Contingência — item PRÓPRIO na barra, e não só a aba de dentro do Marketing.
  // A chave saiu de `marketing:aquecimento` e virou área (lib/areas.ts): quem
  // recebe só a Contingência não tem o Marketing, então sem esta porta ficaria
  // com a permissão ligada e nenhum jeito de chegar na tela. A rota continua a
  // mesma — a aba de dentro do Marketing e este item abrem o mesmo componente.
  { key: "contingencia", label: "Contingência", href: "/marketing/contingencia", icon: "shield-check", roles: ["admin", "gerente_vendas"], ready: true },
  // Criador de LOJAS: cria loja como o TridiFlow cria fluxo e página — cada
  // loja tem produtos, pedidos e endereço próprios. Fica em Vendas (e não em
  // Marketing) porque é ferramenta de VENDER, não de anunciar.
  { key: "lojas", label: "Lojas", href: "/lojas", icon: "shopping-bag", roles: ["admin"], ready: true },
  { key: "trafego", label: "Tridify", href: "/trafego", icon: "activity", roles: ["admin"], ready: true },
  { key: "tridiflow", label: "TridiFlow", href: "/tridiflow", icon: "message-chatbot", roles: ["admin"], ready: true },
  // Workspace do mercadinho. Área PRÓPRIA e RESTRITA (saiu de dentro de
  // Configurações): `roles` aqui é só o fallback legado por papel — quem manda
  // é a chave "tridimarket" da grade, que NÃO vem junto com "acesso total".
  // Ver lib/areas.ts (restrita) e lib/permissions.ts (PERMISSOES_DE_ADMIN).
  { key: "tridimarket", label: "TridiMarket", href: "/tridimarket", icon: "shopping-bag", roles: [], ready: true },
  // Financeiro (Tridi + Gedux). Área RESTRITA e DISCRETA — `roles: []` de
  // propósito: nenhum papel abre isto, nem admin. Quem manda é a chave
  // "financeiro" da grade, ligada pessoa a pessoa. Ver lib/areas.ts.
  { key: "financeiro", label: "Financeiro", href: "/financeiro", icon: "wallet", roles: [], ready: true },
  // TI — projetos de tecnologia e roadmaps. `roles: ["admin"]` é só o
  // fallback legado por papel; quem manda é a chave `ti` da grade.
  { key: "ti", label: "TI", href: "/ti", icon: "device-laptop", roles: ["admin"], ready: true },
  { key: "minhas-atividades", label: "Minhas atividades", href: "/minhas-atividades", icon: "checklist", roles: ["admin", "gerente_producao", "gerente_vendas", "estoquista", "colaborador"], ready: true },
  // A Frota SAIU da barra lateral: virou uma aba dentro de Configurações, ao
  // lado do editor das telas. Eram duas portas para a mesma pergunta ("o que
  // aparece naquela TV?") — numa se desenhava a tela, na outra se mandava a TV
  // abri-la, e ninguém lembrava que a segunda existia. A chave `frota`
  // continua valendo na grade de permissões; o que sumiu é o item de menu.
  { key: "administracao", label: "Configurações", href: "/administracao", icon: "settings", roles: ["admin"], ready: true },
];

// Módulos visíveis para um papel.
export function modulesFor(role: Role): ModuleDef[] {
  return MODULES.filter((m) => m.roles.includes(role));
}

// ── Navegação por ÁREAS DA EMPRESA (organização, não muda telas/rotas) ──
// Home · Analytics · Operações(Produção/Design/Logística/Estoque) · Comercial · Pessoas.
export type NavItem =
  | { type: "module"; module: ModuleDef }
  | {
      type: "group"; key: string; label: string; icon: string; children: ModuleDef[];
      /** Filho que é HUB: um item só na barra, cujas áreas viram abas no topo
       *  das telas (`OperacaoAbas`). `modulo` é o próprio item; `areas`, as abas. */
      hub?: { modulo: ModuleDef; areas: ModuleDef[] };
    };

// Grupos: chave do grupo → módulos que ele agrega (na ordem desejada).
/**
 * UM NÍVEL SÓ. Marketing era um grupo DENTRO de Vendas, o que punha TridiChat e
 * Tráfego a três cliques — e são telas que quem atende e quem anuncia abre o dia
 * inteiro, enquanto Analytics (uma vez por semana) ficava a um clique. A
 * profundidade estava invertida em relação ao uso.
 *
 * Agora são grupos IRMÃOS: um por time. Cada um abre com um clique, e como a
 * barra é acordeão (abrir um fecha o outro), somar um grupo não faz a barra
 * crescer — ela tem no máximo a altura do maior grupo aberto.
 */
/**
 * `hub`: o grupo NÃO abre lista na barra — vira um item só, que leva à Visão
 * geral da área, e a navegação entre os filhos mora numa fileira de abas no
 * topo das telas (`OperacaoAbas`). Operação (set/2026) é o primeiro: Estoque →
 * Produção → Atividades → Logística é UM fluxo, não quatro sistemas. Design e
 * 3D saíram do grupo porque têm fluxo próprio (criar; fabricar digitalmente).
 */
export const OPERACAO_HUB = "/operacao/geral";
export const OPERACAO_FILHOS = ["atividades", "producao", "estoque", "logistica"] as const;

const NAV_GROUPS: { key: string; label: string; icon: string; children: string[]; hub?: { label: string; icon: string; href: string; areas: readonly string[] } }[] = [
  // Operacional abre em: Operação (hub com as quatro áreas em abas) → 3D → Design.
  { key: "operacoes", label: "Operacional", icon: "tools", children: ["3d", "design"],
    hub: { label: "Operação", icon: "settings", href: OPERACAO_HUB, areas: OPERACAO_FILHOS } },
  { key: "vendas",    label: "Vendas",      icon: "trending-up",  children: ["comercial", "lojas"] },
  { key: "marketing-grp", label: "Marketing", icon: "speakerphone", children: ["marketing", "contingencia", "trafego", "tridiflow"] },
  // Gestão (set/2026): os números e a administração da empresa — telas de
  // gestor, abertas poucas vezes por semana. Soltas, eram quatro linhas fixas
  // na barra; juntas, uma só.
  { key: "gestao",    label: "Gestão",      icon: "chart-pie",    children: ["analytics", "financeiro", "rh", "ti", "administracao"] },
];

/**
 * O item da barra está ativo? Casa pelo href MAIS LONGO que prefixa a rota:
 * "Geral" (/marketing) e "Contingência" (/marketing/contingencia) acendiam
 * juntos, porque /marketing/contingencia também começa com /marketing.
 */
export function rotaAtiva(pathname: string, href: string): boolean {
  if (pathname !== href && !pathname.startsWith(href + "/")) return false;
  return !MODULES.some((m) =>
    m.href.length > href.length && (pathname === m.href || pathname.startsWith(m.href + "/")),
  );
}
// Sidebar FIXA — nunca cresce. Tudo novo entra aninhado.
// "minhas-atividades" saiu da SIDEBAR de propósito (a Central de Trabalho em
// /central/tarefas cobre; a rota continua viva e linkada de lá) — o módulo/gate
// permanece válido, só não aparece no menu.
// A ordem conta uma história: o seu dia (Central) → a gestão (Analytics,
// Financeiro, RH…) → o trabalho por time (Operacional, Vendas, Marketing) → a
// empresa (Pessoas, TridiMarket) → o sistema (Configurações).
const NAV_ORDER = [
  "central", "gestao",
  "operacoes", "vendas", "marketing-grp",
  "tridimarket",
];

export function navFor(role: Role): NavItem[] {
  return navFromModules(modulesFor(role));
}

// Navegação a partir de um conjunto de chaves já resolvido (Fase 2 — permissões por perfil).
export function navForKeys(keys: string[]): NavItem[] {
  const set = new Set(keys);
  // A TI absorveu Acessos & Infra na NAVEGAÇÃO: quem só tem `infraestrutura`
  // precisa do item "TI" na barra pra chegar em /ti/infraestrutura. É alias de
  // MENU, não de permissão — dentro da TI cada subárea segue a própria chave,
  // e as APIs de roadmap continuam devolvendo 403 pra quem só tem Infra.
  if (set.has("infraestrutura")) set.add("ti");
  return navFromModules(MODULES.filter((m) => set.has(m.key)));
}

/**
 * Módulos DISCRETOS: não aparecem em menu nenhum — nem sidebar, nem barra do
 * celular, nem na busca do ⌘K. Entra-se digitando o endereço.
 *
 * É DISCRIÇÃO, não segurança: o gate continua sendo a chave da área (ver
 * `lib/areas.ts`, `critica`), então saber o endereço não abre nada — quem não
 * tem a área leva 403 digitando certo. O que isto evita é ANUNCIAR a área para
 * quem passa pela tela.
 *
 * Separado do `NAV_HIDDEN` de propósito: lá o motivo é "outra tela já cobre"
 * (Minhas atividades vive dentro da Central de Trabalho), e essas continuam
 * achaveis pela busca. Misturar os dois faria o ⌘K perder uma tela que devia
 * continuar lá.
 */
// O Financeiro SAIU daqui. Ele nasceu discreto pela ideia de que "área secreta
// não se anuncia" — mas discrição só protege de quem passa pela tela por acaso,
// e quem tem a chave não passa por acaso: usa a tela todo dia. O efeito real foi
// o dono não achar a própria tela e precisar digitar o endereço.
//
// Esconder não era a segurança: a segurança é a área RESTRITA (lib/areas.ts).
// Quem não tem a chave continua sem ver o item e levando 403 se digitar o
// endereço certo. Quem tem, agora encontra.
// O TridiMarket CONTINUA discreto: é decisão de produto do dono ("entra
// digitando /tridimarket, e ponto"), guardada em lib/__tests__/rbac.test.ts.
// O Financeiro saiu daqui por pedido explícito — ver o comentário acima do
// NAV_ORDER. Um não arrasta o outro.
//
// `colaboradores` entrou por um motivo diferente dos dois: não é discrição, é
// que a porta MUDOU. Pessoas virou RH, `/colaboradores` só redireciona, e um
// item "Pessoas" ao lado de "RH" anunciaria duas áreas onde existe uma — com a
// piada de que a de baixo leva à de cima. Discreto e não desativado porque o
// endereço velho precisa continuar respondendo: ele está em link de tarefa, em
// resultado de busca e na memória de quem usa o sistema há meses.
export const MODULOS_DISCRETOS = new Set(["tridimarket", "colaboradores"]);

// Módulos DESATIVADOS: nem sidebar, nem ⌘K, nem barra do celular, nem a URL
// (o layout da rota chama `notFound()`). Diferente de discreto — aqui não dá
// pra entrar nem digitando o endereço. Vazio hoje: o TridiChat, único que
// passou por aqui, saiu do código em 22/09/26.
export const MODULOS_DESATIVADOS = new Set<string>([]);

// Módulos VÁLIDOS mas fora da SIDEBAR — inclui os discretos e os que outra tela
// já cobre.
// `infraestrutura` está aqui porque OUTRA TELA cobre: Acessos & Infra virou
// subárea da TI (um item só na barra, pedido do dono em 22/09/2026). Continua
// achável no ⌘K e o endereço velho redireciona.
const NAV_HIDDEN = new Set(["minhas-atividades", "infraestrutura", ...MODULOS_DISCRETOS, ...MODULOS_DESATIVADOS]);

function navFromModules(all: ModuleDef[]): NavItem[] {
  const mods = all.filter((m) => !NAV_HIDDEN.has(m.key));
  const byKey = new Map(mods.map((m) => [m.key, m]));
  const grupoDe = new Map<string, string>();
  for (const g of NAV_GROUPS) {
    for (const c of [...g.children, ...(g.hub?.areas ?? [])]) grupoDe.set(c, g.key);
  }

  const out: NavItem[] = [];
  for (const key of NAV_ORDER) {
    const g = NAV_GROUPS.find((x) => x.key === key);
    if (g) {
      let children = g.children.map((c) => byKey.get(c)).filter(Boolean) as ModuleDef[];
      let hub: { modulo: ModuleDef; areas: ModuleDef[] } | undefined;
      if (g.hub) {
        const areas = g.hub.areas.map((c) => byKey.get(c)).filter(Boolean) as ModuleDef[];
        if (areas.length) {
          const modulo: ModuleDef = { key: `${g.key}-hub`, label: g.hub.label, href: g.hub.href, icon: g.hub.icon, roles: [], ready: true };
          hub = { modulo, areas };
          children = [modulo, ...children];
        }
      }
      // Grupo sem nenhum filho visível não vira uma seta que abre o vazio.
      if (children.length) out.push({ type: "group", key: g.key, label: g.label, icon: g.icon, children, ...(hub ? { hub } : {}) });
      continue;
    }
    const m = byKey.get(key);
    if (m && !grupoDe.has(m.key)) out.push({ type: "module", module: m });
  }
  // Qualquer módulo novo não listado no NAV_ORDER entra solto no fim (não some).
  for (const m of mods) {
    if (grupoDe.has(m.key)) continue;
    if (!out.some((i) => i.type === "module" && i.module.key === m.key) && !NAV_ORDER.includes(m.key)) {
      out.push({ type: "module", module: m });
    }
  }
  return out;
}

// O papel pode acessar o módulo de chave `key`?
export function canAccess(role: Role, key: string): boolean {
  const m = MODULES.find((x) => x.key === key);
  return !!m && m.roles.includes(role);
}

// Página inicial natural de cada papel (1º módulo permitido).
export function homeFor(role: Role): string {
  const mods = modulesFor(role);
  return mods.length ? mods[0].href : "/inicio";
}

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}
