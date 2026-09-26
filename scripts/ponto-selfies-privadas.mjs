// Move as selfies de batida do bucket PÚBLICO (photos/ponto/*) para o bucket
// PRIVADO ponto-selfies, e regrava selfie_url como CAMINHO (não URL). Depois
// disso a única porta de leitura é /api/ponto/selfie — superusuário apenas.
// Re-rodável: linha que já é caminho é pulada; arquivo já movido não quebra.
//
//   node scripts/ponto-selfies-privadas.mjs
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

await db.storage.createBucket("ponto-selfies", { public: false }).catch(() => {});

// Todas as linhas com selfie em URL pública (paginado).
const linhas = [];
for (let off = 0; ; off += 1000) {
  const { data, error } = await db.from("ponto_registros")
    .select("id,selfie_url").not("selfie_url", "is", null)
    .like("selfie_url", "http%").order("batido_em").range(off, off + 999);
  if (error) { console.error(error.message); process.exit(1); }
  linhas.push(...data);
  if (data.length < 1000) break;
}
console.log(`${linhas.length} selfie(s) com URL pública para migrar`);

let movidas = 0, semArquivo = 0, falhas = 0;
for (const l of linhas) {
  const m = /\/photos\/(ponto\/[^?]+\.jpg)/.exec(l.selfie_url);
  if (!m) { falhas++; continue; }
  const caminho = m[1];
  // baixa do público → sobe no privado → apaga do público → regrava a linha
  const { data: arq, error: eDown } = await db.storage.from("photos").download(caminho);
  if (eDown || !arq) {
    // arquivo já não existe (limpeza antiga): a linha fica sem selfie mesmo
    await db.from("ponto_registros").update({ selfie_url: null }).eq("id", l.id);
    semArquivo++;
    continue;
  }
  const buf = Buffer.from(await arq.arrayBuffer());
  const { error: eUp } = await db.storage.from("ponto-selfies").upload(caminho, buf, { contentType: "image/jpeg", upsert: true });
  if (eUp) { console.error(caminho, eUp.message); falhas++; continue; }
  await db.from("ponto_registros").update({ selfie_url: caminho }).eq("id", l.id);
  await db.storage.from("photos").remove([caminho]);
  movidas++;
  if (movidas % 200 === 0) console.log(`  ${movidas}…`);
}
// Sobra no bucket público que nenhuma linha referencia (upload órfão): varre e apaga.
let orfaos = 0;
for (let off = 0; ; off += 100) {
  const { data: lista } = await db.storage.from("photos").list("ponto", { limit: 100, offset: 0 });
  if (!lista?.length) break;
  const nomes = lista.map((x) => `ponto/${x.name}`);
  await db.storage.from("photos").remove(nomes);
  orfaos += nomes.length;
  if (lista.length < 100) break;
}
console.log(`movidas: ${movidas} · sem arquivo: ${semArquivo} · falhas: ${falhas} · órfãs apagadas do público: ${orfaos}`);
