import { NextRequest, NextResponse } from "next/server";
import { getProfile, getProfileForAnyModule } from "@/lib/require-auth";
import {
  acharJustificativa, atualizarJustificativa, criarJustificativa, decidirJustificativa,
  listJustificativas, listJustificativasPendentes, pessoaDoColaborador, removerJustificativa,
  TabelaAusenteError, type EntradaJustificativa,
} from "@/lib/ponto";
import {
  ehEfeitoJustificativa, ehTipoJustificativa, horaEmMin, ROTULO_TIPO,
  type EfeitoJustificativa, type TipoJustificativa,
} from "@/lib/ponto-justificativas";
import { chaveDaUrl, areaDaChave } from "@/lib/armazenamento/referencia";

export const dynamic = "force-dynamic";

// ── Dois caminhos, um registro ───────────────────────────────────────────────
//
// GESTOR (quem tem a área do ponto) lança pra qualquer pessoa e já nasce
// APROVADA — é a decisão dele, tomada na hora.
//
// COLABORADOR abre o próprio ponto, escolhe o dia, o tipo e o horário, sobe a
// foto do atestado, e o pedido nasce PENDENTE. Aparece nas duas telas e não
// perdoa um minuto até alguém decidir. Sem essa separação, "justificar" seria
// um botão de apagar a própria dívida.
//
// Portão do painel: quem tem Configurações OU Colaboradores (é de dentro de
// Colaboradores que o painel abre). Era o papel "admin" — com a área liberada
// na grade, o painel montava e cada aba voltava 403.
async function gestor() { return getProfileForAnyModule("administracao", "colaboradores"); }
const semTabela = "Rode o supabase/ponto_justificativas.sql e o ponto_justificativas_v2.sql primeiro.";

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
};
const ehDia = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const hora = (v: unknown): string | null => {
  const m = horaEmMin(typeof v === "string" ? v : null);
  return m == null ? null : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** O anexo tem que ser um arquivo NOSSO, da área de atestados. Link de fora
 *  gravado aqui viraria um `<img src>` apontando pra qualquer lugar. */
function anexoValido(v: unknown): string | null {
  const url = texto(v, 400);
  if (!url) return null;
  const chave = chaveDaUrl(url);
  return chave && areaDaChave(chave) === "atestados" ? url : null;
}

interface Pedido {
  tipo: TipoJustificativa;
  efeito: EfeitoJustificativa;
  motivo: string | null;
  horaDe: string | null;
  horaAte: string | null;
  minutos: number | null;
  arquivo: string | null;
  arquivoNome: string | null;
}

/** Lê o corpo comum aos dois caminhos. `string` = recusa com essa mensagem. */
function lerPedido(b: Record<string, unknown>): Pedido | string {
  const tipo: TipoJustificativa = ehTipoJustificativa(b.tipo) ? b.tipo : "outro";
  const efeito: EfeitoJustificativa = ehEfeitoJustificativa(b.efeito) ? b.efeito : ROTULO_TIPO[tipo].efeito;

  const horaDe = hora(b.horaDe);
  const horaAte = hora(b.horaAte);
  if ((horaDe && !horaAte) || (!horaDe && horaAte)) return "Informe as duas pontas do horário.";
  if (horaDe && horaAte && horaAte <= horaDe) return "A hora final tem que ser depois da inicial.";

  const brutos = Number(b.minutos);
  const minutos = Number.isFinite(brutos) && brutos > 0 ? Math.min(1440, Math.round(brutos)) : null;

  const arquivo = b.arquivo === null || b.arquivo === undefined ? null : anexoValido(b.arquivo);
  if (b.arquivo && !arquivo) return "O anexo precisa ser um arquivo enviado aqui pela tela.";

  return {
    tipo, efeito, motivo: texto(b.motivo, 500),
    horaDe, horaAte, minutos, arquivo, arquivoNome: texto(b.arquivoNome, 160),
  };
}

// ── GET ──────────────────────────────────────────────────────────────────────
// Gestor: `?mes=YYYY-MM`, `?pessoaId=`, ou `?pendentes=1` (a fila de decisão).
// Colaborador: sempre e só as dele — o `pessoaId` do corpo é ignorado.
export async function GET(req: NextRequest) {
  const eu = await getProfile();
  if (!eu) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const mes = sp.get("mes");
  const souGestor = !!(await gestor());

  if (!souGestor) {
    const minha = await pessoaDoColaborador(eu.id);
    if (!minha) return NextResponse.json({ justificativas: [] });
    return NextResponse.json({
      justificativas: await listJustificativas({
        mes: mes && /^\d{4}-\d{2}$/.test(mes) ? mes : undefined,
        pessoaId: minha.id,
      }),
      pessoaId: minha.id,
    });
  }

  if (sp.get("pendentes") === "1") {
    return NextResponse.json({ justificativas: await listJustificativasPendentes() });
  }
  return NextResponse.json({
    justificativas: await listJustificativas({
      mes: mes && /^\d{4}-\d{2}$/.test(mes) ? mes : undefined,
      pessoaId: sp.get("pessoaId"),
    }),
  });
}

// ── POST ─────────────────────────────────────────────────────────────────────
// Cria (sem `id`) ou altera (com `id`). O gestor faz pra qualquer pessoa e já
// nasce aprovada; o colaborador só pra si, e nasce pendente.
export async function POST(req: NextRequest) {
  const eu = await getProfile();
  if (!eu) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!ehDia(b.dia)) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });

  const pedido = lerPedido(b);
  if (typeof pedido === "string") return NextResponse.json({ error: pedido }, { status: 400 });

  const souGestor = !!(await gestor());
  let pessoaId = texto(b.pessoaId, 64);

  if (!souGestor) {
    const minha = await pessoaDoColaborador(eu.id);
    if (!minha) return NextResponse.json({ error: "Seu login não está ligado a nenhuma pessoa do ponto." }, { status: 403 });
    // O pessoaId do corpo é DESCARTADO, não conferido: conferir e recusar já
    // seria dizer que dá pra tentar. Pedido de colaborador é sempre sobre ele.
    pessoaId = minha.id;
  }
  if (!pessoaId) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });

  // Quem não é gestor não escolhe o efeito: um "conta como trabalhada" pedido
  // por quem faltou seria autoabono com outro nome. O pedido guarda o efeito
  // sugerido pelo tipo, e quem aprova é que confirma ou troca.
  const efeito = souGestor ? pedido.efeito : ROTULO_TIPO[pedido.tipo].efeito;

  const entrada: EntradaJustificativa = {
    pessoaId, dia: b.dia,
    motivo: pedido.motivo, tipo: pedido.tipo, efeito,
    status: souGestor ? "aprovada" : "pendente",
    horaDe: pedido.horaDe, horaAte: pedido.horaAte, minutos: pedido.minutos,
    arquivo: pedido.arquivo, arquivoNome: pedido.arquivoNome,
    solicitadoPor: eu.id,
    decididoPor: souGestor ? eu.id : null,
    createdBy: eu.id,
  };

  try {
    const id = texto(b.id, 64);
    if (id) {
      const antes = await acharJustificativa(id);
      if (!antes) return NextResponse.json({ error: "não encontrada" }, { status: 404 });
      // Colaborador só mexe no PRÓPRIO pedido e só enquanto ninguém decidiu.
      // Depois de aprovado, editar seria mudar a conta sem passar por ninguém.
      if (!souGestor) {
        if (antes.pessoaId !== pessoaId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        if ((antes.status ?? "aprovada") !== "pendente") {
          return NextResponse.json({ error: "Este pedido já foi decidido — fale com o RH." }, { status: 409 });
        }
      }
      await atualizarJustificativa(id, { ...entrada, pessoaId: antes.pessoaId, solicitadoPor: antes.solicitadoPor ?? eu.id });
      return NextResponse.json({ ok: true, id });
    }
    return NextResponse.json({ ok: true, id: await criarJustificativa(entrada), pendente: !souGestor });
  } catch (e) {
    if (e instanceof TabelaAusenteError) return NextResponse.json({ error: semTabela }, { status: 400 });
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}

// ── PATCH ────────────────────────────────────────────────────────────────────
// A decisão do gestor: `{ id, status: "aprovada" | "recusada", motivo? }`.
export async function PATCH(req: NextRequest) {
  const eu = await gestor();
  if (!eu) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = texto(b.id, 64);
  if (!id) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  if (b.status !== "aprovada" && b.status !== "recusada") {
    return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  }
  try {
    await decidirJustificativa(id, b.status, eu.id, texto(b.motivo, 300));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TabelaAusenteError) return NextResponse.json({ error: semTabela }, { status: 400 });
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}

// ── DELETE ?id= ──────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const eu = await getProfile();
  if (!eu) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });

  const alvo = await acharJustificativa(id);
  if (!alvo) return NextResponse.json({ ok: true });

  if (!(await gestor())) {
    const minha = await pessoaDoColaborador(eu.id);
    const meu = !!minha && alvo.pessoaId === minha.id;
    if (!meu) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if ((alvo.status ?? "aprovada") !== "pendente") {
      return NextResponse.json({ error: "Este pedido já foi decidido — fale com o RH." }, { status: 409 });
    }
  }
  try { await removerJustificativa(id); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 }); }
}
