"use client";

// ── Batidas de um dia, com o dia escolhível ─────────────────────────────────
// O "Espelho" era uma tela inteira pra fazer três coisas: escolher a pessoa,
// escolher a data e arrumar a hora. Dentro de "Gerenciar ponto e horas" a
// pessoa JÁ está escolhida — sobrou a data, e data é um seletor, não uma aba.
//
// Fica no topo do pop-up porque é a pergunta curta ("a hora dela está certa?").
// O calendário do mês, logo abaixo, continua respondendo a longa — e clicar num
// dia lá também traz o dia pra cá, então há um caminho só pra "arrumar o dia X".
//
// Sem poll: trocar de dia é um clique, e um clique é uma leitura.

import { useState } from "react";
import { Icon } from "../../Icon";
import { GlassDate } from "../../GlassPicker";
import { BatidasDoDia } from "../PontoPanel";
import { Botao, BotaoIcone } from "../../ui/controles";
import type { PontoPessoa } from "@/lib/ponto";

const hojeSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const somaDias = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const rotuloDia = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z");
  return `${DIAS[d.getUTCDay()]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};

/** Horários previstos da pessoa, na ordem da jornada — habilita "Lançar o turno". */
const horariosDoTurno = (p: PontoPessoa | null | undefined): string[] =>
  p ? [p.entradaPrevista, p.almocoInicio, p.almocoFim, p.saidaPrevista]
        .filter((x): x is string => !!x && /^\d{1,2}:\d{2}/.test(x)).map((x) => x.slice(0, 5))
    : [];

export function DiaDoPonto({ pessoaId, cadastro, dia, onDia, onMudou }: {
  pessoaId: string;
  cadastro?: PontoPessoa | null;
  /** Dia em tela, controlado por fora quando o calendário do mês manda um. */
  dia?: string;
  onDia?: (d: string) => void;
  /** Gravou/corrigiu/apagou: o saldo lá embaixo precisa reler. */
  onMudou?: () => void;
}) {
  const [interno, setInterno] = useState(hojeSP);
  const alvo = dia ?? interno;
  const trocar = (d: string) => { setInterno(d); onDia?.(d); };
  const hoje = hojeSP();
  // Dia futuro não tem batida pra arrumar — e lançar hora que não aconteceu é
  // o jeito mais rápido de inventar saldo. A seta para e o calendário apaga.
  const podeAvancar = alvo < hoje;

  return (
    <section className="glass glass-spec" style={{
      borderRadius: "var(--r-md)", border: "1px solid var(--border)", padding: 14,
      display: "flex", flexDirection: "column", gap: 12, minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        <Icon name="checklist" size={15} color="var(--text-dim)" />
        <strong style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", flex: "1 1 auto", minWidth: 0 }}>
          {rotuloDia(alvo)}
        </strong>
        {/* O par de setas anda um dia; o calendário pula pra qualquer um. Os dois
            juntos porque conferir é quase sempre "ontem, anteontem" — e às vezes
            "o dia 3". A faixa rola de lado quando não cabe. */}
        <span className="tab-strip" style={{ gap: 6, flex: "0 1 auto", minWidth: 0, maxWidth: "100%", alignItems: "center" }}>
          <BotaoIcone icone="chevron-left" titulo="Dia anterior" variante="secundario" onClick={() => trocar(somaDias(alvo, -1))} style={{ flex: "none" }} />
          <GlassDate value={alvo} onChange={(v) => v && trocar(v)} clearable={false} max={hoje} style={{ width: 150, flex: "none" }} />
          <BotaoIcone icone="chevron-right" titulo="Próximo dia" variante="secundario" onClick={() => podeAvancar && trocar(somaDias(alvo, 1))} disabled={!podeAvancar} style={{ flex: "none" }} />
          {alvo !== hoje && (
            <Botao variante="sutil" onClick={() => trocar(hoje)} style={{ flex: "none" }}>Hoje</Botao>
          )}
        </span>
      </div>

      {/* `key`: trocar de dia é outra lista — sem remontar, os horários digitados
          e ainda não gravados atravessavam do dia 3 pro dia 4. */}
      <BatidasDoDia key={`${pessoaId}:${alvo}`} pessoaId={pessoaId} dia={alvo} turno={horariosDoTurno(cadastro)} onMudou={onMudou} />
    </section>
  );
}
