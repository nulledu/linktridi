"use client";

// "Em que horas mais entra e mais sai pedido?" — o ritmo, setor por setor.
//
// Entrada Logística e Logística aparecem separadas porque são filas diferentes:
// a Entrada pode estar acumulando enquanto a Logística despacha bem, e o número
// somado mostraria "tudo certo".
//
// Carrega SOB DEMANDA (o bloco começa fechado): a leitura das trocas de etapa
// varre o log de texto do ERP e não pode sair a cada abertura da página.
// Quando abre, busca uma vez; o cache de 10 min do servidor cobre o resto.

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { RitmoLogistica, SetorRitmo, PorHora } from "@/lib/logistica-ritmo";
import { Icon } from "../Icon";
import { grade } from "../ui/grade";
import { Fila, NumeroVivo, useAbrirFechar } from "../ui/micro";
import { corDaSerie } from "../ui/graficos";

// O bloco nasce fechado: recharts só chega quando alguém abre o Ritmo.
const MonoRoundedBarChart = dynamic(
  () => import("../ui/monocharts/MonoRoundedBarChart").then((m) => m.MonoRoundedBarChart),
  { ssr: false },
);
const MonoRoundedLineChart = dynamic(
  () => import("../ui/monocharts/MonoRoundedLineChart").then((m) => m.MonoRoundedLineChart),
  { ssr: false },
);

const fmt = (n: number) => n.toLocaleString("pt-BR");
const hh = (h: number) => `${String(h).padStart(2, "0")}h`;

// Entrada e saída são duas SÉRIES, não dois estados — então a cor vem da rampa
// do destaque escolhido pela pessoa, e não de um índigo/verde escritos aqui.
// (Verde continua reservado ao que SIGNIFICA: o saldo que reduziu a fila.)
const COR_ENTRADA = corDaSerie(0);
const COR_SAIDA = corDaSerie(1);

export function Ritmo() {
  const [aberto, setAberto] = useState(false);
  const [dias, setDias] = useState(7);
  const [setor, setSetor] = useState<"entrada" | "logistica">("entrada");
  const [dados, setDados] = useState<RitmoLogistica | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async (janela: number) => {
    setCarregando(true); setErro(false);
    try {
      const r = await fetch(`/api/logistica/ritmo?dias=${janela}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setDados(await r.json());
    } catch { setErro(true); } finally { setCarregando(false); }
  }, []);

  useEffect(() => { if (aberto) carregar(dias); }, [aberto, dias, carregar]);

  const atual = dados?.setores.find((s) => s.chave === setor) ?? dados?.setores[0];
  // Sanfona de verdade: o bloco fechava por corte seco, e o conteúdo precisa
  // continuar MONTADO enquanto a altura volta a zero — é só pra isso que o hook
  // serve aqui. Abrir e fechar são simétricos (`--acc-expand`/`--acc-collapse`):
  // sanfona é uma das exceções da regra "fechar mais rápido que abrir".
  const { montado } = useAbrirFechar(aberto, "--acc-collapse");

  return (
    // `data-open` sai de `aberto`, não do estado do hook: a seta é o único
    // retorno visível do toque, e atrasá-la dois quadros é o que faz a pessoa
    // clicar de novo. O painel já existe no DOM desde sempre, então a transição
    // de altura roda igual.
    <div className="glass glass-spec t-acc" data-open={aberto ? "true" : "false"}
      style={{ padding: 20, borderRadius: 20, marginTop: 18 }}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: "var(--tap)",
          background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textAlign: "left", flexWrap: "wrap",
        }}
      >
        <Icon name="chart-bar" size={18} color="var(--info)" />
        <h2 style={{ fontSize: 17, fontWeight: 800 }}>Ritmo do setor</h2>
        <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>horários de pico, acúmulo e tempo de fila</span>
        {/* Sempre `chevron-down`: quem vira a seta é o `scaleY(-1)` do
            `.t-acc-chevron`. Trocar o NOME do ícone faria a seta pular entre
            dois desenhos no meio da abertura, em vez de girar junto com ela. */}
        <Icon className="t-acc-chevron" name="chevron-down" size={16} color="var(--text-dim)" />
      </button>

      <div className="t-acc-panel">
        {/* O respiro mora no `-inner`, NUNCA no `-panel`: padding numa trilha
            de `0fr` deixa uma tira residual e o bloco nunca fecha de verdade. */}
        <div className="t-acc-panel-inner">
          {!montado ? null : (
            <div style={{ paddingTop: 16 }}>
              {/* Setor primeiro: é a divisão que muda o que se está olhando. */}
              <div className="tab-strip" style={{ display: "flex", gap: 7, marginBottom: 10 }}>
                {(dados?.setores ?? []).map((s) => (
                  <Pilula key={s.chave} ativo={setor === s.chave} cor="var(--info)" onClick={() => setSetor(s.chave)}>
                    {s.label}
                  </Pilula>
                ))}
              </div>
              <div className="tab-strip" style={{ display: "flex", gap: 7, marginBottom: 14 }}>
                {[7, 30].map((d) => (
                  <Pilula key={d} ativo={dias === d} cor="var(--text-dim)" onClick={() => setDias(d)}>{d} dias</Pilula>
                ))}
              </div>

              {carregando && !dados ? (
                <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>Lendo o histórico do ERP…</p>
              ) : erro || !dados || !atual ? (
                <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>Não foi possível ler o ritmo agora. Tente de novo em alguns minutos.</p>
              ) : (
                <>
                  {/* Quando o ERP só aguentou uma janela menor, o número não é o
                      do botão — dizer isso evita ler 3 dias como se fossem 7. */}
                  {!dados.etapasIndisponiveis && dados.diasLidosEtapas < dados.janelaDias && (
                    <div style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 12, fontSize: 11.5, color: "var(--text-dim)" }}>
                      <Icon name="info-circle" size={14} color="var(--text-dim)" />
                      <span>O log do ERP só respondeu {dados.diasLidosEtapas} dias; as séries de etapa cobrem esse período, não {dados.janelaDias}.</span>
                    </div>
                  )}
                  <SetorPainel setor={atual} janelaDias={dados.diasLidosEtapas || dados.janelaDias} />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Pilula({ ativo, cor, onClick, children }: { ativo: boolean; cor: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      minHeight: "var(--tap)", padding: "0 14px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, fontWeight: 700, flex: "none",
      border: `1px solid ${ativo ? cor : "var(--border)"}`,
      background: ativo ? `color-mix(in srgb, ${cor} 18%, transparent)` : "var(--surface)",
      color: ativo ? cor : "var(--text)",
    }}>{children}</button>
  );
}

export function SetorPainel({ setor, janelaDias }: { setor: SetorRitmo; janelaDias: number }) {
  const saldo = setor.porDia.reduce((a, d) => a + d.entradas - d.saidas, 0);
  // Saldo só faz sentido quando as DUAS pontas são fluxo da mesma janela.
  const confiavel = setor.fluxoEntradaDisponivel && !setor.saidasIndisponiveis;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Resumo do setor: fila, tempo médio e se está acumulando */}
      <Fila className="kpi-row" style={{ display: "grid", gridTemplateColumns: grade(150, 3, 12), gap: 12 }}>
        <Numero titulo="Na fila agora" valor={<NumeroVivo valor={setor.pedidosNaFila} />} sub="pedidos parados" />
        <Numero titulo="Tempo médio de fila"
          valor={setor.horasMedia == null ? "—" : setor.horasMedia >= 48 ? `${Math.round(setor.horasMedia / 24)}d` : `${setor.horasMedia}h`}
          sub="desde a aprovação" cor={(setor.horasMedia ?? 0) >= 72 ? "var(--atencao)" : undefined} />
        {confiavel ? (
          <Numero titulo={`Saldo em ${janelaDias}d`}
            // O sinal vai escrito: cor sozinha não chega em quem não distingue
            // vermelho de verde, e aqui ela é a informação inteira.
            valor={<NumeroVivo valor={saldo} formatar={(n) => (n > 0 ? `+${fmt(Math.round(n))}` : fmt(Math.round(n)))} />}
            sub={saldo > 0 ? "acumulou" : saldo < 0 ? "reduziu a fila" : "empatado"}
            cor={saldo > 0 ? "var(--perigo)" : "var(--ok)"} />
        ) : (
          <Numero titulo={`Saíram em ${janelaDias}d`} valor={<NumeroVivo valor={setor.totalSaidas} />}
            sub={setor.rotuloSaida.toLowerCase()} />
        )}
      </Fila>

      <div style={{ display: "grid", gridTemplateColumns: grade(260, 2, 14), gap: 14 }}>
        <Histograma titulo={`${setor.rotuloEntrada} por hora`}
          sub={setor.fluxoEntradaDisponivel ? `${fmt(setor.totalEntradas)} em ${janelaDias}d` : `${fmt(setor.totalEntradas)} pedidos na fila`}
          dados={setor.entradasPorHora} cor={COR_ENTRADA} indisponivel={setor.entradasIndisponiveis}
          nota={setor.notaEntrada} />
        <Histograma titulo={`${setor.rotuloSaida} por hora`}
          sub={`${fmt(setor.totalSaidas)} em ${janelaDias}d`}
          dados={setor.saidasPorHora} cor={COR_SAIDA} indisponivel={setor.saidasIndisponiveis} />
      </div>

      <PorDia setor={setor} />
    </div>
  );
}

// O `style` não é enfeite de assinatura: é por ele que a `Fila` carimba o
// `--mt-i` em cada cartão. Sem repassá-lo ao nó, os três entrariam no mesmo
// instante e a fileira deixaria de "chegar".
function Numero({ titulo, valor, sub, cor, style }: { titulo: string; valor: React.ReactNode; sub: string; cor?: string; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: 14, padding: "13px 15px", minWidth: 0, ...style }}>
      <div style={{ fontSize: 12.5, color: "var(--text-dim)", fontWeight: 600 }}>{titulo}</div>
      <div className="stat" style={{ fontSize: 26, marginTop: 3, color: cor ?? "var(--text)" }}>{valor}</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{sub}</div>
    </div>
  );
}

// Barras 0–23h na arte mono-rounded (pílula, grade só horizontal, valor exato
// na dica). O SVG estica sozinho, então as 24 horas cabem em 320px sem a
// rolagem lateral que a versão de divs precisava ter.
export function Histograma({ titulo, sub, dados, cor, indisponivel, nota }: {
  titulo: string; sub: string; dados: PorHora[]; cor: string; indisponivel?: boolean; nota?: string;
}) {
  const pico = dados.reduce((a, b) => (b.total > a.total ? b : a), dados[0]);

  return (
    <div style={{ background: "var(--surface)", borderRadius: 14, padding: "14px 16px", minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{titulo}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginBottom: 12 }}>
        {indisponivel ? "indisponível — o log do ERP não respondeu" : sub}
      </div>

      {indisponivel ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "var(--text-dim)" }}>
          <Icon name="info-circle" size={15} color="var(--text-dim)" />
          <span>Esta série sai do log de alterações, que não é indexado por texto. O resto do painel continua válido.</span>
        </div>
      ) : (
        <>
          {/* `--mono-tinta` no palco é o jeito da fundação de dar cor a um
              gráfico: a barra pinta por essa variável, então a série inteira
              troca de cor num lugar só — e a cor vem da rampa da pessoa. */}
          <MonoRoundedBarChart
            semCartao
            pontos={dados.map((d) => ({ label: hh(d.hora), primary: d.total }))}
            nomePrimario="Movimentos"
            altura={132}
            formatar={fmt}
          />
          <div style={{ fontSize: 12, marginTop: 10 }}>
            Pico: <b style={{ color: cor }}>{hh(pico.hora)}</b>{" "}
            <span style={{ color: "var(--text-dim)" }}>({fmt(pico.total)})</span>
          </div>
          {/* A nota diz o que a série É quando ela não é o fluxo da janela —
              sem isso o número parece uma coisa e é outra. */}
          {nota && (
            <div style={{ display: "flex", gap: 7, alignItems: "flex-start", marginTop: 9, fontSize: 11, color: "var(--text-dim)" }}>
              <Icon name="info-circle" size={13} color="var(--text-dim)" />
              <span>{nota}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Entrou × saiu por dia — a leitura de acúmulo: a linha de entrada correndo
// ACIMA da de saída, dia após dia, é fila crescendo neste setor.
//
// Eram duas barras coladas por dia, num bloco que rolava de lado. Em 30 dias
// isso são 60 barras de 8px que ninguém compara — e o que a pessoa precisa ler
// aqui é a DISTÂNCIA entre as duas séries, que é justamente o que duas linhas
// mostram e sessenta barrinhas escondem.
export function PorDia({ setor }: { setor: SetorRitmo }) {
  // No conjunto Monocharts a série ATIVA é a tinta da pessoa e a de referência
  // é cinza tracejada. Aqui isso cai bem no assunto: "saiu" é o desempenho e
  // "entrou" é a régua contra a qual ele se lê.
  //
  // Série que o ERP não respondeu continua dizendo isso no NOME — antes ela só
  // ficava com 25% de opacidade, e uma linha pálida não distingue "quase nada
  // aconteceu" de "não sabemos o que aconteceu".
  // O nome carrega o "(indisponível)": série que o ERP não respondeu precisa
  // dizer isso por ESCRITO. Antes ela só ficava com 25% de opacidade, e uma
  // linha pálida não distingue "quase nada aconteceu" de "não sabemos".
  const nomeSaida = setor.saidasIndisponiveis ? `${setor.rotuloSaida} (indisponível)` : setor.rotuloSaida;
  const nomeEntrada = setor.entradasIndisponiveis ? `${setor.rotuloEntrada} (indisponível)` : setor.rotuloEntrada;

  return (
    <div style={{ background: "var(--surface)", borderRadius: 14, padding: "14px 16px", minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
        {setor.fluxoEntradaDisponivel ? "Entrou × saiu por dia" : `${setor.rotuloSaida} por dia`}
      </div>
      {/* Linha do Monocharts: "saiu" é a série ativa (tinta da pessoa) e
          "entrou" vira a linha de referência tracejada — é contra ela que se
          lê se o setor está dando conta do que chega. */}
      <MonoRoundedLineChart
        semCartao
        altura={140}
        formatar={fmt}
        rotuloDe={diaCurto}
        nome={nomeSaida}
        nomeApoio={nomeEntrada}
        pontos={setor.porDia.map((d) => ({
          rotulo: d.dia,
          valor: d.saidas,
          apoio: setor.fluxoEntradaDisponivel ? d.entradas : undefined,
        }))}
      />
    </div>
  );
}

const diaCurto = (d?: string) => (d ? `${d.slice(8)}/${d.slice(5, 7)}` : "");
