import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ehCentralTutoriais } from "@/lib/tridiflow-tutoriais";

const ler = (p: string) => readFileSync(p, "utf8");

describe("integração da Central no TridiFlow", () => {
  it("reconhece somente páginas marcadas com o template da central", () => {
    expect(ehCentralTutoriais({ template: "central_tutoriais", centralTutoriais: {} })).toBe(true);
    expect(ehCentralTutoriais({ template: "vsl" })).toBe(false);
    expect(ehCentralTutoriais(undefined)).toBe(false);
  });

  // Set/2026: LinkTridi e a Central de Tutoriais saíram do TridiFlow de vez —
  // nem aba, nem item na lista de projetos, nem rota de editor lá dentro.
  it("não aparecem mais no TridiFlow: sem aba, sem projeto na lista, rota antiga só redireciona", () => {
    const abas = ler("app/(plataforma)/tridiflow/abas.ts");
    expect(abas).not.toContain('"/tridiflow/tutoriais"');
    expect(abas).not.toContain("tipo=linktridi");
    expect(ler("app/(plataforma)/tridiflow/TridiflowShell.tsx")).not.toMatch(/WORKSPACE[^\n]+"tutoriais"/);
    const lista = ler("app/(plataforma)/tridiflow/meus-bots/MeusBotsClient.tsx");
    expect(lista).toContain('b.tipo !== "linktridi" && b.templatePagina !== "central_tutoriais"');
    expect(ler("app/(plataforma)/tridiflow/tutoriais/[id]/page.tsx")).toContain("redirect(`/marketing/tutoriais/");
    expect(ler("app/(plataforma)/tridiflow/lt/[id]/page.tsx")).toContain("redirect(`/marketing/linktridi/");
  });
  it("cria a central pela API como página do TridiFlow", () => {
    const api = ler("app/api/tridiflow/bots/route.ts");
    expect(api).toContain('b.template === "central_tutoriais"');
    expect(api).toContain('template: "central_tutoriais"');
    expect(api).toContain("centralTutoriais:");
  });

  it("não oferece mais a Central no construtor de Lojas", () => {
    expect(ler("lib/lojas-blocos.ts")).not.toContain('chave: "central-tutoriais"');
    expect(ler("app/(plataforma)/lojas/[id]/paginas/PaginasClient.tsx")).not.toContain("CentralTutoriaisEditor");
  });

  it("Marketing · Geral é a casa: aba Páginas com as duas listas e os editores em /marketing", () => {
    const marketing = ler("app/(plataforma)/marketing/MarketingClient.tsx");
    expect(marketing).toContain("<TutoriaisClient embutido />");
    expect(marketing).toContain("<LinkTridiLista podeEditar={podeLinkTridi} />");
    expect(ler("app/(plataforma)/marketing/tutoriais/[id]/page.tsx")).toContain("CentralTutoriaisEditor");
    // O editor abre DENTRO do Marketing (topo e abas), nunca em tela cheia.
    for (const p of ["tutoriais", "linktridi"]) expect(ler(`app/(plataforma)/marketing/${p}/[id]/page.tsx`)).toContain("<MolduraPaginaMarketing");
    expect(ler("app/(plataforma)/Shell.tsx")).not.toContain("editorDePagina");
    expect(ler("app/(plataforma)/marketing/linktridi/[id]/page.tsx")).toContain("LinkTridiEditorClient");
    expect(ler("app/(plataforma)/tridiflow/tutoriais/page.tsx")).toContain('redirect("/marketing?aba=paginas&ver=tutoriais")');
    expect(ler("app/(plataforma)/tridiflow/meus-bots/page.tsx")).toContain('redirect("/marketing?aba=paginas&ver=linktridi")');
  });;
});
