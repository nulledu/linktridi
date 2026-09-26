"use client";

/**
 * Prefixo do módulo, deduzido do caminho.
 *
 * Normalmente `/lojas`. Em `/dev-lojas` são as MESMAS telas montadas sem login
 * — é assim que se confere o celular, já que a plataforma fica atrás de sessão
 * e credencial não se digita.
 *
 * Existe como função compartilhada, e não repetida em cada tela, porque o
 * primeiro esquecimento já aconteceu: o botão "voltar" do editor de produto
 * saiu escrito `/lojas/...` na mão e, no banco de provas, jogava a pessoa pra
 * fora do harness direto no login. Um lugar só para a regra é o que impede o
 * segundo esquecimento.
 */
export function baseDoModulo(pathname: string): string {
  return pathname.startsWith("/dev-lojas") ? "/dev-lojas" : "/lojas";
}
