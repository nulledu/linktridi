// Dados de prova da Operação › Visão geral (/dev-mobile?ws=operacao) — no
// formato exato que a página monta, pra medir a tela sem login.
import type { DadosOperacao } from "../(plataforma)/operacao/geral/VisaoGeralOperacao";

const agora = Date.now();
const hmin = (min: number) => new Date(agora - min * 60_000).toISOString();
const dia = (n: number) => new Date(agora - 3 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);

const atividades = {
  pendentes: 58, emAndamento: 3, urgentes: 4, impedidas: 9,
  concluidas: { valor: 8, ontem: 6 }, pecas: { valor: 124, ontem: 101 },
  operadores: { valor: 2, ontem: 2 }, tmaMin: { valor: 45, ontem: 55 },
  semana: [38, 42, 35, 68, 40, 55, 52].map((pecas, i) => ({ dia: dia(6 - i), pecas })),
  proximas: [
    { id: "p1", tarefa: "Abastecer linha 2", setor: "Produção", prazo: dia(0), prioridade: "alta" as const, urgente: false },
    { id: "p2", tarefa: "Separar pedidos do lote 14", setor: "Logística", prazo: dia(0), prioridade: "media" as const, urgente: false },
    { id: "p3", tarefa: "Revisão de estoque de embalagens", setor: "Estoque", prazo: dia(-1), prioridade: "media" as const, urgente: false },
    { id: "p4", tarefa: "Limpeza da laser 1", setor: "Produção", prazo: null, prioridade: "baixa" as const, urgente: false },
  ],
  ultimas: [
    { id: "u1", paraId: null, nome: "Ana Silva", fotoUrl: null, tarefa: "Impressão", setor: "Produção", quando: hmin(18), status: "concluida" as const },
    { id: "u2", paraId: null, nome: "Bruno Costa", fotoUrl: null, tarefa: "Separação · Pedido #4581", setor: "Logística", quando: hmin(23), status: "em_andamento" as const },
    { id: "u3", paraId: null, nome: "Mariana Lopes", fotoUrl: null, tarefa: "Conferência", setor: "Estoque", quando: hmin(39), status: "concluida" as const },
    { id: "u4", paraId: null, nome: "Carlos Mendes", fotoUrl: null, tarefa: "Transporte · Pedido #4578", setor: "Logística", quando: hmin(64), status: "concluida" as const },
  ],
};

export const DADOS_OPERACAO_PROVA: DadosOperacao = {
  hoje: new Date(agora).toISOString(),
  atividades, producao: atividades,
  listas: { proximas: atividades.proximas, ultimas: atividades.ultimas },
  estoque: {
    abaixo: 20, zerados: 16, conferir: 147, total: 1248,
    grupos: [
      { rotulo: "Produtos", itens: 842 }, { rotulo: "Peças", itens: 231 },
      { rotulo: "Insumos", itens: 98 }, { rotulo: "Embalagens", itens: 77 },
    ],
  },
  logistica: {
    separacao: { valor: 5, ontem: 4 }, etiqueta: { valor: 3, ontem: 5 },
    prontos: { valor: 12, ontem: 9 }, enviados: { valor: 7, ontem: 6 }, faltandoPeca: 78,
  },
};
