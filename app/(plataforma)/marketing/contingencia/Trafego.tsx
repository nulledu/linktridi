"use client";

// ── Contingência de Tráfego ──────────────────────────────────────────────────
// A Estrutura Meta do aquecimento (BMs e contas de anúncio), lida como
// contingência: quantas existem, quantas estão prontas, quantas caíram. Nada
// aqui é métrica inventada — é contagem do que está cadastrado, por status.
// Gasto, resultado e o que mais for definido entram depois, no mesmo formato.

import type { ReactNode } from "react";
import { Botao } from "../../ui/controles";
import { Kpi, Bloco, Distribuicao, Origem } from "./pecas";
import type { ResumoMeta } from "@/lib/contingencia-const";

export function Trafego({ meta, inventario, onNovo }: { meta: ResumoMeta; inventario: ReactNode; onNovo?: () => void }) {
  const { bms, contas } = meta;
  return (
    <div className="ct-traf ct-secoes">
      <div className="ct-grade ct-grade-4 kpi-row">
        <Kpi tom="contexto" icone="briefcase" rotulo="BMs ativas" valor={bms.total}
          sub={bms.caidas ? `${bms.caidas} restrita${bms.caidas === 1 ? "" : "s"}/banida${bms.caidas === 1 ? "" : "s"}` : "nenhuma restrita"} origem="Estrutura Meta do aquecimento" />
        <Kpi tom="contexto" icone="credit-card" rotulo="Contas de anúncio" valor={contas.total}
          sub={`${contas.naoAquecidas} nova${contas.naoAquecidas === 1 ? "" : "s"} ainda sem aquecer`} origem="contas penduradas nas BMs" />
        <Kpi tom="contexto" icone="circle-check" rotulo="Contas prontas" valor={contas.prontas}
          sub="aquecidas ou em uso" origem="status “aquecido” + “em uso”" />
        <Kpi tom={contas.caidas ? "alerta" : "contexto"} icone="flame" rotulo="Contas em aquecimento" valor={contas.aquecendo}
          sub={`${contas.caidas} restrita${contas.caidas === 1 ? "" : "s"}/banida${contas.caidas === 1 ? "" : "s"}`} origem="status “aquecendo”" />
      </div>

      <div className="duo duo-eq">
        <Bloco tom="contexto" titulo="BMs por situação" icone="briefcase" sub={`${bms.total} ativa${bms.total === 1 ? "" : "s"}`}>
          <Distribuicao itens={bms.porStatus} vazio="Nenhuma BM cadastrada." />
          <Origem>contado dos ativos tipo BM</Origem>
        </Bloco>
        <Bloco tom="contexto" titulo="Contas por situação" icone="credit-card" sub={`${contas.total} ativa${contas.total === 1 ? "" : "s"}`}>
          <Distribuicao itens={contas.porStatus} vazio="Nenhuma conta cadastrada." />
          <Origem>contado dos ativos tipo conta</Origem>
        </Bloco>
      </div>

      <Bloco tom="contexto" titulo="Estrutura Meta" icone="brand-meta"
        sub="Cada BM com as contas que penduram nela. Clique numa conta pra abrir a linha do tempo do aquecimento."
        acoes={onNovo ? <Botao variante="secundario" tamanho="sm" icone="plus" onClick={onNovo}>Nova BM / conta</Botao> : undefined}>
        {inventario}
      </Bloco>

      <p className="ct-sub" style={{ textAlign: "center", marginInline: "auto" }}>
        As métricas de tráfego (gasto por conta, perfis, proxies de BM) ainda não foram definidas e por isso não aparecem aqui.
      </p>
    </div>
  );
}
