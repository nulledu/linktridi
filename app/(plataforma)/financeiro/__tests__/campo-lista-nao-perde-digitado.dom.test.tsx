import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRef, useState } from "react";
import { Telefones } from "../ui";

/**
 * O que a pessoa DIGITOU não pode ser jogado fora.
 *
 * O campo de telefone (e o de categorias) guarda o texto num estado LOCAL e só
 * o entrega ao cadastro quando alguém aperta Enter ou clica "Acrescentar".
 * Quem digita o número e clica direto em **Salvar** perde o valor — em
 * silêncio, com a tela dizendo "Cadastro salvo".
 *
 * Não é teoria: o log de auditoria da produção mostra CINCO edições seguidas
 * na "Associação Comercial Cerqueira" e duas na "CPFL", e as duas fichas com
 * telefone, e-mail e endereço vazios no banco. A escrita acontecia; o que ela
 * levava é que estava vazio.
 *
 * Três correções anteriores passaram longe disso porque testavam servidor,
 * rota e banco — e o dado nunca chegava a sair da tela.
 *
 * O `blur` sozinho NÃO resolve, e isso também foi medido no navegador: ele
 * grava, mas o manipulador do clique em "Salvar" é o da renderização anterior
 * e não enxerga o que acabou de entrar. Por isso o valor pendente vai para um
 * REF, lido no instante de montar o corpo — sem depender de nenhum quadro.
 */

function Prova() {
  const [lista, setLista] = useState<string[]>(["11 4538-5909"]);
  const pendente = useRef("");
  const [enviado, setEnviado] = useState<string[] | null>(null);

  /** O que o formulário faria ao salvar. */
  const comPendente = (l: string[], p: string) => {
    const novo = p.trim();
    if (!novo || l.some((x) => x.trim().toLowerCase() === novo.toLowerCase())) return l;
    return [...l, novo];
  };

  return (
    <>
      <Telefones escolhidas={lista} aoMudar={setLista} pendente={pendente} />
      <button type="button" onClick={() => setEnviado(comPendente(lista, pendente.current))}>Salvar</button>
      <output data-testid="enviado">{enviado === null ? "" : JSON.stringify(enviado)}</output>
    </>
  );
}

const campo = () => screen.getByPlaceholderText("(00) 90000-0000");
const salvar = () => screen.getByRole("button", { name: "Salvar" });
const enviado = () => screen.getByTestId("enviado").textContent;

describe("Digitar e clicar em Salvar", () => {
  it("guarda o número mesmo SEM clicar em Acrescentar", () => {
    render(<Prova />);
    fireEvent.change(campo(), { target: { value: "11 98888-0000" } });
    fireEvent.click(salvar());
    expect(JSON.parse(enviado()!)).toEqual(["11 4538-5909", "11 98888-0000"]);
  });

  it("não depende de o foco sair — nem de blur, nem de ordem de evento", () => {
    // Foi a tentativa que falhou no navegador: o blur grava, e o clique lê o
    // rascunho de antes.
    render(<Prova />);
    fireEvent.change(campo(), { target: { value: "11 97777-1111" } });
    fireEvent.click(salvar());   // sem blur nenhum
    expect(enviado()).toContain("11 97777-1111");
  });

  it("o caminho normal continua funcionando", () => {
    render(<Prova />);
    fireEvent.change(campo(), { target: { value: "11 96666-2222" } });
    fireEvent.click(screen.getByRole("button", { name: /Acrescentar/ }));
    fireEvent.click(salvar());
    expect(JSON.parse(enviado()!)).toEqual(["11 4538-5909", "11 96666-2222"]);
  });

  it("não duplica o que já virou etiqueta", () => {
    render(<Prova />);
    fireEvent.change(campo(), { target: { value: "11 95555-3333" } });
    fireEvent.click(screen.getByRole("button", { name: /Acrescentar/ }));
    // o campo limpa; se algo sobrasse, entraria duas vezes
    fireEvent.click(salvar());
    expect(JSON.parse(enviado()!)).toEqual(["11 4538-5909", "11 95555-3333"]);
  });

  it("sair do campo também guarda — quem digita e vai para o próximo", () => {
    render(<Prova />);
    fireEvent.change(campo(), { target: { value: "11 94444-5555" } });
    fireEvent.blur(campo());
    expect(screen.getByText("11 94444-5555")).toBeTruthy();
  });

  it("campo vazio não vira etiqueta em branco", () => {
    render(<Prova />);
    fireEvent.change(campo(), { target: { value: "   " } });
    fireEvent.click(salvar());
    expect(JSON.parse(enviado()!)).toEqual(["11 4538-5909"]);
  });

  it("repetido, mesmo com outra caixa, não entra de novo", () => {
    render(<Prova />);
    fireEvent.change(campo(), { target: { value: "  11 4538-5909  " } });
    fireEvent.click(salvar());
    expect(JSON.parse(enviado()!)).toEqual(["11 4538-5909"]);
  });
});

describe("As telas leem o pendente ao montar o corpo", () => {
  // `process.cwd()` e não `import.meta.url`: no jsdom a URL do módulo não é
  // `file:`, e `fileURLToPath` recusa. O vitest roda da raiz do repositório.
  const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it.each([
    "app/(plataforma)/financeiro/cadastros/contatos/ContatosClient.tsx",
    "app/(plataforma)/financeiro/cadastros/fornecedores/FornecedoresClient.tsx",
  ])("%s", (arquivo) => {
    const s = ler(arquivo);
    expect(s, "o campo não entrega o pendente").toContain("pendente={");
    expect(s, "o corpo ignora o que está digitado").toContain("comPendente(");
  });
});
