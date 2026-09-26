"use client";

// ── Widgets do painel da Yampi dentro da Tridify ─────────────────────────────
// Pedido do dono (23/09/2026): os cards do painel da própria Yampi — Vendas,
// Receita, Ticket médio, Pix, Recorrentes, Parcelamentos, Formas de pagamento,
// Top estados, Top produtos — como widgets da Tridify, MARCADOS como Yampi.
//
// Duas diferenças de propósito em relação ao painel da Yampi:
// 1. VALOR É SÓ PRODUTO. A Yampi soma juros de parcelamento e frete no que
//    chama de venda e receita; aqui não. Os valores ficam abaixo dos de lá, e
//    as CONTAGENS batem uma a uma (conferido contra o print de 23/09).
// 2. Não há "Conversão do checkout": acessos ao checkout não existem na API
//    pública da Yampi, e um widget com esse nome precisaria inventar o número.
//
// Os números vêm de `/api/yampi/painel`, que lê o ESPELHO (nunca a API da Yampi
// por carga de tela). As regras de cada conta moram em lib/yampi-painel.ts.

import { useCallback, useEffect, useState } from "react";
import { MetricCard, Vazio, CardSkeleton, deltaDe, Selo } from "./TfKit";
import { useAtualizacao, useVendaNova } from "./atualizacao";
import { RankingComBarra } from "../ui/RankingComBarra";
import { corDaSerie } from "../ui/graficos";
import { fmtBRL2, fmtNum } from "@/lib/format";
import type { PainelYampi } from "@/lib/yampi-painel";

export const ORIGEM_YAMPI = "Yampi";

// ── Uma leitura para os nove ─────────────────────────────────────────────────
// Os widgets abrem JUNTOS e pedem o mesmo período. Sem esta memória seriam nove
// requisições iguais na abertura e nove de novo a cada "Atualizar" (o evento
// chega em todos). A rota também tem cache, mas cada ida ainda custa uma
// invocação na Vercel — e invocação é a conta que já pausou o projeto.
const memoria = new Map<string, { em: number; p: Promise<PainelYampi | null> }>();
/** Janela em que um "Atualizar" reaproveita a busca que outro widget já disparou. */
const JUNTAR_MS = 3000;

function buscar(de: string, ate: string, fresh: boolean): Promise<PainelYampi | null> {
  const chave = `${de}|${ate}`;
  const ja = memoria.get(chave);
  if (ja && (!fresh || Date.now() - ja.em < JUNTAR_MS)) return ja.p;
  const q = new URLSearchParams({ period: "custom", from: de, to: ate, ...(fresh ? { fresh: "1" } : {}) });
  const p = fetch(`/api/yampi/painel?${q}`, { cache: "no-store" })
    .then((r) => r.json())
    .then((j: { ok?: boolean; data?: PainelYampi }) => (j?.ok ? j.data ?? null : null))
    .catch(() => null);
  memoria.set(chave, { em: Date.now(), p });
  // Falha não fica guardada: a próxima abertura tenta de novo em vez de
  // herdar o erro (o mesmo cuidado de `cached` no servidor).
  p.then((d) => { if (!d && memoria.get(chave)?.p === p) memoria.delete(chave); });
  return p;
}

/**
 * Banco de provas: entrega aos widgets um painel já montado, sem rota. O
 * `/dev-tridify` roda sem sessão e a rota dos widgets exige a área `trafego` —
 * sem isto a vitrine só mostraria o estado "sem dados". Mesmo espírito do
 * `vendasPreview` do PainelPersonalizavel.
 */
export function semearPainelYampi(de: string, ate: string, d: PainelYampi) {
  memoria.set(`${de}|${ate}`, { em: Number.MAX_SAFE_INTEGER, p: Promise.resolve(d) });
}

export function usePainelYampi(de: string, ate: string) {
  const [estado, setEstado] = useState<{ d: PainelYampi | null; carregando: boolean }>({ d: null, carregando: true });
  const carregar = useCallback((fresh: boolean) => {
    let vivo = true;
    setEstado((e) => ({ ...e, carregando: true }));
    buscar(de, ate, fresh).then((d) => { if (vivo) setEstado({ d, carregando: false }); });
    // Resposta de um período que já não está na tela é descartada — trocar de
    // período no meio da busca não pode pintar o número velho no card novo.
    return () => { vivo = false; };
  }, [de, ate]);
  useEffect(() => carregar(false), [carregar]);
  useAtualizacao(() => { carregar(true); });
  useVendaNova(() => { carregar(true); });
  return estado;
}

// ── Peças ────────────────────────────────────────────────────────────────────

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function Estado({ carregando, d, children }: { carregando: boolean; d: PainelYampi | null; children: (d: PainelYampi) => React.ReactNode }) {
  if (carregando && !d) return <CardSkeleton linhas={2} />;
  if (!d) return <Vazio icon="shopping-cart">Sem dados da Yampi — o espelho ainda não sincronizou.</Vazio>;
  return <>{children(d)}</>;
}

export function YampiVendas({ de, ate }: { de: string; ate: string }) {
  const { d, carregando } = usePainelYampi(de, ate);
  return <Estado d={d} carregando={carregando}>{(p) => (
    <MetricCard label="Vendas" origem={ORIGEM_YAMPI} valor={fmtBRL2(p.vendas.valor)} n={p.vendas.valor} fmt={fmtBRL2} cor="var(--text)"
      sub={`${fmtNum(p.vendas.pedidos)} pedidos realizados · só produto`}
      title="Todo pedido criado no período, pago ou aguardando. Valor de produto: sem juros de parcelamento e sem frete."
      dl={deltaDe(p.vendas.valor, p.vendas.anterior)}
      spark={{ vals: p.serie.map((x) => x.vendas), cor: corDaSerie(0), labels: p.serie.map((x) => dia(x.d)), fmt: fmtBRL2 }} />
  )}</Estado>;
}

export function YampiReceita({ de, ate }: { de: string; ate: string }) {
  const { d, carregando } = usePainelYampi(de, ate);
  return <Estado d={d} carregando={carregando}>{(p) => (
    <MetricCard label="Receita" origem={ORIGEM_YAMPI} valor={fmtBRL2(p.receita.valor)} n={p.receita.valor} fmt={fmtBRL2} cor="var(--tf-pos)"
      sub={`${fmtNum(p.receita.pagos)} pedidos pagos · sem juros e frete`}
      title="Só pedido com pagamento aprovado. Valor de produto: o juros do parcelamento é do gateway e o frete é do transportador — nenhum dos dois é receita da loja."
      dl={deltaDe(p.receita.valor, p.receita.anterior)}
      spark={{ vals: p.serie.map((x) => x.receita), cor: corDaSerie(0), labels: p.serie.map((x) => dia(x.d)), fmt: fmtBRL2 }} />
  )}</Estado>;
}

export function YampiTicket({ de, ate }: { de: string; ate: string }) {
  const { d, carregando } = usePainelYampi(de, ate);
  return <Estado d={d} carregando={carregando}>{(p) => (
    <MetricCard label="Ticket médio" origem={ORIGEM_YAMPI} valor={fmtBRL2(p.ticket.valor)} n={p.ticket.valor} fmt={fmtBRL2} cor="var(--text)"
      sub="vendas ÷ pedidos realizados"
      title="A mesma conta do painel da Yampi (vendas ÷ pedidos criados), com o valor de produto."
      dl={deltaDe(p.ticket.valor, p.ticket.anterior)}
      spark={{ vals: p.serie.map((x) => (x.pedidos ? x.ticket : null)), cor: corDaSerie(0), labels: p.serie.map((x) => dia(x.d)), fmt: fmtBRL2 }} />
  )}</Estado>;
}

export function YampiPix({ de, ate }: { de: string; ate: string }) {
  const { d, carregando } = usePainelYampi(de, ate);
  return <Estado d={d} carregando={carregando}>{(p) => (
    <MetricCard label="Conversão do Pix" origem={ORIGEM_YAMPI} valor={pct(p.pix.taxa)} cor="var(--text)"
      sub={`${fmtNum(p.pix.gerados)} gerados · ${fmtNum(p.pix.pagos)} pagos`}
      title="Dos pix gerados no checkout, quantos foram pagos."
      spark={{ vals: p.serie.map((x) => (x.pixGerados ? (x.pixPagos / x.pixGerados) * 100 : null)), cor: corDaSerie(0), labels: p.serie.map((x) => dia(x.d)), fmt: (n) => `${Math.round(n)}%` }} />
  )}</Estado>;
}

export function YampiRecorrentes({ de, ate }: { de: string; ate: string }) {
  const { d, carregando } = usePainelYampi(de, ate);
  return <Estado d={d} carregando={carregando}>{(p) => (
    <MetricCard label="Clientes recorrentes" origem={ORIGEM_YAMPI} valor={pct(p.recorrencia.taxa)} cor="var(--text)"
      sub={`${fmtNum(p.recorrencia.recorrentes)} recorrente${p.recorrencia.recorrentes === 1 ? "" : "s"} · ${fmtNum(p.recorrencia.novos)} novo${p.recorrencia.novos === 1 ? "" : "s"}`}
      title="Entre quem pagou no período: recorrente é quem já tinha pedido pago antes, ou pagou mais de uma vez no período. Depende do histórico sincronizado — antes dele, todo cliente parece novo." />
  )}</Estado>;
}

/** Cabeçalho dos widgets de lista, na gramática do `.tf-w` (rótulo + selo de origem). */
function Topo({ titulo, sub }: { titulo: string; sub: string }) {
  return (
    <div className="tf-w-topo" style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <div className="tf-w-rotulo" style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", fontWeight: 600, minWidth: 0 }}>{titulo}</div>
        <span style={{ flexShrink: 0 }}><Selo>{ORIGEM_YAMPI}</Selo></span>
      </div>
      <div style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

export function YampiEstados({ de, ate }: { de: string; ate: string }) {
  const { d, carregando } = usePainelYampi(de, ate);
  return <Estado d={d} carregando={carregando}>{(p) => (
    <div className="tf-w">
      <Topo titulo="Top vendas por estado" sub="pedidos criados, por estado de entrega" />
      <div className="tf-w-corpo" style={{ marginTop: 10 }}>
        <RankingComBarra itens={p.estados.map((e) => ({ chave: e.nome, nome: e.nome, qtd: e.qtd, pct: e.pct }))} vazio="Sem pedidos no período." />
      </div>
    </div>
  )}</Estado>;
}

export function YampiProdutos({ de, ate }: { de: string; ate: string }) {
  const { d, carregando } = usePainelYampi(de, ate);
  return <Estado d={d} carregando={carregando}>{(p) => (
    <div className="tf-w">
      <Topo titulo="Top produtos" sub="unidades em pedidos criados" />
      <div className="tf-w-corpo" style={{ marginTop: 10 }}>
        <RankingComBarra
          itens={p.produtos.map((x) => ({ chave: x.nome, nome: x.nome, qtd: x.qtd, icone: x.brinde ? "gift" : "package", apoio: x.brinde ? "brinde que acompanha o pedido" : undefined }))}
          valor={(x) => `${fmtNum(x.qtd)} vendido${x.qtd === 1 ? "" : "s"}`}
          vazio="Sem produtos no período." />
      </div>
    </div>
  )}</Estado>;
}
