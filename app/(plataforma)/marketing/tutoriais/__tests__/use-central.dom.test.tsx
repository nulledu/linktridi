import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizarCentralTutoriais, normalizarTutorial } from "@/lib/tridiflow-tutoriais";
import type { CentralCompleta } from "@/lib/tridiflow-tutoriais-db";
import { useCentral } from "../editor/useCentral";

// O editor aplica cada operação NA HORA (a lista responde sem esperar a rede)
// e manda pro servidor UMA de cada vez. O que o servidor devolve vira a base, e
// o que ainda está na fila é reaplicado por cima — é isso que impede o
// "reordenei, a linha voltou e depois pulou de novo".
afterEach(() => { vi.unstubAllGlobals(); });

const central = (tutoriais: string[] = ["a"]): CentralCompleta => ({
  id: "c1", nome: "Central", slug: "central", status: "publicado", dominioId: null, host: "tridigaius.vercel.app",
  atualizadoEm: "2026-09-10T10:00:00.000Z", publicadoEm: "2026-09-10T10:00:00.000Z",
  doc: normalizarCentralTutoriais({ titulo: "Central", tutoriais: tutoriais.map((id, ordem) => ({ id, titulo: `Tutorial ${id}`, handle: id, ordem })) }),
});

/** Servidor falso: responde na ordem em que o teste mandar. */
function servidor() {
  const fila: { corpo: unknown; resolver: (r: Response) => void }[] = [];
  const fetcher = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolver) => {
    fila.push({ corpo: init?.body ? JSON.parse(String(init.body)) : null, resolver });
  }));
  const responder = (status: number, json: unknown) => fila.shift()!.resolver(new Response(JSON.stringify(json), { status }));
  return { fetcher, fila, responder };
}

describe("useCentral", () => {
  it("aplica a operação na hora e adota o documento do servidor quando ele responde", async () => {
    const s = servidor();
    const { result } = renderHook(() => useCentral(central(), { fetcher: s.fetcher as unknown as typeof fetch }));
    let promessa!: Promise<unknown>;
    act(() => { promessa = result.current.executar({ op: "excluirTutorial", id: "a" }); });
    expect(result.current.central.doc.tutoriais).toHaveLength(0);
    expect(result.current.salvamento.fase).toBe("salvando");
    const doServidor = { ...central([]), atualizadoEm: "2026-09-10T10:01:00.000Z" };
    await act(async () => { s.responder(200, { central: doServidor }); await promessa; });
    expect(result.current.central.atualizadoEm).toBe("2026-09-10T10:01:00.000Z");
    expect(result.current.salvamento.fase).toBe("salvo");
  });

  it("uma operação por vez; a segunda sai quando a primeira volta e nada se perde", async () => {
    const s = servidor();
    const { result } = renderHook(() => useCentral(central(["a", "b"]), { fetcher: s.fetcher as unknown as typeof fetch }));
    act(() => {
      void result.current.executar({ op: "excluirTutorial", id: "a" });
      void result.current.executar({ op: "excluirTutorial", id: "b" });
    });
    expect(result.current.central.doc.tutoriais).toHaveLength(0);
    expect(s.fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { s.responder(200, { central: central(["b"]) }); });
    // A base do servidor ainda tem o "b", mas a exclusão dele está na fila:
    // a tela não pode mostrá-lo de volta nem por um instante.
    expect(result.current.central.doc.tutoriais).toHaveLength(0);
    await waitFor(() => expect(s.fetcher).toHaveBeenCalledTimes(2));
    expect((s.fila[0].corpo as { op: { id: string } }).op.id).toBe("b");
    await act(async () => { s.responder(200, { central: central([]) }); });
    expect(result.current.central.doc.tutoriais).toHaveLength(0);
    expect(result.current.pendentes).toBe(0);
  });

  it("falha do servidor desfaz na tela e diz o motivo", async () => {
    const s = servidor();
    const { result } = renderHook(() => useCentral(central(["a"]), { fetcher: s.fetcher as unknown as typeof fetch }));
    let r: unknown;
    act(() => { void result.current.executar({ op: "excluirTutorial", id: "a" }).then((x) => { r = x; }); });
    await act(async () => { s.responder(400, { error: "Não deu." }); });
    await waitFor(() => expect(r).toEqual({ ok: false, erro: "Não deu." }));
    expect(result.current.central.doc.tutoriais.map((t) => t.id)).toEqual(["a"]);
    expect(result.current.salvamento).toMatchObject({ fase: "erro", mensagem: "Não deu." });
  });

  it("erro de quem edita (título vazio) volta na hora, sem ir pra rede", async () => {
    const s = servidor();
    const { result } = renderHook(() => useCentral(central(), { fetcher: s.fetcher as unknown as typeof fetch }));
    let r: unknown;
    await act(async () => { r = await result.current.executar({ op: "salvarTutorial", tutorial: normalizarTutorial({ id: "n", titulo: "" }) }); });
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining("título") });
    expect(s.fetcher).not.toHaveBeenCalled();
  });

  it("pôr no ar e endereço em uso", async () => {
    const s = servidor();
    const { result } = renderHook(() => useCentral({ ...central(), status: "rascunho" }, { fetcher: s.fetcher as unknown as typeof fetch }));
    let r: unknown;
    act(() => { void result.current.colocarNoAr().then((x) => { r = x; }); });
    await act(async () => { s.responder(200, { central: { ...central(), status: "publicado" } }); });
    await waitFor(() => expect(r).toEqual({ ok: true }));
    expect(result.current.central.status).toBe("publicado");
    act(() => { void result.current.mudarIdentidade({ slug: "ocupado" }).then((x) => { r = x; }); });
    await act(async () => { s.responder(409, { error: "Esse endereço já é de outro projeto neste domínio.", campo: "slug" }); });
    await waitFor(() => expect(r).toMatchObject({ ok: false, campo: "slug" }));
  });
});
