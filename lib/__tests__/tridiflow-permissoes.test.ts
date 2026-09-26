import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AREA_BY_KEY, chavesDasAreas } from "../areas";
import { ABAS, CHAVE_CONFIG, PRIMEIRA_ABA } from "../../app/(plataforma)/tridiflow/abas";

const SUBS = (AREA_BY_KEY["tridiflow"].subs ?? []).map((s) => s.key);

describe("TridiFlow — permissões por aba", () => {
  it("tem uma sub por aba do workspace", () => {
    expect(SUBS).toEqual([
      "projetos", "linktridi", "tutoriais", "templates", "temas",
      "integracoes", "contatos", "analytics", "configuracoes",
    ]);
  });

  it("toda aba da sidebar aponta pra uma sub que existe", () => {
    const validas = new Set(SUBS.map((s) => `tridiflow:${s}`));
    for (const a of ABAS) expect(validas.has(a.chave), a.href).toBe(true);
    expect(validas.has(CHAVE_CONFIG)).toBe(true);
  });

  it("é default-deny: sem grade configurada, ninguém entra", () => {
    expect(chavesDasAreas(null)).not.toContain("tridiflow");
    expect(chavesDasAreas({ comercial: true })).not.toContain("tridiflow");
  });

  it("uma sub ligada abre a área e SÓ aquela sub", () => {
    const keys = chavesDasAreas({ "tridiflow:contatos": true });
    expect(keys).toContain("tridiflow");
    expect(keys).toContain("tridiflow:contatos");
    expect(keys).not.toContain("tridiflow:projetos");
    expect(keys).not.toContain(CHAVE_CONFIG);
  });

  // Configurações mexe em DNS e pixel que já está no ar: sensível. Mas ela já
  // existia dentro da área, então quem tinha `tridiflow: true` no modelo antigo
  // não pode perdê-la na migração — é o que `herdada` faz, e só isso.
  it("configurações é sensível, mas quem já tinha a área não perde nada", () => {
    const sub = (AREA_BY_KEY["tridiflow"].subs ?? []).find((s) => s.key === "configuracoes")!;
    expect(sub.sensivel).toBe(true);
    expect(sub.herdada).toBe(true);
    const antigo = chavesDasAreas({ tridiflow: true });
    for (const s of SUBS) expect(antigo, s).toContain(`tridiflow:${s}`);
  });

  it("herdada não vaza: sub sensível sem herdada segue fora do back-compat", () => {
    const antigo = chavesDasAreas({ estoque: true });
    expect(antigo).toContain("estoque:itens");
    expect(antigo).not.toContain("estoque:cadastrar");
  });

  it("quem não tem projetos cai na primeira aba que tem, não num 403", () => {
    expect(PRIMEIRA_ABA(chavesDasAreas({ "tridiflow:contatos": true }))).toBe("/tridiflow/contatos");
    expect(PRIMEIRA_ABA(chavesDasAreas({ "tridiflow:configuracoes": true }))).toBe("/tridiflow/configuracoes");
    expect(PRIMEIRA_ABA(["central"])).toBe(null);
  });

  // A trava que importa: página ou rota que ficou com a chave GENÉRICA
  // `"tridiflow"` continua abrindo tudo pra qualquer sub — a divisão não vale
  // nada se um arquivo esquecido segurar a porta antiga aberta.
  // LinkTridi: VER continua em "projetos" (a aba, a lista, abrir o editor);
  // MEXER exige a chave própria. A trava vale pros dois lados — a página em
  // leitura e a API que de fato grava.
  it("editar LinkTridi é chave própria, e ligá-la traz projetos junto", () => {
    const sub = (AREA_BY_KEY["tridiflow"].subs ?? []).find((s) => s.key === "linktridi")!;
    expect(sub.implica).toEqual(["projetos"]);
    const keys = chavesDasAreas({ "tridiflow:linktridi": true });
    expect(keys).toContain("tridiflow:linktridi");
    expect(keys).toContain("tridiflow:projetos");
    // Quem só tem projetos NÃO edita.
    expect(chavesDasAreas({ "tridiflow:projetos": true })).not.toContain("tridiflow:linktridi");
  });

  it("a API recusa escrita em LinkTridi sem a chave, e a página abre em leitura", () => {
    const rota = readFileSync("app/api/tridiflow/bots/route.ts", "utf8");
    // Todo caminho de escrita passa pelo guarda: criar, duplicar/publicar/
    // despublicar, salvar (PATCH) e apagar (DELETE).
    // Set/2026: quem tem o Marketing (dono da página) também edita.
    expect(rota).toContain('getProfileForAnyModule("marketing", "tridiflow:linktridi")');
    expect(rota.match(/barraLT\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    const pagina = readFileSync("app/(plataforma)/marketing/linktridi/[id]/page.tsx", "utf8");
    expect(pagina).toContain('requireAlgumModulo("marketing", "tridiflow:projetos")');
    expect(pagina).toContain('keys.includes("marketing") || keys.includes("tridiflow:linktridi")');
  });

  it("nenhuma página ou API gateia pela chave genérica", () => {
    const arquivos = [
      ...listar("app/(plataforma)/tridiflow"),
      ...listar("app/api/tridiflow"),
      ...listar("app/previa/tutoriais"),
    ];
    const culpados = arquivos.filter((f) => {
      const t = readFileSync(f, "utf8");
      return /(requireModule|getProfileForModule)\("tridiflow"\)/.test(t);
    });
    expect(culpados).toEqual([]);
  });
  // Set/2026: LinkTridi e Central de Tutoriais são do Marketing · Geral.
  // Quem tem `marketing` vê e edita ESSES — e só esses: a lista geral e os
  // outros projetos continuam pedindo `tridiflow:projetos`.
  it("Marketing entra nas páginas dele pela API, sem ganhar o resto do TridiFlow", () => {
    const rota = readFileSync("app/api/tridiflow/bots/route.ts", "utf8");
    expect(rota).toContain("paginaDoMarketing(id)");
    expect(rota).toMatch(/escopoMkt && !id \? !!\(await getProfileForModule\("marketing"\)\)/);
    expect(rota).toContain('b.tipo === "linktridi" || (b.tipo === "page" && b.templatePagina === "central_tutoriais")');
    // PATCH e DELETE decidem pelo ALVO, não por uma chave fixa.
    expect(rota.match(/await perfilPara\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    const db = readFileSync("lib/tridiflow-db.ts", "utf8");
    expect(db).toContain('template === "central_tutoriais" ? "tutoriais" : null');
    for (const p of ["tutoriais", "linktridi"]) {
      expect(readFileSync(`app/(plataforma)/marketing/${p}/[id]/page.tsx`, "utf8")).toContain('requireAlgumModulo("marketing"');
    }
  });
});

function listar(dir: string): string[] {
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = `${dir}/${nome}`;
    if (statSync(p).isDirectory()) out.push(...listar(p));
    else if (/\.tsx?$/.test(nome)) out.push(p);
  }
  return out;
}
