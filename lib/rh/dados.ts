// ── Leitura do RH (servidor) ─────────────────────────────────────────────────
// Todas as consultas do módulo moram aqui. Colunas SEMPRE nomeadas e `.limit()`
// em toda listagem — `select("*")` é proibido em rota de leitura (CLAUDE.md) e
// arrastaria jsonb e texto longo que a tela não usa.
//
// Tudo é TOLERANTE ao `supabase/rh.sql` ainda não ter sido rodado: a tela abre
// com a lista de pessoas (que vem de `profiles`/`employees`, tabelas que já
// existem) e avisa que o banco está atrás, em vez de quebrar inteira. É o mesmo
// degrau do `tolerante()` do Financeiro, e existe porque SQL neste projeto roda
// à mão — sempre há uma janela entre o deploy e a execução do arquivo.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ehColaborador } from "./nao-colaboradores";
import {
  ehSituacao,
  type AnamneseRh, type AtestadoRh, type ColaboradorRh, type DocumentoRh,
  type FeriasRh, type FichaRh, type HistoricoRh, type RhSituacao,
} from "./tipos";

/** Teto de uma listagem da ficha. Ninguém tem 500 atestados; se tiver, a tela satura. */
const TETO_FICHA = 200;
/** Teto da equipe. A empresa tem dezenas de pessoas — o número é folga, não expectativa. */
const TETO_EQUIPE = 500;

export interface ComPendencia<T> {
  dados: T;
  /** `true` = a tabela `rh_*` ainda não existe (o SQL não rodou). */
  pendente: boolean;
}

/** Erro de "tabela não existe" do PostgREST, e só ele. Outro erro é erro mesmo. */
function tabelaAusente(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  return erro.code === "42P01" || /does not exist|schema cache/i.test(erro.message ?? "");
}

// ── A equipe ─────────────────────────────────────────────────────────────────

type LinhaEmployee = {
  photo_url: string | null; cargo: string | null; setor: string | null;
  departamento: string | null; telefone: string | null; data_admissao: string | null;
};
type LinhaProfile = {
  id: string; username: string; name: string; active: boolean; password_set: boolean;
  employees: LinhaEmployee | LinhaEmployee[] | null;
};

const umEmployee = (e: LinhaProfile["employees"]): LinhaEmployee | null =>
  Array.isArray(e) ? (e[0] ?? null) : e;

/**
 * Quem é a equipe, com a situação de RH de cada um.
 *
 * Duas consultas em PARALELO, e não um embed: `rh_fichas` é tabela do módulo e
 * `profiles` não a conhece — juntar no PostgREST exigiria uma FK declarada que
 * este projeto de propósito não declara (ver o cabeçalho do supabase/rh.sql).
 * Duas idas paralelas custam uma; em fila custariam duas.
 *
 * Sem ficha gravada a pessoa entra como 'ativo' ou 'desligado' conforme o
 * login. Não é chute: é exatamente o que o passo 8 do SQL grava, então a tela
 * mostra a mesma coisa antes e depois de o arquivo rodar.
 */
export async function listarColaboradores(): Promise<ComPendencia<ColaboradorRh[]>> {
  const db = createSupabaseAdminClient();

  const [pessoas, fichas] = await Promise.all([
    db.from("profiles")
      .select("id,username,name,active,password_set,employees(photo_url,cargo,setor,departamento,telefone,data_admissao)")
      .order("name", { ascending: true })
      .limit(TETO_EQUIPE),
    db.from("rh_fichas").select("employee_id,situacao").limit(TETO_EQUIPE),
  ]);

  const pendente = tabelaAusente(fichas.error);
  const situacaoDe = new Map<string, RhSituacao>();
  for (const f of (fichas.data ?? []) as { employee_id: string; situacao: string }[]) {
    if (ehSituacao(f.situacao)) situacaoDe.set(f.employee_id, f.situacao);
  }

  const dados = ((pessoas.data ?? []) as LinhaProfile[])
    // Nem todo login é de funcionário — ver `lib/rh/nao-colaboradores.ts`. O
    // filtro é aqui, na ÚNICA leitura da equipe, e não em cada tela: espalhado,
    // a lista esconderia a pessoa e os números do topo continuariam contando.
    .filter((p) => ehColaborador(p.username))
    .map((p): ColaboradorRh => {
    const e = umEmployee(p.employees);
    return {
      id: p.id,
      nome: p.name,
      username: p.username,
      ativo: p.active,
      pendente: !p.password_set,
      foto: e?.photo_url ?? null,
      cargo: e?.cargo ?? null,
      setor: e?.setor ?? null,
      departamento: e?.departamento ?? null,
      telefone: e?.telefone ?? null,
      admissao: e?.data_admissao ?? null,
      situacao: situacaoDe.get(p.id) ?? (p.active ? "ativo" : "desligado"),
    };
  });

  return { dados, pendente };
}

/** Uma pessoa só — a mesma forma da lista, para a ficha não inventar outra. */
export async function colaboradorPorId(id: string): Promise<ColaboradorRh | null> {
  const { dados } = await listarColaboradores();
  return dados.find((c) => c.id === id) ?? null;
}

// ── A ficha ──────────────────────────────────────────────────────────────────

const COLS_FICHA =
  "employee_id,situacao,data_nascimento,cpf,rg,estado_civil,email_pessoal," +
  "contato_emergencia,telefone_emergencia,cep,logradouro,numero,complemento," +
  "bairro,cidade,uf,observacoes";

export async function fichaDe(employeeId: string): Promise<ComPendencia<FichaRh | null>> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_fichas").select(COLS_FICHA).eq("employee_id", employeeId).maybeSingle();
  if (error) return { dados: null, pendente: tabelaAusente(error) };
  return { dados: (data as FichaRh | null) ?? null, pendente: false };
}

export async function documentosDe(employeeId: string): Promise<ComPendencia<DocumentoRh[]>> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_documentos")
    .select("id,employee_id,tipo,titulo,arquivo,emitido_em,validade,observacao,created_at,autor_nome")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(TETO_FICHA);
  if (error) return { dados: [], pendente: tabelaAusente(error) };
  return { dados: (data ?? []) as DocumentoRh[], pendente: false };
}

export async function atestadosDe(employeeId: string): Promise<ComPendencia<AtestadoRh[]>> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_atestados")
    .select("id,employee_id,de,ate,dias,emitido_em,cid,profissional,status,arquivo,observacao,created_at,autor_nome")
    .eq("employee_id", employeeId)
    .order("de", { ascending: false })
    .limit(TETO_FICHA);
  if (error) return { dados: [], pendente: tabelaAusente(error) };
  return { dados: (data ?? []) as AtestadoRh[], pendente: false };
}

export async function feriasDe(employeeId: string): Promise<ComPendencia<FeriasRh[]>> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_ferias")
    .select("id,employee_id,aquisitivo_de,aquisitivo_ate,de,ate,dias,status,observacao,created_at,autor_nome")
    .eq("employee_id", employeeId)
    .order("de", { ascending: false })
    .limit(TETO_FICHA);
  if (error) return { dados: [], pendente: tabelaAusente(error) };
  return { dados: (data ?? []) as FeriasRh[], pendente: false };
}

export async function historicoDe(employeeId: string): Promise<ComPendencia<HistoricoRh[]>> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_historico")
    .select("id,employee_id,tipo,titulo,detalhe,autor_nome,created_at")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(TETO_FICHA);
  if (error) return { dados: [], pendente: tabelaAusente(error) };
  return { dados: (data ?? []) as HistoricoRh[], pendente: false };
}

/**
 * A ficha anamnésica.
 *
 * Função SEPARADA das outras de propósito, e nunca chamada junto: quem a chama
 * tem de ter conferido `rh:anamnese` antes. Se ela viajasse dentro do mesmo
 * `Promise.all` da ficha, o dado de saúde chegaria ao servidor da página para
 * todo mundo e a permissão viraria decoração da interface.
 */
export async function anamneseDe(employeeId: string): Promise<ComPendencia<AnamneseRh | null>> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_anamnese")
    .select("employee_id,dados,atualizado_em,atualizado_por_nome")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (error) return { dados: null, pendente: tabelaAusente(error) };
  return { dados: (data as AnamneseRh | null) ?? null, pendente: false };
}

// ── Escrita do histórico ─────────────────────────────────────────────────────

/**
 * Carimba um evento na linha do tempo.
 *
 * Tolerante de propósito: o histórico é registro, não a operação. Se a tabela
 * não existe ainda (SQL pendente), salvar o cadastro tem de continuar
 * funcionando — falhar aqui transformaria "não consegui anotar" em "não
 * consegui salvar".
 */
export async function anotarNoHistorico(evento: {
  employee_id: string;
  tipo: HistoricoRh["tipo"];
  titulo: string;
  detalhe?: string | null;
  dados?: Record<string, unknown>;
  autor_id?: string | null;
  autor_nome?: string | null;
}): Promise<void> {
  try {
    await createSupabaseAdminClient().from("rh_historico").insert({
      employee_id: evento.employee_id,
      tipo: evento.tipo,
      titulo: evento.titulo,
      detalhe: evento.detalhe ?? null,
      dados: evento.dados ?? {},
      autor_id: evento.autor_id ?? null,
      autor_nome: evento.autor_nome ?? null,
    });
  } catch { /* histórico é registro, não a operação */ }
}

// ── A linha crua da pessoa (profiles + employees) ────────────────────────────
//
// É o que as peças herdadas da tela de Pessoas pedem: `PermissoesTab`,
// `JornadaTab`, `DesempenhoTab` e `EditarCadastro` recebem um `ColabRow`.
// Elas são montadas DENTRO da ficha do RH em vez de copiadas — duas cópias da
// grade de permissões divergiriam no que ninguém revisa.
//
// O mesmo degrau de schema legado da tela de Pessoas: quando uma coluna nova
// ainda não existe no banco, cai no select menor em vez de devolver nada.
const COLS_EMP_CHEIO =
  "photo_url,cargo,departamento,perfil,perfis,especialidade,escala,nivel,setor," +
  "tablet,mesa,mesas,permissoes,telefone,data_admissao,observacoes,erp_user_id,pagina_inicial,codigo_acesso";
const COLS_EMP_LEGADO =
  "photo_url,cargo,departamento,perfil,perfis,nivel,setor," +
  "tablet,mesa,permissoes,telefone,data_admissao,observacoes,erp_user_id";

const SCHEMA_LEGADO = { ate: 0 };

export async function linhaDoColaborador(id: string): Promise<Record<string, unknown> | null> {
  const db = createSupabaseAdminClient();
  const sel = (cols: string) => db.from("profiles")
    .select(`id,username,name,email,role,active,password_set,created_at,employees(${cols})`)
    .eq("id", id).maybeSingle();

  if (SCHEMA_LEGADO.ate > Date.now()) return (await sel(COLS_EMP_LEGADO)).data ?? null;
  const cheio = await sel(COLS_EMP_CHEIO);
  if (!cheio.error) return cheio.data ?? null;
  SCHEMA_LEGADO.ate = Date.now() + 60_000;
  return (await sel(COLS_EMP_LEGADO)).data ?? null;
}

/** As empresas do Financeiro a que esta pessoa está restrita. Vazio = todas. */
export async function empresasDoFinanceiroDe(id: string): Promise<string[]> {
  try {
    const { data } = await createSupabaseAdminClient()
      .from("fin_acessos").select("empresa_id").eq("user_id", id).limit(50);
    return (data ?? []).map((a: { empresa_id: string }) => a.empresa_id);
  } catch {
    return [];   // tabela do Financeiro ausente: sem restrição
  }
}
