import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A área de tutoriais já teve `<select>` nativo no meio do formulário: o menu
// do SISTEMA, cinza, em inglês ("Choose File"), sem busca numa lista de 60
// produtos e sem a folha presa embaixo no celular. Trocar por GlassSelect e
// CampoArquivo conserta a tela de hoje; este teste é o que impede a próxima
// linha nova de trazer o controle cru de volta.
const RAIZ = join(process.cwd(), "app/(plataforma)/marketing/tutoriais");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return nome === "__tests__" ? [] : arquivos(caminho);
    return caminho.endsWith(".tsx") ? [caminho] : [];
  });
}

describe("controles da área de tutoriais", () => {
  const fontes = arquivos(RAIZ).map((caminho) => [caminho.replace(process.cwd() + "/", ""), readFileSync(caminho, "utf8")] as const);

  it("não usa <select> nativo — o do kit é o GlassSelect", () => {
    const culpados = fontes.filter(([, texto]) => texto.includes("<select")).map(([nome]) => nome);
    expect(culpados).toEqual([]);
  });

  // O CampoMidia é o sucessor do CampoArquivo (foto, vídeo e link num campo
  // só, com envio direto ao Storage) e usa o MESMO padrão: botão da fundação na
  // frente, input fora da vista mas no Tab. Os dois convivem até o editor novo
  // aposentar o CampoArquivo; fora deles, o input cru continua proibido.
  it("input de arquivo aparece só dentro do CampoArquivo e do CampoMidia", () => {
    const culpados = fontes
      .filter(([nome]) => !nome.endsWith("CampoArquivo.tsx") && !nome.endsWith("CampoMidia.tsx"))
      .filter(([, texto]) => texto.includes('type="file"'))
      .map(([nome]) => nome);
    expect(culpados).toEqual([]);
  });
});
