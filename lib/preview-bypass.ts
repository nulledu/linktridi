// APP_PREVIEW_BYPASS=1 dá identidade de colaborador (previewProfile) a quem chega
// SEM sessão — é ferramenta de DESENVOLVIMENTO, pra abrir o app de atividades no
// WebView antigo do tablet, que não persiste cookie. Em produção isso seria
// acesso autenticado ao ERP inteiro sem login e, com APP_PREVIEW_USER apontando
// pra um admin, identidade admin anônima (achado A1 da auditoria). Por isso o
// flag SÓ vale fora de produção — por mais que alguém o ligue no Vercel por
// engano, em produção ele não faz nada.
//
// Fonte ÚNICA da decisão: require-auth e middleware perguntam aqui, nunca leem o
// env cru. A trava em lib/__tests__/seguranca-regressao.test.ts garante isso.
export function previewBypassAtivo(): boolean {
  return process.env.APP_PREVIEW_BYPASS === "1" && process.env.NODE_ENV !== "production";
}
