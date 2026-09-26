// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InicioClient, type Destino } from "../inicio/InicioClient";
import { CommandPalette } from "../../CommandPalette";
import type { ModuleDef } from "@/lib/rbac";

const empurrar = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (h: string) => empurrar(h) }),
  usePathname: () => "/central",
}));

const SEM_BUSCA = { podeBuscarPessoas: false, podeBuscarEstoque: false, podeBuscarPedidos: false };

function inicio(destinos: Destino[]) {
  return render(<InicioClient nome="Caio" destinos={destinos} locais={[]} {...SEM_BUSCA} />);
}

describe("Card de destino do Início", () => {
  // O card só se justifica por responder ANTES do clique. Sem esta distinção
  // ele caía na frase descritiva sempre que a contagem dava zero — e uma frase
  // que descreve a aba é a aba de novo, na fileira logo abaixo dela.
  it("zerado diz que está zerado, em vez de repetir a descrição da aba", () => {
    inicio([{
      href: "/central/tarefas", icon: "checklist", titulo: "Tarefas",
      linha: "O que você tem pra fazer.", numero: 0, unidade: "em aberto",
      vazio: "Nada em aberto",
    }]);
    expect(screen.getByText("Nada em aberto")).toBeInTheDocument();
    expect(screen.queryByText("O que você tem pra fazer.")).not.toBeInTheDocument();
  });

  // Badge "0" treina a pessoa a ignorar badge: o estado zerado é uma frase.
  it("zerado não desenha o número 0", () => {
    inicio([{
      href: "/central/tarefas", icon: "checklist", titulo: "Tarefas",
      linha: "O que você tem pra fazer.", numero: 0, unidade: "em aberto",
      vazio: "Nada em aberto",
    }]);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("com número, mostra o número e a unidade", () => {
    inicio([{
      href: "/central/tarefas", icon: "checklist", titulo: "Tarefas",
      linha: "O que você tem pra fazer.", numero: 3, unidade: "em aberto",
      vazio: "Nada em aberto",
    }]);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("em aberto")).toBeInTheDocument();
  });

  // `numero: null` = destino sem contador (Meu ponto, Suporte). Aí a linha
  // descritiva é a resposta certa, e não pode virar "tudo em dia".
  it("destino sem contador continua na linha descritiva", () => {
    inicio([{
      href: "/central/suporte", icon: "lifebuoy", titulo: "Suporte",
      linha: "Como se faz cada coisa no sistema.", numero: null, unidade: null,
    }]);
    expect(screen.getByText("Como se faz cada coisa no sistema.")).toBeInTheDocument();
  });

  // A regra de `--pressao` da fundação casa `button` e filho de fileira; um
  // cartão numa grade não é nem um nem outro, e sem a classe o <a> fica mudo:
  // não acende no hover nem afunde no toque. jsdom não tem layout pra medir o
  // efeito — o que dá pra travar é o cartão não perder a classe.
  it("o cartão é marcado como alvo", () => {
    const { container } = inicio([{
      href: "/central/suporte", icon: "lifebuoy", titulo: "Suporte",
      linha: "Como se faz cada coisa no sistema.", numero: null, unidade: null,
    }]);
    expect(container.querySelector("a.ui-card-alvo")).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const MODULOS: ModuleDef[] = [
  { key: "estoque", label: "Estoque", href: "/estoque", icon: "package", roles: ["admin"], ready: true },
  { key: "analytics", label: "Analytics", href: "/analytics", icon: "chart-line", roles: ["admin"], ready: true },
];

// A paleta abre pelo ⌘K e pelo botão "Buscar…" da sidebar, que dispara este
// evento. `act` porque o `setOpen` mora num ouvinte de `window`, fora da árvore
// — sem ele o React não deu o quadro seguinte e o portal ainda não existe.
async function abrirPaleta() {
  render(<CommandPalette modules={MODULOS} />);
  await act(async () => { window.dispatchEvent(new Event("gaius:cmdk")); });
}

describe("Paleta ⌘K", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      json: async () => ({ itens: [
        { id: "ps_1", tipo: "pessoa", titulo: "Maria Souza", sub: "@maria · admin", href: "/colaboradores?busca=Maria", icon: "user" },
        { id: "tf_9", tipo: "tarefa", titulo: "Marcar reunião", sub: "Prazo 2026-08-20", href: "/central/tarefas", icon: "checklist" },
      ] }),
    })));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); empurrar.mockClear(); });

  // O motivo da mudança: a paleta achava SÓ página, e a barra do meio da
  // Central achava conteúdo pela mesma rota. Quem aprendia o atalho ficava com
  // a busca pior.
  it("acha conteúdo, não só página", async () => {
    await abrirPaleta();
    await userEvent.type(screen.getByPlaceholderText(/Buscar tarefa/i), "mar");
    await waitFor(() => expect(screen.getByText("Maria Souza")).toBeInTheDocument());
    expect(screen.getByText("Marcar reunião")).toBeInTheDocument();
  });

  it("o resultado remoto leva pra onde a busca mandou", async () => {
    await abrirPaleta();
    await userEvent.type(screen.getByPlaceholderText(/Buscar tarefa/i), "mar");
    await waitFor(() => expect(screen.getByText("Maria Souza")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Maria Souza"));
    expect(empurrar).toHaveBeenCalledWith("/colaboradores?busca=Maria");
  });

  // Uma letra não vai ao banco: são 2 de mínimo, iguais aos do Início e aos da
  // própria rota, que devolve lista vazia abaixo disso.
  it("uma letra só não chama o servidor", async () => {
    await abrirPaleta();
    await userEvent.type(screen.getByPlaceholderText(/Buscar tarefa/i), "m");
    await vi.advanceTimersByTimeAsync(600);
    expect(fetch).not.toHaveBeenCalled();
  });

  // Sem termo a paleta é o índice de módulos de sempre — e isso não pode
  // custar uma ida ao banco toda vez que alguém aperta ⌘K.
  it("abrir sem digitar não chama o servidor", async () => {
    await abrirPaleta();
    await vi.advanceTimersByTimeAsync(600);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText("Estoque")).toBeInTheDocument();
  });
});
