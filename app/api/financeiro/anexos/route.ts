import { NextResponse } from "next/server";
import { apiFinanceiro, type SubFinanceiro } from "@/lib/financeiro/gate";
import { empresaPermitida, auditar } from "@/lib/financeiro/db";
import { anexosDe, apagarAnexo, guardarAnexo, DONOS, type DonoDeAnexo } from "@/lib/financeiro/anexos";

export const dynamic = "force-dynamic";

/**
 * Anexos: comprovante, XML, PDF.
 *
 * A permissão segue o DONO, e não uma chave só de "anexos": quem pode mexer na
 * nota anexa o XML dela; quem pode dar baixa anexa o comprovante. Uma chave
 * separada criaria o caso absurdo de alguém anexar comprovante a um pagamento
 * que não tem direito de ver.
 */
const CHAVE_DO_DONO: Record<DonoDeAnexo, SubFinanceiro> = {
  compra: "compras",
  nota: "notas",
  patrimonio: "patrimonio",
  // O comprovante nasce do ato de pagar — por isso `pagar`, e não
  // `compromissos`: quem só lança a conta não é quem tem o recibo na mão.
  compromisso: "pagar",
};

const ehDono = (v: unknown): v is DonoDeAnexo => DONOS.includes(v as DonoDeAnexo);

/** GET ?tipo=&owner_id=&empresa_id= → lista com link assinado. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const ownerId = searchParams.get("owner_id");
  const empresaId = searchParams.get("empresa_id");

  if (!ehDono(tipo) || !ownerId || !empresaId) {
    return NextResponse.json({ erro: "Parâmetros inválidos." }, { status: 400 });
  }

  // LER o anexo exige só `ver`: quem enxerga a nota enxerga o documento dela.
  const eu = await apiFinanceiro("ver");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  if (!(await empresaPermitida(eu.profile.id, empresaId))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  return NextResponse.json({ anexos: await anexosDe(empresaId, tipo, ownerId) });
}

/** POST multipart: file, tipo, owner_id, empresa_id. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ erro: "Envio inválido." }, { status: 400 });

  const arquivo = form.get("file");
  const tipo = String(form.get("tipo") ?? "");
  const ownerId = String(form.get("owner_id") ?? "");
  const empresaId = String(form.get("empresa_id") ?? "");

  if (!(arquivo instanceof File) || !ehDono(tipo) || !ownerId || !empresaId) {
    return NextResponse.json({ erro: "Parâmetros inválidos." }, { status: 400 });
  }

  const eu = await apiFinanceiro(CHAVE_DO_DONO[tipo]);
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  if (!(await empresaPermitida(eu.profile.id, empresaId))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const r = await guardarAnexo({
    empresaId, tipo, ownerId,
    nome: arquivo.name || "arquivo",
    mime: arquivo.type || "application/octet-stream",
    bytes: await arquivo.arrayBuffer(),
    tamanho: arquivo.size ?? 0,
    autorId: eu.profile.id,
  });
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });

  await auditar({
    empresa_id: empresaId, entidade: tipo, entidade_id: ownerId, acao: "anexar",
    user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { nome: r.anexo.nome, tamanho: r.anexo.tamanho },
  });

  return NextResponse.json({ ok: true, anexo: r.anexo });
}

/** DELETE ?id=&empresa_id=&tipo= */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const empresaId = searchParams.get("empresa_id");
  const tipo = searchParams.get("tipo");

  if (!id || !empresaId || !ehDono(tipo)) {
    return NextResponse.json({ erro: "Parâmetros inválidos." }, { status: 400 });
  }

  const eu = await apiFinanceiro(CHAVE_DO_DONO[tipo]);
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  if (!(await empresaPermitida(eu.profile.id, empresaId))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const r = await apagarAnexo(id, empresaId);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });

  await auditar({
    empresa_id: empresaId, entidade: tipo, entidade_id: null, acao: "remover-anexo",
    user_id: eu.profile.id, user_nome: eu.profile.name, dados: { anexo_id: id },
  });

  return NextResponse.json({ ok: true });
}
