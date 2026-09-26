// ── TridiFlow · gestão de leads ──────────────────────────────────────────────
//
// A tela de Contatos já mostrava um "status" — mas ele era CALCULADO no cliente
// a cada render e jogado fora no F5. Dava pra olhar a lista; não dava pra
// TRABALHAR a lista: marcar quem já foi contatado, quem fechou, quem sumiu.
// Duas pessoas ligavam pro mesmo lead e ninguém sabia.
//
// Aqui moram duas ideias separadas de propósito, porque respondem perguntas
// diferentes e misturá-las foi o que deixou o status antigo ambíguo:
//
//   ESTÁGIO  — o que NÓS já fizemos com o lead. Persistido, editável.
//   SITUAÇÃO — o que o LEAD deixou de dados. Derivada, nunca editável.
//
// Um lead pode estar "ganho" com dados incompletos, e "novo" com tudo
// preenchido. São eixos independentes.
//
// Puro e client-safe: a tela, a API e os testes leem daqui.

export type Estagio = "novo" | "contatado" | "qualificado" | "ganho" | "perdido";

export const ESTAGIOS: { id: Estagio; label: string; cor: string; dica: string }[] = [
  { id: "novo", label: "Novo", cor: "var(--azul)", dica: "Chegou e ninguém falou com ele ainda" },
  { id: "contatado", label: "Em contato", cor: "var(--atencao)", dica: "Alguém já chamou" },
  { id: "qualificado", label: "Qualificado", cor: "var(--roxo, var(--primary-texto))", dica: "Tem perfil e interesse" },
  { id: "ganho", label: "Ganho", cor: "var(--ok)", dica: "Fechou" },
  { id: "perdido", label: "Perdido", cor: "var(--perigo)", dica: "Não vai fechar" },
];

const POR_ID = new Map(ESTAGIOS.map((e) => [e.id, e]));
export const ehEstagio = (v: unknown): v is Estagio => typeof v === "string" && POR_ID.has(v as Estagio);
export const estagioDe = (v: string | null | undefined): Estagio => (ehEstagio(v) ? v : "novo");
export const infoEstagio = (v: string | null | undefined) => POR_ID.get(estagioDe(v))!;

/** Estágios que encerram o trabalho — somem da fila do dia. */
export const ENCERRADOS: Estagio[] = ["ganho", "perdido"];
export const estaAberto = (v: string | null | undefined) => !ENCERRADOS.includes(estagioDe(v));

// ── Situação dos dados ───────────────────────────────────────────────────────

/** Nomes por onde cada dado costuma chegar. O funil grava com o nome da
 *  variável que o autor escolheu, então procurar por um só nome perde metade. */
const APELIDOS = {
  nome: ["nome", "name", "primeiro_nome", "seu_nome"],
  email: ["email", "e-mail", "mail"],
  telefone: ["telefone", "whatsapp", "celular", "phone", "tel", "fone"],
} as const;

const chave = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function achar(respostas: Record<string, string>, quais: readonly string[]): string {
  for (const [k, v] of Object.entries(respostas ?? {})) {
    if (v && quais.includes(chave(k))) return v;
  }
  return "";
}

export const nomeDoLead = (r: Record<string, string>) => achar(r, APELIDOS.nome);
export const emailDoLead = (r: Record<string, string>) => achar(r, APELIDOS.email);
export const telefoneDoLead = (r: Record<string, string>) => achar(r, APELIDOS.telefone);

export interface LeadBase {
  concluidaEm: string | null;
  respostas: Record<string, string>;
}

/** Dá pra falar com esta pessoa? É a única pergunta que importa pra decidir se
 *  o lead entra na fila de alguém. */
export const temContato = (l: LeadBase) => !!(telefoneDoLead(l.respostas) || emailDoLead(l.respostas));

/** Pontuação de QUALIDADE DO DADO — não de intenção. Serve pra ordenar a fila:
 *  telefone vale mais que e-mail porque é por onde se vende. */
export function pontuacao(l: LeadBase): number {
  return Math.min(100,
    (telefoneDoLead(l.respostas) ? 40 : 0) +
    (emailDoLead(l.respostas) ? 25 : 0) +
    (nomeDoLead(l.respostas) ? 15 : 0) +
    (l.concluidaEm ? 20 : 0));
}

export const corDaPontuacao = (n: number) => (n >= 70 ? "var(--ok)" : n >= 40 ? "var(--atencao)" : "var(--perigo)");

// ── Recuperação ──────────────────────────────────────────────────────────────

/** Abandonou COM contato: começou o funil, deixou telefone ou e-mail e não
 *  chegou ao fim.
 *
 *  É o lead mais mal aproveitado que existe. Ele já disse quem é e já
 *  demonstrou interesse — só não terminou. Antes disto ele aparecia na lista
 *  como "incompleto" e morria ali, sem nenhuma forma de separá-lo de quem
 *  entrou e não deixou nada. */
export function ehRecuperavel(l: LeadBase & { estagio?: string | null }): boolean {
  return !l.concluidaEm && temContato(l) && estaAberto(l.estagio);
}

export type Situacao = "recuperavel" | "completo" | "incompleto";

/** Situação dos DADOS, sempre derivada. */
export function situacaoDe(l: LeadBase & { estagio?: string | null }): { id: Situacao; label: string; cor: string } {
  if (l.concluidaEm) return { id: "completo", label: "Concluiu", cor: "var(--ok)" };
  if (temContato(l)) return { id: "recuperavel", label: "Parou no meio", cor: "var(--atencao)" };
  return { id: "incompleto", label: "Sem contato", cor: "var(--text-dim)" };
}

// ── Anotação ─────────────────────────────────────────────────────────────────

/** Anotação do vendedor. Cortada no servidor também — o limite aqui é pra a
 *  tela avisar antes, não pra ser a defesa. */
export const NOTA_MAX = 2000;
export const notaSegura = (v: string | undefined | null): string =>
  (v ?? "").replace(/\s+$/g, "").slice(0, NOTA_MAX);
