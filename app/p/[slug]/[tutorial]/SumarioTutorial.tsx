"use client";

// Sumário dos passos.
//
// Guia longo lido no celular vira rolagem cega: a pessoa quer "o passo 4",
// não o começo. Clicar leva até ele — com a rolagem que respeita quem pediu
// menos movimento — e o foco vai junto, pro leitor de tela continuar dali.
//
// Só existe no computador (≥ 1024px): trilho fixo à direita, com o passo
// atual em destaque e os feitos marcados — o mapa do guia sempre à vista.
// No celular a sanfona "Neste tutorial · N passos" saiu em 24/09/26: era
// mais um cartão empurrando o primeiro passo pra baixo (o CSS esconde).
//
// Só aparece a partir de TRÊS passos (`MINIMO_SUMARIO`).
import { Icon } from "@/app/(plataforma)/Icon";
import { MINIMO_SUMARIO } from "@/lib/tridiflow-tutoriais-leitura";
import { rolarAte } from "../rolagem";
import { useLeitura } from "./LeituraTutorial";

export function SumarioTutorial() {
  const { passos, atual, ehFeito } = useLeitura();
  if (passos.length < MINIMO_SUMARIO) return null;
  return (
    <nav className="tut-sumario" aria-label="Passos deste tutorial">
      <h2 className="tut-sumario-titulo"><Icon name="list-numbers" size={16} />Neste tutorial</h2>
      <ol>
        {passos.map((p) => {
          const feito = ehFeito(p.n);
          return (
            <li key={p.id}>
              <a href={`#passo-${p.n}`} aria-current={atual === p.n ? "step" : undefined} data-feito={feito ? "1" : undefined}
                onClick={(e) => {
                  // `preventDefault` + rolagem própria: o pulo nativo da âncora
                  // é instantâneo e ignora a preferência de movimento reduzido.
                  e.preventDefault();
                  const alvo = document.getElementById(`passo-${p.n}`);
                  rolarAte(alvo, "start");
                  history.replaceState(null, "", `#passo-${p.n}`);
                  alvo?.focus({ preventScroll: true });
                }}>
                <span className="tut-sumario-n" aria-hidden="true">{feito ? <Icon name="check" size={13} /> : p.n}</span>
                <span className="tut-sumario-t"><span className="sr-only">{`Passo ${p.n}: `}</span>{p.titulo}</span>
                {feito && <span className="sr-only"> (feito)</span>}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
