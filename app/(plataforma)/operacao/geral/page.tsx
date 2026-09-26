import { requireAlgumModulo } from "@/lib/require-auth";
import { cached } from "@/lib/cache";
import { resumoEstoquePainel } from "@/lib/painel-estoque";
import { buildLogisticaSnapshot } from "@/lib/logistica";
import { diaSP } from "@/lib/painel-producao";
import { visaoAtividades, visaoEstoque } from "@/lib/operacao-visao";
import { VisaoGeralOperacao, type DadosOperacao } from "./VisaoGeralOperacao";

export const dynamic = "force-dynamic";

/**
 * Operação › Visão geral — o que movimenta a produção, do pedido à entrega.
 *
 * Tudo em paralelo e com cache de um minuto no servidor: a tela é aberta por
 * vários gestores ao longo do dia, e a Logística lê o ERP legado (a ida mais
 * lenta). Os resumos de estoque e logística usam as MESMAS chaves das TVs —
 * com a parede ligada, o cache já está quente.
 *
 * Cada bloco só existe pra quem tem a área, e um bloco que falha some sozinho
 * (`allSettled`) em vez de derrubar a tela.
 */
export default async function OperacaoGeralPage() {
  const { keys } = await requireAlgumModulo("atividades", "producao", "estoque", "logistica");
  const tem = (k: string) => keys.includes(k);
  const verAtividades = tem("atividades") || tem("producao");

  const [ativ, estResumo, estGrupos, logi] = await Promise.allSettled([
    verAtividades ? cached("operacao:atividades", 60_000, () => visaoAtividades()) : null,
    tem("estoque") ? cached("estoque:painel", 60_000, resumoEstoquePainel) : null,
    tem("estoque") ? cached("operacao:estoque", 5 * 60_000, visaoEstoque) : null,
    tem("logistica") ? cached("logistica:painel", 60_000, buildLogisticaSnapshot) : null,
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
  const a = ok(ativ), e = ok(estResumo), g = ok(estGrupos), l = ok(logi);

  const ontem = diaSP(new Date(Date.now() - 86_400_000));
  const cat = (k: string) => l?.categories.find((c) => c.key === k);

  const dados: DadosOperacao = {
    hoje: new Date().toISOString(),
    atividades: a && tem("atividades") ? a : null,
    producao: a && tem("producao") ? a : null,
    // Sem nenhum dos dois, ninguém lê as listas de atividade da coluna direita.
    listas: a ? { proximas: a.proximas, ultimas: a.ultimas } : null,
    estoque: e || g ? {
      abaixo: e?.abaixo ?? 0, zerados: e?.zerados ?? 0, conferir: e?.conferir ?? 0,
      total: g?.total ?? null, grupos: g?.grupos ?? [],
    } : null,
    logistica: l ? {
      separacao: { valor: cat("entrada")?.value ?? 0, ontem: cat("entrada")?.prev ?? null },
      etiqueta: { valor: cat("etiqueta")?.value ?? 0, ontem: cat("etiqueta")?.prev ?? null },
      prontos: { valor: cat("pronto")?.value ?? 0, ontem: cat("pronto")?.prev ?? null },
      enviados: { valor: l.enviadosHoje, ontem: l.enviosSerie.find((p) => p.dia === ontem)?.valor ?? null },
      faltandoPeca: [...l.entradaPedidos, ...l.logisticaPedidos].filter((x) => x.temFalta).length,
    } : null,
  };

  return <VisaoGeralOperacao dados={dados} />;
}
