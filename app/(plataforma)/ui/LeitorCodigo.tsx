"use client";

// Leitor de código de barras pela câmera do aparelho, no navegador.
//
// DOIS MOTORES, e por quê:
//   1. `BarcodeDetector` nativo — Chrome/Edge (Android e desktop). Roda no
//      processo do navegador, é rápido e não custa bundle nenhum.
//   2. ZXing, carregado por `import()` SÓ quando o nativo não existe — Safari
//      (todo iPhone) e Firefox não têm BarcodeDetector. Sem este fallback o
//      botão abriria a câmera e nunca leria nada num iPhone, que é pior que
//      não ter o botão: parece que a câmera está quebrada.
//   O import é dinâmico de propósito: quem está no Chrome nunca baixa a lib.
//
// Exige HTTPS (ou localhost) — `getUserMedia` não existe em http. Em produção
// (Vercel) já é https; num IP da rede local por http o navegador nega e a
// mensagem abaixo explica, em vez de deixar a tela preta sem motivo.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { reduceScan, liberarRepeticao, SCAN_INICIAL, FORMATOS_PRODUTO, type ScanState } from "@/lib/scan-codigo";

type Estado = "abrindo" | "lendo" | "erro";

// O tipo não está no lib.dom padrão: declarado só o que se usa.
interface DetectorNativo { detect(fonte: CanvasImageSource): Promise<{ rawValue: string }[]> }
interface JanelaComDetector {
  BarcodeDetector?: {
    new (o?: { formats?: string[] }): DetectorNativo;
    getSupportedFormats?: () => Promise<string[]>;
  };
}

export function LeitorCodigo({
  titulo = "Ler código de barras",
  onLer,
  onFechar,
  continuo = false,
}: {
  titulo?: string;
  /** Chamado a cada código ACEITO (já passou pela janela anti-repetição). */
  onLer: (codigo: string) => void;
  onFechar: () => void;
  /** true = segue lendo (vários itens). false = lê um e fecha. */
  continuo?: boolean;
}) {
  /**
   * A proporção REAL do vídeo, lida do próprio quadro.
   *
   * A moldura era `aspectRatio: 4/3` fixo com `object-fit: cover`, e a câmera
   * entrega 16:9 — o vídeo saía CORTADO em ~25% nas laterais. Quem apontava
   * para um código perto da borda mirava numa área que a tela não estava
   * mostrando: a leitura falhava sem nada explicando por quê. No celular em pé
   * é pior, porque o sensor devolve retrato.
   *
   * Lendo do vídeo, a caixa passa a ter a forma do que a câmera de fato vê, e
   * `cover` deixa de cortar coisa nenhuma.
   */
  const [proporcao, setProporcao] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pararRef = useRef<(() => void) | null>(null);
  const scanRef = useRef<ScanState>(SCAN_INICIAL);
  const vivoRef = useRef(true);

  const [estado, setEstado] = useState<Estado>("abrindo");
  const [erro, setErro] = useState("");
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [motor, setMotor] = useState<"nativo" | "zxing" | null>(null);

  // Um código lido entra aqui e sai como "aceito" ou é engolido pela janela.
  //
  // Guardado num REF, e não em dependência do efeito: o pai quase sempre passa
  // `onLer={(c) => ...}` inline, que muda de identidade a cada render. Se isso
  // entrasse nas deps, o efeito remontaria — desligando e religando a câmera
  // várias vezes por segundo (tela piscando e NotReadableError).
  const aceitarRef = useRef<(bruto: string) => void>(() => {});
  aceitarRef.current = (bruto: string) => {
    const t = reduceScan(scanRef.current, bruto, Date.now());
    scanRef.current = t.estado;
    if (t.resultado.tipo !== "aceito") return;
    setUltimo(t.resultado.codigo);
    onLer(t.resultado.codigo);
    if (!continuo) onFechar();
  };
  const aceitar = useCallback((bruto: string) => aceitarRef.current(bruto), []);

  useEffect(() => {
    vivoRef.current = true;

    async function iniciar() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setEstado("erro");
        setErro(window.isSecureContext === false
          ? "A câmera só funciona em endereço seguro (https). Abra o sistema pelo endereço oficial, não pelo IP da rede."
          : "Este navegador não dá acesso à câmera.");
        return;
      }
      try {
        // `environment` = câmera de trás. No celular a frontal não alcança a
        // embalagem; `ideal` (e não `exact`) pra não falhar em notebook, que
        // só tem a frontal.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!vivoRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play().catch(() => { /* autoplay bloqueado: o poster segue */ });
        // `videoWidth` só existe depois dos metadados; `play()` já garante isso,
        // mas o listener cobre o caso do autoplay bloqueado, em que o quadro
        // chega depois.
        const medir = () => {
          if (v.videoWidth > 0 && v.videoHeight > 0) setProporcao(v.videoWidth / v.videoHeight);
        };
        medir();
        v.addEventListener("loadedmetadata", medir);
        setEstado("lendo");

        const W = window as unknown as JanelaComDetector;
        if (W.BarcodeDetector) {
          setMotor("nativo");
          lerComNativo(W, v);
        } else {
          setMotor("zxing");
          await lerComZxing(v);
        }
      } catch (e) {
        if (!vivoRef.current) return;
        setEstado("erro");
        const nome = (e as { name?: string })?.name || "";
        setErro(
          nome === "NotAllowedError" ? "Você bloqueou a câmera. Libere nas permissões do site e tente de novo."
          : nome === "NotFoundError" ? "Nenhuma câmera encontrada neste aparelho."
          : nome === "NotReadableError" ? "A câmera está ocupada por outro aplicativo. Feche-o e tente de novo."
          : "Não foi possível abrir a câmera.",
        );
      }
    }

    function lerComNativo(W: JanelaComDetector, v: HTMLVideoElement) {
      const Det = W.BarcodeDetector!;
      const det = new Det({ formats: [...FORMATOS_PRODUTO] });
      let raf = 0;
      const passo = async () => {
        if (!vivoRef.current) return;
        // readyState < 2 = ainda sem quadro; detectar aí lança InvalidStateError.
        if (v.readyState >= 2) {
          try {
            const achados = await det.detect(v);
            if (achados[0]?.rawValue) aceitar(achados[0].rawValue);
          } catch { /* quadro ruim: tenta o próximo */ }
        }
        raf = requestAnimationFrame(passo);
      };
      raf = requestAnimationFrame(passo);
      pararRef.current = () => cancelAnimationFrame(raf);
    }

    async function lerComZxing(v: HTMLVideoElement) {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (!vivoRef.current) return;
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoElement(v, (res) => {
        // Resultado que chega depois de fechar não tem mais dono.
        if (res && vivoRef.current) aceitar(res.getText());
      });
      // Fechou durante a largada: o cleanup já rodou sem ter o que parar.
      if (!vivoRef.current) { controls.stop(); return; }
      pararRef.current = () => controls.stop();
    }

    iniciar();

    return () => {
      // Soltar a câmera é obrigatório: sem isto a luz fica acesa e o próximo
      // "abrir" cai em NotReadableError (o aparelho vê a câmera ocupada).
      vivoRef.current = false;
      pararRef.current?.();
      pararRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [aceitar]);

  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [onFechar]);

  return createPortal(
    <div className="sheet-host" role="dialog" aria-modal="true" aria-label={titulo}
      style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(8,10,18,.72)", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}
        /* 560px e não 520: o vídeo 16:9 numa folha estreita virava uma faixa
           baixa demais pra enquadrar QR. E `overflow: hidden` no lugar de
           `auto` — com a caixa presa em 62dvh nada mais transborda, e a barra
           de rolagem aparecendo por um pixel era parte do "fica feio". */
        style={{ width: "min(560px, 100%)", maxHeight: "92dvh", overflow: "hidden", borderRadius: 18, background: "var(--bg)", border: "1px solid var(--border)", boxShadow: "0 24px 70px rgba(0,0,0,.55)" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{titulo}</span>
          <button onClick={onFechar} title="Fechar"
            style={{ display: "grid", placeItems: "center", minWidth: "var(--tap)", minHeight: "var(--tap)", border: "none", background: "none", cursor: "pointer" }}>
            <Icon name="x" size={20} color="var(--text-dim)" />
          </button>
        </div>

        <div style={{ padding: 16 }}>
          {estado === "erro" ? (
            <div style={{ display: "grid", gap: 10, justifyItems: "center", textAlign: "center", padding: "22px 8px" }}>
              <Icon name="alert-triangle" size={26} color="var(--text-dim)" />
              <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-dim)", margin: 0 }}>{erro}</p>
            </div>
          ) : (
            <>
              {/* A caixa tem a forma do que a câmera VÊ, não uma escolhida no
                  código. `contain` em vez de `cover`: com a proporção certa os
                  dois dariam no mesmo, mas `contain` é o que garante que NADA
                  seja cortado no instante entre abrir a câmera e medir o quadro
                  — e cortar é o defeito que estamos consertando. */}
              <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#000",
                aspectRatio: proporcao ? String(proporcao) : "4 / 3",
                maxHeight: "62dvh", margin: "0 auto" }}>
                <video ref={videoRef} playsInline muted autoPlay
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                {/* Mira: sem ela a pessoa não sabe onde encostar a embalagem e
                    fica varrendo a câmera pelo produto inteiro.

                    QUADRADA, e não 78%×38% como era. O código de barras é largo,
                    mas o QR é quadrado — e a etiqueta de prateleira do galpão é
                    QR. Uma moldura larga e baixa ensina a mirar errado: a pessoa
                    encaixa o QR na largura e ele sai por cima e por baixo.
                    Quadrada serve aos dois: a barra cabe folgada dentro dela. */}
                <div aria-hidden style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
                  <div style={{ width: "min(62%, 62cqmin)", aspectRatio: "1", border: "2px solid rgba(255,255,255,.92)", borderRadius: 14,
                    /* Sombra de 100vmax repintava a tela inteira a cada quadro
                       pra escurecer o fora da mira. `outline` de 50vmax faz o
                       mesmo escurecimento sem entrar no cálculo de layout. */
                    outline: "50vmax solid rgba(0,0,0,.32)" }} />
                </div>
                {estado === "abrindo" && (
                  <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontSize: 13, fontWeight: 700 }}>
                    Abrindo a câmera...
                  </div>
                )}
              </div>

              <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "12px 0 0", lineHeight: 1.5 }}>
                Encoste o código dentro da moldura — barras ou QR.
                {motor === "zxing" && " Neste navegador a leitura é um pouco mais lenta — segure firme por um instante."}
              </p>

              {ultimo && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "9px 11px", borderRadius: 10, background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}>
                  <Icon name="circle-check" size={15} color="var(--primary-texto)" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{ultimo}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
