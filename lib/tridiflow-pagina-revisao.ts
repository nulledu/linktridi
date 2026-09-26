// Revisão da PÁGINA antes de publicar.
//
// Procura o que só aparece depois de publicado e estraga a campanha: botão que
// não leva a lugar nenhum, formulário sem destino, vídeo que não vai carregar.
// Não é lint de estilo — cada item aqui é algo que o visitante percebe.
//
// Nada disso bloqueia sozinho: quem decide é a tela de publicação. "erro" pede
// correção; "aviso" é a página funcionando, mas provavelmente não do jeito que
// a pessoa quis.

import { ROTULO_BLOCO, todosBlocos, type Bloco, type PaginaDoc } from "./tridiflow-pagina";
import { embedDoVideo, urlSegura } from "./tridiflow-pagina-estilo";

export type Gravidade = "erro" | "aviso";

/** De onde vem o problema — muda o TOM da mensagem na hora de publicar.
 *  destino   = falta um endereço/número que só quem monta a página sabe
 *              (link do botão, checkout, vídeo, WhatsApp). Todo template
 *              nasce assim; não é defeito, é campo a preencher.
 *  conteudo  = algo incoerente ou quebrado (formulário sem campo, link
 *              inválido, ação sem alvo). Isso é conserto, não preenchimento. */
export type Categoria = "destino" | "conteudo";

export interface Problema {
  /** Bloco que precisa de conserto — a tela seleciona ele ao clicar. */
  blocoId: string;
  bloco: string;          // rótulo legível ("Botão", "Card de oferta")
  gravidade: Gravidade;
  categoria: Categoria;
  /** O que está errado, em uma frase, sem jargão. */
  texto: string;
  /** O que fazer — some quando não há ação óbvia. */
  comoResolver?: string;
}

const vazio = (s: string | undefined | null) => !(s ?? "").trim();

/** Link que o navegador aceita e não é `javascript:` nem coisa pior. */
function linkRuim(url: string | undefined): boolean {
  const v = (url ?? "").trim();
  if (!v) return false;             // vazio é tratado à parte (tem mensagem própria)
  return !urlSegura(v);
}

function revisarBloco(b: Bloco): Problema[] {
  const p: Problema[] = [];
  const nome = ROTULO_BLOCO[b.tipo] ?? b.tipo;
  const add = (gravidade: Gravidade, categoria: Categoria, texto: string, comoResolver?: string) =>
    p.push({ blocoId: b.id, bloco: nome, gravidade, categoria, texto, comoResolver });

  // Bloco oculto não vai pro ar — não faz sentido cobrar link dele.
  if (b.oculto) return p;

  if (b.tipo === "botao") {
    if (vazio(b.url)) add("erro", "destino", "O botão não leva a lugar nenhum.", "Coloque o link do checkout, da página ou a âncora de uma seção.");
    else if (linkRuim(b.url)) add("erro", "conteudo", "O link do botão não é um endereço válido.", "Use um endereço começando com https://");
  }

  if (b.tipo === "whatsapp") {
    const digitos = (b.telefone ?? "").replace(/\D/g, "");
    if (!digitos) add("erro", "destino", "O botão de WhatsApp está sem número.", "Informe o número com DDI e DDD (ex.: 5511999999999).");
    else if (digitos.length < 10 || digitos.length > 15) {
      add("aviso", "conteudo", "O número do WhatsApp parece incompleto.", "Confira se tem DDI e DDD (ex.: 5511999999999).");
    }
  }

  if (b.tipo === "video") {
    const embed = embedDoVideo(b.video);
    if (embed.tipo === "vazio") {
      const temAlgo = !vazio(b.video?.url) || !vazio(b.video?.iframe);
      if (temAlgo) add("erro", "conteudo", "Não reconhecemos esse endereço de vídeo.", "Use um link do YouTube, Vimeo, Panda Video ou um código iframe.");
      else add("erro", "destino", "O bloco de vídeo está vazio.", "Cole o link do vídeo ou o código iframe.");
    }
  }

  if (b.tipo === "oferta") {
    const o = b.oferta;
    if (vazio(o?.checkoutUrl)) add("erro", "destino", "O card de oferta está sem link de compra.", "Coloque o endereço do checkout no botão da oferta.");
    else if (linkRuim(o?.checkoutUrl)) add("erro", "conteudo", "O link de compra da oferta não é válido.", "Use um endereço começando com https://");
    if (vazio(o?.preco)) add("aviso", "conteudo", "A oferta está sem preço.", "Preencha o preço atual — é o que a pessoa procura no card.");
  }

  if (b.tipo === "imagem" && vazio(b.url)) {
    add("aviso", "destino", "A imagem está sem arquivo.", "Escolha uma imagem ou remova o bloco.");
  }

  if (b.tipo === "formulario") {
    const envio = b.envio;
    if (!b.campos?.length) add("erro", "conteudo", "O formulário não tem nenhum campo.", "Adicione ao menos um campo (nome, e-mail ou telefone).");
    const acao = envio?.acao ?? "mensagem";
    if (acao === "redirect" && vazio(envio?.url)) {
      add("erro", "destino", "O formulário envia para outra página, mas o endereço está vazio.", "Informe a página de obrigado — ou troque para mostrar uma mensagem.");
    }
    if (acao === "redirect" && !vazio(envio?.url) && linkRuim(envio?.url)) {
      add("erro", "conteudo", "O endereço de destino do formulário não é válido.", "Use um endereço começando com https://");
    }
    if (acao === "whatsapp" && vazio(envio?.telefone)) {
      add("erro", "destino", "O formulário abre o WhatsApp, mas não há número.", "Informe o número com DDI e DDD.");
    }
    if (acao === "fluxo" && vazio(envio?.fluxoSlug)) {
      add("erro", "destino", "O formulário manda pra um fluxo, mas nenhum foi escolhido.", "Escolha o fluxo de destino — ou troque a ação.");
    }
    if (acao === "mensagem" && vazio(envio?.mensagem)) {
      add("aviso", "conteudo", "Sem texto de sucesso, quem enviar não vê confirmação nenhuma.", "Escreva uma mensagem curta de agradecimento.");
    }
  }

  return p;
}

/** Tudo que vale conferir antes de publicar, na ordem em que aparece na página. */
export function revisarPagina(doc: PaginaDoc): Problema[] {
  const problemas: Problema[] = [];
  const blocos = todosBlocos(doc);
  for (const b of blocos) problemas.push(...revisarBloco(b));

  // Teste A/B ligado sem nenhum bloco marcado: as duas versões são idênticas.
  // O teste roda, divide o tráfego, enche o placar — e não pode ensinar nada,
  // porque não há nada diferente entre os braços. Erro que só aparece semanas
  // depois, quando alguém vai ler o resultado.
  if (doc.config.teste?.ativo && !blocos.some((b) => b.teste === "a" || b.teste === "b")) {
    problemas.push({
      blocoId: "",
      bloco: "Teste A/B",
      gravidade: "aviso",
      categoria: "conteudo",
      texto: "O teste A/B está ligado, mas nenhum bloco foi marcado como “só A” ou “só B”.",
      comoResolver: "Duplique o bloco que você quer testar, mude o texto de um deles e marque um como A e o outro como B.",
    });
  }

  // O caminho inverso: teste DESLIGADO com blocos marcados "só B". A variante
  // efetiva vira "a" e esses blocos param de aparecer — comportamento certo (B
  // é a variação, não a página), mas silencioso. Quem desligou o teste semanas
  // atrás e voltou pra editar não faz ideia de que há conteúdo escondido ali.
  if (!doc.config.teste?.ativo) {
    const escondidos = blocos.filter((b) => b.teste === "b").length;
    if (escondidos) {
      problemas.push({
        blocoId: "",
        bloco: "Teste A/B",
        gravidade: "aviso",
        categoria: "conteudo",
        texto: `Com o teste desligado, ${escondidos} bloco(s) marcado(s) como “só B” não vão aparecer pra ninguém.`,
        comoResolver: "Ligue o teste de novo, ou marque esses blocos como “nas duas” se você quer que eles fiquem na página.",
      });
    }
  }
  return problemas;
}

/** Só os que impedem publicar. */
export const erros = (p: Problema[]) => p.filter((x) => x.gravidade === "erro");
export const avisos = (p: Problema[]) => p.filter((x) => x.gravidade === "aviso");

/** Página sem nenhum bloco não deveria ir pro ar. */
export function paginaVazia(doc: PaginaDoc): boolean {
  return todosBlocos(doc).length === 0;
}
