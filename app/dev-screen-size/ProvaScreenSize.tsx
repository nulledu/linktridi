"use client";

import { useEffect, useState } from "react";
import { Icon } from "../(plataforma)/Icon";
import { BlocoDeCodigo } from "../(plataforma)/ui/BlocoDeCodigo";
import { FAIXAS, PISO_DA_FAIXA, useScreenSize, type Faixa } from "../(plataforma)/ui/useMediaQuery";

const ICONE: Record<Faixa, string> = {
  xs: "device-mobile", sm: "device-mobile", md: "device-tv", lg: "device-desktop", xl: "device-desktop", "2xl": "device-desktop",
};

const EXEMPLO = `const faixa = useScreenSize()

faixa.equals("md")        // true/false
faixa.lessThan("lg")      // true/false
faixa.greaterThan("sm")   // true/false
faixa.toString()          // "xs" | "sm" | "md" | "lg" | "xl" | "2xl"`;

export function ProvaScreenSize() {
  const faixa = useScreenSize();
  const [largura, setLargura] = useState(0);

  useEffect(() => {
    const on = () => setLargura(window.innerWidth);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const atual = faixa.toString();

  return (
    <main style={{ padding: "24px 16px", maxWidth: 960, margin: "0 auto" }}>
      <div className="page-head">
        <h1>useScreenSize</h1>
        <p className="sub">Redimensione a janela: a faixa muda só quando cruza um corte.</p>
      </div>

      <div className="duo-eq" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 16 }}>
        {/* `alignContent: "start"`: sendo grid dentro de um `.duo*`, esta seção
            estica até a altura da irmã, e o `stretch` padrão repartiria a sobra
            entre as linhas em vez de deixá-la no fim. Ver
            `lib/__tests__/duo-nao-estica-linhas.test.ts`. */}
        <section className="glass" style={{ padding: 20, borderRadius: 16, display: "grid", gap: 16, alignContent: "start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
            <strong style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.02em" }}>{atual}</strong>
            <Icon name={ICONE[atual]} size={28} />
          </div>
          <div style={{ textAlign: "center", opacity: 0.7, fontSize: 13 }}>Largura da janela: {largura}px</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {FAIXAS.map((f, i) => {
              const prox = FAIXAS[i + 1];
              const fim = prox ? `${PISO_DA_FAIXA[f]}px – ${PISO_DA_FAIXA[prox] - 1}px` : `${PISO_DA_FAIXA[f]}px+`;
              return (
                <li key={f} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "var(--tap)", padding: "0 12px", borderRadius: 10, background: faixa.equals(f) ? "color-mix(in oklab, var(--accent) 14%, transparent)" : "var(--surface)" }}>
                  <code>{f}</code>
                  <span style={{ fontSize: 13, opacity: 0.75 }}>{fim}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="glass" style={{ padding: 20, borderRadius: 16, display: "grid", gap: 12, alignContent: "start" }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>Como usar</h2>
          <p style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>
            Faixa ordinal com comparação tipada. Pra decisão binária, continue com <code>useIsMobile()</code>.
          </p>
          <BlocoDeCodigo codigo={EXEMPLO} linguagem="ts" />
        </section>
      </div>
    </main>
  );
}
