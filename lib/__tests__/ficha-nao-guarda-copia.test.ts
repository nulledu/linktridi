import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readdirSync, statSync } from "node:fs";

/**
 * Painel de detalhe guarda o ID, nunca uma cópia do registro.
 *
 * `router.refresh()` — que roda depois de todo salvamento no módulo — refaz a
 * árvore do SERVIDOR e **preserva o estado do cliente**. Um painel que guardou
 * o objeto no instante do clique (`setFicha(parte)`) continua mostrando aquele
 * objeto para sempre: a lista chega nova, a ficha não.
 *
 * O sintoma é o pior possível para diagnosticar — **"diz que salvou e não
 * mostra depois"** — porque os dois lados estão certos. Medido em produção: o
 * telefone entrava no banco e a tela jurava que não. Nenhum teste de escrita
 * pega isso; nenhum teste de leitura também. Só o desencontro entre os dois.
 *
 * A correção é sempre a mesma: guardar o id e DERIVAR o registro da lista a
 * cada render. Dá de brinde o fechamento automático quando o registro sai da
 * lista (inativado, filtrado) em vez de mostrar dado que já não existe.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const TELAS = join(RAIZ, "app/(plataforma)/financeiro");

/** Todo `*Client.tsx` do módulo. */
function clientes(dir = TELAS): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) { saida.push(...clientes(caminho)); continue; }
    if (nome.endsWith("Client.tsx")) saida.push(caminho);
  }
  return saida;
}

describe("Nenhum painel guarda cópia do registro", () => {
  it("as duas telas corrigidas derivam da lista", () => {
    for (const [tela, lista] of [
      ["cadastros/contatos/ContatosClient.tsx", "lista.find((parte) => parte.id === fichaId)"],
      ["cadastros/fornecedores/FornecedoresClient.tsx", "lista.find((f) => f.id === fichaId)"],
    ]) {
      const s = readFileSync(join(TELAS, tela), "utf8");
      expect(s, `${tela} não deriva a ficha`).toContain(lista);
      expect(s, `${tela} voltou a guardar o objeto`).not.toMatch(/const \[ficha, setFicha\]/);
    }
  });

  it.each(clientes().map((c) => [c.slice(TELAS.length + 1), c]))(
    "%s não guarda um registro inteiro em estado de painel",
    (_nome, caminho) => {
      const s = readFileSync(caminho, "utf8");
      // O que se procura é `useState<Algum | null>` para ficha/detalhe/aberto —
      // estado de PAINEL. Rascunho de formulário é outra coisa: ele é semente
      // editável de propósito, e a tela o remonta com `key`.
      const suspeitos = [...s.matchAll(
        /const \[(ficha|detalhe|selecionado|aberto)\w*, set\w+\] = useState<([A-Z]\w*) \| null>/g,
      )].map((m) => `${m[1]}: ${m[2]}`);
      expect(suspeitos, "guarde o id e derive da lista — ver o cabeçalho deste arquivo").toEqual([]);
    },
  );
});
