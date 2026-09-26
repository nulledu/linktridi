import { NextResponse } from "next/server";
import { buildLogisticaSnapshot, criticosDoPainel } from "@/lib/logistica";
import { montarSemanaDeEnvios } from "@/lib/painel-envios";
import { cached } from "@/lib/cache";
import { ritmoAtual } from "@/app/painel/ritmo";

export const dynamic = "force-dynamic";

/**
 * Painel de Logística da TV (app `tv-central`, módulo `panel:logistica`).
 *
 * Por que uma rota separada de `/api/logistica`:
 *
 * 1. **Sessão.** A TV não tem login — é um aparelho pendurado na parede. A rota
 *    do ERP passa por `getProfileForModule("logistica")` e devolveria 401.
 *    Esta entra na mesma lista pública de `/api/sales` e `/api/config`.
 * 2. **Dado pessoal.** Justamente por ser pública, ela NÃO devolve
 *    `entradaPedidos`/`logisticaPedidos`: essas listas trazem nome e telefone
 *    de cliente. Aqui saem só contagens — é o que a TV mostra de qualquer jeito.
 * 3. **Ritmo.** A TV bate 24h por dia. O cache é do servidor (`cached`), então
 *    mil ciclos viram uma leitura do ERP por minuto — a mesma defesa de
 *    `/api/sales` e `/api/config` (ver CLAUDE.md, "o tick comum tem que voltar
 *    VAZIO").
 */
export async function GET() {
  try {
    // No expediente, um minuto; fora dele, dez. `buildLogisticaSnapshot` faz
    // várias chamadas ao ERP legado — é a consulta cara desta rota.
    const ttl = ritmoAtual(60_000);
    const snap = await cached("logistica:painel", ttl, buildLogisticaSnapshot);

    return NextResponse.json(
      {
        atualizadoEm: snap.updatedAt,
        entrada: snap.pipeline.entrada,
        logistica: snap.pipeline.logistica,
        total: snap.pipeline.total,
        enviadosHoje: snap.enviadosHoje,
        categorias: snap.categories.map((c) => ({
          chave: c.key,
          rotulo: c.label,
          valor: c.value,
          anterior: c.prev,
          cor: c.color,
        })),
        faltaProducao: snap.faltaProducao.slice(0, 6).map((f) => ({
          categoria: f.categoria,
          total: f.total,
          pedidos: f.pedidos,
        })),
        // Pedidos críticos SANITIZADOS (ver `criticosDoPainel`): a parede
        // identifica pela CAIXA separadora + pendências. Nome, telefone e
        // `id_proprio` de cliente continuam proibidos nesta rota.
        criticos: criticosDoPainel(snap.entradaPedidos, snap.logisticaPedidos),
        // A semana de envios do gráfico da parede: barras, média móvel,
        // total, variação e período — a conta é pura (`montarSemanaDeEnvios`),
        // aqui só entra a série que veio do ERP.
        semana: montarSemanaDeEnvios(snap.enviosSerie),
        // Os quatro números do painel. Saem nomeados em vez de a TV remontá-los
        // a partir de `categorias`: "etiquetas pendentes" é SÓ `a_emitir` (o
        // que espera impressão), enquanto a categoria "etiqueta" soma também
        // `sem_formulario` — dois problemas diferentes num número só.
        etiquetasPendentes: snap.categories.find((c) => c.key === "etiqueta")?.subs.find((x) => x.label === "A Emitir")?.value ?? 0,
        prontosParaEnvio: snap.categories.find((c) => c.key === "pronto")?.value ?? 0,
        // "Pronto, mas falta peça": o pedido está na mão da logística e o ERP
        // marcou item faltante. É o que trava a caixa em cima da bancada.
        prontosFaltandoEstoque: [...snap.entradaPedidos, ...snap.logisticaPedidos].filter((p) => p.temFalta).length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "failed_to_load_logistica_painel", detail: String(e) },
      { status: 500 },
    );
  }
}
