"use client";

import { memo, useMemo } from "react";
import { Icon } from "@/app/(plataforma)/Icon";
import { fmtBRL } from "@/lib/format";

export interface DadosComemoracao {
  time: string;      // "Comercial"
  mes: string;       // "setembro"
  valor: number;
  pct: number;       // % da meta
}

/**
 * Pop-up de META DO MÊS (25/09/2026). Entra com escala + esmaecer (termina em
 * `transform: none`), brilho parado atrás do cartão e confete discreto que cai
 * uma vez — só `transform`/`opacity`, nada em loop. Quem fecha é o Panel,
 * depois de ~8 s. Espelho: `Comemoracao.kt`.
 */
export const Celebration = memo(function Celebration({ dados }: { dados?: DadosComemoracao | null }) {
  // Confete sorteado UMA vez por montagem: re-render não reembaralha.
  const pecas = useMemo(
    () => Array.from({ length: 28 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 2.4 + Math.random() * 1.4,
      size: 7 + Math.random() * 6,
      rot: Math.random() * 540,
      cor: i % 3 === 0 ? "var(--p-primaria-clara, #a78bfa)" : i % 3 === 1 ? "var(--p-primaria, #6c4cf0)" : "var(--ok)",
    })),
    [],
  );
  const pct = dados ? `${Math.round(dados.pct)}%` : "";
  return (
    <div className="pw-comemora" role="status" aria-live="polite">
      {pecas.map((p, i) => (
        <span
          key={i}
          className="pw-comemora-confete"
          style={{
            left: `${p.left}%`, width: p.size, height: p.size * 0.42, background: p.cor,
            animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`,
            ["--giro" as string]: `${p.rot}deg`,
          }}
        />
      ))}
      <div className="pw-comemora-cartao">
        <span className="pw-comemora-selo"><Icon name="trophy" size={56} color="currentColor" /></span>
        <span className="pw-comemora-rotulo"><Icon name="confetti" size={22} color="currentColor" />Meta atingida</span>
        {dados ? (
          <>
            <h2 className="pw-comemora-titulo">{dados.time} atingiu a meta de {dados.mes}</h2>
            <strong className="pw-comemora-valor">{fmtBRL(dados.valor)}</strong>
            <span className="pw-comemora-pct">{pct} da meta do mês</span>
            <p className="pw-comemora-msg">Parabéns, time! Cada venda contou.</p>
          </>
        ) : (
          <h2 className="pw-comemora-titulo">Meta batida!</h2>
        )}
      </div>
    </div>
  );
});
