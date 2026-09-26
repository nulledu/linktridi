// Miniatura da página para a LISTAGEM — sem screenshot.
//
// Tirar print de verdade exigiria um navegador headless, um lugar pra guardar a
// imagem e alguém pra invalidar o cache a cada edição. O que a pessoa precisa na
// listagem é bem menos que isso: reconhecer a página de relance ("a que começa
// com vídeo e tem o formulário no fim"). Para isso basta a SILHUETA — que ordem
// de blocos a página tem e em que cor ela é.
//
// Então o servidor manda um esqueleto minúsculo (uma letra por bloco) e a
// listagem desenha barras. Custo: ~40 bytes por página, zero infraestrutura,
// sempre em dia com o rascunho (não existe cache pra ficar velho).
import type { Bloco, PaginaDoc, Secao } from "@/lib/tridiflow-pagina";
import { TEMA_PADRAO } from "@/lib/tridiflow-pagina-tema";

/** Como cada bloco aparece na silhueta. */
export type Traco =
  | "titulo"     // barra grossa e curta
  | "texto"      // duas/três linhas finas
  | "midia"      // retângulo grande (imagem/vídeo)
  | "acao"       // pílula colorida (botão/whatsapp/oferta)
  | "campos"     // caixas empilhadas (formulário)
  | "lista"      // linhas com marcador (benefícios/faq/depoimentos)
  | "faixa"      // barra fina de destaque (aviso/contador)
  | "espaco";    // respiro (espaçador/divisor)

const TRACO: Record<Bloco["tipo"], Traco> = {
  titulo: "titulo",
  texto: "texto",
  imagem: "midia", video: "midia",
  botao: "acao", whatsapp: "acao", oferta: "acao",
  formulario: "campos",
  beneficios: "lista", faq: "lista", depoimentos: "lista",
  recursos: "lista", passos: "lista", comparacao: "lista",
  logos: "faixa", metricas: "faixa", garantia: "faixa", cabecalho: "faixa", rodape: "faixa", bento: "midia", carrossel: "faixa",
  galeria: "midia",
  planos: "campos",
  aviso: "faixa", contador: "faixa",
  espacador: "espaco", divisor: "espaco",
  // Container e colunas não desenham nada: quem desenha são os filhos.
  container: "espaco", colunas: "espaco",
};

/** Quantos traços a miniatura carrega. Além disso vira ruído — e byte à toa. */
const MAX_TRACOS = 12;

export interface Miniatura {
  /** Silhueta, de cima pra baixo. */
  tracos: Traco[];
  corFundo: string;
  corPrimaria: string;
  /** Total de blocos visíveis (pode ser maior que `tracos`, que é limitado). */
  blocos: number;
}

/** Blocos visíveis, na ordem em que aparecem, entrando em container/colunas. */
function achatar(blocos: Bloco[], destino: Bloco[]): void {
  for (const b of blocos) {
    if (b.oculto) continue;                       // não vai pro ar → não conta
    if (b.tipo === "container") { achatar(b.blocos ?? [], destino); continue; }
    if (b.tipo === "colunas") { for (const c of b.colunas ?? []) achatar(c.blocos, destino); continue; }
    destino.push(b);
  }
}

export function miniaturaDaPagina(doc: PaginaDoc): Miniatura {
  const visiveis: Bloco[] = [];
  for (const s of (doc.secoes ?? []) as Secao[]) {
    if (s.oculto) continue;
    achatar(s.blocos ?? [], visiveis);
  }
  return {
    tracos: visiveis.slice(0, MAX_TRACOS).map((b) => TRACO[b.tipo] ?? "espaco"),
    corFundo: doc.config?.corFundo || TEMA_PADRAO.corFundo,
    corPrimaria: doc.config?.corPrimaria || TEMA_PADRAO.corPrimaria,
    blocos: visiveis.length,
  };
}
