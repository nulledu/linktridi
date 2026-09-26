import { NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { usuariosTridiflow } from "@/lib/tridiflow-db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getProfileForModule("tridiflow:configuracoes"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ usuarios: await usuariosTridiflow() });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
