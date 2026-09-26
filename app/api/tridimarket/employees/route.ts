import { NextRequest, NextResponse } from "next/server";
import { audit, employeePatchInput, marketApiError, marketDb, marketRepository, parseProfileIds, requireMarketAdmin } from "../_shared";

export const dynamic = "force-dynamic";

// Por padrão devolve PESSOAS (cadastros da mesma pessoa unidos, com a dívida
// somada). `?porCadastro=1` devolve a lista crua, um item por cadastro — usada
// onde a ação precisa de um cadastro específico.
export async function GET(req: NextRequest) {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const porCadastro = req.nextUrl.searchParams.get("porCadastro") === "1";
  const escopo = parseProfileIds(req.url);
  // Qual FATURA mostrar. `ate` chega como fim do dia (23:59:59.999) e a janela
  // é exclusiva no fim, então soma 1ms — senão uma compra do último segundo do
  // mês ficaria fora da própria fatura.
  const de = Date.parse(req.nextUrl.searchParams.get("de") ?? "");
  const ate = Date.parse(req.nextUrl.searchParams.get("ate") ?? "");
  const fatura = Number.isFinite(de) && Number.isFinite(ate) && ate > de ? { de, ate: ate + 1 } : undefined;
  try {
    const repo = marketRepository();
    return NextResponse.json({ ok: true, data: porCadastro ? await repo.employees(escopo, false, fatura) : await repo.people(escopo, undefined, fatura) });
  } catch (error) { return marketApiError(error); }
}

// Define/limpa a empresa PRINCIPAL de uma pessoa. Sem a tabela (migração
// pendente), devolve um erro claro em vez de fingir que salvou.
export async function POST(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const corpo = await req.json().catch(() => null) as { employeeIds?: number[]; profileId?: string | null } | null;
  const ids = (corpo?.employeeIds ?? []).map(Number).filter(Number.isFinite);
  if (!ids.length) return NextResponse.json({ ok: false, error: "invalid_employees" }, { status: 422 });
  const db = marketDb();
  try {
    if (corpo?.profileId) {
      // Marca TODOS os cadastros da pessoa: a escolha é dela, não de um
      // cadastro isolado, e assim qualquer consulta enxerga a mesma coisa.
      const linhas = ids.map((funcionario_id) => ({ funcionario_id, unidade_id: corpo.profileId, atualizado_em: new Date().toISOString() }));
      const { error } = await db.from("pessoa_unidade").upsert(linhas, { onConflict: "funcionario_id" });
      if (error) throw error;
    } else {
      // Sem profileId = voltar ao automático (maior consumo).
      const { error } = await db.from("pessoa_unidade").delete().in("funcionario_id", ids);
      if (error) throw error;
    }
    await audit(actor.id, "person.main_company", "employee", ids[0], undefined, { employeeIds: ids, profileId: corpo?.profileId ?? null });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const e = error as { message?: string };
    if (/pessoa_unidade/i.test(e?.message ?? "")) {
      return NextResponse.json({ ok: false, error: "migracao_pendente", action: "rodar supabase/tridimarket-empresa-principal.sql" }, { status: 503 });
    }
    return marketApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const parsed = employeePatchInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_employee", issues: parsed.error.flatten() }, { status: 422 });
  const db = marketDb();
  try {
    const { id, nome, active, normalLimit, pin, blocked, fotoUrl, usuarioId, unidadeId } = parsed.data;
    const legacyPatch: Record<string, unknown> = {};
    if (nome !== undefined) legacyPatch.nome = nome;
    if (unidadeId !== undefined) legacyPatch.unidade_id = unidadeId;
    if (active !== undefined) legacyPatch.ativo = active;
    if (fotoUrl !== undefined) legacyPatch.foto_url = fotoUrl;
    if (usuarioId !== undefined) legacyPatch.usuario_id = usuarioId;
    // Limite próprio da pessoa. Eram duas colunas no ERP antigo
    // (limitacao + limitacao_valor); no schema nosso é uma só, e `null`
    // significa "usa o limite padrão da unidade".
    if (normalLimit !== undefined) legacyPatch.limite_proprio = normalLimit;
    if (Object.keys(legacyPatch).length) {
      const { error } = await db.from("funcionarios").update(legacyPatch).eq("id", id);
      // `usuario_id` só existe depois de mercadinho-cadastros.sql. Enquanto o
      // SQL não roda, salvar nome/foto/limite não pode falhar junto — o resto
      // do formulário grava e só o vínculo fica de fora.
      if (error && /usuario_id/i.test(error.message ?? "")) {
        delete legacyPatch.usuario_id;
        if (Object.keys(legacyPatch).length) {
          const { error: erroSemVinculo } = await db.from("funcionarios").update(legacyPatch).eq("id", id);
          if (erroSemVinculo) throw erroSemVinculo;
        }
      } else if (error) throw error;
    }
    // Mesmo motivo do PUT: código com menos de 6 dígitos nunca chega a ser
    // enviado pelo teclado do tablet.
    if (pin !== undefined && !/^\d{6}$/.test(pin)) {
      return NextResponse.json({ ok: false, error: "codigo_precisa_6_digitos" }, { status: 422 });
    }
    if (pin !== undefined) {
      // O código é o MESMO que o sistema já usa (usuarios_perfil.codigo_acesso).
      // Como ele vale em qualquer tablet (compra cross-empresa), precisa ser único
      // no sistema inteiro — senão o login fica ambíguo e o totem recusa os dois.
      const { data: emUso, error: listError } = await db
        .from("funcionarios").select("id,nome").eq("codigo_acesso", pin).neq("id", id);
      if (listError) throw listError;
      if ((emUso ?? []).length > 0) {
        return NextResponse.json({ ok: false, error: "codigo_em_uso", porQuem: (emUso ?? []).map((u: { nome: string }) => u.nome) }, { status: 409 });
      }
      const { error } = await db.from("funcionarios").update({ codigo_acesso: pin, atualizado_em: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    }
    if (blocked !== undefined) {
      const { error } = await db.from("creditos").upsert({ funcionario_id: id, bloqueado: blocked, atualizado_em: new Date().toISOString() }, { onConflict: "funcionario_id" });
      if (error) throw error;
    }
    await audit(actor.id, "employee.update", "employee", id, undefined, { ...legacyPatch, pinChanged: pin !== undefined, blocked });
    return NextResponse.json({ ok: true });
  } catch (error) { return marketApiError(error); }
}

// PUT — CADASTRAR funcionário. Antes as pessoas vinham do ERP antigo e aqui só
// dava pra editar; no sistema próprio o cadastro nasce aqui.
//
// `codigo_acesso` é o código que a pessoa digita no tablet. Precisa ser ÚNICO
// entre os ativos: dois com o mesmo código deixam o login ambíguo e o tablet
// recusa a entrada (cobrar a conta da pessoa errada seria pior que barrar).
export async function PUT(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const corpo = await req.json().catch(() => null) as
    { nome?: string; unidadeId?: string; codigo?: string; fotoUrl?: string | null; limiteProprio?: number | null; usuarioId?: string | null } | null;
  const nome = (corpo?.nome ?? "").trim();
  const unidadeId = (corpo?.unidadeId ?? "").trim();
  const codigo = (corpo?.codigo ?? "").trim();
  if (nome.length < 2 || !unidadeId) return NextResponse.json({ ok: false, error: "invalid_employee" }, { status: 422 });
  // O teclado do tablet só envia o login quando junta SEIS dígitos — um código
  // de 4 ou 5 fica cadastrado e simplesmente nunca chega ao servidor: a pessoa
  // digita, não acontece nada, e o painel jura que está tudo certo. (Foi o que
  // aconteceu no primeiro teste de instalação.) Barrado aqui, no cadastro.
  if (codigo && !/^\d{6}$/.test(codigo)) {
    return NextResponse.json({ ok: false, error: "codigo_precisa_6_digitos" }, { status: 422 });
  }

  const db = marketDb();
  try {
    if (codigo) {
      const { data: repetido } = await db.from("funcionarios")
        .select("id,nome").eq("codigo_acesso", codigo).eq("ativo", true).maybeSingle();
      if (repetido) {
        return NextResponse.json({ ok: false, error: "codigo_em_uso", detalhe: `Já é o código de ${repetido.nome}.` }, { status: 409 });
      }
    }
    const novo: Record<string, unknown> = {
      nome, unidade_id: unidadeId,
      codigo_acesso: codigo || null,
      foto_url: corpo?.fotoUrl ?? null,
      limite_proprio: corpo?.limiteProprio ?? null,
    };
    if (corpo?.usuarioId) novo.usuario_id = corpo.usuarioId;
    let { data, error } = await db.from("funcionarios").insert(novo).select("id,nome").single();
    // Sem mercadinho-cadastros.sql ainda: cadastra a pessoa mesmo assim, só
    // sem o vínculo — melhor que recusar o cadastro inteiro.
    if (error && /usuario_id/i.test(error.message ?? "")) {
      delete novo.usuario_id;
      ({ data, error } = await db.from("funcionarios").insert(novo).select("id,nome").single());
    }
    if (error) throw error;
    // O código NUNCA vai pra auditoria — é credencial de acesso ao tablet.
    await audit(actor.id, "funcionario.criar", "funcionario", data.id, undefined, { nome, unidadeId, temCodigo: !!codigo });
    return NextResponse.json({ ok: true, data });
  } catch (error) { return marketApiError(error); }
}
