// Contas puras do widget "Gasto + imposto" (Tridify): ler o valor digitado e
// quebrar o gasto do período por BM. Sem React, pra dar pra testar.

export interface BmOpcao { chave: string; nome: string; origem: "meta" | "manual"; id?: string }
export interface GastoManualLinha { id: string; valor: number; data: string; bmChave: string; bmNome: string; descricao: string | null }
export interface DadosGastos { gastos: GastoManualLinha[]; bms: BmOpcao[]; metaPorBm: { chave: string; nome: string; gasto: number }[] }

/** Aceita "1.234,56", "1234,56" e "1234.56". */
export function lerValor(txt: string): number {
  const t = txt.replace(/[^\d,.-]/g, "");
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

// O warehouse do Meta tem só parte do gasto (ver meta-armazem-incompleto), e o
// total que manda é o do snapshot. Então a fatia de cada BM vem do warehouse,
// mas o VALOR é essa fatia aplicada ao gasto do Meta do card — a soma bate com
// o número grande, que é o que a pessoa vai conferir.
export function linhasPorBm(dados: DadosGastos, gastoMeta: number, taxa: number) {
  const somaWh = dados.metaPorBm.reduce((s, b) => s + b.gasto, 0);
  const mapa = new Map<string, { chave: string; nome: string; meta: number; manual: number }>();
  if (gastoMeta > 0) {
    if (somaWh > 0) {
      for (const b of dados.metaPorBm) mapa.set(b.chave, { chave: b.chave, nome: b.nome, meta: gastoMeta * (b.gasto / somaWh), manual: 0 });
    } else {
      mapa.set("meta:sem-bm", { chave: "meta:sem-bm", nome: "Meta (sem BM)", meta: gastoMeta, manual: 0 });
    }
  }
  for (const g of dados.gastos) {
    const e = mapa.get(g.bmChave) ?? { chave: g.bmChave, nome: g.bmNome, meta: 0, manual: 0 };
    e.manual += g.valor;
    mapa.set(g.bmChave, e);
  }
  const linhas = [...mapa.values()]
    .map((l) => ({ ...l, total: (l.meta + l.manual) * taxa }))
    .sort((a, b) => b.total - a.total);
  const manual = dados.gastos.reduce((s, g) => s + g.valor, 0);
  return { linhas, manualComImposto: manual * taxa, total: linhas.reduce((s, l) => s + l.total, 0) };
}

