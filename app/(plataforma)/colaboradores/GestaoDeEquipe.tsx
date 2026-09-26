"use client";

import { use, useCallback, useEffect, useState } from "react";
import { ColaboradoresClient, type ColabRow } from "./ColaboradoresClient";

/** O que as abas de equipe e cofre precisam — e só elas. */
export interface DadosDaEquipe {
  colaboradores: ColabRow[];
  /** As empresas do Financeiro, para o picker de restrição — vazio se ninguém administra. */
  empresasFinanceiro: { id: string; nome: string }[];
  /** employeeId → ids das empresas a que está restrito. Ausente = vê todas. */
  restricoesFinanceiro: Record<string, string[]>;
}
import type { PontoPessoa } from "@/lib/ponto";
import { DispositivosPanel } from "./DispositivosPanel";
import { PessoasDoPonto, TabletPair } from "../administracao/ponto/PessoasDoPonto";
import { PontoTurnos } from "../administracao/PontoTurnos";
import { Secao } from "../ui/Secao";

// ── Gestão de equipe ─────────────────────────────────────────────────────────
// Tudo que é CADASTRO da mesma gente, no mesmo lugar: quem é quem e o acesso,
// quem bate ponto (rosto e turno), os horários da casa e os aparelhos.
//
// Antes isso estava espalhado em quatro lugares — "Equipe & funções" numa aba,
// "Pessoas"/"Turnos"/"Tablet" dentro do Ponto, "Dispositivos" numa quarta —, o
// que fazia cadastrar UMA pessoa custar três navegações. O que se mexe todo dia
// (a equipe) fica aberto; o resto é seção, um degrau abaixo.
export function GestaoDeEquipe({ meId, isAdmin, areasQueConcedo, equipe }: {
  meId: string; isAdmin: boolean; areasQueConcedo: string[];
  equipe: Promise<DadosDaEquipe>;
}) {
  // A lista chega do servidor por streaming. Enquanto não chega, esta aba fica
  // no fallback do `dynamic` que a trouxe — a mesma fronteira de Suspense.
  const { colaboradores, empresasFinanceiro, restricoesFinanceiro } = use(equipe);
  const [pessoasPonto, setPessoasPonto] = useState<PontoPessoa[] | null>(null);
  const carregar = useCallback(() => {
    fetch("/api/ponto/pessoas", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setPessoasPonto(d.pessoas ?? [])).catch(() => setPessoasPonto([]));
  }, []);
  useEffect(carregar, [carregar]);

  // As quatro seções vão DENTRO da tela de equipe, como `ajustes` — não como
  // irmãs dela. Eram irmãs, e por isso continuavam desenhadas quando a tela
  // trocava a lista pelo perfil de uma pessoa: quatro sanfonas sobre turnos e
  // tablets da empresa inteira embaixo do rosto de um colaborador, em TODAS as
  // abas. O componente que sabe se alguém está em foco é quem deve decidir se
  // elas aparecem, e esse componente é o de baixo.
  const ajustes = (
    <>
      <Secao icone="user-check" titulo="Pessoas no ponto" resumo={pessoasPonto ? `${pessoasPonto.length} cadastrada(s) — rosto, turno e jornada` : "rosto, turno e jornada"}>
        <PessoasDoPonto pessoas={pessoasPonto} podeGerir={isAdmin} onChange={carregar} />
      </Secao>
      <Secao icone="clock" titulo="Turnos da empresa" resumo="horários reusados no cadastro das pessoas">
        <PontoTurnos />
      </Secao>
      <Secao icone="device-tv" titulo="Tablet do ponto" resumo="parear o aparelho que lê os rostos">
        <TabletPair />
      </Secao>
      <Secao icone="device-tv" titulo="Dispositivos" resumo="tablets e telas pareados com o sistema">
        <DispositivosPanel />
      </Secao>
    </>
  );

  return (
    <ColaboradoresClient
      initial={colaboradores} meId={meId} isAdmin={isAdmin}
      areasQueConcedo={areasQueConcedo} empresasFinanceiro={empresasFinanceiro}
      restricoesFinanceiro={restricoesFinanceiro} ajustes={ajustes}
    />
  );
}
