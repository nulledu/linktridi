// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Acoes, Botao, BotaoIcone, Campo, Campos, Esp, PainelLateral } from "../controles";

describe("Botao", () => {
  it("não dispara quando desabilitado", async () => {
    const aoClicar = vi.fn();
    render(<Botao disabled onClick={aoClicar}>Salvar</Botao>);
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(aoClicar).not.toHaveBeenCalled();
  });

  // O clique duplo em "Salvar" é como nascem pedidos duplicados. `carregando`
  // tem que BLOQUEAR, não só mostrar um giro.
  it("carregando bloqueia o segundo clique", async () => {
    const aoClicar = vi.fn();
    render(<Botao carregando onClick={aoClicar}>Salvar</Botao>);
    const b = screen.getByRole("button", { name: /Salvar/ });
    await userEvent.click(b);
    await userEvent.click(b);
    expect(aoClicar).not.toHaveBeenCalled();
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
  });

  it("variante e tamanho viram atributos que o CSS lê", () => {
    render(<Botao variante="perigo" tamanho="lg">Excluir</Botao>);
    const b = screen.getByRole("button", { name: "Excluir" });
    expect(b).toHaveAttribute("data-v", "perigo");
    expect(b).toHaveAttribute("data-t", "lg");
  });

  // `type="button"` é o padrão de propósito: um botão solto dentro de <form>
  // que herdasse `submit` enviaria o formulário ao ser clicado. Mas quem PRECISA
  // enviar tem que conseguir.
  it("nasce type=button e aceita ser submit", () => {
    const { rerender } = render(<Botao>A</Botao>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
    rerender(<Botao type="submit">A</Botao>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("botão só de ícone tem nome acessível", () => {
    render(<BotaoIcone icone="trash" titulo="Excluir item" />);
    expect(screen.getByRole("button", { name: "Excluir item" })).toBeInTheDocument();
  });
});

describe("Campo", () => {
  // Um `for` apontando pra id inexistente é PIOR que rótulo nenhum: o leitor de
  // tela lê o texto e não acha o campo, e clicar no rótulo não foca nada.
  it("amarra o rótulo ao controle quando recebe o id", async () => {
    render(<Campo label="Nome do criativo">{(id) => <input id={id} />}</Campo>);
    const campo = screen.getByLabelText("Nome do criativo");
    await userEvent.click(screen.getByText("Nome do criativo"));
    expect(campo).toHaveFocus();
  });

  it("sem render-prop NÃO inventa um htmlFor quebrado", () => {
    const { container } = render(<Campo label="Prefixo"><button>abrir</button></Campo>);
    expect(container.querySelector("label")).toBeNull();
    expect(screen.getByText("Prefixo")).toBeInTheDocument();
  });

  // Cor sozinha não comunica erro pra quem não distingue vermelho: a mensagem
  // precisa existir como texto e ser anunciada.
  it("erro aparece como texto anunciável e substitui a dica", () => {
    render(<Campo label="Código" dica="Opcional" erro="Esse código já existe.">{(id) => <input id={id} />}</Campo>);
    expect(screen.getByRole("alert")).toHaveTextContent("Esse código já existe.");
    expect(screen.queryByText("Opcional")).toBeNull();
  });

  it("Campos aceita quantos campos vierem", () => {
    const { container } = render(
      <Campos><Campo label="A">{(id) => <input id={id} />}</Campo><Campo label="B">{(id) => <input id={id} />}</Campo></Campos>,
    );
    expect(container.querySelectorAll(".ui-campo")).toHaveLength(2);
  });
});

describe("PainelLateral", () => {
  const abrir = (onFechar = vi.fn()) => {
    render(
      <PainelLateral titulo="Novo criativo" onFechar={onFechar}
        rodape={<Acoes><Esp /><Botao>Cancelar</Botao><Botao variante="primario">Salvar</Botao></Acoes>}>
        <input aria-label="Nome" />
      </PainelLateral>,
    );
    return onFechar;
  };

  it("é um diálogo modal com título ligado", () => {
    abrir();
    const d = screen.getByRole("dialog");
    expect(d).toHaveAttribute("aria-modal", "true");
    expect(within(d).getByRole("heading", { name: "Novo criativo" })).toBeInTheDocument();
  });

  it("trava a rolagem do fundo e devolve ao fechar", () => {
    const { unmount } = render(<PainelLateral titulo="X" onFechar={() => {}}>c</PainelLateral>);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  // O bug que travava a página: a gaveta da pessoa (banco de horas) com um painel
  // aberto DENTRO dela. Fechando a gaveta, o React desmonta a árvore toda e roda
  // o cleanup do PAI antes do FILHO — cada um restaurando o overflow que salvou,
  // o de dentro ("hidden") por último. A página ficava travada até trocar de tela.
  it("painel dentro de painel: fechar os dois de uma vez devolve a rolagem", () => {
    const { unmount } = render(
      <PainelLateral titulo="Pessoa" onFechar={() => {}}>
        <PainelLateral titulo="Pagar horas" onFechar={() => {}}>régua</PainelLateral>
      </PainelLateral>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  // Um Esc fecha um painel. Os dois escutam o keydown no document e
  // `stopPropagation` não segura listener irmão — sem a pilha de camadas, o Esc
  // pedia pra fechar a gaveta E o painel de dentro no mesmo instante.
  it("Esc fecha só a camada de cima", async () => {
    const foraFechou = vi.fn(), dentroFechou = vi.fn();
    render(
      <PainelLateral titulo="Pessoa" onFechar={foraFechou}>
        <PainelLateral titulo="Pagar horas" onFechar={dentroFechou}>régua</PainelLateral>
      </PainelLateral>,
    );
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(dentroFechou).toHaveBeenCalled(), { timeout: 1500 });
    expect(foraFechou).not.toHaveBeenCalled();
  });

  it("fechar só o painel de dentro NÃO destrava o de fora", () => {
    const Ambos = ({ dentro }: { dentro: boolean }) => (
      <PainelLateral titulo="Pessoa" onFechar={() => {}}>
        {dentro && <PainelLateral titulo="Pagar horas" onFechar={() => {}}>régua</PainelLateral>}
      </PainelLateral>
    );
    const { rerender, unmount } = render(<Ambos dentro />);
    rerender(<Ambos dentro={false} />);
    expect(document.body.style.overflow).toBe("hidden");   // a gaveta segue aberta
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("Esc pede pra fechar", async () => {
    const onFechar = abrir();
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(onFechar).toHaveBeenCalled(), { timeout: 1500 });
  });

  it("o X pede pra fechar", async () => {
    const onFechar = abrir();
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await vi.waitFor(() => expect(onFechar).toHaveBeenCalled(), { timeout: 1500 });
  });

  // `aria-modal="true"` promete que só existe o diálogo. Se o Tab escapa pra
  // página atrás do véu, a promessa é mentira e o cursor some da vista.
  it("o Tab não escapa do painel", async () => {
    render(<><button>fora</button><PainelLateral titulo="X" onFechar={() => {}}><input aria-label="dentro" /></PainelLateral></>);
    const painel = screen.getByRole("dialog");
    for (let i = 0; i < 8; i++) {
      await userEvent.tab();
      expect(painel.contains(document.activeElement)).toBe(true);
    }
  });

  // Fechar um painel e ficar com o foco no <body> deixa quem usa teclado
  // perdido: o próximo Tab recomeça do topo da página.
  it("devolve o foco pra quem abriu", () => {
    render(<button>gatilho</button>);
    const gatilho = screen.getByRole("button", { name: "gatilho" });
    gatilho.focus();
    const { unmount } = render(<PainelLateral titulo="X" onFechar={() => {}}>c</PainelLateral>);
    unmount();
    expect(gatilho).toHaveFocus();
  });

  it("aberto={false} não renderiza nada", () => {
    render(<PainelLateral aberto={false} titulo="X" onFechar={() => {}}>c</PainelLateral>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

/**
 * DIGITAR DENTRO DO PAINEL TEM QUE FUNCIONAR.
 *
 * O `PainelLateral` rouba o foco de propósito quando abre — é o que faz o
 * leitor de tela entrar no diálogo em vez de continuar lendo a página atrás do
 * véu. O problema é QUANDO ele faz isso. Enquanto o efeito que trata foco e
 * Tab listava `fechar` nas dependências, e `fechar` derivava de um `onFechar`
 * inline (`onFechar={() => setRascunho(null)}`, que é como todas as telas
 * chamam), o efeito rodava de novo A CADA RENDER DO PAI.
 *
 * Como todo formulário daqui é controlado, cada tecla re-renderiza o pai. O
 * resultado, na mão de quem usa: o campo aceita UMA letra e para. A segunda
 * tecla ia para o `<aside>`, não para o input.
 *
 * Este teste digita mais de uma letra. É o mínimo que a versão quebrada não
 * passava — e nenhum `tsc` ou teste de tipo enxergaria isso.
 */
describe("PainelLateral · digitar", () => {
  function FormularioDeProva() {
    const [valor, setValor] = useState("");
    // Inline DE PROPÓSITO: é assim que todas as telas do app chamam, e é
    // justamente o que criava a função nova a cada render.
    return (
      <PainelLateral titulo="Nova pessoa" onFechar={() => setValor("")}>
        <Campos>
          <Campo label="Nome">
            {(id) => <input id={id} value={valor} onChange={(e) => setValor(e.target.value)} />}
          </Campo>
        </Campos>
      </PainelLateral>
    );
  }

  it("aceita a palavra inteira, e não só a primeira letra", async () => {
    render(<FormularioDeProva />);
    const campo = screen.getByLabelText("Nome");

    await userEvent.click(campo);
    await userEvent.keyboard("Caio Martins");

    expect(campo).toHaveValue("Caio Martins");
    // O foco continua NO CAMPO — o painel não pode tê-lo puxado de volta no
    // meio da digitação.
    expect(document.activeElement).toBe(campo);
  });
});
