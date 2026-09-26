// Leitura só: lista as centrais de tutoriais e, em cada uma, os tutoriais
// (título, handle, tipos de bloco e se já tem vídeo). Não grava nada.
//   node scripts/tutoriais-inspecionar.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const raiz = path.join(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await db.from("tridiflow_bots")
  .select("id,nome,pagina")
  .eq("tipo", "page").eq("pagina->config->>template", "central_tutoriais");
if (error) { console.error(error); process.exit(1); }

for (const linha of data ?? []) {
  const doc = linha.pagina?.config?.centralTutoriais ?? null;
  const tuts = doc?.tutoriais ?? [];
  console.log(`\n=== central ${linha.id} — "${linha.nome}" — ${tuts.length} tutoriais ===`);
  for (const t of tuts) {
    const blocos = t.blocos ?? [];
    const tiposBloco = blocos.map((b) => b.tipo).join(",");
    const temVid = blocos.some((b) => b.tipo === "video" || (b.tipo === "passo" && b.videoUrl));
    console.log(`  • [${t.status}] "${t.titulo}"  handle=${t.handle}  blocos=[${tiposBloco}]${temVid ? "  JÁ TEM VÍDEO" : ""}`);
  }
}
