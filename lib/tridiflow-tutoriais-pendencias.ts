// Pendências do tutorial — o que falta pro guia ficar bom, dito ANTES de ir
// pro ar e com o caminho até o campo (`alvo`: "titulo", "capa", "bloco:<id>"…).
//
// Só título e endereço repetido BLOQUEIAM: são os dois que o servidor recusa.
// O resto é aviso — um guia sem capa ainda resolve mais que guia nenhum, e
// travar a publicação por foto transformaria a lista em obstáculo.
//
// Puro: roda no editor a cada tecla e no teste.
import { embedDoTutorialVideo, urlPublicaSegura, type Tutorial } from "@/lib/tridiflow-tutoriais";

export type NivelPendencia = "bloqueia" | "aviso";
export interface Pendencia { chave: string; nivel: NivelPendencia; texto: string; alvo: string }

/** Cartão da central tem espaço pra umas duas linhas de descrição. */
export const DESCRICAO_MAXIMA = 160;

/** Texto rico sem nada legível dentro (`<p></p>`, só espaço). */
const semTexto = (html: string) => !html || !html.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;|\s/g, "");

export function pendenciasDoTutorial(t: Tutorial, ctx: { handlesOutros: string[]; temCategorias: boolean }): Pendencia[] {
  const bloqueios: Pendencia[] = [];
  const avisos: Pendencia[] = [];
  const bloqueia = (chave: string, texto: string, alvo: string) => bloqueios.push({ chave, nivel: "bloqueia", texto, alvo });
  const avisa = (chave: string, texto: string, alvo: string) => avisos.push({ chave, nivel: "aviso", texto, alvo });

  if (!t.titulo.trim()) bloqueia("sem-titulo", "Falta o título.", "titulo");
  if (t.handle && ctx.handlesOutros.includes(t.handle)) bloqueia("endereco-repetido", `O endereço “${t.handle}” já é de outro tutorial.`, "endereco");

  if (!t.capaUrl) avisa("sem-capa", "Sem capa: o cartão na central fica sem foto.", "capa");
  if (!t.descricao.trim()) avisa("sem-descricao", "Sem descrição: uma frase curta ajuda a pessoa a escolher o guia.", "descricao");
  else if (t.descricao.length > DESCRICAO_MAXIMA) avisa("descricao-longa", `Descrição longa: no cartão cabem umas duas linhas (até ${DESCRICAO_MAXIMA} letras).`, "descricao");
  if (ctx.temCategorias && !t.categoriaId) avisa("sem-categoria", "Sem categoria: o guia aparece só em “Todos” e “Outros”.", "categoria");
  if (!t.blocos.length) avisa("sem-conteudo", "Sem conteúdo ainda: acrescente passos, texto ou vídeo.", "conteudo");

  let passo = 0;
  for (const b of t.blocos) {
    const alvo = `bloco:${b.id}`;
    switch (b.tipo) {
      case "passo":
        passo += 1;
        if (!b.titulo.trim()) avisa("passo-sem-titulo", `Passo ${passo} sem título.`, alvo);
        if (semTexto(b.conteudo) && !b.imagemUrl && !b.videoUrl) avisa("passo-vazio", `Passo ${passo} está vazio.`, alvo);
        if (b.imagemUrl && !b.imagemAlt.trim()) avisa("foto-sem-descricao", `Passo ${passo}: a foto está sem descrição — quem usa leitor de tela não sabe o que ela mostra.`, alvo);
        break;
      case "texto":
        if (semTexto(b.conteudo)) avisa("texto-vazio", "Bloco de texto vazio.", alvo);
        break;
      case "imagem":
        if (!b.url) avisa("imagem-sem-foto", "Bloco de imagem sem foto.", alvo);
        else if (!b.alt.trim()) avisa("foto-sem-descricao", "Imagem sem descrição — quem usa leitor de tela não sabe o que ela mostra.", alvo);
        break;
      case "video":
        if (!b.url || !embedDoTutorialVideo(b.url)) avisa("video-sem-link", "Vídeo sem um link que abra.", alvo);
        break;
      case "link":
        if (b.tutorial) {
          if (!ctx.handlesOutros.includes(b.tutorial)) avisa("link-tutorial-inexistente", "O link aponta pra um tutorial que não existe mais.", alvo);
        } else if (!urlPublicaSegura(b.url)) avisa("link-sem-destino", "Link sem um destino que abra.", alvo);
        break;
      case "produto":
        if (!b.produtoId) avisa("produto-sem-produto", "Escolha o produto do bloco.", alvo);
        break;
      case "aviso":
        if (semTexto(b.conteudo)) avisa("aviso-vazio", "Aviso vazio.", alvo);
        break;
      case "problemas":
        if (!b.itens.length) avisa("problemas-vazio", "“Deu errado?” sem nenhum problema.", alvo);
        for (const p of b.itens) if (p.sintoma.trim() && semTexto(p.solucao)) avisa("problema-sem-solucao", `“${p.sintoma}” está sem solução.`, alvo);
        break;
    }
  }
  return [...bloqueios, ...avisos];
}
