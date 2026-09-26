import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// ─────────────────────────────────────────────────────────────────────────────
// A TRAVA É ESTE TESTE, NÃO O COMENTÁRIO NO CLAUDE.md.
//
// Em setembro/2026 "algumas pessoas perderam permissões e o Gaius ficou lento".
// Não foi mudança de regra de acesso: foi um soluço do banco virando resposta
// CACHEADA. O supabase-js não lança em timeout/5xx/queda de conexão — devolve
// `{ data: null, error }`. E o `cached()` só descarta Promise REJEITADA, então
// `const { data } = await db.from(...)` sem olhar o `error` guarda a falha como
// se fosse "não tem linha" pelo TTL inteiro.
//
// Em `employees` isso é perda de permissão: `meuNivel` lê `permissoes: null`,
// `temPermissoesConfiguradas` diz não, e a pessoa cai no básico do nível 1 —
// sidebar encolhe e toda API responde 403, por 30 s, para TODA requisição que
// cair naquela instância. Em `profiles` é pior: manda a instância pro /login.
//
// O defeito entra como UMA LINHA, num arquivo sobre outro assunto, e só
// aparece quando o banco tem um soluço — semanas depois de commitado. Por isso
// a varredura.
// ─────────────────────────────────────────────────────────────────────────────

const arquivos = execSync(`grep -rl "cached(" --include="*.ts" --include="*.tsx" app lib`, { encoding: "utf8" })
  .trim().split("\n").filter((f) => f && !f.includes("__tests__"));

/** Blocos `cached(...)`/`cachedByToken(...)` que leem o banco, por contagem de parênteses. */
function blocosCacheadosComLeitura(arquivo: string): { linha: number; texto: string }[] {
  const linhas = readFileSync(arquivo, "utf8").split("\n");
  const blocos: { linha: number; texto: string }[] = [];
  for (let i = 0; i < linhas.length; i++) {
    if (!/\bcached(ByToken)?\s*\(/.test(linhas[i])) continue;
    let profundidade = 0, abriu = false, j = i;
    const corpo: string[] = [];
    for (; j < linhas.length && j < i + 120; j++) {
      for (const ch of linhas[j]) {
        if (ch === "(") { profundidade++; abriu = true; } else if (ch === ")") profundidade--;
      }
      corpo.push(linhas[j]);
      if (abriu && profundidade <= 0) break;
    }
    const texto = corpo.join("\n");
    if (/\.from\s*\(|\.rpc\s*\(/.test(texto)) blocos.push({ linha: i + 1, texto });
    i = j;
  }
  return blocos;
}

// Cego ao `error`: pega o `data` e nunca pergunta se a leitura deu certo.
const olhaOErro = (texto: string) => /\berror\b/.test(texto);

// Sites que JÁ ramificam no `error` passam — a decisão está escrita no código e
// é visível em revisão, mesmo quando a escolha é devolver vazio. O que a
// varredura proíbe é a leitura CEGA, que não tem como distinguir "não tem
// linha" de "o banco não respondeu".
//
// Cada exceção mora aqui COM O MOTIVO. Se este teste quebrou, a pergunta certa
// não é "como adiciono à lista" — é "o que esta tela mostra se a leitura
// falhar, e por quanto tempo ela mostra isso?".
const LIBERADOS = new Map<string, string>([
  ["lib/financeiro/db.ts", "o `error` é tratado no helper `tolerante()`: ele LANÇA em falha passageira e só devolve `pendente` quando a TABELA não existe (SQL ainda não rodado)"],
  ["lib/status-servidor.ts", "página de status; leitura falha vira painel vazio por 30 s, sem efeito em acesso"],
]);

describe("varredura: leitura cacheada não pode ser cega ao `error`", () => {
  it("todo cached() que lê o banco pergunta se a leitura deu certo", () => {
    const cegos: string[] = [];
    for (const arquivo of arquivos) {
      if (LIBERADOS.has(arquivo)) continue;
      for (const b of blocosCacheadosComLeitura(arquivo)) {
        if (!olhaOErro(b.texto)) cegos.push(`${arquivo}:${b.linha}`);
      }
    }
    expect(cegos, `Leitura cacheada sem olhar o \`error\`: um timeout vira resposta boa pelo TTL inteiro.
Use \`const { data, error } = await ...\` e \`if (error) throw error\` — o cached() descarta a
entrada e a próxima requisição lê de novo. Em:\n  ${cegos.join("\n  ")}\n`).toEqual([]);
    });

  // O que decide acesso não tem exceção: aqui `throw` é obrigatório, não basta
  // olhar o `error`. Devolver um valor "vazio" nestes é rebaixar a pessoa.
  it("a cadeia de acesso LANÇA em falha de leitura (não devolve vazio)", () => {
    for (const arquivo of ["lib/perfis.ts", "lib/require-auth.ts"]) {
      for (const b of blocosCacheadosComLeitura(arquivo)) {
        expect(/if\s*\(\s*error\s*\)\s*throw\s+error/.test(b.texto),
          `${arquivo}:${b.linha} decide acesso: precisa de \`if (error) throw error\`. ` +
          `Sem isso, uma falha de leitura vira "sem ficha"/"sem perfil" por 30 s e a pessoa ` +
          `cai no básico do nível 1 (ou vai pro /login) — em toda requisição da instância.`).toBe(true);
      }
    }
  });
});

describe("varredura: o avatar não volta a ser uma ida própria ao banco", () => {
  // `photo_url` mora na MESMA linha de `employees` que decide o acesso, e o
  // gate de toda página protegida já leu essa linha (`acessoBruto`). Uma
  // leitura própria do avatar é round-trip puro em TODA navegação, em série
  // com o gate — e com chave própria (`photo:`, `rh:foto:`, `fin:foto:`) que o
  // `invalidate("emp-acesso:")` de quem salva a ficha não derruba, então a foto
  // trocada só aparecia até 5 min depois. Cinco layouts tinham a sua cópia.
  // A regra é sobre o avatar de QUEM ESTÁ LOGADO, que o layout desenha em toda
  // navegação. Ler a foto de OUTRAS pessoas (lista de atividades, painel de
  // produção, fila de conferência) é outra consulta e continua valendo.
  it("nenhum layout busca a própria foto por conta", () => {
    const layouts = execSync(`find "app/(plataforma)" -name "layout.tsx"`, { encoding: "utf8" })
      .trim().split("\n").filter(Boolean);

    const comIdaPropria = layouts.filter((f) => {
      const src = readFileSync(f, "utf8");
      return /select\s*\(\s*["'`][^"'`]*photo_url/.test(src) && /from\s*\(\s*["'`]employees/.test(src);
    });

    expect(comIdaPropria, `O avatar deve sair do \`acessoBruto\` (lib/perfis.ts), que o gate desta
página já leu — \`(await acessoBruto(profile.id).catch(() => null))?.photo_url ?? null\`. Uma
leitura própria é round-trip em TODA navegação, em série com o gate, e com chave que o
\`invalidate("emp-acesso:")\` de quem salva a ficha não derruba. Ida própria em:`)
      .toEqual([]);
  });
});
