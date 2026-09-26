#!/usr/bin/env node
// Compacta as imagens JÁ gravadas das centrais de tutoriais (capas, fotos de
// categoria, passos). As antigas subiram cruas — PNG de ~2 MB cada — e a
// central baixava 30+ MB pra desenhar cartões. Hoje todo envio já sai WebP
// ≤1600px (`comprimirImagem`); isto conserta o legado.
//
//   node --env-file=.env.local scripts/tutoriais-compactar-imagens.mjs            # dry-run: lista e mede
//   node --env-file=.env.local scripts/tutoriais-compactar-imagens.mjs --gravar   # converte, sobe e troca as URLs
//
// Destino: B2 público quando `B2_PUBLICO_*` existe; sem ele, o bucket `photos`
// do Supabase (o mesmo reserva do `guardarPublico`). Troca a URL no RASCUNHO
// (`pagina`) e no PUBLICADO (`published.pagina`) de uma vez. Não apaga o
// arquivo antigo.
import { createClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";
import sharp from "sharp";
import { randomUUID } from "node:crypto";

const GRAVAR = process.argv.includes("--gravar");
const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`falta ${k}`); return v; };
const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const temB2 = ["B2_ENDPOINT", "B2_REGION", "B2_PUBLICO_BUCKET", "B2_PUBLICO_KEY_ID", "B2_PUBLICO_APP_KEY", "B2_PUBLICO_URL"].every((k) => process.env[k]);
const b2 = temB2 ? new AwsClient({ accessKeyId: env("B2_PUBLICO_KEY_ID"), secretAccessKey: env("B2_PUBLICO_APP_KEY"), service: "s3", region: env("B2_REGION") }) : null;

async function subir(caminho, corpo) {
  if (b2) {
    const r = await b2.fetch(`${env("B2_ENDPOINT").replace(/\/+$/, "")}/${env("B2_PUBLICO_BUCKET")}/${caminho}`, {
      method: "PUT", body: corpo, headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" },
    });
    if (!r.ok) throw new Error(`B2 ${r.status}`);
    return `${env("B2_PUBLICO_URL").replace(/\/+$/, "")}/${caminho}`;
  }
  const { error } = await db.storage.from("photos").upload(caminho, corpo, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
  if (error) throw new Error(error.message);
  return db.storage.from("photos").getPublicUrl(caminho).data.publicUrl;
}

/** Toda URL de imagem pesada (png/jpg/jpeg) dentro do documento. */
function urls(no, out = new Set()) {
  if (typeof no === "string") { if (/^https:\/\/\S+\.(png|jpe?g)(\?\S*)?$/i.test(no)) out.add(no); }
  else if (Array.isArray(no)) no.forEach((x) => urls(x, out));
  else if (no && typeof no === "object") Object.values(no).forEach((x) => urls(x, out));
  return out;
}
function trocar(no, mapa) {
  if (typeof no === "string") return mapa.get(no) ?? no;
  if (Array.isArray(no)) return no.map((x) => trocar(x, mapa));
  if (no && typeof no === "object") return Object.fromEntries(Object.entries(no).map(([k, v]) => [k, trocar(v, mapa)]));
  return no;
}

const { data, error } = await db.from("tridiflow_bots").select("id,nome,pagina,published")
  .eq("tipo", "page").eq("pagina->config->>template", "central_tutoriais").limit(50);
if (error) throw error;
const agora = new Date();
const pasta = `tridiflow/tutoriais/${agora.getFullYear()}/${String(agora.getMonth() + 1).padStart(2, "0")}`;

for (const bot of data) {
  const todas = urls({ a: bot.pagina, b: bot.published });
  console.log(`\n== ${bot.nome} (${bot.id}) — ${todas.size} imagens pesadas`);
  const mapa = new Map();
  let antes = 0, depois = 0;
  for (const u of todas) {
    const r = await fetch(u);
    if (!r.ok) { console.log(`  ! ${r.status} ${u}`); continue; }
    const bruto = Buffer.from(await r.arrayBuffer());
    const webp = await sharp(bruto).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    antes += bruto.length; depois += webp.length;
    console.log(`  ${(bruto.length / 1e6).toFixed(2)} MB → ${(webp.length / 1e3).toFixed(0)} KB  ${u.slice(-50)}`);
    if (GRAVAR) mapa.set(u, await subir(`${pasta}/${randomUUID()}.webp`, webp));
  }
  console.log(`  total ${(antes / 1e6).toFixed(1)} MB → ${(depois / 1e6).toFixed(2)} MB`);
  if (GRAVAR && mapa.size) {
    const { error: e } = await db.from("tridiflow_bots").update({ pagina: trocar(bot.pagina, mapa), published: trocar(bot.published, mapa) }).eq("id", bot.id);
    if (e) throw e;
    console.log(`  gravado: ${mapa.size} URLs trocadas`);
  }
}
