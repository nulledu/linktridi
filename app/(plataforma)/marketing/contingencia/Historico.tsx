"use client";

// ── Histórico ────────────────────────────────────────────────────────────────
// Um snapshot por dia. Sem gráfico por enquanto: uma série escolhida vira
// barras finas (dá pra ler tendência) e a tabela mostra o dia a dia. A
// estrutura (jsonb com o consolidado inteiro) já aguenta comparações futuras.

import { useEffect, useMemo, useState } from "react";
import { DataList, type Coluna } from "../../ui/DataList";
import { Bloco, Vazio } from "./pecas";
import { Icon } from "../../Icon";
import { Abas } from "../../ui/Abas";
import { MonoArea } from "../../ui/graficos";
import { CAMPOS_SERIE, valorDaSerie, variacoes, fmtBRL, type Painel, type Snapshot } from "@/lib/contingencia-const";

const dia = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

const origem = (s: Snapshot) => (s.origem === "cron" ? "automático" : s.autorNome || "manual");
const num = (v: number | string) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>;

// Não aquecidos e Estoque ficam só na tabela: no cartão cada campo custa uma
// linha, e os seis que sobram são os que dizem se a operação andou.
const COLUNAS_DIA: Coluna<Snapshot>[] = [
  { chave: "dia", titulo: "Dia", papel: "titulo", ordenar: (s) => s.dia, render: (s) => <span style={{ fontWeight: 620 }}>{dia(s.dia)}</span> },
  { chave: "celulares", titulo: "Celulares", alinhar: "right", ordenar: (s) => s.dados.celulares.total, render: (s) => num(s.dados.celulares.total) },
  {
    chave: "prontos", titulo: "Prontos", alinhar: "right", ordenar: (s) => s.dados.numeros.prontos,
    render: (s) => <strong style={{ fontVariantNumeric: "tabular-nums" }}>{s.dados.numeros.prontos}</strong>,
  },
  { chave: "aquecendo", titulo: "Aquecendo", alinhar: "right", ordenar: (s) => s.dados.numeros.emAquecimento, render: (s) => num(s.dados.numeros.emAquecimento) },
  { chave: "naoAquec", titulo: "Não aquec.", papel: "oculta", alinhar: "right", ordenar: (s) => s.dados.numeros.naoAquecidos, render: (s) => num(s.dados.numeros.naoAquecidos) },
  { chave: "proxy", titulo: "Com proxy", alinhar: "right", ordenar: (s) => s.dados.numeros.comProxy, render: (s) => num(s.dados.numeros.comProxy) },
  { chave: "bloq", titulo: "Bloqueados", alinhar: "right", ordenar: (s) => s.dados.numeros.bloqueados, render: (s) => num(s.dados.numeros.bloqueados) },
  { chave: "estoque", titulo: "Estoque", papel: "oculta", alinhar: "right", ordenar: (s) => s.dados.numeros.emEstoque, render: (s) => num(s.dados.numeros.emEstoque) },
  { chave: "custo", titulo: "Custo", alinhar: "right", ordenar: (s) => s.dados.custos.total, render: (s) => num(fmtBRL(s.dados.custos.total)) },
  {
    // No cartão a origem vai ao lado do dia, discreta: diz se foi o cron ou
    // alguém salvando à mão, sem competir com os números.
    chave: "origem", titulo: "Origem", papel: "destaque", ordenar: (s) => origem(s),
    render: (s) => <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>{origem(s)}</span>,
  },
];

export function Historico({ painel, offline, snapshotsIniciais }: { painel: Painel; offline: boolean; snapshotsIniciais?: Snapshot[] }) {
  const [dias, setDias] = useState(30);
  const [snaps, setSnaps] = useState<Snapshot[] | null>(snapshotsIniciais ?? null);
  const [serie, setSerie] = useState("prontos");

  useEffect(() => {
    if (offline) return;
    let vivo = true;
    fetch(`/api/marketing/contingencia/historico?dias=${dias}`).then((x) => x.json()).then((r) => {
      if (vivo) setSnaps(r?.ok ? (r.snapshots as Snapshot[]) : []);
    }).catch(() => { if (vivo) setSnaps([]); });
    return () => { vivo = false; };
  }, [dias, offline]);

  const lista = snaps ?? [];
  const campo = CAMPOS_SERIE.find((c) => c.chave === serie) ?? CAMPOS_SERIE[0];
  const barras = useMemo(() => lista.map((s) => ({ rotulo: dia(s.dia), qtd: valorDaSerie(s.dados, serie) })), [lista, serie]);
  const mudou = variacoes(painel.consolidado, painel.anterior);
  const fmt = (chave: string, v: number) => (chave === "custoTotal" ? fmtBRL(v) : String(v));

  return (
    <div className="ct-tel ct-secoes">
      <Bloco titulo="Hoje × último snapshot" icone="git-compare"
        sub={painel.anterior ? "O que mudou desde o dia anterior salvo." : "Ainda não há um dia anterior salvo — salve a Atualização de Hoje e volte amanhã."}>
        {mudou.length ? (
          <div className="cv-celulas">
            {mudou.map((v) => {
              const bom = v.delta > 0 ? v.bomQuandoSobe : !v.bomQuandoSobe;
              return (
                // Mesma célula da Contingência de Tráfego na Visão Geral.
                <div key={v.chave} className="cv-celula">
                  <span className="cv-celula-rot">
                    <span aria-hidden className="cv-celula-icone" style={{ color: bom ? "var(--ok)" : "var(--perigo)", background: `color-mix(in srgb, ${bom ? "var(--ok)" : "var(--perigo)"} 12%, transparent)` }}>
                      <Icon name={v.delta > 0 ? "arrow-up" : "arrow-down"} size={14} color="currentColor" />
                    </span>
                    {v.rotulo}
                  </span>
                  <b className="stat mt-num" style={{ color: bom ? "var(--ok)" : "var(--perigo)" }}>{v.delta > 0 ? "+" : ""}{fmt(v.chave, v.delta)}</b>
                  <span className="cv-celula-sub">{fmt(v.chave, v.antes)} → {fmt(v.chave, v.agora)}</span>
                </div>
              );
            })}
          </div>
        ) : <p className="ct-sub" style={{ marginInline: "auto" }}>{painel.anterior ? "Nada mudou nos indicadores principais." : ""}</p>}
      </Bloco>

      <Bloco titulo="Evolução" icone="chart-line" sub="Uma série por vez, do mais antigo pro mais novo."
        acoes={
          <Abas className="ui-abas--sub" valor={String(dias) as "7" | "30" | "90"} onMuda={(v) => setDias(Number(v))} ariaLabel="Janela do histórico"
            itens={(["7", "30", "90"] as const).map((d) => ({ valor: d, rotulo: `${d} dias` }))} />
        }>
        {/* Mesmo gráfico da Visão Geral (MonoArea); a série escolhida numa
            fileira de abas que rola de lado quando não cabe. */}
        <Abas className="ui-abas--sub" valor={serie} onMuda={setSerie} ariaLabel="Série do gráfico"
          itens={CAMPOS_SERIE.map((c) => ({ valor: c.chave, rotulo: c.rotulo }))} />
        {snaps === null ? <p className="ct-sub">Carregando…</p>
          : barras.length ? (
            <MonoArea altura={220} rotuloDe={(r) => r}
              formatar={serie === "custoTotal" ? fmtBRL : undefined}
              series={[{ nome: campo.rotulo, pontos: barras.map((b) => ({ rotulo: b.rotulo, valor: b.qtd })) }]} />
          )
          : <Vazio icone="history" titulo="Sem histórico ainda" texto="O primeiro snapshot nasce ao salvar a Atualização de Hoje; o cron de madrugada grava os dias seguintes." />}
        <p className="ct-sub" style={{ marginTop: 8 }}>{campo.rotulo}: {campo.bomQuandoSobe ? "subir é bom" : "subir é ruim"}.</p>
      </Bloco>

      {lista.length > 0 && (
        <Bloco titulo="Dia a dia" icone="calendar" sub={`${lista.length} dia${lista.length === 1 ? "" : "s"} salvos`}>
          {/* Mais novo primeiro: é o dia que a pessoa veio conferir. A ordem
              nasce pela coluna Dia (ISO), então clicar nela inverte sem
              depender da ordem em que a API devolveu. */}
          <DataList itens={lista} colunas={COLUNAS_DIA} chaveDe={(s) => s.dia}
            rotulo="Histórico dia a dia" minWidth={760} densa
            ordemInicial={{ coluna: "dia", sentido: "desc" }} />
        </Bloco>
      )}
    </div>
  );
}
