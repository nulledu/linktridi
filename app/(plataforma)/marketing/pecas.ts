"use client";

// ── Envio de uma PEÇA de criativo (navegador) ────────────────────────────────
// O caminho inteiro, num lugar só: mede → valida → sobe direto no B2 → registra
// na biblioteca. Quem chama (biblioteca do detalhe, modal de criar/editar,
// visor da lista) só passa o arquivo e ouve o progresso.
//
// Lança `Error` com a frase pronta pra tela — limite, tamanho real e como
// resolver — porque cada chamador mostrar a sua versão foi o que deixou o
// Financeiro com três textos diferentes pro mesmo "arquivo grande".
import { enviarArquivoPrivado } from "../ui/enviarArquivo";
import { formatoDe, medirCriativo, validarCriativo, type ArquivoCriativo } from "@/lib/criativos/regras";

export const ROTA_PECAS = "/api/marketing/criativos/arquivos";

export async function enviarPeca(
  file: File,
  criativoId: string,
  aoProgredir?: (pct: number) => void,
): Promise<ArquivoCriativo> {
  // Mede ANTES de subir: a dimensão vira o rótulo de formato e a duração é o
  // que barra um vídeo longo sem gastar a banda de subir 30 MB primeiro.
  const medida = await medirCriativo(file);
  const problema = await validarCriativo(file, medida);
  if (problema) throw new Error(problema.texto);

  const enviado = await enviarArquivoPrivado(file, "criativos", aoProgredir);

  const r = await fetch(ROTA_PECAS, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      criativoId,
      url: enviado.url,
      nome: enviado.nome,
      mime: enviado.mime,
      tamanho: enviado.tamanho,
      largura: medida.largura,
      altura: medida.altura,
      duracao: medida.duracao,
      formato: formatoDe(medida.largura, medida.altura),
    }),
  }).then((x) => x.json()).catch(() => null);

  if (!r?.ok) throw new Error(r?.error || "Não foi possível registrar o arquivo.");
  return r.arquivo as ArquivoCriativo;
}

/** Os arquivos de um criativo — a lista da biblioteca. */
export async function pecasDe(criativoId: string): Promise<ArquivoCriativo[]> {
  const r = await fetch(`${ROTA_PECAS}?criativo=${encodeURIComponent(criativoId)}`)
    .then((x) => x.json()).catch(() => null);
  return r?.ok ? (r.arquivos as ArquivoCriativo[]) : [];
}
