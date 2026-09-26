// Receita de produção (fixa, v1) — chancela e clichê. Client-safe: sem deps de
// servidor, pode ser importada no browser (preview) e na API (fonte única).
// A partir de uma meta (padrão 30), gera as ordens de atividade que caem no pool
// "Produção". `fase` vira o campo `ordem` da atividade (menor = mais cedo).

export type ProdutoProducao =
  | "chancela" | "cliche" | "insumos" | "carimbo" | "almofada" | "tintas" | "manutencao" | "decorativos";   // chaves ASCII (evita bug de acento)
export const PRODUTOS: ProdutoProducao[] = ["chancela", "cliche", "insumos", "carimbo", "almofada", "tintas", "manutencao", "decorativos"];
export const LABEL_PRODUTO: Record<ProdutoProducao, string> = {
  chancela: "Chancela", cliche: "Clichê", insumos: "Insumos", carimbo: "Carimbos",
  almofada: "Almofadas", tintas: "Tintas", manutencao: "Manutenção", decorativos: "Decorativos",
};
export const META_PADRAO = 30;
export const SETOR_PRODUCAO = "Produção";
// Tempo estimado padrão de QUALQUER atividade gerada (min). Era 60 fixo no meio
// da rota; virou constante pra ter um lugar só pra mudar.
export const TEMPO_PADRAO_MIN = 40;

// Insumo é FOLHA: de uma chapa saem várias peças, então a quantidade não
// acompanha 1-pra-1 a meta. 0,1 = 1 chapa a cada 10 unidades (meta 30 → 3
// chapas). Ajustável aqui e, na prática, em "Editar ordens" (o banco manda).
export const CHAPAS_POR_UNIDADE = 0.1;
const chapas = (meta: number) => Math.max(1, Math.round(meta * CHAPAS_POR_UNIDADE));

export interface EtapaReceita {
  fase: number;                         // 1 = mais cedo; ordena o pool
  categoria: string;                    // "Chancela" | "Clichê"
  tarefa: string;
  detalhe: (meta: number) => string;
  porMeta: number;                      // quantidade_alvo = meta × porMeta
  controlaQtd?: boolean;                // false = meta só de referência (ex.: cruzinhas)
}

export const RECEITAS: Record<ProdutoProducao, EtapaReceita[]> = {
  chancela: [
    { fase: 1, categoria: "Chancela", tarefa: "Limpar folhas de alavanca", porMeta: 5, detalhe: (m) => `${m * 5} folhas — suficiente p/ ${m} alavancas` },
    { fase: 1, categoria: "Chancela", tarefa: "Limpar bolinhas", porMeta: 2, detalhe: (m) => `${m} chatas + ${m} retas (${m * 2}) → ${m} chancelas` },
    { fase: 1, categoria: "Chancela", tarefa: "Limpar laterais", porMeta: 2, detalhe: (m) => `${m} esquerdas + ${m} direitas (${m * 2}) — travas não contam` },
    { fase: 2, categoria: "Chancela", tarefa: "Montar alavancas", porMeta: 1, detalhe: (m) => `Colar/montar ${m} alavancas` },
    { fase: 2, categoria: "Chancela", tarefa: "Montar estruturas laterais + travas", porMeta: 1, detalhe: (m) => `${m}× (1 lado esq + 1 lado dir + travas)` },
    { fase: 3, categoria: "Chancela", tarefa: "Montar base da chancela", porMeta: 1, detalhe: (m) => `${m}× — estrutura + alavanca + bolinhas + parafuso` },
    { fase: 4, categoria: "Chancela", tarefa: "Colar PS nas bases", porMeta: 1, detalhe: (m) => `Colar o PS nas ${m} bases — finaliza a chancela` },
  ],
  cliche: [
    { fase: 1, categoria: "Clichê", tarefa: "Limpar laminados 6 mm", porMeta: 3, detalhe: (m) => `${m} de cima + ${m} de baixo + ${m} da 3ª peça; agrupar em caixas; +1 peça 3 mm (sem limpeza) por conjunto` },
    { fase: 1, categoria: "Clichê", tarefa: "Limpar cruzinhas", porMeta: 1, controlaQtd: false, detalhe: (m) => `Quantidade não controlada (referência: ${m})` },
    { fase: 2, categoria: "Clichê", tarefa: "Montar clichês", porMeta: 1, detalhe: (m) => `Montar ${m} clichês com as peças separadas` },
  ],

  // ── Pools novas ────────────────────────────────────────────────────────────
  // As FASES abaixo são a ordem lógica do processo (o que precisa estar pronto
  // antes). As quantidades usam porMeta 1 = "meta unidades de cada" — é o palpite
  // seguro: quem souber a proporção real ajusta em "Editar ordens" (as receitas
  // aqui são só a SEMENTE; a partir da 1ª edição vale o que está no banco).

  // Preparo de chapa/EVA/PS que alimenta carimbo, chancela e almofada.
  //
  // QUANTIDADE: aqui a conta NÃO é 1 por unidade — de UMA chapa saem muitas
  // peças. Usamos 1 chapa a cada 10 unidades (CHAPAS_POR_UNIDADE), então a meta
  // padrão de 30 pede ~3 chapas. Pedir 30 chapas pra 30 carimbos encheria a
  // bancada de chapa pintada à toa.
  insumos: [
    { fase: 1, categoria: "Insumos", tarefa: "Pintar chapa 3 mm MDF (2 faces)", porMeta: CHAPAS_POR_UNIDADE, detalhe: (m) => `${chapas(m)} chapa(s) de 3 mm, pintadas dos dois lados — p/ ${m} unidades` },
    { fase: 1, categoria: "Insumos", tarefa: "Pintar chapa 6 mm MDF (2 faces)", porMeta: CHAPAS_POR_UNIDADE, detalhe: (m) => `${chapas(m)} chapa(s) de 6 mm, pintadas dos dois lados — p/ ${m} unidades` },
    { fase: 1, categoria: "Insumos", tarefa: "Preparar folha de EVA com feltro (cola silicone)", porMeta: CHAPAS_POR_UNIDADE, detalhe: (m) => `${chapas(m)} folha(s) de EVA com o feltro colado — p/ ${m} unidades` },
    { fase: 2, categoria: "Insumos", tarefa: "Colar dupla face FRACA na chapa 3 mm (MDF)", porMeta: CHAPAS_POR_UNIDADE, detalhe: (m) => `${chapas(m)} chapa(s) de 3 mm — dupla face FRACA` },
    { fase: 2, categoria: "Insumos", tarefa: "Preparar chapa 6 mm LAMINADA com dupla face forte em tiras (1 lado)", porMeta: CHAPAS_POR_UNIDADE, detalhe: (m) => `${chapas(m)} chapa(s) laminada(s) — dupla face FORTE em tiras, um lado só` },
    { fase: 2, categoria: "Insumos", tarefa: "Colar dupla face forte em tiras no lado fosco do PS", porMeta: CHAPAS_POR_UNIDADE, detalhe: (m) => `${chapas(m)} PS — dupla face FORTE em tiras, no lado FOSCO` },
    { fase: 3, categoria: "Insumos", tarefa: "Colar EVA na chapa 3 mm (já com dupla face)", porMeta: CHAPAS_POR_UNIDADE, detalhe: (m) => `${chapas(m)} chapa(s) de 3 mm que já têm dupla face` },
  ],

  carimbo: [
    { fase: 1, categoria: "Carimbos", tarefa: "Montar puxadores (fêmea, macho e círculo)", porMeta: 1, detalhe: (m) => `Montar ${m} puxadores (fêmea + macho + círculo)` },
  ],

  // Um item por TAMANHO: os componentes do estoque são por medida (acolchoado,
  // fundo, lateral costa/frente/rolamento em 6, 11, 16 e 22).
  almofada: [
    { fase: 1, categoria: "Almofadas", tarefa: "Montar estrutura da almofada 6", porMeta: 1, detalhe: (m) => `${m} estruturas tamanho 6` },
    { fase: 1, categoria: "Almofadas", tarefa: "Montar estrutura da almofada 11", porMeta: 1, detalhe: (m) => `${m} estruturas tamanho 11` },
    { fase: 1, categoria: "Almofadas", tarefa: "Montar estrutura da almofada 16", porMeta: 1, detalhe: (m) => `${m} estruturas tamanho 16` },
    { fase: 1, categoria: "Almofadas", tarefa: "Montar estrutura da almofada 22", porMeta: 1, detalhe: (m) => `${m} estruturas tamanho 22` },
  ],

  // Envase — a cor padrão é PRETA; outras cores entram como ordem avulsa.
  tintas: [
    { fase: 1, categoria: "Envase de tintas", tarefa: "Envasar tinta plástica (padrão preta)", porMeta: 1, detalhe: (m) => `${m} unidades — tinta plástica preta` },
    { fase: 1, categoria: "Envase de tintas", tarefa: "Envasar tinta de papel (padrão preta)", porMeta: 1, detalhe: (m) => `${m} unidades — tinta de papel preta` },
    { fase: 1, categoria: "Envase de tintas", tarefa: "Envasar tinta de isopor (padrão preta)", porMeta: 1, detalhe: (m) => `${m} unidades — tinta de isopor preta` },
  ],

  // Manutenção é CHECKLIST de horário, não produção: a meta não controla
  // quantidade (controlaQtd false). As fases seguem a ordem do dia.
  manutencao: [
    { fase: 1, categoria: "Manutenção", tarefa: "Trocar fitas do bico (máquinas MDF) — 07:00", porMeta: 1, controlaQtd: false, detalhe: () => "Primeira troca do dia" },
    { fase: 1, categoria: "Manutenção", tarefa: "Limpar lentes (máquinas MDF + borracha) — 07:00", porMeta: 1, controlaQtd: false, detalhe: () => "Inclui a lente da máquina de borracha" },
    { fase: 2, categoria: "Manutenção", tarefa: "Trocar fitas do bico (máquinas MDF) — 09:30", porMeta: 1, controlaQtd: false, detalhe: () => "Segunda troca da manhã" },
    { fase: 3, categoria: "Manutenção", tarefa: "Trocar fitas do bico (máquinas MDF) — 12:30", porMeta: 1, controlaQtd: false, detalhe: () => "Primeira troca da tarde" },
    { fase: 3, categoria: "Manutenção", tarefa: "Limpar lentes (máquinas MDF + borracha) — 12:30", porMeta: 1, controlaQtd: false, detalhe: () => "Inclui a lente da máquina de borracha" },
    { fase: 4, categoria: "Manutenção", tarefa: "Trocar fitas do bico (máquinas MDF) — 15:00", porMeta: 1, controlaQtd: false, detalhe: () => "Última troca do dia" },
  ],

  decorativos: [
    { fase: 1, categoria: "Atividades complementares", tarefa: "Montar decorativos", porMeta: 1, detalhe: (m) => `Montar ${m} decorativos` },
  ],
};

export interface OrdemGerada {
  fase: number;
  categoria: string;
  tarefa: string;
  detalhe: string;
  quantidade_alvo: number;
  controlaQtd: boolean;
}

export function ehProduto(x: unknown): x is ProdutoProducao {
  return typeof x === "string" && (PRODUTOS as string[]).includes(x);
}

// Gera as ordens (puro). Preserva a ordem dos produtos; a `fase` ordena o pool.
export function gerarOrdens(produtos: ProdutoProducao[], meta: number): OrdemGerada[] {
  const m = Math.round(meta);
  const out: OrdemGerada[] = [];
  for (const p of produtos) {
    for (const e of RECEITAS[p]) {
      out.push({
        fase: e.fase,
        categoria: e.categoria,
        tarefa: e.tarefa,
        detalhe: e.detalhe(m),
        // ARREDONDA: `porMeta` pode ser fracionário (insumos usam 0,1 = 1 chapa a
        // cada 10 unidades) e 0.1 × 30 dá 3.0000000000000004 em ponto flutuante —
        // isso ia parar em quantidade_alvo e aparecer quebrado na tela.
        quantidade_alvo: Math.max(1, Math.round(e.porMeta * m)),
        controlaQtd: e.controlaQtd !== false,
      });
    }
  }
  return out;
}
