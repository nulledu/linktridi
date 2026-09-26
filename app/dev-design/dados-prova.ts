// Dados de prova do Design (/dev-design) — no formato das rotas /api/design/*,
// pra medir as cinco telas sem login, sem ERP e sem banco.
import type { ProjetoLinha, ResumoDesign } from "@/lib/design-projetos";
import { COLUNAS_DESIGN, STATUS_DESIGN, colunaDoProjeto, prioridadeDe, statusDoPedido, type StatusDesign } from "@/lib/design-fluxo";

const agora = Date.now();
const iso = (hAtras: number) => new Date(agora - hAtras * 3_600_000).toISOString();
const CLIENTES = ["Loja da Maria", "Papelaria Ideal", "Casa & Cozinha", "Total Print", "Ateliê Flor de Lis", "Gráfica Rápida", "Doce Encanto", "Tech Store"];
const PESSOAS: { nome: string; foto: string | null }[] = [{ nome: "Isabella", foto: null }, { nome: "Ana Julia", foto: null }, { nome: "Marcos", foto: null }];
const PRODUTOS = ["Carimbo automático 38×14", "Chancela de mesa", "Carimbo redondo 40mm", "Sinete personalizado", "Placa Pix", "Letreiro 3D"];
const ETAPA: Record<StatusDesign, number> = { nova: 1, criacao: 2, aguardando: 6, revisao: 5, ajustes: 4, aprovado: 7, finalizado: 16 };

function projeto(i: number, status: StatusDesign, o: Partial<ProjetoLinha> = {}): ProjetoLinha {
  const horas = o.horasNaEtapa ?? (i % 5) * 9;
  const desde = iso(horas);
  const st = statusDoPedido(ETAPA[status], status === "criacao");
  const base = { status: st, urgente: !!o.urgente, emAtraso: !!o.emAtraso, desde, reaprovado: false };
  const pessoa = i % 4 === 3 ? null : PESSOAS[i % PESSOAS.length];
  return {
    id: 74000 + i,
    ref: `${CLIENTES[i % CLIENTES.length]} - 5511988${String(100000 + i).slice(-6)}`,
    cliente: CLIENTES[i % CLIENTES.length],
    produto: PRODUTOS[i % PRODUTOS.length],
    tipos: ["Carimbo"], itens: 1 + (i % 3), thumb: null,
    arquivos: { arteCliente: 1 + (i % 2), vetorizadas: status === "nova" ? 0 : 1, reprovadas: status === "ajustes" ? 1 : 0, logo: i % 3 === 0, drive: null },
    status: st,
    coluna: colunaDoProjeto(base),
    prioridade: prioridadeDe(base, new Date(agora)),
    urgente: base.urgente, emAtraso: base.emAtraso, parado: horas > 24 && (st === "nova" || st === "criacao" || st === "ajustes"),
    responsavel: pessoa?.nome ?? null, foto: pessoa?.foto ?? null,
    desde, horasNaEtapa: horas, atualizadoEm: desde,
    ...o,
  };
}

const QUANTOS: Record<StatusDesign, number> = { nova: 9, criacao: 7, aguardando: 3, revisao: 12, ajustes: 4, aprovado: 8, finalizado: 3 };
let n = 0;
export const PROJETOS_PROVA: ProjetoLinha[] = STATUS_DESIGN.flatMap((s) =>
  Array.from({ length: QUANTOS[s.chave] }, () => projeto(n++, s.chave, n % 11 === 0 ? { urgente: true } : n % 13 === 0 ? { emAtraso: true } : {})));

const conta = <T extends string>(chaves: readonly T[], f: (p: ProjetoLinha) => string) =>
  Object.fromEntries(chaves.map((k) => [k, PROJETOS_PROVA.filter((p) => f(p) === k).length])) as Record<T, number>;

export const RESUMO_PROVA: ResumoDesign = {
  porStatus: conta(STATUS_DESIGN.map((s) => s.chave), (p) => p.status),
  porColuna: conta(COLUNAS_DESIGN.map((c) => c.chave), (p) => String(p.coluna)),
  urgentes: PROJETOS_PROVA.filter((p) => p.coluna === "urgentes").length,
  parados: PROJETOS_PROVA.filter((p) => p.parado).length,
  semResponsavel: PROJETOS_PROVA.filter((p) => !p.responsavel && (p.status === "criacao" || p.status === "ajustes")).length,
  aguardandoAprovacao: QUANTOS.revisao,
  artesProntas: QUANTOS.aprovado,
  hoje: { enviadas: 12, aprovadas: 9, ajustes: 3, novas: 7, iniciadas: 8 },
  ontem: { enviadas: 10, aprovadas: 11 },
  tempoMedioH: 6.4,
  taxaAprovacao: 78,
  equipe: PESSOAS.map((p, i) => ({ nome: p.nome, foto: p.foto, criacao: 5 - i, ajustes: i + 1, revisao: 4 + i, total: 10 + i, hoje: 4 - i })),
  designersAtivos: PESSOAS.length,
};

const EVENTOS = [
  { tipo: "aprovado", h: 0.4 }, { tipo: "enviada", h: 1.2 }, { tipo: "revisao", h: 2.5 },
  { tipo: "iniciado", h: 4 }, { tipo: "criado", h: 5.5 }, { tipo: "enviada", h: 7 }, { tipo: "aprovado", h: 9 },
] as const;

const dia = (n: number) => new Date(agora - n * 86_400_000).toISOString().slice(0, 10);
const serie = (vals: number[]) => vals.map((valor, i) => ({ dia: dia(vals.length - 1 - i), valor }));

const ETAPAS_GESTAO = [
  { status: "nova" as const, wip: 9, idadeMediaH: 31, maisVelhaH: 96, estouradas: 5, doSetor: true },
  { status: "criacao" as const, wip: 7, idadeMediaH: 11, maisVelhaH: 40, estouradas: 2, doSetor: true },
  { status: "ajustes" as const, wip: 4, idadeMediaH: 19, maisVelhaH: 52, estouradas: 1, doSetor: true },
  { status: "revisao" as const, wip: 12, idadeMediaH: 120, maisVelhaH: 700, estouradas: 0, doSetor: false },
  { status: "aguardando" as const, wip: 3, idadeMediaH: 200, maisVelhaH: 400, estouradas: 0, doSetor: false },
  { status: "aprovado" as const, wip: 8, idadeMediaH: 9, maisVelhaH: 30, estouradas: 0, doSetor: false },
];

export const PAINEL_RESPOSTA = {
  atualizadoEm: new Date(agora).toISOString(),
  resumo: RESUMO_PROVA,
  etapas: ETAPAS_GESTAO,
  gargalo: ETAPAS_GESTAO[0],
  wipSetor: 20,
  fluxo7: { entrou: 84, saiu: 71, saldo: 13, diasDeFila: 2 },
  entradas: serie([9, 14, 11, 16, 10, 13, 12, 15, 9, 11, 14, 12, 16, 13]),
  saidas: serie([8, 12, 10, 11, 12, 9, 13, 11, 10, 12, 9, 11, 10, 12]),
  ciclo: { ateArteH: 5.5, ateAprovacaoH: 26, base: 38 },
  retrabalho: { devolvidas: 9, aprovadas: 32, taxaPrimeira: 78, reincidentes: 3 },
  envelhecendo: PROJETOS_PROVA.filter((p) => ["nova", "criacao", "ajustes"].includes(p.status)).slice(0, 6),
  atencao: PROJETOS_PROVA.filter((p) => p.prioridade === "alta").slice(0, 8),
  eventos: EVENTOS.map((e, i) => ({ projetoId: PROJETOS_PROVA[i].id, ref: PROJETOS_PROVA[i].ref, tipo: e.tipo, quando: iso(e.h), quem: PESSOAS[i % PESSOAS.length].nome })),
  tarefas: [
    { id: "t1", tarefa: "Refazer mockup da vitrine", para: "Isabella", status: "pendente", prazo: dia(3), urgente: true, iniciadaAt: null, concluidaAt: null },
    { id: "t2", tarefa: "Padronizar template de chancela", para: "Ana Julia", status: "em_andamento", prazo: dia(0), urgente: false, iniciadaAt: iso(2), concluidaAt: null },
  ],
};

export const RESUMO_RESPOSTA = {
  atualizadoEm: new Date(agora).toISOString(),
  resumo: RESUMO_PROVA,
  atencao: PROJETOS_PROVA.filter((p) => p.prioridade !== "baixa").slice(0, 12),
  emCriacao: PROJETOS_PROVA.filter((p) => p.status === "criacao" || p.status === "ajustes"),
  eventos: EVENTOS.map((e, i) => ({ projetoId: PROJETOS_PROVA[i].id, ref: PROJETOS_PROVA[i].ref, tipo: e.tipo, quando: iso(e.h), quem: PESSOAS[i % PESSOAS.length].nome })),
  arquivosRecentes: PROJETOS_PROVA.slice(0, 8).map((p) => ({ url: "", tipo: "vetorizada" as const, projetoId: p.id, ref: p.ref, produto: p.produto, quando: p.desde })),
  designers: PESSOAS.map((p, i) => ({ id: String(i), nome: p.nome, foto: p.foto })),
  tarefas: [
    { id: "t1", tarefa: "Refazer mockup da vitrine", para: "Isabella", status: "pendente", prazo: new Date(agora - 3 * 86_400_000).toISOString().slice(0, 10), urgente: true, iniciadaAt: null, concluidaAt: null },
    { id: "t2", tarefa: "Padronizar template de chancela", para: "Ana Julia", status: "em_andamento", prazo: new Date(agora).toISOString().slice(0, 10), urgente: false, iniciadaAt: iso(2), concluidaAt: null },
    { id: "t3", tarefa: "Organizar fontes licenciadas", para: "Marcos", status: "pendente", prazo: new Date(agora + 3 * 86_400_000).toISOString().slice(0, 10), urgente: false, iniciadaAt: null, concluidaAt: null },
  ],
};

export const LISTA_RESPOSTA = {
  atualizadoEm: new Date(agora).toISOString(),
  total: PROJETOS_PROVA.length,
  porStatus: RESUMO_PROVA.porStatus,
  porColuna: RESUMO_PROVA.porColuna,
  responsaveis: PESSOAS.map((p) => p.nome),
  projetos: PROJETOS_PROVA,
};

export const BIBLIOTECA_RESPOSTA = {
  erp: "ok" as const,
  materiaisDisponivel: true,
  totalArquivos: 42,
  contagem: { vetorizada: 18, arte: 16, logo: 6, reprovada: 2 },
  arquivos: PROJETOS_PROVA.slice(0, 12).map((p, i) => ({ url: "", tipo: (["vetorizada", "arte", "logo"] as const)[i % 3], projetoId: p.id, ref: p.ref, produto: p.produto, quando: p.desde })),
  materiais: [
    { id: "m1", nome: "Template carimbo redondo 40mm", categoria: "template", url: "/api/arquivos/design/2026/09/x.ai", mime: "application/postscript", tamanho: 4_200_000, tags: ["redondo", "carimbo"], descricao: "Base com margens e área de gravação.", pedido_id: null, pedido_ref: null, criado_nome: "Isabella", created_at: iso(30) },
    { id: "m2", nome: "Fonte Garamond licenciada", categoria: "fonte", url: "/api/arquivos/design/2026/09/y.zip", mime: "application/zip", tamanho: 12_800_000, tags: ["serifada"], descricao: null, pedido_id: null, pedido_ref: null, criado_nome: "Marcos", created_at: iso(70) },
    { id: "m3", nome: "Mockup vitrine Loja da Maria", categoria: "mockup", url: "", mime: "image/png", tamanho: 2_100_000, tags: ["vitrine"], descricao: null, pedido_id: 74001, pedido_ref: "Loja da Maria - 5511988000001", criado_nome: "Ana Julia", created_at: iso(96) },
  ],
};
