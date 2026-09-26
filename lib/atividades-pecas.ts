// Peças que cada atividade CONSOME — e quem produz cada uma.
//
// PRA QUE SERVE
//   Quando alguém devolve uma ordem, o motivo "Falta material" não diz nada:
//   o gestor não sabe QUAL peça faltou e, pior, ninguém faz a peça — então a
//   próxima pessoa que pegar a mesma ordem trava exatamente no mesmo ponto.
//   Aqui a tarefa vira uma lista de peças concretas. O tablet mostra
//   "Faltou: chapa 3 mm pintada" e o servidor sabe qual ordem despachar.
//
// FONTE DA SEMENTE (por que estes pares e não outros)
//   Não inventei a cadeia: ela já estava em lib/producao-receita.ts. O campo
//   `fase` de cada etapa É a dependência ("o que precisa estar pronto antes"),
//   e o `detalhe` nomeia a peça. "Colar EVA na chapa 3 mm (já com dupla face)"
//   é fase 3 e diz "chapa(s) de 3 mm que já têm dupla face" — logo consome o
//   que a fase 2 ("Colar dupla face FRACA na chapa 3 mm") produz.
//
//   Onde a receita NÃO deixa claro, deixei de fora de propósito: um mapa
//   chutado é pior que mapa vazio — manda fazer peça errada. O que falta se
//   cadastra na tela (tabela atividade_pecas), que VENCE esta semente.
//
// `produz` ausente = ninguém produz aqui dentro (parafuso, borracha, feltro,
// EVA cru vêm de compra). Nesse caso a falta é só registrada, sem despachar
// ordem nenhuma — despachar "comprar parafuso" pra bancada não ajudaria.

export interface PecaDaTarefa {
  /** Rótulo do botão no tablet. */
  peca: string;
  /** Tarefa que produz esta peça. Ausente = vem de fora (compra/estoque). */
  produz?: string;
  /** Categoria da tarefa que produz — usada ao criar a ordem. */
  categoria?: string;
}

/** Motivo que NÃO é peça: a ordem vai pra fila de recusadas como as outras. */
export const MOTIVO_OUTRO = "Outro";

/** Motivos genéricos, sempre oferecidos depois das peças. */
export const MOTIVOS_GERAIS = [
  "Máquina parada / com defeito",
  "Peça com defeito",
  "Não sei fazer esta tarefa",
  "Preciso sair / fim do turno",
];

const INSUMOS = "Insumos";
const CHANCELA = "Chancela";
const CLICHE = "Clichê";
const CARIMBOS = "Carimbos";

export const PECAS_PADRAO: Record<string, PecaDaTarefa[]> = {
  // ── Insumos: a cadeia chapa crua → pintada → com dupla face → com EVA ──
  "Pintar chapa 3 mm MDF (2 faces)": [
    { peca: "Chapa 3 mm crua" },
    { peca: "Tinta" },
  ],
  "Pintar chapa 6 mm MDF (2 faces)": [
    { peca: "Chapa 6 mm crua" },
    { peca: "Tinta" },
  ],
  "Preparar folha de EVA com feltro (cola silicone)": [
    { peca: "Folha de EVA" },
    { peca: "Feltro" },
    { peca: "Cola silicone" },
  ],
  "Colar dupla face FRACA na chapa 3 mm (MDF)": [
    { peca: "Chapa 3 mm pintada", produz: "Pintar chapa 3 mm MDF (2 faces)", categoria: INSUMOS },
    { peca: "Dupla face fraca" },
  ],
  "Preparar chapa 6 mm LAMINADA com dupla face forte em tiras (1 lado)": [
    { peca: "Chapa 6 mm pintada", produz: "Pintar chapa 6 mm MDF (2 faces)", categoria: INSUMOS },
    { peca: "Dupla face forte" },
  ],
  "Colar dupla face forte em tiras no lado fosco do PS": [
    { peca: "PS" },
    { peca: "Dupla face forte" },
  ],
  "Colar EVA na chapa 3 mm (já com dupla face)": [
    { peca: "Chapa 3 mm com dupla face", produz: "Colar dupla face FRACA na chapa 3 mm (MDF)", categoria: INSUMOS },
    { peca: "Folha de EVA com feltro", produz: "Preparar folha de EVA com feltro (cola silicone)", categoria: INSUMOS },
  ],

  // ── Chancela: limpeza (fase 1) alimenta montagem (fases 2-4) ──
  "Montar alavancas": [
    { peca: "Folhas de alavanca limpas", produz: "Limpar folhas de alavanca", categoria: CHANCELA },
  ],
  "Montar estruturas laterais + travas": [
    { peca: "Laterais limpas", produz: "Limpar laterais", categoria: CHANCELA },
    { peca: "Travas" },
  ],
  "Montar base da chancela": [
    { peca: "Estrutura lateral montada", produz: "Montar estruturas laterais + travas", categoria: CHANCELA },
    { peca: "Alavanca montada", produz: "Montar alavancas", categoria: CHANCELA },
    { peca: "Bolinhas limpas", produz: "Limpar bolinhas", categoria: CHANCELA },
    { peca: "Parafuso" },
  ],
  "Colar PS nas bases": [
    { peca: "Base da chancela", produz: "Montar base da chancela", categoria: CHANCELA },
    { peca: "PS com dupla face", produz: "Colar dupla face forte em tiras no lado fosco do PS", categoria: INSUMOS },
  ],

  // ── Clichê ──
  "Montar clichês": [
    { peca: "Laminados 6 mm limpos", produz: "Limpar laminados 6 mm", categoria: CLICHE },
    { peca: "Cruzinhas limpas", produz: "Limpar cruzinhas", categoria: CLICHE },
    { peca: "Peça 3 mm" },
  ],

  // ── Carimbos ──
  "Montar puxadores (fêmea, macho e círculo)": [
    { peca: "Fêmea" },
    { peca: "Macho" },
    { peca: "Círculo" },
  ],
  "Colar as borrachas no MDF de 3 mm": [
    { peca: "Borrachas lavadas", produz: "Lavar as borrachas com detergente e água", categoria: CARIMBOS },
    { peca: "MDF 3 mm" },
  ],
  "Colar MDF de 3 mm no MDF de 6 mm com cola bonder": [
    { peca: "MDF 3 mm com borracha", produz: "Colar as borrachas no MDF de 3 mm", categoria: CARIMBOS },
    { peca: "MDF 6 mm" },
    { peca: "Cola bonder" },
  ],
  "Colar puxador no MDF de 6 mm com cola bonder": [
    { peca: "Puxador montado", produz: "Montar puxadores (fêmea, macho e círculo)", categoria: CARIMBOS },
    { peca: "MDF 6 mm" },
    { peca: "Cola bonder" },
  ],
};

/** Linha da tabela `atividade_pecas` (configuração do gestor). */
export interface PecaConfigRow {
  setor: string | null;
  tarefa: string;
  peca: string;
  tarefa_produz: string | null;
  categoria_produz: string | null;
}

// A configuração VENCE a semente por TAREFA inteira, não peça a peça: se o
// gestor cadastrou as peças de "Montar clichês", ele viu a lista e decidiu — e
// misturar a semente de volta reintroduziria justamente o que ele tirou.
export function pecasDaTarefa(tarefa: string, config: PecaConfigRow[] = []): PecaDaTarefa[] {
  const t = (tarefa || "").trim();
  if (!t) return [];
  const doBanco = config.filter((c) => (c.tarefa || "").trim() === t);
  if (doBanco.length) {
    return doBanco.map((c) => ({
      peca: c.peca,
      produz: c.tarefa_produz || undefined,
      categoria: c.categoria_produz || undefined,
    }));
  }
  return PECAS_PADRAO[t] ?? [];
}

/** Agrupa a config por tarefa — pro pull montar o payload de várias de uma vez. */
export function mapaDePecas(config: PecaConfigRow[], tarefas: string[]): Record<string, PecaDaTarefa[]> {
  const out: Record<string, PecaDaTarefa[]> = {};
  for (const t of new Set(tarefas.map((x) => (x || "").trim()).filter(Boolean))) {
    const p = pecasDaTarefa(t, config);
    if (p.length) out[t] = p;
  }
  return out;
}
