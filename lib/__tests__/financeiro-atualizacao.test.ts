import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Travas do "período errado" e do "a tela não atualiza" do Financeiro
 * (22/08/2026). Nenhuma delas é pega por tipo: são defeitos de COMPORTAMENTO
 * que só aparecem à noite, depois de trocar de empresa, ou ao apertar Voltar.
 *
 *  · "Hoje" era o dia da UTC (`toISOString().slice(0, 10)`): das 21h às
 *    23h59 todo "vence hoje", "este mês" e "compras do mês" apontavam para
 *    amanhã — e o navegador, pelo mesmo método, concordava com o erro.
 *  · A agenda vinha de uma janela de ±180 dias: a conta atrasada há sete meses
 *    sumia de "Já vencidos" e do cartão "Atrasados", como se tivesse sido paga.
 *  · Voltar (botão ou gesto) restaura a tela anterior do cache do Next, então
 *    pagar e voltar para a Visão Geral mostrava o saldo de ANTES.
 *  · Recorrência só virava compromisso quando alguém clicava "Gerar": quando
 *    ninguém lembrava, o mês virava e o aluguel não existia na agenda.
 *  · Depois de salvar, a lista levava meio segundo para trocar e nada dizia
 *    que algo estava a caminho — a pessoa clicava de novo.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ler = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
/** Comentário não é código: metade destes arquivos EXPLICA o defeito em prosa. */
const semComentario = (src: string) => src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");

function varrer(dir: string, filtro: (nome: string) => boolean, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, filtro, out);
    else if (filtro(nome)) out.push(full);
  }
  return out;
}

const FIN_TELAS = join(RAIZ, "app", "(plataforma)", "financeiro");
const FIN_API = join(RAIZ, "app", "api", "financeiro");
const FIN_LIB = join(RAIZ, "lib", "financeiro");

describe("Financeiro — 'hoje' é o dia de São Paulo, nunca o da UTC", () => {
  it("ninguém no módulo descobre o dia com `new Date().toISOString().slice(0, 10)`", () => {
    const fontes = [...varrer(FIN_TELAS, (n) => /\.tsx?$/.test(n)), ...varrer(FIN_API, (n) => /\.tsx?$/.test(n)), ...varrer(FIN_LIB, (n) => /\.tsx?$/.test(n))];
    const culpados = fontes
      .filter((f) => /new Date\(\)\s*\.toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/.test(semComentario(readFileSync(f, "utf8"))))
      .map((f) => relative(RAIZ, f));
    expect(culpados, "o dia da UTC vira amanhã às 21h em São Paulo — use hojeISO() de lib/financeiro/calculos").toEqual([]);
  });

  it("hojeISO() passa pelo fuso da empresa", () => {
    const calc = semComentario(ler("lib/financeiro/calculos.ts"));
    expect(calc).toMatch(/timeZone:\s*FUSO_DA_EMPRESA/);
    expect(calc).toMatch(/FUSO_DA_EMPRESA\s*=\s*"America\/Sao_Paulo"/);
  });
});

describe("Financeiro — o que está em aberto nunca fica fora da janela", () => {
  it("Compromissos e Compras leem a agenda pelo `compromissosDaAgenda`", () => {
    for (const rel of ["app/(plataforma)/financeiro/compromissos/page.tsx", "app/(plataforma)/financeiro/compras/page.tsx"]) {
      const src = semComentario(ler(rel));
      expect(src, rel).toMatch(/compromissosDaAgenda\(/);
      // A janela antiga: `compromissos(escopo, { de: …` — a conta velha sumia.
      expect(src, `${rel} voltou à janela única`).not.toMatch(/\bcompromissos\(\s*escopo/);
    }
  });

  it("a Visão Geral pede só o que está em aberto, sem limite para trás", () => {
    const src = semComentario(ler("app/(plataforma)/financeiro/page.tsx"));
    const chamada = src.match(/compromissos\(\s*escopo\s*,\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(chamada).toMatch(/situacao:\s*"abertos"/);
    expect(chamada, "um `de:` aqui tira a conta atrasada há meses do alerta").not.toMatch(/\bde:/);
  });

  it("a agenda une as duas consultas por id e avisa quando bate no teto", () => {
    const db = semComentario(ler("lib/financeiro/db.ts"));
    const corpo = db.slice(db.indexOf("export async function compromissosDaAgenda"));
    expect(corpo).toMatch(/situacao:\s*"abertos"/);
    expect(corpo).toMatch(/situacao:\s*"fechados"/);
    expect(corpo).toMatch(/unirPorId\(/);
    expect(corpo).toMatch(/cortado:/);
  });
});

describe("Financeiro — voltar e voltar para a aba recarregam a tela", () => {
  it("o Shell recarrega no popstate e no visibilitychange — e não tem intervalo nenhum", () => {
    const shell = semComentario(ler("app/(plataforma)/financeiro/FinanceiroShell.tsx"));
    expect(shell).toMatch(/addEventListener\("popstate"/);
    expect(shell).toMatch(/addEventListener\("visibilitychange"/);
    expect(shell, "poll no Shell do Financeiro é o que pausou a Vercel").not.toMatch(/setInterval\(/);
  });
});

describe("Financeiro — recorrência vira compromisso sozinha", () => {
  it("existe o cron diário, público no middleware e agendado no vercel.json", () => {
    const rota = semComentario(ler("app/api/financeiro-cron/route.ts"));
    expect(rota).toMatch(/CRON_SECRET/);
    expect(rota).toMatch(/gerarRecorrencias\(/);
    expect(rota).toMatch(/export async function GET/);

    const cron = JSON.parse(ler("vercel.json")) as { crons: { path: string; schedule: string }[] };
    const entrada = cron.crons.find((c) => c.path === "/api/financeiro-cron");
    expect(entrada, "sem a linha no vercel.json o cron não existe em produção").toBeDefined();
    expect(entrada?.schedule).toMatch(/^\S+ \S+ \* \* \*$/);   // todo dia

    const mw = semComentario(ler("middleware.ts"));
    expect(mw, "sem o prefixo público o middleware manda o cron para o login").toMatch(/"\/api\/financeiro-cron"/);
  });

  it("o cron mora FORA de /api/financeiro — lá toda rota exige sessão de pessoa", () => {
    const dentro = varrer(FIN_API, (n) => n === "route.ts")
      .filter((f) => /CRON_SECRET/.test(readFileSync(f, "utf8")))
      .map((f) => relative(RAIZ, f));
    expect(dentro).toEqual([]);
  });
});

describe("Financeiro — salvar diz quando a lista nova chegou", () => {
  it("as telas de agenda usam useAtualizar(), não router.refresh() cru", () => {
    for (const f of ["compromissos/CompromissosClient.tsx", "compras/ComprasClient.tsx", "notas/NotasClient.tsx", "patrimonio/PatrimonioClient.tsx"]) {
      const src = semComentario(ler(`app/(plataforma)/financeiro/${f}`));
      expect(src, f).toMatch(/useAtualizar\(\)/);
      expect(src, `${f}: router.refresh() cru não diz quando terminou`).not.toMatch(/router\.refresh\(\)/);
      expect(src, `${f}: sem o "Atualizando…" a lista velha parece definitiva`).toMatch(/<Atualizando\b/);
    }
  });

  it("o filtro nunca esconde o valor que está filtrando", () => {
    const ui = semComentario(ler("app/(plataforma)/financeiro/ui.tsx"));
    const filtro = ui.slice(ui.indexOf("export function Filtro("), ui.indexOf("export function Filtro(") + 3000);
    // A asserção antiga prendia a SINTAXE do `<select>` nativo
    // (`{perdida && <option …>}`) e quebrou quando o filtro virou o seletor
    // próprio, sem que a regra protegida mudasse uma linha. O que importa é o
    // valor perdido continuar ENTRANDO na lista de opções.
    expect(filtro).toMatch(/perdida/);
    expect(filtro, "o valor fora da lista precisa ser acrescentado às opções")
      .toMatch(/perdida\s*\?\s*\[\.\.\.opcoes,\s*\{\s*valor,\s*label:\s*valor\s*\}\]/);
  });
});
