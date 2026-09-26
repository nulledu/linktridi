"use client";

// ── Tempo pra aceitar ────────────────────────────────────────────────────────
// Quanto tempo passa entre a atividade aparecer no tablet e a pessoa tocar
// "Aceitar". Número do time (mediana, com o período anterior do lado), ranking
// por pessoa com medalha no pódio e selo de ritmo (Relâmpago · Ágil · No ritmo
// · Demorado), e quem está esperando aceite AGORA — o que dá pra cobrar já.
// A regra (o que conta, o que fica fora) mora em `lib/atividades-aceite.ts`.

import { useMemo, useState, type CSSProperties } from "react";
import { Icon } from "../Icon";
import { Abas } from "../ui/Abas";
import { Avatar } from "../ui/Avatar";
import { Selo } from "../ui/primitives";
import { MEDALHA, TINTA_MEDALHA } from "../ui/ChipIcone";
import { aceitePorPessoa, esperandoAceite, seloDe, textoEspera, MIN_ACEITES, SELOS } from "@/lib/atividades-aceite";
import type { Atividade, Colaborador } from "@/lib/atividades-catalog";

type Periodo = "hoje" | "7d" | "30d";
const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" }, { valor: "7d", rotulo: "7 dias" }, { valor: "30d", rotulo: "30 dias" },
];
const DIAS: Record<Periodo, number> = { hoje: 1, "7d": 7, "30d": 30 };

/** Meia-noite (SP) do começo do recorte. */
function inicioSP(periodo: Periodo, agora: number): number {
  const sp = new Date(agora - 3 * 3600 * 1000);
  return Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() - (DIAS[periodo] - 1), 3, 0, 0);
}

export function TempoParaAceitar({ lista, colaboradores, agora }: { lista: Atividade[]; colaboradores: Colaborador[]; agora: number }) {
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const fotoDe = useMemo(() => new Map(colaboradores.map((c) => [c.id, c.fotoUrl ?? null])), [colaboradores]);

  const { atual, antes, fila } = useMemo(() => {
    const ini = inicioSP(periodo, agora);
    const dur = DIAS[periodo] * 24 * 3600 * 1000;
    return {
      atual: aceitePorPessoa(lista, ini),
      antes: aceitePorPessoa(lista, ini - dur, ini),
      fila: esperandoAceite(lista, agora),
    };
  }, [lista, periodo, agora]);

  // Banco sem `aceita_at` (SQL de ordens v2 não rodado): nenhuma linha traz a
  // chave. Dizer isso em vez de "ninguém aceitou nada".
  const semColuna = lista.length > 0 && !lista.some((a) => "aceita_at" in a);
  const delta = atual.medianaMin != null && antes.medianaMin != null ? atual.medianaMin - antes.medianaMin : null;
  let posicao = 0;

  return (
    <section className="glass glass-spec" style={{ borderRadius: "var(--r-md)", padding: 20, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="hand-click" size={17} color="var(--primary-texto)" /> Tempo pra aceitar
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-dim)" }}>Da atividade aparecer no tablet até o toque em “Aceitar”.</p>
        </div>
        <Abas itens={PERIODOS} valor={periodo} onMuda={setPeriodo} ariaLabel="Período do tempo pra aceitar" />
      </div>

      {semColuna ? (
        <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
          O carimbo do aceite ainda não está ligado no banco — falta rodar o SQL <code>atividades_ordens_v2.sql</code>.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 16, alignItems: "flex-start" }}>
          {/* O número do time */}
          <div style={{ flex: "1 1 200px", minWidth: 0, display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12.5, color: "var(--text-dim)", fontWeight: 600 }}>Mediana do time</span>
            <strong className="stat" style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>
              {atual.medianaMin == null ? "—" : textoEspera(atual.medianaMin)}
            </strong>
            {atual.medianaMin != null && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Selo tom={SELOS[seloDe(atual.medianaMin)].tom}>{SELOS[seloDe(atual.medianaMin)].rotulo}</Selo>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{atual.aceites} aceite(s)</span>
              </span>
            )}
            {delta != null && Math.abs(delta) >= 0.1 && (
              // Aqui DESCER é bom: aceitar mais rápido que o período anterior.
              <span style={{ fontSize: 12, fontWeight: 600, color: delta < 0 ? "var(--ok)" : "var(--perigo)", display: "flex", alignItems: "center", gap: 4 }}>
                <Icon name={delta < 0 ? "arrow-down" : "arrow-up"} size={13} color="currentColor" />
                {textoEspera(Math.abs(delta))} vs. período anterior
              </span>
            )}
            {fila.length > 0 && (
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12.5, color: "var(--text-dim)", fontWeight: 600 }}>Esperando aceite agora</span>
                {fila.slice(0, 4).map((f) => (
                  <span key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, minWidth: 0 }}>
                    <Avatar url={fotoDe.get(f.para_id) ?? null} nome={f.nome} size={22} />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nome}</span>
                    <strong className="stat" style={{ color: f.esperandoMin > SELOS.no_ritmo.ate ? "var(--perigo)" : "var(--text)" }}>{textoEspera(f.esperandoMin)}</strong>
                  </span>
                ))}
                {fila.length > 4 && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>+{fila.length - 4} esperando</span>}
              </div>
            )}
          </div>

          {/* O ranking */}
          <div style={{ flex: "999 1 320px", minWidth: 0 }}>
            {atual.pessoas.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
                Ninguém aceitou atividade pelo tablet neste período.
              </p>
            ) : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
                {atual.pessoas.map((p) => {
                  const pos = p.poucosDados ? null : ++posicao;
                  const medalha = pos != null && pos <= 3 ? MEDALHA[pos - 1] : null;
                  const s = SELOS[p.selo];
                  return (
                    <li key={p.id} style={linha}>
                      <span className="stat" style={{ width: 22, textAlign: "center", fontSize: 12.5, color: "var(--text-dim)", flex: "none" }}>{pos ?? "·"}</span>
                      <Avatar url={fotoDe.get(p.id) ?? null} nome={p.nome} size={32}
                        selo={medalha ? { conteudo: <Icon name="medal" size={11} color={TINTA_MEDALHA} />, fundo: medalha, tinta: TINTA_MEDALHA, rotulo: `${pos}º lugar` } : null} />
                      <span style={{ flex: 1, minWidth: 0, display: "grid" }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
                        <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                          {p.aceites} aceite(s) · recorde {textoEspera(p.maisRapidoMin)}
                          {p.poucosDados && ` · precisa de ${MIN_ACEITES} pra entrar no ranking`}
                        </span>
                      </span>
                      <span style={{ display: "grid", justifyItems: "end", gap: 3, flex: "none" }}>
                        <strong className="stat" style={{ fontSize: 15 }}>{textoEspera(p.medianaMin)}</strong>
                        <Selo tom={s.tom}><Icon name={s.icone} size={12} color="currentColor" />&nbsp;{s.rotulo}</Selo>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const linha: CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", minHeight: "var(--tap)",
  borderBottom: "1px solid var(--border)",
};
