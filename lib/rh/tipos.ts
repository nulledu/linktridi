// ── Vocabulário do RH ────────────────────────────────────────────────────────
// Os enums e rótulos que a tela e o banco compartilham. Fica separado do gate
// porque isto atravessa a fronteira servidor→cliente e o gate não pode: ele
// importa `next/navigation` e `next/headers` por tabela.
//
// `Selo` vem do Financeiro de propósito. É a MESMA pílula de status desenhada
// pelo mesmo componente; declarar uma cópia aqui faria duas fontes para a
// mesma coisa, e é assim que dois módulos param de parecer o mesmo produto.
import type { Selo } from "@/lib/financeiro/tipos";

export type { Selo };

// ── Situação do colaborador ──────────────────────────────────────────────────
// Quatro estados, e "férias" é um deles de propósito: quem abre a lista quer
// saber quem está NA empresa hoje, e alguém de férias não está — mas também
// não está afastado nem desligado. O Financeiro tem três (`fin_colaboradores`,
// sem férias) porque lá a pergunta é outra: quem entra na folha.
export const RH_SITUACOES = ["ativo", "ferias", "afastado", "desligado"] as const;
export type RhSituacao = (typeof RH_SITUACOES)[number];

export const SELO_SITUACAO: Record<RhSituacao, Selo> = {
  ativo:     { label: "Ativo",     cor: "var(--ok)" },
  ferias:    { label: "Férias",    cor: "var(--azul)" },
  afastado:  { label: "Afastado",  cor: "var(--atencao)" },
  desligado: { label: "Desligado", cor: "var(--neutro)" },
};

export const ICONE_SITUACAO: Record<RhSituacao, string> = {
  ativo: "user-check", ferias: "sun", afastado: "user-off", desligado: "logout",
};

export function ehSituacao(v: unknown): v is RhSituacao {
  return typeof v === "string" && (RH_SITUACOES as readonly string[]).includes(v);
}

// ── Setores ──────────────────────────────────────────────────────────────────
// Lista OFERECIDA, não lista fechada. A coluna continua sendo texto livre, e a
// tela aceita o que já está gravado — mas digitar o setor à mão criava
// "Produção", "produção" e "Produçao" como três setores diferentes, e a lista
// de colaboradores agrupa e conta por essa string. Escolher de uma lista é o
// que faz o filtro de cima e o retrato dos setores baterem com a realidade.
//
// Quem não tem setor aparece como "Outros" na lista — isso é ausência de
// valor, e por isso "Outros" NÃO entra aqui: cadastrar alguém literalmente em
// "Outros" faria dois grupos com o mesmo nome e contagens diferentes.
//
// Design e TI entraram em 17/09/2026 (pedido do dono): os dois são setores da
// casa — o Design tem módulo próprio no ERP e o TI é quem recebe a chave
// `administracao:status` —, e sem eles aqui não havia como cadastrar ninguém
// nos dois. "TI" no lugar de "Tecnologia" porque é como a empresa os chama; um
// setor com dois nomes vira dois grupos na contagem.
//
// ATENÇÃO: os chips do topo da lista contam quem ESTÁ cadastrado, não o que
// esta lista oferece. Setor novo só aparece lá depois que alguém for posto
// nele — um chip "Design (0)" diria que ninguém trabalha com design, o que é
// diferente de "ninguém foi classificado ainda".
export const RH_SETORES = [
  "Produção",
  "Comercial",
  "Vendas",
  "Marketing",
  "Design",
  "Logística",
  "Administrativo",
  "Financeiro",
  "Recursos Humanos",
  "TI",
  "Atendimento",
  "Qualidade",
  "Manutenção",
] as const;

// ── Documentos ───────────────────────────────────────────────────────────────
// Tipo é lista FECHADA e curta: é o que permite filtrar e contar. "Outro"
// existe para não travar quem precisa guardar algo hoje — sem ele o campo
// viraria texto livre e em um mês ninguém acha nada.
export const RH_DOC_TIPOS = [
  "contrato", "identidade", "cpf", "ctps", "comprovante_residencia",
  "titulo_eleitor", "certificado", "exame_admissional", "exame_periodico",
  "advertencia", "rescisao", "outro",
] as const;
export type RhDocTipo = (typeof RH_DOC_TIPOS)[number];

export const LABEL_DOC_TIPO: Record<RhDocTipo, string> = {
  contrato: "Contrato de trabalho",
  identidade: "RG / CNH",
  cpf: "CPF",
  ctps: "Carteira de trabalho",
  comprovante_residencia: "Comprovante de residência",
  titulo_eleitor: "Título de eleitor",
  certificado: "Certificado / diploma",
  exame_admissional: "Exame admissional",
  exame_periodico: "Exame periódico",
  advertencia: "Advertência",
  rescisao: "Rescisão",
  outro: "Outro",
};

export function ehDocTipo(v: unknown): v is RhDocTipo {
  return typeof v === "string" && (RH_DOC_TIPOS as readonly string[]).includes(v);
}

// ── Atestados ────────────────────────────────────────────────────────────────
export const RH_ATESTADO_STATUS = ["pendente", "aceito", "recusado"] as const;
export type RhAtestadoStatus = (typeof RH_ATESTADO_STATUS)[number];

export const SELO_ATESTADO: Record<RhAtestadoStatus, Selo> = {
  pendente: { label: "Pendente", cor: "var(--atencao)" },
  aceito:   { label: "Aceito",   cor: "var(--ok)" },
  recusado: { label: "Recusado", cor: "var(--perigo)" },
};

export function ehAtestadoStatus(v: unknown): v is RhAtestadoStatus {
  return typeof v === "string" && (RH_ATESTADO_STATUS as readonly string[]).includes(v);
}

// ── Férias ───────────────────────────────────────────────────────────────────
export const RH_FERIAS_STATUS = ["programada", "em_gozo", "concluida", "cancelada"] as const;
export type RhFeriasStatus = (typeof RH_FERIAS_STATUS)[number];

export const SELO_FERIAS: Record<RhFeriasStatus, Selo> = {
  programada: { label: "Programada", cor: "var(--azul)" },
  em_gozo:    { label: "Em gozo",    cor: "var(--ok)" },
  concluida:  { label: "Concluída",  cor: "var(--neutro)" },
  cancelada:  { label: "Cancelada",  cor: "var(--perigo)" },
};

export function ehFeriasStatus(v: unknown): v is RhFeriasStatus {
  return typeof v === "string" && (RH_FERIAS_STATUS as readonly string[]).includes(v);
}

/** Dias de férias que um período aquisitivo rende pela CLT. */
export const DIAS_DE_FERIAS_POR_PERIODO = 30;

// ── Histórico ────────────────────────────────────────────────────────────────
// A linha do tempo do colaborador. O `tipo` decide o ícone e a cor; o resto é
// texto já escrito por quem gravou — a leitura nunca remonta a frase, senão
// mudar um rótulo reescreveria o passado.
export const RH_HISTORICO_TIPOS = [
  "admissao", "cargo", "setor", "situacao", "cadastro",
  "documento", "atestado", "ferias", "anamnese", "desligamento", "nota",
] as const;
export type RhHistoricoTipo = (typeof RH_HISTORICO_TIPOS)[number];

export const ICONE_HISTORICO: Record<RhHistoricoTipo, string> = {
  admissao: "user-plus", cargo: "briefcase", setor: "apps", situacao: "flag",
  cadastro: "pencil", documento: "folder", atestado: "file-text", ferias: "sun",
  anamnese: "clipboard-list", desligamento: "logout", nota: "message",
};

export const COR_HISTORICO: Record<RhHistoricoTipo, string> = {
  admissao: "var(--ok)", cargo: "var(--roxo)", setor: "var(--azul)",
  situacao: "var(--atencao)", cadastro: "var(--neutro)", documento: "var(--azul)",
  atestado: "var(--atencao)", ferias: "var(--azul)", anamnese: "var(--roxo)",
  desligamento: "var(--neutro)", nota: "var(--neutro)",
};

export function ehHistoricoTipo(v: unknown): v is RhHistoricoTipo {
  return typeof v === "string" && (RH_HISTORICO_TIPOS as readonly string[]).includes(v);
}

// ── As linhas que a tela recebe ──────────────────────────────────────────────

/** Uma pessoa na lista do RH. Junta `profiles`, `employees` e `rh_fichas`. */
export interface ColaboradorRh {
  id: string;
  nome: string;
  username: string;
  /** Ligado/desligado do LOGIN (`profiles.active`) — não é a situação do RH. */
  ativo: boolean;
  /** Tem conta mas nunca entrou: o convite de acesso não foi usado. */
  pendente: boolean;
  foto: string | null;
  cargo: string | null;
  setor: string | null;
  departamento: string | null;
  telefone: string | null;
  admissao: string | null;
  situacao: RhSituacao;
}

export interface FichaRh {
  employee_id: string;
  situacao: RhSituacao;
  data_nascimento: string | null;
  cpf: string | null;
  rg: string | null;
  estado_civil: string | null;
  email_pessoal: string | null;
  telefone_emergencia: string | null;
  contato_emergencia: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
}

export interface DocumentoRh {
  id: string;
  employee_id: string;
  tipo: RhDocTipo;
  titulo: string;
  arquivo: string | null;
  emitido_em: string | null;
  validade: string | null;
  observacao: string | null;
  created_at: string;
  autor_nome: string | null;
}

export interface AtestadoRh {
  id: string;
  employee_id: string;
  de: string;
  ate: string;
  dias: number;
  emitido_em: string | null;
  cid: string | null;
  profissional: string | null;
  status: RhAtestadoStatus;
  arquivo: string | null;
  observacao: string | null;
  created_at: string;
  autor_nome: string | null;
}

export interface FeriasRh {
  id: string;
  employee_id: string;
  aquisitivo_de: string | null;
  aquisitivo_ate: string | null;
  de: string;
  ate: string;
  dias: number;
  status: RhFeriasStatus;
  observacao: string | null;
  created_at: string;
  autor_nome: string | null;
}

export interface HistoricoRh {
  id: string;
  employee_id: string;
  tipo: RhHistoricoTipo;
  titulo: string;
  detalhe: string | null;
  autor_nome: string | null;
  created_at: string;
}

export interface AnamneseRh {
  employee_id: string;
  dados: Record<string, unknown>;
  atualizado_em: string | null;
  atualizado_por_nome: string | null;
}

// ── Contas da visão geral ────────────────────────────────────────────────────
// Poucos números de propósito. A regra da tela é a do Financeiro: informação
// importante em primeiro plano, detalhe a um clique — não um painel cheio.
export interface ResumoRh {
  total: number;
  ativos: number;
  ferias: number;
  afastados: number;
  /** Admitidos nos últimos 90 dias. */
  novos: number;
}

/**
 * Os cinco números do topo.
 *
 * Contados sobre a lista que a tela JÁ tem, e não com cinco `count` no banco:
 * são cinco idas de 250–700 ms para responder o que cabe num laço sobre
 * quarenta linhas que já estão na memória.
 *
 * Mora AQUI, e não em `dados.ts`, porque é conta pura e `dados.ts` importa o
 * cliente admin do Supabase — que puxa `next/headers`. Um componente de
 * cliente que importasse a conta de lá arrastaria o módulo de servidor inteiro
 * e o build quebraria com "You're importing a module that depends on
 * next/headers". Foi o que aconteceu no banco de provas.
 */
export function resumoDoRh(lista: ColaboradorRh[], hoje: string): ResumoRh {
  const noventaDiasAtras = new Date(Date.parse(`${hoje}T00:00:00Z`) - 90 * 86_400_000)
    .toISOString().slice(0, 10);
  let ativos = 0, ferias = 0, afastados = 0, novos = 0, total = 0;
  for (const c of lista) {
    if (c.situacao === "desligado") continue;   // desligado sai da conta da equipe
    total++;
    if (c.situacao === "ativo") ativos++;
    else if (c.situacao === "ferias") ferias++;
    else if (c.situacao === "afastado") afastados++;
    if (c.admissao && c.admissao >= noventaDiasAtras) novos++;
  }
  return { total, ativos, ferias, afastados, novos };
}

/** Quantos dias tem o intervalo, contando as duas pontas. Datas ISO puras. */
export function diasEntre(de: string, ate: string): number {
  const a = Date.parse(`${de}T00:00:00Z`);
  const b = Date.parse(`${ate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

// ── O que a ficha em pop-up recebe ───────────────────────────────────────────
//
// Um tipo só, espelhando a resposta de `GET /api/rh/colaboradores/[id]`. A
// ficha deixou de ser rota e virou painel: sem um contrato nomeado, o
// componente passaria a receber uma dúzia de props soltas e cada aba nova
// acrescentaria mais uma.
//
// `linha` é o `ColabRow` cru de `profiles`+`employees`, e vem sem tipo forte de
// propósito — quem o consome são as peças herdadas da tela de Pessoas
// (`PermissoesTab`, `JornadaTab`, `DesempenhoTab`, `EditarCadastro`), que
// declaram o próprio `ColabRow`. Tipar aqui criaria uma segunda definição da
// mesma linha, e elas divergiriam.
export interface FichaPayload {
  colaborador: ColaboradorRh;
  ficha: FichaRh | null;
  documentos: DocumentoRh[];
  atestados: AtestadoRh[];
  ferias: FeriasRh[];
  historico: HistoricoRh[];
  /** `null` quando quem pediu não tem `rh:anamnese` — o servidor nem lê. */
  anamnese: AnamneseRh | null;
  linha: unknown;
  empresasFinanceiro: { id: string; nome: string }[];
  empresasMarcadas: string[];
  areasQueConcedo: string[];
  /** Papel admin. Distribuir PODER não vem do RH — ver o GET da rota. */
  souAdmin: boolean;
  /** A ficha é a de quem está olhando: a grade trava para ninguém se promover. */
  souEu: boolean;
  schemaPendente: boolean;
}
