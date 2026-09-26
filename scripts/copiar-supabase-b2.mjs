#!/usr/bin/env node
// Copia os arquivos do Storage do Supabase pro Backblaze B2 (decisão de
// 24/09/2026: o Supabase fica só com texto — nada de imagem, vídeo ou outro
// arquivo).
//
//   node --env-file=.env.local scripts/copiar-supabase-b2.mjs            # dry-run: conta e mede
//   node --env-file=.env.local scripts/copiar-supabase-b2.mjs --copiar   # copia (pula o que já existe)
//
// Bucket PÚBLICO do Supabase → bucket público do B2 em `<bucket>/<caminho>`.
// A URL no banco troca de prefixo pelo supabase/storage-para-b2.sql, que este
// script escreve com as URLs certas. Bucket PRIVADO → `tridi-privado` em
// `legado/<bucket>/<caminho>` (cópia de segurança; os leitores antigos ainda
// assinam no Supabase até cada módulo trocar a referência).
//
// NÃO apaga nada do Supabase. Apagar é passo seu, depois de conferir as telas.

import { createClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";
import { writeFileSync } from "node:fs";

const COPIAR = process.argv.includes("--copiar");
const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`falta ${k} no ambiente`);
  return v;
};

const SUPA = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const db = createClient(SUPA, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const endpoint = env("B2_ENDPOINT").replace(/\/+$/, "");
const region = env("B2_REGION");

const privado = { c: new AwsClient({ accessKeyId: env("B2_KEY_ID"), secretAccessKey: env("B2_APP_KEY"), service: "s3", region }), base: `${endpoint}/${env("B2_BUCKET")}` };
const temPublico = ["B2_PUBLICO_BUCKET", "B2_PUBLICO_KEY_ID", "B2_PUBLICO_APP_KEY", "B2_PUBLICO_URL"].every((k) => process.env[k]);
const publico = temPublico
  ? { c: new AwsClient({ accessKeyId: env("B2_PUBLICO_KEY_ID"), secretAccessKey: env("B2_PUBLICO_APP_KEY"), service: "s3", region }), base: `${endpoint}/${env("B2_PUBLICO_BUCKET")}` }
  : null;
if (COPIAR && !publico) throw new Error("configure B2_PUBLICO_* antes de --copiar");

async function listar(bucket, prefixo = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefixo, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`${bucket}/${prefixo}: ${error.message}`);
    for (const it of data) {
      const caminho = prefixo ? `${prefixo}/${it.name}` : it.name;
      if (it.id === null) out.push(...(await listar(bucket, caminho))); // pasta
      else out.push({ caminho, tamanho: Number(it.metadata?.size ?? 0), mime: it.metadata?.mimetype ?? "application/octet-stream" });
    }
    if (data.length < 1000) return out;
  }
}

const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

async function copiar(destino, chave, bucket, obj) {
  const url = `${destino.base}/${enc(chave)}`;
  const h = await destino.c.fetch(url, { method: "HEAD" });
  if (h.ok) return "já";
  const { data, error } = await db.storage.from(bucket).download(obj.caminho);
  if (error || !data) throw new Error(`download ${bucket}/${obj.caminho}: ${error?.message}`);
  const r = await destino.c.fetch(url, {
    method: "PUT",
    body: new Uint8Array(await data.arrayBuffer()),
    headers: { "content-type": obj.mime, "cache-control": "public, max-age=31536000" },
  });
  if (!r.ok) throw new Error(`PUT ${chave}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return "copiado";
}

const { data: buckets, error } = await db.storage.listBuckets();
if (error) throw error;

const trocas = [];
let totalN = 0, totalB = 0;
for (const b of buckets) {
  const objs = await listar(b.name);
  const bytes = objs.reduce((s, o) => s + o.tamanho, 0);
  totalN += objs.length; totalB += bytes;
  console.log(`${b.public ? "PÚBLICO" : "privado"}  ${b.name.padEnd(20)} ${String(objs.length).padStart(6)} arquivos  ${(bytes / 1e6).toFixed(1).padStart(9)} MB`);
  if (b.public && publico) {
    trocas.push([`${SUPA}/storage/v1/object/public/${b.name}/`, `${env("B2_PUBLICO_URL").replace(/\/+$/, "")}/${b.name}/`]);
  }
  if (!COPIAR) continue;
  let feitos = 0, falhas = 0;
  for (const o of objs) {
    const [destino, chave] = b.public ? [publico, `${b.name}/${o.caminho}`] : [privado, `legado/${b.name}/${o.caminho}`];
    try { await copiar(destino, chave, b.name, o); } catch (e) { falhas++; console.error("  ✗", e.message); }
    if (++feitos % 100 === 0) console.log(`  … ${feitos}/${objs.length}`);
  }
  console.log(`  ${b.name}: ${feitos - falhas} ok, ${falhas} falhas`);
}
console.log(`TOTAL ${totalN} arquivos, ${(totalB / 1e6).toFixed(1)} MB`);

if (trocas.length) {
  const linhas = trocas.map(([de, para]) => `  perform troca_prefixo_storage('${de}', '${para}');`).join("\n");
  const sql = `-- Gerado por scripts/copiar-supabase-b2.mjs: troca as URLs do Storage do
-- Supabase pelas do bucket público do B2 em TODA coluna de texto/jsonb do
-- schema public. Idempotente (o prefixo antigo some depois da 1ª execução).
-- Rode SÓ depois do --copiar terminar sem falhas.

create or replace function troca_prefixo_storage(de text, para text) returns void
language plpgsql as $$
declare c record; n bigint;
begin
  for c in
    select table_name, column_name, data_type from information_schema.columns
    where table_schema = 'public' and (data_type in ('text', 'character varying', 'jsonb', 'json') or udt_name = '_text')
      and table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')
  loop
   -- Tabela com gatilho que barra UPDATE (razão imutável do mercadinho) não
   -- derruba a troca inteira: avisa e segue.
   begin
    if c.data_type in ('jsonb', 'json') then
      execute format('update public.%I set %I = replace(%I::text, $1, $2)::%s where %I::text like $3',
        c.table_name, c.column_name, c.column_name, c.data_type, c.column_name) using de, para, '%' || de || '%';
    elsif c.data_type = 'ARRAY' then  -- só text[] chega aqui
      execute format('update public.%I set %I = (replace(%I::text, $1, $2))::text[] where %I::text like $3',
        c.table_name, c.column_name, c.column_name, c.column_name) using de, para, '%' || de || '%';
    else
      execute format('update public.%I set %I = replace(%I, $1, $2) where %I like $3',
        c.table_name, c.column_name, c.column_name, c.column_name) using de, para, '%' || de || '%';
    end if;
    get diagnostics n = row_count;
    if n > 0 then raise notice '%.%: % linhas', c.table_name, c.column_name, n; end if;
   exception when others then
    raise warning '%.% NÃO trocado: %', c.table_name, c.column_name, sqlerrm;
   end;
  end loop;
end $$;

do $$ begin
${linhas}
end $$;

drop function troca_prefixo_storage(text, text);
`;
  writeFileSync("supabase/storage-para-b2.sql", sql);
  console.log("escrito supabase/storage-para-b2.sql");
}
