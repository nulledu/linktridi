import { NextResponse } from "next/server";
import { configCrua } from "@/lib/rh/curriculos/dados";
import { emitirInicio } from "@/lib/rh/curriculos/token";

export const dynamic = "force-dynamic";

/**
 * PÚBLICO — o formulário de candidatura pede um "início" antes de subir o
 * currículo. É um carimbo HMAC de 6 h (ver lib/rh/curriculos/token.ts):
 * sem tabela, sem sessão, e é o que amarra o presign a um visitante REAL do
 * formulário em vez de a qualquer POST anônimo.
 */
export async function POST() {
  const { dados } = await configCrua();
  if (dados && dados.formulario_ativo === false) return NextResponse.json({ erro: "formulario_fechado" }, { status: 503 });
  return NextResponse.json({ inicio: emitirInicio() });
}
