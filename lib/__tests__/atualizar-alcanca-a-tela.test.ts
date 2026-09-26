// ── O "Atualizar" da Tridify tem que alcançar a tela inteira ────────────────
//
// O botão refaz o panorama do Meta e o snapshot do ERP, que são estado do
// `TrafegoClient` e descem por prop. Quem busca a PRÓPRIA rota não enxerga o
// clique: só recarrega quando o período muda. O resultado é sempre o mesmo —
// metade dos números anda, a outra metade fica congelada na primeira leitura
// da sessão, e quem olha conclui que o painel não atualizou.
//
// Isso já apareceu TRÊS vezes: nos cards de dinheiro do painel (consertado só
// pra rota `/vendas`), na Vega e na Yampi, e depois em BMs, Qualidade dos
// dados e Comissão do gestor — este último com `useEffect(carregar, [])`, que
// carregava uma vez por sessão e nunca mais. As duas primeiras vezes o defeito
// voltou porque o conserto foi pontual: nada obriga quem escreve um widget
// novo a se inscrever no sinal.
//
// Por isso a regra é um teste, não um comentário: componente da Tridify que lê
// NÚMERO DE PERÍODO precisa de `useAtualizacao`. Exceção mora na lista abaixo,
// com o motivo escrito — e a pergunta certa ao quebrar não é "como adiciono à
// lista", é "esse número devia mesmo ficar velho depois do Atualizar?".

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "app/(plataforma)/trafego");

// Rotas que devolvem número do PERÍODO. Config (integrações, marcas, contas
// salvas, teste A/B, rastreamento) não entra: não muda por clicar em Atualizar.
const ROTAS_DE_NUMERO = [
  "/api/trafego/vendas",
  "/api/trafego/overview",
  "/api/trafego/eventos",
  "/api/trafego/fontes",
  "/api/trafego/relatorio",
  "/api/trafego/vega",
  "/api/trafego/yampi",
  "/api/trafego/contas",
  "/api/trafego/campanha/diario",
];

// Cada exceção com o motivo. Sem motivo escrito, não é exceção — é esquecimento.
const EXCECOES: Record<string, string> = {
  "TrafegoClient.tsx":
    "é quem DISPARA o sinal: refaz o panorama e o snapshot do ERP e chama avisarAtualizacao().",
  "TrafegoOverview.tsx":
    "expõe o `refresh` que o botão chama — inscrever-se no próprio sinal buscaria duas vezes.",
  "PainelPersonalizavel.tsx":
    "a busca de /vendas daqui só roda no modo prévia (/dev-*); no cliente real o valor desce do pai já atualizado. A comissão do gestor, essa sim, usa o hook.",
  "CampanhasPro.tsx":
    "o diário abre por campanha escolhida, sob demanda — não é número do período na tela.",
};

// A CHAMADA, não a menção: um `import { useAtualizacao }` que sobrou depois de
// alguém apagar a linha de uso deixaria o arquivo passar sem se inscrever em
// nada — foi o primeiro furo desta trava, achado testando a própria trava.
const chamaOHook = (src: string) =>
  src.split("\n").some((l) => !l.trimStart().startsWith("import") && /useAtualizacao\s*\(/.test(l));

const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));

describe("o Atualizar alcança a tela inteira", () => {
  it("todo componente que lê número de período se inscreve no sinal", () => {
    const faltando: string[] = [];
    for (const nome of arquivos) {
      const src = readFileSync(join(DIR, nome), "utf8");
      if (!src.includes("useEffect")) continue;
      const rota = ROTAS_DE_NUMERO.find((r) => src.includes(r));
      if (!rota) continue;
      if (chamaOHook(src)) continue;
      if (EXCECOES[nome]) continue;
      faltando.push(`${nome} (lê ${rota})`);
    }
    expect(faltando, `Estes componentes buscam número do período e ficam congelados quando alguém clica em "Atualizar". Chame useAtualizacao(carregar) — ou, se o número deve mesmo ficar velho, explique numa exceção em ${"lib/__tests__/atualizar-alcanca-a-tela.test.ts"}.`).toEqual([]);
  });

  it("toda exceção tem motivo escrito e o arquivo ainda existe", () => {
    for (const [nome, motivo] of Object.entries(EXCECOES)) {
      expect(arquivos, `exceção para ${nome}, que não existe mais — apague a linha`).toContain(nome);
      expect(motivo.length, `exceção para ${nome} sem motivo`).toBeGreaterThan(30);
    }
  });

  it("o sinal existe e é um evento, não uma prop que todo widget teria que aceitar", () => {
    const src = readFileSync(join(DIR, "atualizacao.ts"), "utf8");
    expect(src).toContain("addEventListener");
    expect(src).toContain("removeEventListener");
    // A função vai numa ref: `carregar` é um useCallback que troca a cada
    // período, e guardar a do primeiro render recarregaria o período ANTIGO.
    expect(src).toContain("useRef");
  });
});
