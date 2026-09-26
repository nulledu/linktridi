"use client";

import { MonoRosca, corDaSerie } from "../ui/graficos";
import type { StageBucket } from "@/lib/producao";
import { fmt } from "./parts";

/**
 * Pedidos por etapa — a rosca da Visão geral e do Status.
 *
 * É a `MonoRosca` do kit (a mesma do Tridify): uma cor por fatia da rampa da
 * pessoa, o total no buraco e a fatia apontada engrossa. A anterior mostrava
 * só as cinco primeiras etapas contra o total de TODAS — o anel ficava com um
 * buraco e os percentuais não fechavam 100%. Agora as maiores etapas aparecem
 * e o resto vira UMA fatia "Outras etapas", então a soma bate com o centro.
 */
export function RoscaEtapas({ stages, max = 5 }: { stages: StageBucket[]; max?: number }) {
  const ordem = [...stages].filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  const total = ordem.reduce((s, x) => s + x.count, 0);
  const cabe = ordem.length > max ? ordem.slice(0, max - 1) : ordem;
  const resto = ordem.slice(cabe.length).reduce((s, x) => s + x.count, 0);
  const fatias = [
    ...cabe.map((s, i) => ({ nome: s.nome, valor: s.count, cor: corDaSerie(i) })),
    ...(resto > 0 ? [{ nome: `Outras etapas (${ordem.length - cabe.length})`, valor: resto, cor: "color-mix(in srgb, var(--text) 22%, transparent)" }] : []),
  ];
  return (
    <div className="pv-rosca">
      <div className="pv-rosca-anel">
        <MonoRosca tamanho={164} espessura={18} fatias={fatias} formatar={fmt}
          centro={
            <span style={{ textAlign: "center", lineHeight: 1.2 }}>
              <strong className="stat mt-num" style={{ display: "block", fontSize: 24 }}>{fmt(total)}</strong>
              <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>pedidos</span>
            </span>
          } />
      </div>
      <ul className="pv-rosca-legenda">
        {fatias.map((f) => (
          <li key={f.nome}>
            <span className="pv-rosca-ponto" style={{ background: f.cor }} aria-hidden />
            <span className="pv-rosca-rot">{f.nome}</span>
            <b className="mt-num">{fmt(f.valor)}</b>
            <span className="pv-rosca-pct mt-num">{total ? Math.round((f.valor / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
