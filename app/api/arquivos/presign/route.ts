import { NextRequest, NextResponse } from "next/server";
import { getProfile, getProfileForModule } from "@/lib/require-auth";
import { AREAS_DO_NAVEGADOR, ehAreaPrivada, emMB, novaChave, tetoDoEnvio, urlPrivada } from "@/lib/armazenamento/referencia";
import { b2Configurado, urlAssinadaEnvio } from "@/lib/armazenamento/privado";

export const dynamic = "force-dynamic";

// POST /api/arquivos/presign { area, nome, mime, tamanho } → { chave, url, put }
//
// O navegador pede a permissão e sobe o arquivo DIRETO no B2 com um PUT na
// `put` (assinada, 15 min). É assim que vídeo e anexo grande passam do teto
// de 4,5 MB de corpo da Vercel — e é assim que a Vercel não paga CPU pelo
// tempo do upload. O que vai pro banco é `url` (`/api/arquivos/<chave>`).
//
// Três travas que a primeira versão não tinha:
//  - `area` só entre as do navegador (AREAS_DO_NAVEGADOR), com a chave de
//    módulo que cada uma exige — ninguém cria arquivo em `ponto/`;
//  - `tamanho` é obrigatório e vai pra assinatura: o B2 recusa corpo diferente;
//  - teto por área E por tipo (`tetoDoEnvio`), a mesma tabela que a tela mostra
//    antes de escolher o arquivo. Teto 0 = a área não aceita aquele tipo.
//
// O erro de tamanho volta com `limite` e `limiteTexto` porque a tela precisa
// dizer "vídeo aqui vai até 30 MB, o seu tem 47" — "413" sozinho não ensina
// ninguém a consertar.

export async function POST(req: NextRequest) {
  // getProfile confere `active`: quem foi desligado não sobe mais nada.
  if (!(await getProfile())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!b2Configurado()) return NextResponse.json({ error: "storage_off" }, { status: 503 });

  const b = (await req.json().catch(() => null)) as
    | { area?: unknown; nome?: unknown; mime?: unknown; tamanho?: unknown }
    | null;
  const area = b?.area;
  const nome = typeof b?.nome === "string" ? b.nome.slice(0, 200) : "";
  const mime = typeof b?.mime === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(b.mime) ? b.mime : "application/octet-stream";
  const tamanho = typeof b?.tamanho === "number" && Number.isInteger(b.tamanho) ? b.tamanho : 0;
  if (!ehAreaPrivada(area) || !(area in AREAS_DO_NAVEGADOR) || !nome) {
    return NextResponse.json({ error: "invalid_upload" }, { status: 400 });
  }
  const exige = AREAS_DO_NAVEGADOR[area];
  if (exige && !(await getProfileForModule(exige))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (tamanho <= 0) return NextResponse.json({ error: "invalid_size" }, { status: 400 });
  const teto = tetoDoEnvio(area, mime);
  if (teto <= 0) return NextResponse.json({ error: "tipo_nao_aceito", mime }, { status: 415 });
  if (tamanho > teto) {
    return NextResponse.json(
      { error: "too_large", limite: teto, limiteTexto: emMB(teto), tamanho },
      { status: 413 },
    );
  }

  const chave = novaChave(area, nome, mime);
  try {
    const put = await urlAssinadaEnvio(chave, tamanho);
    return NextResponse.json({ chave, url: urlPrivada(chave), put, mime });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
