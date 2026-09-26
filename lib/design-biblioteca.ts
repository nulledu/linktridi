// Design › Biblioteca: o vocabulário das duas origens (ERP e materiais do setor).
// Puro, importável pela rota e pela tela.

export type CategoriaMaterial = "arte" | "logo" | "mockup" | "final" | "editavel" | "referencia" | "template" | "fonte" | "elemento";

export const CATEGORIAS_MATERIAL: { chave: CategoriaMaterial; nome: string; icone: string }[] = [
  { chave: "arte", nome: "Artes", icone: "palette" },
  { chave: "logo", nome: "Logos", icone: "star" },
  { chave: "mockup", nome: "Mockups", icone: "photo" },
  { chave: "final", nome: "Arquivos finais", icone: "circle-check" },
  { chave: "editavel", nome: "Editáveis", icone: "vector-bezier" },
  { chave: "referencia", nome: "Referências", icone: "eye" },
  { chave: "template", nome: "Templates", icone: "template" },
  { chave: "fonte", nome: "Fontes", icone: "typography" },
  { chave: "elemento", nome: "Elementos gráficos", icone: "box" },
];

/** Arquivos que nascem do PEDIDO no ERP. */
export const TIPOS_DO_PROJETO: { chave: "arte" | "vetorizada" | "reprovada" | "logo"; nome: string; icone: string; tom: "info" | "ok" | "perigo" | "destaque" }[] = [
  { chave: "vetorizada", nome: "Artes finais (vetorizadas)", icone: "vector-bezier", tom: "ok" },
  { chave: "arte", nome: "Arte do cliente", icone: "photo", tom: "info" },
  { chave: "logo", nome: "Logos", icone: "star", tom: "destaque" },
  { chave: "reprovada", nome: "Versões reprovadas", icone: "circle-x", tom: "perigo" },
];

const IMAGEM = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i;

/** Dá pra mostrar miniatura? (PDF, AI, PSD, fonte: ícone no lugar). */
export function ehImagem(url: string, mime?: string | null): boolean {
  if (mime) return mime.startsWith("image/") && !mime.includes("svg");
  return IMAGEM.test(url);
}

export function extensao(url: string): string {
  const m = /\.([a-z0-9]{2,5})(\?|$)/i.exec(url);
  return m ? m[1].toUpperCase() : "ARQ";
}
