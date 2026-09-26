// Contrato de escrita do produto — o que a API aceita no corpo.
//
// Fica num arquivo próprio porque DUAS rotas o usam (criar e editar) e porque
// a validação de regra é a MESMA da tela: `validarProduto` de lib/lojas.ts.
// Repetir a regra no servidor com outras palavras é como um limite acaba
// valendo 5 num lado e 10 no outro.
//
// O servidor não confia na tela — nem pode: a API é uma porta pública pra quem
// tem sessão. Mas ele confia na mesma FUNÇÃO que a tela usa.

import { z } from "zod";
import { fotoDoNossoBucket } from "@/lib/foto-aberta";
import { validarProduto } from "@/lib/lojas";
import type { EntradaProduto } from "@/lib/lojas-db";

const Imagem = z.object({
  id: z.string().min(1).max(200),
  url: z.string().min(1).max(2000),
  alt: z.string().max(300).default(""),
});

export const ProdutoBody = z.object({
  titulo: z.string().trim().min(1).max(200),
  descricao: z.string().max(20_000).default(""),
  imagens: z.array(Imagem).max(20).default([]),
  preco: z.number().finite(),
  precoPromocional: z.number().finite().nullable().default(null),
  custo: z.number().finite().nullable().default(null),
  estoque: z.number().int().finite(),
  venderSemEstoque: z.boolean().default(false),
  sku: z.string().trim().max(80).default(""),
  codigoBarras: z.string().trim().max(80).default(""),
  categorias: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  status: z.enum(["ativo", "rascunho", "inativo"]),
});

export type ProdutoBodyTipo = z.infer<typeof ProdutoBody>;

/**
 * Lê o corpo e aplica as regras de negócio. Devolve a entrada pronta pro banco
 * ou a primeira mensagem de erro — a mesma frase que a tela mostraria.
 */
export function lerProduto(bruto: unknown): { ok: true; dados: EntradaProduto } | { ok: false; erro: string } {
  const p = ProdutoBody.safeParse(bruto);
  if (!p.success) return { ok: false, erro: p.error.issues[0]?.message ?? "dados_invalidos" };

  const erros = validarProduto({
    titulo: p.data.titulo,
    preco: p.data.preco,
    precoPromocional: p.data.precoPromocional,
    custo: p.data.custo,
    estoque: p.data.estoque,
  });
  const primeiro = Object.values(erros).find(Boolean);
  if (primeiro) return { ok: false, erro: primeiro };

  // A foto do produto tem que ser NOSSA.
  //
  // O corpo é JSON: nada impede alguém com sessão de mandar
  // `imagens: [{ url: "https://site-de-fora/foto.jpg" }]`. Guardar isso é
  // apontar a vitrine pra um endereço que pode mudar de conteúdo DEPOIS de
  // alguém aprovar a imagem — ou simplesmente sumir e deixar o catálogo cheio
  // de imagem quebrada. O único caminho que a tela oferece (enviar do
  // aparelho) termina no nosso Storage, então exigir o prefixo não tira nada
  // de quem usa a tela direito. Mesma trava da faxina de fotos.
  for (const img of p.data.imagens) {
    if (!fotoDoNossoBucket(img.url).ok) {
      return { ok: false, erro: "Foto de fora do sistema. Envie a imagem pelo botão de fotos." };
    }
  }

  return { ok: true, dados: p.data };
}
