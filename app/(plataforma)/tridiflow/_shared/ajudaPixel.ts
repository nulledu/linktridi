// Passo a passo de onde pegar cada ID de pixel, dentro da própria plataforma.
//
// Mora aqui, e não dentro do EditorClient, porque o editor do LinkTridi usa o
// mesmo texto: importar do EditorClient puxaria o canvas do React Flow inteiro
// pro bundle de uma tela que é só formulário.
export interface AjudaPixel { titulo: string; passos: string[]; link: string }

export const AJUDA_PIXEL: Record<string, AjudaPixel> = {
  metaPixelId: { titulo: "Meta Pixel", passos: ["Acesse o Gerenciador de Eventos da Meta.", "Menu à esquerda → Origens de dados → selecione seu conjunto (pixel).", "Em Configurações, o ID do Pixel é o número no topo (15–16 dígitos).", "Copie e cole aqui."], link: "https://business.facebook.com/events_manager2/list/dataset" },
  ga4Id: { titulo: "ID do GA4", passos: ["Abra o Google Analytics (propriedade GA4).", "Admin (engrenagem) → Fluxos de dados → seu fluxo da Web.", "Copie o ID de mensuração (começa com G-).", "Cole aqui."], link: "https://analytics.google.com/" },
  tiktokId: { titulo: "TikTok Pixel", passos: ["Abra o TikTok Ads Manager.", "Ferramentas → Eventos → Web Events → Gerenciar.", "Selecione o pixel; o ID fica abaixo do nome (ex.: C0XXXXXXXX).", "Cole aqui."], link: "https://ads.tiktok.com/i18n/events_manager" },
  pinterestId: { titulo: "Pinterest Tag", passos: ["Abra o Pinterest Ads.", "Anúncios → Conversões → Tag do Pinterest.", "Copie o ID da tag (ex.: 26XXXXXXXXX).", "Cole aqui."], link: "https://ads.pinterest.com/" },
};

export const AJUDA_CAPI: AjudaPixel = { titulo: "token da CAPI", passos: ["No Gerenciador de Eventos → seu Pixel → Configurações.", "Vá na seção Conversions API → Gerar token de acesso.", "O Dataset ID é o mesmo número do Pixel ID.", "Cole o Dataset ID e o token (o token fica só no servidor)."], link: "https://business.facebook.com/events_manager2/list/dataset" };
