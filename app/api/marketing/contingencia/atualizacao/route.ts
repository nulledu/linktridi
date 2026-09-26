import { NextRequest } from "next/server";
import { mudarStatus, criarAtivo, type StatusAtivo } from "@/lib/marketing-aquecimento";
import {
  carregarPainel, gravarSnapshot, editarProxy, criarProxies, salvarCelular, editarCusto, criarCusto, editarPendencia,
  inteiroNaoNegativo, valorMonetario,
  type SituacaoCelular, type StatusProxy,
} from "@/lib/contingencia";
import { gateContingencia, json, erro, texto } from "../_gate";

export const dynamic = "force-dynamic";

const STATUS_NUM = new Set<StatusAtivo>(["novo", "aquecendo", "aquecido", "em_uso", "restrito", "banido", "aposentado"]);
const STATUS_PX = new Set<StatusProxy>(["ativo", "inativo", "expirado"]);
const SITUACOES = new Set<SituacaoCelular>(["ok", "manutencao", "aposentado"]);
const MAX_LOTE = 200;

type Item = Record<string, unknown>;
const lista = (v: unknown): Item[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Item[] : []).slice(0, MAX_LOTE);

// POST — "Salvar atualização". Recebe tudo o que a pessoa mexeu na Atualização
// de Hoje, aplica em ordem e grava o snapshot do dia. Corpo vazio = só grava o
// snapshot (é o "carimbar hoje" sem mudar nada).
//
// Status de chip passa por `mudarStatus` do aquecimento, e não por update
// direto: é lá que o congelamento de prazo e o evento de histórico acontecem.
export async function POST(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const b = (await req.json().catch(() => null) ?? {}) as Item;
  const autor = { id: g.profile.id, nome: g.profile.name };
  const aplicado = { numeros: 0, proxies: 0, celulares: 0, custos: 0, pendencias: 0, novosChips: 0, novosProxies: 0 };

  try {
    // ── status de chip ──
    for (const n of lista(b.numeros)) {
      const id = texto(n.id, 60); const status = String(n.status ?? "");
      if (!id || !STATUS_NUM.has(status as StatusAtivo)) return json({ ok: false, error: "status_invalido" }, 422);
      if (await mudarStatus(autor, id, status as StatusAtivo, texto(n.nota, 300) ?? "Atualização diária da contingência")) aplicado.numeros++;
    }

    // ── proxies existentes ──
    for (const p of lista(b.proxies)) {
      const id = texto(p.id, 60);
      if (!id) return json({ ok: false, error: "proxy_invalido" }, 422);
      const patch: Parameters<typeof editarProxy>[1] = {};
      if (p.status !== undefined) { if (!STATUS_PX.has(p.status as StatusProxy)) return json({ ok: false, error: "status_proxy_invalido" }, 422); patch.status = p.status as StatusProxy; }
      if (p.custoMensal !== undefined) { const v = valorMonetario(p.custoMensal); if (v === null) return json({ ok: false, error: "custo_invalido" }, 422); patch.custoMensal = v; }
      if (p.numeroId !== undefined) patch.numeroId = texto(p.numeroId, 60);
      if (p.aparelhoNome !== undefined) patch.aparelhoNome = texto(p.aparelhoNome, 80);
      if (await editarProxy(id, patch)) aplicado.proxies++;
    }

    // ── celulares ──
    for (const c of lista(b.celulares)) {
      const id = texto(c.id, 60);
      if (!id) return json({ ok: false, error: "celular_invalido" }, 422);
      const patch: Parameters<typeof salvarCelular>[1] = {};
      if (c.situacao !== undefined) { if (!SITUACOES.has(c.situacao as SituacaoCelular)) return json({ ok: false, error: "situacao_invalida" }, 422); patch.situacao = c.situacao as SituacaoCelular; }
      if (c.responsavelId !== undefined) patch.responsavelId = texto(c.responsavelId, 60);
      if (c.responsavelNome !== undefined) patch.responsavelNome = texto(c.responsavelNome, 80);
      if (await salvarCelular(id, patch)) aplicado.celulares++;
    }

    // ── custos existentes (só valor/ativo: é o que muda todo mês) ──
    for (const c of lista(b.custos)) {
      const id = texto(c.id, 60);
      if (!id) return json({ ok: false, error: "custo_invalido" }, 422);
      const patch: Parameters<typeof editarCusto>[1] = {};
      if (c.valor !== undefined) { const v = valorMonetario(c.valor); if (v === null) return json({ ok: false, error: "custo_invalido" }, 422); patch.valor = v; }
      if (c.ativo !== undefined) patch.ativo = !!c.ativo;
      if (await editarCusto(id, patch)) aplicado.custos++;
    }

    // ── pendências (marcar feita/aberta) ──
    for (const p of lista(b.pendencias)) {
      const id = texto(p.id, 60); const status = p.status === "feita" ? "feita" : p.status === "aberta" ? "aberta" : null;
      if (!id || !status) return json({ ok: false, error: "pendencia_invalida" }, 422);
      if (await editarPendencia(id, { status })) aplicado.pendencias++;
    }

    // ── lotes ──
    // "Chegaram 20 chips Fluke": vinte ativos `novo`, sem aparelho e sem
    // atendente — é exatamente o que a contingência lê como "em estoque".
    if (b.novosChips && typeof b.novosChips === "object") {
      const l = b.novosChips as Item;
      const qtd = inteiroNaoNegativo(l.quantidade, MAX_LOTE);
      const operadora = texto(l.operadora, 40);
      if (qtd === null || !operadora) return json({ ok: false, error: "lote_chips_invalido" }, 422);
      const prefixo = texto(l.prefixo, 40) ?? `${operadora} estoque`;
      const base = Date.now().toString(36).slice(-4).toUpperCase();
      for (let i = 1; i <= qtd; i++) {
        const a = await criarAtivo(autor, { tipo: "numero", nome: `${prefixo} ${base}-${String(i).padStart(2, "0")}`, operadora, obs: "Cadastrado em lote pela contingência" });
        if (a) aplicado.novosChips++;
      }
    }
    if (b.novosProxies && typeof b.novosProxies === "object") {
      const l = b.novosProxies as Item;
      const qtd = inteiroNaoNegativo(l.quantidade, MAX_LOTE);
      const custo = valorMonetario(l.custoMensal ?? 0);
      if (qtd === null || custo === null) return json({ ok: false, error: "lote_proxies_invalido" }, 422);
      const prefixo = texto(l.prefixo, 30) ?? "PX";
      const base = Date.now().toString(36).slice(-4).toUpperCase();
      const criados = await criarProxies(Array.from({ length: qtd }, (_, i) => ({
        identificacao: `${prefixo}-${base}-${String(i + 1).padStart(2, "0")}`, custoMensal: custo,
        compradoEm: texto(l.compradoEm, 10),
      })));
      aplicado.novosProxies = criados?.length ?? 0;
    }
    for (const c of lista(b.novosCustos)) {
      const valor = valorMonetario(c.valor); const descricao = texto(c.descricao, 120);
      const tipo = c.tipo === "plano_chip" ? "plano_chip" : "outro";
      if (valor === null || !descricao) return json({ ok: false, error: "custo_invalido" }, 422);
      if (await criarCusto({ tipo, descricao, valor, periodicidade: c.periodicidade === "unico" ? "unico" : "mensal" })) aplicado.custos++;
    }

    const consolidado = await gravarSnapshot("manual", g.profile.name);
    const painel = await carregarPainel();
    return json({ ok: true, aplicado, snapshotGravado: !!consolidado, painel });
  } catch (e) { return erro(e, "atualizacao_error"); }
}
