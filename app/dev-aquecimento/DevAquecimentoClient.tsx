"use client";

// Dados de exemplo + componentes reais do Aquecimento. Não fala com o banco: o
// que se confere aqui é LAYOUT (320/390/430) e movimento, não dados.

import { useMemo, useState } from "react";
import { Hoje } from "../(plataforma)/marketing/aquecimento/Hoje";
import { Ativos } from "../(plataforma)/marketing/aquecimento/Ativos";
import { Roteiros } from "../(plataforma)/marketing/aquecimento/Roteiros";
import { GavetaAtivo } from "../(plataforma)/marketing/aquecimento/GavetaAtivo";
import {
  somaDias, hojeISO,
  type Aparelho, type Ativo, type Etapa, type Marco, type Roteiro,
} from "@/lib/marketing-aquecimento-const";

const hoje = hojeISO();
const atras = (n: number) => somaDias(hoje, -n);

const etapa = (id: string, dia: number, titulo: string): Etapa =>
  ({ id, roteiroId: "r-num", ordem: dia, dia, titulo, detalhe: null, removidaEm: null });

const ETAPAS_NUM: Etapa[] = [
  etapa("n0", 0, "Chip ativado e número registrado"),
  etapa("n1", 1, "WhatsApp instalado, foto e nome preenchidos"),
  etapa("n2", 3, "Conversa com 5 contatos reais"),
  etapa("n3", 6, "Entrar em 2 grupos"),
  etapa("n4", 7, "20 conversas iniciadas"),
  etapa("n5", 11, "Primeiro disparo de lista pequena (30)"),
  etapa("n6", 15, "Volume para 100/dia"),
  etapa("n7", 21, "Encerrar aquecimento — marcar como aquecido"),
];

const ETAPAS_CONTA: Etapa[] = [
  { ...etapa("c0", 0, "Conta criada e meio de pagamento validado"), roteiroId: "r-conta" },
  { ...etapa("c1", 2, "Pixel/CAPI ligado e evento chegando"), roteiroId: "r-conta" },
  { ...etapa("c2", 5, "Primeiro criativo, R$ 20/dia"), roteiroId: "r-conta" },
  { ...etapa("c3", 12, "Orçamento para R$ 50/dia"), roteiroId: "r-conta" },
  { ...etapa("c4", 18, "Encerrar aquecimento — liberar para escala"), roteiroId: "r-conta" },
];

// Um rosto de verdade e o resto em iniciais: é assim na vida real (só quem tem
// conta no ERP tem foto), e as duas formas precisam pesar igual na linha.
const ROSTO_EXEMPLO =
  "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
       <rect width="64" height="64" fill="#7c5cff"/>
       <circle cx="32" cy="25" r="11" fill="#e9e4ff"/>
       <path d="M10 62c2-13 11-20 22-20s20 7 22 20z" fill="#e9e4ff"/>
     </svg>`);

const base = (o: Partial<Ativo>): Ativo => ({
  id: "x", tipo: "numero", nome: "", identificador: null, paiId: null, status: "aquecendo",
  roteiroId: "r-num", iniciadoEm: atras(9), pausadoEm: null, responsavelId: null,
  responsavelNome: "Ana Paula", responsavelFoto: null,
  aparelho: "Moto G54 · mesa 3", operadora: "Claro",
  obs: null, ...o,
});

// Fichas de aparelho. Uma COM foto e duas sem, de propósito: os dois estados
// convivem na mesma grade no dia a dia (alguém fotografa um celular hoje e o
// resto na semana que vem), e é aí que dá pra ver se o quadro vazio some no meio
// dos que têm foto. A foto é um SVG embutido — o preview não fala com o banco
// nem com o bucket, e um `<img>` apontando pra fora não carregaria offline.
const FOTO_EXEMPLO =
  "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="190" viewBox="0 0 140 190">
       <rect width="140" height="190" fill="#2b3340"/>
       <rect x="26" y="18" width="88" height="154" rx="14" fill="#11151c" stroke="#48566b" stroke-width="3"/>
       <rect x="34" y="30" width="72" height="118" rx="7" fill="#1d6b4f"/>
       <circle cx="70" cy="160" r="7" fill="none" stroke="#48566b" stroke-width="3"/>
       <rect x="55" y="23" width="30" height="4" rx="2" fill="#48566b"/>
     </svg>`);

const APARELHOS: Aparelho[] = [
  { nome: "Redmi 12 · mesa 1", modelo: "Redmi 12", fotoUrl: FOTO_EXEMPLO,
    lugar: "mesa 1", obs: "Tela trocada em maio." },
  { nome: "Moto G54 · mesa 3", modelo: "Moto G54", fotoUrl: null, lugar: "mesa 3", obs: null },
  { nome: "Galaxy A15 · reserva", modelo: "Galaxy A15", fotoUrl: null,
    lugar: "gaveta do armário", obs: "Sem chip — disponível." },
];

const ATIVOS: Ativo[] = [
  base({ id: "bm1", tipo: "bm", nome: "BM Tridi · Principal", identificador: "1090…4471",
         roteiroId: null, aparelho: null, operadora: null, status: "em_uso", iniciadoEm: atras(62),
         responsavelNome: "Rafa Souza" }),
  base({ id: "ct4", tipo: "conta", nome: "Conta 04 — Escala", identificador: "act_7781…0032",
         paiId: "bm1", roteiroId: "r-conta", status: "aquecido", iniciadoEm: atras(30),
         aparelho: null, operadora: null, responsavelNome: "Rafa Souza" }),
  base({ id: "ct7", tipo: "conta", nome: "Conta 07 — Escala", identificador: "act_7781…9914",
         paiId: "bm1", roteiroId: "r-conta", iniciadoEm: atras(12),
         aparelho: null, operadora: null, responsavelNome: "Caio Silva" }),
  base({ id: "ct9", tipo: "conta", nome: "Conta 09 — Reserva", identificador: "act_7781…2205",
         paiId: "bm1", roteiroId: "r-conta", status: "restrito", pausadoEm: atras(4),
         iniciadoEm: atras(20), aparelho: null, operadora: null, responsavelNome: "Caio Silva" }),
  base({ id: "n1", nome: "(62) 9 9184-2207", operadora: "Vivo", status: "aquecido", iniciadoEm: atras(40),
         responsavelNome: "Ana Paula", responsavelFoto: ROSTO_EXEMPLO }),
  base({ id: "n2", nome: "(62) 9 9331-7745" }),
  base({ id: "n3", nome: "(62) 9 8145-3390" }),
  base({ id: "n4", nome: "(62) 9 9002-1187", aparelho: "Redmi 12 · mesa 1", operadora: "TIM", iniciadoEm: atras(3) }),
  base({ id: "n5", nome: "(62) 9 9440-6621", aparelho: "Redmi 12 · mesa 1", operadora: "TIM", iniciadoEm: atras(3) }),
  base({ id: "n6", nome: "(62) 9 8802-1190", aparelho: "Poco X5", operadora: "TIM",
         status: "banido", pausadoEm: atras(10), iniciadoEm: atras(45) }),
];

// n2/n3 atrasados na etapa "20 conversas"; ct7 com etapas ADIANTADAS (apressado).
const MARCOS: Marco[] = [
  ...["n0", "n1", "n2", "n3"].map((e) => ({ id: `m2${e}`, ativoId: "n2", etapaId: e, feitoEm: atras(9 - Number(e[1]) * 2), autorId: null, autorNome: "Ana Paula" })),
  ...["n0", "n1", "n2"].map((e) => ({ id: `m3${e}`, ativoId: "n3", etapaId: e, feitoEm: atras(8), autorId: null, autorNome: "Ana Paula" })),
  ...["c0", "c1", "c2"].map((e) => ({ id: `m7${e}`, ativoId: "ct7", etapaId: e, feitoEm: atras(11), autorId: null, autorNome: "Caio Silva" })),
  ...ETAPAS_CONTA.map((e) => ({ id: `m4${e.id}`, ativoId: "ct4", etapaId: e.id, feitoEm: atras(12), autorId: null, autorNome: "Rafa Souza" })),
  ...ETAPAS_NUM.map((e) => ({ id: `m1${e.id}`, ativoId: "n1", etapaId: e.id, feitoEm: atras(19), autorId: null, autorNome: "Ana Paula" })),
];

const ROTEIROS: Roteiro[] = [
  { id: "r-num", nome: "Chip WhatsApp — padrão", tipo: "numero", ativo: true, etapas: ETAPAS_NUM },
  { id: "r-conta", nome: "Conta de anúncio — padrão", tipo: "conta", ativo: true, etapas: ETAPAS_CONTA },
];

const VISOES = ["Hoje", "Estrutura Meta", "WhatsApp", "Roteiros"] as const;

export function DevAquecimentoClient() {
  const [v, setV] = useState<(typeof VISOES)[number]>("Hoje");
  // ?vazio=1 renderiza o estado do DIA 1 (nada cadastrado). Sem isso o vazio era
  // o unico caminho da tela impossivel de conferir aqui — e foi justamente nele
  // que apareceu um desalinhamento.
  const vazio = typeof location !== "undefined" && new URLSearchParams(location.search).has("vazio");
  const [aberto, setAberto] = useState<Ativo | null>(null);

  const etapasPorRoteiro = useMemo(
    () => new Map([["r-num", ETAPAS_NUM], ["r-conta", ETAPAS_CONTA]]), []);
  const marcosPorAtivo = useMemo(() => {
    const m = new Map<string, Marco[]>();
    for (const x of MARCOS) {
      const l = m.get(x.ativoId);
      if (l) l.push(x); else m.set(x.ativoId, [x]);
    }
    return m;
  }, []);

  const nada = async () => true;

  return (
    <div style={{ padding: "20px 16px 60px", maxWidth: 1120, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", margin: "0 0 4px" }}>
        Aquecimento
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 18px" }}>
        Preview de desenvolvimento — componentes reais, dados de exemplo.
      </p>

      <div className="tab-strip" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {VISOES.map((x) => (
          <button key={x} onClick={() => setV(x)} className="aq-bt-sm" style={{
            flex: "0 0 auto", padding: "0 14px", borderRadius: 999,
            font: "inherit", fontSize: 13.5, fontWeight: 580, cursor: "pointer",
            background: v === x ? "var(--text)" : "var(--surface-2)",
            color: v === x ? "var(--bg)" : "var(--text-dim)",
            border: `1px solid ${v === x ? "transparent" : "var(--border)"}`,
          }}>{x}</button>
        ))}
      </div>

      {v === "Hoje" && (
        <Hoje ativos={vazio ? [] : ATIVOS} etapasPorRoteiro={etapasPorRoteiro} marcosPorAtivo={marcosPorAtivo}
          podeEditar onMarcar={nada} onAbrir={setAberto} />
      )}
      {(v === "Estrutura Meta" || v === "WhatsApp") && (
        <Ativos ativos={vazio ? [] : ATIVOS} aparelhos={vazio ? [] : APARELHOS}
          etapasPorRoteiro={etapasPorRoteiro} marcosPorAtivo={marcosPorAtivo}
          filtro={v === "WhatsApp" ? "whatsapp" : "meta"} podeEditar
          onAbrir={setAberto} onNovo={() => {}} onFichas={() => {}} />
      )}
      {v === "Roteiros" && (
        <Roteiros roteiros={vazio ? [] : ROTEIROS} ativos={ATIVOS} marcosPorAtivo={marcosPorAtivo}
          podeEditar onSalvo={() => {}} />
      )}

      {aberto && (
        <GavetaAtivo ativo={aberto}
          etapas={etapasPorRoteiro.get(aberto.roteiroId ?? "") ?? []}
          marcos={marcosPorAtivo.get(aberto.id) ?? []}
          podeEditar onFechar={() => setAberto(null)}
          onMarcar={nada} onDesmarcar={nada} onStatus={nada} onNota={nada}
          onEditar={nada} onRemover={nada}
          roteiros={ROTEIROS} bms={ATIVOS.filter((a) => a.tipo === "bm")}
          aparelhos={[...new Set(ATIVOS.map((a) => a.aparelho).filter(Boolean) as string[])]} />
      )}
    </div>
  );
}
