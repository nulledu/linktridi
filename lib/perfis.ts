// Resolução do acesso do usuário atual (server) — por NÍVEL (1–5, cumulativo).
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { chavesDoNivel, nivelDoRole, nivelFallback } from "@/lib/niveis";
import { PERMISSOES_DE_ADMIN, TODAS_PERMISSOES } from "@/lib/permissions";
import { CHAVES_ATIVIDADES, CHAVES_RESTRITAS, atividadesHerdada, chavesDasAreas, ehChaveSoPorConcessao, temPermissoesConfiguradas } from "@/lib/areas";
import { ehSuperusuario } from "@/lib/superusuario";
import { departamentoDoSetor } from "@/lib/colaboradores-taxonomia";
import { cached } from "@/lib/cache";
import type { Role } from "@/lib/rbac";

export interface PerfilTemplate { departamento: string; perfil: string; modulos: string[] }

export async function listPerfilTemplates(): Promise<PerfilTemplate[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("perfil_templates").select("departamento,perfil,modulos");
    return (data ?? []).map((r: { departamento: string; perfil: string; modulos: unknown }) => ({
      departamento: r.departamento, perfil: r.perfil,
      modulos: Array.isArray(r.modulos) ? (r.modulos as string[]) : [],
    }));
  } catch { return []; }
}

export async function savePerfilTemplate(departamento: string, perfil: string, modulos: string[]): Promise<boolean> {
  try {
    const db = createSupabaseAdminClient();
    const { error } = await db.from("perfil_templates").upsert({ departamento, perfil, modulos, updated_at: new Date().toISOString() });
    return !error;
  } catch { return false; }
}

// A linha de `employees` que decide o acesso, cacheada por usuário (30s).
//
// Separada do `meuNivel` de propósito: a chave é SÓ o id, então o `getProfile`
// consegue disparar esta leitura EM PARALELO com a de `profiles` — antes elas
// saíam em fila (profiles → employees), duas idas de 250–700 ms uma esperando
// a outra em todo cache-miss de toda página protegida. O `cached` dedupa pela
// chave: o disparo antecipado e o `meuNivel` dividem a mesma promessa.
// `erp_user_id` pega carona: é a mesma linha de `employees`, e o Comercial
// pagava uma ida inteira só pra ler essa coluna depois de já ter lido o resto.
// `photo_url` idem: é o avatar da sidebar, que o layout da plataforma lia numa
// ida própria, em fila atrás de `profiles`, com cache de 5 min que ninguém
// derrubava. Aqui ele chega junto e cai com o `invalidate("emp-acesso:")` de
// quem salva a ficha.
type AcessoEmployees = { nivel?: number | null; departamento?: string | null; setor?: string | null; permissoes?: Record<string, boolean> | null; erp_user_id?: string | null; photo_url?: string | null } | null;
export function acessoBruto(id: string): Promise<AcessoEmployees> {
  return cached(`emp-acesso:${id}`, 30_000, async () => {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("employees").select("nivel,departamento,setor,permissoes,erp_user_id,photo_url").eq("id", id).maybeSingle();
    // Falha de leitura LANÇA: devolvida como `data: null`, virava "sem ficha"
    // por 30s — não-admin caía no básico do nível 1 (sidebar encolhe, 403 em
    // tudo) e o admin perdia as áreas restritas. Lançando, o `cached` descarta
    // a entrada e o `meuNivel` usa o fallback do papel só nesta requisição.
    if (error) throw error;
    return (data ?? null) as AcessoEmployees;
  });
}

// Nível efetivo do usuário (employees.nivel ou fallback pelo papel) + departamento.
// A ida ao banco mora no `acessoBruto` (cacheado); aqui é só conta local.
export async function meuNivel(profile: { id: string; role: Role }): Promise<{ nivel: number; departamento: string | null; permissoes: Record<string, boolean> | null; erpUserId: string | null }> {
  // O mapa de permissões é lido TAMBÉM para quem é admin pelo papel. Antes
  // havia um atalho que devolvia `permissoes: null` na hora para o admin — e
  // com áreas restritas isso passou a esconder informação necessária: é no
  // mapa que mora o grant explícito do TridiMarket. Sem ler, um admin com o
  // quadradinho ligado continuava sem acesso e ninguém entendia por quê.
  try {
    const emp = await acessoBruto(profile.id);
    // Departamento explícito; senão infere do setor (ex: setor "Vendas" → Comercial).
    const departamento = emp?.departamento ?? departamentoDoSetor(emp?.setor) ?? null;
    const permissoes = emp?.permissoes ?? null;
    // Admin (pelo papel OU pela permissão) = nível máximo.
    const nivel = profile.role === "admin" || permissoes?.admin
      ? 5
      : (emp?.nivel ?? nivelFallback(profile.role, departamento));
    return { nivel, departamento, permissoes, erpUserId: emp?.erp_user_id ?? null };
  } catch {
    return { nivel: nivelDoRole(profile.role), departamento: null, permissoes: null, erpUserId: null };
  }
}

// Chaves de acesso (módulos + setores) que ESTE usuário pode ver agora — por nível.
// ── ABERTAS A TODO MUNDO (temporário) ────────────────────────────────────────
// Áreas que qualquer pessoa logada enxerga enquanto a equipe experimenta, sem
// precisar de alguém ligando o quadradinho pessoa por pessoa. É uma decisão de
// PRODUTO com prazo, não o modelo: a regra do sistema continua sendo
// default-deny (ver `lib/areas.ts`).
//
// Para desligar: esvazie a lista (`= []`). Uma linha, e tudo volta a depender
// da grade de permissões — nenhum outro arquivo precisa mudar.
//
// O que NÃO pode entrar aqui, em nenhuma hipótese: área `restrita` ou `critica`
// (conversa de cliente, colaboradores, analytics, configurações). A lista é só
// pra ferramenta de trabalho em avaliação.
export const AREAS_ABERTAS_TEMPORARIAMENTE: string[] = [
  // Vazia: o TridiFlow saiu daqui em 21/08/2026, encerrada a avaliação da
  // equipe. Ele voltou a depender do quadradinho de cada pessoa na grade.
];
// A Central (Tarefas, Solicitações, Meu ponto) NÃO entra aqui: ela já é o
// básico do nível 1, que todo mundo tem desde o primeiro login. Pôr na lista
// não abriria nada e daria a impressão de que ela depende desta exceção.

// A virada de Atividades pra área própria: quem abria a tela antes (cargo,
// Pessoas, Produção › Controle) continua abrindo, com as três chaves, até
// alguém decidir na grade. Ver `atividadesHerdada` em lib/areas.ts.
const comAtividadesHerdadas = (keys: string[], permissoes: Record<string, boolean> | null | undefined, role: string): string[] =>
  atividadesHerdada(permissoes, role, keys) ? [...new Set([...keys, ...CHAVES_ATIVIDADES])] : keys;

const comAbertas = (keys: string[]): string[] =>
  AREAS_ABERTAS_TEMPORARIAMENTE.length
    ? [...new Set([...keys, ...AREAS_ABERTAS_TEMPORARIAMENTE])]
    : keys;

export async function resolveMyModuleKeys(profile: { id: string; role: Role; username?: string | null }): Promise<string[]> {
  // Superusuário atravessa tudo — com UMA exceção, e ela é o Financeiro.
  //
  // "Nem admin tem acesso por padrão" não era verdade enquanto o dono do
  // sistema (que é `role: "admin"`) via o cofre só por estar na lista fixa do
  // código. Agora as chaves de dinheiro saem daqui e voltam só se estiverem
  // ligadas na grade dele, como em qualquer outra pessoa — com data e autor na
  // auditoria.
  //
  // O que ele MANTÉM é `financeiro` + `financeiro:acessos`: a porta e a tela
  // que concede. Sem isso a chave do cofre viveria só dentro do cofre, e uma
  // grade salva errada trancaria todo mundo do lado de fora — o beco que já
  // custou um arquivo de SQL para destravar uma vez. Ver
  // CHAVES_SO_POR_CONCESSAO em lib/areas.ts.
  if (ehSuperusuario(profile.id, profile.username)) {
    const { permissoes: grade } = await meuNivel(profile);
    // `chavesDasAreas` (e não `grade[k]` cru) para o `implica` valer igual:
    // ligar "Dar baixa" tem de trazer "Ver o financeiro" junto, senão a tela
    // abre e toda requisição volta 403.
    const concedidas = chavesDasAreas(grade).filter(ehChaveSoPorConcessao);
    return [...TODAS_PERMISSOES.filter((k) => !ehChaveSoPorConcessao(k)), ...concedidas];
  }
  const { departamento, permissoes } = await meuNivel(profile);
  // Áreas restritas nunca vêm de concessão em bloco: entram só quando alguém
  // ligou o quadradinho NESTA pessoa. Vale para o admin pelo papel e para o
  // "acesso total" — os dois caminhos abaixo somam só o que foi concedido.
  const restritas = CHAVES_RESTRITAS.filter((k) => permissoes?.[k]);
  if (profile.role === "admin") return [...PERMISSOES_DE_ADMIN, ...restritas];   // fallback legado (papel)
  // "admin" também é uma PERMISSÃO (card "Administrador — acesso total"). Se
  // ligada, concede tudo que não é restrito — sem depender do papel.
  if (permissoes?.admin) return [...PERMISSOES_DE_ADMIN, ...restritas];
  // NOVO MODELO: se o admin já configurou as áreas deste colaborador (grade de
  // permissões), elas mandam — básico + áreas liberadas. Simples, sem nível.
  if (temPermissoesConfiguradas(permissoes)) return comAbertas(comAtividadesHerdadas(chavesDasAreas(permissoes), permissoes, profile.role));
  // SEM GRADE = SÓ O BÁSICO. A transição do modelo antigo acabou em 31/08/2026.
  //
  // Enquanto ela existiu, quem nunca tinha sido configurado herdava acesso do
  // CARGO e do DEPARTAMENTO: `gerente_*`/`estoquista` caíam no nível 3
  // (Produção, Design, Logística, Estoque), departamento Financeiro no 4
  // (Analytics completo), Comercial/Marketing no 2, e "Tráfego" ganhava
  // Analytics + Tráfego + TridiFlow direto. Ninguém tinha concedido nada — o
  // acesso vinha de um campo de cadastro, e por isso aparecia gente dentro de
  // área que o dono do sistema jurava não ter aberto.
  //
  // Agora vale a regra do resto do sistema: default-deny. Área só entra quando
  // alguém liga o quadradinho da pessoa na grade (Pessoas › ficha › Acesso).
  // O básico do nível 1 continua para todo mundo, senão o primeiro login abre
  // num app sem nenhuma porta.
  return comAbertas(comAtividadesHerdadas(chavesDoNivel(1, departamento), permissoes, profile.role));
}
