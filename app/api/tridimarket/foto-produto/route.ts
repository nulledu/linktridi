import { NextRequest, NextResponse } from "next/server";
import { buscarPorCodigo, buscarPorNome, guardarImagem } from "@/lib/foto-aberta";
import { requireMarketAdmin } from "../_shared";

export const dynamic = "force-dynamic";

// Foto de produto pelo código de barras ou pelo nome, vinda do Open Food Facts.
// O COMO mora em lib/foto-aberta.ts (a mesma busca é usada pela faxina de fotos
// em /fotos-mercadinho, que tem gate próprio); aqui fica só o gate do
// mercadinho e a forma da resposta que o cadastro já espera.

export async function GET(req: NextRequest) {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const params = new URL(req.url).searchParams;

  // ?nome= — busca por NOME e devolve OPÇÕES. Serve pro produto que está na
  // mão sem código legível (embalagem amassada, rótulo rasgado) e pra quem
  // prefere digitar "coca lata" a bipar. Escolher uma opção preenche o código
  // de barras e a foto de uma vez.
  const nomeBuscado = (params.get("nome") ?? "").trim();
  if (nomeBuscado) {
    if (nomeBuscado.length < 3) return NextResponse.json({ ok: true, data: [] });
    return NextResponse.json({ ok: true, data: await buscarPorNome(nomeBuscado) });
  }

  // ?copiar=<url> — traz uma imagem de fora pro nosso bucket. Existe porque
  // escolher a foto de uma sugestão não pode depender do código de barras
  // dela estar certo: o que a pessoa viu e aprovou foi a IMAGEM.
  const copiar = (params.get("copiar") ?? "").trim();
  if (copiar) {
    if (!/^https:\/\/[^\s]+$/i.test(copiar)) return NextResponse.json({ ok: false, error: "url_invalida" }, { status: 422 });
    return NextResponse.json({ ok: true, data: { imagemUrl: await guardarImagem(copiar, `avulsa-${Date.now()}`) } });
  }

  const codigo = (params.get("codigo") ?? "").replace(/\D/g, "");
  if (codigo.length < 8) return NextResponse.json({ ok: false, error: "codigo_invalido" }, { status: 422 });
  return NextResponse.json({ ok: true, data: await buscarPorCodigo(codigo) });
}
