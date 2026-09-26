import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { presencaAgora } from "@/lib/ponto";

/**
 * Atividades na PAREDE — o que cada TV de setor mostra.
 *
 * Três perguntas, três listas:
 *   chamadas — o que caiu e AINDA NÃO FOI ACEITO. Fica gritando na TV até
 *              alguém aceitar (tablet na produção, site na logística).
 *   proximas — a fila do pool: o que vem depois, na ordem em que vai sair.
 *   equipe   — as pessoas do setor, com FOTO, presença (ponto) e o que cada
 *              uma está fazendo agora.
 *
 * A rota que serve isto é PÚBLICA (a TV não tem login), então o payload segue
 * a regra de `/api/logistica/painel`: nome e foto de COLABORADOR podem sair
 * (mesmo precedente do ranking de vendedores); texto livre NÃO — `detalhe` e
 * `instrucoes` podem carregar nome de cliente e ficam fora. Sai o nome da
 * tarefa (catálogo), categoria e números.
 *
 * "Aceitar" aqui é o mesmo carimbo do resto do sistema: `iniciada_at`.
 *   • dirigida pendente  → caiu pra alguém e a pessoa ainda não pegou;
 *   • oferecida          → em_andamento SEM iniciada_at: o tablet está tocando
 *     com o nome da pessoa na tela (device/claim) e ela ainda não tocou Aceitar;
 *   • pool pendente      → sem dono. Na PRODUÇÃO vira fila (o tablet chama a
 *     próxima sozinho); na LOGÍSTICA vira chamada também, porque ninguém é
 *     avisado por tablet — a TV é o toque no ombro, e o aceite é no site.
 */

export type SetorPainel = "producao" | "logistica";

/** Linha crua de `atividades` — só o que a parede precisa. */
export interface LinhaChamada {
  id: string;
  tarefa: string;
  categoria: string | null;
  setor: string | null;
  para_id: string | null;
  para_nome: string | null;
  por_nome: string | null;
  status: string | null;
  pool: boolean | null;
  urgente: boolean | null;
  mesa_alvo: string | null;
  quantidade_alvo: number | null;
  tempo_estimado_min: number | null;
  ordem: number | null;
  iniciada_at: string | null;
  claimed_at: string | null;
  created_at: string;
  concluida_at: string | null;
  quantidade_feita: number | null;
  devolvida_em?: string | null;
}

export const COLS_CHAMADA =
  "id,tarefa,categoria,setor,para_id,para_nome,por_nome,status,pool,urgente," +
  "mesa_alvo,quantidade_alvo,tempo_estimado_min,ordem,iniciada_at,claimed_at," +
  "created_at,concluida_at,quantidade_feita";

const norm = (s: string | null | undefined) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export const ehLogistica = (texto: string | null | undefined) => norm(texto).includes("logist");

/**
 * De qual TV é esta atividade?
 *
 * O setor da ordem manda quando diz "logística". Quando não diz (hoje TODA
 * ordem nasce "Produção"), decide o DEPARTAMENTO do responsável: a equipe de
 * logística está cadastrada como setor "Produção" / departamento "Logística",
 * e uma ordem dirigida a ela pertence à TV da logística, não à da produção.
 */
export function setorDaLinha(l: LinhaChamada, pessoasLogistica: ReadonlySet<string>): SetorPainel {
  if (ehLogistica(l.setor)) return "logistica";
  if (l.para_id && pessoasLogistica.has(l.para_id)) return "logistica";
  return "producao";
}

/** Uma atividade esperando aceite, pronta pra parede. */
export interface Chamada {
  id: string;
  tarefa: string;
  categoria: string | null;
  urgente: boolean;
  /** Tem dono designado (o contrário de "caiu na fila do setor"). */
  dirigida: boolean;
  paraNome: string | null;
  fotoUrl: string | null;
  porNome: string | null;
  mesaAlvo: string | null;
  /** true = tablet está TOCANDO com o nome da pessoa (claim sem accept). */
  oferecida: boolean;
  quantidadeAlvo: number;
  /** Desde quando espera (criação, ou claim quando oferecida). */
  desde: string;
}

export interface ProximaFila {
  id: string;
  tarefa: string;
  categoria: string | null;
  urgente: boolean;
  quantidadeAlvo: number;
  tempoEstimadoMin: number | null;
  criadaEm: string;
}

export interface PessoaEquipe {
  id: string;
  nome: string;
  fotoUrl: string | null;
  /** Batida de entrada aberta agora (ponto). `null` = sem vínculo com o ponto. */
  presente: boolean | null;
  emAtividade: { tarefa: string; desde: string } | null;
  concluidasHoje: number;
  pecasHoje: number;
  aguardando: number;
}

export interface PainelAtividades {
  atualizadoEm: string;
  setor: SetorPainel;
  chamadas: Chamada[];
  proximas: ProximaFila[];
  equipe: PessoaEquipe[];
}

const aguardaAceite = (l: LinhaChamada) =>
  (l.status === "pendente" && !!l.para_id) ||
  (l.status === "em_andamento" && !l.iniciada_at);

const pendentePool = (l: LinhaChamada) =>
  l.status === "pendente" && !l.para_id && l.pool === true;

/** Ordena a fila igual ao tablet: urgente → fase → mais antiga (devolvida vai pro fim). */
const ordemDaFila = (a: LinhaChamada, b: LinhaChamada) => {
  if (!!a.urgente !== !!b.urgente) return a.urgente ? -1 : 1;
  const oa = a.ordem == null ? Infinity : Number(a.ordem);
  const ob = b.ordem == null ? Infinity : Number(b.ordem);
  if (oa !== ob) return oa - ob;
  const ka = String(a.devolvida_em || a.created_at);
  const kb = String(b.devolvida_em || b.created_at);
  return ka.localeCompare(kb);
};

/**
 * As chamadas de aceite do setor. `poolChama` = pool pendente também vira
 * chamada (logística); na produção o pool é fila, não grito.
 */
export function montarChamadas(
  linhas: LinhaChamada[],
  setor: SetorPainel,
  pessoasLogistica: ReadonlySet<string>,
  fotos: ReadonlyMap<string, string | null> = new Map(),
): Chamada[] {
  const poolChama = setor === "logistica";
  return linhas
    .filter((l) => setorDaLinha(l, pessoasLogistica) === setor)
    .filter((l) => aguardaAceite(l) || (poolChama && pendentePool(l)))
    .sort((a, b) => {
      if (!!a.urgente !== !!b.urgente) return a.urgente ? -1 : 1;
      return String(a.created_at).localeCompare(String(b.created_at));
    })
    .slice(0, 6)
    .map((l) => ({
      id: l.id,
      tarefa: l.tarefa,
      categoria: l.categoria,
      urgente: !!l.urgente,
      dirigida: !!l.para_id,
      paraNome: l.para_id ? l.para_nome || null : null,
      fotoUrl: (l.para_id && fotos.get(l.para_id)) || null,
      porNome: l.por_nome || null,
      mesaAlvo: l.mesa_alvo || null,
      oferecida: l.status === "em_andamento" && !l.iniciada_at,
      quantidadeAlvo: Number(l.quantidade_alvo) || 1,
      desde: (l.status === "em_andamento" ? l.claimed_at : null) || l.created_at,
    }));
}

/** A fila do pool do setor, na ordem em que o tablet vai chamar. */
export function montarProximas(
  linhas: LinhaChamada[],
  setor: SetorPainel,
  pessoasLogistica: ReadonlySet<string>,
): ProximaFila[] {
  return linhas
    .filter((l) => setorDaLinha(l, pessoasLogistica) === setor)
    .filter(pendentePool)
    .sort(ordemDaFila)
    .slice(0, 8)
    .map((l) => ({
      id: l.id,
      tarefa: l.tarefa,
      categoria: l.categoria,
      urgente: !!l.urgente,
      quantidadeAlvo: Number(l.quantidade_alvo) || 1,
      tempoEstimadoMin: l.tempo_estimado_min == null ? null : Number(l.tempo_estimado_min),
      criadaEm: l.created_at,
    }));
}

/** Dia (`YYYY-MM-DD`) de um instante, no fuso de São Paulo. */
const diaSP = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const hojeSP = (agora: Date) => new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);

interface PessoaCadastro {
  id: string;
  nome: string;
  fotoUrl: string | null;
  setorPainel: SetorPainel | null;
}

/** De qual TV é esta PESSOA (pelo cadastro)? Vendas/administrativo: nenhuma. */
export function setorDaPessoa(setor: string | null, departamento: string | null): SetorPainel | null {
  if (ehLogistica(setor) || ehLogistica(departamento)) return "logistica";
  const s = norm(setor), d = norm(departamento);
  if (s.includes("produ") || d.includes("produ") || d.includes("design") || d.includes("maquin")) return "producao";
  return null;
}

/**
 * A equipe do setor com o dia de cada um. `presente: null` = pessoa sem
 * vínculo com o ponto ("não sei" é diferente de "faltou").
 */
export function montarEquipe(
  pessoas: PessoaCadastro[],
  setor: SetorPainel,
  linhas: LinhaChamada[],
  presencas: { registrados: ReadonlySet<string>; presentes: ReadonlySet<string> },
  agora: Date,
): PessoaEquipe[] {
  const hoje = hojeSP(agora);
  const doSetor = pessoas.filter((p) => p.setorPainel === setor);
  const porPessoa = new Map(doSetor.map((p) => [p.id, {
    concluidasHoje: 0, pecasHoje: 0, aguardando: 0,
    emAtividade: null as { tarefa: string; desde: string } | null,
  }]));
  for (const l of linhas) {
    const alvo = l.para_id ? porPessoa.get(l.para_id) : undefined;
    if (!alvo) continue;
    if (l.status === "concluida") {
      if (l.concluida_at && diaSP(l.concluida_at) === hoje) {
        alvo.concluidasHoje++;
        alvo.pecasHoje += Number(l.quantidade_feita) || 0;
      }
    } else if (l.status === "em_andamento" && l.iniciada_at) {
      // A mais recente vence: é a que a pessoa está fazendo AGORA.
      if (!alvo.emAtividade || l.iniciada_at > alvo.emAtividade.desde) {
        alvo.emAtividade = { tarefa: l.tarefa, desde: l.iniciada_at };
      }
    } else {
      alvo.aguardando++;
    }
  }
  return doSetor
    .map((p) => {
      const s = porPessoa.get(p.id)!;
      return {
        id: p.id, nome: p.nome, fotoUrl: p.fotoUrl,
        presente: presencas.registrados.has(p.id) ? presencas.presentes.has(p.id) : null,
        emAtividade: s.emAtividade,
        concluidasHoje: s.concluidasHoje,
        pecasHoje: s.pecasHoje,
        aguardando: s.aguardando,
      };
    })
    // Quem está em atividade primeiro, depois presentes, depois o resto — a
    // primeira fileira da parede é a que todo mundo lê.
    .sort((a, b) => {
      const pa = a.emAtividade ? 0 : a.presente ? 1 : 2;
      const pb = b.emAtividade ? 0 : b.presente ? 1 : 2;
      return pa - pb || b.concluidasHoje - a.concluidasHoje || a.nome.localeCompare(b.nome);
    });
}

interface PerfilRow {
  id: string;
  name: string | null;
  username: string | null;
  employees: { setor: string | null; departamento: string | null; photo_url: string | null }[]
    | { setor: string | null; departamento: string | null; photo_url: string | null } | null;
}

/**
 * Monta o painel de atividades de um setor. Uma leitura de `atividades`
 * (janela: aberto + concluído hoje), uma de `profiles`+`employees` e o ponto —
 * todas com colunas nomeadas e teto. É a consulta que a TV puxa o dia inteiro;
 * quem segura o ritmo é o `cached()` da rota.
 */
export async function painelAtividadesDoSetor(
  setor: SetorPainel,
  agora = new Date(),
): Promise<PainelAtividades | null> {
  try {
    const db = createSupabaseAdminClient();
    const inicioDia = `${hojeSP(agora)}T00:00:00-03:00`;
    const [{ data: atv }, { data: perfis }] = await Promise.all([
      db.from("atividades").select(COLS_CHAMADA)
        .or(`status.neq.concluida,concluida_at.gte.${inicioDia}`)
        .limit(400),
      db.from("profiles")
        .select("id,name,username,employees(setor,departamento,photo_url)")
        .eq("active", true)
        .limit(300),
    ]);
    if (!atv) return null;
    // Os status da CADEIA não vão pra parede: "aguardando_material" ainda não
    // é trabalho de ninguém e "cancelada" foi dispensada.
    const atvVivas = (atv as { status?: string | null }[])
      .filter((a) => a.status !== "aguardando_material" && a.status !== "cancelada");

    const pessoas: PessoaCadastro[] = ((perfis ?? []) as PerfilRow[]).map((r) => {
      const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees;
      return {
        id: r.id,
        nome: r.name || r.username || "—",
        fotoUrl: emp?.photo_url ?? null,
        setorPainel: setorDaPessoa(emp?.setor ?? null, emp?.departamento ?? null),
      };
    });
    const pessoasLogistica = new Set(pessoas.filter((p) => p.setorPainel === "logistica").map((p) => p.id));
    const fotos = new Map(pessoas.map((p) => [p.id, p.fotoUrl]));

    const linhas = atvVivas as LinhaChamada[];
    const doSetorIds = pessoas.filter((p) => p.setorPainel === setor).map((p) => p.id);
    const presencas = await presencaAgora(doSetorIds).catch(
      () => ({ registrados: new Set<string>(), presentes: new Set<string>() }),
    );

    return {
      atualizadoEm: agora.toISOString(),
      setor,
      chamadas: montarChamadas(linhas, setor, pessoasLogistica, fotos),
      proximas: montarProximas(linhas, setor, pessoasLogistica),
      equipe: montarEquipe(pessoas, setor, linhas, presencas, agora),
    };
  } catch {
    return null;
  }
}
