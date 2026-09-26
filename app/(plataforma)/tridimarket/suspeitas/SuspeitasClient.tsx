"use client";

import { useCallback, useEffect, useState } from "react";
import type { MarketProfile } from "../../../../lib/tridimarket/types";
import { Cabecalho, intervaloDe, useFiltros } from "../Filtros";
import { paramsDoPeriodo } from "../../../../lib/tridimarket/periodo";
import { Aviso } from "../DashboardClient";
import { Avatar, Badge, Card, Empty, PanelTitle, SkelLinhas, SkelStats, Stat, haQuantoTempo, marketRequest } from "../ui";

type Settings = { profiles: MarketProfile[]; schemaReady: boolean };
type Evento = {
  id: number; at: string; employeeId: number | null; employeeName: string | null;
  employeeImage: string | null; unitName: string | null; kind: string; raw: string;
};
type Dados = {
  eventos: Evento[]; periodDays: number;
  resumo: Array<{ kind: string; total: number }>;
  reincidentes: Array<{ name: string; image: string | null; total: number }>;
};

// Os tipos vêm do legado (antifurto do totem) e do próprio TridiMarket.
// Traduzir aqui é o que transforma a tabela crua em algo acionável.
const TIPOS: Record<string, { label: string; explica: string; tom: "neg" | "warn" | "info" }> = {
  SEM_BIPAR: {
    label: "Levou sem passar",
    explica: "O sensor viu o produto sair sem que ele fosse registrado no totem.",
    tom: "neg",
  },
  BIPAR_E_REMOVER: {
    label: "Passou e devolveu",
    explica: "O produto foi registrado e depois recolocado na prateleira.",
    tom: "warn",
  },
  market_codigo_negado: {
    label: "Código recusado",
    explica: "Alguém digitou um código que não existe no sistema.",
    tom: "info",
  },
  market_codigo_ambiguo: {
    label: "Código ambíguo",
    explica: "Duas pessoas diferentes com o mesmo código — o totem recusou o acesso.",
    tom: "info",
  },
};

function tipo(kind: string) {
  return TIPOS[kind] ?? { label: kind, explica: "Evento registrado pelo totem.", tom: "info" as const };
}

export function SuspeitasClient() {
  const [filtros, setFiltros] = useFiltros();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [soTipo, setSoTipo] = useState<string | null>(null);

  const escopo = filtros.profileId ? `&profileId=${encodeURIComponent(filtros.profileId)}` : "";
  const intervalo = intervaloDe(filtros);
  const chaveIntervalo = `${intervalo.de}|${intervalo.ate}`;
  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    const [conf, lista] = await Promise.allSettled([
      marketRequest<Settings>("settings"),
      marketRequest<Dados>(`suspeitas?${paramsDoPeriodo(intervalo)}${escopo}`),
    ]);
    if (conf.status === "fulfilled") setSettings(conf.value);
    if (lista.status === "fulfilled") setDados(lista.value);
    else setErro(lista.reason instanceof Error ? lista.reason.message : "Falha ao carregar o histórico.");
    setCarregando(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveIntervalo, escopo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const eventos = (dados?.eventos ?? []).filter((e) => !soTipo || e.kind === soTipo);

  return (
    <>
      <Cabecalho titulo="Suspeitas" descricao={`${dados?.eventos.length ?? 0} evento(s) registrados pelos totens`}
        filtros={filtros} setFiltros={setFiltros} perfis={settings?.profiles ?? []}
        carregando={carregando} onAtualizar={() => void carregar()} />

      {erro && <Aviso tom="neg" icone="circle-x" titulo="Não foi possível carregar">{erro}</Aviso>}
      <Aviso tom="info" icone="info-circle" titulo="Isto é um alerta, não uma acusação">
        Falha de leitura, produto trocado de lugar e gente com pressa geram os mesmos registros de quem leva sem pagar. Serve para olhar de perto — o padrão repetido é que diz alguma coisa, não o evento isolado.
      </Aviso>

      {carregando && !dados ? <SkelStats n={3} /> : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12, marginBottom: 14 }}>
        {(dados?.resumo ?? []).slice(0, 4).map((r) => (
          <Stat key={r.kind} label={tipo(r.kind).label} value={String(r.total)}
            tone={tipo(r.kind).tom === "neg" ? "neg" : tipo(r.kind).tom === "warn" ? "warn" : "neutral"}
            icon="alert-triangle" hint={`últimos ${dados?.periodDays ?? 30} dias`} />
        ))}
      </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <Filtro rotulo="Tudo" ativo={soTipo === null} onClick={() => setSoTipo(null)} />
        {(dados?.resumo ?? []).map((r) => (
          <Filtro key={r.kind} rotulo={`${tipo(r.kind).label} (${r.total})`} ativo={soTipo === r.kind} onClick={() => setSoTipo(r.kind)} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: 14 }} className="tm-grid-2">
        <Card style={{ padding: carregando && !dados ? 18 : 0, overflow: "hidden" }}>
          {carregando && !dados ? <SkelLinhas n={7} /> : eventos.length ? (
            <div style={{ display: "grid" }}>
              {eventos.slice(0, 200).map((e) => {
                const t = tipo(e.kind);
                return (
                  // "Levou sem passar" tem ~110px de selo: no celular ele desce
                  // em vez de espremer o nome de quem aparece no evento.
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 16px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                    {e.employeeName
                      ? <Avatar name={e.employeeName} url={e.employeeImage} size={30} />
                      : <span style={{ width: 30, height: 30, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: "var(--surface-2)", color: "var(--text-dim)", fontSize: 13, fontWeight: 800 }}>?</span>}
                    <div style={{ minWidth: 140, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 650, color: "var(--text)" }}>
                        {e.employeeName ?? "Não identificado"}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                        {haQuantoTempo(e.at)}{e.unitName ? ` · ${e.unitName}` : ""}
                      </div>
                    </div>
                    <Badge tone={t.tom}>{t.label}</Badge>
                  </div>
                );
              })}
            </div>
          ) : <Empty icon="shield-check" title="Nenhum evento no período" text="Nada foi registrado pelos totens nesse intervalo." />}
        </Card>

        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <Card>
            <PanelTitle title="Aparecem mais vezes" hint="quem repete no período" />
            {(dados?.reincidentes ?? []).length ? (
              <div style={{ display: "grid", gap: 2 }}>
                {dados!.reincidentes.map((p) => (
                  <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                    <Avatar name={p.name} url={p.image} size={28} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 650, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <Badge tone={p.total >= 5 ? "neg" : p.total >= 3 ? "warn" : "neutral"}>{p.total}</Badge>
                  </div>
                ))}
              </div>
            ) : <Empty icon="users" title="Ninguém repetiu" />}
          </Card>

          <Card>
            <PanelTitle title="O que cada tipo significa" />
            <div style={{ display: "grid", gap: 11 }}>
              {(dados?.resumo ?? []).map((r) => {
                const t = tipo(r.kind);
                return (
                  <div key={r.kind}>
                    <Badge tone={t.tom}>{t.label}</Badge>
                    <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>{t.explica}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Filtro({ rotulo, ativo, onClick }: { rotulo: string; ativo: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={ativo}
      style={{
        padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
        border: `1px solid ${ativo ? "#4703ef" : "var(--border)"}`,
        background: ativo ? "color-mix(in srgb, #4703ef 12%, transparent)" : "var(--surface)",
        color: ativo ? "#4703ef" : "var(--text-dim)",
      }}>{rotulo}</button>
  );
}
