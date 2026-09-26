"use client";

import { useEffect, useMemo, useState } from "react";

// ── Força da senha ───────────────────────────────────────────────────────────
// Medidor CONSULTIVO da senha nova (primeiro acesso e troca voluntária). O piso
// de verdade — 8 caracteres — mora no SERVIDOR (lib/primeiro-acesso-token.ts e
// app/api/auth/password): o cliente pode ser burlado, então aqui é incentivo,
// nunca porteiro. Não bloqueia o envio; só mostra o quanto a senha aguenta e o
// que ainda falta, para a pessoa escolher uma senha melhor no momento em que ela
// está digitando — que é o único momento em que dá pra ajudar.
//
// Vive na raiz de `app/` (como GaiusMark) porque atende os DOIS contextos: a
// rota pública /primeiro-acesso (fora de (plataforma), na fundação `gaius-*`) e
// a plataforma logada (Ajustes › Trocar senha). Por isso é autocontido — não
// importa Icon.tsx nem nada de (plataforma): a marca de "atende" é um <path> do
// Tabler inline (mesma viewBox 24, stroke, sem fill), como manda a convenção, e
// o visual sai das classes `.fs-*` do globals.css (cor da paleta semântica,
// tempo/curva dos tokens de movimento). Nada de emoji, nada de CSS novo por
// arquivo, nada de lib de animação.

/** Começos batidos demais (o REGEX casa no início da senha). */
const COMUM =
  /^(?:senha|123456|12345678|1234567|123123|111111|000000|123321|102030|qwerty|asdfgh|abc123|admin|mudar|trocar|tridi|gaius|password|iloveyou|teste)/i;
/** Mesmo caractere quatro vezes ou mais: aaaa, 0000. */
const REPETIDO = /(.)\1{3,}/;
/** Sequência de teclado/contagem: 1234, abcd, qwer, asdf, zxcv. */
const SEQUENCIA =
  /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|wert|erty|asdf|sdfg|zxcv)/i;
/** Qualquer símbolo ASCII (fora de letras e números). */
const SIMBOLO = /[!-/:-@[-`{-~]/;

export type RegraSenha = {
  id: string;
  rotulo: string;
  testa: (valor: string) => boolean;
};

export type RegraAvaliada = RegraSenha & { ok: boolean };

export type OpcoesForcaDaSenha = {
  regras?: readonly RegraSenha[];
  rotulos?: readonly string[];
  /** Espera antes de narrar o resultado no leitor de tela (ms). */
  atrasoAviso?: number;
};

export type EstadoForcaDaSenha = {
  score: number;
  max: number;
  rotulo: string;
  regras: RegraAvaliada[];
  comum: boolean;
  aviso: string;
};

// A primeira regra é o piso real do servidor (8). As outras são o que separa uma
// senha "razoável" de uma "forte" — cada uma vale um degrau da barra.
export const REGRAS_PADRAO: readonly RegraSenha[] = [
  { id: "tamanho", rotulo: "8 caracteres ou mais", testa: (v) => v.length >= 8 },
  {
    id: "caso",
    rotulo: "Maiúscula e minúscula",
    testa: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v),
  },
  { id: "numero", rotulo: "Um número", testa: (v) => /\d/.test(v) },
  { id: "simbolo", rotulo: "Um símbolo (! ? @ #…)", testa: (v) => SIMBOLO.test(v) },
];

// Índice 0 = campo vazio (sem rótulo). Depois: um por degrau da barra.
const ROTULOS_PADRAO = ["", "Fraca", "Razoável", "Boa", "Forte"] as const;

export function useForcaDaSenha(
  valor: string,
  {
    regras = REGRAS_PADRAO,
    rotulos = ROTULOS_PADRAO,
    atrasoAviso = 700,
  }: OpcoesForcaDaSenha = {},
): EstadoForcaDaSenha {
  const estado = useMemo<EstadoForcaDaSenha>(() => {
    const avaliadas = regras.map((r) => ({ ...r, ok: r.testa(valor) }));
    const atendidas = avaliadas.reduce((n, r) => n + (r.ok ? 1 : 0), 0);
    const comum =
      valor.length > 0 &&
      (COMUM.test(valor) || REPETIDO.test(valor) || SEQUENCIA.test(valor));

    // Padrão batido derruba pra "Fraca" mesmo que atenda regras — "Senha123!"
    // passa em tudo e ainda assim é a primeira que qualquer um tenta.
    const score =
      valor.length === 0
        ? 0
        : comum
          ? 1
          : Math.min(regras.length, Math.max(1, atendidas));

    const rotulo = rotulos[Math.min(score, rotulos.length - 1)] ?? "";
    const faltando = avaliadas.filter((r) => !r.ok);

    const aviso =
      valor.length === 0
        ? ""
        : [
            `Força da senha: ${rotulo.toLowerCase()}.`,
            comum ? "Esse padrão é fácil de adivinhar." : "",
            faltando.length === 0
              ? "Todos os requisitos atendidos."
              : `Ainda falta: ${faltando.map((r) => r.rotulo.toLowerCase()).join(", ")}.`,
          ]
            .filter(Boolean)
            .join(" ");

    return { score, max: regras.length, rotulo, regras: avaliadas, comum, aviso };
  }, [valor, regras, rotulos]);

  // O leitor de tela só ouve quando a pessoa PARA de digitar: narrar a cada
  // tecla vira ruído e atropela o próximo caractere.
  const [assentado, setAssentado] = useState("");
  useEffect(() => {
    if (estado.aviso === "") {
      setAssentado("");
      return;
    }
    const id = setTimeout(() => setAssentado(estado.aviso), atrasoAviso);
    return () => clearTimeout(id);
  }, [estado.aviso, atrasoAviso]);

  return { ...estado, aviso: assentado };
}

export type ForcaDaSenhaProps = {
  value: string;
  regras?: readonly RegraSenha[];
  rotulos?: readonly string[];
  atrasoAviso?: number;
  mostrarRegras?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

// Cor de ESTADO, não de gráfico: verde/âmbar/vermelho vêm da paleta semântica
// (--ok/--atencao/--perigo, calibrada nos dois temas) e NÃO seguem o destaque
// que a pessoa escolhe — "forte" tem que ser verde mesmo pra quem pintou o app
// de rosa. Por isso nada de corDaSerie/--graf aqui.
function tomDe(score: number, max: number): "vazio" | "perigo" | "atencao" | "ok" {
  if (score === 0) return "vazio";
  const ratio = score / max;
  if (ratio <= 0.34) return "perigo";
  if (ratio <= 0.67) return "atencao";
  return "ok";
}

const APENAS_LEITOR: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function ForcaDaSenha({
  value,
  regras = REGRAS_PADRAO,
  rotulos = ROTULOS_PADRAO,
  atrasoAviso = 700,
  mostrarRegras = true,
  className = "",
  style,
}: ForcaDaSenhaProps) {
  const {
    score,
    max,
    rotulo,
    regras: avaliadas,
    comum,
    aviso,
  } = useForcaDaSenha(value, { regras, rotulos, atrasoAviso });
  const tom = tomDe(score, max);

  return (
    <div className={`fs ${className}`.trim()} data-tom={tom} style={style}>
      <div
        className="fs-barras"
        role="meter"
        aria-label="Força da senha"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={score}
        aria-valuetext={rotulo || "Vazia"}
        style={{ ["--fs-n"]: max } as React.CSSProperties}
      >
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className="fs-barra"
            data-on={i < score ? "1" : "0"}
            style={{ ["--fs-i"]: i } as React.CSSProperties}
          >
            <i />
          </span>
        ))}
      </div>

      <div className="fs-linha" aria-hidden>
        {/* key força o crossfade de entrada a cada troca de rótulo. */}
        <span key={rotulo} className="fs-rotulo">
          {rotulo}
        </span>
        {comum && <span className="fs-aviso">Fácil de adivinhar</span>}
      </div>

      {mostrarRegras && (
        <ul className="fs-regras">
          {avaliadas.map((regra) => (
            <li key={regra.id} className="fs-regra" data-ok={regra.ok ? "1" : "0"}>
              <span className="fs-marca" aria-hidden>
                {/* Tabler "check" — path exato, viewBox 24, stroke, sem fill. */}
                <svg viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
                  <path
                    d="M5 12l5 5l10 -10"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="fs-regra-txt">{regra.rotulo}</span>
              <span style={APENAS_LEITOR}>{regra.ok ? "atende" : "ainda não atende"}</span>
            </li>
          ))}
        </ul>
      )}

      <p aria-live="polite" style={APENAS_LEITOR}>
        {aviso}
      </p>
    </div>
  );
}

export default ForcaDaSenha;
