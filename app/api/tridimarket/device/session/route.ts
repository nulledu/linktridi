import { NextRequest, NextResponse } from "next/server";
import { createTridiMarketAdminClient } from "../../../../../lib/tridimarket/client";
import { isMissingMarketSchema, TridiMarketRepository } from "../../../../../lib/tridimarket/repository";
import { authorizeDevice, CandidatoDeLogin, classificarCodigo, deviceAuthFailure, empregadoParaTotem, pinSessionInput } from "../_device";
import { criarTokenSessao } from "../_sessao";

export const dynamic = "force-dynamic";

// Login do totem pelo CÓDIGO DE ACESSO que já existe no sistema
// (usuarios_perfil.codigo_acesso) — as pessoas não precisam recadastrar nada.
// Antes havia uma tabela paralela de PIN (market_employee_credentials), que
// duplicava essa coluna; foi removida.
//
// Como qualquer pessoa compra em qualquer tablet, o código é procurado no
// sistema INTEIRO. Se dois funcionários tiverem o mesmo código, a busca fica
// ambígua e o acesso é RECUSADO — cobrar a conta da pessoa errada seria pior.
// O painel (aba Funcionários) lista os códigos repetidos pra correção.
export async function POST(req: NextRequest) {
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure(auth.reason);
  const device = auth.device;
  const parsed = pinSessionInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_pin" }, { status: 422 });
  const db = createTridiMarketAdminClient();
  const codigo = parsed.data.pin.trim();

  // Trava de tentativas por dispositivo (historico_suspeitas é a trilha do legado).
  // A trava conta EXATAMENTE a grafia que a trilha grava (antes contava
  // `codigo_negado:` sem o prefixo e nunca disparava).
  const tipoNegado = `market_codigo_negado:${device.id}`;
  const janela = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count: recentes } = await db
    .from("suspeitas").select("id", { head: true, count: "exact" })
    .eq("tipo", tipoNegado).gte("criado_em", janela);
  if ((recentes ?? 0) >= 8) return NextResponse.json({ ok: false, error: "pin_temporarily_locked" }, { status: 429 });

  // Traz os INATIVOS junto de propósito, para poder separar "código errado" de
  // "conta desativada". Sem essa distinção a pessoa desativada ouvia "código não
  // reconhecido" e ficava tentando de novo achando que tinha digitado errado —
  // e, pior, o tablet a deixava entrar pelo diretório local e a expulsava um
  // segundo depois, sem dizer por quê.
  const { data: candidatos, error } = await db
    .from("funcionarios").select("id,unidade_id,nome,ativo")
    .eq("codigo_acesso", codigo);
  if (error) return isMissingMarketSchema(error) ? deviceAuthFailure("schema_missing") : NextResponse.json({ ok: false, error: error.message }, { status: 503 });

  type Candidato = CandidatoDeLogin;
  const classificado = classificarCodigo((candidatos ?? []) as Candidato[]);
  // O código EXISTE, só está desativado. Não é tentativa de invasão: não conta
  // para a trava de tentativas nem entra na trilha de suspeitas, senão desativar
  // uma pessoa acabaria bloqueando o tablet para as outras.
  if (classificado.tipo === "conta_inativa") {
    return NextResponse.json({ ok: false, error: "conta_inativa" }, { status: 403 });
  }
  if (classificado.tipo === "codigo_desconhecido") {
    await registrarSuspeita(db, device, null, tipoNegado);
    return NextResponse.json({ ok: false, error: "invalid_pin" }, { status: 401 });
  }
  const lista = classificado.lista;

  // MESMA PESSOA EM VÁRIAS EMPRESAS: é comum aqui (ex.: alguém cadastrado no
  // Escritório, na Produção e na Zellux com o MESMO código — de propósito, é a
  // mesma pessoa). Então código repetido NÃO é ambiguidade por padrão:
  //   1) se ela tem conta na unidade DESTE tablet, usa essa (está "em casa");
  //   2) senão, e sendo claramente a mesma pessoa, usa a conta mais ativa;
  //   3) só recusa quando são pessoas DIFERENTES dividindo um código — aí sim
  //      cobrar a conta errada seria grave.
  let encontrado: Candidato | undefined = lista.length === 1 ? lista[0] : lista.find((c) => c.unidade_id === device.profileId);
  if (!encontrado) {
    if (!mesmaPessoa(lista)) {
      await registrarSuspeita(db, device, null, `market_codigo_ambiguo:${device.id}`);
      return NextResponse.json({ ok: false, error: "pin_ambiguous" }, { status: 409 });
    }
    encontrado = await contaMaisAtiva(db, lista);
  }

  // Conta bloqueada pelo administrador (crédito/consumo suspenso).
  const { data: credito } = await db.from("creditos").select("bloqueado").eq("funcionario_id", encontrado.id).maybeSingle();
  if (credito?.bloqueado === true) return NextResponse.json({ ok: false, error: "employee_blocked" }, { status: 403 });

  // Vale 48h: uma compra feita offline ainda sincroniza dentro dessa janela.
  const expiresAt = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
  // Token ASSINADO, sem tabela de sessão — ver _sessao.ts. (Tentar usar
  // sessoes_totem falhou: empresa_id é uuid NOT NULL, incompatível com o
  // schema atual; era por isso que ela nunca tinha sido usada.)
  const sessionToken = criarTokenSessao(device.id, encontrado.id, expiresAt);

  const employee = (await new TridiMarketRepository(db).employees([encontrado.unidade_id])).find((item) => item.id === encontrado!.id);
  if (!employee) return NextResponse.json({ ok: false, error: "employee_not_available" }, { status: 409 });
  const visitante = encontrado.unidade_id !== device.profileId;
  // Nome da empresa cobrada: a pessoa vê na tela EM QUAL conta a compra vai
  // cair — essencial pra quem tem conta em mais de uma empresa.
  const { data: perfilDela } = await db.from("unidades").select("nome").eq("id", encontrado.unidade_id).maybeSingle();
  return NextResponse.json({
    ok: true,
    data: { token: sessionToken, expiresAt, employee: empregadoParaTotem(employee), visitante, empresa: perfilDela?.nome ?? null },
  });
}

// Normaliza nome pra comparar (sem acento, minúsculo, espaços colapsados).
const normNome = (s: string | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// É a MESMA pessoa em empresas diferentes? Aceita variação de apelido
// ("Dani" × "Daniel") tratando prefixo como o mesmo nome. Se forem nomes
// distintos, são pessoas distintas dividindo um código — aí é ambiguidade real.
function mesmaPessoa(lista: Array<{ nome?: string }>): boolean {
  const nomes = lista.map((c) => normNome(c.nome)).filter(Boolean);
  if (nomes.length !== lista.length) return false;
  const base = nomes.reduce((a, b) => (a.length <= b.length ? a : b));
  return nomes.every((n) => n === base || n.startsWith(base + " ") || n.startsWith(base));
}

// Entre as contas da mesma pessoa, a que ela mais usa (compra mais recente).
// Empate/sem histórico → menor id, pra ser determinístico.
async function contaMaisAtiva(
  db: ReturnType<typeof createTridiMarketAdminClient>,
  lista: Array<{ id: number; unidade_id: string }>,
): Promise<{ id: number; unidade_id: string }> {
  const ids = lista.map((c) => c.id);
  const { data } = await db.from("vendas").select("funcionario_id,criado_em")
    .in("funcionario_id", ids).order("criado_em", { ascending: false }).limit(1);
  const recente = Number((data ?? [])[0]?.funcionario_id);
  return lista.find((c) => c.id === recente) ?? [...lista].sort((a, b) => a.id - b.id)[0];
}

// Trilha de segurança (código negado, tentativa fora de hora…).
async function registrarSuspeita(db: ReturnType<typeof createTridiMarketAdminClient>, device: { id: string; profileId: string }, usuarioId: number | null, tipo: string) {
  await db.from("suspeitas").insert({
    funcionario_id: usuarioId, unidade_id: device.profileId, tipo,
  }).then(() => undefined, () => undefined);   // best-effort: nunca derruba o login
}
