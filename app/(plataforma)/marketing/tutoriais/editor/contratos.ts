// Contratos entre as peças do editor de tutoriais.
//
// A tela da central, o editor do tutorial (tela cheia), a lista de blocos e a
// prévia ao vivo são escritos em arquivos separados; o que um entrega ao outro
// mora AQUI, num lugar só. Mudar uma prop é mudar este arquivo — e o tsc aponta
// cada peça que precisa acompanhar.
import type { BlocoTutorial, CentralTutoriaisDoc, Tutorial, TutorialCategoria } from "@/lib/tridiflow-tutoriais";
import type { CentralCompleta } from "@/lib/tridiflow-tutoriais-db";
import type { Resultado } from "./useCentral";

/** Produto como o editor usa (seletor do bloco "produto" e dos materiais). */
export interface ProdutoDoEditor { id: string; titulo: string; imagemUrl: string }

/** Outro tutorial da mesma central — destino do bloco de link. */
export interface TutorialVizinho { handle: string; titulo: string; status: "rascunho" | "publicado" }

/** Pedido de "leve o foco até este bloco" (uma pendência clicada). `vez`
 *  muda a cada clique, pra o mesmo bloco poder ser pedido duas vezes. */
export interface FocoDeBloco { id: string; vez: number }

export interface BlocosProps {
  blocos: BlocoTutorial[];
  onMudar: (blocos: BlocoTutorial[]) => void;
  produtos: ProdutoDoEditor[];
  vizinhos: TutorialVizinho[];
  /** Caminho público da central ("/p/<slug>"). O link para outro tutorial
   *  guarda também `url = caminho + "/" + handle`, pro servidor antigo. */
  caminhoCentral: string;
  focar?: FocoDeBloco | null;
}

/** A central como o editor do tutorial precisa dela. */
export type CentralDoEditor = Pick<CentralCompleta, "id" | "slug" | "host" | "status"> & { doc: CentralTutoriaisDoc };

export interface EditorTutorialProps {
  /** Cópia de trabalho inicial. Tutorial novo chega com título vazio. */
  tutorial: Tutorial;
  novo: boolean;
  central: CentralDoEditor;
  produtos: ProdutoDoEditor[];
  /** Grava (e, com a central no ar, publica). `ok: false` mantém o editor aberto com o erro. */
  aoSalvar: (t: Tutorial) => Promise<Resultado>;
  aoExcluir: () => Promise<Resultado>;
  aoDuplicar: (t: Tutorial) => Promise<Resultado>;
  /** Cria a categoria ali mesmo e devolve a criada (ou null se falhou). */
  aoCriarCategoria: (nome: string) => Promise<TutorialCategoria | null>;
  aoFechar: () => void;
}

/** Protocolo do iframe da prévia ao vivo (/previa/tutoriais/<id>/ao-vivo). */
export const CANAL_PREVIA = "tutoriais:previa-ao-vivo";
export type MensagemPrevia =
  | { canal: typeof CANAL_PREVIA; tipo: "tutorial"; tutorial: Tutorial }
  /** O iframe avisa que carregou e quer o rascunho atual. */
  | { canal: typeof CANAL_PREVIA; tipo: "pronto" };
