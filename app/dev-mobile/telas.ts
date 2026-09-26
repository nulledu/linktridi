// TEMPORÁRIO — dados falsos para montar as TELAS REAIS do ERP no banco de
// provas, sem login e sem tocar no banco.
//
// Sem isto só dava pra avaliar componentes soltos: a casca e o kit. Mas
// "está ruim de usar no celular" é uma frase sobre as telas de verdade —
// Central, Atividades, Minhas atividades — e essas estão atrás de sessão.
// Com fixtures elas montam iguais às de produção, e dá pra medir e corrigir.
import type { Atividade, Colaborador } from "@/lib/atividades-catalog";
import type { SolicitacaoLinha } from "@/lib/central-solicitacoes";
import type { Tarefa } from "@/lib/tarefas";

export const COLABORADORES: Colaborador[] = [
  { id: "c1", nome: "Vinicius Andrade", setor: "Produção", departamento: "Operacional" },
  { id: "c2", nome: "Davi Nogueira", setor: "Produção", departamento: "Operacional" },
  { id: "c3", nome: "Gustavo Lima", setor: "Logística", departamento: "Operacional" },
  { id: "c4", nome: "Letícia Barros", setor: "Design", departamento: "Marketing" },
  { id: "c5", nome: "Beatriz Souza Nascimento", setor: "Vendas", departamento: "Comercial" },
];

const base = (i: number): Atividade => ({
  id: `a${i}`,
  categoria: "Produção",
  tarefa: "Carimbo automático 38×14mm",
  detalhe: null,
  para_id: "c1", para_nome: "Vinicius Andrade",
  por_id: "adm", por_nome: "Teste",
  status: "pendente",
  setor: "Produção", pool: false, urgente: false, ordem: null, lote: null,
  claimed_at: null, prazo: null,
  quantidade_alvo: 10, quantidade_feita: 0,
  tempo_estimado_min: 30,
  iniciada_at: null,
  produto_id: null, produto_nome: null, estoque_lancado: false,
  created_at: new Date(2026, 6, 27, 9, 30).toISOString(),
  concluida_at: null, foto_url: null,
});

// Texto longo de propósito: é o caso que o pedido chama de "bloco de log
// ilegível". Se o parágrafo comprido não estiver aqui, o defeito não aparece
// na prova e a correção não tem como ser verificada.
const DETALHE_LONGO =
  "na parte da entrada logistica, conferir se o lote veio com a etiqueta certa " +
  "e se a contagem bate com a nota; se não bater, separar o excedente numa " +
  "caixa à parte e avisar o Gustavo antes de lançar qualquer coisa no estoque.";

export const ATIVIDADES: Atividade[] = [
  { ...base(1), status: "em_andamento", quantidade_feita: 4, iniciada_at: new Date(2026, 6, 27, 10, 0).toISOString() },
  { ...base(2), detalhe: DETALHE_LONGO, tarefa: "Conferência de entrada", categoria: "Logística", para_id: "c3", para_nome: "Gustavo Lima" },
  { ...base(3), status: "pendente", urgente: true, tarefa: "Arte para campanha de agosto", categoria: "Design", para_id: "c4", para_nome: "Letícia Barros" },
  { ...base(4), status: "concluida", quantidade_feita: 10, concluida_at: new Date(2026, 6, 27, 16, 20).toISOString() },
  { ...base(5), tarefa: "Separação de pedidos", categoria: "Logística", para_id: "c2", para_nome: "Davi Nogueira" },
  // Os dois lados da regra nova (peça só entra no estoque depois que alguém
  // confere). Sem eles a prova mostrava só "Concluída" verde e a coluna "A
  // conferir" nascia vazia — justamente os estados que precisam ser olhados no
  // celular, porque são os que têm etiqueta longa.
  {
    ...base(7), id: "a7", tarefa: "Montar estrutura da almofada 22", categoria: "Almofadas",
    status: "concluida", quantidade_feita: 10, produto_nome: "Almofada para carimbo nº 2",
    concluida_at: new Date(2026, 7, 10, 15, 40).toISOString(),
    iniciada_at: new Date(2026, 7, 10, 14, 30).toISOString(),
  },
  {
    ...base(8), id: "a8", tarefa: "Colar o EVA na base", categoria: "Almofadas",
    status: "concluida", quantidade_feita: 8, produto_nome: "Clichê de polímero A5",
    estoque_lancado: true,
    concluida_at: new Date(2026, 7, 11, 11, 10).toISOString(),
    iniciada_at: new Date(2026, 7, 11, 10, 5).toISOString(),
  },
  // Nascida da varredura de reposição: por_id nulo e "Sistema (...)" no nome.
  {
    ...base(9), id: "a9", tarefa: "Produzir Refil de tinta azul 30ml", categoria: "Envase de tintas",
    por_id: null as unknown as string, por_nome: "Sistema (requisição)",
    produto_nome: "Refil de tinta azul 30ml", quantidade_alvo: 12,
    detalhe: "Envasar até completar o estoque ideal; conferir a cor antes de tampar.",
  },
];

export const POOL: Atividade[] = [
  { ...base(6), id: "p1", para_id: null, para_nome: null, pool: true, tarefa: "Embalar pedidos do dia", setor: "Logística" },
];

// ── Estoque ──────────────────────────────────────────────────────────────────
// Nomes longos de propósito: é com eles que a tabela vira card e o layout
// aperta. Um catálogo de nomes curtos esconderia justamente o caso difícil.
const PRODUTOS = [
  { nome: "Carimbo automático 38×14mm — tinta preta", base: 42, ajuste: -3, min: 20 },
  { nome: "Refil de tinta azul 30ml", base: 4, ajuste: 0, min: 12 },
  { nome: "Placa de sinalização em ACM 20×30", base: 0, ajuste: 0, min: 5 },
  { nome: "Clichê de polímero A5", base: 118, ajuste: 12, min: 40 },
  { nome: "Almofada para carimbo nº 2", base: 9, ajuste: -1, min: 10 },
];

export const ESTOQUE = {
  updatedAt: new Date(2026, 7, 5, 9, 0).toISOString(),
  itens: PRODUTOS.map((p, i) => {
    const atual = p.base + p.ajuste;
    return {
      id: i + 1, nome: p.nome, imageUrl: null,
      base: p.base, ajuste: p.ajuste, atual, minimo: p.min,
      baixo: atual <= p.min, feitoHoje: i === 3 ? 12 : 0,
    };
  }),
  totais: { produtos: 5, emFalta: 1, baixo: 3, unidades: 181, feitoHoje: 12 },
  movimentos: [
    { id: "m1", produto_id: 4, produto_nome: "Clichê de polímero A5", delta: 12, motivo: "Produção do dia", origem: "atividade", por_nome: "Vinicius Andrade", created_at: new Date(2026, 7, 5, 8, 30).toISOString() },
    { id: "m2", produto_id: 1, produto_nome: "Carimbo automático 38×14mm — tinta preta", delta: -3, motivo: "Venda balcão", origem: "ajuste", por_nome: "Beatriz Souza Nascimento", created_at: new Date(2026, 7, 4, 17, 10).toISOString() },
  ],
  producaoSerie: Array.from({ length: 21 }, (_, i) => ({ day: `2026-07-${String(16 + i).padStart(2, "0")}`, value: i % 5 === 0 ? 0 : 4 + (i % 7) })),
  canManage: true,
};

// ── Central · Tarefas ────────────────────────────────────────────────────────
const tarefa = (id: string, titulo: string, extra: Partial<Tarefa> = {}): Tarefa => ({
  id, titulo,
  descricao: null,
  status: "pendente", prioridade: "media",
  responsavelId: "dev", responsavelNome: "Teste",
  criadorId: "adm", criadorNome: "Teste",
  prazo: null, lembrarEm: null,
  origemTipo: "personal", origemRef: null, origemLabel: null, origemUrl: null,
  setor: null, tags: [], lista: null,
  subtarefas: [], anexos: [],
  bloqueadaPor: null, gravidade: null,
  importancia: null, urgencia: null,
  avisarConclusao: false,
  concluidaAt: null,
  createdAt: new Date(2026, 6, 27, 8, 0).toISOString(),
  updatedAt: new Date(2026, 6, 27, 8, 0).toISOString(),
  ...extra,
});

export const TAREFAS: Tarefa[] = [
  tarefa("t1", "Fechar o acerto de comissão da Beatriz", { prioridade: "alta", tags: ["comercial"] }),
  tarefa("t2", "Responder o cliente do carimbo 38×14", {
    origemTipo: "message", origemLabel: "Mensagem de Letícia Barros",
    prioridade: "urgente", status: "em_andamento",
  }),
  tarefa("t3", "Conferir a nota do fornecedor de tinta", {
    origemTipo: "order", origemLabel: "Pedido #2841",
    subtarefas: [
      { id: "s1", titulo: "Bater a quantidade", feita: true },
      { id: "s2", titulo: "Lançar no estoque", feita: false },
    ],
  }),
  tarefa("t4", "Revisar a arte da campanha de agosto", { status: "concluida", concluidaAt: new Date(2026, 6, 27, 15, 0).toISOString() }),
  tarefa("t5", "Mandar o orçamento revisado pro Gustavo", { responsavelId: "c3", responsavelNome: "Gustavo Lima", criadorId: "dev" }),
];

// ── Central · Solicitações ───────────────────────────────────────────────────
// A fila entra na MESMA lista das tarefas. O fixture cobre os três escopos: um
// pedido esperando você responder, um que você mandou, e um já encerrado.
const solic = (id: string, titulo: string, extra: Partial<SolicitacaoLinha> = {}): SolicitacaoLinha => ({
  id, autor_id: "c1", autor_nome: "Vinicius Andrade",
  tipo: "Material", setor_destino: "Estoque", titulo, descricao: null,
  prioridade: "normal", status: "pendente", motivo_recusa: null,
  created_at: new Date(2026, 6, 27, 9, 30).toISOString(),
  imagens: [], destino_tipo: "pessoa", destinatario_id: "dev", destinatario_nome: "Teste",
  ...extra,
});

export const SOLICITACOES: SolicitacaoLinha[] = [
  solic("q1", "Preciso de 100 guias alavanca", { prioridade: "urgente", descricao: "Acabou na bancada 2 e a produção para hoje à tarde." }),
  // Descrição com bloco de código (```): colar a planilha alinhada é o uso mais
  // comum de code block fora de programar — e é o que traz LINHA LONGA, que a
  // 320px precisa rolar DENTRO do bloco (nunca na página). Prova o TextoComCodigo
  // dentro do cartão estreito da solicitação.
  solic("q2", "Liberar reembolso do combustível", { autor_id: "dev", autor_nome: "Teste", destinatario_id: "c1", destinatario_nome: "Vinicius Andrade", tipo: "Reembolso", setor_destino: "Administração",
    descricao: "Colei da planilha pra não perder o alinhamento:\n\n```\ndata        posto                            litros   valor\n01/09/2026  Ipiranga — Av. Paulista, 1300      42,30    R$ 312,40\n15/09/2026  Shell — Marginal Tietê, km 22      39,80    R$ 289,10\n```\nTotal R$ 601,50 — os comprovantes estão anexados." }),
  solic("q3", "Trocar o toner da impressora", { status: "concluida", tipo: "Manutenção" }),
];

// ── Pessoas (aba Equipe) ─────────────────────────────────────────────────────
// Mesma FORMA do quadro real: a mesma distribuição de setores, de cargos e de
// estados (quem já entrou, quem nunca entrou, quem está inativo, quem não tem
// foto). Os nomes são fictícios de propósito — um fixture vai pro repositório,
// e nome de gente de verdade não deve ir junto.
type PessoaProva = import("../(plataforma)/colaboradores/ColaboradoresClient").ColabRow;

const p = (
  id: string, name: string, role: string,
  o: { dep?: string; perfil?: string; nunca?: boolean; off?: boolean; semFoto?: boolean } = {},
): PessoaProva => ({
  id, username: name.toLowerCase().split(" ")[0], name,
  email: o.nunca ? null : `${name.toLowerCase().split(" ")[0]}@exemplo.com`,
  role: role as PessoaProva["role"],
  active: !o.off,
  password_set: !o.nunca,
  created_at: new Date(2026, 5, 1).toISOString(),
  employees: {
    photo_url: o.semFoto ? null : `https://i.pravatar.cc/96?u=${id}`,
    cargo: null, departamento: o.dep ?? null, perfil: o.perfil ?? null,
    perfis: o.perfil ? [o.perfil] : [], especialidade: null, escala: null,
    nivel: null, setor: null, tablet: false, mesa: null, mesas: null,
    telefone: null, data_admissao: null, observacoes: null,
    erp_user_id: null, permissoes: null,
  },
});

export const PESSOAS: PessoaProva[] = [
  p("u1", "Gustavo Paulino", "colaborador", { dep: "Marketing", perfil: "Edição de vídeo" }),
  p("u2", "Paola Ferraz", "gerente_vendas", { dep: "Comercial", perfil: "Vendedora", nunca: true }),
  p("u3", "Isabella Alves", "colaborador", { nunca: true }),
  p("u4", "Mariana Rosetto", "gerente_vendas", { dep: "Comercial", perfil: "Vendedora", nunca: true }),
  p("u5", "Henrique Campos", "colaborador", { dep: "Logística", perfil: "Operador", nunca: true }),
  p("u6", "Vitória Tostes", "gerente_vendas", { dep: "Comercial", perfil: "Vendedora", nunca: true }),
  p("u7", "João Vitor Reis", "colaborador", { dep: "Produção", nunca: true }),
  p("u8", "Luiz Santos", "colaborador", { dep: "Produção", perfil: "Operador", nunca: true }),
  p("u9", "Beatriz Loureiro", "colaborador", { nunca: true }),
  p("u10", "Letícia Valentim", "gerente_vendas", { dep: "Comercial", perfil: "Vendedor" }),
  p("u11", "Ana Júlia Prado", "colaborador", { nunca: true }),
  p("u12", "Caio Menezes", "colaborador", { dep: "Marketing" }),
  p("u13", "Douglas Franco", "admin", {}),
  p("u14", "Preview Glass", "admin", { semFoto: true }),
  p("u15", "Vinícius Prado", "colaborador", { dep: "Tráfego", perfil: "Gestor de tráfego" }),
  p("u16", "Davi Nogueira", "colaborador", { dep: "Produção", perfil: "Operador", nunca: true }),
  p("u17", "Felipe Arruda", "colaborador", { dep: "Logística", perfil: "Operador", nunca: true }),
  p("u18", "Thiago Belmiro", "colaborador", { dep: "Produção", perfil: "Operador", nunca: true }),
  p("u19", "Gabriel Suzuki", "colaborador", { dep: "Desenvolvimento", perfil: "Dev", nunca: true }),
  p("u20", "Samuel Jr.", "colaborador", { dep: "Desenvolvimento", perfil: "Líder técnico", nunca: true }),
  p("u21", "Matheus Dias", "gerente_producao", { dep: "Produção", perfil: "Gerente" }),
  p("u22", "Bruno Sales", "colaborador", { dep: "Produção", perfil: "Operador", nunca: true }),
  p("u23", "Pedro Guilherme", "admin", { dep: "Financeiro", perfil: "Gerente" }),
  p("u24", "Emanuelly Dias", "colaborador", { dep: "Pós Venda" }),
  p("u25", "Mikael Torres", "colaborador", { dep: "Produção", perfil: "Operador", nunca: true }),
  p("u26", "Neiva Brusarosco", "colaborador", { nunca: true, semFoto: true }),
  p("u27", "Acesso de desenvolvimento", "colaborador", { semFoto: true, off: true }),
];

// ── Metas ────────────────────────────────────────────────────────────────────
// Duas metas só pra exercitar o caso COM dados: sem elas a prova só mostrava o
// estado vazio, e é justamente no estado cheio que o formulário passa a ficar
// atrás de um botão — o caminho que mais precisa ser conferido.
export const METAS: import("@/lib/metas").MetaProgresso[] = [
  {
    id: "m1", titulo: "Vetores do mês", metrica: "vetores", periodicidade: "mensal",
    alvo: 120, setor: "Design", colaborador_id: null, colaborador_nome: null,
    ativo: true, created_at: new Date(2026, 7, 1).toISOString(), por_nome: "Teste",
    atual: 84, pct: 70, bateu: false, janelaLabel: "agosto",
  },
  {
    id: "m2", titulo: "Carimbos da semana", metrica: "pecas", periodicidade: "semanal",
    alvo: 40, setor: "Produção", colaborador_id: null, colaborador_nome: null,
    ativo: true, created_at: new Date(2026, 7, 3).toISOString(), por_nome: "Teste",
    atual: 44, pct: 110, bateu: true, janelaLabel: "esta semana",
  },
];

// ── Banco de horas com CRÉDITO em aberto ─────────────────────────────────────
// A tela busca sozinha (`/api/ponto/banco-horas`) e sem sessão cairia no estado
// de erro — justamente escondendo o que precisa de prova no celular: o botão de
// pagar horas, a régua e o extrato FIFO, que só existem quando há crédito.
const DIA_BANCO = (dia: string, dow: number, saldoMin: number, especial = false) => ({
  dia, dow, batidas: [], trabalhadoMin: 480 + Math.max(0, saldoMin), metaMin: especial ? 0 : 480, saldoMin,
  classe: saldoMin >= 0 ? "trabalhado" : "parcial", justificada: false, abonada: false, motivo: null, especial,
});
// Dois meses com extra em aberto (julho e agosto), como a conta mensal vê:
// julho já teve parte paga em dinheiro, agosto ainda está rolando. O crédito de
// agosto nasce do dia 04 (+1h30) menos a saída mais cedo do dia 06 (−30 min),
// que é compensada DENTRO do mês.
const DIA_FERIADO = (dia: string, dow: number, feriado: "folga" | "troca") => ({
  dia, dow, batidas: [], trabalhadoMin: 0, metaMin: 0, saldoMin: 0,
  classe: "feriado", justificada: false, abonada: false, motivo: null, especial: feriado === "folga", feriado,
});
// ── Dias com JUSTIFICATIVA ───────────────────────────────────────────────────
// Sem eles a prova do celular nunca via a peça nova: o atestado que cobre só a
// manhã (abono PARCIAL, com dívida sobrando), a hora fora a serviço da empresa
// (que conta como trabalho) e o pedido PENDENTE do colaborador, que aparece na
// tela sem mexer em conta nenhuma.
const JUST = (p: Record<string, unknown>) => ({
  id: `dj${Math.random().toString(36).slice(2, 8)}`, pessoaId: "pp1",
  motivo: null, abona: true, tipo: "atestado", efeito: "abona", status: "aprovada",
  horaDe: null, horaAte: null, minutos: null, arquivo: null, arquivoNome: null, ...p,
});
const DIA_ATESTADO_MANHA = {
  dia: "2026-08-11", dow: 2,
  batidas: [{ tipo: "entrada", hora: "13:00", iso: "2026-08-11T16:00:00.000Z" }, { tipo: "saida", hora: "17:00", iso: "2026-08-11T20:00:00.000Z" }],
  trabalhadoMin: 240, metaMin: 480, saldoMin: 0, classe: "justificada",
  justificada: true, abonada: true, abonadoMin: 240, motivo: "Atestado — retorno às 13h", especial: false,
  justificativas: [JUST({ dia: "2026-08-11", horaDe: "08:00", horaAte: "13:00", motivo: "Atestado — retorno às 13h", arquivo: "/api/arquivos/atestados/2026/08/exemplo.jpg", arquivoNome: "atestado.jpg" })],
};
const DIA_DUAS_SAIDAS = {
  dia: "2026-08-12", dow: 3,
  batidas: [{ tipo: "entrada", hora: "09:00", iso: "2026-08-12T12:00:00.000Z" }, { tipo: "saida", hora: "16:00", iso: "2026-08-12T19:00:00.000Z" }],
  trabalhadoMin: 420, metaMin: 480, saldoMin: -60, classe: "parcial",
  justificada: true, abonada: false, abonadoMin: 60, foraMin: 60, motivo: "Dentista", especial: false,
  justificativas: [
    JUST({ dia: "2026-08-12", tipo: "consulta", horaDe: "08:00", horaAte: "09:00", motivo: "Dentista" }),
    JUST({ dia: "2026-08-12", tipo: "empresa", efeito: "trabalhada", abona: false, minutos: 60, motivo: "Cartório" }),
  ],
};
const DIA_PEDIDO_PENDENTE = {
  dia: "2026-08-13", dow: 4, batidas: [],
  trabalhadoMin: 0, metaMin: 480, saldoMin: -480, classe: "falta",
  justificada: false, abonada: false, justPendentes: 1, motivo: null, especial: false,
  justificativas: [JUST({ dia: "2026-08-13", status: "pendente", motivo: "Consulta do meu filho", arquivo: "/api/arquivos/atestados/2026/08/exemplo2.jpg", arquivoNome: "declaracao.jpg" })],
};

const LEDGER_BANCO = {
  desde: "2026-07-15", saldoMin: 330, creditoMin: 330, debitoMin: 0,
  creditos: [
    { dia: "2026-07-16", min: 60, venceEm: "2026-10-16", vencido: false },
    { dia: "2026-07-17", min: 120, venceEm: "2026-10-17", vencido: false },
    { dia: "2026-07-29", min: 90, venceEm: "2026-10-29", vencido: false },
    // Domingo trabalhado: hora ESPECIAL (adicional na folha). Sem um crédito
    // desses na amostra, o selo e a soma separada nunca aparecem na prova.
    { dia: "2026-08-02", min: 240, venceEm: "2026-11-02", vencido: false, especial: true },
    { dia: "2026-08-04", min: 60, venceEm: "2026-11-04", vencido: false },
  ],
  debitos: [], creditoExpiraEm: "2026-10-16", debitoVenceEm: null,
  creditoExpiradoMin: 0, debitoVencidoMin: 0,
  pagoMin: 120, pagoEspecialMin: 0, creditoEspecialMin: 240,
  pagamentos: [{ id: "pg1", dia: "2026-07-28", min: 120, aplicadoMin: 120, aplicadoEspecialMin: 0, observacao: "folha de julho", autorNome: "Caio", de: "2026-07-01", ate: "2026-07-31" }],
  faltasNaoJustificadas: [],
  // A conta é por mês: dois meses com extra em aberto é o caso que prova o
  // seletor de mês do painel de pagar e o cartão do mês na tela.
  meses: [
    { mes: "2026-07", geradoMin: 390, devidoMin: 0, creditoMin: 270, debitoMin: 0, pagoMin: 120, saldoMin: 270, corrente: false, geradoEspecialMin: 0, creditoEspecialMin: 0, pagoEspecialMin: 0 },
    { mes: "2026-08", geradoMin: 330, devidoMin: 30, creditoMin: 300, debitoMin: 0, pagoMin: 0, saldoMin: 300, corrente: true, geradoEspecialMin: 240, creditoEspecialMin: 240, pagoEspecialMin: 0 },
  ],
};
const BANCO_PESSOA = {
  pessoaId: "pp1", nome: "Beatriz Souza Nascimento", fotoUrl: null, jornadaMin: 480,
  entradaPrevista: "08:00", saidaPrevista: "17:00", almocoInicio: "12:00", almocoFim: "13:00",
  mes: "2026-08", de: "2026-08-01", ate: "2026-08-31",
  trabalhadoMin: 3555, metaMin: 3360, saldoMin: 570, saldoMesMin: 300,
  diasTrabalhados: 8, faltas: 0,
  dias: [
    DIA_BANCO("2026-08-02", 0, 240, true), DIA_BANCO("2026-08-03", 1, 0), DIA_BANCO("2026-08-04", 2, 90),
    DIA_BANCO("2026-08-05", 3, 0), DIA_BANCO("2026-08-06", 4, -30),
    // Os dois tipos de feriado no calendário: 07 é feriado de verdade (borda
    // cheia) e 20 é o trocado por outro dia de folga (borda tracejada).
    DIA_FERIADO("2026-08-07", 5, "folga"), DIA_FERIADO("2026-08-20", 4, "troca"),
    DIA_ATESTADO_MANHA, DIA_DUAS_SAIDAS, DIA_PEDIDO_PENDENTE,
  ],
  ledger: LEDGER_BANCO,
};
export const BANCO_HORAS = {
  escopo: "pessoa", mes: "2026-08", metaHoras: 8, isAdmin: true,
  // Um de cada tipo: 07/09 é feriado de verdade (extra com adicional) e 20/08 é
  // feriado trocado por outro dia de folga (extra comum).
  feriados: [{ dia: "2026-08-20", descricao: "Trocado pela folga de sábado", tipo: "troca" }, { dia: "2026-08-07", descricao: "Feriado", tipo: "folga" }],
  pessoas: [BANCO_PESSOA], banco: BANCO_PESSOA,
};

// ── Painel de Ponto (status de hoje + cadastro) ──────────────────────────────
// O painel busca /api/ponto/status e /api/ponto/pessoas; sem sessão ele ficaria
// preso em "Carregando…" e o que precisa de prova (KPIs, atenção, tabela que
// vira card, drawer) nunca apareceria.
const hojeISO = "2026-08-07";
const em = (hhmm: string) => `${hojeISO}T${String(Number(hhmm.slice(0, 2)) + 3).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
// `expediente: false` = hoje não é dia de trabalho dessa pessoa (sábado de quem
// não faz sábado, feriado). Sem esse caso na amostra, o bug de "ATRASADO no
// sábado" não aparece na prova.
export const PONTO_STATUS = {
  resumo: { presentes: 3, almoco: 1, saiu: 1, ausentes: 1, folga: 1, total: 7 },
  pessoas: [
    { id: "pp1", nome: "Beatriz Souza Nascimento", fotoUrl: null, situacao: "presente", entrada: em("08:03"), ultima: em("08:03"), ultimoTipo: "entrada", entradaPrevista: "08:00", saidaPrevista: "17:00", batidas: 1, expediente: true },
    { id: "pp2", nome: "Vinicius Andrade", fotoUrl: null, situacao: "almoco", entrada: em("07:58"), ultima: em("12:01"), ultimoTipo: "almoco", entradaPrevista: "08:00", saidaPrevista: "17:00", batidas: 2, expediente: true },
    { id: "pp3", nome: "Gustavo Lima", fotoUrl: null, situacao: "ausente", entrada: null, ultima: null, ultimoTipo: null, entradaPrevista: "08:00", saidaPrevista: "17:00", batidas: 0, expediente: true },
    { id: "pp4", nome: "Letícia Barros", fotoUrl: null, situacao: "ausente", entrada: null, ultima: null, ultimoTipo: null, entradaPrevista: "08:00", saidaPrevista: "17:00", batidas: 0, expediente: false },
    { id: "pp5", nome: "Davi Nogueira", fotoUrl: null, situacao: "saiu", entrada: em("08:00"), ultima: em("17:02"), ultimoTipo: "saida", entradaPrevista: "08:00", saidaPrevista: "17:00", batidas: 4, expediente: true },
    { id: "pp6", nome: "Maria Aparecida de Souza Nascimento", fotoUrl: null, situacao: "presente", entrada: em("07:50"), ultima: em("13:00"), ultimoTipo: "retorno", entradaPrevista: "08:00", saidaPrevista: "12:00", batidas: 3, expediente: true },
    { id: "pp7", nome: "João", fotoUrl: null, situacao: "presente", entrada: em("08:10"), ultima: em("13:05"), ultimoTipo: "retorno", entradaPrevista: "08:00", saidaPrevista: "17:00", batidas: 3, expediente: true },
  ],
};
export const PONTO_PESSOAS = {
  pessoas: PONTO_STATUS.pessoas.map((p) => ({
    id: p.id, nome: p.nome, colaboradorId: null, fotoUrl: null, fotos: [], temPin: false, consentimento: true,
    jornadaMin: 480, trabalhaSabado: false, sabadoMin: null,
    entradaPrevista: p.entradaPrevista, saidaPrevista: p.saidaPrevista, almocoInicio: "12:00", almocoFim: "13:00",
    turnoId: null, ativo: true, createdAt: "2026-01-01T00:00:00.000Z",
  })),
};

// Batidas de hoje — a aba Registros também busca sozinha.
export const PONTO_REGISTROS = {
  registros: [
    { id: "r1", pessoaId: "pp1", pessoaNome: "Beatriz Souza Nascimento", pessoaFoto: null, tipo: "entrada", batidoEm: em("08:03"), selfieUrl: null, confianca: 0.97, origem: "tablet" },
    { id: "r2", pessoaId: "pp1", pessoaNome: "Beatriz Souza Nascimento", pessoaFoto: null, tipo: "almoco", batidoEm: em("12:00"), selfieUrl: null, confianca: 0.95, origem: "tablet" },
    { id: "r3", pessoaId: "pp1", pessoaNome: "Beatriz Souza Nascimento", pessoaFoto: null, tipo: "retorno", batidoEm: em("13:01"), selfieUrl: null, confianca: 0.96, origem: "tablet" },
    { id: "r4", pessoaId: "pp1", pessoaNome: "Beatriz Souza Nascimento", pessoaFoto: null, tipo: "saida", batidoEm: em("17:05"), selfieUrl: null, confianca: 0.94, origem: "tablet" },
    { id: "r5", pessoaId: "pp2", pessoaNome: "Vinicius Andrade", pessoaFoto: null, tipo: "entrada", batidoEm: em("07:58"), selfieUrl: null, confianca: 0.99, origem: "tablet" },
    { id: "r6", pessoaId: "pp2", pessoaNome: "Vinicius Andrade", pessoaFoto: null, tipo: "almoco", batidoEm: em("12:01"), selfieUrl: null, confianca: 0.98, origem: "tablet" },
    { id: "r7", pessoaId: "pp2", pessoaNome: "Vinicius Andrade", pessoaFoto: null, tipo: "retorno", batidoEm: em("13:00"), selfieUrl: null, confianca: 0.98, origem: "manual" },
    { id: "r8", pessoaId: "pp6", pessoaNome: "Maria Aparecida de Souza Nascimento", pessoaFoto: null, tipo: "entrada", batidoEm: em("07:50"), selfieUrl: null, confianca: 0.91, origem: "tablet" },
  ],
};

// ── Contatos (TridiFlow) ─────────────────────────────────────────────────────
// A mistura importa mais que a quantidade: precisa ter lead concluído, lead que
// parou no meio COM contato (é o que a fila "Recuperar" separa), lead sem
// contato nenhum, e pelo menos um de cada estágio já marcado — senão a prova
// não desenha os chips coloridos nem o botão de recuperação.
//
// Nome longo de propósito em dois deles: é o que estoura coluna em 320px.
const atras_ = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export const LEADS_TRIDIFLOW = [
  {
    id: "l1", botId: "b1", botNome: "Diagnóstico de pele", iniciadaEm: atras_(2), concluidaEm: atras_(2),
    ultimaEtapa: "offer", utm: { utm_source: "meta", utm_campaign: "frio-video-01" },
    respostas: { nome: "Ana Carolina", telefone: "(11) 91234-5678", email: "ana@exemplo.com", q1: "Oleosa" },
    estagio: "qualificado", nota: "Pediu pra ligar depois das 18h.", trabalhadoEm: atras_(1),
  },
  {
    id: "l2", botId: "b1", botNome: "Diagnóstico de pele", iniciadaEm: atras_(5), concluidaEm: null,
    ultimaEtapa: "q3", utm: { utm_source: "meta" },
    respostas: { nome: "Maria Aparecida de Souza Nascimento", whatsapp: "(21) 98888-7777" },
    estagio: null, nota: null, trabalhadoEm: null,
  },
  {
    id: "l3", botId: "b2", botNome: "Qualificação — carimbos", iniciadaEm: atras_(9), concluidaEm: null,
    ultimaEtapa: "q1", utm: {},
    respostas: { q1: "Ainda pesquisando" },
    estagio: null, nota: null, trabalhadoEm: null,
  },
  {
    id: "l4", botId: "b2", botNome: "Qualificação — carimbos", iniciadaEm: atras_(26), concluidaEm: atras_(25),
    ultimaEtapa: "offer", utm: { utm_source: "google", utm_medium: "cpc" },
    respostas: { seu_nome: "Vinicius Andrade", fone: "(31) 97777-1212", email: "vini@exemplo.com" },
    estagio: "ganho", nota: "Fechou o kit médio.", trabalhadoEm: atras_(20),
  },
  {
    id: "l5", botId: "b3", botNome: "Página com VSL", iniciadaEm: atras_(50), concluidaEm: null,
    ultimaEtapa: "formulario", utm: { utm_source: "instagram" },
    respostas: { nome: "Beatriz Souza Nascimento", email: "bia@exemplo.com", variante: "b" },
    estagio: "contatado", nota: null, trabalhadoEm: atras_(48),
  },
  {
    id: "l6", botId: "b3", botNome: "Página com VSL", iniciadaEm: atras_(70), concluidaEm: null,
    ultimaEtapa: "q2", utm: {},
    respostas: { nome: "Roberto", celular: "(41) 96666-3333" },
    estagio: "perdido", nota: "Número errado, duas tentativas.", trabalhadoEm: atras_(60),
  },
];

// ── Cofre de acessos (Pessoas › Cofre) ───────────────────────────────────────
// A aba busca sozinha; sem rede falsa a prova abriria em "Não consegui
// carregar o cofre" e a medição de 320px nunca veria uma linha de credencial —
// que é justamente onde a faixa de 4 colunas vira card. Senhas de mentira: o
// que a prova mede é largura, não segredo.
const cred = (id: string, colaboradorId: string, servico: string, categoria: string, login: string, url?: string) => ({
  id, colaboradorId, servico, categoria, url: url ?? null, login,
  notas: null, criadoEm: "2026-08-01T12:00:00Z", atualizadoEm: "2026-08-01T12:00:00Z",
});

export const ACESSOS_COFRE = {
  configurado: true,
  credenciais: [
    cred("c1", "u1", "Meta Business Suite", "Redes sociais", "gustavo.paulino@tridi.com", "https://business.facebook.com"),
    cred("c2", "u1", "Google Workspace", "Ferramentas internas", "gustavo.p@tridi.com"),
    cred("c3", "u1", "Painel de hospedagem com nome bem comprido", "Infraestrutura", "gustavo.paulino.marketing@tridi.com"),
    cred("c4", "u2", "RD Station", "Marketing", "paola.ferraz@tridi.com"),
    cred("c5", "u2", "Yampi", "Financeiro", "paola.f@tridi.com"),
    cred("c6", "u5", "Melhor Envio", "Ferramentas internas", "henrique.campos@tridi.com"),
  ],
};

export const ACESSOS_LOG = {
  log: [
    { id: "l1", credencialId: "c1", atorNome: "Caio Silva", acao: "revelar", servico: "Meta Business Suite", colaboradorNome: "Gustavo Paulino", criadoEm: "2026-08-22T18:40:00Z" },
    { id: "l2", credencialId: "c4", atorNome: "Caio Silva", acao: "copiar", servico: "RD Station", colaboradorNome: "Paola Ferraz", criadoEm: "2026-08-22T14:05:00Z" },
    { id: "l3", credencialId: "c6", atorNome: "Caio Silva", acao: "criar", servico: "Melhor Envio", colaboradorNome: "Henrique Campos", criadoEm: "2026-08-20T09:12:00Z" },
  ],
};

// ── Histórico de Atividades (a linha do tempo do dia) ───────────────────────
// Horários calculados SOBRE O DIA CORRENTE em São Paulo: a timeline só mostra
// o que aconteceu "no dia", então fixture com data fixa apareceria vazia e a
// prova não provaria nada. Cobre os cinco estados, duração medida (com desvio
// pra mais e pra menos), card sem estimativa, pool sem dono e cancelada.
const hojeAs = (h: number, m = 0) => {
  const agora = new Date();
  const sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  // desloca do relógio de SP pro instante certo: o ISO resultante cai na hora
  // pedida QUANDO LIDO em America/Sao_Paulo, que é como a timeline lê.
  const delta = (h * 60 + m) - (sp.getHours() * 60 + sp.getMinutes());
  return new Date(agora.getTime() + delta * 60000).toISOString();
};

export const ATIVIDADES_HISTORICO: Atividade[] = [
  { ...base(31), id: "h1", tarefa: "Carimbo automático 38×14mm", status: "concluida", quantidade_feita: 10,
    iniciada_at: hojeAs(8, 7), concluida_at: hojeAs(8, 42), created_at: hojeAs(7, 55), tempo_estimado_min: 28 },
  { ...base(32), id: "h2", tarefa: "Conferência de entrada", categoria: "Logística", para_id: "c3", para_nome: "Gustavo Lima",
    detalhe: DETALHE_LONGO, status: "concluida", quantidade_alvo: 1, quantidade_feita: 1,
    iniciada_at: hojeAs(9, 10), concluida_at: hojeAs(9, 32), created_at: hojeAs(9, 0), tempo_estimado_min: 30 },
  { ...base(33), id: "h3", tarefa: "Arte para campanha de agosto", categoria: "Design", para_id: "c4", para_nome: "Letícia Barros",
    urgente: true, status: "em_andamento", quantidade_alvo: 1, iniciada_at: hojeAs(10, 15), created_at: hojeAs(9, 40), tempo_estimado_min: null },
  { ...base(34), id: "h4", tarefa: "Separação de pedidos da manhã", categoria: "Logística", para_id: "c2", para_nome: "Davi Nogueira",
    status: "pendente", created_at: hojeAs(11, 5), tempo_estimado_min: 45 },
  { ...base(35), id: "h5", tarefa: "Montar estrutura da almofada 22", categoria: "Almofadas", produto_nome: "Almofada para carimbo nº 2",
    status: "concluida", quantidade_feita: 10, iniciada_at: hojeAs(13, 30), concluida_at: hojeAs(14, 5), created_at: hojeAs(13, 20), tempo_estimado_min: 40 },
  { ...base(36), id: "h6", tarefa: "Reabastecer bancada de chancela", categoria: "Preparo", para_id: null, para_nome: null,
    pool: true, setor: "Produção", status: "pendente", created_at: hojeAs(14, 40), tempo_estimado_min: null },
  { ...base(37), id: "h7", tarefa: "Pedido nº 8123 — gravação especial", categoria: "Produção",
    status: "pendente", prazo: "2026-01-05", created_at: hojeAs(15, 10) },
];

export const CANCELADAS_HISTORICO: Atividade[] = [
  { ...base(38), id: "h8", tarefa: "Lote de teste do fornecedor novo", categoria: "Produção",
    status: "cancelada", motivo_impedimento: "Pedido cancelado pelo cliente", created_at: hojeAs(16, 25) },
];
