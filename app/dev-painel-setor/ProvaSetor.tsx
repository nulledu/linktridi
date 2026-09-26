"use client";

import { useState } from "react";
import type { Chamada, PessoaEquipe, ProximaFila } from "@/lib/painel-atividades";
import type { ResumoProducao } from "@/lib/painel-producao";
import { ChamadaAceite, FilaParede, KpiPastilha, PessoaCard, Secao } from "@/app/painel/setor/pecas";
import { CorpoLogistica, type LogisticaResumo } from "@/app/painel/setor/LogisticaPanel";
import { CorpoProducao, type MaquinasParede } from "@/app/painel/setor/ProducaoPanel";
import { EsperaSetor } from "@/app/painel/setor/parede";
import "@/app/painel/widgets/widgets.css";

/** Fixtures — nomes e fotos inventados; nenhum dado real. */
const AGORA = Date.parse("2026-09-25T14:30:00Z"); // fixo: Date.now() no módulo diverge entre servidor e cliente (hidratação)
const iso = (minAtras: number) => new Date(AGORA - minAtras * 60000).toISOString();

const CHAMADA_DIRIGIDA: Chamada = {
  id: "c1", tarefa: "Impressão 3D de chancelas", categoria: "Chancela", urgente: false,
  dirigida: true, paraNome: "Rai Almeida", fotoUrl: null, porNome: "Islane",
  mesaAlvo: "Mesa 2", oferecida: false, quantidadeAlvo: 24, desde: iso(7),
};
const CHAMADA_URGENTE_OFERECIDA: Chamada = {
  id: "c2", tarefa: "Corte a laser — reposição", categoria: "Carimbo", urgente: true,
  dirigida: true, paraNome: "Bia Santos", fotoUrl: null, porNome: null,
  mesaAlvo: "Mesa 1", oferecida: true, quantidadeAlvo: 8, desde: iso(2),
};
const CHAMADA_POOL_LOGISTICA: Chamada = {
  id: "c3", tarefa: "Separar pedidos da tarde", categoria: null, urgente: false,
  dirigida: false, paraNome: null, fotoUrl: null, porNome: "Islane",
  mesaAlvo: null, oferecida: false, quantidadeAlvo: 12, desde: iso(31),
};
const CHAMADA_DIRIGIDA_2: Chamada = {
  id: "c4", tarefa: "Montar base da chancela", categoria: "Chancela", urgente: false,
  dirigida: true, paraNome: "Duda Reis", fotoUrl: null, porNome: "Islane",
  mesaAlvo: "Mesa 3", oferecida: false, quantidadeAlvo: 30, desde: iso(12),
};

const EQUIPE: (PessoaEquipe & { extra?: string | null })[] = [
  { id: "p1", nome: "Rai Almeida", fotoUrl: null, presente: true, emAtividade: { tarefa: "Impressão 3D", desde: iso(34) }, concluidasHoje: 5, pecasHoje: 120, aguardando: 1, extra: "TMA 32 min" },
  { id: "p2", nome: "Bia Santos", fotoUrl: null, presente: true, emAtividade: null, concluidasHoje: 3, pecasHoje: 45, aguardando: 0 },
  { id: "p3", nome: "Carlos Lima", fotoUrl: null, presente: false, emAtividade: null, concluidasHoje: 0, pecasHoje: 0, aguardando: 2 },
  { id: "p4", nome: "Duda Reis", fotoUrl: null, presente: null, emAtividade: null, concluidasHoje: 1, pecasHoje: 18, aguardando: 0 },
  { id: "p5", nome: "Léo Martins", fotoUrl: null, presente: true, emAtividade: { tarefa: "Emborrachamento", desde: iso(12) }, concluidasHoje: 2, pecasHoje: 60, aguardando: 0 },
  { id: "p6", nome: "Nina Prado", fotoUrl: null, presente: true, emAtividade: { tarefa: "Montagem de carimbos", desde: iso(5) }, concluidasHoje: 4, pecasHoje: 88, aguardando: 0 },
  { id: "p7", nome: "Téo Nunes", fotoUrl: null, presente: true, emAtividade: null, concluidasHoje: 0, pecasHoje: 0, aguardando: 0 },
];

const FILA: ProximaFila[] = [
  { id: "f1", tarefa: "Emborrachamento", categoria: "Chancela", urgente: true, quantidadeAlvo: 30, tempoEstimadoMin: 45, criadaEm: iso(4) },
  { id: "f2", tarefa: "Montagem de carimbos", categoria: "Carimbo", urgente: false, quantidadeAlvo: 12, tempoEstimadoMin: 40, criadaEm: iso(90) },
  { id: "f3", tarefa: "Acabamento e revisão", categoria: "Chancela", urgente: false, quantidadeAlvo: 50, tempoEstimadoMin: null, criadaEm: iso(240) },
  { id: "f4", tarefa: "Corte a laser — MDF 3mm", categoria: "Carimbo", urgente: false, quantidadeAlvo: 20, tempoEstimadoMin: 25, criadaEm: iso(300) },
];

type Estado = "normal" | "problemas" | "vazio" | "offline" | "parado" | "carregando" | "erro";

function logistica(e: Estado): LogisticaResumo {
  const vazio = e === "vazio";
  const problemas = e === "problemas";
  return {
    atualizadoEm: e === "parado" ? iso(42) : iso(1),
    entrada: vazio ? 0 : 38, logistica: vazio ? 0 : 54, total: vazio ? 0 : 92,
    enviadosHoje: vazio ? 0 : 47,
    etiquetasPendentes: vazio ? 0 : problemas ? 14 : 0,
    prontosParaEnvio: vazio ? 0 : 21,
    prontosFaltandoEstoque: vazio ? 0 : problemas ? 6 : 0,
    categorias: vazio ? [] : [
      { chave: "a_emitir", rotulo: "Etiqueta a emitir", valor: 14, anterior: 10 },
      { chave: "separacao", rotulo: "Em separação", valor: 22, anterior: 25 },
      { chave: "conferencia", rotulo: "Conferência", valor: 9, anterior: 9 },
      { chave: "embalagem", rotulo: "Embalagem", valor: 17, anterior: 12 },
    ],
    faltaProducao: vazio || !problemas ? [] : [
      { categoria: "Chancela 38mm", total: 27, pedidos: 9 },
      { categoria: "Carimbo automático", total: 12, pedidos: 5 },
    ],
    criticos: vazio || !problemas ? [] : [
      { etapa: "logistica", caixa: "114", dias: 12, urgente: true, bloqueado: false, pendencias: ["Etiqueta", "Nota fiscal"], faltam: 0, itens: 3 },
      { etapa: "entrada", caixa: "087", dias: 8, urgente: false, bloqueado: true, pendencias: [], faltam: 2, itens: 5 },
      { etapa: "logistica", caixa: null, dias: 7, urgente: false, bloqueado: false, pendencias: ["Conferência"], faltam: 0, itens: 1 },
    ],
    semana: vazio ? undefined : {
      dias: ["Sex", "Sáb", "Dom", "Seg", "Ter", "Qua", "Qui"].map((rotulo, i) => ({ rotulo, valor: [52, 18, 0, 61, 57, 70, 47][i] } as never)),
      mediaMovel: [44, 42, 40, 43, 46, 49, 50], total: 305, totalAnterior: 280, variacaoPct: 9, periodo: "19/09 – 25/09",
    },
  };
}

function producao(e: Estado): ResumoProducao {
  const vazio = e === "vazio";
  const problemas = e === "problemas";
  return {
    atualizadoEm: e === "parado" ? iso(42) : iso(1), dia: "2026-09-25", ehHoje: !vazio,
    pecasHoje: vazio ? 0 : 342, emAndamento: vazio ? 0 : 4, pendentes: vazio ? 0 : 11,
    urgentes: problemas ? 2 : 0, impedidas: problemas ? 1 : 0, concluidasHoje: vazio ? 0 : 18,
    tmaMin: vazio ? null : 34, operadoresAtivos: vazio ? 0 : 6, operadores: [],
  };
}

function maquinas(e: Estado): MaquinasParede {
  const oee = { disponibilidade: 88, desempenho: 81, qualidade: 99, oee: 71, faixa: "boa", qualidadeApontada: true, minutosPerdidos: 40, pecas: 0, refugos: 0 } as never;
  const m = (id: string, nome: string, estado: "produzindo" | "aguardando" | "parada", extra: object = {}) => ({
    id, nome, porte: "M", materiais: null, estado, minutosHoje: 120, atual: null, paradaMotivo: null, paradaPrevisao: null, proximas: [], oee, ...extra,
  });
  return {
    oee,
    maquinas: e === "vazio" ? [] : [
      m("m1", "Laser 1", "produzindo", { atual: { referencia: "Chancela 38mm — lote 12", material: "MDF", inicio: iso(20), previsaoTermino: null, progressoPct: 64, minutosRestantes: 12 } }),
      m("m2", "Laser 2", "produzindo", { atual: { referencia: "Carimbo automático", material: "Acrílico", inicio: iso(8), previsaoTermino: null, progressoPct: 22, minutosRestantes: 30 } }),
      m("m3", "Laser 3", e === "problemas" ? "parada" : "aguardando", e === "problemas" ? { paradaMotivo: "Troca de lente" } : {}),
    ],
  } as MaquinasParede;
}

const ESTADOS: Estado[] = ["normal", "problemas", "vazio", "parado", "offline", "carregando", "erro"];
type Chama = "nenhuma" | "dirigida" | "urgente" | "pool" | "varias";

/** O palco da TV, na medida do KioskShell (padding incluso), escalado pra caber. */
function Palco({ w, h, escala, pad, children }: { w: number; h: number; escala: number; pad: string; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: "100%", overflow: "auto", borderRadius: 20 }}>
      <div style={{ width: w * escala, height: h * escala, flex: "none" }}>
        <div className="pele-clara" data-palco={`${w}x${h}`}
          style={{ width: w, height: h, transform: escala === 1 ? undefined : `scale(${escala})`, transformOrigin: "top left", position: "relative", background: "#f5f4fa", color: "var(--text)", overflow: "hidden", boxShadow: "0 20px 60px rgb(20 20 46 / .18)" }}>
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: pad, boxSizing: "border-box" }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProvaSetor() {
  const [chamada, setChamada] = useState<Chama>("nenhuma");
  const [estado, setEstado] = useState<Estado>("normal");
  const [escala, setEscala] = useState<1 | 1.5>(1);
  const chamadas: Chamada[] =
    chamada === "dirigida" ? [CHAMADA_DIRIGIDA]
    : chamada === "urgente" ? [CHAMADA_URGENTE_OFERECIDA]
    : chamada === "pool" ? [CHAMADA_POOL_LOGISTICA]
    : chamada === "varias" ? [CHAMADA_URGENTE_OFERECIDA, CHAMADA_DIRIGIDA, CHAMADA_DIRIGIDA_2]
    : [];
  const offline = estado === "offline";
  const cachedAt = offline ? iso(18) : iso(1);
  const esperando = estado === "carregando" || estado === "erro";

  const botao = (ativo: boolean): React.CSSProperties => ({
    padding: "8px 14px", minHeight: 44, borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 700,
    border: "1px solid rgba(20,20,46,.14)", background: ativo ? "#fff" : "transparent", color: "inherit",
  });

  return (
    <main className="pele-clara" style={{ minHeight: "100dvh", background: "#e9e7f3", color: "#14142e", padding: "24px min(4vw, 40px) 80px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Prova · painéis de setor</h1>
      <p style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 16 }}>
        Dados de mentira. Os painéis reais (dados vivos) ficam em /painel — tipo Produção ou Logística.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {ESTADOS.map((k) => <button key={k} onClick={() => setEstado(k)} style={botao(estado === k)}>{k}</button>)}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {(["nenhuma", "dirigida", "urgente", "pool", "varias"] as const).map((k) => (
          <button key={k} onClick={() => setChamada(k)} style={botao(chamada === k)}>chamada: {k}</button>
        ))}
        <button onClick={() => setEscala(1)} style={botao(escala === 1)}>palco 1280×720</button>
        <button onClick={() => setEscala(1.5)} style={botao(escala === 1.5)}>TV 1920×1080</button>
      </div>

      <Secao titulo="Produção (16:9)" icone="tools" style={{ marginBottom: 28 }}>
        <Palco w={1280} h={720} escala={escala} pad="48px 64px">
          {esperando
            ? <EsperaSetor erro={estado === "erro"} setor="produção" icone="tools" />
            : <CorpoProducao resumo={producao(estado)} equipe={estado === "vazio" ? [] : EQUIPE} proximas={estado === "vazio" ? [] : FILA}
                faltaProducao={logistica(estado).faltaProducao ?? []} maquinas={maquinas(estado)}
                offline={offline} cachedAt={cachedAt} agoraMs={AGORA} />}
          <ChamadaAceite chamadas={chamadas} setor="producao" agoraMs={AGORA} />
        </Palco>
      </Secao>

      <Secao titulo="Logística (9:16, em pé)" icone="truck-delivery" style={{ marginBottom: 28 }}>
        <Palco w={720} h={1280} escala={escala === 1.5 ? 0.84375 : 0.5625} pad="40px 36px">
          {esperando
            ? <EsperaSetor erro={estado === "erro"} setor="logística" icone="truck-delivery" />
            : <CorpoLogistica logi={logistica(estado)} equipe={estado === "vazio" ? [] : EQUIPE} offline={offline} cachedAt={cachedAt} agoraMs={AGORA} />}
          <ChamadaAceite chamadas={chamadas} setor="logistica" agoraMs={AGORA} />
        </Palco>
      </Secao>

      <Secao titulo="Peças soltas" icone="users" style={{ marginBottom: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 10, marginBottom: 14 }}>
          {EQUIPE.slice(0, 4).map((p, i) => <PessoaCard key={p.id} p={p} agoraMs={AGORA} i={i} />)}
        </div>
        <div style={{ maxWidth: 560, marginBottom: 14 }}><FilaParede proximas={FILA} agoraMs={AGORA} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 10, maxWidth: 720 }}>
          <KpiPastilha icone="box" rotulo="peças hoje" valor={342} />
          <KpiPastilha icone="circle-check" rotulo="concluídas" valor={18} cor="var(--ok)" />
          <KpiPastilha icone="flame" rotulo="urgentes" valor={2} cor="var(--perigo)" />
          <KpiPastilha icone="clock" rotulo="TMA equipe" texto="34 min" />
        </div>
      </Secao>
    </main>
  );
}
