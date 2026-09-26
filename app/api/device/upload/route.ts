import { NextRequest, NextResponse } from "next/server";
import { autenticarDevice } from "@/lib/device";
import { guardarPublico } from "@/lib/armazenamento/publico";

export const dynamic = "force-dynamic";

// POST /api/device/upload (multipart: file) → { url }. Foto de conclusão do tablet.
export async function POST(req: NextRequest) {
  const auth = await autenticarDevice(req.headers.get("x-device-token"));
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

  const ext = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "jpg";
  const path = `atividades/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  try {
    return NextResponse.json({ url: await guardarPublico(path, await file.arrayBuffer(), file.type || "image/jpeg") });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
