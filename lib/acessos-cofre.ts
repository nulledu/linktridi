// ── Cofre de acessos ─────────────────────────────────────────────────────────
// As credenciais que a empresa entrega pra cada colaborador. Duas coisas
// diferentes moram aqui, e a fronteira entre elas é o ponto do módulo:
//
//   · o que é PÚBLICO dentro da tela — serviço, categoria, URL, login. Sai na
//     listagem, aparece pra qualquer pessoa com a chave da aba;
//   · a SENHA, que nunca sai na listagem. Ela viaja cifrada até o banco e só
//     volta em claro por uma chamada própria (`revelarSenha`), que grava
//     auditoria antes de responder.
//
// Sem `ACESSOS_CRYPTO_KEY` o módulo se RECUSA a gravar. É de propósito: a
// alternativa silenciosa (gravar em claro "só por enquanto") é como um cofre
// com senha vira uma planilha, e ninguém percebe até o vazamento.

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// ── Erros que a tela sabe traduzir ───────────────────────────────────────────
export class TabelaAusenteError extends Error { constructor() { super("tabela_ausente"); } }
export class ChaveAusenteError extends Error { constructor() { super("chave_ausente"); } }

const ausente = (msg?: string) =>
  !!msg && /relation .* does not exist|Could not find the table/i.test(msg);
function lancar(msg?: string): never {
  if (ausente(msg)) throw new TabelaAusenteError();
  throw new Error(msg || "erro");
}

// ── A chave ──────────────────────────────────────────────────────────────────
// 32 bytes, em base64 (`openssl rand -base64 32`) ou hex (64 caracteres). As
// duas formas porque quem gera a chave copia o que o comando cuspiu, e exigir
// um formato só é o tipo de detalhe que faz alguém colar um valor de 31 bytes
// e descobrir no deploy.
export function chaveDoCofre(): Buffer {
  const bruto = (process.env.ACESSOS_CRYPTO_KEY || "").trim();
  if (!bruto) throw new ChaveAusenteError();
  const buf = /^[0-9a-fA-F]{64}$/.test(bruto)
    ? Buffer.from(bruto, "hex")
    : Buffer.from(bruto, "base64");
  if (buf.length !== 32) throw new ChaveAusenteError();
  return buf;
}

/** Tem chave configurada? Serve pra tela avisar ANTES de a pessoa digitar uma
 *  senha e receber um erro no submit. */
export function cofreConfigurado(): boolean {
  try { chaveDoCofre(); return true; } catch { return false; }
}

// ── Cifra ────────────────────────────────────────────────────────────────────
// AES-256-GCM: além de embaralhar, GCM AUTENTICA. Se alguém editar o texto
// cifrado direto no banco (trocar bytes na esperança de virar outra senha), o
// `decipher.final()` estoura em vez de devolver lixo plausível. Com CBC não
// estouraria — e uma senha errada que "funciona" é pior que erro.
//
// IV novo a cada gravação, sempre. Reusar IV em GCM é a falha clássica que
// deixa duas senhas cifradas com a mesma chave se compararem entre si.
const PREFIXO = "v1";

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chaveDoCofre(), iv);
  const dado = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [PREFIXO, iv.toString("base64"), c.getAuthTag().toString("base64"), dado.toString("base64")].join(":");
}

export function decifrar(guardado: string): string {
  const [v, ivB64, tagB64, dadoB64] = (guardado || "").split(":");
  if (v !== PREFIXO || !ivB64 || !tagB64 || !dadoB64) throw new Error("formato_invalido");
  const d = createDecipheriv("aes-256-gcm", chaveDoCofre(), Buffer.from(ivB64, "base64"));
  d.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([d.update(Buffer.from(dadoB64, "base64")), d.final()]).toString("utf8");
}

/** Confere sem revelar: usado só nos testes e num eventual "a senha ainda é
 *  esta?". Comparação em tempo constante porque comparar segredo com `===`
 *  vaza o tamanho do prefixo igual pelo tempo de resposta. */
export function conferir(guardado: string, tentativa: string): boolean {
  try {
    const a = Buffer.from(decifrar(guardado), "utf8");
    const b = Buffer.from(tentativa, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

// ── Tipos ────────────────────────────────────────────────────────────────────
export { CATEGORIAS, type Categoria, TIPOS_DE_CREDENCIAL, type TipoDeCredencial } from "@/lib/acessos-categorias";
import { TIPOS_DE_CREDENCIAL as TIPOS, type TipoDeCredencial as TipoDoCofre } from "@/lib/acessos-categorias";

// Coluna nova (SQL: supabase/infraestrutura.sql). Fora do vocabulário, cai em
// 'funcionario' — o que toda credencial anterior à coluna sempre foi.
const tipoValido = (v: unknown): TipoDoCofre =>
  (TIPOS as readonly string[]).includes(v as string) ? (v as TipoDoCofre) : "funcionario";

/** O que a listagem devolve. Repare no que NÃO está aqui: a senha. */
export interface Credencial {
  id: string;
  /** Dono do acesso quando `tipo=funcionario`; RESPONSÁVEL quando `tipo=aplicativo`. */
  colaboradorId: string;
  tipo: TipoDoCofre;
  servico: string;
  categoria: string;
  url: string | null;
  login: string | null;
  notas: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface LinhaLog {
  id: string;
  credencialId: string | null;
  atorNome: string | null;
  acao: string;
  servico: string | null;
  colaboradorNome: string | null;
  criadoEm: string;
}

// Colunas nomeadas, nunca `select("*")` — o `*` arrastaria `senha_enc` pra toda
// listagem, e a regra do módulo é que a senha só sai pela porta que audita.
const COLS = "id,colaborador_id,tipo,servico,categoria,url,login,notas,created_at,updated_at";
// Enquanto o SQL da coluna `tipo` não rodou, o select acima falha com
// "column … does not exist". O degrau de baixo mantém o cofre inteiro no ar —
// tudo aparece como 'funcionario', que é o que tudo era antes da coluna.
const COLS_LEGADO = "id,colaborador_id,servico,categoria,url,login,notas,created_at,updated_at";
const colunaAusente = (msg?: string) =>
  !!msg && /column .*tipo.* does not exist|'tipo' column/i.test(msg);

type Row = {
  id: string; colaborador_id: string; tipo?: string | null; servico: string; categoria: string;
  url: string | null; login: string | null; notas: string | null;
  created_at: string; updated_at: string;
};

const daRow = (r: Row): Credencial => ({
  id: r.id, colaboradorId: r.colaborador_id, tipo: tipoValido(r.tipo), servico: r.servico, categoria: r.categoria,
  url: r.url, login: r.login, notas: r.notas, criadoEm: r.created_at, atualizadoEm: r.updated_at,
});

// Teto de linhas. O cofre de uma empresa de dezenas de pessoas não passa disso,
// e sem `.limit()` uma tabela que cresceu sozinha viraria egress todo carregar.
const TETO = 1000;

// ── Leitura ──────────────────────────────────────────────────────────────────
export async function listarCredenciais(): Promise<Credencial[]> {
  const sb = createSupabaseAdminClient();
  const consulta = (cols: string) => sb
    .from("acessos_credenciais").select(cols)
    .order("servico", { ascending: true }).limit(TETO);
  let { data, error } = await consulta(COLS);
  if (error && colunaAusente(error.message)) ({ data, error } = await consulta(COLS_LEGADO));
  if (error) lancar(error.message);
  return ((data ?? []) as unknown as Row[]).map(daRow);
}

export async function listarLog(limite = 200): Promise<LinhaLog[]> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("acessos_log")
    .select("id,credencial_id,ator_nome,acao,servico_snapshot,colaborador_nome,created_at")
    .order("created_at", { ascending: false }).limit(Math.min(limite, 500));
  if (error) lancar(error.message);
  return ((data ?? []) as {
    id: string; credencial_id: string | null; ator_nome: string | null; acao: string;
    servico_snapshot: string | null; colaborador_nome: string | null; created_at: string;
  }[]).map((r) => ({
    id: r.id, credencialId: r.credencial_id, atorNome: r.ator_nome, acao: r.acao,
    servico: r.servico_snapshot, colaboradorNome: r.colaborador_nome, criadoEm: r.created_at,
  }));
}

// ── Auditoria ────────────────────────────────────────────────────────────────
// Registrar NUNCA derruba a ação principal: um log que falha não pode impedir
// alguém de trabalhar. Mas registrar acontece ANTES de responder a senha, pra
// não existir revelação que escapou porque a resposta saiu primeiro.
export async function registrar(ev: {
  credencialId: string | null; atorId: string; atorNome: string;
  acao: "revelar" | "copiar" | "criar" | "editar" | "apagar";
  servico?: string | null; colaboradorNome?: string | null;
}): Promise<void> {
  try {
    const sb = createSupabaseAdminClient();
    await sb.from("acessos_log").insert({
      credencial_id: ev.credencialId, ator_id: ev.atorId, ator_nome: ev.atorNome,
      acao: ev.acao, servico_snapshot: ev.servico ?? null,
      colaborador_nome: ev.colaboradorNome ?? null,
    });
  } catch { /* auditoria indisponível não trava a operação */ }
}

// ── Escrita ──────────────────────────────────────────────────────────────────
export async function criarCredencial(v: {
  colaboradorId: string; tipo?: string; servico: string; categoria: string;
  url?: string | null; login?: string | null; senha: string; notas?: string | null;
  criadoPor: string;
}): Promise<Credencial> {
  const sb = createSupabaseAdminClient();
  const linha = {
    colaborador_id: v.colaboradorId, tipo: tipoValido(v.tipo), servico: v.servico.trim(),
    categoria: v.categoria, url: v.url?.trim() || null, login: v.login?.trim() || null,
    senha_enc: cifrar(v.senha), notas: v.notas?.trim() || null, criado_por: v.criadoPor,
  };
  const inserir = (l: Record<string, unknown>, cols: string) =>
    sb.from("acessos_credenciais").insert(l).select(cols).single();
  let { data, error } = await inserir(linha, COLS);
  if (error && colunaAusente(error.message)) {
    const { tipo: _tipo, ...semTipo } = linha; void _tipo;
    ({ data, error } = await inserir(semTipo, COLS_LEGADO));
  }
  if (error) lancar(error.message);
  return daRow(data as unknown as Row);
}

export async function atualizarCredencial(id: string, v: {
  tipo?: string; servico?: string; categoria?: string; url?: string | null;
  login?: string | null; senha?: string; notas?: string | null;
}): Promise<Credencial> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (v.tipo !== undefined) patch.tipo = tipoValido(v.tipo);
  if (v.servico !== undefined) patch.servico = v.servico.trim();
  if (v.categoria !== undefined) patch.categoria = v.categoria;
  if (v.url !== undefined) patch.url = v.url?.trim() || null;
  if (v.login !== undefined) patch.login = v.login?.trim() || null;
  if (v.notas !== undefined) patch.notas = v.notas?.trim() || null;
  // Senha em branco = "não mexi nela". Sem isto, abrir o formulário de edição
  // pra corrigir uma URL apagaria a senha de quem não digitou nada no campo.
  if (v.senha) patch.senha_enc = cifrar(v.senha);

  const sb = createSupabaseAdminClient();
  const atualizar = (p: Record<string, unknown>, cols: string) =>
    sb.from("acessos_credenciais").update(p).eq("id", id).select(cols).single();
  let { data, error } = await atualizar(patch, COLS);
  if (error && colunaAusente(error.message)) {
    const { tipo: _tipo, ...semTipo } = patch; void _tipo;
    ({ data, error } = await atualizar(semTipo, COLS_LEGADO));
  }
  if (error) lancar(error.message);
  return daRow(data as unknown as Row);
}

export async function apagarCredencial(id: string): Promise<void> {
  const sb = createSupabaseAdminClient();
  const { error } = await sb.from("acessos_credenciais").delete().eq("id", id);
  if (error) lancar(error.message);
}

/** A ÚNICA porta por onde a senha volta em claro. Devolve também o serviço, pra
 *  quem chamou conseguir carimbar a auditoria sem uma segunda ida ao banco. */
export async function revelarSenha(id: string): Promise<{ senha: string; servico: string; colaboradorId: string }> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.from("acessos_credenciais")
    .select("senha_enc,servico,colaborador_id").eq("id", id).single();
  if (error) lancar(error.message);
  const r = data as { senha_enc: string; servico: string; colaborador_id: string };
  return { senha: decifrar(r.senha_enc), servico: r.servico, colaboradorId: r.colaborador_id };
}
