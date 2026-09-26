import { NextRequest, NextResponse } from "next/server";
import { adotarSessao } from "@/lib/tridiflow-db";
import { b2Configurado, urlAssinadaEnvio } from "@/lib/armazenamento/privado";
import { emMB, novaChave, tetoDoEnvio, urlPrivada } from "@/lib/armazenamento/referencia";
import { modoRemoto, encaminharPara } from "@/lib/player-remoto";

export const dynamic = "force-dynamic";

// PÚBLICO (player do anúncio) — presign do CURRÍCULO do candidato.
// POST { sessaoId, nome, tamanho } → { url, put, chave }
//
// O player é anônimo, então a rota autenticada de presign (/api/arquivos/presign)
// não serve: candidato não tem sessão de usuário. A "autorização" aqui é ser um
// visitante REAL do funil — `sessaoId` tem que existir e ser recente (adotarSessao,
// leitura pura, janela de 6 h). O que protege o resto:
//  - só PDF/DOC/DOCX (extensão), nada de imagem/vídeo/script;
//  - teto de 10 MB (a mesma tabela `curriculos` de tetoDoEnvio);
//  - área privada `curriculos`: o arquivo NÃO é listável e só é servido pela
//    rota autenticada a quem tem `tridiflow:projetos` (LEITURA_POR_AREA).
// O navegador sobe o arquivo DIRETO no B2 (PUT na `put`, 15 min) — a Vercel não
// paga CPU pelo upload nem esbarra no teto de 4,5 MB de corpo.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_OK = new Set(["pdf", "doc", "docx"]);

export async function POST(req: NextRequest) {
  if (modoRemoto()) return encaminharPara(req, "/api/f/curriculo");
  if (!b2Configurado()) return NextResponse.json({ error: "storage_off" }, { status: 503 });

  const b = (await req.json().catch(() => null)) as { sessaoId?: unknown; nome?: unknown; tamanho?: unknown } | null;
  const sessaoId = typeof b?.sessaoId === "string" ? b.sessaoId : "";
  const nome = typeof b?.nome === "string" ? b.nome.slice(0, 200) : "";
  const tamanho = typeof b?.tamanho === "number" && Number.isInteger(b.tamanho) ? b.tamanho : 0;

  if (!UUID.test(sessaoId) || !nome) return NextResponse.json({ error: "invalid" }, { status: 400 });
  // Amarra o upload a um visitante real e recente do funil.
  if (!(await adotarSessao(sessaoId))) return NextResponse.json({ error: "sessao_invalida" }, { status: 403 });

  const ext = nome.includes(".") ? nome.split(".").pop()!.toLowerCase() : "";
  if (!EXT_OK.has(ext)) return NextResponse.json({ error: "tipo_nao_aceito", aceitos: "PDF, DOC ou DOCX" }, { status: 415 });
  if (tamanho <= 0) return NextResponse.json({ error: "invalid_size" }, { status: 400 });

  // mime pela extensão (o cliente pode mentir no content-type; o teto é por família).
  const mime = ext === "pdf" ? "application/pdf" : "application/octet-stream";
  const teto = tetoDoEnvio("curriculos", mime);
  if (tamanho > teto) {
    return NextResponse.json({ error: "too_large", limite: teto, limiteTexto: emMB(teto), tamanho }, { status: 413 });
  }

  const chave = novaChave("curriculos", nome, mime);
  try {
    const put = await urlAssinadaEnvio(chave, tamanho);
    return NextResponse.json({ chave, url: urlPrivada(chave), put });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
