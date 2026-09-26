// Contrato compartilhado do renderizador de páginas.
//
// O MESMO renderizador serve o preview do editor e a página publicada — é o que
// garante que "o que você vê é o que vai pro ar". A diferença mora aqui:
// `modo: "preview"` desliga eventos reais, links e autoplay, e liga seleção.

import type { EstadoRuntime } from "@/lib/tridiflow-pagina-runtime";
import type { PaginaConfig } from "@/lib/tridiflow-pagina";
import type { Vars } from "@/lib/tridiflow";
import type { Variante } from "@/lib/tridiflow-ab";
import type { ProgressoVideo } from "./VideoBloco";

export type ModoRender = "preview" | "publicado";
export type Viewport = "desktop" | "mobile";

export interface CtxPagina {
  modo: ModoRender;
  /** Largura simulada no preview; no publicado é a real (media query). */
  viewport: Viewport;
  /** Valores de `{{variavel}}` nos textos: o que veio na URL (?nome=) e o que a
   *  pessoa já respondeu antes. Só o modo `publicado` interpola — no editor o
   *  autor precisa continuar enxergando `{{nome}}` pra conseguir editá-lo. */
  vars: Vars;
  /** Versão do teste A/B sendo desenhada. No ar vem do cookie decidido no
   *  servidor; no editor, do alternador da barra. Bloco marcado com a OUTRA
   *  versão não renderiza — nem no preview, senão o editor mentiria sobre o
   *  que o visitante vê. */
  variante: Variante;
  estado: EstadoRuntime;
  /** Ids de blocos já liberados nesta visita (nunca voltam a sumir). */
  liberados: Set<string>;
  config: PaginaConfig;
  onEvento: (evento: string, meta?: Record<string, unknown>) => void;
  onVideo: (p: ProgressoVideo) => void;
  /** Só no preview: seleção de bloco no canvas. */
  selecionado?: string | null;
  onSelecionar?: (id: string | null) => void;
  /** Só no preview: edição de texto direto na página (clique duplo no bloco). */
  onEditarTexto?: (blocoId: string, texto: string) => void;
  /** Só no preview: mostra blocos ainda não liberados com marca d'água,
   *  para o gestor conseguir editar a oferta sem esperar 8 minutos. */
  revelarTudo?: boolean;
  /** Só no EDITOR: ações que aparecem ao passar o mouse no bloco (subir, descer,
   *  duplicar, ocultar, excluir). A página publicada não passa isto, então nada
   *  disso existe no ar — nem o HTML, nem os listeners. */
  onAcaoBloco?: (blocoId: string, acao: AcaoBloco) => void;
  /** Só no EDITOR: soltar um bloco em outra posição da MESMA página. `indice` é
   *  a posição final dentro da seção (mesmo contrato de moverBlocoPara). Como
   *  `onAcaoBloco`, a página publicada não passa isto — lá nada é arrastável. */
  onMoverBloco?: (blocoId: string, secaoId: string, indice: number) => void;
}

/** Tipo do dado que viaja no arraste. Estreito de propósito: assim um arraste
 *  vindo de fora (um arquivo, um link) nunca é confundido com um bloco. */
export const MIME_BLOCO = "application/x-tridiflow-bloco";

export type AcaoBloco = "subir" | "descer" | "duplicar" | "ocultar" | "excluir";
