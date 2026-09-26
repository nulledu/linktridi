"use client";

// TI › Permissões — a pergunta "o que essa pessoa pode fazer no sistema".
//
// Morava no RH (/rh/gestao) até 22/09/2026; mudou pra TI porque quem entra no
// sistema é assunto de TI — o RH responde QUEM a pessoa é (Colaboradores) e
// QUANTO trabalhou (Ponto). Aqui é o cadastro que liga uma conta ao sistema —
// criar pessoa, link de primeiro acesso, ativar/desativar e a grade de
// permissões (TODAS as áreas, TI inclusive — não há grade paralela).
//
// A ficha continua sendo UMA só: clicar em alguém aqui abre o mesmo pop-up de
// Colaboradores (`?pessoa=<id>`), onde a aba "Acesso" traz a grade. As
// permissões ficam NA PESSOA de propósito — é olhando para ela que se decide o
// que ela enxerga, e uma tela separada obrigaria a escolher a mesma pessoa
// duas vezes.

import { use } from "react";
import { ColaboradoresClient, type ColabRow } from "../../colaboradores/ColaboradoresClient";
import { DispositivosPanel } from "../../colaboradores/DispositivosPanel";
import { Secao } from "../../ui/Secao";
import { Cabecalho } from "../../financeiro/ui";

export interface DadosDoCadastro {
  colaboradores: ColabRow[];
  empresasFinanceiro: { id: string; nome: string }[];
  restricoesFinanceiro: Record<string, string[]>;
}

export function CadastroDaEquipe({ meId, isAdmin, areasQueConcedo, equipe }: {
  meId: string;
  isAdmin: boolean;
  areasQueConcedo: string[];
  equipe: Promise<DadosDoCadastro>;
}) {
  // A lista chega do servidor por streaming — a fronteira de Suspense é a do
  // `loading.tsx` do módulo.
  const { colaboradores, empresasFinanceiro, restricoesFinanceiro } = use(equipe);

  return (
    <>
      <Cabecalho
        tarja="TI"
        titulo="Permissões"
        sub="Cadastro das contas, acesso ao sistema e os aparelhos pareados."
      />

      <ColaboradoresClient
        initial={colaboradores}
        meId={meId}
        isAdmin={isAdmin}
        areasQueConcedo={areasQueConcedo}
        empresasFinanceiro={empresasFinanceiro}
        restricoesFinanceiro={restricoesFinanceiro}
        // As seções de PONTO (pessoas do relógio, turnos, tablet) saíram daqui
        // para `/rh/ponto`, que é o assunto delas. Sobrou o que é cadastro de
        // APARELHO, que não é ponto nem pessoa.
        ajustes={
          <Secao icone="device-tv" titulo="Dispositivos" resumo="tablets e telas pareados com o sistema">
            <DispositivosPanel />
          </Secao>
        }
      />
    </>
  );
}
