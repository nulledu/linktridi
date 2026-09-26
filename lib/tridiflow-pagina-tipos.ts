// Tipos de PÁGINA (vsl, captura, venda, obrigado, branco) — usados só pela
// listagem e pela criação de páginas. Nada aqui é lido pelo editor de fluxos.
//
// O tipo é gravado em `PaginaDoc.config.template` no momento em que a página é
// criada a partir de um template. Página feita antes disso não tem o campo e
// aparece como "Sem tipo" — é só rótulo, não muda o funcionamento dela.

export interface TipoPagina { id: string; label: string; icone: string; cor: string }

export const TIPOS_PAGINA: TipoPagina[] = [
  { id: "vsl", label: "Página com VSL", icone: "player-play", cor: "#7c3aed" },
  { id: "captura", label: "Página de captura", icone: "mail", cor: "#2563eb" },
  { id: "venda", label: "Página de vendas", icone: "shopping-cart", cor: "#16a34a" },
  { id: "obrigado", label: "Página de obrigado", icone: "circle-check", cor: "#d97706" },
  { id: "landing", label: "Landing de produto", icone: "layout-dashboard", cor: "#4f46e5" },
  { id: "branco", label: "Página em branco", icone: "file-text", cor: "#8a8a92" },
];

export const tipoPaginaPorId = (id?: string | null): TipoPagina | null =>
  (id ? TIPOS_PAGINA.find((t) => t.id === id) ?? null : null);
