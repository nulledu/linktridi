"use client";

// TEMPORÁRIO — prova da triagem de candidatos (aba "Candidatos" da tela de
// Resultados do quiz), para o `/dev-mobile?ws=quiz-resultados`.
//
// É CLIENTE de propósito: o handler que simula o PATCH de estágio é uma FUNÇÃO,
// e função não atravessa a fronteira servidor → cliente como prop (o mesmo
// motivo pelo qual a rede do Estoque mora no `ProvaEstoque`). Aqui a função
// nasce no cliente e o clique no seletor responde sem reverter.
import { RedeFalsa } from "./RedeFalsa";
import { ResultadosClient } from "../(plataforma)/tridiflow/[id]/resultados/ResultadosClient";
import { templateQuizPorId } from "@/lib/tridiflow-quiz-templates";
import { ANALYTICS_CANDIDATOS, VENDAS_CANDIDATOS } from "./telas-quiz-resultados";

// O template tem `resultados` — é isso que liga a aba "Candidatos" e faz o
// `pontuacaoDe` dar o perfil de cada um. Montado uma vez: os ids são novos a
// cada `montar()`, e a prova só precisa de um.
const QUIZ = templateQuizPorId("candidatura")!.montar();

export function ProvaQuizResultados() {
  return (
    <RedeFalsa
      mapa={{ "/api/tridiflow/analytics": ANALYTICS_CANDIDATOS, "/api/tridiflow/vendas": VENDAS_CANDIDATOS }}
      handlers={{ "/api/tridiflow/candidato": () => ({ corpo: { ok: true } }) }}
    >
      <ResultadosClient botId="prova" quiz={QUIZ} />
    </RedeFalsa>
  );
}
