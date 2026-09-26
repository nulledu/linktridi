"use client";
import "./kit-heroui.css";

import { ColorArea, ColorField, ColorSlider, ColorSwatchPicker, Label, parseColor } from "@heroui/react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Panel, useFolha } from "../GlassPicker";

// ── Colors (HeroUI v3) ──────────────────────────────────────────────────────
// Escolher cor no app era um <input type="color"> cru: a janela do sistema
// operacional, diferente em cada navegador e inalcançável no celular. Aqui a
// ColorArea + ColorSlider (matiz) + ColorField (hex) do HeroUI montados NA TELA,
// sem popover — cor escolhe-se olhando o resultado, e folha por cima cobriria
// justamente o que está sendo pintado. A API fala hex string: é o que o banco
// guarda (destaque, cor de marca, criativo).

const hexOk = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** Seletor de cor completo: área saturação×brilho, faixa de matiz e o hex. */
export function SeletorCor({ valor, aoMudar, rotulo = "Cor", className }: {
  valor: string;
  aoMudar: (hex: string) => void;
  rotulo?: string;
  className?: string;
}) {
  const cor = useMemo(() => parseColor(hexOk(valor) ? valor : "#7c5cff").toFormat("hsb"), [valor]);
  const emitir = (c: { toString: (f: "hex") => string } | null) => { if (c) aoMudar(c.toString("hex")); };
  // A ColorArea do React Aria escolhe tabIndex/aria-hidden dos dois inputs pela
  // modalidade do ponteiro, que o servidor não conhece — o HTML do SSR não bate
  // com o do navegador. Monta só depois da hidratação, no mesmo tamanho.
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  if (!montado) return <div className={["ui-cor", className].filter(Boolean).join(" ")} aria-hidden><div className="ui-cor__area" /></div>;
  return (
    <div className={["ui-cor", className].filter(Boolean).join(" ")}>
      <ColorArea
        aria-label={`${rotulo}: saturação e brilho`}
        className="ui-cor__area"
        value={cor}
        onChange={emitir}
        colorSpace="hsb"
        xChannel="saturation"
        yChannel="brightness"
      >
        <ColorArea.Thumb />
      </ColorArea>
      <ColorSlider aria-label={`${rotulo}: matiz`} className="ui-cor__matiz" channel="hue" colorSpace="hsb" value={cor} onChange={emitir}>
        <ColorSlider.Track>
          <ColorSlider.Thumb />
        </ColorSlider.Track>
      </ColorSlider>
      <ColorField className="ui-cor__hex" value={cor} onChange={emitir}>
        <Label>{rotulo}</Label>
        <ColorField.Group>
          <ColorField.Prefix>
            <span className="ui-cor__amostra" style={{ background: hexOk(valor) ? valor : undefined }} aria-hidden />
          </ColorField.Prefix>
          <ColorField.Input />
        </ColorField.Group>
      </ColorField>
    </div>
  );
}

/** Paleta fechada: escolhe UMA entre as amostras (destaque do tema, etiqueta). */
export function AmostrasCor({ valor, aoMudar, cores, rotulo = "Cor", formato = "circle" }: {
  valor: string;
  aoMudar: (hex: string) => void;
  cores: string[];
  rotulo?: string;
  formato?: "circle" | "square";
}) {
  return (
    <ColorSwatchPicker
      aria-label={rotulo}
      className="ui-amostras"
      variant={formato}
      value={hexOk(valor) ? valor : undefined}
      onChange={(c) => aoMudar(c.toString("hex"))}
    >
      {cores.map((c) => (
        <ColorSwatchPicker.Item key={c} color={c}>
          <ColorSwatchPicker.Swatch />
          <ColorSwatchPicker.Indicator />
        </ColorSwatchPicker.Item>
      ))}
    </ColorSwatchPicker>
  );
}

/** Versão compacta: uma amostra (alvo de 44px no toque) que abre o
 *  `SeletorCor` numa folha ancorada — portal, vira folha presa embaixo no
 *  celular. Substitui o `<input type="color">` que abria a janela do sistema.
 *  O campo de hex ao lado, quando a tela tem, continua sendo da tela. */
export function CampoCor({ valor, aoMudar, rotulo = "Cor", id, desligado, tamanho = 28, comHex, style, className }: {
  valor: string;
  aoMudar: (hex: string) => void;
  rotulo?: string;
  id?: string;
  desligado?: boolean;
  /** Lado da amostra visível, em px (o alvo de toque é sempre ≥ 44px). */
  tamanho?: number;
  /** Mostra o hex ao lado da amostra, dentro do gatilho. */
  comHex?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [ancora, setAncora] = useState<HTMLButtonElement | null>(null);
  const { vivo, classe } = useFolha(aberto);
  const cor = hexOk(valor) ? valor : "#000000";
  return (
    <>
      <button type="button" ref={setAncora} id={id} disabled={desligado}
        className={["ui-cor-gatilho", className].filter(Boolean).join(" ")}
        aria-label={`${rotulo}: ${cor}`} aria-haspopup="dialog" aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)} style={style}>
        <span className="ui-cor__amostra" style={{ background: cor, width: tamanho, height: tamanho }} aria-hidden />
        {comHex && <span className="ui-cor-gatilho__hex">{cor.toUpperCase()}</span>}
      </button>
      {vivo && (
        <Panel anchor={ancora} aberto={aberto} classe={classe} onClose={() => setAberto(false)} width={272}>
          <div style={{ padding: 12 }}>
            <SeletorCor valor={cor} aoMudar={aoMudar} rotulo={rotulo} />
          </div>
        </Panel>
      )}
    </>
  );
}
