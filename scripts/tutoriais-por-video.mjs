// Coloca o vídeo (link do YouTube) no topo de cada tutorial da Central, casando
// pelo handle. Re-rodável: se o tutorial já tem um bloco de vídeo, ATUALIZA a
// URL dele em vez de empilhar outro. Passe --aplicar pra gravar; sem a flag é
// só simulação (dry-run).
//   node scripts/tutoriais-por-video.mjs           # simula
//   node scripts/tutoriais-por-video.mjs --aplicar # grava
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const raiz = path.join(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// handle do tutorial → link do vídeo (os shorts do canal)
const VIDEOS = {
  "carimbo-de-acrilico-em-ceramica": "https://youtube.com/shorts/qpBk0DN4tds",
  "carimbo-em-papel": "https://youtube.com/shorts/j5lxS2L3wP4",
  "limpeza-do-carimbo": "https://youtube.com/shorts/OZVoTbbQ1Bs",
  "chancela": "https://youtube.com/shorts/eJ5Pij7gXpI",
  "cortador-de-biscoito": "https://youtube.com/shorts/wNeFB5KnWMI",
  "carimbo-em-isopor": "https://youtube.com/shorts/9X8Cg2pIpUI",
  "carimbo-em-madeira": "https://youtube.com/shorts/R8ck3bsjXDc",
  "carimbo-em-plastico": "https://youtube.com/shorts/H_7CtiLKSE4",
  "sinete": "https://youtube.com/shorts/NIyupa5zkNo",
  "carimbo-em-tecido": "https://youtube.com/shorts/6LOFuPG-NAg",
};

const { data, error } = await db.from("tridiflow_bots")
  .select("id,nome,pagina,status,published")
  .eq("tipo", "page").eq("pagina->config->>template", "central_tutoriais");
if (error) { console.error(error); process.exit(1); }

let mudou = false;
for (const linha of data ?? []) {
  const doc = linha.pagina?.config?.centralTutoriais;
  if (!doc?.tutoriais) continue;
  const restantes = new Set(Object.keys(VIDEOS));
  for (const t of doc.tutoriais) {
    const url = VIDEOS[t.handle];
    if (!url) continue;
    restantes.delete(t.handle);
    t.blocos = Array.isArray(t.blocos) ? t.blocos : [];
    const existente = t.blocos.find((b) => b.tipo === "video");
    if (existente) {
      if (existente.url === url && existente.origem === "link") { console.log(`  = "${t.titulo}" já com o vídeo certo`); continue; }
      existente.origem = "link"; existente.url = url;
      console.log(`  ~ "${t.titulo}" vídeo atualizado`);
    } else {
      t.blocos.unshift({ id: randomUUID().slice(0, 40), tipo: "video", origem: "link", url, capaUrl: "", legenda: "" });
      console.log(`  + "${t.titulo}" vídeo inserido no topo`);
    }
    mudou = true;
  }
  for (const h of restantes) console.log(`  ! handle não encontrado nesta central: ${h}`);

  if (APLICAR && mudou) {
    const { error: e2 } = await db.from("tridiflow_bots").update({ pagina: linha.pagina }).eq("id", linha.id);
    if (e2) { console.error(e2); process.exit(1); }
    console.log(`  → gravado na central ${linha.id}`);
  }
}
console.log(APLICAR ? "\nOK, gravado." : "\nSimulação (dry-run). Rode com --aplicar pra gravar.");
