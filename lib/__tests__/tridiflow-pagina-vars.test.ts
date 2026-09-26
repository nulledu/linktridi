import { describe, expect, it } from "vitest";
import { interpolar } from "../tridiflow";
import { PARAM_SESSAO, varsDaUrl } from "../tridiflow-pagina-runtime";

// `{{variavel}}` nos textos da página e o pré-preenchimento por URL.
//
// A invariante que não pode cair: a tag NUNCA chega ao visitante. Um
// "Olá, {{nome}}" vazando pra tela de quem veio do anúncio é pior que não ter
// personalização nenhuma — parece defeito, e defeito não vende.

describe("interpolar", () => {
  it("troca a variável pelo valor", () => {
    expect(interpolar("Olá, {{nome}}!", { nome: "Ana" })).toBe("Olá, Ana!");
  });

  it("variável desconhecida vira vazio, nunca a tag crua", () => {
    expect(interpolar("Olá, {{nome}}!", {})).toBe("Olá, !");
    expect(interpolar("Olá, {{nome}}!", {})).not.toContain("{{");
  });

  it("aceita espaço em volta do nome", () => {
    expect(interpolar("{{ nome }}", { nome: "Ana" })).toBe("Ana");
  });

  it("troca todas as ocorrências, não só a primeira", () => {
    expect(interpolar("{{a}}-{{a}}-{{a}}", { a: "x" })).toBe("x-x-x");
  });

  it("valor padrão depois da barra entra quando falta a variável", () => {
    expect(interpolar("Olá, {{nome|tudo bem}}?", {})).toBe("Olá, tudo bem?");
    expect(interpolar("Olá, {{nome|tudo bem}}?", { nome: "Ana" })).toBe("Olá, Ana?");
  });

  it("variável vazia também cai no padrão", () => {
    // `?nome=` na URL é o caso real: a chave existe e o valor não.
    expect(interpolar("{{nome|amigo}}", { nome: "" })).toBe("amigo");
  });

  it("texto sem tag nenhuma passa intacto", () => {
    expect(interpolar("Nada pra trocar aqui", { nome: "Ana" })).toBe("Nada pra trocar aqui");
  });

  it("compatível com o que já existia: sem padrão, o comportamento é o de antes", () => {
    // O chat usa esta mesma função desde antes do `|`. Se isto mudar, todo bot
    // publicado muda de texto junto.
    expect(interpolar("{{utm_source}}", { utm_source: "meta" })).toBe("meta");
    expect(interpolar("{{utm_source}}", {})).toBe("");
  });

  it("chave inválida não é tratada como tag", () => {
    expect(interpolar("{{ nome com espaço }}", { "nome com espaço": "x" })).toBe("{{ nome com espaço }}");
  });
});

describe("varsDaUrl", () => {
  it("lê chave livre — campanha usa a que quiser", () => {
    expect(varsDaUrl("?nome=Ana&oferta=50%25")).toEqual({ nome: "Ana", oferta: "50%" });
  });

  it("busca vazia devolve objeto vazio", () => {
    expect(varsDaUrl("")).toEqual({});
    expect(varsDaUrl("?")).toEqual({});
  });

  it("o parâmetro de sessão não vira variável de texto", () => {
    // Senão `{{tf_s}}` imprimiria o id da sessão dentro da página.
    const v = varsDaUrl(`?nome=Ana&${PARAM_SESSAO}=abc`);
    expect(v).toEqual({ nome: "Ana" });
  });

  it("chave estranha é ignorada", () => {
    expect(varsDaUrl("?a b=1&<script>=2&ok=3")).toEqual({ ok: "3" });
  });

  it("valor é limitado a 120 caracteres", () => {
    const v = varsDaUrl(`?x=${"a".repeat(500)}`);
    expect(v.x).toHaveLength(120);
  });

  it("caractere de controle é removido", () => {
    // Entram por %0A/%00 na URL e quebram o layout do texto.
    const v = varsDaUrl("?x=li%0Anha%00fim");
    expect(v.x).toBe("linhafim");
  });

  it("valor que sobra vazio não entra", () => {
    expect(varsDaUrl("?x=&y=%20%20&z=ok")).toEqual({ z: "ok" });
  });

  it("o valor entra como TEXTO — quem renderiza não aceita marcação", () => {
    // A defesa real é o renderizador não usar dangerouslySetInnerHTML; aqui só
    // se garante que nada é "sanitizado pela metade" e vira HTML meio escapado.
    const v = varsDaUrl("?nome=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E");
    expect(v.nome).toBe("<img src=x onerror=alert(1)>");
    expect(interpolar("Olá, {{nome}}", v)).toBe("Olá, <img src=x onerror=alert(1)>");
  });
});
