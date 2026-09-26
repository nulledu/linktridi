"use client";

import { useId } from "react";

// ── Marca Gaius ──────────────────────────────────────────────────────────────
// Logo oficial: o "G" em fita (arte entregue pelo usuário, índigo #3802c2).
// Fonte única da identidade — login, sidebar, app e favicon usam este componente.
// THEME-AWARE via `currentColor`: a cor vem de var(--gaius-mark) (índigo da marca
// no claro; violeta mais claro e legível no escuro). `glow` adiciona um halo suave.
const D1 = "M464.97 797.69Q413.81 806.76 362.51 807.92Q336.29 808.52 312.45 805.60C268.12 800.16 229.19 778.06 206.64 739.62Q202.67 732.85 200.81 727.42C193.15 705.06 187.84 682.54 185.19 659.29C168.39 511.85 239.57 368.16 353.30 277.53Q403.71 237.36 465.12 212.16Q514.04 192.08 570.22 182.42C661.85 166.67 758.64 178.47 842.91 218.16C887.62 239.22 928.68 267.20 963.60 302.02A0.49 0.48 -45.4 0 1 963.60 302.71L892.42 373.89A0.44 0.44 0.0 0 1 891.82 373.91Q879.22 363.17 865.83 353.93Q815.48 319.20 755.56 307.91C671.33 292.04 584.94 312.86 516.12 362.86C449.56 411.22 404.31 486.05 388.61 566.31Q379.82 611.20 385.82 655.74Q391.68 699.33 413.40 737.84Q433.16 772.89 465.19 796.74A0.53 0.53 0.0 0 1 464.97 797.69Z";
const D2 = "M580.58 648.78L580.57 648.76A0.50 0.50 0.0 0 1 580.78 648.10Q616.97 628.16 625.14 624.15Q684.55 594.94 748.46 574.00Q849.98 540.73 956.26 529.07C990.11 525.35 1024.71 523.66 1058.49 526.74Q1081.64 528.85 1099.31 533.94Q1111.66 537.51 1122.00 544.18C1133.88 551.84 1139.82 564.64 1136.38 578.59Q1134.08 587.91 1129.86 595.37Q1121.39 610.33 1108.21 624.48Q1089.74 644.30 1066.39 662.40Q1050.36 674.84 1041.08 681.31Q1005.59 706.08 966.09 729.08Q910.67 761.34 854.21 789.23Q798.88 816.56 747.26 839.97Q702.79 860.14 666.05 877.31C648.88 885.33 631.59 893.92 615.90 904.64C602.80 913.59 591.99 925.18 589.69 941.03C588.49 949.33 592.25 959.96 596.69 966.80C612.73 991.50 646.16 1002.11 674.07 1002.24Q720.81 1002.47 755.65 970.79Q771.66 956.23 784.26 937.75Q793.99 923.48 800.18 911.98Q800.59 911.22 803.07 906.46A0.45 0.44 -75.6 0 0 802.69 905.81L740.38 903.68A0.53 0.52 30.3 0 1 740.12 902.71Q780.09 878.79 1010.31 743.29Q1011.08 742.84 1011.45 742.85A0.44 0.44 0.0 0 1 1011.86 743.47L880.06 1026.04A2.34 2.32 89.7 0 1 878.97 1027.15Q805.49 1063.16 725.02 1075.75C673.81 1083.76 622.30 1083.24 570.89 1073.40C487.50 1057.44 409.24 1018.34 346.68 961.08Q332.65 948.24 320.43 935.33A7.05 6.93 -5.4 0 0 318.99 934.16Q311.45 929.54 308.71 929.09Q300.73 927.78 264.16 918.90Q230.04 910.61 197.22 898.05Q173.30 888.89 153.34 876.16C140.99 868.29 128.77 857.57 121.83 844.24Q119.15 839.07 117.38 831.27C112.76 810.92 125.68 789.03 138.61 774.60Q153.50 757.98 172.04 744.13A0.31 0.31 0.0 0 1 172.48 744.56C163.88 756.32 156.98 769.29 155.58 783.75C154.27 797.39 161.78 810.14 172.86 818.15Q180.23 823.49 184.29 825.45C208.43 837.13 236.17 842.11 262.74 844.30C310.01 848.21 359.20 846.14 406.77 840.60Q454.97 834.99 501.27 825.76Q650.34 796.07 791.19 738.42Q859.30 710.54 923.52 674.75C945.34 662.59 969.27 647.41 987.95 630.96C997.50 622.54 1012.26 607.84 1009.70 593.64C1007.03 578.87 982.38 572.78 970.03 570.91Q947.52 567.50 924.00 567.81Q895.90 568.19 865.76 571.78C813.80 577.98 760.63 589.73 709.51 604.55Q644.55 623.39 581.09 648.98A0.40 0.40 0.0 0 1 580.58 648.78Z";

export function GaiusMark({ size = 32, glow = true, color = "var(--gaius-mark, #3802c2)", className, style }: {
  size?: number; glow?: boolean; color?: string; className?: string; style?: React.CSSProperties;
}) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      width={size} height={size} viewBox="0 0 1254 1254" fill="none"
      className={className} style={{ color, ...style }} aria-hidden focusable="false"
    >
      {glow && (
        <>
          <defs>
            <radialGradient id={`gm-glow-${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
              <stop offset="55%" stopColor="currentColor" stopOpacity="0.08" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="627" cy="627" r="600" fill={`url(#gm-glow-${uid})`} />
        </>
      )}
      <path d={D1} fill="currentColor" />
      <path d={D2} fill="currentColor" />
    </svg>
  );
}

// Lockup: símbolo + wordmark "GAIUS" (cor do texto atual). Usado na sidebar/login.
export function GaiusLogo({ size = 30, wordmark = true, tracking = "0.13em", weight = 400, fontSize, gap = 11, glow = true, style }: {
  size?: number; wordmark?: boolean; tracking?: string; weight?: number; fontSize?: number; gap?: number; glow?: boolean; style?: React.CSSProperties;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap, color: "var(--text)", ...style }}>
      <GaiusMark size={size} glow={glow} style={{ flex: "none" }} />
      {wordmark && (
        <span style={{ fontFamily: "var(--font-wordmark), var(--font)", fontSize: fontSize ?? Math.round(size * 0.47), fontWeight: weight, letterSpacing: tracking, textIndent: tracking, lineHeight: 1 }}>
          GAIUS
        </span>
      )}
    </span>
  );
}
