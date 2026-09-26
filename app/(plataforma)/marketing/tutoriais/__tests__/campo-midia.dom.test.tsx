import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampoMidia, type AceitaCampoMidia, type MudancaMidia } from "../editor/CampoMidia";

// A capa do vídeo sai de um <video> decodificado, e o jsdom não decodifica
// nada. O teste decide o que a captura devolve; a versão real — que no jsdom
// cai em `null` sem quebrar — tem teste próprio no fim do arquivo.
const { capaFalsa } = vi.hoisted(() => ({ capaFalsa: vi.fn(async (_f: File): Promise<File | null> => null) }));
vi.mock("../../../ui/midia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../ui/midia")>()),
  capaDoVideo: capaFalsa,
}));

const MB = 1024 * 1024;
const ASSINADA = "https://storage.exemplo/object/upload/sign/photos/x?token=t";
const NOSSO = "https://x.supabase.co/storage/v1/object/public/photos/tridiflow/tutoriais/2026/09";
const FOTO_PUBLICA = `${NOSSO}/foto.webp`;
const VIDEO_PUBLICO = `${NOSSO}/passo.mp4`;
const CAPA_PUBLICA = `${NOSSO}/passo-capa.webp`;

/** XHR de mentira: o teste decide quando o envio progride, termina ou para. */
class XhrFalso {
  static todos: XhrFalso[] = [];
  metodo = "";
  url = "";
  cabecalhos: Record<string, string> = {};
  corpo: unknown = null;
  status = 0;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() { XhrFalso.todos.push(this); }
  open(metodo: string, url: string) { this.metodo = metodo; this.url = url; }
  setRequestHeader(nome: string, valor: string) { this.cabecalhos[nome.toLowerCase()] = valor; }
  send(corpo: unknown) { this.corpo = corpo; }
  abort() { this.onabort?.(); }
  progredir(enviado: number, total: number) { this.upload.onprogress?.({ lengthComputable: true, loaded: enviado, total }); }
  terminar(status = 200) { this.status = status; this.onload?.(); }
}

const respostaDaRota = (publicUrl: string, tipo = "imagem") =>
  new Response(JSON.stringify({ signedUrl: ASSINADA, publicUrl, tipo }), { status: 200, headers: { "content-type": "application/json" } });
const criarFetch = () => vi.fn(async (_url: string, _init?: RequestInit) => respostaDaRota(FOTO_PUBLICA));
let fetchFalso = criarFetch();

beforeEach(() => {
  XhrFalso.todos = [];
  capaFalsa.mockReset();
  capaFalsa.mockResolvedValue(null);
  fetchFalso = criarFetch();
  vi.stubGlobal("fetch", fetchFalso);
  vi.stubGlobal("XMLHttpRequest", XhrFalso);
});
afterEach(() => { vi.unstubAllGlobals(); });

const foto = () => new File(["x".repeat(2048)], "capa.jpg", { type: "image/jpeg" });

/** O campo é controlado: aqui faz o papel do formulário que guarda o valor. */
function Pai({ aceita, url = "", capaUrl = "", onMudar, onAlt }: {
  aceita: AceitaCampoMidia; url?: string; capaUrl?: string;
  onMudar: (m: MudancaMidia) => void; onAlt?: (alt: string) => void;
}) {
  const [m, setM] = useState({ url, capaUrl });
  const [alt, setAlt] = useState("");
  return (
    <CampoMidia rotulo="Mídia do passo" aceita={aceita} url={m.url} capaUrl={m.capaUrl} alt={alt}
      onMudar={(x) => { onMudar(x); setM({ url: x.url, capaUrl: x.capaUrl }); }}
      onAlt={onAlt && ((a) => { onAlt(a); setAlt(a); })} />
  );
}

describe("campo de mídia do tutorial", () => {
  it("oferece o botão certo pra cada tipo de campo", () => {
    const { rerender } = render(<CampoMidia rotulo="Capa" aceita="imagem" url="" onMudar={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Capa" })).toBeInTheDocument();
    const soFoto = screen.getByLabelText("Enviar foto");
    expect(soFoto).toHaveAttribute("type", "file");
    expect(soFoto.getAttribute("accept")).toContain("image/jpeg");
    expect(soFoto.getAttribute("accept")).not.toContain("video/");
    expect(screen.getByRole("button", { name: "Colar link" })).toBeInTheDocument();

    rerender(<CampoMidia rotulo="Capa" aceita="video" url="" onMudar={vi.fn()} />);
    expect(screen.getByLabelText("Enviar vídeo")).toHaveAttribute("accept", "video/mp4,video/webm");

    rerender(<CampoMidia rotulo="Capa" aceita="imagem-ou-video" url="" onMudar={vi.fn()} />);
    const qualquer = screen.getByLabelText("Enviar foto ou vídeo").getAttribute("accept") ?? "";
    expect(qualquer).toContain("image/webp");
    expect(qualquer).toContain("video/mp4");
  });

  it("escolher uma foto sobe direto ao Storage, mostra o progresso e grava o endereço público", async () => {
    const mudar = vi.fn();
    render(<Pai aceita="imagem" onMudar={mudar} />);
    const arquivo = foto();
    fireEvent.change(screen.getByLabelText("Enviar foto"), { target: { files: [arquivo] } });

    await waitFor(() => expect(XhrFalso.todos).toHaveLength(1));
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const [rota, init] = fetchFalso.mock.calls[0];
    expect(rota).toBe("/api/tridiflow/tutoriais/upload-url");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ mime: "image/jpeg", tamanho: arquivo.size });

    const xhr = XhrFalso.todos[0];
    expect(xhr.metodo).toBe("PUT");
    expect(xhr.url).toBe(ASSINADA);
    expect(xhr.cabecalhos["content-type"]).toBe("image/jpeg");
    // jsdom não tem createImageBitmap: a compressão devolve o original, sem quebrar.
    expect(xhr.corpo).toBe(arquivo);

    act(() => xhr.progredir(42, 100));
    expect(screen.getByText("Enviando… 42%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");

    await act(async () => { xhr.terminar(200); });
    await waitFor(() => expect(mudar).toHaveBeenCalledWith({ url: FOTO_PUBLICA, capaUrl: "", tipo: "imagem" }));
    expect(mudar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("Foto")).toBeInTheDocument();
  });

  it("vídeo enviado grava na hora e depois ganha a capa tirada do primeiro quadro", async () => {
    capaFalsa.mockResolvedValue(new File(["capa"], "passo-capa.webp", { type: "image/webp" }));
    fetchFalso
      .mockImplementationOnce(async () => respostaDaRota(VIDEO_PUBLICO, "video"))
      .mockImplementationOnce(async () => respostaDaRota(CAPA_PUBLICA));
    const mudar = vi.fn();
    render(<Pai aceita="imagem-ou-video" onMudar={mudar} />);
    const video = new File(["v".repeat(4096)], "passo.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText("Enviar foto ou vídeo"), { target: { files: [video] } });

    await waitFor(() => expect(XhrFalso.todos).toHaveLength(1));
    expect(capaFalsa).toHaveBeenCalledWith(video);
    await act(async () => { XhrFalso.todos[0].terminar(200); });
    expect(mudar).toHaveBeenNthCalledWith(1, { url: VIDEO_PUBLICO, capaUrl: "", tipo: "video" });

    await waitFor(() => expect(XhrFalso.todos).toHaveLength(2));
    expect(screen.getByText("Gerando capa…")).toBeInTheDocument();
    expect(XhrFalso.todos[1].cabecalhos["content-type"]).toBe("image/webp");
    await act(async () => { XhrFalso.todos[1].terminar(200); });
    await waitFor(() => expect(mudar).toHaveBeenLastCalledWith({ url: VIDEO_PUBLICO, capaUrl: CAPA_PUBLICA, tipo: "video" }));
    expect(screen.getByText("Vídeo enviado")).toBeInTheDocument();
  });

  it("vídeo acima do teto é recusado no próprio campo, sem chamar a rota", async () => {
    const mudar = vi.fn();
    render(<Pai aceita="video" onMudar={mudar} />);
    const grande = new File(["v"], "passo.mp4", { type: "video/mp4" });
    Object.defineProperty(grande, "size", { value: 64 * MB });
    fireEvent.change(screen.getByLabelText("Enviar vídeo"), { target: { files: [grande] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Vídeo de 64 MB passa do limite de 20 MB");
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(XhrFalso.todos).toHaveLength(0);
    expect(mudar).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Enviar vídeo")).toBeInTheDocument();
  });

  it("colar um link do YouTube grava como link e mostra a etiqueta e a miniatura do YouTube", () => {
    const mudar = vi.fn();
    const { container } = render(<Pai aceita="video" onMudar={mudar} />);
    fireEvent.click(screen.getByRole("button", { name: "Colar link" }));
    const campo = screen.getByLabelText("Link do vídeo");
    expect(campo).toHaveFocus();
    fireEvent.change(campo, { target: { value: "youtu.be/dQw4w9WgXcQ" } });
    fireEvent.keyDown(campo, { key: "Enter" });

    expect(mudar).toHaveBeenCalledWith({ url: "https://youtu.be/dQw4w9WgXcQ", capaUrl: "", tipo: "link" });
    expect(screen.getByText("YouTube")).toBeInTheDocument();
    expect(container.querySelector(".cte-midia-mini img")).toHaveAttribute("src", "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("link que não abre como vídeo mostra o erro no lugar e não grava nada", () => {
    const mudar = vi.fn();
    render(<Pai aceita="imagem-ou-video" onMudar={mudar} />);
    fireEvent.click(screen.getByRole("button", { name: "Colar link" }));
    const campo = screen.getByLabelText("Link da foto ou do vídeo");
    fireEvent.change(campo, { target: { value: "https://minhaloja.com.br/produto/carimbo" } });
    fireEvent.click(screen.getByRole("button", { name: "Usar link" }));

    const erro = "Esse link não abre como vídeo. Use um link do YouTube, do Vimeo ou de um arquivo .mp4.";
    expect(screen.getByRole("alert")).toHaveTextContent(erro);
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo).toHaveAccessibleDescription(erro);
    expect(mudar).not.toHaveBeenCalled();
  });

  it("Remover limpa o campo e devolve a escolha", () => {
    const mudar = vi.fn();
    render(<Pai aceita="imagem" url={FOTO_PUBLICA} onMudar={mudar} />);
    expect(screen.getByText("Foto")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));

    expect(mudar).toHaveBeenCalledWith({ url: "", capaUrl: "", tipo: "vazio" });
    expect(screen.getByText("Enviar foto")).toBeInTheDocument();
    expect(screen.queryByText("Foto")).toBeNull();
  });

  it("Trocar mantém a mídia atual até a nova chegar, e o erro do servidor fica no campo", async () => {
    fetchFalso.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ error: "Sua conta não tem acesso aos Tutoriais." }), { status: 403 }));
    const mudar = vi.fn();
    render(<Pai aceita="imagem" url={FOTO_PUBLICA} onMudar={mudar} />);
    fireEvent.click(screen.getByRole("button", { name: "Trocar" }));
    expect(screen.getByText("Foto")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Enviar foto"), { target: { files: [foto()] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Sua conta não tem acesso aos Tutoriais.");
    expect(mudar).not.toHaveBeenCalled();
    expect(screen.getByText("Foto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manter a atual" })).toBeInTheDocument();
  });

  it("Cancelar interrompe o envio e o campo volta como estava, sem erro", async () => {
    const mudar = vi.fn();
    render(<Pai aceita="imagem" onMudar={mudar} />);
    fireEvent.change(screen.getByLabelText("Enviar foto"), { target: { files: [foto()] } });
    await waitFor(() => expect(XhrFalso.todos).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("Enviar foto")).toBeInTheDocument();
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mudar).not.toHaveBeenCalled();
  });

  it("arrastar um arquivo pro campo acende a área e envia pelo mesmo caminho do botão", async () => {
    render(<Pai aceita="imagem" onMudar={vi.fn()} />);
    const grupo = screen.getByRole("group", { name: "Mídia do passo" });
    fireEvent.dragOver(grupo, { dataTransfer: { types: ["Files"], files: [] } });
    expect(grupo).toHaveAttribute("data-sobre", "1");

    fireEvent.drop(grupo, { dataTransfer: { types: ["Files"], files: [foto()] } });
    expect(grupo).not.toHaveAttribute("data-sobre");
    await waitFor(() => expect(fetchFalso).toHaveBeenCalledTimes(1));
  });

  it("a descrição da imagem chama onAlt, e só existe pra foto", () => {
    const alt = vi.fn();
    const { unmount } = render(<Pai aceita="imagem" url={FOTO_PUBLICA} onMudar={vi.fn()} onAlt={alt} />);
    const campo = screen.getByLabelText("Descrição da imagem");
    expect(campo).toHaveAccessibleDescription("Pra quem usa leitor de tela — diga o que a foto mostra.");
    fireEvent.change(campo, { target: { value: "Carimbo encostado no tecido" } });
    expect(alt).toHaveBeenCalledWith("Carimbo encostado no tecido");
    expect(campo).toHaveValue("Carimbo encostado no tecido");
    unmount();

    render(<Pai aceita="video" url="https://youtu.be/dQw4w9WgXcQ" onMudar={vi.fn()} onAlt={alt} />);
    expect(screen.queryByLabelText("Descrição da imagem")).toBeNull();
  });

  it("no jsdom, comprimir e tirar a capa caem no original/nulo sem quebrar", async () => {
    const real = await vi.importActual<typeof import("../../../ui/midia")>("../../../ui/midia");
    const png = new File(["x"], "tela.png", { type: "image/png" });
    expect(await real.comprimirImagem(png)).toBe(png);
    expect(await real.capaDoVideo(new File(["v"], "passo.mp4", { type: "video/mp4" }))).toBeNull();
  });
});
