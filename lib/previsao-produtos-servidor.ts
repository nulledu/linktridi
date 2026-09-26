import { cached } from "@/lib/cache";
import { classificar, fetchAllErp } from "@/lib/produtos-vendidos";
import { classificacaoDosPedidos, type PedidoClassificado } from "@/lib/trafego-vendas";
import {
  preverFaturamento, ratearUpsell, somaDiasISO, type DiaValor, type ModoProdutos, type PerfilHorario,
  type PrevisaoFaturamento, type PrevisaoProduto, type PrevisaoProdutos,
} from "@/lib/previsao-faturamento";

/**
 * Previsão de faturamento POR PRODUTO (categoria do `produtos-vendidos`), em
 * dois recortes: a empresa inteira e só o tráfego pago.
 *
 * Canal do pedido = a MESMA classificação do snapshot do Tridify
 * (`classificacaoDosPedidos`): tráfego, orgânico, comercial, marketplace ou
 * "ignorar". Pedido que o snapshot não conta (excluído, cancelado, "ignorar")
 * também não conta aqui — por isso não há filtro próprio de descartados.
 *
 * Três coisas que a soma crua do `preco` escondia:
 *  - almofada e tinta saem quase sempre SEM preço, dentro do carimbo
 *    (`item_complementar`). Por isso cada produto também tem UNIDADES, e o que
 *    sai incluso (`incluso`) mostra unidade como número principal;
 *  - o upsell do comercial é quase todo AUMENTO de tamanho (`foi_aumentado`),
 *    não item novo. O valor do upsell do pedido (total − checkout, a mesma
 *    conta do snapshot) é rateado entre os itens aumentados/acrescentados
 *    pela vendedora, pelo preço de cada um — e, sem nenhum, entre todos;
 *  - valor é o preço de TABELA dos itens: sem frete nem desconto do pedido.
 *    Compara produto com produto; não fecha com o faturamento da empresa.
 */

const HISTORICO_DIAS = 84;   // mesma janela da previsão total: reaproveita o snapshot
export const PRODUTOS_PRINCIPAIS = ["Carimbos", "Chancelas", "Sinete"];
const MODOS: ModoProdutos[] = ["geral", "trafego"];

const FMT_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function sp(d: Date) {
  const p = Object.fromEntries(FMT_SP.formatToParts(d).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) + Number(p.minute) / 60 };
}

interface Item {
  nome: string | null; nome_inteiro: string | null; preco: number | null; brinde: boolean | null;
  created_at: string | null; pedido_id: number | null; veio_yampi: boolean | null; foi_aumentado: boolean | null;
}

/** Carimbo sem hora (meia-noite em SP ou UTC cravada) — só DATA. */
function semHora(iso: string) {
  const d = new Date(Date.parse(iso));
  const m = d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return m && (d.getUTCHours() === 0 || d.getUTCHours() === 3);
}

interface Acc {
  icon: string; cor: string;
  valor: Map<string, number>; qtd: Map<string, number>; upsell: Map<string, number>; aumentos: Map<string, number>;
  horas: number[]; zerados: number; itens: number; total: number;
}
const soma = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

export function agregarItens(itens: Item[], classes: Map<number, PedidoClassificado>) {
  const porModo: Record<ModoProdutos, Map<string, Acc>> = { geral: new Map(), trafego: new Map() };
  const perfil: PerfilHorario = { util: Array(24).fill(0), fimDeSemana: Array(24).fill(0) };
  const porPedido = new Map<number, Item[]>();
  for (const it of itens) {
    if (it.brinde === true || !it.pedido_id || !(it.nome_inteiro || it.nome)) continue;
    const l = porPedido.get(Number(it.pedido_id)) ?? [];
    l.push(it); porPedido.set(Number(it.pedido_id), l);
  }
  for (const [pid, lista] of porPedido) {
    const c = classes.get(pid);
    if (!c || c.tipo === "ignorar") continue;
    const rateio = ratearUpsell(
      lista.map((i) => ({ preco: Number(i.preco) || 0, mexido: i.foi_aumentado === true || i.veio_yampi === false })),
      c.upsell,
    );
    lista.forEach((it, idx) => {
      const nome = (it.nome_inteiro || it.nome || "").trim();
      const v = Number(it.preco) || 0;
      const t = it.created_at ? sp(new Date(Date.parse(it.created_at))) : null;
      const dia = c.dia ?? t?.dia;
      if (!dia) return;
      const cat = classificar(nome);
      const hora = it.created_at && !semHora(it.created_at) && t ? Math.floor(t.hora) : null;
      for (const modo of MODOS) {
        if (modo === "trafego" && c.tipo !== "trafego") continue;
        const m = porModo[modo];
        let a = m.get(cat.categoria);
        if (!a) {
          a = { icon: cat.icon, cor: cat.cor, valor: new Map(), qtd: new Map(), upsell: new Map(), aumentos: new Map(), horas: Array(24).fill(0), zerados: 0, itens: 0, total: 0 };
          m.set(cat.categoria, a);
        }
        a.itens++; a.total += Math.max(0, v); if (v <= 0) a.zerados++;
        soma(a.qtd, dia, 1);
        if (v > 0) soma(a.valor, dia, v);
        if (rateio[idx] > 0) soma(a.upsell, dia, rateio[idx]);
        if (it.foi_aumentado === true) soma(a.aumentos, dia, 1);
        if (hora != null && v > 0) a.horas[hora] += v;
      }
      if (hora != null && v > 0) {
        const w = new Date(`${dia}T12:00:00Z`).getUTCDay();
        (w === 0 || w === 6 ? perfil.fimDeSemana : perfil.util)[hora] += v;
      }
    });
  }
  return { porModo, perfil };
}

async function carregar(de: string, ate: string) {
  const [itens, classes] = await Promise.all([
    fetchAllErp<Item>(
      "itens_pedidos",
      // Um dia de folga de cada lado: o DIA que manda é o do pedido (o mesmo do
      // faturamento), e item de pedido da virada nasce com carimbo do outro dia.
      `select=nome,nome_inteiro,preco,brinde,created_at,pedido_id,veio_yampi,foi_aumentado&created_at=gte.${somaDiasISO(de, -1)}T00:00:00-03:00&created_at=lte.${somaDiasISO(ate, 1)}T23:59:59-03:00`,
    ),
    classificacaoDosPedidos(de, ate),
  ]);
  return agregarItens(itens, classes);
}

const faixa = (p: PrevisaoFaturamento) => ({
  dia: { realizado: p.dia.realizado, previsto: p.dia.previsto, min: p.dia.min, max: p.dia.max },
  semana: { realizado: p.semana.realizado, previsto: p.semana.previsto, min: p.semana.min, max: p.semana.max },
  mes: { realizado: p.mes.realizado, previsto: p.mes.previsto, min: p.mes.min, max: p.mes.max },
});

export async function previsaoPorProduto(now = new Date()): Promise<PrevisaoProdutos> {
  const { dia: hoje, hora } = sp(now);
  const ontem = somaDiasISO(hoje, -1);
  const de = somaDiasISO(ontem, -(HISTORICO_DIAS - 1));
  const [hist, dia] = await Promise.all([
    cached(`previsao-prod:hist:${ontem}`, 30 * 60_000, () => carregar(de, ontem)),
    cached(`previsao-prod:hoje:${hoje}`, 2 * 60_000, () => carregar(hoje, hoje)),
  ]);
  const semDe = somaDiasISO(hoje, -((new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7));
  const mesDe = `${hoje.slice(0, 8)}01`;
  const entre = (h: Map<string, number> | undefined, d: Map<string, number> | undefined, desde: string) => {
    let t = d?.get(hoje) ?? 0;
    for (const [k, v] of h ?? []) if (k >= desde && k <= ontem) t += v;
    return Math.round(t);
  };

  const modos = {} as Record<ModoProdutos, PrevisaoProduto[]>;
  for (const modo of MODOS) {
    const H = hist.porModo[modo], D = dia.porModo[modo];
    const nomes = new Set([...H.keys(), ...D.keys()]);
    modos[modo] = [...nomes].map((nome) => {
      const h = H.get(nome), d = D.get(nome);
      const serieDe = (m: Map<string, number> | undefined): DiaValor[] => {
        const out: DiaValor[] = [];
        for (let x = de; x <= ontem; x = somaDiasISO(x, 1)) out.push({ d: x, v: m?.get(x) ?? 0 });
        return out;
      };
      const serie = serieDe(h?.valor);
      const base = { hoje, hora, perfil: hist.perfil, agora: now };
      const p = preverFaturamento({ ...base, serie, realizadoHoje: d?.valor.get(hoje) ?? 0, hojePorHora: d?.horas });
      const q = preverFaturamento({ ...base, serie: serieDe(h?.qtd), realizadoHoje: d?.qtd.get(hoje) ?? 0 });
      const itens = (h?.itens ?? 0) + (d?.itens ?? 0);
      const zerados = (h?.zerados ?? 0) + (d?.zerados ?? 0);
      const total = (h?.total ?? 0) + (d?.total ?? 0);
      const cab = (h ?? d)!;
      return {
        nome, icon: cab.icon, cor: cab.cor,
        principal: PRODUTOS_PRINCIPAIS.includes(nome),
        // Incluso = sai de graça dentro de outro produto: quase sempre sem
        // preço, ou com centavos simbólicos (no geral, almofada dá R$ 0,55/un).
        // Olha as 12 semanas E o mês corrente: um lote antigo vendido com preço
        // não pode esconder que hoje ela sai inclusa.
        incluso: (itens >= 20 && (zerados / itens >= 0.7 || total / itens < 3))
          || (q.mes.realizado >= 20 && p.mes.realizado / q.mes.realizado < 3),
        ...faixa(p),
        qtd: faixa(q),
        upsell: { dia: Math.round(d?.upsell.get(hoje) ?? 0), semana: entre(h?.upsell, d?.upsell, semDe), mes: entre(h?.upsell, d?.upsell, mesDe) },
        aumentos: { dia: d?.aumentos.get(hoje) ?? 0, semana: entre(h?.aumentos, d?.aumentos, semDe), mes: entre(h?.aumentos, d?.aumentos, mesDe) },
        proximos: p.proximos,
        ultimos: serie.slice(-14),
      };
    })
      // Categoria que não vendeu nada no mês nem vai vender é linha vazia.
      .filter((x) => x.principal || x.mes.previsto > 0 || x.mes.realizado > 0 || x.qtd.mes.realizado > 0)
      .sort((a, b) => b.mes.previsto - a.mes.previsto);
  }
  return { geradoEm: now.toISOString(), hoje, modos };
}
