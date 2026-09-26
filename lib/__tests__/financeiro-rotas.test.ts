import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { AREA_BY_KEY } from "../areas";

/**
 * As ~25 rotas de `app/api/financeiro/**` — conferidas LENDO O CÓDIGO-FONTE.
 *
 * POR QUE FONTE, E NÃO CHAMAR A ROTA. Um handler do App Router só responde
 * depois que a sessão do Supabase existe, o schema `fin_*` está no banco e o
 * `next/headers` tem um request de verdade por trás. Montar isso num teste
 * custaria três camadas de mentira (auth, cookies, PostgREST) e cada uma delas
 * mentiria a favor: o gate passaria porque o mock devolveu um perfil, e o teste
 * ficaria verde justamente na regressão que ele deveria pegar. O comportamento
 * de dentro das rotas já é testado onde ele mora de verdade —
 * `financeiro-escrita.test.ts` aplica os índices únicos num banco falso e prova
 * idempotência, e `financeiro-calculos.test.ts` prova a conta.
 *
 * O que sobra para a rota é o CONTRATO DA BORDA, e ele é textual: cada método
 * tem gate, ninguém redireciona, `empresa_id` que vem do cliente é conferido, a
 * chave do gate existe na grade e o erro sai no campo que a tela lê. São
 * exatamente as cinco coisas que somem numa linha só — um `export async
 * function DELETE` colado de outro arquivo, um `redirect()` importado por
 * engano, um `{ error: ... }` no lugar de `{ erro: ... }` — e que ninguém
 * percebe até alguém sem permissão apagar uma compra ou a tela mostrar
 * "undefined" no lugar do motivo.
 *
 * Irmão de `gate-por-area.test.ts`: lá se prova que a chave do portão EXISTE na
 * grade; aqui, que TODA porta tem portão.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const DIR = join(RAIZ, "app", "api", "financeiro");

function rotas(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) rotas(full, out);
    else if (nome === "route.ts") out.push(full);
  }
  return out;
}

/** Comentário não é código: metade destes arquivos EXPLICA o padrão em prosa. */
const semComentario = (src: string) => src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");

const METODO = /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\s*\(/g;
/** Handler declarado de outro jeito — o scanner precisa AVISAR que deixou de enxergar. */
const METODO_FORA_DO_PADRAO = /export\s+(?:const|let|var|function)\s+(?:GET|POST|PATCH|PUT|DELETE)\b/;

/** `empresa_id` que veio do CLIENTE: corpo JSON, querystring ou multipart. */
const EMPRESA_DO_CLIENTE =
  /(?:corpo|body|dados|payload)\s*\??\s*\.\s*empresa_id|\.get\(\s*["']empresa_id["']\s*\)|\{[^}]*\bempresa_id\b[^}]*\}\s*=\s*(?:corpo|body|await\s+req)/;

/** Chave do campo dentro de um `NextResponse.json({ … })` — sem atravessar objeto aninhado. */
const RESPOSTA_COM_ERROR = /NextResponse\.json\(\s*\{[^{}]*\berror\s*:/;
const RESPOSTA_COM_ERRO = /NextResponse\.json\(\s*\{[^{}]*\berro\s*:/;

const ESCREVE = new Set(["POST", "PATCH", "PUT", "DELETE"]);

const SUBS_DO_CATALOGO = new Set((AREA_BY_KEY.financeiro?.subs ?? []).map((s) => s.key));

interface Metodo { nome: string; corpo: string }

interface Rota {
  rel: string;
  fonte: string;
  metodos: Metodo[];
}

/**
 * Cada método vira o pedaço de texto que vai dele até o próximo `export async
 * function` (ou o fim do arquivo). Contar ocorrências no arquivo inteiro não
 * serviria: dois `apiFinanceiro` no GET e nenhum no DELETE fecham a conta e
 * deixam a porta escancarada.
 */
const arquivos: Rota[] = rotas(DIR).map((f) => {
  const fonte = semComentario(readFileSync(f, "utf8"));
  const marcas = [...fonte.matchAll(METODO)];
  return {
    rel: relative(RAIZ, f),
    fonte,
    metodos: marcas.map((m, i) => ({
      nome: m[1],
      corpo: fonte.slice(m.index!, marcas[i + 1]?.index ?? fonte.length),
    })),
  };
});

describe("Rotas do Financeiro — o scanner enxerga tudo", () => {
  it("achou as rotas (varredura quebrada seria uma suíte verde que não testa nada)", () => {
    expect(arquivos.length, `nenhum route.ts em ${relative(RAIZ, DIR)} — conferir o caminho da varredura`)
      .toBeGreaterThan(20);
  });

  it("todo route.ts exporta pelo menos um método no formato que o scanner lê", () => {
    const mudos = arquivos.filter((r) => !r.metodos.length).map((r) => r.rel);
    expect(mudos, "rota sem `export async function` — se o handler mudou de forma, ajuste METODO neste teste").toEqual([]);
  });

  it("nenhum handler escapa por `export const GET = …`", () => {
    const outros = arquivos.filter((r) => METODO_FORA_DO_PADRAO.test(r.fonte)).map((r) => r.rel);
    expect(
      outros,
      "handler declarado como const/function solta: o scanner não o vê e ele passaria SEM gate — declare `export async function`",
    ).toEqual([]);
  });
});

describe("Rotas do Financeiro — todo método tem o seu portão", () => {
  it("cada método exportado chama apiFinanceiro()", () => {
    const semGate: string[] = [];
    for (const r of arquivos) {
      for (const m of r.metodos) {
        if (!/apiFinanceiro\(/.test(m.corpo)) semGate.push(`${r.rel} → ${m.nome}`);
      }
    }
    expect(
      semGate,
      "método sem gate: abre para qualquer pessoa logada — comece o handler com `const eu = await apiFinanceiro(\"<sub>\"); if (!eu) return NextResponse.json({ erro: \"Sem permissão.\" }, { status: 403 });`",
    ).toEqual([]);
  });

  it("a conta fecha: um apiFinanceiro por método exportado", () => {
    const desencontro: string[] = [];
    for (const r of arquivos) {
      const gates = (r.fonte.match(/apiFinanceiro\(/g) ?? []).length;
      if (gates !== r.metodos.length) {
        desencontro.push(`${r.rel}: ${r.metodos.length} método(s), ${gates} gate(s)`);
      }
    }
    expect(
      desencontro,
      "sobrou ou faltou gate. Gate a mais dentro do mesmo método é gate morto (só o primeiro barra); gate a menos é porta aberta — remova o excedente ou dê um a cada método",
    ).toEqual([]);
  });

  it("a sub usada no gate existe na grade de permissões", () => {
    const inventadas: string[] = [];
    for (const r of arquivos) {
      for (const m of r.fonte.matchAll(/apiFinanceiro\(\s*"([^"]+)"/g)) {
        if (!SUBS_DO_CATALOGO.has(m[1])) inventadas.push(`${r.rel} → "${m[1]}"`);
      }
    }
    expect(
      inventadas,
      `sub que a grade nunca concede: o gate fica inalcançável e a rota responde 403 para todo mundo, inclusive para quem tem tudo ligado. Use uma de: ${[...SUBS_DO_CATALOGO].join(", ")} (lib/areas.ts → AREAS.financeiro.subs)`,
    ).toEqual([]);
  });
});

describe("Rotas do Financeiro — nunca redirecionar", () => {
  it("nenhuma rota chama redirect()", () => {
    const culpadas = arquivos.filter((r) => /\bredirect\s*\(/.test(r.fonte)).map((r) => r.rel);
    expect(
      culpadas,
      "redirect() numa rota de API vira 200 com HTML da tela de login: o `r.ok` do cliente lê como SUCESSO e a tela diz \"salvo\" sem ter salvado nada. Responda `NextResponse.json({ erro }, { status: 401 | 403 })`",
    ).toEqual([]);
  });

  it("nenhuma rota importa de next/navigation", () => {
    const culpadas = arquivos
      .filter((r) => /from\s+["']next\/navigation["']/.test(r.fonte))
      .map((r) => r.rel);
    expect(
      culpadas,
      "`next/navigation` é de página, não de rota — o que ele traz (redirect, notFound) responde HTML. Importe `NextResponse` de `next/server`",
    ).toEqual([]);
  });
});

describe("Rotas do Financeiro — empresa que veio do cliente é conferida", () => {
  it("método que lê empresa_id do corpo ou da querystring chama empresaPermitida()", () => {
    const soltas: string[] = [];
    for (const r of arquivos) {
      for (const m of r.metodos) {
        if (!EMPRESA_DO_CLIENTE.test(m.corpo)) continue;
        if (!/empresaPermitida\(/.test(m.corpo)) soltas.push(`${r.rel} → ${m.nome}`);
      }
    }
    expect(
      soltas,
      "§17: o empresa_id do corpo é o CLIENTE falando. Sem empresaPermitida(), quem tem o Financeiro da Gedux lança despesa na Tridi trocando um campo no DevTools — o gate da área já disse sim antes disso. Confira com `if (!(await empresaPermitida(eu.profile.id, empresaId))) return NextResponse.json({ erro: \"Empresa não permitida.\" }, { status: 403 });`",
    ).toEqual([]);
  });
});

describe("Rotas do Financeiro — o corpo da resposta", () => {
  it("erro sai em `erro`, nunca em `error`", () => {
    const enganadas = arquivos.filter((r) => RESPOSTA_COM_ERROR.test(r.fonte)).map((r) => r.rel);
    expect(
      enganadas,
      "a tela lê `dados.erro` (é o padrão do módulo inteiro) e mostraria \"undefined\" como motivo da falha — renomeie a chave para `erro`",
    ).toEqual([]);
  });

  it("toda rota que grava tem uma resposta de erro para dar", () => {
    const mudas = arquivos
      .filter((r) => r.metodos.some((m) => ESCREVE.has(m.nome)))
      .filter((r) => !RESPOSTA_COM_ERRO.test(r.fonte))
      .map((r) => r.rel);
    expect(
      mudas,
      "rota de escrita sem nenhum `NextResponse.json({ erro: … })`: quando falhar, a tela não terá o que mostrar. No mínimo o 403 do gate",
    ).toEqual([]);
  });
});

describe("Rotas do Financeiro — leitura barata", () => {
  it("nenhuma rota usa select(\"*\")", () => {
    const gulosas = arquivos.filter((r) => /\.select\(\s*["'`]\*["'`]/.test(r.fonte)).map((r) => r.rel);
    expect(
      gulosas,
      "`*` arrasta jsonb, texto longo e colunas que a tela nem usa — é assim que 53 MB de banco viram 6,3 GB de egress. Nomeie as colunas",
    ).toEqual([]);
  });
});
