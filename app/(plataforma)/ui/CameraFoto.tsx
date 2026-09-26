"use client";

// ── Tirar a foto do item aqui mesmo ──────────────────────────────────────────
//
// Cadastrar peça sem foto é o que faz o catálogo virar uma lista de nomes que
// ninguém reconhece: "Suporte L 40mm" e "Suporte L 45mm" são a mesma linha para
// quem está na prateleira com a peça na mão. A foto responde a pergunta que o
// nome não responde — que peça é esta? — e é por isso que ela vem ANTES do
// resto no cadastro, e não como um anexo opcional no fim.
//
// ── POR QUE NÃO BASTA O `<input type="file" accept="image/*">` ──────────────
//
// No celular ele até abre a câmera. No computador da bancada — que é onde o
// galpão cadastra — ele abre o seletor de ARQUIVOS: a pessoa precisaria
// fotografar com o telefone, mandar para a máquina e procurar o arquivo. Na
// prática, ninguém faz, e o item entra sem foto.
//
// Aqui a câmera da própria máquina abre dentro da tela, com um botão grande. O
// `<input type="file">` continua existindo ao lado, para quem já tem a imagem
// pronta no computador — os dois caminhos, porque nenhum dos dois serve a
// todo mundo.
//
// ── A PERMISSÃO ─────────────────────────────────────────────────────────────
//
// `getUserMedia` exige HTTPS (ou localhost) e uma autorização do navegador.
// As duas falhas se parecem — tela preta, nada acontece — e nenhuma se explica
// sozinha. Por isso cada uma tem sua frase: negada é gesto da pessoa, e tem
// conserto no cadeado da barra de endereço; sem HTTPS é a rede, e aí a foto vem
// pelo arquivo mesmo.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { Botao } from "./controles";

type Estado = "abrindo" | "mirando" | "conferindo" | "erro";

/** Lado maior da foto guardada. Ver a nota em `capturar`. */
const LADO_MAXIMO = 1280;
const QUALIDADE = 0.82;

export function CameraFoto({
  titulo = "Foto do item",
  onFoto,
  onFechar,
}: {
  titulo?: string;
  /** O arquivo JPEG pronto para subir. */
  onFoto: (arquivo: File) => void | Promise<void>;
  onFechar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<Estado>("abrindo");
  const [erro, setErro] = useState("");
  const [previa, setPrevia] = useState<{ url: string; arquivo: File } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const desligar = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setEstado("erro");
        setErro("Este navegador não abre a câmera. Use “Enviar arquivo” com uma foto já tirada.");
        return;
      }
      try {
        // `environment` é a câmera de TRÁS: no tablet do galpão, a da frente
        // aponta para o teto enquanto a peça está na bancada. `ideal` e não
        // `exact` porque o computador da bancada só tem uma câmera, e `exact`
        // faria a chamada falhar ali em vez de usar a que existe.
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
        if (!vivo) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
        setEstado("mirando");
      } catch (e) {
        if (!vivo) return;
        const nome = (e as { name?: string })?.name ?? "";
        setEstado("erro");
        setErro(
          nome === "NotAllowedError"
            ? "A câmera foi bloqueada para este site. Libere no cadeado da barra de endereço e abra de novo — ou use “Enviar arquivo”."
            : nome === "NotFoundError"
              ? "Nenhuma câmera encontrada nesta máquina. Use “Enviar arquivo” com uma foto já tirada."
              : typeof window !== "undefined" && !window.isSecureContext
                ? "A câmera só abre em HTTPS. Neste endereço, mande a foto por arquivo."
                : "Não deu para abrir a câmera. Use “Enviar arquivo” com uma foto já tirada.",
        );
      }
    })();
    return () => { vivo = false; desligar(); };
  }, [desligar]);

  // O objeto de URL da prévia é liberado ao trocar/sair: sem isto, cada foto
  // repetida deixa um blob preso na memória da aba, e o cadastro do galpão é
  // uma tela que fica aberta a manhã inteira.
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa.url); }, [previa]);

  /**
   * O quadro vira JPEG de 1280px no lado maior.
   *
   * A câmera entrega 1920×1080 e o PNG cru de um quadro desses passa de 3 MB —
   * para uma foto que a tela mostra num quadrado de 90px e o celular do galpão
   * baixa pelo 4G. 1280 continua nítido no zoom de conferência e cabe em ~200 KB.
   */
  const capturar = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const escala = Math.min(1, LADO_MAXIMO / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * escala);
    c.height = Math.round(v.videoHeight * escala);
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      if (!b) return;
      const arquivo = new File([b], `item-${Date.now()}.jpg`, { type: "image/jpeg" });
      setPrevia({ url: URL.createObjectURL(arquivo), arquivo });
      setEstado("conferindo");
    }, "image/jpeg", QUALIDADE);
  }, []);

  async function usar() {
    if (!previa || enviando) return;
    setEnviando(true);
    try { await onFoto(previa.arquivo); onFechar(); }
    finally { setEnviando(false); }
  }

  const corpo = (
    <div
      className="apple-backdrop"
      onClick={onFechar}
      style={{ display: "grid", placeItems: "center", padding: 12 }}
    >
      <div
        className="apple-modal glass sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 100%)", maxHeight: "92dvh", overflowY: "auto", borderRadius: "var(--r-lg)", padding: 14, display: "grid", gap: 12 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{titulo}</h2>
          <button
            type="button" onClick={onFechar} title="Fechar"
            className="ui-toque"
            style={{ marginLeft: "auto", width: 40, height: 40, borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "grid", placeItems: "center" }}
          >
            <Icon name="x" size={18} color="var(--text)" />
          </button>
        </div>

        {estado === "erro" ? (
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--text)" }}>{erro}</p>
        ) : (
          <div style={{ position: "relative", borderRadius: "var(--r-md)", overflow: "hidden", background: "#000", aspectRatio: "4 / 3" }}>
            {/* O vídeo continua montado durante a conferência: desmontá-lo
                pararia o fluxo, e "repetir" teria de pedir a câmera de novo —
                com um novo pedido de permissão em alguns navegadores. */}
            <video
              ref={videoRef} playsInline muted
              style={{ width: "100%", height: "100%", objectFit: "cover", display: previa ? "none" : "block" }}
            />
            {previa && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previa.url} alt="Foto que acabou de ser tirada" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
            {estado === "abrindo" && (
              <p style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", margin: 0, color: "#fff", fontSize: 13 }}>
                abrindo a câmera…
              </p>
            )}
          </div>
        )}

        {/* Os botões ficam FORA da moldura do vídeo: sobre a imagem, o dedo
            cobre justamente a peça que a pessoa está enquadrando. */}
        {estado === "conferindo" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 8 }}>
            <Botao type="button" variante="sutil" icone="refresh" onClick={() => { setPrevia(null); setEstado("mirando"); }}>
              Tirar outra
            </Botao>
            <Botao type="button" icone="check" carregando={enviando} onClick={() => void usar()}>
              Usar esta foto
            </Botao>
          </div>
        ) : estado === "mirando" ? (
          <Botao type="button" icone="camera" onClick={capturar}>Tirar foto</Botao>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(corpo, document.body);
}
