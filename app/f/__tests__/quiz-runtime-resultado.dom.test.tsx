import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuizRuntime } from "../QuizRuntime";
import { THEME_PADRAO } from "@/lib/tridiflow";
import type { Quiz } from "@/lib/tridiflow-quiz";

afterEach(cleanup);

// TRAVA ponta a ponta do resultado ponderado: responde no player e a etapa de
// oferta tem que mostrar o diagnóstico do perfil vencedor — não a oferta única.
// É o único teste de DOM do QuizRuntime; o resto do runtime é coberto pelo
// modelo (tridiflow-quiz*.test.ts).

function quiz(): Quiz {
  return {
    titulo: "T",
    resultados: [
      { id: "ra", titulo: "Você é Perfil A", cta: "Quero A", destino: "https://a" },
      { id: "rb", titulo: "Você é Perfil B", cta: "Quero B" },
    ],
    steps: [
      {
        id: "s1", tipo: "single_choice", variavel: "q1", pergunta: "Escolha",
        opcoes: [
          { id: "o1", label: "Vai pra A", pontos: { ra: 5 } },
          { id: "o2", label: "Vai pra B", pontos: { rb: 5 } },
        ],
      },
      { id: "s2", tipo: "offer", titulo: "Oferta padrão", cta: "Continuar" },
    ],
  };
}

describe("QuizRuntime · resultado ponderado", () => {
  it("a opção escolhida decide o diagnóstico mostrado na oferta", async () => {
    render(<QuizRuntime quiz={quiz()} theme={THEME_PADRAO} altura="600px" previa />);
    // Começa na pergunta (não há capa neste funil de teste).
    fireEvent.click(screen.getByText("Vai pra A"));
    // A escolha única avança sozinha (~180ms) até a oferta.
    expect(await screen.findByText("Você é Perfil A")).toBeTruthy();
    // O título estático da oferta cedeu lugar ao do resultado.
    expect(screen.queryByText("Oferta padrão")).toBeNull();
    // E o CTA é o do resultado.
    expect(screen.getByText("Quero A")).toBeTruthy();
  });

  it("a outra opção leva ao outro diagnóstico", async () => {
    render(<QuizRuntime quiz={quiz()} theme={THEME_PADRAO} altura="600px" previa />);
    fireEvent.click(screen.getByText("Vai pra B"));
    expect(await screen.findByText("Você é Perfil B")).toBeTruthy();
    expect(screen.getByText("Quero B")).toBeTruthy();
  });

  it("mostrarResultado:false esconde o perfil e mostra a oferta fixa", async () => {
    render(<QuizRuntime quiz={{ ...quiz(), mostrarResultado: false }} theme={THEME_PADRAO} altura="600px" previa />);
    fireEvent.click(screen.getByText("Vai pra A"));
    expect(await screen.findByText("Oferta padrão")).toBeTruthy();  // texto fixo, não o perfil
    expect(screen.queryByText("Você é Perfil A")).toBeNull();
  });
});

describe("QuizRuntime · envio de currículo (upload)", () => {
  const q: Quiz = {
    titulo: "T",
    steps: [
      { id: "u", tipo: "upload", variavel: "curriculo", pergunta: "Envie seu currículo", ajuda: "PDF/DOC/DOCX", botao: "Concluir", obrigatorio: true },
      { id: "o", tipo: "offer", titulo: "Enviado!", cta: "Ok" },
    ],
  };

  it("anexar chama o uploader, grava a URL e libera o Concluir", async () => {
    const enviar = vi.fn(async (f: File) => ({ url: "/api/arquivos/curriculos/2026/09/abc.pdf", nome: f.name }));
    render(<QuizRuntime quiz={q} theme={THEME_PADRAO} altura="600px" enviarCurriculo={enviar} />);
    // Obrigatório e ainda sem arquivo → Concluir desabilitado.
    const concluir = screen.getByRole("button", { name: "Concluir" }) as HTMLButtonElement;
    expect(concluir.disabled).toBe(true);
    // Escolhe um PDF pelo input de arquivo escondido.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["%PDF-1.4"], "curriculo.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    // Uploader chamado; depois de resolver, mostra o nome e libera o botão.
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("curriculo.pdf")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Concluir" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("rejeita extensão fora de PDF/DOC/DOCX sem chamar o uploader", async () => {
    const enviar = vi.fn(async (f: File) => ({ url: "x", nome: f.name }));
    render(<QuizRuntime quiz={q} theme={THEME_PADRAO} altura="600px" enviarCurriculo={enviar} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "foto.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(enviar).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Envie um arquivo/);
  });
});

describe("QuizRuntime · nota (rating)", () => {
  const q: Quiz = {
    titulo: "T",
    steps: [
      { id: "r1", tipo: "rating", variavel: "nota", pergunta: "Que nota?", ratingMax: 5, ratingEstilo: "estrelas" },
      { id: "o", tipo: "offer", titulo: "Obrigado!", cta: "Ok" },
    ],
  };

  it("tocar numa estrela responde e avança pra oferta", async () => {
    render(<QuizRuntime quiz={q} theme={THEME_PADRAO} altura="600px" previa />);
    // As estrelas expõem aria-label "N de M".
    fireEvent.click(screen.getByLabelText("4 de 5"));
    expect(await screen.findByText("Obrigado!")).toBeTruthy();
  });
});
