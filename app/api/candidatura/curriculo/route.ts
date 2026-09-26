import { NextResponse } from "next/server";
import { b2Configurado, urlAssinadaEnvio } from "@/lib/armazenamento/privado";
import { emMB, novaChave, tetoDoEnvio, urlPrivada } from "@/lib/armazenamento/referencia";
import { inicioValido } from "@/lib/rh/curriculos/token";

export const dynamic = "force-dynamic";

// PÚBLICO (formulário de candidatura) — presign do CURRÍCULO.
// POST { inicio, nome, tamanho } → { chave, url, put }
//
// Cópia do /api/f/curriculo com a autorização trocada: lá é a sessão do
// funil; aqui é o carimbo de início do formulário (6 h). O resto é igual:
//  - PDF/DOC/DOCX ou foto (lib/rh/curriculos/arquivo.ts), teto de 10 MB (tabela `curriculos`);
//  - área privada `curriculos`: servida só a quem tem `rh:curriculos_arquivo`
//    ou `tridiflow:projetos` (LEITURA_POR_AREA);
//  - PUT direto no B2 — a Vercel não paga o upload nem esbarra nos 4,5 MB.

import { ACEITOS_TEXTO, curriculoAceito, extensaoDoArquivo, mimeDoCurriculo } from "@/lib/rh/curriculos/arquivo";

export async function POST(req: Request) {
  if (!b2Configurado()) return NextResponse.json({ erro: "storage_off" }, { status: 503 });

  const b = (await req.json().catch(() => null)) as { inicio?: unknown; nome?: unknown; tamanho?: unknown } | null;
  if (!inicioValido(b?.inicio)) return NextResponse.json({ erro: "inicio_invalido" }, { status: 403 });
  const nome = typeof b?.nome === "string" ? b.nome.slice(0, 200) : "";
  const tamanho = typeof b?.tamanho === "number" && Number.isInteger(b.tamanho) ? b.tamanho : 0;
  if (!nome) return NextResponse.json({ erro: "invalid" }, { status: 400 });

  const ext = extensaoDoArquivo(nome);
  if (!curriculoAceito(ext)) return NextResponse.json({ erro: "tipo_nao_aceito", aceitos: ACEITOS_TEXTO }, { status: 415 });
  if (tamanho <= 0) return NextResponse.json({ erro: "invalid_size" }, { status: 400 });

  const mime = mimeDoCurriculo(ext);
  const teto = tetoDoEnvio("curriculos", mime);
  if (tamanho > teto) {
    return NextResponse.json({ erro: "too_large", limite: teto, limiteTexto: emMB(teto), tamanho }, { status: 413 });
  }

  const chave = novaChave("curriculos", nome, mime);
  try {
    const put = await urlAssinadaEnvio(chave, tamanho);
    return NextResponse.json({ chave, url: urlPrivada(chave), put });
  } catch (e) {
    return NextResponse.json({ erro: String((e as Error)?.message || e) }, { status: 500 });
  }
}
