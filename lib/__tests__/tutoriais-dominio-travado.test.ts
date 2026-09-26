import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decidirDominioDaCentral, DOMINIO_DOS_TUTORIAIS } from "@/lib/tridiflow-tutoriais";

// O endereço do site de tutoriais é o único dado deste app que já saiu
// IMPRESSO: QR em caixa e etiqueta, link em ficha de produto. Trocar o domínio
// não quebra uma tela — quebra o papel que já está na rua, e host com dono só
// serve o que foi marcado pra ele (`publicacaoDoHost`), então o QR antigo passa
// a cair em "página indisponível".
//
// A trava tem três pernas e este arquivo cobre as três, porque duas delas não
// têm como falhar em teste de tela: a tela não oferece a troca, o servidor
// recusa quem pede pela API, e o gatilho do banco recusa até SQL na mão.
const raiz = process.cwd();
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");
const TRAVADO = "dom-carimbos";

describe("decisão do domínio da central", () => {
  it("sem pedido: grava o domínio travado (conserta central antiga no 1º salvamento)", () => {
    expect(decidirDominioDaCentral(undefined, TRAVADO)).toEqual({ escrever: TRAVADO });
  });

  it("pedindo o próprio domínio travado: passa", () => {
    expect(decidirDominioDaCentral(TRAVADO, TRAVADO)).toEqual({ escrever: TRAVADO });
  });

  it("pedindo OUTRO domínio: recusa com o endereço travado na mensagem", () => {
    const d = decidirDominioDaCentral("dom-qualquer", TRAVADO);
    expect("recusar" in d).toBe(true);
    expect("recusar" in d && d.recusar).toContain(DOMINIO_DOS_TUTORIAIS);
  });

  // `null` é o domínio padrão (gedux) — é a troca mais fácil de fazer sem
  // perceber, porque é o valor de quem "limpou" o campo.
  it("pedindo o domínio padrão (null): recusa igual", () => {
    expect("recusar" in decidirDominioDaCentral(null, TRAVADO)).toBe(true);
  });

  it("domínio travado ainda não cadastrado: não toca na coluna, mas recusa pedido", () => {
    expect(decidirDominioDaCentral(undefined, null)).toEqual({ escrever: undefined });
    expect("recusar" in decidirDominioDaCentral("dom-qualquer", null)).toBe(true);
  });
});

describe("as cópias do endereço não podem divergir", () => {
  // Duas cópias do mesmo host (TS e SQL) que se separam = trava valendo só na
  // metade dos caminhos, e ninguém descobre até o link cair.
  it("o host do gatilho é o mesmo da constante", () => {
    const sql = ler("supabase/tutoriais_dominio_travado.sql");
    expect(sql).toContain(DOMINIO_DOS_TUTORIAIS);
    const hosts = new Set(sql.match(/'[a-z0-9.-]+\.com\.br'/g) ?? []);
    expect([...hosts]).toEqual([`'${DOMINIO_DOS_TUTORIAIS}'`]);
  });

  it("o gatilho fica na tabela dos projetos e deixa VOLTAR pro domínio travado", () => {
    const sql = ler("supabase/tutoriais_dominio_travado.sql");
    expect(sql).toMatch(/create trigger tutoriais_dominio_travado/);
    expect(sql).toMatch(/before update of dominio_id on tridiflow_bots/);
    // Sem esta saída a central não consegue nem NASCER no domínio certo: ela é
    // inserida sem domínio e recebe o travado no update seguinte.
    expect(sql).toMatch(/new\.dominio_id = travado/);
    expect(sql).toContain("central_tutoriais");
    // Idempotente: rodar duas vezes não pode explodir.
    expect(sql).toContain("drop trigger if exists tutoriais_dominio_travado");
  });

  // Editor de SQL que parte o script em statements por conta própria cortava o
  // corpo da função no meio — o erro que sai é "syntax error at or near if", em
  // LINE 1, como se o Postgres estivesse recusando SQL válido. Corpo sem linha
  // em branco e sem comentário dentro do $$ tira os pontos de corte.
  it("o corpo da função não tem onde ser cortado", () => {
    const sql = ler("supabase/tutoriais_dominio_travado.sql");
    const corpo = sql.match(/as \$travado\$([\s\S]*?)\$travado\$/)?.[1] ?? "";
    expect(corpo).not.toBe("");
    expect(corpo).not.toMatch(/\n\s*\n/);
    expect(corpo).not.toMatch(/--/);
  });

  // Terceira cópia: o monitor da página de status. Vigiar um endereço que o
  // produto não serve mais é pior que não vigiar — a tela fica verde num site
  // que ninguém abre, enquanto o QR impresso cai em silêncio.
  it("o monitor de status vigia o mesmo endereço", () => {
    const sql = ler("supabase/status_tutoriais.sql");
    const hosts = new Set(sql.match(/'[a-z0-9.-]+\.com\.br'/g) ?? []);
    expect([...hosts]).toEqual([`'${DOMINIO_DOS_TUTORIAIS}'`]);
    // Só o que está PUBLICADO entra, e do SNAPSHOT publicado: é ele que o
    // /p/<slug>/<handle> serve, e guia em rascunho responde 404 — monitorar
    // rascunho seria pintar vermelho de propósito.
    expect(sql).toContain("b.published->'pagina'->'config'->>'template'");
    expect(sql).toMatch(/t\.item->>'status'.*=\s*'publicado'/);
    // E o cartão "Domínios" não pode vigiar o mesmo endereço outra vez.
    expect(ler("supabase/status_dominios_ativos.sql")).toContain(`'${DOMINIO_DOS_TUTORIAIS}'`);
  });

  it("o app traduz o erro do gatilho em vez de devolver 500", () => {
    expect(ler("lib/tridiflow-db.ts")).toMatch(/dominio_travado\/i\.test\(error\.message\)/);
    expect(ler("app/api/tridiflow/bots/route.ts")).toContain("DominioTravado");
  });
});

describe("a tela não oferece o que não pode", () => {
  const editor = "app/(plataforma)/marketing/tutoriais/[id]/CentralTutoriaisEditor.tsx";

  it("o editor da central não tem seletor de domínio", () => {
    const linhas = ler(editor).split("\n").filter((l) => l.includes("GlassSelect") && l.includes("dominio"));
    expect(linhas).toEqual([]);
  });

  // A trava morreria em silêncio se o editor voltasse a mandar a coluna: ele
  // salva pela API GENÉRICA dos projetos, que grava `dominio_id` de qualquer
  // linha e não passa por `decidirDominioDaCentral`.
  it("o editor não manda dominioId no salvamento", () => {
    const fonte = ler(editor);
    expect(fonte).not.toMatch(/dominioId:\s*identidade/);
    expect(fonte).not.toContain("setDominioId");
  });

  it("o servidor decide o domínio da central, não o cliente", () => {
    expect(ler("lib/tridiflow-tutoriais-db.ts")).toContain("decidirDominioDaCentral(ident.dominioId");
  });
});
