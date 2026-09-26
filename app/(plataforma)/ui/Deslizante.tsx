"use client";
// Deslizante — o slider do kit.
//
// Porte da anatomia do `slider` do HeroUI Native (heroui.com/en/docs/native)
// pro idioma da casa: sem Tailwind, cor = a COR DA PESSOA (--primary via
// .ui-deslizante), tempo/curva por token, alvo de 44px. Substitui o
// `<input type="range">` cru que estava espalhado (aparência de loja, véu do
// TridiFlow, escurecer imagem…).
//
// Princípios portados do HeroUI Native:
//  - Revelação progressiva: `<Deslizante value onChange />` já funciona; label e
//    leitura de valor são props opcionais que crescem por cima.
//  - Comportamento previsível: value/onChange sempre em NÚMERO, igual às outras
//    peças de formulário do kit.
//
// Visual e foco moram em .ui-deslizante (app/globals.css). Aqui só a lógica.
import { useId } from "react";

type Props = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Rótulo acima do trilho. Sem ele, passe `aria-label`. */
  label?: React.ReactNode;
  /** Mostra o valor atual à direita do rótulo. `true` = número cru; função = formata. */
  mostrarValor?: boolean | ((v: number) => React.ReactNode);
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
};

export function Deslizante({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  mostrarValor,
  disabled,
  className,
  ...rest
}: Props) {
  const id = useId();
  // preenchimento do trilho (0–100%), clampado pra não vazar nas pontas
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  const leitura =
    typeof mostrarValor === "function" ? mostrarValor(value) : mostrarValor ? value : null;

  const input = (
    <input
      id={label ? id : undefined}
      type="range"
      className={className ? `ui-deslizante ${className}` : "ui-deslizante"}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ["--pct" as string]: `${pct}%` }}
      {...rest}
    />
  );

  if (!label && leitura == null) return input;

  return (
    <div className="ui-deslizante-campo">
      {(label || leitura != null) && (
        <div className="ui-deslizante-topo">
          {label ? <label htmlFor={id}>{label}</label> : <span />}
          {leitura != null && <span className="ui-deslizante-valor">{leitura}</span>}
        </div>
      )}
      {input}
    </div>
  );
}
