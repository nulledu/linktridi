"use client";

// Dados de exemplo + componentes reais da contingência. Não fala com o banco:
// o que se confere aqui é LAYOUT (320/390/430) e a leitura dos cards.

import { ContingenciaClient } from "../(plataforma)/marketing/contingencia/ContingenciaClient";
import type { DadosAquecimento } from "../(plataforma)/marketing/aquecimento/useAquecimento";
import type { Etapa, Marco, Roteiro } from "@/lib/marketing-aquecimento-const";
import {
  consolidar, LIMITES_PADRAO,
  type Ativo, type Celular, type Proxy, type Custo, type PendenciaOperacional, type Painel, type Snapshot,
} from "@/lib/contingencia-const";

let seq = 0;
const n = (o: Partial<Ativo>): Ativo => ({
  id: `n${++seq}`, tipo: "numero", nome: `(62) 9 8${String(1000 + seq * 37).slice(0, 3)}-${String(2000 + seq * 91).slice(0, 4)}`,
  identificador: null, paiId: null, status: "aquecido", roteiroId: null, iniciadoEm: "2026-08-10", pausadoEm: null,
  responsavelId: "ana", responsavelNome: "Ana Paula", responsavelFoto: null,
  aparelho: "Moto G54 · mesa 1", operadora: "Fluke", obs: null, ...o,
});
const c = (o: Partial<Celular>): Celular => ({
  id: `c${++seq}`, nome: "", modelo: null, fotoUrl: null, lugar: null, obs: null,
  situacao: "ok", identificacao: null, responsavelId: null, responsavelNome: null, ...o,
});
const p = (o: Partial<Proxy>): Proxy => ({
  id: `p${++seq}`, identificacao: `PX-${String(seq).padStart(2, "0")}`, status: "ativo", custoMensal: 45,
  numeroId: null, aparelhoNome: null, compradoEm: "2026-08-01", obs: null, ...o,
});

const ROSTO = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#7c5cff"/><circle cx="32" cy="25" r="11" fill="#e9e4ff"/><path d="M10 62c2-13 11-20 22-20s20 7 22 20z" fill="#e9e4ff"/></svg>`);

const CELULARES: Celular[] = [
  c({ nome: "Moto G54 · mesa 1", modelo: "Motorola G54", responsavelNome: "Ana Paula", responsavelId: "ana" }),
  c({ nome: "Moto G54 · mesa 2", modelo: "Motorola G54", responsavelNome: "Bia", responsavelId: "bia" }),
  c({ nome: "iPhone 8 · A", modelo: "iPhone 8", responsavelNome: "Carla" }),
  c({ nome: "iPhone 8 · B", modelo: "iPhone 8" }),
  c({ nome: "Samsung A15 · 1", modelo: "Samsung A15", responsavelNome: "Manu", responsavelId: "manu" }),
  c({ nome: "Samsung A15 · 2", modelo: "Samsung A15" }),
  c({ nome: "Samsung A15 · 3", modelo: "Samsung A15", situacao: "manutencao" }),
  c({ nome: "Redmi 12 · gaveta", modelo: "Redmi 12", situacao: "aposentado" }),
];

const NUMEROS: Ativo[] = [
  // Ana — saudável: 3 reservas, tudo com proxy (via aparelho)
  n({ status: "em_uso", responsavelFoto: ROSTO }), n({ status: "aquecido" }), n({ status: "aquecido" }), n({ status: "aquecido" }), n({ status: "aquecendo" }),
  // Bia — atenção: 1 reserva
  n({ responsavelId: "bia", responsavelNome: "Bia", aparelho: "Moto G54 · mesa 2", status: "em_uso", operadora: "Claro" }),
  n({ responsavelId: "bia", responsavelNome: "Bia", aparelho: "Moto G54 · mesa 2", status: "aquecido" }),
  n({ responsavelId: "bia", responsavelNome: "Bia", aparelho: "Moto G54 · mesa 2", status: "aquecendo" }),
  // Carla — crítico: sem reserva, nada aquecendo, um banido
  n({ responsavelId: null, responsavelNome: "Carla", aparelho: "iPhone 8 · A", status: "em_uso", operadora: "Vivo" }),
  n({ responsavelId: null, responsavelNome: "Carla", aparelho: "iPhone 8 · A", status: "banido", operadora: "Vivo" }),
  // Manu — atenção por proxy
  n({ responsavelId: "manu", responsavelNome: "Manu", aparelho: "Samsung A15 · 1", status: "em_uso", operadora: "TIM" }),
  n({ responsavelId: "manu", responsavelNome: "Manu", aparelho: "Samsung A15 · 1", status: "aquecido" }),
  n({ responsavelId: "manu", responsavelNome: "Manu", aparelho: "Samsung A15 · 1", status: "aquecido" }),
  n({ responsavelId: "manu", responsavelNome: "Manu", aparelho: "Samsung A15 · 1", status: "aquecido" }),
  n({ responsavelId: "manu", responsavelNome: "Manu", aparelho: "Samsung A15 · 1", status: "restrito" }),
  // Estoque
  ...Array.from({ length: 12 }, (_, i) => n({ status: "novo", aparelho: null, responsavelId: null, responsavelNome: null, operadora: i < 9 ? "Fluke" : "Claro", nome: `Fluke estoque ${String(i + 1).padStart(2, "0")}` })),
  n({ status: "aposentado", aparelho: "Redmi 12 · gaveta", responsavelId: null, responsavelNome: null }),
];

const PROXIES: Proxy[] = [
  p({ aparelhoNome: "Moto G54 · mesa 1" }),
  p({ aparelhoNome: "Moto G54 · mesa 2" }),
  p({ numeroId: NUMEROS[10].id, custoMensal: 60 }),
  p({}), p({}),
  p({ status: "expirado", custoMensal: 45 }),
];

const CUSTOS: Custo[] = [
  { id: "k1", tipo: "plano_chip", descricao: "Plano Fluke (30 chips)", valor: 390, periodicidade: "mensal", data: "2026-09-01", ativo: true, obs: null },
  { id: "k2", tipo: "plano_chip", descricao: "Plano Claro pré", valor: 120, periodicidade: "mensal", data: "2026-09-01", ativo: true, obs: null },
  { id: "k3", tipo: "outro", descricao: "Capinhas", valor: 80, periodicidade: "unico", data: "2026-08-20", ativo: true, obs: null },
];

const PENDENCIAS: PendenciaOperacional[] = [
  { id: "t1", titulo: "Fazer novos suportes de celular", descricao: "Necessidade operacional registrada na abertura do módulo.", status: "aberta", responsavelId: null, responsavelNome: null, data: null, concluidaEm: null, createdAt: "2026-09-01T10:00:00Z" },
  { id: "t2", titulo: "Comprar 5 proxies pra Carla", descricao: null, status: "aberta", responsavelId: null, responsavelNome: "Caio", data: "2026-09-05", concluidaEm: null, createdAt: "2026-09-01T10:00:00Z" },
  { id: "t3", titulo: "Trocar chip banido do iPhone A", descricao: null, status: "feita", responsavelId: null, responsavelNome: null, data: null, concluidaEm: "2026-08-30T10:00:00Z", createdAt: "2026-08-28T10:00:00Z" },
];

// ── Estrutura Meta + roteiro do chip, pro Hoje, o Tráfego e os Roteiros ────
const BMS: Ativo[] = [
  n({ id: "bm1", tipo: "bm", nome: "BM Tridi Principal", identificador: "1029384756", status: "em_uso", aparelho: null, operadora: null, responsavelId: null, responsavelNome: "Caio", roteiroId: "r-bm" }),
  n({ id: "bm2", tipo: "bm", nome: "BM Reserva 02", identificador: "5647382910", status: "aquecendo", aparelho: null, operadora: null, responsavelId: null, responsavelNome: "Caio", roteiroId: "r-bm", iniciadoEm: "2026-08-25" }),
  n({ tipo: "conta", nome: "act_001 · Principal", paiId: "bm1", status: "em_uso", aparelho: null, operadora: null, responsavelId: null, responsavelNome: null, roteiroId: "r-conta" }),
  n({ tipo: "conta", nome: "act_002 · Escala", paiId: "bm1", status: "aquecido", aparelho: null, operadora: null, responsavelId: null, responsavelNome: null, roteiroId: "r-conta" }),
  n({ tipo: "conta", nome: "act_003 · Teste", paiId: "bm1", status: "restrito", aparelho: null, operadora: null, responsavelId: null, responsavelNome: null, roteiroId: "r-conta" }),
  n({ tipo: "conta", nome: "act_010 · Nova", paiId: "bm2", status: "aquecendo", aparelho: null, operadora: null, responsavelId: null, responsavelNome: null, roteiroId: "r-conta", iniciadoEm: "2026-08-26" }),
  n({ tipo: "conta", nome: "act_011 · Nova", paiId: "bm2", status: "novo", aparelho: null, operadora: null, responsavelId: null, responsavelNome: null, roteiroId: "r-conta" }),
];
const etapa = (id: string, roteiroId: string, dia: number, titulo: string): Etapa => ({ id, roteiroId, ordem: dia, dia, titulo, detalhe: null, removidaEm: null });
const ROTEIROS: Roteiro[] = [
  { id: "r-num", nome: "Chip de WhatsApp", tipo: "numero", ativo: true, etapas: [
    etapa("n0", "r-num", 0, "Chip ativado e número registrado"), etapa("n1", "r-num", 1, "WhatsApp instalado, foto e nome"),
    etapa("n2", "r-num", 3, "Conversa com 5 contatos reais"), etapa("n4", "r-num", 7, "20 conversas iniciadas"),
    etapa("n6", "r-num", 15, "Volume para 100/dia"), etapa("n7", "r-num", 21, "Encerrar — marcar como aquecido"),
  ] },
  { id: "r-conta", nome: "Conta de anúncio", tipo: "conta", ativo: true, etapas: [
    etapa("c0", "r-conta", 0, "Conta criada e pagamento validado"), etapa("c2", "r-conta", 5, "Primeiro criativo, R$ 20/dia"), etapa("c4", "r-conta", 18, "Liberar para escala"),
  ] },
  { id: "r-bm", nome: "BM", tipo: "bm", ativo: true, etapas: [etapa("b0", "r-bm", 0, "BM verificada"), etapa("b1", "r-bm", 10, "Segunda conta pendurada")] },
];
// Chips aquecendo ganham roteiro e um marco, pra fila do dia ter o que mostrar.
for (const x of NUMEROS) if (x.tipo === "numero" && x.status === "aquecendo") x.roteiroId = "r-num";
const MARCOS: Marco[] = NUMEROS.filter((x) => x.status === "aquecendo").map((x) => ({ id: `m-${x.id}`, ativoId: x.id, etapaId: "n0", feitoEm: x.iniciadoEm, autorId: null, autorNome: "Caio" }));
const AQUECIMENTO: DadosAquecimento = { ativos: [...NUMEROS, ...BMS], marcos: MARCOS, roteiros: ROTEIROS, aparelhos: CELULARES };

const hoje = consolidar({ ativos: [...NUMEROS, ...BMS], celulares: CELULARES, proxies: PROXIES, custos: CUSTOS, pendencias: PENDENCIAS, limites: LIMITES_PADRAO, agora: "2026-09-01T14:20:00Z" });

// Ontem: um pouco pior, pra "desde a última atualização" ter o que dizer.
const ontem = consolidar({
  ativos: NUMEROS.filter((x) => x.status !== "aquecido" || Math.random() > 2).concat(NUMEROS.filter((x) => x.status === "aquecido").slice(0, 5)),
  celulares: CELULARES.slice(0, 7), proxies: PROXIES.slice(0, 5), custos: CUSTOS.slice(0, 2), pendencias: PENDENCIAS, agora: "2026-08-31T22:00:00Z",
});

const SNAPSHOTS: Snapshot[] = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 20 + i));
  const base = i === 11 ? hoje : ontem;
  const dados = JSON.parse(JSON.stringify(base)) as typeof hoje;
  dados.numeros.prontos = Math.max(0, base.numeros.prontos - (11 - i) + Math.round(Math.sin(i) * 2));
  dados.numeros.comProxy = Math.max(0, base.numeros.comProxy - Math.floor((11 - i) / 2));
  dados.custos.total = base.custos.total - (11 - i) * 15;
  return { dia: d.toISOString().slice(0, 10), dados, origem: i % 3 === 0 ? "cron" : "manual", autorNome: i % 3 === 0 ? null : "Caio", atualizadoEm: d.toISOString() };
});

const PAINEL: Painel = {
  consolidado: hoje, ativos: [...NUMEROS, ...BMS], celulares: CELULARES, proxies: PROXIES, custos: CUSTOS, pendencias: PENDENCIAS,
  limites: LIMITES_PADRAO,
  ultimoSnapshot: { dia: "2026-09-01", atualizadoEm: "2026-09-01T14:20:00Z", autorNome: "Caio", origem: "manual" },
  anterior: ontem, sqlPendente: false,
};

export function DevContingenciaClient() {
  return (
    <main style={{ padding: "20px 14px", maxWidth: 1200, margin: "0 auto" }}>
      <ContingenciaClient inicial={PAINEL} aquecimentoInicial={AQUECIMENTO} offline snapshotsIniciais={SNAPSHOTS} />
    </main>
  );
}
