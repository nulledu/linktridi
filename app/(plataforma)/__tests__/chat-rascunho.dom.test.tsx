import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Composer } from "../central/mensagens/ui/Composer";
import { lerRascunho, gravarRascunho } from "../central/mensagens/data/rascunhos";
import type { Mensagem } from "@/lib/chat/tipos";

// Trocar de canal no meio de uma frase apagava a frase. O Composer é a mesma
// instância para todos os canais, então o rascunho é guardado pela CHAVE que
// sai (limpeza do efeito) e restaurado pela que entra.

const nada = () => {};
function Palco({ chave, editando = null }: { chave: string; editando?: Mensagem | null }) {
  return (
    <Composer canalNome="x" rascunhoChave={chave} respondendo={null} editando={editando} pessoas={[]}
      aoEnviar={nada} aoCancelarResposta={nada} aoCancelarEdicao={nada} aoDigitar={nada}
      aoSubir={() => Promise.reject(new Error("sem upload no teste"))} />
  );
}

const antiga = { id: "m1", texto: "mensagem antiga" } as Mensagem;

beforeEach(() => { localStorage.clear(); gravarRascunho("A", ""); gravarRascunho("B", ""); });
afterEach(() => { vi.useRealTimers(); });

// Editar uma mensagem usa o MESMO campo do rascunho. Antes o campo não sabia
// qual dos dois estava segurando: a primeira tecla da edição apagava o
// rascunho, salvar a edição também, cancelar deixava o texto velho no campo
// (um Enter e ele saía de novo, duplicado) e trocar de canal no meio guardava
// a mensagem antiga como rascunho.
describe("rascunho × edição de mensagem", () => {
  it("editar e salvar não apagam o rascunho do canal, que volta ao campo", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<Palco chave="A" />);
    const campo = () => container.querySelector("textarea")!;
    fireEvent.input(campo(), { target: { value: "rascunho meu" } });

    rerender(<Palco chave="A" editando={antiga} />);
    expect(campo().value).toBe("mensagem antiga");
    fireEvent.input(campo(), { target: { value: "mensagem antiga, corrigida" } });
    vi.advanceTimersByTime(1000);
    expect(lerRascunho("A")).toBe("rascunho meu");

    fireEvent.keyDown(campo(), { key: "Enter" });
    expect(lerRascunho("A")).toBe("rascunho meu");

    rerender(<Palco chave="A" editando={null} />);   // o Chat encerra a edição
    expect(campo().value).toBe("rascunho meu");
  });

  it("cancelar a edição devolve o rascunho, não o texto da mensagem", () => {
    const { container, rerender } = render(<Palco chave="A" />);
    const campo = () => container.querySelector("textarea")!;
    fireEvent.input(campo(), { target: { value: "rascunho meu" } });

    rerender(<Palco chave="A" editando={antiga} />);
    rerender(<Palco chave="A" editando={null} />);
    expect(campo().value).toBe("rascunho meu");
  });

  it("trocar de canal no meio da edição não guarda a mensagem como rascunho", () => {
    const { container, rerender } = render(<Palco chave="A" />);
    const campo = () => container.querySelector("textarea")!;

    rerender(<Palco chave="A" editando={antiga} />);
    rerender(<Palco chave="B" editando={null} />);   // abrirCanal zera a edição
    expect(lerRascunho("A")).toBe("");
    expect(campo().value).toBe("");
  });
});

describe("rascunho por conversa", () => {
  it("guarda ao trocar de canal e restaura ao voltar", () => {
    const { container, rerender } = render(<Palco chave="A" />);
    const campo = () => container.querySelector("textarea")!;
    fireEvent.input(campo(), { target: { value: "escrevendo pro Douglas" } });

    rerender(<Palco chave="B" />);
    expect(campo().value).toBe("");
    expect(lerRascunho("A")).toBe("escrevendo pro Douglas");

    rerender(<Palco chave="A" />);
    expect(campo().value).toBe("escrevendo pro Douglas");
  });

  it("enviar apaga o rascunho", () => {
    const { container } = render(<Palco chave="A" />);
    const campo = container.querySelector("textarea")!;
    fireEvent.input(campo, { target: { value: "vai" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(campo.value).toBe("");
    expect(lerRascunho("A")).toBe("");
  });

  it("texto só de espaço não vira rascunho", () => {
    const { container, rerender } = render(<Palco chave="A" />);
    fireEvent.input(container.querySelector("textarea")!, { target: { value: "   \n" } });
    rerender(<Palco chave="B" />);
    expect(lerRascunho("A")).toBe("");
  });
});
