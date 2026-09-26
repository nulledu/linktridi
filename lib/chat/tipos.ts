// Contrato único entre servidor e interface do chat da Central.
// Tudo que trafega nas rotas /api/central/chat/* está descrito aqui.

export type TipoCanal = "direta" | "grupo" | "setor" | "canal";
export type PapelMembro = "dono" | "admin" | "membro";
export type ModoNotificacao = "todas" | "mencoes" | "nenhuma";
export type StatusPresenca = "online" | "ausente" | "ocupado" | "offline";
export type TipoMensagem = "texto" | "sistema" | "card";

/** Entidade do ERP referenciada dentro de uma mensagem (card contextual). */
export interface CardContexto {
  tipo: string;              // atividade | pedido | tarefa | criativo | caixa …
  ref: string;               // id da entidade
  titulo: string;
  subtitulo?: string | null;
  url?: string | null;       // rota interna para abrir sem sair da conversa
  cor?: string | null;
  meta?: Record<string, string | number | null> | null;
}

export interface Anexo {
  id?: string;
  url: string;
  nome: string;
  mime: string;
  tamanho?: number | null;
  largura?: number | null;
  altura?: number | null;
}

export interface Canal {
  id: string;
  tipo: TipoCanal;
  nome: string;
  descricao: string | null;
  topico: string | null;
  slug: string | null;
  avatar: string | null;
  cor: string | null;               // linha de contexto
  categoria_id: string | null;
  contexto_tipo: string | null;
  contexto_ref: string | null;
  privado: boolean;
  somente_leitura: boolean;
  arquivado: boolean;
  membros: number;
  favorita: boolean;
  papel: PapelMembro;
  notificar: ModoNotificacao;
  mudo_ate: string | null;
  atualizado_em: string;
  ultima: { texto: string; autor: string | null; created_at: string } | null;
  nao_lidas: number;
  mencoes: number;                  // não lidas que citam você
  /** Só em conversa direta: com quem você está falando. */
  parceiro_id?: string | null;
}

export interface Categoria {
  id: string;
  nome: string;
  ordem: number;
}

export interface Mensagem {
  id: string;
  conversa_id: string;
  autor_id: string;
  autor_nome: string | null;
  texto: string | null;
  tipo: TipoMensagem;
  anexos: Anexo[];
  card: CardContexto | null;
  responde_a: string | null;
  thread_id: string | null;
  respostas: number;
  ultima_resposta_em: string | null;
  fixada: boolean;
  editada_em: string | null;
  excluida_em: string | null;
  mencoes: string[];
  mencao_todos: boolean;
  created_at: string;
  /** Só no cliente: bolha otimista ainda não confirmada pelo servidor. */
  _estado?: "enviando" | "falhou";
}

export interface Reacao {
  mensagem_id: string;
  user_id: string;
  emoji: string;
}

export interface Pessoa {
  id: string;
  name: string;
  setor: string | null;
  avatar: string | null;
  status?: StatusPresenca;
}

export interface Membro extends Pessoa {
  papel: PapelMembro;
  entrou_em: string;
}

/** Página de mensagens: `antes` é o cursor para buscar as mais antigas. */
export interface PaginaMensagens {
  mensagens: Mensagem[];
  reacoes: Reacao[] | null;
  autores: Record<string, { nome: string; avatar: string | null }>;
  cursor: string | null;      // created_at da mais antiga desta página
  tem_mais: boolean;
}

export interface ResultadoBusca {
  mensagens: { mensagem: Mensagem; canal: { id: string; nome: string; tipo: TipoCanal } }[];
  canais: Canal[];
  pessoas: Pessoa[];
  arquivos: (Anexo & { conversa_id: string; canal: string; created_at: string })[];
}
