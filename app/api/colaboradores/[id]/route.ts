import { NextRequest, NextResponse } from "next/server";
import { esquecerEmpresas } from "@/lib/financeiro/db";
import { z } from "zod";
import { getAdminProfile, getProfileForModule } from "@/lib/require-auth";
import { invalidate } from "@/lib/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ROLES } from "@/lib/rbac";
import { setorDoDepartamento } from "@/lib/colaboradores-taxonomia";
import { AREA_KEYS } from "@/lib/areas";
import { ehPaginaInicialValida } from "@/lib/pagina-inicial";
import { normalizarCodigoAcesso } from "@/lib/estoque-codigo-acesso";
import { gerarTokenPrimeiroAcesso, montarLink } from "@/lib/primeiro-acesso-token";

export const dynamic = "force-dynamic";

const SETORES = ["Vendas", "Produção", "Estoque", "Administrativo"] as const;

// Editar colaborador (inclusive a grade de permissões) é ação de admin — e o
// superusuário passa junto, que é justamente quem precisa conseguir arrumar a
// grade quando ela for salva errada. Ver lib/superusuario.ts.
async function ensureAdmin() {
  return getAdminProfile();
}

const EMAIL_DOMAIN = "tridi.local";

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  username: z.string().trim().min(1).regex(/^[a-z0-9._-]+$/i, "username inválido").optional(),
  role: z.enum(ROLES as [string, ...string[]]).optional(),
  active: z.boolean().optional(),
  resetPassword: z.boolean().optional(),
  email: z.string().trim().email().nullable().optional().or(z.literal("")),   // e-mail de login (vincular/limpar)
  // Campos de RH (employees).
  cargo: z.string().trim().nullable().optional(),
  departamento: z.string().trim().nullable().optional(),
  perfil: z.string().trim().nullable().optional(),
  perfis: z.array(z.string()).nullable().optional(),
  especialidade: z.string().trim().nullable().optional(),
  escala: z.string().trim().nullable().optional(),
  nivel: z.number().int().min(1).max(5).nullable().optional(),
  setor: z.enum(SETORES).nullable().optional(),
  telefone: z.string().trim().nullable().optional(),
  data_admissao: z.string().trim().nullable().optional(),
  observacoes: z.string().trim().nullable().optional(),
  photo_url: z.string().trim().nullable().optional(),
  erp_user_id: z.string().trim().nullable().optional(),
  permissoes: z.record(z.string(), z.boolean()).nullable().optional(),  // override de acesso por módulo
  pagina_inicial: z.string().trim().nullable().optional(),  // chave do módulo onde a pessoa cai ao logar
  tablet: z.boolean().optional(),  // aparece no tablet de produção
  mesa: z.string().trim().nullable().optional(),  // legado: uma mesa só
  mesas: z.array(z.string().trim()).nullable().optional(),  // multi-tablet: em quais tablets aparece
  // Código de login OFFLINE no leitor de estoque do galpão (ver
  // lib/estoque-codigo-acesso.ts). String vazia limpa o código — a validação
  // de formato (4 a 8 dígitos) roda depois do parse, não aqui, pra devolver
  // o erro certo ("codigo_invalido") em vez do 422 genérico do zod.
  codigo_acesso: z.string().nullable().optional(),
  // Restrição por empresa do Financeiro (fin_acessos). `null`/ausente = não
  // mexe; `[]` = sem restrição (vê todas as empresas ativas); lista de ids =
  // só aquelas. Mora fora de `permissoes` porque não é uma chave concedível —
  // é uma tabela própria, com a MESMA trava de quem administra a área.
  financeiro_empresas: z.array(z.string()).nullable().optional(),
});

const RH_KEYS = ["cargo", "departamento", "perfil", "perfis", "especialidade", "escala", "nivel", "setor", "telefone", "data_admissao", "observacoes", "photo_url", "erp_user_id", "permissoes", "tablet", "mesa", "mesas", "pagina_inicial"] as const;

// Campos que distribuem PODER ou mexem em login. Só admin encosta neles, mesmo
// que a pessoa tenha a área "Colaboradores": quem recebe a área gerencia a
// equipe (cargo, escala, telefone, foto), não decide quem manda no sistema.
// `codigo_acesso` entra aqui pelo mesmo motivo: é a credencial que abre o
// leitor de estoque do galpão e permite baixar estoque em nome de outra
// pessoa — distribuir isso é poder, não RH.
const CAMPOS_DE_PODER = ["role", "active", "resetPassword", "permissoes", "username", "email", "nivel", "codigo_acesso"] as const;

// PUT /api/colaboradores/[id] — edita profile (nome/papel/ativo), dados de RH e/ou reseta senha.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }
  const body = parsed.data;

  // Edição de RH: portão da ÁREA (igual ao da página). Campo de poder: admin.
  // Antes tudo exigia admin — a pessoa com a área aberta na grade não conseguia
  // corrigir nem um telefone, e a tela devolvia "Operação não permitida".
  const mexeEmPoder = CAMPOS_DE_PODER.some((k) => body[k] !== undefined);
  const me = mexeEmPoder ? await ensureAdmin() : await getProfileForModule("colaboradores");
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Sai na resposta quando um link de 1º acesso é gerado. É a ÚNICA vez que o
  // link existe em claro — o banco guarda só o hash.
  let linkPrimeiroAcesso: { link: string; expiraEm: string } | null = null;

  // Anti-auto-trancamento.
  if (id === me.id && (body.active === false || (body.role && body.role !== "admin"))) {
    return NextResponse.json({ error: "cannot_modify_self" }, { status: 400 });
  }

  // Formato do código do leitor: valida ANTES de escrever qualquer coisa —
  // um admin trocando vários campos de uma vez não pode ficar com usuário/
  // e-mail já salvos e só o código rejeitado no meio do caminho.
  let codigoAcessoNormalizado: { valor: string | null } | undefined;
  if (body.codigo_acesso !== undefined) {
    const norm = normalizarCodigoAcesso(body.codigo_acesso);
    if (!norm) return NextResponse.json({ error: "codigo_invalido" }, { status: 400 });
    codigoAcessoNormalizado = norm;
  }

  const db = createSupabaseAdminClient();

  // Trocar o USERNAME (nome que loga). Cuidado: quem não tem e-mail real loga com
  // o e-mail sintético `username@tridi.local` — ao mudar o username, o e-mail de
  // auth TEM que mudar junto, senão a pessoa não loga mais.
  if (body.username !== undefined) {
    const novoUser = body.username.toLowerCase();
    const { data: cur } = await db.from("profiles").select("username,email").eq("id", id).maybeSingle();
    const atual = cur as { username: string; email: string | null } | null;
    if (atual && novoUser !== atual.username) {
      const { data: dup } = await db.from("profiles").select("id").eq("username", novoUser).neq("id", id).maybeSingle();
      if (dup) return NextResponse.json({ error: "username_taken" }, { status: 409 });
      const { error: upErr } = await db.from("profiles").update({ username: novoUser }).eq("id", id);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
      // E-mail sintético (sem e-mail real) → sincroniza no Supabase Auth.
      if (!atual.email) {
        await db.auth.admin.updateUserById(id, { email: `${novoUser}@${EMAIL_DOMAIN}` }).catch(() => {});
      }
      invalidate(`emp-acesso:${id}`);
    }
  }

  // Vincular/editar/limpar o E-MAIL de login. Grava em profiles.email E no
  // Supabase Auth (email_confirm:true = não dispara e-mail de confirmação). O
  // login (login/route.ts) assina com o e-mail de auth real, então username E
  // e-mail passam a funcionar. Vazio → volta pro sintético username@tridi.local.
  if (body.email !== undefined) {
    const novoEmail = (body.email || "").trim().toLowerCase();
    if (novoEmail) {
      const { data: dupE } = await db.from("profiles").select("id").ilike("email", novoEmail).neq("id", id).maybeSingle();
      if (dupE) return NextResponse.json({ error: "email_taken" }, { status: 409 });
      await db.from("profiles").update({ email: novoEmail }).eq("id", id);
      await db.auth.admin.updateUserById(id, { email: novoEmail, email_confirm: true }).catch(() => {});
    } else {
      const { data: cur } = await db.from("profiles").select("username").eq("id", id).maybeSingle();
      const uname = (cur as { username?: string } | null)?.username;
      await db.from("profiles").update({ email: null }).eq("id", id);
      if (uname) await db.auth.admin.updateUserById(id, { email: `${uname}@${EMAIL_DOMAIN}`, email_confirm: true }).catch(() => {});
    }
  }

  const profileFields: Record<string, unknown> = {};
  if (body.name !== undefined) profileFields.name = body.name;
  if (body.role !== undefined) profileFields.role = body.role;
  if (body.active !== undefined) profileFields.active = body.active;
  if (Object.keys(profileFields).length) {
    const { error } = await db.from("profiles").update(profileFields).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Desligar (active:false) ou rebaixar precisa valer AGORA. `getProfile`
    // memoiza o perfil por 30s (lib/require-auth.ts), então sem isto a pessoa
    // desligada seguia passando pelos gates por até meio minuto.
    // Limite honesto: o cache é por INSTÂNCIA serverless — isto zera a desta,
    // as outras respeitam o TTL de 30s. É o teto do atraso, não uma garantia
    // de corte instantâneo em toda a frota.
    invalidate(`profile:${id}`);
  }

  // ── Trava de quem CONCEDE área restrita ──────────────────────────────────
  //
  // `permissoes` já é campo de poder (exige admin), mas isso não bastava: a
  // grade grava o mapa INTEIRO, então qualquer admin editando o cargo de um
  // colega podia mandar `financeiro:pagar: true` no mesmo PATCH e se dar o
  // cofre. A área restrita protegia contra concessão em BLOCO — não contra
  // alguém marcando de propósito.
  //
  // Quem administra cada área restrita é a própria área que diz: o Financeiro
  // declara `financeiro:acessos`. Sem essa chave (ou sem ser superusuário), as
  // chaves daquela área voltam ao que JÁ ESTAVA gravado. Preservar, e não
  // zerar: zerar deixaria um admin revogar o Financeiro de alguém sem querer,
  // só por salvar o telefone numa tela que nem mostra essas chaves.
  if (body.permissoes !== undefined || body.financeiro_empresas !== undefined) {
    const { resolveMyModuleKeys } = await import("@/lib/perfis");
    const { podeConcederArea, preservarAreasNaoAdministradas } = await import("@/lib/areas");
    const { ehSuperusuario: souSuper } = await import("@/lib/superusuario");
    const minhas = await resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username });
    const superusuario = souSuper(me.id, me.username);

    if (body.permissoes !== undefined) {
      const { data: fichaAtual } = await db
        .from("employees").select("permissoes").eq("id", id).maybeSingle();
      body.permissoes = preservarAreasNaoAdministradas({
        enviado: (body.permissoes ?? {}) as Record<string, boolean>,
        guardado: (fichaAtual?.permissoes ?? null) as Record<string, boolean> | null,
        minhasChaves: minhas,
        ehSuperusuario: superusuario,
      });
    }

    // Restrição por empresa: MESMA trava, e é a mesma tabela que a antiga tela
    // de Acessos gravava (`fin_acessos`). Sem `financeiro:acessos` (ou sem ser
    // superusuário), o pedido é ignorado em silêncio — o resto do PATCH segue
    // normal, porque a ficha inteira não pode falhar por causa de um bloco que
    // esta pessoa não tinha o direito de tocar.
    if (body.financeiro_empresas !== undefined && podeConcederArea("financeiro", minhas, superusuario)) {
      try {
        await db.from("fin_acessos").delete().eq("user_id", id);
        // Os acessos são cacheados por 30s: a concessão vale na hora.
        esquecerEmpresas();
        const ids = body.financeiro_empresas ?? [];
        if (ids.length) {
          await db.from("fin_acessos").insert(ids.map((empresa_id) => ({ empresa_id, user_id: id })));
        }
      } catch { /* supabase/financeiro.sql ainda não rodado: sem tabela, sem restrição */ }
    }
  }

  const rhFields: Record<string, unknown> = {};
  for (const k of RH_KEYS) {
    if (body[k] !== undefined) rhFields[k] = (k === "data_admissao" || k === "erp_user_id") ? (body[k] || null) : body[k];
  }
  // Página inicial guarda CHAVE de módulo, nunca URL. Chave desconhecida vira
  // nulo (= comportamento padrão) em vez de ficar gravada apontando pro nada.
  if (body.pagina_inicial !== undefined) {
    rhFields.pagina_inicial = ehPaginaInicialValida(body.pagina_inicial) ? body.pagina_inicial : null;
  }
  // Departamento define o setor (back-compat c/ atribuição de atividades).
  if (body.departamento !== undefined) rhFields.setor = body.departamento ? setorDoDepartamento(body.departamento) : null;
  if (Object.keys(rhFields).length) {
    rhFields.updated_at = new Date().toISOString();
    // Resiliente: se alguma coluna ainda não existe no banco (migração pendente,
    // ex.: 'escala'), remove só ela e tenta de novo — não derruba o save inteiro.
    const attempt: Record<string, unknown> = { ...rhFields };
    for (let i = 0; i < 6; i++) {
      const { error } = await db.from("employees").upsert({ id, ...attempt });
      if (!error) break;
      const m = /find the '([^']+)' column/.exec(error.message);
      if (m && m[1] in attempt && Object.keys(attempt).length > 1) { delete attempt[m[1]]; continue; }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    invalidate(`emp-acesso:${id}`); // acesso/nível mudou → derruba o cache na hora
    invalidate(`pagina-inicial:${id}`);
  }

  // Código do leitor de estoque: escrita À PARTE do upsert de RH acima, porque
  // aqui o erro esperado é OUTRO. supabase/estoque_dispositivos.sql criou um
  // índice único parcial em employees.codigo_acesso — duas pessoas com o
  // mesmo código deixariam o login offline do leitor ambíguo, e o Postgres
  // recusa com 23505. Isso VAI acontecer (código curto, poucos dígitos) e
  // merece a mensagem certa, não um 500 mudo.
  if (codigoAcessoNormalizado !== undefined) {
    const { error } = await db.from("employees").upsert({ id, codigo_acesso: codigoAcessoNormalizado.valor });
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "codigo_duplicado" }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Histórico de permissões: registra QUEM mudou e o conjunto de áreas liberado
  // AGORA. Tolerante: sem a tabela (SQL pendente), o save segue sem histórico.
  if (body.permissoes !== undefined) {
    try {
      const perms = (body.permissoes ?? {}) as Record<string, boolean>;
      const areas = AREA_KEYS.filter((k) => perms[k]);
      await db.from("permissoes_historico").insert({
        employee_id: id, areas, qtd: areas.length,
        alterado_por: me.id, alterado_por_nome: me.name ?? null,
      });
    } catch { /* tabela ausente → sem histórico */ }
  }

  // Gera o LINK de primeiro acesso (também serve de "esqueci a senha": é o
  // mesmo ato — a pessoa recebe um link e escolhe uma senha nova).
  //
  // A senha atual para de valer na hora, e não existe senha temporária que
  // alguém precise decorar ou transmitir: quem autoriza é o link. O link é
  // devolvido UMA vez, aqui, e nunca fica guardado — o banco só tem o hash.
  if (body.resetPassword) {
    const { token, hash, expiraEm } = gerarTokenPrimeiroAcesso();
    // Derruba a senha atual por uma imprevisível: sem isto, "resetar" deixaria a
    // senha antiga funcionando ao lado do link.
    await db.auth.admin.updateUserById(id, { password: `reset-${crypto.randomUUID()}` });

    const campos = {
      password_set: false,
      primeiro_acesso_token_hash: hash,
      primeiro_acesso_expira_em: expiraEm,
      primeiro_acesso_usado_em: null,
    };
    const { error: eLink } = await db.from("profiles").update(campos).eq("id", id);
    if (eLink) {
      // Colunas do SQL ainda não existem: não dá pra gerar link. Melhor falhar
      // alto do que devolver um link que nunca vai funcionar — a pessoa ficaria
      // sem senha E sem entrada, e o admin sem entender por quê.
      return NextResponse.json(
        { error: "sql_pendente", detail: "Rode supabase/auth_primeiro_acesso.sql para habilitar o link de primeiro acesso." },
        { status: 503 },
      );
    }
    // Origem da requisição — nunca uma URL fixa, senão o link sai apontando pro
    // domínio errado quando gerado de um preview ou de outro host.
    const origem = req.headers.get("origin") || new URL(req.url).origin;
    linkPrimeiroAcesso = { link: montarLink(origem, token), expiraEm };
  }

  return NextResponse.json({ ok: true, primeiroAcesso: linkPrimeiroAcesso });
}

// DELETE /api/colaboradores/[id] — remove (auth + profile + employee via cascade).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await ensureAdmin();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (id === me.id) return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { error } = await db.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
